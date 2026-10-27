import { vietnamDay } from './beta-access.js'
import { groupBy, siteChronology } from './ops-signal-customer-sites.js'
import { signalQuery } from './ops-signal-query.js'

/** The queue keeps open cases visible; these validated dates select its historical controls. */
export function stuckQuery(params, now = Date.now()) {
  const dates = new URLSearchParams(params)
  const days = dates.get('days') || '30'
  if (!['24h', '1', '7', '30', 'all'].includes(days)) {
    const error = new Error('INVALID_SIGNAL_FILTER')
    error.parameter = 'days'
    throw error
  }
  dates.set('days', days)
  if (days === '1' && !dates.has('start') && !dates.has('end')) {
    dates.set('start', vietnamDay(now))
    dates.set('end', vietnamDay(now))
  }
  return signalQuery(dates, now)
}

const IMPORT_STEPS = new Set([
  'import',
  'signing_in',
  'installing',
  'reading_content',
  'reading_files',
  'handing_over'
])
const KINDS = [
  'site.create',
  'site.import',
  'site.stuck',
  'site.result',
  'site.delete',
  'ops.handled',
  'ops.reopened'
]
const iso = (value) => (value ? new Date(value).toISOString() : null)

/** Older failures have a stage but no operation field. Unknown values remain unknown. */
export function stuckOperation(data, start = null) {
  if (start?.kind === 'site.import') return 'import'
  if (start?.kind === 'site.create') return 'build'
  if (data?.operation === 'import' || data?.operation === 'build') return data.operation
  if (IMPORT_STEPS.has(data?.step)) return 'import'
  if (data?.step === 'build') return 'build'
  return 'unknown'
}

/** A generic terminal "build" step is shared by imports. Require actual lifetime evidence. */
function recoveryContext(events, start) {
  const only = (values) => {
    const unique = [...new Set(values.filter(Boolean))]
    return unique.length === 1 ? unique[0] : null
  }
  const failures = events.filter((row) => row.kind === 'site.stuck')
  const operation = stuckOperation({}, start)
  return {
    operation:
      operation !== 'unknown'
        ? operation
        : (only(
            failures.map((row) => {
              const kind = stuckOperation(row.data)
              return kind === 'unknown' ? null : kind
            })
          ) ?? 'unknown'),
    platform: start?.data?.platform ?? only(failures.map((row) => row.data?.platform))
  }
}

/** One site's failures, oldest first. Handling closes a case; it does not prove recovery. */
export function stuckState(events, episodes = []) {
  let state = null
  let start = null
  for (const e of events) {
    const at = new Date(e.occurred_at)
    if (e.kind === 'site.create' || e.kind === 'site.import') {
      start = e
      continue
    }
    if (e.kind === 'site.stuck') {
      if (!state || !state.open) {
        state = { open: true, times: 0, firstAt: at, last: null, closed: null }
        episodes.push(state)
      }
      state.times += 1
      state.last = {
        at,
        operation: stuckOperation(e.data, start),
        step: e.data?.step ?? null,
        reason: e.data?.reason ?? null,
        platform: e.data?.platform ?? start?.data?.platform ?? null
      }
      state.email = e.data?.email ?? state.email ?? start?.data?.email ?? null
      state.plans = Array.isArray(e.data?.plans) ? e.data.plans : (state.plans ?? [])
    } else if (!state) continue
    else if (e.kind === 'ops.reopened') {
      if (!state.open) {
        state.open = true
        state.closed = null
      }
    } else if (state.open) {
      const how =
        e.kind === 'site.result' && e.data?.outcome === 'done'
          ? 'built'
          : e.kind === 'site.delete'
            ? 'deleted'
            : e.kind === 'ops.handled'
              ? 'handled'
              : null
      if (how) {
        state.open = false
        state.closed = { how, at, by: e.data?.by ?? null }
      }
    }
  }
  return state
}

const close = (value) => (value ? { ...value, at: iso(value.at) } : null)
const episode = (siteKey, state, lifetimeKey) => ({
  siteKey,
  lifetimeKey,
  platform: state.last?.platform ?? null,
  operation: state.last?.operation ?? 'unknown',
  step: state.last?.step ?? null,
  reason: state.last?.reason ?? null,
  firstAt: iso(state.firstAt),
  lastAt: iso(state.last?.at),
  times: state.times,
  closed: close(state.closed)
})

