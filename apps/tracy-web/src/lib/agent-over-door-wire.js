// The wire half of agent-over-door.js: what one OpenAI-compatible /chat/completions request looks like, and what is
// read back from its answer. Pure functions; the loop, the tools and the saved turns live in agent-over-door.js.
//
// Prompt caching (Anthropic models behind OpenRouter): a cache_control marker on a content part caches the whole
// prompt up to and including that part. Two markers are placed on every request, never stored in the conversation:
// one on the system prompt (its TTL chosen by the caller), and one rolling marker on the newest non-assistant message
// (the newest tool result, or the first user message on turn 0), so each call re-reads everything the previous call
// already paid to cache. Anthropic allows four markers; a 1h marker must come before a 5m one.

export const CACHE_TTLS = ['5m', '1h']

const marker = (ttl) => (ttl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' })

const asParts = (content) =>
  typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []

function withMarker(content, ttl) {
  const parts = asParts(content).map((p) => ({ ...p }))
  if (!parts.length) return content
  let at = parts.findLastIndex((p) => p.type === 'text')
  if (at < 0) at = parts.length - 1
  parts[at].cache_control = marker(ttl)
  return parts
}

/** The JSON body of one call. `messages` is the saved conversation without the system prompt. */
export function requestBody({ model, system, messages, tools, maxTokens, effort, cacheTtl }) {
  const newest = messages.findLastIndex((m) => m.role !== 'assistant')
  return {
    model,
    messages: [
      { role: 'system', content: withMarker(system, cacheTtl.system) },
      ...messages.map((m, i) =>
        i === newest ? { ...m, content: withMarker(m.content, cacheTtl.rolling) } : m
      )
    ],
    ...(tools.length
      ? {
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters }
          }))
        }
      : {}),
    // enabled makes thinking explicit; with effort alone an Anthropic model may still skip thinking on an easy turn.
    reasoning: { enabled: true, effort },
    max_tokens: maxTokens,
    usage: { include: true }
  }
}

/** The assistant message as it is saved and sent back: reasoning details are kept, they sign the model's thinking. */
export function savedAssistant(m) {
  return {
    role: 'assistant',
    content: typeof m.content === 'string' || Array.isArray(m.content) ? m.content : null,
    ...(Array.isArray(m.tool_calls) && m.tool_calls.length ? { tool_calls: m.tool_calls } : {}),
    ...(typeof m.reasoning === 'string' ? { reasoning: m.reasoning } : {}),
    ...(Array.isArray(m.reasoning_details) ? { reasoning_details: m.reasoning_details } : {})
  }
}

const count = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0)

/** Token counts of one answer. cached = read from the cache, cacheWrite = written to it on this call. */
export function usageOf(usage) {
  return {
    promptTokens: count(usage?.prompt_tokens),
    completionTokens: count(usage?.completion_tokens),
    cachedTokens: count(usage?.prompt_tokens_details?.cached_tokens),
    cacheWriteTokens: count(usage?.prompt_tokens_details?.cache_write_tokens),
    reasoningTokens: count(usage?.completion_tokens_details?.reasoning_tokens)
  }
}

/** The provider's own cost of one answer in USD, or null when it sent none (never estimated). */
export function costOf(usage) {
  const cost = usage?.cost
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : null
}

/** Totals over every answered turn. */
export function totalsOf(turns) {
  const t = {
    turns: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    cost: 0,
    turnsWithoutCost: 0
  }
  for (const turn of turns) {
    if (turn.state !== 'answered') continue
    t.turns++
    for (const k of Object.keys(turn.usage ?? {})) t[k] += count(turn.usage[k])
    if (turn.cost == null) t.turnsWithoutCost++
    else t.cost += turn.cost
  }
  t.cost = Math.round(t.cost * 1e9) / 1e9
  return t
}

/** A short reason from a provider's error body, never longer than 300 characters. */
export function providerReason(body) {
  const text =
    typeof body === 'string'
      ? body
      : (body?.error?.message ?? body?.message ?? (body?.error ? JSON.stringify(body.error) : ''))
  return String(text || 'no reason given').slice(0, 300)
}

/** A tool's result as message content: a string, or text plus image parts. */
export function toolContent(result) {
  if (typeof result === 'string') return { text: result, images: [] }
  if (result && typeof result === 'object' && typeof result.text === 'string')
    return {
      text: result.text,
      images: (Array.isArray(result.images) ? result.images : []).map((img) => ({
        type: 'image_url',
        image_url: { url: `data:${img.mediaType};base64,${img.base64}` }
      }))
    }
  return { text: JSON.stringify(result ?? null), images: [] }
}
