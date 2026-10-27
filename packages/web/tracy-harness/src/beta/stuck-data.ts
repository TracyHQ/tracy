import { formatNumber, formatWith } from '../i18n/format.ts'
import type { T } from '../i18n'
import type { Stuck, StuckActivity, StuckEpisode, StuckSite } from './api'

// strings.ts's twin: this file stays loadable by plain node (tests), so it imports no runtime i18n.
const counted = (count: number) => ({ count, n: formatNumber(count) })

export const STUCK_DEFAULTS = {
  days: '30',
  start: '',
  end: '',
  cms: '',
  operation: '',
  step: '',
  reason: '',
  view: 'open',
  compare: true
}
export type StuckFilters = typeof STUCK_DEFAULTS
export const stuckDay = (at: string | number) =>
  new Date(new Date(at).getTime() + 7 * 3600000).toISOString().slice(0, 10)
export const stuckExact = (at: string) =>
  formatWith(at, { dateStyle: 'medium', timeStyle: 'long', timeZone: 'Asia/Ho_Chi_Minh' })
const OPERATION_KEYS: Record<string, string> = {
  build: 'beta.stuck.operation.build',
  import: 'beta.stuck.operation.import'
}
export const stuckOperation = (t: T, row: { operation: string }) =>
  t(OPERATION_KEYS[row.operation] || 'beta.common.notRecorded')
export const stuckCms = (t: T, cms: string | null) =>
  ({ joomla: 'Joomla', wordpress: 'WordPress', emdash: 'EmDash' })[cms || ''] || t('beta.common.notRecorded')
/** Step codes the setup reports; an unknown code is "Other setup step". */
export const STUCK_STEPS: Record<string, string> = {
  signing_in: 'beta.stuck.step.signingIn',
  reading_content: 'beta.stuck.step.readingContent',
  reading_files: 'beta.stuck.step.readingFiles',
  handing_over: 'beta.stuck.step.handingOver',
  installing: 'beta.stuck.step.installing',
  build: 'beta.stuck.step.build',
  import: 'beta.stuck.step.import',
  activate: 'beta.stuck.step.activate',
  downloading: 'beta.stuck.step.downloading',
  extracting: 'beta.stuck.step.extracting',
  connecting: 'beta.stuck.step.connecting',
  validating: 'beta.stuck.step.validating',
  restoring: 'beta.stuck.step.restoring'
}
export const stuckStep = (t: T, step: string | null) =>
  t(
    !step || step === 'unknown' ? 'beta.stuck.step.notRecorded' : STUCK_STEPS[step] || 'beta.stuck.step.other'
  )
/** Reason codes the setup reports; an unknown code is "Other reported problem". */
export const STUCK_REASONS: Record<string, string> = {
  admin_gate: 'beta.stuck.reason.adminGate',
  cowork_not_answering: 'beta.stuck.reason.coworkNotAnswering',
  invalid_credential: 'beta.stuck.reason.invalidCredential',
  unexpected: 'beta.stuck.reason.unexpected',
  call_failed: 'beta.stuck.reason.callFailed',
  unreachable: 'beta.stuck.reason.unreachable',
  SITE_BUILD_FAILED: 'beta.stuck.reason.siteBuildFailed',
  QUICKSTART_UNREACHABLE: 'beta.stuck.reason.quickstartUnreachable',
  IMPORT_FAILED: 'beta.stuck.reason.importFailed',
  timeout: 'beta.stuck.reason.timeout',
  TIMEOUT: 'beta.stuck.reason.timeout',
  network_error: 'beta.stuck.reason.networkError',
  unauthorized: 'beta.stuck.reason.unauthorized'
}
export const stuckReason = (t: T, reason: string | null) =>
  t(
    STUCK_REASONS[reason || ''] ||
      (reason && reason !== 'unknown' ? 'beta.stuck.reason.other' : 'beta.stuck.reason.notRecorded')
  )
