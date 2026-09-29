import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { BrandLogo } from '@/components/BrandLogo'
import { DonateDialog } from '@/components/DonateDialog'
import { WechatGroupDialog } from '@/components/WechatGroupDialog'
import { OFFICIAL_ORIGIN, siteConfig } from '@/config/site'
import { officialApiUrl } from '@/lib/official-api'


const wechatGzhQrSrc = `${OFFICIAL_ORIGIN}/donate/wechat_gzh.jpg?${Math.floor(Date.now() / 86400000)}`

async function fetchVisitorTotal(): Promise<number | null> {
  const response = await fetch(officialApiUrl('/__visitor_stats'), {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as { total?: number }
  if (typeof payload.total === 'number' && Number.isFinite(payload.total)) {
    return payload.total
  }

  return null
}

async function incrementVisitorCount(): Promise<number | null> {
  const response = await fetch(officialApiUrl('/__visitor_count'), {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'X-Requested-By': 'ittoolplus-spa',
    },
  })

  if (!response.ok) {
    return null
  }

  try {
    const payload = (await response.json()) as { total?: number }
    if (typeof payload.total === 'number' && Number.isFinite(payload.total)) {
      return payload.total
    }
  } catch {
    // 兼容仅返回 {"ok":true} 的旧配置
  }

  return null
}

/** 页脚，与官网 / 兄弟工具站保持一致 */
export function SiteFooter() {

  const location = useLocation()
  const navigationType = useNavigationType()
  const [visitorCount, setVisitorCount] = useState<number | null>(null)
  const lastCountedPathRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const path = location.pathname

    void (async () => {
      try {
        // 首屏/刷新(POP)与 <Navigate replace>(REPLACE) 由 nginx 计 HTML；
        // 仅用户点击导致的 History PUSH 由 SPA 补 +1，避免刷新变成 +2。
        const shouldIncrement =
          navigationType === 'PUSH' && lastCountedPathRef.current !== path

        if (lastCountedPathRef.current === path && !shouldIncrement) {
          const total = await fetchVisitorTotal()
          if (!cancelled && total !== null) {
            setVisitorCount(total)
          }
          return
        }

        const isFirstLoad = lastCountedPathRef.current === null
        lastCountedPathRef.current = path
        if (isFirstLoad) {
          setVisitorCount(null)
        }

        let total: number | null = null
        if (shouldIncrement) {
          total = await incrementVisitorCount()
        }

        if (total === null) {
          total = await fetchVisitorTotal()
        }

        if (!cancelled && total !== null) {
          setVisitorCount(total)
        }
      } catch {
        if (!cancelled) {
          setVisitorCount(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.pathname, navigationType])

  const visitorLabel =
    visitorCount === null
      ? '累计访问：加载中…'
      : `累计访问：${new Intl.NumberFormat('zh-CN').format(visitorCount)} 次`

  return (
    <footer className="border-border relative z-10 mt-auto border-t">
      <div className="grid w-full gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <BrandLogo className="size-9" />
            <p className="font-display text-foreground text-lg font-semibold">
              {siteConfig.name}
            </p>
          </div>
          <p className="text-muted-foreground mt-3 max-w-xs text-sm leading-relaxed">
            {siteConfig.brandTagline}
          </p>
        </div>

        <div>
          <p className="font-display text-foreground mb-3 text-sm font-semibold">
            快速链接
          </p>
          <div className="text-muted-foreground flex flex-col gap-2 text-sm">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {siteConfig.quickLinks.map((item, index) => (
                <span key={item.label} className="contents">
                  {index > 0 ? (
                    <span aria-hidden className="text-border">
                      |
                    </span>
                  ) : null}
                  <a
                    href={item.href}
                    className="hover:text-foreground transition-colors"
                    {...(item.href.startsWith('http')
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {item.label}
                  </a>
                </span>
              ))}
            </p>
            <DonateDialog>
              <button
                type="button"
                className="text-accent hover:text-accent-foreground w-fit font-semibold transition-colors"
              >
                赞赏
              </button>
            </DonateDialog>
          </div>
        </div>

        <div>
          <p className="font-display text-foreground mb-3 text-sm font-semibold">
            联系方式
          </p>
          <ul className="text-muted-foreground flex flex-col gap-2 text-sm">
            <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{siteConfig.contactName}</span>
              <a
                href={`tel:${siteConfig.contactPhone}`}
                className="hover:text-foreground transition-colors"
              >
                {siteConfig.contactPhone}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${siteConfig.contactEmail}`}
                className="hover:text-foreground transition-colors"
              >
                {siteConfig.contactEmail}
              </a>
            </li>
            <li>
              <WechatGroupDialog>
                <button
                  type="button"
                  className="text-accent hover:text-accent-foreground font-semibold transition-colors"
                >
                  微信群聊
                </button>
              </WechatGroupDialog>
            </li>
          </ul>
        </div>

        <div>
          <p className="font-display text-foreground mb-3 text-sm font-semibold">
            微信公众号
          </p>
          <figure className="flex flex-col gap-2">
            <img
              src={wechatGzhQrSrc}
              alt="微信公众号二维码"
              width={96}
              height={96}
              className="border-border size-24 rounded-lg border bg-white object-contain"
              loading="lazy"
            />
            <figcaption className="text-muted-foreground text-xs">
              扫码关注公众号：铅笔侠
            </figcaption>
          </figure>
        </div>

      </div>

      <div className="border-border border-t">
        <div className="text-muted-foreground flex w-full flex-col items-center gap-2 px-4 py-5 text-center text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:text-left">
          <p className="order-2 sm:order-1 sm:min-w-0">{siteConfig.copyright}</p>
          <span className="order-1 whitespace-nowrap sm:order-2 sm:flex-1 sm:text-center">
            {visitorLabel}
          </span>
          <div className="order-3 flex flex-col items-center gap-1 sm:items-end sm:text-right">
            <a
              href={siteConfig.icp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              {siteConfig.icp.number}
            </a>
            <a
              href={siteConfig.police.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              {siteConfig.police.number}
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
