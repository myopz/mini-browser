import { resolvePageUrl } from '@/lib/resolve-url'

const SEARCH_ENDPOINT = 'https://www.bing.com/search?q='

/** 相对当前页导航：/path、./x、../x、?q、#hash */
function looksLikeRelativeNav(input: string): boolean {
  return (
    input.startsWith('/') ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    input.startsWith('?') ||
    input.startsWith('#')
  )
}

/**
 * 看起来像「主机名开头」的输入（含可选端口/路径），必须绝对化，
 * 不能交给 new URL(input, base)，否则 163.com 会变成 https://example.com/163.com。
 */
function looksLikeHostFirst(input: string): boolean {
  if (/\s/.test(input)) return false
  if (/^localhost(:\d+)?([/?#].*)?$/i.test(input)) return true
  // 163.com / www.163.com/news / github.com:443/foo
  return /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/i.test(input)
}

/**
 * 将地址栏输入规范为可导航的绝对 URL。
 * - 完整 URL / //host → 解析
 * - 相对路径 → 基于当前页
 * - 域名或 host/path → https://…
 * - 其它文本 → Bing 搜索
 */
export function normalizeOmniboxInput(raw: string, baseUrl = ''): string {
  const next = raw.trim()
  if (!next) return next

  if (/^https?:\/\//i.test(next)) {
    try {
      return new URL(next).href
    } catch {
      return next
    }
  }

  if (next.startsWith('//')) {
    return resolvePageUrl(next, baseUrl || 'https://example.com/')
  }

  if (looksLikeRelativeNav(next)) {
    if (!baseUrl) {
      return `${SEARCH_ENDPOINT}${encodeURIComponent(next)}`
    }
    return resolvePageUrl(next, baseUrl)
  }

  if (looksLikeHostFirst(next)) {
    try {
      return new URL(`https://${next}`).href
    } catch {
      return `https://${next}`
    }
  }

  return `${SEARCH_ENDPOINT}${encodeURIComponent(next)}`
}
