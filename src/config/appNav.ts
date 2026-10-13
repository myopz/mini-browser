import type { LucideIcon } from 'lucide-react'
import { Globe } from 'lucide-react'

export type AppNavItem = {
  to: string
  label: string
  end?: boolean
  icon: LucideIcon
  experimental?: boolean
  match?: (pathname: string) => boolean
}

/** 全屏浏览器模式无顶栏导航；保留类型供布局组件编译。 */
export const appNavItems: AppNavItem[] = [
  { to: '/', label: '浏览器', end: true, icon: Globe },
]
