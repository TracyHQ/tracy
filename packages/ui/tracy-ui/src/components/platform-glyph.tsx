import { cn } from '../lib/cn'

export type Platform = 'joomla' | 'wordpress' | 'shopify' | 'emdash'

const GLYPH: Record<Platform, { letter: string; className: string }> = {
  joomla: { letter: 'J', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  wordpress: { letter: 'W', className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  shopify: { letter: 'S', className: 'bg-green-500/15 text-green-600 dark:text-green-400' },
  emdash: { letter: 'E', className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' }
}

/**
 * Round platform badge for a site. When the platform is unknown (the cloud API
 * has no read door for it yet) pass `letter` — usually the site's first letter —
 * and the glyph renders in neutral colors.
 */
export function PlatformGlyph({
  platform,
  letter,
  className
}: {
  platform?: Platform | null
  letter?: string
  className?: string
}) {
  const g = platform ? GLYPH[platform] : null
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full font-bold text-[10px]',
        g ? g.className : 'bg-muted text-muted-foreground',
        className
      )}
    >
      {g ? g.letter : (letter ?? '•').toUpperCase()}
    </span>
  )
}
