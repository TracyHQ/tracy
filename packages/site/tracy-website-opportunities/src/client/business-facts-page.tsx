/**
 * The Business facts sub-page (#537, layout C "Single column, stacked fixed bands"): one full-width band per group,
 * top to bottom: the business, Opening hours, Services, About, Team, Brand, Key messages, What guests say, Social
 * pages, Photos & video and Research details. Every band has one fixed height (`BAND_HEIGHTS`), the same for every
 * business, and is always drawn: a missing fact reads N/A. A list longer than the band opens in Show all (n), and
 * Edit opens the band's fields through the doors they always had (name, hours, rating, profile rows, reading, key
 * messages) in a side sheet, so no band ever grows. Before research, and while it runs, the bands say Not collected
 * yet and hold nothing partial: progress shows in the band at the top of the page.
 */
import type { JSX, ReactNode } from 'react'

import { FactsBand, NotAvailable, OneLine } from './business-facts-band.tsx'
import { BrandBody, HoursBand, Missing, TeamPeople } from './business-facts-bands.tsx'
import { FactsMedia } from './business-facts-media.tsx'
import {
  BAND_CAPACITY,
  type BusinessFactsView,
  type CardId,
  aboutOverflows,
  itemChipOf,
  messageChipOf,
  overflows,
  reviewChipOf
} from './business-facts-model.ts'
import { BusinessBand } from './business-facts-parts.tsx'
import { sourceLabel } from './cms-label.ts'
import type { LogoView, MediaRowView } from './detail-model.ts'
import { EditableText } from './editable-text.tsx'
import type { HoursChoice, HoursSaved } from './profile-hours-row.tsx'
import type { RatingChoice } from './profile-rating-row.tsx'
import type { ReadingItemView, ReadingPick } from './profile-reading-model.ts'
import { SourceChip } from './source-chip.tsx'
import { SourceGlyph } from './source-logo.tsx'
import type { Translate } from './strings.ts'

/** The doors the bands edit through: each one the Business facts rows already had. */
export interface FactsDoors {
  /** "Name on the site" with its own choices, or null when research decided no name (the plain field then). */
  nameRow: JSX.Element | null
  saveName: (name: string) => Promise<boolean>
  /** A plain profile row as a field (`phone`, `address`, `bio`), opened at once. */
  field: (field: string, value: string) => JSX.Element | null
  saveHours: (choice: HoursChoice) => Promise<HoursSaved>
  saveRating: (choice: RatingChoice) => Promise<boolean>
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
  /** Reading rows of some groups, with Remove / Put back / Show / Leave off. */
  readingRows: (
    groups: ReadonlyArray<'services' | 'audience' | 'team' | 'serviceAreas'>
  ) => JSX.Element | null
  /** The key messages editor (labels, order, delete). */
  keyMessages: JSX.Element | null
  uploadMedia: (file: File) => Promise<string | null>
  retryLogo: { busy: boolean; failed: boolean; onPress: () => void }
}

const NOT_COLLECTED_LOGO = { state: 'notCollected' } as LogoView

