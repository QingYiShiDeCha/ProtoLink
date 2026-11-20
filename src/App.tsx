import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import mqtt, { type MqttClient } from 'mqtt';
import { List, Popup, Segmented } from 'antd-mobile';
import { Button } from './ui';
import { Moon, Smartphone, Sun, X } from 'lucide-react';
import type {
  BleConfig,
  ChecksumType,
  ControlWidget,
  DpadPayloads,
  MqttConfig,
  PacketLogEntry,
  ParsedProtocolMatch,
  PayloadFormat,
  PlatformStyle,
  PollingConfig,
  ProtoLinkState,
  ProtocolRule,
  TabRoute,
  TcpConfig,
  TransportType,
} from './types/app';
import {
  buildOutgoingPayload,
  bytesToAscii,
  bytesToHex,
  evaluateProtocolRules,
  formatPacketTimestamp,
  getInitialProtoLinkState,
  parseHexString,
  simulateMcuResponse,
  utf8ToBytes,
} from './utils/protocolEngine';
import { buildExpoBundleFiles } from './utils/rnSourceBuilder';
import { MobileAppShell } from './components/mobile/MobileAppShell';
import { CodeExplorerPanel } from './components/studio/CodeExplorerPanel';
import { GuideModal } from './components/studio/GuideModal';
import {
  connectNativeBleTo,
  isNativePlatform,
  startNativeBleScan,
  stopNativeBleScan,
  type NativeBleLink,
  type ScannedDevice,
} from './native/ble';

const STORAGE_KEY = 'protolink_rn_app_v2';

/** 原生壳里默认跟随真实平台，浏览器里保持 android */
const NATIVE_PLATFORM: PlatformStyle = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

interface WebBluetoothCharacteristicLike {
  writeValue: (value: BufferSource) => Promise<void>;
  startNotifications: () => Promise<void>;
  addEventListener: (
    event: string,
    listener: (ev: Event & { target?: { value?: DataView } }) => void
  ) => void;
}

interface WebBluetoothNavigatorLike {
  bluetooth?: {
    requestDevice: (options: {
      acceptAllDevices?: boolean;
      optionalServices?: string[];
    }) => Promise<{
      name?: string;
      id: string;
      gatt?: {
        connect: () => Promise<{
          getPrimaryService: (uuid: string) => Promise<{
            getCharacteristic: (uuid: string) => Promise<WebBluetoothCharacteristicLike>;
          }>;
        }>;
      };
    }>;
  };
}

function loadSavedState(): ProtoLinkState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialProtoLinkState();
    const parsed = JSON.parse(raw) as Partial<ProtoLinkState>;
    const fallback = getInitialProtoLinkState();
    return {
      activeTransport:
        parsed.activeTransport === 'mqtt' || parsed.activeTransport === 'tcp'
          ? parsed.activeTransport
          : 'ble',
      connectionStatus:
        parsed.connectionStatus === 'disconnected' ? 'disconnected' : 'connected',
      connectionMode: 'simulator',
      ble: parsed.ble ? { ...fallback.ble, ...parsed.ble } : fallback.ble,
      mqtt: parsed.mqtt ? { ...fallback.mqtt, ...parsed.mqtt } : fallback.mqtt,
      tcp: parsed.tcp ? { ...fallback.tcp, ...parsed.tcp } : fallback.tcp,
      polling: parsed.polling
        ? { ...fallback.polling, ...parsed.polling, enabled: false }
        : fallback.polling,
      widgets: Array.isArray(parsed.widgets) ? parsed.widgets : fallback.widgets,
      rules: Array.isArray(parsed.rules) ? parsed.rules : fallback.rules,
      logs: Array.isArray(parsed.logs) ? parsed.logs : fallback.logs,
      virtualMcu: parsed.virtualMcu
        ? { ...fallback.virtualMcu, ...parsed.virtualMcu }
        : fallback.virtualMcu,
      platform:
        parsed.platform === 'android' || parsed.platform === 'ios'
          ? parsed.platform
          : NATIVE_PLATFORM,
      darkMode: Boolean(parsed.darkMode),
    };
  } catch {
    return getInitialProtoLinkState();
  }
}

