/**
 * The two moments a sign-in on the master meets the shard model (docs/sre/2026-10-15-shard-beta-
 * design.md §2.1, §2.2, §4.1; §13 S40). Nothing runs before a code: `POST /login` sends one to
 * every address as it always did, so a sign-in door never answers differently for an address that
 * has an account and one that has not (#794; the pre-OTP check was dropped on 15/10/2026).
 *   afterSignIn — the address was proven (code, Google/GitHub, JoomlArt, a desktop round) and the session is NOT
 *     minted yet: point the browser at the person's shard, or take away a pointer that names
 *     somebody else's; a new person no shard can take is refused here, so no session ever exists
 *     for them. Nothing is adopted here; the next master page the browser opens sends it to
 *     `/login?next=<shard URL>` (`route-cookie.js`).
 *   atLogin — `GET /login?next=<URL on a shard>`: signed out, keep that URL through the sign-in as a
 *     master path; signed in, adopt and hand the browser over. Only a `next` whose origin is a shard
 *     in the table is acted on (review amendment 2): anything else is the login door's, as before.
 *     Both shards refusing a new person is the same refusal, and the session minted one hop earlier
 *     goes back with it: nothing of theirs stays on this master (S40).
 * The ONE door that issues tickets, whichever way the person signed in. An empty `shard` table is a
 * master without the shard model: every hook answers as if it were not there.
 */
import {
  clearShardCookie,
  handoffCookie,
  parseCookies,
  shardCookie,
  shardCookieName
} from '../lib/cookies.js'
import { requestLanguage } from '../lib/i18n/index.js'
import { safePath } from '../lib/safe-path.js'
import { clearSessionCookie, cookieDomainFor, revokeSessionsIn } from '../lib/session.js'
import { HANDOFF_FAILED_PARAM, HANDOFF_FAILED_VALUE, MASTER_SHARD } from '../lib/shard-shapes.js'
import { noneAlert } from './adopt-client.js'
import { noShardAcceptingResponse } from './beta-full-page.js'
import { destinationOf } from './directory.js'
import { pickShard } from './pick.js'

