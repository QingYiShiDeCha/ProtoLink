import React, { useEffect, useRef } from 'react';
import { Cable, FileCode, SlidersHorizontal, TerminalSquare } from 'lucide-react';
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
} from '../../types/app';
import { ConnectScreen } from './ConnectScreen';
import { ControlsScreen } from './ControlsScreen';
import { ConsoleScreen } from './ConsoleScreen';
import { ProtocolScreen } from './ProtocolScreen';

interface MobileAppShellProps {
  state: ProtoLinkState;
  activeTab: TabRoute;
  hardwareError: string;
  onChangeTab: (tab: TabRoute) => void;
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
  activeTab,
  hardwareError,
  onChangeTab,
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

        {/* Scrollable Screen Viewport */}
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-4 select-text">
          {activeTab === 'connect' && (
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
          )}

          {activeTab === 'controls' && (
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
          )}

          {activeTab === 'console' && (
            <ConsoleScreen
              activeTransport={state.activeTransport}
              logs={state.logs}
              onSendRaw={onSendRaw}
              onClearLogs={onClearLogs}
            />
          )}

          {activeTab === 'protocol' && (
            <ProtocolScreen
              rules={state.rules}
              onToggleRule={onToggleRule}
              onAddRule={onAddRule}
              onEditRule={onEditRule}
              onDeleteRule={onDeleteRule}
              onSimulateIncoming={onSimulateIncoming}
            />
          )}
        </main>

        {/* Anchored Native Bottom Tab Bar (64px) */}
        <nav
          aria-label="应用主导航"
          className="min-h-16 shrink-0 safe-bottom grid grid-cols-4 items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 z-40"
        >
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`min-h-[48px] h-full flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                  isActive
                    ? 'text-teal-600 dark:text-teal-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center transition-colors ${
                    state.platform === 'android'
                      ? `px-4 py-0.5 rounded-full ${
                          isActive ? 'bg-teal-600/15 dark:bg-teal-400/20' : ''
                        }`
                      : ''
                  }`}
                >
                  <Icon className="w-[20px] h-[20px]" />
                </span>
                <span className="text-[11px] font-medium tracking-tight leading-none whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>

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
