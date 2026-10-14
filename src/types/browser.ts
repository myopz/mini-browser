export type NavHistory = {
  stack: string[]
  index: number
}

/** proxy：同源路径代理 iframe；remote：Cloudflare Browser Run Live View */
export type BrowseMode = 'proxy' | 'remote'

export type BrowserTab = {
  id: string
  title: string
  url: string
  frameSrc: string
  nav: NavHistory
  mode?: BrowseMode
  remoteSessionId?: string
  remoteError?: string
}

export type Bookmark = {
  id: string
  title: string
  url: string
  createdAt: string
}

export type Visit = {
  id: string
  url: string
  title?: string
  visitedAt: string
}

export const EMPTY_NAV: NavHistory = { stack: [], index: -1 }

export function titleFromUrl(url: string): string {
  if (!url) return '新标签页'
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

export function createEmptyTab(id: string): BrowserTab {
  return {
    id,
    title: '新标签页',
    url: '',
    frameSrc: '',
    nav: { ...EMPTY_NAV, stack: [] },
    mode: 'proxy',
  }
}
