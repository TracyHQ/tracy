/** Dedicated Invitations Gmail OAuth, and the single-request send and search calls the real
 * campaign send ledger uses (`real-send.js`). Nothing here retries a send. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { json } from '../lib/http.js'

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send'
]
const COOKIE = 'tracy_invitations_gmail_state'
const digest = (value) => createHash('sha256').update(value).digest('hex')
const b64 = (value) => Buffer.from(value).toString('base64url')
const oauthPath = '/api/ops/invitations/gmail/callback'

function key(config) {
  const raw = config.invitationsGmail?.key
  if (!raw) return null
  const decoded = Buffer.from(raw, 'base64')
  return decoded.length === 32 ? decoded : null
}
function seal(value, config, purpose) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(config), iv)
  cipher.setAAD(Buffer.from(`invitations:gmail:${purpose}:v1`))
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v1.${b64(iv)}.${b64(cipher.getAuthTag())}.${b64(ciphertext)}`
}
function open(value, config, purpose) {
  try {
    const [version, iv, tag, ciphertext, extra] = value.split('.')
    if (version !== 'v1' || extra || !key(config)) return null
    const decipher = createDecipheriv('aes-256-gcm', key(config), Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(`invitations:gmail:${purpose}:v1`))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString(
      'utf8'
    )
  } catch {
    return null
  }
}
function configured(config) {
  const oauth = config.invitationsGmail
  return !!(oauth?.clientId && oauth.clientSecret && oauth.keyId && oauth.address && key(config))
}
/** The mailbox invitations are sent from (the INVITATIONS_GMAIL_ADDRESS setting). */
const mailbox = (config) => config.invitationsGmail?.address

