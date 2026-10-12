import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'

import { appNavItems } from '@/config/appNav'
import {
  appNavIconTone,
  appNavIndicatorClass,
} from '@/config/appNavIconTone'
import { cn } from '@/lib/utils'

type DockEdge = 'left' | 'right' | 'top' | 'bottom'

const DOCK_EDGE_KEY = 'empty-dock-edge'
/** 可视槽位数（超出则滑动浏览，类似灵动岛窗口） */
const DOCK_VISIBLE_SLOTS = 8
/** size-11(44) + gap-1(4) */
const DOCK_SLOT_PX = 48
const DOCK_PAD_PX = 12
const DOCK_EDGES: { edge: DockEdge; label: string }[] = [
  { edge: 'left', label: '左侧' },
  { edge: 'right', label: '右侧' },
  { edge: 'top', label: '顶部' },
  { edge: 'bottom', label: '底部' },
]

function clampMenuPos(
  preferred: { x: number; y: number },
  size: { w: number; h: number },
  pad = 8,
) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(pad, preferred.x), Math.max(pad, vw - size.w - pad)),
    y: Math.min(Math.max(pad, preferred.y), Math.max(pad, vh - size.h - pad)),
  }
}

function menuPosFromDock(
  edge: DockEdge,
  dock: DOMRect,
  menuW: number,
  menuH: number,
) {
  const gap = 10
  let x: number
  let y: number
  if (edge === 'left') {
    x = dock.right + gap
    y = dock.top + dock.height / 2 - menuH / 2
  } else if (edge === 'right') {
    x = dock.left - gap - menuW
    y = dock.top + dock.height / 2 - menuH / 2
  } else if (edge === 'top') {
    x = dock.left + dock.width / 2 - menuW / 2
    y = dock.bottom + gap
  } else {
    x = dock.left + dock.width / 2 - menuW / 2
    y = dock.top - gap - menuH
  }
  return clampMenuPos({ x, y }, { w: menuW, h: menuH })
}

function readDockEdge(): DockEdge {
  try {
    const v = localStorage.getItem(DOCK_EDGE_KEY)
    if (v === 'left' || v === 'right' || v === 'top' || v === 'bottom') return v
  } catch {
    /* ignore */
  }
  return 'left'
}

type TipState = {
  label: string
  x: number
  y: number
  transform: string
}

function useDockTip(edge: DockEdge) {
  const [tip, setTip] = useState<TipState | null>(null)

  useEffect(() => {
    if (!tip) return
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [tip])

  const showFromEl = (label: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    if (edge === 'left') {
      setTip({
        label,
        x: r.right + 10,
        y: r.top + r.height / 2,
        transform: 'translateY(-50%)',
      })
    } else if (edge === 'right') {
      setTip({
        label,
        x: r.left - 10,
        y: r.top + r.height / 2,
        transform: 'translate(-100%, -50%)',
      })
    } else if (edge === 'top') {
      setTip({
        label,
        x: r.left + r.width / 2,
        y: r.bottom + 10,
        transform: 'translateX(-50%)',
      })
    } else {
      setTip({
        label,
        x: r.left + r.width / 2,
        y: r.top - 10,
        transform: 'translate(-50%, -100%)',
      })
    }
  }

  const tipHandlers = (label: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) =>
      showFromEl(label, e.currentTarget),
    onMouseLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) =>
      showFromEl(label, e.currentTarget),
    onBlur: () => setTip(null),
  })

  const tipPortal =
    tip &&
    createPortal(
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none fixed z-[200]',
          'rounded-md border border-white/10 bg-neutral-900/95 px-2.5 py-1',
          'text-xs font-medium whitespace-nowrap text-white shadow-lg backdrop-blur-md',
        )}
        style={{ left: tip.x, top: tip.y, transform: tip.transform }}
      >
        {tip.label}
      </span>,
      document.body,
    )

  return { tipHandlers, tipPortal }
}

