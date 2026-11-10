/**
 * The Business facts sub-page (#537, design A "Grouped cards"): the business card on top, then two columns of cards
 * (hours, team and key messages on the left; services, about, brand and guest reviews on the right; one column on a
 * narrow page), Photos & video, and Research details folded. One Edit per card opens its rows as fields through the
 * doors the rows always had (name, hours, rating, profile rows, reading, key messages); nothing new is sent. Before
 * research, and while it runs, the cards say Not collected yet and hold nothing partial: progress shows in the band.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Clock } from 'lucide-react'
import { Badge, Button } from '@tracy/ui'

import {
  type BusinessFactsView,
  type CardId,
  clipQuote,
  hoursLineParts,
  initialsOf,
  itemChipOf,
  messageChipOf,
  reviewChipOf
} from './business-facts-model.ts'
import { ActButton, BusinessCard, FactsCard, LeftOffTag } from './business-facts-parts.tsx'
import { sourceLabel } from './cms-label.ts'
import type { ReadingItemView } from './profile-reading-model.ts'
import { SourceChip } from './source-chip.tsx'
import { FactsMedia } from './business-facts-media.tsx'
import type { ColorsView, LogoView, MediaRowView } from './detail-model.ts'
import { LogoField } from './media-row.tsx'
import { EditableText } from './editable-text.tsx'
import { type HoursChoice, type HoursSaved, sourceName } from './profile-hours-row.tsx'
import { typedHours } from './profile-hours-model.ts'
import type { RatingChoice } from './profile-rating-row.tsx'
import { type ReadingPick, readingActions } from './profile-reading-model.ts'
import type { Translate } from './strings.ts'

/** The doors the cards edit through: each one the Business facts rows already had. */
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

const NotYet = ({ t, state }: { t: Translate; state: 'none' | 'notCollected' }): JSX.Element => (
  <p className="tracy-wo-muted tracy-wo-facts-empty">
    {t(state === 'none' ? 'reason.not_found' : 'reason.not_collected')}
  </p>
)

