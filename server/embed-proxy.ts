import type { IncomingMessage, ServerResponse } from 'node:http'

export const PROXY_PATH = '/browser-proxy'

/**
 * 本机若有 HTTPS 解密（公司代理 / 杀软），Node 会报 UNABLE_TO_VERIFY_LEAF_SIGNATURE。
 * - BROWSER_PROXY_INSECURE_TLS=1 强制关闭校验
 * - BROWSER_PROXY_INSECURE_TLS=0 强制开启校验
 * - 未设置时：非 production 默认关闭校验（便于本地开发）
 */
export function applyProxyTlsPolicy(): boolean {
  const flag = process.env.BROWSER_PROXY_INSECURE_TLS
  const relax =
    flag === '1' || flag === 'true'
      ? true
      : flag === '0' || flag === 'false'
        ? false
        : process.env.NODE_ENV !== 'production'
  if (relax) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }
  return relax
}

const proxyTlsRelaxed = applyProxyTlsPolicy()

function formatUpstreamFetchError(error: unknown): string {
  if (!(error instanceof Error)) return '无法获取目标页面'
  const cause = error.cause as
    | (Error & { code?: string })
    | undefined
  const code = cause?.code || (error as Error & { code?: string }).code || ''
  const detail = cause?.message || error.message

  if (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    /unable to verify the first certificate/i.test(detail)
  ) {
    return `TLS 证书校验失败（${code || 'CERT'}）。本机可能装了 HTTPS 解密/公司代理。请设置环境变量 BROWSER_PROXY_INSECURE_TLS=1 后重启 pnpm dev。`
  }
  if (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return `网络不可达（${code}）：${detail}`
  }
  if (detail && detail !== 'fetch failed') return detail
  if (code) return `fetch failed（${code}）`
  return error.message || 'fetch failed'
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
])

const ATTR_URL_KEYS = new Set([
  'src',
  'href',
  'poster',
  'data',
  'action',
  'formaction',
  'xlink:href',
  'data-src',
  'data-original',
  'data-url',
  'data-href',
  'data-lazy-src',
  'data-lazy',
  'requesturl',
  'logourl',
  'aria-url',
])

/** 属性值像绝对 URL，且属性名暗示资源地址时也改写（如 requestUrl / xxxUrl） */
function shouldRewriteAttrUrl(key: string, value: string): boolean {
  const k = key.toLowerCase()
  if (ATTR_URL_KEYS.has(k) || k === 'srcset' || k === 'imagesrcset') return true
  const v = value.trim()
  if (!/^(https?:|\/\/)/i.test(v)) return false
  return /(src|href|url)$/i.test(k)
}

/**
 * 改写上游 Set-Cookie，使其能在代理域生效且不污染其它站点请求：
 * - 去掉 Domain（否则落在 localhost / ittoolplus.cn 会被拒）
 * - Path 限制到 `/browser-proxy/{proto}/{host}...`，避免各站 Cookie 全部 Path=/
 *   堆在同一 host 上，最终触发 Node 431 → 动态 chunk 加载失败（ChunkLoadError）
 * - http 开发域下去掉 Secure，并把 SameSite=None 降为 Lax（None 必须配 Secure）
 */
function rewriteSetCookieForProxy(cookie: string, target: URL): string {
  const prefix = `${PROXY_PATH}/${target.protocol.replace(':', '')}/${target.host}`
  let out = cookie.replace(/;\s*domain\s*=\s*[^;]*/gi, '')

  if (/;\s*path\s*=/i.test(out)) {
    out = out.replace(/;\s*path\s*=\s*([^;]*)/gi, (_m, raw: string) => {
      let path = String(raw).trim()
      if (!path.startsWith('/')) path = `/${path}`
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        return `; Path=${path}`
      }
      if (path === '/') return `; Path=${prefix}/`
      return `; Path=${prefix}${path}`
    })
  } else {
    out += `; Path=${prefix}/`
  }

  out = out.replace(/;\s*secure\b/gi, '')
  out = out.replace(/;\s*samesite\s*=\s*none/gi, '; SameSite=Lax')
  return out
}

/** /browser-proxy/https/example.com/path?q=1 → target URL */
export function parseProxyPath(pathname: string, search = ''): URL | null {
  if (!pathname.startsWith(`${PROXY_PATH}/`)) return null
  const rest = pathname.slice(PROXY_PATH.length + 1)
  const match = rest.match(/^(https?)\/([^/]+)(\/.*)?$/)
  if (!match) return null
  const [, protocol, host, pathPart = '/'] = match
  try {
    return new URL(`${protocol}://${host}${pathPart}${search}`)
  } catch {
    return null
  }
}

/** https://example.com/a/b → /browser-proxy/https/example.com/a/b */
export function toProxyPath(target: string): string {
  const u = new URL(target)
  const path = u.pathname || '/'
  return `${PROXY_PATH}/${u.protocol.replace(':', '')}/${u.host}${path}${u.search}`
}

function isFrameBlocked(
  xFrameOptions: string | null,
  csp: string | null,
): boolean {
  if (xFrameOptions) {
    const v = xFrameOptions.toLowerCase().trim()
    if (v === 'deny' || v === 'sameorigin') return true
  }
  if (!csp) return false
  const m = csp.match(/frame-ancestors\s+([^;]+)/i)
  if (!m) return false
  const ancestors = m[1].toLowerCase()
  if (ancestors.includes('*')) return false
  if (ancestors.includes("'none'")) return true
  // 有白名单且未放行任意来源：保守走代理
  return true
}

