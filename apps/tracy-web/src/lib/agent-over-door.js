// An agent over a model door: one system prompt, one first user message and a set of tools, looped over an
// OpenAI-compatible /chat/completions endpoint (OpenRouter) until the model gives a final answer. Pure: it knows
// nothing about plans, kits or tables; the caller hands it the door credential, the tools and a place to save turns.
//
// A turn is one model call, saved through onTurn twice: `dispatched` (what is about to be sent) before the call, then
// `answered` (the assistant message, usage, provider cost) or `failed`. The caller must have saved each state before
// the loop goes on, so a process killed at any point loses at most the call in flight. history (the saved turns)
// resumes the conversation:
// - last turn answered with tool calls: its tools run again (tools must be safe to repeat), then the next call goes;
// - last turn answered with a final answer: that answer is returned, nothing is sent; unless the caller gives a
//   followUp, which goes out as the next user message in the same conversation (a fix round);
// - last turn dispatched with no answer, or failed with an uncertain outcome (network, timeout): AGENT_TURN_UNANSWERED.
//   The provider may have answered and charged; the caller decides. To resend it, the caller marks it `abandoned`:
//   an abandoned last turn's messages are sent again as a new turn carrying `resendOf` (its number), and an abandoned
//   turn before the last one is skipped;
// - last turn failed with a provider rejection (HTTP error, error answer): its messages are sent again as the next turn;
// - last turn answered but truncated (AGENT_TRUNCATED) or refused by the model's content filter (AGENT_REFUSED): the
//   same error again, nothing is sent.
// Reasoning details are saved on every assistant message and sent back: Anthropic refuses a tool loop whose earlier
// thinking comes back unsigned, and DeepSeek refuses one whose earlier reasoning is missing (OpenRouter turns the
// details back into the provider's own field). cacheMarkers false sends no cache_control marker (models that cache on
// their own, such as DeepSeek); provider is OpenRouter's provider routing object, sent as is. wire 'deepseek-native'
// talks to DeepSeek's own API (agent-over-door-wire.js): its reasoning_content is saved and sent back the same way.
// price (USD per million tokens) computes each turn's cost from its tokens, for a provider that reports none; such a
// turn carries costSource 'price-table'. A cancel (signal) is honoured between turns only; a call in flight is never cut.
//
// A call that meets a transient provider error (a 429, a 5xx, an overloaded answer, a network error before any
// response) is tried again inside the same turn, up to `retry.attempts` times (agent-over-door-retry.js). The turn
// keeps one dispatched and one answered or failed save; each failed attempt is recorded in its `retries`, and the
// usage and cost a failed attempt reported are added to the turn's own.
//
// Images: a tool may return images with a `ref` (any JSON value naming the image). The saved turn then keeps only
// that reference, never the bytes, and every request carries the full bytes again: an image opened in this process
// is held in memory once, and a reference read back from saved turns (a resume, a fix round) is turned into bytes by
// the caller's resolveImage(ref). A reference that cannot be resolved stops the run with AGENT_IMAGE_UNAVAILABLE
// before the call is dispatched. An image without a ref is saved inline, as it is sent.

import { RETRY_DEFAULTS, retryAfterMs, withRetries } from './agent-over-door-retry.js'
import {
  CACHE_TTLS,
  costOf,
  IMAGE_REF,
  imageRefKey,
  isPriceTable,
  providerReason,
  requestBody,
  savedAssistant,
  toolContent,
  totalsOf,
  usageOf,
  WIRES,
  wireImage
} from './agent-over-door-wire.js'

export class AgentError extends Error {
  constructor(code, { reason = '', status, turn } = {}) {
    super(reason ? `${code}: ${reason}` : code)
    this.name = 'AgentError'
    this.code = code
    this.reason = reason
    if (status !== undefined) this.status = status
    if (turn !== undefined) this.turn = turn
  }
}

/** The output budget of one call: thinking and the answer both count against it (Claude Code runs with the same). */
export const MAX_OUTPUT_TOKENS = 128_000

const DEFAULTS = {
  maxTokens: MAX_OUTPUT_TOKENS,
  effort: 'high',
  cacheTtl: { system: '1h', rolling: '5m' },
  toolImages: 'inline',
  cacheMarkers: true,
  maxTurns: 150,
  callTimeoutMs: 20 * 60_000,
  retry: RETRY_DEFAULTS,
  wire: 'openrouter'
}

