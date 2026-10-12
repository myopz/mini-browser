# AGENTS.md

给 Cursor Agent（及其他自动化助手）的项目入口说明。

## 开始前必读

1. [`README.md`](./README.md) — 产品说明与本地启动

## 本项目约定

- 产品：新工具骨架模板（Demo）
- 部署路径：`/demo/`（拷贝后必须改）
- 仓库目录：`empty-ittoolplus`
- 技术栈：Vite + React + TypeScript + Tailwind 4 + shadcn + Dexie
- 存储：Dexie 示例 CRUD（拷贝后改 DB 名）
- 路由：`/` 首页、`/list` 列表示例
- 官网注册：模板项目，勿注册
- Nginx：无独立正式 conf

## 优先复用

- 拷贝为新项目后按 README 清单改名 / base / site / db
- **不要**另起一套视觉语言或自建第二套存储 / 鉴权方案

## 禁止事项

- 不要直接把本模板当正式产品上线；勿与其他工具共用 DB 名
- 不硬编码密钥或生产凭据
- 修改行为时同步清理失效死代码；勿为「最小 diff」保留明显错误结构
