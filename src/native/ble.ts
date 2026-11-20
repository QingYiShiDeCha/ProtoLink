import { Capacitor } from '@capacitor/core';
import { BleClient, numbersToDataView } from '@capacitor-community/bluetooth-le';
import type { BleConfig } from '../types/app';

export interface BleHandlers {
  onData: (bytes: number[], deviceLabel: string) => void;
  onDisconnect: (message: string) => void;
}

export interface ScannedDevice {
  deviceId: string;
  name: string;
  rssi?: number | null;
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
 * 开始扫描附近的 BLE 设备。
 * 不用插件自带的 requestDevice，是因为它会弹出 Android 原生的设备选择框，
 * 与 App 的界面体系完全脱节。这里只取扫描结果，列表由界面自己渲染。
 */
export async function startNativeBleScan(
  config: BleConfig,
  onUpdate: (devices: ScannedDevice[]) => void
): Promise<void> {
  const service = normalizeUuid(config.serviceUuid);
  const notifyChar = normalizeUuid(config.notifyUuid);

  // initialize 会一并申请 BLUETOOTH_SCAN / BLUETOOTH_CONNECT 运行时权限
  await BleClient.initialize({ androidNeverForLocation: true });
  if (!(await BleClient.isEnabled())) {
    await BleClient.enable();
  }

  await BleClient.stopLEScan().catch(() => {
    /* 上一轮扫描可能已经停了 */
  });

  const seen = new Map<string, ScannedDevice>();
  let lastEmit = 0;

  await BleClient.requestLEScan(
    { optionalServices: Array.from(new Set([service, notifyChar])) },
    (result) => {
      const deviceId = result.device.deviceId;
      if (!deviceId) return;

      const name = (result.localName || result.device.name || '').trim();
      const prev = seen.get(deviceId);

      if (!prev) {
        seen.set(deviceId, {
          deviceId,
          name,
          rssi: typeof result.rssi === 'number' ? result.rssi : null,
        });
      } else {
        if (name && !prev.name) prev.name = name;
        if (typeof result.rssi === 'number') prev.rssi = result.rssi;
      }

      // 设备列表频繁刷新会拖垮渲染，最多每 400ms 推一次
      const now = Date.now();
      if (now - lastEmit > 400) {
        lastEmit = now;
        onUpdate(Array.from(seen.values()).sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)));
      }
    }
  );

  // 收尾再推一次，确保最后扫到的设备能显示
  setTimeout(() => {
    onUpdate(Array.from(seen.values()).sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)));
  }, 1000);
}

export async function stopNativeBleScan(): Promise<void> {
  await BleClient.stopLEScan().catch(() => {
    /* 已经停止 */
  });
}

/** 连接用户选中的设备。 */
export async function connectNativeBleTo(
  device: ScannedDevice,
  config: BleConfig,
  handlers: BleHandlers
): Promise<NativeBleLink> {
  const service = normalizeUuid(config.serviceUuid);
  const notifyChar = normalizeUuid(config.notifyUuid);
  const writeChar = normalizeUuid(config.writeUuid);

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
