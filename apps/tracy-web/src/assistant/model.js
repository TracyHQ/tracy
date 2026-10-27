/**
 * The assistant's model: one streamed OpenAI-compatible chat call, credential from the provider book.
 *
 * 🔒 ITS OWN DOOR, BORROWING `web` WHEN UNSET — a ladder
 * (`assistant` → `web` → the environment, `lib/llm-door.js` `modelForChain`), and for the same reason: a deployment whose `web` door
 * works gets a working assistant the moment this ships, and an administrator who wants it on a
 * cheaper model assigns the door on the Model & AI screen without touching anything else.
 *
 * 🔒 THE PROVIDER'S BODY NEVER REACHES THE BROWSER. An error body can echo the request, and the
 * request carries the asker's context; the caller gets a code, and the log gets the status.
 *
 * Every catalog entry speaks `POST {baseUrl}/chat/completions` (`lib/llm-catalog.js`), so streaming
 * is the standard `stream: true` server-sent events: `data: {choices:[{delta:{content}}]}` lines,
 * then `data: [DONE]`.
 */
import { modelForChain } from '../lib/llm-door.js'

export const ASSISTANT_DOOR = 'assistant'
const FALLBACK_DOOR = 'web'

/** Long enough for a full answer at a cheap model's speed, short enough that a stuck stream ends. */
export const TURN_DEADLINE_MS = 60_000
/** An answer is a few sentences; this caps what one turn can cost. */
const MAX_OUTPUT_TOKENS = 1024

/**
 * @param {{ pool: import('pg').Pool | null, config: object, fetchImpl?: typeof fetch }} deps
 */
export function assistantModel({ pool, config, fetchImpl = fetch }) {
  // Its own door, else the one `web` uses, else the environment — but an assigned door that is
  // broken answers `null` instead of lending out `web`'s budget (`modelForChain`).
  const credential = () => modelForChain(pool, [ASSISTANT_DOOR, FALLBACK_DOOR], config)

  return {
    /**
     * Stream one answer. Yields text pieces; ends normally only once the provider has said it
     * finished (`finish_reason` other than `length`). A cut or dropped stream throws `TRUNCATED`.
     * Throws `{ code }` (an Error with a `code` property) on anything that is not an answer.
     * @param {{ messages: Array<{role: string, content: string}>, signal?: AbortSignal, maxOutputTokens?: number }} input
     * @returns {AsyncGenerator<{ text?: string, model?: string }>}
     */
    async *stream({ messages, signal, maxOutputTokens = MAX_OUTPUT_TOKENS }) {
      const model = await credential()
      if (!model) throw coded('NOT_CONFIGURED')
      let res
      try {
        res = await fetchImpl(`${model.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${model.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: model.words,
            stream: true,
            // Asked for so the last event carries the token counts; a vendor that ignores it just sends none.
            stream_options: { include_usage: true },
            temperature: 0.3,
            max_tokens: Math.min(4096, Math.max(MAX_OUTPUT_TOKENS, maxOutputTokens)),
            messages
          }),
          ...(signal ? { signal } : {})
        })
      } catch (error) {
        throw coded(
          signal?.aborted || (error instanceof Error && error.name === 'AbortError')
            ? 'CANCELLED'
            : 'UNREACHABLE'
        )
      }
      if (!res.ok || !res.body) {
        throw coded(
          res.status === 429
            ? 'RATE_LIMITED'
            : res.status === 401 || res.status === 403
              ? 'FORBIDDEN'
              : 'FAILED',
          res.status
        )
      }
      yield { model: model.words }
      const decoder = new TextDecoder()
      let buffer = ''
      // 🔒 AN ANSWER IS COMPLETE ONLY WHEN THE PROVIDER SAYS SO (`[DONE]`, or a finish reason that
      // is not `length`). The body simply ending is also what a dropped connection looks like, and
      // `finish_reason: "length"` is the provider hitting `MAX_OUTPUT_TOKENS` mid-sentence; either
      // would be saved and shown as a finished answer, and the next turn would read the cut text as
      // something the assistant had already said.
      let finished = false
      try {
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk, { stream: true })
          let newline
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).trim()
            buffer = buffer.slice(newline + 1)
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') return
            const event = readEvent(data)
            if (event.error) throw coded('FAILED')
            if (event.usage) yield { usage: event.usage }
            if (event.text) yield { text: event.text }
            if (event.finish === 'length') throw coded('TRUNCATED')
            if (event.finish) finished = true
          }
        }
      } catch (error) {
        if (error?.code === 'TRUNCATED') throw error
        throw coded(signal?.aborted ? 'CANCELLED' : 'FAILED')
      }
      // The body ended without `[DONE]`. A provider that sent a finish reason and then closed is
      // fine; one that just stopped is not.
      if (!finished) throw coded('TRUNCATED')
    }
  }
}

/** The content of one stream event, or null (a role-only first chunk, a keep-alive, junk). */
export function deltaOf(data) {
  return readEvent(data).text
}

/**
 * One stream event, read whole: the text it carries, the reason the provider gave for stopping
 * (`stop`, `length`…), and whether it is an error frame (`data: {"error": …}`, which carries no
 * `content` and used to be skipped as junk).
 * @param {string} data
 * @returns {{ text: string | null, finish: string | null, error: boolean,
 *   usage: { inputTokens: number, outputTokens: number } | null }}
 */
export function readEvent(data) {
  try {
    const parsed = JSON.parse(data)
    const choice = parsed?.choices?.[0]
    const content = choice?.delta?.content
    return {
      text: typeof content === 'string' && content !== '' ? content : null,
      finish: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
      error: parsed?.error !== undefined && parsed?.error !== null,
      usage:
        Number.isFinite(parsed?.usage?.prompt_tokens) && Number.isFinite(parsed?.usage?.completion_tokens)
          ? { inputTokens: parsed.usage.prompt_tokens, outputTokens: parsed.usage.completion_tokens }
          : null
    }
  } catch {
    return { text: null, finish: null, error: false, usage: null }
  }
}

/** @param {string} code @param {number} [status] */
function coded(code, status) {
  return Object.assign(new Error(code), { code, ...(status ? { status } : {}) })
}
