// Adapted from @goodandready/dsh-subscriptions 0.6.60-tracy.5 (MIT).
import { modelCatalog, openaiMessages, openaiTools } from '../messages.js'
import { httpError, openaiChatStream } from '../wire.js'
import { asUsageSnapshot } from '../usage.js'
import { fetchWithTimeout } from '../http.js'
import { apiKeyOf, keyBlob, keyFailure, keyIdentity, probe } from '../api-key.js'

export const id = 'glm'
/** A Z.ai API key the person pastes; the GLM Coding Plan has no OAuth for third parties. */
export const signIn = 'key'

// https://docs.z.ai/devpack/tool/others: the coding plan's OpenAI-compatible base URL, and `glm-5.2`
// as the model id in the tool examples (https://docs.z.ai/devpack/overview: requests for 5.2 are
// routed to the plan's current model). The quota door is upstream's `GLM_QUOTA_URL`, undocumented.
const BASE_URL = 'https://api.z.ai/api/coding/paas/v4'
const QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit'
const GLM_MODELS = [{ id: 'glm-5.2', name: 'GLM-5.2', contextWindow: 131072, inputModalities: ['text'] }]
const USER_AGENT = 'Tracy'
// https://docs.z.ai/api-reference/api-code: authentication codes (1002 invalid token and 1004 token
// authentication failed were listed there before and may still be sent), and the codes of a known
// key whose plan, package or balance does not let it be used.
const AUTH_CODES = new Set([401, 1000, 1001, 1002, 1003, 1004, 1005])
const PLAN_CODES = new Set([1113, 1309, 1311, 1314, 1315])

export function providerInfo() {
  return { id, name: 'GLM' }
}

/**
 * Which inputs a model takes, from this vendor's model table; an id not in it is text-only.
 * @param {string} modelId
 * @returns {string[]}
 */
export function inputModalities(modelId) {
  return GLM_MODELS.find((m) => m.id === modelId)?.inputModalities ?? ['text']
}

export function defaults() {
  return { baseUrl: BASE_URL, quotaUrl: QUOTA_URL, models: GLM_MODELS }
}

const headersFor = (key) => ({ Authorization: `Bearer ${key}`, 'User-Agent': USER_AGENT })

/**
 * The quota door, which answers a refused key with HTTP 200 and `{ success: false, code: 401 }`
 * (measured 11/10/2026): the body is judged as well as the status.
 */
async function quota(key, cfg, fetchImpl) {
  const body = await probe(fetchImpl, cfg?.quotaUrl || QUOTA_URL, headersFor(key))
  if (body && body.success === false) {
    const code = Number(body.code)
    const kind = AUTH_CODES.has(code) ? 'key' : PLAN_CODES.has(code) ? 'plan' : 'vendor'
    throw keyFailure(kind, 200, body.msg)
  }
  return body
}

/** Proves a pasted key on the quota door (spends no tokens) and returns what the broker keeps. */
export async function fromKey(key, cfg, fetchImpl) {
  await quota(key, cfg, fetchImpl)
  return { blob: keyBlob(key), identity: keyIdentity(key) }
}

export async function check(blob, cfg, fetchImpl) {
  return { ok: true, raw: await quota(apiKeyOf(blob), cfg, fetchImpl) }
}

/** A key needs no refresh. */
export async function refresh(_cfg, blob) {
  return blob
}

/** The plan's used share, read as upstream reads it (`data.percentage`, shape unverified); null when unknown. */
export async function usage(blob, cfg, fetchImpl) {
  try {
    const res = await fetchWithTimeout(
      fetchImpl,
      cfg?.quotaUrl || QUOTA_URL,
      { headers: { Accept: 'application/json', ...headersFor(apiKeyOf(blob)) } },
      { timeoutMs: 4000 }
    )
    if (!res.ok) return null
    const json = await res.json()
    return json?.data?.percentage != null ? asUsageSnapshot(Math.round(json.data.percentage)) : null
  } catch {
    return null
  }
}

export async function listModels(_blob, cfg) {
  return modelCatalog(id, cfg?.models?.length ? cfg.models : GLM_MODELS)
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const key = apiKeyOf(blob)
  /** @type {Record<string, any>} */
  const body = {
    model: options.model || GLM_MODELS[0].id,
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {})
  }
  const tools = openaiTools(options)
  if (tools?.length) body.tools = tools
  const base = (config?.baseUrl || BASE_URL).replace(/\/+$/, '')
  const res = await (fetchImpl || fetch)(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      ...headers,
      ...headersFor(key),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''))
  yield* openaiChatStream(res.body)
}
