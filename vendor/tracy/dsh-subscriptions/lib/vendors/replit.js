import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages } from '../messages.js'
import { openaiChatStream, httpError } from '../wire.js'

export const id = 'replit'
const REPLIT_API_BASE = 'https://replit.com/api/v1/ai'

const REPLIT_MODELS = [
  {
    id: 'replit-code-v2',
    name: 'Replit Code Agent V2',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text']
  }
]

export function providerInfo() {
  return { id, name: 'Replit Core' }
}

export function defaults() {
  return {
    apiBase: REPLIT_API_BASE,
    models: REPLIT_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return 'https://replit.com/account'
}

export async function listModels() {
  return REPLIT_MODELS
}

export async function usage(blob) {
  if (blob && (blob.accessToken || blob.token)) {
    return { usedPercent: null, plan: 'Replit Core', timestamp: Date.now() }
  }
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const token = blob && (blob.accessToken || blob.token)
  if (!token) throw new LlmError('Replit Core not authenticated', 'AUTH')

  const url = `${(config && config.apiBase) || REPLIT_API_BASE}/chat/completions`
  const body = {
    model: options.model || 'replit-code-v2',
    messages: openaiMessages(options),
    stream: true
  }

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
