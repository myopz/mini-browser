import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FilePlus2, Pencil, RotateCcw, Search, Trash2 } from 'lucide-react'

import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ItemFormDialog } from '@/components/ItemFormDialog'
import { Pagination } from '@/components/Pagination'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  deleteItems,
  ensureSampleItemsSeeded,
  listItems,
  resetSeedExamples,
  saveItem,
} from '@/lib/db'
import {
  createBlankItem,
  createSampleItems,
  touchItem,
} from '@/lib/item-factory'
import { paginate, parsePageParam } from '@/lib/pagination'
import type { Item } from '@/types/item'

const PAGE_SIZE = 9

function matchesQuery(item: Item, q: string): boolean {
  const haystack = [item.title, item.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(q)
}

export function ListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(
    null,
  )
  const [pendingReset, setPendingReset] = useState(false)
  const [resetError, setResetError] = useState('')

  const query = searchParams.get('q') ?? ''
  const page = parsePageParam(searchParams.get('page'))
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? items.filter((item) => matchesQuery(item, normalizedQuery))
    : items
  const slice = paginate(filtered, page, PAGE_SIZE)
  const pageIds = slice.items.map((item) => item.id)
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const somePageSelected = pageIds.some((id) => selectedIds.has(id))
  const selectedCount = selectedIds.size

  const refresh = async () => {
    setLoading(true)
    try {
      setItems(await listItems())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        setItems(await ensureSampleItemsSeeded())
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (page !== slice.page) {
      const next = new URLSearchParams(searchParams)
      if (slice.page <= 1) next.delete('page')
      else next.set('page', String(slice.page))
      setSearchParams(next, { replace: true })
    }
  }, [page, slice.page, searchParams, setSearchParams])

  const syncParams = (patch: { q?: string; page?: number }) => {
    const next = new URLSearchParams(searchParams)
    if (patch.q !== undefined) {
      if (patch.q.trim()) next.set('q', patch.q)
      else next.delete('q')
    }
    if (patch.page !== undefined) {
      if (patch.page > 1) next.set('page', String(patch.page))
      else next.delete('page')
    }
    setSearchParams(next, { replace: true })
  }

  const updateQuery = (nextQuery: string) => {
    syncParams({ q: nextQuery, page: 1 })
  }

  const getPageHref = (nextPage: number) => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query)
    if (nextPage > 1) params.set('page', String(nextPage))
    const qs = params.toString()
    return qs ? `/list?${qs}` : '/list'
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (item: Item) => {
    setEditing(item)
    setFormOpen(true)
  }

  const handleSubmit = async (values: {
    title: string
    description: string
  }) => {
    if (editing) {
      await saveItem(
        touchItem({
          ...editing,
          ...values,
        }),
      )
    } else {
      await saveItem(touchItem(createBlankItem(values)))
    }
    await refresh()
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const pendingDeleteCount = pendingDeleteIds?.length ?? 0
  const pendingDeleteSingle =
    pendingDeleteCount === 1
      ? items.find((item) => item.id === pendingDeleteIds![0])
      : undefined

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          列表
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          通用条目 CRUD 示例：支持搜索、分页与批量删除。数据保存在浏览器
          IndexedDB。
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            className="min-h-10 w-full sm:w-auto"
            onClick={openCreate}
          >
            <FilePlus2 className="size-4" />
            新建条目
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-10 w-full sm:w-auto"
            onClick={() => {
              setResetError('')
              setPendingReset(true)
            }}
          >
            <RotateCcw className="size-4" />
            重置示例
          </Button>
        </div>
      </header>

      <div className="relative mb-4 max-w-xl sm:mb-6">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          className="h-10 pl-9"
          placeholder="搜索标题、描述…"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          aria-label="搜索条目"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="font-display text-lg font-semibold">还没有条目</p>
          <p className="text-muted-foreground mt-2 text-sm">
            可新建条目，或一键恢复内置示例数据。
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={openCreate}>
              <FilePlus2 className="size-4" />
              新建条目
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
              setResetError('')
              setPendingReset(true)
            }}
            >
              <RotateCcw className="size-4" />
              重置示例
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="font-display text-lg font-semibold">没有匹配结果</p>
          <p className="text-muted-foreground mt-2 text-sm">
            试试其他关键词，或清空搜索。
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              共 {slice.total} 条
              {normalizedQuery ? `（匹配「${query.trim()}」）` : ''}
              {slice.totalPages > 1
                ? ` · 第 ${slice.page} / ${slice.totalPages} 页`
                : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="border-input size-4 rounded"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el)
                      el.indeterminate = somePageSelected && !allPageSelected
                  }}
                  onChange={toggleSelectPage}
                />
                <span className="text-muted-foreground">
                  {selectedCount > 0
                    ? `已选 ${selectedCount} 条`
                    : '全选本页'}
                </span>
              </label>
              {selectedCount > 0 ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setPendingDeleteIds([...selectedIds])}
                  >
                    <Trash2 className="size-4" />
                    批量删除
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={clearSelection}
                  >
                    取消
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {slice.items.map((item) => {
              const checked = selectedIds.has(item.id)
              return (
                <Card
                  key={item.id}
                  className="transition-transform hover:-translate-y-0.5"
                >
                  <CardHeader>
                    <div className="flex min-w-0 items-start gap-2">
                      <input
                        type="checkbox"
                        className="border-input mt-1 size-4 shrink-0 rounded"
                        checked={checked}
                        onChange={() => toggleSelect(item.id)}
                        aria-label={`选择 ${item.title || '未命名'}`}
                      />
                      <CardTitle className="min-w-0">
                        {item.title || '未命名'}
                      </CardTitle>
                    </div>
                    <CardDescription className="pl-6">
                      {item.description || '暂无描述'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 pl-6 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground text-xs">
                      更新于 {new Date(item.updatedAt).toLocaleString()}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="size-9 shrink-0"
                        aria-label="编辑"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive size-9 shrink-0"
                        aria-label="删除"
                        onClick={() => setPendingDeleteIds([item.id])}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          {slice.totalPages > 1 ? (
            <Pagination
              className="mt-8"
              page={slice.page}
              totalPages={slice.totalPages}
              getPageHref={getPageHref}
            />
          ) : null}
        </>
      )}

      <ItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={pendingDeleteIds !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIds(null)
        }}
        title={pendingDeleteCount > 1 ? '批量删除条目？' : '删除条目？'}
        description={
          pendingDeleteCount > 1
            ? `将删除选中的 ${pendingDeleteCount} 条记录，此操作不可撤销。`
            : pendingDeleteSingle
              ? `将删除「${pendingDeleteSingle.title}」，此操作不可撤销。`
              : pendingDeleteCount === 1
                ? '将删除该记录，此操作不可撤销。'
                : undefined
        }
        confirmText="删除"
        onConfirm={async () => {
          if (!pendingDeleteIds || pendingDeleteIds.length === 0) return
          const ids = pendingDeleteIds
          await deleteItems(ids)
          setPendingDeleteIds(null)
          setSelectedIds((prev) => {
            const next = new Set(prev)
            for (const id of ids) next.delete(id)
            return next
          })
          await refresh()
        }}
      />

      <ConfirmDialog
        open={pendingReset}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReset(false)
            setResetError('')
          }
        }}
        title="重置示例"
        description={
          resetError
            ? resetError
            : `将恢复 ${createSampleItems().length} 条内置示例条目。你自建的条目不会被删除。`
        }
        confirmText="确认重置"
        variant="default"
        onConfirm={async () => {
          try {
            const next = await resetSeedExamples()
            clearSelection()
            setItems(next)
            syncParams({ q: '', page: 1 })
          } catch (e) {
            setResetError(e instanceof Error ? e.message : '重置失败')
            throw e
          }
        }}
      />
    </div>
  )
}
