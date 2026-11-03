// A scripted OpenAI-compatible /chat/completions endpoint for agent-over-door tests. No real model is called:
// each request takes the next scripted reply, and every request body is kept so a test can read what was sent.
// A reply with `sse` (an array of raw text pieces) answers as a server-sent event stream, one piece per read, `gapMs`
// apart; `hang: true` then keeps the stream open without a byte until the request's signal aborts it.

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
    if (next.sse) return sseResponse(next, init.signal)
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function sseResponse({ sse, gapMs = 0, hang = false, status = 200 }, signal) {
  const bytes = new TextEncoder()
  const body = new ReadableStream({
    async start(controller) {
      const stop = () => controller.error(signal.reason ?? new Error('aborted'))
      signal?.addEventListener('abort', stop, { once: true })
      for (const piece of sse) {
        if (signal?.aborted) return
        if (gapMs) await sleep(gapMs)
        if (signal?.aborted) return
        controller.enqueue(bytes.encode(piece))
      }
      if (!hang) {
        signal?.removeEventListener('abort', stop)
        controller.close()
      }
    }
  })
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } })
}

/** One SSE event carrying a JSON payload. */
export const sseEvent = (payload) =>
  `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`

/** Cut a string into pieces of `size` characters. */
const pieces = (text, size) => {
  const out = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

/**
 * The SSE stream DeepSeek's own API sends for an unstreamed reply body: a role chunk, the reasoning_content and the
 * content in small pieces, each tool call as a head (index, id, name) and argument pieces, the finish reason, then a
 * chunk with no choices carrying the usage (stream_options.include_usage), keep-alive comments in between, and [DONE].
 */
export function deepseekStreamOf(reply, { size = 7 } = {}) {
  const { id, model, choices, usage } = reply.body
  const m = choices[0].message
  const head = { id, object: 'chat.completion.chunk', model }
  const chunk = (delta, finish = null) =>
    sseEvent({ ...head, choices: [{ index: 0, delta, finish_reason: finish }] })
  const out = [': keep-alive\n\n', chunk({ role: 'assistant', content: null, reasoning_content: '' })]
  for (const p of pieces(m.reasoning_content ?? '', size)) out.push(chunk({ reasoning_content: p }))
  out.push(': keep-alive\n\n')
  for (const p of pieces(m.content ?? '', size)) out.push(chunk({ content: p }))
  ;(m.tool_calls ?? []).forEach((c, index) => {
    out.push(
      chunk({
        tool_calls: [
          { index, id: c.id, type: 'function', function: { name: c.function.name, arguments: '' } }
        ]
      })
    )
    for (const p of pieces(c.function.arguments, size))
      out.push(chunk({ tool_calls: [{ index, function: { arguments: p } }] }))
  })
  out.push(chunk(m.content == null ? {} : { content: '' }, choices[0].finish_reason))
  out.push(sseEvent({ ...head, choices: [], usage }))
  out.push('data: [DONE]\n\n')
  return out
}
