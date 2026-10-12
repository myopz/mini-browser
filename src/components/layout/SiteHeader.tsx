import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BookOpen,
  ChevronDown,
  Globe,
  HeartHandshake,
  Link2,
  ListTree,
  Mail,
  MessageCircle,
  MessagesSquare,
  Phone,
  QrCode,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { BrandLogo } from '@/components/BrandLogo'
import { HeaderNavCarousel } from '@/components/layout/HeaderNavCarousel'
import { DonateDialog } from '@/components/DonateDialog'
import { WechatGzhDialog } from '@/components/WechatGzhDialog'
import { WechatGroupDialog } from '@/components/WechatGroupDialog'
import { appNavItems } from '@/config/appNav'
import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

const triggerClassName =
  'flex items-center justify-center gap-1.5 rounded-md p-2 text-sm font-medium transition-colors md:px-3 md:py-1.5'

const panelClassName =
  'border-border bg-background absolute top-full right-0 z-50 mt-2 min-w-48 origin-top-right rounded-lg border p-1.5 shadow-lg'

const itemClassName =
  'text-muted-foreground hover:bg-secondary/70 hover:text-foreground flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors'

const quickLinkIcons: Record<string, LucideIcon> = {
  官网: Globe,
  工具集: Wrench,
  'AI 助手': MessageCircle,
  手册: BookOpen,
}

type NavDropdownProps = {
  label: string
  icon: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  accent?: boolean
}

function NavDropdown({
  label,
  icon,
  open,
  onOpenChange,
  children,
  accent,
}: NavDropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setTip(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, onOpenChange])

  const showTip = (el: HTMLElement) => {
    if (open) return
    const r = el.getBoundingClientRect()
    setTip({ x: r.left + r.width / 2, y: r.bottom + 8 })
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        title={label}
        className={cn(
          triggerClassName,
          accent
            ? open
              ? 'bg-accent/15 text-accent-foreground font-semibold'
              : 'text-accent hover:bg-accent/15 hover:text-accent-foreground font-semibold'
            : open
              ? 'bg-secondary/70 text-foreground'
              : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
        )}
        onClick={() => {
          setTip(null)
          onOpenChange(!open)
        }}
        onMouseEnter={(e) => showTip(e.currentTarget)}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => showTip(e.currentTarget)}
        onBlur={() => setTip(null)}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 opacity-70 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          role="menu"
          aria-label={label}
          className={panelClassName}
        >
          {children}
        </div>
      ) : null}
      {tip
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[200] -translate-x-1/2 rounded-md border border-white/10 bg-neutral-900/95 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg backdrop-blur-md"
              style={{ left: tip.x, top: tip.y }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </div>
  )
}

function AppNavMenu() {
  const [open, setOpen] = useState(false)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
    setTip(null)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className={cn(
          triggerClassName,
          open
            ? 'bg-secondary/70 text-foreground'
            : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
        )}
        aria-label={open ? '关闭功能导航' : '功能导航'}
        title={open ? '关闭功能导航' : '功能导航'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setTip(null)
          setOpen((v) => !v)
        }}
        onMouseEnter={(e) => {
          if (open) return
          const r = e.currentTarget.getBoundingClientRect()
          setTip({ x: r.left + r.width / 2, y: r.bottom + 8 })
        }}
        onMouseLeave={() => setTip(null)}
        onFocus={(e) => {
          if (open) return
          const r = e.currentTarget.getBoundingClientRect()
          setTip({ x: r.left + r.width / 2, y: r.bottom + 8 })
        }}
        onBlur={() => setTip(null)}
      >
        <ListTree className="size-4 shrink-0" />
        <span className="hidden md:inline">功能导航</span>
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="功能导航"
          className={cn(
            'border-border bg-background absolute top-full left-0 z-50 mt-2 w-56',
            'rounded-lg border p-2 shadow-lg',
          )}
        >
          <p className="text-muted-foreground px-2 py-1.5 text-xs font-semibold tracking-wider uppercase">
            功能导航
          </p>
          <nav className="flex flex-col gap-0.5" aria-label="功能导航">
            {appNavItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={`${item.label}-${item.to}`}
                  to={item.to}
                  end={item.end}
                  aria-label={item.label}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                    )
                  }
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
        </div>
      ) : null}

      {tip
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[200] -translate-x-1/2 rounded-md border border-white/10 bg-neutral-900/95 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-white shadow-lg backdrop-blur-md"
              style={{ left: tip.x, top: tip.y }}
            >
              {open ? '关闭功能导航' : '功能导航'}
            </span>,
            document.body,
          )
        : null}
    </div>
  )
}

