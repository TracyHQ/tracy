/**
 * `/api/ops/beta/*`: the two Beta screens of `/ops` (spec 4.7 §5.3 and §5.4, 05/10/2026):
 *
 *   - `GET /api/ops/beta/signals?days=7|14|30`: who signed in for the first time, from which
 *     source, what they built and who was turned away, by day (Vietnam time), with the same totals
 *     for the window before, and the latest first sign-ins.
 *   - `GET /api/ops/beta/stuck`: customers whose site failed on a system error (`site.stuck`,
 *     finding 74 §6): one row per site still open, and the ones closed today with how they closed.
 *   - `POST /api/ops/beta/stuck/handled` with `{ siteKey, reopen? }`: an administrator closes an open
 *     row by hand (`ops.handled`) or opens it again (`ops.reopened`). Owner or admin only.
 *   - `GET /api/ops/beta/waitlist?days=7|14|30`: the people behind the Waitlist number (
 *     06/10/2026), one row per address: turned away at sign-in (`beta.waitlist`), the whitelist form
 *     (`beta_waitlist`, and `whitelist_confirmation` for a form sent before its answers were kept),
 *     the confirmation mail, and whether the address signed in later.
 *   - `GET /api/ops/beta/customers?days=7|14|30`: one row per customer who signed in for the first
 *     time in the window (19/10/2026): each site they started and whether it built, how many
 *     requests they gave the agent and what the agent changed, undos, and the days they were active.
 *     Counts and codes only, never the customer's words; staff seats and demo sites left out.
 *
 * 🔒 EVERYTHING IS READ PER REQUEST. No cache: the screen shows exactly what the Telegram topic was
 * told, and a row closed a second ago is gone on the next load. Signals and Attention read
 * `ops_signal` only; Waitlist also reads the two tables the whitelist form writes, because the form's
 * answers are not signals; Customers also reads `site_turn` (requests), `ops_active_day` and the
 * staff seats, because neither is a signal.
 *
 * 🔒 A ROW OPENS AND CLOSES BY EVENTS, NEVER BY A FLAG. Walking one site's signals in order: a
 * `site.stuck` opens it (or adds to its count), a `site.result` with outcome `done`, a `site.delete`
 * or an `ops.handled` closes it, an `ops.reopened` opens it again. The hand-written close is one
 * more event, so the history stays whole and a later failure reopens the row on its own.
 *
 * NO PROSE IN THE ANSWER: codes and values; the screen words them.
 *
 * MODULE-GRAPH BOUNDARY: imports only `lib/` and `./admit.js`, like every door under `ops/`.
 */
import { Hono } from 'hono'

import { vietnamDay } from '../lib/beta-access.js'
import { opsFor, readSignalCustomers, readSignalSummary } from '../lib/ops-signal.js'
import { resolveSignalRange, SIGNAL_WINDOWS, signalQuery } from '../lib/ops-signal-query.js'
import { readStuckSites, stuckQuery, stuckReport } from '../lib/ops-stuck.js'
import { admit, denied } from './admit.js'

export { customerSite } from '../lib/ops-signal-customer-sites.js'
export { SIGNAL_WINDOWS, SOURCE_BUCKETS } from '../lib/ops-signal-query.js'
export { stuckState } from '../lib/ops-stuck.js'

const DAY_MS = 86_400_000
// The waitlist is read over a month unless asked otherwise: it is a list of people to invite, and a
// person turned away three weeks ago is still waiting.
const WAITLIST_DEFAULT_DAYS = 30
const WAITLIST_MAX_ROWS = 500
/** Midnight of `day` (YYYY-MM-DD) in Vietnam time, as a Date. */
const vnMidnight = (day) => new Date(`${day}T00:00:00+07:00`)

