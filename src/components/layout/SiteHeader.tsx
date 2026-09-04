import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Globe, HeartHandshake, Home, List } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { BrandLogo } from '@/components/BrandLogo'
import { DonateDialog } from '@/components/DonateDialog'
import { siteConfig } from '@/config/site'
import { cn } from '@/lib/utils'

const navItems: {
  to: string
  label: string
  end: boolean
  icon: LucideIcon
}[] = [
  { to: '/', label: '首页', end: true, icon: Home },
  { to: '/list', label: '列表', end: false, icon: List },
]

const linkClassName =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary/60 sm:px-3'

function NavLabel({ children }: { children: ReactNode }) {
  return <span className="hidden sm:inline">{children}</span>
}

export function SiteHeader() {
  const [donateOpen, setDonateOpen] = useState(false)

  return (
    <header className="border-border/80 bg-background/80 sticky top-0 z-40 shrink-0 border-b pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
        <a
          href={siteConfig.homeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-display text-foreground group flex min-w-0 items-center gap-2 text-base font-bold tracking-tight sm:gap-2.5 sm:text-lg"
        >
          <BrandLogo className="size-7 shrink-0 transition-transform group-hover:scale-105 sm:size-8" />
          <span className="truncate">{siteConfig.name}</span>
        </a>

        <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <a
            href={siteConfig.homeUrl}
            aria-label="官网首页"
            title="官网首页"
            className={cn(
              linkClassName,
              'size-10 sm:h-auto sm:w-auto',
            )}
          >
            <Globe className="size-4 shrink-0" aria-hidden />
            <NavLabel>官网</NavLabel>
          </a>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={`${item.label}-${item.to}`}
                to={item.to}
                end={item.end}
                aria-label={item.label}
                title={item.label}
                className={({ isActive }) =>
                  cn(
                    'inline-flex size-10 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors sm:h-auto sm:w-auto sm:px-3 sm:py-2',
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <NavLabel>{item.label}</NavLabel>
              </NavLink>
            )
          })}
          <button
            type="button"
            onClick={() => setDonateOpen(true)}
            aria-label="捐助"
            title="捐助"
            className={cn(
              linkClassName,
              'text-accent size-10 font-semibold hover:bg-accent/15 hover:text-accent-foreground sm:h-auto sm:w-auto',
            )}
          >
            <HeartHandshake className="size-4 shrink-0" aria-hidden />
            <NavLabel>捐助</NavLabel>
          </button>
        </nav>
      </div>

      <DonateDialog open={donateOpen} onOpenChange={setDonateOpen} />
    </header>
  )
}
