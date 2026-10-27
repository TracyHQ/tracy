/**
 * The shared parts of the Add site form's option cards (Customize your site, Design system): the badge, a
 * picture on a soft terracotta rounded square (Akemi, 07/10/2026), drawn left of the card's three lines and in the
 * sheet's head, and line 1 (the title and the Optional tag). The icon and its size and stroke are the three values to
 * change when the picture changes; the badge's box is `.tas-qcard-badge` in `styles.ts`.
 */
import { type LucideIcon, WandSparkles } from 'lucide-react'
import type { JSX } from 'react'

// Customize your site draws a magic wand; the palette belongs to the Design system card (Akemi, 12/10/2026).
const BADGE_ICON = WandSparkles
const BADGE_ICON_SIZE = 24
const BADGE_ICON_STROKE = 1.75

/** `icon` swaps the picture for another card of the same family (the Design system card draws a palette). */
export function CardBadge({ icon: Icon = BADGE_ICON }: { icon?: LucideIcon } = {}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="tas-qcard-badge grid place-items-center bg-primary/10 text-primary dark:bg-primary/15"
    >
      <Icon size={BADGE_ICON_SIZE} strokeWidth={BADGE_ICON_STROKE} className="tas-qcard-icon" />
    </span>
  )
}

/** Line 1 of an option card: the card's title and the Optional tag (the whole step can be skipped). */
export function CardTitleLine({ title, optional }: { title: string; optional: string }): JSX.Element {
  return (
    <span className="tas-qcard-l1">
      <span className="tas-qcard-title font-medium text-sm">{title}</span>
      <span className="tas-qcard-keep rounded-full border border-border px-[7px] text-[11px] text-muted-foreground leading-[18px]">
        {optional}
      </span>
    </span>
  )
}
