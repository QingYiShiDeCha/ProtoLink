import React, { useEffect, useRef } from 'react';
import { Cable, FileCode, SlidersHorizontal, TerminalSquare } from 'lucide-react';
import { TabBar } from 'antd-mobile';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import type {
  BleConfig,
  ChecksumType,
  ControlWidget,
  DpadPayloads,
  MqttConfig,
  ParsedProtocolMatch,
  PayloadFormat,
  PlatformStyle,
  PollingConfig,
  ProtoLinkState,
  ProtocolRule,
  TabRoute,
  TcpConfig,
  TransportType,
} from '../types/app';
import { ConnectScreen } from '../pages/ConnectScreen';
import { ControlsScreen } from '../pages/ControlsScreen';
import { ConsoleScreen } from '../pages/ConsoleScreen';
import { ProtocolScreen } from '../pages/ProtocolScreen';

interface MobileAppShellProps {
  state: ProtoLinkState;
  hardwareError: string;
  onChangeTransport: (transport: TransportType) => void;
  onToggleConnect: () => void;
  onScanWebBluetooth: () => void;
  onConnectLiveMqtt: () => void;
  onUpdateBle: (patch: Partial<BleConfig>) => void;
  onUpdateMqtt: (patch: Partial<MqttConfig>) => void;
  onUpdateTcp: (patch: Partial<TcpConfig>) => void;
  onUpdatePolling: (patch: Partial<PollingConfig>) => void;
  onTriggerSwitch: (widgetId: string, nextValue: boolean) => void;
  onTriggerSlider: (widgetId: string, nextValue: number) => void;
  onTriggerRgb: (widgetId: string, nextHex: string) => void;
  onTriggerDpad: (widgetId: string, dir: keyof DpadPayloads) => void;
  onTriggerMode: (widgetId: string, modeIdx: number) => void;
  onTriggerButton: (widgetId: string) => void;
  onAddWidget: (widget: Omit<ControlWidget, 'id'>) => void;
  onEditWidget: (widgetId: string, widget: Omit<ControlWidget, 'id'>) => void;
  onDeleteWidget: (widgetId: string) => void;
  onSendRaw: (
    raw: string,
    format: PayloadFormat,
    checksum: ChecksumType
  ) => { ok: true } | { ok: false; error: string };
  onClearLogs: () => void;
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  onAddRule: (rule: Omit<ProtocolRule, 'id'>) => void;
  onEditRule: (ruleId: string, rule: Omit<ProtocolRule, 'id'>) => void;
  onDeleteRule: (ruleId: string) => void;
  onSimulateIncoming: (rawInput: string) => {
    ok: boolean;
    error?: string;
    matches: ParsedProtocolMatch[];
  };
  onChangePlatform: (platform: PlatformStyle) => void;
  onToggleDarkMode: () => void;
  onResetDemo: () => void;
  onOpenMobileCodeSheet?: () => void;
}

const TAB_ITEMS: Array<{
  id: TabRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'connect', label: '连接', icon: Cable },
  { id: 'controls', label: '控制', icon: SlidersHorizontal },
  { id: 'console', label: '报文', icon: TerminalSquare },
  { id: 'protocol', label: '协议', icon: FileCode },
];

const TAB_TITLES: Record<TabRoute, string> = {
  connect: '链路连接',
  controls: '硬件控制',
  console: '协议报文',
  protocol: '自定义协议',
};

