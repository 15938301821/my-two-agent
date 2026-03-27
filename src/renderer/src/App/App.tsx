/**
 * App 组件 - 千问3 Max 对话界面
 *
 * 负责渲染整个应用界面，包括：
 * - 聊天头部
 * - 消息列表（用户消息 / AI 回复）
 * - 输入框 + 发送按鈕（使用 antd 组件）
 */
import React, { useState, useRef, useEffect } from 'react'
import { Input, Button } from 'antd'               // antd 组件
import { SendOutlined } from '@ant-design/icons'   // antd 图标
import styles from './App.module.less'

/** 对话消息类型 */
interface Message {
  role: 'user' | 'assistant'  // user=用户, assistant=AI
  content: string              // 消息内容
}

/**
 * 扩展全局 Window 类型，添加 electronAPI 属性
 * 这样 TypeScript 就能识别 window.electronAPI，不会报类型错误
 */
declare global {
  interface Window {
    electronAPI?: {
      chat: (messages: Message[]) => Promise<string>
    }
  }
}

export default function App() {
  // 对话历史数组，每条包含 role 和 content
  const [messages, setMessages] = useState<Message[]>([])
  // 当前输入框的文字
  const [input, setInput] = useState('')
  // 是否正在等待 AI 回复
  const [loading, setLoading] = useState(false)
  // 消息列表底部的占位元素，用于自动滚动到最新消息
  const messagesEndRef = useRef<HTMLDivElement>(null)

  /**
   * 每次消息列表更新，自动滚动到底部
   * scrollIntoView 会将元素滚动进可视区域
   */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  /**
   * 发送消息处理函数
   * 1. 把用户输入添加到消息列表
   * 2. 调用 Electron IPC 将消息发送到主进程
   * 3. 将 AI 回复添加到消息列表
   */
  const sendMessage = async () => {
    const content = input.trim()  // 去掉首尾空格
    if (!content || loading) return  // 空内容或正在加载时不处理

    // 构建新的消息列表（旧历史 + 当前用户输入）
    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)  // 更新界面
    setInput('')              // 清空输入框
    setLoading(true)          // 开始加载动画

    try {
      // 通过 preload 暴露的 electronAPI 调用主进程的对话接口
      const reply = await window.electronAPI!.chat(newMessages)
      // AI 回复加入消息列表
      setMessages([...newMessages, { role: 'assistant', content: reply }])
    } catch {
      // 调用失败时显示错误提示
      setMessages([...newMessages, { role: 'assistant', content: '抱歉，出现了一些问题，请稍后重试。' }])
    } finally {
      setLoading(false)  // 无论成功还是失败，都要关闭加载状态
    }
  }

  return (
    // 整个聊天界面外层容器
    <div className={styles.chatContainer}>

      {/* 顶部标题栏 */}
      <header className={styles.chatHeader}>
        <h1>🤖 千问3 Max 助手</h1>
        <p>基于阿里云百炼大模型 API</p>
      </header>

      {/* 消息列表区域 */}
      <div className={styles.chatMessages}>

        {/* 没有任何消息时显示欢迎语 */}
        {messages.length === 0 && (
          <div className={styles.welcome}>
            <h2>👋 欢迎使用</h2>
            <p>我是千问3 Max，有什么可以帮助你的吗？</p>
          </div>
        )}

        {/* 遍历渲染每条消息 */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${styles[msg.role]}`}
          >
            {/* 头像区域 */}
            <div className={styles.avatar}>
              {msg.role === 'user' ? '😊' : '🤖'}
            </div>
            {/* 消息气泡 */}
            <div className={styles.bubble}>{msg.content}</div>
          </div>
        ))}

        {/* AI 思考中的打字动画 */}
        {loading && (
          <div className={`${styles.message} ${styles.assistant}`}>
            <div className={styles.avatar}>🤖</div>
            <div className={`${styles.bubble} ${styles.typing}`}>
              {/* 三个小圆圆弹跳动画 */}
              <span /><span /><span />
            </div>
          </div>
        )}

        {/* 占位 div，scrollIntoView 的目标元素 */}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部输入区域：使用 antd 的 Input + Button 组件 */}
      <div className={styles.chatInput}>
        {/* antd Input 组件：自带宽度、边框、主题色等样式 */}
        <Input
          placeholder="输入你的问题..."
          value={input}
          onChange={(e) => setInput(e.target.value)}             // 实时同步输入框内容
          onPressEnter={sendMessage}                             // antd 提供的回车键事件
          disabled={loading}                                     // AI 回复期间禁止输入
          size="large"
        />
        {/* antd Button 组件：type="primary" 为蓝色主色按鈕 */}
        <Button
          type="primary"
          size="large"
          icon={<SendOutlined />}                                // 发送图标
          onClick={sendMessage}
          disabled={loading || !input.trim()}                   // 没有内容或加载中禁用
          loading={loading}                                     // antd 内置加载状态动画
        >
          发送
        </Button>
      </div>
    </div>
  )
}
