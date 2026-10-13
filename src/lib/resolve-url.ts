/**
 * 将跳转地址解析为绝对 URL。
 * 无域名（相对路径、`?query`、`#hash`、`//host`）时，基于当前分屏 URL 补全。
 */
export function resolvePageUrl(raw: string, baseUrl: string): string {
  const next = raw.trim()
  if (!next) return next

  try {
    if (/^https?:\/\//i.test(next)) {
      return new URL(next).href
    }
    if (next.startsWith('//')) {
      const base = new URL(normalizeAbsoluteBase(baseUrl))
      return new URL(`${base.protocol}${next}`).href
    }
    const base = normalizeAbsoluteBase(baseUrl)
    return new URL(next, base).href
  } catch {
    if (/^https?:\/\//i.test(next)) return next
    try {
      return new URL(`https://${next}`).href
    } catch {
      return next
    }
  }
}

function normalizeAbsoluteBase(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) return 'https://example.com/'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
