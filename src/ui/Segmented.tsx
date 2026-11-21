import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 自定义 Segmented 分段选择器（通用组件）。
 *
 * 动画对齐 antd-mobile 的 Segmented：绝对定位的滑块（thumb）通过
 * transform + width 过渡到选中项，时长 300ms，缓动函数取 antd-mobile
 * 同款 cubic-bezier(0.645, 0.045, 0.355, 1)。
 *
 * 用法：
 *   <Segmented
 *     options={[{ label: '蓝牙 BLE', value: 'ble' }, ...]}
 *     value={active}
 *     onChange={setActive}
 *     size="md"            // sm 34px / md 36px / lg 40px
 *   />
 * label 支持 ReactNode，可放图标（按钮内部 flex 居中 + gap-1.5）。
 *
 * 注意：普通 div/button 实现，不受 antd-mobile 无层级样式的层叠压制，
 * 深色模式可以直接用 Tailwind 的 dark: 变体。
 */

export interface SegmentedOption<T extends string | number> {
  label: React.ReactNode;
  value: T;
}

interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
  /** 附加到容器的 className（尺寸/字体等），外观基类已内置 */
  className?: string;
  /** 条目高度/字重档位，默认 'md' */
  size?: SegmentedSize;
  /**
   * 紧凑变体：inline 自适应宽度（不等分）、p-0.5 小内边距、
   * mono 小字号，用于卡片内嵌的工具条场景（如编码/校验切换）。
   */
  compact?: boolean;
  ariaLabel?: string;
}

export type SegmentedSize = 'xs' | 'sm' | 'md' | 'lg';

/** 与各调用点的原始尺寸一一对应 */
const ITEM_SIZE_CLASSES: Record<SegmentedSize, string> = {
  xs: 'min-h-[32px] text-[11px] font-mono font-semibold',
  sm: 'min-h-[34px] text-xs font-medium',
  md: 'min-h-[36px] text-xs font-semibold',
  lg: 'min-h-[40px] text-xs font-semibold',
};

/** 紧凑变体的容器与条目样式 */
const COMPACT_CONTAINER = 'inline-flex w-fit gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800';
const COMPACT_ITEM =
  'min-h-0 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold';

/** 与 antd-mobile segmented.css 的 --transition-time-function 保持一致 */
const SLIDE_EASING = 'cubic-bezier(0.645, 0.045, 0.355, 1)';

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
  compact = false,
  ariaLabel,
}: SegmentedProps<T>) {
  const itemRefs = useRef(new Map<T, HTMLButtonElement>());
  const [thumb, setThumb] = useState({ left: 0, top: 0, width: 0, height: 0 });
  // 首次测量前不开过渡，避免滑块从 0 尺寸"飘"进位置
  const [measured, setMeasured] = useState(false);

  const measure = useCallback(() => {
    const el = itemRefs.current.get(value);
    if (!el) return;
    setThumb({
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
    setMeasured(true);
  }, [value]);

  useLayoutEffect(measure, [measure, options]);

  // 容器尺寸变化（窗口缩放、字体加载完成等）时重新测量
  useEffect(() => {
    const container = itemRefs.current.get(value)?.parentElement;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure, value]);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative ${
        compact
          ? COMPACT_CONTAINER
          : 'grid grid-flow-col auto-cols-fr gap-1 rounded-xl p-1 bg-slate-200/70 dark:bg-slate-800'
      } ${className}`}
    >
      {/* 滑块：位置/宽度过渡与 antd-mobile Segmented 的 thumb 一致。
          测量完成前不渲染——若先渲染 0 尺寸再过渡到目标位置，首次进入
          页面会播放"从左上角长大"的动画；挂载即终点则无前一帧样式，
          不会触发过渡。 */}
      {measured && (
        <div
          aria-hidden="true"
          className={`absolute bg-white shadow-xs dark:bg-slate-900 will-change-transform ${
            compact ? 'rounded-md' : 'rounded-lg'
          }`}
          style={{
            left: 0,
            top: 0,
            width: thumb.width,
            height: thumb.height,
            transform: `translate(${thumb.left}px, ${thumb.top}px)`,
            transition: `transform 0.3s ${SLIDE_EASING}, width 0.3s ${SLIDE_EASING}`,
          }}
        />
      )}

      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            ref={(el) => {
              if (el) itemRefs.current.set(opt.value, el);
              else itemRefs.current.delete(opt.value);
            }}
            onClick={() => onChange?.(opt.value)}
            className={`relative z-10 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              compact ? COMPACT_ITEM : ITEM_SIZE_CLASSES[size]
            } ${
              selected
                ? 'text-slate-900 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
            }`}
          >
            {opt.label ?? opt.value}
          </button>
        );
      })}
    </div>
  );
}
