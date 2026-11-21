import React, { useState } from "react";
import { Button, Card, Input, Switch } from "../../ui";
import { Popup, Space } from "antd-mobile";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clock,
  Gauge,
  Lightbulb,
  Palette,
  Pencil,
  Plus,
  Send,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type {
  ChecksumType,
  ConnectionStatus,
  ControlWidget,
  DpadPayloads,
  ModeOption,
  PayloadFormat,
  PollingConfig,
  ProtocolRule,
  TransportType,
  VirtualMcuState,
  WidgetKind,
} from "../../types/app";
import { buildOutgoingPayload } from "../../utils/protocolEngine";

interface ControlsScreenProps {
  activeTransport: TransportType;
  connectionStatus: ConnectionStatus;
  widgets: ControlWidget[];
  polling: PollingConfig;
  rules: ProtocolRule[];
  virtualMcu: VirtualMcuState;
  onSwitchTransport: (transport: TransportType) => void;
  onUpdatePolling: (patch: Partial<PollingConfig>) => void;
  onTriggerSwitch: (widgetId: string, nextValue: boolean) => void;
  onTriggerSlider: (widgetId: string, nextValue: number) => void;
  onTriggerRgb: (widgetId: string, nextHex: string) => void;
  onTriggerDpad: (widgetId: string, dir: keyof DpadPayloads) => void;
  onTriggerMode: (widgetId: string, modeIdx: number) => void;
  onTriggerButton: (widgetId: string) => void;
  onAddWidget: (widget: Omit<ControlWidget, "id">) => void;
  onEditWidget: (widgetId: string, widget: Omit<ControlWidget, "id">) => void;
  onDeleteWidget: (widgetId: string) => void;
}

const TRANSPORT_LABELS: Record<TransportType, string> = {
  ble: "蓝牙 BLE",
  mqtt: "MQTT",
  tcp: "TCP",
};

const RGB_PRESETS = [
  { label: "暖白", hex: "#FFF4E0" },
  { label: "正红", hex: "#EF4444" },
  { label: "翠绿", hex: "#10B981" },
  { label: "冰蓝", hex: "#3B82F6" },
  { label: "关灯", hex: "#000000" },
];

