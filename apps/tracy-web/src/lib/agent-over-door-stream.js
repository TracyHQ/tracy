// The streamed half of agent-over-door.js: reading a /chat/completions answer sent as server-sent events
// (`stream: true`) and putting it back together into the JSON body the same call returns unstreamed, so everything
// after the read (errors, retries, saving the turn) is the same for both.
//
// SSE: an event is one or more `data:` lines ended by a blank line. `data: [DONE]` ends the stream; a line starting
// with `:` is a comment, sent as a keep-alive (`: keep-alive` from DeepSeek, `: OPENROUTER PROCESSING`); any other
// field is ignored. A data line holding `{"error": ...}` is the provider giving up mid-stream: it is returned as the
// body, so the caller raises the same provider error an unstreamed error body does.
//
// Assembly, per chunk's choices[0].delta: content and reasoning_content (DeepSeek's thinking) are concatenated;
// tool_calls are merged by index (id, type and function.name are taken when given, function.arguments concatenated);
// finish_reason is the last one given; usage is the last one given (DeepSeek sends it in a final chunk with no
// choices when stream_options.include_usage is asked for); id and model come from the first chunk carrying them.
// OpenRouter's reasoning / reasoning_details are deliberately not assembled here: that wire is not streamed
// (agent-over-door-wire.js), because a streamed reasoning_details entry carrying an Anthropic thinking signature
// cannot be proven to rebuild byte for byte what the unstreamed answer holds.

/** Split a byte stream into SSE data payloads. `onBytes` is told of every chunk read, keep-alives included. */
export async function* sseData(body, onBytes = () => {}) {
  const decoder = new TextDecoder()
  let buffer = ''
  let lines = []
  const flush = function* () {
    if (lines.length) yield lines.join('\n')
    lines = []
  }
  const take = function* (text) {
    buffer += text
    let at
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).replace(/\r$/, '')
      buffer = buffer.slice(at + 1)
      if (line === '') yield* flush()
      else if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''))
      // A comment (keep-alive) or another field: nothing to read.
    }
  }
  for await (const chunk of body) {
    onBytes(chunk.length ?? 0)
    yield* take(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }))
  }
  yield* take(`${decoder.decode()}\n`)
  yield* flush()
}

/** A fresh accumulator; `add` takes one parsed chunk, `progress` counts characters, `body` gives the answer. */
export function streamAssembly() {
  const state = {
    id: null,
    model: null,
    finish: null,
    usage: null,
    content: null,
    reasoning: null,
    calls: []
  }
  let argumentChars = 0
  return {
    add(chunk) {
      state.id ??= typeof chunk.id === 'string' ? chunk.id : null
      state.model ??= typeof chunk.model === 'string' ? chunk.model : null
      if (chunk.usage && typeof chunk.usage === 'object') state.usage = chunk.usage
      const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined
      if (!choice) return
      if (typeof choice.finish_reason === 'string') state.finish = choice.finish_reason
      const d = choice.delta ?? {}
      if (typeof d.content === 'string') state.content = (state.content ?? '') + d.content
      if (typeof d.reasoning_content === 'string')
        state.reasoning = (state.reasoning ?? '') + d.reasoning_content
      for (const part of Array.isArray(d.tool_calls) ? d.tool_calls : []) {
        const i = Number.isInteger(part?.index) ? part.index : state.calls.length
        const call = (state.calls[i] ??= {
          id: null,
          type: 'function',
          function: { name: '', arguments: '' }
        })
        if (typeof part.id === 'string' && part.id) call.id = part.id
        if (typeof part.type === 'string' && part.type) call.type = part.type
        if (typeof part.function?.name === 'string' && part.function.name)
          call.function.name = part.function.name
        if (typeof part.function?.arguments === 'string') {
          call.function.arguments += part.function.arguments
          argumentChars += part.function.arguments.length
        }
      }
    },
    finished: () => state.finish !== null,
    progress: () => ({
      contentChars: state.content?.length ?? 0,
      reasoningChars: state.reasoning?.length ?? 0,
      toolArgumentChars: argumentChars
    }),
    /** The answer in the shape of an unstreamed /chat/completions body. */
    body() {
      const calls = state.calls.filter(Boolean)
      return {
        id: state.id,
        model: state.model,
        choices: [
          {
            index: 0,
            finish_reason: state.finish,
            message: {
              role: 'assistant',
              content: state.content,
              ...(state.reasoning !== null ? { reasoning_content: state.reasoning } : {}),
              ...(calls.length ? { tool_calls: calls } : {})
            }
          }
        ],
        ...(state.usage ? { usage: state.usage } : {})
      }
    }
  }
}

/**
 * Read a streamed answer to its end. Resolves to `{ json }` (the assembled body, or the provider's error body met
 * mid-stream) or `{ broken }` (why the stream is not a whole answer: a payload that is not JSON, or an end without
 * [DONE] and without a finish reason, which is what a dropped connection looks like).
 */
export async function readStream(body, { onBytes, assembly = streamAssembly() } = {}) {
  let done = false
  for await (const data of sseData(body, onBytes)) {
    if (data === '[DONE]') {
      done = true
      break
    }
    let chunk
    try {
      chunk = JSON.parse(data)
    } catch {
      return { broken: `an event that is not JSON: ${data.slice(0, 200)}` }
    }
    if (chunk?.error) return { json: chunk }
    if (chunk && typeof chunk === 'object') assembly.add(chunk)
  }
  if (!done && !assembly.finished()) return { broken: 'the stream ended before the answer did' }
  return { json: assembly.body() }
}
