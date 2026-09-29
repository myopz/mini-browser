import type { LucideIcon } from 'lucide-react'
import { Home, List } from 'lucide-react'

export type AppNavItem = {
  to: string
  label: string
  end?: boolean
  icon: LucideIcon
  experimental?: boolean
  match?: (pathname: string) => boolean
}

export const appNavItems: AppNavItem[] = [
  { to: '/', label: '首页', end: true, icon: Home },
  { to: '/list', label: '列表', end: false, icon: List },
]
