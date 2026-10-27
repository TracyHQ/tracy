/**
 * How long a voice turn took, as the page heard it (council 19/10/2026; `@tracy/dsh-chat-input`
 * `voice-trace.mjs`): the Voice page reports each phrase it sent once the turn is done with, and this
 * door keeps it as one `ops_signal` row of kind `voice.turn` for /ops › Agents › Voice
 * (`lib/voice-trace.js`).
 *
 *   POST /api/speech/trace  {id, speechToCommit?, commitToSent?, sentToAck?, sentToReply?,
 *                            speechToReply?, ackCached?, error?, interrupted?, pressed?}
 *     → 200 {ok: true}            kept, or already kept under this id
 *     → 400 INVALID_TRACE | INVALID_TRACE_ID
 *     → 401 NOT_SIGNED_IN
 *     → 413 TRACE_TOO_LARGE       more than `VOICE_TRACE_MAX_BYTES`
 *     → 429 RATE_LIMITED          more than `VOICE_TRACES_PER_HOUR` this hour, or the count failed
 *
 * WHAT IT HOLDS TO:
 *   - a signed-in person, from Tracy's own page: the cross-site guard in front of every door
 *     (`lib/csrf.js`) refuses another origin. The body is JSON, or the same JSON as `text/plain` —
 *     what `navigator.sendBeacon` sends when the page's fetch cannot go;
 *   - numbers only: each span a finite number of milliseconds, each flag 0 or 1, every other field
 *     ignored (`parseVoiceTrace`). No words come, none are kept, and no address but the account the
 *     row is recorded under (staff are left out on /ops by it);
 *   - one row per account and turn id the page drew: a fetch and a beacon both arriving keep one;
 *   - small and counted: the body read up to `VOICE_TRACE_MAX_BYTES`, and `VOICE_TRACES_PER_HOUR` an
 *     account, fail closed — a lost report costs a number, never a door left open.
 */
import { json, requireViewer } from '../lib/http.js'
import { opsFor } from '../lib/ops-signal.js'
import { memoryRateLimiter, overLimitOrClosed } from '../lib/rate.js'
import { parseVoiceTrace, VOICE_TRACE_MAX_BYTES, VOICE_TRACES_PER_HOUR } from '../lib/voice-trace.js'

export const TRACE_PATH = '/api/speech/trace'
const HOUR_MS = 3_600_000

/**
 * The body as text, read no further than `max` bytes: null past that. A body sent without a length
 * (chunked) is cut off where it outgrows a report, never held whole.
 * @param {Request} request @param {number} max
 * @returns {Promise<string | null>}
 */
async function readCapped(request, max) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  /** @type {Uint8Array[]} */
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Mount `POST /api/speech/trace` on `app`.
 * @param {import('hono').Hono} app
 * @param {{
 *   config: { sessionSecret: string },
 *   pool: { query: Function } | null,
 *   signals?: { record: (kind: string, event: object) => Promise<unknown> },
 *   now?: () => number
 * }} deps - `signals`: where the row goes (`lib/ops-signal.js`; tests hand in their own).
 */
export function mountTrace(app, { config, pool, signals = opsFor(pool), now = Date.now }) {
  const memory = memoryRateLimiter()
  const over = (bucket) =>
    pool
      ? overLimitOrClosed(pool, bucket, VOICE_TRACES_PER_HOUR, now(), HOUR_MS)
      : Promise.resolve(memory.overLimit(bucket, VOICE_TRACES_PER_HOUR, now(), HOUR_MS))

  app.post(TRACE_PATH, async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    c.header('cache-control', 'no-store')
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > VOICE_TRACE_MAX_BYTES) return json(c, { code: 'TRACE_TOO_LARGE' }, 413)
    const text = await readCapped(c.req.raw, VOICE_TRACE_MAX_BYTES).catch(() => '')
    if (text === null) return json(c, { code: 'TRACE_TOO_LARGE' }, 413)
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      // Not JSON: refused below like any other shape.
    }
    const trace = parseVoiceTrace(body)
    if (!trace.ok) return json(c, { code: trace.code }, 400)
    if (await over(`voice-trace:${email.toLowerCase()}`)) return json(c, { code: 'RATE_LIMITED' }, 429)
    await signals.record('voice.turn', {
      email,
      data: trace.data,
      // Under the account too: a turn id is the page's, and another account's page could send the same one.
      dedupeKey: `voice.turn:${email.toLowerCase()}:${trace.id}`
    })
    return json(c, { ok: true })
  })
}
