import { createId } from '@/lib/utils'
import type { Item } from '@/types/item'

export function createBlankItem(
  patch: Partial<Pick<Item, 'title' | 'description'>> = {},
): Item {
  const now = new Date().toISOString()
  return {
    id: createId(),
    title: patch.title ?? '',
    description: patch.description ?? '',
    createdAt: now,
    updatedAt: now,
  }
}

const SAMPLE_DEFINITIONS = [
  {
    id: 'sample-welcome',
    title: '欢迎使用项目骨架',
    description: '这是一条示例数据，可在列表页搜索、分页、编辑或删除。',
  },
  {
    id: 'sample-site-config',
    title: '修改 siteConfig',
    description: '在 src/config/site.ts 更新产品名、描述与外链。',
  },
  {
    id: 'sample-vite-base',
    title: '调整 Vite base',
    description: '部署到子路径时修改 vite.config.ts 中的 base。',
  },
] as const

/** 内置示例条目 ID，用于删除标记与选择性恢复 */
export const SAMPLE_ITEM_IDS = SAMPLE_DEFINITIONS.map((item) => item.id)
const SAMPLE_ITEM_ID_SET = new Set<string>(SAMPLE_ITEM_IDS)

export function isBuiltinSampleId(id: string): boolean {
  return SAMPLE_ITEM_ID_SET.has(id)
}

export function createSampleItems(): Item[] {
  // Deterministic ids so re-seed / Strict Mode double-mount upserts instead of duplicating.
  return SAMPLE_DEFINITIONS.map(({ id, ...sample }) => ({
    ...createBlankItem(sample),
    id,
  }))
}

export function touchItem(item: Item): Item {
  return { ...item, updatedAt: new Date().toISOString() }
}
