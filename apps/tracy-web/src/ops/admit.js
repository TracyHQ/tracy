/**
 * The door to Tracy's own surfaces — ported from `workers/shared/admit.js`, collapsed onto this
 * app's own book: over there, "staff" meant an accepted seat in `seat-registry`'s `tracy_admin`
 * workspace, reached over a service binding (`env.SEATS.fetch('.../tracy-admin/whoami', ...)`).
 * Here the book is the same Postgres this process already holds a pool to, so the question is one
 * query, not a network hop — no `unverified`/rate-limited outcome exists to answer for, because
 * there is no second service that can be briefly down.
 *
 * THREE OUTCOMES, NOT TWO (the Worker's own docstring says this and it still applies):
 *   no session          -> `'sign-in'` — not a refusal, just somebody who has not signed in yet.
 *   session, not staff  -> `null` — a refusal that says NOTHING about what this surface is. The
 *                          caller must turn this into a bare 403 with no body: leaking the
 *                          difference between "not staff" and "no such page" is how an outsider
 *                          maps an internal surface (this task's own binding security note).
 *   session, staff      -> `{ email, role }`.
 *
 * The role query is the SAME predicate as `workspaces/store.js`'s `tracyAdminRoleOf` — kept as a
 * duplicate here rather than imported, because `ops/` is its own module-graph domain (test/
 * module-graph.test.mjs: a domain may import only `lib/` and `db/`, never another domain), and
 * `admit`'s own interface is deliberately `(c, { pool, config })` with no `workspaces` dependency
 * bag — the one thing every route behind this door needs FIRST, before any of the richer
 * `workspaces` functions `opsRoutes` wires in for its `/api/ops/team*` relay.
 */
import { viewer } from '../lib/http.js'

/**
 * @param {import('hono').Context} c
 * @param {{ pool: import('pg').Pool | null, config: object }} deps
 * @returns {Promise<{ email: string, role: string } | 'sign-in' | null>}
 */
export async function admit(c, { pool, config }) {
  const email = await viewer(c, config)
  if (!email) return 'sign-in'
  if (!pool) return null
  const { rows } = await pool.query(
    `select sw.role
       from account a
       join seat_workspace sw on sw.account_id = a.id
       join workspace w on w.id = sw.workspace_id
      where a.email = $1
        and w.kind = 'tracy_admin'
        and sw.revoked_at is null and sw.declined_at is null and sw.accepted_at is not null
      limit 1`,
    [email]
  )
  const role = rows[0]?.role ?? null
  if (!role) return null
  return { email, role }
}

/**
 * How every door on this surface answers when `admit()` refuses.
 *
 * 🔒 ONE IMPLEMENTATION, BECAUSE TWO WOULD DRIFT. `/ops` and `/ops/cms` are different screens with
 * the same door, and the refusal is part of the door: signed out gets sent to the ONE sign-in page
 * with a way back; anybody else gets exactly nothing — no body, no `location`, no clue this path
 * differs from one that was never routed at all. A second copy of these five lines is a second
 * place for somebody to helpfully add an error message that maps the surface for an outsider.
 *
 * Moved here from `route.js` unchanged when `/ops/cms` arrived; `test/ops.test.mjs` and
 * `test/ops-cms.test.mjs` both assert the two shapes.
 * @param {import('hono').Context} c
 * @param {'sign-in' | null} who
 */
export function denied(c, who) {
  if (who === 'sign-in') {
    const next = encodeURIComponent(new URL(c.req.url).pathname)
    return c.redirect(`/login?next=${next}`, 302)
  }
  return c.body(null, 403)
}
