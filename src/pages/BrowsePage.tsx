import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  Clock,
  ExternalLink,
  Globe,
  RefreshCw,
  Star,
} from 'lucide-react'

import { LibraryDialog } from '@/components/browser/LibraryDialog'
import { TabBar } from '@/components/browser/TabBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  addBookmark,
  clearHistory,
  getBookmarkByUrl,
  listBookmarks,
  listHistory,
  listRecentVisits,
  recordVisit,
  removeBookmark,
  removeBookmarkByUrl,
} from '@/lib/db'
import {
  decodeEmbedLocation,
  EMBED_PROXY_PATH,
  toEmbedSrc,
  toOriginalUrl,
} from '@/lib/embed-url'
import { normalizeOmniboxInput } from '@/lib/omnibox'
import { resolvePageUrl } from '@/lib/resolve-url'
import { urlsRoughlyEqual } from '@/lib/urls'
import { cn, createId } from '@/lib/utils'
import {
  createEmptyTab,
  titleFromUrl,
  type Bookmark,
  type BrowserTab,
  type Visit,
} from '@/types/browser'

const QUICK_LINKS = [
  { label: 'Example', url: 'https://example.com/' },
  { label: 'Wikipedia', url: 'https://zh.wikipedia.org/' },
  { label: 'Bing', url: 'https://www.bing.com/' },
] as const

const TABS_STORAGE_KEY = 'mini-browser-tabs-v1'

