import { siteChronology, siteLifetimes } from './ops-signal-customer-sites.js'
import { resolveSignalRange } from './ops-signal-query.js'
import { usageAudience, usageSite } from './ops-usage-query.js'

const time = (value) => (value == null ? null : new Date(value).getTime())
const same = (a, b) => a != null && b != null && time(a) === time(b)
const inRange = (at, start, end) => time(at) >= time(start) && time(at) < time(end)

/** Read metadata only; customer words stay exclusively in the audited sample door. */
export async function readUsageData(pool, query, now) {
  const lower = query.compare ? query.previousStart : query.start
  const values = [lower, new Date(now)]
  const [turns, writes, operations, events, briefs] = await Promise.all([
    pool.query(
      `/* usage-turns */ select t.turn_id,t.site_key,t.session_id,t.turn,t.actor,t.source,
      t.opened_at,t.closed_at,t.close_filed_at,t.state,t.end_reason,t.files,t.head_sha,t.undone_at,
      t.rating,t.steps,t.calls,t.failed_calls,t.visual,t.site_instance,t.site_demo,t.token_usage,
      case when t.site_instance=s.created_at then s.platform end as platform
      from site_turn t left join site s on s.site_key=t.site_key
      where t.opened_at >= $1 and t.opened_at <= $2`,
      values
    ),
    pool.query(
      `/* usage-writes */ select w.*,
      case when s.created_at <= w.at then s.demo end as registry_demo,
      case when s.created_at <= w.at then s.platform end as registry_platform
      from site_write w left join site s on s.site_key=w.site_key
      where (w.at >= $1 and w.at <= $2) or w.turn_id in
        (select turn_id from site_turn where opened_at >= $1 and opened_at <= $2)`,
      values
    ),
    pool.query(
      `/* usage-operations */ select o.*,
      case when s.created_at <= o.created_at then s.demo end as registry_demo,
      case when s.created_at <= o.created_at then s.platform end as registry_platform,
      case when s.created_at <= o.created_at then s.created_at end as registry_instance
      from site_operation o left join site s on s.site_key=o.site_key
      where o.created_at >= $1 and o.created_at <= $2 and o.status='succeeded'`,
      values
    ),
    pool.query(
      `/* usage-events */ select o.id,o.kind,o.site_key,o.site_instance,o.site_demo,
      o.account_id,o.data,o.occurred_at,a.email as account_email
      from ops_signal o left join account a on a.id=o.account_id
      where o.kind in ('site.create','site.import','site.result','site.stuck','site.delete',
        'wizard.opened','site.entered') and o.occurred_at <= $1
      order by o.occurred_at,o.id`,
      [new Date(now)]
    ),
    pool.query(`/* usage-briefs */ select b.site_key,b.state,s.created_at as site_instance
      from site_brief b left join site s on s.site_key=b.site_key`)
  ])
  resolveSignalRange(
    query,
    [
      ...turns.rows.map((row) => row.opened_at),
      ...events.rows.map((row) => row.occurred_at),
      ...writes.rows.map((row) => row.at),
      ...operations.rows.map((row) => row.created_at)
    ],
    now
  )
  if (query.allTime) query.observedEnd = query.end
  return {
    turns: turns.rows,
    writes: writes.rows,
    operations: operations.rows,
    events: events.rows,
    briefs: briefs.rows
  }
}