export function MobileAppShell({
  state,
  hardwareError,
  onChangeTransport,
  onToggleConnect,
  onScanWebBluetooth,
  onConnectLiveMqtt,
  onUpdateBle,
  onUpdateMqtt,
  onUpdateTcp,
  onUpdatePolling,
  onTriggerSwitch,
  onTriggerSlider,
  onTriggerRgb,
  onTriggerDpad,
  onTriggerMode,
  onTriggerButton,
  onAddWidget,
  onEditWidget,
  onDeleteWidget,
  onSendRaw,
  onClearLogs,
  onToggleRule,
  onAddRule,
  onEditRule,
  onDeleteRule,
  onSimulateIncoming,
  onChangePlatform,
  onToggleDarkMode,
  onResetDemo,
  onOpenMobileCodeSheet,
}: MobileAppShellProps) {
  const mainRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // 当前 tab 由 URL 派生：/connect、/controls、/console、/protocol
  const activeTab = (location.pathname.split('/')[1] || 'controls') as TabRoute;

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  return (
    <div
      className={state.darkMode ? 'dark h-full' : 'h-full'}
      data-theme={state.darkMode ? 'dark' : 'light'}
    >
      <div className="relative flex flex-col h-[100dvh] md:h-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 select-none">
        {/* Realistic Mobile Status Bar inside Device Frame (md+) */}
        <div
          className="hidden md:flex h-7 shrink-0 px-5 items-center justify-between text-[11px] font-semibold tabular-nums bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-slate-100"
          aria-hidden="true"
        >
          <span>09:41</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] tracking-tight">
              {state.activeTransport.toUpperCase()}
            </span>
            <span className="inline-flex items-center">
              <span className="w-4 h-2.5 rounded-[3px] border border-current p-[1px] flex items-center">
                <span className="w-full h-full bg-current rounded-[1px]" />
              </span>
            </span>
          </div>
        </div>

        {/* Compact Mobile Top App Bar (48px) */}
        <header
          className={`min-h-12 shrink-0 px-4 safe-top flex items-center border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-30 ${
            state.platform === 'ios' ? 'justify-center' : 'justify-start'
          }`}
        >
          <span
            className={`font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate ${
              state.platform === 'ios' ? 'text-[16px]' : 'text-[18px]'
            }`}
          >
            {TAB_TITLES[activeTab]}
          </span>
        </header>

        {/* Scrollable Screen Viewport（由 react-router 驱动） */}
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-4 select-text">
          <Routes>
            <Route
              path="/connect"
              element={
                <ConnectScreen
                  activeTransport={state.activeTransport}
                  connectionStatus={state.connectionStatus}
                  connectionMode={state.connectionMode}
                  ble={state.ble}
                  mqtt={state.mqtt}
                  tcp={state.tcp}
                  platform={state.platform}
                  darkMode={state.darkMode}
                  hardwareError={hardwareError}
                  onChangeTransport={onChangeTransport}
                  onToggleConnect={onToggleConnect}
                  onScanWebBluetooth={onScanWebBluetooth}
                  onConnectLiveMqtt={onConnectLiveMqtt}
                  onUpdateBle={onUpdateBle}
                  onUpdateMqtt={onUpdateMqtt}
                  onUpdateTcp={onUpdateTcp}
                  onChangePlatform={onChangePlatform}
                  onToggleDarkMode={onToggleDarkMode}
                  onResetDemo={onResetDemo}
                  onOpenMobileCodeSheet={onOpenMobileCodeSheet}
                />
              }
            />

            <Route
              path="/controls"
              element={
                <ControlsScreen
                  activeTransport={state.activeTransport}
                  connectionStatus={state.connectionStatus}
                  widgets={state.widgets}
                  polling={state.polling}
                  rules={state.rules}
                  virtualMcu={state.virtualMcu}
                  onSwitchTransport={onChangeTransport}
                  onUpdatePolling={onUpdatePolling}
                  onTriggerSwitch={onTriggerSwitch}
                  onTriggerSlider={onTriggerSlider}
                  onTriggerRgb={onTriggerRgb}
                  onTriggerDpad={onTriggerDpad}
                  onTriggerMode={onTriggerMode}
                  onTriggerButton={onTriggerButton}
                  onAddWidget={onAddWidget}
                  onEditWidget={onEditWidget}
                  onDeleteWidget={onDeleteWidget}
                />
              }
            />

            <Route
              path="/console"
              element={
                <ConsoleScreen
                  activeTransport={state.activeTransport}
                  logs={state.logs}
                  onSendRaw={onSendRaw}
                  onClearLogs={onClearLogs}
                />
              }
            />

            <Route
              path="/protocol"
              element={
                <ProtocolScreen
                  rules={state.rules}
                  onToggleRule={onToggleRule}
                  onAddRule={onAddRule}
                  onEditRule={onEditRule}
                  onDeleteRule={onDeleteRule}
                  onSimulateIncoming={onSimulateIncoming}
                />
              }
            />

            <Route path="/" element={<Navigate to="/controls" replace />} />
            <Route path="*" element={<Navigate to="/controls" replace />} />
          </Routes>
        </main>

        {/* 底部导航：antd-mobile TabBar */}
        <div className="shrink-0 safe-bottom bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40">
          <TabBar
            activeKey={activeTab}
            onChange={(key) => navigate(`/${key}`)}
            safeArea={false}
          >
            {TAB_ITEMS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabBar.Item
                  key={tab.id}
                  title={tab.label}
                  icon={<Icon className="w-[20px] h-[20px]" />}
                />
              );
            })}
          </TabBar>
        </div>

        {/* iOS Home Indicator / Android Gesture Pill inside Device Frame (md+) */}
        <div
          className="hidden md:flex h-3.5 shrink-0 items-center justify-center bg-white/95 dark:bg-slate-900/95"
          aria-hidden="true"
        >
          <div
            className={`h-1 rounded-full bg-slate-900/20 dark:bg-slate-100/25 ${
              state.platform === 'ios' ? 'w-28' : 'w-20'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