/** 桌面：macOS 风格程序坞（可停靠四边，收入边缘后悬停/点击唤出） */
export function AppDock() {
  const { pathname } = useLocation()
  const [edge, setEdge] = useState<DockEdge>(readDockEdge)
  const { tipHandlers, tipPortal } = useDockTip(edge)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [canScrollStart, setCanScrollStart] = useState(false)
  const [canScrollEnd, setCanScrollEnd] = useState(false)
  const hideTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const dockNavRef = useRef<HTMLElement>(null)
  const dockScrollRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const horizontal = edge === 'top' || edge === 'bottom'
  const needsWindow = appNavItems.length > DOCK_VISIBLE_SLOTS
  const windowPx = DOCK_VISIBLE_SLOTS * DOCK_SLOT_PX + DOCK_PAD_PX

  const syncScrollEdges = useCallback(() => {
    const el = dockScrollRef.current
    if (!el || !needsWindow) {
      setCanScrollStart(false)
      setCanScrollEnd(false)
      return
    }
    const start = horizontal ? el.scrollLeft : el.scrollTop
    const max = horizontal
      ? el.scrollWidth - el.clientWidth
      : el.scrollHeight - el.clientHeight
    setCanScrollStart(start > 2)
    setCanScrollEnd(max - start > 2)
  }, [horizontal, needsWindow])

  const clearHideTimer = () => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const showDock = () => {
    clearHideTimer()
    setOpen(true)
  }

  const scheduleHide = () => {
    if (pinned || menuOpen) return
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      hideTimerRef.current = null
    }, 320)
  }

  const changeEdge = (next: DockEdge) => {
    setEdge(next)
    setMenuOpen(false)
    setMenuPos(null)
    setPinned(true)
    setOpen(true)
    try {
      localStorage.setItem(DOCK_EDGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const openPositionMenu = () => {
    clearHideTimer()
    setOpen(true)
    setPinned(true)
    setMenuOpen(true)
    const dock = dockNavRef.current?.getBoundingClientRect()
    if (dock) setMenuPos(menuPosFromDock(edge, dock, 144, 190))
  }

  useEffect(() => () => clearHideTimer(), [])

  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !dockNavRef.current) return
    const menuBox = menuRef.current.getBoundingClientRect()
    const dock = dockNavRef.current.getBoundingClientRect()
    const next = menuPosFromDock(edge, dock, menuBox.width, menuBox.height)
    setMenuPos((prev) =>
      prev && prev.x === next.x && prev.y === next.y ? prev : next,
    )
  }, [menuOpen, edge])

  useEffect(() => {
    if (!pinned && !menuOpen) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (rootRef.current && target && !rootRef.current.contains(target)) {
        setPinned(false)
        setMenuOpen(false)
        setMenuPos(null)
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [pinned, menuOpen])

  /** 路由变化时把当前项滑入可视窗口 */
  useEffect(() => {
    const scroller = dockScrollRef.current
    if (!scroller || !needsWindow) return
    const active = scroller.querySelector<HTMLElement>(
      'a[aria-current="page"]',
    )
    active?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    })
    const t = window.setTimeout(syncScrollEdges, 280)
    return () => window.clearTimeout(t)
  }, [pathname, needsWindow, edge, syncScrollEdges])

  useEffect(() => {
    const el = dockScrollRef.current
    if (!el || !needsWindow) {
      setCanScrollStart(false)
      setCanScrollEnd(false)
      return
    }
    syncScrollEdges()
    el.addEventListener('scroll', syncScrollEdges, { passive: true })
    const ro = new ResizeObserver(syncScrollEdges)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', syncScrollEdges)
      ro.disconnect()
    }
  }, [needsWindow, horizontal, open, pinned, syncScrollEdges, edge])

  /** 触控板：主轴滚动映射到坞方向（竖坞也可用横滑） */
  useEffect(() => {
    const el = dockScrollRef.current
    if (!el || !needsWindow) return
    const onWheel = (event: WheelEvent) => {
      let dx = event.deltaX
      let dy = event.deltaY
      if (event.deltaMode === 1) {
        dx *= 16
        dy *= 16
      } else if (event.deltaMode === 2) {
        dx *= el.clientWidth
        dy *= el.clientHeight
      }
      const primary = Math.abs(dx) >= Math.abs(dy) ? dx : dy
      if (primary === 0) return
      event.preventDefault()
      if (horizontal) el.scrollLeft += primary
      else el.scrollTop += primary
      clearHideTimer()
      setOpen(true)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [needsWindow, horizontal])

  if (appNavItems.length === 0) return null

  const visible = open || pinned

  const rootPos =
    edge === 'left'
      ? 'inset-y-0 left-0'
      : edge === 'right'
        ? 'inset-y-0 right-0'
        : edge === 'top'
          ? 'inset-x-0 top-14'
          : 'inset-x-0 bottom-0'

  const hotZone =
    edge === 'left'
      ? 'inset-y-0 left-0 w-3'
      : edge === 'right'
        ? 'inset-y-0 right-0 w-3'
        : edge === 'top'
          ? 'inset-x-0 top-0 h-3'
          : 'inset-x-0 bottom-0 h-3'

  const handlePos =
    edge === 'left'
      ? 'top-1/2 left-0 -translate-y-1/2 h-16 w-3 rounded-r-full border-l-0'
      : edge === 'right'
        ? 'top-1/2 right-0 -translate-y-1/2 h-16 w-3 rounded-l-full border-r-0'
        : edge === 'top'
          ? 'top-0 left-1/2 -translate-x-1/2 h-3 w-16 rounded-b-full border-t-0'
          : 'bottom-0 left-1/2 -translate-x-1/2 h-3 w-16 rounded-t-full border-b-0'

  const handleBar = horizontal
    ? 'bg-foreground/35 h-1 w-8 rounded-full'
    : 'bg-foreground/35 h-8 w-1 rounded-full'

  const indicatorClass =
    edge === 'left'
      ? 'absolute -left-1 top-1/2 h-1 w-1 -translate-y-1/2'
      : edge === 'right'
        ? 'absolute -right-1 top-1/2 h-1 w-1 -translate-y-1/2'
        : edge === 'top'
          ? 'absolute top-0.5 left-1/2 h-1 w-1 -translate-x-1/2'
          : 'absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2'

  const asideMotion = visible
    ? edge === 'left' || edge === 'right'
      ? '-translate-y-1/2 translate-x-0'
      : '-translate-x-1/2 translate-y-0'
    : edge === 'left'
      ? '-translate-y-1/2 -translate-x-[calc(100%+1.25rem)]'
      : edge === 'right'
        ? '-translate-y-1/2 translate-x-[calc(100%+1.25rem)]'
        : edge === 'top'
          ? '-translate-x-1/2 -translate-y-[calc(100%+1.25rem)]'
          : '-translate-x-1/2 translate-y-[calc(100%+1.25rem)]'

  const asideAnchor =
    edge === 'left'
      ? 'top-1/2 left-3'
      : edge === 'right'
        ? 'top-1/2 right-3'
        : edge === 'top'
          ? 'top-3 left-1/2'
          : 'bottom-3 left-1/2'

  return (
    <div
      ref={rootRef}
      id="app-dock-root"
      className={cn(
        'pointer-events-none fixed z-40 hidden md:block',
        rootPos,
      )}
    >
      <div
        className={cn('pointer-events-auto absolute', hotZone)}
        onMouseEnter={showDock}
        onMouseLeave={scheduleHide}
        aria-hidden
      />

      <button
        type="button"
        aria-label={visible ? '收起导航坞' : '展开导航坞'}
        aria-expanded={visible}
        title={visible ? '收起' : '导航'}
        className={cn(
          'pointer-events-auto absolute z-10 flex items-center justify-center',
          'border border-white/25 bg-white/50 shadow-md backdrop-blur-md',
          'dark:border-white/10 dark:bg-neutral-900/50',
          'transition-opacity duration-200',
          handlePos,
          visible ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        onMouseEnter={showDock}
        onClick={() => {
          clearHideTimer()
          setPinned(true)
          setOpen(true)
        }}
      >
        <span className={handleBar} aria-hidden />
      </button>

      <aside
        className={cn(
          'pointer-events-none absolute transition-transform duration-300 ease-out',
          asideAnchor,
          asideMotion,
        )}
        onMouseEnter={showDock}
        onMouseLeave={scheduleHide}
      >
        <nav
          ref={dockNavRef}
          aria-label="功能导航"
          onContextMenu={(e) => {
            e.preventDefault()
            openPositionMenu()
          }}
          className={cn(
            'pointer-events-auto relative overflow-hidden rounded-[1.35rem] p-1.5',
            'border border-white/20 bg-white/55 shadow-[0_8px_32px_rgba(0,0,0,0.12)]',
            'supports-[backdrop-filter]:bg-white/40 dark:border-white/10',
            'dark:bg-neutral-900/55 dark:supports-[backdrop-filter]:bg-neutral-900/40',
            'backdrop-blur-2xl backdrop-saturate-150',
          )}
        >
          <div
            ref={dockScrollRef}
            className={cn(
              'items-center gap-1',
              horizontal ? 'flex flex-row' : 'flex flex-col',
              needsWindow &&
                (horizontal
                  ? 'overflow-x-auto overflow-y-hidden overscroll-x-contain'
                  : 'overflow-y-auto overflow-x-hidden overscroll-y-contain'),
              needsWindow &&
                '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
            )}
            style={
              needsWindow
                ? horizontal
                  ? { maxWidth: windowPx }
                  : { maxHeight: windowPx }
                : undefined
            }
          >
            {appNavItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  end={item.end}
                  aria-label={item.label}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex size-11 shrink-0 items-center justify-center rounded-[0.9rem]',
                      'transition-[transform,background-color,box-shadow] duration-200',
                      'hover:z-10 hover:scale-125 hover:bg-white/70 hover:shadow-md',
                      'dark:hover:bg-white/15',
                      'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                      isActive && 'bg-white/80 shadow-sm dark:bg-white/20',
                    )
                  }
                  {...tipHandlers(item.label)}
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn(
                          'size-[1.35rem] shrink-0 transition-transform duration-200',
                          'group-hover:scale-105',
                          appNavIconTone(item.label, isActive),
                        )}
                        strokeWidth={isActive ? 2.25 : 1.9}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          'rounded-full transition-opacity duration-200',
                          appNavIndicatorClass(item.label),
                          indicatorClass,
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>

          {needsWindow && canScrollStart ? (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute z-[1] from-white/80 to-transparent dark:from-neutral-900/80',
                horizontal
                  ? 'inset-y-1.5 left-1.5 w-5 bg-gradient-to-r'
                  : 'inset-x-1.5 top-1.5 h-5 bg-gradient-to-b',
              )}
            />
          ) : null}
          {needsWindow && canScrollEnd ? (
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute z-[1] from-white/80 to-transparent dark:from-neutral-900/80',
                horizontal
                  ? 'inset-y-1.5 right-1.5 w-5 bg-gradient-to-l'
                  : 'inset-x-1.5 bottom-1.5 h-5 bg-gradient-to-t',
              )}
            />
          ) : null}
        </nav>
        {tipPortal}
      </aside>

      {menuOpen && menuPos ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="程序坞位置"
          className="pointer-events-auto border-border bg-background fixed z-[210] min-w-36 rounded-lg border p-1 shadow-lg"
          style={{ left: menuPos.x, top: menuPos.y }}
          onMouseEnter={showDock}
        >
          <p className="text-muted-foreground px-2.5 py-1.5 text-xs font-semibold">
            停靠位置
          </p>
          {DOCK_EDGES.map((opt) => (
            <button
              key={opt.edge}
              type="button"
              role="menuitemradio"
              aria-checked={edge === opt.edge}
              className={cn(
                'flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                edge === opt.edge
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
              )}
              onClick={() => changeEdge(opt.edge)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
