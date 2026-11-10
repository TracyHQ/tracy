/**
 * The bands of the Business facts sub-page that hold their own state (#537, layout C): Opening hours (the days as a
 * row of fixed cells that scrolls sideways, the check and its choices in a last cell of their own that never
 * scrolls, the full table and the note in Show all), Team (people in a row, each with its choice) and the Brand body
 * (three cells: the logo and where it came from, the verdict and the colour note one line each, the colours).
 */
import { type JSX, type ReactNode, type RefObject, useState } from 'react'
import { Clock } from 'lucide-react'
import { Badge, Button } from '@tracy/ui'

import { FactsBand, NotAvailable, useHidesItems } from './business-facts-band.tsx'
import {
  BAND_CAPACITY,
  type BusinessFactsView,
  type FactsCardView,
  hoursLineParts,
  initialsOf,
  itemChipOf,
  overflows
} from './business-facts-model.ts'
import { ActButton, LeftOffTag } from './business-facts-parts.tsx'
import type { ColorsView, LogoView } from './detail-model.ts'
import { EditableText } from './editable-text.tsx'
import { mediaUrl } from './api.ts'
import { sourceLabel } from './cms-label.ts'
import { LogoField } from './media-row.tsx'
import { typedHours } from './profile-hours-model.ts'
import { type HoursChoice, type HoursSaved, sourceName } from './profile-hours-row.tsx'
import { type ReadingPick, readingActions } from './profile-reading-model.ts'
import { SourceChip } from './source-chip.tsx'
import type { Translate } from './strings.ts'

/** A band body for a state that is not filled: N/A, or Not collected yet before research. */
export const Missing = ({ t, card }: { t: Translate; card: FactsCardView | undefined }): JSX.Element => (
  <NotAvailable t={t} state={card?.state === 'notCollected' ? 'notCollected' : 'none'} />
)

