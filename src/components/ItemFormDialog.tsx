import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Item } from '@/types/item'

type ItemFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: Item | null
  onSubmit: (values: {
    title: string
    description: string
  }) => void | Promise<void>
}

type ItemFormFieldsProps = {
  initial?: Item | null
  onCancel: () => void
  onSubmit: ItemFormDialogProps['onSubmit']
}

function ItemFormFields({ initial, onCancel, onSubmit }: ItemFormFieldsProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextTitle = title.trim()
    if (!nextTitle) return
    setSaving(true)
    try {
      await onSubmit({
        title: nextTitle,
        description: description.trim(),
      })
      onCancel()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
      <div className="grid gap-2">
        <Label htmlFor="item-title">标题</Label>
        <Input
          id="item-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="条目标题"
          required
          autoFocus
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="item-description">描述</Label>
        <textarea
          id="item-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="可选描述"
          rows={4}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={saving || !title.trim()}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </form>
  )
}

export function ItemFormDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: ItemFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑条目' : '新建条目'}</DialogTitle>
          <DialogDescription>
            填写标题与描述，数据保存在本地 IndexedDB。
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ItemFormFields
            key={initial?.id ?? 'create'}
            initial={initial}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
