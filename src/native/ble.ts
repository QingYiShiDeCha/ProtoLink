import { Capacitor } from '@capacitor/core';
import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import type { BleConfig } from '../types/app';

export interface BleHandlers {
  onData: (bytes: number[], deviceLabel: string) => void;
  onDisconnect: (message: string) => void;
}

export interface NativeBleLink {
  deviceLabel: string;
  write: (bytes: number[]) => Promise<void>;
  disconnect: () => Promise<void>;
}

/** 是否运行在 Capacitor 原生壳里（WebView 中没有 navigator.bluetooth） */
export const isNativePlatform = (): boolean => Capacitor.isNativePlatform();

const normalizeUuid = (uuid: string): string => uuid.trim().toLowerCase();

/**
 * 走原生 BLE 栈连接设备。
 * 与 Web Bluetooth 的差别：没有浏览器的设备选择器，改由 Android 系统弹窗选择；
 * 通知流通过 startNotifications 回调直接推给调用方。
 */
export async function connectNativeBle(
  config: BleConfig,
  handlers: BleHandlers
): Promise<NativeBleLink> {
  const service = normalizeUuid(config.serviceUuid);
  const notifyChar = normalizeUuid(config.notifyUuid);
  const writeChar = normalizeUuid(config.writeUuid);

  await BleClient.initialize({ androidNeverForLocation: true });

  if (!(await BleClient.isEnabled())) {
    await BleClient.enable();
  }

  // 只给出 optionalServices：不少透传模块广播里不带 service UUID，
  // 用 services 过滤会把它们挡在选择列表外。
  const device = await BleClient.requestDevice({
    optionalServices: Array.from(new Set([service, notifyChar])),
  });

  const deviceId = device.deviceId;
  const label = device.name || deviceId;
  let closed = false;

  const disconnect = async () => {
    if (closed) return;
    closed = true;
    try {
      await BleClient.stopNotifications(deviceId, service, notifyChar);
    } catch {
      /* 未订阅通知时忽略 */
    }
    try {
      await BleClient.disconnect(deviceId);
    } catch {
      /* 已断开时忽略 */
    }
  };

  await BleClient.connect(
    deviceId,
    () => {
      if (closed) return;
      closed = true;
      handlers.onDisconnect(`蓝牙设备 ${label} 已断开`);
    },
    { timeout: 15000 }
  );

  try {
    await BleClient.startNotifications(deviceId, service, notifyChar, (dv) => {
      const bytes = Array.from(
        new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
      );
      handlers.onData(bytes, label);
    });
  } catch {
    /* notify 特征值可选，模块只做写入时这里失败是正常的 */
  }

  // 有的模块只有 write-without-response，先试带响应的写，失败后锁定到无响应写
  let mode: 'with' | 'without' | null = null;
  const write = async (bytes: number[]) => {
    const value = numbersToDataView(bytes);
    if (mode !== 'without') {
      try {
        await BleClient.write(deviceId, service, writeChar, value);
        mode = 'with';
        return;
      } catch (err) {
        if (mode === 'with') throw err;
        mode = 'without';
      }
    }
    await BleClient.writeWithoutResponse(deviceId, service, writeChar, value);
  };

  return { deviceLabel: label, write, disconnect };
}
