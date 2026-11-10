/**
 * The small pieces of the Business facts cards (#537, design A): a card with its title and one Edit, the edit marks,
 * and the business card on top, each value followed by its source chip (`source-chip.tsx`).
 */
import { Fragment, type JSX, type ReactNode, useState } from 'react'
import { Eye, Globe, MapPin, Pencil, Phone } from 'lucide-react'
import { Badge, Button } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import type { BusinessCardView, EditMark } from './business-facts-model.ts'
import type { LogoView } from './detail-model.ts'
import { ratingActions, ratingText } from './profile-rating-model.ts'
import type { RatingChoice } from './profile-rating-row.tsx'
import { SourceChip } from './source-chip.tsx'
import type { Translate } from './strings.ts'

export function Mark({ t, mark }: { t: Translate; mark: EditMark }): JSX.Element | null {
  if (mark === null) return null
  return (
    <Badge
      variant="outline"
      className={mark === 'afterApproval' ? 'tracy-wo-chip-warn tracy-wo-edited' : 'tracy-wo-edited'}
    >
      {t(mark === 'afterApproval' ? 'facts.editedAfter' : 'profile.editedByYou')}
    </Badge>
  )
}

/** The small muted tag beside a card or row the seller left off the site. */
export function LeftOffTag({ t }: { t: Translate }): JSX.Element {
  return <span className="tracy-wo-facts-off">{t('facts.leftOff')}</span>
}

