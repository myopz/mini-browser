import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

import { embedProxyPlugin } from './vite.embed-proxy.ts'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

const base = '/browser/'

/** Redirect /browser → /browser/，以及开发时根路径 / → /browser/ */
function redirectBaseWithoutSlash(): Plugin {
  const bare = base.slice(0, -1)
  return {
    name: 'redirect-base-without-slash',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url?.startsWith('/?')) {
          const query = req.url === '/' ? '' : req.url.slice(1)
          res.writeHead(302, { Location: `${base}${query}` })
          res.end()
          return
        }
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
        if (req.url === '/' || req.url?.startsWith('/?')) {
          const query = req.url === '/' ? '' : req.url.slice(1)
          res.writeHead(302, { Location: `${base}${query}` })
          res.end()
          return
        }
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
  plugins: [
    react(),
    tailwindcss(),
    redirectBaseWithoutSlash(),
    embedProxyPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
      // pnpm 下 react-router 等可能解析到另一份 react，导致 Invalid hook call 白屏
      react: path.resolve(rootDir, 'node_modules/react'),
      'react-dom': path.resolve(rootDir, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
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
    allowedHosts: ['ittoolplus.cn', '.ittoolplus.cn'],
  },
  preview: {
    host: true,
    allowedHosts: ['ittoolplus.cn', '.ittoolplus.cn'],
  },
})
