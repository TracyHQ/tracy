/**
 * The business band of the Business facts sub-page (#537, layout B): the mark with the name and type, phone, address,
 * website, then every other fact of the saved profile's business group and extensions as a generic cell with its own
 * switch (#537 R18), one row each; a missing value reads N/A. Locked on the site; Edit is in place.
 */
import { Fragment, type JSX, type ReactNode } from 'react'

import { mediaUrl } from './api.ts'
import { FactsBand, NotAvailable, OneLine } from './business-facts-band.tsx'
import type { BusinessCardView, BusinessFactsView, EditMark } from './business-facts-model.ts'
import type { LogoView } from './detail-model.ts'
import { EditedChip, GenericCell, type SetFactOn } from './facts-generic-row.tsx'
import { displayText, factDisplay } from './facts-value-model.ts'
import type { SavedFact } from './saved-profile-model.ts'
import { SourceChip } from './source-chip.tsx'
import { StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

export function Mark({ t, mark }: { t: Translate; mark: EditMark }): JSX.Element | null {
  if (mark === null) return null
  return <StatusPill state="info" label={t('profile.editedByYou')} />
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

/** The keys the business band draws in its own cells: the name, the phone (and the other phones), the address. */
const DRAWN = new Set(['name', 'phone', 'address', 'research:otherPhones'])

/** The business facts the own cells do not draw; a fact in the words of a drawn one (the phone again) is no cell. */
export function moreBusinessFacts(t: Translate, facts: readonly SavedFact[]): SavedFact[] {
  const drawn = new Set(
    facts.filter((f) => DRAWN.has(f.key)).map((f) => displayText(factDisplay(t, f)).trim().toLowerCase())
  )
  return facts.filter(
    (f) => !DRAWN.has(f.key) && !drawn.has(displayText(factDisplay(t, f)).trim().toLowerCase())
  )
}

/** The business band: the name, then phone, address and website, then the other business facts. */
export function BusinessBand({
  t,
  locale,
  view,
  logo,
  websiteLink,
  edit,
  researched,
  more = [],
  rows = [],
  setOn = null
}: {
  t: Translate
  locale: string
  view: BusinessCardView
  logo: LogoView
  websiteLink: (url: string) => JSX.Element
  /** The name, address and phone as fields in place; null before research (nothing to edit yet). */
  edit: ((close: () => void) => ReactNode) | null
  researched: boolean
  /** The other facts of the business group (`moreBusinessFacts`), each a generic cell. */
  more?: readonly SavedFact[]
  rows?: BusinessFactsView['sources']
  setOn?: SetFactOn | null
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
      source={view.chips.name}
      count={4 + more.length}
      onSite={{ on: true, set: null, lock: true, why: t('facts.lock.business') }}
      edit={edit === null ? { why: t('reason.not_collected') } : { form: edit }}
    >
      <div className="tracy-wo-facts-cells tracy-wo-facts-row">
        <div className="tracy-wo-facts-cell tracy-wo-facts-hero">
          <span className="tracy-wo-facts-ck">{t('field.name')}</span>
          <span className="tracy-wo-facts-hero-v">
            {mark}
            <span className="tracy-wo-facts-hero-name">
              {/* The full name: it ends in an ellipsis only past 40 characters or the width of the row. */}
              <OneLine text={view.name} />
              <span className="tracy-wo-facts-ln">
                {view.category === null ? (
                  missing
                ) : (
                  <StatusPill state="info" label={view.category} title={view.category} />
                )}
              </span>
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
              {view.facts?.phone ? (
                <EditedChip t={t} fact={view.facts.phone} locale={locale} />
              ) : (
                <Mark t={t} mark={view.marks.phone} />
              )}
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
        <Cell label={t('field.address')}>
          {view.address === null ? (
            <span className="tracy-wo-facts-ln">{missing}</span>
          ) : (
            <OneLine text={view.address}>
              <SourceChip t={t} chip={view.chips.address} locale={locale} />
              {view.facts?.address ? (
                <EditedChip t={t} fact={view.facts.address} locale={locale} />
              ) : (
                <Mark t={t} mark={view.marks.address} />
              )}
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
        {more.map((f) => (
          <GenericCell key={f.id} t={t} locale={locale} fact={f} rows={rows} setOn={setOn} />
        ))}
      </div>
    </FactsBand>
  )
}
