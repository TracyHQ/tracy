// Adapted from @goodandready/dsh-subscriptions 0.6.60-tracy.5 (MIT).
import { modelCatalog, openaiMessages, openaiTools } from '../messages.js'
import { httpError, openaiChatStream } from '../wire.js'
import { apiKeyOf, keyBlob, keyIdentity, probe } from '../api-key.js'

export const id = 'kimi'
/**
 * A key the person creates in the Kimi Code console and pastes. Kimi's device sign-in is left out
 * on purpose: the upstream client id was never shown to be one a third party may use (council,
 * 11/10/2026).
 */
export const signIn = 'key'

// https://www.kimi.com/coding/docs/en/ (Kimi Code docs): the OpenAI-compatible base URL, and
// "always use the model ID kimi-for-coding" from a third-party tool. The other two ids are the
// upstream list (dsh-subscriptions `KIMI_MODELS`), which the newer docs also name; the first is the default.
const BASE_URL = 'https://api.kimi.com/coding/v1'
const KIMI_MODELS = [
  {
    id: 'kimi-for-coding',
    name: 'Kimi for Coding',
    contextWindow: 262144,
    inputModalities: ['text', 'image']
  },
  {
    id: 'kimi-for-coding-highspeed',
    name: 'Kimi for Coding High Speed',
    contextWindow: 262144,
    inputModalities: ['text', 'image']
  },
  { id: 'k3', name: 'Kimi K3', contextWindow: 131072, inputModalities: ['text'] }
]
// Kimi asks tools to send their own, real User-Agent; this one says Tracy.
const USER_AGENT = 'Tracy'

export function providerInfo() {
  return { id, name: 'Kimi' }
}

/**
 * Which inputs a model takes, from this vendor's model table; an id not in it is text-only.
 * @param {string} modelId
 * @returns {string[]}
 */
export function inputModalities(modelId) {
  return KIMI_MODELS.find((m) => m.id === modelId)?.inputModalities ?? ['text']
}

export function defaults() {
  return { baseUrl: BASE_URL, models: KIMI_MODELS }
}

const base = (cfg) => (cfg?.baseUrl || BASE_URL).replace(/\/+$/, '')
const headersFor = (key) => ({ Authorization: `Bearer ${key}`, 'User-Agent': USER_AGENT })

/** Proves a pasted key on `GET /models` (cheap, spends no tokens) and returns what the broker keeps. */
export async function fromKey(key, cfg, fetchImpl) {
  await probe(fetchImpl, `${base(cfg)}/models`, headersFor(key))
  return { blob: keyBlob(key), identity: keyIdentity(key) }
}

/** The same probe for a kept key. */
export async function check(blob, cfg, fetchImpl) {
  return { ok: true, raw: await probe(fetchImpl, `${base(cfg)}/models`, headersFor(apiKeyOf(blob))) }
}

/** A key needs no refresh; it stays valid until the person revokes it. */
export async function refresh(_cfg, blob) {
  return blob
}

/** Kimi documents no usage door for an API key (upstream's `/usages` is unverified), so usage is unknown. */
export async function usage() {
  return null
}

export async function listModels(_blob, cfg) {
  return modelCatalog(id, cfg?.models?.length ? cfg.models : KIMI_MODELS)
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const key = apiKeyOf(blob)
  /** @type {Record<string, any>} */
  const body = {
    model: options.model || KIMI_MODELS[0].id,
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {})
  }
  const tools = openaiTools(options)
  if (tools?.length) body.tools = tools
  const res = await (fetchImpl || fetch)(`${base(config)}/chat/completions`, {
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
