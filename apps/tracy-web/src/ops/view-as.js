/**
 * `/ops` › View as user — the two doors that open and end an admin's look at a customer.
 * Nothing locks the view (the admins are trained staff); the banner and the scope live in
 * `lib/view-as-guard.js`, the token and cookie in `lib/session.js`. Every start and every end is a row in `audit`.
 */
import { Hono } from 'hono'
import {
  cookieDomainFor,
  endViewSession,
  clearViewCookie,
  mintViewSession,
  viewCookie
} from '../lib/session.js'
import { admit, denied } from './admit.js'

const REASON_MAX = 300

export function viewAsRoutes({ pool, config, now = () => Date.now() }) {
  const app = new Hono()
  const opts = (c) => ({
    domain: cookieDomainFor(c.req.header('host'), config.sessionDomain),
    secure: config.secure
  })
  const audit = (actor, action, detail) =>
    pool.query('insert into audit (actor, action, site_key, detail) values ($1, $2, null, $3::jsonb)', [
      actor,
      action,
      JSON.stringify(detail)
    ])

  /**
   * ── POST /api/ops/view-as — `{ email, reason? }` ───────────────────────────────────────────────
   * Owner or admin of `tracy_admin`, from this origin. The target must be a real account that is
   * not itself staff, so the door cannot be used to borrow another operator's reach.
   */
  app.post('/api/ops/view-as', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    if (!['owner', 'admin'].includes(who.role)) return c.body(null, 403)
    if (c.req.header('origin') !== config.origin) return c.body(null, 403)

    const body = await c.req.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    // The reason is optional: staff are trained to look, and the audit row names who, whom and when.
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!email) return c.json({ code: 'EMAIL_REQUIRED' }, 400)
    if (reason.length > REASON_MAX) return c.json({ code: 'REASON_TOO_LONG' }, 400)
    if (email === who.email) return c.json({ code: 'SELF' }, 400)

    const { rows } = await pool.query(
      `select a.email,
              exists (select 1 from seat_workspace sw join workspace w on w.id = sw.workspace_id
                       where sw.account_id = a.id and w.kind = 'tracy_admin'
                         and sw.revoked_at is null and sw.declined_at is null
                         and sw.accepted_at is not null) as staff
         from account a where a.email = $1`,
      [email]
    )
    if (!rows[0]) return c.json({ code: 'NO_SUCH_ACCOUNT' }, 404)
    if (rows[0].staff) return c.json({ code: 'STAFF_TARGET' }, 403)

    // One view at a time: a view still open from before ends here, on the record.
    const before = await endViewSession(c.req.header('cookie'), config.sessionSecret, now())
    if (before) await audit(before.act, 'view_as.end', { target: before.email, by: 'replaced' })

    const token = await mintViewSession(email, who.email, config.sessionSecret, now())
    await audit(who.email, 'view_as.start', reason ? { target: email, reason } : { target: email })
    c.header('set-cookie', viewCookie(token, opts(c)))
    c.header('cache-control', 'no-store')
    return c.json({ url: `${config.origin}/` })
  })

  /**
   * ── POST /auth/view-as/exit — the bar's button ────────────────────────────────────────────────
   * Authenticated by the view cookie itself. Always clears it; ends the view on the record only if
   * it was a live one. Back to `/ops`, where the admin never stopped being the admin.
   */
  app.post('/auth/view-as/exit', async (c) => {
    const ended = await endViewSession(c.req.header('cookie'), config.sessionSecret, now())
    if (ended) await audit(ended.act, 'view_as.end', { target: ended.email, by: 'exit' })
    c.header('set-cookie', clearViewCookie(opts(c)))
    c.header('cache-control', 'no-store')
    return c.redirect(`${config.origin}/ops`, 303)
  })

  return app
}
