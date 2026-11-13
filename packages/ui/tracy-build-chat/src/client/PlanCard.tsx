/**
 * The plan card (TracyHQ/tracy#606, #607): the Contract B plan as labelled values, read before approval. Business
 * facts with their source, the look section, services, pages and the data each block will hold with its reason, the
 * pictures summary, the assumptions and what was left out. It shows no written copy: copy is written after approval.
 *
 * A value a Contract B plan edit can change (a fact, a service name, the accent colour, the number of drawn pictures)
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
 * block on Home follow without the card touching them. Approve and Request changes are dsh's plan review bar, fed by
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
  planEditOf
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
              disabled={busy}
              onChange={() => onPick(o.value)}
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
  newEditId = randomEditId
}: PlanCardProps) {
  const [draft, setDraft] = useState<PlanDraft>({ plan, lastEdit, canUndo })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  /** The value focus goes back to once its editor closes. */
  const [refocus, setRefocus] = useState<string | null>(null)
  const ref = useRef<HTMLElement>(null)
  // A newer draft from outside (a plan the chat composed, the draft read again) replaces what the card holds.
  useEffect(() => setDraft({ plan, lastEdit, canUndo }), [plan, lastEdit, canUndo])
  useEffect(() => {
    if (refocus === null || editing !== null) return
    ref.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(refocus)}"] .tv-bc-val-edit`)?.focus()
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
    } catch {
      setFailed(true)
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
        <h3 className="tv-bc-plan-t">{t('plan.title', { name: card.name })}</h3>
        <span className="tv-bc-chip" data-plain="">
          {t('plan.design', { name: card.look.template })}
        </span>
        <button
          type="button"
          className="tv-bc-btn"
          data-ghost=""
          aria-label={t('plan.undoLabel')}
          disabled={!draft.canUndo || busy}
          onClick={() => {
            setEditing(null)
            void follow(onUndo)
          }}
        >
          <UndoIcon />
          {t('plan.undo')}
        </button>
      </div>
      {failed && (
        <p className="tv-bc-plan-err tv-bc-error" role="alert">
          {t('plan.saveFailed')}
        </p>
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
          <Row label={t('plan.look.accent')}>
            <EditableValue
              ctx={ctx}
              field="look.accent"
              label={t('plan.look.accent')}
              current={card.look.accent}
              text={card.look.accent}
            >
              <span className="tv-bc-swatch" style={{ background: card.look.accent }} aria-hidden />
              {card.look.accent}
            </EditableValue>
          </Row>
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
              {t('plan.pictures.ownValue', {
                count: card.pictures.own.frames,
                from: listOf(t, card.pictures.own.from)
              })}
            </Value>
          </Row>
          <Row label={t('plan.pictures.drawn')}>
            <EditableValue
              ctx={ctx}
              field="pictures.generated.frames"
              label={t('plan.pictures.drawn')}
              current={card.pictures.generated.frames}
              text={drawn}
              {...(card.pictures.generated.reason ? { note: card.pictures.generated.reason } : {})}
            />
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
          <ul className="tv-bc-dropped">
            {card.leftOut.map((l) => (
              <li key={l.what}>
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
