import { LlmAdapter, LlmError, attributionHeaders } from '@deepseek-ai/dsh-llm'
import { openaiMessages, openaiTools } from './messages.js'
import { openaiChatStream } from './wire.js'

// #91: local Ollama gateway - a $0 emergency provider and seamless quota
// fallback. Speaks the OpenAI-compatible subset Ollama serves at /v1.

export function ollamaBase(cfg) {
  return String(cfg.ollamaBaseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')
}

export async function ollamaAlive(baseUrl, fetchImpl, timeoutMs = 2000) {
  try {
    const res = await fetchImpl(baseUrl + '/api/tags', { signal: AbortSignal.timeout(timeoutMs) })
    return !!res && res.ok
  } catch { return false }
}

export async function ollamaModels(baseUrl, fetchImpl) {
  const res = await fetchImpl(baseUrl + '/api/tags', { signal: AbortSignal.timeout(3000) })
  if (!res || !res.ok) throw new LlmError('ollama /api/tags http ' + (res && res.status), 'VENDOR', { status: res && res.status })
  const j = await res.json()
  return (Array.isArray(j.models) ? j.models : []).map((m) => ({
    id: m.name,
    name: m.name,
    ...(m.details && m.details.parameter_size ? { description: m.details.parameter_size } : {}),
  }))
}

export class OllamaAdapter extends LlmAdapter {
  constructor(deps) {
    super()
    this.deps = deps
  }

  providerInfo(provider) {
    return { id: provider, name: 'Ollama (local)' }
  }

  providerRetryPolicy() {
    return undefined
  }

  async listModels() {
    return ollamaModels(this.deps.baseUrl(), this.deps.fetchImpl || fetch)
  }

  imageRequestPricing() {
    return undefined
  }

  async resolveModel(provider, model) {
    return { provider, id: model, name: model }
  }

  async prepareCall(provider, model, signal) {
    return {
      model: await this.resolveModel(provider, model, signal),
      stream: (options) => this.stream(options),
    }
  }

  async *stream(options) {
    const base = this.deps.baseUrl()
    const model = options.model || this.deps.fallbackModel() || ''
    const body = { model, messages: openaiMessages(options), stream: true }
    const tools = openaiTools(options)
    if (tools) body.tools = tools
    const res = await (this.deps.fetchImpl || fetch)(base + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...attributionHeaders() },
      body: JSON.stringify(body),
      signal: options.signal,
    })
    if (!res || !res.ok) {
      const txt = res && res.text ? await res.text().catch(() => '') : ''
      throw new LlmError('ollama http ' + (res && res.status) + (txt ? ': ' + txt.slice(0, 200) : ''), 'VENDOR', { status: res && res.status })
    }
    yield* openaiChatStream(res.body)
  }
}
