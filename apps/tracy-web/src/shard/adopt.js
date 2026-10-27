// apps/tracy-web/src/shard/adopt.js
/**
 * `POST /_shard/adopt` (contract §4 steps 2-3): the master hands a person to this shard. The master
 * made the nonce and sends only its hash; this door makes the mirror account when it is missing
 * (no code is mailed), `touchAccount`s it, and answers a one-time ticket — 32 random bytes,
 * base64url — kept only as its sha256 beside the nonce hash and the `next` to land on. The master
 * then sets `tracy_handoff=<nonce>` and answers `302 https://<shard>/handoff?t=<ticket>`.
 */
import { json } from '../lib/http.js'
import { matchLanguage } from '../lib/i18n/index.js'
import { safePath } from '../lib/safe-path.js'
import { adoptMirror, issueTicket, mirrorOf, shardStatus } from './node-store.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NONCE_HASH = /^[0-9a-f]{64}$/

/**
 * Where the ticket lands: a path of this shard, `/new/` when none is given. Never a sign-in or
 * handoff door (contract §4 1a: `/handoff`, `/login`, `/verify`, `/signin/*`, `/auth/*`) — those
 * would bounce the person straight back to the master, and a ticket landing there would loop.
 */
const NOT_A_LANDING = /^\/(?:handoff|login|verify)$|^\/(?:signin|auth)\//
function landingOf(raw, origin) {
  const url = new URL(safePath(typeof raw === 'string' && raw !== '' ? raw : '/new/', origin))
  return NOT_A_LANDING.test(url.pathname) ? '/new/' : `${url.pathname}${url.search}`
}

/** The body exactly as the contract writes it, or null. */
function readBody(raw) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return null
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const key = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : ''
  if (!EMAIL.test(email) || email.length > 254) return null
  if (input.source !== 'master' || key === '' || key.length > 200) return null
  // A person may have no display name and no language (email-code sign-ups, nullable columns at the
  // master): both are optional, null or missing reads as empty. Anything but a string is off-contract.
  for (const key of ['displayName', 'locale'])
    if (input[key] !== undefined && input[key] !== null && typeof input[key] !== 'string') return null
  if (typeof input.nonceHash !== 'string' || !NONCE_HASH.test(input.nonceHash)) return null
  if (input.next !== undefined && input.next !== null && typeof input.next !== 'string') return null
  return {
    email,
    key,
    displayName: (input.displayName ?? '').trim().slice(0, 120),
    locale: input.locale ?? '',
    nonceHash: input.nonceHash,
    next: input.next ?? null
  }
}

export function adoptDoor(app, { config, pool, identity, now, isShard, notAShard, signed }) {
  app.post('/_shard/adopt', async (c) => {
    c.header('cache-control', 'no-store')
    if (!isShard()) return notAShard(c)
    const call = await signed(c)
    if (call.refused) return call.refused
    const input = readBody(call.body)
    if (!input) return json(c, { code: 'BAD_BODY' }, 400)
    // A full shard (or one that has not read the catalogue) takes no NEW person; a known one comes back.
    if (!(await mirrorOf(pool, input.email))) {
      const status = await shardStatus(pool, { maxSites: config.shard.maxSites })
      if (!status.accepting) {
        console.warn(
          `[shard] adopt refused: ${status.releases_read_at === null ? 'catalogue not read yet' : 'site cap reached'}`
        )
        return json(c, { code: 'SHARD_FULL' }, 503)
      }
    }
    const account = await identity.touchAccount(input.email, {
      admission: { status: 'allow', badge: 'master handoff', plans: [], gate: false },
      via: 'master handoff'
    })
    const adopted = await adoptMirror(pool, {
      email: input.email,
      accountId: account.id,
      idempotencyKey: input.key
    })
    if (adopted.conflict) return json(c, { code: 'MIRROR_CONFLICT' }, 409)
    const language = input.locale ? matchLanguage(input.locale) : null
    try {
      if (input.displayName) await identity.rememberProfile?.(account.id, { name: input.displayName })
      if (language) await identity.rememberLanguage?.(input.email, language)
    } catch (error) {
      console.warn(`[shard] profile of an adopted account not saved: ${error?.message ?? error}`)
    }
    const issued = await issueTicket(pool, {
      email: input.email,
      nonceHash: input.nonceHash,
      next: landingOf(input.next, config.origin),
      now: now()
    })
    return json(c, {
      accountId: account.id,
      handoff: issued.ticket,
      expiresAt: issued.expiresAt.toISOString()
    })
  })
}