function cookie(state, secure, clear = false) {
  return `${COOKIE}=${clear ? '' : state}; HttpOnly; SameSite=Lax; Path=${oauthPath}; Max-Age=${clear ? 0 : 600}${secure ? '; Secure' : ''}`
}
function cookieValue(c) {
  return c.req.header('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1] ?? null
}
function sameOrigin(c, config) {
  return c.req.header('origin') === config.origin
}
function view(row, config) {
  const credentialUsable =
    row?.refresh_cipher &&
    row?.key_id === config.invitationsGmail?.keyId &&
    open(row.refresh_cipher, config, `refresh:${row.refresh_generation}`)
  const status =
    row?.status === 'connected' && !credentialUsable ? 'reconnect_required' : (row?.status ?? 'not_connected')
  const scopes = row?.scopes ?? []
  return {
    status: configured(config) ? status : 'not_configured',
    configured: configured(config),
    address: row?.address ?? null,
    from: row?.address && row.address === mailbox(config) ? `Sarah <${row.address}>` : null,
    read: status === 'connected' && scopes.includes(GMAIL_SCOPES[0]),
    send: status === 'connected' && scopes.includes(GMAIL_SCOPES[1]),
    generation: Number(row?.generation ?? 0),
    lastVerifiedAt: row?.last_verified_at ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    errorCode: row?.error_code ?? null,
    redirectUri: `${config.origin}${oauthPath}`,
    sendingEnabled: false
  }
}
export async function gmailStatus(pool, config) {
  const row = (await pool.query("select * from invitations_mailbox where id='gmail'")).rows[0]
  return view(row, config)
}
async function providerJson(fetcher, url, init) {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(10000) })
  if (!response.ok) return null
  return response.json().catch(() => null)
}
export function invitationsGmailRoutes({ pool, config, fetcher = fetch }) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    if (!['owner', 'admin'].includes(c.get('invitationsActor')?.role))
      return json(c, { code: 'forbidden' }, 403)
    await next()
  })
  app.get('/', async (c) => json(c, await gmailStatus(pool, config)))
  app.post('/connect', async (c) => {
    if (!sameOrigin(c, config)) return json(c, { code: 'same_origin_required' }, 403)
    if (!configured(config)) return json(c, { code: 'gmail_not_configured' }, 503)
    const actor = c.get('invitationsActor')
    const session = c.req.header('cookie')?.match(/(?:^|;\s*)tracy_sess=([^;]+)/)?.[1]
    if (!session) return json(c, { code: 'not_signed_in' }, 401)
    const state = b64(randomBytes(32))
    const verifier = b64(randomBytes(32))
    const challenge = b64(createHash('sha256').update(verifier).digest())
    const db = await pool.connect()
    let generation
    try {
      await db.query('begin')
      const row = (
        await db.query(
          `insert into invitations_mailbox(id,generation,status) values('gmail',1,'reconnect_required')
         on conflict(id) do update set generation=invitations_mailbox.generation+1,
         status='reconnect_required',error_code=null,updated_at=now() returning generation`
        )
      ).rows[0]
      generation = Number(row.generation)
      await db.query('delete from invitations_mailbox_oauth where actor=$1', [actor.email])
      await db.query(
        `insert into invitations_mailbox_oauth(state_hash,actor,session_hash,generation,verifier_cipher,expires_at)
         values($1,$2,$3,$4,$5,now()+interval '10 minutes')`,
        [
          digest(state),
          actor.email,
          digest(session),
          generation,
          seal(verifier, config, `pkce:${digest(state)}`)
        ]
      )
      await db.query(
        'insert into invitations_mailbox_audit(actor,action,generation,result) values($1,$2,$3,$4)',
        [actor.email, 'connect_started', generation, 'pending']
      )
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    } finally {
      db.release()
    }
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    for (const [name, value] of Object.entries({
      client_id: config.invitationsGmail.clientId,
      redirect_uri: `${config.origin}${oauthPath}`,
      response_type: 'code',
      scope: GMAIL_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      login_hint: mailbox(config),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }))
      url.searchParams.set(name, value)
    c.header('Set-Cookie', cookie(state, config.secure))
    c.header('Cache-Control', 'no-store')
    return json(c, { authorizationUrl: url.toString(), generation })
  })
  app.get('/callback', async (c) => {
    const actor = c.get('invitationsActor')
    const state = c.req.query('state')
    const code = c.req.query('code')
    const session = c.req.header('cookie')?.match(/(?:^|;\s*)tracy_sess=([^;]+)/)?.[1]
    c.header('Set-Cookie', cookie('', config.secure, true))
    c.header('Cache-Control', 'no-store')
    const finish = (result) => c.redirect(`/ops/invitations?gmail=${result}`, 303)
    if (!configured(config) || !state || !session || state !== cookieValue(c)) return finish('invalid_state')
    const stateHash = digest(state)
    const db = await pool.connect()
    let flow
    try {
      await db.query('begin')
      flow = (
        await db.query(
          'delete from invitations_mailbox_oauth where state_hash=$1 returning *, expires_at > now() as unexpired',
          [stateHash]
        )
      ).rows[0]
      const current = (
        await db.query("select generation from invitations_mailbox where id='gmail' for update")
      ).rows[0]
      if (
        !flow ||
        flow.actor !== actor.email ||
        flow.session_hash !== digest(session) ||
        !flow.unexpired ||
        Number(flow.generation) !== Number(current?.generation)
      ) {
        await db.query('commit')
        return finish('invalid_state')
      }
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    } finally {
      db.release()
    }
    const failFlow = async (reason) => {
      await pool.query(
        `update invitations_mailbox set status='reconnect_required',error_code=$2,updated_at=now()
         where id='gmail' and generation=$1`,
        [flow.generation, reason]
      )
      await pool.query(
        'insert into invitations_mailbox_audit(actor,action,generation,result) values($1,$2,$3,$4)',
        [actor.email, 'connect_failed', flow.generation, reason]
      )
      return finish(reason)
    }
    if (!code || c.req.query('error')) return failFlow('consent_denied')
    const verifier = open(flow.verifier_cipher, config, `pkce:${stateHash}`)
    if (!verifier) return failFlow('invalid_state')
    const token = await providerJson(fetcher, 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.invitationsGmail.clientId,
        client_secret: config.invitationsGmail.clientSecret,
        redirect_uri: `${config.origin}${oauthPath}`,
        grant_type: 'authorization_code',
        code_verifier: verifier
      })
    }).catch(() => null)
    if (!token?.access_token || !token.refresh_token) return failFlow('offline_token_required')
    const revokeNewToken = async () => {
      await fetcher('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: token.refresh_token }),
        signal: AbortSignal.timeout(10000)
      }).catch(() => null)
    }
    const scopes = (token.scope ?? '').split(/\s+/).filter(Boolean)
    if (!GMAIL_SCOPES.every((scope) => scopes.includes(scope))) {
      await revokeNewToken()
      return failFlow('missing_scope')
    }
    const profile = await providerJson(fetcher, 'https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { authorization: `Bearer ${token.access_token}` }
    }).catch(() => null)
    if (profile?.emailAddress?.toLowerCase() !== mailbox(config)) {
      await revokeNewToken()
      return failFlow('wrong_mailbox')
    }
    const cipher = seal(token.refresh_token, config, `refresh:${flow.generation}`)
    const result = await pool.query(
      `update invitations_mailbox set status='connected',address=$2,scopes=$3,refresh_cipher=$4,
       refresh_generation=$1,
       key_id=$5,last_verified_at=now(),error_code=null,updated_at=now()
       where id='gmail' and generation=$1 returning generation`,
      [flow.generation, mailbox(config), scopes, cipher, config.invitationsGmail.keyId]
    )
    if (!result.rowCount) return finish('stale_connection')
    await pool.query(
      'insert into invitations_mailbox_audit(actor,action,generation,result) values($1,$2,$3,$4)',
      [actor.email, 'connected', flow.generation, 'verified']
    )
    return finish('connected')
  })
  app.post('/disconnect', async (c) => {
    if (!sameOrigin(c, config)) return json(c, { code: 'same_origin_required' }, 403)
    const actor = c.get('invitationsActor')
    const db = await pool.connect()
    let previous
    let generation
    try {
      await db.query('begin')
      previous = (await db.query("select * from invitations_mailbox where id='gmail' for update")).rows[0]
      const row = (
        await db.query(
          `update invitations_mailbox set generation=generation+1,status='disconnected',
        refresh_cipher=null,refresh_generation=null,key_id=null,scopes='{}',address=null,last_verified_at=null,
         last_sync_at=null,error_code=null,updated_at=now() where id='gmail' returning generation`
        )
      ).rows[0]
      generation = Number(row?.generation ?? 0)
      await db.query('delete from invitations_mailbox_oauth')
      if (row)
        await db.query(
          'insert into invitations_mailbox_audit(actor,action,generation,result) values($1,$2,$3,$4)',
          [actor.email, 'disconnected', generation, 'local_credential_removed']
        )
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    } finally {
      db.release()
    }
    let revocation = 'no_token'
    if (previous?.refresh_cipher) {
      const token =
        previous.key_id === config.invitationsGmail?.keyId
          ? open(previous.refresh_cipher, config, `refresh:${previous.refresh_generation}`)
          : null
      revocation = token ? 'failed' : 'unavailable'
      if (token) {
        const response = await fetcher('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
          signal: AbortSignal.timeout(10000)
        }).catch(() => null)
        if (response?.ok) revocation = 'succeeded'
      }
    }
    if (generation)
      await pool.query(
        'insert into invitations_mailbox_audit(actor,action,generation,result) values($1,$2,$3,$4)',
        [actor.email, 'revoke', generation, revocation]
      )
    return json(c, { ...(await gmailStatus(pool, config)), revocation })
  })
  return app
}

