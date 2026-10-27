/** OAuth grants reuse the same site-bound keys that the public REST Apply door already enforces. */
import { createHash, randomBytes } from 'node:crypto'
import { mintKey, newKeySecret } from '../lib/api-key.js'
import { hmacHex } from '../lib/hmac.js'

export const digest = (value) => createHash('sha256').update(value).digest('base64url')
export const nonce = () => randomBytes(32).toString('base64url')
export { CLIENT_ID, REDIRECT_URI } from './clients.js'
export const ACCESS_SECONDS = 3600
export const GRANT_MS = 30 * 86_400_000

export async function issueCode(
  pool,
  { clientId, accountId, siteKey, resource, scopes, challenge, redirectUri, now }
) {
  const code = nonce()
  await pool.query(
    `insert into mcp_oauth_code
    (hash, client_id, account_id, site_key, resource, scopes, challenge, redirect_uri, expires_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      digest(code),
      clientId,
      accountId,
      siteKey,
      resource,
      scopes,
      challenge,
      redirectUri,
      new Date(now + 300_000)
    ]
  )
  return code
}

async function revokeGrant(client, id, now) {
  await client.query('update mcp_oauth_grant set revoked_at = coalesce(revoked_at, $2) where id = $1', [
    id,
    new Date(now)
  ])
  await client.query(
    `update api_key set revoked_at = coalesce(revoked_at, $2)
    where id in (select key_id from mcp_oauth_access where grant_id = $1)`,
    [id, new Date(now)]
  )
}

/** One transaction consumes a code or refresh, makes an access key and rotates the refresh token. */
export async function exchangeToken(
  pool,
  { clientId, clientName, kind, token, verifier, resource, redirectUri, pepper, now, hasSeat }
) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    let grant
    let access
    if (kind === 'authorization_code') {
      const row = (
        await client.query('select * from mcp_oauth_code where hash = $1 for update', [digest(token)])
      ).rows[0]
      if (
        !row ||
        row.client_id !== clientId ||
        row.expires_at.getTime() <= now ||
        row.resource !== resource ||
        row.redirect_uri !== redirectUri ||
        row.challenge !== digest(verifier)
      ) {
        await client.query('rollback')
        return null
      }
      if (row.used_at) {
        if (row.grant_id) await revokeGrant(client, row.grant_id, now)
        await client.query('commit')
        return null
      }
      if (!(await hasSeat(row.account_id, row.site_key))) {
        await client.query('rollback')
        return null
      }
      grant = { id: nonce(), ...row, expires_at: new Date(now + GRANT_MS) }
      await client.query(
        `insert into mcp_oauth_grant (id, client_id, account_id, site_key, resource, scopes, expires_at)
        values ($1,$2,$3,$4,$5,$6,$7)`,
        [grant.id, clientId, row.account_id, row.site_key, resource, row.scopes, grant.expires_at]
      )
      await client.query('update mcp_oauth_code set used_at = $2, grant_id = $3 where hash = $1', [
        row.hash,
        new Date(now),
        grant.id
      ])
    } else {
      // Lock the grant FIRST on both refresh and revoke, so concurrent refreshes cannot issue a
      // key after a revocation. Every refresh token remains as a spent-token reuse detector.
      const found = (
        await client.query('select grant_id from mcp_oauth_refresh where hash = $1', [digest(token)])
      ).rows[0]
      if (!found) {
        await client.query('rollback')
        return null
      }
      grant = (await client.query('select * from mcp_oauth_grant where id = $1 for update', [found.grant_id]))
        .rows[0]
      const refresh = (await client.query('select * from mcp_oauth_refresh where hash = $1', [digest(token)]))
        .rows[0]
      if (
        !grant ||
        grant.client_id !== clientId ||
        grant.revoked_at ||
        grant.resource !== resource ||
        grant.expires_at.getTime() <= now
      ) {
        await client.query('rollback')
        return null
      }
      if (refresh.used_at || !(await hasSeat(grant.account_id, grant.site_key))) {
        await revokeGrant(client, grant.id, now)
        await client.query('commit')
        return null
      }
      const key = (
        await client.query(
          `select k.* from api_key k join mcp_oauth_access a on a.key_id = k.id
        where a.grant_id = $1 for update of k`,
          [grant.id]
        )
      ).rows[0]
      if (!key || key.revoked_at) {
        await revokeGrant(client, grant.id, now)
        await client.query('commit')
        return null
      }
      // Keep ONE key id per consent: refresh preserves its audit/undo history and revocation in
      // Settings ends the connection permanently. Rotate the secret, never revive a revoked key.
      const secret = newKeySecret()
      await client.query('update api_key set secret_hash = $2, expires_at = $3 where id = $1', [
        key.id,
        await hmacHex(pepper, secret),
        new Date(now + ACCESS_SECONDS * 1000)
      ])
      access = { id: key.id, key: `trk_${key.id}.${secret}` }
      await client.query('update mcp_oauth_refresh set used_at = $2 where hash = $1', [
        refresh.hash,
        new Date(now)
      ])
    }
    if (!access) {
      access = await mintKey({
        pool: client,
        accountId: grant.account_id,
        siteKey: grant.site_key,
        label: `${clientName} · Tracy`,
        scopes: grant.scopes,
        pepper,
        now,
        expiresAt: new Date(now + ACCESS_SECONDS * 1000)
      })
      await client.query('insert into mcp_oauth_access (key_id, grant_id) values ($1,$2)', [
        access.id,
        grant.id
      ])
    }
    const refreshToken = nonce()
    await client.query('insert into mcp_oauth_refresh (hash, grant_id) values ($1,$2)', [
      digest(refreshToken),
      grant.id
    ])
    await client.query('commit')
    return {
      access_token: access.key,
      token_type: 'Bearer',
      expires_in: ACCESS_SECONDS,
      refresh_token: refreshToken,
      scope: grant.scopes.join(' ')
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function liveOAuthKey(pool, keyId, resource, now) {
  const { rows } = await pool.query(
    `select g.id from mcp_oauth_access a join mcp_oauth_grant g on g.id = a.grant_id
    where a.key_id = $1 and g.resource = $2 and g.revoked_at is null and g.expires_at > $3`,
    [keyId, resource, new Date(now)]
  )
  return rows.length > 0
}

/** The caller must have proved possession of the refresh token or the access key before calling. */
export async function revokeToken(pool, { clientId, refresh, keyId, now }) {
  const found = (
    await pool.query(
      refresh
        ? 'select r.grant_id from mcp_oauth_refresh r join mcp_oauth_grant g on g.id = r.grant_id where r.hash = $1 and g.client_id = $2'
        : 'select a.grant_id from mcp_oauth_access a join mcp_oauth_grant g on g.id = a.grant_id where a.key_id = $1 and g.client_id = $2',
      [refresh ? digest(refresh) : keyId, clientId]
    )
  ).rows[0]
  if (!found) return
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select id from mcp_oauth_grant where id = $1 for update', [found.grant_id])
    await revokeGrant(client, found.grant_id, now)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
