/**
 * The bands of the Business facts sub-page that hold their own state (#537, design A): Opening hours (the days as a
 * row of cells that shrink to fit, and scroll sideways when they cannot; the check note as the amber chip in the
 * header; the band's switch keeps the hours on the site or leaves them off) and the Team row (people side by side,
 * each with its own small switch) and Research details (locked off the site, the sources research read).
 */
import type { JSX } from 'react'
import { Clock } from 'lucide-react'

import { FactsBand, NotAvailable } from './business-facts-band.tsx'
import {
  type BusinessFactsView,
  type FactsCardView,
  hoursLineParts,
  initialsOf,
  itemChipOf
} from './business-facts-model.ts'
import { sourceLabel } from './cms-label.ts'
import { BandSwitch } from './facts-band-actions.tsx'
import { HoursEdit } from './facts-band-edit.tsx'
import { type HoursChoice, type HoursSaved, sourceName } from './profile-hours-row.tsx'
import type { ReadingItemView, ReadingPick } from './profile-reading-model.ts'
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
  const card = view.cards.find((c) => c.id === 'hours')
  const filled = card?.state === 'filled' && hours !== null
  const lines = hours === null ? [] : hours.hours.length > 0 ? hours.hours : hours.sourceHours
  const note = hours?.open ? t('hours.note', { source: sourceName(t, hours) }) : null
  // On: the hours go to the site. Off: left off. Putting them back keeps what the source says.
  const canSet = filled && (!hours.left || hours.sourceHours.length > 0)
  const set = async (on: boolean): Promise<boolean> =>
    (await saveHours({ choice: on ? 'keep' : 'leave' })) === 'ok'
  return (
    <FactsBand
      t={t}
      id="hours"
      label={t('field.hours')}
      title={
        <>
          <Clock aria-hidden="true" className="tracy-wo-icon" />
          <span className="tracy-wo-facts-ell">{t('field.hours')}</span>
        </>
      }
      check={note}
      chips={filled ? <SourceChip t={t} chip={card?.chip ?? null} locale={locale} /> : null}
      onSite={{ on: !(hours?.left ?? false), set: canSet ? set : null }}
      edit={
        !filled
          ? { why: t('reason.not_collected') }
          : {
              form: (close) => (
                <HoursEdit t={t} close={close} lines={lines} open={hours.open} saveHours={saveHours} />
              )
            }
      }
    >
      {!filled ? (
        <Missing t={t} card={card} />
      ) : (
        <div className="tracy-wo-facts-days tracy-wo-facts-cells tracy-wo-facts-row">
          {lines.map((line) => {
            const { days, times } = hoursLineParts(line)
            return (
              <div key={line} className="tracy-wo-facts-cell" title={line}>
                <span className="tracy-wo-facts-ck">{days}</span>
                <span className="tracy-wo-facts-ln">
                  <span className="tracy-wo-facts-ell">{times}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </FactsBand>
  )
}

/** A person is on the site unless removed, or named only in reviews and not shown. */
const onSiteOf = (p: ReadingItemView): boolean => !p.removed && (!p.reviewsOnly || p.onSite)

/** The reading picks that put a person on the site, or take them off it. */
export function personPicks(p: ReadingItemView, on: boolean): ReadingPick[] {
  if (!on) return [p.reviewsOnly ? 'hide' : 'remove']
  return [
    ...(p.removed ? (['restore'] as const) : []),
    ...(p.reviewsOnly && !p.onSite ? (['show'] as const) : [])
  ]
}

/** The team: people in one row that scrolls sideways, each with its avatar, role, chip and own small switch. */
export function TeamPeople({
  t,
  locale,
  view,
  pickReading
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
}): JSX.Element {
  const set =
    (person: ReadingItemView) =>
    async (on: boolean): Promise<boolean> => {
      for (const pick of personPicks(person, on)) if (!(await pickReading(person.id, pick))) return false
      return true
    }
  return (
    <ul className="tracy-wo-facts-people tracy-wo-facts-row">
      {view.team.map((person) => (
        <li key={person.id} data-off={onSiteOf(person) ? undefined : ''}>
          <span className="tracy-wo-facts-avatar" aria-hidden="true">
            {initialsOf(person.label)}
          </span>
          <span className="tracy-wo-facts-person">
            <span className="tracy-wo-facts-ln">
              <span className="tracy-wo-facts-ell" title={person.label}>
                {person.label}
              </span>
              <SourceChip t={t} chip={itemChipOf(view, person)} locale={locale} />
            </span>
            {person.role === null ? null : (
              <small className="tracy-wo-facts-ell" title={person.role}>
                {person.role}
              </small>
            )}
          </span>
          <BandSwitch t={t} small label={person.label} view={{ on: onSiteOf(person), set: set(person) }} />
        </li>
      ))}
    </ul>
  )
}

/** Research details: locked off the site, the sources research read in one row. */
export function ResearchBand({ t, view }: { t: Translate; view: BusinessFactsView }): JSX.Element {
  const researched = view.researched
  const looked = view.sources
    .filter((s) => typeof s.collectedAt === 'string' && s.collectedAt !== '')
    .map((s) => sourceLabel(t, s.source, s.ref ?? null))
    .filter((name, i, all) => all.indexOf(name) === i)
  return (
    <FactsBand
      t={t}
      id="research"
      label={t('facts.research')}
      title={t('facts.research')}
      aside={
        <span className="tracy-wo-facts-aside" title={t('facts.lock.research')}>
          {t('facts.lock.research')}
        </span>
      }
      onSite={{ on: false, set: null, lock: true, why: t('facts.lock.research') }}
      edit={{ why: t('facts.edit.research') }}
    >
      {researched && looked.length > 0 ? (
        <ul className="tracy-wo-facts-chiprow tracy-wo-facts-row">
          {looked.map((name) => (
            <li key={name} className="tracy-wo-facts-pill">
              <span className="tracy-wo-facts-ell">{name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <NotAvailable t={t} state={researched ? 'none' : 'notCollected'} />
      )}
    </FactsBand>
  )
}
