import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages } from '../messages.js'
import { openaiChatStream, readJson, httpError } from '../wire.js'

export const id = 'ernie'
export const ERNIE_OAUTH_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const ERNIE_BASE_URL = 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat'

const ERNIE_MODELS = [
  {
    id: 'ernie-speed-128k',
    name: 'ERNIE Speed 128K',
    contextWindow: 128000,
    maxTokens: 4096,
    inputModalities: ['text']
  },
  {
    id: 'ernie-4.0-turbo-8k',
    name: 'ERNIE 4.0 Turbo',
    contextWindow: 8192,
    maxTokens: 2048,
    inputModalities: ['text']
  }
]

export function providerInfo() {
  return { id, name: 'Baidu ERNIE' }
}

export function defaults() {
  return {
    apiBase: ERNIE_BASE_URL,
    models: ERNIE_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return 'https://console.bce.baidu.com/qianfan'
}

export async function listModels() {
  return ERNIE_MODELS
}

async function refreshErnieToken(apiKey, secretKey, fetchImpl) {
  const impl = fetchImpl || fetch
  const url = `${ERNIE_OAUTH_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`
  const res = await impl(url, { method: 'POST' })
  if (!res.ok) throw httpError(res.status, await res.text())
  return readJson(res)
}

export async function usage() {
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  let token = blob && blob.accessToken
  if (!token && blob && blob.apiKey && blob.secretKey) {
    const auth = await refreshErnieToken(blob.apiKey, blob.secretKey, impl)
    if (auth && auth.access_token) {
      token = auth.access_token
      blob.accessToken = token
    }
  }
  if (!token) throw new LlmError('Baidu ERNIE requires access token or API Key + Secret Key', 'AUTH')

  const endpoint = options.model === 'ernie-4.0-turbo-8k' ? 'completions_pro' : 'ernie_speed'
  const url = `${(config && config.apiBase) || ERNIE_BASE_URL}/${endpoint}?access_token=${token}`

  const messages = openaiMessages(options).map((m) => ({
    role: m.role === 'system' ? 'user' : m.role,
    content: m.content
  }))

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages, stream: true }),
    signal
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
