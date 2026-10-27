// Adapted from @goodandready/dsh-subscriptions 0.6.60-tracy.5 (MIT).
import { fetchWithTimeout } from '../http.js'
import { buildAuthorizeUrl } from '../oauth.js'
import { anthropicPayload, modelCatalog } from '../messages.js'
import { jsonTokenRequest, anthropicStream, httpError, tokenBlobFromOAuth, readJson } from '../wire.js'
import { emailFromToken } from '../jwt.js'
import { asUsageSnapshot, usageWindows, deepestUsedPercent } from '../usage.js'

export const id = 'claude'

const AUTH = 'https://claude.ai/oauth/authorize'
const TOKEN = 'https://platform.claude.com/v1/oauth/token'
const API = 'https://api.anthropic.com/v1/messages?beta=true'
const PROFILE = 'https://api.anthropic.com/api/oauth/profile'
const USAGE = 'https://api.anthropic.com/api/oauth/usage'
const SCOPE =
  'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'
const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude."
const BETA = 'oauth-2025-04-20,claude-code-20250219'

export function providerInfo() {
  return { id, name: 'Claude' }
}

// Thinking-effort support follows Anthropic's current semantics:
// - Adaptive thinking (`thinking: { type: 'adaptive' }`) is the recommended /
//   only on-mode for current generations; depth and token spend are steered by
//   `output_config: { effort }`.
// - Effort is accepted on Opus 4.6+ and Sonnet 4.6+; `xhigh` was added on
//   Opus 4.7; `max` is Opus-tier only.
// - Sonnet 4.5 / Haiku / Fable families reject effort (400), and models older
//   than the adaptive generation use the legacy budget_tokens knob, so no
//   effort control is advertised there. Model ids with a major version only
//   (e.g. `claude-opus-5`) are treated as the latest of their family.
const BASE_EFFORT_LEVELS = ['low', 'medium', 'high']

export function effortLevelsForModel(modelId) {
  const m = /^claude-(opus|sonnet|haiku|fable)(?:-(\d+))?(?:-(\d+))?/.exec(String(modelId || ''))
  if (!m) return null
  const [, family, majorRaw, minorRaw] = m
  if (family === 'haiku' || family === 'fable') return null
  const major = majorRaw ? Number(majorRaw) : null
  const minor = minorRaw ? Number(minorRaw) : null
  const atLeast = (wantMajor, wantMinor) =>
    major === null || major > wantMajor || (major === wantMajor && (minor === null || minor >= wantMinor))
  // Adaptive thinking / effort exist from Opus 4.6 and Sonnet 4.6 onward.
  if (!atLeast(4, 6)) return null
  const levels = [...BASE_EFFORT_LEVELS]
  if (family === 'opus') {
    if (atLeast(4, 7)) levels.push('xhigh')
    levels.push('max')
  }
  return levels
}

/**
 * Which inputs a model takes: every current Claude family (Opus, Sonnet, Fable, Haiku) reads
 * pictures; any other id is treated as text-only.
 * @param {string} modelId
 * @returns {string[]}
 */
export function inputModalities(modelId) {
  return /^claude-(opus|sonnet|fable|haiku)\b/.test(String(modelId || '')) ? ['text', 'image'] : ['text']
}

export function defaults() {
  return {
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    // Tracy -tracy.4: the console.anthropic.com code-paste redirect is refused by
    // Anthropic's authorize page ("Invalid request format"); the loopback redirect of
    // the current Claude CLI flow is caught by autoLoopback (lib/loopback.js).
    redirectUri: 'http://localhost:53692/callback',
    claudeCcVersion: '2.1.289.7e2',
    models: [
      { id: 'claude-opus-5', name: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'claude-fable-5', name: 'Claude Fable 5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' }
    ],
    systemPrefix: IDENTITY
  }
}

function oauthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETA
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
    extra: { code: 'true' }
  })
}

async function decorate(blob, fetchImpl) {
  let email = blob.email || emailFromToken(blob.accessToken)
  if (!email && fetchImpl && blob.accessToken) {
    try {
      const res = await fetchImpl(PROFILE, { headers: oauthHeaders(blob.accessToken) })
      const json = await readJson(res)
      email = json.email || (json.account && json.account.email) || email
    } catch {
      /* profile is optional */
    }
  }
  return { ...blob, email, label: blob.label || email || 'Claude' }
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await jsonTokenRequest(
    TOKEN,
    {
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: pkce.verifier,
      state: pkce.state
    },
    fetchImpl
  )
  return decorate(tokenBlobFromOAuth(json), fetchImpl)
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await jsonTokenRequest(
    TOKEN,
    {
      grant_type: 'refresh_token',
      client_id: cfg.clientId,
      refresh_token: blob.refreshToken
    },
    fetchImpl
  )
  return decorate(tokenBlobFromOAuth(json, { label: blob.label, email: blob.email }), fetchImpl)
}

