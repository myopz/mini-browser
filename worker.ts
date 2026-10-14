/**
 * Cloudflare Worker：把 /browser/* 映射到 Vite 产物（dist/），
 * 与 nginx alias 行为一致，避免 base=/browser/ 时资源 404。
 */
interface Env {
  ASSETS: Fetcher
}

const BASE = '/browser'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
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
      return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request))
    }

    return assetRes
  },
}
