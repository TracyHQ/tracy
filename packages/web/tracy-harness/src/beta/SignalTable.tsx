import {
  Button,
  cn,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n'
import { StatisticsNote } from './StatisticsNote'
import { compareSignalRows } from './signals-data'
import { counted } from './strings'

export interface SignalColumn<Row> {
  key: string
  label: string
  help?: string
  numeric?: boolean
  accent?: string
  unaffected?: string
  value: (row: Row) => number | string | null
  sortLast?: (row: Row) => boolean
  render?: (row: Row) => ReactNode
}
/** Server mode keeps search, sorting and pagination on the full filtered dataset. */
export interface SignalRemoteTable {
  page: number
  pageSize: number
  total: number
  sort: string
  direction: 'asc' | 'desc'
  query: string
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  onSort: (key: string, direction: 'asc' | 'desc') => void
  onSearch: (query: string) => void
}
export function SignalTable<Row>({
  id,
  columns,
  rows,
  rowKey,
  defaultSort,
  search,
  loading = false,
  total,
  error,
  needsAttention,
  remote
}: {
  id: string
  columns: SignalColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  defaultSort: string
  search?: { label: string; match: (row: Row) => string }
  loading?: boolean
  total?: number
  error?: string | null
  needsAttention?: (row: Row) => boolean
  remote?: SignalRemoteTable
}) {
  const t = useT()
  const [sort, setSort] = useState({ key: defaultSort, direction: -1 })
  const [query, setQuery] = useState('')
  const readPagination = useCallback(() => {
    const params = new URLSearchParams(window.location.search)
    const size = Number(params.get(`signals_${id}_pageSize`))
    const page = Number(params.get(`signals_${id}_page`))
    return {
      pageSize: [10, 25, 50].includes(size) ? size : 10,
      page: Number.isSafeInteger(page) && page > 0 ? page : 1
    }
  }, [id])
  const [localPagination, setPagination] = useState(readPagination)
  const pagination = remote ? { page: remote.page, pageSize: remote.pageSize } : localPagination
  useEffect(() => {
    const read = () => setPagination(readPagination())
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [readPagination])
  const savePagination = (page: number, pageSize = pagination.pageSize) => {
    if (remote) {
      if (pageSize !== remote.pageSize) remote.onPageSize(pageSize)
      else remote.onPage(page)
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.set(`signals_${id}_page`, String(page))
    url.searchParams.set(`signals_${id}_pageSize`, String(pageSize))
    if (url.href !== window.location.href) window.history.pushState(null, '', url)
    setPagination({ page, pageSize })
  }
  const activeSort = remote
    ? { key: remote.sort, direction: remote.direction === 'asc' ? 1 : -1 }
    : columns.some((column) => column.key === sort.key)
      ? sort
      : { key: defaultSort, direction: -1 }
  const filtered = useMemo(
    () =>
      remote
        ? rows
        : rows.filter((row) => !search || search.match(row).toLowerCase().includes(query.toLowerCase())),
    [rows, search, query, remote]
  )
  const sorted = remote
    ? filtered
    : [...filtered].sort((a, b) => {
        const column = columns.find((candidate) => candidate.key === activeSort.key)
        if (!column) return 0
        return compareSignalRows(a, b, column, activeSort.direction)
      })
  const pageCount = Math.max(1, Math.ceil((remote?.total ?? sorted.length) / pagination.pageSize))
  const page = Math.min(pagination.page, pageCount)
  useEffect(() => {
    if (remote || loading || error) return
    const url = new URL(window.location.href)
    url.searchParams.set(`signals_${id}_page`, String(page))
    url.searchParams.set(`signals_${id}_pageSize`, String(pagination.pageSize))
    if (url.href !== window.location.href) window.history.replaceState(null, '', url)
  }, [id, page, pagination.pageSize, loading, error, remote])
  const offset = (page - 1) * pagination.pageSize
  const visible = remote ? rows : sorted.slice(offset, offset + pagination.pageSize)
  const truncated = !remote && total !== undefined && total > rows.length
  const searchLabel =
    search && (truncated ? t('beta.table.searchWithinLoaded', { label: search.label }) : search.label)
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (number) => number === 1 || number === pageCount || Math.abs(number - page) <= 2
  )
  return (
    <>
      {truncated && !loading && (
        <StatisticsNote>{t('beta.table.truncated', { count: rows.length, total })}</StatisticsNote>
      )}
      {search && (
        <div className="signals-toolbar">
          <Input
            type="search"
            placeholder={searchLabel}
            aria-label={searchLabel}
            value={remote?.query ?? query}
            onChange={(event) => {
              if (remote) remote.onSearch(event.target.value)
              else {
                setQuery(event.target.value)
                savePagination(1)
              }
            }}
          />
          <span>
            {t(
              truncated ? 'beta.table.matchingInLoaded' : 'beta.table.matching',
              counted(remote?.total ?? filtered.length)
            )}
          </span>
        </div>
      )}
      {error ? (
        <p className="signals-empty text-destructive" role="alert">
          {error}
        </p>
      ) : loading ? (
        <div className="p-4" aria-label={t('beta.table.loadingRows')}>
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          <div className="signals-table-scroll">
            <Table
              data-signal-table={id}
              data-signal-customers={id === 'customers' || undefined}
              data-signal-latest={id === 'latest' || undefined}
              data-signal-days={id === 'daily' || undefined}
            >
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn(
                        column.numeric && 'signals-numeric text-right tabular-nums',
                        column.unaffected && 'signals-unaffected signals-unaffected-column'
                      )}
                      style={
                        column.accent ? ({ '--signals-series': column.accent } as CSSProperties) : undefined
                      }
                      aria-sort={
                        activeSort.key === column.key
                          ? activeSort.direction === 1
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        title={column.help}
                        data-signal-sort={`${id}-${column.key}`}
                        onClick={() => {
                          if (remote) {
                            remote.onSort(
                              column.key,
                              activeSort.key === column.key && activeSort.direction === -1 ? 'asc' : 'desc'
                            )
                            return
                          }
                          savePagination(1)
                          setSort({
                            key: column.key,
                            direction:
                              activeSort.key === column.key
                                ? -activeSort.direction
                                : column.numeric ||
                                    column.key === 'at' ||
                                    column.key === 'firstSignInAt' ||
                                    column.key === 'day'
                                  ? -1
                                  : 1
                          })
                        }}
                      >
                        {column.accent && <i className="signals-column-dot" aria-hidden="true" />}
                        {column.label}
                        {column.unaffected && (
                          <small className="signals-scope-note">{column.unaffected}</small>
                        )}
                        <span aria-hidden="true">
                          {activeSort.key === column.key ? (activeSort.direction === 1 ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow
                    key={rowKey(row)}
                    data-signal-row={rowKey(row)}
                    className={needsAttention?.(row) ? 'signals-row-attention' : undefined}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          column.numeric && 'signals-numeric text-right tabular-nums',
                          column.unaffected && 'signals-unaffected'
                        )}
                      >
                        {column.render ? column.render(row) : column.value(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!visible.length && (
              <div className="signals-empty">
                <strong>{t(truncated ? 'beta.table.noMatchesInLoaded' : 'beta.table.noMatches')}</strong>
                <span>{t('beta.table.tryAnother')}</span>
              </div>
            )}
          </div>
          <div className="signals-table-footer">
            <span data-signal-range={id} aria-live="polite">
              {t('beta.table.range', {
                from: (remote?.total ?? sorted.length) ? offset + 1 : 0,
                to: offset + visible.length,
                total: remote?.total ?? filtered.length
              })}
              {!remote && total !== undefined && total > rows.length
                ? ` · ${t('beta.table.loadedOfTotal', { total, loaded: rows.length })}`
                : ''}
            </span>
            <label className="signals-page-size">
              {t('beta.table.rowsPerPage')}
              <select
                aria-label={t('beta.table.rowsPerPageOf', { table: id })}
                value={pagination.pageSize}
                onChange={(event) => savePagination(1, Number(event.target.value))}
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <nav
              data-signal-pagination={id}
              className="signals-pagination"
              aria-label={t('beta.table.paginationOf', { table: id })}
            >
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 1}
                onClick={() => savePagination(page - 1)}
              >
                {t('beta.table.previous')}
              </Button>
              {pageNumbers.map((number, index) => (
                <span className="signals-page-number" key={number}>
                  {index > 0 && number > pageNumbers[index - 1] + 1 && <span aria-hidden="true">…</span>}
                  <Button
                    variant={number === page ? 'outline' : 'ghost'}
                    size="sm"
                    aria-label={t('beta.table.page', { n: number })}
                    aria-current={number === page ? 'page' : undefined}
                    onClick={() => savePagination(number)}
                  >
                    {number}
                  </Button>
                </span>
              ))}
              <Button
                variant="ghost"
                size="sm"
                disabled={page === pageCount}
                onClick={() => savePagination(page + 1)}
              >
                {t('beta.table.next')}
              </Button>
            </nav>
          </div>
        </>
      )}
    </>
  )
}
