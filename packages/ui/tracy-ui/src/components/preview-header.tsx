/**
 * The header row of a full-size preview popup (Akemi, 12/10/2026), one drawing for every popup that previews a template
 * or a design system: the Design templates gallery's popup, the Design system tab's popup, and the Add site form's
 * Design system sheet popup. They live in different plugins, so the row lives here instead of being ported per plugin.
 *
 * Left: the pager (`PreviewPager`, when there is a list to step through), the name as the dialog's title (its
 * description in the tooltip), the palette dots, then whatever the caller adds. Right: the caller's actions, the
 * primary one drawn with `PreviewHeaderAction`; the row stops short of the dialog's own X and wraps on a narrow window
 * instead of running under it.
 *
 * Every word comes from the caller, already translated (#797).
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ComponentProps, JSX, ReactNode } from 'react'

import { cn } from '../lib/cn'
import { Button } from './ui/button'
import { DialogTitle } from './ui/dialog'

export interface PreviewPagerProps {
  /** "2 of 29", already translated. */
  position: string
  prevLabel: string
  nextLabel: string
  onStep: (dir: -1 | 1) => void
}

/**
 * "‹ 2 of 29 ›" in one rounded pill. It stands FIRST in the header, so however long the name it never moves when the
 * customer steps (Lee, 07/09).
 */
export function PreviewPager({ position, prevLabel, nextLabel, onStep }: PreviewPagerProps): JSX.Element {
  const arrow = 'size-6 rounded-full hover:bg-foreground/10 dark:hover:bg-foreground/10'
  return (
    <span className="flex shrink-0 items-center rounded-full border border-input p-0.5" data-preview-pager="">
      <Button size="icon" variant="ghost" className={arrow} onClick={() => onStep(-1)} aria-label={prevLabel}>
        <ChevronLeft size={15} />
      </Button>
      {/* Fixed width, so stepping from 9 to 10 does not nudge the name; wide enough for "235 of 235" and the
          Vietnamese "235 / 235", and never broken in two (Lee, 08/09). */}
      <span className="w-16 whitespace-nowrap text-center text-muted-foreground text-xs tabular-nums">
        {position}
      </span>
      <Button size="icon" variant="ghost" className={arrow} onClick={() => onStep(1)} aria-label={nextLabel}>
        <ChevronRight size={15} />
      </Button>
    </span>
  )
}

export interface PreviewHeaderProps {
  /** The pager; null or absent when there is nothing to step through. */
  pager?: PreviewPagerProps | null
  /** The name, drawn as the dialog's title. */
  name: string
  /** Shown as the name's tooltip; empty gives none. */
  description?: string | null
  /** Palette colours drawn as dots after the name. */
  swatches?: readonly string[]
  /** More on the left, after the dots (a short muted line). */
  lead?: ReactNode
  /** The right group: the primary action last, just before the dialog's X. */
  children?: ReactNode
}

export function PreviewHeader({
  pager,
  name,
  description,
  swatches,
  lead,
  children
}: PreviewHeaderProps): JSX.Element {
  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2 border-border border-b py-3 pr-13 pl-5">
      {pager ? <PreviewPager {...pager} /> : null}
      <DialogTitle className="min-w-0 truncate font-semibold text-base" title={description || undefined}>
        {name}
      </DialogTitle>
      {swatches && swatches.length > 0 ? (
        <span aria-hidden="true" className="flex shrink-0 gap-1" data-preview-swatches={swatches.length}>
          {swatches.map((hex) => (
            <span
              key={hex}
              className="size-3 rounded-full border border-border"
              style={{ background: hex }}
            />
          ))}
        </span>
      ) : null}
      {lead}
      {children ? <div className="ml-auto flex min-w-0 items-center gap-3">{children}</div> : null}
    </div>
  )
}

/** The header's primary button: the small size every preview popup uses for its one action. */
export function PreviewHeaderAction({ className, ...props }: ComponentProps<typeof Button>): JSX.Element {
  return <Button size="sm" className={cn('h-7 shrink-0 px-2.5 text-xs', className)} {...props} />
}
