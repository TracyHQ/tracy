/**
 * The Add person row at the end of the Team band in Edit (#537 R14): the name required, the role and the photo
 * optional. The photo is added to Photos & video first (a team photo), then given with the person; Add person sends
 * `PUT …/:id/team` `add`, and the row empties once the person is saved.
 */
import { type JSX, useState } from 'react'
import { Button, Input } from '@tracy/ui'

import { PhotoSlot, photoOf, teamErrorText } from './facts-team-photo.tsx'
import type { OwnerDoors } from './owner-edits-model.ts'
import type { Translate } from './strings.ts'

export function AddRow({
  t,
  owner
}: {
  t: Translate
  owner: Pick<OwnerDoors, 'team' | 'uploadTeamPhoto'>
}): JSX.Element {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = async (): Promise<void> => {
    if (busy || name.trim() === '') return
    setBusy(true)
    setError(null)
    const code = await owner.team({
      action: 'add',
      label: name.trim(),
      ...(role.trim() === '' ? {} : { role: role.trim() }),
      ...(photo === null ? {} : { photoMediaId: photo })
    })
    setBusy(false)
    setError(code)
    if (code === null) {
      setName('')
      setRole('')
      setPhoto(null)
    }
  }
  return (
    <li className="tracy-wo-facts-team-add">
      <PhotoSlot
        t={t}
        name={name}
        photoId={photo}
        disabled={busy}
        onPicked={photoOf(owner, null, setPhoto)}
      />
      <Input
        value={name}
        maxLength={80}
        autoComplete="off"
        aria-label={t('team.name')}
        placeholder={t('team.name')}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        value={role}
        maxLength={60}
        autoComplete="off"
        aria-label={t('team.roleOptional')}
        placeholder={t('team.roleOptional')}
        disabled={busy}
        onChange={(e) => setRole(e.target.value)}
      />
      <Button type="button" size="xs" disabled={busy || name.trim() === ''} onClick={() => void add()}>
        {t('team.add')}
      </Button>
      {error === null ? null : (
        <span className="tracy-wo-error tracy-wo-small" role="alert">
          {teamErrorText(t, error)}
        </span>
      )}
    </li>
  )
}
