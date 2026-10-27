/**
 * `GET /api/config` — the one public door a plugin's client reads instead of writing one of
 * Tracy's own addresses as a literal.
 *
 * WHY A DOOR AND NOT A BUILD-TIME CONSTANT (Task 11, spec §so-ghe-va-site). A plugin's built
 * `lib/client.js` is committed and shipped inside a customer's own container — a literal baked in
 * at build time is the SAME literal for a lane running on `contabo`, a lane running on `local`,
 * and a lane inside a Storybook fixture, because none of those know which one built the bundle.
 * Reading this door instead means the ANSWER changes with the deployment, not the code.
 *
 * A ROOT DOOR, LIKE THE OTHER FOUR. `/api/sites`, `/auth/me`, `/api/team` and `/login` stay
 * root-absolute because the Worker (now this app) IS the host's root — a plugin published under
 * `<host>/<siteKey>/` must still reach them at the bare root, never through its own `<base
 * href>`. `/api/config` is the fifth: never call it through `dshUrl()`. (No per-plugin
 * `dsh-url.ts` has been updated to list it yet — that doc lives only here for now.)
 *
 * Public and cacheable: nothing in the answer is a secret, and every plugin reads it once per
 * page load (`@tracy/core/config`'s `tracyConfig()` memoizes the promise the same way
 * `@tracy/core/seat`'s `readViewer()` does for `/auth/me`).
 */
import { Hono } from 'hono'
import { json } from '../lib/http.js'

/**
 * The explicit port in an origin, or '' when there is none (`https://x` → '', `http://x:8080` → '8080').
 * Never throws: a malformed origin answers '' rather than taking the door down.
 *
 * @param {string} origin
 * @returns {string}
 */
function sitePortOf(origin) {
  try {
    return new URL(origin).port
  } catch {
    return ''
  }
}

/**
 * @param {object} deps
 * @param {object} deps.config - `readConfig`'s value.
 * @returns {import('hono').Hono}
 */
export function configRoutes({ config }) {
  const app = new Hono()

  app.get('/api/config', (c) => {
    c.header('cache-control', 'public, max-age=60')
    return json(c, {
      origin: config.origin,
      siteDomain: config.siteDomain,
      siteDomainAliases: config.siteDomainAliases,
      // The port a browser must actually type to reach a site, or '' when the scheme's default
      // is right. Derived from THIS process's own origin rather than from `SITE_HTTP_PORT`,
      // because locally tracy-web IS the front door for site hostnames (Plan 4 Task 1's
      // Host-based routing) — so a site answers on exactly the port this app publishes, and the
      // two can never drift apart. In production the origin is `https://…` with no port and this
      // is '', which is why it is not read from an env var with an `8080` default: that default
      // is correct on a laptop and wrong on every real deployment.
      sitePort: sitePortOf(config.origin),
      // The session cookie's own `Domain=` — empty means host-only, and a caller must NOT write
      // a `Domain=` attribute at all in that case (a browser refuses a cookie whose Domain does
      // not match the host, same reason `lib/session.js` leaves it unset on localhost).
      cookieDomain: config.sessionDomain ?? '',
      badgeUrl: config.badgeUrl,
      hostOrg: config.hostOrg
    })
  })

  return app
}
