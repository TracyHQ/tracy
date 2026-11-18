/**
 * Hours and amenities on the Business facts sub-page (#537 R18, layout B): the opening hours as one row when every day
 * is the same, else a row per line (the check note as the amber chip in the header), then the amenities and bookings,
 * each fact with its own switch through the facts door. Edit opens the day fields (hours door) and the other facts.
 */
import { type JSX, useState } from 'react'
import { Clock } from 'lucide-react'
import { Input } from '@tracy/ui'

import { FactsBand, NotAvailable } from './business-facts-band.tsx'
import { Missing } from './business-facts-bands.tsx'
import { type BusinessFactsView, hoursLineParts } from './business-facts-model.ts'
import { EditFooter } from './facts-band-actions.tsx'
import type { MoreFacts } from './facts-band-edit.tsx'
import { EditedChip, GenericCell, type SetFactOn, factsSwitch } from './facts-generic-row.tsx'
import { ItemSwitch } from './facts-item-switch.tsx'
import { type SaveFactValue, runSteps, useFactDrafts } from './facts-value-edit.tsx'
import { type HoursChoice, type HoursSaved, sourceName } from './profile-hours-row.tsx'
import { factChipOf } from './saved-profile-model.ts'
import { collapseHours, mainChip } from './facts-section-model.ts'
import type { Translate } from './strings.ts'

/** Opening hours in Edit: a field per line, then the other facts; unchanged hours that wait for a check are kept. */
export function HoursEdit({
  t,
  close,
  lines,
  open,
  saveHours,
  more
}: {
  t: Translate
  close: () => void
  lines: string[]
  /** The hours wait for a check: Save confirms them even unchanged. */
  open: boolean
  saveHours: (choice: HoursChoice) => Promise<HoursSaved>
  more?: MoreFacts
}): JSX.Element {
  const extra = useFactDrafts(t, more?.facts ?? [], more?.save ?? null)
  const parts = lines.map(hoursLineParts)
  const [times, setTimes] = useState(parts.map((p) => p.times))
  const next = parts
    .map((p, i) => {
      const typed = (times[i] ?? '').trim()
      return p.days === '' ? typed : `${p.days}: ${typed}`
    })
    .filter((line) => line !== '')
  const same = next.join('|') === lines.join('|')
  const hoursStep = async (): Promise<boolean> => {
    if (lines.length === 0 || (same && !open)) return true
    if (next.length === 0) return false
    const sent: HoursChoice = same ? { choice: 'keep' } : { choice: 'edit', hours: next }
    return (await saveHours(sent)) === 'ok'
  }
  return (
    <>
      {parts.length === 0 ? null : (
        <div className="tracy-wo-facts-ef" data-days="">
          {parts.map((p, i) => (
            <label key={`${p.days}-${i}`} className="tracy-wo-facts-fld">
              <span className="tracy-wo-facts-ck">{p.days === '' ? t('field.hours') : p.days}</span>
              <Input
                value={times[i] ?? ''}
                maxLength={120}
                autoComplete="off"
                autoFocus={i === 0}
                title={times[i]}
                onChange={(e) => setTimes((all) => all.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </label>
          ))}
        </div>
      )}
      {extra.fields}
      <EditFooter
        t={t}
        note={t('facts.edit.note')}
        onCancel={close}
        onSave={() => runSteps([hoursStep, ...extra.steps()])}
      />
    </>
  )
}

export function HoursAmenitiesBand({
  t,
  locale,
  view,
  saveHours,
  setOn,
  saveValue
}: {
  t: Translate
  locale: string
  view: BusinessFactsView
  saveHours: (choice: HoursChoice) => Promise<HoursSaved>
  /** The facts door's switch, or null when no call reaches it. */
  setOn: SetFactOn | null
  saveValue: SaveFactValue | null
}): JSX.Element {
  const hours = view.hours
  const saved = view.saved
  const card = view.cards.find((c) => c.id === 'hours')
  const fact = saved?.hours ?? null
  const others = [saved?.amenities ?? null, saved?.reservable ?? null].filter((f) => f !== null)
  const all = [fact, ...others].filter((f) => f !== null)
  const savedLines = Array.isArray(fact?.value) ? (fact.value as unknown[]).map(String) : null
  const lines = savedLines ?? (hours === null ? [] : hours.hours.length > 0 ? hours.hours : hours.sourceHours)
  const filled = card?.state === 'filled' && (lines.length > 0 || others.length > 0)
  const note = hours?.open ? t('hours.note', { source: sourceName(t, hours) }) : null
  // Before the saved profile: the hours alone, on or left off through the hours door.
  const canSet = filled && hours !== null && (!hours.left || hours.sourceHours.length > 0)
  const hoursDoor = async (on: boolean): Promise<boolean> =>
    (await saveHours({ choice: on ? 'keep' : 'leave' })) === 'ok'
  const title = saved === null ? t('field.hours') : t('facts.hoursAmenities')
  const chip = fact === null ? (card?.chip ?? null) : factChipOf(fact, view.sources)
  const rows = collapseHours(lines, (from, to) => t('facts.hours.range', { from, to }))
  const one = rows.length === 1 && lines.length > 1
  const shown = rows.length === 0 && fact !== null ? [''] : rows
  return (
    <FactsBand
      t={t}
      id="hours"
      label={title}
      title={
        <>
          <Clock aria-hidden="true" className="tracy-wo-icon" />
          <span className="tracy-wo-facts-ell">{title}</span>
        </>
      }
      check={note}
      source={filled ? (mainChip([chip, ...others.map((f) => factChipOf(f, view.sources))]) ?? chip) : null}
      count={filled ? shown.length + others.length : null}
      onSite={factsSwitch(all, setOn) ?? { on: !(hours?.left ?? false), set: canSet ? hoursDoor : null }}
      edit={
        !filled
          ? { why: t('reason.not_collected') }
          : {
              form: (close) => (
                <HoursEdit
                  t={t}
                  close={close}
                  lines={lines}
                  open={hours?.open ?? false}
                  saveHours={saveHours}
                  more={{ facts: others, save: saveValue }}
                />
              )
            }
      }
    >
      {!filled ? (
        <Missing t={t} card={card} />
      ) : (
        <div className="tracy-wo-facts-cells">
          {shown.map((line, i) => {
            const { days, times } = hoursLineParts(line)
            return (
              <div
                key={`${line}-${i}`}
                className="tracy-wo-facts-cell"
                data-fact={i === 0 ? fact?.id : undefined}
                data-off={fact?.onSite === false ? '' : undefined}
                title={line}
              >
                <span className="tracy-wo-facts-ck">{one || days === '' ? t('field.hours') : days}</span>
                <span className="tracy-wo-facts-ln">
                  {line === '' ? (
                    <NotAvailable t={t} />
                  ) : (
                    <span className="tracy-wo-facts-ell">{one ? line : times}</span>
                  )}
                </span>
                {i > 0 || fact === null ? null : (
                  <span className="tracy-wo-facts-ln tracy-wo-facts-meta">
                    <EditedChip t={t} fact={fact} locale={locale} />
                    {setOn === null ? null : (
                      <ItemSwitch
                        t={t}
                        bare
                        label={t('field.hours')}
                        on={fact.onSite}
                        set={(on) => setOn(fact.id, on)}
                      />
                    )}
                  </span>
                )}
              </div>
            )
          })}
          {others.map((f) => (
            <GenericCell key={f.id} t={t} locale={locale} fact={f} rows={view.sources} setOn={setOn} />
          ))}
        </div>
      )}
    </FactsBand>
  )
}