/** Early records can have failures without a retained start. Keep their closing events together. */
function stuckLifetimes(rows) {
  const lifetimes = []
  for (const [siteKey, events] of groupBy([...rows].sort(siteChronology), (row) => row.site_key)) {
    const instances = new Map()
    let latest = null
    for (const row of events) {
      const instance = iso(row.site_instance)
      const starts = row.kind === 'site.create' || row.kind === 'site.import'
      let lifetime = instance ? instances.get(instance) : starts ? null : latest
      if (!lifetime) {
        lifetime = { siteKey, events: [], start: null }
        lifetimes.push(lifetime)
        if (instance) instances.set(instance, lifetime)
        if (!latest || starts) latest = lifetime
      }
      lifetime.events.push(row)
      if (starts) {
        lifetime.start ??= row
        latest = lifetime
      }
    }
  }
  const began = (lifetime) =>
    new Date(
      lifetime.start?.site_instance ??
        lifetime.events[0]?.site_instance ??
        lifetime.start?.occurred_at ??
        lifetime.events[0]?.occurred_at
    ).getTime()
  return lifetimes.sort((a, b) => began(a) - began(b))
}

/** No age cutoff: an old unresolved case remains actionable until a real closing event. */
export async function readStuckSites(pool, now = Date.now()) {
  const { rows } = await pool.query(
    `/* ops-stuck-history */
     select s.id, s.kind, s.data, s.occurred_at, s.site_key, s.site_instance, s.site_demo,
            a.email as account_email, a.beta_admission
       from ops_signal s left join account a on a.id = s.account_id
      where s.site_key is not null and s.kind = any($1) and s.occurred_at <= $2
      order by s.occurred_at, s.id`,
    [KINDS, new Date(now)]
  )
  const sites = new Map()
  const history = { episodes: [], activity: [] }
  for (const lifetime of stuckLifetimes(rows)) {
    const first = lifetime.start ?? lifetime.events[0]
    const instance = lifetime.events.find((row) => row.site_instance)?.site_instance
    const lifetimeKey = `${lifetime.siteKey}:${iso(instance) ?? `legacy:${iso(first.occurred_at)}:${first.id ?? ''}`}`
    const events = lifetime.events.map((row) => ({
      ...row,
      data: { ...row.data, email: row.data?.email ?? row.account_email ?? null }
    }))
    const recovered = recoveryContext(events, lifetime.start)
    let start = null
    for (const row of events) {
      if (row.kind === 'site.create' || row.kind === 'site.import') start = row
      const kind =
        row.kind === 'site.stuck'
          ? 'failed'
          : row.kind === 'site.create' || row.kind === 'site.import'
            ? 'started'
            : row.kind === 'site.result' && row.data?.outcome === 'done'
              ? 'ready'
              : null
      if (kind)
        history.activity.push({
          siteKey: lifetime.siteKey,
          lifetimeKey,
          at: iso(row.occurred_at),
          kind,
          platform:
            row.data?.platform ?? start?.data?.platform ?? (kind === 'ready' ? recovered.platform : null),
          operation: kind === 'ready' ? recovered.operation : stuckOperation(row.data, start),
          step: row.data?.step ?? null,
          reason: row.data?.reason ?? null
        })
    }
    const episodes = []
    const state = stuckState(events, episodes)
    history.episodes.push(...episodes.map((row) => episode(lifetime.siteKey, row, lifetimeKey)))
    // A new incarnation supersedes the old case even before its first failure.
    if (!state) {
      if (lifetime.start) sites.delete(lifetime.siteKey)
      continue
    }
    const source =
      events.findLast((row) => row.data?.email === state.email && row.beta_admission)?.beta_admission
        ?.source ?? null
    sites.set(lifetime.siteKey, {
      ...episode(lifetime.siteKey, state, lifetimeKey),
      email: state.email,
      plans: state.plans,
      source,
      open: state.open,
      totalFailures: episodes.reduce((sum, row) => sum + row.times, 0),
      episodeCount: episodes.length,
      historyAvailable: true
    })
  }
  return { sites: [...sites.values()], history }
}

export function stuckReport(sites, history, now = Date.now()) {
  const todayStart = new Date(`${vietnamDay(now)}T00:00:00+07:00`).getTime()
  const open = sites.filter((row) => row.open).sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
  const handledToday = sites
    .filter(
      (row) =>
        !row.open && row.closed && Date.parse(row.closed.at) >= todayStart && Date.parse(row.closed.at) <= now
    )
    .sort((a, b) => b.closed.at.localeCompare(a.closed.at))
  return {
    readAt: iso(now),
    count: open.length,
    open,
    handledToday,
    sites,
    history
  }
}
