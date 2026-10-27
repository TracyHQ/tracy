import { Button, Checkbox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { ContactCell } from './cells/contact.tsx'
import { ReviewsCell } from './cells/reviews.tsx'
import { PlaceMeta, PlaceName } from './cells/place.tsx'
import { ScoreCell } from './cells/score.tsx'
import { SocialCell } from './cells/social.tsx'
import { StatusBadge } from './cells/status.tsx'
import { TypeCell } from './cells/type.tsx'
import { WebsiteCell } from './cells/website.tsx'
import { PlaceCard } from './place-card.tsx'
import { rowClickHandler, rowClickToggles } from './row-click.ts'
import type { RowClick } from './row-click.ts'
import { tableColumns, typeColumnShown } from './table-columns.ts'
import type { CardOptions, ColumnId, ExtraColumn, PlaceRow, RowActions, SortKey, Translate } from './types.ts'

export interface PlacesTableProps {
  t: Translate
  rows: PlaceRow[]
  selected: ReadonlySet<string>
  hidden: ReadonlySet<ColumnId>
  sort: SortKey
  dir: 1 | -1
  onSort(k: SortKey): void
  actions: RowActions
  extraColumns?: ExtraColumn[]
  /** The built-in columns that exist at all (default: every one); `hidden` still applies to these. */
  columns?: readonly ColumnId[]
  /** A click on a row's empty space: `toggle` its selection (default) or `open` it (`actions.onOpen`). */
  rowClick?: RowClick
  /** The row shown elsewhere (an inspector): marked `data-active`. */
  activeKey?: string | null
  /** The narrow layout's cards (`PlaceCard.options`). */
  card?: CardOptions
  /** False: built-in headers are plain labels (a list whose order the consumer fixes). Default true. */
  sortable?: boolean
  locale?: string
}

interface Column {
  sort?: SortKey
  cell(row: PlaceRow): ReactNode
}

function SortButton({
  label,
  dir,
  ariaLabel,
  onSort
}: {
  label: string
  dir: 1 | -1 | null
  ariaLabel: string
  onSort(): void
}) {
  const Icon = dir === null ? ArrowUpDownIcon : dir < 0 ? ArrowDownIcon : ArrowUpIcon
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-active={dir !== null}
      onClick={onSort}
      aria-label={ariaLabel}
    >
      {label}
      <Icon className="tracy-wo-sort-icon" aria-hidden />
    </Button>
  )
}

const ariaSort = (dir: 1 | -1 | null) => (dir === null ? 'none' : dir < 0 ? 'descending' : 'ascending')

function SortHead({
  t,
  id,
  sortKey,
  sort,
  dir,
  onSort
}: {
  t: Translate
  id: ColumnId
  sortKey: SortKey
  sort: SortKey
  dir: 1 | -1
  onSort(k: SortKey): void
}) {
  const current = sortKey === sort ? dir : null
  return (
    <TableHead className={`tracy-wo-sortable tracy-wo-c-${id}`} aria-sort={ariaSort(current)}>
      <SortButton
        label={t(`columns.${id}`)}
        dir={current}
        ariaLabel={t('results.sort.by', { sort: t(`columns.${id}`) })}
        onSort={() => onSort(sortKey)}
      />
    </TableHead>
  )
}

function ExtraHead({ t, column }: { t: Translate; column: ExtraColumn }) {
  const style = column.width ? { width: column.width } : undefined
  if (!column.sort) {
    return (
      <TableHead className={column.className} style={style}>
        {column.header}
      </TableHead>
    )
  }
  return (
    <TableHead
      className={cn('tracy-wo-sortable', column.className)}
      style={style}
      aria-sort={ariaSort(column.sort.dir)}
    >
      <SortButton
        label={column.header}
        dir={column.sort.dir}
        ariaLabel={t('results.sort.by', { sort: column.header })}
        onSort={column.sort.onSort}
      />
    </TableHead>
  )
}

/**
 * Table on a wide container; under 560px the same rows render as cards (CSS swaps them), so a
 * consumer gets the narrow layout without knowing the width. Checkbox and Place stay put when the
 * table scrolls sideways.
 */
