/** OpenAI-compatible SSE adapter for exercising the product loop with real streamed tool calls. */
import { createHash } from 'node:crypto'
export function streamingAgentProvider({
  http = globalThis.fetch,
  key,
  model = 'deepseek-flash',
  calls,
  requests
}) {
  return async function* stream(options, step) {
    if (step > 8) throw new Error('MODEL_STEP_LIMIT')
    const messages = options.messages.map((m) => {
      const text = (m.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
      const tools = (m.content ?? [])
        .filter((b) => b.type === 'tool-call')
        .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: b.arguments } }))
      return {
        role: m.role,
        content: text || (tools.length ? null : ''),
        ...(tools.length ? { tool_calls: tools } : {}),
        ...(m.role === 'tool' ? { tool_call_id: m.toolCallId } : {})
      }
    })
    const tools = options.tools?.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }))
    const start = performance.now(),
      record = {
        step,
        model,
        status: null,
        usage: null,
        firstChunkMs: null,
        ms: null,
        promptHash: createHash('sha256').update(JSON.stringify(messages)).digest('hex')
      }
    requests.push(record)
    const response = await http('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        ...(tools?.length ? { tools } : {}),
        temperature: 0,
        thinking: { type: 'disabled' },
        max_tokens: 1800,
        stream: true,
        stream_options: { include_usage: true }
      }),
      signal: AbortSignal.timeout(90000)
    })
    record.status = response.status
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`)
    const decoder = new TextDecoder(),
      blocks = new Map()
    let pending = '',
      text = '',
      startedText = false,
      reason = 'stop'
    for await (const chunk of response.body) {
      record.firstChunkMs ??= performance.now() - start
      pending += decoder.decode(chunk, { stream: true })
      let end
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).trim()
        pending = pending.slice(end + 1)
        if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') continue
        const data = JSON.parse(line.slice(5))
        if (data.usage) record.usage = data.usage
        const choice = data.choices?.[0]
        if (!choice) continue
        if (choice.finish_reason) reason = choice.finish_reason
        const delta = choice.delta ?? {}
        if (delta.content) {
          if (!startedText) {
            startedText = true
            yield { type: 'block-start', index: 100, blockType: 'text' }
          }
          text += delta.content
          yield { type: 'text-delta', index: 100, text: delta.content }
        }
        for (const t of delta.tool_calls ?? []) {
          const index = t.index
          let b = blocks.get(index)
          if (!b) {
            b = { id: t.id, name: '', arguments: '' }
            blocks.set(index, b)
            yield { type: 'block-start', index, blockType: 'tool-call' }
          }
          if (t.id) b.id = t.id
          if (t.function?.name) b.name += t.function.name
          b.arguments += t.function?.arguments ?? ''
          yield {
            type: 'tool-call-delta',
            index,
            id: b.id,
            name: b.name,
            argumentsDelta: t.function?.arguments ?? ''
          }
        }
      }
    }
    if (startedText) yield { type: 'block-end', index: 100, block: { type: 'text', text } }
    for (const [index, b] of blocks) {
      calls.push({ name: b.name, arguments: JSON.parse(b.arguments) })
      yield { type: 'block-end', index, block: { type: 'tool-call', ...b } }
    }
    record.ms = performance.now() - start
    record.finalText = blocks.size ? null : text
    if (record.usage)
      yield {
        type: 'usage',
        usage: { inputTokens: record.usage.prompt_tokens, outputTokens: record.usage.completion_tokens }
      }
    yield { type: 'finish', reason: { kind: reason === 'tool_calls' ? 'tool-calls' : 'stop' } }
  }
}
