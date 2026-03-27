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
const fs = require("fs");
const fileListToolDefinition = {
  type: "function",
  function: {
    name: "get_file_list",
    // description 要写清楚，大模型依靠它判断何时调用此工具
    description: "获取指定目录下的文件和子目录列表。当用户想查看某个文件夹里有哪些文件时使用此工具。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: '要列出文件的目录路径。支持绝对路径（如 "C:/Users/EDY/Desktop"）和相对路径（如 "."）'
        },
        include_hidden: {
          type: "boolean",
          description: '是否包含以 "." 开头的隐藏文件，默认为 false（不包含）'
        }
      },
      required: ["path"]
      // path 是必填参数
    }
  }
};
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
function getExtension(name) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(dotIndex) : void 0;
}
function getFileList(args) {
  const { path: inputPath, include_hidden = false } = args;
  try {
    const absolutePath = path.resolve(inputPath);
    const entries = fs.readdirSync(absolutePath);
    const items = entries.filter((name) => include_hidden || !name.startsWith(".")).map((name) => {
      const fullPath = path.join(absolutePath, name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          return { name, type: "directory" };
        } else {
          return {
            name,
            type: "file",
            size: stat.size,
            extension: getExtension(name)
          };
        }
      } catch {
        return { name, type: "file" };
      }
    });
    if (items.length === 0) {
      return `目录 "${absolutePath}" 为空（没有${include_hidden ? "" : "可见"}文件）。`;
    }
    const dirs = items.filter((i) => i.type === "directory");
    const files = items.filter((i) => i.type === "file");
    const lines = [`📁 目录：${absolutePath}`, `共 ${items.length} 项（${dirs.length} 个目录，${files.length} 个文件）`, ""];
    if (dirs.length > 0) {
      lines.push("📂 子目录：");
      dirs.forEach((d) => lines.push(`  📂 ${d.name}/`));
      lines.push("");
    }
    if (files.length > 0) {
      lines.push("📄 文件：");
      files.forEach((f) => {
        const sizeStr = f.size !== void 0 ? ` (${formatSize(f.size)})` : "";
        lines.push(`  📄 ${f.name}${sizeStr}`);
      });
    }
    return lines.join("\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `❌ 无法读取目录 "${inputPath}"：${msg}
请检查路径是否正确，以及是否有访问权限。`;
  }
}
const renameFileToolDefinition = {
  type: "function",
  function: {
    name: "rename_file",
    description: "将指定文件或目录重命名为新的名字。当用户想改文件名或文件夹名时使用此工具。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: '要重命名的文件或目录的完整路径，如 "C:/Users/EDY/Desktop/old.txt"'
        },
        new_name: {
          type: "string",
          description: '新的文件名（只填名字本身，不含目录路径），如 "new.txt" 或 "my-folder"'
        }
      },
      required: ["path", "new_name"]
    }
  }
};
function renameFile(args) {
  const { path: inputPath, new_name } = args;
  if (new_name.includes("/") || new_name.includes("\\")) {
    return `❌ 新名字 "${new_name}" 不能包含路径分隔符，请只填写文件名本身（如 "new.txt"）。`;
  }
  if (!new_name.trim()) {
    return `❌ 新名字不能为空。`;
  }
  try {
    const absolutePath = path.resolve(inputPath);
    const parentDir = path.dirname(absolutePath);
    const newPath = path.join(parentDir, new_name);
    fs.statSync(absolutePath);
    fs.renameSync(absolutePath, newPath);
    return `✅ 重命名成功："${absolutePath}" → "${newPath}"`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `❌ 重命名失败：${msg}
请检查文件路径是否正确，以及是否有操作权限。`;
  }
}
const allToolDefinitions = [
  fileListToolDefinition,
  renameFileToolDefinition
];
const toolExecutors = {
  get_file_list: (args) => getFileList(args),
  rename_file: (args) => renameFile(args)
};
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
    // 从 .env  读取 API Key
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    // 百炼 API 地址
  });
  const conversationMessages = [...messages];
  for (let round = 0; round < 5; round++) {
    const response = await client.chat.completions.create({
      model: "qwen3-max",
      messages: conversationMessages,
      tools: allToolDefinitions,
      // 告诉大模型有哪些工具可用
      tool_choice: "auto",
      // 让大模型自己决定是否调用工具
      stream: false
    });
    const choice = response.choices[0];
    if (choice.finish_reason === "stop") {
      return choice.message?.content || "";
    }
    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      conversationMessages.push(choice.message);
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== "function") continue;
        const toolName = toolCall.function.name;
        const executor = toolExecutors[toolName];
        let toolResult;
        if (executor) {
          const args = JSON.parse(toolCall.function.arguments);
          toolResult = executor(args);
        } else {
          toolResult = `错误：未知工具 "${toolName}"，无法执行。`;
        }
        conversationMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          // 必须匹配，大模型用此关联调用和结果
          content: toolResult
        });
      }
      continue;
    }
    return choice.message?.content || "";
  }
  return "请求处理超时，请稍后重试。";
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
