import { vietnamDay } from './beta-access.js'
import { MEDIUMS } from './sign-in-source.js'

export const SIGNAL_WINDOWS = Object.freeze([7, 14, 30])
export const SOURCE_BUCKETS = Object.freeze([...MEDIUMS, 'other', 'none'])
export const SIGNAL_DAY_MS = 86_400_000
export const SIGNAL_CMS = Object.freeze(['joomla', 'wordpress', 'emdash'])
export const SIGNAL_STATUSES = Object.freeze(['built', 'stuck', 'deleted', 'pending', 'no-site'])
export const SOURCE_FILTERS = Object.freeze(['medium', 'source', 'campaign', 'content'])
const vnMidnight = (day) => new Date(`${day}T00:00:00+07:00`)

function invalid(parameter) {
  const error = new Error('INVALID_SIGNAL_FILTER')
  error.parameter = parameter
  throw error
}

function dateValue(value, parameter) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) invalid(parameter)
  const date = vnMidnight(value)
  if (!Number.isFinite(date.getTime()) || vietnamDay(date.getTime()) !== value) invalid(parameter)
  return date
}

/** Inclusive Vietnam dates become a bounded, half-open SQL interval. Legacy invalid days use 14. */
export function signalQuery(params, now = Date.now()) {
  const get = (key) => params.get(key)
  const today = vietnamDay(now)
  const preset = ['24h', 'all'].includes(get('days')) ? get('days') : null
  const asked = Number(get('days'))
  let days = SIGNAL_WINDOWS.includes(asked) ? asked : 14
  let end = vnMidnight(today)
  let start = new Date(end.getTime() - (days - 1) * SIGNAL_DAY_MS)
  const custom = get('start') !== null || get('end') !== null
  if (custom) {
    start = dateValue(get('start'), 'start')
    end = dateValue(get('end'), 'end')
    days = (end.getTime() - start.getTime()) / SIGNAL_DAY_MS + 1
    if (days < 1 || days > 366) invalid('range')
    if (end > vnMidnight(today)) invalid('end')
  }
  if (!custom && preset) {
    start = new Date(preset === '24h' ? now - SIGNAL_DAY_MS : 0)
    days = preset === '24h' ? 1 : 0
  }
  const exact = !custom && preset !== null
  const boundEnd = exact ? new Date(now) : new Date(end.getTime() + SIGNAL_DAY_MS)
  const allTime = !custom && preset === 'all'
  const previousStart = new Date(start.getTime() - days * SIGNAL_DAY_MS)
  const compare = get('compare')
  if (compare !== null && !['0', '1', 'true', 'false'].includes(compare)) invalid('compare')
  const filters = {}
  for (const key of [...SOURCE_FILTERS, 'cms', 'status']) {
    const value = get(key)
    if (value === null || value === '' || value === 'all') continue
    if (!/^[a-z0-9._-]{1,64}$/.test(value)) invalid(key)
    if (key === 'medium' && !SOURCE_BUCKETS.includes(value)) invalid(key)
    if (key === 'cms' && !SIGNAL_CMS.includes(value)) invalid(key)
    if (key === 'status' && !SIGNAL_STATUSES.includes(value)) invalid(key)
    filters[key] = value
  }
  return {
    days,
    custom,
    allTime,
    bucket: !custom && preset === '24h' ? 'hour' : 'day',
    compare: !allTime && compare !== '0' && compare !== 'false',
    filters,
    start,
    end: boundEnd,
    previousStart,
    range: {
      start: vietnamDay(start.getTime()),
      end: vietnamDay(end.getTime()),
      previousStart: vietnamDay(start.getTime() - days * SIGNAL_DAY_MS),
      previousEnd: vietnamDay(start.getTime() - SIGNAL_DAY_MS),
      timeZone: 'Asia/Ho_Chi_Minh',
      partialEnd: !exact && vietnamDay(end.getTime()) === today,
      ...(exact
        ? {
            preset,
            bucket: preset === '24h' ? 'hour' : 'day',
            startAt: allTime ? null : start.toISOString(),
            endAt: boundEnd.toISOString(),
            previousStart: allTime ? null : previousStart.toISOString(),
            previousEnd: allTime ? null : start.toISOString()
          }
        : {})
    }
  }
}

