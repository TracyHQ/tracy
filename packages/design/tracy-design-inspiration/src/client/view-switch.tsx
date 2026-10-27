/**
 * The two-or-three-sided switch a preview popup's second row is made of (Light | Dark, Desktop | Mobile): the chosen
 * side filled, the others muted, every side the same height so a press never changes the control's width (Akemi,
 * 29/09). Shared by the Design templates popup (`PreviewDialog.tsx`) and the Design system popup's row
 * (`preview-stage.tsx` `DeviceRow`), so both draw the same control.
 */
import { cn } from '@tracy/ui'
import type { LucideIcon } from 'lucide-react'
import type { JSX } from 'react'

/** The rounded group around the sides. */
export const SWITCH_GROUP =
  'flex shrink-0 items-center gap-0.5 rounded-full border border-input p-0.5 font-sans text-xs'

/** One side of a switch: filled when chosen. `props` go on the button (onClick, title, disabled, data attributes). */
export function SwitchSide({
  on,
  Icon,
  label,
  props
}: {
  on: boolean
  Icon: LucideIcon
  label: string
  props: Record<string, unknown>
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        'flex h-6 items-center gap-1 rounded-full border px-2.5 disabled:pointer-events-none disabled:opacity-40',
        on
          ? 'border-foreground bg-foreground text-background'
          : 'border-transparent text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
      )}
      {...props}
    >
      <Icon size={13} aria-hidden />
      {label}
    </button>
  )
}
