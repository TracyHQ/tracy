/**
 * HOW LONG A VOICE TURN TOOK, AS THE PAGE HEARD IT (council 19/10/2026). For each phrase Voice sends,
 * `voice-mode.mjs` marks the moments on the page's own clock (`performance.now()`): the person's last
 * loud frame, the service confirming the phrase, the message sent, Tracy's "got it" starting to play
 * and its reply starting to play (when the player scheduled the first sound, `voice-player.ts`). Only
 * the spans between two marks of that one clock leave the page — never a time of the browser set
 * against the server's — with three flags; no words, nothing that names the person
 * (`POST /api/speech/trace`, `apps/tracy-web/src/speech/trace.js`). The headline span is the end of
 * speech to the start of the reply's sound.
 *
 * Sent with a fetch once the turn is done with (`keepalive`, so a page closing still sends it), and by
 * `sendBeacon` when that fetch cannot go; the server keeps one record per {@link traceId}, so both
 * arriving costs nothing. Never in the person's way: no answer is awaited, a failure is dropped.
 *
 * Kept free of React so `test/voice-trace.test.mjs` can hold it.
 */

export const TRACE_PATH = '/api/speech/trace'

/**
 * The spans sent, in milliseconds, each between two marks of the page's clock: end of speech → the
 * phrase confirmed → the message sent → the "got it" heard, and → the reply heard; and end of speech →
 * the reply heard, the one a person feels.
 */
export const TRACE_SPANS = Object.freeze([
  'speechToCommit',
  'commitToSent',
  'sentToAck',
  'sentToReply',
  'speechToReply'
])

/**
 * The flags, 0 or 1: the "got it" played from the page's copy (no reading to wait for); the turn
 * failed (not sent, a failed turn, a reply that could not be read); the turn was cut off before its
 * reply was heard (the person spoke again, stopped the work, paused or left Voice); the message went
 * by a press (Send now), so its spans hold the person's own pause.
 */
export const TRACE_FLAGS = Object.freeze(['ackCached', 'error', 'interrupted', 'pressed'])

/**
 * @typedef {{
 *   id: string,
 *   speechEnd: number | null,
 *   commit: number | null,
 *   sent: number | null,
 *   ack: number | null,
 *   ackCached: boolean,
 *   reply: number | null,
 *   replyLine: string | null,
 *   error: boolean,
 *   interrupted: boolean,
 *   pressed: boolean
 * }} TraceMarks
 *   The marks of one sent voice turn, on the page's clock; null until reached.
 */

/** A turn's id, drawn by the page: the server keeps one record per id. @returns {string} */
export function traceId() {
  const crypto = globalThis.crypto
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * The record sent for one turn: its id, each span both of whose marks were reached (and in order),
 * and the flags as 0 or 1.
 * @param {TraceMarks} t
 * @returns {Record<string, string | number>}
 */
export function traceRecord(t) {
  /** @param {number | null} from @param {number | null} to */
  const span = (from, to) =>
    from !== null && to !== null && Number.isFinite(from) && Number.isFinite(to) && to >= from
      ? Math.round(to - from)
      : null
  /** @type {Record<string, string | number>} */
  const out = { id: t.id }
  const spans = {
    speechToCommit: span(t.speechEnd, t.commit),
    commitToSent: span(t.commit, t.sent),
    sentToAck: span(t.sent, t.ack),
    sentToReply: span(t.sent, t.reply),
    speechToReply: span(t.speechEnd, t.reply)
  }
  for (const name of TRACE_SPANS) {
    const value = spans[/** @type {keyof typeof spans} */ (name)]
    if (value !== null) out[name] = value
  }
  out.ackCached = t.ack !== null && t.ackCached ? 1 : 0
  out.error = t.error ? 1 : 0
  out.interrupted = t.interrupted && !t.error ? 1 : 0
  out.pressed = t.pressed ? 1 : 0
  return out
}

/**
 * Send one record: a fetch that outlives the page (`keepalive`), else `sendBeacon` (a string body, so
 * the browser takes it: `text/plain`, which the door reads too). Never throws, never waits.
 * @param {Record<string, string | number>} record
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   beacon?: ((url: string, body: string) => boolean) | null,
 *   path?: string
 * }} [deps]
 */
export function sendTrace(record, { fetchImpl = globalThis.fetch, beacon, path = TRACE_PATH } = {}) {
  const body = JSON.stringify(record)
  const byBeacon = () => {
    try {
      const send =
        beacon === undefined
          ? typeof globalThis.navigator?.sendBeacon === 'function'
            ? (/** @type {string} */ url, /** @type {string} */ data) =>
                globalThis.navigator.sendBeacon(url, data)
            : null
          : beacon
      send?.(path, body)
    } catch {
      // Nothing to report it with: the trace is dropped.
    }
  }
  try {
    if (typeof fetchImpl !== 'function') return byBeacon()
    void fetchImpl(path, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body
    }).catch(byBeacon)
  } catch {
    byBeacon()
  }
}
