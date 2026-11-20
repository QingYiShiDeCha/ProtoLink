import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Button, Card, Input, Switch } from '@heroui/react';
import {
  Bluetooth,
  Code2,
  Globe,
  Moon,
  Network,
  PlugZap,
  RotateCcw,
  Sun,
  Unplug,
} from 'lucide-react';
import type {
  BleConfig,
  ConnectionMode,
  ConnectionStatus,
  MqttConfig,
  PlatformStyle,
  TcpConfig,
  TransportType,
} from '../../types/app';

interface ConnectScreenProps {
  activeTransport: TransportType;
  connectionStatus: ConnectionStatus;
  connectionMode: ConnectionMode;
  ble: BleConfig;
  mqtt: MqttConfig;
  tcp: TcpConfig;
  platform: PlatformStyle;
  darkMode: boolean;
  hardwareError: string;
  onChangeTransport: (transport: TransportType) => void;
  onToggleConnect: () => void;
  onScanWebBluetooth: () => void;
  onConnectLiveMqtt: () => void;
  onUpdateBle: (patch: Partial<BleConfig>) => void;
  onUpdateMqtt: (patch: Partial<MqttConfig>) => void;
  onUpdateTcp: (patch: Partial<TcpConfig>) => void;
  onChangePlatform: (platform: PlatformStyle) => void;
  onToggleDarkMode: () => void;
  onResetDemo: () => void;
  onOpenMobileCodeSheet?: () => void;
}

const BLE_PRESETS: Array<{
  label: string;
  deviceName: string;
  serviceUuid: string;
  writeUuid: string;
  notifyUuid: string;
}> = [
  {
    label: 'ESP32-S3 (FFE0)',
    deviceName: 'ESP32-S3-Node',
    serviceUuid: '0000FFE0-0000-1000-8000-00805F9B34FB',
    writeUuid: '0000FFE1-0000-1000-8000-00805F9B34FB',
    notifyUuid: '0000FFE2-0000-1000-8000-00805F9B34FB',
  },
  {
    label: 'Nordic UART (NUS)',
    deviceName: 'nRF52840-DK',
    serviceUuid: '6E400001-B5A3-F393-E0A9-E50E24DCCA9E',
    writeUuid: '6E400002-B5A3-F393-E0A9-E50E24DCCA9E',
    notifyUuid: '6E400003-B5A3-F393-E0A9-E50E24DCCA9E',
  },
  {
    label: 'STM32-HC08 串口透传',
    deviceName: 'HC-08-UART',
    serviceUuid: '0000FFF0-0000-1000-8000-00805F9B34FB',
    writeUuid: '0000FFF1-0000-1000-8000-00805F9B34FB',
    notifyUuid: '0000FFF2-0000-1000-8000-00805F9B34FB',
  },
];

