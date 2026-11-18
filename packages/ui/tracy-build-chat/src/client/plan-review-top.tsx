/**
 * The upper review parts of the plan card (#575, the card the owner reviewed): the edits bar (how many changes, back
 * to the original plan with a confirm in the card, never a browser dialog), what the owner gets, what the site says
 * first with the sections that carry it, and how customers reach the business. A part the owner can take off has a
 * trash button that sends one plan operation (`operate`); the card follows the draft the door answers with.
 */
import type { PlanCard as Card, PlanOperation, PlanReview } from '@tracy/core/build-chat'
import { useState } from 'react'
import { type EditContext, EditableValue } from './EditableValue'
import { languageName, listOf, plural, Section, Trash } from './plan-card-parts'
import { sectionLabelOf } from './plan-codes'
import { factLabelOf } from './plan-words'
import type { Translate } from './strings'

/** What every review part shares: the card, the editor state, and the one way to send an operation. */
export interface ReviewContext {
  t: Translate
  card: Card
  ctx: EditContext
  busy: boolean
  locale: string
  operate: (operation: PlanOperation) => void
  /** Sends one plan edit of field values (a search term list). */
  send: (changes: { field: string; value: unknown }[]) => void
}

/** How many changes the owner made at this review, and back to the original plan, confirmed in the card. */
export function EditsBar({
  t,
  review,
  busy,
  onRevert
}: {
  t: Translate
  review: PlanReview | null
  busy: boolean
  onRevert: () => void
}) {
  const [asking, setAsking] = useState(false)
  const count = review?.count ?? 0
  if (count === 0) return null
  return (
    <div className="tv-bc-edits" role="group" aria-label={plural(t, 'plan.edits.count', count)}>
      <span className="tv-bc-edits-n">{plural(t, 'plan.edits.count', count)}</span>
      {review?.canRevert &&
        (asking ? (
          <span className="tv-bc-edits-ask" role="alert">
            <span>{plural(t, 'plan.edits.revertAsk', count)}</span>
            <button type="button" className="tv-bc-btn" data-ghost="" onClick={() => setAsking(false)}>
              {t('plan.edits.keep')}
            </button>
            <button
              type="button"
              className="tv-bc-btn"
              data-primary=""
              aria-disabled={busy || undefined}
              onClick={() => {
                if (busy) return
                setAsking(false)
                onRevert()
              }}
            >
              {t('plan.edits.discard')}
            </button>
          </span>
        ) : (
          <button type="button" className="tv-bc-btn" data-ghost="" onClick={() => setAsking(true)}>
            {t('plan.edits.revert')}
          </button>
        ))}
    </div>
  )
}

/** The pages of the menu as one sentence: "Home, Classes and Contact". */
const pageNames = (t: Translate, card: Card) =>
  listOf(
    t,
    card.pages.map((p) => p.name)
  )

/** What the owner gets: one sentence and a few counts, each said in the card's words. */
export function YouGet({ r }: { r: ReviewContext }) {
  const { t, card, locale } = r
  const people = card.sources.flatMap((s) => s.items).filter((i) => i.kind === 'person')
  const reviews = card.sources.flatMap((s) => s.items).filter((i) => i.kind === 'quote')
  const sum = (list: { got: number; shown: number }[], key: 'got' | 'shown') =>
    list.reduce((n, i) => n + i[key], 0)
  const own = card.pictures.own
  const tiles: { n: string; label: string }[] = [
    {
      n: String(card.counts.pages),
      label: card.standard.privacy
        ? `${t('plan.tile.pages')} ${t('plan.tile.privacy')}`
        : t('plan.tile.pages')
    },
    { n: String(card.counts.services), label: t('plan.tile.services') },
    ...(people.length ? [{ n: String(sum(people, 'shown')), label: t('plan.tile.people') }] : []),
    ...(reviews.length
      ? [
          {
            n: String(sum(reviews, 'shown')),
            label:
              sum(reviews, 'got') > sum(reviews, 'shown')
                ? t('plan.tile.reviewsOf', { count: sum(reviews, 'got') })
                : t('plan.tile.reviews')
          }
        ]
      : []),
    {
      n: own.photos > own.frames ? `${own.frames}/${own.photos}` : String(own.frames),
      label: t('plan.tile.photos')
    }
  ]
  return (
    <Section title={t('plan.get')}>
      <p className="tv-bc-lead">
        {t('plan.get.lead', {
          language: languageName(card.language, locale),
          pages: plural(t, 'plan.get.pages', card.counts.pages),
          names: pageNames(t, card)
        })}
      </p>
      <ul className="tv-bc-tiles">
        {tiles.map((tile) => (
          <li key={tile.label} className="tv-bc-tile">
            <span className="tv-bc-tile-n">{tile.n}</span>
            <span className="tv-bc-tile-l">{tile.label}</span>
          </li>
        ))}
      </ul>
      {card.pictures.generated.frames > 0 && (
        <p className="tv-bc-note">{plural(t, 'plan.tile.drawn', card.pictures.generated.frames)}</p>
      )}
    </Section>
  )
}

