/**
 * One text the seller can correct in place (#524): the words with an Edit link, then a field with Save and Cancel. Used
 * by the Profile rows (`profile-edit-model.ts`) and the brief card lines (`brief-edit-model.ts`). `onSave` answers
 * whether the save went through; a failed save keeps the field open with its words.
 */
import { type JSX, useState } from 'react'
import { Badge, Button, Input } from '@tracy/ui'

import type { Translate } from './strings.ts'

export function EditableText({
  t,
  value,
  label,
  edited,
  editedKey,
  multiline = false,
  maxLength,
  onSave,
  keys = {
    edit: 'profile.edit',
    save: 'profile.edit.save',
    cancel: 'profile.edit.cancel',
    failed: 'profile.edit.failed'
  }
}: {
  t: Translate
  value: string
  /** The accessible name of the field. */
  label: string
  /** The words shown are the seller's own edit. */
  edited: boolean
  /** The marker of an edited text. */
  editedKey: string
  multiline?: boolean
  maxLength: number
  onSave: (typed: string) => Promise<boolean>
  keys?: { edit: string; save: string; cancel: string; failed: string }
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onSave(draft)
    setBusy(false)
    if (!ok) return setFailed(true)
    setEditing(false)
  }
  const open = (): void => {
    setDraft(value)
    setFailed(false)
    setEditing(true)
  }
  if (!editing)
    return (
      <span className="tracy-wo-row tracy-wo-wrap">
        <span>{value}</span>
        {edited ? (
          <Badge variant="outline" className="tracy-wo-edited">
            {t(editedKey)}
          </Badge>
        ) : null}
        <Button type="button" size="xs" variant="link" onClick={open}>
          {t(keys.edit)}
        </Button>
      </span>
    )
  return (
    <span className="tracy-wo-stack">
      {multiline ? (
        <textarea
          className="tracy-wo-textarea"
          aria-label={label}
          value={draft}
          maxLength={maxLength}
          rows={4}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <Input
          aria-label={label}
          value={draft}
          maxLength={maxLength}
          autoComplete="off"
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save()
            if (event.key === 'Escape') setEditing(false)
          }}
        />
      )}
      <span className="tracy-wo-row">
        <Button type="button" size="xs" disabled={busy} onClick={() => void save()}>
          {t(keys.save)}
        </Button>
        <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
          {t(keys.cancel)}
        </Button>
      </span>
      {failed ? (
        <span className="tracy-wo-error tracy-wo-small" role="alert">
          {t(keys.failed)}
        </span>
      ) : null}
    </span>
  )
}