export async function runAgent({
  door,
  system,
  firstUser,
  tools = [],
  history = [],
  onTurn = async () => {},
  fetchImpl = fetch,
  signal,
  followUp,
  resolveImage,
  sleep,
  random,
  ...options
}) {
  const o = {
    ...DEFAULTS,
    ...options,
    cacheTtl: { ...DEFAULTS.cacheTtl, ...options.cacheTtl },
    retry: { ...DEFAULTS.retry, ...options.retry }
  }
  if (!CACHE_TTLS.includes(o.cacheTtl.system) || !CACHE_TTLS.includes(o.cacheTtl.rolling))
    throw new AgentError('AGENT_SETTINGS_INVALID', {
      reason: `cache TTL must be one of ${CACHE_TTLS.join(', ')}`
    })
  if (!['inline', 'user-message'].includes(o.toolImages))
    throw new AgentError('AGENT_SETTINGS_INVALID', { reason: 'toolImages must be inline or user-message' })
  if (typeof o.cacheMarkers !== 'boolean')
    throw new AgentError('AGENT_SETTINGS_INVALID', { reason: 'cacheMarkers must be true or false' })
  if (o.provider !== undefined && (o.provider === null || typeof o.provider !== 'object'))
    throw new AgentError('AGENT_SETTINGS_INVALID', { reason: 'provider must be an object' })
  if (!WIRES.includes(o.wire))
    throw new AgentError('AGENT_SETTINGS_INVALID', { reason: `wire must be one of ${WIRES.join(', ')}` })
  if (o.wire === 'deepseek-native' && o.provider !== undefined)
    throw new AgentError('AGENT_SETTINGS_INVALID', {
      reason: 'provider routing is OpenRouter only; the deepseek-native wire sends none'
    })
  if (o.price !== undefined && !isPriceTable(o.price))
    throw new AgentError('AGENT_SETTINGS_INVALID', {
      reason: 'price needs inputCacheHit, inputCacheMiss and output, USD per million tokens'
    })
  if (!door?.baseUrl || !door?.apiKey || !door?.model)
    throw new AgentError('AGENT_SETTINGS_INVALID', { reason: 'the door needs baseUrl, apiKey and model' })

  const turns = history.map((t) => structuredClone(t))
  const images = imageCache(resolveImage)
  const { messages, pending: rebuilt, final, resendOf } = rebuild(turns, firstUser)
  const pending = final && followUp ? [{ role: 'user', content: followUp }] : rebuilt
  if (final && !pending) return { answer: final, turns, totals: totalsOf(turns) }
  let next = pending ?? (await runTools(turns.at(-1).message.tool_calls, tools, o.toolImages, images))

  for (;;) {
    if (signal?.aborted) throw new AgentError('AGENT_ABORTED', { turn: turns.length })
    if (turns.length >= o.maxTurns)
      throw new AgentError('AGENT_TURN_LIMIT', { reason: `${o.maxTurns} model calls` })
    const wire = await images.hydrate([...messages, ...next], turns.length)
    const body = requestBody({ model: door.model, system, messages: wire, tools, ...o })
    const turn = {
      n: turns.length,
      state: 'dispatched',
      sent: next,
      request: {
        model: door.model,
        maxTokens: o.maxTokens,
        effort: o.effort,
        cacheTtl: o.cacheTtl,
        cacheMarkers: o.cacheMarkers,
        toolImages: o.toolImages,
        ...(o.provider ? { provider: o.provider } : {}),
        ...(o.wire !== 'openrouter' ? { wire: o.wire } : {}),
        ...(o.price ? { price: o.price } : {}),
        tools: tools.map((t) => t.name),
        messages: messages.length + next.length + 1
      },
      dispatchedAt: new Date().toISOString(),
      ...(resendOf !== undefined && turns.length === resendOf + 1 ? { resendOf } : {})
    }
    turns.push(turn)
    await onTurn(structuredClone(turn))
    const attempt = () => call(door, body, fetchImpl, o.callTimeoutMs, turn.n, o.price)
    const { answer, retries } = await withRetries(attempt, { policy: o.retry, sleep, random }).catch(
      async (error) => {
        Object.assign(turn, {
          state: 'failed',
          error: {
            code: error.code,
            reason: error.reason,
            status: error.status,
            uncertain: error.uncertain === true,
            attempts: (error.retries?.length ?? 0) + 1
          },
          retries: error.retries ?? [],
          answeredAt: new Date().toISOString()
        })
        await onTurn(structuredClone(turn))
        throw error
      }
    )
    const choice = answer.choices[0]
    Object.assign(turn, {
      state: 'answered',
      message: savedAssistant(choice.message),
      finishReason: choice.finish_reason ?? null,
      generationId: answer.id ?? null,
      providerModel: answer.model ?? null,
      usage: withFailedUsage(usageOf(answer.usage), retries),
      cost: withFailedCost(costOf(answer.usage, o.price), retries),
      ...(o.price ? { costSource: 'price-table' } : {}),
      retries,
      ...(typeof choice.message.refusal === 'string' && choice.message.refusal
        ? { refusal: choice.message.refusal }
        : {}),
      answeredAt: new Date().toISOString()
    })
    await onTurn(structuredClone(turn))
    messages.push(...next, turn.message)
    const outcome = outcomeOf(turn)
    if (outcome.error) throw outcome.error
    if (outcome.final !== undefined) return { answer: outcome.final, turns, totals: totalsOf(turns) }
    next = await runTools(turn.message.tool_calls, tools, o.toolImages, images)
  }
}

