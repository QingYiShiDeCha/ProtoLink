import React from 'react';
import { Button } from '../../ui';
import { Terminal, X } from 'lucide-react';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

export function GuideModal({ open, onClose }: GuideModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rn-guide-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-teal-600" />
            <h2 id="rn-guide-title" className="text-lg font-bold text-slate-900">
              在真机运行 React Native + HeroUI Native 工程
            </h2>
          </div>
          <Button
            variant="ghost"
            isIconOnly
            onPress={onClose}
            aria-label="关闭运行指南"
            className="min-w-[40px] min-h-[40px] rounded-xl text-slate-500"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <ol className="flex flex-col gap-3 text-sm text-slate-700">
          <li>
            <span className="font-semibold text-slate-900">1. 一键初始化 HeroUI Native + Expo 工程</span>
            <pre className="mt-1.5 p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
              npx create-heroui-native-app@latest protolink-rn
            </pre>
          </li>
          <li>
            <span className="font-semibold text-slate-900">2. 安装蓝牙 BLE、MQTT 与 TCP 原生依赖</span>
            <pre className="mt-1.5 p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
              npm install heroui-native react-native-ble-plx mqtt react-native-tcp-socket @react-native-community/slider buffer
            </pre>
          </li>
          <li>
            <span className="font-semibold text-slate-900">3. 编译自定义原生客户端（BLE/TCP 需原生权限模块）</span>
            <p className="text-xs text-slate-500 mt-1">
              将导出的 App.tsx 与 src/ 放入项目后，运行以下命令编译并在真机调试：
            </p>
            <pre className="mt-1.5 p-3 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
              npx expo prebuild &amp;&amp; npx expo run:android
            </pre>
          </li>
        </ol>

        <div className="mt-5 flex justify-end">
          <Button
            variant="primary"
            onPress={onClose}
            className="min-h-[42px] px-5 rounded-xl text-sm font-medium"
          >
            知道了
          </Button>
        </div>
      </div>
    </div>
  );
}
