import Dexie, { type EntityTable } from 'dexie'

import { createId } from '@/lib/utils'
import type { Bookmark, Visit } from '@/types/browser'

const MAX_HISTORY = 200

class AppDatabase extends Dexie {
  visits!: EntityTable<Visit, 'id'>
  bookmarks!: EntityTable<Bookmark, 'id'>

  constructor() {
    super('mini-browser')
    this.version(1).stores({
      visits: 'id, visitedAt, url',
    })
    this.version(2).stores({
      visits: 'id, visitedAt, url',
      bookmarks: 'id, createdAt, url',
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

export async function listRecentVisits(limit = 30): Promise<Visit[]> {
  await openDb()
  return db.visits.orderBy('visitedAt').reverse().limit(limit).toArray()
}

export async function listHistory(limit = MAX_HISTORY): Promise<Visit[]> {
  await openDb()
  return db.visits.orderBy('visitedAt').reverse().limit(limit).toArray()
}

/** 记录一次访问；同 URL 更新时间戳，并裁剪超量历史 */
export async function recordVisit(url: string, title?: string): Promise<void> {
  const trimmed = url.trim()
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return

  await openDb()
  const now = new Date().toISOString()
  const existing = await db.visits.where('url').equals(trimmed).first()

  await db.transaction('rw', db.visits, async () => {
    if (existing) {
      await db.visits.put({
        ...existing,
        title: title?.trim() || existing.title,
        visitedAt: now,
      })
    } else {
      await db.visits.add({
        id: createId(),
        url: trimmed,
        title: title?.trim() || undefined,
        visitedAt: now,
      })
    }

    const overflow = await db.visits
      .orderBy('visitedAt')
      .reverse()
      .offset(MAX_HISTORY)
      .primaryKeys()
    if (overflow.length > 0) {
      await db.visits.bulkDelete(overflow)
    }
  })
}

export async function clearHistory(): Promise<void> {
  await openDb()
  await db.visits.clear()
}

export async function listBookmarks(): Promise<Bookmark[]> {
  await openDb()
  return db.bookmarks.orderBy('createdAt').reverse().toArray()
}

export async function getBookmarkByUrl(url: string): Promise<Bookmark | undefined> {
  await openDb()
  return db.bookmarks.where('url').equals(url.trim()).first()
}

export async function addBookmark(url: string, title?: string): Promise<Bookmark> {
  const trimmed = url.trim()
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    throw new Error('invalid bookmark url')
  }
  await openDb()
  const existing = await db.bookmarks.where('url').equals(trimmed).first()
  if (existing) {
    const next = {
      ...existing,
      title: title?.trim() || existing.title,
    }
    await db.bookmarks.put(next)
    return next
  }
  const row: Bookmark = {
    id: createId(),
    url: trimmed,
    title: title?.trim() || trimmed,
    createdAt: new Date().toISOString(),
  }
  await db.bookmarks.add(row)
  return row
}

export async function removeBookmark(id: string): Promise<void> {
  await openDb()
  await db.bookmarks.delete(id)
}

export async function removeBookmarkByUrl(url: string): Promise<void> {
  await openDb()
  const existing = await db.bookmarks.where('url').equals(url.trim()).first()
  if (existing) await db.bookmarks.delete(existing.id)
}
