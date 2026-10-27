/**
 * Durable context only. OTP flows and speech credentials never enter this store, and a sign-in only
 * as the revocable binding below (`widget_sign_in`), never as a cookie.
 */
import { createHmac, hkdfSync } from 'node:crypto'
import { fromBase64Url } from '../lib/base64url.js'
import { openSecret, sealSecret } from '../lib/secret-box.js'
import { mintSession, SESSION_TTL_S, sessionWithExpiry } from '../lib/session.js'
import { baseConversationPayload } from './conversation-payload.js'
import { nativeHandoffPayload } from './native-handoff.js'

export const CONVERSATION_TTL = 24 * 60 * 60 * 1000
/** Rows one `cleanup` deletes at most (oldest expiry first, through `widget_conversation_expiry`). */
export const CLEANUP_BATCH = 100
/** Ready native context follows account retention; account deletion cascades this row. */
export const NATIVE_CONTEXT_EXPIRY = '9999-12-31T23:59:59.999Z'
const PURPOSE = 'tracy:widget-conversation:v1'
const VERSION = 1
const key = (secret, use) =>
  Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), `${PURPOSE}:${use}`, 32)).toString(
    'base64url'
  )
export function visitorDigest(visitorId, secret) {
  if (typeof visitorId !== 'string' || !visitorId || visitorId.length > 200)
    throw Error('WIDGET_VISITOR_INVALID')
  return createHmac('sha256', key(secret, 'visitor')).update(visitorId).digest('hex')
}
/** Preserve optional native adoption metadata without changing the legacy payload shape. */
export function conversationPayload(input = {}) {
  const value = baseConversationPayload(input)
  if (input.nativeHandoff != null) value.nativeHandoff = nativeHandoffPayload(input.nativeHandoff, value)
  return value
}

function assertNativeEnvelope(data, visitorId, ownerAccountId, revision, secret) {
  const mapping = data.nativeHandoff
  if (!mapping) return
  if (
    mapping.ownerAccountId !== ownerAccountId ||
    mapping.sourceRevision >= revision ||
    visitorDigest(mapping.visitorId, secret) !== visitorDigest(visitorId, secret)
  )
    throw Error('WIDGET_NATIVE_ENVELOPE_INVALID')
}

export class ConversationConflict extends Error {
  constructor() {
    super('WIDGET_STATE_CONFLICT')
  }
}
/** Private rescue/export contract: returns ciphertext + authenticated metadata, no raw cookie or data. */
export async function sealConversationSnapshot(
  { visitorId, ownerAccountId = null, data, capturedAt = Date.now(), revision = 1 },
  secret
) {
  if (!Number.isFinite(capturedAt) || !Number.isSafeInteger(revision) || revision < 1)
    throw Error('WIDGET_SNAPSHOT_INVALID')
  const digest = visitorDigest(visitorId, secret)
  const payload = conversationPayload(data)
  const expiresAt =
    payload.nativeHandoff?.state === 'ready'
      ? NATIVE_CONTEXT_EXPIRY
      : new Date(capturedAt + CONVERSATION_TTL).toISOString()
  assertNativeEnvelope(payload, visitorId, ownerAccountId, revision, secret)
  const envelope = {
    purpose: PURPOSE,
    version: VERSION,
    visitorDigest: digest,
    ownerAccountId,
    revision,
    expiresAt,
    capturedAt: new Date(capturedAt).toISOString(),
    data: payload
  }
  return {
    visitor_digest: digest,
    owner_account_id: ownerAccountId,
    schema_version: VERSION,
    revision,
    expires_at: expiresAt,
    payload_cipher: await sealSecret(JSON.stringify(envelope), key(secret, 'payload')),
    native_session_id: payload.nativeHandoff?.sessionId ?? null
  }
}
export async function openConversationSnapshot(row, secret, now = Date.now()) {
  if (
    !row ||
    row.schema_version !== VERSION ||
    !row.payload_cipher ||
    !Number.isSafeInteger(Number(row.revision)) ||
    Number(row.revision) < 1
  )
    return null
  let value, expiry, captured
  try {
    value = JSON.parse(await openSecret(row.payload_cipher, key(secret, 'payload')))
    expiry = new Date(row.expires_at).toISOString()
    captured = Date.parse(value.capturedAt)
    if (!Number.isFinite(captured) || !Number.isFinite(Date.parse(value.expiresAt))) return null
  } catch {
    return null
  }
  if (
    !value ||
    value.purpose !== PURPOSE ||
    value.version !== VERSION ||
    value.visitorDigest !== row.visitor_digest ||
    value.ownerAccountId !== (row.owner_account_id ?? null) ||
    value.revision !== Number(row.revision) ||
    value.expiresAt !== expiry ||
    Date.parse(value.expiresAt) <= now ||
    Date.parse(value.expiresAt) <= captured
  )
    return null
  try {
    const data = conversationPayload(value.data)
    const mapping = data.nativeHandoff
    if (
      mapping?.state === 'ready'
        ? value.expiresAt !== NATIVE_CONTEXT_EXPIRY
        : Date.parse(value.expiresAt) > captured + CONVERSATION_TTL
    )
      return null
    if ((row.native_session_id ?? null) !== (mapping?.sessionId ?? null)) return null
    if (
      mapping &&
      (mapping.ownerAccountId !== value.ownerAccountId ||
        mapping.sourceRevision >= value.revision ||
        visitorDigest(mapping.visitorId, secret) !== value.visitorDigest)
    )
      return null
    return data
  } catch {
    return null
  }
}
/**
 * The sign-in a session cookie carries, verified (signature, expiry, revocation), with its `jti`, or
 * null. Only a token with a `jti` can be ended by sign-out, so only such a token is ever bound.
 * @param {string} cookie - `tracy_sess=<token>`.
 */
