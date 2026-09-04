import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PaginationProps = {
  page: number
  totalPages: number
  getPageHref: (page: number) => string
  className?: string
}

function pageNumbers(
  current: number,
  total: number,
): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  if (current <= 3) {
    pages.add(2)
    pages.add(3)
    pages.add(4)
  }
  if (current >= total - 2) {
    pages.add(total - 1)
    pages.add(total - 2)
    pages.add(total - 3)
  }

  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b)
  const result: Array<number | 'ellipsis'> = []

  for (let i = 0; i < sorted.length; i += 1) {
    const value = sorted[i]!
    const prev = sorted[i - 1]
    if (prev !== undefined && value - prev > 1) {
      result.push('ellipsis')
    }
    result.push(value)
  }

  return result
}

export function Pagination({
  page,
  totalPages,
  getPageHref,
  className,
}: PaginationProps) {
  const safeTotal = Math.max(1, totalPages)
  const safePage = Math.min(Math.max(1, page), safeTotal)
  const numbers = pageNumbers(safePage, safeTotal)
  const atFirst = safePage <= 1
  const atLast = safePage >= safeTotal

  return (
    <nav
      aria-label="分页"
      className={cn(
        'border-border flex flex-nowrap items-center justify-center gap-1 overflow-x-auto border-t pt-6 sm:gap-1.5',
        className,
      )}
    >
      <Button
        asChild
        variant="outline"
        size="sm"
        disabled={atFirst}
        aria-disabled={atFirst}
        className={atFirst ? 'pointer-events-none opacity-50' : undefined}
      >
        <Link to={getPageHref(safePage - 1)} aria-label="上一页">
          <ChevronLeft />
          <span className="hidden sm:inline">上一页</span>
        </Link>
      </Button>

      {numbers.map((item, index) =>
        item === 'ellipsis' ? (
          <span
            key={`ellipsis-${index}`}
            className="text-muted-foreground px-1.5 text-sm sm:px-2"
            aria-hidden
          >
            …
          </span>
        ) : (
          <Button
            key={item}
            asChild
            variant={item === safePage ? 'default' : 'outline'}
            size="sm"
            className="min-w-8 shrink-0 sm:min-w-9"
          >
            <Link
              to={getPageHref(item)}
              aria-label={`第 ${item} 页`}
              aria-current={item === safePage ? 'page' : undefined}
            >
              {item}
            </Link>
          </Button>
        ),
      )}

      <Button
        asChild
        variant="outline"
        size="sm"
        disabled={atLast}
        aria-disabled={atLast}
        className={atLast ? 'pointer-events-none opacity-50' : undefined}
      >
        <Link to={getPageHref(safePage + 1)} aria-label="下一页">
          <span className="hidden sm:inline">下一页</span>
          <ChevronRight />
        </Link>
      </Button>
    </nav>
  )
}
