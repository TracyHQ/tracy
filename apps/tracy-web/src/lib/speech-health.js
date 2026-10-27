/**
 * Whether the speech service takes this deployment's key — one record per process, fed by the probes
 * (`speech/health.js`), every session the relay opens (`speech/relay.js`) and every reading
 * (`speech/say.js`); read by `GET /api/speech` and /ops › Agents › Voice. Kept in `lib/` so the speech
 * and ops domains share it.
 *
 * WHAT COUNTS (council 18/10/2026). The service's own word for a failure decides, never the HTTP
 * status alone: measured 18/10/2026, a made-up key gets 400 `invalid_api_key` from text to speech (not
 * 401), no key 401 `needs_authorization`, and the realtime socket an `auth_error` message. Only the key
 * refused, or a permission it lacks, is `refused` — that hides the microphone or Voice. Credits used up
 * or the account held back is `limited`: shown on /ops, never hiding anything, and a one-character
 * probe getting through does not clear what real readings met. A busy service, or a status with no
 * word of the service's, says nothing of the key.
 *
 * WHICH KEY. Every save of a key starts a new generation (`reset`); a result carries the generation it
 * was got under, and one from an older key — a probe still running, a session opened before the save —
 * is dropped, so it can never hide voice the new key would serve.
 */

/**
 * @typedef {'ok' | 'refused' | 'limited' | 'unavailable'} Outcome
 * @typedef {{ outcome: Outcome, at: number, reason: string | null }} Part
 * @typedef {{ stt: Part | null, tts: Part | null }} Health
 */

/** The service's words for a key it refuses, or a permission the key lacks for that part. */
const REFUSED = new Set([
  'invalid_api_key',
  'needs_authorization',
  'unauthorized',
  'invalid_authorization',
  'auth_error',
  'missing_permissions'
])

/**
 * The service's words for an account held back until someone acts: credits used up, unusual activity,
 * payment. Too many at once or a busy service pass by themselves and say nothing (null).
 */
const LIMITED = new Set(['quota_exceeded', 'detected_unusual_activity', 'payment_required'])

/** How long a limit met by real use stands against a probe that gets through (one character is cheap). */
export const LIMITED_HOLD_MS = 10 * 60_000

/**
 * What a failure says about the key, from the service's own word (`detail.status` of an HTTP answer,
 * `message_type` of a socket message) and its type: refused, limited, or nothing known (null).
 * @param {unknown} word
 * @param {unknown} [type] - `detail.type` (`authentication_error`)
 * @returns {Exclude<Outcome, 'ok'> | null}
 */
export function failureOf(word, type) {
  if (type === 'authentication_error') return 'refused'
  if (typeof word !== 'string') return null
  if (REFUSED.has(word)) return 'refused'
  if (LIMITED.has(word)) return 'limited'
  return null
}

/**
 * The service's own word in an HTTP answer's JSON body (`{ detail: { status, type } }`), never its
 * message, which may quote the request.
 * @param {unknown} body
 * @returns {{ word: string | null, type: string | null }}
 */
export function wordOf(body) {
  const detail = /** @type {{ detail?: { status?: unknown, type?: unknown } } | null} */ (body)?.detail
  return {
    word: typeof detail?.status === 'string' ? detail.status : null,
    type: typeof detail?.type === 'string' ? detail.type : null
  }
}

/**
 * One process's record of whether the service takes the key.
 * @param {() => number} [now]
 */
export function createSpeechHealth(now = Date.now) {
  /** @type {Health} */
  let record = { stt: null, tts: null }
  let generation = 0
  let revision = null
  /** @type {(() => void) | null} */
  let kicker = null
  return {
    /** @returns {Health} */
    get: () => record,
    /** The key's generation now: read before using the key, and given back with what it met. */
    generation: () => generation,
    bind(next) {
      if (next !== revision) {
        revision = next
        generation += 1
        record = { stt: null, tts: null }
      }
    },
    revision: () => revision,
    /**
     * @param {'stt' | 'tts'} part
     * @param {Outcome} outcome
     * @param {string | null} [reason] - the service's own word (`missing_permissions`, `quota_exceeded`)
     * @param {{ generation?: number, probe?: boolean, revision?: string | number | null } | string | number | null} [from] - the key's generation when it was used
     *   (an older one is dropped); `probe`: a one-character try, which does not clear a limit real use met
     */
    note(part, outcome, reason = null, from = {}) {
      if (typeof from === 'string' || typeof from === 'number' || from === null) from = { revision: from }
      if (from.revision !== undefined && from.revision !== revision) return
      if (from.generation !== undefined && from.generation !== generation) return
      const was = record[part]
      if (from.probe && outcome === 'ok' && was?.outcome === 'limited' && now() - was.at < LIMITED_HOLD_MS)
        return
      record = { ...record, [part]: { outcome, at: now(), reason: outcome === 'ok' ? null : reason } }
    },
    /** @param {'stt' | 'tts'} part */
    refused: (part, expected = revision) =>
      expected === revision && ['refused', 'unavailable'].includes(record[part]?.outcome),
    /** Try the key again soon (a key was just saved). */
    kick: () => kicker?.(),
    /** @param {(() => void) | null} fn */
    onKick(fn) {
      kicker = fn
    },
    /** Forget everything: a new key, a new generation. */
    reset() {
      generation += 1
      record = { stt: null, tts: null }
    }
  }
}

/** This process's record. */
export const speechHealth = createSpeechHealth()