export function SiteHeader() {
  const [menu, setMenu] = useState<'links' | 'contact' | null>(null)
  const [donateOpen, setDonateOpen] = useState(false)
  const [wechatOpen, setWechatOpen] = useState(false)
  const [gzhOpen, setGzhOpen] = useState(false)

  return (
    <header
      className={cn(
        'border-border/80 bg-background/80 sticky top-0 z-50 shrink-0 border-b backdrop-blur-md',
        'pt-[env(safe-area-inset-top)]',
      )}
    >
      <div className="grid h-14 w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 sm:gap-6 sm:px-6">
        <div className="flex min-w-0 items-center justify-start gap-0.5 sm:gap-1">
          <a
            href={siteConfig.homeUrl}
            className="font-display text-foreground group flex min-w-0 shrink-0 flex-col items-center gap-0 leading-none lg:flex-row lg:gap-2 lg:text-lg lg:leading-normal"
          >
            <BrandLogo className="size-7 shrink-0 transition-transform group-hover:scale-105 sm:size-8" />
            <span className="max-w-[4.5rem] truncate text-[10px] font-bold tracking-tight lg:max-w-[9rem] lg:text-lg xl:max-w-none">
              {siteConfig.name}
            </span>
          </a>
          <AppNavMenu />
        </div>

        <HeaderNavCarousel />

        <nav className="flex min-w-0 items-center justify-end gap-0 sm:gap-1">
          <NavDropdown
            label="快速链接"
            icon={<Link2 className="size-4 shrink-0" aria-hidden />}
            open={menu === 'links'}
            onOpenChange={(open) => setMenu(open ? 'links' : null)}
          >
            {siteConfig.quickLinks.map((item) => {
              const Icon = quickLinkIcons[item.label] ?? Link2
              return (
                <a
                  key={item.label}
                  role="menuitem"
                  href={item.href}
                  className={itemClassName}
                  {...(item.href.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  onClick={() => setMenu(null)}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </a>
              )
            })}
            <button
              type="button"
              role="menuitem"
              className={cn(
                itemClassName,
                'text-accent hover:text-accent-foreground font-semibold',
              )}
              onClick={() => {
                setMenu(null)
                setDonateOpen(true)
              }}
            >
              <HeartHandshake className="size-4 shrink-0" aria-hidden />
              赞赏
            </button>
          </NavDropdown>

          <NavDropdown
            label="联系"
            icon={<Phone className="size-4 shrink-0" aria-hidden />}
            open={menu === 'contact'}
            onOpenChange={(open) => setMenu(open ? 'contact' : null)}
            accent
          >
            <div
              role="menuitem"
              className={cn(itemClassName, 'pointer-events-none')}
            >
              <User className="size-4 shrink-0" aria-hidden />
              {siteConfig.contactName}
            </div>
            <a
              role="menuitem"
              href={`tel:${siteConfig.contactPhone}`}
              className={itemClassName}
              onClick={() => setMenu(null)}
            >
              <Phone className="size-4 shrink-0" aria-hidden />
              {siteConfig.contactPhone}
            </a>
            <a
              role="menuitem"
              href={`mailto:${siteConfig.contactEmail}`}
              className={itemClassName}
              onClick={() => setMenu(null)}
            >
              <Mail className="size-4 shrink-0" aria-hidden />
              {siteConfig.contactEmail}
            </a>
            <button
              type="button"
              role="menuitem"
              className={cn(
                itemClassName,
                'text-accent hover:text-accent-foreground font-semibold',
              )}
              onClick={() => {
                setMenu(null)
                setWechatOpen(true)
              }}
            >
              <MessagesSquare className="size-4 shrink-0" aria-hidden />
              微信群聊
            </button>
            <button
              type="button"
              role="menuitem"
              className={cn(
                itemClassName,
                'text-accent hover:text-accent-foreground font-semibold',
              )}
              onClick={() => {
                setMenu(null)
                setGzhOpen(true)
              }}
            >
              <QrCode className="size-4 shrink-0" aria-hidden />
              微信公众号
            </button>
          </NavDropdown>

        </nav>
      </div>

      <DonateDialog open={donateOpen} onOpenChange={setDonateOpen} />
      <WechatGroupDialog open={wechatOpen} onOpenChange={setWechatOpen} />
      <WechatGzhDialog open={gzhOpen} onOpenChange={setGzhOpen} />
    </header>
  )
}
