/**
 * The list bands of the Business facts sub-page (#537, design A): Services, Key messages, What guests say, Social
 * pages. Each draws every item in one row that scrolls sideways inside the band (key messages
 * are three cells); a band that research left empty reads N/A alone.
 */
import type { JSX, ReactNode } from 'react'

import { FactsBand, OneLine } from './business-facts-band.tsx'
import { Missing } from './business-facts-bands.tsx'
import { type BusinessFactsView, itemChipOf, messageChipOf, reviewChipOf } from './business-facts-model.ts'
import { sourceLabel } from './cms-label.ts'
import type { BandSwitchView, EditDoor } from './facts-band-actions.tsx'
import type { ReadingItemView } from './profile-reading-model.ts'
import { SourceChip } from './source-chip.tsx'
import { SourceGlyph } from './source-logo.tsx'
import type { Translate } from './strings.ts'

interface BandProps {
  t: Translate
  locale: string
  view: BusinessFactsView
  onSite: BandSwitchView
  edit: EditDoor
}

const cardOf = (view: BusinessFactsView, id: string) => view.cards.find((c) => c.id === id)
const body = (view: BusinessFactsView, t: Translate, id: string, draw: () => ReactNode): ReactNode =>
  cardOf(view, id)?.state === 'filled' ? draw() : <Missing t={t} card={cardOf(view, id)} />

/** Services: the services chips, then the audience and the service areas, each after its muted label, in one row. */
export function ServicesBand({ t, locale, view, onSite, edit }: BandProps): JSX.Element {
  const groups = (
    [
      ['field.services', view.services],
      ['field.audience', view.audience],
      ['field.serviceAreas', view.serviceAreas]
    ] as const
  ).map(([key, items]) => [key, items.filter((i) => !i.removed)] as const)
  const chips = (items: readonly ReadingItemView[]): ReactNode =>
    items.map((s) => (
      <li key={s.id} className="tracy-wo-facts-pill">
        <span className="tracy-wo-facts-ell" title={s.label}>
          {s.label}
        </span>
        <SourceChip t={t} chip={itemChipOf(view, s)} locale={locale} />
      </li>
    ))
  return (
    <FactsBand
      t={t}
      id="services"
      label={t('field.services')}
      title={t('field.services')}
      onSite={onSite}
      edit={edit}
    >
      {body(view, t, 'services', () => (
        <ul className="tracy-wo-facts-chiprow tracy-wo-facts-row">
          {groups.map(([key, items]) =>
            items.length === 0
              ? null
              : [
                  key === 'field.services' ? null : (
                    <li key={key} className="tracy-wo-facts-ck tracy-wo-facts-group">
                      {t(key)}
                    </li>
                  ),
                  chips(items)
                ]
          )}
        </ul>
      ))}
    </FactsBand>
  )
}

/** Key messages: three cells, each a label with its chip and the first quote it rests on. */
export function MessagesBand({ t, locale, view, onSite, edit }: BandProps): JSX.Element {
  return (
    <FactsBand
      t={t}
      id="messages"
      label={t('keyMessages.title')}
      title={t('keyMessages.title')}
      aside={
        <span className="tracy-wo-facts-aside" title={t('facts.messages.lead')}>
          {t('facts.messages.lead')}
        </span>
      }
      onSite={onSite}
      edit={edit}
    >
      {body(view, t, 'messages', () => (
        <div className="tracy-wo-facts-cells tracy-wo-facts-row">
          {view.messages.map((m, i) => (
            <div key={m.id} className="tracy-wo-facts-cell">
              <span className="tracy-wo-facts-ck">{t('facts.message.n', { n: i + 1 })}</span>
              <OneLine text={m.label}>
                <SourceChip t={t} chip={messageChipOf(view, m)} locale={locale} />
              </OneLine>
              {m.quotes.slice(0, 1).map((q) => (
                <q key={q} className="tracy-wo-facts-ell tracy-wo-facts-dim" title={q}>
                  {q}
                </q>
              ))}
            </div>
          ))}
        </div>
      ))}
    </FactsBand>
  )
}

/** What guests say: every review as a card, in one row. */
export function ReviewsBand({ t, locale, view, onSite, edit }: BandProps): JSX.Element {
  return (
    <FactsBand
      t={t}
      id="reviews"
      label={t('facts.reviews.title')}
      title={t('facts.reviews.title')}
      onSite={onSite}
      edit={edit}
    >
      {body(view, t, 'reviews', () => (
        <ul className="tracy-wo-facts-cards tracy-wo-facts-row">
          {view.reviews.map((r, i) => (
            <li key={`${r.author}-${i}`}>
              <q className="tracy-wo-facts-clamp2" title={r.text}>
                {r.text}
              </q>
              <span className="tracy-wo-facts-ln tracy-wo-facts-dim tracy-wo-small">
                <span className="tracy-wo-facts-ell">
                  {[r.rating === null ? null : `★ ${r.rating}`, r.author].filter(Boolean).join(' · ')}
                </span>
                <SourceChip t={t} chip={reviewChipOf(view, r)} locale={locale} />
              </span>
            </li>
          ))}
        </ul>
      ))}
    </FactsBand>
  )
}

/** Social pages: each a linked chip with its glyph, in one row. */
export function SocialBand({ t, view, onSite, edit }: BandProps): JSX.Element {
  return (
    <FactsBand
      t={t}
      id="social"
      label={t('facts.social.title')}
      title={t('facts.social.title')}
      onSite={onSite}
      edit={edit}
    >
      {body(view, t, 'social', () => (
        <ul className="tracy-wo-facts-chiprow tracy-wo-facts-row">
          {view.social.map((p) => (
            <li key={p.url} className="tracy-wo-facts-pill">
              <a href={p.url} target="_blank" rel="noreferrer" title={p.url}>
                <SourceGlyph logo={p.logo} size={12} />
                <span className="tracy-wo-facts-ell">{sourceLabel(t, p.source, p.url)}</span>
              </a>
            </li>
          ))}
        </ul>
      ))}
    </FactsBand>
  )
}
