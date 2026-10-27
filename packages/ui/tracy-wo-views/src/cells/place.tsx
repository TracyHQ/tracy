import { ExternalLinkIcon } from 'lucide-react'

import { formatDistance } from '../model.ts'
import type { PlaceRow, RowActions, Translate } from '../types.ts'
import { typeLabel } from './type.tsx'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** The place's name, a link to its map page (or `onOpen` when there is none). */
export function PlaceName({ t, row, actions }: { t: Translate; row: PlaceRow; actions: RowActions }) {
  const label = row.branch ? `${row.name} · ${row.branch}` : row.name
  if (row.mapsUrl) {
    return (
      <a
        className="tracy-wo-place-name"
        href={row.mapsUrl}
        target="_blank"
        rel="noreferrer"
        title={t('cell.place.openMap')}
      >
        {label}
        <ExternalLinkIcon className="size-3" aria-hidden />
      </a>
    )
  }
  if (actions.onOpen) {
    const open = actions.onOpen
    return (
      <button type="button" className="tracy-wo-place-name" onClick={() => open(row)}>
        {label}
      </button>
    )
  }
  return <span className="tracy-wo-place-name">{label}</span>
}

/**
 * "Vietnamese · 0.4 km · Open · $". `subtype`: whether the type leads the line (`table` = only while
 * the Type column is hidden, which CSS decides); `rating` adds ★ and reviews (the map card).
 */
export function PlaceMeta({
  t,
  row,
  locale = 'en',
  subtype
}: {
  t: Translate
  row: PlaceRow
  locale?: string
  subtype: 'always' | 'table' | 'never'
}) {
  const type = typeLabel(t, row)
  const parts: React.ReactNode[] = []
  if (isNum(row.distanceM)) parts.push(formatDistance(row.distanceM, locale))
  if (row.temporarilyClosed)
    parts.push(<span className="tracy-wo-closed">{t('cell.place.temporarilyClosed')}</span>)
  else if (row.openNow === true) parts.push(<span className="tracy-wo-open">{t('cell.place.open')}</span>)
  else if (row.openNow === false)
    parts.push(<span className="tracy-wo-closed">{t('cell.place.closed')}</span>)
  if (isNum(row.priceLevel) && row.priceLevel > 0) parts.push('$'.repeat(row.priceLevel))
  if (row.chain || row.chainSuspect) parts.push(t('cell.place.chain'))
  return (
    <span className="tracy-wo-small tracy-wo-muted">
      {type && subtype !== 'never' ? (
        <span className={subtype === 'table' ? 'tracy-wo-subtype' : undefined}>
          {type}
          {parts.length ? ' · ' : ''}
        </span>
      ) : null}
      {parts.map((p, i) => (
        <span key={i}>
          {i ? ' · ' : ''}
          {p}
        </span>
      ))}
    </span>
  )
}
