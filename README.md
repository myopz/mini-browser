# 在线浏览器（mini-browser）

可部署在服务器上的 Web 版小型浏览器：地址栏 + 页面区。嵌入代理代码在本仓库内，**不依赖** api-ittoolplus。

## 技术栈

- Vite 8 + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui（new-york）
- React Router 7
- Dexie（最近访问）
- 嵌入代理：`server/embed-proxy.ts`（Node http）

## 页面

| 路由 | 说明 |
|------|------|
| `/` | 全屏浏览器：多标签、地址栏、收藏、历史、iframe |
| `/browse` | 重定向到 `/` |

部署 base：`/browser/`。嵌入代理路径：`/browser-proxy`。

## 快速开始

```bash
pnpm install
pnpm dev
```

开发地址：`http://localhost:5173/browser/`（端口以终端为准）。  
本地由 Vite 插件挂载同源 `/browser-proxy`，无需另起进程。

若打开 GitHub 等站点出现 `fetch failed` / TLS 证书错误，多半是本机 HTTPS 解密（公司代理/杀软）。开发环境默认已放宽证书校验；也可显式设置：

```bash
BROWSER_PROXY_INSECURE_TLS=1 pnpm dev
```

## 生产代理

```bash
pnpm build
pnpm start:proxy   # 默认 127.0.0.1:8791，可用 BROWSER_PROXY_PORT 覆盖
```

Nginx：

- 静态：`config-ittoolplus/conf/apps/browser.conf` → `mini-browser/dist`
- 代理：`config-ittoolplus/conf/proxy/proxy-browser.conf` → `127.0.0.1:8791`

## 与官网一致性约定

- 品牌：`BrandLogo` + `siteConfig.name`
- 字体：DM Sans + Plus Jakarta Sans（见 `src/index.css`）
- 色板：oklch 青绿强调色
- 背景：径向光斑 + 细网格（`AppShell`）
