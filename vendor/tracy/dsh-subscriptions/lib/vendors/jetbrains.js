import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages } from '../messages.js'
import { openaiChatStream, httpError } from '../wire.js'

export const id = 'jetbrains'
const JETBRAINS_API_BASE = 'https://api.jetbrains.ai'

const JETBRAINS_MODELS = [
  {
    id: 'jb-claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (JetBrains AI)',
    contextWindow: 200000,
    maxTokens: 8192,
    inputModalities: ['text']
  },
  {
    id: 'jb-gpt-4o',
    name: 'GPT-4o (JetBrains AI)',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text']
  }
]

export function providerInfo() {
  return { id, name: 'JetBrains AI' }
}

export function defaults() {
  return {
    apiBase: JETBRAINS_API_BASE,
    models: JETBRAINS_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return 'https://account.jetbrains.com/'
}

export async function listModels() {
  return JETBRAINS_MODELS
}

export async function usage() {
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const token = blob && (blob.accessToken || blob.token)
  if (!token) throw new LlmError('JetBrains AI Assistant not authenticated', 'AUTH')

  const url = `${(config && config.apiBase) || JETBRAINS_API_BASE}/v1/chat/completions`
  const model = (options.model || 'jb-claude-3.5-sonnet').replace(/^jb-/, '')
  const body = {
    model,
    messages: openaiMessages(options),
    stream: true
  }

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'IntelliJ-IDEA/2026.1'
    },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
