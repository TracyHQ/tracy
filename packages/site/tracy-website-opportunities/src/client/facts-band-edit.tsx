/**
 * The fields a Business facts band turns into when Edit is pressed (#537, design A): drawn in place of the band's
 * body, with Cancel and Save at the band's bottom right (`EditFooter`). Save sends only what changed, through the
 * calls the page already had (the name, the profile rows), then the facts of the saved profile the band also holds,
 * each through the facts door (`facts-value-edit.tsx`), and the band closes. A field nothing can save is not drawn.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Input, Textarea } from '@tracy/ui'

import { EditFooter } from './facts-band-actions.tsx'
import { type SaveFactValue, runSteps, useFactDrafts } from './facts-value-edit.tsx'
import type { SavedFact } from './saved-profile-model.ts'
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

/** The band's other facts of the saved profile, edited through the facts door after the band's own fields. */
export interface MoreFacts {
  facts: readonly SavedFact[]
  save: SaveFactValue | null
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
  others,
  more
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
  more?: MoreFacts
}): JSX.Element {
  const extra = useFactDrafts(t, more?.facts ?? [], more?.save ?? null)
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
      {extra.fields}
      <EditFooter
        t={t}
        note={t('facts.edit.note')}
        onCancel={close}
        onSave={() =>
          runSteps([
            nameRow !== null || draft.name.trim() === '' || draft.name.trim() === name
              ? null
              : () => saveName(draft.name.trim()),
            changed(phone, draft.phone),
            changed(address, draft.address),
            ...extra.steps()
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
  about,
  more
}: {
  t: Translate
  close: () => void
  /** The bio and its own door; null when no call edits it (the other texts still edit through the facts door). */
  about: ProfileField | null
  more?: MoreFacts
}): JSX.Element {
  const extra = useFactDrafts(t, more?.facts ?? [], more?.save ?? null)
  const [draft, setDraft] = useState(about?.value ?? '')
  return (
    <>
      {about === null ? null : (
        <Field label={t('field.bio')}>
          <Textarea
            value={draft}
            maxLength={1200}
            rows={4}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
        </Field>
      )}
      {extra.fields}
      <EditFooter
        t={t}
        note={t('facts.edit.note')}
        onCancel={close}
        onSave={() =>
          runSteps([
            about === null || draft.trim() === about.value.trim() ? null : () => about.save(draft.trim()),
            ...extra.steps()
          ])
        }
      />
    </>
  )
}
