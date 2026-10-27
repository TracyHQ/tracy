/**
 * Seat keys — the Bearer credential a person with a live seat mints for ONE site
 * (`tasks/todo-api-public.md` Q1/S1; table `api_key`, migration 034).
 *
 * `Authorization: Bearer trk_<id>.<secret>`: `id` is 16 characters of lower-case base32 (public,
 * the row's primary key, safe in a listing and a log); `secret` is 32 characters of base64url from
 * 24 random bytes, shown ONCE at mint and never stored — the row keeps `HMAC-SHA256(pepper, secret)`
 * only, so a database dump authenticates nothing and rotating `API_KEY_PEPPER` invalidates every
 * key at once.
 *
 * 🔒 A KEY IS IDENTITY, NEVER RIGHTS. `verifyKey` says who minted it and which site it names; the
 * Apply door still asks the seat book (`grantFor`) on every call and intersects the seat's toolsets
 * with `scopes`. A revoked seat therefore shuts the key without touching this table, and a key can
 * never hold more than its seat — an owner's key with `scopes: ['content']` is a content key.
 *
 * 🔒 REVOKE IS PERMANENT (`revoked_at` written once, never cleared): no door un-revokes, and a seat
 * granted again does not revive a revoked key.
 *
 * 🔒 ONE ANSWER FOR EVERY WRONG SECRET. A key whose secret does not match answers `KEY_INVALID`
 * whatever the row's state, so a guessed secret learns nothing about whether an id exists, is
 * revoked or has expired. Hashes are compared with `timingSafeEqual`.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { hmacHex } from './hmac.js'

/** The four toolsets a key may name — the seat book's own (`seats/roles.js` TOOLSETS). */
export const KEY_SCOPES = Object.freeze(['content', 'code', 'site', 'lifecycle'])

/** `trk_<id16>.<secret32>` after `Bearer ` (scheme case-insensitive, one space). */
const KEY_SHAPE = /^Bearer\s+trk_([a-z2-7]{16})\.([A-Za-z0-9_-]{32})$/i

/** How long after a use `last_used_at` is left alone — a hot key must not write a row per call. */
const TOUCH_EVERY_MS = 60_000

/** Lower-case base32 (RFC 4648 alphabet, lower-cased): unambiguous in a URL, a shell and a log. */
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

/** 16 characters, 80 bits — five bits of each of 16 random bytes. */
export function newKeyId() {
  return [...randomBytes(16)].map((byte) => BASE32[byte & 31]).join('')
}

/** 24 random bytes as 32 characters of base64url (no padding). */
export function newKeySecret() {
  return randomBytes(24).toString('base64url')
}

/**
 * @param {string | null | undefined} header - the `Authorization` header as received.
 * @returns {{id: string, secret: string} | null} — null for anything that is not a seat key.
 */
export function parseKey(header) {
  if (typeof header !== 'string') return null
  const match = KEY_SHAPE.exec(header.trim())
  return match ? { id: match[1], secret: match[2] } : null
}

/**
 * @param {{pool: import('pg').Pool, accountId: string, siteKey: string, label: string, scopes: string[],
 *   expiresAt?: Date | null, pepper: string, now?: number}} args
 * @returns {Promise<{id: string, key: string, siteKey: string, label: string, scopes: string[],
 *   createdAt: string, expiresAt: string | null}>} — `key` is the ONLY time the secret is readable.
 */
export async function mintKey({
  pool,
  accountId,
  siteKey,
  label,
  scopes,
  expiresAt = null,
  pepper,
  now = Date.now()
}) {
  if (typeof pepper !== 'string' || pepper === '') throw new Error('mintKey: no pepper')
  const id = newKeyId()
  const secret = newKeySecret()
  const { rows } = await pool.query(
    `insert into api_key (id, account_id, site_key, label, scopes, secret_hash, created_at, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, site_key, label, scopes, created_at, expires_at`,
    [id, accountId, siteKey, label, scopes, await hmacHex(pepper, secret), new Date(now), expiresAt]
  )
  const row = rows[0]
  return {
    id: row.id,
    key: `trk_${row.id}.${secret}`,
    siteKey: row.site_key,
    label: row.label,
    scopes: row.scopes,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null
  }
}

/**
 * Who a Bearer header stands for, or why it does not.
 *
 * @param {{pool: import('pg').Pool, header: string | null | undefined, pepper: string | null, now?: number}} args
 * @returns {Promise<{keyId: string, accountId: string, siteKey: string, scopes: string[], email: string}
 *   | {error: 'KEY_INVALID' | 'KEY_REVOKED' | 'KEY_EXPIRED' | 'API_KEYS_NOT_CONFIGURED'}>}
 */
export async function verifyKey({ pool, header, pepper, now = Date.now() }) {
  if (typeof pepper !== 'string' || pepper === '') return { error: 'API_KEYS_NOT_CONFIGURED' }
  const parsed = parseKey(header)
  if (!parsed) return { error: 'KEY_INVALID' }
  const { rows } = await pool.query(
    `select k.id, k.account_id, k.site_key, k.scopes, k.secret_hash, k.expires_at, k.revoked_at,
            k.last_used_at, a.email
     from api_key k join account a on a.id = k.account_id
     where k.id = $1`,
    [parsed.id]
  )
  const row = rows[0]
  if (!row) return { error: 'KEY_INVALID' }
  const expected = Buffer.from(row.secret_hash, 'hex')
  const given = Buffer.from(await hmacHex(pepper, parsed.secret), 'hex')
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { error: 'KEY_INVALID' }
  if (row.revoked_at) return { error: 'KEY_REVOKED' }
  if (row.expires_at && row.expires_at.getTime() <= now) return { error: 'KEY_EXPIRED' }
  if (row.last_used_at === null || row.last_used_at.getTime() + TOUCH_EVERY_MS <= now) {
    await pool.query('update api_key set last_used_at = $2 where id = $1', [row.id, new Date(now)])
  }
  return {
    keyId: row.id,
    accountId: row.account_id,
    siteKey: row.site_key,
    scopes: row.scopes,
    email: row.email
  }
}

/**
 * The account's live keys — never the secret (not stored) nor its hash. `hint` is what a screen may
 * print to tell keys apart: the public id in the key's own spelling, the secret elided.
 * @returns {Promise<Array<{id: string, siteKey: string, label: string, scopes: string[], hint: string,
 *   createdAt: string, expiresAt: string | null, lastUsedAt: string | null}>>}
 */
export async function listKeys(pool, accountId) {
  const { rows } = await pool.query(
    `select id, site_key, label, scopes, created_at, expires_at, last_used_at
     from api_key where account_id = $1 and revoked_at is null
     order by created_at desc, id`,
    [accountId]
  )
  return rows.map((row) => ({
    id: row.id,
    siteKey: row.site_key,
    label: row.label,
    scopes: row.scopes,
    hint: keyHint(row.id),
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null
  }))
}

/**
 * `trk_<id>.…` — "recognise, never use", the job `secret-box.js`'s `hintFor` does for a stored
 * credential. That helper elides a value it holds; here the secret is not in the store, so the hint
 * is the public half in the key's own spelling and nothing else.
 */
export function keyHint(id) {
  return `trk_${id}.…`
}

/**
 * Revoke one of the account's keys. Permanent: the row keeps `revoked_at` forever.
 * @returns {Promise<boolean>} true when a live key of THIS account was revoked by this call.
 */
export async function revokeKey(pool, accountId, id) {
  const { rowCount } = await pool.query(
    `update api_key set revoked_at = now() where id = $1 and account_id = $2 and revoked_at is null`,
    [id, accountId]
  )
  return rowCount === 1
}
