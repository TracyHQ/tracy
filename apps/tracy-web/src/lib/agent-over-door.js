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
// thinking comes back unsigned. A cancel (signal) is honoured between turns only; a call in flight is never cut.
import {
  CACHE_TTLS,
  costOf,
  providerReason,
  requestBody,
  savedAssistant,
  toolContent,
  totalsOf,
  usageOf
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

const DEFAULTS = {
  maxTokens: 64000,
  effort: 'high',
  cacheTtl: { system: '1h', rolling: '5m' },
  toolImages: 'inline',
  maxTurns: 150,
  callTimeoutMs: 20 * 60_000
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
  ...options
}) {
  const o = { ...DEFAULTS, ...options, cacheTtl: { ...DEFAULTS.cacheTtl, ...options.cacheTtl } }
  if (!CACHE_TTLS.includes(o.cacheTtl.system) || !CACHE_TTLS.includes(o.cacheTtl.rolling))
    throw new AgentError('AGENT_SETTINGS_INVALID', {
      reason: `cache TTL must be one of ${CACHE_TTLS.join(', ')}`
    })
  if (!['inline', 'user-message'].includes(o.toolImages))
    throw new AgentError('AGENT_SETTINGS_INVALID', { reason: 'toolImages must be inline or user-message' })
  if (!door?.baseUrl || !door?.apiKey || !door?.model)
    throw new AgentError('AGENT_SETTINGS_INVALID', { reason: 'the door needs baseUrl, apiKey and model' })

  const turns = history.map((t) => structuredClone(t))
  const { messages, pending: rebuilt, final, resendOf } = rebuild(turns, firstUser)
  const pending = final && followUp ? [{ role: 'user', content: followUp }] : rebuilt
  if (final && !pending) return { answer: final, turns, totals: totalsOf(turns) }
  let next = pending ?? (await runTools(turns.at(-1).message.tool_calls, tools, o.toolImages))

  for (;;) {
    if (signal?.aborted) throw new AgentError('AGENT_ABORTED', { turn: turns.length })
    if (turns.length >= o.maxTurns)
      throw new AgentError('AGENT_TURN_LIMIT', { reason: `${o.maxTurns} model calls` })
    const turn = {
      n: turns.length,
      state: 'dispatched',
      sent: next,
      request: {
        model: door.model,
        maxTokens: o.maxTokens,
        effort: o.effort,
        cacheTtl: o.cacheTtl,
        tools: tools.map((t) => t.name),
        messages: messages.length + next.length + 1
      },
      dispatchedAt: new Date().toISOString(),
      ...(resendOf !== undefined && turns.length === resendOf + 1 ? { resendOf } : {})
    }
    turns.push(turn)
    await onTurn(structuredClone(turn))
    const body = requestBody({ model: door.model, system, messages: [...messages, ...next], tools, ...o })
    const answer = await call(door, body, fetchImpl, o.callTimeoutMs, turn.n).catch(async (error) => {
      Object.assign(turn, {
        state: 'failed',
        error: {
          code: error.code,
          reason: error.reason,
          status: error.status,
          uncertain: error.uncertain === true
        },
        answeredAt: new Date().toISOString()
      })
      await onTurn(structuredClone(turn))
      throw error
    })
    const choice = answer.choices[0]
    Object.assign(turn, {
      state: 'answered',
      message: savedAssistant(choice.message),
      finishReason: choice.finish_reason ?? null,
      generationId: answer.id ?? null,
      providerModel: answer.model ?? null,
      usage: usageOf(answer.usage),
      cost: costOf(answer.usage),
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
    next = await runTools(turn.message.tool_calls, tools, o.toolImages)
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

async function call(door, body, fetchImpl, timeoutMs, n) {
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
    throw new AgentError('AGENT_PROVIDER_HTTP', {
      turn: n,
      status: r.status,
      reason: providerReason(json ?? text)
    })
  if (!json || typeof json !== 'object')
    throw Object.assign(new AgentError('AGENT_PROVIDER_JSON', { turn: n }), { uncertain: true })
  const choice = json.choices?.[0]
  if (json.error || choice?.finish_reason === 'error' || choice?.error)
    throw new AgentError('AGENT_PROVIDER_ERROR', {
      turn: n,
      reason: providerReason(choice?.error ? choice : json)
    })
  const m = choice?.message
  if (!m || typeof m !== 'object' || (m.tool_calls != null && !Array.isArray(m.tool_calls)))
    throw Object.assign(new AgentError('AGENT_MESSAGE_SHAPE', { turn: n }), { uncertain: true })
  return json
}

// One tool message per call, in call order; images go inline or into one user message after them.
async function runTools(calls, tools, toolImages) {
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
    const inline = images.length && toolImages === 'inline'
    out.push({
      role: 'tool',
      tool_call_id: c.id,
      content: inline ? [{ type: 'text', text }, ...images] : text
    })
    if (images.length && !inline)
      later.push({ type: 'text', text: `Images returned by tool call ${c.id} (${tool.name}):` }, ...images)
  }
  if (later.length) out.push({ role: 'user', content: later })
  return out
}
