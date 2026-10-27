import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages, openaiTools, modelCatalog } from '../messages.js'
import { openaiChatStream, readJson, httpError } from '../wire.js'
import { asUsageSnapshot } from '../usage.js'

export const id = 'cursor'

const CURSOR_API_BASE = 'https://api2.cursor.sh'
const CURSOR_USAGE_URL = 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage'
const CURSOR_AGENT_URL = 'https://agentn.us.api5.cursor.sh/agent.v1.AgentService/Run'
const CURSOR_CLIENT_VERSION = 'cli-2026.05.01-eea359f'

const CURSOR_MODELS = [
  {
    id: 'composer-2.5',
    name: 'Composer 2.5 Fast',
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'composer-2',
    name: 'Composer 2',
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
    reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] },
  },
  {
    id: 'composer-1.5',
    name: 'Composer 1.5',
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet (Cursor)',
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'claude-3.7-sonnet-thinking',
    name: 'Claude 3.7 Sonnet Thinking (Cursor)',
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
    reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] },
  },
  {
    id: 'claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (Cursor)',
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'claude-3.5-haiku',
    name: 'Claude 3.5 Haiku (Cursor)',
    contextWindow: 200000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o (Cursor)',
    contextWindow: 128000,
    maxTokens: 16384,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini (Cursor)',
    contextWindow: 128000,
    maxTokens: 16384,
    inputModalities: ['text'],
  },
  {
    id: 'o3-mini',
    name: 'o3-mini (Cursor)',
    contextWindow: 200000,
    maxTokens: 100000,
    inputModalities: ['text'],
    reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'medium', name: 'Medium' }, { id: 'high', name: 'High' }] },
  },
  {
    id: 'o1',
    name: 'o1 (Cursor)',
    contextWindow: 200000,
    maxTokens: 100000,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1 (Cursor)',
    contextWindow: 64000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3 (Cursor)',
    contextWindow: 64000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash (Cursor)',
    contextWindow: 1000000,
    maxTokens: 8192,
    inputModalities: ['text', 'image'],
  },
  {
    id: 'cursor-small',
    name: 'Cursor Small',
    contextWindow: 32000,
    maxTokens: 4096,
    inputModalities: ['text'],
  },
]

export function providerInfo() {
  return { id, name: 'Cursor' }
}

export function defaults() {
  return {
    apiBase: CURSOR_API_BASE,
    models: CURSOR_MODELS.map((m) => m.id),
  }
}

export function authorizeUrl() {
  return 'https://cursor.com/settings'
}

export async function listModels(_blob, cfg) {
  return modelCatalog(id, cfg && cfg.models ? cfg.models.map((m) => typeof m === "string" ? CURSOR_MODELS.find((c) => c.id === m) || m : m) : CURSOR_MODELS)
}

export async function usage(blob, config, fetchImpl) {
  try {
    const impl = fetchImpl || fetch
    const token = blob && (blob.accessToken || blob.access_token)
    if (!token) return null
    const res = await impl(CURSOR_USAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-cursor-client-version': CURSOR_CLIENT_VERSION,
        'User-Agent': CURSOR_CLIENT_VERSION,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    if (!res.ok) return null
    const json = await readJson(res)
    // Cursor returns { numRequests, maxRequestUsage, plan }
    if (json && json.numRequests != null && json.maxRequestUsage != null && json.maxRequestUsage > 0) {
      const pct = Math.round((json.numRequests / json.maxRequestUsage) * 100)
      const snap = asUsageSnapshot(pct)
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
  if (!token) throw new LlmError('Cursor not authenticated', 'AUTH')

  /** @type {Record<string, any>} */
  const body = {
    model: options.model || 'composer-2',
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }

  const tools = openaiTools(options)
  if (tools && tools.length) body.tools = tools

  const url = (config && config.agentUrl) || CURSOR_AGENT_URL
  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      Authorization: `Bearer ${token}`,
      'x-cursor-client-version': CURSOR_CLIENT_VERSION,
      'User-Agent': CURSOR_CLIENT_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
