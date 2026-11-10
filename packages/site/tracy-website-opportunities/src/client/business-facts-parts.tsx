/**
 * The business band of the Business facts sub-page (#537, design A) and its edit marks: the mark with the name and
 * the type, then phone, rating, address and website, five cells in one row that scrolls sideways when the column is
 * narrower, each value on one line followed by its source chip (`source-chip.tsx`); a missing value reads N/A alone.
 * The band is locked on the site; its Edit turns the cells into fields in place.
 */
import { Fragment, type JSX, type ReactNode } from 'react'
import { Badge } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { FactsBand, NotAvailable, OneLine } from './business-facts-band.tsx'
import type { BusinessCardView, EditMark } from './business-facts-model.ts'
import type { LogoView } from './detail-model.ts'
import { RatingCell } from './facts-rating-cell.tsx'
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

/** A cell of the business band: a small label over its value. */
const Cell = ({ label, children }: { label: string; children: ReactNode }): JSX.Element => (
  <div className="tracy-wo-facts-cell">
    <span className="tracy-wo-facts-ck" title={label}>
      {label}
    </span>
    {children}
  </div>
)

/** The business band: the name, then phone, rating, address and website. */
export function BusinessBand({
  t,
  locale,
  view,
  logo,
  websiteLink,
  onRating,
  edit,
  researched
}: {
  t: Translate
  locale: string
  view: BusinessCardView
  logo: LogoView
  websiteLink: (url: string) => JSX.Element
  onRating: (choice: RatingChoice) => Promise<boolean>
  /** The name, address and phone as fields in place; null before research (nothing to edit yet). */
  edit: ((close: () => void) => ReactNode) | null
  researched: boolean
}): JSX.Element {
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
    <FactsBand
      t={t}
      id="business"
      label={t('facts.business')}
      title={t('facts.business')}
      chips={<SourceChip t={t} chip={view.chips.name} locale={locale} />}
      onSite={{ on: true, set: null, lock: true, why: t('facts.lock.business') }}
      edit={edit === null ? { why: t('reason.not_collected') } : { form: edit }}
    >
      <div className="tracy-wo-facts-cells tracy-wo-facts-row">
        <div className="tracy-wo-facts-cell tracy-wo-facts-hero">
          {mark}
          <span className="tracy-wo-facts-hero-name">
            {/* The full name: it ends in an ellipsis only past 40 characters or the width of the row. */}
            <OneLine text={view.name} />
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
          {/* A missing value reads N/A alone: no source chip, no second line. */}
          <span className="tracy-wo-facts-ln">
            {view.website === null ? (
              missing
            ) : (
              <>
                <span className="tracy-wo-facts-ell" title={view.website}>
                  {websiteLink(view.website)}
                </span>
                <SourceChip t={t} chip={view.chips.website} locale={locale} />
              </>
            )}
          </span>
        </Cell>
      </div>
    </FactsBand>
  )
}
