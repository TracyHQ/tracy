/**
 * "What the site may say" on the Details Profile card (#1791): one row per fact the brief states, with how sure Tracy
 * is as a small quiet label, and one control per fact that switches it on or off for the site. A fact held back by rule
 * says why in plain words. The owner's choice wins and survives Research again; nothing blocks the build.
 */
import { type JSX, useState } from 'react'
import { Button } from '@tracy/ui'

import { FIELD_KEYS, type FactRowView, reasonKeys, spelledField } from './profile-facts-model.ts'
import type { Translate } from './strings.ts'

export function ProfileFactsRows({
  t,
  rows,
  onToggle
}: {
  t: Translate
  rows: FactRowView[]
  /** Resolves true once the choice is saved and the page read again (owner override of one fact). */
  onToggle: (id: string, onSite: boolean | null) => Promise<boolean>
}): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  /** `null` clears the owner's choice so the rule decides again. */
  const choose = async (row: FactRowView, onSite: boolean | null): Promise<void> => {
    if (busy !== null) return
    setBusy(row.id)
    setFailed(null)
    const ok = await onToggle(row.id, onSite)
    setBusy(null)
    if (!ok) setFailed(row.id)
  }
  return (
    <div className="tracy-wo-field">
      <dt className="tracy-wo-muted tracy-wo-small">{t('facts.title')}</dt>
      <dd>
        <p className="tracy-wo-muted tracy-wo-small">{t('facts.lead')}</p>
        <ul className="tracy-wo-reading-list">
          {rows.map((row) => (
            <li
              key={row.id}
              className="tracy-wo-reading-item tracy-wo-fact"
              data-off={row.onSite ? undefined : 'true'}
              data-confidence={row.confidence}
            >
              <span className="tracy-wo-row tracy-wo-wrap">
                {row.field === null ? null : (
                  <span className="tracy-wo-muted tracy-wo-small tracy-wo-fact-field">
                    {(FIELD_KEYS as readonly string[]).includes(row.field)
                      ? t(`field.${row.field}`)
                      : spelledField(row.field)}
                  </span>
                )}
                {row.label === '' ? null : <span className="tracy-wo-reading-label">{row.label}</span>}
                <span className="tracy-wo-muted tracy-wo-small tracy-wo-fact-confidence">
                  {t(`facts.confidence.${row.confidence}`)}
                </span>
              </span>
              {reasonKeys(row).map((key) => (
                <span key={key} className="tracy-wo-muted tracy-wo-small">
                  {t(key)}
                </span>
              ))}
              <span className="tracy-wo-row tracy-wo-wrap tracy-wo-name-actions">
                <span className="tracy-wo-small" role="status">
                  {t(row.onSite ? 'facts.on' : 'facts.off')}
                  {row.decidedBy === 'owner' ? (
                    <span className="tracy-wo-muted">{` · ${t('facts.yourChoice')}`}</span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="link"
                  disabled={busy !== null}
                  aria-pressed={row.onSite}
                  onClick={() => void choose(row, !row.onSite)}
                >
                  {t(row.onSite ? 'facts.leave' : 'facts.show')}
                </Button>
                {row.decidedBy === 'owner' ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="link"
                    disabled={busy !== null}
                    onClick={() => void choose(row, null)}
                  >
                    {t('facts.reset')}
                  </Button>
                ) : null}
              </span>
              {failed === row.id ? (
                <span className="tracy-wo-error" role="alert">
                  {t('facts.failed')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  )
}
