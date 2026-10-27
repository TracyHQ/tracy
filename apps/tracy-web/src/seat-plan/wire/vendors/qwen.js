// Adapted from @goodandready/dsh-subscriptions 0.6.60-tracy.5 (MIT).
import { modelCatalog, openaiMessages, openaiTools } from '../messages.js'
import { httpError, openaiChatStream } from '../wire.js'
import { apiKeyOf, keyBlob, keyIdentity, probe } from '../api-key.js'

export const id = 'qwen'
/** A DashScope (Alibaba Cloud Model Studio) API key the person pastes. */
export const signIn = 'key'

// https://www.alibabacloud.com/help/en/model-studio/base-url: a key works only on the endpoint of
// its own region and plan (a mismatch answers 401). A pasted key is tried on Singapore
// (international) first, then on China (Beijing); the one that accepts it is kept with the key.
const BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const BEIJING_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
// https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope names
// `qwen-plus` and `qwen3.8-max` in its examples; the first is the default.
const QWEN_MODELS = [
  { id: 'qwen-plus', name: 'Qwen Plus', contextWindow: 131072, inputModalities: ['text'] },
  { id: 'qwen3.8-max', name: 'Qwen 3.8 Max', contextWindow: 131072, inputModalities: ['text'] }
]

export function providerInfo() {
  return { id, name: 'Qwen' }
}

/**
 * Which inputs a model takes, from this vendor's model table; an id not in it is text-only.
 * @param {string} modelId
 * @returns {string[]}
 */
export function inputModalities(modelId) {
  return QWEN_MODELS.find((m) => m.id === modelId)?.inputModalities ?? ['text']
}

export function defaults() {
  return { baseUrl: BASE_URL, models: QWEN_MODELS }
}

const trim = (url) => url.replace(/\/+$/, '')
/** The endpoint a kept key was accepted on, else the configured one. */
const base = (cfg, blob) => trim(blob?.baseUrl || cfg?.baseUrl || BASE_URL)
const headersFor = (key) => ({ Authorization: `Bearer ${key}` })

/**
 * Proves a pasted key on `GET /models` (spends no tokens): on the configured endpoint, and when that
 * answers 401, on Beijing's. Only two 401s make it a wrong key; each probe has the same timeout.
 */
export async function fromKey(key, cfg, fetchImpl) {
  const first = trim(cfg?.baseUrl || BASE_URL)
  const endpoints = first === BEIJING_URL ? [first] : [first, BEIJING_URL]
  for (const [i, endpoint] of endpoints.entries()) {
    try {
      await probe(fetchImpl, `${endpoint}/models`, headersFor(key))
      return { blob: keyBlob(key, endpoint), identity: keyIdentity(key) }
    } catch (error) {
      if (error?.status !== 401 || i === endpoints.length - 1) throw error
    }
  }
  throw new Error('unreachable')
}

export async function check(blob, cfg, fetchImpl) {
  return { ok: true, raw: await probe(fetchImpl, `${base(cfg, blob)}/models`, headersFor(apiKeyOf(blob))) }
}

/** A key needs no refresh. */
export async function refresh(_cfg, blob) {
  return blob
}

/** DashScope has no usage door for a key; the broker decides exhaustion from the error alone. */
export async function usage() {
  return null
}

export async function listModels(_blob, cfg) {
  return modelCatalog(id, cfg?.models?.length ? cfg.models : QWEN_MODELS)
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const key = apiKeyOf(blob)
  /** @type {Record<string, any>} */
  const body = {
    model: options.model || QWEN_MODELS[0].id,
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {})
  }
  const tools = openaiTools(options)
  if (tools?.length) body.tools = tools
  const res = await (fetchImpl || fetch)(`${base(config, blob)}/chat/completions`, {
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
