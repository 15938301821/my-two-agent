"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    // 最小宽度，防止窗口太小
    minHeight: 520,
    // 最小高度
    show: false,
    // 先不显示，等内容加载完再显示（避免白屏闪烁）
    webPreferences: {
      // 预加载脚本路径：它是主进程和渲染进程之间的安全桥梁
      preload: path.join(__dirname, "../preload/index.js"),
      // 开启上下文隔离：渲染进程无法直接访问 Node.js API，更安全
      contextIsolation: true,
      // 禁止渲染进程直接使用 Node.js，防止 XSS 攻击
      nodeIntegration: false
    },
    title: "千问3 Max 助手"
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
}
electron.ipcMain.handle("chat", async (_event, messages) => {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY || "",
    // 从 .env 读取 API Key
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    // 百炼 API 地址
  });
  const response = await client.chat.completions.create({
    model: "qwen3-max",
    // 模型名称
    messages,
    // 对话历史（包含所有消息以支持多轮对话）
    stream: false
    // 不使用流式输出，等待完整回复
  });
  return response.choices[0]?.message?.content || "";
});
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
