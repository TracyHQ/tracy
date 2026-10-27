import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages } from '../messages.js'
import { openaiChatStream, httpError } from '../wire.js'

export const id = 'spark'
const SPARK_API_BASE = 'https://spark-api-open.xf-yun.com/v1'

const SPARK_MODELS = [
  {
    id: 'spark-max',
    name: 'iFlytek Spark Max',
    contextWindow: 32768,
    maxTokens: 8192,
    inputModalities: ['text']
  },
  {
    id: 'spark-lite',
    name: 'iFlytek Spark Lite',
    contextWindow: 8192,
    maxTokens: 4096,
    inputModalities: ['text']
  }
]

export function providerInfo() {
  return { id, name: 'iFlytek Spark' }
}

export function defaults() {
  return {
    apiBase: SPARK_API_BASE,
    models: SPARK_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return 'https://xinghuo.xfyun.cn/'
}

export async function listModels() {
  return SPARK_MODELS
}

export async function usage() {
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const key = blob && (blob.accessToken || blob.apiKey)
  if (!key) throw new LlmError('iFlytek Spark requires API key', 'AUTH')

  const url = `${(config && config.apiBase) || SPARK_API_BASE}/chat/completions`
  const body = {
    model: options.model || 'spark-max',
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
