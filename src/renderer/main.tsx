/**
 * 渲染进程入口（Renderer Entry）
 * 这里是前端页面的起点，把 React 应用挂载到 index.html 里的 #root 元素上。
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './src/App/App'
import './index.less'  // 全局样式（reset + body 背景色）

// React.StrictMode 严格模式：开发时会额外检查潜在问题，不影响生产环境
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
