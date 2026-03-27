"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  /**
   * 发送对话消息到主进程，获取 AI 回复
   * @param messages - 对话历史数组（每条包含 role 和 content）
   * @returns AI 回复的文本内容
   */
  chat: (messages) => electron.ipcRenderer.invoke("chat", messages)
});
