export const categories = [
  { id: 'writing', name: 'AI 写作工具', short: 'AI 写作', description: '从灵感、提纲到定稿，帮你写得更快。' },
  { id: 'image', name: 'AI 图像工具', short: 'AI 图像', description: '发现图像生成、视觉设计和图片编辑工具。' },
  { id: 'video', name: 'AI 视频工具', short: 'AI 视频', description: '让创意从文字、图片或分镜走进视频。' },
  { id: 'office', name: 'AI 办公工具', short: 'AI 办公', description: '整理资料、制作演示文稿，减少重复工作。' },
  { id: 'chat', name: 'AI 聊天助手', short: 'AI 对话', description: '问答、推理和日常协作的智能伙伴。' },
  { id: 'agents', name: 'AI 智能体', short: 'AI 智能体', description: '发现能调用工具、协作和完成多步骤任务的智能体。' },
  { id: 'code', name: 'AI 编程工具', short: 'AI 编程', description: '理解代码、调试问题并辅助日常开发。' },
  { id: 'platforms', name: 'AI 开发平台', short: 'AI 开发', description: '探索构建、测试和部署 AI 应用的平台。' },
  { id: 'design', name: 'AI 设计工具', short: 'AI 设计', description: '辅助界面设计、品牌视觉和创意排版。' },
  { id: 'audio', name: 'AI 音频工具', short: 'AI 音频', description: '探索语音合成、配音和音乐创作工具。' },
  { id: 'search', name: 'AI 搜索引擎', short: 'AI 搜索', description: '检索网络信息、整理线索并追踪来源。' },
  { id: 'learning', name: 'AI 学习网站', short: 'AI 学习', description: '从入门课程到实战教程，按自己的节奏学习 AI。' },
  { id: 'training', name: 'AI 训练模型', short: '模型训练', description: '查找用于训练、微调和管理 AI 模型的资源。' },
  { id: 'evaluation', name: 'AI 模型评测', short: '模型评测', description: '通过基准测试和排行榜比较不同模型的表现。' },
  { id: 'detection', name: 'AI 内容检测', short: '内容检测', description: '发现辅助识别 AI 生成内容和核查内容来源的工具。' },
  { id: 'prompts', name: 'AI 提示指令', short: 'AI 提示词', description: '查找、整理和改写适合不同任务的提示词。' },
  { id: 'side-hustle', name: 'AI 副业工具', short: 'AI 副业', description: '寻找辅助内容制作、接单和独立项目的工具。' },
] as const

export type CategoryId = (typeof categories)[number]['id']

export type CatalogTool = {
  slug: string
  name: string
  category: string
  website: string
  summary: string
  logoKey: string | null
  hasLogo: boolean
  featuredOrder: number | null
}

const localBrands = new Set(['openai', 'claude', 'midjourney', 'deepseek', 'gemini', 'perplexity', 'notion', 'cursor', 'kimi', 'doubao', 'grammarly', 'ideogram', 'runway', 'descript', 'suno', 'elevenlabs', 'canva', 'windsurf'])

export function toolLogo(tool: Pick<CatalogTool, 'slug' | 'hasLogo' | 'logoKey'>) {
  if (tool.hasLogo) return `/api/tool-media/${tool.slug}/logo`
  if (tool.logoKey && localBrands.has(tool.logoKey)) return `/brands/${tool.logoKey}.svg`
  return null
}

export function websiteUrl(value: string) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null
  } catch {
    return null
  }
}
