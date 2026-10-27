/**
 * Seat keys — the three cookie doors on the cowork host where a person with a live seat mints,
 * lists and revokes the Bearer keys their programs use on the api host
 * (`tasks/todo-api-public.md` Q1/S1; `lib/api-key.js` holds the key itself).
 *
 *   GET    /api/me/keys        the viewer's live keys — never the secret
 *   POST   /api/me/keys        {siteKey, label, scopes, expiresInDays?} → 201 {key, …}, the key ONCE
 *   DELETE /api/me/keys/:id    204 — own keys only; permanent
 *   GET    /api/me/connected-apps       the viewer's live account grants (device flow, `lib/account-token.js`)
 *   DELETE /api/me/connected-apps/:id   204 — own grants only; permanent, the app must connect again
 *
 * 🔒 A KEY CAN NEVER HOLD MORE THAN THE SEAT. `scopes` must sit inside what `permissionsFor(role)`
 * grants that seat TODAY (`SCOPE_OUTSIDE_ROLE` names the toolsets outside). Each role holds a fixed
 * set (ADR 0028): a viewer holds none, so a viewer can mint no key at all (a key names one scope
 * or more).
 * That is a courtesy at mint, not the guarantee: the Apply door intersects the seat's toolsets with
 * `scopes` again on every call, so a role narrowed after the mint narrows the key with it.
 *
 * 🔒 WRITES NEED THE EXACT PUBLIC `Origin` (as `ops/llm.js` does): the session cookie travels to
 * every `*.tracy.ai` page (`SESSION_DOMAIN`), so a customer site's own script could otherwise mint a
 * key for its owner's OTHER sites with a bare `fetch()`.
 *
 * Module graph: imports `lib/` and `db/` only; the seat book (`accountByEmail`, `grantFor`,
 * `permissionsFor`) and `canonicalSiteKey` arrive as deps from `app.js`, the way every other domain
 * gets a sibling's functions.
 */
import { Hono } from 'hono'
import { listAccountGrants, revokeAccountGrant } from '../lib/account-token.js'
import { KEY_SCOPES, listKeys, mintKey, revokeKey } from '../lib/api-key.js'
import { json, normalizeSiteKey, viewer } from '../lib/http.js'
import { overLimit } from '../lib/rate.js'

/** Mints one person may make an hour — a key is a credential, and twenty is a busy afternoon. */
export const KEY_MINT_LIMIT_PER_HOUR = 20

/** A label is for a screen: one line, not a document. */
const LABEL_MAX = 80
/** Longest life a key may be minted with; an absent `expiresInDays` is "does not expire". */
const EXPIRES_DAYS_MAX = 3650

/**
 * @param {{pool: import('pg').Pool, config: {origin: string, apiKeyPepper: string | null, sessionSecret: string},
 *   seats: {accountByEmail: Function, grantFor: Function, permissionsFor: Function},
 *   canonicalSiteKey?: (pool: import('pg').Pool, name: string) => Promise<string>,
 *   appName?: (clientId: string) => string, now?: () => number}} deps
 */
