import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'

import { appNavItems } from '@/config/appNav'
import { appNavIconTone } from '@/config/appNavIconTone'
import { cn } from '@/lib/utils'

/** 与各应用 appNav 兼容的宽类型（to/href 均可选） */
type CarouselNavItem = {
  to?: string
  href?: string
  label: string
  end?: boolean
  icon: LucideIcon
  experimental?: boolean
  match?: (pathname: string) => boolean
  external?: boolean
}

const SLOT_PX_MIN = 32
const SLOT_PX_MAX = 56
/** 触控板滚轮换算：更大则更慢，接近鼠标拖动手感 */
const WHEEL_SLOT_PX = 110
const WHEEL_SNAP_IDLE_MS = 150
const DRAG_THRESHOLD_PX = 8
const SNAP_MS = 220

/** 按岛宽自适应槽距，宽屏拉开间距、窄屏收紧 */
function useSlotPx(widthPx: number, itemCount: number) {
  return useMemo(() => {
    if (widthPx <= 0 || itemCount <= 0) return 40
    const visible = Math.min(Math.max(itemCount, 3), 5)
    const raw = widthPx / (visible + 0.35)
    return Math.min(SLOT_PX_MAX, Math.max(SLOT_PX_MIN, Math.round(raw)))
  }, [widthPx, itemCount])
}

type HeaderNavCarouselProps = {
  items?: CarouselNavItem[]
  className?: string
}

function wrapIndex(index: number, length: number) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

/** 将差值折叠到 (-n/2, n/2] */
function circularDelta(from: number, to: number, length: number) {
  if (length <= 0) return 0
  let d = to - from
  while (d > length / 2) d -= length
  while (d <= -length / 2) d += length
  return d
}

function resolveActiveIndex(pathname: string, items: CarouselNavItem[]): number {
  let best = -1
  let bestLen = -1
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item.to) continue
    const active = item.match
      ? item.match(pathname)
      : Boolean(
          matchPath({ path: item.to, end: item.end ?? false }, pathname),
        )
    if (!active) continue
    const len = item.to.length
    if (len > bestLen) {
      best = i
      bestLen = len
    }
  }
  return best >= 0 ? best : 0
}

function activateItem(
  item: CarouselNavItem,
  navigate: ReturnType<typeof useNavigate>,
) {
  if (item.href) {
    if (item.external !== false) {
      window.open(item.href, '_blank', 'noopener,noreferrer')
    } else {
      window.location.assign(item.href)
    }
    return
  }
  if (item.to) navigate(item.to)
}