/** One reading choice as a small text button in a card header (or right-aligned on a row). */
export function ActButton({
  children,
  disabled,
  onClick
}: {
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button type="button" className="tracy-wo-facts-act" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

/**
 * One card: its title, one Edit that opens the card's rows as fields (`editing`), and Done to close them. A card
 * with nothing to edit (`edit` null) has no Edit.
 */
export function FactsCard({
  t,
  id,
  title,
  aside,
  wide = false,
  edit,
  editing: controlled,
  onEditing,
  actions = [],
  children
}: {
  t: Translate
  id: string
  title: ReactNode
  aside?: ReactNode
  wide?: boolean
  /** The reading choices of the card (Keep, Leave off the site...), small text buttons before Edit. */
  actions?: ReactNode[]
  /** The rows as fields; null: the card has no Edit. */
  edit: (() => ReactNode) | null
  /** Held by the card's owner when a press inside the card also opens it (Edit hours). */
  editing?: boolean
  onEditing?: (open: boolean) => void
  children: ReactNode
}): JSX.Element {
  const [own, setOwn] = useState(false)
  const editing = controlled ?? own
  const setEditing = onEditing ?? setOwn
  return (
    <section
      className="tracy-wo-facts-card"
      data-card={id}
      data-wide={wide ? '' : undefined}
      data-editing={editing ? '' : undefined}
    >
      <div className="tracy-wo-facts-card-head">
        <h3>{title}</h3>
        {aside}
        {editing && edit !== null ? (
          <Button type="button" size="xs" variant="outline" onClick={() => setEditing(false)}>
            {t('facts.done')}
          </Button>
        ) : edit === null && actions.length === 0 ? null : (
          <span className="tracy-wo-facts-acts">
            {[
              ...actions,
              edit === null ? null : (
                <button
                  key="edit"
                  type="button"
                  className="tracy-wo-facts-act"
                  onClick={() => setEditing(true)}
                >
                  <Pencil aria-hidden="true" />
                  {t('profile.edit')}
                </button>
              )
            ]
              .filter((a) => a !== null)
              .map((a, i) => (
                <Fragment key={i}>
                  {i > 0 ? (
                    <span className="tracy-wo-facts-dot" aria-hidden="true">
                      ·
                    </span>
                  ) : null}
                  {a}
                </Fragment>
              ))}
          </span>
        )}
      </div>
      {editing && edit !== null ? <div className="tracy-wo-facts-edit">{edit()}</div> : children}
    </section>
  )
}

function RatingLine({
  t,
  view,
  locale,
  failed,
  chip
}: {
  t: Translate
  view: NonNullable<BusinessCardView['rating']>
  locale: string
  failed: boolean
  chip: BusinessCardView['chips']['rating']
}): JSX.Element {
  const note = view.shown
    ? 'facts.rating.shown'
    : view.few && !view.chosen
      ? 'facts.rating.left'
      : 'rating.left'
  return (
    <>
      <span className="tracy-wo-facts-sub">
        <span className="tracy-wo-facts-stars" aria-hidden="true">
          {'★'.repeat(Math.max(0, Math.min(5, Math.round(view.score))))}
        </span>
        <b>{ratingText(view.score, locale)}</b>
        {view.reviews === null ? null : (
          <span>
            {t(view.reviews === 1 ? 'facts.reviews.one' : 'facts.reviews.other', {
              count: new Intl.NumberFormat(locale).format(view.reviews)
            })}
          </span>
        )}
        {view.few ? (
          <Badge variant="outline" className="tracy-wo-chip-warn">
            {t('rating.few')}
          </Badge>
        ) : null}
        <SourceChip t={t} chip={chip} locale={locale} />
      </span>
      <span className="tracy-wo-facts-sub tracy-wo-small">
        <Eye aria-hidden="true" className="tracy-wo-icon" />
        {note === 'rating.left' ? <LeftOffTag t={t} /> : <span>{t(note)}</span>}
        {failed ? (
          <span className="tracy-wo-error" role="alert">
            {t('rating.failed')}
          </span>
        ) : null}
      </span>
    </>
  )
}

/** The business card: logo or initials, name, category, rating, then address, phones and website with icons. */
export function BusinessCard({
  t,
  locale,
  view,
  logo,
  websiteLink,
  onRating,
  edit,
  looked
}: {
  t: Translate
  locale: string
  view: BusinessCardView
  /** The sources research read, named, for the Not found title of the website. */
  looked: string[]
  logo: LogoView
  websiteLink: (url: string) => JSX.Element
  onRating: (choice: RatingChoice) => Promise<boolean>
  /** The name, address and phone as fields; null before research (nothing to edit yet). */
  edit: (() => ReactNode) | null
}): JSX.Element {
  const mark =
    logo.state === 'found' ? (
      <span className="tracy-wo-facts-logo">
        <img src={mediaUrl(logo.mediaId)} alt={t('media.logo')} decoding="async" />
      </span>
    ) : (
      <span
        className="tracy-wo-facts-logo"
        data-neutral={view.markColors === null ? '' : undefined}
        style={
          view.markColors === null
            ? undefined
            : { background: view.markColors.background, color: view.markColors.letters }
        }
        aria-hidden="true"
      >
        {view.initials}
      </span>
    )
  const phones = view.phones
  const others = phones?.others ?? []
  // "Other: {list}." in the interface language, split where the numbers (each with its chip) go.
  const [othersBefore = '', othersAfter = ''] = t('facts.phone.others', { list: '\u0000' }).split('\u0000')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const saveRating = async (choice: RatingChoice): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onRating(choice)
    setBusy(false)
    setFailed(!ok)
  }
  const actions =
    view.rating === null
      ? []
      : ratingActions(view.rating).map((choice) => (
          <ActButton key={choice} disabled={busy} onClick={() => void saveRating(choice)}>
            {t(choice === 'show' ? 'rating.show' : 'rating.leave')}
          </ActButton>
        ))
  return (
    <FactsCard
      t={t}
      id="business"
      actions={actions}
      wide
      title={
        <span className="tracy-wo-facts-hero">
          {mark}
          <span className="tracy-wo-facts-hero-name">
            <span className="tracy-wo-facts-bn">
              {view.name}
              <SourceChip t={t} chip={view.chips.name} locale={locale} />
            </span>
            {view.category === null ? null : (
              <Badge variant="outline" className="tracy-wo-chip-mute">
                {view.category}
              </Badge>
            )}
          </span>
        </span>
      }
      edit={edit}
    >
      {view.rating === null ? null : (
        <RatingLine t={t} view={view.rating} locale={locale} failed={failed} chip={view.chips.rating} />
      )}
      <ul className="tracy-wo-facts-contacts">
        <li>
          <MapPin aria-hidden="true" className="tracy-wo-icon" />
          <span>
            {view.address ?? <span className="tracy-wo-muted">{t('reason.not_collected')}</span>}
            <SourceChip t={t} chip={view.chips.address} locale={locale} />
            <Mark t={t} mark={view.marks.address} />
          </span>
        </li>
        <li>
          <Phone aria-hidden="true" className="tracy-wo-icon" />
          <span>
            {phones === null ? (
              <span className="tracy-wo-muted">{t('reason.not_collected')}</span>
            ) : (
              <span className="tracy-wo-row tracy-wo-wrap">
                <span>{phones.main}</span>
                {others.length > 0 ? (
                  <Badge variant="outline" className="tracy-wo-name-chip">
                    {t('phone.main')}
                  </Badge>
                ) : null}
                <SourceChip t={t} chip={view.chips.phone} locale={locale} />
                <Mark t={t} mark={view.marks.phone} />
              </span>
            )}
            {others.length > 0 ? (
              <span className="tracy-wo-muted tracy-wo-small tracy-wo-facts-block">
                {othersBefore}
                {others.map((o, i) => (
                  <Fragment key={o.phone}>
                    {i > 0 ? ', ' : null}
                    {o.phone}
                    <SourceChip t={t} chip={view.chips.others[i] ?? null} locale={locale} />
                  </Fragment>
                ))}
                {othersAfter} {t('phone.othersNote')}
              </span>
            ) : null}
          </span>
        </li>
        <li>
          <Globe aria-hidden="true" className="tracy-wo-icon" />
          <span>
            {view.website === null ? (
              <span className="tracy-wo-muted">{t('facts.website.none')}</span>
            ) : (
              websiteLink(view.website)
            )}
            <SourceChip t={t} chip={view.chips.website} locale={locale} looked={looked} />
          </span>
        </li>
      </ul>
    </FactsCard>
  )
}