export function shardSignIn({
  pool,
  book,
  config,
  handoff,
  signal = null,
  pages,
  now = Date.now,
  log = console
}) {
  const cookieOpts = (c) => ({
    domain: cookieDomainFor(c.req.header('host') ?? new URL(c.req.url).host, config.sessionDomain),
    secure: config.secure
  })
  const countryOf = (c) => c.req.header('cf-ipcountry') ?? null
  const refused = (c, json, cookies = []) =>
    noShardAcceptingResponse({ lang: requestLanguage(c), json, cookies })

  /**
   * The shard a new person would be pointed at now, or null — and whether there is a shard model at
   * all. A table with shards and none fit is told to the ops topic, once a quarter hour.
   */
  async function firstShardFor(c) {
    const shards = [...(await book.all()).values()]
    if (shards.length === 0) return { deployed: false, pointer: null }
    const pointer = pickShard(shards, { now: now(), country: countryOf(c) })?.name ?? null
    if (!pointer) await signal?.record('shard.none', noneAlert('NO_ELIGIBLE_SHARD', now()))
    return { deployed: true, pointer }
  }

  /**
   * The address is proven and no session exists yet. Sets the pointer for the person's shard (the
   * emptiest one for somebody new), clears a pointer an s0 person carries for somebody else, and
   * answers null — or `503 NO_SHARD_ACCEPTING` for a new person no shard takes, after which the
   * caller mints no session. An error of its own never fails the sign-in: a pointer not written is a
   * person who stays here this once.
   */
  async function afterSignIn(c, email, { json = false, point = true } = {}) {
    try {
      const opts = cookieOpts(c)
      const home = await destinationOf({ pool, email, allow: config.shardAdoptAllow })
      let pointer = home === MASTER_SHARD ? null : home
      if (home === null) {
        const first = await firstShardFor(c)
        if (first.deployed && !first.pointer) return refused(c, json)
        pointer = first.pointer
      }
      // `point: false`: the decision (and the S40 refusal above) is the same, but no pointer is
      // written or taken away — for a client that cannot follow a handoff (the desktop app's redeem).
      if (!point) return null
      if (pointer) c.header('set-cookie', shardCookie(pointer, opts), { append: true })
      else if (parseCookies(c.req.header('cookie') ?? null).has(shardCookieName(config.secure)))
        c.header('set-cookie', clearShardCookie(opts), { append: true })
      return null
    } catch (error) {
      log.warn(`[shards] sign-in pointer not written: ${error?.message ?? error}`)
      return null
    }
  }

  async function atLogin(c, email, next) {
    if (typeof next !== 'string' || !/^https?:\/\//i.test(next)) return null
    let origin
    try {
      origin = new URL(next).origin
    } catch {
      return null
    }
    let shard
    try {
      shard = await book.byOrigin(origin)
    } catch (error) {
      // The shard table cannot be read: this is a master without a usable shard model for now.
      log.warn(`[shards] shard table not read at sign-in: ${error?.message ?? error}`)
      return null
    }
    if (!shard) return null
    if (!email) return { next: `/login?next=${encodeURIComponent(next)}` }
    // 🔒 The shard sent this browser back because its handoff did not open, and the person already has
    // a session here: a second ticket would only break the same way (a planted `tracy_handoff`, say)
    // and the two doors would loop. Say so instead; the next press starts one fresh round.
    if (c.req.query(HANDOFF_FAILED_PARAM) === HANDOFF_FAILED_VALUE)
      return pages.workspaceUnavailable(email, {
        retryHref: '/',
        kept: true,
        origin: config.origin,
        lang: requestLanguage(c)
      })
    const opts = cookieOpts(c)
    if (!opts.domain) {
      log.warn('[shards] SESSION_DOMAIN does not cover this host, so no ticket can reach a shard')
      return null
    }
    // `handoffFor` keeps this path only when the shard that gets the ticket is `shard`; on any other
    // it is `/new/` (contract §4 1a).
    const nextPath = safePath(next, shard.origin).slice(shard.origin.length) || '/'
    const decision = await handoff.handoffFor({ email, wanted: shard.name, nextPath, country: countryOf(c) })
    if (decision.kind === 'unavailable')
      return pages.workspaceUnavailable(email, {
        retryHref: '/',
        kept: true,
        origin: config.origin,
        lang: requestLanguage(c)
      })
    // No shard took a new person (S40): the session minted at sign-in goes back with the refusal,
    // and so does the pointer naming a shard that refused; the next sign-in starts the round again.
    if (decision.kind === 'none') {
      // The session minted one hop earlier is ended on the server too (J1.3): clearing the cookie
      // alone leaves a token that still works for anyone who kept a copy.
      try {
        await revokeSessionsIn(c.req.header('cookie'), config.sessionSecret, now())
      } catch (error) {
        log.warn(`[shards] session of a refused sign-in not ended on the server: ${error?.message ?? error}`)
      }
      return refused(c, false, [clearSessionCookie(opts), clearShardCookie(opts)])
    }
    c.header('cache-control', 'no-store')
    if (decision.kind === 'handoff') {
      // The 302 carries the ticket in its URL: no page it lands on may learn it (contract §4).
      c.header('referrer-policy', 'no-referrer')
      c.header('set-cookie', shardCookie(decision.shard.name, opts), { append: true })
      c.header('set-cookie', handoffCookie(decision.nonce, opts), { append: true })
      return c.redirect(decision.url, 302)
    }
    c.header('set-cookie', clearShardCookie(opts), { append: true })
    return c.redirect(safePath(nextPath, config.origin), 302)
  }

  /**
   * `GET /new/?fresh=1` on the master, signed in (contract §12; `route-cookie.js` calls it): the
   * person's shard is full, so they start on another — a ticket and the two cookies, as `atLogin`.
   * No other shard takes them → `503 NO_SHARD_ACCEPTING` (S40): nothing is made here, and their
   * session and pointer stay as they are, since they still live on the shard that sent them. Null
   * only for somebody this master keeps (s0) — then it answers the page itself.
   */
  async function atFresh(c, email) {
    const opts = cookieOpts(c)
    if (!opts.domain) {
      log.warn('[shards] SESSION_DOMAIN does not cover this host, so no ticket can reach a shard')
      return null
    }
    let decision
    try {
      decision = await handoff.handoffFor({
        email,
        fresh: true,
        nextPath: '/new/',
        country: countryOf(c)
      })
    } catch (error) {
      // The shard table (or the account) cannot be read: the master answers `/new/` itself, as a
      // master without the shard model would.
      log.warn(`[shards] fresh start not handed over: ${error?.message ?? error}`)
      return null
    }
    if (decision.kind === 'unavailable')
      return pages.workspaceUnavailable(email, {
        retryHref: '/',
        kept: true,
        origin: config.origin,
        lang: requestLanguage(c)
      })
    if (decision.kind === 'none') return refused(c, false)
    if (decision.kind !== 'handoff') return null
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    c.header('set-cookie', shardCookie(decision.shard.name, opts), { append: true })
    c.header('set-cookie', handoffCookie(decision.nonce, opts), { append: true })
    return c.redirect(decision.url, 302)
  }

  return { afterSignIn, atLogin, atFresh }
}
