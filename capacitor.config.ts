import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.qingyishidecha.protolink',
  appName: 'ProtoLink',
  webDir: 'dist',
  android: {
    // MQTT / TCP 桥常用 ws:// 明文地址，WebView 默认按混合内容拦截
    allowMixedContent: true,
    backgroundColor: '#f8fafc',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
};

export default config;
