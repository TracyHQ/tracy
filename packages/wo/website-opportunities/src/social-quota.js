/** Admission uses explicit subscription allocations, UTC abuse caps and YouTube's Pacific day. */
const DAY = 86_400_000
export const RAPID_BUDGETS = [
  'facebook-scraper3',
  'instagram-looter2',
  'instagram-stable',
  'tiktok-api23',
  'yt-api'
]
export function pacificDay(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(now))
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  const date = `${p.year}-${p.month}-${p.day}`
  // Find the next PT midnight by calendar day, including both DST boundaries.
  let next = Math.floor(now / 3_600_000) * 3_600_000 + 3_600_000
  while (
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(next)) ===
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(now))
  )
    next += 3_600_000
  return { date, resetsAt: next }
}
export async function reserveSocialQuota({ pool, budget, units, cap, account, perAccount, settings, now }) {
  const utcStart = Math.floor(now / DAY) * DAY
  const dayEnd = utcStart + DAY
  const buckets = [{ key: `wo:social-budget:${budget}`, start: utcStart, cap, baseline: 0, end: dayEnd }]
  if (account)
    buckets.push({
      key: `wo:social-account:${account}`,
      start: utcStart,
      cap: perAccount,
      baseline: 0,
      end: dayEnd
    })
  if (RAPID_BUDGETS.includes(budget)) {
    const c = settings.socialStatsProviderCycle?.[budget]
    const start = Date.parse(c?.startsAt),
      end = Date.parse(c?.endsAt)
    if (!c || !Number.isFinite(start) || !Number.isFinite(end) || now < start || now >= end || !(c.limit > 0))
      return { ok: false, retryAt: end > now ? end : dayEnd }
    buckets.push({ key: `wo:social-cycle:${budget}`, start, cap: c.limit, baseline: c.used ?? 0, end })
  }
  if (budget === 'youtube-official') {
    const pt = pacificDay(now)
    if (!(settings.socialStatsYouTubeDailyQuota > 0)) return { ok: false, retryAt: pt.resetsAt }
    buckets.push({
      key: `wo:social-youtube:${pt.date}`,
      start: Date.parse(pt.date + 'T00:00:00Z'),
      cap: settings.socialStatsYouTubeDailyQuota,
      baseline: 0,
      end: pt.resetsAt
    })
  }
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('select pg_advisory_xact_lock(hashtext($1))', ['social-quota'])
    for (const b of buckets) {
      const { rows } = await db.query('select count from rate_bucket where bucket=$1 and window_start=$2', [
        b.key,
        new Date(b.start)
      ])
      if (!(b.cap > 0) || (rows[0]?.count ?? 0) + b.baseline + units > b.cap) {
        await db.query('rollback')
        return { ok: false, retryAt: b.end }
      }
    }
    for (const b of buckets)
      await db.query(
        `insert into rate_bucket (bucket,window_start,count) values ($1,$2,$3)
      on conflict (bucket,window_start) do update set count=rate_bucket.count+excluded.count`,
        [b.key, new Date(b.start), units]
      )
    await db.query('commit')
    return { ok: true, buckets }
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}
export async function refundSocialQuota(pool, ticket, units) {
  const db = await pool.connect()
  try {
    await db.query('begin')
    for (const b of ticket.buckets)
      await db.query(
        'update rate_bucket set count=greatest(count-$3,0) where bucket=$1 and window_start=$2',
        [b.key, new Date(b.start), units]
      )
    await db.query('commit')
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

/** Only bounded numeric quota headers are retained; credentials and arbitrary headers never are. */
export function providerQuotaObservation(headers, at) {
  const read = (kind) => {
    const raw = headers?.get(`x-ratelimit-requests-${kind}`) ?? headers?.get(`x-ratelimit-request-${kind}`)
    return typeof raw === 'string' && /^\d{1,12}$/.test(raw) ? Number(raw) : null
  }
  const limit = read('limit'),
    remaining = read('remaining'),
    reset = read('reset')
  return limit === null && remaining === null && reset === null
    ? null
    : { limit, remaining, reset, observedAt: new Date(at).toISOString() }
}
