/**
 * The fields a Business facts band turns into when Edit is pressed (#537, design A): drawn in place of the band's
 * body, with Cancel and Save at the band's bottom right (`EditFooter`). Save sends only what changed, through the
 * calls the page already had (the name, the profile rows, the hours), then the band closes. A field nothing can save
 * is not drawn.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Input, Textarea } from '@tracy/ui'

import { hoursLineParts } from './business-facts-model.ts'
import { EditFooter } from './facts-band-actions.tsx'
import type { HoursChoice, HoursSaved } from './profile-hours-row.tsx'
import type { Translate } from './strings.ts'

/** One profile row that can be edited: its words now and the call that saves new words. */
export interface ProfileField {
  value: string
  save: (typed: string) => Promise<boolean>
}

const Field = ({
  label,
  wide,
  children
}: {
  label: string
  wide?: boolean
  children: ReactNode
}): JSX.Element => (
  <label className="tracy-wo-facts-fld" data-wide={wide ? '' : undefined}>
    <span className="tracy-wo-facts-ck">{label}</span>
    {children}
  </label>
)

/** Runs the saves of the fields that changed, one after another; false at the first that fails. */
async function saveChanged(steps: Array<(() => Promise<boolean>) | null>): Promise<boolean> {
  for (const step of steps) if (step !== null && !(await step())) return false
  return true
}

/** The business band: the name (or its own name row with choices), the phone and the address. */
export function BusinessEdit({
  t,
  close,
  name,
  nameRow,
  saveName,
  phone,
  address,
  others
}: {
  t: Translate
  close: () => void
  name: string
  /** The name row with the choices research left, drawn as it is; the plain name field when null. */
  nameRow: JSX.Element | null
  saveName: (name: string) => Promise<boolean>
  phone: ProfileField | null
  address: ProfileField | null
  /** The other numbers, read only: no call edits them. */
  others: string | null
}): JSX.Element {
  const [draft, setDraft] = useState({ name, phone: phone?.value ?? '', address: address?.value ?? '' })
  const set = (key: keyof typeof draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }))
  const changed = (field: ProfileField | null, typed: string): (() => Promise<boolean>) | null =>
    field === null || typed.trim() === field.value.trim() ? null : () => field.save(typed.trim())
  return (
    <>
      {nameRow}
      <div className="tracy-wo-facts-ef" data-cols="3">
        {nameRow === null ? (
          <Field label={t('field.name')}>
            <Input value={draft.name} maxLength={200} autoComplete="off" autoFocus onChange={set('name')} />
          </Field>
        ) : null}
        {phone === null ? null : (
          <Field label={t('field.phone')}>
            <Input value={draft.phone} maxLength={40} autoComplete="off" onChange={set('phone')} />
          </Field>
        )}
        {address === null ? null : (
          <Field label={t('field.address')} wide={nameRow !== null}>
            <Input value={draft.address} maxLength={300} autoComplete="off" onChange={set('address')} />
          </Field>
        )}
      </div>
      {others === null ? null : <p className="tracy-wo-muted tracy-wo-small">{others}</p>}
      <EditFooter
        t={t}
        note={t('facts.edit.note')}
        onCancel={close}
        onSave={() =>
          saveChanged([
            nameRow !== null || draft.name.trim() === '' || draft.name.trim() === name
              ? null
              : () => saveName(draft.name.trim()),
            changed(phone, draft.phone),
            changed(address, draft.address)
          ])
        }
      />
    </>
  )
}

/** About: the whole text in one field. */
export function AboutEdit({
  t,
  close,
  about
}: {
  t: Translate
  close: () => void
  about: ProfileField
}): JSX.Element {
  const [draft, setDraft] = useState(about.value)
  return (
    <>
      <Field label={t('field.bio')}>
        <Textarea
          value={draft}
          maxLength={1200}
          rows={4}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
        />
      </Field>
      <EditFooter
        t={t}
        note={t('facts.edit.note')}
        onCancel={close}
        onSave={() =>
          saveChanged([draft.trim() === about.value.trim() ? null : () => about.save(draft.trim())])
        }
      />
    </>
  )
}

/**
 * Opening hours: one field per line (a day or a group of days), seven in a row on a wide page, wrapping when narrower. Saving unchanged hours that
 * wait for a check keeps them as they are; changed hours are sent as typed.
 */
export function HoursEdit({
  t,
  close,
  lines,
  open,
  saveHours
}: {
  t: Translate
  close: () => void
  lines: string[]
  /** The hours wait for a check: Save confirms them even unchanged. */
  open: boolean
  saveHours: (choice: HoursChoice) => Promise<HoursSaved>
}): JSX.Element {
  const parts = lines.map(hoursLineParts)
  const [times, setTimes] = useState(parts.map((p) => p.times))
  const next = parts
    .map((p, i) => {
      const typed = (times[i] ?? '').trim()
      return p.days === '' ? typed : `${p.days}: ${typed}`
    })
    .filter((line) => line !== '')
  const same = next.join('|') === lines.join('|')
  return (
    <>
      <div className="tracy-wo-facts-ef" data-days="">
        {parts.map((p, i) => (
          <Field key={`${p.days}-${i}`} label={p.days === '' ? t('field.hours') : p.days}>
            <Input
              value={times[i] ?? ''}
              maxLength={120}
              autoComplete="off"
              autoFocus={i === 0}
              title={times[i]}
              onChange={(e) => setTimes((all) => all.map((v, j) => (j === i ? e.target.value : v)))}
            />
          </Field>
        ))}
      </div>
      <EditFooter
        t={t}
        note={t('facts.edit.note')}
        onCancel={close}
        onSave={async () => {
          if (same && !open) return true
          if (next.length === 0) return false
          const sent: HoursChoice = same ? { choice: 'keep' } : { choice: 'edit', hours: next }
          return (await saveHours(sent)) === 'ok'
        }}
      />
    </>
  )
}
