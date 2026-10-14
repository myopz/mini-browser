/**
 * Vite 插件：本地 `pnpm dev` / `pnpm preview` 挂载本仓库嵌入代理。
 * 生产由 `pnpm start:proxy`（server/index.ts）提供，不依赖 api-ittoolplus。
 */
import type { Plugin } from 'vite'
import {
  applyProxyTlsPolicy,
  handleEmbedProxy,
} from './server/embed-proxy-node.ts'

export {
  PROXY_PATH,
  parseProxyPath,
  toProxyPath,
} from './server/embed-proxy.ts'

export function embedProxyPlugin(): Plugin {
  return {
    name: 'browser-embed-proxy',
    configureServer(server) {
      const relaxed = applyProxyTlsPolicy()
      if (relaxed) {
        server.config.logger.warn(
          '[browser-proxy] TLS 校验已放宽（本机证书/代理环境）。生产请设 BROWSER_PROXY_INSECURE_TLS=0',
        )
      }
      server.middlewares.use((req, res, next) => {
        void handleEmbedProxy(req, res).then((handled) => {
          if (!handled) next()
        })
      })
    },
    configurePreviewServer(server) {
      applyProxyTlsPolicy()
      server.middlewares.use((req, res, next) => {
        void handleEmbedProxy(req, res).then((handled) => {
          if (!handled) next()
        })
      })
    },
  }
}
