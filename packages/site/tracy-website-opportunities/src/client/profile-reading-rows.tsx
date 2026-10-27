/**
 * "Services" (or "What it offers"), "Who it is for", "Team" and "Service area" on the Details Profile card (#1780): what the research read
 * from the business's bio, posts and reviews. Each item says where it is from; opening it shows the quote it stands on.
 * Remove takes an item off the site; a person named only in reviews stays off the site until Show on the site. Nothing
 * here blocks the build.
 */
import { type JSX, useState } from 'react'
import { Button } from '@tracy/ui'

import {
  type ReadingItemView,
  type ReadingPick,
  type ReadingRowsView,
  readingActions
} from './profile-reading-model.ts'
import type { Translate } from './strings.ts'

const ACTION_KEY: Record<ReadingPick, string> = {
  remove: 'reading.remove',
  restore: 'reading.restore',
  show: 'reading.show',
  hide: 'reading.hide'
}

function Item({
  t,
  item,
  busy,
  onPick
}: {
  t: Translate
  item: ReadingItemView
  busy: boolean
  onPick: (id: string, pick: ReadingPick) => void
}): JSX.Element {
  const off = item.removed || (item.reviewsOnly && !item.onSite)
  return (
    <li className="tracy-wo-reading-item" data-off={off ? 'true' : undefined}>
      <details>
        <summary>
          <span className={item.removed ? 'tracy-wo-reading-label is-removed' : 'tracy-wo-reading-label'}>
            {item.label}
            {item.role !== null ? <span className="tracy-wo-muted"> · {item.role}</span> : null}
          </span>
          <span className="tracy-wo-muted tracy-wo-small"> · {t(`reading.from.${item.from}`)}</span>
        </summary>
        <blockquote className="tracy-wo-reading-quote tracy-wo-small">“{item.quote}”</blockquote>
        {item.url !== null ? (
          <a
            className="tracy-wo-action-link tracy-wo-small"
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('reading.openPost')}
          </a>
        ) : null}
      </details>
      {item.removed ? (
        <span className="tracy-wo-muted tracy-wo-small">{t('reading.removed')}</span>
      ) : item.reviewsOnly && !item.onSite ? (
        <span className="tracy-wo-muted tracy-wo-small">{t('reading.reviewsOnly')}</span>
      ) : null}
      <span className="tracy-wo-row tracy-wo-wrap tracy-wo-name-actions">
        {readingActions(item).map((pick) => (
          <Button
            key={pick}
            type="button"
            size="xs"
            variant="link"
            disabled={busy}
            onClick={() => onPick(item.id, pick)}
          >
            {t(ACTION_KEY[pick])}
          </Button>
        ))}
      </span>
    </li>
  )
}

export function ProfileReadingRows({
  t,
  view,
  onPick
}: {
  t: Translate
  view: ReadingRowsView
  /** Resolves true once the pick is saved and the page read again (`PUT …/:id/reading`). */
  onPick: (id: string, pick: ReadingPick) => Promise<boolean>
}): JSX.Element {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const pick = async (id: string, choice: ReadingPick): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onPick(id, choice)
    setBusy(false)
    setFailed(!ok)
  }
  const rows: [string, ReadingItemView[]][] = [
    [view.servicesLabel === 'offerings' ? 'field.offerings' : 'field.services', view.services],
    ['field.audience', view.audience],
    ['field.team', view.team],
    ['field.serviceAreas', view.serviceAreas]
  ]
  const shown = rows.filter(([, items]) => items.length > 0)
  return (
    <>
      {shown.map(([key, items], n) => (
        <div key={key} className="tracy-wo-field">
          <dt className="tracy-wo-muted tracy-wo-small">{t(key)}</dt>
          <dd>
            <ul className="tracy-wo-reading-list">
              {items.map((item) => (
                <Item key={item.id} t={t} item={item} busy={busy} onPick={(id, p) => void pick(id, p)} />
              ))}
            </ul>
            {n === 0 && view.rules ? (
              <span className="tracy-wo-muted tracy-wo-small">{t('reading.rules')}</span>
            ) : null}
            {failed && n === shown.length - 1 ? (
              <span className="tracy-wo-error" role="alert">
                {t('reading.failed')}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </>
  )
}
