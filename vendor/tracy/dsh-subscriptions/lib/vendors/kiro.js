import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages, openaiTools, modelCatalog } from '../messages.js'
import { openaiChatStream, readJson, httpError } from '../wire.js'
import { asUsageSnapshot } from '../usage.js'

export const id = 'kiro'

const KIRO_PORTAL_URL = 'https://app.kiro.dev'
const KIRO_API_BASE = 'https://prod.us-east-1.auth.desktop.kiro.dev'
const KIRO_MODELS = [
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5 (Kiro)',
    contextWindow: 1000000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
    reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] },
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5 (Kiro)',
    contextWindow: 1000000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna (Kiro)',
    contextWindow: 272000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6 (Kiro)',
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ['text'],
  },
]

export function providerInfo() {
  return { id, name: 'AWS Kiro' }
}

export function defaults() {
  return {
    apiBase: KIRO_API_BASE,
    models: KIRO_MODELS.map((m) => m.id),
  }
}

export function authorizeUrl() {
  return `${KIRO_PORTAL_URL}/oauth/authorize`
}

export async function listModels(_blob, cfg) {
  return modelCatalog(id, cfg && cfg.models ? cfg.models : KIRO_MODELS)
}

export async function usage(blob, config, fetchImpl) {
  try {
    const impl = fetchImpl || fetch
    const token = blob && (blob.accessToken || blob.access_token)
    if (!token) return null
    const res = await impl(`${(config && config.apiBase) || KIRO_API_BASE}/api/usage`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) return null
    const json = await readJson(res)
    if (json && json.usedPercent != null) {
      const snap = asUsageSnapshot(Math.round(json.usedPercent))
      if (snap) snap.plan = json.plan || 'Pro'
      return snap
    }
    return null
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const token = blob && (blob.accessToken || blob.access_token)
  if (!token) throw new LlmError('AWS Kiro not authenticated', 'AUTH')

  /** @type {Record<string, any>} */
  const body = {
    model: options.model || 'claude-sonnet-5',
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }

  const tools = openaiTools(options)
  if (tools && tools.length) body.tools = tools

  const url = (config && config.chatUrl) || `${(config && config.apiBase) || KIRO_API_BASE}/v1/chat/completions`
  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'dsh-plugin-oauth-subs',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
