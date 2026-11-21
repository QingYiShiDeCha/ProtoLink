import React, { useState } from "react";
import { Button, Card, Input } from "../ui";
import { Send, Trash2 } from "lucide-react";
import type {
  ChecksumType,
  PacketLogEntry,
  PayloadFormat,
  TransportType,
} from "../types/app";

interface ConsoleScreenProps {
  activeTransport: TransportType;
  logs: PacketLogEntry[];
  onSendRaw: (
    raw: string,
    format: PayloadFormat,
    checksum: ChecksumType,
  ) => { ok: true } | { ok: false; error: string };
  onClearLogs: () => void;
}

const DIRECTION_LABEL: Record<PacketLogEntry["direction"], string> = {
  tx: "发送 TX",
  rx: "接收 RX",
  sys: "链路",
};

export function ConsoleScreen({
  activeTransport,
  logs,
  onSendRaw,
  onClearLogs,
}: ConsoleScreenProps) {
  const [filter, setFilter] = useState<"all" | "tx" | "rx" | "matched">("all");
  const [viewMode, setViewMode] = useState<"auto" | "hex">("auto");
  const [inputFormat, setInputFormat] = useState<PayloadFormat>("hex");
  const [checksum, setChecksum] = useState<ChecksumType>("sum8");
  const [draft, setDraft] = useState("AA 55 01 01");
  const [sendError, setSendError] = useState("");

  const filteredLogs = logs.filter((item) => {
    if (filter === "tx") return item.direction === "tx";
    if (filter === "rx") return item.direction === "rx";
    if (filter === "matched") return item.matches.length > 0;
    return true;
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const res = onSendRaw(draft, inputFormat, checksum);
    if (!res.ok) {
      setSendError(res.error);
      return;
    }
    setSendError("");
  };

  return (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-4 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            收发报文监控
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            共 {logs.length} 条报文 · 通道 {activeTransport.toUpperCase()}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode((v) => (v === "auto" ? "hex" : "auto"))}
            className="min-h-[38px] px-2.5 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200"
          >
            {viewMode === "hex" ? "纯 HEX" : "双码对照"}
          </button>
          <Button
            variant="ghost"
            isIconOnly
            onPress={onClearLogs}
            aria-label="清空报文日志"
            className="is-muted min-w-[38px] min-h-[38px] rounded-xl"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800">
        {(
          [
            { id: "all", label: "全部" },
            { id: "tx", label: "TX" },
            { id: "rx", label: "RX" },
            { id: "matched", label: "已解析" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
              filter === tab.id
                ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-teal-400"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Packet Feed */}
      <div className="flex-1 flex flex-col gap-2">
        {filteredLogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-slate-500">
            暂无匹配报文，可通过下方输入框或「控制」面板下发指令
          </div>
        ) : (
          filteredLogs.map((item) => (
            <Card
              key={item.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 shadow-none flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                <span
                  className={
                    item.direction === "tx"
                      ? "font-semibold text-teal-600 dark:text-teal-400"
                      : item.direction === "rx"
                        ? "font-semibold text-amber-600 dark:text-amber-400"
                        : "font-semibold text-slate-500"
                  }
                >
                  {DIRECTION_LABEL[item.direction]} ·{" "}
                  {item.transport.toUpperCase()} · {item.endpointLabel}
                </span>
                <span>{item.timestamp}</span>
              </div>

              <p className="text-xs font-mono text-slate-900 dark:text-slate-100 break-all leading-relaxed">
                {viewMode === "hex" || item.format === "hex"
                  ? item.rawHex
                  : item.rawText}
              </p>

              {viewMode === "auto" && item.format === "hex" && (
                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">
                  字节数: {item.rawHex.split(" ").filter(Boolean).length} B
                </p>
              )}

              {viewMode === "auto" && item.format !== "hex" && (
                <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 break-all">
                  HEX: {item.rawHex}
                </p>
              )}

              {item.matches.length > 0 && (
                <div className="pt-1.5 mt-0.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
                  {item.matches.map((m) => (
                    <div
                      key={`${item.id}-${m.ruleId}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-600 dark:text-slate-300">
                        解析命中：{m.ruleName}
                      </span>
                      <span className="font-mono font-semibold tabular-nums text-teal-600 dark:text-teal-400">
                        {m.formattedValue} {m.checksumValid ? "" : "(校验异常)"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Quick Frame Sender */}
      <form
        onSubmit={handleSend}
        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(["hex", "ascii", "json"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setInputFormat(f);
                  setSendError("");
                  if (f === "hex") setDraft("AA 55 01 01");
                  else if (f === "json") setDraft('{"pwm":75}');
                  else setDraft("READ_TEMP\\r\\n");
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold uppercase ${
                  inputFormat === f
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
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
                className={`px-2 py-1 rounded-md text-[11px] font-mono whitespace-nowrap ${
                  checksum === c.id
                    ? "bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              inputFormat === "hex"
                ? "输入 HEX 如 AA 55 03 00"
                : "输入指令或 JSON"
            }
            aria-label="发送报文输入框"
            className="flex-1 min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="min-h-[42px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap"
          >
            <div className="flex items-center justify-center gap-1 py-2">
              <Send className="w-3.5 h-3.5" />
              <span>发送</span>
            </div>
          </Button>
        </div>

        {sendError && <p className="text-xs text-rose-600">{sendError}</p>}
      </form>
    </div>
  );
}
