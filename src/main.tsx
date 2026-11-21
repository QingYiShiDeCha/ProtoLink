import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router';
// antd-mobile 的全局 CSS 变量与触摸修复，必须在 antd-mobile 组件之前加载
import 'antd-mobile/es/global/index.js';
import App from './App.tsx';
import './index.css';

// Capacitor 原生壳走 file:// 协议，必须用 Hash 路由（history 路由会 404）
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>
);
