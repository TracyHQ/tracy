import { formatNumber as formatLocalNumber, formatWith } from '../i18n/format.ts'
import type { T as Translate } from '../i18n'
import type { Answer, Customers, Day, Signals } from './api'

export const FILTER_KEYS = ['medium', 'source', 'campaign', 'content', 'cms', 'status'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]
export type SignalFilters = Record<FilterKey, string> & {
  days: string
  start: string
  end: string
  compare: boolean
}
export interface SignalReport extends Signals {
  previousByDay: Day[]
  range: {
    start: string | null
    end: string
    previousStart: string | null
    previousEnd: string | null
    partialEnd: boolean
    bucket?: 'hour' | 'day'
    preset?: string
    startAt?: string | null
    endAt?: string
  }
  filterOptions: Record<FilterKey, string[]>
  latestTotal: number
  latestLimit: number
  totals: Signals['totals'] & { failureEvents: number }
}
export const DEFAULT_FILTERS: SignalFilters = {
  days: '14',
  start: '',
  end: '',
  compare: true,
  medium: '',
  source: '',
  campaign: '',
  content: '',
  cms: '',
  status: ''
}
export function readFilters(): SignalFilters {
  const query = new URLSearchParams(window.location.search)
  const result = { ...DEFAULT_FILTERS }
  for (const key of FILTER_KEYS) result[key] = query.get(key) ?? ''
  result.start = query.get('start') ?? ''
  result.end = query.get('end') ?? ''
  result.days = query.has('start') || query.has('end') ? 'custom' : query.get('days') || '14'
  result.compare = !['0', 'false'].includes(query.get('compare') ?? '')
  return result
}
export function filterQuery(filters: SignalFilters) {
  const query = new URLSearchParams()
  if (filters.days === 'custom') {
    query.set('start', filters.start)
    query.set('end', filters.end)
  } else query.set('days', filters.days)
  query.set('compare', String(filters.compare))
  for (const key of FILTER_KEYS) if (filters[key]) query.set(key, filters[key])
  return query
}
export function saveFilters(filters: SignalFilters) {
  const url = new URL(window.location.href)
  const query = filterQuery(filters)
  for (const key of [...FILTER_KEYS, 'days', 'start', 'end', 'compare']) {
    if (!query.has(key)) url.searchParams.delete(key)
  }
  for (const [key, value] of query) url.searchParams.set(key, value)
  for (const id of ['daily', 'customers', 'latest']) url.searchParams.set(`signals_${id}_page`, '1')
  if (url.href !== window.location.href) window.history.pushState(null, '', url)
}
const FILTER_PARAMETER_KEYS: Record<string, string> = {
  medium: 'beta.filters.channel',
  source: 'beta.filters.source',
  campaign: 'beta.filters.campaign',
  content: 'beta.filters.content',
  cms: 'beta.filters.cms',
  status: 'beta.filters.status'
}
const INVALID_FILTER = 'INVALID_SIGNAL_FILTER:'
/** A failed read's status for the screen: the door's INVALID_SIGNAL_FILTER worded by its parameter, else as is. */
export function readStatusText(t: Translate, status: string): string {
  if (!status.startsWith(INVALID_FILTER)) return status
  const parameter = status.slice(INVALID_FILTER.length)
  if (parameter === 'range') return t('beta.filters.invalidRange')
  if (parameter === 'end') return t('beta.filters.invalidEnd')
  if (parameter === 'start') return t('beta.filters.invalidStart')
  const name = parameter
    ? FILTER_PARAMETER_KEYS[parameter]
      ? t(FILTER_PARAMETER_KEYS[parameter])
      : parameter
    : ''
  return name ? t('beta.filters.invalidNamed', { name }) : t('beta.filters.invalid')
}
async function read<T>(path: string, signal: AbortSignal): Promise<Answer<T>> {
  try {
    const response = await fetch(path, {
      signal,
      headers: { accept: 'application/json' },
      redirect: 'manual'
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: string; parameter?: string } | null
      if (body?.code === 'INVALID_SIGNAL_FILTER') {
        return { ok: false, status: `${INVALID_FILTER}${body.parameter ?? ''}` }
      }
      return { ok: false, status: `HTTP ${response.status || 'redirect'}` }
    }
    return { ok: true, body: (await response.json()) as T }
  } catch (error) {
    return { ok: false, status: error instanceof Error ? error.message : String(error) }
  }
}
export function readSignalReports(filters: SignalFilters, signal: AbortSignal) {
  const query = filterQuery(filters)
  return Promise.all([
    read<SignalReport>(`/api/ops/beta/signals?${query}`, signal),
    read<Customers>(`/api/ops/beta/customers?${query}`, signal)
  ])
}
export const formatNumber = (value: number) => formatLocalNumber(value)
/** Today's date in the UTC+7 calendar as `YYYY-MM-DD`; a value for date inputs, never shown, so it ignores the language. */
export const vnToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
/** `missing` is what a null day shows (callers pass their worded "Not recorded"). */
export const shortDay = (day: string | null, missing = '—') => {
  if (day === null) return missing
  if (day.includes('T'))
    return formatWith(day, {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`
}
export function totalSites(day: Day) {
  return day.created + day.imported
}

export function compareSignalRows<Row>(
  a: Row,
  b: Row,
  column: {
    value: (row: Row) => number | string | null
    sortLast?: (row: Row) => boolean
  },
  direction: number
): number {
  const lastA = Boolean(column.sortLast?.(a)),
    lastB = Boolean(column.sortLast?.(b))
  if (lastA || lastB) return lastA === lastB ? 0 : lastA ? 1 : -1
  const left = column.value(a),
    right = column.value(b)
  if (left === null || right === null) return left === null ? (right === null ? 0 : 1) : -1
  return (
    (typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'en', { numeric: true })) * direction
  )
}
