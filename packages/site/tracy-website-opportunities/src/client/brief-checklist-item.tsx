/**
 * One item of the Site content brief checklist (#537, option E): label, value, where it came from, Edit where the
 * brief allows editing it, and the On the site switch where the brief allows turning it off. Hours read as a seven
 * day grid, photos as tiles with their count, the brand as its logo and swatches. An item the site leaves out says
 * why in plain words under its value (`leftOffKeys`).
 */
import { type JSX, useState } from 'react'
import { Button, Input, Switch } from '@tracy/ui'

import { mediaUrl } from './api.ts'
import type { BriefMediaView } from './brief-media-model.ts'
import { leftOffKeys } from './brief-steps-model.ts'
import type { BriefRow } from './business-brief-model.ts'
import type { Translate } from './strings.ts'

/** How the seller edits one item: its words now, and the door that saves new ones (answers whether it went through). */
export interface BriefEditDoor {
  value: string
  multiline: boolean
  maxLength: number
  save: (typed: string) => Promise<boolean>
}

/** `Monday: Open 24 hours; Tuesday: ...` as day and words, when every part reads that way; else null. */
export function hoursDays(value: string): { day: string; text: string }[] | null {
  const parts = value
    .split(/;|\n/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  const days = parts.map((part) => {
    const at = part.indexOf(':')
    return at <= 0 ? null : { day: part.slice(0, at).trim(), text: part.slice(at + 1).trim() }
  })
  return days.length > 0 && days.every((d) => d !== null) ? (days as { day: string; text: string }[]) : null
}

function Value({
  t,
  row,
  media
}: {
  t: Translate
  row: BriefRow
  media: BriefMediaView | null
}): JSX.Element {
  if (row.field === 'hours') {
    const days = hoursDays(row.value)
    if (days !== null)
      return (
        <div className="tracy-wo-brief-days">
          {days.map((d) => (
            <div key={d.day}>
              {/* The day's first three letters fit seven columns; the whole name is its title. */}
              <b title={d.day}>{d.day.slice(0, 3)}</b>
              {d.text}
            </div>
          ))}
        </div>
      )
  }
  if (row.field === 'photos' && media !== null)
    return (
      <>
        {media.tiles.length > 0 ? (
          <span className="tracy-wo-brief-tiles">
            {media.tiles.map((id) => (
              <img
                key={id}
                src={mediaUrl(id)}
                alt=""
                loading="lazy"
                decoding="async"
                // A photo the store can no longer serve leaves no empty tile behind.
                onError={(event) => {
                  event.currentTarget.hidden = true
                }}
              />
            ))}
          </span>
        ) : null}
        <span>{row.value}</span>
      </>
    )
  if (row.field === 'brand' && media !== null)
    return (
      <span className="tracy-wo-brief-brand">
        {media.logoId !== null ? (
          <img className="tracy-wo-brief-logo" src={mediaUrl(media.logoId)} alt={t('media.logo')} />
        ) : null}
        {media.colors.map((hex) => (
          <span key={hex} className="tracy-wo-brief-swatch">
            <i style={{ background: hex }} />
            {hex}
          </span>
        ))}
      </span>
    )
  return <span>{row.value}</span>
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
        {notes.map((note) => (
          <span key={note} className={off ? 'tracy-wo-brief-off' : 'tracy-wo-brief-note'}>
            {note}
          </span>
        ))}
        {refusal !== null ? (
          <span className="tracy-wo-error tracy-wo-small" role="alert">
            {refusal}
          </span>
        ) : null}
      </div>
      <span>{row.source === '' ? null : <span className="tracy-wo-brief-src">{row.source}</span>}</span>
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