export function betaRoutes({ pool, config, now = Date.now }) {
  const app = new Hono()

  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      // The PUBLIC origin, not the request's: the same rule `widget.js` and `demos.js` write by.
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  for (const [path, read] of [
    ['/api/ops/beta/signals', readSignalSummary],
    ['/api/ops/beta/customers', readSignalCustomers]
  ]) {
    app.get(path, async (c) => {
      const g = await guard(c)
      if (g.deny) return g.deny
      c.header('cache-control', 'no-store')
      const at = now()
      let query
      try {
        query = signalQuery(new URL(c.req.url).searchParams, at)
      } catch (error) {
        if (error.message !== 'INVALID_SIGNAL_FILTER') throw error
        return c.json({ code: error.message, parameter: error.parameter }, 400)
      }
      return c.json(await read(pool, query, at))
    })
  }

  app.get('/api/ops/beta/stuck', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const at = now()
    let query
    try {
      query = stuckQuery(new URL(c.req.url).searchParams, at)
    } catch (error) {
      if (error.message !== 'INVALID_SIGNAL_FILTER') throw error
      return c.json({ code: error.message, parameter: error.parameter }, 400)
    }
    const { sites, history } = await readStuckSites(pool, at)
    resolveSignalRange(query, history?.activity.map((row) => row.at) ?? [], at)
    return c.json({
      ...stuckReport(sites, history, at),
      range: query.range,
      writable: ['owner', 'admin'].includes(g.who.role)
    })
  })

  app.get('/api/ops/beta/waitlist', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const asked = Number(c.req.query('days'))
    const days = SIGNAL_WINDOWS.includes(asked) ? asked : WAITLIST_DEFAULT_DAYS
    const start = new Date(vnMidnight(vietnamDay(now())).getTime() - (days - 1) * DAY_MS)
    const iso = (value) => (value ? new Date(value).toISOString() : null)
    // Who is on the list: turned away, or sent the form, inside the window. What is shown for them is
    // read whatever its age: a form sent before the window still says what that person asked for.
    const turned = (
      await pool.query(
        `select lower(data->>'email') as email, count(*)::int as times, min(occurred_at) as first_at,
                max(occurred_at) as last_at, (array_agg(data->>'via' order by occurred_at desc, id desc))[1] as via
           from ops_signal
          where kind = 'beta.waitlist' and occurred_at >= $1 and data->>'email' is not null
          group by 1`,
        [start]
      )
    ).rows
    const formed = (
      await pool.query(
        `select email from beta_waitlist where created_at >= $1 or updated_at >= $1
         union select email from whitelist_confirmation where created_at >= $1`,
        [start]
      )
    ).rows
    const emails = [...new Set([...turned.map((r) => r.email), ...formed.map((r) => r.email)])]
    if (!emails.length)
      return c.json({
        readAt: new Date(now()).toISOString(),
        days,
        totals: { people: 0, turnedAway: 0, form: 0, both: 0, signedIn: 0 },
        rows: []
      })
    const [forms, mails, entries] = await Promise.all([
      pool.query(
        `select email, name, website, platforms, role, site_count, source, created_at, updated_at
           from beta_waitlist where email = any($1)`,
        [emails]
      ),
      pool.query(
        'select email, status, created_at, sent_at from whitelist_confirmation where email = any($1)',
        [emails]
      ),
      // A later way in: the first sign-in signal, or an account seen since (signed in before signals).
      pool.query(
        `select email, min(at) as at from (
            select lower(data->>'email') as email, occurred_at as at from ops_signal
             where kind = 'account.first_sign_in' and lower(data->>'email') = any($1)
            union all
            select email, last_seen_at as at from account where email = any($1) and last_seen_at is not null
          ) e group by email`,
        [emails]
      )
    ])
    const by = (rows) => new Map(rows.map((r) => [r.email, r]))
    const turnedBy = by(turned)
    const formBy = by(forms.rows)
    const mailBy = by(mails.rows)
    const entryBy = by(entries.rows)
    const rows = emails.map((email) => {
      const t = turnedBy.get(email)
      const f = formBy.get(email)
      const m = mailBy.get(email)
      const entered = entryBy.get(email)
      const formAt = f?.created_at ?? m?.created_at ?? null
      const turnedAway = t
        ? { times: t.times, firstAt: iso(t.first_at), lastAt: iso(t.last_at), via: t.via ?? null }
        : null
      const form = f
        ? {
            at: iso(f.created_at),
            updatedAt: iso(f.updated_at),
            name: f.name,
            website: f.website ?? null,
            platforms: Array.isArray(f.platforms) ? f.platforms : [],
            role: f.role,
            siteCount: f.site_count,
            source: f.source && typeof f.source === 'object' ? f.source : null
          }
        : m
          ? {
              at: iso(m.created_at),
              updatedAt: null,
              name: null,
              website: null,
              platforms: [],
              role: null,
              siteCount: null,
              source: null
            }
          : null
      const lastAt = [t?.last_at, f?.updated_at, formAt].filter(Boolean).map((d) => new Date(d).getTime())
      return {
        email,
        lastAt: lastAt.length ? new Date(Math.max(...lastAt)).toISOString() : null,
        turnedAway,
        form,
        confirmation: m ? { status: m.status, sentAt: iso(m.sent_at) } : null,
        signedInAt: iso(entered?.at)
      }
    })
    rows.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
    return c.json({
      readAt: new Date(now()).toISOString(),
      days,
      totals: {
        people: rows.length,
        turnedAway: rows.filter((r) => r.turnedAway).length,
        form: rows.filter((r) => r.form).length,
        both: rows.filter((r) => r.turnedAway && r.form).length,
        signedIn: rows.filter((r) => r.signedInAt).length
      },
      rows: rows.slice(0, WAITLIST_MAX_ROWS)
    })
  })

  app.post('/api/ops/beta/stuck/handled', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!c.req.header('content-type')?.startsWith('application/json')) return c.body(null, 403)
    const body = await c.req.json().catch(() => null)
    const siteKey = typeof body?.siteKey === 'string' ? body.siteKey : ''
    const reopen = body?.reopen === true
    const site = siteKey ? (await readStuckSites(pool, now())).sites.find((s) => s.siteKey === siteKey) : null
    if (!site) return c.json({ code: 'UNKNOWN_STUCK_SITE' }, 404)
    // Only a row in the state the button was drawn for: a second press, or a press on a row that
    // closed on its own meanwhile, changes nothing and says so.
    if (reopen ? site.open || site.closed?.how !== 'handled' : !site.open)
      return c.json({ code: reopen ? 'NOT_HANDLED' : 'NOT_OPEN' }, 409)
    const event = await opsFor(pool).record(reopen ? 'ops.reopened' : 'ops.handled', {
      siteKey,
      data: { of: 'site.stuck', since: site.firstAt, by: g.who.email }
    })
    if (!event) return c.json({ code: 'NOT_RECORDED' }, 503)
    return c.json({ ok: true })
  })

  return app
}
