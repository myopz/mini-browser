# AGENTS.md

给 Cursor Agent（及其他自动化助手）的项目入口说明。

## 开始前必读

1. [`README.md`](./README.md) — 产品说明与本地启动

## 本项目约定

- 产品：在线浏览器（Web 版地址栏 + 页面区）
- 部署路径：`/browser/`
- 仓库目录：`mini-browser`
- 技术栈：Vite + React + TypeScript + Tailwind 4 + shadcn/ui；壳层对齐 `home-ittoolplus`
- 存储：Dexie IndexedDB（DB 名 `mini-browser`：历史 visits + 收藏 bookmarks；标签会话存 sessionStorage）
- 路由：`/` 全屏浏览页（多标签 / 收藏 / 历史）；`/browse` 重定向到 `/`
- 嵌入代理：**本仓库自带**（`server/embed-proxy.ts`）；路径 `/browser-proxy`
  - 开发：`vite.embed-proxy.ts` 挂到 Vite
  - 生产：`pnpm start:proxy`（默认 `127.0.0.1:8791`）+ nginx `proxy-browser.conf`
- **不依赖** `api-ittoolplus` / `/webmark-proxy`
- 官网注册：home-ittoolplus/src/data/online-tools.ts（工具在线）
- Nginx：`config-ittoolplus/conf/apps/browser.conf` + `conf/proxy/proxy-browser.conf`

## 优先复用

- 布局 / 顶栏 / 程序坞 / 页脚：保留本仓库壳层，优先改 `site.ts` / `appNav.ts`；主题对齐 `home-ittoolplus`
- 嵌入代理逻辑以本仓库 `server/embed-proxy.ts` 为准，勿再从 api-ittoolplus 引用
- **不要**另起一套视觉语言或自建第二套存储 / 鉴权方案

## 禁止事项

- 不擅自扩大范围（书签分屏、多标签工作区、账号体系），除非用户明确要求；不把业务数据默认写入 localStorage；不硬编码密钥
- 修改行为时同步清理失效死代码；勿为「最小 diff」保留明显错误结构
