/**
 * 主进程（Main Process）
 * Electron 应用的后端入口，运行在 Node.js 环境中，可以访问系统 API。
 * 负责：创建应用窗口、监听前端发来的 IPC 消息、调用千问 API。
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { config } from 'dotenv'
import { allToolDefinitions, toolExecutors } from './tools/fileSystem'

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
 * IPC 监听器：处理前端发来的对话请求，支持 Tool Calling
 *
 * Tool Calling 工作流程：
 * 1. 将用户消息 + 工具列表 发给大模型
 * 2. 如果大模型决定调用工具（finish_reason === 'tool_calls'）：
 *    a. 取出工具名称和参数
 *    b. 执行对应的本地函数（如 getFileList）
 *    c. 把结果作为 tool 消息插入对话历史
 *    d. 再次调用大模型，循环直到大模型返回最终文字回复
 * 3. 返回最终文字给前端
 */
ipcMain.handle('chat', async (_event, messages) => {
  // 动态导入 OpenAI SDK（千问 API 兼容 OpenAI 接口格式）
  const { default: OpenAI } = await import('openai')

  // 初始化客户端，指向阿里云百炼 API
  const client = new OpenAI({
    apiKey: process.env.DASHSCOPE_API_KEY || '',  // 从 .env  读取 API Key
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',  // 百炼 API 地址
  })

  // 复制一份对话历史，后续的工具调用结果会不断往里面插入
  const conversationMessages = [...messages]

  /**
   * Tool Calling 循环：最多执行 5 轮（防止大模型无限循环调工具）
   * 正常情况下 1-2 轮就会返回最终结果
   */
  for (let round = 0; round < 5; round++) {
    // 调用千问3 Max，传入工具列表
    const response = await client.chat.completions.create({
      model: 'qwen3-max',
      messages: conversationMessages,
      tools: allToolDefinitions,     // 告诉大模型有哪些工具可用
      tool_choice: 'auto',           // 让大模型自己决定是否调用工具
      stream: false,
    })

    const choice = response.choices[0]

    // 情况一：大模型直接返回文字回复（不需要工具）
    if (choice.finish_reason === 'stop') {
      return choice.message?.content || ''
    }

    // 情况二：大模型要求调用工具
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
      // 将大模型的这条消息（包含 tool_calls 字段）加入历史
      // 下次调用 API 时大模型才知道自己之前要求过什么
      conversationMessages.push(choice.message)

      // 逐个执行大模型要求的工具调用（只处理 function 类型）
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== 'function') continue  // 跳过非 function 类型
        const toolName = toolCall.function.name  // 工具名称，如 "get_file_list"
        const executor = toolExecutors[toolName]  // 找到对应的执行函数

        let toolResult: string
        if (executor) {
          // 解析大模型传来的 JSON 参数并执行工具
          const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
          toolResult = executor(args)
        } else {
          // 工具不存在（应该不会发生，以防万一）
          toolResult = `错误：未知工具 "${toolName}"，无法执行。`
        }

        // 将工具执行结果以 "tool" 角色插入历史
        // 大模型下次就能看到工具返回了什么
        conversationMessages.push({
          role: 'tool' as const,
          tool_call_id: toolCall.id,  // 必须匹配，大模型用此关联调用和结果
          content: toolResult,
        })
      }

      // 循环继续，带着工具结果再次调用大模型
      continue
    }

    // 其他 finish_reason（如 length、content_filter）直接返回当前内容
    return choice.message?.content || ''
  }

  return '请求处理超时，请稍后重试。'
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
