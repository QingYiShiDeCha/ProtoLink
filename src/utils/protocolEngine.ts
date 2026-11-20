import type {
  ChecksumType,
  PacketLogEntry,
  ParsedProtocolMatch,
  PayloadFormat,
  ProtoLinkState,
  ProtocolRule,
  VirtualMcuState,
} from '../types/app';

export function parseHexString(
  input: string
): { ok: true; bytes: number[]; normalized: string } | { ok: false; error: string } {
  const cleaned = input
    .replace(/0x/gi, '')
    .replace(/[,;\s]+/g, '')
    .trim();

  if (!cleaned) {
    return { ok: false, error: 'HEX 内容不能为空' };
  }
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    return { ok: false, error: 'HEX 仅允许包含 0-9 与 A-F 字符' };
  }
  if (cleaned.length % 2 !== 0) {
    return { ok: false, error: 'HEX 字节长度必须为偶数位（如 AA 55 01）' };
  }

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
  }

  return {
    ok: true,
    bytes,
    normalized: bytesToHex(bytes),
  };
}

export function bytesToHex(bytes: number[]): string {
  return bytes
    .map((b) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export function utf8ToBytes(text: string): number[] {
  const normalized = text.replace(/\\r/g, '\r').replace(/\\n/g, '\n');
  const encoder = new TextEncoder();
  return Array.from(encoder.encode(normalized));
}

export function bytesToAscii(bytes: number[]): string {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const decoded = decoder.decode(new Uint8Array(bytes));
    return decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '.');
  } catch {
    return bytes
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
      .join('');
  }
}

export function parseHexColorToRgb(hexColor: string): { r: number; g: number; b: number } {
  const clean = hexColor.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function computeSum8(bytes: number[]): number {
  return bytes.reduce((acc, b) => (acc + (b & 0xff)) & 0xff, 0);
}

export function computeXor8(bytes: number[]): number {
  return bytes.reduce((acc, b) => (acc ^ (b & 0xff)) & 0xff, 0);
}

export function computeCrc16Modbus(bytes: number[]): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte & 0xff;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc & 0xffff;
}

export function appendChecksum(bytes: number[], checksum: ChecksumType): number[] {
  if (checksum === 'none' || bytes.length === 0) return [...bytes];
  if (checksum === 'sum8') {
    return [...bytes, computeSum8(bytes)];
  }
  if (checksum === 'xor8') {
    return [...bytes, computeXor8(bytes)];
  }
  const crc = computeCrc16Modbus(bytes);
  return [...bytes, crc & 0xff, (crc >> 8) & 0xff];
}

export function verifyFrameChecksum(bytes: number[], checksum: ChecksumType): boolean {
  if (checksum === 'none') return true;
  if (checksum === 'sum8') {
    if (bytes.length < 2) return false;
    return computeSum8(bytes.slice(0, -1)) === (bytes[bytes.length - 1] & 0xff);
  }
  if (checksum === 'xor8') {
    if (bytes.length < 2) return false;
    return computeXor8(bytes.slice(0, -1)) === (bytes[bytes.length - 1] & 0xff);
  }
  if (bytes.length < 3) return false;
  const expected = computeCrc16Modbus(bytes.slice(0, -2));
  const lo = bytes[bytes.length - 2] & 0xff;
  const hi = bytes[bytes.length - 1] & 0xff;
  return (expected & 0xff) === lo && ((expected >> 8) & 0xff) === hi;
}