export function ControlsScreen({
  activeTransport,
  connectionStatus,
  widgets,
  polling,
  rules,
  virtualMcu,
  onSwitchTransport,
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
}: ControlsScreenProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<WidgetKind>("switch");
  const [name, setName] = useState("");
  const [format, setFormat] = useState<PayloadFormat>("hex");
  const [checksum, setChecksum] = useState<ChecksumType>("sum8");
  const [onPayload, setOnPayload] = useState("AA 55 01 01");
  const [offPayload, setOffPayload] = useState("AA 55 01 00");
  const [sliderTemplate, setSliderTemplate] = useState("AA 55 02 {hex}");
  const [rgbTemplate, setRgbTemplate] = useState("AA 55 05 {rh} {gh} {bh}");
  const [dpadUp, setDpadUp] = useState("AA 55 06 01");
  const [dpadDown, setDpadDown] = useState("AA 55 06 02");
  const [dpadLeft, setDpadLeft] = useState("AA 55 06 03");
  const [dpadRight, setDpadRight] = useState("AA 55 06 04");
  const [dpadStop, setDpadStop] = useState("AA 55 06 00");
  const [modeSpec, setModeSpec] = useState(
    "待机=AA 55 07 00,自动=AA 55 07 01,调试=AA 55 07 02",
  );
  const [minVal, setMinVal] = useState("0");
  const [maxVal, setMaxVal] = useState("100");
  const [unit, setUnit] = useState("%");
  const [mqttTopic, setMqttTopic] = useState("mcu/esp32/cmd/custom");
  const [boundRuleId, setBoundRuleId] = useState(rules[0]?.id ?? "");
  const [formError, setFormError] = useState("");

  const handleOpenCreate = () => {
    setEditingId(null);
    setKind("switch");
    setName("");
    setFormat("hex");
    setChecksum("sum8");
    setOnPayload("AA 55 01 01");
    setOffPayload("AA 55 01 00");
    setSliderTemplate("AA 55 02 {hex}");
    setRgbTemplate("AA 55 05 {rh} {gh} {bh}");
    setMinVal("0");
    setMaxVal("100");
    setUnit("%");
    setMqttTopic("mcu/esp32/cmd/custom");
    setBoundRuleId(rules[0]?.id ?? "");
    setFormError("");
    setSheetOpen(true);
  };

  const handleOpenEdit = (w: ControlWidget) => {
    setEditingId(w.id);
    setKind(w.kind);
    setName(w.name);
    setFormat(w.format);
    setChecksum(w.checksum);
    setOnPayload(w.onPayload);
    setOffPayload(w.offPayload);
    setSliderTemplate(w.sliderTemplate || "AA 55 02 {hex}");
    setRgbTemplate(w.rgbTemplate || "AA 55 05 {rh} {gh} {bh}");
    if (w.dpadPayloads) {
      setDpadUp(w.dpadPayloads.up);
      setDpadDown(w.dpadPayloads.down);
      setDpadLeft(w.dpadPayloads.left);
      setDpadRight(w.dpadPayloads.right);
      setDpadStop(w.dpadPayloads.stop);
    }
    if (w.modeOptions) {
      setModeSpec(
        w.modeOptions.map((o) => `${o.label}=${o.payload}`).join(","),
      );
    }
    setMinVal(String(w.min));
    setMaxVal(String(w.max));
    setUnit(w.unit);
    setMqttTopic(w.mqttTopic || "");
    setBoundRuleId(w.boundRuleId || rules[0]?.id || "");
    setFormError("");
    setSheetOpen(true);
  };

  const parseModeOptions = (raw: string): ModeOption[] => {
    const items = raw
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [label, ...rest] = pair.split("=");
        return {
          label: (label || "").trim(),
          payload: rest.join("=").trim(),
        };
      })
      .filter((item) => item.label && item.payload);
    return items.length > 0
      ? items
      : [
          { label: "待机", payload: "AA 55 07 00" },
          { label: "运行", payload: "AA 55 07 01" },
        ];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("请输入控件名称");
      return;
    }

    const parsedMin = Number(minVal) || 0;
    const parsedMax = Math.max(parsedMin + 1, Number(maxVal) || 100);
    const existing = editingId
      ? widgets.find((w) => w.id === editingId)
      : undefined;
    const parsedModes = parseModeOptions(modeSpec);

    const payloadObj: Omit<ControlWidget, "id"> = {
      name: trimmed,
      subtitle:
        kind === "switch"
          ? `${format.toUpperCase()} 开关 · ON: ${onPayload} · OFF: ${offPayload}`
          : kind === "slider"
            ? `${format.toUpperCase()} 调节 · 模板 ${sliderTemplate}`
            : kind === "rgb"
              ? `${format.toUpperCase()} 彩灯 · 模板 ${rgbTemplate}`
              : kind === "dpad"
                ? `${format.toUpperCase()} 方向控制 · 松手发 ${dpadStop}`
                : kind === "mode"
                  ? `${format.toUpperCase()} 挡位 · ${parsedModes.map((m) => m.label).join(" / ")}`
                  : kind === "button"
                    ? `${format.toUpperCase()} 指令 · ${onPayload}`
                    : `绑定协议：${rules.find((r) => r.id === boundRuleId)?.name ?? "未绑定"}`,
      kind,
      format,
      checksum,
      onPayload: onPayload.trim(),
      offPayload: offPayload.trim(),
      sliderTemplate: sliderTemplate.trim(),
      min: parsedMin,
      max: parsedMax,
      step: kind === "slider" ? 5 : 1,
      unit: unit.trim(),
      boolValue: existing?.boolValue ?? false,
      numericValue:
        existing?.numericValue ??
        (kind === "slider" ? Math.round((parsedMin + parsedMax) / 2) : 0),
      rgbValue: existing?.rgbValue ?? "#0D9488",
      rgbTemplate: rgbTemplate.trim(),
      dpadPayloads: {
        up: dpadUp.trim(),
        down: dpadDown.trim(),
        left: dpadLeft.trim(),
        right: dpadRight.trim(),
        stop: dpadStop.trim(),
      },
      activeDirection: existing?.activeDirection ?? "",
      modeOptions: parsedModes,
      activeModeIndex: existing?.activeModeIndex ?? 0,
      mqttTopic: mqttTopic.trim() || undefined,
      boundRuleId: kind === "telemetry" ? boundRuleId : undefined,
      lastUpdatedText:
        existing?.lastUpdatedText ?? (kind === "telemetry" ? "--" : undefined),
    };

    if (editingId) {
      onEditWidget(editingId, payloadObj);
    } else {
      onAddWidget(payloadObj);
    }

    setName("");
    setEditingId(null);
    setFormError("");
    setSheetOpen(false);
  };

  return (
    <div className="flex flex-col gap-3.5 px-4 pt-3 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            硬件交互面板
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {connectionStatus === "connected" ? "链路就绪" : "未连接"} · LED{" "}
            {virtualMcu.ledOn ? "亮" : "灭"} · PWM {virtualMcu.pwmDuty}% ·{" "}
            {virtualMcu.workMode}
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onPress={handleOpenCreate}
          className=""
        >
          <div className="flex items-center justify-center gap-1 py-2">
            <Plus className="w-4 h-4" />
            <span>添加控件</span>
          </div>
        </Button>
      </div>

      {/* Quick Active Transport Selector */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800">
        {(["ble", "mqtt", "tcp"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSwitchTransport(t)}
            className={`min-h-[36px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTransport === t
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-teal-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
            }`}
          >
            {TRANSPORT_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Auto Polling Bar */}
      <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 shadow-none flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock
              className={`w-4 h-4 shrink-0 ${
                polling.enabled
                  ? "text-teal-600 dark:text-teal-400"
                  : "text-slate-400"
              }`}
            />
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              定时自动轮询 ({polling.payload})
            </p>
          </div>
          <Switch
            isSelected={polling.enabled}
            onChange={(checked) => onUpdatePolling({ enabled: checked })}
            aria-label="启停定时自动轮询"
          >
            <Switch.Content aria-label="启停定时自动轮询">
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums truncate">
            {polling.enabled
              ? `运行中 · 每 ${polling.intervalMs} ms`
              : "已停止 · 自动采集传感器"}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            {[500, 1000, 2000].map((ms) => (
              <button
                key={ms}
                type="button"
                onClick={() => onUpdatePolling({ intervalMs: ms })}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono tabular-nums whitespace-nowrap ${
                  polling.intervalMs === ms
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Interactive Hardware Widgets */}
      <div className="flex flex-col gap-3">
        {widgets.map((widget) => {
          const actionButtons = (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenEdit(widget)}
                aria-label={`编辑控件「${widget.name}」`}
                className="min-w-[34px] min-h-[34px] rounded-xl flex items-center justify-center text-slate-400 hover:text-teal-600 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteWidget(widget.id)}
                aria-label={`删除控件「${widget.name}」`}
                className="min-w-[34px] min-h-[34px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );

          if (widget.kind === "switch") {
            return (
              <Card
                key={widget.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                        widget.boolValue
                          ? "bg-amber-500/15 text-amber-500"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                      }`}
                    >
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {widget.name}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {widget.boolValue
                          ? `ON: ${widget.onPayload}`
                          : `OFF: ${widget.offPayload}`}{" "}
                        · {TRANSPORT_LABELS[activeTransport]}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      isSelected={widget.boolValue}
                      onChange={(checked) =>
                        onTriggerSwitch(widget.id, checked)
                      }
                      aria-label={`切换${widget.name}`}
                    >
                      <Switch.Content aria-label={`切换${widget.name}`}>
                        <Switch.Control>
                          <Switch.Thumb />
                        </Switch.Control>
                      </Switch.Content>
                    </Switch>
                    {actionButtons}
                  </div>
                </div>
              </Card>
            );
          }

          if (widget.kind === "slider") {
            const preview = buildOutgoingPayload(
              widget.sliderTemplate,
              widget.format,
              widget.checksum,
              widget.numericValue,
            );

            return (
              <Card
                key={widget.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                      <SlidersHorizontal className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {widget.name}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {preview.ok
                          ? `下发帧: ${preview.rawText.trim()}`
                          : widget.sliderTemplate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-lg font-display font-bold tabular-nums text-teal-600 dark:text-teal-400">
                      {widget.numericValue}
                      {widget.unit}
                    </span>
                    {actionButtons}
                  </div>
                </div>

                <input
                  type="range"
                  min={widget.min}
                  max={widget.max}
                  step={widget.step}
                  value={widget.numericValue}
                  aria-label={widget.name}
                  onChange={(e) =>
                    onTriggerSlider(widget.id, Number(e.target.value))
                  }
                  className="w-full h-2 accent-teal-600 cursor-pointer"
                />

                <div className="grid grid-cols-5 gap-1.5">
                  {[0, 25, 50, 75, 100].map((pct) => {
                    const targetVal = Math.round(
                      widget.min + ((widget.max - widget.min) * pct) / 100,
                    );
                    const active = widget.numericValue === targetVal;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => onTriggerSlider(widget.id, targetVal)}
                        className={`min-h-[34px] rounded-lg text-[11px] font-mono tabular-nums font-medium transition-colors ${
                          active
                            ? "bg-teal-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {targetVal}
                        {widget.unit}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          }

          if (widget.kind === "rgb") {
            const hexColor = widget.rgbValue || "#0D9488";
            const preview = buildOutgoingPayload(
              widget.rgbTemplate || "AA 55 05 {rh} {gh} {bh}",
              widget.format,
              widget.checksum,
              0,
              hexColor,
            );

            return (
              <Card
                key={widget.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0"
                      style={{ backgroundColor: hexColor }}
                    >
                      <Palette className="w-4 h-4 text-white mix-blend-difference" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {widget.name}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        {preview.ok
                          ? `下发帧: ${preview.rawText.trim()}`
                          : widget.rgbTemplate}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="color"
                      value={hexColor}
                      aria-label={`${widget.name}取色器`}
                      onChange={(e) =>
                        onTriggerRgb(widget.id, e.target.value.toUpperCase())
                      }
                      className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer"
                    />
                    {actionButtons}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {RGB_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => onTriggerRgb(widget.id, preset.hex)}
                      className={`min-h-[34px] rounded-lg text-[11px] font-medium border transition-colors ${
                        hexColor.toUpperCase() === preset.hex
                          ? "border-teal-600 bg-teal-600/10 text-teal-700 dark:text-teal-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </Card>
            );
          }

          if (widget.kind === "dpad") {
            const dp = widget.dpadPayloads || {
              up: "AA 55 06 01",
              down: "AA 55 06 02",
              left: "AA 55 06 03",
              right: "AA 55 06 04",
              stop: "AA 55 06 00",
            };
            const dirBtns: Array<{
              key: keyof DpadPayloads;
              label: string;
              Icon: React.ComponentType<{ className?: string }>;
              pos: string;
            }> = [
              {
                key: "up",
                label: "前",
                Icon: ArrowUp,
                pos: "col-start-2 row-start-1",
              },
              {
                key: "left",
                label: "左",
                Icon: ArrowLeft,
                pos: "col-start-1 row-start-2",
              },
              {
                key: "stop",
                label: "停",
                Icon: Square,
                pos: "col-start-2 row-start-2",
              },
              {
                key: "right",
                label: "右",
                Icon: ArrowRight,
                pos: "col-start-3 row-start-2",
              },
              {
                key: "down",
                label: "后",
                Icon: ArrowDown,
                pos: "col-start-2 row-start-3",
              },
            ];

            return (
              <Card
                key={widget.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {widget.name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      按住发送方向帧 · 松开自动下发 {dp.stop}
                    </p>
                  </div>
                  {actionButtons}
                </div>

                <div className="grid grid-cols-3 grid-rows-3 gap-1.5 max-w-[216px] mx-auto w-full">
                  {dirBtns.map(({ key, label, Icon, pos }) => {
                    const isStop = key === "stop";
                    const active = widget.activeDirection === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onPointerDown={() => {
                          if (!isStop) onTriggerDpad(widget.id, key);
                        }}
                        onPointerUp={() => {
                          onTriggerDpad(widget.id, "stop");
                        }}
                        onPointerCancel={() => {
                          if (!isStop) onTriggerDpad(widget.id, "stop");
                        }}
                        aria-label={`${widget.name}-${label}`}
                        className={`${pos} min-h-[44px] rounded-xl flex items-center justify-center gap-1 text-xs font-semibold transition-colors select-none ${
                          isStop
                            ? "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300"
                            : active
                              ? "bg-teal-600 text-white"
                              : "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          }

          if (widget.kind === "mode") {
            const options = widget.modeOptions || [
              { label: "待机", payload: "AA 55 07 00" },
              { label: "自动", payload: "AA 55 07 01" },
            ];
            return (
              <Card
                key={widget.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {widget.name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      当前：
                      {options[widget.activeModeIndex ?? 0]?.label ??
                        "--"} ·{" "}
                      {options[widget.activeModeIndex ?? 0]?.payload ?? ""}
                    </p>
                  </div>
                  {actionButtons}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {options.map((opt, idx) => {
                    const active = (widget.activeModeIndex ?? 0) === idx;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => onTriggerMode(widget.id, idx)}
                        className={`min-h-[40px] px-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? "bg-teal-600 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          }

          if (widget.kind === "button") {
            return (
              <Card
                key={widget.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {widget.name}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {widget.onPayload} · {widget.format.toUpperCase()}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="primary"
                      size="sm"
                      onPress={() => onTriggerButton(widget.id)}
                      className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap"
                    >
                      <div className="flex items-center justify-center gap-1 py-2">
                        <Send className="w-3.5 h-3.5" />
                        <span>下发指令</span>
                      </div>
                    </Button>
                    {actionButtons}
                  </div>
                </div>
              </Card>
            );
          }

          // telemetry readout widget
          const matchedRule = rules.find((r) => r.id === widget.boundRuleId);
          const liveText =
            matchedRule?.lastDecodedValue || widget.lastUpdatedText || "--";

          return (
            <Card
              key={widget.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {widget.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      绑定规则：{matchedRule?.name ?? "未绑定"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-lg font-display font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {liveText}
                  </span>
                  {actionButtons}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add / Edit Hardware Widget Bottom Sheet */}
      {sheetOpen && (
        <Popup
          visible
          position="bottom"
          onMaskClick={() => setSheetOpen(false)}
          bodyStyle={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: "92%",
            overflow: "hidden",
          }}
        >
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-slate-900 rounded-t-3xl p-4 pb-6 flex flex-col gap-3 max-h-[92%] overflow-y-auto shadow-2xl"
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-teal-600" />
                <span>{editingId ? "编辑硬件控件" : "添加自定义控制控件"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="关闭添加控件弹窗"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Kind Selector */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {(
                [
                  { id: "switch", label: "开关" },
                  { id: "slider", label: "PWM/滑块" },
                  { id: "rgb", label: "RGB彩灯" },
                  { id: "dpad", label: "方向键" },
                  { id: "mode", label: "挡位模式" },
                  { id: "button", label: "指令键" },
                  { id: "telemetry", label: "状态监控" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setKind(item.id)}
                  className={`min-h-[34px] rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                    kind === item.id
                      ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                控件名称
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：风扇继电器 / WS2812灯带 / 机械臂云台"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>

            {kind !== "telemetry" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    发送格式
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                    {(["hex", "ascii", "json"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f)}
                        className={`min-h-[32px] rounded-lg text-[11px] font-mono font-semibold uppercase ${
                          format === f
                            ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                            : "text-slate-500"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    自动追加校验
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                    {(
                      [
                        { id: "none", label: "无" },
                        { id: "sum8", label: "SUM8" },
                        { id: "crc16", label: "CRC16" },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setChecksum(c.id)}
                        className={`min-h-[32px] rounded-lg text-[11px] font-mono font-semibold ${
                          checksum === c.id
                            ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                            : "text-slate-500"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
            )}

            {kind === "switch" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    打开 (ON) 报文
                  </span>
                  <Input
                    value={onPayload}
                    onChange={(e) => setOnPayload(e.target.value)}
                    className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    关闭 (OFF) 报文
                  </span>
                  <Input
                    value={offPayload}
                    onChange={(e) => setOffPayload(e.target.value)}
                    className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>
            )}

            {kind === "slider" && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    模板（用 {"{val}"} 代表十进制，{"{hex}"} 代表单字节 HEX）
                  </span>
                  <Input
                    value={sliderTemplate}
                    onChange={(e) => setSliderTemplate(e.target.value)}
                    className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      最小值
                    </span>
                    <Input
                      type="number"
                      value={minVal}
                      onChange={(e) => setMinVal(e.target.value)}
                      className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      最大值
                    </span>
                    <Input
                      type="number"
                      value={maxVal}
                      onChange={(e) => setMaxVal(e.target.value)}
                      className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      单位
                    </span>
                    <Input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="%"
                      className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                    />
                  </label>
                </div>
              </>
            )}

            {kind === "rgb" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  RGB 模板（支持 {"{rh} {gh} {bh}"} 十六进制 或 {"{r},{g},{b}"}{" "}
                  十进制）
                </span>
                <Input
                  value={rgbTemplate}
                  onChange={(e) => setRgbTemplate(e.target.value)}
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                />
              </label>
            )}

            {kind === "dpad" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">前 (UP)</span>
                  <Input
                    value={dpadUp}
                    onChange={(e) => setDpadUp(e.target.value)}
                    className="min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-mono"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">后 (DOWN)</span>
                  <Input
                    value={dpadDown}
                    onChange={(e) => setDpadDown(e.target.value)}
                    className="min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-mono"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">左 (LEFT)</span>
                  <Input
                    value={dpadLeft}
                    onChange={(e) => setDpadLeft(e.target.value)}
                    className="min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-mono"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">右 (RIGHT)</span>
                  <Input
                    value={dpadRight}
                    onChange={(e) => setDpadRight(e.target.value)}
                    className="min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-mono"
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="text-xs text-slate-500">
                    松手自动停止帧 (STOP)
                  </span>
                  <Input
                    value={dpadStop}
                    onChange={(e) => setDpadStop(e.target.value)}
                    className="min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-mono"
                  />
                </label>
              </div>
            )}

            {kind === "mode" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  挡位定义（格式：名称=报文，用英文逗号分隔）
                </span>
                <Input
                  value={modeSpec}
                  onChange={(e) => setModeSpec(e.target.value)}
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                />
              </label>
            )}

            {kind === "button" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  下发指令内容
                </span>
                <Input
                  value={onPayload}
                  onChange={(e) => setOnPayload(e.target.value)}
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
            )}

            {kind === "telemetry" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  绑定自定义接收规则
                </span>
                <select
                  value={boundRuleId}
                  onChange={(e) => setBoundRuleId(e.target.value)}
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs text-slate-900 dark:text-slate-100"
                >
                  {rules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.mode.toUpperCase()})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind !== "telemetry" && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  MQTT 独立主题（可选，留空则使用连接页默认主题）
                </span>
                <Input
                  value={mqttTopic}
                  onChange={(e) => setMqttTopic(e.target.value)}
                  className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </label>
            )}

            {formError && <p className="text-xs text-rose-600">{formError}</p>}

            <div className="flex items-center gap-2.5 pt-1">
              <Button
                type="button"
                variant="outline"
                onPress={() => setSheetOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl text-sm font-medium"
              >
                取消
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="flex-[2] min-h-[44px] rounded-xl text-sm font-semibold"
              >
                {editingId ? "保存修改" : "添加到面板"}
              </Button>
            </div>
          </form>
        </Popup>
      )}
    </div>
  );
}
