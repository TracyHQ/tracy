/**
 * Account tokens — the Bearer credential an outside app holds for a whole ACCOUNT, never a site
 * (`tasks/todo-wo-public-demos.md` A2; tables `account_grant`/`account_token`/`account_refresh`,
 * migration 174). Issued only through the OAuth device flow (`mcp/device.js`) to a registered
 * device client; today the one scope is `demos`.
 *
 * CONTRACT for code that mounts a door on it (`/v1/demos*`):
 *
 *   const requireAccountToken = accountTokenResolver({ pool, pepper, audience, now })  // app.js
 *   const auth = await requireAccountToken(c, 'demos')
 *   if (auth.error) return auth.error          // a Response, `/v1` envelope `{ error: { code } }`
 *   auth.accountId, auth.email, auth.displayName, auth.grantId, auth.clientId, auth.scopes
 *
 *   401 NOT_SIGNED_IN    no Authorization header
 *   401 KEY_INVALID      not an account token, wrong secret, or minted for another audience
 *   401 KEY_REVOKED      the grant was revoked (Settings, /oauth/revoke, refresh replay)
 *   401 KEY_EXPIRED      the access token (1 h) or the grant lapsed: refresh, or connect again
 *   403 ACCOUNT_TOKEN_REQUIRED  a seat key (`trk_…`) — seat keys never open account doors
 *   403 SCOPE_NOT_GRANTED       the grant does not hold the scope asked for
 *   503 API_KEYS_NOT_CONFIGURED no `API_KEY_PEPPER`
 *
 * Token shape: `tra_<id16>.<secret32>` — the seat key's alphabet with another prefix, so
 * `parseKey` never mistakes one for the other. The row keeps HMAC-SHA256(pepper, secret) only.
 *
 * 🔒 THE FENCE RUNS BOTH WAYS: `/v1/sites/*` answers an account token 403 (`api/route.js`), and an
 * account door answers a seat key 403 here. A `demos` token reads `/v1/me` (email, name) and nothing
 * else that exists today.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { newKeyId, newKeySecret, parseKey } from './api-key.js'
import { hmacHex } from './hmac.js'

export const ACCOUNT_SCOPES = Object.freeze(['demos'])
export const ACCESS_SECONDS = 3600
/** A refresh token lives 30 days from its last use; every rotation extends the grant. */
export const GRANT_MS = 30 * 86_400_000
const TOUCH_EVERY_MS = 60_000
const TOKEN_SHAPE = /^Bearer\s+tra_([a-z2-7]{16})\.([A-Za-z0-9_-]{32})$/i

export const digest = (value) => createHash('sha256').update(value).digest('base64url')
export const nonce = () => randomBytes(32).toString('base64url')

/** `{id, secret}` of an account token header, or null for anything else. */
export function parseAccountToken(header) {
  if (typeof header !== 'string') return null
  const match = TOKEN_SHAPE.exec(header.trim())
  return match ? { id: match[1], secret: match[2] } : null
}

const refusal = (c, code, status) => c.json({ error: { code } }, status)

/**
 * Who an account token stands for, or why not — see the module comment.
 * @param {{pool: import('pg').Pool, pepper: string | null | undefined, audience: string, now?: () => number}} deps
 */
export function accountTokenResolver({ pool, pepper, audience, now = Date.now }) {
  return async function requireAccountToken(c, scope) {
    const header = c.req.header('authorization')
    if (!header) return { error: refusal(c, 'NOT_SIGNED_IN', 401) }
    if (!pepper) return { error: refusal(c, 'API_KEYS_NOT_CONFIGURED', 503) }
    if (parseKey(header)) return { error: refusal(c, 'ACCOUNT_TOKEN_REQUIRED', 403) }
    const parsed = parseAccountToken(header)
    if (!parsed) return { error: refusal(c, 'KEY_INVALID', 401) }
    const row = (
      await pool.query(
        `select t.secret_hash, t.expires_at as token_expires, g.id as grant_id, g.client_id, g.audience,
           g.scopes, g.expires_at, g.revoked_at, g.last_used_at, a.id as account_id, a.email, a.display_name
         from account_token t join account_grant g on g.id = t.grant_id join account a on a.id = g.account_id
         where t.id = $1`,
        [parsed.id]
      )
    ).rows[0]
    if (!row) return { error: refusal(c, 'KEY_INVALID', 401) }
    const expected = Buffer.from(row.secret_hash, 'hex')
    const given = Buffer.from(await hmacHex(pepper, parsed.secret), 'hex')
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      return { error: refusal(c, 'KEY_INVALID', 401) }
    if (row.audience !== audience) return { error: refusal(c, 'KEY_INVALID', 401) }
    if (row.revoked_at) return { error: refusal(c, 'KEY_REVOKED', 401) }
    const at = now()
    if (row.token_expires.getTime() <= at || row.expires_at.getTime() <= at)
      return { error: refusal(c, 'KEY_EXPIRED', 401) }
    if (scope && !row.scopes.includes(scope)) return { error: refusal(c, 'SCOPE_NOT_GRANTED', 403) }
    if (row.last_used_at === null || row.last_used_at.getTime() + TOUCH_EVERY_MS <= at)
      await pool.query('update account_grant set last_used_at = $2 where id = $1', [
        row.grant_id,
        new Date(at)
      ])
    return {
      accountId: row.account_id,
      email: row.email,
      displayName: row.display_name ?? null,
      grantId: row.grant_id,
      clientId: row.client_id,
      scopes: row.scopes
    }
  }
}

