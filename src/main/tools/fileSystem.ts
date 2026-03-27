/**
 * 文件系统工具（File System Tool）
 *
 * 这是一个供大模型调用的"工具"：
 * - 大模型自己无法访问本地文件系统
 * - 通过 Tool Calling，大模型可以"请求"我们执行某段代码，再把结果告诉它
 *
 * 工作流程：
 * 用户提问 → 大模型决定调用工具 → 主进程执行工具函数 → 结果返回给大模型 → 大模型组织最终回答
 */
import { readdirSync, statSync, renameSync } from 'fs'
import { join, resolve, dirname } from 'path'

// ── 类型定义 ──────────────────────────────────────── //

/** 单个文件/目录的信息 */
interface FileItem {
  name: string       // 文件名
  type: 'file' | 'directory'  // 类型
  size?: number      // 文件大小（字节），目录没有此字段
  extension?: string // 文件扩展名（如 .ts、.json）
}

/** 工具函数的入参 */
interface GetFileListArgs {
  path: string          // 要列出的目录路径
  include_hidden?: boolean  // 是否包含隐藏文件（以 . 开头），默认 false
}

// ── OpenAI Tool 定义（JSON Schema 格式） ───────────── //
// 这段描述告诉大模型：这个工具叫什么、能做什么、需要哪些参数

/**
 * 文件列表工具的 Schema 定义
 * 传给 OpenAI API 的 tools 参数，大模型根据此描述决定是否调用
 */
export const fileListToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'get_file_list',
    // description 要写清楚，大模型依靠它判断何时调用此工具
    description: '获取指定目录下的文件和子目录列表。当用户想查看某个文件夹里有哪些文件时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要列出文件的目录路径。支持绝对路径（如 "C:/Users/EDY/Desktop"）和相对路径（如 "."）',
        },
        include_hidden: {
          type: 'boolean',
          description: '是否包含以 "." 开头的隐藏文件，默认为 false（不包含）',
        },
      },
      required: ['path'],  // path 是必填参数
    },
  },
}

// ── 工具函数实现 ────────────────────────────────────── //

/**
 * 格式化文件大小，使其更易读
 * @example formatSize(1536) => "1.5 KB"
 */
