import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { OFFICIAL_ORIGIN, siteConfig } from '@/config/site'

const wechatGzhQrSrc = `${OFFICIAL_ORIGIN}/donate/wechat_gzh.jpg?${Math.floor(Date.now() / 86400000)}`

type WechatGzhDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

export function WechatGzhDialog({
  open,
  onOpenChange,
  children,
}: WechatGzhDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>微信公众号</DialogTitle>
          <DialogDescription>
            扫码关注 {siteConfig.name} 公众号，获取更新与实用内容。
          </DialogDescription>
        </DialogHeader>
        <figure className="flex flex-col items-center gap-2">
          <img
            src={wechatGzhQrSrc}
            alt="微信公众号二维码"
            width={280}
            height={280}
            className="w-full max-w-[280px] rounded-lg border border-border bg-white object-contain"
            loading="lazy"
          />
          <figcaption className="text-xs text-muted-foreground">
            微信扫码关注公众号
          </figcaption>
        </figure>
      </DialogContent>
    </Dialog>
  )
}