export function buildOutgoingPayload(
  templateOrRaw: string,
  format: PayloadFormat,
  checksum: ChecksumType,
  value?: number,
  rgbHex?: string
): { ok: true; bytes: number[]; rawHex: string; rawText: string } | { ok: false; error: string } {
  const num = typeof value === 'number' ? Math.round(value) : 0;
  const clampedByte = Math.max(0, Math.min(255, num));
  const hexByte = clampedByte.toString(16).toUpperCase().padStart(2, '0');
  const clampedU16 = Math.max(0, Math.min(65535, num));
  const hex2 = `${((clampedU16 >> 8) & 0xff).toString(16).toUpperCase().padStart(2, '0')} ${(
    clampedU16 & 0xff
  )
    .toString(16)
    .toUpperCase()
    .padStart(2, '0')}`;

  const rgb = parseHexColorToRgb(rgbHex ?? '#000000');
  const rh = rgb.r.toString(16).toUpperCase().padStart(2, '0');
  const gh = rgb.g.toString(16).toUpperCase().padStart(2, '0');
  const bh = rgb.b.toString(16).toUpperCase().padStart(2, '0');

  const rendered = templateOrRaw
    .replace(/\{val\}/g, String(num))
    .replace(/\{hex\}/g, hexByte)
    .replace(/\{hex2\}/g, hex2)
    .replace(/\{bool\}/g, num > 0 ? '1' : '0')
    .replace(/\{r\}/g, String(rgb.r))
    .replace(/\{g\}/g, String(rgb.g))
    .replace(/\{b\}/g, String(rgb.b))
    .replace(/\{rh\}/g, rh)
    .replace(/\{gh\}/g, gh)
    .replace(/\{bh\}/g, bh)
    .replace(/\{hexcolor\}/g, `${rh}${gh}${bh}`);

  if (format === 'hex') {
    const parsed = parseHexString(rendered);
    if (!parsed.ok) return parsed;
    const finalBytes = appendChecksum(parsed.bytes, checksum);
    return {
      ok: true,
      bytes: finalBytes,
      rawHex: bytesToHex(finalBytes),
      rawText: bytesToHex(finalBytes),
    };
  }

  const rawText = rendered.replace(/\\r/g, '\r').replace(/\\n/g, '\n');
  const baseBytes = utf8ToBytes(rawText);
  const finalBytes = appendChecksum(baseBytes, checksum);
  return {
    ok: true,
    bytes: finalBytes,
    rawHex: bytesToHex(finalBytes),
    rawText,
  };
}

function getJsonValueByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object' || !path.trim()) return undefined;
  const parts = path.trim().replace(/^\$\./, '').split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function evaluateProtocolRules(
  bytes: number[],
  rawText: string,
  rules: ProtocolRule[]
): ParsedProtocolMatch[] {
  const matches: ParsedProtocolMatch[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.mode === 'hex') {
      const headerParsed = parseHexString(rule.headerHex);
      if (!headerParsed.ok || bytes.length < headerParsed.bytes.length) continue;

      const headerMatches = headerParsed.bytes.every((hb, idx) => bytes[idx] === hb);
      if (!headerMatches) continue;

      if (rule.dataOffset + rule.byteLength > bytes.length) continue;

      const checksumValid = verifyFrameChecksum(bytes, rule.checksum);
      let rawVal = 0;
      if (rule.byteLength === 1) {
        rawVal = bytes[rule.dataOffset];
      } else {
        const b0 = bytes[rule.dataOffset];
        const b1 = bytes[rule.dataOffset + 1];
        rawVal = rule.endian === 'big' ? (b0 << 8) | b1 : (b1 << 8) | b0;
      }

      const scaled = Number((rawVal * rule.scale).toFixed(2));
      matches.push({
        ruleId: rule.id,
        ruleName: rule.name,
        rawValue: scaled,
        formattedValue: `${scaled}${rule.unit ? ` ${rule.unit}` : ''}`,
        checksumValid,
      });
    } else if (rule.mode === 'json') {
      const text = rawText.trim();
      if (!text.startsWith('{') && !text.startsWith('[')) continue;
      try {
        const parsed = JSON.parse(text);
        const extracted = getJsonValueByPath(parsed, rule.jsonKey);
        if (extracted === undefined || extracted === null || typeof extracted === 'object') {
          continue;
        }
        const numericVal =
          typeof extracted === 'number' ? Number((extracted * rule.scale).toFixed(2)) : null;
        const displayVal = numericVal !== null ? numericVal : String(extracted);
        matches.push({
          ruleId: rule.id,
          ruleName: rule.name,
          rawValue: typeof extracted === 'number' ? numericVal! : String(extracted),
          formattedValue: `${displayVal}${rule.unit ? ` ${rule.unit}` : ''}`,
          checksumValid: true,
        });
      } catch {
        continue;
      }
    } else if (rule.mode === 'ascii') {
      if (!rule.regexPattern.trim()) continue;
      try {
        const regex = new RegExp(rule.regexPattern);
        const match = regex.exec(rawText);
        if (!match) continue;
        const captured = match[1] ?? match[0];
        const asNum = Number(captured);
        const val =
          !Number.isNaN(asNum) && captured.trim() !== ''
            ? Number((asNum * rule.scale).toFixed(2))
            : captured;
        matches.push({
          ruleId: rule.id,
          ruleName: rule.name,
          rawValue: val,
          formattedValue: `${val}${rule.unit ? ` ${rule.unit}` : ''}`,
          checksumValid: true,
        });
      } catch {
        continue;
      }
    }
  }

  return matches;
}

