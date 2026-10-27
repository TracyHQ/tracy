// Adapted from @goodandready/dsh-subscriptions 0.6.60-tracy.5 (MIT).
import { createHash, randomUUID } from 'node:crypto'
import { modelCatalog, openaiMessages, openaiTools } from '../messages.js'
import { readJson, httpError, openaiChatStream } from '../wire.js'

export const id = 'copilot'
/** GitHub's device flow: no browser callback; the broker polls (`broker.js` `start`/`complete`). */
export const signIn = 'device'

const CLIENT_ID = 'Iv1.b507a08c87ecfe98'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const DEVICE_PAGE = 'https://github.com/login/device'

export function providerInfo() {
  return { id, name: 'GitHub Copilot' }
}

const EFFORTS = {
  efforts: [
    { id: 'low', name: 'Low' },
    { id: 'medium', name: 'Medium' },
    { id: 'high', name: 'High' }
  ]
}
// Measured 10/10/2026 against a real Copilot account (`/models`): the dsh-subscriptions 0.6.60 list
// was stale, Copilot answered `model_not_supported` for `claude-3.7-sonnet`, and again for
// `claude-sonnet-5` although `/models` lists it: Anthropic models need the person's opt-in at
// github.com/settings/copilot/features first. The default is therefore an OpenAI model, which every
// plan serves without a policy switch; the first entry is the default.
const COPILOT_MODELS = [
  { id: 'gpt-4.1', name: 'GPT-4.1 (Copilot)', contextWindow: 128000, inputModalities: ['text', 'image'] },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5 (Copilot)',
    contextWindow: 200000,
    inputModalities: ['text', 'image'],
    reasoning: EFFORTS
  },
  {
    id: 'claude-sonnet-5.5',
    name: 'Claude Sonnet 5.5 (Copilot)',
    contextWindow: 200000,
    inputModalities: ['text', 'image'],
    reasoning: EFFORTS
  },
  { id: 'gpt-5.5', name: 'GPT-5.5 (Copilot)', contextWindow: 200000, inputModalities: ['text', 'image'] },
  { id: 'gpt-4o', name: 'GPT-4o (Copilot)', contextWindow: 128000, inputModalities: ['text', 'image'] }
]

/**
 * Which inputs a model takes, from this vendor's model table; an id not in it is text-only.
 * @param {string} modelId
 * @returns {string[]}
 */
export function inputModalities(modelId) {
  return COPILOT_MODELS.find((m) => m.id === modelId)?.inputModalities ?? ['text']
}

export function defaults() {
  return { clientId: CLIENT_ID, apiBase: 'https://api.githubcopilot.com', models: COPILOT_MODELS }
}

export async function listModels(_blob, cfg) {
  return modelCatalog(id, cfg?.models?.length ? cfg.models : COPILOT_MODELS)
}

const jsonPost = (url, body, fetchImpl) =>
  (fetchImpl || fetch)(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

/** GitHub's device flow: the person types `userCode` at `authUrl`; `deviceAuthId` stays server-side. */
export async function deviceStart(cfg, fetchImpl) {
  const res = await jsonPost(
    DEVICE_CODE_URL,
    { client_id: cfg.clientId || CLIENT_ID, scope: 'read:user' },
    fetchImpl
  )
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), 'DEVICE')
  const json = await readJson(res)
  if (!json || typeof json.user_code !== 'string' || typeof json.device_code !== 'string')
    throw httpError(502, 'GitHub device code response is incomplete', 'DEVICE')
  return {
    userCode: json.user_code,
    deviceAuthId: json.device_code,
    intervalMs: Math.max(parseInt(json.interval, 10) || 5, 1) * 1000,
    authUrl: json.verification_uri || DEVICE_PAGE
  }
}

const DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token'
// Undocumented endpoint that the Copilot editor extensions use; GitHub may change it without notice.
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token'
const USER_URL = 'https://api.github.com/user'
const USER_AGENT = 'GitHubCopilotChat/0.24.0'
// Used only when the exchange names no expiry: refreshing early costs one request, refreshing late a failed turn.
const FALLBACK_LIFETIME_MS = 10 * 60 * 1000

const githubHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'User-Agent': USER_AGENT
})

