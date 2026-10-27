/**
 * `/ops` › User Interface — the doors of the operator's switches over the customer's dsh page.
 */
import { Hono } from 'hono'

import {
  UI_CATALOGUE,
  parseUiPress,
  readUiHidden,
  readUiOverrides,
  saveUiSwitches
} from '../lib/ui-setting.js'
import { admit, denied } from './admit.js'

export function uiRoutes({ pool, config }) {
  const app = new Hono()

  /** Everyone who may see /ops may read; only an owner or admin, from this origin, may press. */
  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  /**
   * ── GET /api/ui — which pieces does the customer's page hide? ─────────────────────────────────
   *
   * Public and not admitted: the reader is every plugin on every customer page (`@tracy/core/
   * ui-switches`), signed in or not, and the answer is no secret — the customer sees its effect.
   * Read per request with `no-store`, so an operator's press reaches the next page load.
   */
  app.get('/api/ui', async (c) => {
    c.header('cache-control', 'no-store')
    return c.json({ hidden: await readUiHidden(pool) })
  })

  /**
   * ── GET /api/ops/ui — the screen's whole document ─────────────────────────────────────────────
   *
   * The catalogue as data (areas, groups, every switch with its default, `pending` and `warning`)
   * plus where each one stands on this deployment. The screen draws from this, never from its own
   * copy of the list, so a switch added to the catalogue appears on /ops with no screen change.
   */
  app.get('/api/ops/ui', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const { overrides, updatedBy, updatedAt } = await readUiOverrides(pool)
    return c.json({
      areas: UI_CATALOGUE.areas,
      groups: UI_CATALOGUE.groups,
      switches: UI_CATALOGUE.switches.map((s) => ({ ...s, on: overrides[s.id] ?? s.defaultOn })),
      updatedBy,
      updatedAt,
      writable: ['owner', 'admin'].includes(g.who.role)
    })
  })

  /**
   * ── PUT /api/ops/ui — press switches: `{ switches: { "<id>": true|false } }` ─────────────────
   *
   * Nothing is written unless every id is in the catalogue and every value a boolean: a half-applied
   * press would leave the screen and the customer's page disagreeing about what was pressed.
   */
  app.put('/api/ops/ui', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const press = parseUiPress(await c.req.json().catch(() => null))
    if (!press.ok) return c.json({ error: press.error, ...(press.id ? { id: press.id } : {}) }, 400)
    await saveUiSwitches(pool, press.switches, g.who.email)
    return c.json({ hidden: await readUiHidden(pool) })
  })

  return app
}
