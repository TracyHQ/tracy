/**
 * The share link door (`lib/wo-demo-links.js`, migration 216), on Tracy's own origin, no sign-in:
 *
 *   GET /d/:token      302 to the demo's address; counts the open
 *   GET /d/:token/*    the same, to that path of the demo (`/d/<token>/menu` → `<address>/menu`)
 *
 * An unknown or revoked token answers 404, a link whose demo was deleted 410, both with no body and nothing counted.
 * Counting never holds the redirect: a database that cannot write the open still sends the person on.
 */
import { Hono } from 'hono'
import { bornSiteAddress } from '../lib/site-address.js'
import { viewer } from '../lib/http.js'
import { overLimit } from '../lib/rate.js'
import {
  askedPath,
  automatedOpen,
  DEMO_LINK_TOKEN,
  DEMO_OPENS_PER_HOUR,
  demoTarget,
  deviceClassOf,
  recordOpen
} from '../lib/wo-demo-links.js'

const LINK_ROW = `select l.id, l.account_id, l.revoked_at, a.email, b.label, b.state, b.demo_deleted_at,
    st.address
  from wo_demo_link l
  join wo_build b on b.id = l.build_id
  join account a on a.id = l.account_id
  left join site st on st.site_key = b.site_key
  where l.token = $1`

/**
 * @param {{ pool: import('pg').Pool, config: { origin: string, sessionSecret: string, siteDomain?: string },
 *   now?: () => number, log?: Pick<Console, 'warn'> }} deps
 */
export function demoLinkRoutes({ pool, config, now = Date.now, log = console }) {
  const app = new Hono()
  const empty = (c, status) => {
    c.header('cache-control', 'no-store')
    c.header('x-robots-tag', 'noindex')
    return c.body(null, status)
  }

  async function open(c) {
    const token = c.req.param('token')
    if (!DEMO_LINK_TOKEN.test(token)) return empty(c, 404)
    const link = (await pool.query(LINK_ROW, [token])).rows[0]
    if (!link || link.revoked_at) return empty(c, 404)
    if (link.demo_deleted_at || link.state === 'deleted') return empty(c, 410)
    const address =
      link.address ?? (link.label && config.siteDomain ? bornSiteAddress(link.label, config) : null)
    const path = askedPath(c.req.path.slice(`/d/${token}`.length))
    const target = address ? demoTarget(address, path, new URL(c.req.url).search) : null
    if (!target) return empty(c, 404)
    if (await counted(c, link)) {
      const at = now()
      try {
        if (!(await overLimit(pool, `wo-demo-open:${link.id}`, DEMO_OPENS_PER_HOUR, at)))
          await recordOpen(pool, { linkId: link.id, path, device: deviceClassOf(c.req.raw.headers), at })
      } catch (error) {
        log.warn?.(`[wo-demo-link] open not counted: ${error?.code ?? error?.message ?? 'error'}`)
      }
    }
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    c.header('x-robots-tag', 'noindex')
    return c.redirect(target, 302)
  }

  /** A person opening it, who is not the seller signed in to Tracy in this browser. */
  async function counted(c, link) {
    if (automatedOpen(c.req.method, c.req.raw.headers)) return false
    const email = await viewer(c, config).catch(() => null)
    return !email || email.toLowerCase() !== String(link.email).toLowerCase()
  }

  app.get('/d/:token', open)
  app.get('/d/:token/*', open)
  return app
}
