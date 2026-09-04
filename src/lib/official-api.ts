import { OFFICIAL_ORIGIN } from '@/config/site'

/**
 * 解析应打到官网的 API 路径。
 * - 已在 ittoolplus.cn（含 www）：同源相对路径，避免 apex/www 互跨 CORS
 * - 本地开发：相对路径，由 Vite 反代到官网
 * - 其它部署源：绝对 URL（依赖官网 nginx CORS）
 */
export function officialApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host === 'ittoolplus.cn' || host.endsWith('.ittoolplus.cn')) {
      return normalized
    }
  }

  if (import.meta.env.DEV) {
    return normalized
  }

  return `${OFFICIAL_ORIGIN}${normalized}`
}
