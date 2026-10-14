/**
 * Cloudflare Browser Run：创建远端 Chromium 会话并签发 Live View URL。
 * 前端用该 URL 嵌入遥控画面，绕开目标站 iframe 限制。
 */
import puppeteer, { type Browser, type Page } from '@cloudflare/puppeteer'

export interface RemoteBrowseEnv {
  BROWSER?: Fetcher
}

const KEEP_ALIVE_MS = 600_000
const LIVE_VIEW_EXPIRES_MS = 3_600_000
const API_PREFIX = '/api/remote-browse'

type JsonBody = {
  url?: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function parseHttpUrl(raw: string | undefined): URL | null {
  if (!raw?.trim()) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u
  } catch {
    return null
  }
}

async function getLiveViewUrl(page: Page): Promise<string> {
  const cdp = await page.createCDPSession()
  try {
    const { devtoolsFrontendUrl } = (await cdp.send('Cloudflare.getLiveView', {
      mode: 'tab',
      expiresInMs: LIVE_VIEW_EXPIRES_MS,
    })) as { devtoolsFrontendUrl: string }
    return preferTabMode(devtoolsFrontendUrl)
  } finally {
    await cdp.detach().catch(() => undefined)
  }
}

/** 确保打开 tab 模式（无 DevTools 面板），更适合产品内嵌 */
function preferTabMode(url: string): string {
  try {
    const u = new URL(url)
    if (u.pathname.includes('/ui/inspector')) {
      u.pathname = u.pathname.replace('/ui/inspector', '/ui/view')
    }
    u.searchParams.set('mode', 'tab')
    return u.href
  } catch {
    return url
  }
}

async function withBrowserSession(
  env: RemoteBrowseEnv,
  sessionId: string | null,
  fn: (browser: Browser, page: Page) => Promise<Response>,
): Promise<Response> {
  if (!env.BROWSER) {
    return json(
      {
        error:
          'Browser Run 未绑定。请在 wrangler.jsonc 配置 browser.binding，并部署到 Cloudflare。',
        code: 'BROWSER_UNAVAILABLE',
      },
      503,
    )
  }

  let browser: Browser | null = null
  let launched = false
  try {
    if (sessionId) {
      browser = await puppeteer.connect(env.BROWSER, sessionId)
    } else {
      browser = await puppeteer.launch(env.BROWSER, {
        keep_alive: KEEP_ALIVE_MS,
      })
      launched = true
    }

    const pages = await browser.pages()
    const page = pages[0] ?? (await browser.newPage())
    return await fn(browser, page)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '远程浏览器会话失败'
    return json(
      {
        error: message,
        code: sessionId ? 'SESSION_ERROR' : 'LAUNCH_ERROR',
      },
      502,
    )
  } finally {
    if (browser) {
      if (launched || sessionId) {
        // 保持会话存活供 Live View / 后续导航复用
        browser.disconnect()
      }
    }
  }
}

async function createSession(
  env: RemoteBrowseEnv,
  target: URL,
): Promise<Response> {
  return withBrowserSession(env, null, async (browser, page) => {
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    const liveViewUrl = await getLiveViewUrl(page)
    const sessionId = browser.sessionId()
    return json({
      sessionId,
      liveViewUrl,
      pageUrl: page.url(),
      title: await page.title().catch(() => target.hostname),
      keepAliveMs: KEEP_ALIVE_MS,
    })
  })
}

async function navigateSession(
  env: RemoteBrowseEnv,
  sessionId: string,
  target: URL,
): Promise<Response> {
  return withBrowserSession(env, sessionId, async (_browser, page) => {
    await page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    const liveViewUrl = await getLiveViewUrl(page)
    return json({
      sessionId,
      liveViewUrl,
      pageUrl: page.url(),
      title: await page.title().catch(() => target.hostname),
    })
  })
}

async function refreshLiveView(
  env: RemoteBrowseEnv,
  sessionId: string,
): Promise<Response> {
  return withBrowserSession(env, sessionId, async (_browser, page) => {
    const liveViewUrl = await getLiveViewUrl(page)
    return json({
      sessionId,
      liveViewUrl,
      pageUrl: page.url(),
      title: await page.title().catch(() => ''),
    })
  })
}

async function closeSession(
  env: RemoteBrowseEnv,
  sessionId: string,
): Promise<Response> {
  if (!env.BROWSER) {
    return json({ ok: true, closed: false, reason: 'BROWSER_UNAVAILABLE' })
  }
  try {
    const browser = await puppeteer.connect(env.BROWSER, sessionId)
    await browser.close()
    return json({ ok: true, closed: true })
  } catch {
    // 会话可能已因空闲关闭
    return json({ ok: true, closed: false })
  }
}

export async function handleRemoteBrowse(
  request: Request,
  env: RemoteBrowseEnv,
): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith(API_PREFIX)) return null

  const path = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, '') || '/'

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  // POST /api/remote-browse/session  { url }
  if (path === '/session' && request.method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as JsonBody
    const target = parseHttpUrl(body.url)
    if (!target) return json({ error: '无效的 URL', code: 'BAD_URL' }, 400)
    return createSession(env, target)
  }

  // POST /api/remote-browse/session/:id/navigate  { url }
  const navMatch = path.match(/^\/session\/([^/]+)\/navigate$/)
  if (navMatch && request.method === 'POST') {
    const sessionId = decodeURIComponent(navMatch[1])
    const body = (await request.json().catch(() => ({}))) as JsonBody
    const target = parseHttpUrl(body.url)
    if (!target) return json({ error: '无效的 URL', code: 'BAD_URL' }, 400)
    return navigateSession(env, sessionId, target)
  }

  // POST /api/remote-browse/session/:id/live-view
  const liveMatch = path.match(/^\/session\/([^/]+)\/live-view$/)
  if (liveMatch && request.method === 'POST') {
    const sessionId = decodeURIComponent(liveMatch[1])
    return refreshLiveView(env, sessionId)
  }

  // DELETE /api/remote-browse/session/:id
  const closeMatch = path.match(/^\/session\/([^/]+)$/)
  if (closeMatch && request.method === 'DELETE') {
    const sessionId = decodeURIComponent(closeMatch[1])
    return closeSession(env, sessionId)
  }

  return json({ error: 'Not Found', code: 'NOT_FOUND' }, 404)
}
