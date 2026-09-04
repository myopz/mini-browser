import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/** Deploy path under ittoolplus.cn — change when copying this template. */
const base = '/demo/'

/** Redirect /demo → /demo/ so refresh matches Vite base. */
function redirectBaseWithoutSlash(): Plugin {
  const bare = base.slice(0, -1)
  return {
    name: 'redirect-base-without-slash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === bare || req.url?.startsWith(`${bare}?`)) {
          const query = req.url.slice(bare.length)
          res.writeHead(302, { Location: `${base}${query}` })
          res.end()
          return
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === bare || req.url?.startsWith(`${bare}?`)) {
          const query = req.url.slice(bare.length)
          res.writeHead(302, { Location: `${base}${query}` })
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), redirectBaseWithoutSlash()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    /** 本地同源访问，由 Vite 反代到官网，避免浏览器 CORS */
    proxy: {
      '/__visitor_stats': {
        target: 'https://ittoolplus.cn',
        changeOrigin: true,
        secure: true,
      },
      '/__visitor_count': {
        target: 'https://ittoolplus.cn',
        changeOrigin: true,
        secure: true,
      },
    },
    host: true,
  },
})
