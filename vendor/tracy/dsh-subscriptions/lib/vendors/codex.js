import { isTimeoutError, fetchWithTimeout } from "../http.js"
import { randomUUID, createHash } from 'node:crypto'
import { buildAuthorizeUrl } from '../oauth.js'
import { codexResponsesBody, modelCatalog } from '../messages.js'
import { chatgptAccountId, emailFromToken } from '../jwt.js'
import { formTokenRequest, codexResponsesStream, readJson, tokenBlobFromOAuth, httpError } from '../wire.js'
import { asUsageSnapshot, usageWindows, deepestUsedPercent } from '../usage.js'

export const id = 'codex'

const AUTH = 'https://auth.openai.com/oauth/authorize'
const TOKEN = 'https://auth.openai.com/oauth/token'
const USAGE = 'https://chatgpt.com/backend-api/wham/usage'
// #90: device-code login (headless). OpenAI mints an authorization_code +
// code_verifier server-side; we finish with the normal PKCE exchange.
const DEVICE_USERCODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode'
const DEVICE_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token'
const DEVICE_AUTH_URL = 'https://auth.openai.com/codex/device'
const DEVICE_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback'
const SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke'
const INSTRUCTIONS = 'You are a coding assistant using a ChatGPT Codex subscription.'

export function providerInfo() {
  return { id, name: 'ChatGPT Codex' }
}

export function defaults() {
  return {
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    redirectUri: 'http://localhost:1455/auth/callback',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    originator: 'codex_cli_rs',
    models: [
      { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' },
      { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
      { id: 'gpt-6-sol', name: 'GPT-6 Sol' },
      { id: 'gpt-6-luna', name: 'GPT-6 Luna' },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
      { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
    clientVersion: '0.160.0',
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
    extra: {
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: cfg.originator || 'codex_cli_rs',
    },
  })
}

function identityHeaders(blob, config, extra) {
  const originator = config.originator || 'codex_cli_rs'
  return {
    Authorization: `Bearer ${blob.accessToken}`,
    originator,
    'chatgpt-account-id': blob.accountId || '',
    'ChatGPT-Account-ID': blob.accountId || '',
    'User-Agent': `${originator}/0.0.1`,
    'OpenAI-Beta': 'responses=experimental',
    ...(extra || {}),
  }
}

function decorate(blob, json) {
  const idToken = (json && json.id_token) || blob.idToken || ''
  return {
    ...blob,
    accountId: blob.accountId || chatgptAccountId(idToken) || chatgptAccountId(blob.accessToken),
    email: blob.email || emailFromToken(idToken) || emailFromToken(blob.accessToken),
    label: blob.label || emailFromToken(idToken) || emailFromToken(blob.accessToken) || 'ChatGPT',
  }
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await formTokenRequest(TOKEN, {
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: pkce.verifier,
  }, fetchImpl)
  return decorate(tokenBlobFromOAuth(json), json)
}

export async function deviceStart(cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(DEVICE_USERCODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: cfg.clientId }),
  })
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), 'DEVICE')
  const json = await readJson(res)
  if (!json || typeof json.user_code !== 'string' || typeof json.device_auth_id !== 'string') {
    throw httpError(502, 'device auth response is incomplete', 'DEVICE')
  }
  return {
    userCode: json.user_code,
    deviceAuthId: json.device_auth_id,
    intervalMs: Math.max(parseInt(json.interval, 10) || 5, 1) * 1000,
    authUrl: DEVICE_AUTH_URL,
  }
}

export async function devicePoll(cfg, session, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(DEVICE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ device_auth_id: session.deviceAuthId, user_code: session.userCode }),
  })
  // 403/404 = not confirmed yet (matches reference implementations)
  if (res.status === 403 || res.status === 404) return { status: 'pending' }
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), 'DEVICE')
  const json = await readJson(res)
  if (!json || typeof json.authorization_code !== 'string' || typeof json.code_verifier !== 'string') {
    throw httpError(502, 'device auth token response is incomplete', 'DEVICE')
  }
  const deviceCfg = { ...cfg, redirectUri: DEVICE_REDIRECT_URI }
  const blob = await exchangeCode(deviceCfg, { verifier: json.code_verifier }, json.authorization_code, impl)
  return { status: 'authorized', blob }
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await formTokenRequest(TOKEN, {
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    refresh_token: blob.refreshToken,
  }, fetchImpl)
  return decorate(tokenBlobFromOAuth(json, {
    label: blob.label,
    email: blob.email,
    accountId: blob.accountId,
  }), json)
}