export async function listModels(blob, cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  const rawDefault = cfg && cfg.models && cfg.models.length ? cfg.models : defaults().models
  const defaultCatalog = modelCatalog(
    id,
    rawDefault.map((entry) => {
      const model = typeof entry === 'string' ? { id: entry, name: entry } : { ...entry }
      const levels = effortLevelsForModel(model.id || model.name)
      if (!levels) return model
      return { ...model, reasoning: { efforts: levels.map((level) => ({ id: level, name: level })) } }
    })
  )

  if (!blob || !blob.accessToken) return defaultCatalog

  try {
    const headers = {
      Accept: 'application/json',
      'anthropic-version': '2023-06-01'
    }
    if (blob.accessToken.startsWith('sk-ant-oat') || blob.accessToken.startsWith('sk-ant-ort')) {
      headers['Authorization'] = `Bearer ${blob.accessToken}`
    } else if (blob.accessToken.startsWith('sk-ant-')) {
      headers['x-api-key'] = blob.accessToken
    } else {
      headers['Authorization'] = `Bearer ${blob.accessToken}`
    }

    const res = await fetchWithTimeout(
      impl,
      'https://api.anthropic.com/v1/models',
      { headers },
      { timeoutMs: 15000 }
    )
    if (!res.ok) return defaultCatalog
    const json = await readJson(res)
    const items = json && json.data
    if (!Array.isArray(items) || !items.length) return defaultCatalog
    const rows = []
    for (const item of items) {
      const modelId = item.id || item.display_name
      if (!modelId) continue
      const levels = effortLevelsForModel(modelId)
      rows.push({
        id: modelId,
        name: item.display_name || modelId,
        ...(levels ? { reasoning: { efforts: levels.map((level) => ({ id: level, name: level })) } } : {})
      })
    }
    if (!rows.length) return defaultCatalog
    return modelCatalog(id, rows)
  } catch {
    return defaultCatalog
  }
}

// Advertise adaptive thinking + effort only for models whose capability table
// declares the chosen level; anything else (unsupported family, 'off', no
// selection) leaves the request untouched so behavior stays opt-in.
function applyClaudeThinking(payload, options) {
  const effort = options && String(options.reasoningEffort || '')
  if (!effort || effort === 'off') return payload
  const levels = effortLevelsForModel(payload && payload.model)
  if (!levels || !levels.includes(effort)) return payload
  payload.thinking = { type: 'adaptive' }
  payload.output_config = { effort }
  return payload
}

export async function check(blob, _cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(PROFILE, { headers: oauthHeaders(blob.accessToken) })
  if (!res.ok) throw httpError(res.status, await res.text())
  const json = await readJson(res)
  return { ok: true, raw: json }
}

export async function usage(blob, _cfg, fetchImpl) {
  try {
    const res = await (fetchImpl || fetch)(USAGE, { headers: oauthHeaders(blob.accessToken) })
    const json = await readJson(res)
    const snap = asUsageSnapshot(deepestUsedPercent(json))
    if (snap) snap.windows = usageWindows(json)
    return snap
  } catch {
    return null
  }
}

export function makeClaudeBillingHeader(cfg) {
  const ccVersion = (cfg && cfg.claudeCcVersion) || '2.1.289.7e2'
  const cch =
    globalThis.__DSH_CC_H__ ||
    (() => {
      globalThis.__DSH_CC_H__ = Math.random().toString(16).slice(2, 6)
      return globalThis.__DSH_CC_H__
    })()
  const turnIndex = (globalThis.__DSH_CC_TURN__ = (globalThis.__DSH_CC_TURN__ || 0) + 1)
  return `x-anthropic-billing-header: cc_version=${ccVersion}; cc_entrypoint=sdk-cli; cch=${cch}; cc_turn_origin=sdk; cc_prompt_index=0; cc_turn_index=${turnIndex};`
}

export function applyClaudeBillingHeader(payload, cfg) {
  if (process.env.CLAUDE_CODE_ATTRIBUTION_HEADER === '0') return payload
  if (!payload) return payload
  const headerText = makeClaudeBillingHeader(cfg)
  const headerBlock = { type: 'text', text: headerText }
  if (Array.isArray(payload.system)) {
    if (
      !payload.system.some(
        (b) =>
          typeof b === 'object' &&
          b &&
          typeof b.text === 'string' &&
          b.text.startsWith('x-anthropic-billing-header:')
      )
    ) {
      payload.system = [headerBlock, ...payload.system]
    }
  } else if (typeof payload.system === 'string' && payload.system.trim()) {
    payload.system = [headerBlock, { type: 'text', text: payload.system }]
  } else if (!payload.system) {
    payload.system = [headerBlock]
  }
  return payload
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const payload = anthropicPayload(options, config.systemPrefix || IDENTITY)
  applyClaudeThinking(payload, options)
  applyClaudeBillingHeader(payload, config)
  const res = await fetchImpl(API, {
    method: 'POST',
    headers: {
      ...headers,
      ...oauthHeaders(blob.accessToken),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(payload),
    signal
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  yield* anthropicStream(res.body)
}
