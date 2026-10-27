/**
 * REG-PR-1015-plan-signin-fleet-refused: on a shared host, no seat can start a model-plan sign-in or
 * touch a stored plan credential. `@goodandready/dsh-subscriptions` (0.6.60-tracy.1) runs on every
 * host dsh in the legacy design; it is now disabled. Its reads are absent and mutation routes must be
 * refused by the seat gateway — for an editor seat and for the site's owner seat alike.
 *
 * Each call is a `fetch` made by the page itself (the seat's cookies, its own Origin, Referer and
 * Sec-Fetch headers), so the gate is measured on the request a browser really sends. Bodies are
 * deliberately invalid (unknown provider, empty passphrase): a route that slipped through would
 * answer from the plugin with 400/404/503 and still write nothing.
 *
 * Seats: `REG_SEATS` (comma list, letters or addresses; default `a,b`), each holding the site.
 * Site: `REG_SITE` (default the stand's WordPress site).
 */
import { expect, ORIGIN, seatContext, siteKey, test } from './stand.mjs'

const SITE = process.env.REG_SITE ?? siteKey('wp')
const SEATS = (process.env.REG_SEATS ?? 'a,b').split(',').map((s) => s.trim())

/** Every route the plugin registers (0.6.60-tracy.2, `lib/routes*.js`, `lib/updater.js`) but the two reads. */
const REFUSED = [
  ['GET', '/dsh-subscriptions/oauth/start?provider=claude'],
  ['POST', '/dsh-subscriptions/oauth/device/start'],
  ['POST', '/dsh-subscriptions/oauth/device/poll'],
  ['GET', '/dsh-subscriptions/oauth/callback'],
  ['POST', '/dsh-subscriptions/oauth/complete'],
  ['POST', '/dsh-subscriptions/import-token'],
  ['POST', '/dsh-subscriptions/import'],
  ['POST', '/dsh-subscriptions/import-local'],
  ['POST', '/dsh-subscriptions/export'],
  ['POST', '/dsh-subscriptions/export-backup'],
  ['POST', '/dsh-subscriptions/import-backup'],
  ['POST', '/dsh-subscriptions/vault/export'],
  ['POST', '/dsh-subscriptions/vault/import'],
  ['POST', '/dsh-subscriptions/logout'],
  ['PUT', '/dsh-subscriptions/config'],
  ['POST', '/dsh-subscriptions/check'],
  ['POST', '/dsh-subscriptions/smoke'],
  ['POST', '/dsh-subscriptions/proxy-check'],
  ['POST', '/dsh-subscriptions/proxy/__probe__'],
  ['POST', '/dsh-subscriptions/quarantine/park'],
  ['POST', '/dsh-subscriptions/quarantine/probe'],
  ['POST', '/dsh-subscriptions/reset-credits/prepare'],
  ['POST', '/dsh-subscriptions/reset-credits/consume'],
  ['POST', '/dsh-subscriptions/analyze-session'],
  ['POST', '/dsh-subscriptions/update'],
  ['GET', '/dsh-subscriptions/discover-local'],
  ['GET', '/dsh-subscriptions/reset-credits'],
  ['GET', '/dsh-subscriptions/diagnostics'],
  ['GET', '/dsh-subscriptions/history'],
  ['GET', '/dsh-subscriptions/telemetry'],
  ['GET', '/dsh-subscriptions/alerts'],
  ['GET', '/dsh-subscriptions/subscriptions'],
  ['GET', '/dsh-subscriptions/health'],
  // 0.6.60-tracy.2: the card's options; a seat gets upstream's surfaces instead.
  ['GET', '/dsh-subscriptions/ui']
]
const READS = ['/dsh-subscriptions/status', '/dsh-subscriptions/config']

for (const seat of SEATS) {
  test(`REG-PR-1015 seat ${seat}: no plan sign-in route reaches the host's dsh`, async ({ browser }) => {
    const context = await seatContext(browser, seat)
    const page = await context.newPage()
    // S1: the seat opens its site; the page's own origin then makes every call below.
    await page.goto(`${ORIGIN}/${SITE}/`)
    const base = `${ORIGIN}/${SITE}`
    const call = (method, path) =>
      page.evaluate(
        async ({ url, method }) => {
          // `manual`: a redirect (to the sign-in page, say) must not pass as an answer from the host.
          const res = await fetch(url, {
            method,
            redirect: 'manual',
            headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
            body: method === 'GET' ? undefined : JSON.stringify({ provider: '__probe__', passphrase: '' })
          })
          return {
            status: res.status,
            body: (await res.text())
              .replace(/<[^>]*>/g, ' ')
              .replace(/\s+/g, ' ')
              .slice(0, 400)
          }
        },
        { url: `${base}${path}`, method }
      )
    // The account broker answers the signed-in seat; the retired host plugin has no read doors.
    const first = await context.request.get(`${ORIGIN}/api/seat-plan/status`)
    expect(first.status(), 'the account broker must recognize the seat').toBe(200)
    expect((await first.json()).routing).toHaveProperty('tracyFallback')
    // S2: every write, sign-in, export and diagnostics route is refused by the gate.
    for (const [method, path] of REFUSED) {
      const answer = await call(method, path)
      console.log(`${seat} ${method} ${path} -> ${answer.status}`)
      expect(answer.status, `${method} ${path}`).toBe(403)
      expect(answer.body).toContain('only available to the owner account')
    }
    // S3: the retired host plugin exposes neither status nor config.
    for (const path of READS) {
      const answer = await call('GET', path)
      console.log(`${seat} GET ${path} -> ${answer.status}`)
      expect(answer.status, path).toBe(404)
    }
  })
}