// ---- Send path (real campaign test sends). Every call below is ONE request: no retry, ever, for
// `messages.send` — a retried request can deliver twice, and Gmail does not deduplicate.

export class GmailCallError extends Error {
  /** @param {string} code - stable reason; `kind`: 'rejected' (provider did not accept), 'unknown'
   *  (it may have accepted) or 'blocked' (nothing was sent, the mailbox is not usable). */
  constructor(code, kind) {
    super(code)
    this.code = code
    this.kind = kind
  }
}

/** A short-lived access token from the stored refresh token, or GmailCallError('blocked'). */
export async function gmailAccessToken({ pool, config, fetcher = fetch }) {
  const row = (await pool.query("select * from invitations_mailbox where id='gmail'")).rows[0]
  const status = view(row, config)
  if (status.status !== 'connected' || status.address !== mailbox(config) || !status.send)
    throw new GmailCallError('MAILBOX_NOT_READY', 'blocked')
  const refresh = open(row.refresh_cipher, config, `refresh:${row.refresh_generation}`)
  let response
  try {
    response = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: config.invitationsGmail.clientId,
        client_secret: config.invitationsGmail.clientSecret
      }),
      signal: AbortSignal.timeout(10000)
    })
  } catch {
    throw new GmailCallError('MAILBOX_TOKEN_UNAVAILABLE', 'blocked')
  }
  const token = await response.json().catch(() => null)
  if (response.status === 400 && token?.error === 'invalid_grant') {
    await pool.query(
      "update invitations_mailbox set status='reconnect_required',error_code='invalid_grant',updated_at=now() where id='gmail' and generation=$1",
      [row.generation]
    )
    throw new GmailCallError('MAILBOX_RECONNECT_REQUIRED', 'blocked')
  }
  if (!response.ok || !token?.access_token) throw new GmailCallError('MAILBOX_TOKEN_UNAVAILABLE', 'blocked')
  return { accessToken: token.access_token, generation: Number(row.generation) }
}

