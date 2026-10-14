/**
 * Cloudflare Worker：
 * - /browser-proxy* → 嵌入代理（与 Node/Vite 同源逻辑）
 * - /browser/* → Vite 静态产物（dist/）
 */
import {
  PROXY_PATH,
  handleEmbedProxyRequest,
} from './server/embed-proxy.ts'

interface Env {
  ASSETS: Fetcher
}

const BASE = '/browser'

async function serveBrowserAssets(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const { pathname } = url

  if (pathname === '/' || pathname === '') {
    return Response.redirect(new URL(`${BASE}/`, url), 302)
  }
  if (pathname === BASE) {
    return Response.redirect(new URL(`${BASE}/`, url), 302)
  }

  if (!pathname.startsWith(`${BASE}/`)) {
    return new Response('Not Found', { status: 404 })
  }

  const stripped = pathname.slice(BASE.length) || '/'
  const assetUrl = new URL(stripped + url.search, url.origin)
  const assetRes = await env.ASSETS.fetch(new Request(assetUrl, request))
  if (assetRes.status !== 404) {
    return assetRes
  }

  const isNavigate = request.headers.get('Sec-Fetch-Mode') === 'navigate'
  const accept = request.headers.get('Accept') ?? ''
  if (isNavigate || accept.includes('text/html')) {
    return env.ASSETS.fetch(
      new Request(new URL('/index.html', url.origin), request),
    )
  }

  return assetRes
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (
      url.pathname === PROXY_PATH ||
      url.pathname.startsWith(`${PROXY_PATH}/`)
    ) {
      const proxied = await handleEmbedProxyRequest(request)
      return (
        proxied ??
        new Response('无效的嵌入地址', {
          status: 400,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      )
    }

    return serveBrowserAssets(request, env, url)
  },
}