function HoursCard({
  t,
  locale,
  view,
  doors
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  doors: FactsDoors
}): JSX.Element {
  const hours = view.hours
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const choose = async (choice: HoursChoice): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    setFailed((await doors.saveHours(choice)) !== 'ok')
    setBusy(false)
  }
  const card = view.cards.find((c) => c.id === 'hours')
  const lines = hours === null ? [] : hours.hours.length > 0 ? hours.hours : hours.sourceHours
  const chip =
    hours?.chip === 'check' ? (
      <Badge variant="outline" className="tracy-wo-chip-warn">
        {t('name.chip.check')}
      </Badge>
    ) : hours?.chip === 'checked' ? (
      <Badge variant="outline" className="tracy-wo-chip-ok">
        {t('name.chip.checked')}
      </Badge>
    ) : null
  // A left off hours card keeps its lines and a tag; the one choice flips to Show on the site.
  const actions =
    hours === null || card?.state !== 'filled'
      ? []
      : hours.left
        ? hours.sourceHours.length > 0
          ? [
              <ActButton key="show" disabled={busy} onClick={() => void choose({ choice: 'keep' })}>
                {t('reading.show')}
              </ActButton>
            ]
          : []
        : [
            ...(hours.open && hours.sourceHours.length > 0
              ? [
                  <ActButton key="keep" disabled={busy} onClick={() => void choose({ choice: 'keep' })}>
                    {t('name.keep')}
                  </ActButton>
                ]
              : []),
            <ActButton key="leave" disabled={busy} onClick={() => void choose({ choice: 'leave' })}>
              {t('hours.leave')}
            </ActButton>
          ]
  const edit = (): ReactNode => (
    <>
      <EditableText
        t={t}
        value={lines.join('\n')}
        label={t('field.hours')}
        edited={false}
        editedKey="profile.editedByYou"
        multiline
        maxLength={1200}
        startOpen
        onSave={async (typed) => {
          const next = typedHours(typed)
          if (next.length === 0 || next.join('|') === lines.join('|')) return true
          return (await doors.saveHours({ choice: 'edit', hours: next })) === 'ok'
        }}
      />
      <span className="tracy-wo-muted tracy-wo-small">{t('hours.hint')}</span>
      {hours?.left ? null : (
        <span className="tracy-wo-row">
          <Button
            type="button"
            size="xs"
            variant="link"
            disabled={busy}
            onClick={() => void choose({ choice: 'leave' })}
          >
            {t('hours.leave')}
          </Button>
        </span>
      )}
    </>
  )
  return (
    <FactsCard
      t={t}
      id="hours"
      title={
        <>
          <Clock aria-hidden="true" className="tracy-wo-icon" />
          {t('field.hours')}
          {chip}
          <SourceChip t={t} chip={card?.chip ?? null} locale={locale} />
          {hours?.left ? <LeftOffTag t={t} /> : null}
        </>
      }
      edit={card?.state === 'notCollected' ? null : edit}
      actions={actions}
      editing={editing}
      onEditing={setEditing}
    >
      {card === undefined || card.state !== 'filled' || hours === null ? (
        <NotYet t={t} state={card?.state === 'filled' || card === undefined ? 'none' : card.state} />
      ) : (
        <>
          {lines.length === 0 ? null : (
            <table className="tracy-wo-facts-hours" data-off={hours.left ? '' : undefined}>
              <tbody>
                {lines.map((line) => {
                  const { days, times } = hoursLineParts(line)
                  return (
                    <tr key={line}>
                      <th scope="row">{days}</th>
                      <td>{times}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {hours.open ? (
            <div className="tracy-wo-facts-note" role="note">
              <span>{t('hours.note', { source: sourceName(t, hours) })}</span>
            </div>
          ) : null}
          {failed ? (
            <span className="tracy-wo-error" role="alert">
              {t('hours.failed')}
            </span>
          ) : null}
        </>
      )}
    </FactsCard>
  )
}

function TeamList({
  t,
  locale,
  view,
  doors
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  doors: FactsDoors
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const pick = async (id: string, choice: ReadingPick): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    setFailed(!(await doors.pickReading(id, choice)))
    setBusy(false)
  }
  return (
    <ul className="tracy-wo-facts-people">
      {view.team.map((person) => (
        <li
          key={person.id}
          data-off={person.removed || (person.reviewsOnly && !person.onSite) ? '' : undefined}
        >
          <span className="tracy-wo-facts-avatar" aria-hidden="true">
            {initialsOf(person.label)}
          </span>
          <span className="tracy-wo-facts-person">
            <span>
              {person.label}
              <SourceChip t={t} chip={itemChipOf(view, person)} locale={locale} />
              {person.removed || (person.reviewsOnly && !person.onSite) ? <LeftOffTag t={t} /> : null}
            </span>
            {person.role === null ? null : <small>{person.role}</small>}
          </span>
          {readingActions(person)
            .filter((p) => p !== 'remove')
            .map((p) => (
              <ActButton key={p} disabled={busy} onClick={() => void pick(person.id, p)}>
                {t(p === 'restore' ? 'reading.show' : `reading.${p}`)}
              </ActButton>
            ))}
        </li>
      ))}
      {failed ? (
        <li className="tracy-wo-error" role="alert">
          {t('reading.failed')}
        </li>
      ) : null}
    </ul>
  )
}

function BrandBody({
  t,
  logo,
  colors,
  retry,
  food
}: {
  t: Translate
  logo: LogoView
  colors: ColorsView
  retry: FactsDoors['retryLogo']
  food: boolean
}): JSX.Element {
  return (
    <>
      <LogoField t={t} logo={logo} retry={retry} food={food} />
      {colors.state === 'found' ? (
        <>
          <ul className="tracy-wo-facts-swatches">
            {colors.colors.map((c, i) => (
              <li key={`${c.hex}-${i}`}>
                <span style={{ backgroundColor: c.hex }} aria-hidden="true" />
                {c.hex}
              </li>
            ))}
          </ul>
          {colors.observedOnly ? (
            <p className="tracy-wo-facts-cap">
              {t(
                colors.origin === 'website' ? 'detail.colorsObserved.website' : 'detail.colorsObserved.social'
              )}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  )
}

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
  /** Menu, Google Place, reviews, current website, social figures and place profile, folded; null when none. */
  researchDetails: ReactNode | null
  /** Research runs: the photos and videos wait for it to finish, only Add more stays (#537). */
  running: boolean
}): JSX.Element {
  const cardOf = (id: CardId) => view.cards.find((c) => c.id === id)
  const facts = view.researched
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
  const body = (id: CardId, filled: () => ReactNode): ReactNode => {
    const card = cardOf(id)
    if (card === undefined) return null
    return card.state === 'filled' ? filled() : <NotYet t={t} state={card.state} />
  }
  const editOf = (id: CardId, rows: () => ReactNode): (() => ReactNode) | null =>
    cardOf(id)?.state === 'notCollected' ? null : rows
  // Each reading item followed by its chip ("Tennis [Bio], Padel [Bio]").
  const withChips = (items: ReadingItemView[]): ReactNode =>
    items.map((i, n) => (
      <span key={i.id}>
        {n > 0 ? ', ' : null}
        {i.label}
        <SourceChip t={t} chip={itemChipOf(view, i)} locale={locale} />
      </span>
    ))
  const looked = view.sources
    .filter((s) => typeof s.collectedAt === 'string' && s.collectedAt !== '')
    .map((s) => sourceLabel(t, s.source, s.ref ?? null))
    .filter((name, i, all) => all.indexOf(name) === i)
  const left: JSX.Element[] = []
  const right: JSX.Element[] = []
  for (const card of view.cards) {
    let el: JSX.Element | null = null
    if (card.id === 'hours') el = <HoursCard key="hours" t={t} locale={locale} view={view} doors={doors} />
    if (card.id === 'services')
      el = (
        <FactsCard
          key="services"
          t={t}
          id="services"
          title={t('field.services')}
          edit={editOf('services', () => doors.readingRows(['services', 'audience', 'serviceAreas']))}
        >
          {body('services', () => (
            <>
              <ul className="tracy-wo-facts-chips">
                {view.services
                  .filter((s) => !s.removed)
                  .map((s) => (
                    <li key={s.id}>
                      {s.label}
                      <SourceChip t={t} chip={itemChipOf(view, s)} locale={locale} />
                    </li>
                  ))}
              </ul>
              <dl className="tracy-wo-facts-kv">
                {(
                  [
                    ['field.audience', view.audience],
                    ['field.serviceAreas', view.serviceAreas]
                  ] as const
                ).map(([key, items]) =>
                  items.filter((i) => !i.removed).length === 0 ? null : (
                    <div key={key}>
                      <dt>{t(key)}</dt>
                      <dd>{withChips(items.filter((i) => !i.removed))}</dd>
                    </div>
                  )
                )}
              </dl>
            </>
          ))}
        </FactsCard>
      )
    if (card.id === 'about')
      el = (
        <FactsCard
          key="about"
          t={t}
          id="about"
          title={
            <>
              {t('field.bio')}
              <SourceChip t={t} chip={card.chip} locale={locale} />
            </>
          }
          edit={editOf('about', () => doors.field('bio', view.about ?? ''))}
        >
          {body('about', () => (
            <p className="tracy-wo-facts-about">{view.about}</p>
          ))}
        </FactsCard>
      )
    if (card.id === 'team')
      el = (
        <FactsCard
          key="team"
          t={t}
          id="team"
          title={t('field.team')}
          edit={editOf('team', () => doors.readingRows(['team']))}
        >
          {body('team', () => (
            <TeamList t={t} locale={locale} view={view} doors={doors} />
          ))}
        </FactsCard>
      )
    if (card.id === 'brand')
      el = (
        <FactsCard key="brand" t={t} id="brand" title={t('media.brand')} edit={null}>
          {card.state === 'notCollected' ? (
            <NotYet t={t} state="notCollected" />
          ) : (
            <BrandBody t={t} logo={media.logo} colors={media.colors} retry={doors.retryLogo} food={food} />
          )}
        </FactsCard>
      )
    if (card.id === 'messages')
      el = (
        <FactsCard
          key="messages"
          t={t}
          id="messages"
          title={t('keyMessages.title')}
          aside={<span className="tracy-wo-facts-aside">{t('facts.messages.lead')}</span>}
          edit={editOf('messages', () => doors.keyMessages)}
        >
          {body('messages', () => (
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
          ))}
        </FactsCard>
      )
    if (card.id === 'reviews')
      el = (
        <FactsCard
          key="reviews"
          t={t}
          id="reviews"
          title={t('facts.reviews.title')}
          aside={<span className="tracy-wo-facts-aside">{t('facts.reviews.note')}</span>}
          edit={null}
        >
          {body('reviews', () => (
            <ul className="tracy-wo-facts-quotes">
              {view.reviews.map((r, i) => (
                <li key={`${r.author}-${i}`}>
                  <q>{clipQuote(r.text)}</q>
                  <small>
                    {[r.author, r.rating === null ? null : `★ ${r.rating}`].filter(Boolean).join(' · ')}
                    <SourceChip t={t} chip={reviewChipOf(view, r)} locale={locale} />
                  </small>
                </li>
              ))}
            </ul>
          ))}
        </FactsCard>
      )
    if (el !== null) (card.column === 'left' ? left : right).push(el)
  }
  return (
    <div className="tracy-wo-facts">
      <BusinessCard
        t={t}
        locale={locale}
        view={view.business}
        logo={facts ? media.logo : NOT_COLLECTED_LOGO}
        websiteLink={websiteLink}
        onRating={doors.saveRating}
        edit={businessEdit}
        looked={looked}
      />
      <div className="tracy-wo-facts-grid">
        <div className="tracy-wo-facts-col">{left}</div>
        <div className="tracy-wo-facts-col">{right}</div>
      </div>
      <FactsMedia t={t} media={media} show={!running} onUpload={doors.uploadMedia} />
      {facts && researchDetails !== null ? (
        <details className="tracy-wo-facts-card tracy-wo-facts-more">
          <summary>{t('facts.research')}</summary>
          {researchDetails}
        </details>
      ) : null}
    </div>
  )
}