/** messages.send once. Resolves {id, threadId}; throws GmailCallError 'rejected' when Google
 * answered that it did not take the message, 'unknown' when it may have. */
export async function gmailSendRaw({ accessToken, raw, fetcher = fetch, timeoutMs = 30000 }) {
  let response
  try {
    response = await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: Buffer.from(raw, 'utf8').toString('base64url') }),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch {
    // Timeout, reset or DNS after the request may have left: Gmail may hold the message.
    throw new GmailCallError('SEND_NO_RESPONSE', 'unknown')
  }
  const data = await response.json().catch(() => null)
  if (response.ok) {
    if (typeof data?.id === 'string' && typeof data?.threadId === 'string')
      return { id: data.id, threadId: data.threadId }
    throw new GmailCallError('SEND_NO_IDENTIFIERS', 'unknown')
  }
  if (response.status >= 500) throw new GmailCallError(`SEND_PROVIDER_${response.status}`, 'unknown')
  const reason = data?.error?.errors?.[0]?.reason ?? data?.error?.status ?? ''
  if (
    response.status === 429 ||
    /rateLimitExceeded|userRateLimitExceeded|dailyLimitExceeded|quotaExceeded/i.test(reason)
  )
    throw new GmailCallError(
      /daily|quota/i.test(reason) ? 'SEND_DAILY_QUOTA' : 'SEND_RATE_LIMITED',
      'rejected'
    )
  if (response.status === 401 || response.status === 403)
    throw new GmailCallError('SEND_FORBIDDEN', 'rejected')
  throw new GmailCallError(`SEND_REJECTED_${response.status}`, 'rejected')
}

/** Find sent messages by RFC Message-ID (read scope). Resolves the Gmail ids found, possibly none;
 * throws GmailCallError 'unknown' when the search itself failed, which proves nothing. */
export async function gmailFindByMessageId({ accessToken, messageId, fetcher = fetch }) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  url.searchParams.set('q', `rfc822msgid:${messageId}`)
  url.searchParams.set('includeSpamTrash', 'true')
  let response
  try {
    response = await fetcher(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000)
    })
  } catch {
    throw new GmailCallError('SEARCH_UNAVAILABLE', 'unknown')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new GmailCallError('SEARCH_UNAVAILABLE', 'unknown')
  return (data.messages ?? []).map((m) => ({ id: m.id, threadId: m.threadId }))
}