/** Revoke a grant inside the caller's transaction (it must hold the grant row's lock). */
async function revokeGrantRow(client, grantId, now) {
  await client.query('update account_grant set revoked_at = coalesce(revoked_at, $2) where id = $1', [
    grantId,
    new Date(now)
  ])
}

/** Mint a new access secret on the grant's one token id, and a new refresh token. */
async function issueTokens(client, grant, { pepper, now }) {
  const secret = newKeySecret()
  const expires = new Date(now + ACCESS_SECONDS * 1000)
  const hash = await hmacHex(pepper, secret)
  const existing = (await client.query('select id from account_token where grant_id = $1', [grant.id]))
    .rows[0]
  const id = existing?.id ?? newKeyId()
  if (existing)
    await client.query('update account_token set secret_hash = $2, expires_at = $3 where id = $1', [
      id,
      hash,
      expires
    ])
  else
    await client.query(
      'insert into account_token (id, grant_id, secret_hash, expires_at) values ($1,$2,$3,$4)',
      [id, grant.id, hash, expires]
    )
  const refreshToken = nonce()
  await client.query('insert into account_refresh (hash, grant_id) values ($1,$2)', [
    digest(refreshToken),
    grant.id
  ])
  return {
    access_token: `tra_${id}.${secret}`,
    token_type: 'Bearer',
    expires_in: ACCESS_SECONDS,
    refresh_token: refreshToken,
    scope: grant.scopes.join(' ')
  }
}

/** A new grant for an approved device code, inside the caller's transaction. */
export async function createGrant(client, { clientId, accountId, audience, scopes, pepper, now }) {
  const grant = { id: nonce(), scopes }
  await client.query(
    `insert into account_grant (id, client_id, account_id, audience, scopes, created_at, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [grant.id, clientId, accountId, audience, scopes, new Date(now), new Date(now + GRANT_MS)]
  )
  return { grant, tokens: await issueTokens(client, grant, { pepper, now }) }
}

/**
 * Rotate a refresh token: new access secret (same id), new refresh token, grant extended.
 * A spent refresh token presented again revokes the whole grant (RFC 9700 §4.14).
 * @returns {Promise<object | null>} the token answer, or null for `invalid_grant`.
 */
export async function refreshAccountGrant(pool, { clientId, token, pepper, now }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const found = (
      await client.query('select grant_id from account_refresh where hash = $1', [digest(token)])
    ).rows[0]
    if (!found) {
      await client.query('rollback')
      return null
    }
    // Lock the grant first, as revoke does, so a refresh cannot outrun a revocation.
    const grant = (
      await client.query('select * from account_grant where id = $1 for update', [found.grant_id])
    ).rows[0]
    const refresh = (await client.query('select * from account_refresh where hash = $1', [digest(token)]))
      .rows[0]
    if (!grant || grant.client_id !== clientId || grant.revoked_at || grant.expires_at.getTime() <= now) {
      await client.query('rollback')
      return null
    }
    if (refresh.used_at) {
      await revokeGrantRow(client, grant.id, now)
      await client.query('commit')
      return null
    }
    await client.query('update account_refresh set used_at = $2 where hash = $1', [
      refresh.hash,
      new Date(now)
    ])
    await client.query('update account_grant set expires_at = $2 where id = $1', [
      grant.id,
      new Date(now + GRANT_MS)
    ])
    const tokens = await issueTokens(client, grant, { pepper, now })
    await client.query('commit')
    return tokens
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/** Revoke by a grant id inside a transaction that locks the grant first. */
async function revokeLocked(pool, grantId, now) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select id from account_grant where id = $1 for update', [grantId])
    await revokeGrantRow(client, grantId, now)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

/**
 * `/oauth/revoke` for an account client: the caller proves possession of the refresh token or the
 * access token (secret checked), never a bare id. Unknown tokens are silently ignored (RFC 7009).
 */
export async function revokeAccountToken(pool, { clientId, token, pepper, now }) {
  let grantId = null
  const access = parseAccountToken(`Bearer ${token}`)
  if (access) {
    const row = (
      await pool.query(
        'select t.secret_hash, g.id, g.client_id from account_token t join account_grant g on g.id = t.grant_id where t.id = $1',
        [access.id]
      )
    ).rows[0]
    if (row && row.client_id === clientId) {
      const expected = Buffer.from(row.secret_hash, 'hex')
      const given = Buffer.from(await hmacHex(pepper, access.secret), 'hex')
      if (expected.length === given.length && timingSafeEqual(expected, given)) grantId = row.id
    }
  } else if (typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const row = (
      await pool.query(
        'select g.id from account_refresh r join account_grant g on g.id = r.grant_id where r.hash = $1 and g.client_id = $2',
        [digest(token), clientId]
      )
    ).rows[0]
    grantId = row?.id ?? null
  }
  if (grantId) await revokeLocked(pool, grantId, now)
}

/** The account's live grants, for Settings › Connected apps. No secret, no hash. */
export async function listAccountGrants(pool, accountId, now = Date.now()) {
  const { rows } = await pool.query(
    `select id, client_id, scopes, created_at, last_used_at, expires_at from account_grant
     where account_id = $1 and revoked_at is null and expires_at > $2 order by created_at desc, id`,
    [accountId, new Date(now)]
  )
  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    scopes: row.scopes,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    expiresAt: row.expires_at.toISOString()
  }))
}

/** Revoke one of the account's grants. @returns true when a live grant of THIS account was revoked. */
export async function revokeAccountGrant(pool, accountId, grantId, now = Date.now()) {
  const { rowCount } = await pool.query(
    'update account_grant set revoked_at = $3 where id = $1 and account_id = $2 and revoked_at is null',
    [grantId, accountId, new Date(now)]
  )
  return rowCount === 1
}