/** What the site says first: each key message, editable, with the sections that carry it and a trash button. */
export function KeyMessages({ r }: { r: ReviewContext }) {
  const { t, card, ctx, busy, operate } = r
  if (card.keyMessages.length === 0) return null
  return (
    <Section title={t('plan.keyMessages')}>
      <ol className="tv-bc-msgs">
        {card.keyMessages.map((m, i) => (
          <li key={m.id} className="tv-bc-msg" data-message={m.id}>
            <div className="tv-bc-msg-row">
              <EditableValue
                ctx={ctx}
                field={m.field}
                label={t('plan.keyMessage.n', { n: i + 1 })}
                current={m.label}
                text={m.label}
              />
              {card.keyMessages.length > 1 && (
                <Trash
                  t={t}
                  what={m.label}
                  busy={busy}
                  onRemove={() => operate({ op: 'remove-key-message', message: m.id })}
                />
              )}
            </div>
            <ul className="tv-bc-where">
              {m.carriedBy.length === 0 && <li>{t('plan.keyMessages.nowhere')}</li>}
              {m.carriedBy.map((c) => (
                <li key={c.page}>
                  {t('plan.keyMessages.where', {
                    page: c.pageName,
                    sections: listOf(
                      t,
                      c.blocks.map((b) => sectionLabelOf(t, b.labelCode, b.label))
                    )
                  })}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** "Contact on Home and About": the sections and pages a fact is shown in. */
function placesText(t: Translate, places: Card['reach']['primary'][number]['places']): string {
  const bySection = new Map<string, { label: string; pages: string[] }>()
  for (const p of places) {
    const label = sectionLabelOf(t, p.section.labelCode, p.section.label)
    const seen = bySection.get(label) ?? { label, pages: [] }
    if (!seen.pages.includes(p.pageName)) seen.pages.push(p.pageName)
    bySection.set(label, seen)
  }
  return listOf(
    t,
    [...bySection.values()].map((s) => t('plan.reach.place', { section: s.label, pages: listOf(t, s.pages) }))
  )
}

/** How customers reach the business: the main button, how each page ends, each channel the footers show. */
export function Reach({ r }: { r: ReviewContext }) {
  const { t, card, busy, operate } = r
  const { primary, ends, channels } = card.reach
  if (primary.length === 0 && ends.length === 0 && channels.length === 0) return null
  return (
    <Section title={t('plan.reach')}>
      <div className="tv-bc-kv">
        {primary.length > 0 && (
          <>
            <div className="tv-bc-k">{t('plan.reach.main')}</div>
            <div className="tv-bc-cell">
              {primary.map((f) => (
                <div key={f.id} className="tv-bc-val">
                  <span className="tv-bc-v">
                    {factLabelOf(t, f.kind, f.label)}: {f.value}
                  </span>
                  <div className="tv-bc-note">
                    {f.places.length
                      ? t('plan.reach.where', { places: placesText(t, f.places) })
                      : t('plan.reach.nowhere')}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {ends.length > 0 && (
          <>
            <div className="tv-bc-k">{t('plan.reach.end')}</div>
            <div className="tv-bc-cell">
              <ul className="tv-bc-plain">
                {ends.map((e) => (
                  <li key={e.page}>
                    {t('plan.reach.endLine', {
                      page: e.pageName,
                      section: sectionLabelOf(t, e.section.labelCode, e.section.label)
                    })}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        {channels.map((f) => (
          <ChannelRow key={f.id} r={r} f={f} pages={card.pages.length} busy={busy} operate={operate} />
        ))}
      </div>
    </Section>
  )
}

function ChannelRow({
  r,
  f,
  pages,
  busy,
  operate
}: {
  r: ReviewContext
  f: Card['reach']['channels'][number]
  pages: number
  busy: boolean
  operate: ReviewContext['operate']
}) {
  const { t } = r
  const label = factLabelOf(t, f.kind, f.label)
  const others = f.places.filter((p) => !p.footer)
  const footerLine =
    f.footerPages === 0
      ? null
      : f.footerPages >= pages
        ? t('plan.reach.footerAll')
        : t('plan.reach.footerSome', {
            pages: listOf(
              t,
              f.places.filter((p) => p.footer).map((p) => p.pageName)
            )
          })
  return (
    <>
      <div className="tv-bc-k">{label}</div>
      <div className="tv-bc-cell">
        <div className="tv-bc-val tv-bc-msg-row">
          <span className="tv-bc-v">{f.value}</span>
          {f.removable && (
            <Trash
              t={t}
              what={label}
              busy={busy}
              onRemove={() => operate({ op: 'remove-channel', fact: f.id })}
            />
          )}
        </div>
        <div className="tv-bc-note">
          {[footerLine, others.length ? t('plan.reach.where', { places: placesText(t, others) }) : null]
            .filter(Boolean)
            .join(' ')}
        </div>
      </div>
    </>
  )
}
