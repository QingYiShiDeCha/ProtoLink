import React from 'react';
import {
  Button as AdmButton,
  Input as AdmInput,
  Switch as AdmSwitch,
} from 'antd-mobile';

/**
 * antd-mobile 适配层。
 *
 * 目的：把原先 HeroUI 的调用词汇（variant / size / onPress / isSelected /
 * onChange(event)）翻译成 antd-mobile 的属性，让 40 多个调用点一行不改就切换过来。
 *
 * 注意：这不是长期形态。以后新增界面请直接 `import { Button } from 'antd-mobile'`，
 * 本文件最终应该随着调用点逐步改写而消失。
 */

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'solid'
  | 'outline'
  | 'ghost'
  | 'flat'
  | 'light'
  | 'danger'
  | 'danger-soft';

type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<
    React.ComponentProps<typeof AdmButton>,
    'color' | 'fill' | 'size' | 'onClick' | 'type'
  > {
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  onClick?: () => void;
  isDisabled?: boolean;
  /** HeroUI: 占满整行 */
  fullWidth?: boolean;
  /** HeroUI: 仅图标按钮，方形小尺寸 */
  isIconOnly?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: React.ReactNode;
}

function mapVariant(variant: ButtonVariant): {
  color: 'primary' | 'default' | 'danger';
  fill: 'solid' | 'outline' | 'none';
} {
  switch (variant) {
    case 'primary':
    case 'solid':
      return { color: 'primary', fill: 'solid' };
    case 'secondary':
    case 'flat':
    case 'light':
      // 次要按钮用淡底，视觉层级低于主按钮
      return { color: 'default', fill: 'outline' };
    case 'outline':
      return { color: 'primary', fill: 'outline' };
    case 'ghost':
      return { color: 'default', fill: 'none' };
    case 'danger':
      return { color: 'danger', fill: 'solid' };
    case 'danger-soft':
      return { color: 'danger', fill: 'outline' };
    default:
      return { color: 'primary', fill: 'solid' };
  }
}

export function Button({
  variant = 'primary',
  size = 'sm',
  onPress,
  onClick,
  isDisabled,
  fullWidth,
  isIconOnly,
  type,
  className,
  children,
  ...rest
}: ButtonProps) {
  const { color, fill } = mapVariant(variant);
  const admSize = size === 'sm' ? 'small' : size === 'lg' ? 'large' : 'middle';
  return (
    <AdmButton
      color={color}
      fill={fill}
      size={admSize}
      disabled={isDisabled ?? rest.disabled}
      type={type}
      onClick={onPress ?? onClick}
      className={className}
      block={fullWidth}
      style={isIconOnly ? { paddingInline: 0 } : undefined}
      {...rest}
    >
      {children}
    </AdmButton>
  );
}

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * 卡片只在原代码里当「带边框和内边距的容器」用，
 * antd-mobile 的 Card 自带标题栏和固定内边距，套上来反而会破坏现有排版，
 * 所以这里保留成纯容器，视觉由调用点的 Tailwind 类决定。
 */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div className={className} {...rest}>
      {children}
    </div>
  );
}

export interface InputProps {
  value?: string | number;
  /** 兼容 React 原生事件写法：e.target.value */
  onChange?: (e: { target: { value: string } }) => void;
  type?: string;
  step?: number | string;
  min?: number | string;
  max?: number | string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
}

export function Input({ value, onChange, className, ...rest }: InputProps) {
  return (
    <AdmInput
      value={value === undefined ? '' : String(value)}
      // antd-mobile 的 onChange 直接给值，这里还原成 React 的 event 形态
      onChange={(v: string) => onChange?.({ target: { value: v } })}
      className={className}
      {...(rest as Record<string, unknown>)}
    />
  );
}

export interface SwitchProps {
  isSelected?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  /** HeroUI v3 的复合子组件（Switch.Content / Switch.Control / Switch.Thumb）会被忽略 */
  children?: React.ReactNode;
}

function SwitchImpl({
  isSelected,
  onChange,
  className,
  children: _children,
  ...rest
}: SwitchProps) {
  return (
    <AdmSwitch
      checked={Boolean(isSelected)}
      onChange={(v: boolean) => onChange?.(v)}
      className={className}
      {...(rest as Record<string, unknown>)}
    />
  );
}

/**
 * 原代码里 Switch 用了 HeroUI v3 的复合写法：
 *   <Switch isSelected={x} onChange={f}>
 *     <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
 *   </Switch>
 * 这些子组件在 antd-mobile 里没有对应物，挂成空壳让调用点保持原样、渲染时被忽略。
 */
type SwitchComponent = typeof SwitchImpl & {
  Content: React.FC<{ children?: React.ReactNode }>;
  Control: React.FC<{ children?: React.ReactNode }>;
  Thumb: React.FC;
};

export const Switch = SwitchImpl as SwitchComponent;
Switch.Content = () => null;
Switch.Control = () => null;
Switch.Thumb = () => null;