export function HoursBand({
  t,
  locale,
  view,
  saveHours
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  saveHours: (choice: HoursChoice) => Promise<HoursSaved>
}): JSX.Element {
  const hours = view.hours
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const choose = async (choice: HoursChoice): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    setFailed((await saveHours(choice)) !== 'ok')
    setBusy(false)
  }
  const card = view.cards.find((c) => c.id === 'hours')
  const filled = card?.state === 'filled' && hours !== null
  const lines = hours === null ? [] : hours.hours.length > 0 ? hours.hours : hours.sourceHours
  const note = hours?.open ? t('hours.note', { source: sourceName(t, hours) }) : null
  const chip =
    hours?.chip === 'check' ? (
      <Badge variant="outline" className="tracy-wo-chip-warn" title={note ?? undefined}>
        {t('name.chip.check')}
      </Badge>
    ) : hours?.chip === 'checked' ? (
      <Badge variant="outline" className="tracy-wo-chip-ok">
        {t('name.chip.checked')}
      </Badge>
    ) : null
  // A left off hours band keeps its days and a tag; the one choice flips to Show on the site.
  const choices =
    !filled || hours === null
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
  const table = (): ReactNode => (
    <>
      <table className="tracy-wo-facts-hours" data-off={hours?.left ? '' : undefined}>
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
      {note === null ? null : (
        <div className="tracy-wo-facts-note" role="note">
          <span>{note}</span>
        </div>
      )}
    </>
  )
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
          return (await saveHours({ choice: 'edit', hours: next })) === 'ok'
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
  const shown = lines.slice(0, BAND_CAPACITY.hours)
  // The days scroll sideways when the band is narrower than all of them: Show all (n) then opens the full table.
  const [daysRef, daysHidden] = useHidesItems<HTMLDivElement>(shown.length)
  return (
    <FactsBand
      t={t}
      id="hours"
      title={
        <>
          <Clock aria-hidden="true" className="tracy-wo-icon" />
          <span className="tracy-wo-facts-ell">{t('field.hours')}</span>
          <SourceChip t={t} chip={card?.chip ?? null} locale={locale} />
        </>
      }
      sheetTitle={t('field.hours')}
      edit={card === undefined || card.state === 'notCollected' ? null : edit}
      more={
        filled && (overflows('hours', lines.length) || note !== null || daysHidden)
          ? { count: lines.length, render: table }
          : null
      }
    >
      {!filled ? (
        <Missing t={t} card={card} />
      ) : (
        <div className="tracy-wo-facts-hoursrow">
          <div
            ref={daysRef}
            className="tracy-wo-facts-days tracy-wo-facts-cells"
            data-off={hours.left ? '' : undefined}
          >
            {shown.map((line) => {
              const { days, times } = hoursLineParts(line)
              return (
                <div key={line} className="tracy-wo-facts-cell">
                  <span className="tracy-wo-facts-ck" title={days}>
                    {days}
                  </span>
                  <span className="tracy-wo-facts-ln">
                    <span className="tracy-wo-facts-ell" title={times}>
                      {times}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
          {chip === null && choices.length === 0 && !hours.left && !failed ? null : (
            <div className="tracy-wo-facts-cell tracy-wo-facts-status">
              <span className="tracy-wo-facts-ln">
                {chip}
                {hours.left ? <LeftOffTag t={t} /> : null}
              </span>
              <span className="tracy-wo-facts-ln tracy-wo-facts-choices">
                {choices}
                {failed ? (
                  <span className="tracy-wo-error" role="alert">
                    {t('hours.failed')}
                  </span>
                ) : null}
              </span>
            </div>
          )}
        </div>
      )}
    </FactsBand>
  )
}

/** The team: people in a row (or a list in the sheet), each with its avatar, role, chip and choice. */
export function TeamPeople({
  t,
  locale,
  view,
  pickReading,
  limit,
  listRef
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
  /** How many people the band shows; all of them in the sheet. */
  limit?: number
  /** The band's row, measured to offer Show all when a person does not fit. */
  listRef?: RefObject<HTMLUListElement | null>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const pick = async (id: string, choice: ReadingPick): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    setFailed(!(await pickReading(id, choice)))
    setBusy(false)
  }
  return (
    <ul ref={listRef} className="tracy-wo-facts-people">
      {view.team.slice(0, limit).map((person) => {
        const off = person.removed || (person.reviewsOnly && !person.onSite)
        return (
          <li key={person.id} data-off={off ? '' : undefined}>
            <span className="tracy-wo-facts-avatar" aria-hidden="true">
              {initialsOf(person.label)}
            </span>
            <span className="tracy-wo-facts-person">
              <span className="tracy-wo-facts-ln">
                <span className="tracy-wo-facts-ell" title={person.label}>
                  {person.label}
                </span>
                <SourceChip t={t} chip={itemChipOf(view, person)} locale={locale} />
                {off ? <LeftOffTag t={t} /> : null}
              </span>
              {person.role === null ? null : (
                <small className="tracy-wo-facts-ell" title={person.role}>
                  {person.role}
                </small>
              )}
            </span>
            {readingActions(person)
              .filter((p) => p !== 'remove')
              .map((p) => (
                <ActButton key={p} disabled={busy} onClick={() => void pick(person.id, p)}>
                  {t(p === 'restore' ? 'reading.show' : `reading.${p}`)}
                </ActButton>
              ))}
          </li>
        )
      })}
      {failed ? (
        <li className="tracy-wo-error" role="alert">
          {t('reading.failed')}
        </li>
      ) : null}
    </ul>
  )
}

/**
 * The brand in three cells side by side, no layer over another: the logo with where it came from and its size, the
 * verdict on the logo and the note on the colours (one line each, the whole sentence on hover), and the colours.
 * Under 560px the verdict and the note go to a second row.
 */
export function BrandBody({
  t,
  logo,
  colors,
  retry,
  food
}: {
  t: Translate
  logo: LogoView
  colors: ColorsView
  retry: { busy: boolean; failed: boolean; onPress: () => void }
  food: boolean
}): JSX.Element {
  const verdict =
    logo.state === 'found' && logo.recognised !== null ? t(`media.logo.recognised.${logo.recognised}`) : null
  const colorNote =
    colors.state === 'found' && colors.observedOnly
      ? t(colors.origin === 'website' ? 'detail.colorsObserved.website' : 'detail.colorsObserved.social')
      : null
  const size =
    logo.state === 'found' && logo.width !== null && logo.height !== null
      ? `${t(logo.small ? 'media.logo.smallNote' : 'media.logo.sizeNote', {
          width: logo.width,
          height: logo.height
        })}${logo.transparent ? ` ${t('media.logo.transparent')}` : ''}`
      : null
  const via =
    logo.state === 'found'
      ? t(logo.viaKey, { source: logo.source === null ? '' : sourceLabel(t, logo.source) })
      : null
  return (
    <div className="tracy-wo-facts-brand">
      <div className="tracy-wo-facts-brand-logo">
        {logo.state === 'found' ? (
          <>
            <span className="tracy-wo-logo">
              <img src={mediaUrl(logo.mediaId)} alt={t('media.logo')} decoding="async" />
            </span>
            <span className="tracy-wo-facts-brand-via">
              <Badge variant="outline" title={via ?? undefined}>
                {via}
              </Badge>
              {size === null ? null : (
                <span className="tracy-wo-facts-ell tracy-wo-facts-dim tracy-wo-small" title={size}>
                  {size}
                </span>
              )}
            </span>
          </>
        ) : (
          <LogoField t={t} logo={logo} retry={retry} food={food} />
        )}
      </div>
      {verdict === null && colorNote === null ? null : (
        <div className="tracy-wo-facts-brand-notes">
          {verdict === null ? null : (
            <span className="tracy-wo-facts-ell" title={verdict}>
              {verdict}
            </span>
          )}
          {colorNote === null ? null : (
            <span className="tracy-wo-facts-ell tracy-wo-facts-dim tracy-wo-small" title={colorNote}>
              {colorNote}
            </span>
          )}
        </div>
      )}
      {colors.state === 'found' ? (
        <ul className="tracy-wo-facts-swatches" title={colorNote ?? undefined}>
          {colors.colors.map((c, i) => (
            <li key={`${c.hex}-${i}`}>
              <span style={{ backgroundColor: c.hex }} aria-hidden="true" />
              {c.hex}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
