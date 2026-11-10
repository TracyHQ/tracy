/**
 * The small pieces of the Business facts bands (#537, layout C): the edit marks, the left off tag, the text buttons,
 * and the business band on top: the mark and the full name on a first row, then four cells (phone, rating, address,
 * website), four in a row on a wide page and two by two under 900px, each value on one line followed by its source
 * chip (`source-chip.tsx`). Its Edit opens the fields in the side sheet.
 */
import { Fragment, type JSX, type ReactNode, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Badge } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { FactsSheet, NotAvailable, OneLine } from './business-facts-band.tsx'
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

/** The small muted tag beside a band or item the seller left off the site. */
export function LeftOffTag({ t }: { t: Translate }): JSX.Element {
  return <span className="tracy-wo-facts-off">{t('facts.leftOff')}</span>
}

/** One reading choice as a small text button. */
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

/** A cell of the business band: a small label over its value. */
const Cell = ({ label, children }: { label: string; children: ReactNode }): JSX.Element => (
  <div className="tracy-wo-facts-cell">
    <span className="tracy-wo-facts-ck" title={label}>
      {label}
    </span>
    {children}
  </div>
)

function RatingCell({
  t,
  view,
  locale,
  chip,
  onRating
}: {
  t: Translate
  view: NonNullable<BusinessCardView['rating']>
  locale: string
  chip: BusinessCardView['chips']['rating']
  onRating: (choice: RatingChoice) => Promise<boolean>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (choice: RatingChoice): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onRating(choice)
    setBusy(false)
    setFailed(!ok)
  }
  // A thin rating is already off the site: Leave off there would only repeat the sentence, so only Show is offered.
  const choices = ratingActions(view).filter((c) => !(c === 'leave' && view.few && !view.chosen))
  const note = view.shown
    ? 'facts.rating.shown'
    : view.few && !view.chosen
      ? 'facts.rating.left'
      : 'rating.left'
  const count =
    view.reviews === null
      ? ''
      : t(view.reviews === 1 ? 'facts.reviews.one' : 'facts.reviews.other', {
          count: new Intl.NumberFormat(locale).format(view.reviews)
        })
  const score = ratingText(view.score, locale)
  const full = count === '' ? `★ ${score}` : `★ ${score} · ${count}`
  return (
    <>
      <span className="tracy-wo-facts-ln">
        {/* One string that never wraps: the star, the score and the count; the count ends in an ellipsis first. */}
        <span className="tracy-wo-facts-ell tracy-wo-facts-rating" title={`${full}\n${t(note)}`}>
          <span className="tracy-wo-facts-stars" aria-hidden="true">
            ★
          </span>{' '}
          <b>{score}</b>
          {count === '' ? null : <span className="tracy-wo-facts-dim"> · {count}</span>}
        </span>
        <SourceChip t={t} chip={chip} locale={locale} />
      </span>
      <span className="tracy-wo-facts-ln tracy-wo-facts-rating-acts">
        {view.few ? (
          <Badge variant="outline" className="tracy-wo-chip-warn">
            {t('rating.few')}
          </Badge>
        ) : null}
        {note === 'rating.left' ? <LeftOffTag t={t} /> : null}
        {choices.map((choice) => (
          <ActButton key={choice} disabled={busy} onClick={() => void save(choice)}>
            {t(choice === 'show' ? 'rating.show' : 'rating.leave')}
          </ActButton>
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

/** The business band: the name row, then phone, rating, address and website (two by two on a narrow page), Edit at the top right. */
export function BusinessBand({
  t,
  locale,
  view,
  logo,
  websiteLink,
  onRating,
  edit,
  looked,
  researched
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
  researched: boolean
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const editRef = useRef<HTMLButtonElement | null>(null)
  const missing = <NotAvailable t={t} state={researched ? 'none' : 'notCollected'} />
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
  const othersText = `${t('facts.phone.others', { list: others.map((o) => o.phone).join(', ') })} ${t('phone.othersNote')}`
  return (
    <section className="tracy-wo-facts-band" data-card="business">
      <div className="tracy-wo-facts-band-body">
        <div className="tracy-wo-facts-cells">
          <div className="tracy-wo-facts-cell tracy-wo-facts-hero">
            {mark}
            <span className="tracy-wo-facts-hero-name">
              {/* The full name: it ends in an ellipsis only past 40 characters or the width of the row. */}
              <OneLine text={view.name}>
                <SourceChip t={t} chip={view.chips.name} locale={locale} />
              </OneLine>
              <span className="tracy-wo-facts-ln">
                {view.category === null ? (
                  missing
                ) : (
                  <Badge variant="outline" className="tracy-wo-chip-mute" title={view.category}>
                    {view.category}
                  </Badge>
                )}
              </span>
            </span>
          </div>
          <Cell label={others.length > 0 ? `${t('field.phone')} · ${t('phone.main')}` : t('field.phone')}>
            {phones === null ? (
              <span className="tracy-wo-facts-ln">{missing}</span>
            ) : (
              <span className="tracy-wo-facts-ln">
                <span className="tracy-wo-facts-ell tracy-wo-facts-keep" title={phones.main}>
                  {phones.main}
                </span>
                <SourceChip t={t} chip={view.chips.phone} locale={locale} />
                <Mark t={t} mark={view.marks.phone} />
              </span>
            )}
            {others.length > 0 ? (
              <span className="tracy-wo-facts-ln tracy-wo-facts-dim tracy-wo-small" title={othersText}>
                <span className="tracy-wo-facts-ell">
                  {othersBefore}
                  {others.map((o, i) => (
                    <Fragment key={o.phone}>
                      {i > 0 ? ', ' : null}
                      {o.phone}
                      <SourceChip t={t} chip={view.chips.others[i] ?? null} locale={locale} />
                    </Fragment>
                  ))}
                  {othersAfter}
                </span>
              </span>
            ) : null}
          </Cell>
          <Cell label={t('my.field.rating')}>
            {view.rating === null ? (
              <span className="tracy-wo-facts-ln">{missing}</span>
            ) : (
              <RatingCell
                t={t}
                view={view.rating}
                locale={locale}
                chip={view.chips.rating}
                onRating={onRating}
              />
            )}
          </Cell>
          <Cell label={t('field.address')}>
            {view.address === null ? (
              <span className="tracy-wo-facts-ln">{missing}</span>
            ) : (
              <OneLine text={view.address}>
                <SourceChip t={t} chip={view.chips.address} locale={locale} />
                <Mark t={t} mark={view.marks.address} />
              </OneLine>
            )}
          </Cell>
          <Cell label={t('my.field.website')}>
            <span className="tracy-wo-facts-ln">
              {view.website === null ? (
                <span className="tracy-wo-facts-ell tracy-wo-facts-dim">{t('facts.website.none')}</span>
              ) : (
                <span className="tracy-wo-facts-ell" title={view.website}>
                  {websiteLink(view.website)}
                </span>
              )}
              <SourceChip t={t} chip={view.chips.website} locale={locale} looked={looked} />
            </span>
          </Cell>
        </div>
      </div>
      {edit === null ? null : (
        <span className="tracy-wo-facts-acts tracy-wo-facts-corner">
          <button
            ref={editRef}
            type="button"
            className="tracy-wo-facts-act"
            aria-haspopup="dialog"
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
            {t('profile.edit')}
          </button>
        </span>
      )}
      <FactsSheet t={t} open={editing} title={view.name} onClose={() => setEditing(false)} back={editRef}>
        <div className="tracy-wo-facts-edit">{editing ? edit?.() : null}</div>
      </FactsSheet>
    </section>
  )
}