/** Immutable lifetimes avoid attributing an old demo's history to a reused customer hostname. */
export function usagePopulation(raw, query, staffEmails, now) {
  const staff = new Set(staffEmails.map((email) => email.toLowerCase()))
  const events = raw.events.filter((row) => time(row.occurred_at) <= now)
  const lives = siteLifetimes(events)
  const identity = (row, at) => {
    const history = lives.filter((life) => life.siteKey === row.site_key)
    const life = row.site_instance
      ? history.find((entry) =>
          same(entry.start?.site_instance ?? entry.events[0]?.site_instance, row.site_instance)
        )
      : history
          .filter((entry) => time(entry.start?.occurred_at ?? entry.events[0]?.occurred_at) <= time(at))
          .at(-1)
    return {
      life,
      lifetimeKey:
        life?.key ??
        (row.site_instance || row.registry_instance
          ? `${row.site_key}:${new Date(row.site_instance ?? row.registry_instance).toISOString()}`
          : null),
      demo: row.site_demo ?? life?.demo ?? row.registry_demo ?? null,
      platform: row.platform ?? life?.start?.data?.platform ?? row.registry_platform ?? 'unknown'
    }
  }
  const audience = (email) => usageAudience(email, query.filters, staff)
  const classify = (row) => ({ ...row, ...identity(row, row.opened_at) })
  const allTurns = raw.turns.filter((row) => time(row.opened_at) <= now).map(classify)
  const contextTurns = allTurns.filter(
    (row) => audience(row.actor) && usageSite(row.demo, row.platform, query.filters)
  )
  const selectedTurns = contextTurns.filter((row) => inRange(row.opened_at, query.start, query.observedEnd))
  const selectedIds = new Set(contextTurns.map((row) => row.turn_id))
  const writes = raw.writes.filter((row) => selectedIds.has(row.turn_id) && time(row.at) <= now)
  const operations = raw.operations
    .map((row) => ({ ...row, ...identity(row, row.created_at) }))
    .filter((row) => {
      const meta = row
      return (
        audience(row.actor_email) &&
        usageSite(meta.demo, meta.platform, query.filters) &&
        time(row.created_at) <= now
      )
    })
  const standaloneWrites = raw.writes.filter((row) => {
    const meta = identity(row, row.at)
    return (
      row.action === 'apply.revert' &&
      row.outcome === 'ok' &&
      row.session_id == null &&
      audience(row.actor) &&
      usageSite(meta.demo, meta.platform, query.filters) &&
      inRange(row.at, query.start, query.observedEnd)
    )
  })
  const creates = [],
    results = new Map(),
    stuck = new Set(),
    briefs = new Map(),
    entries = new Map(),
    firstTurns = new Map()
  for (const life of lives) {
    const start = life.start
    if (start?.kind !== 'site.create' || !inRange(start.occurred_at, query.start, query.observedEnd)) continue
    const platform = start.data?.platform ?? 'unknown'
    if (!audience(start.data?.email ?? start.account_email) || !usageSite(life.demo, platform, query.filters))
      continue
    creates.push({ ...start, site_key: life.key, platform, wizard_id: start.data?.wizard_id ?? null })
    const ordered = [...life.events].sort(siteChronology)
    const result = ordered.find(
      (row) =>
        row.kind === 'site.result' &&
        row.data?.outcome === 'done' &&
        time(row.occurred_at) >= time(start.occurred_at)
    )
    if (result) results.set(life.key, { seconds: result.data?.seconds ?? null })
    else if (ordered.some((row) => row.kind === 'site.stuck')) stuck.add(life.key)
    const brief = raw.briefs.find(
      (row) => row.site_key === life.siteKey && same(row.site_instance, start.site_instance)
    )
    if (brief) briefs.set(life.key, brief.state)
    entries.set(
      life.key,
      ordered
        .filter((row) => row.kind === 'site.entered' && audience(row.data?.email ?? row.account_email))
        .map((row) => row.occurred_at)
    )
    // A customer request, tied to the same incarnation and after creation, never a staff test.
    const first = contextTurns
      .filter(
        (row) =>
          row.site_key === life.siteKey &&
          same(row.site_instance, start.site_instance) &&
          time(row.opened_at) >= time(start.occurred_at)
      )
      .sort((a, b) => time(a.opened_at) - time(b.opened_at))[0]
    if (first) firstTurns.set(life.key, first.opened_at)
  }
  const openings = events
    .filter(
      (row) =>
        row.kind === 'wizard.opened' &&
        inRange(row.occurred_at, query.start, query.observedEnd) &&
        audience(row.data?.email ?? row.account_email)
    )
    .map((row) => ({ ...row, wizard_id: row.data?.wizard_id }))
  const wizardCreates = events
    .filter((row) => row.kind === 'site.create' && audience(row.data?.email ?? row.account_email))
    .map((row) => ({ ...row, wizard_id: row.data?.wizard_id }))
  const enteredSince =
    events.find((row) => row.kind === 'wizard.opened' || row.kind === 'site.entered')?.occurred_at ?? null
  const limitations = {
    unknownRequestClassification: allTurns.filter(
      (row) =>
        row.demo == null && audience(row.actor) && inRange(row.opened_at, query.start, query.observedEnd)
    ).length,
    unknownSiteClassification: lives.filter(
      (life) =>
        life.start &&
        life.demo == null &&
        audience(life.start.data?.email ?? life.start.account_email) &&
        inRange(life.start.occurred_at, query.start, query.observedEnd)
    ).length,
    excludedLegacyTimings: selectedTurns.filter((row) => row.closed_at == null && row.state === 'closed')
      .length,
    wizardFilterScope: 'dates-and-audience'
  }
  return {
    turns: selectedTurns,
    contextTurns,
    writes,
    operations,
    standaloneWrites,
    openings,
    creates,
    wizardCreates,
    results,
    stuck,
    briefs,
    entries,
    firstTurns,
    enteredSince,
    limitations
  }
}
