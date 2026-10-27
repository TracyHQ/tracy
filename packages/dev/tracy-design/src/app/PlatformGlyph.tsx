import { cn } from '@tracy/ui'

import type { Platform } from '../fixtures'

const GLYPH: Record<Platform, { letter: string; className: string }> = {
  joomla: { letter: 'J', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  wordpress: { letter: 'W', className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  shopify: { letter: 'S', className: 'bg-green-500/15 text-green-600 dark:text-green-400' }
}

export function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  const g = GLYPH[platform]
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full font-bold text-[10px]',
        g.className,
        className
      )}
    >
      {g.letter}
    </span>
  )
}
