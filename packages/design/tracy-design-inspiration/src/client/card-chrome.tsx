/**
 * The pieces every library card of this plugin shares (Akemi, 12/10/2026: the Design system cards look and behave
 * exactly like the Design templates gallery's cards): the grid, the dim over the picture on hover, and the "Open
 * preview" pill. Used by the gallery (`Gallery.tsx`) and by the running site's Design system tab
 * (`DesignSystemGrid.tsx`), so the two cannot drift apart. The Add site form ports them (`tracy-add-site`
 * `design-system-card.tsx`): a plugin never imports another plugin's internals.
 */
import { cn } from '@tracy/ui'
import { Eye } from 'lucide-react'
import type { JSX } from 'react'

/**
 * The gallery's grid: as many 260 px-or-wider columns as the pane holds (three on a wide pane, fewer as it narrows,
 * one on a phone), 12 px apart.
 */
export const CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3'

/**
 * Hover: a dim of the picture (Akemi, 30/09, option B of the card hover bench). The dim is a scrim, not a theme colour:
 * a translucent black darkens any picture in either theme, which no token does, so the literal `bg-black/45` is
 * deliberate. It covers the picture only and takes no pointer events, so a live demo under it still starts on hover.
 * `className` adds the triggers a card has beyond the pointer (keyboard focus).
 */
export function PictureDim({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 bg-black/45 opacity-0 transition group-hover:opacity-100',
        className
      )}
    />
  )
}

/**
 * The Open preview pill, centred on the WHOLE card, picture and name row together (Akemi, 30/09: the middle of the
 * card, not of the picture). A layer over the card, fading with the dim, taking no pointer events so the card's own
 * click and the live demo's hover work. `className` adds the triggers a card has beyond the pointer (keyboard focus,
 * a screen with no hover).
 */
export function OpenPreviewPill({ label, className }: { label: string; className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-10 grid place-items-center opacity-0 transition group-hover:opacity-100',
        className
      )}
      data-open-preview=""
    >
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3.5 py-1.5 font-medium text-sm shadow-md backdrop-blur">
        <Eye size={15} className="text-primary" />
        {label}
      </span>
    </div>
  )
}