/** Open cases split into new-site builds and imports. */
export function stuckSplit(t: T, rows: { operation: string }[]) {
  const imports = rows.filter((r) => r.operation === 'import').length
  const builds = rows.filter((r) => r.operation === 'build').length
  const unknown = rows.length - imports - builds
  const parts = [
    t('beta.stuck.split.builds', counted(builds)),
    t('beta.stuck.split.imports', counted(imports))
  ]
  if (unknown) parts.push(t('beta.stuck.split.unclassified', counted(unknown)))
  return parts.join(' · ')
}
export function readStuckFilters(params = new URLSearchParams(window.location.search)): StuckFilters {
  const filters = { ...STUCK_DEFAULTS }
  for (const key of ['cms', 'operation', 'step', 'reason', 'start', 'end'] as const)
    filters[key] = params.get(key) || ''
  filters.days =
    params.has('start') || params.has('end')
      ? 'custom'
      : ['24h', '1', '7', '30', 'all', 'custom'].includes(params.get('days') || '')
        ? params.get('days')!
        : '30'
  filters.view = params.get('view') === 'closed' ? 'closed' : 'open'
  filters.compare = params.get('compare') !== '0'
  return filters
}
export function saveStuckFilters(filters: StuckFilters) {
  const url = new URL(window.location.href)
  for (const key of Object.keys(STUCK_DEFAULTS) as (keyof StuckFilters)[]) {
    const value = filters[key]
    if (key === 'compare') url.searchParams.set(key, value ? '1' : '0')
    else if (value !== '' && !(key === 'days' && filters.days === 'custom'))
      url.searchParams.set(key, String(value))
    else url.searchParams.delete(key)
  }
  for (const key of url.searchParams.keys())
    if (key.startsWith('signals_stuck-') && key.endsWith('_page')) url.searchParams.set(key, '1')
  if (url.href !== window.location.href) window.history.pushState(null, '', url)
}
function validDay(day: string) {
  const at = Date.parse(`${day}T00:00:00Z`)
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === day
  )
}
export function stuckRange(filters: StuckFilters, readAt: string) {
  const today = stuckDay(readAt)
  const endDay = filters.days === 'custom' ? filters.end : today
  const hourly = filters.days === '24h'
  const end =
    hourly || filters.days === 'all'
      ? Date.parse(readAt)
      : new Date(`${endDay || today}T00:00:00+07:00`).getTime() + 86400000
  const start =
    filters.days === 'all'
      ? null
      : filters.days === 'custom'
        ? Date.parse(`${filters.start}T00:00:00+07:00`)
        : end - (hourly ? 1 : Number(filters.days)) * 86400000
  const error =
    filters.days === 'custom' &&
    (!validDay(filters.start) ||
      !validDay(filters.end) ||
      !Number.isFinite(start) ||
      filters.start > filters.end ||
      endDay > today ||
      end - (start || 0) > 366 * 86400000)
      ? ('invalid-dates' as const)
      : null
  return {
    start,
    end,
    error,
    partial: !hourly && end > Date.parse(readAt),
    bucket: hourly ? 'hour' : 'day'
  }
}
/** The selected period, worded for the filter bar. */
export function stuckRangeLabel(t: T, filters: StuckFilters, readAt: string) {
  const { start } = stuckRange(filters, readAt)
  const today = stuckDay(readAt)
  const endDay = (filters.days === 'custom' ? filters.end : today) || today
  if (filters.days === '24h')
    return t('beta.stuck.range.last24h', {
      start: stuckExact(new Date(start!).toISOString()),
      end: stuckExact(readAt)
    })
  if (start === null) return t('beta.stuck.range.allTime', { end: endDay })
  return t('beta.stuck.range.between', {
    start: stuckDay(Number.isFinite(start) ? start : Date.parse(readAt)),
    end: endDay
  })
}
type Classification = {
  platform: string | null
  operation: string
  step: string | null
  reason: string | null
}
export function matchesStuck(row: Classification, filters: StuckFilters, detail = true) {
  return (
    (!filters.cms || (row.platform || 'unknown') === filters.cms) &&
    (!filters.operation || row.operation === filters.operation) &&
    (!detail ||
      ((!filters.step || (row.step || 'unknown') === filters.step) &&
        (!filters.reason || (row.reason || 'unknown') === filters.reason)))
  )
}
const within = (at: string, start: number | null, end: number) =>
  (start === null || Date.parse(at) >= start) && Date.parse(at) < end
