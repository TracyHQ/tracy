/**
 * The plan card (TracyHQ/tracy#606, #607): the Contract B plan as labelled values, read before approval. Business
 * facts with their source, the look section, services, pages and the data each block will hold with its reason, the
 * pictures summary, the assumptions and what was left out. It shows no written copy: copy is written after approval.
 *
 * A value a Contract B plan edit can change (a fact, a service name, the accent colour)
 * is a button: pressed, it turns into an editor; Enter or Save sends one structured plan edit (`onEdit`), Escape or
 * Cancel puts the value back, and focus returns to the value either way. Values a plan edit cannot set as text (the
 * language, the template, the logo, what a block holds, your photos) are shown, not offered. A fact the sources
 * disagree on offers its values as a radio group instead. Every change goes through `send(changes)`, and the card
 * follows the draft it gets back: its plan, its last edit and whether one undo is still offered (`onUndo`).
 *
 * The value just changed is highlighted from the draft (`changedFieldsOf`), not from what this card remembers, so a
 * card drawn again from the draft shows the same highlight. A larger change asked for in the chat arrives as a newer
 * plan in `plan`: the card draws it in place; there is one living plan and no list of versions. A renamed service is
 * one change to its item: every block that shows the services reads the item, so the Services page and the Services
 * block on Home follow without the card touching them. Approve and Change the plan are dsh's plan review bar, fed by
 * `planReviewRequestOf`; this card writes nothing else.
 */
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  type BlockHolds,
  type BlockList,
  type PlanCard as Card,
  changedFieldsOf,
  type PlanDraft,
  type PlanFact,
  planCardOf,
  planChangeOf,
  planEditOf,
  type RevisionNote
} from '@tracy/core/build-chat'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { type EditContext, EditableValue, UndoIcon } from './EditableValue'
import type { StringKey, Translate } from './strings'

export interface PlanCardProps {
  /** The Contract B plan as the draft holds it now. */
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B plan, checked by the contract
  plan: any
  /** The draft's last plan edit (`lastEdit`), for the changed value highlight. */
  lastEdit?: PlanDraft['lastEdit']
  /** Whether the draft offers one undo (`canUndo`). */
  canUndo?: boolean
  t: Translate
  /** Sends a structured plan edit and resolves to the draft tracy-web answered with. */
  onEdit: (edit: ReturnType<typeof planEditOf>) => Promise<PlanDraft>
  /** Takes the last plan edit back and resolves to the draft tracy-web answered with. */
  onUndo: () => Promise<PlanDraft>
  /** The interface language, for the site language's name. */
  locale?: string
  /** A fresh plan edit id; a test passes a fixed one. */
  newEditId?: () => string
  /** What the last change request did (#609): drawn as a note at the top until it is dismissed. */
  revised?: RevisionNote | null
  /** The owner hides the note. */
  onDismissRevised?: () => void
}

/** How many Left out lines show before "Show all". */
const LEFT_OUT_SHOWN = 6

/** The same line said again and again becomes one line with a count, in the order it first came. */
function grouped<T>(items: T[], keyOf: (item: T) => string): { item: T; count: number }[] {
  const lines = new Map<string, { item: T; count: number }>()
  for (const item of items) {
    const seen = lines.get(keyOf(item))
    if (seen) seen.count += 1
    else lines.set(keyOf(item), { item, count: 1 })
  }
  return [...lines.values()]
}
const counted = (text: string, count: number) => (count === 1 ? text : `${text} (${count})`)

