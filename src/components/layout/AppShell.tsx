import { Outlet } from 'react-router-dom'

import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { AppDock } from '@/components/layout/AppDock'

export function AppShell() {
  return (
    <div className="relative flex min-h-svh min-w-0 flex-col overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,oklch(0.85_0.06_200_/_0.45),transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(to right, oklch(0.9 0.01 230 / 0.5) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.9 0.01 230 / 0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <SiteHeader />
      <AppDock />

      <main className="relative z-10 min-w-0 flex-1">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  )
}
