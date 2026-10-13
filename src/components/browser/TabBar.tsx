import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BrowserTab } from '@/types/browser'

type TabBarProps = {
  tabs: BrowserTab[]
  activeTabId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
}: TabBarProps) {
  return (
    <div className="border-border bg-muted/40 flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b px-1 pt-1">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={cn(
              'group flex h-8 max-w-48 min-w-28 items-center gap-0.5 rounded-t-md border border-b-0 px-1.5 text-xs',
              active
                ? 'border-border bg-background text-foreground'
                : 'border-transparent bg-transparent text-muted-foreground hover:bg-background/60',
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate px-1 text-left"
              title={tab.url || tab.title}
              onClick={() => onSelect(tab.id)}
            >
              {tab.title || '新标签页'}
            </button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={cn(
                'size-5 shrink-0 opacity-0 group-hover:opacity-100',
                active && 'opacity-70',
              )}
              title="关闭标签"
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.id)
              }}
            >
              <X className="size-3" />
            </Button>
          </div>
        )
      })}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="mb-0.5 size-7 shrink-0"
        title="新建标签"
        onClick={onNew}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}