export async function listModels(blob, cfg, fetchImpl) {
  const rawModels = (cfg && cfg.models && cfg.models.length) ? cfg.models : defaults().models
  const catalog = modelCatalog(id, rawModels)
  const impl = fetchImpl || fetch
  try {
    const base = (cfg.baseUrl || defaults().baseUrl).replace(/\/$/, '')
    const version = cfg.clientVersion || defaults().clientVersion
    const res = await fetchWithTimeout(impl, `${base}/models?client_version=${encodeURIComponent(version)}`, {
      headers: identityHeaders(blob, cfg, { Accept: 'application/json' }),
    }, { timeoutMs: 15000 })
    const json = await readJson(res)
    const rows = []
    for (const entry of json.models || json.data || []) {
      const slug = entry && (entry.slug || entry.id)
      if (!slug) continue
      if (entry.visibility === 'hide' || entry.visibility === 'none') continue
      const efforts = (entry.supported_reasoning_levels || [])
        .map((level) => (typeof level === 'string' ? level : level && level.effort))
        .filter(Boolean)
        .map((effort) => ({ id: effort, name: effort }))
      rows.push({
        id: slug,
        name: entry.display_name || slug,
        priority: Number(entry.priority) || 0,
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.context_window ? { contextWindow: entry.context_window } : {}),
        ...(efforts.length ? { reasoning: { efforts } } : {}),
      })
    }
    if (!rows.length) throw new Error('empty codex catalog')
    rows.sort((a, b) => a.priority - b.priority)
    return modelCatalog(id, rows.map((row) => { const copy = { ...row }; delete copy.priority; return copy }))
  } catch { /* catalog fallback */ }
  return catalog
}


export async function check(blob, cfg, fetchImpl) {
  const base = (cfg.baseUrl || defaults().baseUrl).replace(/\/$/, "")
  const version = cfg.clientVersion || defaults().clientVersion
  const impl = fetchImpl || fetch
  const res = await fetchWithTimeout(impl, base + "/models?client_version=" + encodeURIComponent(version), {
    headers: identityHeaders(blob, cfg, { Accept: "application/json" }),
  }, { timeoutMs: 15000 })
  if (!res.ok) throw httpError(res.status, await res.text())
  const json = await readJson(res)
  // quota headers may contain limits
  return { ok: true, raw: json }
}

export async function usage(blob, cfg, fetchImpl) {
  try {
    const res = await fetchWithTimeout(fetchImpl || fetch, USAGE, {
      headers: identityHeaders(blob, cfg, { Accept: 'application/json' }),
    })
    const json = await readJson(res)
    const snap = asUsageSnapshot(deepestUsedPercent(json))
    if (snap) snap.windows = usageWindows(json)
    return snap
  } catch (err) {
    if (isTimeoutError(err)) throw err
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const base = (config.baseUrl || defaults().baseUrl).replace(/\/$/, '')
  const body = /** @type {Record<string, any>} */ (codexResponsesBody(options, INSTRUCTIONS, config))
  const sessionId = deriveSessionId(options)

  // Prompt Cache Affinity
  body.prompt_cache_key = sessionId
  delete body.session_id
  delete body.prompt_cache_retention
  delete body.prompt_cache_options

  const isFast = !!(config && config.fastMode) || String((options && options.model) || '').toLowerCase().endsWith('-fast')
  if (isFast) {
    body.service_tier = 'priority'
  }

  const codexHeaders = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'session-id': sessionId,
    'x-client-request-id': sessionId,
    ...(isFast ? { 'x-codex-routing-hint': `model=${(options && options.model) || 'gpt-5.6-luna'};tier=priority` } : {}),
  }

  const res = await fetchImpl(`${base}/responses`, {
    method: 'POST',
    headers: {
      ...headers,
      ...identityHeaders(blob, config, codexHeaders),
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  yield* codexResponsesStream(res.body)
}
export function deriveSessionId(options) {
  const explicit = (options && (options.sessionId || options.session_id || options.conversationId || options.prompt_cache_key))
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 64)
  }
  const firstUserMsg = (options && options.messages || []).find((m) => m.role === 'user')
  const text = (firstUserMsg && (typeof firstUserMsg.content === 'string' ? firstUserMsg.content : JSON.stringify(firstUserMsg.content))) || ''
  if (text) {
    const hash = createHash('sha256').update(text.slice(0, 500)).digest('hex').slice(0, 32)
    return `dsh-sub-${hash}`
  }
  return randomUUID()
}
