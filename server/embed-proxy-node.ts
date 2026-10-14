/**
 * Node http 适配层：把 IncomingMessage/ServerResponse 接到 Fetch API 版代理。
 * Vite 插件与 `pnpm start:proxy` 使用此入口；Cloudflare Worker 请直接用
 * `handleEmbedProxyRequest`。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import { handleEmbedProxyRequest } from './embed-proxy.ts'

export {
  PROXY_PATH,
  applyProxyTlsPolicy,
  parseProxyPath,
  toProxyPath,
  handleEmbedProxyRequest,
} from './embed-proxy.ts'

function requestUrl(req: IncomingMessage): string {
  const host = req.headers.host ?? 'localhost'
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
  return `${proto}://${host}${req.url ?? '/'}`
}

async function toFetchRequest(req: IncomingMessage): Promise<Request> {
  const method = (req.method ?? 'GET').toUpperCase()
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }

  let body: Buffer | undefined
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    if (chunks.length > 0) body = Buffer.concat(chunks)
  }

  return new Request(requestUrl(req), {
    method,
    headers,
    body:
      body && body.length > 0
        ? new Uint8Array(body)
        : undefined,
  })
}

async function sendResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    res.setHeader(key, value)
  })
  if (setCookies.length > 0) {
    res.setHeader('Set-Cookie', setCookies)
  }
  const buf = Buffer.from(await response.arrayBuffer())
  res.end(buf)
}

export async function handleEmbedProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const request = await toFetchRequest(req)
  const response = await handleEmbedProxyRequest(request)
  if (!response) return false
  await sendResponse(res, response)
  return true
}
