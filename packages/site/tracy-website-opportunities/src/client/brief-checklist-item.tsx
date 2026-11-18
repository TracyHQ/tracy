/**
 * One item of the Site content brief checklist (#537, option E): label, value, where it came from, Edit where the
 * brief allows editing it, and the On the site switch where the brief allows turning it off. Hours read as a seven
 * day grid, photos as tiles with their count, the brand as its logo and swatches. An item the site leaves out says
 * why in plain words under its value (`leftOffKeys`).
 */
import { type JSX, useState } from 'react'
import { Button, Input, Switch } from '@tracy/ui'

import type { BriefMediaView } from './brief-media-model.ts'
import { SourcePill, Value } from './brief-checklist-value.tsx'
import { leftOffKeys } from './brief-steps-model.ts'
import type { BriefRow } from './business-brief-model.ts'
import { StatusPill } from './status-pill.tsx'
import type { Translate } from './strings.ts'

/** How the seller edits one item: its words now, and the door that saves new ones (answers whether it went through). */
export interface BriefEditDoor {
  value: string
  multiline: boolean
  maxLength: number
  save: (typed: string) => Promise<boolean>
}

function Editor({
  t,
  row,
  door,
  onClose
}: {
  t: Translate
  row: BriefRow
  door: BriefEditDoor
  onClose: () => void
}): JSX.Element {
  const [draft, setDraft] = useState(door.value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await door.save(draft)
    setBusy(false)
    if (ok) onClose()
    else setFailed(true)
  }
  const field = {
    'aria-label': row.label,
    value: draft,
    maxLength: door.maxLength,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value)
  }
  return (
    <span className="tracy-wo-stack">
      {door.multiline ? (
        <textarea
          className="tracy-wo-textarea"
          rows={Math.min(8, Math.max(4, door.value.split('\n').length))}
          {...field}
        />
      ) : (
        <Input
          autoComplete="off"
          {...field}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save()
            if (event.key === 'Escape') onClose()
          }}
        />
      )}
      <span className="tracy-wo-row">
        <Button type="button" size="xs" disabled={busy} onClick={() => void save()}>
          {t('brief.edit.save')}
        </Button>
        <Button type="button" size="xs" variant="ghost" disabled={busy} onClick={onClose}>
          {t('brief.edit.cancel')}
        </Button>
      </span>
      {failed ? (
        <span className="tracy-wo-error tracy-wo-small" role="alert">
          {t('brief.edit.failed')}
        </span>
      ) : null}
    </span>
  )
}

export function BriefChecklistItem({
  t,
  row,
  media,
  door,
  editing,
  locked,
  busy,
  refusal,
  onEdit,
  onToggle
}: {
  t: Translate
  row: BriefRow
  media: BriefMediaView | null
  /** The edit door of this item, or null when the brief does not let it be edited. */
  door: BriefEditDoor | null
  editing: boolean
  /** An approved brief: no Edit and no switch. */
  locked: boolean
  /** A switch of the page is being saved: every switch waits. */
  busy: boolean
  /** The words of a refused switch of this item, or null. */
  refusal: string | null
  onEdit: (open: boolean) => void
  onToggle: (onSite: boolean) => void
}): JSX.Element {
  const off = !row.onSite && !row.readOnly
  const notes = off ? leftOffKeys(row).map((key) => t(key)) : row.notes
  const canEdit = !locked && door !== null
  const canSwitch = !locked && !row.readOnly
  return (
    <div className="tracy-wo-brief-it" data-off={off ? 'true' : undefined}>
      <span className="tracy-wo-brief-it-lab">{row.label}</span>
      <div className="tracy-wo-brief-it-v">
        {editing && canEdit ? (
          <Editor t={t} row={row} door={door} onClose={() => onEdit(false)} />
        ) : (
          <Value t={t} row={row} media={media} />
        )}
        {notes.map((note) =>
          off ? (
            <StatusPill key={note} state="off" label={note} className="tracy-wo-brief-off" />
          ) : (
            <span key={note} className="tracy-wo-brief-note">
              {note}
            </span>
          )
        )}
        {refusal !== null ? (
          <span className="tracy-wo-error tracy-wo-small" role="alert">
            {refusal}
          </span>
        ) : null}
      </div>
      <span>{row.source === '' ? null : <SourcePill text={row.source} logo={row.sourceLogo} />}</span>
      <span>
        {canEdit && !editing ? (
          <button type="button" className="tracy-wo-brief-edit" onClick={() => onEdit(true)}>
            {t('brief.edit')}
          </button>
        ) : null}
      </span>
      <span>
        {canSwitch ? (
          <Switch
            checked={row.onSite}
            disabled={busy}
            aria-label={`${t('brief.table.onSite')}: ${row.label}`}
            onCheckedChange={onToggle}
          />
        ) : null}
      </span>
    </div>
  )
}
