/** Deployment service keys authenticate social data only; they grant no account or site rights. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const KEY = /^Bearer wos_([a-z2-7]{16})\.([A-Za-z0-9_-]{32})$/i
export const SOCIAL_SERVICE_SCOPES = Object.freeze(['read', 'refresh'])
export const SOCIAL_DEPLOYMENT_ID = /^[a-z][a-z0-9-]{0,47}$/
const digest = (pepper, secret) =>
  createHmac('sha256', pepper)
    .update('wo-social-service:' + secret)
    .digest('hex')
// Same id and secret shapes as seat keys (`lib/api-key.js`): 16 base32 characters, 24 random bytes base64url.
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'
const newKeyId = () => [...randomBytes(16)].map((byte) => BASE32[byte & 31]).join('')
const newKeySecret = () => randomBytes(24).toString('base64url')

export async function mintSocialServiceKey({
  pool,
  pepper,
  deploymentId,
  scopes,
  expiresAt = null,
  now = Date.now()
}) {
  if (!pepper) throw new Error('Social service credentials are not configured')
  if (
    !SOCIAL_DEPLOYMENT_ID.test(deploymentId) ||
    !Array.isArray(scopes) ||
    !scopes.length ||
    scopes.some((s) => !SOCIAL_SERVICE_SCOPES.includes(s))
  )
    throw new Error('Invalid social service credential')
  if (expiresAt && (!Number.isFinite(new Date(expiresAt).getTime()) || new Date(expiresAt).getTime() <= now))
    throw new Error('Social service credential expiry must be in the future')
  const id = newKeyId(),
    secret = newKeySecret()
  await pool.query(
    `insert into wo_social_service_key (key_id,deployment_id,secret_hash,scopes,expires_at,created_at)
    values ($1,$2,$3,$4,$5,$6)`,
    [id, deploymentId, await digest(pepper, secret), [...new Set(scopes)], expiresAt, new Date(now)]
  )
  return { id, deploymentId, scopes: [...new Set(scopes)], expiresAt, key: `wos_${id}.${secret}` }
}

export async function verifySocialServiceKey({ pool, pepper, header, now = Date.now() }) {
  if (!pepper) return { error: 'SOCIAL_AUTH_UNAVAILABLE' }
  const match = typeof header === 'string' ? KEY.exec(header.trim()) : null
  if (!match) return { error: 'SOCIAL_AUTH_INVALID' }
  const row = (
    await pool.query(
      `select k.*,d.enabled,d.reads_per_minute,d.refreshes_per_day,d.forces_per_day
    from wo_social_service_key k join wo_social_deployment d using (deployment_id) where k.key_id=$1`,
      [match[1]]
    )
  ).rows[0]
  const expected = Buffer.from(row?.secret_hash ?? '00'.repeat(32), 'hex')
  const actual = Buffer.from(await digest(pepper, match[2]), 'hex')
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual) ||
    !row ||
    !row.enabled ||
    row.revoked_at ||
    (row.expires_at && new Date(row.expires_at).getTime() <= now)
  )
    return { error: 'SOCIAL_AUTH_INVALID' }
  return {
    deploymentId: row.deployment_id,
    scopes: row.scopes,
    limits: {
      readsPerMinute: row.reads_per_minute,
      refreshesPerDay: row.refreshes_per_day,
      forcesPerDay: row.forces_per_day
    }
  }
}

export async function revokeSocialServiceKey(pool, keyId, now = Date.now()) {
  return (
    (
      await pool.query(
        'update wo_social_service_key set revoked_at=$2 where key_id=$1 and revoked_at is null returning key_id',
        [keyId, new Date(now)]
      )
    ).rowCount === 1
  )
}

/** A deployment chooses one TLS origin, never a request-supplied URL or redirect. */
export function socialOrigin(value) {
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash)
      return null
    return u.origin
  } catch {
    return null
  }
}
