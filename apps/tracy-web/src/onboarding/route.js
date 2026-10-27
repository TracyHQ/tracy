/**
 * The Getting started screen's account flags (`@tracy/dsh-onboard`, tasks/todo-web-onboard.md,
 * ADR 0030; tasks/todo-ai-accounts-unify.md). The web has no "first run on this device", so whether
 * to show the screen is the account's: shown while `account.onboarding_completed_at` is null. The
 * account menu's Getting started row goes once the person hides it (`onboarding_menu_hidden_at`)
 * and comes back once they show it again, on web and desktop alike; × on the screen closes it and keeps the row.
 *
 *   GET  /api/onboarding            → {completedAt: ISO | null, menuHiddenAt: ISO | null}
 *   POST /api/onboarding            → {completedAt: ISO}    the first close wins; later ones change nothing
 *   POST /api/onboarding/menu-hide  → {menuHiddenAt: ISO}   the first hide wins, the same way
 *   POST /api/onboarding/menu-show  → {menuHiddenAt: null}  "Show in account menu": clears the hide
 *   POST /api/onboarding/step       → {ok: true}  usage: a step of the Welcome popup or a tour reached,
 *                                     or how it ended (`./usage.js`); kept in `ops_signal`, never read back
 *
 * All read the signed-in person from the session and touch only that account. No session → 401
 * `NOT_SIGNED_IN`. A session for an email with no account row yet reads `null`, and its POSTs create
 * the row, so a close or a hide always sticks; a show has nothing to clear there and creates nothing. The POSTs carry no body; the cross-site guard
 * (`lib/csrf.js`) refuses them from any page but Tracy's own.
 */
import { Hono } from 'hono'
import { json, requireViewer } from '../lib/http.js'
import { opsFor } from '../lib/ops-signal.js'
import { overLimitOrClosed } from '../lib/rate.js'
import { ONBOARD_STEPS_PER_HOUR, onboardRecord } from './usage.js'

const iso = (value) => (value instanceof Date ? value.toISOString() : null)

/**
 * @param {{config: {sessionSecret: string}, pool: import('pg').Pool, now?: () => number}} deps
 */
export function onboardingRoutes({ config, pool, now = Date.now }) {
  const app = new Hono()

  app.get('/api/onboarding', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const { rows } = await pool.query(
      'select onboarding_completed_at, onboarding_menu_hidden_at from account where email = $1',
      [email.toLowerCase()]
    )
    return json(c, {
      completedAt: iso(rows[0]?.onboarding_completed_at ?? null),
      menuHiddenAt: iso(rows[0]?.onboarding_menu_hidden_at ?? null)
    })
  })

  app.post('/api/onboarding', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const { rows } = await pool.query(
      `insert into account (email, onboarding_completed_at) values ($1, now())
       on conflict (email) do update
         set onboarding_completed_at = coalesce(account.onboarding_completed_at, excluded.onboarding_completed_at)
       returning onboarding_completed_at`,
      [email.toLowerCase()]
    )
    return json(c, { completedAt: iso(rows[0].onboarding_completed_at) })
  })

  app.post('/api/onboarding/menu-hide', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const { rows } = await pool.query(
      `insert into account (email, onboarding_menu_hidden_at) values ($1, now())
       on conflict (email) do update
         set onboarding_menu_hidden_at = coalesce(account.onboarding_menu_hidden_at, excluded.onboarding_menu_hidden_at)
       returning onboarding_menu_hidden_at`,
      [email.toLowerCase()]
    )
    return json(c, { menuHiddenAt: iso(rows[0].onboarding_menu_hidden_at) })
  })

  app.post('/api/onboarding/menu-show', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    await pool.query('update account set onboarding_menu_hidden_at = null where email = $1', [
      email.toLowerCase()
    ])
    return json(c, { menuHiddenAt: null })
  })

  // Usage: where a first-run guide was left, and how. One record per showing and step, one end per
  // showing; the client never waits on it, so a refusal only means one step goes uncounted.
  app.post('/api/onboarding/step', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const asked = onboardRecord(await c.req.json().catch(() => null))
    if ('code' in asked) return json(c, { code: asked.code }, 400)
    if (await overLimitOrClosed(pool, `onboard-step:${email}`, ONBOARD_STEPS_PER_HOUR, now(), 3_600_000))
      return json(c, { code: 'RATE_LIMITED' }, 429)
    await opsFor(pool).record(asked.kind, { email, data: asked.data, dedupeKey: asked.dedupeKey })
    return json(c, { ok: true })
  })

  return app
}
