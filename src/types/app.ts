export type TabRoute = 'connect' | 'controls' | 'console' | 'protocol';

export type PlatformStyle = 'ios' | 'android';

export type TransportType = 'ble' | 'mqtt' | 'tcp';

export type ConnectionMode = 'simulator' | 'live';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type PayloadFormat = 'hex' | 'ascii' | 'json';

export type ChecksumType = 'none' | 'sum8' | 'xor8' | 'crc16';

export type WidgetKind =
  | 'switch'
  | 'slider'
  | 'rgb'
  | 'dpad'
  | 'mode'
  | 'button'
  | 'telemetry';

export interface BleConfig {
  deviceName: string;
  deviceId: string;
  serviceUuid: string;
  writeUuid: string;
  notifyUuid: string;
  mtu: number;
  rssi: number;
}

export interface MqttConfig {
  brokerUrl: string;
  clientId: string;
  username: string;
  password: string;
  pubTopic: string;
  subTopic: string;
  qos: 0 | 1 | 2;
}

export interface TcpConfig {
  mode: 'client' | 'server';
  host: string;
  port: number;
  wsBridgeUrl: string;
  keepAliveSec: number;
}

export interface DpadPayloads {
  up: string;
  down: string;
  left: string;
  right: string;
  stop: string;
}

export interface ModeOption {
  label: string;
  payload: string;
}

export interface ControlWidget {
  id: string;
  name: string;
  subtitle: string;
  kind: WidgetKind;
  format: PayloadFormat;
  checksum: ChecksumType;
  /** Switch ON / Button one-shot payload */
  onPayload: string;
  /** Switch OFF payload */
  offPayload: string;
  /** Slider template containing {val} or {hex} or {hex2} */
  sliderTemplate: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  boolValue: boolean;
  numericValue: number;
  /** RGB color value (#RRGGBB) and template ({r} {g} {b} {rh} {gh} {bh}) */
  rgbValue?: string;
  rgbTemplate?: string;
  /** Directional keypad payloads with press/release stop */
  dpadPayloads?: DpadPayloads;
  activeDirection?: keyof DpadPayloads | '';
  /** Multi-mode selector options */
  modeOptions?: ModeOption[];
  activeModeIndex?: number;
  /** Optional MQTT topic override */
  mqttTopic?: string;
  /** Optional protocol rule ID for telemetry binding */
  boundRuleId?: string;
  lastUpdatedText?: string;
}

export interface PollingConfig {
  enabled: boolean;
  intervalMs: number;
  label: string;
  payload: string;
  format: PayloadFormat;
  checksum: ChecksumType;
}

export type ProtocolParseMode = 'hex' | 'ascii' | 'json';

export interface ProtocolRule {
  id: string;
  name: string;
  enabled: boolean;
  mode: ProtocolParseMode;
  /** HEX frame header, e.g. "AA 55" */
  headerHex: string;
  /** 0-based byte offset for numeric extraction */
  dataOffset: number;
  byteLength: 1 | 2;
  endian: 'big' | 'little';
  checksum: ChecksumType;
  /** Scale multiplier, e.g. 0.1 for 264 -> 26.4 */
  scale: number;
  /** ASCII regex with capture group 1 */
  regexPattern: string;
  /** JSON dot path, e.g. "temp" or "sensor.pwm" */
  jsonKey: string;
  unit: string;
  lastDecodedValue?: string;
  lastMatchedAt?: string;
}

export interface ParsedProtocolMatch {
  ruleId: string;
  ruleName: string;
  rawValue: string | number;
  formattedValue: string;
  checksumValid: boolean;
}

export interface PacketLogEntry {
  id: string;
  timestamp: string;
  direction: 'tx' | 'rx' | 'sys';
  transport: TransportType;
  format: PayloadFormat;
  rawHex: string;
  rawText: string;
  endpointLabel: string;
  matches: ParsedProtocolMatch[];
}

export interface VirtualMcuState {
  ledOn: boolean;
  pwmDuty: number;
  motorSpeed: number;
  rgbHex: string;
  motionDir: string;
  workMode: string;
  tempTenths: number;
  firmware: string;
}

export interface ProtoLinkState {
  activeTransport: TransportType;
  connectionStatus: ConnectionStatus;
  connectionMode: ConnectionMode;
  ble: BleConfig;
  mqtt: MqttConfig;
  tcp: TcpConfig;
  widgets: ControlWidget[];
  polling: PollingConfig;
  rules: ProtocolRule[];
  logs: PacketLogEntry[];
  virtualMcu: VirtualMcuState;
  platform: PlatformStyle;
  darkMode: boolean;
}

export interface RNCodeFile {
  path: string;
  language: 'tsx' | 'ts' | 'json';
  summary: string;
  content: string;
}
