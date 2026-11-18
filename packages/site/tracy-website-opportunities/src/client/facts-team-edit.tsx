/**
 * The Team band in Edit (#537 R14): every person as a row (photo, name, role) that saves by itself, with Remove, and an
 * Add person row at the end (the name required, the role and the photo optional). A person the owner added is gone once
 * removed; a person research read goes to the removed ones, and Put back brings them back (the reading's own
 * restore). The band shows Done alone: each row has already saved. Every call goes through `PUT …/:id/team`.
 */
import { type JSX, useState } from 'react'
import { Button, Input } from '@tracy/ui'

import { EditFooter } from './facts-band-actions.tsx'
import { AddRow } from './facts-team-add.tsx'
import { PhotoSlot, photoOf, teamErrorText } from './facts-team-photo.tsx'
import type { OwnerDoors, TeamEditBody } from './owner-edits-model.ts'
import type { ReadingItemView, ReadingPick } from './profile-reading-model.ts'
import type { Translate } from './strings.ts'

type TeamDoors = Pick<OwnerDoors, 'team' | 'uploadTeamPhoto'>

function MemberRow({
  t,
  person,
  owner,
  pickReading
}: {
  t: Translate
  person: ReadingItemView
  owner: TeamDoors
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
}): JSX.Element {
  const [name, setName] = useState(person.label)
  const [role, setRole] = useState(person.role ?? '')
  const [photo, setPhoto] = useState(person.photoId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = name.trim() !== person.label || role.trim() !== (person.role ?? '')
  const run = async (step: () => Promise<string | null>): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    setError(await step())
    setBusy(false)
  }
  const save = (): Promise<string | null> => {
    const edit: Extract<TeamEditBody, { action: 'update' }> = { action: 'update', id: person.id }
    if (name.trim() !== person.label) edit.label = name.trim()
    if (role.trim() !== (person.role ?? '')) edit.role = role.trim() === '' ? null : role.trim()
    return owner.team(edit)
  }
  const putBack = async (): Promise<string | null> =>
    (await pickReading(person.id, 'restore')) ? null : 'other'
  return (
    <li data-off={person.removed ? '' : undefined}>
      <PhotoSlot
        t={t}
        name={name}
        photoId={photo}
        disabled={busy || person.removed}
        onPicked={photoOf(
          owner,
          (mediaId) => owner.team({ action: 'update', id: person.id, photoMediaId: mediaId }),
          setPhoto
        )}
      />
      <Input
        value={name}
        maxLength={80}
        autoComplete="off"
        aria-label={t('team.name')}
        placeholder={t('team.name')}
        disabled={busy || person.removed}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        value={role}
        maxLength={60}
        autoComplete="off"
        aria-label={t('team.role')}
        placeholder={t('team.role')}
        disabled={busy || person.removed}
        onChange={(e) => setRole(e.target.value)}
      />
      {person.removed ? (
        <>
          <span className="tracy-wo-facts-dim tracy-wo-small">{t('reading.removed')}</span>
          <Button type="button" size="xs" variant="link" disabled={busy} onClick={() => void run(putBack)}>
            {t('reading.restore')}
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={busy || !changed || name.trim() === ''}
            onClick={() => void run(save)}
          >
            {t('profile.edit.save')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="link"
            disabled={busy}
            aria-label={t('team.removeLabel', { name: person.label })}
            onClick={() => void run(() => owner.team({ action: 'remove', id: person.id }))}
          >
            {t('team.remove')}
          </Button>
        </>
      )}
      {error === null ? null : (
        <span className="tracy-wo-error tracy-wo-small" role="alert">
          {teamErrorText(t, error)}
        </span>
      )}
    </li>
  )
}

export function TeamEdit({
  t,
  team,
  owner,
  pickReading,
  close
}: {
  t: Translate
  team: readonly ReadingItemView[]
  owner: TeamDoors
  pickReading: (item: string, pick: ReadingPick) => Promise<boolean>
  close: () => void
}): JSX.Element {
  return (
    <>
      <ul className="tracy-wo-facts-team-ed">
        {team.map((person) => (
          <MemberRow
            key={`${person.id}:${person.label}:${person.role ?? ''}:${person.photoId ?? ''}`}
            t={t}
            person={person}
            owner={owner}
            pickReading={pickReading}
          />
        ))}
        <AddRow t={t} owner={owner} />
      </ul>
      <EditFooter t={t} onCancel={close} note={t('team.editNote')} />
    </>
  )
}
