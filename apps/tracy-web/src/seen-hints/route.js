/**
 * The account's one-time site tour and voice tip marks. Reads never create an account; writes
 * create one when the signed-in email has none yet, just like onboarding/route.js. The app's
 * global csrfGuard enforces the same-origin JSON write policy before these handlers.
 */
import { Hono } from 'hono'
import { json, requireViewer } from '../lib/http.js'
import { markHintSeen, seenHints, SEEN_HINTS } from './store.js'

/** @param {{config: {sessionSecret: string}, pool: import('pg').Pool}} deps */
export function seenHintRoutes({ config, pool }) {
  const app = new Hono()

  app.use('/api/seen-hints', async (c, next) => {
    c.header('cache-control', 'no-store')
    await next()
  })

  app.get('/api/seen-hints', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const { rows } = await pool.query('select id from account where email = $1', [email.toLowerCase()])
    return json(c, { hints: rows[0] ? await seenHints(pool, rows[0].id) : [] })
  })

  app.post('/api/seen-hints', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.hint !== 'string' || !SEEN_HINTS.includes(body.hint)) {
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    }
    const { rows } = await pool.query(
      `insert into account (email) values ($1)
       on conflict (email) do update set email = excluded.email
       returning id`,
      [email.toLowerCase()]
    )
    await markHintSeen(pool, rows[0].id, body.hint)
    return json(c, { hints: await seenHints(pool, rows[0].id) })
  })

  return app
}
