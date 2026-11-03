// A scripted OpenAI-compatible /chat/completions endpoint for agent-over-door tests. No real model is called:
// each request takes the next scripted reply, and every request body is kept so a test can read what was sent.

export const DOOR = Object.freeze({
  baseUrl: 'https://models.example.test/api/v1/',
  apiKey: 'test-key',
  model: 'vendor/test-model'
})

export function scriptedModel(replies) {
  const requests = []
  const queue = [...replies]
  const fetchImpl = async (url, init) => {
    requests.push({ url, headers: init.headers, body: JSON.parse(init.body) })
    const next = queue.shift()
    if (!next) throw new Error('the scripted model has no reply left')
    if (next.throw) throw next.throw
    const status = next.status ?? 200
    const text = typeof next.body === 'string' ? next.body : JSON.stringify(next.body)
    return new Response(text, { status, headers: { 'content-type': 'application/json', ...next.headers } })
  }
  return { fetchImpl, requests, left: () => queue.length }
}

let callId = 0

export function toolCallReply({ calls, reasoningDetails, usage = usageOf(), content = null }) {
  return {
    body: {
      id: `gen-${++callId}`,
      model: DOOR.model,
      choices: [
        {
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content,
            reasoning: 'thinking text',
            ...(reasoningDetails ? { reasoning_details: reasoningDetails } : {}),
            tool_calls: calls.map(([name, args], i) => ({
              id: `call-${callId}-${i}`,
              type: 'function',
              function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) }
            }))
          }
        }
      ],
      usage
    }
  }
}

export function finalReply({ content, finishReason = 'stop', usage = usageOf(), reasoningDetails }) {
  return {
    body: {
      id: `gen-${++callId}`,
      model: DOOR.model,
      choices: [
        {
          finish_reason: finishReason,
          message: {
            role: 'assistant',
            content,
            ...(reasoningDetails ? { reasoning_details: reasoningDetails } : {})
          }
        }
      ],
      usage
    }
  }
}

export function usageOf({
  prompt = 1000,
  completion = 200,
  cached = 0,
  cacheWrite = 0,
  reasoning = 50,
  cost
} = {}) {
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: { cached_tokens: cached, cache_write_tokens: cacheWrite },
    completion_tokens_details: { reasoning_tokens: reasoning },
    ...(cost === undefined ? {} : { cost })
  }
}