function loadTabsFromSession(): { tabs: BrowserTab[]; activeTabId: string } | null {
  try {
    const raw = sessionStorage.getItem(TABS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { tabs: BrowserTab[]; activeTabId: string }
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function persistTabs(tabs: BrowserTab[], activeTabId: string) {
  try {
    sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify({ tabs, activeTabId }))
  } catch {
    /* ignore quota */
  }
}

export function BrowsePage() {
  const [tabs, setTabs] = useState<BrowserTab[]>(() => {
    const saved = loadTabsFromSession()
    return saved?.tabs ?? [createEmptyTab(createId())]
  })
  const [activeTabId, setActiveTabId] = useState(() => {
    const saved = loadTabsFromSession()
    return saved?.activeTabId ?? saved?.tabs[0]?.id ?? createId()
  })
  const [urlDraft, setUrlDraft] = useState(() => {
    const saved = loadTabsFromSession()
    const id = saved?.activeTabId
    return saved?.tabs.find((t) => t.id === id)?.url ?? ''
  })
  const [recent, setRecent] = useState<Visit[]>([])
  const [history, setHistory] = useState<Visit[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [bookmarked, setBookmarked] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryMode, setLibraryMode] = useState<'bookmarks' | 'history'>(
    'bookmarks',
  )

  const iframeRefs = useRef<Map<string, HTMLIFrameElement>>(new Map())
  const urlFocusedRef = useRef(false)
  const expectedNavUrlRef = useRef<Map<string, string | null>>(new Map())
  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const currentUrl = activeTab?.url ?? ''
  const originalUrl = currentUrl ? toOriginalUrl(currentUrl) : ''
  const canGoBack = (activeTab?.nav.index ?? -1) > 0
  const canGoForward =
    !!activeTab &&
    activeTab.nav.index >= 0 &&
    activeTab.nav.index < activeTab.nav.stack.length - 1

  useEffect(() => {
    tabsRef.current = tabs
    activeTabIdRef.current = activeTabId
    persistTabs(tabs, activeTabId)
  }, [tabs, activeTabId])

  useEffect(() => {
    void Promise.all([listRecentVisits(), listHistory(), listBookmarks()]).then(
      ([r, h, b]) => {
        setRecent(r)
        setHistory(h)
        setBookmarks(b)
      },
    )
  }, [])

  useEffect(() => {
    if (!activeTab) return
    if (!urlFocusedRef.current) setUrlDraft(activeTab.url)
    void getBookmarkByUrl(activeTab.url).then((b) => setBookmarked(Boolean(b)))
  }, [activeTab?.id, activeTab?.url])

  function updateTab(id: string, patch: Partial<BrowserTab>) {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    )
  }

  function pushNavHistory(tabId: string, url: string) {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t
        const idx = Math.min(t.nav.index, Math.max(t.nav.stack.length - 1, -1))
        if (idx >= 0 && t.nav.stack[idx] && urlsRoughlyEqual(t.nav.stack[idx], url)) {
          return t
        }
        return {
          ...t,
          nav: {
            stack: [...t.nav.stack.slice(0, idx + 1), url],
            index: idx + 1,
          },
        }
      }),
    )
  }

  function applyNavigatedUrl(tabId: string, nextRaw: string) {
    const tab = tabsRef.current.find((t) => t.id === tabId)
    const base = tab?.url || nextRaw
    const stripped = toOriginalUrl(nextRaw)
    const next = resolvePageUrl(stripped, base)
    if (!next) return
    const finalUrl = toOriginalUrl(next)

    const expected = expectedNavUrlRef.current.get(tabId) ?? null
    if (expected && urlsRoughlyEqual(expected, finalUrl)) {
      expectedNavUrlRef.current.set(tabId, null)
    } else if (!expected) {
      pushNavHistory(tabId, finalUrl)
    } else {
      expectedNavUrlRef.current.set(tabId, null)
    }

    const title = titleFromUrl(finalUrl)
    updateTab(tabId, {
      url: finalUrl,
      title,
      frameSrc: tab?.frameSrc || toEmbedSrc(finalUrl, tabId),
    })

    if (tabId === activeTabIdRef.current && !urlFocusedRef.current) {
      setUrlDraft(finalUrl)
    }

    void recordVisit(finalUrl, title).then(async () => {
      setRecent(await listRecentVisits())
      setHistory(await listHistory())
    })
    if (tabId === activeTabIdRef.current) {
      void getBookmarkByUrl(finalUrl).then((b) => setBookmarked(Boolean(b)))
    }
  }

  function loadUrlInTab(
    tabId: string,
    url: string,
    mode: 'push' | 'expected',
  ) {
    const tab = tabsRef.current.find((t) => t.id === tabId)
    const normalized = normalizeOmniboxInput(url, tab?.url ?? '')
    if (!normalized || !/^https?:\/\//i.test(normalized)) return

    if (mode === 'push') {
      pushNavHistory(tabId, normalized)
    } else {
      expectedNavUrlRef.current.set(tabId, normalized)
    }

    const title = titleFromUrl(normalized)
    const frameSrc = toEmbedSrc(normalized, tabId)
    updateTab(tabId, { url: normalized, title, frameSrc })
    if (tabId === activeTabIdRef.current) {
      setUrlDraft(normalized)
      void getBookmarkByUrl(normalized).then((b) => setBookmarked(Boolean(b)))
    }
    void recordVisit(normalized, title).then(async () => {
      setRecent(await listRecentVisits())
      setHistory(await listHistory())
    })
  }

  function openInNewTab(url: string, activate = true) {
    const id = createId()
    const tab = createEmptyTab(id)
    setTabs((prev) => [...prev, tab])
    if (activate) setActiveTabId(id)
    // defer load so tab exists in state
    window.setTimeout(() => loadUrlInTab(id, url, 'push'), 0)
  }

  function openUrl(url: string, newTab = false) {
    if (newTab) {
      openInNewTab(url)
      return
    }
    if (!activeTab) {
      openInNewTab(url)
      return
    }
    loadUrlInTab(activeTab.id, url, 'push')
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as {
        source?: string
        paneId?: string
        type?: string
        url?: string
        title?: string
      }
      if (data?.source !== 'ittoolplus-embed') return

      let tabId = data.paneId
      if (!tabId) {
        for (const [id, el] of iframeRefs.current) {
          if (event.source === el.contentWindow) {
            tabId = id
            break
          }
        }
      }
      if (!tabId) return

      if (data.type === 'navigate' && typeof data.url === 'string') {
        const decoded = decodeEmbedLocation(data.url) ?? data.url
        applyNavigatedUrl(tabId, decoded)
        return
      }

      if (data.type === 'open' && typeof data.url === 'string') {
        const tab = tabsRef.current.find((t) => t.id === tabId)
        const decoded = decodeEmbedLocation(data.url) ?? data.url
        const next = resolvePageUrl(decoded, tab?.url || decoded)
        if (!next) return
        openInNewTab(toOriginalUrl(next))
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // sync active iframe location periodically
  useEffect(() => {
    if (!activeTab?.frameSrc) return
    const iframe = iframeRefs.current.get(activeTab.id)
    if (!iframe) return
    const tabId = activeTab.id

    function readIframeTargetUrl(): string | null {
      const win = iframeRefs.current.get(tabId)?.contentWindow
      if (!win) return null
      try {
        const href = win.location.href
        if (!href || href === 'about:blank') return null
        const decoded = decodeEmbedLocation(href)
        const base =
          tabsRef.current.find((t) => t.id === tabId)?.url || decoded || href
        if (decoded) return resolvePageUrl(decoded, base)
        if (href.startsWith('http') && !href.includes(EMBED_PROXY_PATH)) {
          return resolvePageUrl(href, base)
        }
        return null
      } catch {
        return null
      }
    }

    function syncFromFrame() {
      const decoded = readIframeTargetUrl()
      if (!decoded) return
      const tab = tabsRef.current.find((t) => t.id === tabId)
      if (!tab || urlsRoughlyEqual(decoded, tab.url)) return
      applyNavigatedUrl(tabId, decoded)
    }

    iframe.addEventListener('load', syncFromFrame)
    const timer = window.setInterval(syncFromFrame, 800)
    syncFromFrame()
    return () => {
      iframe.removeEventListener('load', syncFromFrame)
      window.clearInterval(timer)
    }
  }, [activeTab?.id, activeTab?.frameSrc])

  function commitUrl() {
    const next = urlDraft.trim()
    if (!next || !activeTab) {
      urlFocusedRef.current = false
      setShowSuggestions(false)
      return
    }
    const resolved = normalizeOmniboxInput(next, currentUrl)
    if (currentUrl && urlsRoughlyEqual(resolved, currentUrl)) {
      setUrlDraft(resolved)
      urlFocusedRef.current = false
      setShowSuggestions(false)
      return
    }
    loadUrlInTab(activeTab.id, resolved, 'push')
    urlFocusedRef.current = false
    setShowSuggestions(false)
  }

  function onUrlKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
      commitUrl()
    }
    if (event.key === 'Escape') {
      setUrlDraft(currentUrl)
      urlFocusedRef.current = false
      setShowSuggestions(false)
      event.currentTarget.blur()
    }
  }

  function goBack() {
    if (!activeTab || !canGoBack) return
    const nextIndex = activeTab.nav.index - 1
    const target = activeTab.nav.stack[nextIndex]
    if (!target) return
    updateTab(activeTab.id, {
      nav: { stack: activeTab.nav.stack, index: nextIndex },
    })
    loadUrlInTab(activeTab.id, target, 'expected')
  }

  function goForward() {
    if (!activeTab || !canGoForward) return
    const nextIndex = activeTab.nav.index + 1
    const target = activeTab.nav.stack[nextIndex]
    if (!target) return
    updateTab(activeTab.id, {
      nav: { stack: activeTab.nav.stack, index: nextIndex },
    })
    loadUrlInTab(activeTab.id, target, 'expected')
  }

  function refresh() {
    if (!activeTab?.url) return
    const win = iframeRefs.current.get(activeTab.id)?.contentWindow
    try {
      win?.location.reload()
      return
    } catch {
      /* cross-origin */
    }
    updateTab(activeTab.id, {
      frameSrc: `${toEmbedSrc(activeTab.url, activeTab.id)}&_r=${Date.now()}`,
    })
  }

  function selectTab(id: string) {
    setActiveTabId(id)
    const tab = tabs.find((t) => t.id === id)
    if (tab && !urlFocusedRef.current) setUrlDraft(tab.url)
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      if (prev.length <= 1) {
        const fresh = createEmptyTab(createId())
        setActiveTabId(fresh.id)
        setUrlDraft('')
        return [fresh]
      }
      const idx = prev.findIndex((t) => t.id === id)
      const next = prev.filter((t) => t.id !== id)
      if (activeTabIdRef.current === id) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0]
        setActiveTabId(fallback.id)
        setUrlDraft(fallback.url)
      }
      iframeRefs.current.delete(id)
      return next
    })
  }

  function newTab() {
    const id = createId()
    setTabs((prev) => [...prev, createEmptyTab(id)])
    setActiveTabId(id)
    setUrlDraft('')
  }

  async function toggleBookmark() {
    if (!originalUrl) return
    if (bookmarked) {
      await removeBookmarkByUrl(originalUrl)
      setBookmarked(false)
    } else {
      await addBookmark(originalUrl, activeTab?.title || titleFromUrl(originalUrl))
      setBookmarked(true)
    }
    setBookmarks(await listBookmarks())
  }

  async function handleClearHistory() {
    await clearHistory()
    setHistory([])
    setRecent([])
  }

  const suggestionQuery = urlDraft.trim().toLowerCase()
  const filteredRecent = recent
    .filter((v) => {
      if (!suggestionQuery) return true
      return (
        v.url.toLowerCase().includes(suggestionQuery) ||
        (v.title?.toLowerCase().includes(suggestionQuery) ?? false)
      )
    })
    .slice(0, 8)

  return (
    <div className="bg-background flex h-svh min-h-0 w-full flex-col overflow-hidden">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={selectTab}
        onClose={closeTab}
        onNew={newTab}
      />

      <div className="border-border bg-background z-30 flex h-11 shrink-0 items-center gap-1 border-b px-1.5 sm:px-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title="后退"
          disabled={!canGoBack}
          onClick={goBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title="前进"
          disabled={!canGoForward}
          onClick={goForward}
        >
          <ArrowRight className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title="刷新"
          disabled={!currentUrl}
          onClick={refresh}
        >
          <RefreshCw className="size-4" />
        </Button>

        <div className="relative min-w-0 flex-1">
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={onUrlKeyDown}
            onFocus={() => {
              urlFocusedRef.current = true
              setShowSuggestions(true)
            }}
            onBlur={() => {
              window.setTimeout(() => {
                urlFocusedRef.current = false
                setShowSuggestions(false)
              }, 150)
            }}
            className="h-8 w-full truncate px-3 text-sm"
            spellCheck={false}
            placeholder="输入网址或搜索…"
            aria-label="页面 URL"
            autoComplete="off"
          />
          {showSuggestions && filteredRecent.length > 0 ? (
            <ul className="border-border bg-popover absolute top-[calc(100%+4px)] right-0 left-0 z-40 max-h-56 overflow-auto rounded-md border py-1 shadow-md">
              {filteredRecent.map((visit) => (
                <li key={visit.id}>
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openUrl(visit.url)}
                  >
                    <span className="text-foreground truncate font-medium">
                      {visit.title || visit.url}
                    </span>
                    {visit.title ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {visit.url}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          title={bookmarked ? '取消收藏' : '收藏'}
          disabled={!originalUrl}
          onClick={() => void toggleBookmark()}
        >
          <Star
            className={cn(
              'size-4',
              bookmarked && 'fill-amber-400 text-amber-500',
            )}
          />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          title="收藏夹"
          onClick={() => {
            setLibraryMode('bookmarks')
            void listBookmarks().then(setBookmarks)
            setLibraryOpen(true)
          }}
        >
          <BookmarkIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          title="历史记录"
          onClick={() => {
            setLibraryMode('history')
            void listHistory().then(setHistory)
            setLibraryOpen(true)
          }}
        >
          <Clock className="size-4" />
        </Button>

        {originalUrl ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            title="新标签打开原站"
            asChild
          >
            <a href={originalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : null}
      </div>

      {bookmarks.length > 0 ? (
        <div className="border-border bg-muted/20 flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b px-2">
          {bookmarks.slice(0, 24).map((bm) => (
            <button
              key={bm.id}
              type="button"
              className="text-muted-foreground hover:bg-accent hover:text-foreground max-w-36 shrink-0 truncate rounded px-2 py-0.5 text-xs"
              title={bm.url}
              onClick={() => openUrl(bm.url)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  openUrl(bm.url, true)
                }
              }}
            >
              {bm.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-white">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          if (!tab.frameSrc) {
            return active ? (
              <div
                key={tab.id}
                className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-center"
              >
                <div className="flex flex-col items-center gap-2">
                  <Globe className={cn('text-accent size-10 opacity-80')} />
                  <p className="text-foreground font-display text-lg font-semibold">
                    输入网址开始浏览
                  </p>
                  <p className="max-w-sm text-sm leading-relaxed">
                    支持多标签、收藏与历史。输入域名、完整 URL 或关键词搜索。
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {QUICK_LINKS.map((item) => (
                    <Button
                      key={item.url}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openUrl(item.url)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null
          }

          return (
            <iframe
              key={tab.id}
              ref={(el) => {
                if (el) iframeRefs.current.set(tab.id, el)
                else iframeRefs.current.delete(tab.id)
              }}
              name={tab.id}
              title={tab.title}
              src={tab.frameSrc}
              className={cn(
                'absolute inset-0 h-full w-full border-0 bg-white',
                active ? 'z-10' : 'pointer-events-none z-0 invisible',
              )}
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-same-origin"
            />
          )
        })}
      </div>

      <LibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        mode={libraryMode}
        bookmarks={bookmarks}
        history={history}
        onOpenUrl={openUrl}
        onRemoveBookmark={(id) => {
          void removeBookmark(id).then(async () => {
            setBookmarks(await listBookmarks())
            if (originalUrl) {
              setBookmarked(Boolean(await getBookmarkByUrl(originalUrl)))
            }
          })
        }}
        onClearHistory={() => void handleClearHistory()}
      />
    </div>
  )
}