export function keysRoutes({
  pool,
  config,
  seats,
  canonicalSiteKey = async (_pool, name) => name,
  appName = (clientId) => clientId,
  now = Date.now
}) {
  const app = new Hono()

  /** The signed-in account, or the Response to return: 503 when keys are off, 401 when nobody. */
  async function requireAccount(c) {
    if (!config.apiKeyPepper) return { error: json(c, { code: 'API_KEYS_NOT_CONFIGURED' }, 503) }
    const email = await viewer(c, config)
    if (!email) return { error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    const account = await seats.accountByEmail(pool, email)
    if (!account) return { error: json(c, { code: 'NOT_SIGNED_IN' }, 401) }
    return { email, account }
  }

  app.get('/api/me/keys', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const who = await requireAccount(c)
    if (who.error) return who.error
    return json(c, { keys: await listKeys(pool, who.account.id) })
  })

  app.post('/api/me/keys', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const who = await requireAccount(c)
    if (who.error) return who.error
    // The PUBLIC origin, not the request's: behind the tunnel this app is handed plain http.
    if (c.req.header('origin') !== config.origin) return json(c, { code: 'BAD_ORIGIN' }, 403)
    const body = await c.req.json().catch(() => null)
    const asked = shapeOf(body)
    if (!asked) return json(c, { code: 'INVALID_REQUEST' }, 400)
    // Fail CLOSED on a rate check the database could not answer (`lib/rate.js` overLimitOrClosed).
    const over = await overLimit(pool, `keys-mint:${who.email}`, KEY_MINT_LIMIT_PER_HOUR, now()).catch(
      () => true
    )
    if (over) return json(c, { code: 'RATE_LIMITED' }, 429)
    const siteKey = await canonicalSiteKey(pool, asked.siteKey)
    const grant = await seats.grantFor(pool, who.account.id, siteKey)
    if (!grant) return json(c, { code: 'SEAT_NOT_AUTHORIZED' }, 403)
    const perms = seats.permissionsFor(grant.role)
    const outside = asked.scopes.filter((scope) => !perms[scope])
    if (outside.length > 0)
      return json(c, { code: 'SCOPE_OUTSIDE_ROLE', role: grant.role, toolsets: outside }, 400)
    const at = now()
    const minted = await mintKey({
      pool,
      accountId: who.account.id,
      siteKey,
      label: asked.label,
      scopes: asked.scopes,
      expiresAt: asked.expiresInDays === null ? null : new Date(at + asked.expiresInDays * 86_400_000),
      pepper: config.apiKeyPepper,
      now: at
    })
    return json(c, minted, 201)
  })

  app.delete('/api/me/keys/:id', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const who = await requireAccount(c)
    if (who.error) return who.error
    const id = c.req.param('id')
    if (!/^[a-z2-7]{16}$/.test(id)) return json(c, { code: 'KEY_NOT_FOUND' }, 404)
    const revoked = await revokeKey(pool, who.account.id, id)
    if (!revoked) return json(c, { code: 'KEY_NOT_FOUND' }, 404)
    return c.body(null, 204)
  })

  app.get('/api/me/connected-apps', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const who = await requireAccount(c)
    if (who.error) return who.error
    const grants = await listAccountGrants(pool, who.account.id, now())
    return json(c, { apps: grants.map((grant) => ({ ...grant, name: appName(grant.clientId) })) })
  })

  app.delete('/api/me/connected-apps/:id', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const who = await requireAccount(c)
    if (who.error) return who.error
    if (c.req.header('origin') !== config.origin) return json(c, { code: 'BAD_ORIGIN' }, 403)
    const id = c.req.param('id')
    if (!/^[A-Za-z0-9_-]{43}$/.test(id) || !(await revokeAccountGrant(pool, who.account.id, id, now())))
      return json(c, { code: 'CONNECTED_APP_NOT_FOUND' }, 404)
    return c.body(null, 204)
  })

  return app
}

/**
 * The mint body, checked field by field, or null. `siteKey` comes back normalised the way
 * `/api/sites/:key` reads it (scheme, `www.` and case dropped; a non-host is refused).
 * @returns {{siteKey: string, label: string, scopes: string[], expiresInDays: number | null} | null}
 */
function shapeOf(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (typeof body.siteKey !== 'string') return null
  const siteKey = normalizeSiteKey(body.siteKey)
  if (siteKey === '') return null
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (label === '' || label.length > LABEL_MAX) return null
  if (!Array.isArray(body.scopes) || body.scopes.length === 0) return null
  const scopes = [...new Set(body.scopes)]
  if (!scopes.every((scope) => KEY_SCOPES.includes(scope))) return null
  let expiresInDays = null
  if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
    if (
      !Number.isInteger(body.expiresInDays) ||
      body.expiresInDays < 1 ||
      body.expiresInDays > EXPIRES_DAYS_MAX
    )
      return null
    expiresInDays = body.expiresInDays
  }
  return { siteKey, label, scopes: KEY_SCOPES.filter((scope) => scopes.includes(scope)), expiresInDays }
}