export function simulateMcuResponse(
  txText: string,
  txBytes: number[],
  format: PayloadFormat,
  mcuState: VirtualMcuState
): {
  replies: Array<{ rawText: string; bytes: number[]; format: PayloadFormat }>;
  nextMcuState: VirtualMcuState;
} {
  const next: VirtualMcuState = { ...mcuState };
  const replies: Array<{ rawText: string; bytes: number[]; format: PayloadFormat }> = [];
  const trimmed = txText.trim();

  // 1. JSON command parsing
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if ('led' in obj) {
        next.ledOn = Boolean(obj.led === 1 || obj.led === true || obj.led === 'on');
        const replyObj = { led: next.ledOn ? 1 : 0, ack: 'OK' };
        const jsonStr = JSON.stringify(replyObj);
        replies.push({ rawText: jsonStr, bytes: utf8ToBytes(jsonStr), format: 'json' });
        return { replies, nextMcuState: next };
      }
      if ('pwm' in obj && typeof obj.pwm === 'number') {
        next.pwmDuty = Math.max(0, Math.min(100, Math.round(obj.pwm)));
        const replyObj = { pwm: next.pwmDuty, led: next.ledOn ? 1 : 0 };
        const jsonStr = JSON.stringify(replyObj);
        replies.push({ rawText: jsonStr, bytes: utf8ToBytes(jsonStr), format: 'json' });
        return { replies, nextMcuState: next };
      }
      if ('rgb' in obj && Array.isArray(obj.rgb) && obj.rgb.length >= 3) {
        const [r, g, b] = obj.rgb.map((n) => Math.max(0, Math.min(255, Number(n) || 0)));
        next.rgbHex = `#${[r, g, b]
          .map((n) => n.toString(16).toUpperCase().padStart(2, '0'))
          .join('')}`;
        const jsonStr = JSON.stringify({ rgb: [r, g, b], ack: 'OK' });
        replies.push({ rawText: jsonStr, bytes: utf8ToBytes(jsonStr), format: 'json' });
        return { replies, nextMcuState: next };
      }
      if ('speed' in obj && typeof obj.speed === 'number') {
        next.motorSpeed = Math.max(0, Math.min(100, Math.round(obj.speed)));
        const replyObj = { speed: next.motorSpeed, ack: 'OK' };
        const jsonStr = JSON.stringify(replyObj);
        replies.push({ rawText: jsonStr, bytes: utf8ToBytes(jsonStr), format: 'json' });
        return { replies, nextMcuState: next };
      }
    } catch {
      // fall through
    }
  }

  // 2. HEX Frame parsing (AA 55 <CMD> <ARGS...>)
  if (format === 'hex' && txBytes.length >= 4 && txBytes[0] === 0xaa && txBytes[1] === 0x55) {
    const cmd = txBytes[2];
    const arg = txBytes[3];

    if (cmd === 0x01) {
      next.ledOn = arg > 0;
      const ackBytes = appendChecksum([0xaa, 0x55, 0x81, next.ledOn ? 0x01 : 0x00], 'sum8');
      replies.push({ rawText: bytesToHex(ackBytes), bytes: ackBytes, format: 'hex' });
      return { replies, nextMcuState: next };
    }

    if (cmd === 0x02) {
      next.pwmDuty = Math.max(0, Math.min(100, arg));
      const ackJson = JSON.stringify({ pwm: next.pwmDuty });
      replies.push({ rawText: ackJson, bytes: utf8ToBytes(ackJson), format: 'json' });
      return { replies, nextMcuState: next };
    }

    if (cmd === 0x03) {
      next.tempTenths = next.tempTenths >= 285 ? 258 : next.tempTenths + 3;
      const hi = (next.tempTenths >> 8) & 0xff;
      const lo = next.tempTenths & 0xff;
      const frame = appendChecksum([0xaa, 0x55, 0x03, hi, lo], 'sum8');
      replies.push({ rawText: bytesToHex(frame), bytes: frame, format: 'hex' });
      return { replies, nextMcuState: next };
    }

    if (cmd === 0x04) {
      next.motorSpeed = Math.max(0, Math.min(100, arg));
      const ackText = `SPD:${next.motorSpeed},OK\r\n`;
      replies.push({ rawText: ackText, bytes: utf8ToBytes(ackText), format: 'ascii' });
      return { replies, nextMcuState: next };
    }

    if (cmd === 0x05 && txBytes.length >= 6) {
      const r = txBytes[3];
      const g = txBytes[4];
      const b = txBytes[5];
      next.rgbHex = `#${[r, g, b]
        .map((n) => n.toString(16).toUpperCase().padStart(2, '0'))
        .join('')}`;
      const ackBytes = appendChecksum([0xaa, 0x55, 0x85, r, g, b], 'sum8');
      replies.push({ rawText: bytesToHex(ackBytes), bytes: ackBytes, format: 'hex' });
      return { replies, nextMcuState: next };
    }

    if (cmd === 0x06) {
      const dirMap: Record<number, string> = {
        0: '停止',
        1: '前进',
        2: '后退',
        3: '左转',
        4: '右转',
      };
      next.motionDir = dirMap[arg] ?? `DIR_${arg}`;
      const ackBytes = appendChecksum([0xaa, 0x55, 0x86, arg], 'sum8');
      replies.push({ rawText: bytesToHex(ackBytes), bytes: ackBytes, format: 'hex' });
      return { replies, nextMcuState: next };
    }

    if (cmd === 0x07) {
      const modeMap: Record<number, string> = {
        0: '待机',
        1: '自动',
        2: '调试',
      };
      next.workMode = modeMap[arg] ?? `模式${arg}`;
      const ackText = `MODE:${arg},OK\r\n`;
      replies.push({ rawText: ackText, bytes: utf8ToBytes(ackText), format: 'ascii' });
      return { replies, nextMcuState: next };
    }
  }

  // 3. ASCII command parsing
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('LED=') || upper.startsWith('LED:')) {
    const on = upper.includes('ON') || upper.endsWith('1');
    next.ledOn = on;
    const reply = `LED:${on ? 1 : 0}\r\n`;
    replies.push({ rawText: reply, bytes: utf8ToBytes(reply), format: 'ascii' });
    return { replies, nextMcuState: next };
  }

  const pwmMatch = /(?:PWM|DUTY)[:=]\s*(\d+)/i.exec(trimmed);
  if (pwmMatch) {
    next.pwmDuty = Math.max(0, Math.min(100, Number(pwmMatch[1])));
    const replyJson = JSON.stringify({ pwm: next.pwmDuty });
    replies.push({ rawText: replyJson, bytes: utf8ToBytes(replyJson), format: 'json' });
    return { replies, nextMcuState: next };
  }

  const spdMatch = /(?:SPD|SPEED)[:=]\s*(\d+)/i.exec(trimmed);
  if (spdMatch) {
    next.motorSpeed = Math.max(0, Math.min(100, Number(spdMatch[1])));
    const reply = `SPD:${next.motorSpeed},OK\r\n`;
    replies.push({ rawText: reply, bytes: utf8ToBytes(reply), format: 'ascii' });
    return { replies, nextMcuState: next };
  }

  const rgbMatch = /RGB[:=]\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(trimmed);
  if (rgbMatch) {
    const [r, g, b] = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((s) =>
      Math.max(0, Math.min(255, Number(s) || 0))
    );
    next.rgbHex = `#${[r, g, b]
      .map((n) => n.toString(16).toUpperCase().padStart(2, '0'))
      .join('')}`;
    const reply = `RGB:${r},${g},${b},OK\r\n`;
    replies.push({ rawText: reply, bytes: utf8ToBytes(reply), format: 'ascii' });
    return { replies, nextMcuState: next };
  }

  const cmdMatch = /CMD[:=]\s*(FWD|BACK|LEFT|RIGHT|STOP)/i.exec(trimmed);
  if (cmdMatch) {
    next.motionDir = cmdMatch[1].toUpperCase();
    const reply = `CMD:${next.motionDir},OK\r\n`;
    replies.push({ rawText: reply, bytes: utf8ToBytes(reply), format: 'ascii' });
    return { replies, nextMcuState: next };
  }

  const modeMatch = /MODE[:=]\s*([A-Z0-9_]+)/i.exec(trimmed);
  if (modeMatch) {
    next.workMode = modeMatch[1].toUpperCase();
    const reply = `MODE:${next.workMode},OK\r\n`;
    replies.push({ rawText: reply, bytes: utf8ToBytes(reply), format: 'ascii' });
    return { replies, nextMcuState: next };
  }

  if (upper.includes('TEMP') || upper.includes('READ')) {
    next.tempTenths = next.tempTenths >= 285 ? 258 : next.tempTenths + 2;
    const hi = (next.tempTenths >> 8) & 0xff;
    const lo = next.tempTenths & 0xff;
    const frame = appendChecksum([0xaa, 0x55, 0x03, hi, lo], 'sum8');
    replies.push({ rawText: bytesToHex(frame), bytes: frame, format: 'hex' });
    return { replies, nextMcuState: next };
  }

  const echo =
    format === 'hex'
      ? `ACK:${bytesToHex(txBytes.slice(0, 6))}`
      : `ACK:${trimmed.slice(0, 24)}\r\n`;
  replies.push({
    rawText: echo,
    bytes: utf8ToBytes(echo),
    format: 'ascii',
  });
  return { replies, nextMcuState: next };
}