/** Resolve an unbounded preset only after reading its recorded history. Empty history stays empty. */
export function resolveSignalRange(query, timestamps, now = Date.now()) {
  if (!query.allTime) return query
  const valid = timestamps
    .filter((at) => at != null)
    .map((at) => new Date(at).getTime())
    .filter((at) => Number.isFinite(at) && at < now)
  const first = valid.reduce((earliest, at) => (earliest === null ? at : Math.min(earliest, at)), null)
  query.start = new Date(first ?? now)
  query.end = new Date(now)
  query.previousStart = query.start
  query.days =
    first === null
      ? 0
      : (vnMidnight(vietnamDay(now)).getTime() - vnMidnight(vietnamDay(first)).getTime()) / SIGNAL_DAY_MS + 1
  query.range = {
    ...query.range,
    start: first === null ? null : vietnamDay(first),
    end: vietnamDay(now),
    startAt: first === null ? null : new Date(first).toISOString(),
    endAt: new Date(now).toISOString(),
    previousStart: null,
    previousEnd: null,
    partialEnd: false
  }
  return query
}

export function signalBucket(at, query) {
  if (query.bucket !== 'hour') return vietnamDay(new Date(at).getTime())
  const start = query.start.getTime()
  return new Date(start + Math.floor((new Date(at).getTime() - start) / 3_600_000) * 3_600_000).toISOString()
}

export function signalBuckets(query) {
  const buckets = []
  if (query.start >= query.end) return buckets
  const first =
    query.bucket === 'hour' ? query.start.getTime() : vnMidnight(vietnamDay(query.start.getTime())).getTime()
  const step = query.bucket === 'hour' ? 3_600_000 : SIGNAL_DAY_MS
  for (let at = first; at < query.end.getTime(); at += step) buckets.push(signalBucket(at, query))
  return buckets
}

export const sourceBucket = (source) => {
  const medium = typeof source?.medium === 'string' ? source.medium : null
  return !medium ? 'none' : SOURCE_BUCKETS.includes(medium) ? medium : 'other'
}

/** Attribution is a first-sign-in property, never a site's acquisition source. */
export function matchesSignalSource(source, filters, keys = SOURCE_FILTERS) {
  return keys.every((key) => {
    if (!filters[key]) return true
    const value = key === 'medium' ? sourceBucket(source) : source?.[key] || 'none'
    return value === filters[key]
  })
}

export function signalFilterOptions(rows, filters = {}) {
  const options = Object.fromEntries(SOURCE_FILTERS.map((key) => [key, new Set()]))
  for (const row of rows) {
    if (row.kind !== 'account.first_sign_in') continue
    for (const key of SOURCE_FILTERS)
      options[key].add(key === 'medium' ? sourceBucket(row.data?.source) : row.data?.source?.[key] || 'none')
  }
  for (const key of SOURCE_FILTERS) if (filters[key]) options[key].add(filters[key])
  return {
    ...Object.fromEntries(SOURCE_FILTERS.map((key) => [key, [...options[key]].sort()])),
    medium: [...SOURCE_BUCKETS],
    cms: [...SIGNAL_CMS],
    status: [...SIGNAL_STATUSES]
  }
}

/** Both predicates must match the same site. Lifetime values and the full site list stay intact. */
export function matchesCustomerSites(sites, filters) {
  if (filters.status === 'no-site') return sites.length === 0 && !filters.cms
  if (!filters.cms && !filters.status) return true
  return sites.some(
    (site) =>
      (!filters.cms || site.platform === filters.cms) && (!filters.status || site.state === filters.status)
  )
}
