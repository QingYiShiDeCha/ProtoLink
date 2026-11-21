# ProtoLink

嵌入式 / IoT 调试伴侣——运行在 Android 手机上的全功能协议调试工作台。通过蓝牙 BLE、MQTT、TCP 三种链路与单片机 / IoT 设备通信，在手机上完成控件下发、报文收发、协议解析的全流程调试，内置设备仿真器，无硬件也能体验完整链路。

## 功能特性

四个页面（底部 TabBar 导航，基于 react-router Hash 路由）：

| 页面 | 功能 |
|---|---|
| **连接** | BLE（真机蓝牙扫描 / Web Bluetooth）、MQTT（Broker + 订阅/发布）、TCP（WS 桥接 / Client-Server）三种链路切换，内置仿真器一键连接；深色调试界面切换 |
| **控制** | 可自定义控件面板：开关、滑块（PWM 调光）、RGB 彩灯（应用内取色弹层，R/G/B 滑杆 + 快捷预设）、方向键、模式切换；支持定时自动轮询下发 |
| **报文** | 控制台式收发日志，HEX / ASCII / JSON 三种输入格式，SUM8 / CRC16 校验可选 |
| **协议** | 自定义解析规则：HEX 帧、JSON 字段、ASCII 正则三种模式，可配置字节序与字节长，规则实时作用于报文解析 |

## 技术栈

- **框架**：React 19 + TypeScript + Vite 8（Rolldown）
- **UI**：antd-mobile 5 + Tailwind CSS 4 + 自研 Segmented 组件（动画对齐 antd-mobile）
- **路由**：react-router 8（HashRouter，兼容 Capacitor file:// 场景）
- **原生壳**：Capacitor 8（Android），BLE 走 `@capacitor-community/bluetooth-le`
- **协议引擎**：自研 `protocolEngine`（帧头 `AA 55`、可配校验），带单元测试
- **包管理**：pnpm 11

## 项目结构

```
src/
├── layouts/       # 布局壳（顶栏 + 路由出口 + TabBar）
├── pages/         # 路由页面（连接 / 控制 / 报文 / 协议）
├── ui/            # 通用组件（Segmented 等）
├── native/        # Capacitor 原生桥（BLE）
├── utils/         # 协议引擎 + 单元测试
├── types/         # 领域类型定义
└── index.css      # 主题变量 + antd-mobile 桥接层
```

## 快速开始

```bash
# 安装依赖（需 Node 22+ / pnpm 11+）
pnpm install

# 本地开发（http://localhost:3000）
pnpm dev

# 类型检查 / 生产构建 / 本地预览
pnpm lint
pnpm build
pnpm preview
```

## Android 打包

```bash
# 构建前端并同步到 Android 工程
pnpm android:sync

# 用 Android Studio 打开原生工程
pnpm android:open
```

推送 `main` 分支或 `v*` tag 会自动触发 GitHub Actions 构建调试 APK（`Android APK` 工作流），artifact 名为 `protolink-debug-apk`；打 tag 的构建会同时创建 GitHub Release 并附上 APK。

## 关于 antd-mobile 定制

项目在 `src/index.css` 维护了一层无级联层级的桥接样式，处理 Tailwind preflight 与 antd-mobile 的已知冲突（按钮图标换行、Slider 把手 / Toast 图标居中等），并通过 antd 的 CSS 变量注入主题色。修改 antd-mobile 组件外观时，Tailwind 类写不进去的规则请走这一层。