// The bytes behind image references: those opened in this process, then those resolveImage reads back. Each
// distinct image is read once per runAgent call, so a long conversation costs one read per image, not per request.
function imageCache(resolveImage) {
  const known = new Map()
  const wireOf = async (part, n) => {
    const key = imageRefKey(part.ref)
    if (!known.has(key)) {
      const got = resolveImage ? await resolveImage(part.ref) : null
      if (!got?.base64 || !got?.mediaType)
        throw new AgentError('AGENT_IMAGE_UNAVAILABLE', {
          turn: n,
          reason: `the saved conversation names an image that cannot be read again: ${key.slice(0, 200)}`
        })
      known.set(key, wireImage(got))
    }
    return known.get(key)
  }
  return {
    remember: (stored, wire) => {
      if (stored.type === IMAGE_REF) known.set(imageRefKey(stored.ref), wire)
    },
    /** The messages as they are sent: every image reference replaced by its image_url part. */
    async hydrate(messages, n) {
      const out = []
      for (const m of messages) {
        if (!Array.isArray(m.content) || !m.content.some((p) => p?.type === IMAGE_REF)) {
          out.push(m)
          continue
        }
        const content = []
        // eslint-disable-next-line no-await-in-loop -- one image at a time, each read at most once.
        for (const p of m.content) content.push(p?.type === IMAGE_REF ? await wireOf(p, n) : p)
        out.push({ ...m, content })
      }
      return out
    }
  }
}

// The conversation so far from saved turns, and what to do next (see the header).
function rebuild(turns, firstUser) {
  const messages = []
  if (!turns.length) return { messages, pending: [{ role: 'user', content: firstUser }] }
  turns.forEach((t, i) => {
    const last = i === turns.length - 1
    if (t.state === 'answered') messages.push(...t.sent, t.message)
    else if (!last && (t.state === 'failed' || t.state === 'abandoned')) return
    else if (t.state === 'abandoned') return
    else if (t.state === 'dispatched' || t.error?.uncertain || !last)
      throw new AgentError('AGENT_TURN_UNANSWERED', {
        turn: t.n,
        reason: `turn ${t.n} was sent and has no answer; the provider may have answered it`
      })
  })
  const last = turns.at(-1)
  if (last.state === 'abandoned') return { messages, pending: last.sent, resendOf: last.n }
  if (last.state === 'failed') return { messages, pending: last.sent }
  const outcome = outcomeOf(last)
  if (outcome.error) throw outcome.error
  return { messages, final: outcome.final }
}

function outcomeOf(turn) {
  if (turn.finishReason === 'length')
    return { error: new AgentError('AGENT_TRUNCATED', { turn: turn.n, reason: 'the answer hit max_tokens' }) }
  // A refusal (content filter) arrives as HTTP 200 with no content: say so, never report it as an empty answer.
  if (turn.refusal || turn.finishReason === 'content_filter')
    return {
      error: new AgentError('AGENT_REFUSED', {
        turn: turn.n,
        reason: (turn.refusal || 'the provider filtered the answer').slice(0, 300)
      })
    }
  if (turn.message.tool_calls?.length) return {}
  const text = typeof turn.message.content === 'string' ? turn.message.content.trim() : ''
  if (!text) return { error: new AgentError('AGENT_EMPTY_ANSWER', { turn: turn.n }) }
  return { final: text }
}