export function formatPacketTimestamp(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function getInitialProtoLinkState(): ProtoLinkState {
  const initialLogs: PacketLogEntry[] = [
    {
      id: 'log-1',
      timestamp: '09:40:12.104',
      direction: 'rx',
      transport: 'ble',
      format: 'hex',
      rawHex: 'AA 55 03 01 08 0B',
      rawText: 'AA 55 03 01 08 0B',
      endpointLabel: 'ESP32-S3-Node (FFE2)',
      matches: [
        {
          ruleId: 'rule-temp-hex',
          ruleName: 'HEX 温度上报帧',
          rawValue: 26.4,
          formattedValue: '26.4 ℃',
          checksumValid: true,
        },
      ],
    },
    {
      id: 'log-2',
      timestamp: '09:40:15.382',
      direction: 'tx',
      transport: 'ble',
      format: 'hex',
      rawHex: 'AA 55 02 32 33',
      rawText: 'AA 55 02 32 33',
      endpointLabel: 'ESP32-S3-Node (FFE1)',
      matches: [],
    },
    {
      id: 'log-3',
      timestamp: '09:40:15.405',
      direction: 'rx',
      transport: 'ble',
      format: 'json',
      rawHex: bytesToHex(utf8ToBytes('{"pwm":50}')),
      rawText: '{"pwm":50}',
      endpointLabel: 'ESP32-S3-Node (FFE2)',
      matches: [
        {
          ruleId: 'rule-pwm-json',
          ruleName: 'JSON PWM 占空比反馈',
          rawValue: 50,
          formattedValue: '50 %',
          checksumValid: true,
        },
      ],
    },
  ];

  return {
    activeTransport: 'ble',
    connectionStatus: 'connected',
    connectionMode: 'simulator',
    ble: {
      deviceName: 'ESP32-S3-Node',
      deviceId: 'D4:8A:FC:91:2B:10',
      serviceUuid: '0000FFE0-0000-1000-8000-00805F9B34FB',
      writeUuid: '0000FFE1-0000-1000-8000-00805F9B34FB',
      notifyUuid: '0000FFE2-0000-1000-8000-00805F9B34FB',
      mtu: 247,
      rssi: -54,
    },
    mqtt: {
      brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
      clientId: 'protolink_rn_01',
      username: 'mcu_dev',
      password: '',
      pubTopic: 'mcu/esp32/cmd',
      subTopic: 'mcu/esp32/stat/#',
      qos: 1,
    },
    tcp: {
      mode: 'client',
      host: '192.168.4.1',
      port: 8080,
      wsBridgeUrl: '',
      keepAliveSec: 30,
    },
    polling: {
      enabled: false,
      intervalMs: 1000,
      label: '温度定时轮询',
      payload: 'AA 55 03 00',
      format: 'hex',
      checksum: 'sum8',
    },
    widgets: [
      {
        id: 'w-led',
        name: '板载 LED 灯 (GPIO2)',
        subtitle: 'HEX 帧 0x01 · 支持 BLE / MQTT / TCP',
        kind: 'switch',
        format: 'hex',
        checksum: 'sum8',
        onPayload: 'AA 55 01 01',
        offPayload: 'AA 55 01 00',
        sliderTemplate: '',
        min: 0,
        max: 1,
        step: 1,
        unit: '',
        boolValue: true,
        numericValue: 1,
        mqttTopic: 'mcu/esp32/cmd/led',
      },
      {
        id: 'w-pwm',
        name: 'PWM 调光亮度',
        subtitle: '占空比实时下发 · 模板 AA 55 02 {hex}',
        kind: 'slider',
        format: 'hex',
        checksum: 'sum8',
        onPayload: '',
        offPayload: '',
        sliderTemplate: 'AA 55 02 {hex}',
        min: 0,
        max: 100,
        step: 5,
        unit: '%',
        boolValue: false,
        numericValue: 50,
        mqttTopic: 'mcu/esp32/cmd/pwm',
      },
      {
        id: 'w-rgb',
        name: 'WS2812 RGB 彩灯',
        subtitle: '三通道调色 · 模板 AA 55 05 {rh} {gh} {bh}',
        kind: 'rgb',
        format: 'hex',
        checksum: 'sum8',
        onPayload: '',
        offPayload: '',
        sliderTemplate: '',
        min: 0,
        max: 255,
        step: 1,
        unit: '',
        boolValue: true,
        numericValue: 0,
        rgbValue: '#0D9488',
        rgbTemplate: 'AA 55 05 {rh} {gh} {bh}',
        mqttTopic: 'mcu/esp32/cmd/rgb',
      },
      {
        id: 'w-dpad',
        name: '小车 / 云台方向控制',
        subtitle: '按住发送运动帧 · 松开自动下发停止帧',
        kind: 'dpad',
        format: 'hex',
        checksum: 'sum8',
        onPayload: '',
        offPayload: '',
        sliderTemplate: '',
        min: 0,
        max: 1,
        step: 1,
        unit: '',
        boolValue: false,
        numericValue: 0,
        dpadPayloads: {
          up: 'AA 55 06 01',
          down: 'AA 55 06 02',
          left: 'AA 55 06 03',
          right: 'AA 55 06 04',
          stop: 'AA 55 06 00',
        },
        activeDirection: '',
        mqttTopic: 'mcu/esp32/cmd/motion',
      },
      {
        id: 'w-mode',
        name: '系统工作模式',
        subtitle: '多挡位枚举切换 · HEX 帧 0x07',
        kind: 'mode',
        format: 'hex',
        checksum: 'sum8',
        onPayload: '',
        offPayload: '',
        sliderTemplate: '',
        min: 0,
        max: 2,
        step: 1,
        unit: '',
        boolValue: false,
        numericValue: 1,
        modeOptions: [
          { label: '待机', payload: 'AA 55 07 00' },
          { label: '自动', payload: 'AA 55 07 01' },
          { label: '调试', payload: 'AA 55 07 02' },
        ],
        activeModeIndex: 1,
        mqttTopic: 'mcu/esp32/cmd/mode',
      },
      {
        id: 'w-motor',
        name: '直流电机调速',
        subtitle: 'ASCII 文本指令 · SPD:{val}',
        kind: 'slider',
        format: 'ascii',
        checksum: 'none',
        onPayload: '',
        offPayload: '',
        sliderTemplate: 'SPD:{val}\\r\\n',
        min: 0,
        max: 100,
        step: 10,
        unit: '%',
        boolValue: false,
        numericValue: 30,
        mqttTopic: 'mcu/esp32/cmd/motor',
      },
      {
        id: 'w-temp-btn',
        name: '读取传感器温度',
        subtitle: '发送查询帧 AA 55 03 00 并触发协议解析',
        kind: 'button',
        format: 'hex',
        checksum: 'sum8',
        onPayload: 'AA 55 03 00',
        offPayload: '',
        sliderTemplate: '',
        min: 0,
        max: 100,
        step: 1,
        unit: '',
        boolValue: false,
        numericValue: 0,
        mqttTopic: 'mcu/esp32/cmd/query',
      },
      {
        id: 'w-temp-read',
        name: 'MCU 核心温度监控',
        subtitle: '自动绑定规则：HEX 温度上报帧',
        kind: 'telemetry',
        format: 'hex',
        checksum: 'sum8',
        onPayload: '',
        offPayload: '',
        sliderTemplate: '',
        min: 0,
        max: 100,
        step: 1,
        unit: '℃',
        boolValue: false,
        numericValue: 26.4,
        boundRuleId: 'rule-temp-hex',
        lastUpdatedText: '26.4 ℃',
      },
    ],
    rules: [
      {
        id: 'rule-temp-hex',
        name: 'HEX 温度上报帧',
        enabled: true,
        mode: 'hex',
        headerHex: 'AA 55 03',
        dataOffset: 3,
        byteLength: 2,
        endian: 'big',
        checksum: 'sum8',
        scale: 0.1,
        regexPattern: '',
        jsonKey: '',
        unit: '℃',
        lastDecodedValue: '26.4 ℃',
        lastMatchedAt: '09:40:12.104',
      },
      {
        id: 'rule-pwm-json',
        name: 'JSON PWM 占空比反馈',
        enabled: true,
        mode: 'json',
        headerHex: '',
        dataOffset: 0,
        byteLength: 1,
        endian: 'big',
        checksum: 'none',
        scale: 1,
        regexPattern: '',
        jsonKey: 'pwm',
        unit: '%',
        lastDecodedValue: '50 %',
        lastMatchedAt: '09:40:15.405',
      },
      {
        id: 'rule-led-ascii',
        name: 'ASCII LED 状态回传',
        enabled: true,
        mode: 'ascii',
        headerHex: '',
        dataOffset: 0,
        byteLength: 1,
        endian: 'big',
        checksum: 'none',
        scale: 1,
        regexPattern: 'LED:(0|1)',
        jsonKey: '',
        unit: '状态',
      },
    ],
    logs: initialLogs,
    virtualMcu: {
      ledOn: true,
      pwmDuty: 50,
      motorSpeed: 30,
      rgbHex: '#0D9488',
      motionDir: '停止',
      workMode: '自动',
      tempTenths: 264,
      firmware: 'STM32F4/ESP32-S3 Demo',
    },
    platform: 'ios',
    darkMode: false,
  };
}