function formatSize(bytes: number): string {
  if (bytes < 1024)             return `${bytes} B`
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

/**
 * 获取文件扩展名
 * @example getExtension('App.tsx') => '.tsx'
 */
function getExtension(name: string): string | undefined {
  const dotIndex = name.lastIndexOf('.')
  // 没有点，或点在开头（如 .gitignore）则视为无扩展名
  return dotIndex > 0 ? name.slice(dotIndex) : undefined
}

/**
 * 获取指定目录下的文件列表（工具函数实体）
 *
 * 此函数会被主进程在 Tool Calling 流程中调用，结果作为工具消息返回给大模型。
 *
 * @param args - 工具入参（路径 + 是否包含隐藏文件）
 * @returns 格式化后的文件列表字符串，或错误信息
 */
export function getFileList(args: GetFileListArgs): string {
  const { path: inputPath, include_hidden = false } = args

  try {
    // resolve 将相对路径转为绝对路径，方便大模型理解
    const absolutePath = resolve(inputPath)

    // 读取目录内容（会抛出异常如果路径不存在或无权限）
    const entries = readdirSync(absolutePath)

    // 过滤 + 收集信息
    const items: FileItem[] = entries
      .filter(name => include_hidden || !name.startsWith('.'))  // 过滤隐藏文件
      .map(name => {
        const fullPath = join(absolutePath, name)
        try {
          const stat = statSync(fullPath)
          if (stat.isDirectory()) {
            return { name, type: 'directory' as const }
          } else {
            return {
              name,
              type: 'file' as const,
              size: stat.size,
              extension: getExtension(name),
            }
          }
        } catch {
          // 无法 stat 的文件（如系统权限问题），跳过详情
          return { name, type: 'file' as const }
        }
      })

    if (items.length === 0) {
      return `目录 "${absolutePath}" 为空（没有${include_hidden ? '' : '可见'}文件）。`
    }

    // 分组：目录在前，文件在后
    const dirs  = items.filter(i => i.type === 'directory')
    const files = items.filter(i => i.type === 'file')

    // 组织输出文本
    const lines: string[] = [`📁 目录：${absolutePath}`, `共 ${items.length} 项（${dirs.length} 个目录，${files.length} 个文件）`, '']

    if (dirs.length > 0) {
      lines.push('📂 子目录：')
      dirs.forEach(d => lines.push(`  📂 ${d.name}/`))
      lines.push('')
    }

    if (files.length > 0) {
      lines.push('📄 文件：')
      files.forEach(f => {
        const sizeStr = f.size !== undefined ? ` (${formatSize(f.size)})` : ''
        lines.push(`  📄 ${f.name}${sizeStr}`)
      })
    }

    return lines.join('\n')

  } catch (err: unknown) {
    // 将 Node.js 的错误转成大模型能理解的文字
    const msg = err instanceof Error ? err.message : String(err)
    return `❌ 无法读取目录 "${inputPath}"：${msg}\n请检查路径是否正确，以及是否有访问权限。`
  }
}

// ── 重命名工具 ──────────────────────────────────────── //

/** 重命名工具的入参 */
interface RenameFileArgs {
  path: string      // 文件或目录的完整路径（含文件名）
  new_name: string  // 新文件名（只写文件名本身，不含路径）
}

/**
 * 重命名文件/目录的工具定义（传给 OpenAI API）
 */
export const renameFileToolDefinition = {
  type: 'function' as const,
  function: {
    name: 'rename_file',
    description: '将指定文件或目录重命名为新的名字。当用户想改文件名或文件夹名时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要重命名的文件或目录的完整路径，如 "C:/Users/EDY/Desktop/old.txt"',
        },
        new_name: {
          type: 'string',
          description: '新的文件名（只填名字本身，不含目录路径），如 "new.txt" 或 "my-folder"',
        },
      },
      required: ['path', 'new_name'],
    },
  },
}

/**
 * 重命名文件或目录（工具函数实体）
 *
 * 只允许改名，不允许跨目录移动（new_name 不能包含路径分隔符）。
 *
 * @param args - 工具入参（原路径 + 新名字）
 * @returns 操作结果字符串
 */
export function renameFile(args: RenameFileArgs): string {
  const { path: inputPath, new_name } = args

  // 安全检查：new_name 里不能含路径分隔符，防止文件被移动到其他目录
  if (new_name.includes('/') || new_name.includes('\\')) {
    return `❌ 新名字 "${new_name}" 不能包含路径分隔符，请只填写文件名本身（如 "new.txt"）。`
  }

  // 安全检查：new_name 不能为空或仅空格
  if (!new_name.trim()) {
    return `❌ 新名字不能为空。`
  }

  try {
    const absolutePath = resolve(inputPath)           // 原文件的绝对路径
    const parentDir    = dirname(absolutePath)        // 所在目录
    const newPath      = join(parentDir, new_name)    // 新路径 = 同目录 + 新名字

    // 检查原文件是否存在
    statSync(absolutePath)  // 不存在会抛异常

    // 执行重命名
    renameSync(absolutePath, newPath)

    return `✅ 重命名成功："${absolutePath}" → "${newPath}"`

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `❌ 重命名失败：${msg}\n请检查文件路径是否正确，以及是否有操作权限。`
  }
}


// 如果以后添加更多工具（如读取文件内容、搜索文件等），在这里扩展

/** 所有可用工具的定义列表，传给 OpenAI API */
export const allToolDefinitions = [
  fileListToolDefinition,
  renameFileToolDefinition,
]

/** 工具名 → 执行函数 的映射表，主进程根据大模型返回的工具名找到对应函数执行 */
export const toolExecutors: Record<string, (args: Record<string, unknown>) => string> = {
  get_file_list: (args) => getFileList(args as unknown as GetFileListArgs),
  rename_file:   (args) => renameFile(args as unknown as RenameFileArgs),
}
