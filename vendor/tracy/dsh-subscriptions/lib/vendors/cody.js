import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages } from '../messages.js'
import { openaiChatStream, httpError } from '../wire.js'

export const id = 'cody'
const CODY_API_BASE = 'https://sourcegraph.com/.api'

const CODY_MODELS = [
  {
    id: 'cody-claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (Sourcegraph Cody)',
    contextWindow: 200000,
    maxTokens: 8192,
    inputModalities: ['text']
  }
]

/** Catalog id -> Sourcegraph model name. */
const CODY_MODEL_ALIASES = {
  'cody-claude-3.5-sonnet': 'claude-3-5-sonnet',
}

export function providerInfo() {
  return { id, name: 'Sourcegraph Cody' }
}

export function defaults() {
  return {
    apiBase: CODY_API_BASE,
    models: CODY_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return 'https://sourcegraph.com/user/settings/tokens'
}

export async function listModels() {
  return CODY_MODELS
}

export async function usage(blob) {
  if (blob && (blob.accessToken || blob.token)) {
    return { usedPercent: null, plan: 'Cody Pro', timestamp: Date.now() }
  }
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const token = blob && (blob.accessToken || blob.token)
  if (!token) throw new LlmError('Sourcegraph Cody not authenticated', 'AUTH')

  const url = `${(config && config.apiBase) || CODY_API_BASE}/chat/completions`
  // Catalog ids carry a cody- prefix and dotted versions; the Sourcegraph
  // API expects the bare dashed name (cody-claude-3.5-sonnet -> claude-3-5-sonnet).
  const requested = String(options.model || '').trim()
  const mapped = CODY_MODEL_ALIASES[requested]
    || requested.replace(/^cody-/, '').replace(/\./g, '-')
    || 'claude-3-5-sonnet'
  const body = {
    model: mapped,
    messages: openaiMessages(options),
    stream: true
  }

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
