import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages, openaiTools, modelCatalog } from '../messages.js'
import { openaiChatStream, readJson, httpError } from '../wire.js'
import { asUsageSnapshot } from '../usage.js'

export const id = 'kimi'

const KIMI_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098'
const KIMI_DEVICE_URL = 'https://auth.kimi.com/api/oauth/device_authorization'
const KIMI_TOKEN_URL = 'https://auth.kimi.com/api/oauth/token'
const KIMI_API_BASE = 'https://api.kimi.com/coding/v1'

const KIMI_MODELS = [
  {
    id: 'kimi-for-coding',
    name: 'Kimi for Coding (256k)',
    contextWindow: 262144,
    maxTokens: 32000,
    inputModalities: ['text', 'image'],
    reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] },
  },
  {
    id: 'kimi-for-coding-highspeed',
    name: 'Kimi for Coding High Speed',
    contextWindow: 262144,
    maxTokens: 32000,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'k3',
    name: 'Kimi K3 (Fast)',
    contextWindow: 131072,
    maxTokens: 16384,
    inputModalities: ['text'],
  },
]

export function providerInfo() {
  return { id, name: 'Moonshot Kimi' }
}

export function defaults() {
  return {
    clientId: KIMI_CLIENT_ID,
    deviceUrl: KIMI_DEVICE_URL,
    tokenUrl: KIMI_TOKEN_URL,
    apiBase: KIMI_API_BASE,
    models: KIMI_MODELS.map((m) => m.id),
  }
}

export function authorizeUrl() {
  return 'https://platform.moonshot.cn/console/api-keys'
}

export async function listModels(_blob, cfg) {
  return modelCatalog(id, cfg && cfg.models ? cfg.models : KIMI_MODELS)
}

export async function usage(blob, config, fetchImpl) {
  try {
    const impl = fetchImpl || fetch
    const base = (config && config.apiBase) || KIMI_API_BASE
    const token = blob && (blob.accessToken || blob.access_token)
    if (!token) return null
    const res = await impl(`${base}/usages`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return null
    const json = await readJson(res)
    // Kimi usages returns remaining fraction or total/used
    if (json && json.usage_percent != null) return asUsageSnapshot(json.usage_percent)
    if (json && json.used != null && json.total != null && json.total > 0) {
      return asUsageSnapshot(Math.round((json.used / json.total) * 100))
    }
    return null
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const base = (config && config.apiBase) || KIMI_API_BASE
  const token = blob && (blob.accessToken || blob.access_token)
  if (!token) throw new LlmError('Kimi not authenticated', 'AUTH')

  /** @type {Record<string, any>} */
  const body = {
    model: options.model || 'kimi-for-coding',
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }

  if (options.reasoningEffort && options.reasoningEffort !== 'off') {
    body.thinking = { effort: options.reasoningEffort }
  }

  const tools = openaiTools(options)
  if (tools && tools.length) body.tools = tools

  const res = await impl(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'dsh-plugin-oauth-subs',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