async function signInClaims(cookie, secret, now) {
  const verified = await sessionWithExpiry(cookie, secret, now)
  if (!verified) return null
  try {
    const token = /(?:^|;\s*)tracy_sess=([^;]+)/.exec(cookie)?.[1] ?? ''
    const body = JSON.parse(new TextDecoder().decode(fromBase64Url(token.split('.')[1] ?? '')))
    if (body.email !== verified.email || body.exp !== verified.exp) return null
    return typeof body.jti === 'string' && body.jti ? { ...verified, jti: body.jti } : null
  } catch {
    return null
  }
}
export function conversationStore(pool, secret) {
  const emailDigest = (email) => createHmac('sha256', key(secret, 'sign-in')).update(email).digest('hex')
  async function readNativeForSession(sessionId, ownerAccountId, now = Date.now()) {
    if (
      typeof sessionId !== 'string' ||
      !sessionId ||
      typeof ownerAccountId !== 'string' ||
      !ownerAccountId ||
      !Number.isFinite(now)
    )
      return null
    const { rows } = await pool.query(
      'select * from widget_conversation where native_session_id = $1 and owner_account_id = $2',
      [sessionId, ownerAccountId]
    )
    const row = rows[0]
    if (!row) return null
    const data = await openConversationSnapshot(row, secret, Date.parse(row.expires_at) - 1)
    if (!data) throw Error('WIDGET_STATE_UNREADABLE')
    if (
      Date.parse(row.expires_at) <= now ||
      data.nativeHandoff?.state !== 'ready' ||
      data.nativeHandoff.sessionId !== sessionId ||
      data.nativeHandoff.ownerAccountId !== ownerAccountId
    )
      return null
    return {
      context: data.nativeHandoff.context,
      contextHash: data.nativeHandoff.contextHash,
      build: data.build,
      buildId: data.buildId
    }
  }
  return {
    readNativeForSession,
    async readContextForSession(...args) {
      return (await readNativeForSession(...args))?.context ?? null
    },
    async read(visitorId, ownerAccountId, now = Date.now()) {
      const { rows } = await pool.query('select * from widget_conversation where visitor_digest = $1', [
        visitorDigest(visitorId, secret)
      ])
      const row = rows[0]
      if (!row) return null
      // Authenticate metadata before distinguishing expiry from corruption.
      const authenticated = await openConversationSnapshot(row, secret, Date.parse(row.expires_at) - 1)
      if (!authenticated) throw Error('WIDGET_STATE_UNREADABLE')
      if (Date.parse(row.expires_at) <= now) return { expired: true, revision: Number(row.revision) }
      const data = authenticated
      if (!data) throw Error('WIDGET_STATE_UNREADABLE')
      if (row.owner_account_id && row.owner_account_id !== ownerAccountId)
        return {
          locked: true,
          ownerAccountId: row.owner_account_id,
          revision: Number(row.revision),
          expires: Date.parse(row.expires_at)
        }
      return {
        data,
        revision: Number(row.revision),
        ownerAccountId: row.owner_account_id,
        expires: Date.parse(row.expires_at)
      }
    },
    async write(
      visitorId,
      ownerAccountId,
      data,
      expectedRevision,
      previousOwnerAccountId = ownerAccountId,
      now = Date.now()
    ) {
      const row = await sealConversationSnapshot(
        { visitorId, ownerAccountId, data, capturedAt: now, revision: expectedRevision + 1 },
        secret
      )
      const values = [
        row.visitor_digest,
        row.owner_account_id,
        row.payload_cipher,
        row.schema_version,
        row.revision,
        row.expires_at
      ]
      const result =
        expectedRevision === 0
          ? await pool.query(
              `insert into widget_conversation(visitor_digest,owner_account_id,payload_cipher,schema_version,revision,expires_at,native_session_id) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning revision`,
              [...values, row.native_session_id]
            )
          : await pool.query(
              `update widget_conversation set owner_account_id=$2,payload_cipher=$3,schema_version=$4,revision=$5,expires_at=$6,native_session_id=$9,updated_at=now() where visitor_digest=$1 and revision=$7 and owner_account_id is not distinct from $8::uuid returning revision`,
              [...values, expectedRevision, previousOwnerAccountId, row.native_session_id]
            )
      if (!result.rows.length) throw new ConversationConflict()
      return { revision: row.revision, expires: Date.parse(row.expires_at) }
    },
    /**
     * 🔒 A WIDGET SIGN-IN SURVIVES A RESTART, BOUND TO THE VISITOR AND NOTHING ELSE (review Q4,
     * 20/10/2026). `tracy_sess` is SameSite=Lax, so the cross-site iframe never sends it back and the
     * sign-in lived only in this process (`v.authCookie`): every restart signed every widget visitor
     * out. The row is keyed by the visitor's digest — the proof is the widget's own random, HttpOnly
     * visitor cookie, never an id a page could know — and holds no cookie: the account, a digest of
     * its email, the sign-in's `jti` and its expiry. Restoring mints the same token again (same email,
     * `exp` and `jti`), which every read then checks against sign-out's revocation book, so a sign-in
     * ended anywhere is not restored. It goes with the visitor's row (cascade, the cron's sweep) and
     * with the account; one past its expiry before then is never read and is replaced by the next.
     * @param {string} visitorId @param {string} accountId @param {string} cookie - `tracy_sess=<token>`.
     * @returns {Promise<boolean>} whether a binding was written (a token without `jti` is not bound).
     */
    async bindSignIn(visitorId, accountId, cookie, now = Date.now()) {
      const claims = await signInClaims(cookie, secret, now)
      if (!claims || typeof accountId !== 'string' || !accountId) return false
      const { rowCount } = await pool.query(
        `insert into widget_sign_in(visitor_digest, account_id, email_digest, session_jti, expires_at)
         select $1, $2, $3, $4, $5 from account where id = $2 and email = $6
         on conflict (visitor_digest) do update
           set account_id = excluded.account_id, email_digest = excluded.email_digest,
               session_jti = excluded.session_jti, expires_at = excluded.expires_at, created_at = now()`,
        [
          visitorDigest(visitorId, secret),
          accountId,
          emailDigest(claims.email),
          claims.jti,
          new Date(claims.exp * 1000),
          claims.email
        ]
      )
      return (rowCount ?? 0) > 0
    },
    /**
     * The visitor's sign-in as a `tracy_sess=<token>` cookie for the backend, or null: none bound,
     * past its expiry, the visitor's row expired or is another account's, or the account's email is
     * no longer the one signed in. The caller still verifies it (revocation is checked on every
     * read, `lib/session.js`).
     */
    async readSignIn(visitorId, now = Date.now()) {
      const { rows } = await pool.query(
        // Only while the visitor's own row lives: an expired conversation is a new visitor, signed out.
        `select s.session_jti, s.expires_at, s.email_digest, a.email
           from widget_sign_in s
           join account a on a.id = s.account_id
           join widget_conversation c on c.visitor_digest = s.visitor_digest
          where s.visitor_digest = $1 and s.expires_at > $2 and c.expires_at > $2
            and c.owner_account_id = s.account_id`,
        [visitorDigest(visitorId, secret), new Date(now)]
      )
      const row = rows[0]
      if (!row || emailDigest(row.email) !== row.email_digest) return null
      const exp = Math.floor(Date.parse(row.expires_at) / 1000)
      const token = await mintSession(row.email, secret, (exp - SESSION_TTL_S) * 1000, {
        jti: row.session_jti
      })
      return `tracy_sess=${token}`
    },
    /** Forget the visitor's sign-in (sign-out, or a binding found ended). */
    async unbindSignIn(visitorId) {
      await pool.query('delete from widget_sign_in where visitor_digest = $1', [
        visitorDigest(visitorId, secret)
      ])
    },
    /** One batch of expired rows deleted; the cron (`sweepWidgetConversations`) calls it until done. */
    async cleanup(now = Date.now()) {
      return pool.query(
        'delete from widget_conversation where visitor_digest in (select visitor_digest from widget_conversation where expires_at <= $1 order by expires_at limit $2)',
        [new Date(now), CLEANUP_BATCH]
      )
    }
  }
}
/** Private seed only: caller must supply the exact rescued visitor/account, and cannot overwrite a row. */
export async function seedConversationSnapshot(
  pool,
  snapshot,
  secret,
  { visitorId, ownerAccountId, now = Date.now() }
) {
  if (
    snapshot.visitor_digest !== visitorDigest(visitorId, secret) ||
    snapshot.owner_account_id !== ownerAccountId
  )
    throw Error('WIDGET_RESCUE_BINDING_INVALID')
  if (!(await openConversationSnapshot(snapshot, secret, now))) throw Error('WIDGET_RESCUE_INVALID')
  const { rows } = await pool.query(
    'insert into widget_conversation(visitor_digest,owner_account_id,payload_cipher,schema_version,revision,expires_at,native_session_id) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning revision',
    [
      snapshot.visitor_digest,
      snapshot.owner_account_id,
      snapshot.payload_cipher,
      snapshot.schema_version,
      snapshot.revision,
      snapshot.expires_at,
      snapshot.native_session_id ?? null
    ]
  )
  if (!rows.length) throw new ConversationConflict()
}