// What a failed attempt reported it used (a 200 body carrying an error may say), added to the answer's own.
function withFailedUsage(usage, retries) {
  for (const r of retries) {
    if (!r.usage) continue
    const failed = usageOf(r.usage)
    for (const k of Object.keys(usage)) usage[k] += failed[k]
  }
  return usage
}

function withFailedCost(cost, retries) {
  const failed = retries.map((r) => r.cost).filter((c) => typeof c === 'number')
  if (!failed.length) return cost
  return Math.round(failed.reduce((sum, c) => sum + c, cost ?? 0) * 1e9) / 1e9
}

async function call(door, body, fetchImpl, timeoutMs, n, price) {
  let r
  try {
    r = await fetchImpl(`${door.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${door.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch (error) {
    const timeout = error?.name === 'TimeoutError'
    throw Object.assign(
      new AgentError(timeout ? 'AGENT_TIMEOUT' : 'AGENT_NETWORK', {
        turn: n,
        reason: String(error?.message ?? error)
      }),
      { uncertain: true }
    )
  }
  const text = await r.text().catch(() => '')
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  if (!r.ok)
    throw Object.assign(
      new AgentError('AGENT_PROVIDER_HTTP', {
        turn: n,
        status: r.status,
        reason: providerReason(json ?? text)
      }),
      { retryAfterMs: retryAfterMs(r.headers?.get?.('retry-after')) }
    )
  // A 200 whose body is not JSON: DeepSeek cuts the body while it is overloaded. Retried (agent-over-door-retry.js);
  // the head of the raw body is kept so the cause can be read.
  if (!json || typeof json !== 'object')
    throw Object.assign(
      new AgentError('AGENT_PROVIDER_JSON', { turn: n, reason: `not JSON: ${providerReason(text)}` }),
      { uncertain: true }
    )
  const choice = json.choices?.[0]
  if (json.error || choice?.finish_reason === 'error' || choice?.error) {
    const source = choice?.error ? choice : json
    throw Object.assign(new AgentError('AGENT_PROVIDER_ERROR', { turn: n, reason: providerReason(source) }), {
      providerCode: source.error?.code,
      retryAfterMs: retryAfterMs(r.headers?.get?.('retry-after')),
      ...(json.usage ? { usage: json.usage, cost: costOf(json.usage, price) } : {})
    })
  }
  const m = choice?.message
  if (!m || typeof m !== 'object' || (m.tool_calls != null && !Array.isArray(m.tool_calls)))
    throw Object.assign(new AgentError('AGENT_MESSAGE_SHAPE', { turn: n }), { uncertain: true })
  return json
}

// One tool message per call, in call order; images go inline or into one user message after them.
async function runTools(calls, tools, toolImages, cache) {
  const out = []
  const later = []
  for (const c of calls) {
    const tool = tools.find((t) => t.name === c?.function?.name)
    let result
    if (!tool) result = JSON.stringify({ error: 'UNKNOWN_TOOL', tool: String(c?.function?.name ?? '') })
    else {
      let args
      try {
        args = c.function.arguments ? JSON.parse(c.function.arguments) : {}
      } catch {
        args = undefined
      }
      if (!args || typeof args !== 'object' || Array.isArray(args))
        result = JSON.stringify({ error: 'INVALID_ARGUMENTS', tool: tool.name })
      else
        result = await Promise.resolve()
          .then(() => tool.run(args))
          .catch((e) =>
            JSON.stringify({ error: 'TOOL_FAILED', tool: tool.name, detail: String(e?.message ?? e) })
          )
    }
    const { text, images } = toolContent(result)
    for (const image of images) cache.remember(image.stored, image.wire)
    const stored = images.map((image) => image.stored)
    const inline = stored.length && toolImages === 'inline'
    out.push({
      role: 'tool',
      tool_call_id: c.id,
      content: inline ? [{ type: 'text', text }, ...stored] : text
    })
    if (stored.length && !inline)
      later.push({ type: 'text', text: `Images returned by tool call ${c.id} (${tool.name}):` }, ...stored)
  }
  if (later.length) out.push({ role: 'user', content: later })
  return out
}
