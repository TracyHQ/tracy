/**
 * `GET /handoff?t=<ticket>` (contract §4 step 5): the browser arrives from the master with the
 * ticket in `t` and the nonce in the `tracy_handoff` cookie the master set. Only `t` is read — a
 * `next` in the query is ignored; where to land was stored with the ticket at adopt. The ticket is
 * spent by one `UPDATE … RETURNING` whatever follows, then sha256 of the cookie must equal its
 * `nonce_hash` (`shard/node-store.js` `redeemTicket`). More than one `tracy_handoff` in the `Cookie`
 * header is a broken ticket at once (§3.1 (3)): a site under the parent domain may have planted a
 * second nonce. Good: a session of this shard (`tracy_sess_<name>`) and `302` to the stored `next`;
 * the shard never sets the master's pointer cookie. Anything else: `302 <master>/login?next=<this
 * shard + the next stored with the ticket, `/new/` when none is found>` — never back to
 * `/handoff` — and no session; the URL carries `&handoff=failed` so a master that is already signed
 * in answers a page instead of a second ticket. The nonce cookie is cleared either way, with W1's
 * builder (`Path=/`, the parent `Domain`, as the master wrote it); when more than one arrived, every
 * copy (parent `Domain` and host-only, `Path=/` and `Path=/handoff`) is cleared. The ticket is never logged.
 */
import {
  clearHandoffCookie,
  clearHandoffCookieEverywhere,
  HANDOFF_COOKIE,
  parseCookies
} from '../lib/cookies.js'
import { safePath } from '../lib/safe-path.js'
import { cookieDomainFor, mintSession, sessionCookie } from '../lib/session.js'
import { HANDOFF_FAILED_PARAM, HANDOFF_FAILED_VALUE, TICKET } from '../lib/shard-shapes.js'
import { redeemTicket, ticketNext } from './node-store.js'

/**
 * Where a person goes to sign in, coming back to `next` (a path or URL of THIS shard). `failed`: the
 * person comes from a handoff that did not open; the master reads `handoff=failed` and, when it
 * already holds a session, answers a page instead of minting a second ticket (no redirect loop).
 */
export function masterLoginUrl(config, next, { failed = false } = {}) {
  const url = `${config.shard.masterOrigin}/login?next=${encodeURIComponent(safePath(next, config.origin))}`
  return failed ? `${url}&${HANDOFF_FAILED_PARAM}=${HANDOFF_FAILED_VALUE}` : url
}

/** How many `tracy_handoff` cookies a raw `Cookie` header carries (`parseCookies` keeps only the last). */
function handoffCookiesIn(header) {
  return (header ?? '')
    .split(';')
    .filter((part) => part.slice(0, part.indexOf('=')).trim() === HANDOFF_COOKIE).length
}

export function handoffDoor(app, { config, pool, now, isShard, notAShard }) {
  app.get('/handoff', async (c) => {
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    if (!isShard()) return notAShard(c)
    const opts = {
      domain: cookieDomainFor(c.req.header('host'), config.sessionDomain),
      secure: config.secure
    }
    // The nonce goes whatever happens: it was good for this one hop.
    c.header('set-cookie', clearHandoffCookie(opts), { append: true })
    const ticket = c.req.query('t') ?? ''
    const cookieHeader = c.req.header('cookie')
    // Two nonces are no nonce: the ticket is still spent (an empty nonce opens nothing).
    const planted = handoffCookiesIn(cookieHeader) > 1
    const nonce = planted ? '' : (parseCookies(cookieHeader).get(HANDOFF_COOKIE) ?? '')
    // 🔒 A planted copy survives the `Path=/` clearing above (a browser keeps one cookie per name,
    // domain and path), so every later handoff would be broken again: kill every copy there is.
    if (planted)
      for (const line of clearHandoffCookieEverywhere(opts)) c.header('set-cookie', line, { append: true })
    const redeemed = TICKET.test(ticket) ? await redeemTicket(pool, { ticket, nonce, now: now() }) : null
    if (!redeemed) {
      // 🔒 A ticket that is wrong, spent, late or without its nonce says nothing: back to sign in, to
      // the page its row stored (the person asked for it at the master), `/new/` when no row is found.
      // Never `/handoff`: adopt never stores it (`shard/adopt.js` `landingOf`), and neither does this.
      const stored = TICKET.test(ticket) ? await ticketNext(pool, ticket) : null
      // The marker tells a master that already holds a session not to mint a second ticket for the
      // same browser (a broken handoff the person cannot repair would loop for ever).
      return c.redirect(masterLoginUrl(config, stored ?? '/new/', { failed: true }), 302)
    }
    const token = await mintSession(redeemed.email, config.sessionSecret, now())
    c.header('set-cookie', sessionCookie(token, { ...opts, name: config.sessionCookieName }), {
      append: true
    })
    return c.redirect(safePath(redeemed.next ?? '/new/', config.origin), 302)
  })
}
