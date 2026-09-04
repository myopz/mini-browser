import Dexie, { type EntityTable } from 'dexie'

import { createSampleItems, isBuiltinSampleId } from '@/lib/item-factory'
import type { Item } from '@/types/item'

/** App-level flags stored in IndexedDB (not localStorage). */
type MetaRow = { key: string; value: string }

/** 用户主动删除示例后设为 1，阻止自动重新 seed */
const EXAMPLES_DISMISSED_KEY = 'examples-dismissed'
/** 旧版 meta key，读取时兼容迁移 */
const LEGACY_USER_CLEARED_KEY = 'userClearedSample'

class AppDatabase extends Dexie {
  items!: EntityTable<Item, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor() {
    super('temp-ittoolplus')
    this.version(1).stores({
      items: 'id, updatedAt, title, status',
    })
    this.version(2).stores({
      items: 'id, updatedAt, title, status',
      meta: 'key',
    })
    this.version(3).stores({
      items: 'id, updatedAt, title',
      meta: 'key',
    })
  }
}

export const db = new AppDatabase()

let dbReady: Promise<void> | null = null

function openDb(): Promise<void> {
  if (!dbReady) {
    dbReady = db.open().then(() => undefined)
  }
  return dbReady
}

async function getMeta(key: string): Promise<string | undefined> {
  const row = await db.meta.get(key)
  return row?.value
}

async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

async function deleteMeta(key: string): Promise<void> {
  await db.meta.delete(key)
}

async function isExamplesDismissed(): Promise<boolean> {
  const dismissed = (await getMeta(EXAMPLES_DISMISSED_KEY)) === '1'
  if (dismissed) return true
  // 兼容旧数据
  return (await getMeta(LEGACY_USER_CLEARED_KEY)) === '1'
}

async function markExamplesDismissed(): Promise<void> {
  await setMeta(EXAMPLES_DISMISSED_KEY, '1')
  await deleteMeta(LEGACY_USER_CLEARED_KEY)
}

async function clearExamplesDismissed(): Promise<void> {
  await deleteMeta(EXAMPLES_DISMISSED_KEY)
  await deleteMeta(LEGACY_USER_CLEARED_KEY)
}

export async function listItems(): Promise<Item[]> {
  await openDb()
  const rows = await db.items.toArray()
  return rows.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export async function getItem(id: string): Promise<Item | undefined> {
  await openDb()
  return db.items.get(id)
}

export async function saveItem(item: Item): Promise<void> {
  await openDb()
  await db.items.put(item)
}

export async function deleteItem(id: string): Promise<void> {
  await deleteItems([id])
}

export async function deleteItems(ids: string[]): Promise<void> {
  await openDb()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return

  const deletedBuiltin = unique.some(isBuiltinSampleId)

  await db.transaction('rw', db.items, db.meta, async () => {
    await db.items.bulkDelete(unique)
    if (deletedBuiltin) {
      await markExamplesDismissed()
    }
  })
}

/** 首次且用户未清除示例时，补全缺失的内置示例条目 */
export async function ensureSampleItemsSeeded(): Promise<Item[]> {
  await openDb()
  if (await isExamplesDismissed()) {
    return listItems()
  }

  const seeds = createSampleItems()
  const existing = await db.items.bulkGet(seeds.map((item) => item.id))
  const missing = seeds.filter((_, index) => !existing[index])

  if (missing.length > 0) {
    await db.items.bulkPut(missing)
  }

  return listItems()
}

/** @deprecated 使用 resetSeedExamples */
export async function seedItemsIfEmpty(seed: () => Item[]): Promise<Item[]> {
  void seed
  return ensureSampleItemsSeeded()
}

/** 恢复内置示例条目，不影响用户自建条目 */
export async function resetSeedExamples(): Promise<Item[]> {
  await openDb()
  await clearExamplesDismissed()

  const seeds = createSampleItems()
  const existing = await db.items.bulkGet(seeds.map((item) => item.id))

  await db.items.bulkPut(
    seeds.map((item, index) => {
      const prev = existing[index]
      return prev
        ? {
            ...item,
            createdAt: prev.createdAt,
            updatedAt: new Date().toISOString(),
          }
        : item
    }),
  )

  return listItems()
}

/** @deprecated 使用 resetSeedExamples */
export async function resetToSampleItems(seed: () => Item[]): Promise<Item[]> {
  void seed
  return resetSeedExamples()
}

export async function areExamplesDismissed(): Promise<boolean> {
  await openDb()
  return isExamplesDismissed()
}
