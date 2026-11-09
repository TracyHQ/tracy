/**
 * The Business brief table of Details (#517): Fact · Value · Source · On the site, one row per fact the brief states,
 * in the words a seller uses (`business-brief-model.ts`). The switch asks the server to keep the person's choice for
 * that one fact; the rule's reason shows under the value when the site leaves it out.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Switch } from '@tracy/ui'

import type { BriefRow } from './business-brief-model.ts'
import type { Translate } from './strings.ts'

export function BusinessBriefTable({
  t,
  rows,
  firstRow = null,
  onToggle
}: {
  t: Translate
  rows: BriefRow[]
  /** A row drawn before the facts: Site name on Tracy (#519), shown even before research has run. */
  firstRow?: ReactNode
  /** Resolves true once the choice is saved and the page read again. */
  onToggle: (id: string, onSite: boolean | null) => Promise<boolean>
}): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  if (rows.length === 0 && firstRow === null) return <p className="tracy-wo-muted">{t('brief.table.none')}</p>
  const choose = async (row: BriefRow, onSite: boolean): Promise<void> => {
    if (busy !== null) return
    setBusy(row.id)
    setFailed(null)
    const ok = await onToggle(row.id, onSite)
    setBusy(null)
    if (!ok) setFailed(row.id)
  }
  return (
    <div className="tracy-wo-brief-table-wrap">
      <table className="tracy-wo-brief-table">
        <thead>
          <tr>
            <th scope="col">{t('brief.table.fact')}</th>
            <th scope="col">{t('brief.table.value')}</th>
            <th scope="col">{t('brief.table.source')}</th>
            <th scope="col">{t('brief.table.onSite')}</th>
          </tr>
        </thead>
        <tbody>
          {firstRow}
          {rows.map((row) => (
            <tr key={row.id} data-off={row.onSite ? undefined : 'true'}>
              <th scope="row">{row.label}</th>
              <td>
                <span>{row.value}</span>
                {row.notes.map((note) => (
                  <span key={note} className="tracy-wo-brief-note">
                    {note}
                  </span>
                ))}
                {failed === row.id ? (
                  <span className="tracy-wo-error" role="alert">
                    {t('facts.failed')}
                  </span>
                ) : null}
              </td>
              <td className="tracy-wo-muted">
                {row.source}
                {row.ownerChoice ? (
                  <span className="tracy-wo-brief-note">{t('facts.yourChoice')}</span>
                ) : null}
              </td>
              <td>
                <Switch
                  checked={row.onSite}
                  disabled={busy !== null}
                  aria-label={`${t('brief.table.onSite')}: ${row.label}`}
                  onCheckedChange={(on) => void choose(row, on)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="tracy-wo-muted">{t('brief.table.none')}</p> : null}
    </div>
  )
}
