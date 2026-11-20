import type { CatalogTool } from './catalog'

// Editorial selection from the existing catalog, reviewed against ai-bot.cn.
// These lists define homepage placement, not usage statistics or publication status.
export const commonToolNames = [
  'ChatGPT', 'DeepSeek', '豆包', 'Claude', 'Gemini', 'Kimi智能助手', '腾讯元宝', '秘塔AI搜索',
] as const

export function selectHomepageTools(tools: CatalogTool[], names: readonly string[], category?: string) {
  const selected = new Set<string>()
  return names.flatMap(name => {
    const tool = tools.find(tool => tool.name === name && (!category || tool.category === category))
    if (!tool || selected.has(tool.id)) return []
    selected.add(tool.id)
    return [tool]
  })
}

// The admin category-order field is the single source of display ordering.
export function rankHomepageCategory(tools: CatalogTool[], category: string) {
  return tools.filter(tool => tool.category === category)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .slice(0, 30)
}
