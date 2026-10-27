import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages, openaiTools } from '../messages.js'
import { openaiChatStream, httpError } from '../wire.js'

export const id = 'qwen'
const QWEN_API_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

const QWEN_MODELS = [
  {
    id: 'qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B',
    contextWindow: 131072,
    maxTokens: 8192,
    inputModalities: ['text']
  },
  {
    id: 'qwen-max-latest',
    name: 'Qwen Max',
    contextWindow: 32768,
    maxTokens: 8192,
    inputModalities: ['text']
  },
  {
    id: 'qwen-plus-latest',
    name: 'Qwen Plus',
    contextWindow: 131072,
    maxTokens: 8192,
    inputModalities: ['text']
  }
]

export function providerInfo() {
  return { id, name: 'Alibaba Qwen' }
}

export function defaults() {
  return {
    apiBase: QWEN_API_BASE,
    models: QWEN_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return 'https://bailian.console.aliyun.com/'
}

export async function listModels() {
  return QWEN_MODELS
}

export async function usage() {
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const key = blob && (blob.accessToken || blob.apiKey)
  if (!key) throw new LlmError('Qwen API Key or Token is required', 'AUTH')

  /** @type {Record<string, any>} */
  const body = {
    model: options.model || 'qwen-2.5-coder-32b-instruct',
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {})
  }

  const tools = openaiTools(options)
  if (tools && tools.length) body.tools = tools

  const url = ((config && config.apiBase) || QWEN_API_BASE).replace(/\/+$/, '') + '/chat/completions'
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
