import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router';
import {Toast, unstableSetRender} from 'antd-mobile';
// antd-mobile 的全局 CSS 变量与触摸修复，必须在 antd-mobile 组件之前加载
import 'antd-mobile/es/global/index.js';
import App from './App.tsx';
import './index.css';

/*
 * React 19 兼容补丁：antd-mobile v5 的命令式 API（Toast/Dialog/Modal 等）
 * 经 rc-util 从 'react-dom' 主入口取 createRoot，而 React 19 主入口没有该导出，
 * 会静默回退到已删除的 ReactDOM.render，导致 Toast 等永远不渲染。
 * 这里注入基于 react-dom/client createRoot 的渲染实现。
 */
unstableSetRender((node, container) => {
  const root = createRoot(container);
  root.render(node);
  return async () => {
    await root.unmount();
  };
});

// Toast 统一从底部弹出（默认 center 会挡住表单中间）
Toast.config({ position: 'bottom' });

// Capacitor 原生壳走 file:// 协议，必须用 Hash 路由（history 路由会 404）
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>
);
