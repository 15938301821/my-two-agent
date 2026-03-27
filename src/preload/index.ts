/**
 * 预加载脚本（Preload Script）
 *
 * 运行在一个特殊的隔离环境中，是主进程和渲染进程之间的「安全桥梁」。
 * 它可以访问 Node.js API，同时可以安全地将指定方法暴露给前端。
 *
 * 流程：  前端 (App.tsx)
 *           ↓ 调用 window.electronAPI.chat()
 *           这里： ipcRenderer.invoke('chat') 将消息发送到主进程
 *           ↓
 *        主进程 (main/index.ts) 处理并返回结果
 */
import { contextBridge, ipcRenderer } from 'electron'

/**
 * contextBridge.exposeInMainWorld 把对象安全地挂载到 window 上
 * 前端就可以通过 window.electronAPI.chat() 调用
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * 发送对话消息到主进程，获取 AI 回复
   * @param messages - 对话历史数组（每条包含 role 和 content）
   * @returns AI 回复的文本内容
   */
  chat: (messages: Array<{ role: string; content: string }>) =>
    ipcRenderer.invoke('chat', messages),
})
