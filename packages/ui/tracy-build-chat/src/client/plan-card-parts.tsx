/**
 * The small pieces the plan card is drawn from (#606, #575): a section with its heading, a labelled row, a value shown
 * as it is, a fact the sources disagree on, the child lists of a section, a part that opens and closes with its count,
 * and the trash button of a part the owner can take off. Pure views: every change goes back through the card.
 */
import { IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BlockHolds, BlockList, PlanFact } from '@tracy/core/build-chat'
import { type ReactNode, useId } from 'react'
import { factLabelOf, sourceNameOf } from './plan-words'
import type { StringKey, Translate } from './strings'

/** One key of a pair of plural keys (`<base>.one` / `<base>.other`). */
export const plural = (
  t: Translate,
  base: string,
  count: number,
  vars: Record<string, string | number> = {}
) => t(`${base}.${count === 1 ? 'one' : 'other'}` as StringKey, { count, ...vars })

/** "A, B and C" with the dictionary's "and". */
export function listOf(t: Translate, parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return t('plan.and', { first: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] as string })
}

/** Words said once each, in the order they first come, with a count when one comes again: "Social link (2)". */
export function onceEach(words: string[]): string[] {
  const seen = new Map<string, number>()
  for (const w of words) seen.set(w, (seen.get(w) ?? 0) + 1)
  return [...seen].map(([w, n]) => (n === 1 ? w : `${w} (${n})`))
}

/** A language's name in the interface language, or its tag when the browser has no name for it. */
export function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

const COUNT_KINDS = new Set(['service', 'person', 'quote', 'gallery'])

/** A section's line, built from the data it will hold: "Business name, tagline, main button", "6 reviews". */
export function holdsText(t: Translate, holds: BlockHolds): string {
  if ('services' in holds) return holds.services.join(', ')
  // "Business name, tagline, main button": the English labels go lower case after the first. A translated label keeps
  // its own case, since a language like German writes its nouns with a capital.
  const said = holds.facts.map((label, i) => {
    const word = factLabelOf(t, holds.factKinds?.[i], label)
    return i === 0 || word !== label ? word : word.toLowerCase()
  })
  // Each kind once, in the order it first comes, with a count when it comes more than once: "Social link (2)".
  const seen = new Map<string, number>()
  for (const word of said) seen.set(word.toLowerCase(), (seen.get(word.toLowerCase()) ?? 0) + 1)
  const facts = said
    .filter((word, i) => said.findIndex((w) => w.toLowerCase() === word.toLowerCase()) === i)
    .map((word) => {
      const n = seen.get(word.toLowerCase()) ?? 1
      return n === 1 ? word : `${word} (${n})`
    })
  const counts = holds.counts.map((c) =>
    plural(t, `plan.count.${COUNT_KINDS.has(c.kind) ? c.kind : 'item'}`, c.count)
  )
  const text = [...facts, ...counts].join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** The child lists of a section, each with its rows in the plan's order; a row's own lists follow it, indented. */
export function BlockLists({ lists }: { lists: BlockList[] }) {
  return (
    <div className="tv-bc-lists">
      {lists.map((l, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: lists come in the plan's order and have no id
        <section key={i} className="tv-bc-list">
          {l.head && <div className="tv-bc-lh">{l.head}</div>}
          <ul className="tv-bc-rows">
            {l.rows.map((r, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: two rows may read the same
              <li key={j}>
                {r.label}
                {r.lists && <BlockLists lists={r.lists} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** One plan value, shown as it is. `field` names the plan field it shows. */
export function Value({
  field,
  source,
  note,
  children
}: {
  field?: string
  source?: string
  note?: string
  children: ReactNode
}) {
  return (
    <div className="tv-bc-val" data-field={field}>
      <div className="tv-bc-val-row">
        <span className="tv-bc-v">{children}</span>
        {source && <span className="tv-bc-src">{source}</span>}
      </div>
      {note && <div className="tv-bc-note">{note}</div>}
    </div>
  )
}

/** A fact the sources disagree on: its values as a radio group, the plan's current value checked. */
export function Conflict({
  fact,
  label,
  t,
  busy,
  changed,
  onPick
}: {
  fact: PlanFact & { choice: NonNullable<PlanFact['choice']> }
  label: string
  t: Translate
  busy: boolean
  changed: boolean
  onPick: (value: string) => void
}) {
  const name = useId()
  return (
    <div className="tv-bc-val" data-field={fact.field} data-changed={changed || undefined}>
      <div className="tv-bc-choice" role="radiogroup" aria-label={label} aria-busy={busy}>
        {fact.choice.options.map((o) => (
          <label key={o.value} className="tv-bc-opt" data-checked={o.selected || undefined}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.selected}
              // Not disabled while a pick is saved: a disabled radio drops the focus the arrow key just put on it.
              aria-disabled={busy || undefined}
              onChange={() => {
                if (!busy) onPick(o.value)
              }}
            />
            <span className="tv-bc-v">{o.text ?? o.value}</span>
            <span className="tv-bc-src">{sourceNameOf(t, o.sourceKind, o.source)}</span>
          </label>
        ))}
      </div>
      {/* What was assumed holds only while the default (first) value stands; once another is picked it is stale. */}
      {fact.choice.options[0]?.selected && <div className="tv-bc-note">{fact.choice.said}</div>}
    </div>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tv-bc-plan-sec" aria-label={title}>
      <h4>{title}</h4>
      {children}
    </section>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="tv-bc-k">{label}</div>
      <div className="tv-bc-cell">{children}</div>
    </>
  )
}

/** A part that opens and closes, with what it holds counted beside its name. Closed until the owner opens it. */
export function Fold({
  summary,
  count,
  open,
  group,
  children
}: {
  summary: ReactNode
  count?: string
  open?: boolean
  group?: string
  children: ReactNode
}) {
  return (
    <details className="tv-bc-fold" open={open} data-group={group}>
      <summary>
        <span className="tv-bc-fold-t">{summary}</span>
        {count && <span className="tv-bc-n">{count}</span>}
      </summary>
      <div className="tv-bc-fold-b">{children}</div>
    </details>
  )
}

/** The trash button of a part the owner can take off the plan; its label names the part. */
export function Trash({
  t,
  what,
  busy,
  onRemove
}: {
  t: Translate
  what: string
  busy: boolean
  onRemove: () => void
}) {
  return (
    <button
      type="button"
      className="tv-bc-btn tv-bc-trash"
      data-ghost=""
      aria-label={t('plan.remove', { what })}
      // Not disabled while a change is saved: a disabled button drops the focus that is on it.
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onRemove()
      }}
    >
      <IconTrashOutlineRegular aria-hidden />
    </button>
  )
}
