import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendChecksum,
  buildOutgoingPayload,
  computeCrc16Modbus,
  computeSum8,
  computeXor8,
  evaluateProtocolRules,
  getInitialProtoLinkState,
  parseHexColorToRgb,
  parseHexString,
  simulateMcuResponse,
  verifyFrameChecksum,
} from './protocolEngine.ts';

test('parseHexString parses spaced and unspaced hex strings and rejects invalid lengths', () => {
  const valid = parseHexString('aa 55 01 64');
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.deepEqual(valid.bytes, [0xaa, 0x55, 0x01, 0x64]);
    assert.equal(valid.normalized, 'AA 55 01 64');
  }

  const compact = parseHexString('0xAA5501');
  assert.equal(compact.ok, true);
  if (compact.ok) {
    assert.deepEqual(compact.bytes, [0xaa, 0x55, 0x01]);
  }

  assert.equal(parseHexString('AA 5').ok, false);
  assert.equal(parseHexString('AA ZZ').ok, false);
});

test('checksum calculations (SUM8, XOR8, CRC16-Modbus) append and verify accurately', () => {
  const payload = [0xaa, 0x55, 0x03, 0x01, 0x08];
  assert.equal(computeSum8(payload), 0x0b);
  assert.equal(computeXor8(payload), 0xf5);

  const withSum = appendChecksum(payload, 'sum8');
  assert.deepEqual(withSum, [0xaa, 0x55, 0x03, 0x01, 0x08, 0x0b]);
  assert.equal(verifyFrameChecksum(withSum, 'sum8'), true);

  const modbus = [0x01, 0x03, 0x00, 0x00, 0x00, 0x02];
  const crc = computeCrc16Modbus(modbus);
  assert.equal(crc, 0x0bc4);
  const withCrc = appendChecksum(modbus, 'crc16');
  assert.deepEqual(withCrc, [0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xc4, 0x0b]);
  assert.equal(verifyFrameChecksum(withCrc, 'crc16'), true);
});

test('buildOutgoingPayload expands {val}, {hex}, {rh}/{gh}/{bh} RGB placeholders with checksum', () => {
  const hexRes = buildOutgoingPayload('AA 55 02 {hex}', 'hex', 'sum8', 75);
  assert.equal(hexRes.ok, true);
  if (hexRes.ok) {
    assert.deepEqual(hexRes.bytes, [0xaa, 0x55, 0x02, 0x4b, 0x4c]);
    assert.equal(hexRes.rawHex, 'AA 55 02 4B 4C');
  }

  assert.deepEqual(parseHexColorToRgb('#0D9488'), { r: 13, g: 148, b: 136 });
  const rgbHex = buildOutgoingPayload('AA 55 05 {rh} {gh} {bh}', 'hex', 'sum8', 0, '#FF1020');
  assert.equal(rgbHex.ok, true);
  if (rgbHex.ok) {
    // sum8(0xAA + 0x55 + 0x05 + 0xFF + 0x10 + 0x20) = 0x233 & 0xFF = 0x33
    assert.deepEqual(rgbHex.bytes, [0xaa, 0x55, 0x05, 0xff, 0x10, 0x20, 0x33]);
  }

  const rgbAscii = buildOutgoingPayload('RGB:{r},{g},{b}', 'ascii', 'none', 0, '#010203');
  assert.equal(rgbAscii.ok, true);
  if (rgbAscii.ok) {
    assert.equal(rgbAscii.rawText, 'RGB:1,2,3');
  }
});

test('evaluateProtocolRules decodes HEX, JSON, and ASCII regex frames', () => {
  const initial = getInitialProtoLinkState();

  const hexMatches = evaluateProtocolRules(
    [0xaa, 0x55, 0x03, 0x01, 0x08, 0x0b],
    'AA 55 03 01 08 0B',
    initial.rules
  );
  assert.equal(hexMatches.length, 1);
  assert.equal(hexMatches[0].rawValue, 26.4);
  assert.equal(hexMatches[0].formattedValue, '26.4 ℃');
  assert.equal(hexMatches[0].checksumValid, true);

  const jsonMatches = evaluateProtocolRules([], '{"pwm":85}', initial.rules);
  assert.equal(jsonMatches.length, 1);
  assert.equal(jsonMatches[0].rawValue, 85);

  const asciiMatches = evaluateProtocolRules([], 'LED:1\r\n', initial.rules);
  assert.equal(asciiMatches.length, 1);
  assert.equal(asciiMatches[0].rawValue, 1);
});

test('simulateMcuResponse handles LED, PWM, RGB, D-pad motion, Mode, and temperature telemetry', () => {
  const initial = getInitialProtoLinkState();

  const ledOff = simulateMcuResponse('AA 55 01 00', [0xaa, 0x55, 0x01, 0x00, 0x00], 'hex', initial.virtualMcu);
  assert.equal(ledOff.nextMcuState.ledOn, false);

  const rgbSet = simulateMcuResponse('AA 55 05 FF 00 80', [0xaa, 0x55, 0x05, 0xff, 0x00, 0x80], 'hex', ledOff.nextMcuState);
  assert.equal(rgbSet.nextMcuState.rgbHex, '#FF0080');

  const moveFwd = simulateMcuResponse('AA 55 06 01', [0xaa, 0x55, 0x06, 0x01], 'hex', rgbSet.nextMcuState);
  assert.equal(moveFwd.nextMcuState.motionDir, '前进');

  const modeDebug = simulateMcuResponse('AA 55 07 02', [0xaa, 0x55, 0x07, 0x02], 'hex', moveFwd.nextMcuState);
  assert.equal(modeDebug.nextMcuState.workMode, '调试');

  const tempRead = simulateMcuResponse('AA 55 03 00', [0xaa, 0x55, 0x03, 0x00, 0x02], 'hex', modeDebug.nextMcuState);
  assert.equal(tempRead.nextMcuState.tempTenths, 267);
});
