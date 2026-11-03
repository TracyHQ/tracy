// The wire half of agent-over-door.js: what one OpenAI-compatible /chat/completions request looks like, and what is
// read back from its answer. Pure functions; the loop, the tools and the saved turns live in agent-over-door.js.
//
// Prompt caching (Anthropic models behind OpenRouter): a cache_control marker on a content part caches the whole
// prompt up to and including that part. Two markers are placed on every request, never stored in the conversation:
// one on the system prompt (its TTL chosen by the caller), and one rolling marker on the newest non-assistant message
// (the newest tool result, or the first user message on turn 0), so each call re-reads everything the previous call
// already paid to cache. Anthropic allows four markers; a 1h marker must come before a 5m one. With cacheMarkers
// false (a model that caches on its own) no marker is placed and the messages go as saved.
//
// Two wire flavours. 'openrouter' (the default) sends OpenRouter's fields: reasoning {enabled, effort}, usage
// {include: true} and the provider routing object. 'deepseek-native' talks to DeepSeek's own API: thinking effort is
// the top-level reasoning_effort, and neither usage nor provider is sent (DeepSeek ignores the first, and the second
// is OpenRouter's alone). Either way the assistant message's thinking is saved and sent back on every later turn.
//
// Only 'deepseek-native' is streamed (stream: true, with stream_options.include_usage so the last chunk carries the
// token counts; agent-over-door-stream.js puts the answer back together). 'openrouter' stays unstreamed: its answer
// carries reasoning_details with Anthropic thinking signatures that must come back byte for byte, and how OpenRouter
// splits those entries over chunks cannot be checked here without a paid call.

export const CACHE_TTLS = ['5m', '1h']

export const WIRES = ['openrouter', 'deepseek-native']

/** Whether calls on this wire are streamed. */
export const streams = (wire) => wire === 'deepseek-native'

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
export function requestBody({
  model,
  system,
  messages,
  tools,
  maxTokens,
  effort,
  cacheTtl,
  cacheMarkers = true,
  provider,
  wire = 'openrouter'
}) {
  const newest = messages.findLastIndex((m) => m.role !== 'assistant')
  return {
    model,
    messages: cacheMarkers
      ? [
          { role: 'system', content: withMarker(system, cacheTtl.system) },
          ...messages.map((m, i) =>
            i === newest ? { ...m, content: withMarker(m.content, cacheTtl.rolling) } : m
          )
        ]
      : [{ role: 'system', content: system }, ...messages],
    ...(tools.length
      ? {
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters }
          }))
        }
      : {}),
    ...(wire === 'deepseek-native'
      ? {
          reasoning_effort: effort,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true }
        }
      : {
          // enabled makes thinking explicit; with effort alone an Anthropic model may still skip thinking on an easy turn.
          reasoning: { enabled: true, effort },
          max_tokens: maxTokens,
          usage: { include: true },
          ...(provider ? { provider } : {})
        })
  }
}

/**
 * The assistant message as it is saved and sent back: reasoning details are kept, they sign the model's thinking;
 * reasoning_content is DeepSeek's own field for it, which its API requires back on every later turn of a tool loop.
 */
export function savedAssistant(m) {
  return {
    role: 'assistant',
    content: typeof m.content === 'string' || Array.isArray(m.content) ? m.content : null,
    ...(Array.isArray(m.tool_calls) && m.tool_calls.length ? { tool_calls: m.tool_calls } : {}),
    ...(typeof m.reasoning === 'string' ? { reasoning: m.reasoning } : {}),
    ...(Array.isArray(m.reasoning_details) ? { reasoning_details: m.reasoning_details } : {}),
    ...(typeof m.reasoning_content === 'string' ? { reasoning_content: m.reasoning_content } : {})
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

/**
 * The cost of one answer in USD. Without a price table: the provider's own cost, or null when it sent none (never
 * estimated). With one (a provider that reports no cost, such as DeepSeek's own API): computed from the tokens at the
 * table's USD per million tokens, input split into cache hits and misses; null when the usage carries no tokens.
 * @param {object} usage
 * @param {{ inputCacheHit: number, inputCacheMiss: number, output: number }} [price]
 */
export function costOf(usage, price) {
  if (!price) {
    const cost = usage?.cost
    return typeof cost === 'number' && Number.isFinite(cost) ? cost : null
  }
  if (!usage || typeof usage !== 'object') return null
  const prompt = count(usage.prompt_tokens)
  const hit = count(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens)
  const miss =
    usage.prompt_cache_miss_tokens != null ? count(usage.prompt_cache_miss_tokens) : Math.max(0, prompt - hit)
  const usd =
    (hit * price.inputCacheHit +
      miss * price.inputCacheMiss +
      count(usage.completion_tokens) * price.output) /
    1e6
  return Math.round(usd * 1e9) / 1e9
}

/** A price table is three finite, non-negative USD per million token prices. */
export const isPriceTable = (price) =>
  price !== null &&
  typeof price === 'object' &&
  ['inputCacheHit', 'inputCacheMiss', 'output'].every((k) => Number.isFinite(price[k]) && price[k] >= 0)

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
  const head = String(text || 'no reason given').slice(0, 300)
  // OpenRouter answers "Provider returned error" and forwards the upstream body in error.metadata.raw: that body holds
  // the real reason (an image too large, a malformed message), so it is kept, bounded, with credentials masked.
  const metadata = typeof body === 'object' ? body?.error?.metadata : undefined
  const raw = metadata?.raw
  if (raw == null || raw === '') return head
  const upstream = typeof raw === 'string' ? raw : JSON.stringify(raw)
  const from =
    typeof metadata.provider_name === 'string' ? ` from ${metadata.provider_name.slice(0, 60)}` : ''
  return `${head}; upstream${from}: ${maskCredentials(upstream).slice(0, UPSTREAM_DETAIL_MAX)}`
}

/** About 2 kB of the upstream body: enough for the provider's own error message, small enough for a status line. */
const UPSTREAM_DETAIL_MAX = 2000
const maskCredentials = (s) =>
  s.replace(/\bBearer\s+\S+/gi, 'Bearer [masked]').replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-[masked]')

/**
 * The part a saved conversation keeps for an image that has a `ref`: the reference, never the bytes. agent-over-door.js
 * turns it back into an image_url part (the full bytes) before every call; the provider never sees this type.
 */
export const IMAGE_REF = 'image_ref'

const imagePart = (img) => ({
  type: 'image_url',
  image_url: { url: `data:${img.mediaType};base64,${img.base64}` }
})

/** The key of an image reference, the same for equal references. */
export const imageRefKey = (ref) => JSON.stringify(ref)

/**
 * A tool's result as message content: a string, or text plus images. Each image is { stored, wire }: `wire` is the
 * image_url part sent to the model, `stored` what the saved conversation keeps (the reference part when the image
 * carries a `ref`, else the image_url part itself).
 */
export function toolContent(result) {
  if (typeof result === 'string') return { text: result, images: [] }
  if (result && typeof result === 'object' && typeof result.text === 'string')
    return {
      text: result.text,
      images: (Array.isArray(result.images) ? result.images : []).map((img) => {
        const wire = imagePart(img)
        return {
          wire,
          stored: img.ref === undefined ? wire : { type: IMAGE_REF, ref: img.ref, media_type: img.mediaType }
        }
      })
    }
  return { text: JSON.stringify(result ?? null), images: [] }
}

/** An image_url part from the bytes a resolver gave back for a reference. */
export const wireImage = imagePart
