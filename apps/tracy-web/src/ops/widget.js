/**
 * `/api/ops/widget` — the Widget screen: what the two badges say and look like.
 *
 * `seat` is the pill on a customer's working copy (`/badge.js`), `advert` the banner a demo
 * carries (`/tracy-badge.js` and its JoomlArt twin). Both documents live in `badge_setting`
 * (`lib/badge-setting.js` holds the shape, the defaults and the validator); the served scripts read
 * them per request, so a save here shows on sites within the scripts' five-minute cache and
 * nobody deploys anything.
 *
 * THREE DOORS. The read answers both documents plus the defaults, so the screen can offer "reset".
 * The write takes ONE badge's whole document and the revision the screen read — the same
 * optimistic rule `demos.js`'s address pin follows — and refuses a stale one with 409 rather than
 * overwriting what a colleague just saved. The preview renders a document that is NOT saved into
 * the very script the site would get, so what the screen shows in its frame is the script, not a
 * drawing of it.
 *
 * 🔒 WHAT A PERSON TYPES HERE LANDS ON CUSTOMERS' PAGES, which is why there is no free CSS field
 * and why the validator refuses an unknown key, a colour that is not `#rrggbb` and a label with a
 * tag in it — at the door, by path, so the screen can point at the field. The preview is admitted
 * like a read (any staff role) but validated like a write: a document the write would refuse is
 * not rendered either.
 */
import { Hono } from 'hono'

import {
  DEFAULT_SETTING,
  readBadgeSettings,
  saveBadgeSetting,
  validateBadgeSetting
} from '../lib/badge-setting.js'
import { seatBadgeScript } from '../lib/seat-badge.js'
import { advertBadgeScript } from '../lib/tracy-badge.js'
import { admit, denied } from './admit.js'

const RENDER = { seat: seatBadgeScript, advert: advertBadgeScript }

export function widgetRoutes({ pool, config }) {
  const app = new Hono()

  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      // The PUBLIC origin, not the request's — see `demos.js` for the measurement behind this.
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  const jsonBody = async (c) => {
    if (!c.req.header('content-type')?.startsWith('application/json')) return { deny: c.body(null, 403) }
    const body = await c.req.json().catch(() => null)
    return body && typeof body === 'object'
      ? { body }
      : { deny: c.json({ error: 'INVALID_SETTING', path: '' }, 400) }
  }

  app.get('/api/ops/widget', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const settings = await readBadgeSettings(pool)
    return c.json({
      ...settings,
      defaults: DEFAULT_SETTING,
      writable: ['owner', 'admin'].includes(g.who.role)
    })
  })

  app.put('/api/ops/widget/:id', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const id = c.req.param('id')
    if (!(id in RENDER)) return c.json({ error: 'UNKNOWN_BADGE' }, 404)
    const b = await jsonBody(c)
    if (b.deny) return b.deny
    const result = await saveBadgeSetting(pool, id, b.body.setting, b.body.revision ?? 0, g.who.email)
    const status = result.error === 'BADGE_CHANGED' ? 409 : result.error ? 400 : 200
    return c.json(result, status)
  })

  app.post('/api/ops/widget/:id/preview', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const id = c.req.param('id')
    if (!(id in RENDER)) return c.json({ error: 'UNKNOWN_BADGE' }, 404)
    const b = await jsonBody(c)
    if (b.deny) return b.deny
    const checked = validateBadgeSetting(id, b.body.setting)
    if (checked.error) return c.json(checked, 400)
    return c.body(RENDER[id](checked.setting), 200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store'
    })
  })

  return app
}
