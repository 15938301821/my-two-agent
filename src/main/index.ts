/**
 * 主进程（Main Process）
 * Electron 应用的后端入口，运行在 Node.js 环境中，可以访问系统 API。
 * 负责：创建应用窗口、监听前端发来的 IPC 消息、调用千问 API。
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { config } from 'dotenv'

// 加载 .env 文件中的环境变量（如 DASHSCOPE_API_KEY）
config()

// 全局保存主窗口实例，方便其他地方引用
let mainWindow: BrowserWindow | null = null

/**
 * 创建应用主窗口
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,   // 最小宽度，防止窗口太小
    minHeight: 520,  // 最小高度
    show: false,     // 先不显示，等内容加载完再显示（避免白屏闪烁）
    webPreferences: {
      // 预加载脚本路径：它是主进程和渲染进程之间的安全桥梁
      preload: join(__dirname, '../preload/index.js'),
      // 开启上下文隔离：渲染进程无法直接访问 Node.js API，更安全
      contextIsolation: true,
      // 禁止渲染进程直接使用 Node.js，防止 XSS 攻击
      nodeIntegration: false,
    },
    title: '千问3 Max 助手',
  })

  // 开发模式：加载 Vite 开发服务器（支持热更新）
  // 生产模式：加载打包后的静态文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 页面内容准备好后再显示窗口，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
}

/**
 * IPC 监听器：处理前端发来的对话请求
 *
 * IPC（进程间通信）是 Electron 中前后端通信的方式：
 * 前端（渲染进程）--> preload.ts --> ipcRenderer.invoke('chat') --> 这里
 */
ipcMain.handle('chat', async (_event, messages) => {
  // 动态导入 OpenAI SDK（千问 API 兼容 OpenAI 接口格式）
  const { default: OpenAI } = await import('openai')

  // 初始化客户端，指向阿里云百炼 API
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY || '',  // 从 .env  读取 API Key
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',  // 百炼 API 地址
  })

  // 调用千问3 Max 模型
  const response = await client.chat.completions.create({
    model: 'qwen3-max',  // 模型名称
    messages,            // 对话历史（包含所有消息以支持多轮对话）
    stream: false,       // 不使用流式输出，等待完整回复
  })

  // 取出模型返回的文本内容
  return response.choices[0]?.message?.content || ''
})

/**
 * 应用初始化完成后创建窗口
 * app.whenReady() 确保在 Electron 应用就绪后才操作窗口
 */
app.whenReady().then(() => {
  createWindow()

  // macOS 特殊处理：点击 Dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

/**
 * 所有窗口关闭时退出应用
 * macOS 上除外（macOS 应用关闭窗口后通常还会保留在 Dock）
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
