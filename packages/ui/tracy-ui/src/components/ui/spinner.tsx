import { Loader2Icon } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * `label`: what a screen reader announces while this turns, translated by the caller. There is no
 * default: one written here would be English in every language (#797).
 */
function Spinner({ className, label, ...props }: React.ComponentProps<'svg'> & { label: string }) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
