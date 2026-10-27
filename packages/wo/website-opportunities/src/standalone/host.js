/**
 * The standalone `host` (`../host.js`, ADR 0036 decision 2): the open Website Opportunities layer run by ONE
 * operator, with no accounts, sessions or operator switches around it.
 *
 * Who is the operator: with `operatorToken`, whoever sends `Authorization: Bearer <token>`; without one, only a
 * connection from this machine that also names it (`localhost`, `127.0.0.1`, `[::1]` in `Host`), so a page
 * elsewhere cannot rebind its own name to 127.0.0.1 and act as the operator.
 *
 * Every caller let in is the one operator principal (`./operator-principal.js`).
 *
 * Rate limits count in this process's memory (`memoryRateLimiter`): the standalone server is one process, and
 * it keeps the open schema free of a counter table. A restart starts every window again, the daily paid-call
 * caps included; the operator pays their own keys, so that is theirs to accept.
 */
import { isIP } from 'node:net'
import { memoryRateLimiter } from './memory-rate.js'
import { operatorPrincipalId } from './operator-principal.js'
import { pictureFeatures } from './picture-features.js'
import { sameSecret as sameConfiguredSecret } from './same-secret.js'

const HOUR_MS = 3_600_000
const MIN_TOKEN_LENGTH = 24
const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/** A refusal in the open layer's `{code, next}` shape. */
const unauthenticated = (c) =>
  json(
    c,
    { code: 'UNAUTHENTICATED', next: 'Send the operator token as "Authorization: Bearer <token>".' },
    401
  )

function json(c, body, status = 200) {
  c.header('content-type', 'application/json; charset=utf-8')
  return c.body(JSON.stringify(body), status)
}

/** The TCP peer's address (Node adapter), without an IPv4-mapped prefix; null when there is no socket. */
function socketAddress(c) {
  const raw = c.env?.incoming?.socket?.remoteAddress
  if (typeof raw !== 'string' || !isIP(raw)) return null
  return raw.toLowerCase().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '')
}

const isLoopback = (address) => address === '::1' || (address ?? '').startsWith('127.')

/** The `Host` header's name without its port. */
function hostName(c) {
  const raw = (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase()
  return raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]
}

/**
 * @param {{ config: { operatorEmail?: string, operatorName?: string | null, operatorToken?: string | null,
 *   trustProxy?: boolean } }} deps
 * @returns {import('../host.js').WoHost}
 */
export function createStandaloneHost({ config }) {
  const email = config.operatorEmail || 'operator@localhost'
  const token = config.operatorToken || null
  if (token !== null && token.length < MIN_TOKEN_LENGTH)
    throw new Error(`OPERATOR_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`)
  const trustProxy = config.trustProxy === true
  const displayName = config.operatorName ?? ''
  const rate = memoryRateLimiter()

  function clientIp(c) {
    if (trustProxy) {
      // The proxy appends the address it saw; anything before it was written by the caller.
      const last = (c.req.header('x-forwarded-for') ?? '').split(',').pop()?.trim().toLowerCase() ?? ''
      if (isIP(last)) return last
    }
    return socketAddress(c)
  }

  async function requireViewer(c) {
    if (token) {
      const sent = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1]
      return sameSecret(sent, token) ? email : unauthenticated(c)
    }
    // Local-only mode reads the socket, never a forwarded header.
    return isLoopback(socketAddress(c)) && LOOPBACK_NAMES.has(hostName(c)) ? email : unauthenticated(c)
  }

  return {
    json,
    requireViewer,
    // One operator: whoever may use the app runs it. Writes are fenced by the token (or loopback) and a JSON body.
    requireOperator: (c) => requireViewer(c),
    clientIp,
    principalOf: (pool) => operatorPrincipalId(pool),
    // The signature under outreach drafts (`OPERATOR_NAME`).
    displayNameOf: async () => displayName,
    async overLimitOrClosed(_pool, bucket, limit, now, windowMs = HOUR_MS) {
      return rate.overLimit(bucket, limit, now, windowMs)
    },
    async refundOne(_pool, bucket, now, windowMs = HOUR_MS) {
      rate.overLimitBy(bucket, -1, Number.POSITIVE_INFINITY, now, windowMs)
    },
    async rateCountsOf(_pool, buckets, windowStart, windowMs) {
      const start = windowStart.getTime()
      return new Map(buckets.map((b) => [b, rate.countOf(b, start, windowMs)]).filter(([, n]) => n > 0))
    },
    sameSecret,
    // No operator switches: the install exists to run this feature.
    uiSwitchOn: async () => true,
    // No vision model: menu photos are not read (`menu-photo-reading.js` reports `not_configured`).
    lookupDoor: async () => ({ state: 'unassigned' }),
    effortOptions: () => ({ parameter: null, choices: [] }),
    visionFingerprint: () => '',
    currentVisionProof: async () => null,
    pictureFeatures,
    // No sealed keys here (no `sealSecret`): provider keys come from the environment, read-only on the operator page.
    openSecret: async () => null
  }
}

/** `./same-secret.js`, false when either side is missing instead of throwing. */
function sameSecret(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a !== '' && sameConfiguredSecret(a, b)
}
