/**
 * "Key messages" on the Details Profile card (#1791): up to three points the site leads with, each a label and the
 * quote or quotes it rests on. The owner can edit a label, move a point up or down, or delete it, then Save writes the
 * list. The quotes are shown, never edited.
 */
import { type JSX, useState } from 'react'
import { Button, Input } from '@tracy/ui'

import {
  type KeyMessageView,
  MAX_LABEL_LENGTH,
  moveMessage,
  removeMessage,
  withLabel
} from './profile-key-messages-model.ts'
import type { Translate } from './strings.ts'

export function ProfileKeyMessages({
  t,
  messages,
  onSave
}: {
  t: Translate
  /** The list as the server holds it. */
  messages: KeyMessageView[]
  /** Resolves true once the list is saved and the page read again. */
  onSave: (before: KeyMessageView[], next: KeyMessageView[]) => Promise<boolean>
}): JSX.Element | null {
  const [draft, setDraft] = useState<KeyMessageView[]>(messages)
  const [editing, setEditing] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(messages)
  if (messages.length === 0) return null
  const save = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onSave(messages, draft)
    setBusy(false)
    setFailed(!ok)
  }
  const commitEdit = (): void => {
    if (editing !== null) setDraft(withLabel(draft, editing, text))
    setEditing(null)
  }
  return (
    <div className="tracy-wo-field">
      <dt className="tracy-wo-muted tracy-wo-small">{t('keyMessages.title')}</dt>
      <dd>
        <p className="tracy-wo-muted tracy-wo-small">{t('keyMessages.lead')}</p>
        {draft.length === 0 ? (
          <p className="tracy-wo-muted tracy-wo-small">{t('keyMessages.none')}</p>
        ) : (
          <ol className="tracy-wo-reading-list">
            {draft.map((m, i) => (
              <li key={m.id} className="tracy-wo-reading-item">
                {editing === i ? (
                  <span className="tracy-wo-row tracy-wo-wrap">
                    <Input
                      value={text}
                      maxLength={MAX_LABEL_LENGTH}
                      aria-label={t('keyMessages.labelField')}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                    <Button type="button" size="xs" variant="link" onClick={commitEdit}>
                      {t('keyMessages.done')}
                    </Button>
                  </span>
                ) : (
                  <span className="tracy-wo-reading-label">{m.label}</span>
                )}
                {m.quotes.map((q, n) => (
                  <blockquote key={n} className="tracy-wo-reading-quote tracy-wo-small">
                    “{q}”
                  </blockquote>
                ))}
                <span className="tracy-wo-row tracy-wo-wrap tracy-wo-name-actions">
                  <Button
                    type="button"
                    size="xs"
                    variant="link"
                    disabled={busy}
                    onClick={() => {
                      setText(m.label)
                      setEditing(i)
                    }}
                  >
                    {t('keyMessages.edit')}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="link"
                    disabled={busy || i === 0}
                    onClick={() => setDraft(moveMessage(draft, i, i - 1))}
                  >
                    {t('keyMessages.up')}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="link"
                    disabled={busy || i === draft.length - 1}
                    onClick={() => setDraft(moveMessage(draft, i, i + 1))}
                  >
                    {t('keyMessages.down')}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="link"
                    disabled={busy}
                    onClick={() => {
                      setEditing(null)
                      setDraft(removeMessage(draft, i))
                    }}
                  >
                    {t('keyMessages.delete')}
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        )}
        {dirty ? (
          <span className="tracy-wo-row tracy-wo-wrap tracy-wo-name-actions">
            <Button type="button" size="xs" disabled={busy} onClick={() => void save()}>
              {t('keyMessages.save')}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="link"
              disabled={busy}
              onClick={() => {
                setDraft(messages)
                setEditing(null)
              }}
            >
              {t('keyMessages.discard')}
            </Button>
          </span>
        ) : null}
        {failed ? (
          <span className="tracy-wo-error" role="alert">
            {t('keyMessages.failed')}
          </span>
        ) : null}
      </dd>
    </div>
  )
}
