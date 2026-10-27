/**
 * "Opening hours" on the Details Profile card: the hours the site shows, a chip while one source alone says open 24
 * hours every day (`Check this`) or once the person acted (`Checked`), and Keep · Edit hours · Leave off the site.
 * Nothing blocks the build: unchecked, the site shows no hours.
 */
import { type JSX, useId, useState } from 'react'
import { Badge, Button, Textarea } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'

import { type HoursRowView, typedHours } from './profile-hours-model.ts'
import type { Translate } from './strings.ts'

/** What the person asks the server to keep (`PUT …/:id/hours`). */
export type HoursChoice = { choice: 'keep' } | { choice: 'leave' } | { choice: 'edit'; hours: string[] }
/** `unreadable`: the server could not read the typed hours. */
export type HoursSaved = 'ok' | 'unreadable' | 'failed'

/** Product names stay as they are written; the other sources are words of the interface. */
const PRODUCT_NAME: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  osm: 'OpenStreetMap'
}

function sourceName(t: Translate, view: HoursRowView): string {
  if (view.source === 'listing') return view.sourceLabel ?? t('name.source.listing')
  if (view.source === 'website') return t('name.source.website')
  return PRODUCT_NAME[view.source ?? 'google'] ?? PRODUCT_NAME.google
}

export function ProfileHoursRow({
  t,
  view,
  onSave
}: {
  t: Translate
  view: HoursRowView
  /** Resolves once the choice is saved and the page read again, or why it was not. */
  onSave: (choice: HoursChoice) => Promise<HoursSaved>
}): JSX.Element {
  const [reopened, setReopened] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState((view.hours.length ? view.hours : view.sourceHours).join('\n'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'unreadable' | 'failed' | null>(null)
  const inputId = useId()
  const open = view.open || reopened
  const save = async (choice: HoursChoice): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    const saved = await onSave(choice)
    setBusy(false)
    if (saved === 'ok') {
      setEditing(false)
      setReopened(false)
    } else setError(saved)
  }
  const typed = typedHours(draft)
  const chip =
    view.chip !== null ? (
      <Badge variant="outline" className={cn('tracy-wo-name-chip', `is-${view.chip}`)}>
        {t(view.chip === 'check' ? 'name.chip.check' : 'name.chip.checked')}
      </Badge>
    ) : null
  return (
    <div className="tracy-wo-field">
      <dt className="tracy-wo-muted tracy-wo-small">{t('field.hours')}</dt>
      <dd>
        {view.left || view.hours.length === 0 ? (
          <span className="tracy-wo-row tracy-wo-wrap">
            <span className="tracy-wo-muted">{view.left ? t('hours.left') : null}</span>
            {chip}
          </span>
        ) : (
          // The chip sits on the first line, as the Name and Google rating rows place theirs: centred beside a
          // seven line list it read as a mark on Thursday (measured on dev 26/10/2026).
          <span className="tracy-wo-hours-lines">
            {view.hours.map((line, index) => (
              <span key={line} className={index === 0 ? 'tracy-wo-row tracy-wo-wrap' : undefined}>
                {index === 0 ? (
                  <>
                    <span>{line}</span>
                    {chip}
                  </>
                ) : (
                  line
                )}
              </span>
            ))}
          </span>
        )}
        {view.open ? (
          <span className="tracy-wo-muted tracy-wo-small">
            {t('hours.note', { source: sourceName(t, view) })}
          </span>
        ) : null}
        {open && editing ? (
          <span className="tracy-wo-hours-edit">
            <Textarea
              id={inputId}
              aria-label={t('field.hours')}
              value={draft}
              rows={Math.min(Math.max(typed.length, 3), 8)}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditing(false)
              }}
            />
            <span className="tracy-wo-muted tracy-wo-small">{t('hours.hint')}</span>
            <span className="tracy-wo-row">
              <Button
                type="button"
                size="xs"
                disabled={busy || typed.length === 0}
                onClick={() => void save({ choice: 'edit', hours: typed })}
              >
                {t('name.save')}
              </Button>
            </span>
          </span>
        ) : open ? (
          <span className="tracy-wo-row tracy-wo-wrap tracy-wo-name-actions">
            {view.sourceHours.length > 0 ? (
              <Button
                type="button"
                size="xs"
                variant="link"
                disabled={busy}
                onClick={() => void save({ choice: 'keep' })}
              >
                {t('name.keep')}
              </Button>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="link"
              disabled={busy}
              onClick={() => {
                setDraft((view.hours.length ? view.hours : view.sourceHours).join('\n'))
                setEditing(true)
              }}
            >
              {t('hours.edit')}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="link"
              disabled={busy}
              onClick={() => void save({ choice: 'leave' })}
            >
              {t('hours.leave')}
            </Button>
          </span>
        ) : view.chip === 'checked' ? (
          <span className="tracy-wo-row tracy-wo-name-actions">
            <Button type="button" size="xs" variant="link" onClick={() => setReopened(true)}>
              {t('name.change')}
            </Button>
          </span>
        ) : null}
        {error !== null ? (
          <span className="tracy-wo-error" role="alert">
            {t(error === 'unreadable' ? 'hours.unreadable' : 'hours.failed')}
          </span>
        ) : null}
      </dd>
    </div>
  )
}