const median = (values: number[]) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
export interface StuckDaily {
  day: string
  failed: number
  active: number
  rate: number | null
  recovered: number
  medianHours: number | null
}
function historySummary(
  episodes: StuckEpisode[],
  activity: StuckActivity[],
  filters: StuckFilters,
  start: number | null,
  end: number
) {
  const activeRows = activity.filter((row) => matchesStuck(row, filters, false) && within(row.at, start, end))
  const failedRows = activeRows.filter((row) => row.kind === 'failed' && matchesStuck(row, filters))
  const recovered = episodes.filter(
    (row) => matchesStuck(row, filters) && row.closed?.how === 'built' && within(row.closed.at, start, end)
  )
  const durations = recovered
    .map((row) => (Date.parse(row.closed!.at) - Date.parse(row.firstAt)) / 3600000)
    .filter((value) => value >= 0 && Number.isFinite(value))
  const active = new Set(activeRows.map((row) => row.lifetimeKey || row.siteKey)).size
  const failed = new Set(failedRows.map((row) => row.lifetimeKey || row.siteKey)).size
  return {
    active,
    failed,
    rate: active ? (failed / active) * 100 : null,
    recovered: recovered.length,
    medianHours: median(durations),
    measured: durations.length
  }
}
export function buildStuckView(body: Stuck, filters: StuckFilters) {
  const range = stuckRange(filters, body.readAt)
  const sites = (body.sites || [...body.open, ...body.handledToday]).filter((row) =>
    matchesStuck(row, filters)
  )
  const open = sites.filter((row) => row.open)
  const closed = sites.filter(
    (row) => !row.open && row.closed && !range.error && within(row.closed.at, range.start, range.end)
  )
  const people = new Set(open.map((row) => row.email?.toLowerCase()).filter(Boolean)).size
  const repeat = open.filter((row) => row.times > 1)
  const oldest = [...open].sort((a, b) => a.firstAt.localeCompare(b.firstAt))[0] || null
  const now = Date.parse(body.readAt)
  const waitingOverDay = open.filter((row) => now - Date.parse(row.firstAt) >= 86400000).length
  let history:
    | (ReturnType<typeof historySummary> & {
        previous: ReturnType<typeof historySummary> | null
        daily: StuckDaily[]
        previousDaily: StuckDaily[]
      })
    | null = null
  if (!range.error) {
    const { episodes, activity } = body.history
    const start =
      range.start ??
      Math.min(
        now,
        ...activity.map((row) => Date.parse(row.at)),
        ...episodes.map((row) => Date.parse(row.firstAt))
      )
    const daily = (from: number, to: number): StuckDaily[] => {
      const values: StuckDaily[] = []
      const hourly = range.bucket === 'hour'
      const step = hourly ? 3600000 : 86400000
      // Rolling hour buckets use the exact period start; day buckets follow UTC+7.
      for (let at = hourly ? from : Date.parse(`${stuckDay(from)}T00:00:00+07:00`); at < to; at += step) {
        const summary = historySummary(
          episodes,
          activity,
          filters,
          Math.max(from, at),
          Math.min(to, at + step)
        )
        values.push({
          day: hourly ? new Date(at).toISOString() : stuckDay(at),
          ...summary,
          rate: summary.rate
        })
      }
      return values
    }
    const priorStart = start - (range.end - start)
    history = {
      ...historySummary(episodes, activity, filters, range.start, range.end),
      previous: range.start === null ? null : historySummary(episodes, activity, filters, priorStart, start),
      daily: range.start === null && !activity.length && !episodes.length ? [] : daily(start, range.end),
      previousDaily: range.start === null ? [] : daily(priorStart, start)
    }
  }
  return { open, closed, people, repeat, oldest, waitingOverDay, range, history }
}
export function stuckBreakdown(t: T, rows: StuckSite[], group: 'cms' | 'step' | 'reason') {
  const grouped = new Map<
    string,
    { key: string; label: string; sites: number; people: Set<string>; failures: number; repeated: number }
  >()
  for (const row of rows) {
    const key = (group === 'cms' ? row.platform : row[group]) || 'unknown'
    const value = grouped.get(key) || {
      key,
      label: group === 'cms' ? stuckCms(t, key) : group === 'step' ? stuckStep(t, key) : stuckReason(t, key),
      sites: 0,
      people: new Set<string>(),
      failures: 0,
      repeated: 0
    }
    value.sites++
    value.failures += row.times
    value.repeated += Number(row.times > 1)
    if (row.email) value.people.add(row.email.toLowerCase())
    grouped.set(key, value)
  }
  return [...grouped.values()].map((row) => ({ ...row, people: row.people.size }))
}
export const stuckDuration = (t: T, hours: number | null) =>
  hours === null
    ? t('beta.common.notRecorded')
    : hours < 1
      ? t('beta.stuck.duration.minutes', { n: Math.round(hours * 60) })
      : hours < 48
        ? t('beta.stuck.duration.hours', { n: Math.round(hours * 10) / 10 })
        : t('beta.stuck.duration.days', { n: Math.round((hours / 24) * 10) / 10 })