/** The short-lived Copilot token for a GitHub token; fails when the GitHub account has no Copilot. */
async function exchangeCopilotToken(githubToken, fetchImpl) {
  const res = await (fetchImpl || fetch)(COPILOT_TOKEN_URL, {
    method: 'GET',
    headers: githubHeaders(githubToken)
  })
  const json = await readJson(res)
  if (!json || typeof json.token !== 'string' || !json.token)
    throw httpError(502, 'Copilot token response is incomplete')
  const expiresAt =
    Number(json.expires_at) > 0
      ? Number(json.expires_at) * 1000
      : Number(json.refresh_in) > 0
        ? Date.now() + Number(json.refresh_in) * 1000
        : Date.now() + FALLBACK_LIFETIME_MS
  return { accessToken: json.token, expiresAt }
}

/** The GitHub person behind a GitHub token: the stable numeric id, the login and a public email. */
async function githubUser(githubToken, fetchImpl) {
  const res = await (fetchImpl || fetch)(USER_URL, { headers: githubHeaders(githubToken) })
  const user = await readJson(res)
  if (!user || (typeof user.id !== 'number' && typeof user.id !== 'string') || !user.login)
    throw httpError(502, 'GitHub user response is incomplete')
  return { githubId: String(user.id), login: String(user.login), email: user.email ? String(user.email) : '' }
}

export async function devicePoll(cfg, session, fetchImpl) {
  const res = await jsonPost(
    DEVICE_TOKEN_URL,
    {
      client_id: cfg.clientId || CLIENT_ID,
      device_code: session.deviceAuthId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    },
    fetchImpl
  )
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), 'DEVICE')
  const json = await readJson(res)
  // GitHub answers 200 with an `error` field while the person has not confirmed yet.
  if (json.error === 'authorization_pending' || json.error === 'slow_down') return { status: 'pending' }
  if (json.error) throw httpError(400, json.error_description || json.error, 'DEVICE')
  if (typeof json.access_token !== 'string' || !json.access_token)
    throw httpError(502, 'GitHub device token response is incomplete', 'DEVICE')
  const githubToken = json.access_token
  const token = await exchangeCopilotToken(githubToken, fetchImpl)
  const person = await githubUser(githubToken, fetchImpl)
  return { status: 'authorized', blob: { ...token, refreshToken: githubToken, ...person } }
}

/** The GitHub token is the long-lived credential; a refresh is a fresh exchange from it. */
export async function refresh(cfg, blob, fetchImpl) {
  if (!blob?.refreshToken) throw httpError(401, 'GitHub token missing', 'VENDOR')
  return { ...blob, ...(await exchangeCopilotToken(blob.refreshToken, fetchImpl)) }
}

/** Proves the connection still reaches GitHub; `raw` is the GitHub person, which identity reads. */
export async function check(blob, _cfg, fetchImpl) {
  if (!blob?.refreshToken) throw httpError(401, 'GitHub token missing', 'VENDOR')
  const res = await (fetchImpl || fetch)(USER_URL, { headers: githubHeaders(blob.refreshToken) })
  return { ok: true, raw: await readJson(res) }
}

/**
 * Copilot publishes no usage or quota door for an OAuth-connected account (dsh-subscriptions read a
 * `used_percent` field from `/user` that GitHub does not document), so the usage is unknown: null.
 * The broker then decides exhaustion from the error text alone (`providers.js` `exhausted`).
 */
export async function usage() {
  return null
}

/** The editor identity Copilot's chat door expects (as the VS Code extension sends it). */
function editorHeaders(sessionId) {
  const sid = typeof sessionId === 'string' && sessionId ? sessionId.slice(0, 64) : randomUUID()
  return {
    'vscode-sessionid': sid,
    'vscode-machineid': `tracy-${createHash('sha256').update(sid).digest('hex').slice(0, 16)}`,
    'editor-version': 'vscode/1.98.0',
    'editor-plugin-version': 'copilot-chat/0.24.0',
    'Openai-Organization': 'github-copilot',
    'Copilot-Integration-Id': 'vscode-chat'
  }
}

/**
 * One turn through Copilot's OpenAI-compatible chat completions. The broker refreshes the Copilot
 * token before calling (`broker.js` `fresh`), so this only spends `blob.accessToken`.
 */
export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  if (!blob?.accessToken) throw httpError(401, 'Copilot token missing', 'VENDOR')
  /** @type {Record<string, any>} */
  const body = {
    model: options.model || defaults().models[0].id,
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {})
  }
  const tools = openaiTools(options)
  if (tools?.length) body.tools = tools
  const base = (config?.apiBase || defaults().apiBase).replace(/\/$/, '')
  const res = await (fetchImpl || fetch)(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      ...editorHeaders(options.sessionId),
      ...headers,
      Authorization: `Bearer ${blob.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''))
  yield* openaiChatStream(res.body)
}
