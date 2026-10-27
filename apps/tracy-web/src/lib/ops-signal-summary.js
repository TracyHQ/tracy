import { signalPopulation } from './ops-signal-population.js'
import {
  resolveSignalRange,
  SOURCE_BUCKETS,
  signalBucket,
  signalBuckets,
  signalFilterOptions,
  sourceBucket
} from './ops-signal-query.js'

const LATEST_LIMIT = 50
const SIGNAL_KINDS = [
  'account.first_sign_in',
  'site.create',
  'site.import',
  'site.stuck',
  'beta.waitlist',
  'discord.linked',
  'discord.bug_report'
]
const KIND_METRIC = {
  'site.create': 'created',
  'site.import': 'imported',
  'beta.waitlist': 'waitlist',
  'discord.linked': 'discordLinked',
  'discord.bug_report': 'discordBugs'
}
const emptyBuckets = () => Object.fromEntries(SOURCE_BUCKETS.map((bucket) => [bucket, 0]))
const counts = () => ({
  newUsers: 0,
  created: 0,
  imported: 0,
  newSites: 0,
  waitlist: 0,
  discordLinked: 0,
  discordBugs: 0,
  stuck: new Set(),
  failureEvents: 0,
  bySource: emptyBuckets()
})

function dailySeries(query) {
  return new Map(signalBuckets(query).map((day) => [day, { day, ...counts(), stuck: 0 }]))
}

/** Keep legacy fields, including daily `stuck` events, while naming their units explicitly. */
export function aggregateSignals(rows, query, now = Date.now()) {
  resolveSignalRange(
    query,
    rows.map((row) => row.occurred_at),
    now
  )
  const current = counts()
  const previous = counts()
  const byDay = dailySeries(query)
  const previousByDay = query.allTime
    ? new Map()
    : dailySeries({ ...query, start: query.previousStart, end: query.start })
  const population = signalPopulation(rows, query.filters)
  const latest = []
  let latestTotal = 0
  const ordered = [...rows].sort(
    (a, b) => b.occurred_at - a.occurred_at || Number(b.id ?? 0) - Number(a.id ?? 0)
  )
  for (const row of ordered) {
    const at = row.occurred_at
    if (at < query.previousStart || at >= query.end) continue
    const isCurrent = at >= query.start
    const into = isCurrent ? current : previous
    const day = (isCurrent ? byDay : previousByDay).get(
      signalBucket(at, isCurrent ? query : { ...query, start: query.previousStart })
    )
    if (row.kind === 'account.first_sign_in') {
      if (!population.personMatches(row)) continue
      {
        const bucket = sourceBucket(row.data?.source)
        into.newUsers += 1
        into.bySource[bucket] += 1
        day.newUsers += 1
        day.bySource[bucket] += 1
      }
      if (!isCurrent) continue
      latestTotal += 1
      if (latest.length < LATEST_LIMIT)
        latest.push({
          at: at.toISOString(),
          email: row.data?.email ?? null,
          badge: row.data?.badge ?? null,
          plans: Array.isArray(row.data?.plans) ? row.data.plans : [],
          via: row.data?.via ?? null,
          source: row.data?.source && typeof row.data.source === 'object' ? row.data.source : null
        })
    } else if (row.kind.startsWith('site.') && !population.siteMatches(row)) {
      continue
    } else if (row.kind === 'site.stuck') {
      if (row.site_key) into.stuck.add(population.siteIdentity(row))
      into.failureEvents += 1
      day.stuck += 1
      day.failureEvents += 1
    } else if (KIND_METRIC[row.kind]) {
      const metric = KIND_METRIC[row.kind]
      into[metric] += 1
      day[metric] += 1
      if (metric === 'created' || metric === 'imported') {
        into.newSites += 1
        day.newSites += 1
      }
    }
  }
  const shape = (value) => ({ ...value, stuck: value.stuck.size })
  const totals = shape(current)
  const before = shape(previous)
  const deltas = Object.fromEntries(
    Object.keys(totals)
      .filter((key) => key !== 'bySource')
      .map((key) => [
        key,
        {
          absolute: totals[key] - before[key],
          percent: before[key] === 0 ? null : ((totals[key] - before[key]) / before[key]) * 100
        }
      ])
  )
  return {
    readAt: new Date(now).toISOString(),
    days: query.days,
    sources: SOURCE_BUCKETS,
    range: query.range,
    filters: query.filters,
    compare: query.compare,
    totals,
    previous: query.allTime ? null : before,
    deltas: query.allTime ? null : deltas,
    byDay: [...byDay.values()].reverse(),
    previousByDay: [...previousByDay.values()].reverse(),
    latest,
    latestTotal,
    latestLimit: LATEST_LIMIT,
    filterOptions: signalFilterOptions(
      rows.filter((row) => row.occurred_at >= query.previousStart && row.occurred_at < query.end),
      query.filters
    )
  }
}

export async function readSignalSummary(pool, query, now = Date.now()) {
  const { rows } = await pool.query(
    `select s.id, s.kind, s.data, s.occurred_at, s.site_key,
            coalesce(s.account_id, a.id) as account_id, s.site_instance, s.site_demo
       from ops_signal s
       left join account a on a.email = lower(s.data->>'email')
      where (s.occurred_at >= $1 and s.occurred_at < $2 and s.kind = any($3))
         or ($4::boolean and s.kind = any($5))
      order by s.occurred_at desc, s.id desc`,
    [
      query.previousStart,
      query.end,
      SIGNAL_KINDS,
      Object.keys(query.filters).length > 0,
      ['account.first_sign_in', 'site.create', 'site.import', 'site.result', 'site.stuck', 'site.delete']
    ]
  )
  return aggregateSignals(rows, query, now)
}