export function ConnectScreen({
  activeTransport,
  connectionStatus,
  connectionMode,
  ble,
  mqtt,
  tcp,
  platform,
  darkMode,
  hardwareError,
  onChangeTransport,
  onToggleConnect,
  onScanWebBluetooth,
  onConnectLiveMqtt,
  onUpdateBle,
  onUpdateMqtt,
  onUpdateTcp,
  onChangePlatform,
  onToggleDarkMode,
  onResetDemo,
  onOpenMobileCodeSheet,
}: ConnectScreenProps) {
  const [showPresetList, setShowPresetList] = useState(false);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  const statusText =
    connectionStatus === 'connected'
      ? connectionMode === 'live'
        ? activeTransport === 'mqtt'
          ? '已连接真实 MQTT Broker (WS)'
          : activeTransport === 'ble'
          ? '已连接真机 WebBLE 设备'
          : '已连接 WebSocket TCP 桥接'
        : '已连接（内置单片机仿真）'
      : connectionStatus === 'connecting'
      ? '正在建立链路...'
      : '未连接';

  return (
    <div className="flex flex-col gap-4 px-4 pt-3 pb-6">
      {/* Transport Segmented Switcher */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800">
        {(
          [
            { id: 'ble', label: '蓝牙 BLE', Icon: Bluetooth },
            { id: 'mqtt', label: 'MQTT', Icon: Globe },
            { id: 'tcp', label: 'TCP', Icon: Network },
          ] as const
        ).map(({ id, label, Icon }) => {
          const active = activeTransport === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChangeTransport(id)}
              className={`min-h-[40px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                active
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-teal-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Connection Status & Primary CTA Card */}
      <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">当前协议通道</p>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
              {activeTransport === 'ble'
                ? `BLE · ${ble.deviceName}`
                : activeTransport === 'mqtt'
                ? `MQTT · ${mqtt.pubTopic}`
                : `TCP · ${tcp.host}:${tcp.port}`}
            </p>
            <p
              className={`text-xs font-medium mt-1 ${
                isConnected
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {statusText}
            </p>
          </div>
          <Button
            variant={isConnected ? 'danger-soft' : 'primary'}
            size="sm"
            onPress={onToggleConnect}
            isDisabled={isConnecting}
            className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 ${
              isConnected
                ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300 border border-rose-200/70 dark:border-rose-500/25'
                : ''
            }`}
          >
            {isConnected ? (
              <>
                <Unplug className="w-3.5 h-3.5" />
                <span>断开</span>
              </>
            ) : (
              <>
                <PlugZap className="w-3.5 h-3.5" />
                <span>{isConnecting ? '连接中' : '仿真连接'}</span>
              </>
            )}
          </Button>
        </div>

        {hardwareError && (
          <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 rounded-xl px-3 py-2">
            {hardwareError}
          </p>
        )}

        {activeTransport === 'ble' && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onPress={onScanWebBluetooth}
              className="flex-1 min-h-[40px] rounded-xl text-xs font-medium"
            >
              <Bluetooth className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>
                真机蓝牙扫描 ({Capacitor.isNativePlatform() ? '原生 BLE' : 'WebBLE'})
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setShowPresetList((v) => !v)}
              className="min-h-[40px] px-3 rounded-xl text-xs font-medium"
            >
              <span>{showPresetList ? '收起预设' : '芯片预设'}</span>
            </Button>
          </div>
        )}

        {activeTransport === 'mqtt' && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onPress={onConnectLiveMqtt}
              isDisabled={isConnecting}
              className="flex-1 min-h-[40px] rounded-xl text-xs font-medium"
            >
              <Globe className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>直连真实 MQTT Broker (WS/WSS)</span>
            </Button>
          </div>
        )}

        {activeTransport === 'ble' && showPresetList && (
          <div className="flex flex-col gap-1.5 pt-1">
            {BLE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onUpdateBle({
                    deviceName: preset.deviceName,
                    serviceUuid: preset.serviceUuid,
                    writeUuid: preset.writeUuid,
                    notifyUuid: preset.notifyUuid,
                  });
                  setShowPresetList(false);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl text-left border border-slate-200 dark:border-slate-800 hover:border-teal-500 transition-colors flex items-center justify-between"
              >
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {preset.label}
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {preset.deviceName}
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Channel Configuration Form */}
      {activeTransport === 'ble' && (
        <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              蓝牙 GATT 参数配置
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              MTU {ble.mtu} · {ble.rssi} dBm
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">目标设备名称</span>
              <Input
                value={ble.deviceName}
                onChange={(e) => onUpdateBle({ deviceName: e.target.value })}
                aria-label="目标设备名称"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Service UUID</span>
              <Input
                value={ble.serviceUuid}
                onChange={(e) => onUpdateBle({ serviceUuid: e.target.value })}
                aria-label="Service UUID"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-[11px] font-mono text-slate-900 dark:text-slate-100"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Write UUID</span>
                <Input
                  value={ble.writeUuid}
                  onChange={(e) => onUpdateBle({ writeUuid: e.target.value })}
                  aria-label="Write UUID"
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 text-[11px] font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Notify UUID</span>
                <Input
                  value={ble.notifyUuid}
                  onChange={(e) => onUpdateBle({ notifyUuid: e.target.value })}
                  aria-label="Notify UUID"
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 text-[11px] font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
          </div>
        </Card>
      )}

      {activeTransport === 'mqtt' && (
        <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              MQTT Broker 与主题配置
            </h2>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              QoS {mqtt.qos}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Broker 地址（浏览器直连需 wss:// 或 ws://）
              </span>
              <Input
                value={mqtt.brokerUrl}
                onChange={(e) => onUpdateMqtt({ brokerUrl: e.target.value })}
                aria-label="Broker 地址"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">Client ID</span>
                <Input
                  value={mqtt.clientId}
                  onChange={(e) => onUpdateMqtt({ clientId: e.target.value })}
                  aria-label="Client ID"
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">QoS 等级</span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 min-h-[42px]">
                  {([0, 1, 2] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onUpdateMqtt({ qos: q })}
                      className={`rounded-lg text-xs font-mono font-semibold ${
                        mqtt.qos === q
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">用户名（可选）</span>
                <Input
                  value={mqtt.username}
                  onChange={(e) => onUpdateMqtt({ username: e.target.value })}
                  aria-label="用户名"
                  className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">密码（可选）</span>
                <Input
                  type="password"
                  value={mqtt.password}
                  onChange={(e) => onUpdateMqtt({ password: e.target.value })}
                  aria-label="密码"
                  className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">默认发布主题 (Publish)</span>
              <Input
                value={mqtt.pubTopic}
                onChange={(e) => onUpdateMqtt({ pubTopic: e.target.value })}
                aria-label="默认发布主题"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">订阅接收主题 (Subscribe)</span>
              <Input
                value={mqtt.subTopic}
                onChange={(e) => onUpdateMqtt({ subTopic: e.target.value })}
                aria-label="订阅接收主题"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
        </Card>
      )}

      {activeTransport === 'tcp' && (
        <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
              TCP Socket 配置
            </h2>
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
              {(['client', 'server'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onUpdateTcp({ mode: m })}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap ${
                    tcp.mode === m
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {m === 'client' ? 'Client' : 'Server'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_100px] gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">单片机 IP / 主机地址</span>
              <Input
                value={tcp.host}
                onChange={(e) => onUpdateTcp({ host: e.target.value })}
                aria-label="目标 IP"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">端口</span>
              <Input
                type="number"
                value={String(tcp.port)}
                onChange={(e) =>
                  onUpdateTcp({ port: Math.max(1, Math.min(65535, Number(e.target.value) || 8080)) })
                }
                aria-label="端口"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono tabular-nums text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              WebSocket 桥接地址（可选，用于浏览器转发至局域网 TCP）
            </span>
            <Input
              value={tcp.wsBridgeUrl}
              onChange={(e) => onUpdateTcp({ wsBridgeUrl: e.target.value })}
              placeholder="例如 ws://192.168.1.50:8081"
              aria-label="WebSocket 桥接地址"
              className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
            />
          </label>
        </Card>
      )}

      {/* Appearance & Reset Card */}
      <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 p-0 shadow-none overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {darkMode ? (
              <Moon className="w-4 h-4 text-teal-500" />
            ) : (
              <Sun className="w-4 h-4 text-slate-600" />
            )}
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              深色调试界面
            </span>
          </div>
          <Switch isSelected={darkMode} onChange={onToggleDarkMode} aria-label="切换深色调试界面">
            <Switch.Content aria-label="切换深色调试界面">
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>

        <div className="p-4 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
            系统导航风格
          </span>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <Button
              size="sm"
              variant={platform === 'ios' ? 'secondary' : 'ghost'}
              onPress={() => onChangePlatform('ios')}
              className={`min-h-[32px] px-2.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                platform === 'ios'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : ''
              }`}
            >
              iOS
            </Button>
            <Button
              size="sm"
              variant={platform === 'android' ? 'secondary' : 'ghost'}
              onPress={() => onChangePlatform('android')}
              className={`min-h-[32px] px-2.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                platform === 'android'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : ''
              }`}
            >
              Android
            </Button>
          </div>
        </div>
      </Card>

      {onOpenMobileCodeSheet && (
        <Button
          variant="primary"
          fullWidth
          onPress={onOpenMobileCodeSheet}
          className="md:hidden min-h-[48px] rounded-2xl text-sm font-semibold"
        >
          <Code2 className="w-4 h-4" />
          <span>查看 React Native (Expo) 源码</span>
        </Button>
      )}

      <Button
        variant="danger-soft"
        fullWidth
        onPress={onResetDemo}
        className="min-h-[48px] rounded-2xl text-sm font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25 border border-rose-200/70 dark:border-rose-500/25"
      >
        <RotateCcw className="w-4 h-4" />
        <span>恢复默认工程配置</span>
      </Button>
    </div>
  );
}
