import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { siteConfig } from '@/config/site'

const wechatGroupQrSrc = `https://ittoolplus.cn/donate/wechat_group.jpg?${Math.floor(Date.now() / 86400000)}`

type WechatGroupDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

export function WechatGroupDialog({
  open,
  onOpenChange,
  children,
}: WechatGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>微信群聊</DialogTitle>
          <DialogDescription>
            扫码加入 {siteConfig.name} 交流群，一起讨论与反馈。
          </DialogDescription>
        </DialogHeader>
        <figure className="flex flex-col items-center gap-2">
          <img
            src={wechatGroupQrSrc}
            alt="微信群聊二维码"
            width={280}
            height={280}
            className="w-full max-w-[280px] rounded-lg border border-border bg-white object-contain"
            loading="lazy"
          />
          <figcaption className="text-xs text-muted-foreground">
            微信扫码加入群聊
          </figcaption>
        </figure>
      </DialogContent>
    </Dialog>
  )
}
