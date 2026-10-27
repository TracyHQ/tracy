/** Reasoning-enabled pilot client. It deliberately does not use the seed writer's noReasoningBody. */
import { EDITORIAL_SYSTEM, editorialModelView } from './editorial.js'

export async function askEditorialModel({
  model,
  input,
  fetchImpl = fetch,
  signal,
  maxTokens = 12000,
  timeoutMs = 120000
}) {
  if (!model?.apiKey || !model?.baseUrl || !model?.words) throw new Error('EDITORIAL_MODEL_UNCONFIGURED')
  if (
    !Number.isInteger(maxTokens) ||
    maxTokens < 1000 ||
    maxTokens > 16000 ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 180000
  )
    throw new Error('EDITORIAL_MODEL_INVALID_BUDGET')
  const url = new URL(`${model.baseUrl.replace(/\/+$/, '')}/chat/completions`)
  if (!['openrouter.ai', 'api.deepseek.com'].includes(url.hostname))
    throw new Error('EDITORIAL_REASONING_PROVIDER_UNSUPPORTED')
  const reasoning =
    url.hostname === 'openrouter.ai'
      ? { reasoning: { enabled: true, effort: 'high' } }
      : { thinking: { type: 'enabled' } }
  const started = Date.now()
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${model.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model.words,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      ...reasoning,
      messages: [
        { role: 'system', content: EDITORIAL_SYSTEM },
        { role: 'user', content: JSON.stringify(editorialModelView(input)) }
      ]
    }),
    signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
  })
  if (!response.ok) throw new Error(`EDITORIAL_MODEL_HTTP_${response.status}`)
  const body = await response.json()
  const answer = body.choices?.[0]?.message?.content
  if (body.choices?.[0]?.finish_reason === 'length') throw new Error('EDITORIAL_MODEL_TRUNCATED')
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('EDITORIAL_MODEL_EMPTY')
  let plan
  try {
    plan = JSON.parse(answer.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
  } catch {
    throw new Error('EDITORIAL_MODEL_INVALID_JSON')
  }
  return {
    plan,
    receipt: {
      model: model.words,
      endpointHost: url.host,
      durationMs: Date.now() - started,
      usage: body.usage ?? null,
      requestId: body.id ?? null,
      maxTokens,
      reasoning: 'enabled',
      calls: 1
    }
  }
}