export function HeaderNavCarousel({
  items = appNavItems,
  className,
}: HeaderNavCarouselProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const n = items.length
  const shellRef = useRef<HTMLDivElement>(null)
  const [shellWidth, setShellWidth] = useState(0)
  const slotPx = useSlotPx(shellWidth, n)
  const slotPxRef = useRef(slotPx)
  slotPxRef.current = slotPx

  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    const sync = () => setShellWidth(el.clientWidth)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const activeIndex = useMemo(
    () => resolveActiveIndex(pathname, items),
    [pathname, items],
  )

  /** 连续居中位置；整数为吸附项 */
  const [focus, setFocus] = useState(activeIndex)
  const focusRef = useRef(focus)
  focusRef.current = focus

  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)
  const pointerIdRef = useRef<number | null>(null)
  const dragStartXRef = useRef(0)
  const dragOriginFocusRef = useRef(0)
  const dragMovedRef = useRef(false)
  const pressedIndexRef = useRef<number | null>(null)
  const animFrameRef = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const wheelSnapTimerRef = useRef(0)
  const wheelRafRef = useRef(0)
  const wheelAccumRef = useRef(0)
  const [tip, setTip] = useState<{
    label: string
    x: number
    y: number
  } | null>(null)

  const showTip = useCallback((label: string, el: HTMLElement) => {
    if (draggingRef.current || dragMovedRef.current) return
    const r = el.getBoundingClientRect()
    setTip({
      label,
      x: r.left + r.width / 2,
      y: r.bottom + 8,
    })
  }, [])

  const hideTip = useCallback(() => setTip(null), [])

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

  const stopAnim = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = 0
    }
  }, [])

  const animateTo = useCallback(
    (target: number) => {
      stopAnim()
      const start = focusRef.current
      const delta = circularDelta(start, target, n)
      const end = start + delta
      if (Math.abs(delta) < 0.001) {
        setFocus(wrapIndex(Math.round(end), n))
        return
      }
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / SNAP_MS)
        const eased = 1 - (1 - t) ** 3
        if (t >= 1) {
          setFocus(wrapIndex(Math.round(end), n))
          animFrameRef.current = 0
          return
        }
        setFocus(start + delta * eased)
        animFrameRef.current = requestAnimationFrame(tick)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    },
    [n, stopAnim],
  )

  useEffect(() => () => stopAnim(), [stopAnim])

  /** 路由变化时回正到当前页（程序坞 / 功能导航 / 外链返回等）；滑动浏览不触发 */
  const routeSyncKeyRef = useRef(pathname)
  useEffect(() => {
    if (routeSyncKeyRef.current === pathname) return
    routeSyncKeyRef.current = pathname
    if (draggingRef.current) return
    animateTo(activeIndex)
  }, [pathname, activeIndex, animateTo])

  /** 触控板：按像素连续跟手，停滑后再吸附（避免 discrete step 抖动） */
  useEffect(() => {
    const el = rootRef.current
    if (!el || n <= 0) return

    const flushWheel = () => {
      wheelRafRef.current = 0
      if (wheelAccumRef.current === 0) return
      focusRef.current += wheelAccumRef.current
      wheelAccumRef.current = 0
      setFocus(focusRef.current)
    }

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
      // 轨道内主轴滚动都映射为横向，双指横/竖滑都能带动
      const horizontal = Math.abs(dx) >= Math.abs(dy) ? dx : dy
      if (horizontal === 0) return

      event.preventDefault()
      stopAnim()
      wheelAccumRef.current += horizontal / WHEEL_SLOT_PX
      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(flushWheel)
      }

      window.clearTimeout(wheelSnapTimerRef.current)
      wheelSnapTimerRef.current = window.setTimeout(() => {
        if (wheelRafRef.current) {
          cancelAnimationFrame(wheelRafRef.current)
          flushWheel()
        }
        animateTo(wrapIndex(Math.round(focusRef.current), n))
      }, WHEEL_SNAP_IDLE_MS)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.clearTimeout(wheelSnapTimerRef.current)
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current)
    }
  }, [animateTo, n, stopAnim])

  const stepFocus = useCallback(
    (dir: -1 | 1) => {
      if (n <= 0) return
      const current = Math.round(focusRef.current)
      animateTo(wrapIndex(current + dir, n))
    },
    [animateTo, n],
  )

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    stopAnim()
    hideTip()
    pointerIdRef.current = event.pointerId
    dragStartXRef.current = event.clientX
    dragOriginFocusRef.current = focusRef.current
    dragMovedRef.current = false
    draggingRef.current = true
    setDragging(true)
    const target = event.target as HTMLElement | null
    const hit = target?.closest?.('[data-nav-index]')
    const raw = hit?.getAttribute('data-nav-index')
    pressedIndexRef.current =
      raw != null && raw !== '' ? Number(raw) : null
    // 超过拖拽阈值后再 capture，避免吞掉 click
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return
    const dx = event.clientX - dragStartXRef.current
    if (!dragMovedRef.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return
    if (!dragMovedRef.current) {
      dragMovedRef.current = true
      hideTip()
      try {
        rootRef.current?.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    }
    // 手指右滑 → 显示左侧项 → focus 减小；不回绑路由 active
    setFocus(dragOriginFocusRef.current - dx / slotPxRef.current)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== event.pointerId) return
    const moved = dragMovedRef.current
    const pressed = pressedIndexRef.current
    pointerIdRef.current = null
    pressedIndexRef.current = null
    draggingRef.current = false
    setDragging(false)
    try {
      if (rootRef.current?.hasPointerCapture(event.pointerId)) {
        rootRef.current.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* already released */
    }
    if (moved) {
      // 仅吸附到最近预览项，不回到路由匹配项
      animateTo(wrapIndex(Math.round(focusRef.current), n))
      return
    }
    // 轻点：在 pointerup 里跳转（比依赖 click 更稳，且不被 capture 打断）
    if (pressed != null && items[pressed]) {
      animateTo(pressed)
      activateItem(items[pressed], navigate)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      stepFocus(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      stepFocus(1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const index = wrapIndex(Math.round(focusRef.current), n)
      const item = items[index]
      if (!item) return
      animateTo(index)
      activateItem(item, navigate)
    }
  }

  if (n === 0) return null

  const focusRounded = wrapIndex(Math.round(focus), n)

  return (
    <div
      ref={shellRef}
      className={cn(
        'relative z-10 mx-auto flex w-full min-w-0 max-w-[13.5rem] items-center justify-center sm:max-w-[16.5rem] md:max-w-[18.5rem] lg:max-w-[20rem]',
        className,
      )}
    >
      {/* iPhone 磨砂玻璃岛：居中限宽，左右留白更大 */}
      <div
        className={cn(
          'header-nav-glass h-9 w-full min-w-0 sm:h-10',
          'transition-transform duration-300 ease-out',
          dragging && 'scale-[1.01]',
        )}
      >
        <div className="header-nav-glass__body">
          <div aria-hidden className="header-nav-glass__sheen" />

          <div
            ref={rootRef}
            role="listbox"
            aria-label="功能导航"
            aria-activedescendant={`header-nav-opt-${focusRounded}`}
            tabIndex={0}
            className={cn(
              'relative z-[3] h-full w-full touch-none outline-none select-none',
              'focus-visible:ring-2 focus-visible:ring-black/12 focus-visible:ring-inset dark:focus-visible:ring-white/20',
              dragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{
              maskImage:
                'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)',
              WebkitMaskImage:
                'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              {items.map((item, i) => {
                const delta = circularDelta(focus, i, n)
                const abs = Math.abs(delta)
                const scale = abs < 0.5 ? 1 : abs < 1.5 ? 0.78 : 0.64
                const opacity = abs < 0.5 ? 1 : abs < 1.5 ? 0.72 : 0.42
                const isCenter = focusRounded === i
                const Icon = item.icon
                const isRouteActive = !item.href && activeIndex === i

                return (
                  <button
                    key={`${item.label}-${item.href ?? item.to}`}
                    id={`header-nav-opt-${i}`}
                    type="button"
                    role="option"
                    data-nav-index={i}
                    aria-label={item.label}
                    aria-selected={isCenter}
                    tabIndex={-1}
                    className={cn(
                      'absolute flex size-8 items-center justify-center rounded-full sm:size-9',
                      'transition-[color,filter,box-shadow,background] duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/25',
                      isCenter
                        ? cn(
                            'header-nav-home',
                            isRouteActive && 'header-nav-home--active',
                          )
                        : 'bg-transparent hover:brightness-110',
                    )}
                    style={{
                      transform: `translateX(${delta * slotPx}px) scale(${scale})`,
                      opacity,
                      zIndex: Math.round(20 - abs * 4),
                      willChange: 'transform, opacity',
                    }}
                    onMouseEnter={(e) => showTip(item.label, e.currentTarget)}
                    onMouseLeave={hideTip}
                    onFocus={(e) => showTip(item.label, e.currentTarget)}
                    onBlur={hideTip}
                  >
                    <Icon
                      className={cn(
                        'relative z-[1] size-4 shrink-0 sm:size-[1.1rem]',
                        appNavIconTone(item.label, isCenter),
                      )}
                      strokeWidth={isCenter ? 2.25 : 1.9}
                      aria-hidden
                    />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {tip
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[200] -translate-x-1/2 rounded-md border border-white/10 bg-neutral-900/95 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg backdrop-blur-md"
              style={{ left: tip.x, top: tip.y }}
            >
              {tip.label}
            </span>,
            document.body,
          )
        : null}
    </div>
  )
}
