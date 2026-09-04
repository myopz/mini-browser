import { Link } from 'react-router-dom'
import { ArrowRight, Database, LayoutTemplate, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { siteConfig } from '@/config/site'

const features = [
  {
    icon: LayoutTemplate,
    title: '统一布局',
    description: '顶栏导航、页脚品牌区与页面背景网格，与 ittool++ 兄弟工具站一致。',
  },
  {
    icon: Database,
    title: '本地数据',
    description: 'Dexie / IndexedDB 管理列表数据，新建、编辑、删除均在浏览器本地完成。',
  },
  {
    icon: Search,
    title: '搜索分页',
    description: '列表页内置关键词过滤与 URL 同步分页，可直接扩展业务字段。',
  },
] as const

export function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="relative mx-auto flex min-h-[min(24rem,52svh)] w-full max-w-6xl flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
          <p className="font-display text-accent-foreground/80 text-sm font-semibold tracking-[0.2em] uppercase">
            {siteConfig.shortName}
          </p>
          <h1 className="font-display text-foreground mt-4 max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            {siteConfig.productName}
          </h1>
          <p className="text-muted-foreground mt-5 max-w-xl text-lg leading-relaxed sm:text-xl">
            {siteConfig.description}
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/list">
                进入列表
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <a href={siteConfig.homeUrl}>返回官网</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          骨架包含什么
        </h2>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-relaxed sm:text-base">
          拷贝本项目后，改名、改 base、改 siteConfig，即可开始写业务逻辑。
        </p>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="border-border border-b pb-5">
              <div className="text-accent mb-3 flex items-center gap-2">
                <Icon className="size-5" />
                <span className="font-display text-foreground text-lg font-semibold">
                  {title}
                </span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
