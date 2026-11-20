import {createRoot} from 'react-dom/client';
// antd-mobile 的全局 CSS 变量与触摸修复，必须在 antd-mobile 组件之前加载
import 'antd-mobile/es/global/index.js';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
