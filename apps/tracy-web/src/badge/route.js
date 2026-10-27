/**
 * The Tracy badge's two public doors. No seat, no session, no cookie — a demo site on someone
 * else's server loads this script, and nothing about a visitor is asked for or read.
 *
 *   GET /tracy-badge.js      the badge itself (`lib/tracy-badge.js`'s advertBadgeScript)
 *   GET /tracy-badge         a demo page: the badge live on a bare page, with the tag to copy
 *   GET /build-with-tracy-demo.js  the banner a JoomlArt demo carries, written into the site at
 *                            install time; `data-template` is what points the link at that demo's
 *                            own Design inspiration card
 *   GET /badge.js            the seat pill on a customer's working copy (`lib/seat-badge.js`) —
 *                            the tag is written by `bar/badge.js`, never by a site itself
 *
 * SINCE 19/09 EVERY SCRIPT IS A FUNCTION OF THE SETTING edited at `/ops/widget` (`badge_setting`,
 * `lib/badge-setting.js`). It is read per request and NEVER lets a customer's page 500: no pool,
 * no row, or a database that is down all serve the defaults. The cache is five minutes so an edit
 * shows without anyone clearing anything.
 *
 * A DOMAIN OF ITS OWN, not a branch of `bar/`. The bar proxies a customer's working copy and holds
 * its whole sign-in round trip; this carries an advertisement onto a page Tracy does not serve.
 * Sharing a module would mean a login flow living one import away from a file that runs on
 * JoomlArt's demo servers.
 */
import { Hono } from 'hono'

import { readBadgeSettings } from '../lib/badge-setting.js'
import { buildWithTracyScript } from '../lib/build-with-tracy-demo.js'
import { inspirationTemplateIds } from '../lib/quickstart-releases.js'
import { seatBadgeScript } from '../lib/seat-badge.js'
import {
  DEFAULT_PROVIDER,
  DEFAULT_TRACY_ORIGIN,
  advertBadgeScript,
  badgeHref,
  badgeSnippet
} from '../lib/tracy-badge.js'

/**
 * The script is public and identical for everyone, so it may sit in a shared cache — for five
 * minutes, the longest a person at `/ops/widget` should wait to see their change on a site.
 *
 * 🔒 A FRESH OBJECT PER RESPONSE, NEVER A SHARED ONE. `@hono/node-server` writes the
 * `content-length` it computes back into the headers object it was handed. With one module-level
 * object the first response's length was stamped onto every later one — harmless while the
 * script was a constant, and a bug the day it became a function of the setting: measured 19/09,
 * `/badge.js` answered `content-length: 14667` for a 14664-byte body after a save, and the
 * browser's fetch failed. `test/tracy-badge.test.mjs` serves two different bodies through the
 * real node-server and reads the header back.
 */
const scriptHeaders = () => ({
  'content-type': 'application/javascript; charset=utf-8',
  'cache-control': 'public, max-age=300',
  // Any demo site may load it; that is the whole point.
  'access-control-allow-origin': '*'
})

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)

/**
 * @param {object} deps
 * @param {{origin?: string}} [deps.config] - this deployment's public origin, for the demo page's
 *   snippet and the badge's default link target.
 * @param {{query: Function} | null} [deps.pool] - where `badge_setting` lives; absent in a build
 *   with no database, and the scripts are the defaults then.
 */
export function badgeRoutes({ config = {}, pool = null } = {}) {
  const app = new Hono()
  const origin = config.origin ?? DEFAULT_TRACY_ORIGIN

  /** The settings, or the defaults when the database cannot answer — a page on someone else's server never sees a 500. */
  const settings = async () => {
    try {
      return await readBadgeSettings(pool)
    } catch {
      return readBadgeSettings(null)
    }
  }
  const script = (render, id) => async () =>
    new Response(render((await settings())[id].setting), { headers: scriptHeaders() })
  /**
   * The template ids Design inspiration offers, or null when they cannot be read: with no database,
   * or one that fails, the banner keeps showing as before rather than vanishing from the demos that
   * do have a card.
   */
  const offered = async () => {
    if (!pool) return null
    try {
      return await inspirationTemplateIds(pool)
    } catch (e) {
      console.warn(
        `[badge] template list unreadable, demo banner unfiltered: ${e instanceof Error ? e.message : String(e)}`
      )
      return null
    }
  }

  app.get('/tracy-badge.js', script(advertBadgeScript, 'advert'))
  app.get('/build-with-tracy-demo.js', async () => {
    const [all, templates] = await Promise.all([settings(), offered()])
    return new Response(buildWithTracyScript(all.advert.setting, templates), { headers: scriptHeaders() })
  })
  app.get('/badge.js', script(seatBadgeScript, 'seat'))

  app.get('/tracy-badge', (c) => {
    const url = new URL(c.req.url)
    const template = (url.searchParams.get('template') ?? 'tracy-business').trim()
    const provider = (url.searchParams.get('provider') ?? DEFAULT_PROVIDER).trim()
    const scriptUrl = `${origin.replace(/\/+$/, '')}/tracy-badge.js`
    const snippet = badgeSnippet({ scriptUrl, template, provider, origin })
    const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Tracy badge</title>
<style>
  body{margin:0;padding:48px 24px 140px;font:17px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f;background:#fff}
  main{max-width:720px;margin:0 auto}
  h1{font-size:40px;line-height:1.05;letter-spacing:-.015em;margin:0 0 12px}
  p{color:#6e6e73;margin:0 0 24px}
  code,pre{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  pre{background:#f5f5f7;border:1px solid #e8e8ed;border-radius:12px;padding:16px;overflow:auto}
  dt{font-weight:600;margin-top:12px}
  dd{margin:0;color:#6e6e73}
  a{color:#0071e3}
</style>
</head>
<body>
<main>
  <h1>Tracy badge</h1>
  <p>One banner for a demo site: Tracy’s mark and “Customize with Tracy”, opening this template on Tracy’s Design templates page. Nothing else — no sign-in, no session, no data about the visitor.</p>
  <p>The badge on this page opens <a href="${escapeHtml(badgeHref({ origin, template, provider }))}">${escapeHtml(badgeHref({ origin, template, provider }))}</a>.</p>
  <h2>Carry it on a site</h2>
  <pre><code>${escapeHtml(snippet)}</code></pre>
  <h2>Attributes</h2>
  <dl>
    <dt>data-template</dt><dd>the template the button opens (<code>?open=</code>). Leave it out and the button opens the gallery.</dd>
    <dt>data-provider</dt><dd>the provider shelf; <code>${escapeHtml(DEFAULT_PROVIDER)}</code> by default.</dd>
    <dt>data-origin</dt><dd>Tracy’s origin; <code>${escapeHtml(DEFAULT_TRACY_ORIGIN)}</code> by default.</dd>
    <dt>data-label</dt><dd>the button’s words; <code>Customize with Tracy</code> by default.</dd>
    <dt>data-position</dt><dd><code>right</code> (default) or <code>left</code>.</dd>
  </dl>
  <p>Try another one: <a href="?template=tracy-base">tracy-base</a> · <a href="?template=tracy-saas">tracy-saas</a></p>
</main>
${snippet}
</body>
</html>
`
    return c.html(page)
  })

  return app
}
