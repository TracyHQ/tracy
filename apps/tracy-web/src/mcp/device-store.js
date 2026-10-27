/** RFC 8628 device codes: issued at /oauth/device/code, decided on /connect, spent at /oauth/token. */
import { randomBytes } from 'node:crypto'
import { createGrant, digest, nonce } from '../lib/account-token.js'
import { hmacHex } from '../lib/hmac.js'

export const DEVICE_SECONDS = 600
export const POLL_SECONDS = 5
/** Consonants only (RFC 8628 §6.1): no vowels to spell words, nothing that reads as a digit. */
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'

function newUserCode() {
  let code = ''
  while (code.length < 8)
    for (const byte of randomBytes(16))
      if (byte < 240 && code.length < 8) code += ALPHABET[byte % ALPHABET.length]
  return code
}
export const showUserCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`
/** What a person typed, as stored: upper case, separators dropped; null if it cannot be a code. */
export function normalUserCode(value) {
  const code = String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
  return code.length === 8 && [...code].every((ch) => ALPHABET.includes(ch)) ? code : null
}
const userCodeHash = (pepper, code) => hmacHex(pepper, `device-user-code:${code}`)

export async function issueDeviceCode(pool, { clientId, audience, scopes, pepper, now }) {
  for (let attempt = 0; ; attempt++) {
    const deviceCode = nonce()
    const userCode = newUserCode()
    try {
      await pool.query(
        `insert into oauth_device_code
         (hash, user_code_hash, client_id, audience, scopes, interval_seconds, created_at, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          digest(deviceCode),
          await userCodeHash(pepper, userCode),
          clientId,
          audience,
          scopes,
          POLL_SECONDS,
          new Date(now),
          new Date(now + DEVICE_SECONDS * 1000)
        ]
      )
      return { deviceCode, userCode: showUserCode(userCode) }
    } catch (error) {
      // A user code still held by another row: draw again (20^8 codes, so this is rare).
      if (error?.code !== '23505' || attempt >= 4) throw error
    }
  }
}

/**
 * Record the signed-in person's decision on a pending, unexpired code of `clientId`.
 * @returns {Promise<boolean>} false when no such code is waiting (wrong, expired, already decided).
 */
export async function decideDeviceCode(pool, { userCode, clientId, accountId, decision, pepper, now }) {
  const { rowCount } = await pool.query(
    `update oauth_device_code set decision = $3, account_id = $4
     where user_code_hash = $1 and client_id = $2 and decision is null and expires_at > $5`,
    [await userCodeHash(pepper, userCode), clientId, decision, accountId, new Date(now)]
  )
  return rowCount === 1
}

/**
 * One poll of the token endpoint. @returns `{error}` (an RFC 8628 §3.5 code) or `{tokens}`.
 * A device code already exchanged and presented again revokes the grant it produced.
 */
export async function pollDeviceCode(pool, { clientId, deviceCode, pepper, now }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const row = (
      await client.query('select * from oauth_device_code where hash = $1 for update', [digest(deviceCode)])
    ).rows[0]
    const done = async (answer) => {
      await client.query('commit')
      return answer
    }
    if (!row || row.client_id !== clientId) {
      await client.query('rollback')
      return { error: 'invalid_grant' }
    }
    if (row.used_at) {
      if (row.grant_id)
        await client.query('update account_grant set revoked_at = coalesce(revoked_at, $2) where id = $1', [
          row.grant_id,
          new Date(now)
        ])
      return done({ error: 'invalid_grant' })
    }
    if (row.expires_at.getTime() <= now) return done({ error: 'expired_token' })
    if (row.last_poll_at && row.last_poll_at.getTime() + row.interval_seconds * 1000 > now) {
      await client.query(
        'update oauth_device_code set interval_seconds = interval_seconds + 5, last_poll_at = $2 where hash = $1',
        [row.hash, new Date(now)]
      )
      return done({ error: 'slow_down' })
    }
    await client.query('update oauth_device_code set last_poll_at = $2 where hash = $1', [
      row.hash,
      new Date(now)
    ])
    if (row.decision === null) return done({ error: 'authorization_pending' })
    if (row.decision === 'deny') return done({ error: 'access_denied' })
    const account = (await client.query('select id from account where id = $1', [row.account_id])).rows[0]
    if (!account) return done({ error: 'access_denied' })
    const { grant, tokens } = await createGrant(client, {
      clientId,
      accountId: row.account_id,
      audience: row.audience,
      scopes: row.scopes,
      pepper,
      now
    })
    await client.query('update oauth_device_code set used_at = $2, grant_id = $3 where hash = $1', [
      row.hash,
      new Date(now),
      grant.id
    ])
    return done({ tokens })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
