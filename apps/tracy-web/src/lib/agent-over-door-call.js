// One model call of agent-over-door.js: the POST to /chat/completions and the answer read back, as the unstreamed
// JSON body whether the wire streams or not (agent-over-door-stream.js), or an AgentError.
//
// Two clocks. The total call timeout (callTimeoutMs) bounds the whole call. A streamed call also has an idle timeout
// (idleMs): no byte at all, data or keep-alive, for that long, and the call is cut and raised as AGENT_TIMEOUT, which
// the retry module tries again. A provider that is still writing sends tokens; one that is still queueing the request
// sends keep-alive comments (DeepSeek's docs say so for streamed requests); silence means the connection hung, and
// without this clock a hung call would only end at the total timeout, 45 minutes later on the bench.
// While a streamed call reads, `progress` is told every progressMs what has arrived so far (characters of content,
// reasoning and tool arguments, and the time of the last byte), so a caller can show "still writing" apart from "hung".

import { retryAfterMs } from './agent-over-door-retry.js'
import { readStream, streamAssembly } from './agent-over-door-stream.js'
import { costOf, providerReason } from './agent-over-door-wire.js'

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

const uncertain = (code, n, reason) =>
  Object.assign(new AgentError(code, { turn: n, reason }), { uncertain: true })

/**
 * @param {{ baseUrl: string, apiKey: string }} door
 * @param {object} body the request body; `stream: true` makes it a streamed call
 * @param {{ fetchImpl: typeof fetch, callTimeoutMs: number, idleMs: number, progressMs: number, n: number,
 *   price?: object, progress?: (p: object) => void, signal?: AbortSignal }} options
 */
export async function callModel(
  door,
  body,
  { fetchImpl, callTimeoutMs, idleMs, progressMs, n, price, progress, signal }
) {
  const streamed = body.stream === true
  const total = AbortSignal.timeout(callTimeoutMs)
  const idle = new AbortController()
  let idleTimer
  let lastByteAt = Date.now()
  const touch = () => {
    lastByteAt = Date.now()
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => idle.abort(), idleMs)
  }
  const failure = (error) => {
    if (signal?.aborted)
      return uncertain('AGENT_ABORTED', n, 'the call was stopped; the provider may already have charged')
    if (idle.signal.aborted)
      return uncertain(
        'AGENT_TIMEOUT',
        n,
        `no byte from the provider for ${Math.round(idleMs / 1000)} s (idle timeout)`
      )
    const timeout = error?.name === 'TimeoutError' || total.aborted
    return uncertain(timeout ? 'AGENT_TIMEOUT' : 'AGENT_NETWORK', n, String(error?.message ?? error))
  }
  if (streamed) touch()
  let ticker
  try {
    let r
    try {
      r = await fetchImpl(`${door.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${door.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([total, ...(streamed ? [idle.signal] : []), ...(signal ? [signal] : [])])
      })
    } catch (error) {
      throw failure(error)
    }
    if (signal?.aborted) throw failure()
    if (streamed) touch()
    const eventStream = /text\/event-stream/i.test(r.headers?.get?.('content-type') ?? '')
    let json = null
    let text = ''
    if (r.ok && streamed && eventStream && r.body) {
      const assembly = streamAssembly()
      if (progress)
        ticker = setInterval(
          () => progress({ ...assembly.progress(), lastByteAt: new Date(lastByteAt).toISOString() }),
          progressMs
        )
      let read
      try {
        read = await readStream(r.body, { onBytes: touch, assembly })
      } catch (error) {
        throw failure(error)
      }
      if (read.broken)
        throw uncertain(
          read.broken.startsWith('an event') ? 'AGENT_PROVIDER_JSON' : 'AGENT_NETWORK',
          n,
          read.broken
        )
      json = read.json
    } else {
      // Unstreamed (or a provider that answered a streamed request with one JSON body): read whole; on a streamed
      // call every chunk still counts as a byte for the idle clock.
      text = await (streamed && r.body ? textOf(r.body, touch) : r.text()).catch((error) => {
        if (signal?.aborted || idle.signal.aborted || total.aborted) throw failure(error)
        return ''
      })
      if (signal?.aborted || idle.signal.aborted) throw failure()
      try {
        json = JSON.parse(text)
      } catch {}
    }
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
      throw uncertain('AGENT_PROVIDER_JSON', n, `not JSON: ${providerReason(text)}`)
    const choice = json.choices?.[0]
    if (json.error || choice?.finish_reason === 'error' || choice?.error) {
      const source = choice?.error ? choice : json
      throw Object.assign(
        new AgentError('AGENT_PROVIDER_ERROR', { turn: n, reason: providerReason(source) }),
        {
          providerCode: source.error?.code,
          retryAfterMs: retryAfterMs(r.headers?.get?.('retry-after')),
          ...(json.usage ? { usage: json.usage, cost: costOf(json.usage, price) } : {})
        }
      )
    }
    const m = choice?.message
    if (!m || typeof m !== 'object' || (m.tool_calls != null && !Array.isArray(m.tool_calls)))
      throw uncertain('AGENT_MESSAGE_SHAPE', n, '')
    return json
  } finally {
    clearTimeout(idleTimer)
    clearInterval(ticker)
  }
}

async function textOf(body, onBytes) {
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of body) {
    onBytes()
    text += decoder.decode(chunk, { stream: true })
  }
  return text + decoder.decode()
}