/** 带 type=module 的 SPA 在路径代理下易白屏，仅这类站点直接嵌原站 */
function looksLikeModuleSpa(html: string): boolean {
  return (
    /type\s*=\s*["']module["']/i.test(html) ||
    /type\s*=\s*["']importmap["']/i.test(html) ||
    /<script[^>]+type\s*=\s*["']module["']/i.test(html)
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 风控 / 人机验证页：代理下几乎必失败，且常触发反复跳转 */
function isChallengePage(url: URL, html: string): boolean {
  const path = url.pathname.toLowerCase()
  if (
    /\/(?:account\/)?unhuman\b|\/captcha\b|\/challenge\b|\/security[\w-]*check\b|\/cdn-cgi\/(?:challenge|captcha)|\/verify(?:human|bot)?\b/i.test(
      path,
    )
  ) {
    return true
  }
  const head = html.slice(0, 12_000)
  return /安全验证|人机验证|访问验证|Just a moment\.\.\.|Attention Required!|cf-browser-verification|challenge-platform|id=["']challenge-form["']/i.test(
    head,
  )
}

/**
 * 跨域打包 SPA（如知乎 heifetz、GitHub assets）：禁止 iframe 时只能走路径代理，
 * 但 CDN chunk / 登录态 / 风控会在代理下反复报错刷新，应尽早放弃。
 */
function looksLikeCrossOriginBundledSpa(html: string, pageUrl: URL): boolean {
  const pageHost = pageUrl.hostname.toLowerCase()
  const srcRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi
  let foreignScripts = 0
  let m: RegExpExecArray | null
  while ((m = srcRe.exec(html))) {
    let absolute: URL
    try {
      absolute = new URL(m[1], pageUrl)
    } catch {
      continue
    }
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') continue
    if (absolute.hostname.toLowerCase() !== pageHost) foreignScripts++
  }
  const shell =
    /<div[^>]+id=["'](?:root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i.test(
      html,
    ) || /id=["'](?:root|app|__next|__nuxt)["']/i.test(html)
  if (foreignScripts >= 5) return true
  if (shell && foreignScripts >= 3) return true
  if (
    foreignScripts >= 2 &&
    /runtime\.[^"'>]+\.js|webpackJsonp|__webpack_require__/i.test(html)
  ) {
    return true
  }
  return false
}

/** 粗略注册域：example.com.cn 这类会偏短，但对 .com/.net/.cn 主站足够 */
function roughRegistrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  return parts.slice(-2).join('.')
}

type HostFanoutSignals = {
  siblingHosts: number
  hardForeignScripts: number
  hostLock: boolean
}

/** 统计多子域入口、跨注册域脚本，以及页面是否硬编码校验自身 host */
function collectHostFanoutSignals(
  html: string,
  pageUrl: URL,
): HostFanoutSignals {
  const pageHost = pageUrl.hostname.toLowerCase()
  const pageReg = roughRegistrableDomain(pageHost)
  const escapedHost = pageHost.replace(/\./g, '\\.')

  const srcRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi
  let hardForeignScripts = 0
  let m: RegExpExecArray | null
  while ((m = srcRe.exec(html))) {
    let absolute: URL
    try {
      absolute = new URL(m[1], pageUrl)
    } catch {
      continue
    }
    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') continue
    const host = absolute.hostname.toLowerCase()
    if (
      host !== pageHost &&
      roughRegistrableDomain(host) !== pageReg
    ) {
      hardForeignScripts++
    }
  }

  const linkRe = /(?:href|src)\s*=\s*["']https?:\/\/([a-z0-9.-]+)/gi
  const siblings = new Set<string>()
  while ((m = linkRe.exec(html))) {
    const host = m[1].toLowerCase()
    if (
      host !== pageHost &&
      roughRegistrableDomain(host) === pageReg
    ) {
      siblings.add(host)
    }
  }

  // 网易等：先读 location.host，再与 "www.163.com" 字面量比较
  const hostLock =
    /location\.host(?:name)?/.test(html) &&
    new RegExp(
      `['"]${escapedHost}['"]\\s*(?:!==|!=|===|==)|(?:!==|!=|===|==)\\s*['"]${escapedHost}['"]`,
      'i',
    ).test(html)

  return {
    siblingHosts: siblings.size,
    hardForeignScripts,
    hostLock,
  }
}

/**
 * 网易首页这类门户：不拦 iframe，但依赖大量子域 + 异注册域 CDN，
 * 路径代理下会跨 host 跳转/接口失败并反复刷错。
 */
function looksLikeUnproxyableMultiHostSite(
  html: string,
  pageUrl: URL,
): boolean {
  const signals = collectHostFanoutSignals(html, pageUrl)
  if (
    signals.hostLock &&
    (signals.hardForeignScripts >= 3 || signals.siblingHosts >= 8)
  ) {
    return true
  }
  if (signals.siblingHosts >= 40 && signals.hardForeignScripts >= 2) {
    return true
  }
  return false
}

/**
 * 原站允许被 iframe 时，优先直嵌：module SPA / 多子域门户在路径代理下几乎必坏。
 * 禁止嵌入的站点仍只能走路径代理。
 */
function shouldDirectEmbedOrigin(
  html: string,
  pageUrl: URL,
  frameBlocked: boolean,
): boolean {
  if (frameBlocked) return false
  return (
    looksLikeModuleSpa(html) || looksLikeUnproxyableMultiHostSite(html, pageUrl)
  )
}

/** 上游常把 https 入口 302 到 http；直嵌时优先 https，避免混合内容 / 二次跳转 */
function preferHttpsHref(url: URL): string {
  if (url.protocol !== 'http:') return url.href
  const httpsUrl = new URL(url.href)
  httpsUrl.protocol = 'https:'
  return httpsUrl.href
}

function directEmbedOpeningHtml(targetHref: string, paneId: string): string {
  const safeUrl = JSON.stringify(targetHref)
  const safePane = JSON.stringify(paneId)
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Opening…</title>
<script>
(function(){
  try{
    parent.postMessage({
      source:'ittoolplus-embed',
      paneId:${safePane},
      type:'navigate',
      url:${safeUrl}
    },'*');
  }catch(e){}
  location.replace(${safeUrl});
})();
</script>
</head><body></body></html>`
}

/**
 * 在线浏览器：仅对明确无法代理的风控页提前失败；
 * 禁止 iframe / 跨域 SPA / 多子域站仍走路径代理尝试（比直接拒绝更符合浏览器预期）。
 * 传入 force=true 时跳过全部预检。
 */
function proxyEmbedUnsupportedReason(
  url: URL,
  html: string,
  _frameBlocked: boolean,
  force = false,
): string | null {
  if (force) return null
  if (isChallengePage(url, html)) {
    return '目标站触发了安全验证或人机检测，嵌入代理通常无法完成验证。可尝试「强制代理」或新标签打开原站。'
  }
  return null
}

/** 高风险但仍尝试代理的站点，写入响应头便于排查 */
function proxyEmbedRiskHint(
  url: URL,
  html: string,
  frameBlocked: boolean,
): string | null {
  if (frameBlocked && looksLikeCrossOriginBundledSpa(html, url)) {
    return 'cross-origin-spa'
  }
  if (looksLikeUnproxyableMultiHostSite(html, url)) {
    return 'multi-host'
  }
  return null
}

function unsupportedEmbedHtml(
  target: URL,
  reason: string,
  title = '无法嵌入此页面',
  forceProxyHref?: string,
): string {
  const safeHref = escapeHtml(target.href)
  const safeHost = escapeHtml(target.host)
  const safeReason = escapeHtml(reason)
  const safeTitle = escapeHtml(title)
  // 与 src/index.css / BrandLogo 对齐的独立失败页（iframe 内无法复用 React）
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${safeTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --background: oklch(0.985 0.004 230);
    --foreground: oklch(0.22 0.03 250);
    --muted-foreground: oklch(0.5 0.025 240);
    --primary: oklch(0.42 0.08 230);
    --primary-foreground: oklch(0.98 0.01 200);
    --accent: oklch(0.62 0.11 180);
    --accent-foreground: oklch(0.18 0.03 200);
    --border: oklch(0.9 0.015 230);
    --card: oklch(1 0 0);
    --radius: 0.625rem;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
    color: var(--foreground);
    background:
      radial-gradient(ellipse 80% 60% at 10% -10%, oklch(0.92 0.04 185 / 0.45), transparent 55%),
      radial-gradient(ellipse 70% 50% at 100% 0%, oklch(0.93 0.03 230 / 0.5), transparent 50%),
      var(--background);
    -webkit-font-smoothing: antialiased;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
  }
  .panel {
    width: min(100%, 26rem);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem 1.35rem 1.35rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1.15rem;
  }
  .brand svg { width: 1.75rem; height: 1.75rem; flex-shrink: 0; }
  .brand-meta { min-width: 0; }
  .brand-name {
    font-family: 'Plus Jakarta Sans', 'DM Sans', ui-sans-serif, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: oklch(0.42 0.06 200 / 0.85);
    margin: 0;
  }
  .badge {
    display: inline-block;
    margin-top: 0.2rem;
    font-size: 0.625rem;
    font-weight: 600;
    line-height: 1.2;
    padding: 0.1rem 0.4rem;
    border-radius: 0.25rem;
    border: 1px solid oklch(0.75 0.12 75 / 0.4);
    background: oklch(0.92 0.06 85 / 0.35);
    color: oklch(0.42 0.1 70);
  }
  h1 {
    font-family: 'Plus Jakarta Sans', 'DM Sans', ui-sans-serif, sans-serif;
    font-size: 1.15rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.25;
    margin: 0 0 0.65rem;
  }
  .reason {
    margin: 0 0 0.85rem;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--muted-foreground);
  }
  .host {
    margin: 0 0 1.15rem;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--muted-foreground);
    word-break: break-all;
    padding: 0.5rem 0.65rem;
    border-radius: calc(var(--radius) - 2px);
    background: oklch(0.965 0.01 220);
    border: 1px solid var(--border);
  }
  .host strong {
    display: block;
    font-weight: 600;
    color: var(--foreground);
    margin-bottom: 0.15rem;
  }
  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 2.25rem;
    padding: 0 1rem;
    border-radius: calc(var(--radius) - 2px);
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    cursor: pointer;
  }
  .btn-primary {
    background: var(--primary);
    color: var(--primary-foreground);
    border: 1px solid transparent;
  }
  .btn-primary:hover { background: oklch(0.38 0.08 230); }
  .btn-outline {
    background: var(--background);
    color: var(--foreground);
    border: 1px solid var(--border);
  }
  .btn-outline:hover {
    background: oklch(0.94 0.025 180);
    border-color: oklch(0.8 0.06 185);
    color: var(--accent-foreground);
  }
  .btn svg { width: 0.9rem; height: 0.9rem; flex-shrink: 0; }
</style>
</head>
<body>
  <main class="panel">
    <div class="brand">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="oklch(0.42 0.08 230)"/>
        <rect x="12" y="12" width="40" height="40" rx="10" stroke="oklch(0.62 0.11 180)" stroke-width="3.5" fill="none"/>
        <rect x="29" y="20" width="6" height="24" rx="3" fill="oklch(0.62 0.11 180)"/>
        <rect x="20" y="29" width="24" height="6" rx="3" fill="oklch(0.62 0.11 180)"/>
        <circle cx="46" cy="18" r="3.5" fill="oklch(0.98 0.01 200)"/>
        <circle cx="46" cy="18" r="1.5" fill="oklch(0.42 0.08 230)"/>
      </svg>
      <div class="brand-meta">
        <p class="brand-name">ittoolplus</p>
        <span class="badge">实验版</span>
      </div>
    </div>
    <h1>${safeTitle}</h1>
    <p class="reason">${safeReason}</p>
    <p class="host"><strong>${safeHost}</strong>${safeHref}</p>
    <div class="actions">
      <a class="btn btn-primary" href="${safeHref}" target="_blank" rel="noopener noreferrer">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
        新标签打开原站
      </a>
      ${
        forceProxyHref
          ? `<a class="btn btn-outline" href="${escapeHtml(forceProxyHref)}">仍用代理打开</a>`
          : ''
      }
    </div>
  </main>
</body>
</html>`
}

function entryRedirectHtml(next: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<title>Opening…</title>
<script>location.replace(${JSON.stringify(next)})</script>
</head><body></body></html>`
}

async function readRequestBody(
  req: IncomingMessage,
): Promise<Buffer | undefined> {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return undefined
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/** 把查询参数里的本地 origin 替换成目标站，避免上报接口因 _o=localhost 返回 400 */
function scrubLocalOriginInUrl(target: URL, localOrigin: string): void {
  const siteOrigin = target.origin
  if (!localOrigin || localOrigin === siteOrigin) return
  for (const [key, value] of [...target.searchParams.entries()]) {
    if (!value.includes(localOrigin)) continue
    target.searchParams.set(key, value.split(localOrigin).join(siteOrigin))
  }
}

function scrubLocalOriginInBody(
  body: Buffer,
  contentType: string | undefined,
  localOrigin: string,
  siteOrigin: string,
): Buffer {
  if (!localOrigin || localOrigin === siteOrigin) return body
  if (!contentType || !/json|text|urlencoded|xml|javascript/i.test(contentType)) {
    return body
  }
  const text = body.toString('utf8')
  if (!text.includes(localOrigin)) return body
  return Buffer.from(text.split(localOrigin).join(siteOrigin), 'utf8')
}

/** 从浏览器 Referer（代理路径）还原真实页面 URL，供上游 Referer/Origin */
function decodeBrowserReferer(raw: string | undefined): URL | null {
  if (!raw) return null
  try {
    const ref = new URL(raw)
    if (ref.pathname === PROXY_PATH && ref.searchParams.get('url')) {
      return new URL(ref.searchParams.get('url')!)
    }
    const parsed = parseProxyPath(ref.pathname, ref.search)
    if (!parsed) return null
    parsed.searchParams.delete('paneId')
    return parsed
  } catch {
    return null
  }
}

const BROWSER_LIKE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** curl/node 等工具 UA 会被门户（如网易）直接 403，上游探测改用浏览器 UA */
function resolveUpstreamUserAgent(req: IncomingMessage): string {
  const ua = req.headers['user-agent']
  if (typeof ua !== 'string' || !ua.trim()) return BROWSER_LIKE_UA
  if (
    /^(?:curl|wget|python-requests|python|Go-http-client|Java|okhttp|node|undici|axios)\b/i.test(
      ua,
    )
  ) {
    return BROWSER_LIKE_UA
  }
  return ua
}

function buildUpstreamHeaders(
  req: IncomingMessage,
  target: URL,
): Record<string, string> {
  // 跨子域 API（如 www.163.com → gw.m.163.com）需要页面 Referer，不能写成 API 自身 origin
  const pageFromReferer = decodeBrowserReferer(
    typeof req.headers.referer === 'string' ? req.headers.referer : undefined,
  )
  const pageOrigin = pageFromReferer?.origin ?? target.origin
  const headers: Record<string, string> = {
    'user-agent': resolveUpstreamUserAgent(req),
    accept:
      typeof req.headers.accept === 'string'
        ? req.headers.accept
        : 'text/html,application/xhtml+xml,*/*',
    'accept-language':
      typeof req.headers['accept-language'] === 'string'
        ? req.headers['accept-language']
        : 'zh-CN,zh;q=0.9',
    // 伪装成来自浏览中的页面，减少风控 400
    referer: pageFromReferer
      ? `${pageFromReferer.origin}${pageFromReferer.pathname}${pageFromReferer.search}`
      : target.origin + '/',
    origin: pageOrigin,
  }

  const contentType = req.headers['content-type']
  if (typeof contentType === 'string') {
    headers['content-type'] = contentType
  }

  const contentLength = req.headers['content-length']
  if (typeof contentLength === 'string') {
    headers['content-length'] = contentLength
  }

  // 浏览器 Cookie 已落在代理域；回传上游以维持登录态 / uid
  const cookie = req.headers.cookie
  if (typeof cookie === 'string' && cookie) {
    headers.cookie = cookie
  }

  return headers
}

function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  localOrigin: string,
): void {
  const requestOrigin = req.headers.origin
  // sandbox 无 allow-same-origin 时 Origin 为 "null"
  if (requestOrigin === 'null') {
    res.setHeader('Access-Control-Allow-Origin', 'null')
  } else if (typeof requestOrigin === 'string' && requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin)
  } else {
    res.setHeader('Access-Control-Allow-Origin', localOrigin)
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD')
  const reqHeaders = req.headers['access-control-request-headers']
  res.setHeader(
    'Access-Control-Allow-Headers',
    typeof reqHeaders === 'string' && reqHeaders
      ? reqHeaders
      : 'Content-Type, Accept, Accept-Language, X-Requested-With',
  )
  res.setHeader('Access-Control-Max-Age', '86400')
}

/** 百度统计 / 反作弊等上报接口：代理场景下几乎必然失败，无需真实转发 */
function isIgnorableBeacon(target: URL): boolean {
  const host = target.hostname.toLowerCase()
  if (host === 'miao.baidu.com' || host === 'hm.baidu.com') return true
  const path = target.pathname.toLowerCase()
  if (host.endsWith('.baidu.com') && /\/(abdr|hm\.gif)$/i.test(path)) {
    return true
  }
  return false
}

function proxyUrlFor(
  raw: string,
  pageUrl: URL,
): string | null {
  const trimmed = raw.trim()
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:')
  ) {
    return null
  }
  if (trimmed.startsWith(PROXY_PATH)) return null

  let absolute: URL
  try {
    absolute = new URL(trimmed, pageUrl)
  } catch {
    return null
  }
  if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
    return null
  }
  // 页面为 https 时，HTML 里残留的 http:// 升到 https（与浏览器升级行为对齐）
  if (absolute.protocol === 'http:' && pageUrl.protocol === 'https:') {
    absolute.protocol = 'https:'
  }
  return toProxyPath(absolute.href)
}

function rewriteSrcset(value: string, pageUrl: URL): string {
  return value
    .split(',')
    .map((part) => {
      const chunk = part.trim()
      if (!chunk) return chunk
      const bits = chunk.split(/\s+/)
      const url = bits[0]
      const proxied = proxyUrlFor(url, pageUrl)
      if (!proxied) return chunk
      return [proxied, ...bits.slice(1)].join(' ')
    })
    .join(', ')
}

function rewriteCssUrls(css: string, pageUrl: URL): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _q, raw) => {
    const proxied = proxyUrlFor(String(raw), pageUrl)
    if (!proxied) return full
    return `url(${JSON.stringify(proxied)})`
  })
}

/**
 * 部分站点用「host 不等于主域就 replace(host, 主域)」防盗链。
 * 在代理下会变成 https://www.site.com/browser-proxy/... 直接 404。
 */
function rewriteHostLockJavaScript(js: string): string {
  return js.replace(
    /if\s*\(\s*(?:document\.|window\.)?location\.host(?:name)?\s*!=\s*(['"])[^'"]+\1\s*\)\s*\{\s*(?:window\.)?location\.href\s*=\s*(?:window\.)?location\.href\.replace\(\s*(?:document\.|window\.)?location\.host(?:name)?\s*,\s*(['"])[^'"]+\2\s*\)\s*;?\s*\}/gi,
    '/* ittoolplus: neutralized host-lock redirect */',
  )
}

function rewriteHtml(html: string, pageUrl: URL, paneId: string): string {
  const prefix = `${PROXY_PATH}/${pageUrl.protocol.replace(':', '')}/${pageUrl.host}`
  const baseHref = `${prefix}/`

  let out = html.replace(
    /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi,
    '',
  )

  // 去掉 integrity，避免部分站点 hash 与代理响应头不一致导致拒载
  out = out.replace(/\s+integrity=(["']).*?\1/gi, '')

  // 重写带 URL 的属性
  out = out.replace(
    /<\s*([a-zA-Z][\w:-]*)([^>]*?)>/g,
    (full, tagName: string, attrs: string) => {
      if (full.endsWith('/>') === false && full.includes('</')) return full
      let next = attrs
      const rewriteAttr = (
        m: string,
        name: string,
        value: string,
        quote: string | null,
      ) => {
        const key = name.toLowerCase()
        if (key === 'srcset' || key === 'imagesrcset') {
          const nextVal = rewriteSrcset(value, pageUrl)
          return quote
            ? `${name}=${quote}${nextVal}${quote}`
            : `${name}="${nextVal.replace(/"/g, '&quot;')}"`
        }
        if (!shouldRewriteAttrUrl(key, value)) return m
        // <base> 单独处理
        if (tagName.toLowerCase() === 'base') return m
        const proxied = proxyUrlFor(value, pageUrl)
        if (!proxied) return m
        return quote
          ? `${name}=${quote}${proxied}${quote}`
          : `${name}="${proxied.replace(/"/g, '&quot;')}"`
      }

      // 带引号：src="..." / src='...'
      next = next.replace(
        /([^\s=]+)\s*=\s*(["'])(.*?)\2/gi,
        (m, name: string, quote: string, value: string) =>
          rewriteAttr(m, name, value, quote),
      )
      // 无引号：example.com 的 <script src=/s.js>；/path 会忽略 <base> 打到站点根导致 404
      next = next.replace(
        /([^\s=]+)\s*=\s*([^\s"'=<>`]+)/gi,
        (m, name: string, value: string) => rewriteAttr(m, name, value, null),
      )
      return `<${tagName}${next}>`
    },
  )

  // style 属性里的 url()
  out = out.replace(
    /style\s*=\s*(["'])([\s\S]*?)\1/gi,
    (_m, quote: string, css: string) =>
      `style=${quote}${rewriteCssUrls(css, pageUrl)}${quote}`,
  )

  // <style> 块
  out = out.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_m, attrs: string, css: string) =>
      `<style${attrs}>${rewriteCssUrls(css, pageUrl)}</style>`,
  )

  // 内联脚本里的 host-lock 跳转
  out = out.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (full, attrs: string, code: string) => {
      if (/\bsrc\s*=/i.test(attrs)) return full
      if (!code.trim()) return full
      return `<script${attrs}>${rewriteHostLockJavaScript(code)}</script>`
    },
  )

  // 统一 base 到路径式代理前缀，保证相对路径与 Vite preload 可解析
  out = out.replace(/<base\b[^>]*>/gi, '')
  const baseTag = `<base href="${baseHref.replace(/"/g, '&quot;')}">`
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  } else {
    out = `${baseTag}${out}`
  }

  // 始终注入导航同步：新窗口链接 → 工作区分屏
  out = injectNavigationSync(out, paneId, pageUrl)
  return out
}

function injectNavigationSync(
  html: string,
  paneId: string,
  pageUrl: URL,
): string {
  const safeId = JSON.stringify(paneId)
  const safeOrigin = JSON.stringify(pageUrl.origin)
  // 尽早注入（head 前部），抢在站点脚本之前劫持 window.open / 点击
  const snippet = `<script data-ittoolplus-embed="1">(function(){
  if(window.__ittoolplusEmbedNav) return;
  window.__ittoolplusEmbedNav=1;
  var PANE_ID=${safeId};
  var TARGET_ORIGIN=${safeOrigin};
  var PROXY_PATH=${JSON.stringify(PROXY_PATH)};

  function decodeProxyLocation(){
    try{
      var path=location.pathname;
      if(path.indexOf(PROXY_PATH+'/')!==0) return null;
      var rest=path.slice(PROXY_PATH.length+1);
      var m=rest.match(/^(https?)\\/([^/]+)(\\/.*)?$/);
      if(!m) return null;
      var decoded=new URL(m[1]+'://'+m[2]+(m[3]||'/')+location.search+location.hash);
      decoded.searchParams.delete('paneId');
      return decoded;
    }catch(err){ return null; }
  }

  function currentTargetUrl(){
    var decoded=decodeProxyLocation();
    if(decoded) return decoded.href;
    try{
      var u=new URL(location.href);
      if(u.pathname===PROXY_PATH && u.searchParams.get('url')){
        return u.searchParams.get('url');
      }
    }catch(err){}
    try{
      var base=document.querySelector('base');
      if(base && base.href) return base.href;
    }catch(err){}
    return location.href;
  }

  function notifyNavigate(url){
    if(!url) return;
    try{
      parent.postMessage({source:'ittoolplus-embed',paneId:PANE_ID,type:'navigate',url:url},'*');
    }catch(err){}
  }

  function notifyOpen(url, title){
    if(!url) return;
    try{
      parent.postMessage({
        source:'ittoolplus-embed',
        paneId:PANE_ID,
        type:'open',
        url:url,
        title:title||''
      },'*');
    }catch(err){}
  }

  function isProxyPathname(pathname){
    return pathname===PROXY_PATH || pathname.indexOf(PROXY_PATH+'/')===0;
  }

  /**
   * 页面在 http://localhost 下时，站点 JS 会把 //gw.m.163.com 解析成 http://。
   * 目标站若是 https，则升到 https，避免走 /browser-proxy/http/...。
   */
  function alignToTargetHttps(u){
    if(!u) return u;
    try{
      if(u.protocol==='http:' && String(TARGET_ORIGIN).indexOf('https:')===0){
        u.protocol='https:';
      }
    }catch(err){}
    return u;
  }

  /** /browser-proxy/http/host/... → /browser-proxy/https/host/... */
  function upgradeProxyHttpPath(pathname, search, hash){
    try{
      if(String(TARGET_ORIGIN).indexOf('https:')!==0) return null;
      var prefix=PROXY_PATH+'/http/';
      if(pathname.indexOf(prefix)!==0) return null;
      return PROXY_PATH+'/https/'+pathname.slice(prefix.length)+(search||'')+(hash||'');
    }catch(err){ return null; }
  }

  /**
   * 解析待代理 URL。
   * - 已是 /browser-proxy/... → 相对本页 origin（避免双重包装）
   * - //host 协议相对 → 相对目标站（用 https，而非 localhost 的 http）
   * - 根路径 /s?...（非代理）→ 相对目标站（百度搜索等），绝不能打到 Vite 根
   * - 其它 → 相对 currentTargetUrl
   */
  function resolveUrlForProxy(url){
    var raw=String(url).trim();
    if(!raw) return null;
    try{
      if(raw.indexOf(PROXY_PATH+'/')===0 || raw===PROXY_PATH){
        return new URL(raw, location.origin);
      }
      // 协议相对必须先于「单斜杠根路径」判断
      if(raw.indexOf('//')===0){
        return alignToTargetHttps(new URL(raw, TARGET_ORIGIN+'/'));
      }
      var pathOnly=raw.split(/[?#]/)[0];
      if(raw.charAt(0)==='/' && !isProxyPathname(pathOnly)){
        return alignToTargetHttps(new URL(raw, TARGET_ORIGIN+'/'));
      }
      return alignToTargetHttps(new URL(raw, currentTargetUrl()||TARGET_ORIGIN+'/'));
    }catch(err){ return null; }
  }

  function toProxy(url){
    try{
      var raw=String(url);
      if(raw.indexOf(PROXY_PATH+'/')===0 || raw===PROXY_PATH) return raw;
      var u=resolveUrlForProxy(raw);
      if(!u) return null;
      if(u.protocol!=='http:' && u.protocol!=='https:') return null;
      var nested=unwrapNestedProxyPath(u.pathname, u.search, u.hash);
      if(nested){
        if(PANE_ID) nested+= (nested.indexOf('?')>=0 ? '&' : '?') + 'paneId=' + encodeURIComponent(PANE_ID);
        return nested;
      }
      if(u.origin===location.origin && isProxyPathname(u.pathname)){
        var localPath=u.pathname+u.search+u.hash;
        if(PANE_ID && localPath.indexOf('paneId=')<0){
          localPath+= (localPath.indexOf('?')>=0 ? '&' : '?') + 'paneId=' + encodeURIComponent(PANE_ID);
        }
        return localPath;
      }
      var path=PROXY_PATH+'/'+u.protocol.replace(':','')+'/'+u.host+(u.pathname||'/')+u.search;
      if(PANE_ID){
        path+= (path.indexOf('?')>=0 ? '&' : '?') + 'paneId=' + encodeURIComponent(PANE_ID);
      }
      return path + u.hash;
    }catch(err){ return null; }
  }

  /**
   * 拦截离开代理的跳转。典型坏例：
   * location.href = location.href.replace(location.host, 'www.cnplugins.com')
   * → http://www.cnplugins.com/browser-proxy/https/www.cnplugins.com/...
   * 以及百度 location=/s?... 打到 Vite 根触发 base URL 提示页。
   * @returns {'cancel'|'passthrough'|string} string 为改写后的地址
   */
  function rewriteOutboundNav(url){
    try{
      var raw=String(url);
      if(raw.indexOf(PROXY_PATH+'/')===0 || raw===PROXY_PATH){
        try{
          var probeNav=new URL(raw, location.origin);
          var upNav=upgradeProxyHttpPath(probeNav.pathname, probeNav.search, probeNav.hash);
          return upNav||'passthrough';
        }catch(err){ return 'passthrough'; }
      }
      var abs=new URL(raw, location.href);
      // 代理路径被拼到真实域名上 → 拉回本地，同页则直接取消
      if(abs.origin!==location.origin && abs.pathname.indexOf(PROXY_PATH)===0){
        var local=abs.pathname+abs.search+abs.hash;
        var cur=location.pathname+location.search+location.hash;
        if(local===cur) return 'cancel';
        return upgradeProxyHttpPath(
          abs.pathname, abs.search, abs.hash
        )||local;
      }
      if(abs.origin===location.origin){
        if(isProxyPathname(abs.pathname)){
          return upgradeProxyHttpPath(abs.pathname, abs.search, abs.hash)||'passthrough';
        }
        // /s?... 等根路径本意是目标站，改写进代理
        return toProxy(TARGET_ORIGIN+abs.pathname+abs.search+abs.hash)||'passthrough';
      }
      if(abs.protocol==='http:' || abs.protocol==='https:'){
        return toProxy(abs.href)||'passthrough';
      }
    }catch(err){}
    return 'passthrough';
  }

  function applyLocationPatch(){
    try{
      var proto=Location.prototype;
      function wrapNav(original){
        return function(url){
          var next=rewriteOutboundNav(url);
          if(next==='cancel') return;
          if(next!=='passthrough') return original.call(this, next);
          return original.call(this, url);
        };
      }
      if(typeof proto.assign==='function') proto.assign=wrapNav(proto.assign);
      if(typeof proto.replace==='function') proto.replace=wrapNav(proto.replace);
      var desc=Object.getOwnPropertyDescriptor(proto,'href');
      if(desc && desc.configurable && typeof desc.set==='function'){
        Object.defineProperty(proto,'href',{
          configurable:true,
          enumerable:desc.enumerable,
          get:typeof desc.get==='function' ? function(){ return desc.get.call(this); } : undefined,
          set:function(v){
            var next=rewriteOutboundNav(v);
            if(next==='cancel') return;
            desc.set.call(this, next==='passthrough' ? v : next);
          }
        });
      }
    }catch(err){}
    try{
      if(window.navigation && typeof navigation.addEventListener==='function'){
        navigation.addEventListener('navigate',function(e){
          try{
            if(!e.canIntercept || e.hashChange || e.downloadRequest) return;
            if(e.navigationType==='traverse') return;
            var dest=e.destination && e.destination.url;
            if(!dest) return;
            var next=rewriteOutboundNav(dest);
            if(next==='cancel'){
              if(e.cancelable) e.preventDefault();
              return;
            }
            if(next!=='passthrough'){
              e.intercept({handler:function(){ location.replace(next); }});
            }
          }catch(err){}
        });
      }
    }catch(err){}
  }
  applyLocationPatch();

  /**
   * 纠正「代理路径被当成目标站相对路径」导致的双重包装：
   * /browser-proxy/http/www.163.com/browser-proxy/https/nex.163.com/...
   * → /browser-proxy/https/nex.163.com/...
   */
  function unwrapNestedProxyPath(pathname, search, hash){
    try{
      var prefix=PROXY_PATH+'/';
      if(pathname.indexOf(prefix)!==0) return null;
      var rest=pathname.slice(prefix.length);
      var m=rest.match(/^(https?)\\/[^/]+(\\/browser-proxy\\/(?:https?)\\/.*)$/);
      if(!m) return null;
      return m[2]+(search||'')+(hash||'');
    }catch(err){ return null; }
  }

  /** API/资源请求走代理（不带 paneId，避免污染查询参数） */
  function toProxyResource(url){
    try{
      if(typeof url==='string'){
        var raw0=String(url).trim();
        if(raw0.indexOf(PROXY_PATH+'/')===0 || raw0===PROXY_PATH) return null;
      }
      var u=resolveUrlForProxy(url);
      if(!u) return null;
      if(u.protocol!=='http:' && u.protocol!=='https:') return null;
      var nested=unwrapNestedProxyPath(u.pathname, u.search, u.hash);
      if(nested) return nested;
      // 已是本页同源代理路径
      if(u.origin===location.origin && isProxyPathname(u.pathname)) return null;
      // 代理路径被解析到目标站域名上 → 拉回本地
      if(isProxyPathname(u.pathname)){
        return u.pathname+u.search+u.hash;
      }
      return PROXY_PATH+'/'+u.protocol.replace(':','')+'/'+u.host+(u.pathname||'/')+u.search+u.hash;
    }catch(err){ return null; }
  }

  function shouldProxyRequest(url){
    if(url==null || url==='') return null;
    var raw=String(url).trim();
    if(!raw || raw.indexOf('blob:')===0 || raw.indexOf('data:')===0 || raw.indexOf('about:')===0) return null;
    // 已是 /browser-proxy/...：绝不能再用 currentTargetUrl 当 base，
    // 否则 /browser-proxy/https/nex... 会变成 http://www.163.com/browser-proxy/https/nex... 再被包一层
    if(raw.indexOf(PROXY_PATH+'/')===0 || raw===PROXY_PATH){
      try{
        var probe=new URL(raw, location.origin);
        var nested0=unwrapNestedProxyPath(probe.pathname, probe.search, probe.hash);
        if(nested0) return nested0;
        // 已是代理路径但协议是 http → 升 https（站点先按 localhost 解析了 //host）
        return upgradeProxyHttpPath(probe.pathname, probe.search, probe.hash);
      }catch(err){ return null; }
    }
    try{
      var abs=resolveUrlForProxy(raw);
      if(!abs) return null;
      if(abs.protocol!=='http:' && abs.protocol!=='https:') return null;
      var nested2=unwrapNestedProxyPath(abs.pathname, abs.search, abs.hash);
      if(nested2) return nested2;
      // 已经打到我们的代理
      if(abs.origin===location.origin && isProxyPathname(abs.pathname)) return null;
      // 代理路径误挂在目标站 → 拉回
      if(isProxyPathname(abs.pathname)){
        return abs.pathname+abs.search+abs.hash;
      }
      // 仍落在本 origin 且非代理（极少见）→ 不改
      if(abs.origin===location.origin) return null;
      return toProxyResource(abs.href);
    }catch(err){ return null; }
  }

  // 劫持 fetch：把 https://www.baidu.com/... 改成 /browser-proxy/https/www.baidu.com/...
  if(typeof window.fetch==='function'){
    var _fetch=window.fetch;
    window.fetch=function(input, init){
      try{
        var reqUrl=typeof input==='string'
          ? input
          : (input && typeof input.url==='string' ? input.url : String(input));
        var proxied=shouldProxyRequest(reqUrl);
        if(proxied){
          if(typeof Request!=='undefined' && input instanceof Request){
            input=new Request(proxied, input);
          }else{
            input=proxied;
          }
        }
      }catch(err){}
      return _fetch.call(this, input, init);
    };
  }

  // 劫持 XHR
  if(typeof XMLHttpRequest!=='undefined'){
    var _xhrOpen=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(method, url){
      try{
        var proxied=shouldProxyRequest(url);
        if(proxied){
          arguments[1]=proxied;
          url=proxied;
        }
      }catch(err){}
      return _xhrOpen.apply(this, arguments);
    };
  }

  // 动态 script/img/iframe/... 的 src、link.href：站点常 createElement 后直链外域
  function patchUrlProperty(proto, prop){
    try{
      if(!proto) return;
      var desc=Object.getOwnPropertyDescriptor(proto, prop);
      if(!desc){
        try{ desc=Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop); }catch(e){}
      }
      if(!desc || !desc.configurable || typeof desc.set!=='function') return;
      Object.defineProperty(proto, prop, {
        configurable:true,
        enumerable:!!desc.enumerable,
        get:typeof desc.get==='function' ? function(){ return desc.get.call(this); } : undefined,
        set:function(v){
          var proxied=shouldProxyRequest(v);
          desc.set.call(this, proxied||v);
        }
      });
    }catch(err){}
  }
  try{
    var srcTargets=[
      typeof HTMLScriptElement!=='undefined' && HTMLScriptElement.prototype,
      typeof HTMLImageElement!=='undefined' && HTMLImageElement.prototype,
      typeof HTMLIFrameElement!=='undefined' && HTMLIFrameElement.prototype,
      typeof HTMLEmbedElement!=='undefined' && HTMLEmbedElement.prototype,
      typeof HTMLSourceElement!=='undefined' && HTMLSourceElement.prototype,
      typeof HTMLMediaElement!=='undefined' && HTMLMediaElement.prototype,
      typeof HTMLTrackElement!=='undefined' && HTMLTrackElement.prototype
    ];
    for(var si=0;si<srcTargets.length;si++){
      if(srcTargets[si]) patchUrlProperty(srcTargets[si], 'src');
    }
    if(typeof HTMLLinkElement!=='undefined') patchUrlProperty(HTMLLinkElement.prototype, 'href');
  }catch(err){}

  try{
    var _setAttribute=Element.prototype.setAttribute;
    Element.prototype.setAttribute=function(name, value){
      try{
        var key=String(name||'').toLowerCase();
        if(typeof value==='string' && value){
          if(key==='srcset' || key==='imagesrcset'){
            // 与 HTML 改写一致：逐段代理
            value=String(value).split(',').map(function(part){
              var chunk=part.trim();
              if(!chunk) return chunk;
              var bits=chunk.split(/\\s+/);
              var proxied=shouldProxyRequest(bits[0]);
              if(!proxied) return chunk;
              return [proxied].concat(bits.slice(1)).join(' ');
            }).join(', ');
          }else if(
            key==='src'||key==='href'||key==='poster'||key==='data'||
            key==='action'||key==='formaction'||key==='xlink:href'||
            key==='data-src'||key==='data-original'||key==='data-url'||
            key==='data-href'||key==='data-lazy-src'||key==='requesturl'||
            key==='logourl'||key==='aria-url'||
            (/^(https?:|\\/\\/)/i.test(value.trim()) && /(src|href|url)$/i.test(key))
          ){
            var proxiedAttr=shouldProxyRequest(value);
            if(proxiedAttr) value=proxiedAttr;
          }
        }
      }catch(err){}
      return _setAttribute.call(this, name, value);
    };
  }catch(err){}

  // document.cookie：去 Domain，并把 Path 限制到当前代理 host 前缀
  try{
    var cookieDesc=Object.getOwnPropertyDescriptor(Document.prototype,'cookie')||
      Object.getOwnPropertyDescriptor(HTMLDocument.prototype,'cookie');
    if(cookieDesc && typeof cookieDesc.set==='function' && typeof cookieDesc.get==='function'){
      Object.defineProperty(document,'cookie',{
        configurable:true,
        enumerable:true,
        get:function(){ return cookieDesc.get.call(document); },
        set:function(v){
          var s=String(v).replace(/;\\s*domain\\s*=\\s*[^;]*/gi,'');
          try{
            var tu=decodeProxyLocation() || new URL(TARGET_ORIGIN);
            var prefix=PROXY_PATH+'/'+tu.protocol.replace(':','')+'/'+tu.host;
            if(/;\\s*path\\s*=/i.test(s)){
              s=s.replace(/;\\s*path\\s*=\\s*([^;]*)/gi,function(_m, raw){
                var path=String(raw).trim();
                if(path.charAt(0)!=='/') path='/'+path;
                if(path===prefix || path.indexOf(prefix+'/')===0) return '; Path='+path;
                if(path==='/') return '; Path='+prefix+'/';
                return '; Path='+prefix+path;
              });
            }else{
              s+='; Path='+prefix+'/';
            }
            s=s.replace(/;\\s*secure\\b/gi,'').replace(/;\\s*samesite\\s*=\\s*none/gi,'; SameSite=Lax');
          }catch(err){}
          cookieDesc.set.call(document, s);
        }
      });
    }
  }catch(err){}

  function decodeProxyHref(href){
    if(!href) return null;
    try{
      var u=new URL(href, location.origin);
      if(u.pathname===PROXY_PATH && u.searchParams.get('url')){
        return u.searchParams.get('url');
      }
      if(u.pathname.indexOf(PROXY_PATH+'/')===0){
        var rest=u.pathname.slice(PROXY_PATH.length+1);
        var m=rest.match(/^(https?)\\/([^/]+)(\\/.*)?$/);
        if(!m) return null;
        var decoded=new URL(m[1]+'://'+m[2]+(m[3]||'/')+u.search+u.hash);
        decoded.searchParams.delete('paneId');
        return decoded.href;
      }
    }catch(err){}
    return null;
  }

  function resolveAbs(href, baseHref){
    try{
      var abs=new URL(href, baseHref||currentTargetUrl()||location.href).href;
      var fromProxy=decodeProxyHref(abs);
      if(fromProxy) return fromProxy;
      return /^https?:/i.test(abs) ? abs : null;
    }catch(err){ return null; }
  }

  function hrefToTarget(a){
    try{
      if(a && a.href){
        var fromProxy=decodeProxyHref(a.href);
        if(fromProxy) return fromProxy;
        if(/^https?:/i.test(a.href)) return a.href;
      }
    }catch(err){}
    return resolveAbs(a && a.getAttribute ? (a.getAttribute('href')||'') : '', currentTargetUrl());
  }

  function effectiveTarget(el){
    if(!el) return '';
    var t=(el.getAttribute('target')||'').toLowerCase();
    if(t) return t;
    try{
      var base=document.querySelector('base[target]');
      if(base) return (base.getAttribute('target')||'').toLowerCase();
    }catch(err){}
    return '';
  }

  function isAuxiliaryTarget(target){
    if(!target || target==='_self') return false;
    // _parent/_top 会跳出分屏 iframe，也按「新开」处理，避免整页被顶掉
    if(target==='_blank' || target==='_new' || target==='_parent' || target==='_top') return true;
    // 命名窗口（非当前 frame 名）→ 工作区新分屏
    try{
      if(target===String(window.name||'').toLowerCase()) return false;
    }catch(err){}
    return true;
  }

  function isNewPageGesture(a, ev){
    if(a && a.getAttribute && a.getAttribute('data-ittoolplus-new')) return true;
    if(isAuxiliaryTarget(effectiveTarget(a))) return true;
    if(ev.button===1) return true;
    if(ev.metaKey||ev.ctrlKey) return true;
    return false;
  }

  function findLinkEl(el){
    if(!el || !el.closest) return null;
    return el.closest('a[href], area[href]');
  }

  function shouldSkipAnchor(a, ev){
    if(!a) return true;
    var href=a.getAttribute('href');
    if(!href || href.charAt(0)==='#' || href.toLowerCase().indexOf('javascript:')===0) return true;
    if(a.hasAttribute('download')) return true;
    if(ev.button!==0 && ev.button!==1) return true;
    if(ev.shiftKey||ev.altKey) return true;
    return false;
  }

  function handleLinkActivate(ev, forceNew){
    var a=findLinkEl(ev.target);
    if(shouldSkipAnchor(a, ev)) return;
    var abs=hrefToTarget(a);
    if(!abs) return;
    ev.preventDefault();
    ev.stopPropagation();
    if(typeof ev.stopImmediatePropagation==='function') ev.stopImmediatePropagation();
    if(forceNew || isNewPageGesture(a, ev)){
      var title=(a.getAttribute('title')||a.textContent||'').trim().slice(0,80);
      notifyOpen(abs, title);
      return;
    }
    notifyNavigate(abs);
    var proxied=toProxy(abs);
    if(proxied) location.href=proxied;
  }

  window.addEventListener('click',function(ev){ handleLinkActivate(ev, false); }, true);
  window.addEventListener('auxclick',function(ev){
    if(ev.button!==1) return;
    handleLinkActivate(ev, true);
  }, true);

  function makeFakeWindow(initialUrl){
    var current=initialUrl||'';
    var fake={
      closed:false,
      opener:null,
      name:'',
      close:function(){ fake.closed=true; },
      focus:function(){},
      blur:function(){},
      postMessage:function(){},
      document:{
        write:function(){},
        writeln:function(){},
        open:function(){ return fake.document; },
        close:function(){}
      }
    };
    function navigateTo(v){
      var abs=resolveAbs(String(v), currentTargetUrl());
      if(abs){
        notifyOpen(abs, '');
        current=abs;
      }
    }
    var loc={
      get href(){ return current; },
      set href(v){ navigateTo(v); },
      assign:function(v){ navigateTo(v); },
      replace:function(v){ navigateTo(v); },
      toString:function(){ return current; }
    };
    fake.location=loc;
    return fake;
  }

  // 劫持 window.open：一律在工作区新分屏打开，不弹出浏览器窗口
  window.open=function(url){
    if(url==null || url===''){
      return makeFakeWindow('');
    }
    var abs=resolveAbs(String(url), currentTargetUrl());
    if(abs){
      notifyOpen(abs, '');
      return makeFakeWindow(abs);
    }
    return makeFakeWindow('');
  };

  document.addEventListener('submit',function(ev){
    var form=ev.target;
    if(!form || !form.tagName || form.tagName.toUpperCase()!=='FORM') return;
    var method=(form.getAttribute('method')||'get').toLowerCase();
    if(method!=='get') return;
    var target=effectiveTarget(form);
    if(isAuxiliaryTarget(target)){
      try{
        var action=form.getAttribute('action')||currentTargetUrl()||location.href;
        var url=new URL(action, currentTargetUrl()||location.href);
        if(url.protocol!=='http:' && url.protocol!=='https:') return;
        var fd=new FormData(form);
        fd.forEach(function(value, key){
          if(typeof value==='string') url.searchParams.append(key, value);
        });
        ev.preventDefault();
        ev.stopPropagation();
        notifyOpen(url.href, '');
      }catch(err){}
      return;
    }
    try{
      var action2=form.getAttribute('action')||currentTargetUrl()||location.href;
      var url2=new URL(action2, currentTargetUrl()||location.href);
      if(url2.protocol!=='http:' && url2.protocol!=='https:') return;
      var fd2=new FormData(form);
      fd2.forEach(function(value, key){
        if(typeof value==='string') url2.searchParams.append(key, value);
      });
      ev.preventDefault();
      ev.stopPropagation();
      notifyNavigate(url2.href);
      var proxied2=toProxy(url2.href);
      if(proxied2) location.href=proxied2;
    }catch(err){}
  }, true);

  // 动态插入的 a[target=_blank] 等：去掉跳出标记，改由我们的点击逻辑开分屏
  function neutralizeTargets(root){
    try{
      var scope=root && root.querySelectorAll ? root : document;
      var list=scope.querySelectorAll
        ? scope.querySelectorAll('a[target], area[target], form[target], base[target]')
        : [];
      for(var i=0;i<list.length;i++){
        var el=list[i];
        var t=(el.getAttribute('target')||'').toLowerCase();
        if(!isAuxiliaryTarget(t)) continue;
        el.setAttribute('data-ittoolplus-new','1');
        el.setAttribute('target','_self');
      }
    }catch(err){}
  }

  function syncFromLocation(){
    notifyNavigate(currentTargetUrl());
  }
  window.addEventListener('hashchange', syncFromLocation);
  var _push=history.pushState;
  var _replace=history.replaceState;
  function fixHistoryUrl(url){
    if(typeof url!=='string' || !url) return url;
    try{
      var abs=new URL(url, currentTargetUrl()||TARGET_ORIGIN+'/');
      if(abs.origin===TARGET_ORIGIN || abs.pathname.indexOf(PROXY_PATH+'/')===0){
        var proxied=toProxy(abs.href);
        return proxied||url;
      }
      // SPA 常写成 to="/" —— 映射回目标站根路径的代理地址
      if(url.charAt(0)==='/' && url.indexOf(PROXY_PATH)!==0){
        return toProxy(TARGET_ORIGIN+url)||url;
      }
    }catch(err){}
    return url;
  }
  history.pushState=function(state, title, url){
    var ret=_push.call(this, state, title, url!=null ? fixHistoryUrl(url) : url);
    syncFromLocation();
    return ret;
  };
  history.replaceState=function(state, title, url){
    var ret=_replace.call(this, state, title, url!=null ? fixHistoryUrl(url) : url);
    syncFromLocation();
    return ret;
  };
  window.addEventListener('popstate', syncFromLocation);

  function bootNeutralize(){
    neutralizeTargets(document);
    try{
      var mo=new MutationObserver(function(mutations){
        for(var i=0;i<mutations.length;i++){
          var m=mutations[i];
          if(m.type==='attributes' && m.target && m.attributeName==='target'){
            neutralizeTargets(m.target.parentNode||document);
          }
          if(m.addedNodes){
            for(var j=0;j<m.addedNodes.length;j++){
              var n=m.addedNodes[j];
              if(n && n.nodeType===1) neutralizeTargets(n);
            }
          }
        }
      });
      mo.observe(document.documentElement,{
        subtree:true,
        childList:true,
        attributes:true,
        attributeFilter:['target']
      });
    }catch(err){}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){
      bootNeutralize();
      syncFromLocation();
    });
  }else{
    bootNeutralize();
    syncFromLocation();
  }
  window.addEventListener('load', syncFromLocation);
})();</script>`

  // 尽量插到 <head> 最前，早于页面自身脚本
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${snippet}`)
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${snippet}</head>`)
  }
  return `${snippet}${html}`
}

const PROXY_ONLY_QUERY_KEYS = ['paneId', 'force', '_r'] as const

function stripProxyOnlyQuery(target: URL): { paneId: string; force: boolean } {
  const paneId = target.searchParams.get('paneId') ?? ''
  const force =
    target.searchParams.get('force') === '1' ||
    target.searchParams.get('force') === 'true'
  for (const key of PROXY_ONLY_QUERY_KEYS) {
    target.searchParams.delete(key)
  }
  return { paneId, force }
}

function resolveTarget(
  req: IncomingMessage,
  origin: string,
): { target: URL; paneId: string; force: boolean } | null {
  const url = new URL(req.url ?? '/', origin)

  if (url.pathname === PROXY_PATH) {
    const raw = url.searchParams.get('url')
    if (!raw) return null
    try {
      const target = new URL(raw)
      if (target.protocol !== 'http:' && target.protocol !== 'https:') return null
      const force =
        url.searchParams.get('force') === '1' ||
        url.searchParams.get('force') === 'true'
      return {
        target,
        paneId: url.searchParams.get('paneId') ?? '',
        force,
      }
    } catch {
      return null
    }
  }

  const parsed = parseProxyPath(url.pathname, url.search)
  if (!parsed) return null
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const { paneId, force } = stripProxyOnlyQuery(parsed)
  return { target: parsed, paneId, force }
}

export async function handleEmbedProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const host = req.headers.host ?? 'localhost'
  const origin = `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${host}`
  const url = new URL(req.url ?? '/', origin)

  if (
    url.pathname !== PROXY_PATH &&
    !url.pathname.startsWith(`${PROXY_PATH}/`)
  ) {
    return false
  }

  const resolved = resolveTarget(req, origin)
  if (!resolved) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('无效的嵌入地址')
    return true
  }

  const { target, paneId, force } = resolved
  const method = (req.method ?? 'GET').toUpperCase()

  // 预检
  if (method === 'OPTIONS') {
    res.statusCode = 204
    applyCorsHeaders(req, res, origin)
    res.end()
    return true
  }

  // 统计/反作弊上报在代理环境下常被上游拒绝（400），直接吞掉避免控制台刷屏
  if (isIgnorableBeacon(target)) {
    res.statusCode = 204
    applyCorsHeaders(req, res, origin)
    res.setHeader('X-Embed-Proxy', 'beacon-skipped')
    res.end()
    return true
  }

  try {
    scrubLocalOriginInUrl(target, origin)
    const rawBody = await readRequestBody(req)
    const contentType =
      typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type']
        : undefined
    const body =
      rawBody && rawBody.length > 0
        ? scrubLocalOriginInBody(rawBody, contentType, origin, target.origin)
        : undefined

    const upstreamHeaders = buildUpstreamHeaders(req, target)
    if (body && !upstreamHeaders['content-length']) {
      upstreamHeaders['content-length'] = String(body.length)
    }

    const upstream = await fetch(target.href, {
      method,
      redirect: 'follow',
      headers: upstreamHeaders,
      body:
        method === 'GET' || method === 'HEAD'
          ? undefined
          : body && body.length > 0
            ? new Uint8Array(body)
            : undefined,
    })

    const responseType = upstream.headers.get('content-type') ?? 'text/html'
    const xfo = upstream.headers.get('x-frame-options')
    const csp = upstream.headers.get('content-security-policy')
    const finalUrl = new URL(upstream.url)

    // 入口文档：
    // - 默认可 iframe 的普通站点 → 路径代理
    // - module SPA / 多子域门户且允许嵌入 → 直嵌原站（路径代理必坏）
    // - 风控页 → 失败页（可强制代理 / 打开原站）
    // - 禁止嵌入的站点 → 仍走路径代理尝试
    const isEntryDocument =
      url.pathname === PROXY_PATH &&
      method === 'GET' &&
      responseType.includes('text/html')
    if (isEntryDocument) {
      const frameBlocked = isFrameBlocked(xfo, csp)
      const html = await upstream.text()
      const unsupported = proxyEmbedUnsupportedReason(
        finalUrl,
        html,
        frameBlocked,
        force,
      )
      if (unsupported) {
        const forceHref = `${PROXY_PATH}?url=${encodeURIComponent(finalUrl.href)}&force=1${
          paneId ? `&paneId=${encodeURIComponent(paneId)}` : ''
        }`
        res.statusCode = 422
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Embed-Proxy', 'unsupported')
        applyCorsHeaders(req, res, origin)
        res.end(unsupportedEmbedHtml(finalUrl, unsupported, undefined, forceHref))
        return true
      }
      if (!force && shouldDirectEmbedOrigin(html, finalUrl, frameBlocked)) {
        const embedHref = preferHttpsHref(finalUrl)
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Embed-Proxy', 'direct')
        const risk = proxyEmbedRiskHint(finalUrl, html, frameBlocked)
        if (risk) res.setHeader('X-Embed-Proxy-Risk', risk)
        applyCorsHeaders(req, res, origin)
        res.end(directEmbedOpeningHtml(embedHref, paneId))
        return true
      }

      let next = toProxyPath(finalUrl.href)
      if (paneId) {
        next += `${next.includes('?') ? '&' : '?'}paneId=${encodeURIComponent(paneId)}`
      }
      if (force) {
        next += `${next.includes('?') ? '&' : '?'}force=1`
      }
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      const risk = proxyEmbedRiskHint(finalUrl, html, frameBlocked)
      if (risk) res.setHeader('X-Embed-Proxy-Risk', risk)
      applyCorsHeaders(req, res, origin)
      res.end(entryRedirectHtml(next))
      return true
    }

    res.statusCode = upstream.status

    // undici 的 Headers.forEach 会跳过 set-cookie，需单独处理并去掉 Domain
    const setCookies =
      typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : []

    if (responseType.includes('text/html')) {
      const html = await upstream.text()
      const frameBlocked = isFrameBlocked(xfo, csp)
      const unsupported = proxyEmbedUnsupportedReason(
        finalUrl,
        html,
        frameBlocked,
        force,
      )
      if (unsupported) {
        const forcePath = toProxyPath(finalUrl.href)
        const forceHref = `${forcePath}${forcePath.includes('?') ? '&' : '?'}force=1${
          paneId ? `&paneId=${encodeURIComponent(paneId)}` : ''
        }`
        res.statusCode = 422
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Embed-Proxy', 'unsupported')
        applyCorsHeaders(req, res, origin)
        res.end(unsupportedEmbedHtml(finalUrl, unsupported, undefined, forceHref))
        return true
      }

      // 书签/历史可能已是路径代理 URL；可嵌的多子域站改直嵌，避免白屏
      if (!force && shouldDirectEmbedOrigin(html, finalUrl, frameBlocked)) {
        const embedHref = preferHttpsHref(finalUrl)
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Embed-Proxy', 'direct')
        const risk = proxyEmbedRiskHint(finalUrl, html, frameBlocked)
        if (risk) res.setHeader('X-Embed-Proxy-Risk', risk)
        applyCorsHeaders(req, res, origin)
        res.end(directEmbedOpeningHtml(embedHref, paneId))
        return true
      }

      upstream.headers.forEach((value, key) => {
        if (HOP_BY_HOP.has(key.toLowerCase())) return
        if (key.toLowerCase() === 'set-cookie') return
        res.setHeader(key, value)
      })
      if (setCookies.length > 0) {
        res.setHeader(
          'Set-Cookie',
          setCookies.map((c) => rewriteSetCookieForProxy(c, finalUrl)),
        )
      }
      res.removeHeader('X-Frame-Options')
      res.removeHeader('Content-Security-Policy')
      res.setHeader('X-Embed-Proxy', '1')
      const risk = proxyEmbedRiskHint(finalUrl, html, frameBlocked)
      if (risk) res.setHeader('X-Embed-Proxy-Risk', risk)
      applyCorsHeaders(req, res, origin)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(rewriteHtml(html, finalUrl, paneId))
      return true
    }

    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP.has(key.toLowerCase())) return
      if (key.toLowerCase() === 'set-cookie') return
      res.setHeader(key, value)
    })
    if (setCookies.length > 0) {
      res.setHeader(
        'Set-Cookie',
        setCookies.map((c) => rewriteSetCookieForProxy(c, finalUrl)),
      )
    }

    res.removeHeader('X-Frame-Options')
    res.removeHeader('Content-Security-Policy')
    res.setHeader('X-Embed-Proxy', '1')
    applyCorsHeaders(req, res, origin)

    if (
      responseType.includes('text/css') ||
      responseType.includes('javascript') ||
      responseType.includes('ecmascript')
    ) {
      let text = await upstream.text()
      if (responseType.includes('text/css')) {
        text = rewriteCssUrls(text, finalUrl)
      } else {
        text = rewriteHostLockJavaScript(text)
      }
      res.setHeader('Content-Type', responseType)
      res.end(text)
      return true
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', responseType)
    res.end(buffer)
    return true
  } catch (error) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (proxyTlsRelaxed) {
      res.setHeader('X-Embed-Proxy-Tls', 'insecure')
    }
    applyCorsHeaders(req, res, origin)
    res.end(
      unsupportedEmbedHtml(
        target,
        formatUpstreamFetchError(error),
        '嵌入代理失败',
      ),
    )
    return true
  }
}
