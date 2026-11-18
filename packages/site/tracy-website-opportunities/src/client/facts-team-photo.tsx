/**
 * The photo slot of a person in the Team band's Edit (#537 R14): the photo or the initials, pressed to pick a file. The
 * file goes to Photos & video as a team photo (`POST …/:id/media` with `purpose: team`), a file already added gives
 * its own id back; the caller then gives that id to the person. Refusals read in words under the row.
 */
import { type JSX, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Spinner } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import { initialsOf } from './business-facts-model.ts'
import type { OwnerDoors } from './owner-edits-model.ts'
import { en, type Translate } from './strings.ts'

const known = (key: string): boolean => Object.prototype.hasOwnProperty.call(en, key)

/** The words of a refusal of the team door or of the upload: `team.error.<code>`, `media.error.<code>`, or the fallback. */
export function teamErrorText(t: Translate, code: string): string {
  if (known(`team.error.${code}`)) return t(`team.error.${code}`)
  if (known(`media.error.${code}`)) return t(`media.error.${code}`)
  return t('team.error.other')
}

/** A photo picked for a person: uploaded, then (for a saved person) given to them. Answers the refusal code or null. */
export const photoOf =
  (
    owner: Pick<OwnerDoors, 'uploadTeamPhoto'>,
    give: ((mediaId: string) => Promise<string | null>) | null,
    keep: (id: string) => void
  ) =>
  async (file: File): Promise<string | null> => {
    const up = await owner.uploadTeamPhoto(file)
    if ('code' in up) return up.code
    keep(up.id)
    return give === null ? null : give(up.id)
  }

export function PhotoSlot({
  t,
  name,
  photoId,
  disabled,
  onPicked
}: {
  t: Translate
  /** The person's name, for the initials and the button's name. */
  name: string
  photoId: string | null
  disabled: boolean
  /** Uploads the file and gives it to the person; answers the refusal code, or null. */
  onPicked: (file: File) => Promise<string | null>
}): JSX.Element {
  const input = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const picked = async (file: File | undefined): Promise<void> => {
    if (file === undefined || busy) return
    setBusy(true)
    setError(null)
    const code = await onPicked(file)
    setBusy(false)
    setError(code)
    if (input.current) input.current.value = ''
  }
  return (
    <span className="tracy-wo-facts-photo">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
        hidden
        onChange={(e) => void picked(e.target.files?.[0])}
      />
      <button
        type="button"
        className="tracy-wo-facts-avatar"
        disabled={disabled || busy}
        title={error === null ? t('team.photo') : teamErrorText(t, error)}
        aria-label={t('team.photoOf', { name: name.trim() === '' ? t('team.newPerson') : name })}
        data-failed={error === null ? undefined : ''}
        onClick={() => input.current?.click()}
      >
        {busy ? (
          <Spinner label={t('media.adding')} />
        ) : photoId !== null ? (
          <img src={mediaUrl(photoId)} alt="" />
        ) : name.trim() === '' ? (
          <Camera aria-hidden="true" />
        ) : (
          initialsOf(name)
        )}
      </button>
      {error === null ? null : (
        <span className="tracy-wo-facts-sr" role="alert">
          {teamErrorText(t, error)}
        </span>
      )}
    </span>
  )
}
