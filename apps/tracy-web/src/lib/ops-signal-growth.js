import { vietnamDay } from './beta-access.js'
import { siteLifetimes } from './ops-signal-customer-sites.js'
import { sourceBucket } from './ops-signal-query.js'

const DAY = 86_400_000
const time = (value) => new Date(value).getTime()
const rate = (n, denominator) => (denominator ? Math.round((n / denominator) * 1000) / 10 : null)
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  return {
    n: sorted.length,
    medianSeconds: sorted.length >= 20 ? Math.round(sorted[Math.ceil(sorted.length / 2) - 1] * 10) / 10 : null
  }
}
const ownerIs = (start, person) =>
  start.account_id
    ? start.account_id === person.account_id
    : start.data?.email?.toLowerCase() === person.email
const weekOf = (at) => {
  const date = new Date(`${vietnamDay(time(at))}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

/** Full filtered acquisition cohort, followed through readAt. Each stage counts people once. */
export function aggregateSignalGrowth(people, events, turns, active, now) {
  const lifetimes = siteLifetimes(events.filter((event) => time(event.occurred_at) <= now))
  const activeBy = new Map(active.map((row) => [row.account_id, row.days]))
  const progress = people.map((person) => {
    const signedIn = time(person.occurred_at)
    const mine = lifetimes.filter(
      (life) =>
        life.start &&
        life.demo === false &&
        ownerIs(life.start, person) &&
        time(life.start.occurred_at) >= signedIn
    )
    let firstSite = null,
      firstReady = null,
      firstRequest = null,
      firstChange = null
    const actorTurns = turns.filter(
      (turn) =>
        turn.actor?.toLowerCase() === person.email &&
        turn.site_demo === false &&
        time(turn.opened_at) >= signedIn &&
        time(turn.opened_at) <= now
    )
    for (const life of mine) {
      const started = time(life.start.occurred_at)
      const deleted = life.events.find(
        (event) => event.kind === 'site.delete' && time(event.occurred_at) >= started
      )
      const endedAt = deleted ? time(deleted.occurred_at) : Infinity
      firstSite = firstSite === null ? started : Math.min(firstSite, started)
      const ready = life.events.find(
        (event) =>
          event.kind === 'site.result' &&
          event.data?.outcome === 'done' &&
          time(event.occurred_at) >= started &&
          time(event.occurred_at) < endedAt
      )
      if (!ready) continue
      const readyAt = time(ready.occurred_at)
      firstReady = firstReady === null ? readyAt : Math.min(firstReady, readyAt)
      // Exact incarnation snapshots are required. A reused hostname alone cannot attribute a request.
      const requests = actorTurns.filter(
        (turn) =>
          turn.site_key === life.siteKey &&
          turn.site_instance &&
          life.start.site_instance &&
          time(turn.site_instance) === time(life.start.site_instance) &&
          time(turn.opened_at) >= readyAt &&
          time(turn.opened_at) < endedAt
      )
      for (const turn of requests) {
        const opened = time(turn.opened_at)
        firstRequest = firstRequest === null ? opened : Math.min(firstRequest, opened)
        const changed = turn.changed_at ? time(turn.changed_at) : null
        if (changed !== null && changed >= opened && changed <= now && changed < endedAt)
          firstChange = firstChange === null ? changed : Math.min(firstChange, changed)
      }
    }
    return {
      person,
      signedIn,
      mine,
      firstSite,
      firstReady,
      firstRequest,
      firstChange,
      actorTurns,
      presence: activeBy.get(person.account_id) ?? []
    }
  })
  const counts = [
    people.length,
    ...['firstSite', 'firstReady', 'firstRequest', 'firstChange'].map(
      (key) => progress.filter((row) => row[key] !== null).length
    )
  ]
  const funnel = ['signedIn', 'started', 'ready', 'requested', 'changed'].map((key, index) => ({
    key,
    people: counts[index],
    conversionPercent: index ? rate(counts[index], counts[index - 1]) : null,
    dropped: index ? counts[index - 1] - counts[index] : null
  }))
  const timing = Object.fromEntries(
    ['firstSite', 'firstRequest'].map((key) => [
      key,
      median(progress.filter((row) => row[key] !== null).map((row) => (row[key] - row.signedIn) / 1000))
    ])
  )
  const cohorts = new Map(),
    channels = new Map()
  for (const row of progress) {
    const week = weekOf(row.person.occurred_at)
    if (!cohorts.has(week))
      cohorts.set(week, {
        week,
        people: 0,
        weeks: Array.from({ length: 4 }, (_, index) => ({
          week: index + 1,
          eligible: 0,
          presence: 0,
          requests: 0,
          pending: 0
        }))
      })
    const cohort = cohorts.get(week)
    cohort.people += 1
    const startDay = Date.parse(`${vietnamDay(row.signedIn)}T00:00:00+07:00`)
    for (const cell of cohort.weeks) {
      const lo = startDay + cell.week * 7 * DAY,
        hi = lo + 7 * DAY
      if (hi > now) {
        cell.pending += 1
        continue
      }
      cell.eligible += 1
      if (
        row.presence.some((day) => {
          const at = Date.parse(`${day}T00:00:00+07:00`)
          return at >= lo && at < hi
        })
      )
        cell.presence += 1
      if (row.actorTurns.some((turn) => time(turn.opened_at) >= lo && time(turn.opened_at) < hi))
        cell.requests += 1
    }
    const channel = sourceBucket(row.person.data?.source),
      source = row.person.data?.source?.source || 'none',
      campaign = row.person.data?.source?.campaign || 'none'
    const key = JSON.stringify([channel, source, campaign])
    if (!channels.has(key))
      channels.set(key, {
        key,
        channel,
        source,
        campaign,
        signIns: 0,
        sites: 0,
        started: 0,
        ready: 0,
        requested: 0,
        changed: 0
      })
    const entry = channels.get(key)
    entry.signIns += 1
    entry.sites += row.mine.length
    for (const [field, stage] of [
      ['started', 'firstSite'],
      ['ready', 'firstReady'],
      ['requested', 'firstRequest'],
      ['changed', 'firstChange']
    ])
      if (row[stage] !== null) entry[field] += 1
  }
  return {
    people: people.length,
    funnel,
    timing,
    retention: [...cohorts.values()]
      .sort((a, b) => b.week.localeCompare(a.week))
      .map((cohort) => ({
        ...cohort,
        weeks: cohort.weeks.map((cell) => ({
          ...cell,
          presencePercent: rate(cell.presence, cell.eligible),
          requestPercent: rate(cell.requests, cell.eligible)
        }))
      })),
    channels: [...channels.values()].map((row) => ({
      ...row,
      activationPercent: rate(row.changed, row.signIns),
      requestPercent: rate(row.requested, row.signIns)
    })),
    coverage: {
      unknownSiteLifetimes: lifetimes.filter(
        (life) => life.start && life.demo === null && people.some((person) => ownerIs(life.start, person))
      ).length,
      unknownRequestClassification: turns.filter((turn) => turn.site_demo == null).length,
      requestsWithoutIncarnation: turns.filter((turn) => turn.site_demo === false && !turn.site_instance)
        .length
    }
  }
}

/** Only confirmed successful writes, or a closed turn's committed files, prove a change. */
export async function readGrowthTurns(pool, emails, now) {
  return (
    await pool.query(
      `select t.turn_id,t.site_key,t.actor,t.opened_at,t.site_instance,t.site_demo,
       (select min(at) from (
          select w.at from site_write w where w.turn_id=t.turn_id and w.site_key=t.site_key
            and w.outcome='ok' and w.at >= t.opened_at and w.at <= $2
          union all select t.closed_at where t.files > 0 and t.state='closed'
            and t.closed_at >= t.opened_at and t.closed_at <= $2) proof) changed_at
     from site_turn t where lower(t.actor)=any($1::text[]) and t.opened_at <= $2`,
      [emails, new Date(now)]
    )
  ).rows
}
