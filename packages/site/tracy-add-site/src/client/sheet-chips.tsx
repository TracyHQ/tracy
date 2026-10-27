/**
 * The choice and multiple-choice questions of the "Customize your site" sheet, as chips (approved canvas
 * `11-sheet-review-canvas.html`, `fChoice` and `chipList`; T09 of TracyHQ/tch#1013).
 *
 * Single choice (Tone): chips with a small radio dot; pressing the chosen chip again clears it, since every question
 * is optional. Multiple choice (Pages): chips with a + that turns into a tick. The Pages question starts with every
 * page of the template ticked (no answer yet means every page); its home page is locked, ticked and
 * `aria-disabled`, with a tooltip saying why. A template that ships no page list keeps every page, and the card says
 * so instead of drawing chips.
 *
 * Hover never borrows the chosen terracotta, so "hovered" and "chosen" never look alike. CSS: `SHEET_CHIPS_CSS`.
 */
import { Check } from 'lucide-react'
import type { JSX } from 'react'

import type { AskItemRenderProps } from '../../../tracy-site-build-core/src/client/ask-form/AskForm'
import type { Translate } from './strings'

export interface ChoiceChipsProps extends AskItemRenderProps {
  /**
   * A short muted line beside an option, by option value (the Tone question's "Friendly and personal"), or undefined.
   * On the Customize your site page a single choice is a column of full-width rows, so the line has room
   * (the sections rules at the end of `sheet-chips-css.ts`).
   */
  describe?: (value: string) => string | undefined
}

/** Tone and every other single choice. */
export function ChoiceChips({
  item,
  entry,
  onEntry,
  labelId,
  busy,
  describe
}: ChoiceChipsProps): JSX.Element {
  const chosen = entry.selected[0]
  return (
    <div className="tas-chips" role="radiogroup" aria-labelledby={labelId}>
      {(item.options ?? []).map((option) => {
        const on = option.value === chosen
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={busy}
            className="tas-chip"
            data-on={on ? '1' : '0'}
            onClick={() => onEntry({ selected: on ? [] : [option.value] })}
          >
            <span className="tas-chip-radio" aria-hidden="true" />
            {option.label}
            {describe?.(option.value) ? (
              <span className="tas-chip-desc">{describe(option.value)}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export interface MultiChipsProps extends AskItemRenderProps {
  /** Options that are always ticked and cannot be unticked (the home page). */
  locked: string[]
  /** No answer yet means every option is ticked (the Pages question). */
  allByDefault: boolean
  /** Said on a locked chip. */
  lockedHint: string
}

/** Pages and every other multiple choice. */
export function MultiChips({
  item,
  entry,
  onEntry,
  labelId,
  busy,
  locked,
  allByDefault,
  lockedHint
}: MultiChipsProps): JSX.Element {
  const options = (item.options ?? []).map((o) => o.value)
  const ticked = allByDefault && entry.selected.length === 0 ? options : entry.selected
  const toggle = (value: string) => {
    if (locked.includes(value)) return
    const next = ticked.includes(value) ? ticked.filter((v) => v !== value) : [...ticked, value]
    // A list with nothing left ticked would read as "every page" again: the last page cannot be unticked.
    if (allByDefault && next.filter((v) => !locked.includes(v)).length === 0 && locked.length === 0) return
    onEntry({ selected: options.filter((v) => next.includes(v) || locked.includes(v)) })
  }
  return (
    <div className="tas-chips" role="group" aria-labelledby={labelId}>
      {(item.options ?? []).map((option) => {
        const isLocked = locked.includes(option.value)
        const on = isLocked || ticked.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            aria-disabled={isLocked ? true : undefined}
            title={isLocked ? lockedHint : undefined}
            disabled={busy}
            className="tas-chip"
            data-on={on ? '1' : '0'}
            data-locked={isLocked ? '1' : undefined}
            data-page={option.value}
            onClick={() => toggle(option.value)}
          >
            {on ? (
              <Check aria-hidden="true" className="tas-chip-tick" />
            ) : (
              <span className="tas-chip-plus" aria-hidden="true">
                +
              </span>
            )}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** The Pages question of a template that ships no page list: every page is kept, said in one line. */
export function AllPagesKept({ t }: { t: Translate }): JSX.Element {
  return (
    <p className="tas-pages-kept" data-pages-kept="1">
      {t('pages_all_kept')}
    </p>
  )
}
