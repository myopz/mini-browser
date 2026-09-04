import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { donateMethods } from '@/config/donate'
import { siteConfig } from '@/config/site'

type DonateDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

export function DonateDialog({
  open,
  onOpenChange,
  children,
}: DonateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children ? <DialogTrigger asChild>{children}</DialogTrigger> : null}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>捐助</DialogTitle>
          <DialogDescription>
            如果 {siteConfig.name} 对你有帮助，欢迎扫码支持项目持续维护。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {donateMethods.map((method) => (
            <figure key={method.id} className="flex flex-col items-center gap-2">
              <figcaption className="font-display text-sm font-semibold text-foreground">
                {method.name}
              </figcaption>
              <img
                src={method.src}
                alt={`${method.name}收款码`}
                width={200}
                height={200}
                className="size-44 rounded-lg border border-border bg-white object-contain sm:size-48"
                loading="lazy"
              />
              <p className="text-xs text-muted-foreground">{method.hint}</p>
            </figure>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
