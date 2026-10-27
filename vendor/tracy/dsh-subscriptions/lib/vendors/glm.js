import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages, openaiTools, modelCatalog } from '../messages.js'
import { openaiChatStream, readJson, httpError } from '../wire.js'
import { asUsageSnapshot } from '../usage.js'

export const id = 'glm'

const GLM_CODING_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions'
const GLM_QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit'
const GLM_USER_AGENT = 'ZCode/3.10.1'

const GLM_MODELS = [
  {
    id: 'glm-4-plus',
    name: 'GLM-4-Plus (Coding Plan)',
    contextWindow: 131072,
    maxTokens: 4096,
    inputModalities: ['text'],
    reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] },
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4-Flash (High Speed)',
    contextWindow: 131072,
    maxTokens: 4096,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'glm-zero-preview',
    name: 'GLM Zero (Thinking)',
    contextWindow: 131072,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
]

export function providerInfo() {
  return { id, name: 'Zhipu GLM' }
}

export function defaults() {
  return {
    codingUrl: GLM_CODING_URL,
    quotaUrl: GLM_QUOTA_URL,
    models: GLM_MODELS.map((m) => m.id),
  }
}

export function authorizeUrl() {
  return 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys'
}

export async function listModels(_blob, cfg) {
  return modelCatalog(id, cfg && cfg.models ? cfg.models : GLM_MODELS)
}

export async function usage(blob, config, fetchImpl) {
  try {
    const impl = fetchImpl || fetch
    const url = (config && config.quotaUrl) || GLM_QUOTA_URL
    const token = blob && (blob.accessToken || blob.access_token)
    if (!token) return null
    const res = await impl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': GLM_USER_AGENT,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return null
    const json = await readJson(res)
    if (json && json.data && json.data.percentage != null) {
      return asUsageSnapshot(Math.round(json.data.percentage))
    }
    return null
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const url = (config && config.codingUrl) || GLM_CODING_URL
  const token = blob && (blob.accessToken || blob.access_token)
  if (!token) throw new LlmError('GLM not authenticated', 'AUTH')

  /** @type {Record<string, any>} */
  const body = {
    model: options.model || 'glm-4-plus',
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }

  const tools = openaiTools(options)
  if (tools && tools.length) body.tools = tools

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': GLM_USER_AGENT,
      'X-Coding-Plan-Boost': '1.5',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
