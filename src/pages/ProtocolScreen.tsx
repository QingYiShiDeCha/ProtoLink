import React, { useState } from 'react';
import { Button, Card, Input, Segmented, Switch } from '../ui';
import { Popup } from 'antd-mobile';
import { FileCode, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import type {
  ChecksumType,
  ParsedProtocolMatch,
  ProtocolParseMode,
  ProtocolRule,
} from '../types/app';

interface ProtocolScreenProps {
  rules: ProtocolRule[];
  onToggleRule: (ruleId: string, enabled: boolean) => void;
  onAddRule: (rule: Omit<ProtocolRule, 'id'>) => void;
  onEditRule: (ruleId: string, rule: Omit<ProtocolRule, 'id'>) => void;
  onDeleteRule: (ruleId: string) => void;
  onSimulateIncoming: (rawInput: string) => {
    ok: boolean;
    error?: string;
    matches: ParsedProtocolMatch[];
  };
}

export function ProtocolScreen({
  rules,
  onToggleRule,
  onAddRule,
  onEditRule,
  onDeleteRule,
  onSimulateIncoming,
}: ProtocolScreenProps) {
  const [testInput, setTestInput] = useState('AA 55 03 01 1A 1D');
  const [testResult, setTestResult] = useState<{
    error?: string;
    matches: ParsedProtocolMatch[];
    tested: boolean;
  }>({ matches: [], tested: false });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ProtocolParseMode>('hex');
  const [headerHex, setHeaderHex] = useState('AA 55 04');
  const [dataOffset, setDataOffset] = useState('3');
  const [byteLength, setByteLength] = useState<1 | 2>(1);
  const [endian, setEndian] = useState<'big' | 'little'>('big');
  const [checksum, setChecksum] = useState<ChecksumType>('sum8');
  const [scale, setScale] = useState('1');
  const [jsonKey, setJsonKey] = useState('voltage');
  const [regexPattern, setRegexPattern] = useState('SPD:(\\d+)');
  const [unit, setUnit] = useState('V');
  const [formError, setFormError] = useState('');

  const handleOpenCreate = () => {
    setEditingRuleId(null);
    setName('');
    setMode('hex');
    setHeaderHex('AA 55 04');
    setDataOffset('3');
    setByteLength(1);
    setEndian('big');
    setChecksum('sum8');
    setScale('1');
    setJsonKey('voltage');
    setRegexPattern('SPD:(\\d+)');
    setUnit('V');
    setFormError('');
    setSheetOpen(true);
  };

  const handleOpenEdit = (rule: ProtocolRule) => {
    setEditingRuleId(rule.id);
    setName(rule.name);
    setMode(rule.mode);
    setHeaderHex(rule.headerHex);
    setDataOffset(String(rule.dataOffset));
    setByteLength(rule.byteLength);
    setEndian(rule.endian);
    setChecksum(rule.checksum);
    setScale(String(rule.scale));
    setJsonKey(rule.jsonKey);
    setRegexPattern(rule.regexPattern);
    setUnit(rule.unit);
    setFormError('');
    setSheetOpen(true);
  };

  const handleRunTest = () => {
    const res = onSimulateIncoming(testInput);
    setTestResult({
      error: res.error,
      matches: res.matches,
      tested: true,
    });
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('请输入解析规则名称');
      return;
    }

    const existing = editingRuleId
      ? rules.find((r) => r.id === editingRuleId)
      : undefined;

    const payload: Omit<ProtocolRule, 'id'> = {
      name: trimmed,
      enabled: existing?.enabled ?? true,
      mode,
      headerHex: headerHex.trim(),
      dataOffset: Math.max(0, parseInt(dataOffset, 10) || 0),
      byteLength,
      endian,
      checksum,
      scale: Number(scale) || 1,
      regexPattern: regexPattern.trim(),
      jsonKey: jsonKey.trim(),
      unit: unit.trim(),
      lastDecodedValue: existing?.lastDecodedValue,
      lastMatchedAt: existing?.lastMatchedAt,
    };

    if (editingRuleId) {
      onEditRule(editingRuleId, payload);
    } else {
      onAddRule(payload);
    }

    setName('');
    setEditingRuleId(null);
    setFormError('');
    setSheetOpen(false);
  };

  return (
    <div className="flex flex-col gap-3.5 px-4 pt-3 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            自定义接收协议
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            已启用 {rules.filter((r) => r.enabled).length} / {rules.length} 条解析规则
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onPress={handleOpenCreate}
          className="min-h-[44px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0"
        >
          <div className="flex items-center justify-center gap-1 py-2">
            <Plus className="w-4 h-4" />
            <span>新建规则</span>
          </div>
        </Button>
      </div>

      {/* Live RX Frame Test Sandbox */}
      <Card className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            接收报文解析测试
          </h3>
          <div className="flex items-center gap-1">
            {[
              { label: 'HEX 温度', sample: 'AA 55 03 01 1A 1D' },
              { label: 'JSON', sample: '{"pwm":82}' },
              { label: 'ASCII', sample: 'LED:1' },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setTestInput(s.sample)}
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            aria-label="测试接收帧内容"
            className="flex-1 min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono text-slate-900 dark:text-slate-100"
          />
          <Button
            variant="secondary"
            size="sm"
            onPress={handleRunTest}
            className="min-h-[42px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap"
          >
            <div className="flex items-center justify-center gap-1 py-2">
              <Play className="w-3.5 h-3.5" />
              <span>模拟解析</span>
            </div>
          </Button>
        </div>

        {testResult.tested && (
          <div className="text-xs rounded-xl bg-slate-50 dark:bg-slate-800/70 px-3 py-2">
            {testResult.error ? (
              <span className="text-rose-600">{testResult.error}</span>
            ) : testResult.matches.length === 0 ? (
              <span className="text-slate-500 dark:text-slate-400">
                已加入 RX 报文日志，但未命中任何已启用的解析规则
              </span>
            ) : (
              <div className="flex flex-col gap-1">
                {testResult.matches.map((m) => (
                  <div key={m.ruleId} className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">
                      命中：{m.ruleName}
                    </span>
                    <span className="font-mono font-bold tabular-nums text-teal-600 dark:text-teal-400">
                      {m.formattedValue} {m.checksumValid ? '· 校验通过' : '· 校验失败'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Protocol Rules List */}
      <div className="flex flex-col gap-2.5">
        {rules.map((rule) => {
          const ruleSpec =
            rule.mode === 'hex'
              ? `HEX · 帧头 ${rule.headerHex} · 偏移 ${rule.dataOffset} · ${rule.byteLength}B ${
                  rule.endian === 'big' ? '大端' : '小端'
                } · 系数 ${rule.scale} · ${rule.checksum.toUpperCase()}`
              : rule.mode === 'json'
              ? `JSON · 字段 ${rule.jsonKey} · 系数 ${rule.scale}`
              : `ASCII 正则 · ${rule.regexPattern}`;

          return (
            <Card
              key={rule.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-none flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {rule.name}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {ruleSpec}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Switch
                    isSelected={rule.enabled}
                    onChange={(checked) => onToggleRule(rule.id, checked)}
                    aria-label={`启用规则「${rule.name}」`}
                  >
                    <Switch.Content aria-label={`启用规则「${rule.name}」`}>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(rule)}
                    aria-label={`编辑规则「${rule.name}」`}
                    className="min-w-[34px] min-h-[34px] rounded-xl flex items-center justify-center text-slate-400 hover:text-teal-600"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRule(rule.id)}
                    aria-label={`删除规则「${rule.name}」`}
                    className="min-w-[34px] min-h-[34px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {rule.lastDecodedValue && (
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">
                    最近解析 ({rule.lastMatchedAt ?? '刚刚'})
                  </span>
                  <span className="font-mono font-bold tabular-nums text-teal-600 dark:text-teal-400">
                    {rule.lastDecodedValue}
                  </span>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Add / Edit Protocol Rule Sheet */}
      {/* Popup 必须常驻挂载，动画依赖 visible false→true 变化，条件挂载会闪现无动画 */}
      <Popup
        visible={sheetOpen}
        position="bottom"
        onMaskClick={() => setSheetOpen(false)}
        bodyStyle={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '90%',
          overflow: 'hidden',
        }}
      >
          <form
            onSubmit={handleSaveRule}
            className="bg-white dark:bg-slate-900 rounded-t-3xl p-4 pb-6 flex flex-col gap-3 max-h-[90%] overflow-y-auto shadow-2xl"
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-teal-600" />
                <span>{editingRuleId ? '编辑接收协议规则' : '新建接收协议解析规则'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="关闭新建规则弹窗"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <Segmented
              size="md"
              ariaLabel="解析模式"
              options={[
                { label: 'HEX 帧', value: 'hex' },
                { label: 'JSON 字段', value: 'json' },
                { label: 'ASCII 正则', value: 'ascii' },
              ]}
              value={mode}
              onChange={setMode}
            />

            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">规则名称</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：电池电压回传帧"
                className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-sm text-slate-900 dark:text-slate-100"
              />
            </label>

            {mode === 'hex' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">帧头识别字节</span>
                    <Input
                      value={headerHex}
                      onChange={(e) => setHeaderHex(e.target.value)}
                      placeholder="AA 55 04"
                      className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">数据起始偏移(字节)</span>
                    <Input
                      type="number"
                      value={dataOffset}
                      onChange={(e) => setDataOffset(e.target.value)}
                      className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">长度</span>
                    <Segmented
                      size="xs"
                      ariaLabel="数据字节长度"
                      options={[
                        { label: '1B', value: 1 },
                        { label: '2B', value: 2 },
                      ]}
                      value={byteLength}
                      onChange={setByteLength}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">字节序</span>
                    <Segmented
                      size="xs"
                      ariaLabel="字节序"
                      options={[
                        { label: '大端', value: 'big' },
                        { label: '小端', value: 'little' },
                      ]}
                      value={endian}
                      onChange={setEndian}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">校验</span>
                    <select
                      value={checksum}
                      onChange={(e) => setChecksum(e.target.value as ChecksumType)}
                      className="min-h-[38px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 text-xs font-mono"
                    >
                      <option value="none">无</option>
                      <option value="sum8">SUM8</option>
                      <option value="xor8">XOR8</option>
                      <option value="crc16">CRC16</option>
                    </select>
                  </label>
                </div>
              </>
            )}

            {mode === 'json' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  JSON 字段路径（如 temp 或 sensor.voltage）
                </span>
                <Input
                  value={jsonKey}
                  onChange={(e) => setJsonKey(e.target.value)}
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                />
              </label>
            )}

            {mode === 'ascii' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  提取正则（第 1 捕获组为解析数值）
                </span>
                <Input
                  value={regexPattern}
                  onChange={(e) => setRegexPattern(e.target.value)}
                  className="min-h-[42px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">缩放系数</span>
                <Input
                  type="number"
                  step="0.01"
                  value={scale}
                  onChange={(e) => setScale(e.target.value)}
                  className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">显示单位</span>
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="℃ / V / %"
                  className="min-h-[40px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 text-xs font-mono"
                />
              </label>
            </div>

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
                {editingRuleId ? '保存修改' : '保存解析规则'}
              </Button>
            </div>
          </form>
        </Popup>
    </div>
  );
}
