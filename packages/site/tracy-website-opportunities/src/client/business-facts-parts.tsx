/**
 * The small pieces of the Business facts cards (#537, design A): a card with its title and one Edit, the caption of
 * where its facts come from, the edit marks, and the business card on top.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Eye, Globe, MapPin, Pencil, Phone } from 'lucide-react'
import { Badge, Button } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { sourceLabel } from './cms-label.ts'
import type { BusinessCardView, EditMark, Origin } from './business-facts-model.ts'
import type { LogoView } from './detail-model.ts'
import { ratingActions, ratingText } from './profile-rating-model.ts'
import type { RatingChoice } from './profile-rating-row.tsx'
import type { Translate } from './strings.ts'

/** "From Google Places, Instagram · From the bio · You entered this". */
export function originsText(t: Translate, origins: Origin[]): string {
  const named = origins.flatMap((o) => (o.kind === 'source' ? [sourceLabel(t, o.source)] : []))
  const parts: string[] = []
  if (named.length > 0) parts.push(t('brief.source.from', { list: named.join(', ') }))
  for (const o of origins) if (o.kind === 'reading') parts.push(t(`reading.from.${o.from}`))
  if (origins.some((o) => o.kind === 'you')) parts.push(t('brief.source.you'))
  return parts.join(' · ')
}

export function Caption({
  t,
  origins,
  children
}: {
  t: Translate
  origins: Origin[]
  children?: ReactNode
}): JSX.Element | null {
  const words = originsText(t, origins)
  if (words === '' && children === undefined) return null
  return (
    <p className="tracy-wo-facts-cap">
      {words === '' ? null : <span>{words}</span>}
      {children}
    </p>
  )
}

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
  children
}: {
  t: Translate
  id: string
  title: ReactNode
  aside?: ReactNode
  wide?: boolean
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
        {edit === null ? null : editing ? (
          <Button type="button" size="xs" variant="outline" onClick={() => setEditing(false)}>
            {t('facts.done')}
          </Button>
        ) : (
          <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            {t('profile.edit')}
          </Button>
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
  onSave
}: {
  t: Translate
  view: NonNullable<BusinessCardView['rating']>
  locale: string
  onSave: (choice: RatingChoice) => Promise<boolean>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (choice: RatingChoice): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onSave(choice)
    setBusy(false)
    setFailed(!ok)
  }
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
      </span>
      <span className="tracy-wo-facts-sub tracy-wo-small">
        <Eye aria-hidden="true" className="tracy-wo-icon" />
        <span>{t(note)}</span>
        {ratingActions(view).map((choice) => (
          <Button
            key={choice}
            type="button"
            size="xs"
            variant="link"
            disabled={busy}
            onClick={() => void save(choice)}
          >
            {t(choice === 'show' ? 'rating.show' : 'rating.leave')}
          </Button>
        ))}
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
  edit
}: {
  t: Translate
  locale: string
  view: BusinessCardView
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
  return (
    <FactsCard
      t={t}
      id="business"
      wide
      title={
        <span className="tracy-wo-facts-hero">
          {mark}
          <span className="tracy-wo-facts-hero-name">
            <span className="tracy-wo-facts-bn">{view.name}</span>
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
        <RatingLine t={t} view={view.rating} locale={locale} onSave={onRating} />
      )}
      <ul className="tracy-wo-facts-contacts">
        <li>
          <MapPin aria-hidden="true" className="tracy-wo-icon" />
          <span>
            {view.address ?? <span className="tracy-wo-muted">{t('reason.not_collected')}</span>}
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
                <Mark t={t} mark={view.marks.phone} />
              </span>
            )}
            {others.length > 0 ? (
              <span className="tracy-wo-muted tracy-wo-small tracy-wo-facts-block">
                {t('facts.phone.others', {
                  list: others
                    .map((o) => {
                      const from = o.sources.map((s) => sourceLabel(t, s)).join(', ')
                      return from === '' ? o.phone : `${o.phone} (${from})`
                    })
                    .join(', ')
                })}{' '}
                {t('phone.othersNote')}
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
          </span>
        </li>
      </ul>
      <Caption t={t} origins={view.origins} />
    </FactsCard>
  )
}
