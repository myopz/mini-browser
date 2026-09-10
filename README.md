# temp-ittoolplus

ittool++ 新项目初始化骨架。技术栈、主题色、顶栏/页脚与兄弟工具站保持一致。

## 技术栈

- Vite 8 + React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui（new-york）
- React Router 7
- Dexie（IndexedDB）
- Lucide icons

## 已包含页面

| 路由 | 说明 |
|------|------|
| `/` | 首页（产品介绍 + CTA） |
| `/list` | 分页列表（搜索 / 新建 / 编辑 / 删除 / 批量删除 / 重置示例） |

布局：`AppShell` + `SiteHeader` + `SiteFooter`（含赞赏、微信群、ICP）。

## 快速开始

```bash
pnpm install
pnpm dev
```

默认开发地址基于 Vite `base`：`/demo/`。

## 拷贝为新项目

```bash
cp -R temp-ittoolplus your-new-tool
cd your-new-tool
```

然后按清单修改：

1. **`package.json`** — `name`
2. **`vite.config.ts`** — `base`（如 `/your-path/`），并同步 `redirectBaseWithoutSlash`
3. **`index.html`** — `<title>`
4. **`src/config/site.ts`** — `productName` / `tagline` / `description`
5. **`src/lib/db.ts`** — Dexie 数据库名（避免与其他工具冲突）；保留 `meta.examples-dismissed`，用户删除示例后不会自动重种
6. **`src/types/item.ts` + `src/pages/ListPage.tsx`** — 换成真实业务模型与字段

可选：初始化 git

```bash
rm -rf .git   # 若从已有仓库拷出
git init
```

## 目录结构

```
src/
  components/layout/   # AppShell / Header / Footer
  components/ui/       # shadcn 基础组件
  config/              # site / donate
  lib/                 # db / pagination / utils
  pages/               # HomePage / ListPage
  types/               # 业务类型
```

## 与官网一致性约定

- 品牌：`BrandLogo` + `siteConfig.name`
- 字体：DM Sans + Plus Jakarta Sans（见 `src/index.css`）
- 色板：oklch 青绿强调色，勿改成默认紫系
- 背景：径向光斑 + 细网格（`AppShell`）
