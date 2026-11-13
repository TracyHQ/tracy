/**
 * A plan card value the owner changes in place (TracyHQ/tracy#607), and the undo arrow of the card head. The value is
 * a button labelled with its field; pressed, it becomes an editor whose Enter or Save hands the typed text to the
 * card, and whose Escape or Cancel closes it. The card decides what is sent and which value was just changed.
 */
import { IconEditOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { type ReactNode, useId, useState } from 'react'
import type { Translate } from './strings'

/** What every editable value shares: the card's editor state and its translator. */
export interface EditContext {
  t: Translate
  editing: string | null
  busy: boolean
  changed: Set<string>
  start: (field: string) => void
  cancel: (field: string) => void
  save: (field: string, current: string | number, text: string) => void
}

/** A plan value the owner can change in place: a button showing the value, an editor while it is changed. */
export function EditableValue({
  ctx,
  field,
  label,
  current,
  text,
  source,
  note,
  children
}: {
  ctx: EditContext
  field: string
  label: string
  /** The field's value in the plan, put in the editor. */
  current: string | number
  /** The value as read aloud, the same words the button shows. */
  text: string
  source?: string
  note?: string
  children?: ReactNode
}) {
  const { t } = ctx
  const changedId = useId()
  const [typed, setTyped] = useState(String(current))
  const editing = ctx.editing === field
  const changed = ctx.changed.has(field)
  if (editing)
    return (
      <div className="tv-bc-val" data-field={field} data-editing="">
        <div className="tv-bc-edit">
          <input
            // biome-ignore lint/a11y/noAutofocus: the editor opens because the owner just pressed this value
            autoFocus
            value={typed}
            inputMode={typeof current === 'number' ? 'numeric' : undefined}
            aria-label={t('plan.newValue', { label })}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ctx.save(field, current, typed)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                ctx.cancel(field)
              }
            }}
          />
          <button
            type="button"
            className="tv-bc-btn"
            data-primary=""
            onClick={() => ctx.save(field, current, typed)}
          >
            {t('plan.save')}
          </button>
          <button type="button" className="tv-bc-btn" data-ghost="" onClick={() => ctx.cancel(field)}>
            {t('plan.cancel')}
          </button>
        </div>
      </div>
    )
  return (
    <div className="tv-bc-val" data-field={field} data-changed={changed || undefined}>
      <button
        type="button"
        className="tv-bc-val-row tv-bc-val-edit"
        aria-label={t('plan.edit', { label, value: text })}
        aria-describedby={changed ? changedId : undefined}
        // Not disabled while a change is saved: a disabled button drops the focus that just came back to it.
        aria-disabled={ctx.busy || undefined}
        onClick={() => {
          if (ctx.busy) return
          setTyped(String(current))
          ctx.start(field)
        }}
      >
        <span className="tv-bc-v">{children ?? text}</span>
        {changed ? (
          <span id={changedId} className="tv-bc-chip" data-accent="">
            {t('plan.changed')}
          </span>
        ) : (
          source && <span className="tv-bc-src">{source}</span>
        )}
        <span className="tv-bc-pen" aria-hidden>
          <IconEditOutlineRegular />
        </span>
      </button>
      {note && <div className="tv-bc-note">{note}</div>}
    </div>
  )
}

/** The undo arrow of the approved mock; dsh's icon set has none. */
export function UndoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  )
}
