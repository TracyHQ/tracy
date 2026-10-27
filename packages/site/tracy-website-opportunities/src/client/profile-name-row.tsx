/**
 * "Name on the site" on the Details Profile card: the name the site carries, a chip while the sources disagree
 * (`Check this`) or once the person acted (`Checked`), what each source says, and Keep · Use the other name · Edit.
 * Nothing blocks the build: unchecked, it uses the suggested name.
 */
import { type JSX, useId, useState } from 'react'
import { Badge, Button, Input } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import { interfaceLocale } from '@tracy/core/interface-languages'

import type { NameRowView, NameSourceView } from './profile-name-model.ts'
import type { Translate } from './strings.ts'

/** Product names stay as they are written; the other sources are words of the interface. */
const PRODUCT_NAME: Record<string, string> = {
  google: 'Google Maps',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  osm: 'OpenStreetMap'
}

function sourceLabel(t: Translate, s: NameSourceView): string {
  if (s.key === 'listing') return s.label ?? t('name.source.listing')
  return PRODUCT_NAME[s.key] ?? t(`name.source.${s.key}`)
}

function joined(list: string[]): string {
  try {
    return new Intl.ListFormat(interfaceLocale(), { type: 'conjunction' }).format(list)
  } catch {
    return list.join(', ')
  }
}

export function ProfileNameRow({
  t,
  view,
  onSave
}: {
  t: Translate
  view: NameRowView
  /** Resolves true once the name is saved and the page read again. */
  onSave: (name: string) => Promise<boolean>
}): JSX.Element {
  const [reopened, setReopened] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(view.name)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const inputId = useId()
  const open = view.open || reopened
  const save = async (name: string): Promise<void> => {
    const value = name.replace(/\s+/g, ' ').trim()
    if (busy || value === '') return
    setBusy(true)
    setFailed(false)
    const ok = await onSave(value)
    setBusy(false)
    setFailed(!ok)
    if (ok) {
      setEditing(false)
      setReopened(false)
    }
  }
  return (
    <div className="tracy-wo-field">
      <dt className="tracy-wo-muted tracy-wo-small">{t('name.label')}</dt>
      <dd>
        <span className="tracy-wo-row tracy-wo-wrap">
          <span>{view.name}</span>
          {view.chip !== null ? (
            <Badge variant="outline" className={cn('tracy-wo-name-chip', `is-${view.chip}`)}>
              {t(view.chip === 'check' ? 'name.chip.check' : 'name.chip.checked')}
            </Badge>
          ) : null}
        </span>
        {open && view.lines.length > 1 ? (
          <span className="tracy-wo-muted tracy-wo-small">
            {view.lines
              .map((line) =>
                t(line.sources.length > 1 ? 'name.say.many' : 'name.say.one', {
                  sources: joined(line.sources.map((s) => sourceLabel(t, s))),
                  name: line.name
                })
              )
              .join(' ')}
          </span>
        ) : null}
        {open && editing ? (
          <span className="tracy-wo-row">
            <Input
              id={inputId}
              aria-label={t('name.label')}
              value={draft}
              maxLength={200}
              autoComplete="off"
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save(draft)
                if (event.key === 'Escape') setEditing(false)
              }}
            />
            <Button
              type="button"
              size="xs"
              disabled={busy || draft.trim() === ''}
              onClick={() => void save(draft)}
            >
              {t('name.save')}
            </Button>
          </span>
        ) : open ? (
          <span className="tracy-wo-row tracy-wo-wrap tracy-wo-name-actions">
            <Button
              type="button"
              size="xs"
              variant="link"
              disabled={busy}
              onClick={() => void save(view.name)}
            >
              {t('name.keep')}
            </Button>
            {view.other !== null ? (
              <Button
                type="button"
                size="xs"
                variant="link"
                disabled={busy}
                onClick={() => void save(view.other ?? '')}
              >
                {t('name.use', { name: view.other })}
              </Button>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant="link"
              disabled={busy}
              onClick={() => {
                setDraft(view.name)
                setEditing(true)
              }}
            >
              {t('name.edit')}
            </Button>
          </span>
        ) : view.chip === 'checked' ? (
          <span className="tracy-wo-row tracy-wo-name-actions">
            <Button type="button" size="xs" variant="link" onClick={() => setReopened(true)}>
              {t('name.change')}
            </Button>
          </span>
        ) : null}
        {failed ? (
          <span className="tracy-wo-error" role="alert">
            {t('name.failed')}
          </span>
        ) : null}
      </dd>
    </div>
  )
}
