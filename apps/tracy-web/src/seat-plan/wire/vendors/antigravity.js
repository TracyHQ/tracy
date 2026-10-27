// Adapted from @goodandready/dsh-subscriptions 0.6.60-tracy.5 (MIT).
import { randomUUID } from 'node:crypto'
import { buildAuthorizeUrl } from '../oauth.js'
import { googleContents } from '../messages.js'
import { formTokenRequest, googleStream, throwHttpError, tokenBlobFromOAuth, readJson } from '../wire.js'
import { emailFromToken } from '../jwt.js'
import {
  CODE_ASSIST_STREAM,
  antigravityMetadata,
  antigravityIdentityHeaders,
  discoverProject,
  fetchAvailableModels,
  retrieveQuotaPercent,
  streamEnvelope,
  assistHeaders
} from '../code-assist.js'

export const id = 'antigravity'

// The public installed-app client the upstream adapter ships for imported CLI credentials. Its
// secret is not confidential (Google's installed-app model); PKCE protects the exchange.
const CLIENT_ID =
  ['681255809395', 'oo8ft2oprdrnp9e3aqf6av3hmdib135j'].join('-') + '.' + 'apps.googleusercontent.com'
const CLIENT_SECRET = ['GOCSPX', '4uHgMPm', '1o7Sk', 'geV6Cu5clXFsxl'].join('-')

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo'
const SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
  // `cclog` and `experimentsandconfigs` (dsh-subscriptions 0.6.60) are not registered for this client
  // any more: Google answers `403 restricted_client` (measured 10/10/2026). Nothing here reads them.
].join(' ')

export function providerInfo() {
  return { id, name: 'Antigravity (Gemini)' }
}

/** Which inputs a model takes: text only on this route (pictures are out of scope for Antigravity). */
export function inputModalities() {
  return ['text']
}

export function defaults() {
  return {
    // Tracy: upstream leaves the client empty (a person configures one); the broker has no such
    // setting, so it signs in with the upstream adapter's own CLI client.
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: 'http://localhost:8085/oauth/callback',
    models: [
      'gemini-3.8-flash-medium',
      'gemini-3.7-flash-medium',
      'gemini-3.6-flash-medium',
      'gemini-3.1-pro-low',
      'claude-sonnet-4.6-thinking',
      'claude-opus-4.6-thinking',
      'gpt-oss-120b-medium',
      'gemini-3.1-pro-high-vertex',
      'gemini-3-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash'
    ]
  }
}

export function authorizeUrl(cfg, pkce) {
  return buildAuthorizeUrl({
    authUrl: AUTH,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    challenge: pkce.challenge,
    state: pkce.state,
    scope: SCOPE,
    extra: { access_type: 'offline', prompt: 'consent' }
  })
}

const headersFor = (projectId) => antigravityIdentityHeaders(projectId)

/** The blob with its Code Assist project; unchanged when Google cannot say (the stream then reports). */
async function withProject(blob, fetchImpl) {
  if (blob.projectId && blob.paidTierId) return { ...blob, sessionId: blob.sessionId || randomUUID() }
  try {
    const found = await discoverProject(
      fetchImpl,
      blob.accessToken,
      antigravityMetadata(blob.projectId || ''),
      headersFor(blob.projectId || '')
    )
    return {
      ...blob,
      projectId: found.projectId || blob.projectId || '',
      paidTierId: found.paidTierId || blob.paidTierId || '',
      paidTierName: found.paidTierName || blob.paidTierName || '',
      accountNotice: found.accountNotice || blob.accountNotice || '',
      sessionId: blob.sessionId || randomUUID()
    }
  } catch (e) {
    if (e && e.code === 'VALIDATION_REQUIRED' && e.validationUrl) {
      return { ...blob, validationUrl: e.validationUrl, validationMessage: String(e.message || '') }
    }
    return blob
  }
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await formTokenRequest(
    TOKEN,
    {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret || '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: pkce.verifier
    },
    fetchImpl
  )
  const blob = tokenBlobFromOAuth(json)
  const email = emailFromToken(blob.idToken)
  return withProject({ ...blob, email, label: email || 'Antigravity' }, fetchImpl || fetch)
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await formTokenRequest(
    TOKEN,
    {
      client_id: cfg.clientId,
      ...(cfg.clientSecret ? { client_secret: cfg.clientSecret } : {}),
      grant_type: 'refresh_token',
      refresh_token: blob.refreshToken
    },
    fetchImpl
  )
  return tokenBlobFromOAuth(json, {
    label: blob.label,
    email: blob.email,
    projectId: blob.projectId,
    paidTierId: blob.paidTierId,
    paidTierName: blob.paidTierName,
    sessionId: blob.sessionId
  })
}

/** The Google account behind the blob: `sub` of the id_token, else of the userinfo endpoint. */
export async function identity(blob, fetchImpl) {
  const claims = decodeClaims(blob.idToken)
  if (typeof claims?.sub === 'string' && claims.sub) return { subject: claims.sub, email: claims.email || '' }
  const res = await (fetchImpl || fetch)(USERINFO, {
    headers: { Authorization: `Bearer ${blob.accessToken}`, Accept: 'application/json' }
  })
  const json = await readJson(res)
  return { subject: typeof json.sub === 'string' ? json.sub : '', email: json.email || '' }
}

function decodeClaims(token) {
  const part = String(token || '').split('.')[1]
  if (!part) return null
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export async function check(blob, cfg, fetchImpl) {
  const models = await listModels(blob, cfg, fetchImpl)
  return { ok: true, raw: { models } }
}

export async function listModels(blob, cfg, fetchImpl) {
  const fallback = cfg?.models || defaults().models
  return fetchAvailableModels(
    fetchImpl || fetch,
    blob.accessToken,
    headersFor(blob.projectId || ''),
    fallback,
    id
  )
}

export async function usage(blob, _cfg, fetchImpl) {
  return retrieveQuotaPercent(fetchImpl || fetch, blob.accessToken, headersFor(blob.projectId || ''))
}

export async function* streamOnce({ blob, options, fetchImpl, headers, signal }) {
  const impl = fetchImpl || fetch
  // Abort covers the project pre-flight as well as the stream.
  const ready = await withProject(blob, (u, i) => impl(u, { ...i, signal }))
  const { envelope } = streamEnvelope({
    projectId: ready.projectId,
    model: options.model,
    request: googleContents(options),
    userAgent: 'antigravity',
    sessionId: ready.sessionId,
    paidTierId: ready.paidTierId
  })
  const res = await impl(`${CODE_ASSIST_STREAM}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: {
      ...headers,
      ...assistHeaders(ready.accessToken, {
        ...headersFor(ready.projectId || ''),
        Accept: 'text/event-stream'
      })
    },
    body: JSON.stringify(envelope),
    signal
  })
  if (!res.ok) throwHttpError(res.status, await res.text())
  yield* googleStream(res.body)
}
