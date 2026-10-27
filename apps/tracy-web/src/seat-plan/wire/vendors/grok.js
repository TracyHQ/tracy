// Adapted from @goodandready/dsh-subscriptions 0.6.60-tracy.5 (MIT).
import { buildAuthorizeUrl } from '../oauth.js'
import { fetchWithTimeout } from '../http.js'
import { modelCatalog, codexResponsesBody } from '../messages.js'
import { formTokenRequest, codexResponsesStream, httpError, tokenBlobFromOAuth, readJson } from '../wire.js'
import { emailFromToken, subjectFromToken } from '../jwt.js'
import { asUsageSnapshot, usageWindows, grokBillingPercent } from '../usage.js'

export const id = 'grok'

const AUTH = 'https://auth.x.ai/oauth2/authorize'
const TOKEN = 'https://auth.x.ai/oauth2/token'
const SCOPE =
  'openid profile email offline_access grok-cli:access api:access conversations:read conversations:write'
const BILLING = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const MODELS = 'https://api.x.ai/v1/models'
const CLI_MODELS = 'https://cli-chat-proxy.grok.com/v1/models'
const CATALOG_TTL_MS = 5 * 60 * 1000
const catalogCache = new Map()

async function cliCatalogCached(blob, cfg, fetchImpl) {
  const key = String(blob.accessToken || '').slice(-24)
  const hit = catalogCache.get(key)
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.map
  const map = await cliCatalog(blob, cfg, fetchImpl)
  if (map.size > 0) catalogCache.set(key, { at: Date.now(), map })
  return map
}

function grokReasoningBody(modelId, effort, catalogMap) {
  const entry = catalogMap && catalogMap.get(modelId)
  const reasoning = entry && entry.reasoning
  if (!reasoning || !reasoning.efforts || !reasoning.efforts.length) return undefined
  const allowed = new Set(reasoning.efforts.map((row) => row.id))
  const pick = effort != null && effort !== '' ? String(effort) : ''
  if (pick && allowed.has(pick)) return { effort: pick }
  return undefined
}

function grokBodyForModel(modelId, body) {
  if (!/multi-agent/i.test(String(modelId || ''))) return body
  const next = { ...body }
  delete next.tools
  return next
}

export function providerInfo() {
  return { id, name: 'Grok' }
}

export function defaults() {
  return {
    clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
    redirectUri: 'http://127.0.0.1:56121/callback',
    baseUrl: 'https://api.x.ai/v1',
    clientVersion: '0.2.103',
    models: [
      { id: 'grok-4', name: 'Grok 4' },
      { id: 'grok-4-fast-reasoning', name: 'Grok 4 Fast Reasoning' },
      { id: 'grok-code-fast-1', name: 'Grok Code Fast 1' }
    ]
  }
}

function isChatModel(modelId) {
  return !/imagine|image-|video|embed/i.test(String(modelId || ''))
}

function grokModalities(modelId) {
  return /code|embed/i.test(String(modelId || '')) ? ['text'] : ['text', 'image']
}
/** Which inputs a model takes (the catalog's own rule). */
export const inputModalities = grokModalities

function identityHeaders(blob, config) {
  return {
    Authorization: `Bearer ${blob.accessToken}`,
    'X-XAI-Token-Auth': 'xai-grok-cli',
    'x-grok-client-identifier': 'grok-shell',
    'x-grok-client-version': config.clientVersion || defaults().clientVersion,
    'User-Agent': 'xai-grok-cli'
  }
}

function streamHeaders(blob, config, extra) {
  const base = String(config.baseUrl || defaults().baseUrl)
  const headers = {
    Authorization: `Bearer ${blob.accessToken}`,
    ...extra
  }
  if (/grok\.com/i.test(base)) Object.assign(headers, identityHeaders(blob, config))
  return headers
}

export function authorizeUrl(cfg, pkce) {
  return buildAuthorizeUrl({
    authUrl: AUTH,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    challenge: pkce.challenge,
    state: pkce.state,
    scope: SCOPE
  })
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await formTokenRequest(
    TOKEN,
    {
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: pkce.verifier
    },
    fetchImpl
  )
  return decorate(tokenBlobFromOAuth(json))
}

/** The email lives in the OpenID id token (scope `openid email`); the access token is the fallback. */
function decorate(blob) {
  return {
    ...blob,
    email: blob.email || emailFromToken(blob.idToken) || emailFromToken(blob.accessToken),
    label: blob.label || 'Grok'
  }
}

