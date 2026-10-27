import { customerSite, siteLifetimes } from './ops-signal-customer-sites.js'
import { aggregateSignalGrowth, readGrowthTurns } from './ops-signal-growth.js'
import { matchesCustomerSites, matchesSignalSource, resolveSignalRange } from './ops-signal-query.js'

const CUSTOMER_MAX_ROWS = 200
const lower = (value) => (typeof value === 'string' ? value.toLowerCase() : null)

/** Period and attribution select the cohort; activity remains lifetime, excluding staff and demos. */
export async function readSignalCustomers(pool, query, now = Date.now()) {
  const { rows: cohort } = await pool.query(
    `with staff as (
       select distinct lower(a.email) as email
         from account a
         join seat_workspace sw on sw.account_id = a.id
         join workspace w on w.id = sw.workspace_id
        where w.kind = 'tracy_admin'
          and sw.revoked_at is null and sw.declined_at is null and sw.accepted_at is not null)
     select distinct on (lower(coalesce(s.data->>'email', a.email)))
            coalesce(s.account_id, a.id) as account_id,
            lower(coalesce(s.data->>'email', a.email)) as email,
            s.occurred_at, s.data
       from ops_signal s
       left join account a on a.email = lower(s.data->>'email')
      where s.kind = 'account.first_sign_in' and s.occurred_at >= $1 and s.occurred_at < $2
        and not exists (select 1 from ops_signal older where older.kind='account.first_sign_in'
          and (older.account_id=s.account_id or lower(older.data->>'email')=lower(s.data->>'email'))
          and older.occurred_at < s.occurred_at)
        and lower(coalesce(s.data->>'email', a.email)) is not null
        and lower(coalesce(s.data->>'email', a.email)) not in (select email from staff)
      order by lower(coalesce(s.data->>'email', a.email)), s.occurred_at`,
    [query.start, query.end]
  )
  resolveSignalRange(
    query,
    cohort.map((row) => row.occurred_at),
    now
  )
  const people = cohort.filter((person) => matchesSignalSource(person.data?.source, query.filters))
  people.sort((a, b) => b.occurred_at - a.occurred_at)
  let ids = people.map((p) => p.account_id).filter(Boolean)
  let emails = people.map((p) => p.email)

  // Every site these people started, then every event of those sites, so a result or a go-live
  // signalled without an account still lands on the right site.
  const { rows: siteEvents } = await pool.query(
    `with started as (
       select distinct s.site_key
         from ops_signal s
        where s.kind in ('site.create', 'site.import') and s.site_key is not null
          and (s.account_id = any($1::uuid[]) or lower(s.data->>'email') = any($2::text[])))
     select s.id, s.kind, s.data, s.occurred_at, s.site_key, s.account_id, s.site_instance, s.site_demo
       from ops_signal s
      where s.site_key in (select site_key from started)
        and s.kind = any($3)
      order by s.site_key, s.occurred_at, s.id`,
    [ids, emails, ['site.create', 'site.import', 'site.result', 'site.stuck', 'site.delete', 'site.go_live']]
  )
  const sitesBy = new Map()
  const unknownSites = new Set()
  for (const { siteKey, events, start, demo } of siteLifetimes(siteEvents)) {
    const key = start?.account_id ?? lower(start?.data?.email)
    if (!key) continue
    if (demo === null) unknownSites.add(key)
    if (demo !== false) continue
    if (!sitesBy.has(key)) sitesBy.set(key, [])
    sitesBy.get(key).push(customerSite(siteKey, events))
  }
  const sitesFor = (person) =>
    [...new Set([person.account_id, person.email])]
      .flatMap((key) => sitesBy.get(key) ?? [])
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const selected = people.filter(
    (person) =>
      !(
        query.filters.status === 'no-site' &&
        (unknownSites.has(person.account_id) || unknownSites.has(person.email))
      ) && matchesCustomerSites(sitesFor(person), query.filters)
  )
  const listed = selected.slice(0, CUSTOMER_MAX_ROWS)
  ids = selected.map((person) => person.account_id).filter(Boolean)
  emails = selected.map((person) => person.email)

  const { rows: edits } = await pool.query(
    `select coalesce(s.account_id, a.id) as account_id, s.kind,
            s.data->>'action' as action, (s.data->>'ok')::boolean as ok, count(*)::int as n
       from ops_signal s
       left join account a on a.email = lower(s.data->>'email')
      where s.kind in ('site.edit', 'site.undo')
        and s.site_demo is false
        and (s.account_id = any($1::uuid[]) or lower(s.data->>'email') = any($2::text[]))
      group by 1, 2, 3, 4`,
    [ids, emails]
  )
  const { rows: turns } = await pool.query(
    `select lower(t.actor) as email, count(*)::int as requests, max(t.opened_at) as last_at,
            sum((t.token_usage->>'totalTokens')::bigint) as tokens,
            count(t.token_usage)::int as measured_turns,
            count(*) filter (where t.token_usage is not null and (t.token_usage->>'missing')::bigint > 0)::int as partial_turns
       from site_turn t
      where lower(t.actor) = any($1::text[]) and t.site_demo is false
      group by 1`,
    [emails]
  )
  const { rows: active } = await pool.query(
    `select account_id, array_agg(to_char(day, 'YYYY-MM-DD') order by day) as days
       from ops_active_day
      where account_id = any($1::uuid[])
      group by 1`,
    [ids]
  )

  const growthTurns = await readGrowthTurns(pool, emails, now)
  const growth = aggregateSignalGrowth(selected, siteEvents, growthTurns, active, now)

  const editsBy = new Map()
  for (const e of edits) {
    if (!e.account_id) continue
    if (!editsBy.has(e.account_id))
      editsBy.set(e.account_id, {
        done: 0,
        failed: 0,
        editUnknown: 0,
        undone: 0,
        undoFailed: 0,
        undoUnknown: 0,
        actions: {}
      })
    const into = editsBy.get(e.account_id)
    if (e.kind === 'site.undo') {
      if (e.ok === true) into.undone += e.n
      else if (e.ok === false) into.undoFailed += e.n
      else into.undoUnknown += e.n
    } else {
      if (e.ok === true) into.done += e.n
      else if (e.ok === false) into.failed += e.n
      else into.editUnknown += e.n
      if (e.action) into.actions[e.action] = (into.actions[e.action] ?? 0) + e.n
    }
  }
  const turnsBy = new Map(turns.map((t) => [t.email, t]))
  const activeBy = new Map(active.map((a) => [a.account_id, a.days]))

  const rows = listed.map((p) => {
    const sites = sitesFor(p)
    const activeDays = activeBy.get(p.account_id) ?? []
    const turn = turnsBy.get(p.email)
    return {
      email: p.email,
      firstSignInAt: p.occurred_at.toISOString(),
      badge: p.data?.badge ?? null,
      source: p.data?.source && typeof p.data.source === 'object' ? p.data.source : null,
      sites,
      requests: turn?.requests ?? 0,
      lastRequestAt: turn?.last_at ? turn.last_at.toISOString() : null,
      edits: editsBy.get(p.account_id) ?? {
        done: 0,
        failed: 0,
        editUnknown: 0,
        undone: 0,
        undoFailed: 0,
        undoUnknown: 0,
        actions: {}
      },
      activeDays,
      tokens: turn?.tokens == null ? null : Number(turn.tokens),
      tokenCoverage: { measuredTurns: turn?.measured_turns ?? 0, partialTurns: turn?.partial_turns ?? 0 }
    }
  })
  return {
    readAt: new Date(now).toISOString(),
    days: query.days,
    range: query.range,
    filters: query.filters,
    total: selected.length,
    growth,
    limit: CUSTOMER_MAX_ROWS,
    rows
  }
}
