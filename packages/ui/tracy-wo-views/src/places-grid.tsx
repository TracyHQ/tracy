import type { ReactNode } from 'react'

import { PlaceCard } from './place-card.tsx'
import type { RowClick } from './row-click.ts'
import type { CardOptions, PlaceRow, RowActions, Translate } from './types.ts'

/** Cards, as many across as fit (one column in a narrow container). */
export function PlacesGrid({
  t,
  rows,
  selected,
  actions,
  extra,
  locale,
  rowClick,
  activeKey = null,
  card
}: {
  t: Translate
  rows: PlaceRow[]
  selected: ReadonlySet<string>
  actions: RowActions
  extra?(row: PlaceRow): ReactNode
  locale?: string
  rowClick?: RowClick
  activeKey?: string | null
  card?: CardOptions
}) {
  if (!rows.length) return <p className="tracy-wo-empty">{t('results.empty')}</p>
  return (
    <div className="tracy-wo-grid">
      {rows.map((row) => (
        <PlaceCard
          key={row.key}
          t={t}
          row={row}
          selected={selected.has(row.key)}
          actions={actions}
          extra={extra?.(row)}
          locale={locale}
          rowClick={rowClick}
          active={activeKey === row.key}
          options={card}
        />
      ))}
    </div>
  )
}