/**
 * The person a Grok connection belongs to. dsh-subscriptions reads no xAI profile door and none is
 * verified here, so the subject is the OpenID `sub` of the id token (scope `openid`), or of the
 * access token when no id token came back. Null when neither is a JWT with a subject.
 */
export function identity(blob) {
  const subject = subjectFromToken(blob.idToken) || subjectFromToken(blob.accessToken)
  if (!subject) return null
  return {
    subject,
    label: blob.email || emailFromToken(blob.idToken) || emailFromToken(blob.accessToken) || 'Grok'
  }
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await formTokenRequest(
    TOKEN,
    {
      grant_type: 'refresh_token',
      client_id: cfg.clientId,
      refresh_token: blob.refreshToken
    },
    fetchImpl
  )
  // A refresh answer may carry no new id token; keep the one the identity was read from.
  const next = tokenBlobFromOAuth(json, { label: blob.label, email: blob.email })
  return decorate({ ...next, idToken: next.idToken || blob.idToken || '' })
}

/** Every side door is bounded: a proxy that never answers must not hold a connect or a turn open. */
const SIDE_DOOR_TIMEOUT_MS = 15000

async function cliCatalog(blob, cfg, fetchImpl) {
  const res = await fetchWithTimeout(
    fetchImpl || fetch,
    CLI_MODELS,
    { headers: { ...identityHeaders(blob, cfg), Accept: 'application/json' } },
    { timeoutMs: SIDE_DOOR_TIMEOUT_MS }
  )
  const json = await readJson(res)
  const map = new Map()
  for (const entry of json.data || []) {
    if (!entry || !entry.id) continue
    const efforts = (entry.reasoning_efforts || [])
      .map((level) =>
        typeof level === 'string'
          ? { id: level, name: level }
          : level &&
            level.value && {
              id: level.value,
              name: level.label || level.value
            }
      )
      .filter(Boolean)
    const reasoning =
      entry.supports_reasoning_effort === true && efforts.length
        ? {
            efforts,
            ...(entry.reasoning_effort && efforts.some((row) => row.id === entry.reasoning_effort)
              ? { defaultEffort: entry.reasoning_effort }
              : {})
          }
        : undefined
    map.set(entry.id, {
      name: entry.name || entry.id,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.context_window ? { contextWindow: entry.context_window } : {}),
      ...(reasoning ? { reasoning } : {})
    })
  }
  return map
}

export async function listModels(blob, cfg, fetchImpl) {
  const fallback = modelCatalog(
    id,
    (cfg.models || defaults().models).map((row) =>
      typeof row === 'string' ? row : { ...row, inputModalities: grokModalities(row.id) }
    )
  )
  const impl = fetchImpl || fetch
  try {
    const [res, extra] = await Promise.all([
      impl(MODELS, { headers: { Authorization: `Bearer ${blob.accessToken}`, Accept: 'application/json' } }),
      cliCatalog(blob, cfg, impl).catch(() => new Map())
    ])
    const json = await readJson(res)
    const rows = []
    for (const entry of json.data || []) {
      const modelId = entry && entry.id
      if (!modelId || !isChatModel(modelId)) continue
      const enrich = extra.get(modelId) || {}
      const note = /multi-agent/i.test(modelId)
        ? 'Chat only in Tracy until xAI grants multi-agent tool beta.'
        : ''
      rows.push({
        id: modelId,
        name: enrich.name || modelId,
        inputModalities: grokModalities(modelId),
        ...enrich,
        ...(note ? { description: enrich.description ? `${enrich.description} ${note}` : note } : {})
      })
    }
    if (!rows.length) throw new Error('empty grok catalog')
    return modelCatalog(id, rows)
  } catch {
    return fallback
  }
}

export async function check(blob, cfg, fetchImpl) {
  const res = await fetchWithTimeout(
    fetchImpl || fetch,
    MODELS,
    { headers: { Authorization: 'Bearer ' + blob.accessToken, Accept: 'application/json' } },
    { timeoutMs: SIDE_DOOR_TIMEOUT_MS }
  )
  if (!res.ok) throw httpError(res.status, await res.text())
  const json = await readJson(res)
  return { ok: true, raw: json }
}