/** What the last change request did: what changed, and what was not done with its reason. */
function RevisionNoteView({
  note,
  t,
  onDismiss
}: {
  note: RevisionNote
  t: Translate
  onDismiss: () => void
}) {
  const changed = grouped(note.changed, (line) => line)
  const notDone = grouped(note.notDone, (e) => `${e.what}\n${e.why}`)
  return (
    <section className="tv-bc-plan-sec tv-bc-plan-rev" aria-label={t('plan.revised.changed')}>
      <div className="tv-bc-plan-rev-h">
        <h4>{t(changed.length > 0 ? 'plan.revised.changed' : 'plan.revised.notDone')}</h4>
        <button
          type="button"
          className="tv-bc-btn"
          data-ghost=""
          aria-label={t('plan.revised.dismiss')}
          onClick={onDismiss}
        >
          <IconCloseOutlineRegular aria-hidden />
        </button>
      </div>
      {changed.length > 0 && (
        <ul className="tv-bc-plain">
          {changed.map(({ item, count }) => (
            <li key={item}>{counted(item, count)}</li>
          ))}
        </ul>
      )}
      {changed.length > 0 && notDone.length > 0 && (
        <h4 className="tv-bc-plan-rev-sub">{t('plan.revised.notDone')}</h4>
      )}
      {notDone.length > 0 && (
        <ul className="tv-bc-dropped">
          {notDone.map(({ item, count }) => (
            <li key={`${item.what}\n${item.why}`}>
              <span className="tv-bc-x">
                <IconCloseOutlineRegular aria-hidden />
              </span>
              <span>
                <span className="tv-bc-what">{counted(item.what, count)}.</span>{' '}
                <span className="tv-bc-muted">{item.why}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const randomEditId = () => `edit-${globalThis.crypto.randomUUID()}`

/** One key of a pair of plural keys (`<base>.one` / `<base>.other`). */
const plural = (t: Translate, base: string, count: number, vars: Record<string, string | number> = {}) =>
  t(`${base}.${count === 1 ? 'one' : 'other'}` as StringKey, { count, ...vars })

/** "A, B and C" with the dictionary's "and". */
function listOf(t: Translate, parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return t('plan.and', { first: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] as string })
}

const COUNT_KINDS = new Set(['service', 'person', 'quote', 'gallery'])

/** A block's line, built from the data it will hold: "Business name, tagline, main button", "6 quotes". */
function holdsText(t: Translate, holds: BlockHolds): string {
  if ('services' in holds) return holds.services.join(', ')
  const facts = holds.facts.map((label, i) => (i === 0 ? label : label.toLowerCase()))
  const counts = holds.counts.map((c) =>
    plural(t, `plan.count.${COUNT_KINDS.has(c.kind) ? c.kind : 'item'}`, c.count)
  )
  const text = [...facts, ...counts].join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** The child lists of a block, each with its rows in the plan's order; a row's own lists follow it, indented. */
function BlockLists({ lists }: { lists: BlockList[] }) {
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

function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

/** One plan value, shown as it is. `field` names the plan field it shows. */
function Value({
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
function Conflict({
  fact,
  busy,
  changed,
  onPick
}: {
  fact: PlanFact & { choice: NonNullable<PlanFact['choice']> }
  busy: boolean
  changed: boolean
  onPick: (value: string) => void
}) {
  const name = useId()
  return (
    <div className="tv-bc-val" data-field={fact.field} data-changed={changed || undefined}>
      <div className="tv-bc-choice" role="radiogroup" aria-label={fact.label} aria-busy={busy}>
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
            <span className="tv-bc-v">{o.value}</span>
            <span className="tv-bc-src">{o.source}</span>
          </label>
        ))}
      </div>
      {/* What was assumed holds only while the default (first) value stands; once another is picked it is stale. */}
      {fact.choice.options[0]?.selected && <div className="tv-bc-note">{fact.choice.said}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tv-bc-plan-sec" aria-label={title}>
      <h4>{title}</h4>
      {children}
    </section>
  )
}

export function PlanCard({
  plan,
  lastEdit = null,
  canUndo = false,
  t,
  onEdit,
  onUndo,
  locale = 'en',
  newEditId = randomEditId,
  revised = null,
  onDismissRevised
}: PlanCardProps) {
  const [draft, setDraft] = useState<PlanDraft>({ plan, lastEdit, canUndo })
  const [busy, setBusy] = useState(false)
  /** A refused change: the door's own sentence while the site is built, else just true (the card says Try again). */
  const [failed, setFailed] = useState<string | boolean>(false)
  const [editing, setEditing] = useState<string | null>(null)
  /** The value focus goes back to once its editor closes, or its change is taken back. */
  const [refocus, setRefocus] = useState<string | null>(null)
  /** Whether the whole Left out list shows, not only its first lines. */
  const [allLeftOut, setAllLeftOut] = useState(false)
  const leftOutId = useId()
  const ref = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // A newer draft from outside (a plan the chat composed, the draft read again) replaces what the card holds.
  useEffect(() => setDraft({ plan, lastEdit, canUndo }), [plan, lastEdit, canUndo])
  useEffect(() => {
    if (refocus === null || editing !== null) return
    const field = `[data-field="${CSS.escape(refocus)}"]`
    ref.current?.querySelector<HTMLElement>(`${field} .tv-bc-val-edit, ${field} input:checked`)?.focus()
    setRefocus(null)
  })
  const current = draft.plan
  const card: Card = planCardOf(current)

  /** Every change to the plan: one structured plan edit, then the card follows the draft tracy-web answers with. */
  const follow = async (request: () => Promise<PlanDraft>) => {
    setBusy(true)
    setFailed(false)
    try {
      setDraft(await request())
    } catch (error) {
      const say = (error as { say?: unknown } | null)?.say
      setFailed(typeof say === 'string' && say !== '' ? say : true)
    } finally {
      setBusy(false)
    }
  }
  const send = (changes: { field: string; value: unknown }[]) =>
    follow(() => onEdit(planEditOf(current, changes, newEditId())))

  const ctx: EditContext = {
    t,
    editing,
    busy,
    changed: new Set(changedFieldsOf(draft)),
    start: (field) => setEditing(field),
    cancel: (field) => {
      setEditing(null)
      setRefocus(field)
    },
    save: (field, value, text) => {
      setEditing(null)
      setRefocus(field)
      const change = planChangeOf(field, value, text)
      if (change) void send([change])
    }
  }

  // A dark theme accent (#616) is shown beside the light one, each labelled; the owner cannot edit it yet.
  const accentDark = card.look.accentDark
  const logo =
    card.look.logo.kind === 'own'
      ? t('plan.look.logoOwn', { source: card.look.logo.source ?? '' })
      : t('plan.look.logoText')
  const drawn =
    card.pictures.generated.frames === 0
      ? t('plan.pictures.drawnNone')
      : plural(t, 'plan.pictures.drawnValue', card.pictures.generated.frames)

  return (
    <article ref={ref} className="tv-bc-plan" aria-label={t('plan.title', { name: card.name })}>
      <div className="tv-bc-plan-h">
        <h3 ref={titleRef} tabIndex={-1} className="tv-bc-plan-t">
          {t('plan.title', { name: card.name })}
        </h3>
        <span className="tv-bc-chip" data-plain="">
          {t('plan.design', { name: card.look.template })}
        </span>
        <button
          type="button"
          className="tv-bc-btn"
          data-ghost=""
          aria-label={t('plan.undoLabel')}
          // Nothing to take back without a last edit: disabled, so it is neither pressed nor reached by Tab.
          disabled={!draft.canUndo || !draft.lastEdit || busy}
          onClick={() => {
            setEditing(null)
            // Undo goes disabled once it is done, which would drop focus to the page: it goes to the value taken back.
            const taken = draft.lastEdit?.changes?.[0]?.field
            if (taken) setRefocus(taken)
            void follow(onUndo)
          }}
        >
          <UndoIcon />
          {t('plan.undo')}
        </button>
      </div>
      {failed && (
        <p className="tv-bc-plan-err tv-bc-error" role="alert">
          {typeof failed === 'string' ? failed : t('plan.saveFailed')}
        </p>
      )}

      {revised && (revised.changed.length > 0 || revised.notDone.length > 0) && (
        <RevisionNoteView
          note={revised}
          t={t}
          onDismiss={() => {
            onDismissRevised?.()
            // The note takes its button with it: focus goes to the card's title, not to the page.
            titleRef.current?.focus()
          }}
        />
      )}

      <Section title={t('plan.facts')}>
        <div className="tv-bc-kv">
          {card.facts.map((f) => (
            <Row key={f.id} label={f.label}>
              {f.choice ? (
                <Conflict
                  fact={f as PlanFact & { choice: NonNullable<PlanFact['choice']> }}
                  busy={busy}
                  changed={ctx.changed.has(f.field)}
                  onPick={(value) => {
                    if (value !== f.value) void send([{ field: f.field, value }])
                  }}
                />
              ) : (
                <EditableValue
                  ctx={ctx}
                  field={f.field}
                  label={f.label}
                  current={f.value}
                  text={f.value}
                  source={f.source}
                />
              )}
            </Row>
          ))}
          <Row label={t('plan.language')}>
            <Value field="language" source={t('plan.allSources')}>
              {languageName(card.language, locale)}
            </Value>
          </Row>
        </div>
      </Section>

      <Section title={t('plan.look')}>
        <div className="tv-bc-kv">
          <Row label={t('plan.look.template')}>
            <Value field="look.template">{card.look.template}</Value>
          </Row>
          <Row label={t(accentDark === null ? 'plan.look.accent' : 'plan.look.accentLight')}>
            <EditableValue
              ctx={ctx}
              field="look.accent"
              label={t(accentDark === null ? 'plan.look.accent' : 'plan.look.accentLight')}
              current={card.look.accent}
              text={card.look.accent}
            >
              <span className="tv-bc-swatch" style={{ background: card.look.accent }} aria-hidden />
              {card.look.accent}
            </EditableValue>
          </Row>
          {accentDark !== null && (
            <Row label={t('plan.look.accentDark')}>
              <Value field="look.accentDark">
                <span className="tv-bc-swatch" style={{ background: accentDark }} aria-hidden />
                {accentDark}
              </Value>
            </Row>
          )}
          <Row label={t('plan.look.logoLight')}>
            <Value field="look.logo">{logo}</Value>
          </Row>
          <Row label={t('plan.look.logoDark')}>
            <Value field="look.logo">{logo}</Value>
          </Row>
        </div>
      </Section>

      <Section title={t('plan.services', { count: card.services.length })}>
        <div className="tv-bc-kv">
          {card.services.map((s, i) => (
            <Row key={s.id} label={t('plan.service', { n: i + 1 })}>
              <EditableValue
                ctx={ctx}
                field={s.field}
                label={t('plan.service', { n: i + 1 })}
                current={s.label}
                text={s.label}
                source={s.source}
              />
            </Row>
          ))}
        </div>
      </Section>

      <Section title={t('plan.pages', { count: card.pages.length })}>
        {card.pages.map((p) => (
          <div key={p.id} className="tv-bc-page" data-page={p.id}>
            <div className="tv-bc-ph">
              {p.name}
              <span className="tv-bc-n">{plural(t, 'plan.sections', p.blocks.length)}</span>
            </div>
            <ol>
              {p.blocks.map((b) => (
                <li key={b.id}>
                  <span className="tv-bc-bn">{b.label}</span>
                  <Value
                    field={`pages[${p.id}].blocks[${b.id}].data`}
                    {...('services' in b.holds ? { source: t('plan.fromServices') } : {})}
                    note={b.reason}
                  >
                    {holdsText(t, b.holds)}
                  </Value>
                  {b.lists && <BlockLists lists={b.lists} />}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </Section>

      <Section title={t('plan.pictures')}>
        <div className="tv-bc-kv">
          <Row label={t('plan.pictures.own')}>
            <Value>
              {plural(t, 'plan.pictures.ownValue', card.pictures.own.frames, {
                from: listOf(t, card.pictures.own.from)
              })}
            </Value>
          </Row>
          <Row label={t('plan.pictures.drawn')}>
            {/* An estimate the picture step redraws from the owner's photos, so editing it would change nothing:
                shown, not offered, although the contract still lists the field as editable. */}
            <Value
              field="pictures.generated.frames"
              {...(card.pictures.generated.reason ? { note: card.pictures.generated.reason } : {})}
            >
              {drawn}
            </Value>
          </Row>
        </div>
      </Section>

      {card.assumptions.length > 0 && (
        <Section title={t('plan.assumptions')}>
          <ul className="tv-bc-plain">
            {card.assumptions.map((a) => (
              <li key={a.id}>{a.said}</li>
            ))}
          </ul>
        </Section>
      )}

      {card.leftOut.length > 0 && (
        <Section title={t('plan.leftOut')}>
          <ul id={leftOutId} className="tv-bc-dropped">
            {(allLeftOut ? card.leftOut : card.leftOut.slice(0, LEFT_OUT_SHOWN)).map((l) => (
              <li key={`${l.what}\n${l.reason}`} data-count={l.count}>
                <span className="tv-bc-x">
                  <IconCloseOutlineRegular aria-hidden />
                </span>
                <span>
                  <span className="tv-bc-what">{l.what}.</span>{' '}
                  <span className="tv-bc-muted">{l.reason}</span>
                </span>
              </li>
            ))}
          </ul>
          {card.leftOut.length > LEFT_OUT_SHOWN && (
            <button
              type="button"
              className="tv-bc-btn tv-bc-more"
              data-ghost=""
              aria-expanded={allLeftOut}
              aria-controls={leftOutId}
              onClick={() => setAllLeftOut(!allLeftOut)}
            >
              {allLeftOut
                ? t('plan.leftOut.showFewer')
                : t('plan.leftOut.showAll', { count: card.leftOut.length })}
            </button>
          )}
        </Section>
      )}
    </article>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="tv-bc-k">{label}</div>
      <div className="tv-bc-cell">{children}</div>
    </>
  )
}