export function PlacesTable({
  t,
  rows,
  selected,
  hidden,
  sort,
  dir,
  onSort,
  actions,
  extraColumns = [],
  columns,
  rowClick,
  activeKey = null,
  card,
  sortable = true,
  locale = 'en'
}: PlacesTableProps) {
  const BUILT_IN: Record<ColumnId, Column> = {
    type: { cell: (r) => <TypeCell t={t} row={r} /> },
    score: { sort: 'score', cell: (r) => <ScoreCell t={t} row={r} locale={locale} /> },
    web: { sort: 'web', cell: (r) => <WebsiteCell t={t} row={r} /> },
    google: { sort: 'google', cell: (r) => <ReviewsCell t={t} row={r} locale={locale} /> },
    social: { sort: 'social', cell: (r) => <SocialCell t={t} row={r} actions={actions} locale={locale} /> },
    contact: { cell: (r) => <ContactCell t={t} row={r} /> },
    status: { cell: (r) => <StatusBadge t={t} status={r.status} research={r.research} locale={locale} /> }
  }
  const slots = tableColumns({ hidden, columns, extraColumns })
  const typeShown = typeColumnShown({ hidden, columns })

  if (!rows.length) return <p className="tracy-wo-empty">{t('results.empty')}</p>

  const picked = rows.filter((r) => selected.has(r.key)).length
  const toggleAll = () => {
    const target = picked < rows.length
    for (const r of rows) if (selected.has(r.key) !== target) actions.onToggle(r.key)
  }
  const cardColumns = extraColumns.filter((c) => c.inCard !== false)
  const extraFacts = (row: PlaceRow) =>
    cardColumns.length ? (
      <dl className="tracy-wo-card-facts">
        {cardColumns.map((c) => (
          <div key={c.id} className="tracy-wo-contents">
            <dt>{c.header}</dt>
            <dd>{c.cell(row)}</dd>
          </div>
        ))}
      </dl>
    ) : null

  return (
    <>
      <div className="tracy-wo-table-wrap" data-type-hidden={!typeShown}>
        <Table className="tracy-wo-table">
          <TableHeader>
            <TableRow>
              <TableHead className="tracy-wo-c-check">
                <Checkbox
                  checked={picked > 0 && picked === rows.length}
                  indeterminate={picked > 0 && picked < rows.length}
                  onCheckedChange={toggleAll}
                  aria-label={t('results.selectAll')}
                />
              </TableHead>
              <TableHead className="tracy-wo-c-place">{t('columns.place')}</TableHead>
              {slots.map((slot) => {
                if (slot.kind === 'extra')
                  return <ExtraHead key={`x-${slot.column.id}`} t={t} column={slot.column} />
                const sortKey = sortable ? BUILT_IN[slot.id].sort : undefined
                return sortKey ? (
                  <SortHead
                    key={slot.id}
                    t={t}
                    id={slot.id}
                    sortKey={sortKey}
                    sort={sort}
                    dir={dir}
                    onSort={onSort}
                  />
                ) : (
                  <TableHead key={slot.id} className={`tracy-wo-c-${slot.id}`}>
                    {t(`columns.${slot.id}`)}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const on = selected.has(row.key)
              return (
                <TableRow
                  key={row.key}
                  data-selected={on}
                  data-state={on ? 'selected' : undefined}
                  data-active={activeKey === row.key || undefined}
                  onClick={(e) => {
                    if (rowClickToggles(e)) rowClickHandler(rowClick, row, actions)()
                  }}
                >
                  <TableCell className="tracy-wo-c-check">
                    <Checkbox
                      checked={on}
                      onCheckedChange={() => actions.onToggle(row.key)}
                      aria-label={t('results.select', { name: row.name })}
                    />
                  </TableCell>
                  <TableCell className="tracy-wo-c-place">
                    <div className="tracy-wo-cell">
                      <PlaceName t={t} row={row} actions={actions} />
                      <PlaceMeta t={t} row={row} locale={locale} subtype={typeShown ? 'never' : 'always'} />
                    </div>
                  </TableCell>
                  {slots.map((slot) =>
                    slot.kind === 'extra' ? (
                      <TableCell key={`x-${slot.column.id}`} className={slot.column.className}>
                        {slot.column.cell(row)}
                      </TableCell>
                    ) : (
                      <TableCell key={slot.id} className={`tracy-wo-c-${slot.id}`}>
                        {BUILT_IN[slot.id].cell(row)}
                      </TableCell>
                    )
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="tracy-wo-narrow-cards">
        {rows.map((row) => (
          <PlaceCard
            key={row.key}
            t={t}
            row={row}
            selected={selected.has(row.key)}
            actions={actions}
            rowClick={rowClick}
            active={activeKey === row.key}
            extra={extraFacts(row)}
            locale={locale}
            options={card}
          />
        ))}
      </div>
    </>
  )
}
