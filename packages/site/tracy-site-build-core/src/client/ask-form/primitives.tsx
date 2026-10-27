/**
 * The small pieces every Tracy question surface draws with: a labelled field, a row of toggle
 * chips, and a radio card. Moved here unchanged (04/10/2026) from the Build form (`Field`,
 * `Chips`, `BuildForm.tsx`) and the add-site wizards (`ChoiceOption`, `tracy-add-site/src/client/
 * choice.tsx`, which re-exports it), so the ask form draws with the same markup and classes.
 *
 * 🔒 CSS: utility classes on the no-preflight Tailwind recipe of `DESIGN.md` §3. Every plugin that
 * bundles this file must scan this folder in its `@source` list, or a class used only here is
 * missing from that plugin's sheet.
 */
import { cn, Label, RadioGroupItem } from '@tracy/ui'
import type { JSX, ReactNode } from 'react'

export function Field({
  label,
  hint,
  note,
  children
}: {
  label: ReactNode
  hint?: string

  /** One line under the box — a fact about the answer, not a hint for typing it. */
  note?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {note ? <p className="m-0 text-muted-foreground text-xs">{note}</p> : null}
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  )
}

export function Chips({
  items,
  on,
  onToggle
}: {
  items: [string, string][]
  on: string[]
  onToggle?: (item: string) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([key, label]) => (
        <button
          type="button"
          key={key}
          onClick={() => onToggle?.(key)}
          className={cn(
            'rounded-md border px-2.5 py-1 text-sm',
            on.includes(key)
              ? 'border-primary bg-primary/10 font-medium'
              : 'border-border text-muted-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export interface ChoiceOptionProps {
  value: string
  selected: boolean
  /** A node so the ask form can put its Recommended tag beside the words. */
  title: ReactNode
  /** Absent draws no second line (an agent's option may carry no description). */
  description?: string
  /** Optional callout under the description (a node, so the caller owns icon and wording). */
  hint?: ReactNode
}

/**
 * One choice drawn as a card: radio, title, description. Must sit INSIDE a `RadioGroup` of
 * `@tracy/ui`: `RadioGroupItem` reads the selected value from the group's context. The wrapping
 * `<label>` makes the whole card clickable — base-ui puts a hidden `<input>` beside the radio, and
 * that input takes the click from the label.
 */
export function ChoiceOption({ value, selected, title, description, hint }: ChoiceOptionProps): JSX.Element {
  return (
    <label
      data-selected={selected ? '1' : '0'}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-card-foreground',
        selected ? 'border-primary' : 'border-border'
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      {/* A column, so title and description are two lines and never read as one sentence —
          note 2 in tracy-add-site/src/client/styles.ts. */}
      <span className="flex min-w-0 flex-col">
        <span className="font-medium text-sm">{title}</span>
        {description === undefined ? null : (
          <span className="mt-0.5 text-muted-foreground text-xs">{description}</span>
        )}
        {hint === undefined ? null : (
          // A tint of the card's own text colour on the card's own background: one rule right in
          // light and dark, and the callout stays inside the text column, never under the radio.
          <span className="mt-2 flex items-start gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--card-foreground)_7%,var(--card))] px-2.5 py-1.5 text-card-foreground text-xs">
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}
