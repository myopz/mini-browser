/**
 * 嵌入代理固定在站点根路径，不跟 Vite `base`（/browser/）走，
 * 避免 iframe 与前端子路径耦合。
 */
export const EMBED_PROXY_PATH = '/browser-proxy'

/**
 * 优先使用路径式代理地址，避免入口页再跳转一次，并让相对资源解析更稳。
 * 入口式 `?url=` 仍可由 decodeEmbedLocation 识别。
 */
export function toEmbedSrc(url: string, paneId?: string): string {
  try {
    const target = new URL(url)
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    const path = `${EMBED_PROXY_PATH}/${target.protocol.replace(':', '')}/${target.host}${target.pathname}${target.search}`
    if (!paneId) return path
    const sep = path.includes('?') ? '&' : '?'
    return `${path}${sep}paneId=${encodeURIComponent(paneId)}`
  } catch {
    const params = new URLSearchParams({ url })
    if (paneId) params.set('paneId', paneId)
    return `${EMBED_PROXY_PATH}?${params.toString()}`
  }
}

/**
 * 从 iframe 当前地址还原目标站 URL。
 * 支持入口式 `/browser-proxy?url=` 与路径式 `/browser-proxy/https/host/path`。
 */
export function decodeEmbedLocation(href: string): string | null {
  try {
    const u = new URL(
      href,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    )
    if (u.pathname === EMBED_PROXY_PATH) {
      const raw = u.searchParams.get('url')
      return raw?.trim() || null
    }
    if (!u.pathname.startsWith(`${EMBED_PROXY_PATH}/`)) return null
    const rest = u.pathname.slice(EMBED_PROXY_PATH.length + 1)
    const match = rest.match(/^(https?)\/([^/]+)(\/.*)?$/)
    if (!match) return null
    const [, protocol, host, pathPart = '/'] = match
    const target = new URL(`${protocol}://${host}${pathPart}`)
    // 复制查询，但去掉我们附加的 paneId
    u.searchParams.forEach((value, key) => {
      if (key === 'paneId') return
      target.searchParams.append(key, value)
    })
    target.hash = u.hash
    return target.href
  } catch {
    return null
  }
}

/** 将可能含代理路径的地址还原为原站 URL；已是原站则原样返回。 */
export function toOriginalUrl(href: string): string {
  const trimmed = href.trim()
  if (!trimmed) return trimmed
  return decodeEmbedLocation(trimmed) ?? trimmed
}