export async function usage(blob, cfg, fetchImpl) {
  try {
    const impl = (url, init) =>
      fetchWithTimeout(fetchImpl || fetch, url, init, { timeoutMs: SIDE_DOOR_TIMEOUT_MS })
    const res = await impl(BILLING, {
      headers: { ...identityHeaders(blob, cfg), Accept: 'application/json' }
    })
    const json = await readJson(res)
    let pct = grokBillingPercent(json)
    if (pct == null) {
      // Fallback to gRPC-web GetGrokCreditsConfig
      try {
        const gRes = await impl('https://grok.com/rest/app-chat/get-grok-credits-config', {
          method: 'POST',
          headers: {
            ...identityHeaders(blob, cfg),
            'Content-Type': 'application/grpc-web+proto',
            'X-User-Agent': 'grpc-web-javascript/0.1'
          },
          body: Buffer.from([0, 0, 0, 0, 0])
        })
        if (gRes.ok) {
          const buf = await gRes.arrayBuffer()
          const decoded = decodeGrokCreditsFrame(Buffer.from(buf))
          if (decoded != null) pct = decoded
        }
      } catch {
        /* ignore grok usage capture error */
      }
    }
    const snap = asUsageSnapshot(pct)
    if (snap) snap.windows = usageWindows(json)
    return snap
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const base = (config.baseUrl || defaults().baseUrl).replace(/\/$/, '')
  // xAI was never shown to accept a picture inside a tool output: tool pictures follow the outputs.
  let body = codexResponsesBody(options, '', undefined, { toolPictures: 'user' })
  if (!body.instructions) delete body.instructions
  // grok manages reasoning itself (cli catalog aware); drop the codex-level field
  delete body.reasoning
  // Thread the caller AbortSignal through the catalog pre-flight too.
  const catalog = await cliCatalogCached(blob, config, (u, i) => fetchImpl(u, { ...i, signal })).catch(
    () => new Map()
  )
  const reasoning = grokReasoningBody(options.model, options.reasoningEffort, catalog)
  if (reasoning) body.reasoning = reasoning
  body = grokBodyForModel(options.model, body)
  const res = await fetchImpl(`${base}/responses`, {
    method: 'POST',
    headers: {
      ...headers,
      ...streamHeaders(blob, config, {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      })
    },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  yield* codexResponsesStream(res.body)
}

function readVarint(bytes, offset) {
  let value = 0,
    shift = 0,
    index = offset
  while (index < bytes.length) {
    const byte = bytes[index]
    index += 1
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return { value, next: index }
    shift += 7
    if (shift > 63) return undefined
  }
  return undefined
}
function readLength(bytes, offset, size) {
  if (offset + size > bytes.length) return undefined
  return { bytes: bytes.subarray(offset, offset + size), next: offset + size }
}
function decodeFields(bytes) {
  const fields = new Map()
  let offset = 0
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset)
    if (!tag) break
    const fieldNumber = Math.floor(tag.value / 8)
    const wireType = tag.value % 8
    offset = tag.next
    if (fieldNumber <= 0) return undefined
    let value
    if (wireType === 0) {
      const next = readVarint(bytes, offset)
      if (!next) return undefined
      value = { wireType, value: next.value }
      offset = next.next
    } else if (wireType === 5) {
      const next = readLength(bytes, offset, 4)
      if (!next) return undefined
      value = { wireType, bytes: next.bytes }
      offset = next.next
    } else if (wireType === 1) {
      const next = readLength(bytes, offset, 8)
      if (!next) return undefined
      value = { wireType, bytes: next.bytes }
      offset = next.next
    } else if (wireType === 2) {
      const length = readVarint(bytes, offset)
      if (!length) return undefined
      const next = readLength(bytes, length.next, length.value)
      if (!next) return undefined
      value = { wireType, bytes: next.bytes }
      offset = next.next
    } else return undefined
    if (!fields.has(fieldNumber)) fields.set(fieldNumber, value)
  }
  return fields
}
function float32Le(field) {
  if (!field || field.wireType !== 5 || !field.bytes || field.bytes.length < 4) return undefined
  const val = Buffer.from(field.bytes).readFloatLE(0)
  return Number.isFinite(val) ? val : undefined
}
export function decodeGrokCreditsFrame(buffer) {
  try {
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    if (!bytes.length) return undefined
    const payload = bytes.length > 5 && bytes[0] === 0 ? bytes.subarray(5) : bytes
    const top = decodeFields(payload)
    if (!top) return undefined
    const nested = top.get(1)?.wireType === 2 ? decodeFields(top.get(1).bytes) : undefined
    const credits = nested ?? top
    if (!credits) return undefined
    const ratio = float32Le(credits.get(1))
    if (ratio == null) return undefined
    const pct = ratio <= 1 ? Math.round(ratio * 100) : Math.round(ratio)
    return Math.max(0, Math.min(100, pct))
  } catch {
    return undefined
  }
}
