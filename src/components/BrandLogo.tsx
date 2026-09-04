import { cn } from '@/lib/utils'

type BrandLogoProps = {
  className?: string
  title?: string
}

export function BrandLogo({
  className,
  title = 'ittool++',
}: BrandLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={title}
      className={cn('size-8 shrink-0', className)}
    >
      <title>{title}</title>
      <rect width="64" height="64" rx="16" className="fill-primary" />
      <rect
        x="12"
        y="12"
        width="40"
        height="40"
        rx="10"
        className="stroke-accent"
        strokeWidth="3.5"
        fill="none"
      />
      <rect x="29" y="20" width="6" height="24" rx="3" className="fill-accent" />
      <rect x="20" y="29" width="24" height="6" rx="3" className="fill-accent" />
      <circle cx="46" cy="18" r="3.5" className="fill-primary-foreground" />
      <circle cx="46" cy="18" r="1.5" className="fill-primary" />
    </svg>
  )
}
