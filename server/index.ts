/**
 * 生产用嵌入代理进程（仅 /browser-proxy）。
 * Nginx 见 config-ittoolplus/conf/proxy/proxy-browser.conf
 */
import { createServer } from 'node:http'

import {
  applyProxyTlsPolicy,
  handleEmbedProxy,
  PROXY_PATH,
} from './embed-proxy.ts'

const tlsRelaxed = applyProxyTlsPolicy()
const PORT = Number(process.env.BROWSER_PROXY_PORT || 8791)
const HOST = process.env.BROWSER_PROXY_HOST || '127.0.0.1'

const server = createServer((req, res) => {
  void handleEmbedProxy(req, res).then((handled) => {
    if (handled) return
    if ((req.url || '/').split('?')[0] === '/healthz') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('ok')
      return
    }
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Not Found')
  })
})

server.listen(PORT, HOST, () => {
  console.log(`mini-browser proxy listening on http://${HOST}:${PORT}`)
  console.log(`  ${PROXY_PATH}*  embed proxy`)
  console.log(`  /healthz`)
  if (tlsRelaxed) {
    console.log(
      '  TLS: insecure (BROWSER_PROXY_INSECURE_TLS or non-production default)',
    )
  }
})