export function BusinessFactsPage({
  t,
  locale,
  view,
  media,
  doors,
  food,
  websiteLink,
  researchDetails,
  running
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  media: MediaRowView
  doors: FactsDoors
  food: boolean
  websiteLink: (url: string) => JSX.Element
  /** Menu, Google Place, reviews, current website, social figures and place profile; null when none. */
  researchDetails: ReactNode | null
  /** Research runs: the photos and videos wait for it to finish, only Add more stays (#537). */
  running: boolean
}): JSX.Element {
  const cardOf = (id: CardId) => view.cards.find((c) => c.id === id)
  const facts = view.researched
  const filled = (id: CardId): boolean => cardOf(id)?.state === 'filled'
  const body = (id: CardId, draw: () => ReactNode): ReactNode =>
    filled(id) ? draw() : <Missing t={t} card={cardOf(id)} />
  const editOf = (id: CardId, rows: () => ReactNode): (() => ReactNode) | null =>
    cardOf(id) === undefined || cardOf(id)?.state === 'notCollected' ? null : rows
  const businessEdit = !facts
    ? null
    : () => (
        <>
          {doors.nameRow ?? (
            <EditableText
              t={t}
              value={view.business.name}
              label={t('field.name')}
              edited={false}
              editedKey="profile.editedByYou"
              maxLength={200}
              startOpen
              onSave={async (typed) =>
                typed.trim() === view.business.name ? true : doors.saveName(typed.trim())
              }
            />
          )}
          <label className="tracy-wo-facts-field">
            <span>{t('field.address')}</span>
            {doors.field('address', view.business.address ?? '')}
          </label>
          <label className="tracy-wo-facts-field">
            <span>{t('field.phone')}</span>
            {doors.field('phone', view.business.phones?.main ?? '')}
          </label>
          {(view.business.phones?.others.length ?? 0) > 0 ? (
            // The other numbers are read only: no door edits them.
            <p className="tracy-wo-muted tracy-wo-small">
              {t('facts.phone.others', { list: view.business.phones?.others.map((o) => o.phone).join(', ') })}{' '}
              {t('phone.othersNote')}
            </p>
          ) : null}
        </>
      )
  const looked = view.sources
    .filter((s) => typeof s.collectedAt === 'string' && s.collectedAt !== '')
    .map((s) => sourceLabel(t, s.source, s.ref ?? null))
    .filter((name, i, all) => all.indexOf(name) === i)

  // Services: the services chips, then the audience and the service areas, each after its muted label.
  const serviceGroups = (
    [
      ['field.services', view.services],
      ['field.audience', view.audience],
      ['field.serviceAreas', view.serviceAreas]
    ] as const
  ).map(([key, items]) => [key, items.filter((i) => !i.removed)] as const)
  const serviceCount = serviceGroups.reduce((n, [, items]) => n + items.length, 0)
  const chips = (items: readonly ReadingItemView[]): ReactNode =>
    items.map((s) => (
      <li key={s.id} className="tracy-wo-facts-pill">
        <span className="tracy-wo-facts-ell" title={s.label}>
          {s.label}
        </span>
        <SourceChip t={t} chip={itemChipOf(view, s)} locale={locale} />
      </li>
    ))
  const servicesRow = (all: boolean): ReactNode => {
    let left = all ? Number.POSITIVE_INFINITY : BAND_CAPACITY.services
    return (
      <ul className={all ? 'tracy-wo-facts-chips' : 'tracy-wo-facts-chiprow'}>
        {serviceGroups.map(([key, items]) => {
          const shown = items.slice(0, Math.max(0, left))
          left -= shown.length
          if (shown.length === 0) return null
          return [
            key === 'field.services' ? null : (
              <li key={key} className="tracy-wo-facts-ck tracy-wo-facts-group">
                {t(key)}
              </li>
            ),
            chips(shown)
          ]
        })}
      </ul>
    )
  }

  const messagesList = (): ReactNode => (
    <ol className="tracy-wo-facts-msgs">
      {view.messages.map((m) => (
        <li key={m.id}>
          <span>
            {m.label}
            <SourceChip t={t} chip={messageChipOf(view, m)} locale={locale} />
          </span>
          {m.quotes.slice(0, 1).map((q) => (
            <q key={q}>{q}</q>
          ))}
        </li>
      ))}
    </ol>
  )
  const reviewsList = (): ReactNode => (
    <ul className="tracy-wo-facts-quotes">
      {view.reviews.map((r, i) => (
        <li key={`${r.author}-${i}`}>
          <q>{r.text}</q>
          <small>
            {[r.author, r.rating === null ? null : `★ ${r.rating}`].filter(Boolean).join(' · ')}
            <SourceChip t={t} chip={reviewChipOf(view, r)} locale={locale} />
          </small>
        </li>
      ))}
    </ul>
  )
  const socialChips = (limit?: number): ReactNode => (
    <ul className={limit === undefined ? 'tracy-wo-facts-chips' : 'tracy-wo-facts-chiprow'}>
      {view.social.slice(0, limit).map((p) => {
        const name = sourceLabel(t, p.source, p.url)
        return (
          <li key={p.url} className="tracy-wo-facts-pill">
            <a href={p.url} target="_blank" rel="noreferrer" title={p.url}>
              <SourceGlyph logo={p.logo} size={12} />
              <span className="tracy-wo-facts-ell">{name}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
  const aboutCard = cardOf('about')
  const researchCount = looked.length

  return (
    <div className="tracy-wo-facts">
      <BusinessBand
        t={t}
        locale={locale}
        view={view.business}
        logo={facts ? media.logo : NOT_COLLECTED_LOGO}
        websiteLink={websiteLink}
        onRating={doors.saveRating}
        edit={businessEdit}
        looked={looked}
        researched={facts}
      />
      <HoursBand t={t} locale={locale} view={view} saveHours={doors.saveHours} />
      <FactsBand
        t={t}
        id="services"
        title={t('field.services')}
        edit={editOf('services', () => doors.readingRows(['services', 'audience', 'serviceAreas']))}
        more={
          filled('services') && overflows('services', serviceCount)
            ? { count: serviceCount, render: () => servicesRow(true) }
            : null
        }
      >
        {body('services', () => servicesRow(false))}
      </FactsBand>
      <FactsBand
        t={t}
        id="about"
        title={
          <>
            <span className="tracy-wo-facts-ell">{t('field.bio')}</span>
            <SourceChip t={t} chip={aboutCard?.chip ?? null} locale={locale} />
          </>
        }
        sheetTitle={t('field.bio')}
        edit={editOf('about', () => doors.field('bio', view.about ?? ''))}
        more={
          filled('about') && aboutOverflows(view.about)
            ? { count: null, render: () => <p className="tracy-wo-facts-about">{view.about}</p> }
            : null
        }
      >
        {body('about', () => (
          <p className="tracy-wo-facts-about tracy-wo-facts-clamp2" title={view.about ?? undefined}>
            {view.about}
          </p>
        ))}
      </FactsBand>
      <FactsBand
        t={t}
        id="team"
        title={t('field.team')}
        edit={editOf('team', () => doors.readingRows(['team']))}
        more={
          filled('team') && overflows('team', view.team.length)
            ? {
                count: view.team.length,
                render: () => <TeamPeople t={t} locale={locale} view={view} pickReading={doors.pickReading} />
              }
            : null
        }
      >
        {body('team', () => (
          <TeamPeople
            t={t}
            locale={locale}
            view={view}
            pickReading={doors.pickReading}
            limit={BAND_CAPACITY.team}
          />
        ))}
      </FactsBand>
      <FactsBand t={t} id="brand" title={t('media.brand')} edit={null}>
        {cardOf('brand')?.state === 'notCollected' ? (
          <NotAvailable t={t} state="notCollected" />
        ) : (
          <BrandBody t={t} logo={media.logo} colors={media.colors} retry={doors.retryLogo} food={food} />
        )}
      </FactsBand>
      <FactsBand
        t={t}
        id="messages"
        title={t('keyMessages.title')}
        aside={
          <span className="tracy-wo-facts-aside" title={t('facts.messages.lead')}>
            {t('facts.messages.lead')}
          </span>
        }
        edit={editOf('messages', () => doors.keyMessages)}
        more={
          filled('messages') && overflows('messages', view.messages.length)
            ? { count: view.messages.length, render: messagesList }
            : null
        }
      >
        {body('messages', () => (
          <div className="tracy-wo-facts-cells">
            {view.messages.slice(0, BAND_CAPACITY.messages).map((m, i) => (
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
      <FactsBand
        t={t}
        id="reviews"
        title={t('facts.reviews.title')}
        aside={
          <span className="tracy-wo-facts-aside" title={t('facts.reviews.note')}>
            {t('facts.reviews.note')}
          </span>
        }
        edit={null}
        more={
          filled('reviews') && overflows('reviews', view.reviews.length)
            ? { count: view.reviews.length, render: reviewsList }
            : null
        }
      >
        {body('reviews', () => (
          <ul className="tracy-wo-facts-cards">
            {view.reviews.slice(0, BAND_CAPACITY.reviews).map((r, i) => (
              <li key={`${r.author}-${i}`}>
                <q className="tracy-wo-facts-clamp3" title={r.text}>
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
      <FactsBand
        t={t}
        id="social"
        title={t('facts.social.title')}
        edit={null}
        more={
          overflows('social', view.social.length)
            ? { count: view.social.length, render: () => socialChips() }
            : null
        }
      >
        {filled('social') ? socialChips(BAND_CAPACITY.social) : <Missing t={t} card={cardOf('social')} />}
      </FactsBand>
      <FactsMedia t={t} media={media} show={!running} onUpload={doors.uploadMedia} />
      <FactsBand
        t={t}
        id="research"
        title={t('facts.research')}
        aside={
          facts ? (
            <span className="tracy-wo-facts-aside">
              {t(researchCount === 1 ? 'facts.research.count.one' : 'facts.research.count.other', {
                count: researchCount
              })}
            </span>
          ) : null
        }
        edit={null}
        open={facts && researchDetails !== null ? () => researchDetails : null}
      >
        {facts && researchDetails !== null ? null : (
          <NotAvailable t={t} state={facts ? 'none' : 'notCollected'} />
        )}
      </FactsBand>
    </div>
  )
}