export default function App() {
  const [state, setState] = useState<ProtoLinkState>(loadSavedState);
  const [activeTab, setActiveTab] = useState<TabRoute>('controls');
  const [studioView, setStudioView] = useState<'preview' | 'code'>('preview');
  const [guideOpen, setGuideOpen] = useState(false);
  const [mobileCodeOpen, setMobileCodeOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const [hardwareError, setHardwareError] = useState('');

  const previewRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const liveBleCharRef = useRef<WebBluetoothCharacteristicLike | null>(null);
  const nativeBleRef = useRef<NativeBleLink | null>(null);
  const isNative = isNativePlatform();
  const [bleScanOpen, setBleScanOpen] = useState(false);
  const [bleDevices, setBleDevices] = useState<ScannedDevice[]>([]);
  const [bleScanning, setBleScanning] = useState(false);
  const [blePicking, setBlePicking] = useState(false);

  // antd-mobile 的 Popup/TabBar 会渲染到 body 的 portal 里，
  // 落在 .dark 容器之外，所以暗色 class 必须挂到 documentElement 上。
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.darkMode);
  }, [state.darkMode]);
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveMqttRef = useRef<MqttClient | null>(null);
  const transmitRef = useRef<
    (
      templateOrRaw: string,
      format: PayloadFormat,
      checksum: ChecksumType,
      value?: number,
      topicOverride?: string,
      rgbHex?: string
    ) => { ok: true } | { ok: false; error: string }
  >(() => ({ ok: true }));

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  useEffect(() => {
    return () => {
      liveMqttRef.current?.end(true);
      liveWsRef.current?.close();
    };
  }, []);

  const rnFiles = useMemo(() => buildExpoBundleFiles('ProtoLink'), []);

  const getEndpointLabel = (st: ProtoLinkState, topicOverride?: string): string => {
    if (st.activeTransport === 'ble') {
      return `${st.ble.deviceName} (${st.ble.writeUuid.slice(4, 8)})`;
    }
    if (st.activeTransport === 'mqtt') {
      return topicOverride || st.mqtt.pubTopic;
    }
    return `${st.tcp.host}:${st.tcp.port}`;
  };

  const ingestIncomingBytes = (
    bytes: number[],
    rawText: string,
    format: PayloadFormat,
    transport: TransportType,
    endpointLabel: string
  ) => {
    const timestamp = formatPacketTimestamp();
    setState((prev) => {
      const matches = evaluateProtocolRules(bytes, rawText, prev.rules);
      const nextRules = prev.rules.map((r) => {
        const hit = matches.find((m) => m.ruleId === r.id);
        return hit
          ? { ...r, lastDecodedValue: hit.formattedValue, lastMatchedAt: timestamp }
          : r;
      });
      const nextWidgets = prev.widgets.map((w) => {
        if (w.kind !== 'telemetry' || !w.boundRuleId) return w;
        const hit = matches.find((m) => m.ruleId === w.boundRuleId);
        return hit ? { ...w, lastUpdatedText: hit.formattedValue } : w;
      });
      const rxLog: PacketLogEntry = {
        id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        direction: 'rx',
        transport,
        format,
        rawHex: bytesToHex(bytes),
        rawText,
        endpointLabel,
        matches,
      };
      return {
        ...prev,
        rules: nextRules,
        widgets: nextWidgets,
        logs: [rxLog, ...prev.logs].slice(0, 80),
      };
    });
  };

  const transmitPayload = (
    templateOrRaw: string,
    format: PayloadFormat,
    checksum: ChecksumType,
    value?: number,
    topicOverride?: string,
    rgbHex?: string
  ): { ok: true } | { ok: false; error: string } => {
    const built = buildOutgoingPayload(templateOrRaw, format, checksum, value, rgbHex);
    if (!built.ok) {
      return { ok: false, error: built.error };
    }

    const timestamp = formatPacketTimestamp();
    const transport = state.activeTransport;

    // 真机写入：原生壳走 Capacitor BLE 插件，浏览器里退回 Web Bluetooth
    if (transport === 'ble' && state.connectionMode === 'live') {
      if (nativeBleRef.current) {
        void nativeBleRef.current.write(built.bytes).catch(() => {
          setHardwareError('原生蓝牙写入失败，请检查写特征值权限');
        });
      } else if (liveBleCharRef.current) {
        liveBleCharRef.current
          .writeValue(new Uint8Array(built.bytes))
          .catch(() => {
            setHardwareError('Web Bluetooth 写入失败，请检查设备特征值权限');
          });
      }
    }

    // Real MQTT-over-WS publish when connected in live MQTT mode
    if (
      transport === 'mqtt' &&
      state.connectionMode === 'live' &&
      liveMqttRef.current?.connected
    ) {
      const topic = topicOverride || state.mqtt.pubTopic;
      const payloadToSend =
        format === 'hex' ? new Uint8Array(built.bytes) : built.rawText;
      liveMqttRef.current.publish(topic, payloadToSend as string, {
        qos: state.mqtt.qos,
      });
    }

    // Real WebSocket bridge write when connected in live TCP mode
    if (
      transport === 'tcp' &&
      state.connectionMode === 'live' &&
      liveWsRef.current &&
      liveWsRef.current.readyState === WebSocket.OPEN
    ) {
      liveWsRef.current.send(new Uint8Array(built.bytes));
    }

    setState((prev) => {
      const txLog: PacketLogEntry = {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        direction: 'tx',
        transport: prev.activeTransport,
        format,
        rawHex: built.rawHex,
        rawText: built.rawText,
        endpointLabel: getEndpointLabel(prev, topicOverride),
        matches: [],
      };

      // Built-in virtual MCU simulator response when in simulator mode
      if (prev.connectionStatus === 'connected' && prev.connectionMode === 'simulator') {
        const sim = simulateMcuResponse(built.rawText, built.bytes, format, prev.virtualMcu);
        const replyLogs: PacketLogEntry[] = [];
        let nextRules = prev.rules;
        let nextWidgets = prev.widgets;

        for (const reply of sim.replies) {
          const matches = evaluateProtocolRules(reply.bytes, reply.rawText, nextRules);
          nextRules = nextRules.map((r) => {
            const hit = matches.find((m) => m.ruleId === r.id);
            return hit
              ? { ...r, lastDecodedValue: hit.formattedValue, lastMatchedAt: timestamp }
              : r;
          });
          nextWidgets = nextWidgets.map((w) => {
            if (w.kind !== 'telemetry' || !w.boundRuleId) return w;
            const hit = matches.find((m) => m.ruleId === w.boundRuleId);
            return hit ? { ...w, lastUpdatedText: hit.formattedValue } : w;
          });
          replyLogs.push({
            id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp,
            direction: 'rx',
            transport: prev.activeTransport,
            format: reply.format,
            rawHex: bytesToHex(reply.bytes),
            rawText: reply.rawText,
            endpointLabel: getEndpointLabel(prev, topicOverride),
            matches,
          });
        }

        return {
          ...prev,
          virtualMcu: sim.nextMcuState,
          rules: nextRules,
          widgets: nextWidgets,
          logs: [...replyLogs, txLog, ...prev.logs].slice(0, 80),
        };
      }

      return {
        ...prev,
        logs: [txLog, ...prev.logs].slice(0, 80),
      };
    });

    return { ok: true };
  };

  transmitRef.current = transmitPayload;

  // Auto-Polling timer
  useEffect(() => {
    if (!state.polling.enabled || state.connectionStatus !== 'connected') return;
    const timer = window.setInterval(() => {
      transmitRef.current(
        state.polling.payload,
        state.polling.format,
        state.polling.checksum
      );
    }, Math.max(250, state.polling.intervalMs));
    return () => window.clearInterval(timer);
  }, [
    state.polling.enabled,
    state.polling.intervalMs,
    state.polling.payload,
    state.polling.format,
    state.polling.checksum,
    state.connectionStatus,
  ]);

  const disconnectAllLiveLinks = () => {
    liveBleCharRef.current = null;
    if (nativeBleRef.current) {
      const link = nativeBleRef.current;
      nativeBleRef.current = null;
      void link.disconnect().catch(() => {
        /* 断开失败不阻塞状态切换 */
      });
    }
    if (liveWsRef.current) {
      liveWsRef.current.close();
      liveWsRef.current = null;
    }
    if (liveMqttRef.current) {
      liveMqttRef.current.end(true);
      liveMqttRef.current = null;
    }
  };

  const handleToggleConnect = () => {
    setHardwareError('');
    if (state.connectionStatus === 'connected') {
      disconnectAllLiveLinks();
      setState((prev) => ({
        ...prev,
        connectionStatus: 'disconnected',
        connectionMode: 'simulator',
      }));
      return;
    }

    if (state.activeTransport === 'tcp' && state.tcp.wsBridgeUrl.trim()) {
      try {
        const ws = new WebSocket(state.tcp.wsBridgeUrl.trim());
        ws.binaryType = 'arraybuffer';
        setState((prev) => ({ ...prev, connectionStatus: 'connecting' }));
        ws.onopen = () => {
          liveWsRef.current = ws;
          setState((prev) => ({
            ...prev,
            connectionStatus: 'connected',
            connectionMode: 'live',
          }));
        };
        ws.onmessage = (ev) => {
          const bytes =
            ev.data instanceof ArrayBuffer
              ? Array.from(new Uint8Array(ev.data))
              : utf8ToBytes(String(ev.data));
          const text = typeof ev.data === 'string' ? ev.data : bytesToAscii(bytes);
          ingestIncomingBytes(
            bytes,
            text,
            'hex',
            'tcp',
            `${state.tcp.host}:${state.tcp.port}`
          );
        };
        ws.onerror = () => {
          setHardwareError('无法连接到 WebSocket TCP 桥接端口，已切换为内置 MCU 仿真');
          setState((prev) => ({
            ...prev,
            connectionStatus: 'connected',
            connectionMode: 'simulator',
          }));
        };
        return;
      } catch {
        setHardwareError('WebSocket 地址格式无效，已使用内置单片机仿真模式');
      }
    }

    setState((prev) => ({
      ...prev,
      connectionStatus: 'connected',
      connectionMode: 'simulator',
    }));
  };

  const handleConnectLiveMqtt = () => {
    setHardwareError('');
    const url = state.mqtt.brokerUrl.trim();
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      setHardwareError('浏览器直连 MQTT 需使用 ws:// 或 wss:// WebSocket 地址（例如 wss://broker.emqx.io:8084/mqtt）');
      return;
    }

    disconnectAllLiveLinks();
    setState((prev) => ({ ...prev, connectionStatus: 'connecting' }));

    try {
      const client = mqtt.connect(url, {
        clientId: state.mqtt.clientId || `protolink_${Date.now().toString(36)}`,
        username: state.mqtt.username || undefined,
        password: state.mqtt.password || undefined,
        reconnectPeriod: 0,
        connectTimeout: 6000,
      });

      liveMqttRef.current = client;

      client.on('connect', () => {
        client.subscribe(state.mqtt.subTopic, { qos: state.mqtt.qos });
        setState((prev) => ({
          ...prev,
          connectionStatus: 'connected',
          connectionMode: 'live',
        }));
      });

      client.on('message', (topic, payload) => {
        const bytes = Array.from(payload);
        const text = bytesToAscii(bytes);
        const fmt: PayloadFormat = text.trim().startsWith('{') ? 'json' : 'ascii';
        ingestIncomingBytes(bytes, text, fmt, 'mqtt', topic);
      });

      client.on('error', (err) => {
        client.end(true);
        liveMqttRef.current = null;
        setHardwareError(`MQTT Broker 连接失败：${err.message}`);
        setState((prev) => ({
          ...prev,
          connectionStatus: 'disconnected',
          connectionMode: 'simulator',
        }));
      });
    } catch (err) {
      setState((prev) => ({ ...prev, connectionStatus: 'disconnected' }));
      setHardwareError(
        err instanceof Error ? `MQTT 初始化失败：${err.message}` : 'MQTT 连接异常'
      );
    }
  };

  const handleScanWebBluetooth = async () => {
    setHardwareError('');

    // 原生壳：WebView 没有 navigator.bluetooth，改走 Capacitor BLE 插件，
    // 并且用 App 自己的设备列表，而不是 Android 原生的选择框
    if (isNativePlatform()) {
      setBleDevices([]);
      setBleScanOpen(true);
      setBleScanning(true);
      try {
        await startNativeBleScan(state.ble, (devices) => setBleDevices(devices));
      } catch (err) {
        setHardwareError(
          err instanceof Error ? `蓝牙扫描失败：${err.message}` : '蓝牙扫描失败'
        );
        setBleScanOpen(false);
        setBleScanning(false);
      }
      return;
    }

    const nav = navigator as unknown as WebBluetoothNavigatorLike;
    if (!nav.bluetooth) {
      setHardwareError(
        '当前预览环境或浏览器未开放 Web Bluetooth（真机蓝牙需使用 Chrome 桌面/Android 或导出 React Native 原生工程运行）'
      );
      return;
    }

    try {
      disconnectAllLiveLinks();
      setState((prev) => ({ ...prev, connectionStatus: 'connecting' }));
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [state.ble.serviceUuid.toLowerCase()],
      });
      const server = await device.gatt?.connect();
      if (server) {
        const service = await server.getPrimaryService(state.ble.serviceUuid.toLowerCase());
        const writeChar = await service.getCharacteristic(state.ble.writeUuid.toLowerCase());
        liveBleCharRef.current = writeChar;
        try {
          const notifyChar = await service.getCharacteristic(state.ble.notifyUuid.toLowerCase());
          await notifyChar.startNotifications();
          notifyChar.addEventListener('characteristicvaluechanged', (ev) => {
            const dv = ev.target?.value;
            if (!dv) return;
            const bytes = Array.from(new Uint8Array(dv.buffer));
            ingestIncomingBytes(
              bytes,
              bytesToAscii(bytes),
              'hex',
              'ble',
              device.name || device.id
            );
          });
        } catch {
          // Optional notify characteristic
        }
      }
      setState((prev) => ({
        ...prev,
        connectionStatus: 'connected',
        connectionMode: 'live',
        ble: {
          ...prev.ble,
          deviceName: device.name || 'BLE-Device',
          deviceId: device.id,
        },
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, connectionStatus: 'disconnected' }));
      setHardwareError(
        err instanceof Error ? `蓝牙连接取消或失败：${err.message}` : '蓝牙扫描已取消'
      );
    }
  };

  const closeBleScan = () => {
    setBleScanOpen(false);
    setBleScanning(false);
    void stopNativeBleScan();
  };

  const handlePickBleDevice = async (device: ScannedDevice) => {
    if (blePicking) return;
    setBlePicking(true);
    setHardwareError('');
    try {
      await stopNativeBleScan();
      disconnectAllLiveLinks();
      setState((prev) => ({ ...prev, connectionStatus: 'connecting' }));
      const link = await connectNativeBleTo(device, state.ble, {
        onData: (bytes, label) =>
          ingestIncomingBytes(bytes, bytesToAscii(bytes), 'hex', 'ble', label),
        onDisconnect: (message) => {
          nativeBleRef.current = null;
          setHardwareError(message);
          setState((prev) => ({
            ...prev,
            connectionStatus: 'disconnected',
            connectionMode: 'simulator',
          }));
        },
      });
      nativeBleRef.current = link;
      setBleScanOpen(false);
      setBleScanning(false);
      setState((prev) => ({
        ...prev,
        connectionStatus: 'connected',
        connectionMode: 'live',
        ble: {
          ...prev.ble,
          deviceName: link.deviceLabel,
          deviceId: device.deviceId,
        },
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, connectionStatus: 'disconnected' }));
      setHardwareError(
        err instanceof Error ? `蓝牙连接失败：${err.message}` : '蓝牙连接失败'
      );
    } finally {
      setBlePicking(false);
    }
  };

  const handleTriggerSwitch = (widgetId: string, nextValue: boolean) => {
    const target = state.widgets.find((w) => w.id === widgetId);
    if (!target) return;
    setState((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) =>
        w.id === widgetId ? { ...w, boolValue: nextValue } : w
      ),
    }));
    transmitPayload(
      nextValue ? target.onPayload : target.offPayload,
      target.format,
      target.checksum,
      nextValue ? 1 : 0,
      target.mqttTopic
    );
  };

  const handleTriggerSlider = (widgetId: string, nextValue: number) => {
    const target = state.widgets.find((w) => w.id === widgetId);
    if (!target) return;
    setState((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) =>
        w.id === widgetId ? { ...w, numericValue: nextValue } : w
      ),
    }));
    transmitPayload(
      target.sliderTemplate,
      target.format,
      target.checksum,
      nextValue,
      target.mqttTopic
    );
  };

  const handleTriggerRgb = (widgetId: string, nextHex: string) => {
    const target = state.widgets.find((w) => w.id === widgetId);
    if (!target) return;
    setState((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) =>
        w.id === widgetId ? { ...w, rgbValue: nextHex } : w
      ),
    }));
    transmitPayload(
      target.rgbTemplate || 'AA 55 05 {rh} {gh} {bh}',
      target.format,
      target.checksum,
      0,
      target.mqttTopic,
      nextHex
    );
  };

  const handleTriggerDpad = (widgetId: string, dir: keyof DpadPayloads) => {
    const target = state.widgets.find((w) => w.id === widgetId);
    if (!target || !target.dpadPayloads) return;
    const payload = target.dpadPayloads[dir];
    setState((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) =>
        w.id === widgetId ? { ...w, activeDirection: dir === 'stop' ? '' : dir } : w
      ),
    }));
    transmitPayload(payload, target.format, target.checksum, 0, target.mqttTopic);
  };

  const handleTriggerMode = (widgetId: string, modeIdx: number) => {
    const target = state.widgets.find((w) => w.id === widgetId);
    if (!target || !target.modeOptions?.[modeIdx]) return;
    const opt = target.modeOptions[modeIdx];
    setState((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) =>
        w.id === widgetId ? { ...w, activeModeIndex: modeIdx } : w
      ),
    }));
    transmitPayload(opt.payload, target.format, target.checksum, modeIdx, target.mqttTopic);
  };

  const handleTriggerButton = (widgetId: string) => {
    const target = state.widgets.find((w) => w.id === widgetId);
    if (!target) return;
    transmitPayload(
      target.onPayload,
      target.format,
      target.checksum,
      target.numericValue,
      target.mqttTopic
    );
  };

  const handleSimulateIncoming = (
    rawInput: string
  ): { ok: boolean; error?: string; matches: ParsedProtocolMatch[] } => {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return { ok: false, error: '请输入要测试的接收报文', matches: [] };
    }

    const hexCandidate = parseHexString(trimmed);
    const isHexLike =
      !trimmed.startsWith('{') &&
      /^[0-9a-fA-F\s,]+$/.test(trimmed) &&
      hexCandidate.ok &&
      hexCandidate.bytes.length >= 2;

    const bytes = isHexLike && hexCandidate.ok ? hexCandidate.bytes : utf8ToBytes(trimmed);
    const format: PayloadFormat = trimmed.startsWith('{')
      ? 'json'
      : isHexLike
      ? 'hex'
      : 'ascii';
    const matches = evaluateProtocolRules(bytes, trimmed, state.rules);

    ingestIncomingBytes(
      bytes,
      trimmed,
      format,
      state.activeTransport,
      `${getEndpointLabel(state)} (测试)`
    );

    return { ok: true, matches };
  };

  const handleExportBundle = () => {
    const bundle = {
      project: 'protolink-rn',
      framework: 'React Native + Expo SDK 52 + HeroUI Native',
      files: rnFiles.map((f) => ({ path: f.path, content: f.content })),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'protolink-react-native-expo.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice('已导出 Expo 原生调试工程包 (protolink-react-native-expo.json)');
    window.setTimeout(() => setExportNotice(''), 3000);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
      {/* Studio Top Bar (3-zone contract) */}
      <header className={`${isNative ? 'hidden' : 'hidden md:flex'} h-14 px-6 xl:px-8 items-center justify-between gap-8 bg-white border-b border-slate-200 sticky top-0 z-40`}>
        <a
          href="#top"
          className="text-lg font-display font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          ProtoLink RN
        </a>

        <nav className="flex items-center gap-7 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => {
              setStudioView('preview');
              previewRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              studioView === 'preview'
                ? 'text-slate-900 font-semibold xl:font-medium'
                : 'hover:text-slate-900'
            }`}
          >
            手机预览
          </button>
          <button
            type="button"
            onClick={() => {
              setStudioView('code');
              codeRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              studioView === 'code'
                ? 'text-slate-900 font-semibold xl:font-medium'
                : 'hover:text-slate-900'
            }`}
          >
            原生源码
          </button>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            运行指南
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <Button
            variant="primary"
            size="sm"
            onPress={handleExportBundle}
            className="min-h-[38px] px-4 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
          >
            导出源码工程
          </Button>
        </div>
      </header>

      {exportNotice && (
        <div
          role="status"
          className="hidden md:block fixed bottom-5 right-6 z-50 rounded-xl bg-slate-900 text-white px-4 py-2.5 text-xs font-medium shadow-lg"
        >
          {exportNotice}
        </div>
      )}

      {/* Responsive Studio Grid */}
      <div className="xl:max-w-[1440px] xl:mx-auto md:px-6 xl:px-8 md:py-4 xl:grid xl:grid-cols-[410px_1fr] xl:gap-8 xl:items-start">
        <div
          ref={previewRef}
          className={`${
            studioView === 'code' ? 'hidden xl:flex' : 'md:flex'
          } md:flex-col md:items-center md:gap-2.5`}
        >
          <div className={`${isNative ? 'hidden' : 'hidden md:flex'} w-[375px] items-center justify-between gap-2`}>
            <Segmented
              options={[
                { label: 'iOS 风格', value: 'ios' },
                { label: 'Android 风格', value: 'android' },
              ]}
              value={state.platform}
              onChange={(value) =>
                setState((prev) => ({ ...prev, platform: value as PlatformStyle }))
              }
            />

            <Button
              variant="outline"
              size="sm"
              onPress={() =>
                setState((prev) => ({ ...prev, darkMode: !prev.darkMode }))
              }
              aria-label={state.darkMode ? '切换为浅色模式' : '切换为深色模式'}
              className="min-h-[42px] px-3.5 rounded-xl bg-white text-xs font-medium text-slate-700 whitespace-nowrap"
            >
              {state.darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>浅色</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span>深色</span>
                </>
              )}
            </Button>
          </div>

          <div className={`h-[100dvh] ${isNative ? 'w-full' : 'md:w-[375px] md:h-[clamp(560px,calc(100dvh-142px),710px)] md:rounded-[40px] md:bg-slate-900 md:p-2.5 md:shadow-xl md:border md:border-slate-800'} relative`}>
            <div
              className={`hidden md:flex bg-slate-950 rounded-full mx-auto mb-1.5 items-center justify-center transition-all ${
                state.platform === 'ios' ? 'w-24 h-5' : 'w-4 h-4'
              }`}
              aria-hidden="true"
            >
              <div className="w-2 h-2 rounded-full bg-slate-800" />
            </div>

            <div className="h-full md:w-full md:h-[calc(100%-26px)] md:rounded-[30px] overflow-hidden relative bg-slate-50">
              <MobileAppShell
                state={state}
                activeTab={activeTab}
                hardwareError={hardwareError}
                onChangeTab={setActiveTab}
                onChangeTransport={(transport: TransportType) => {
                  setHardwareError('');
                  setState((prev) => ({ ...prev, activeTransport: transport }));
                }}
                onToggleConnect={handleToggleConnect}
                onScanWebBluetooth={handleScanWebBluetooth}
                onConnectLiveMqtt={handleConnectLiveMqtt}
                onUpdateBle={(patch: Partial<BleConfig>) =>
                  setState((prev) => ({ ...prev, ble: { ...prev.ble, ...patch } }))
                }
                onUpdateMqtt={(patch: Partial<MqttConfig>) =>
                  setState((prev) => ({ ...prev, mqtt: { ...prev.mqtt, ...patch } }))
                }
                onUpdateTcp={(patch: Partial<TcpConfig>) =>
                  setState((prev) => ({ ...prev, tcp: { ...prev.tcp, ...patch } }))
                }
                onUpdatePolling={(patch: Partial<PollingConfig>) =>
                  setState((prev) => ({ ...prev, polling: { ...prev.polling, ...patch } }))
                }
                onTriggerSwitch={handleTriggerSwitch}
                onTriggerSlider={handleTriggerSlider}
                onTriggerRgb={handleTriggerRgb}
                onTriggerDpad={handleTriggerDpad}
                onTriggerMode={handleTriggerMode}
                onTriggerButton={handleTriggerButton}
                onAddWidget={(widget: Omit<ControlWidget, 'id'>) =>
                  setState((prev) => ({
                    ...prev,
                    widgets: [
                      { ...widget, id: `w-${Date.now()}` },
                      ...prev.widgets,
                    ],
                  }))
                }
                onEditWidget={(widgetId: string, widget: Omit<ControlWidget, 'id'>) =>
                  setState((prev) => ({
                    ...prev,
                    widgets: prev.widgets.map((w) =>
                      w.id === widgetId ? { ...widget, id: widgetId } : w
                    ),
                  }))
                }
                onDeleteWidget={(widgetId: string) =>
                  setState((prev) => ({
                    ...prev,
                    widgets: prev.widgets.filter((w) => w.id !== widgetId),
                  }))
                }
                onSendRaw={(raw, format, checksum) =>
                  transmitPayload(raw, format, checksum)
                }
                onClearLogs={() => setState((prev) => ({ ...prev, logs: [] }))}
                onToggleRule={(ruleId, enabled) =>
                  setState((prev) => ({
                    ...prev,
                    rules: prev.rules.map((r) =>
                      r.id === ruleId ? { ...r, enabled } : r
                    ),
                  }))
                }
                onAddRule={(rule: Omit<ProtocolRule, 'id'>) =>
                  setState((prev) => ({
                    ...prev,
                    rules: [{ ...rule, id: `r-${Date.now()}` }, ...prev.rules],
                  }))
                }
                onEditRule={(ruleId: string, rule: Omit<ProtocolRule, 'id'>) =>
                  setState((prev) => ({
                    ...prev,
                    rules: prev.rules.map((r) =>
                      r.id === ruleId ? { ...rule, id: ruleId } : r
                    ),
                  }))
                }
                onDeleteRule={(ruleId) =>
                  setState((prev) => ({
                    ...prev,
                    rules: prev.rules.filter((r) => r.id !== ruleId),
                  }))
                }
                onSimulateIncoming={handleSimulateIncoming}
                onChangePlatform={(platform: PlatformStyle) =>
                  setState((prev) => ({ ...prev, platform }))
                }
                onToggleDarkMode={() =>
                  setState((prev) => ({ ...prev, darkMode: !prev.darkMode }))
                }
                onResetDemo={() => {
                  disconnectAllLiveLinks();
                  setHardwareError('');
                  setState(getInitialProtoLinkState());
                }}
                onOpenMobileCodeSheet={() => setMobileCodeOpen(true)}
              />
            </div>
          </div>
        </div>

        {/* Right Column: React Native Expo Code Studio */}
        <div
          ref={codeRef}
          className={`${
            isNative
              ? 'hidden'
              : studioView === 'code'
                ? 'hidden md:flex'
                : 'hidden xl:flex'
          } flex-col gap-5 min-w-0`}
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900 text-balance">
                ProtoLink RN · 单片机通讯协议调试软件
              </h1>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                支持蓝牙 BLE、MQTT（含直连 WS Broker）与 TCP 三通道调试，内置 LED 开关、PWM 调光/调速、RGB 彩灯、方向键松手停止、多挡位模式、定时轮询与自定义接收协议解析；右侧同步完整 React Native + HeroUI Native 原生工程源码。
              </p>
            </div>
            <div className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
              BLE · MQTT · TCP · HeroUI Native
            </div>
          </div>

          <CodeExplorerPanel files={rnFiles} onExportBundle={handleExportBundle} />
        </div>
      </div>

      {/* Mobile Source Code Sheet */}
      <Popup
        visible={mobileCodeOpen}
        position="bottom"
        onMaskClick={() => setMobileCodeOpen(false)}
        bodyStyle={{ padding: 0, background: 'transparent' }}
      >
        <div className="h-[88dvh] max-h-[88dvh] bg-white dark:bg-slate-900 rounded-t-3xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              React Native (Expo) 源码
            </span>
            <button
              type="button"
              onClick={() => setMobileCodeOpen(false)}
              aria-label="关闭源码窗口"
              className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3">
            <CodeExplorerPanel
              files={rnFiles}
              onExportBundle={handleExportBundle}
            />
          </div>
        </div>
      </Popup>

      {/* BLE 设备选择面板（替代 Android 原生选择框） */}
      <Popup
        visible={bleScanOpen}
        position="bottom"
        onMaskClick={closeBleScan}
        bodyStyle={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '72dvh',
          overflow: 'hidden',
        }}
      >
        <div className="flex flex-col max-h-[72dvh]">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                选择蓝牙设备
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {bleScanning
                  ? '正在搜索附近设备…'
                  : `已发现 ${bleDevices.length} 个设备`}
              </span>
            </div>
            <button
              type="button"
              onClick={closeBleScan}
              aria-label="关闭设备选择"
              className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto">
            <List>
              {bleDevices.map((device) => (
                <List.Item
                  key={device.deviceId}
                  clickable
                  onClick={() => void handlePickBleDevice(device)}
                  description={`${device.deviceId}${
                    typeof device.rssi === 'number' ? ` · ${device.rssi} dBm` : ''
                  }`}
                  extra={blePicking ? '连接中' : '连接'}
                >
                  {device.name || '未命名设备'}
                </List.Item>
              ))}
              {bleDevices.length === 0 && (
                <List.Item description="请确认模块已上电并处于广播状态">
                  尚未发现设备
                </List.Item>
              )}
            </List>
          </div>
        </div>
      </Popup>

      <GuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
