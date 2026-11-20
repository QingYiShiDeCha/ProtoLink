import type { RNCodeFile } from '../types/app';

export function buildExpoBundleFiles(appName: string = 'ProtoLink'): RNCodeFile[] {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return [
    {
      path: 'App.tsx',
      language: 'tsx',
      summary: 'React Native 主入口：配置 HeroUINativeProvider、手势容器与 4 个调试标签页导航',
      content: `import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeroUINativeProvider } from 'heroui-native';
import { Ionicons } from '@expo/vector-icons';

import { ProtoLinkProvider, useProtoLink } from './src/storage/useProtoLinkStore';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { ControlsScreen } from './src/screens/ControlsScreen';
import { ConsoleScreen } from './src/screens/ConsoleScreen';
import { ProtocolScreen } from './src/screens/ProtocolScreen';

export type RootTabParamList = {
  Connect: undefined;
  Controls: undefined;
  Console: undefined;
  Protocol: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function RootNavigator() {
  const { darkMode } = useProtoLink();

  return (
    <NavigationContainer>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <Tab.Navigator
        initialRouteName="Controls"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#0D9488',
          tabBarInactiveTintColor: darkMode ? '#94A3B8' : '#64748B',
          tabBarStyle: {
            backgroundColor: darkMode ? '#0F172A' : '#FFFFFF',
            borderTopColor: darkMode ? '#1E293B' : '#E2E8F0',
            height: 62,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
          tabBarIcon: ({ focused, color, size }) => {
            const iconMap: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
              Connect: focused ? 'bluetooth' : 'bluetooth-outline',
              Controls: focused ? 'options' : 'options-outline',
              Console: focused ? 'terminal' : 'terminal-outline',
              Protocol: focused ? 'code-slash' : 'code-slash-outline',
            };
            return <Ionicons name={iconMap[route.name]} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Connect" component={ConnectScreen} options={{ title: '连接' }} />
        <Tab.Screen name="Controls" component={ControlsScreen} options={{ title: '控制' }} />
        <Tab.Screen name="Console" component={ConsoleScreen} options={{ title: '报文' }} />
        <Tab.Screen name="Protocol" component={ProtocolScreen} options={{ title: '协议' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HeroUINativeProvider>
          <ProtoLinkProvider>
            <RootNavigator />
          </ProtoLinkProvider>
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
`,
    },
    {
      path: 'src/services/transportManager.ts',
      language: 'ts',
      summary: '原生多通道通讯封装：BLE 扫描连接 (ble-plx)、MQTT 收发与 TCP Socket 连接',
      content: `import { BleManager, Device } from 'react-native-ble-plx';
import mqtt, { MqttClient } from 'mqtt';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import { BleConfig, MqttConfig, TcpConfig, TransportType } from '../types';

export type OnPacketCallback = (bytes: Uint8Array, source: string) => void;

class NativeTransportManager {
  private bleManager = new BleManager();
  private bleDevice: Device | null = null;
  private mqttClient: MqttClient | null = null;
  private tcpClient: ReturnType<typeof TcpSocket.createConnection> | null = null;

  scanBleDevices(onFound: (device: { id: string; name: string; rssi: number }) => void) {
    this.bleManager.startDeviceScan(null, null, (err, device) => {
      if (err || !device) return;
      if (device.name) {
        onFound({ id: device.id, name: device.name, rssi: device.rssi ?? -60 });
      }
    });
    setTimeout(() => this.bleManager.stopDeviceScan(), 6000);
  }

  async connectBle(cfg: BleConfig, onPacket: OnPacketCallback) {
    const device = await this.bleManager.connectToDevice(cfg.deviceId);
    await device.discoverAllServicesAndCharacteristics();
    this.bleDevice = device;

    device.monitorCharacteristicForService(
      cfg.serviceUuid,
      cfg.notifyUuid,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        const buf = Buffer.from(characteristic.value, 'base64');
        onPacket(new Uint8Array(buf), \`BLE:\${cfg.deviceName}\`);
      }
    );
  }

  connectMqtt(cfg: MqttConfig, onPacket: OnPacketCallback) {
    this.mqttClient?.end(true);
    const client = mqtt.connect(cfg.brokerUrl, {
      clientId: cfg.clientId,
      username: cfg.username || undefined,
    });
    client.on('connect', () => {
      client.subscribe(cfg.subTopic, { qos: cfg.qos });
    });
    client.on('message', (topic, payload) => {
      onPacket(new Uint8Array(payload), \`MQTT:\${topic}\`);
    });
    this.mqttClient = client;
  }

  connectTcp(cfg: TcpConfig, onPacket: OnPacketCallback) {
    this.tcpClient?.destroy();
    const socket = TcpSocket.createConnection({ host: cfg.host, port: cfg.port }, () => {});
    socket.on('data', (chunk) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      onPacket(new Uint8Array(buf), \`TCP:\${cfg.host}:\${cfg.port}\`);
    });
    this.tcpClient = socket;
  }

  async sendBytes(
    transport: TransportType,
    bytes: number[],
    bleCfg: BleConfig,
    mqttTopic: string
  ) {
    const buf = Buffer.from(bytes);
    if (transport === 'ble' && this.bleDevice) {
      await this.bleDevice.writeCharacteristicWithResponseForService(
        bleCfg.serviceUuid,
        bleCfg.writeUuid,
        buf.toString('base64')
      );
    } else if (transport === 'mqtt' && this.mqttClient?.connected) {
      this.mqttClient.publish(mqttTopic, buf);
    } else if (transport === 'tcp' && this.tcpClient) {
      this.tcpClient.write(buf);
    }
  }
}

export const transportManager = new NativeTransportManager();
`,
    },
    {
      path: 'src/screens/ConnectScreen.tsx',
      language: 'tsx',
      summary: '蓝牙 BLE 扫描与 UUID 配置 / MQTT Broker / TCP Socket 连接管理页面',
      content: `import React, { useState } from 'react';
import { SafeAreaView, View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Button, Card, Switch } from 'heroui-native';
import { useProtoLink } from '../storage/useProtoLinkStore';
import { transportManager } from '../services/transportManager';
import { TransportType } from '../types';

export function ConnectScreen() {
  const {
    activeTransport,
    setActiveTransport,
    connected,
    toggleConnect,
    ble,
    setBle,
    mqtt,
    tcp,
    darkMode,
    toggleDarkMode,
  } = useProtoLink();

  const [scanned, setScanned] = useState<Array<{ id: string; name: string; rssi: number }>>([]);

  const handleScan = () => {
    setScanned([]);
    transportManager.scanBleDevices((dev) => {
      setScanned((prev) => (prev.some((d) => d.id === dev.id) ? prev : [...prev, dev]));
    });
  };

  const bg = darkMode ? '#020617' : '#F8FAFC';
  const surface = darkMode ? '#0F172A' : '#FFFFFF';
  const textPrimary = darkMode ? '#F8FAFC' : '#0F172A';
  const textMuted = darkMode ? '#94A3B8' : '#64748B';
  const border = darkMode ? '#1E293B' : '#E2E8F0';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, { color: textPrimary }]}>通讯链路配置</Text>

        <View style={styles.segmentRow}>
          {(['ble', 'mqtt', 'tcp'] as TransportType[]).map((t) => (
            <Button
              key={t}
              variant={activeTransport === t ? 'primary' : 'outline'}
              size="sm"
              onPress={() => setActiveTransport(t)}
              className="flex-1 rounded-xl"
            >
              <Button.Label>{t.toUpperCase()}</Button.Label>
            </Button>
          ))}
        </View>

        <Card className="p-4 rounded-2xl border gap-3" style={{ backgroundColor: surface, borderColor: border }}>
          <Text style={{ color: textPrimary, fontWeight: '700', fontSize: 16 }}>
            {activeTransport === 'ble'
              ? \`BLE · \${ble.deviceName}\`
              : activeTransport === 'mqtt'
              ? \`MQTT · \${mqtt.pubTopic}\`
              : \`TCP · \${tcp.host}:\${tcp.port}\`}
          </Text>
          <View style={styles.segmentRow}>
            <Button variant={connected ? 'danger-soft' : 'primary'} onPress={toggleConnect} className="flex-1 rounded-xl">
              <Button.Label>{connected ? '断开链路' : '建立连接'}</Button.Label>
            </Button>
            {activeTransport === 'ble' && (
              <Button variant="outline" onPress={handleScan} className="flex-1 rounded-xl">
                <Button.Label>扫描附近蓝牙</Button.Label>
              </Button>
            )}
          </View>
        </Card>

        {activeTransport === 'ble' && scanned.length > 0 && (
          <Card className="p-3 rounded-2xl border gap-2" style={{ backgroundColor: surface, borderColor: border }}>
            {scanned.map((d) => (
              <TouchableOpacity
                key={d.id}
                onPress={() => setBle({ ...ble, deviceId: d.id, deviceName: d.name })}
                style={{ paddingVertical: 8 }}
              >
                <Text style={{ color: textPrimary, fontWeight: '600' }}>{d.name} ({d.rssi} dBm)</Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {activeTransport === 'ble' && (
          <Card className="p-4 rounded-2xl border gap-2" style={{ backgroundColor: surface, borderColor: border }}>
            <Text style={{ color: textMuted, fontSize: 12 }}>Service UUID</Text>
            <TextInput value={ble.serviceUuid} editable={false} style={[styles.input, { color: textPrimary, borderColor: border }]} />
            <Text style={{ color: textMuted, fontSize: 12 }}>Write / Notify UUID</Text>
            <TextInput value={ble.writeUuid} editable={false} style={[styles.input, { color: textPrimary, borderColor: border }]} />
          </Card>
        )}

        <Card className="p-4 rounded-2xl border flex-row items-center justify-between" style={{ backgroundColor: surface, borderColor: border }}>
          <Text style={{ color: textPrimary, fontWeight: '500' }}>深色调试外观</Text>
          <Switch isSelected={darkMode} onSelectedChange={toggleDarkMode} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, gap: 14 },
  title: { fontSize: 22, fontWeight: '700' },
  segmentRow: { flexDirection: 'row', gap: 8 },
  input: { height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 12 },
});
`,
    },
    {
      path: 'src/screens/ControlsScreen.tsx',
      language: 'tsx',
      summary: '硬件控制面板：含 LED、PWM、RGB 彩灯、方向按住/松手停、挡位模式、定时轮询与新增弹窗',
      content: `import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Modal, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { Button, Card, Switch } from 'heroui-native';
import { useProtoLink } from '../storage/useProtoLinkStore';
import { WidgetKind } from '../types';

const RGB_PRESETS = ['#FFF4E0', '#EF4444', '#10B981', '#3B82F6', '#000000'];

export function ControlsScreen() {
  const {
    widgets,
    pollingEnabled,
    togglePolling,
    triggerSwitch,
    triggerSlider,
    triggerRgb,
    triggerDpad,
    triggerMode,
    triggerButton,
    addWidget,
    darkMode,
    activeTransport,
  } = useProtoLink();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WidgetKind>('switch');
  const [onPayload, setOnPayload] = useState('AA 55 01 01');
  const [offPayload, setOffPayload] = useState('AA 55 01 00');

  const bg = darkMode ? '#020617' : '#F8FAFC';
  const surface = darkMode ? '#0F172A' : '#FFFFFF';
  const textPrimary = darkMode ? '#F8FAFC' : '#0F172A';
  const textMuted = darkMode ? '#94A3B8' : '#64748B';
  const border = darkMode ? '#1E293B' : '#E2E8F0';

  const handleAdd = () => {
    if (!name.trim()) return;
    addWidget({
      name: name.trim(),
      subtitle: \`自定义 \${kind} · \${onPayload}\`,
      kind,
      onPayload,
      offPayload,
      sliderTemplate: 'AA 55 02 {hex}',
      rgbTemplate: 'AA 55 05 {rh} {gh} {bh}',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      boolValue: false,
      numericValue: 50,
      rgbValue: '#0D9488',
    });
    setName('');
    setSheetVisible(false);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: textPrimary }]}>硬件交互面板 ({activeTransport.toUpperCase()})</Text>
          <Button variant="primary" size="sm" onPress={() => setSheetVisible(true)} className="rounded-xl">
            <Button.Label>添加控件</Button.Label>
          </Button>
        </View>

        <Card className="p-3.5 rounded-2xl border flex-row items-center justify-between" style={{ backgroundColor: surface, borderColor: border }}>
          <Text style={{ color: textPrimary, fontSize: 13, fontWeight: '600' }}>定时轮询传感器 (1s)</Text>
          <Switch isSelected={pollingEnabled} onSelectedChange={togglePolling} />
        </Card>

        {widgets.map((w) => (
          <Card key={w.id} className="p-4 rounded-2xl border gap-2" style={{ backgroundColor: surface, borderColor: border }}>
            <View style={styles.rowBetween}>
              <Text style={{ color: textPrimary, fontSize: 15, fontWeight: '600' }}>{w.name}</Text>
              {w.kind === 'switch' && (
                <Switch isSelected={w.boolValue} onSelectedChange={(v) => triggerSwitch(w.id, v)} />
              )}
              {w.kind === 'slider' && (
                <Text style={{ color: '#0D9488', fontWeight: '700', fontSize: 16 }}>
                  {w.numericValue}{w.unit}
                </Text>
              )}
            </View>

            {w.kind === 'slider' && (
              <Slider
                minimumValue={w.min}
                maximumValue={w.max}
                step={w.step}
                value={w.numericValue}
                minimumTrackTintColor="#0D9488"
                onSlidingComplete={(val) => triggerSlider(w.id, Math.round(val))}
              />
            )}

            {w.kind === 'rgb' && (
              <View style={styles.rowBetween}>
                {RGB_PRESETS.map((hex) => (
                  <TouchableOpacity
                    key={hex}
                    onPress={() => triggerRgb(w.id, hex)}
                    style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: hex, borderWidth: 1, borderColor: border }}
                  />
                ))}
              </View>
            )}

            {w.kind === 'dpad' && (
              <View style={styles.dpadRow}>
                {(['up', 'down', 'left', 'right'] as const).map((dir) => (
                  <TouchableOpacity
                    key={dir}
                    onPressIn={() => triggerDpad(w.id, dir)}
                    onPressOut={() => triggerDpad(w.id, 'stop')}
                    style={[styles.dpadBtn, { borderColor: border }]}
                  >
                    <Text style={{ color: textPrimary, fontWeight: '600' }}>{dir.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {w.kind === 'mode' && w.modeOptions && (
              <View style={styles.dpadRow}>
                {w.modeOptions.map((opt, idx) => (
                  <Button key={opt.label} variant="outline" size="sm" onPress={() => triggerMode(w.id, idx)} className="flex-1 rounded-xl">
                    <Button.Label>{opt.label}</Button.Label>
                  </Button>
                ))}
              </View>
            )}

            {w.kind === 'button' && (
              <Button variant="primary" size="sm" onPress={() => triggerButton(w.id)} className="rounded-xl">
                <Button.Label>下发指令 ({w.onPayload})</Button.Label>
              </Button>
            )}

            <Text style={{ color: textMuted, fontSize: 12 }}>{w.subtitle}</Text>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={sheetVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, { backgroundColor: surface }]}>
            <Text style={{ color: textPrimary, fontSize: 17, fontWeight: '700' }}>添加硬件控件</Text>
            <View style={styles.dpadRow}>
              {(['switch', 'slider', 'rgb', 'dpad', 'button'] as WidgetKind[]).map((k) => (
                <Button key={k} variant={kind === k ? 'primary' : 'outline'} size="sm" onPress={() => setKind(k)}>
                  <Button.Label>{k}</Button.Label>
                </Button>
              ))}
            </View>
            <TextInput value={name} onChangeText={setName} placeholder="控件名称" placeholderTextColor={textMuted} style={[styles.input, { color: textPrimary, borderColor: border }]} />
            <TextInput value={onPayload} onChangeText={setOnPayload} placeholder="指令帧（如 AA 55 01 01）" placeholderTextColor={textMuted} style={[styles.input, { color: textPrimary, borderColor: border }]} />
            {kind === 'switch' && (
              <TextInput value={offPayload} onChangeText={setOffPayload} placeholder="关闭帧" placeholderTextColor={textMuted} style={[styles.input, { color: textPrimary, borderColor: border }]} />
            )}
            <View style={styles.dpadRow}>
              <Button variant="ghost" onPress={() => setSheetVisible(false)} className="flex-1"><Button.Label>取消</Button.Label></Button>
              <Button variant="primary" onPress={handleAdd} className="flex-[2] rounded-xl"><Button.Label>保存控件</Button.Label></Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dpadRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dpadBtn: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  input: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
`,
    },
    {
      path: 'src/screens/ConsoleScreen.tsx',
      language: 'tsx',
      summary: '报文收发日志监控与 HEX/ASCII/JSON 快速发送器',
      content: `import React, { useState } from 'react';
import { SafeAreaView, View, Text, FlatList, TextInput, StyleSheet } from 'react-native';
import { Button, Card } from 'heroui-native';
import { useProtoLink } from '../storage/useProtoLinkStore';

export function ConsoleScreen() {
  const { logs, sendRawHex, clearLogs, darkMode } = useProtoLink();
  const [draft, setDraft] = useState('AA 55 01 01');

  const bg = darkMode ? '#020617' : '#F8FAFC';
  const surface = darkMode ? '#0F172A' : '#FFFFFF';
  const textPrimary = darkMode ? '#F8FAFC' : '#0F172A';
  const textMuted = darkMode ? '#94A3B8' : '#64748B';
  const border = darkMode ? '#1E293B' : '#E2E8F0';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: textPrimary }]}>协议报文</Text>
          <Button variant="ghost" size="sm" onPress={clearLogs}>
            <Button.Label>清空</Button.Label>
          </Button>
        </View>

        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Card className="p-3 rounded-xl border gap-1" style={{ backgroundColor: surface, borderColor: border }}>
              <Text style={{ color: item.direction === 'tx' ? '#0D9488' : '#D97706', fontSize: 11, fontWeight: '600' }}>
                {item.direction.toUpperCase()} · {item.transport.toUpperCase()} · {item.timestamp}
              </Text>
              <Text style={{ color: textPrimary, fontFamily: 'monospace', fontSize: 12 }}>
                {item.rawHex}
              </Text>
              {item.matches.map((m) => (
                <Text key={m.ruleId} style={{ color: textMuted, fontSize: 12 }}>
                  解析：{m.ruleName} = {m.formattedValue}
                </Text>
              ))}
            </Card>
          )}
        />

        <View style={styles.senderRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="输入 HEX 帧..."
            placeholderTextColor={textMuted}
            style={[styles.input, { color: textPrimary, borderColor: border, backgroundColor: surface }]}
          />
          <Button variant="primary" onPress={() => sendRawHex(draft)} className="rounded-xl px-4">
            <Button.Label>发送</Button.Label>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 20, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  senderRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: 'monospace' },
});
`,
    },
    {
      path: 'src/screens/ProtocolScreen.tsx',
      language: 'tsx',
      summary: '自定义接收协议解析规则管理与新建规则弹窗',
      content: `import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Modal, TextInput, StyleSheet } from 'react-native';
import { Button, Card, Switch } from 'heroui-native';
import { useProtoLink } from '../storage/useProtoLinkStore';

export function ProtocolScreen() {
  const { rules, toggleRule, addRule, darkMode } = useProtoLink();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [name, setName] = useState('');
  const [headerHex, setHeaderHex] = useState('AA 55 04');
  const [unit, setUnit] = useState('V');

  const bg = darkMode ? '#020617' : '#F8FAFC';
  const surface = darkMode ? '#0F172A' : '#FFFFFF';
  const textPrimary = darkMode ? '#F8FAFC' : '#0F172A';
  const textMuted = darkMode ? '#94A3B8' : '#64748B';
  const border = darkMode ? '#1E293B' : '#E2E8F0';

  const handleSave = () => {
    if (!name.trim()) return;
    addRule({
      name: name.trim(),
      enabled: true,
      mode: 'hex',
      headerHex,
      dataOffset: 3,
      checksum: 'sum8',
      scale: 0.1,
      jsonKey: '',
      regexPattern: '',
      unit,
    });
    setName('');
    setSheetVisible(false);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.rowBetween}>
          <Text style={[styles.title, { color: textPrimary }]}>自定义接收协议</Text>
          <Button variant="primary" size="sm" onPress={() => setSheetVisible(true)} className="rounded-xl">
            <Button.Label>新建规则</Button.Label>
          </Button>
        </View>
        {rules.map((rule) => (
          <Card key={rule.id} className="p-4 rounded-2xl border gap-1.5" style={{ backgroundColor: surface, borderColor: border }}>
            <View style={styles.rowBetween}>
              <Text style={{ color: textPrimary, fontWeight: '600', fontSize: 15 }}>{rule.name}</Text>
              <Switch isSelected={rule.enabled} onSelectedChange={(v) => toggleRule(rule.id, v)} />
            </View>
            <Text style={{ color: textMuted, fontSize: 12, fontFamily: 'monospace' }}>
              {rule.mode.toUpperCase()} · {rule.mode === 'hex' ? \`帧头 \${rule.headerHex} · \${rule.checksum}\` : rule.jsonKey || rule.regexPattern}
            </Text>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={sheetVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.sheet, { backgroundColor: surface }]}>
            <Text style={{ color: textPrimary, fontSize: 17, fontWeight: '700' }}>新建接收协议规则</Text>
            <TextInput value={name} onChangeText={setName} placeholder="规则名称" placeholderTextColor={textMuted} style={[styles.input, { color: textPrimary, borderColor: border }]} />
            <TextInput value={headerHex} onChangeText={setHeaderHex} placeholder="帧头（如 AA 55 04）" placeholderTextColor={textMuted} style={[styles.input, { color: textPrimary, borderColor: border }]} />
            <TextInput value={unit} onChangeText={setUnit} placeholder="单位（如 ℃ / V）" placeholderTextColor={textMuted} style={[styles.input, { color: textPrimary, borderColor: border }]} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button variant="ghost" onPress={() => setSheetVisible(false)} className="flex-1"><Button.Label>取消</Button.Label></Button>
              <Button variant="primary" onPress={handleSave} className="flex-[2] rounded-xl"><Button.Label>保存</Button.Label></Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  input: { height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
});
`,
    },
    {
      path: 'src/utils/protocolParser.ts',
      language: 'ts',
      summary: '纯函数协议引擎：HEX/ASCII/JSON 解析、SUM8/CRC16-Modbus 校验与 RGB/PWM 模板展开',
      content: `import { ProtocolRule, ParsedProtocolMatch } from '../types';

export function computeSum8(bytes: number[]): number {
  return bytes.reduce((acc, b) => (acc + (b & 0xff)) & 0xff, 0);
}

export function evaluateProtocolRules(
  bytes: number[],
  rawText: string,
  rules: ProtocolRule[]
): ParsedProtocolMatch[] {
  const matches: ParsedProtocolMatch[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.mode === 'json') {
      try {
        const obj = JSON.parse(rawText);
        if (rule.jsonKey in obj) {
          matches.push({
            ruleId: rule.id,
            ruleName: rule.name,
            formattedValue: \`\${obj[rule.jsonKey]} \${rule.unit}\`.trim(),
          });
        }
      } catch {}
    } else if (rule.mode === 'hex' && bytes.length > rule.dataOffset) {
      const val = bytes[rule.dataOffset] * rule.scale;
      matches.push({
        ruleId: rule.id,
        ruleName: rule.name,
        formattedValue: \`\${val} \${rule.unit}\`.trim(),
      });
    }
  }
  return matches;
}
`,
    },
    {
      path: 'src/storage/useProtoLinkStore.tsx',
      language: 'tsx',
      summary: '全局调试状态、定时轮询与 BLE/MQTT/TCP 多通道收发联动',
      content: `import React, { createContext, useContext, useEffect, useState } from 'react';
import { transportManager } from '../services/transportManager';
import { BleConfig, ControlWidget, MqttConfig, PacketLogEntry, ProtocolRule, TcpConfig, TransportType } from '../types';

interface ProtoLinkContextValue {
  activeTransport: TransportType;
  connected: boolean;
  darkMode: boolean;
  pollingEnabled: boolean;
  ble: BleConfig;
  mqtt: MqttConfig;
  tcp: TcpConfig;
  widgets: ControlWidget[];
  rules: ProtocolRule[];
  logs: PacketLogEntry[];
  setActiveTransport: (t: TransportType) => void;
  setBle: (cfg: BleConfig) => void;
  toggleConnect: () => void;
  toggleDarkMode: () => void;
  togglePolling: (enabled: boolean) => void;
  triggerSwitch: (id: string, val: boolean) => void;
  triggerSlider: (id: string, val: number) => void;
  triggerRgb: (id: string, hex: string) => void;
  triggerDpad: (id: string, dir: 'up' | 'down' | 'left' | 'right' | 'stop') => void;
  triggerMode: (id: string, idx: number) => void;
  triggerButton: (id: string) => void;
  addWidget: (w: Omit<ControlWidget, 'id'>) => void;
  sendRawHex: (hex: string) => void;
  clearLogs: () => void;
  toggleRule: (id: string, enabled: boolean) => void;
  addRule: (r: Omit<ProtocolRule, 'id'>) => void;
}

const ProtoLinkContext = createContext<ProtoLinkContextValue | null>(null);

export function ProtoLinkProvider({ children }: { children: React.ReactNode }) {
  const [activeTransport, setActiveTransport] = useState<TransportType>('ble');
  const [connected, setConnected] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [logs, setLogs] = useState<PacketLogEntry[]>([]);
  const [ble, setBle] = useState<BleConfig>({
    deviceName: 'ESP32-S3-Node',
    deviceId: 'D4:8A:FC:91:2B:10',
    serviceUuid: '0000FFE0-0000-1000-8000-00805F9B34FB',
    writeUuid: '0000FFE1-0000-1000-8000-00805F9B34FB',
    notifyUuid: '0000FFE2-0000-1000-8000-00805F9B34FB',
  });
  const [widgets, setWidgets] = useState<ControlWidget[]>([
    {
      id: 'w-led',
      name: '板载 LED (GPIO2)',
      subtitle: 'HEX 开关 · ON: AA 55 01 01',
      kind: 'switch',
      onPayload: 'AA 55 01 01',
      offPayload: 'AA 55 01 00',
      sliderTemplate: '',
      min: 0,
      max: 1,
      step: 1,
      unit: '',
      boolValue: false,
      numericValue: 0,
    },
    {
      id: 'w-pwm',
      name: 'PWM 调光亮度',
      subtitle: '模板 AA 55 02 {hex}',
      kind: 'slider',
      onPayload: '',
      offPayload: '',
      sliderTemplate: 'AA 55 02 {hex}',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      boolValue: false,
      numericValue: 50,
    },
    {
      id: 'w-rgb',
      name: 'WS2812 RGB 彩灯',
      subtitle: '模板 AA 55 05 {rh} {gh} {bh}',
      kind: 'rgb',
      onPayload: '',
      offPayload: '',
      sliderTemplate: '',
      rgbTemplate: 'AA 55 05 {rh} {gh} {bh}',
      rgbValue: '#0D9488',
      min: 0,
      max: 255,
      step: 1,
      unit: '',
      boolValue: true,
      numericValue: 0,
    },
    {
      id: 'w-dpad',
      name: '小车 / 云台方向控制',
      subtitle: '按住发送运动 · 松开停止',
      kind: 'dpad',
      onPayload: '',
      offPayload: '',
      sliderTemplate: '',
      min: 0,
      max: 1,
      step: 1,
      unit: '',
      boolValue: false,
      numericValue: 0,
    },
    {
      id: 'w-mode',
      name: '系统工作模式',
      subtitle: '待机 / 自动 / 调试',
      kind: 'mode',
      onPayload: '',
      offPayload: '',
      sliderTemplate: '',
      modeOptions: [
        { label: '待机', payload: 'AA 55 07 00' },
        { label: '自动', payload: 'AA 55 07 01' },
        { label: '调试', payload: 'AA 55 07 02' },
      ],
      min: 0,
      max: 2,
      step: 1,
      unit: '',
      boolValue: false,
      numericValue: 0,
    },
  ]);

  const [rules, setRules] = useState<ProtocolRule[]>([
    {
      id: 'r1',
      name: 'HEX 温度上报帧',
      enabled: true,
      mode: 'hex',
      headerHex: 'AA 55 03',
      dataOffset: 3,
      checksum: 'sum8',
      scale: 0.1,
      jsonKey: '',
      regexPattern: '',
      unit: '℃',
    },
  ]);

  const mqtt: MqttConfig = {
    brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
    clientId: 'protolink_rn_01',
    username: 'mcu_dev',
    pubTopic: 'mcu/esp32/cmd',
    subTopic: 'mcu/esp32/stat/#',
    qos: 1,
  };
  const tcp: TcpConfig = { host: '192.168.4.1', port: 8080 };

  const sendRawHex = (hex: string) => {
    const bytes = hex.trim().split(/\\s+/).map((h) => parseInt(h, 16) || 0);
    transportManager.sendBytes(activeTransport, bytes, ble, mqtt.pubTopic).catch(() => {});
    setLogs((prev) => [
      { id: String(Date.now()), direction: 'tx', transport: activeTransport, rawHex: hex, timestamp: '刚刚', matches: [] },
      ...prev,
    ]);
  };

  useEffect(() => {
    if (!pollingEnabled) return;
    const t = setInterval(() => sendRawHex('AA 55 03 00'), 1000);
    return () => clearInterval(t);
  }, [pollingEnabled, activeTransport]);

  const toggleConnect = () => setConnected((c) => !c);

  const triggerSwitch = (id: string, val: boolean) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, boolValue: val } : w)));
    const target = widgets.find((w) => w.id === id);
    if (target) sendRawHex(val ? target.onPayload : target.offPayload);
  };

  const triggerSlider = (id: string, val: number) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, numericValue: val } : w)));
    const target = widgets.find((w) => w.id === id);
    if (target) {
      const hexByte = val.toString(16).toUpperCase().padStart(2, '0');
      sendRawHex(target.sliderTemplate.replace('{hex}', hexByte));
    }
  };

  const triggerRgb = (id: string, hex: string) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, rgbValue: hex } : w)));
    const clean = hex.replace('#', '');
    sendRawHex(\`AA 55 05 \${clean.slice(0, 2)} \${clean.slice(2, 4)} \${clean.slice(4, 6)}\`);
  };

  const triggerDpad = (_id: string, dir: 'up' | 'down' | 'left' | 'right' | 'stop') => {
    const map = { up: '01', down: '02', left: '03', right: '04', stop: '00' };
    sendRawHex(\`AA 55 06 \${map[dir]}\`);
  };

  const triggerMode = (id: string, idx: number) => {
    const target = widgets.find((w) => w.id === id);
    const opt = target?.modeOptions?.[idx];
    if (opt) sendRawHex(opt.payload);
  };

  const triggerButton = (id: string) => {
    const target = widgets.find((w) => w.id === id);
    if (target) sendRawHex(target.onPayload);
  };

  return (
    <ProtoLinkContext.Provider
      value={{
        activeTransport,
        connected,
        darkMode,
        pollingEnabled,
        ble,
        mqtt,
        tcp,
        widgets,
        rules,
        logs,
        setActiveTransport,
        setBle,
        toggleConnect,
        toggleDarkMode: () => setDarkMode((d) => !d),
        togglePolling: setPollingEnabled,
        triggerSwitch,
        triggerSlider,
        triggerRgb,
        triggerDpad,
        triggerMode,
        triggerButton,
        addWidget: (w) => setWidgets((prev) => [{ ...w, id: String(Date.now()) }, ...prev]),
        sendRawHex,
        clearLogs: () => setLogs([]),
        toggleRule: (id, enabled) =>
          setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r))),
        addRule: (r) => setRules((prev) => [{ ...r, id: String(Date.now()) }, ...prev]),
      }}
    >
      {children}
    </ProtoLinkContext.Provider>
  );
}

export function useProtoLink() {
  const ctx = useContext(ProtoLinkContext);
  if (!ctx) throw new Error('useProtoLink must be used inside ProtoLinkProvider');
  return ctx;
}
`,
    },
    {
      path: 'src/types.ts',
      language: 'ts',
      summary: 'React Native 单片机协议调试助手 TypeScript 类型定义',
      content: `export type TransportType = 'ble' | 'mqtt' | 'tcp';
export type WidgetKind = 'switch' | 'slider' | 'rgb' | 'dpad' | 'mode' | 'button';

export interface BleConfig {
  deviceName: string;
  deviceId: string;
  serviceUuid: string;
  writeUuid: string;
  notifyUuid: string;
}

export interface MqttConfig {
  brokerUrl: string;
  clientId: string;
  username: string;
  pubTopic: string;
  subTopic: string;
  qos: 0 | 1 | 2;
}

export interface TcpConfig {
  host: string;
  port: number;
}

export interface ControlWidget {
  id: string;
  name: string;
  subtitle: string;
  kind: WidgetKind;
  onPayload: string;
  offPayload: string;
  sliderTemplate: string;
  rgbTemplate?: string;
  rgbValue?: string;
  modeOptions?: Array<{ label: string; payload: string }>;
  min: number;
  max: number;
  step: number;
  unit: string;
  boolValue: boolean;
  numericValue: number;
}

export interface ProtocolRule {
  id: string;
  name: string;
  enabled: boolean;
  mode: 'hex' | 'json' | 'ascii';
  headerHex: string;
  dataOffset: number;
  checksum: string;
  scale: number;
  jsonKey: string;
  regexPattern: string;
  unit: string;
}

export interface ParsedProtocolMatch {
  ruleId: string;
  ruleName: string;
  formattedValue: string;
}

export interface PacketLogEntry {
  id: string;
  direction: 'tx' | 'rx';
  transport: TransportType;
  rawHex: string;
  timestamp: string;
  matches: ParsedProtocolMatch[];
}
`,
    },
    {
      path: 'package.json',
      language: 'json',
      summary: 'Expo SDK 52 + HeroUI Native + BLE / MQTT / TCP 原生依赖清单',
      content: JSON.stringify(
        {
          name: slug,
          version: '1.0.0',
          main: 'expo/AppEntry.js',
          scripts: {
            start: 'expo start',
            android: 'expo run:android',
            ios: 'expo run:ios',
          },
          dependencies: {
            '@expo/vector-icons': '^14.0.4',
            '@react-native-async-storage/async-storage': '1.23.1',
            '@react-native-community/slider': '4.5.5',
            '@react-navigation/bottom-tabs': '^6.6.1',
            '@react-navigation/native': '^6.1.18',
            buffer: '^6.0.3',
            expo: '~52.0.0',
            'expo-status-bar': '~2.0.0',
            'heroui-native': 'latest',
            mqtt: '^5.10.1',
            react: '18.3.1',
            'react-native': '0.76.3',
            'react-native-ble-plx': '^3.4.0',
            'react-native-gesture-handler': '^2.28.0',
            'react-native-reanimated': '^4.1.1',
            'react-native-safe-area-context': '^5.6.0',
            'react-native-screens': '~4.4.0',
            'react-native-svg': '^15.12.1',
            'react-native-tcp-socket': '^6.2.0',
            'react-native-worklets': '^0.5.1',
            'tailwind-merge': '^3.4.0',
            'tailwind-variants': '^3.2.2',
          },
          devDependencies: {
            '@babel/core': '^7.25.2',
            '@types/react': '~18.3.12',
            typescript: '^5.3.3',
          },
          private: true,
        },
        null,
        2
      ),
    },
    {
      path: 'app.json',
      language: 'json',
      summary: 'Expo 原生权限配置（iOS/Android 蓝牙权限与本地网络配置）',
      content: JSON.stringify(
        {
          expo: {
            name: appName,
            slug,
            version: '1.0.0',
            orientation: 'portrait',
            userInterfaceStyle: 'automatic',
            ios: {
              supportsTablet: true,
              bundleIdentifier: `com.protolink.${slug.replace(/-/g, '')}`,
              infoPlist: {
                NSBluetoothAlwaysUsageDescription: '用于扫描和调试单片机 BLE 蓝牙外设',
                NSLocalNetworkUsageDescription: '用于通过局域网 TCP / MQTT 连接单片机硬件',
              },
            },
            android: {
              package: `com.protolink.${slug.replace(/-/g, '')}`,
              permissions: [
                'android.permission.BLUETOOTH',
                'android.permission.BLUETOOTH_ADMIN',
                'android.permission.BLUETOOTH_SCAN',
                'android.permission.BLUETOOTH_CONNECT',
                'android.permission.ACCESS_FINE_LOCATION',
                'android.permission.INTERNET',
              ],
            },
          },
        },
        null,
        2
      ),
    },
  ];
}
