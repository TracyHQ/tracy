import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages } from '../messages.js'
import { openaiChatStream, httpError } from '../wire.js'

export const id = 'perplexity'
const PERPLEXITY_API_BASE = 'https://api.perplexity.ai'

const PERPLEXITY_MODELS = [
  {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text']
  },
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    contextWindow: 200000,
    maxTokens: 8192,
    inputModalities: ['text']
  }
]

export function providerInfo() {
  return { id, name: 'Perplexity Pro' }
}

export function defaults() {
  return {
    apiBase: PERPLEXITY_API_BASE,
    models: PERPLEXITY_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return 'https://www.perplexity.ai/settings/api'
}

export async function listModels() {
  return PERPLEXITY_MODELS
}

export async function usage(blob) {
  if (blob && (blob.accessToken || blob.apiKey)) {
    return { usedPercent: null, plan: 'Perplexity Pro', timestamp: Date.now() }
  }
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const key = blob && (blob.accessToken || blob.apiKey)
  if (!key) throw new LlmError('Perplexity API key or session token required', 'AUTH')

  const url = `${(config && config.apiBase) || PERPLEXITY_API_BASE}/chat/completions`
  const body = {
    model: options.model || 'sonar-pro',
    messages: openaiMessages(options),
    stream: true
  }

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
