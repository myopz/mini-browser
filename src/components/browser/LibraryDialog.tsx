import { Star, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Bookmark, Visit } from '@/types/browser'

type LibraryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'bookmarks' | 'history'
  bookmarks: Bookmark[]
  history: Visit[]
  onOpenUrl: (url: string, newTab?: boolean) => void
  onRemoveBookmark: (id: string) => void
  onClearHistory: () => void
}

export function LibraryDialog({
  open,
  onOpenChange,
  mode,
  bookmarks,
  history,
  onOpenUrl,
  onRemoveBookmark,
  onClearHistory,
}: LibraryDialogProps) {
  const isBookmarks = mode === 'bookmarks'
  const items = isBookmarks
    ? bookmarks.map((b) => ({
        id: b.id,
        title: b.title,
        url: b.url,
        meta: new Date(b.createdAt).toLocaleString(),
      }))
    : history.map((v) => ({
        id: v.id,
        title: v.title || v.url,
        url: v.url,
        meta: new Date(v.visitedAt).toLocaleString(),
      }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>{isBookmarks ? '收藏夹' : '历史记录'}</span>
            {!isBookmarks && history.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={onClearHistory}
              >
                清空
              </Button>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {isBookmarks ? '暂无收藏' : '暂无历史'}
          </p>
        ) : (
          <ul className="max-h-[min(60svh,28rem)] space-y-0.5 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className="hover:bg-accent/60 flex items-start gap-1 rounded-md px-2 py-2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    onOpenUrl(item.url)
                    onOpenChange(false)
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault()
                      onOpenUrl(item.url, true)
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {isBookmarks ? (
                      <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />
                    ) : null}
                    <span className="truncate text-sm font-medium">
                      {item.title}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {item.url}
                  </p>
                  <p className="text-muted-foreground/80 mt-0.5 text-[11px]">
                    {item.meta}
                  </p>
                </button>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      onOpenUrl(item.url, true)
                      onOpenChange(false)
                    }}
                  >
                    新标签
                  </Button>
                  {isBookmarks ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      title="取消收藏"
                      onClick={() => onRemoveBookmark(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
