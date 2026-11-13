/**
 * The plan card (TracyHQ/tracy#606): the Contract B plan as labelled values, read before approval. Business facts with
 * their source, the look section, services, pages and the data each block will hold with its reason, the pictures
 * summary, the assumptions and what was left out. It shows no written copy: copy is written after approval.
 *
 * A fact the sources disagree on offers its values as a radio group, the website's selected by default. Picking
 * another sends a structured plan edit (`onEdit`, `savePlanEdit` in the chat) and the card follows the plan it gets
 * back. Approve and Request changes are dsh's plan review bar, fed by `planReviewRequestOf`; this card writes nothing.
 *
 * Seam for in place editing, the changed value highlight and undo (#607): every value is drawn by `Value` with its
 * plan `field`, and every change goes through `send(changes)`, the same path the conflict choice uses.
 */
import { IconCloseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  type BlockHolds,
  type PlanCard as Card,
  type PlanFact,
  planCardOf,
  planEditOf
} from '@tracy/core/build-chat'
import { type ReactNode, useEffect, useId, useState } from 'react'
import type { StringKey, Translate } from './strings'

export interface PlanCardProps {
  /** The Contract B plan as the draft holds it now. */
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B plan, checked by the contract
  plan: any
  t: Translate
  /** Sends a structured plan edit and resolves to the plan the draft answered with. */
  onEdit: (edit: ReturnType<typeof planEditOf>) => Promise<unknown>
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

function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

/** One plan value. `field` names the plan field it shows; #607 makes the field editable here. */
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
  onPick
}: {
  fact: PlanFact & { choice: NonNullable<PlanFact['choice']> }
  busy: boolean
  onPick: (value: string) => void
}) {
  const name = useId()
  return (
    <div className="tv-bc-val" data-field={fact.field}>
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

export function PlanCard({ plan, t, onEdit, locale = 'en', newEditId = randomEditId }: PlanCardProps) {
  const [current, setCurrent] = useState(plan)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => setCurrent(plan), [plan])
  const card: Card = planCardOf(current)

  /** Every change to the plan: one structured plan edit, then the card follows the plan the draft answers with. */
  const send = async (changes: { field: string; value: unknown }[]) => {
    setBusy(true)
    setFailed(false)
    try {
      setCurrent(await onEdit(planEditOf(current, changes, newEditId())))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const logo =
    card.look.logo.kind === 'own'
      ? t('plan.look.logoOwn', { source: card.look.logo.source ?? '' })
      : t('plan.look.logoText')

  return (
    <article className="tv-bc-plan" aria-label={t('plan.title', { name: card.name })}>
      <div className="tv-bc-plan-h">
        <h3 className="tv-bc-plan-t">{t('plan.title', { name: card.name })}</h3>
        <span className="tv-bc-chip" data-plain="">
          {t('plan.design', { name: card.look.template })}
        </span>
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
                  onPick={(value) => {
                    if (value !== f.value) void send([{ field: f.field, value }])
                  }}
                />
              ) : (
                <Value field={f.field} source={f.source}>
                  {f.value}
                </Value>
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
            <Value field="look.accent">
              <span className="tv-bc-swatch" style={{ background: card.look.accent }} aria-hidden />
              {card.look.accent}
            </Value>
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
              <Value field={s.field} source={s.source}>
                {s.label}
              </Value>
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
            <Value
              field="pictures.generated.frames"
              {...(card.pictures.generated.reason ? { note: card.pictures.generated.reason } : {})}
            >
              {card.pictures.generated.frames === 0
                ? t('plan.pictures.drawnNone')
                : plural(t, 'plan.pictures.drawnValue', card.pictures.generated.frames)}
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
