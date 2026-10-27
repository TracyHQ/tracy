import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@tracy/ui'
import type { ReactNode } from 'react'

/** Portaled details keep table geometry stable; the shared primitive handles focus and collisions. */
export function SignalHoverCard({
  label,
  summary,
  children,
  interactive = false
}: {
  label: string
  summary: ReactNode
  children: ReactNode
  interactive?: boolean
}) {
  // Action cards need the popover's managed tab order; descriptive previews keep hover behavior.
  if (interactive)
    return (
      <Popover>
        <PopoverTrigger
          openOnHover
          className="signals-hover-trigger"
          aria-label={label}
          delay={100}
          closeDelay={80}
        >
          {summary}
        </PopoverTrigger>
        <PopoverContent
          data-slot="hover-card-content"
          className="signals-hover-card"
          align="start"
          initialFocus={(interaction) => interaction === 'keyboard'}
        >
          <strong className="signals-hover-title">{label}</strong>
          {children}
        </PopoverContent>
      </Popover>
    )
  return (
    <HoverCard>
      <HoverCardTrigger
        render={<button type="button" />}
        className="signals-hover-trigger"
        aria-label={label}
        delay={100}
        closeDelay={80}
      >
        {summary}
      </HoverCardTrigger>
      <HoverCardContent className="signals-hover-card" align="start" alignOffset={0}>
        <strong className="signals-hover-title">{label}</strong>
        {children}
      </HoverCardContent>
    </HoverCard>
  )
}
