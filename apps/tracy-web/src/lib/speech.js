/**
 * Voice input's facts, shared by the doors that need them: the chat box's door and socket
 * (`speech/route.js`, `speech/relay.js`) and the operators' screen (`ops/speech.js`, /ops › Agents ›
 * Voice). In lib/ because a domain may not import a sibling domain (`test/module-graph.test.mjs`).
 *
 * 🔒 ONE SWITCH, READ BY THE SERVER TOO. Voice is on or off with the User Interface switch
 * `composer-voice-input` (catalogue `@tracy/core/ui-switches`), pressed from /ops › Agents › Voice or
 * /ops › User Interface — the same `PUT /api/ops/ui`. The chat box reads it to draw its microphone;
 * the doors read it to answer: off, `GET /api/speech` says unavailable and the socket refuses every
 * session (15/10/2026: off means off, not a hidden button over an open door).
 *
 * 🔒 THE KEY IS TYPED ON /ops, NOT SET IN THE ENVIRONMENT (15/10/2026). /ops › Agents › Voice
 * saves the speech key sealed in `speech_setting` (`lib/secret-box.js`, the box Model & AI keys go
 * in). `SPEECH_TO_TEXT_API_KEY` in tracy-web's environment is only the fallback while nothing is
 * saved there, so a server already set up that way keeps working. Two reads, as in `llm-store.js`:
 * `readSpeechKey` answers a request about to be made and returns the key; `speechKeyFacts` answers
 * a screen and never does.
 */
import { hintFor, openSecret, sealSecret } from './secret-box.js'
import { UI_CATALOGUE, uiSwitchOn } from './ui-setting.js'

export const SPEECH_SWITCH = 'composer-voice-input'
export const DAY_MS = 86_400_000
const SAMPLE_BYTES_PER_SECOND = 32_000

/** The relay's limits; the chat box shows two of them, /ops shows all. */
export const SPEECH_LIMITS = Object.freeze({
  sessionSeconds: 300,
  silenceSeconds: 30,
  accountMinutesPerDay: 60,
  totalMinutesPerDay: 1000,
  /** One frame: one second of 16 kHz 16-bit PCM. */
  frameBytes: SAMPLE_BYTES_PER_SECOND,
  queuedSeconds: 5,
  /** How long `stop` waits for the phrase still being spoken to be confirmed. */
  settleMs: 3000
})

/** Who turns voice into words, as /ops names it. */
export const SPEECH_SERVICE = Object.freeze({ provider: 'ElevenLabs', model: 'scribe_v2_realtime' })

/**
 * VOICE CONVERSATION (`speech/say.js`, `@tracy/dsh-chat-input` `voice-mode.mjs`): the customer talks,
 * the words are sent when they stop, and Tracy's reply is read out loud. It follows the ONE voice
 * switch above (16/10/2026: "follows the voice mode switch" on /ops › Agents › Voice): on, the
 * chat's header offers it wherever the microphone shows; off, `POST /api/speech/say` refuses too.
 * The words come through the relay; the reading needs the key's Text to Speech permission.
 */

/**
 * Who turns Tracy's reply into speech. Flash v2.5, measured 16/10/2026 with this deployment's key on
 * a 133-character Vietnamese reply: first sound after 195 ms (median of 5; Turbo v2.5 328 ms), and the
 * sound transcribed back by Scribe as well as Turbo's (word error 6.5% on both, the same two tone
 * marks). Raw 16-bit little-endian mono PCM, so the page plays it as it comes in.
 */
export const SPEAK_SERVICE = Object.freeze({
  provider: 'ElevenLabs',
  model: 'eleven_flash_v2_5',
  format: 'pcm_24000',
  sampleRate: 24_000
})

/**
 * What one spoken reply and one day may cost. The service bills per character (Flash: half a
 * credit each); the chat box says only the start of a reply (`voice-speak-text.mjs`), so `maxChars`
 * caps one reading at about forty seconds of speech.
 */
export const SPEAK_LIMITS = Object.freeze({
  maxChars: 600,
  accountCharsPerDay: 20_000,
  totalCharsPerDay: 300_000
})

/**
 * ANONYMOUS WIDGET VISITORS (`widget/route.js`, council 19/10/2026, a small pilot). Each visitor speaks
 * under its own identity, `widget-guest+<hex16>@widget.invalid`, which the host derives from the
 * visitor and never takes from the browser: one visitor can no longer spend another's day or end its
 * session (`elsewhere`), as the single shared guest did. A visitor's day is far smaller than a
 * person's, and every anonymous visitor together is also charged to one bucket (`bucket`), held under
 * its own cap and never above half the deployment's day, so a script forging the widget's Origin can
 * empty neither. Per address: `liveSessionsPerAddress` sessions at once, and session starts in a burst
 * of `startsPerMinute`, then on average two a minute (`startsPerTenMinutes`, fixed `rate_bucket` windows).
 */
export const ANONYMOUS_SPEECH = Object.freeze({
  bucket: 'widget-anonymous',
  visitorSecondsPerDay: 3 * 60,
  totalSecondsPerDay: Math.min(30 * 60, (SPEECH_LIMITS.totalMinutesPerDay * 60) / 2),
  visitorCharsPerDay: 2_000,
  totalCharsPerDay: Math.min(10_000, SPEAK_LIMITS.totalCharsPerDay / 2),
  liveSessionsPerAddress: 2,
  startsPerMinute: 3,
  startsPerTenMinutes: 20
})

/** Whether `email` is an anonymous widget visitor's identity (`.invalid` never receives a sign-in code). */
export function isAnonymousSpeech(email) {
  return typeof email === 'string' && email.toLowerCase().endsWith('@widget.invalid')
}

/**
 * The voices a customer may pick, from the service's default voices. Each id answered with sound with
 * this deployment's key on 16/10/2026; the key may not read the voice list (no `voices_read`), so the
 * list is kept here, not asked for. A voice from the paid library (Aria) was refused on that key and
 * is not offered. The first is the default.
 */
export const SPEAK_VOICES = Object.freeze([
  Object.freeze({ id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' }),
  Object.freeze({ id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica' }),
  Object.freeze({ id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' }),
  Object.freeze({ id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' }),
  Object.freeze({ id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' }),
  Object.freeze({ id: 'cjVigY5qzO86Huf0OWal', name: 'Eric' })
])

/**
 * Languages the service is told a reply is in (`language_code`): the interface languages, each one
 * Flash v2.5 enforces. Any other reply is read with no code, as the service hears the text.
 */
export const SPEAK_LANGUAGES = Object.freeze(new Set(['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es']))

const DEFAULT_ON = UI_CATALOGUE.switches.find((s) => s.id === SPEECH_SWITCH)?.defaultOn ?? false

/**
 * Whether the operator has voice on. No pool (a laptop on the memory store): the catalogue default.
 * A database that cannot be read THROWS (`uiSwitchOn`): a door asking must refuse rather than open
 * what the operator may have closed.
 * @param {{ query: Function } | null} pool
 * @returns {Promise<boolean>}
 */
export async function speechSwitchOn(pool) {
  if (!pool) return DEFAULT_ON
  return uiSwitchOn(pool, SPEECH_SWITCH)
}

/**
 * Characters read out loud today (the `speak-chars` buckets of `rate_bucket`, UTC days) on this
 * deployment, and by how many accounts.
 * @param {{ query: Function }} pool
 * @param {number} [now]
 * @returns {Promise<{ day: string, chars: number, accounts: number }>}
 */
export async function speakUsageToday(pool, now = Date.now()) {
  const windowStart = new Date(Math.floor(now / DAY_MS) * DAY_MS)
  // The anonymous visitors' shared bucket (`ANONYMOUS_SPEECH`) is not an account.
  const { rows } = await pool.query(
    `select coalesce(sum(count) filter (where bucket = 'speak-chars'), 0)::int as chars,
            (count(*) filter (where bucket like 'speak-chars:%' and bucket <> $2 and count > 0))::int as accounts
       from rate_bucket
      where window_start = $1 and (bucket = 'speak-chars' or bucket like 'speak-chars:%')`,
    [windowStart, `speak-chars:${ANONYMOUS_SPEECH.bucket}`]
  )
  return {
    day: windowStart.toISOString().slice(0, 10),
    chars: rows[0]?.chars ?? 0,
    accounts: rows[0]?.accounts ?? 0
  }
}

/**
 * Today's use, in the windows the budget counts in (`rate_bucket`, UTC days): minutes of audio on
 * this deployment (counted in seconds, `speech/relay.js`; shown to the next whole minute), and how
 * many accounts spoke.
 * @param {{ query: Function }} pool
 * @param {number} [now]
 * @returns {Promise<{ day: string, minutes: number, seconds: number, accounts: number }>}
 */
export async function speechUsageToday(pool, now = Date.now()) {
  const windowStart = new Date(Math.floor(now / DAY_MS) * DAY_MS)
  const { rows } = await pool.query(
    `select coalesce(sum(count) filter (where bucket = 'speech-seconds'), 0)::int as seconds,
            (count(*) filter (where bucket like 'speech-seconds:%' and bucket <> $2))::int as accounts
       from rate_bucket
      where window_start = $1 and (bucket = 'speech-seconds' or bucket like 'speech-seconds:%')`,
    [windowStart, `speech-seconds:${ANONYMOUS_SPEECH.bucket}`]
  )
  const seconds = rows[0]?.seconds ?? 0
  return {
    day: windowStart.toISOString().slice(0, 10),
    minutes: Math.ceil(seconds / 60),
    seconds,
    accounts: rows[0]?.accounts ?? 0
  }
}

/** The longest speech key accepted; ElevenLabs keys are a few dozen characters. */
const KEY_MAX = 200

/**
 * The key a voice session uses, and where it came from. A saved key this process cannot open
 * (SESSION_SECRET rotated, a tampered row) is `unreadable` and not used; the environment's then
 * stands in, if any. A database that cannot be read THROWS: the caller refuses for now.
 * @param {{ query: Function } | null} pool
 * @param {{ sessionSecret: string, speech?: { apiKey: string } | null }} config
 * @returns {Promise<{ key: string | null, source: 'ops' | 'env' | null, unreadable: boolean, updatedBy: string | null, updatedAt: string | null }>}
 */
export async function readSpeechKey(pool, config) {
  const env = config.speech?.apiKey ?? null
  let row = null
  if (pool)
    row = (await pool.query('select api_key_cipher, updated_by, updated_at from speech_setting where id'))
      .rows[0]
  const saved = row?.api_key_cipher ? await openSecret(row.api_key_cipher, config.sessionSecret) : null
  const stamp = {
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at?.toISOString?.() ?? null
  }
  const unreadable = Boolean(row?.api_key_cipher) && saved === null
  if (saved) return { key: saved, source: 'ops', unreadable: false, ...stamp }
  return { key: env, source: env ? 'env' : null, unreadable, ...stamp }
}

/**
 * What a screen may know about the key: where it comes from and a hint, never the key.
 * @returns {Promise<{ configured: boolean, source: 'ops' | 'env' | null, hint: string | null, unreadable: boolean, updatedBy: string | null, updatedAt: string | null }>}
 */
export async function speechKeyFacts(pool, config) {
  const { key, ...facts } = await readSpeechKey(pool, config)
  return { configured: key !== null, hint: key ? hintFor(key) : null, ...facts }
}

/**
 * Check a typed key before anything is written: a string, at most KEY_MAX characters, no spaces.
 * Empty (after trimming) means "remove the saved key".
 * @returns {{ ok: true, key: string } | { ok: false, error: string }}
 */
export function parseSpeechKey(value) {
  if (typeof value !== 'string') return { ok: false, error: 'KEY_NOT_STRING' }
  const key = value.trim()
  if (key.length > KEY_MAX) return { ok: false, error: 'KEY_TOO_LONG' }
  if (/\s/.test(key)) return { ok: false, error: 'KEY_HAS_SPACES' }
  return { ok: true, key }
}

/**
 * Save the key typed on /ops, sealed; an empty key removes the saved one (the environment's, if any,
 * is used again).
 * @param {{ query: Function }} pool
 * @param {string} key - checked by `parseSpeechKey`
 * @param {string} secret - this deployment's SESSION_SECRET
 * @param {string} by - who pressed Save
 */
export async function saveSpeechKey(pool, key, secret, by) {
  const cipher = key === '' ? null : await sealSecret(key, secret)
  await pool.query(
    `insert into speech_setting (id, api_key_cipher, updated_by, updated_at) values (true, $1, $2, now())
     on conflict (id) do update set api_key_cipher = excluded.api_key_cipher,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [cipher, by]
  )
}

/**
 * Ask the speech service whether a key may open a realtime session — the call a session's own
 * handshake depends on (a single-use realtime token, which expires unused). Never says the key.
 * @param {string} key
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ ok: true } | { ok: false, status: number, reason: string | null, message: string }>}
 */
export async function testSpeechKey(key, fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetchImpl('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: { 'xi-api-key': key },
      signal: controller.signal
    })
    if (res.ok) return { ok: true }
    const body = await res.json().catch(() => null)
    const detail = body?.detail
    return {
      ok: false,
      status: res.status,
      reason: typeof detail?.status === 'string' ? detail.status : null,
      message: String(
        typeof detail === 'string' ? detail : (detail?.message ?? `The service answered ${res.status}.`)
      ).slice(0, 300)
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: null,
      message: controller.signal.aborted
        ? 'No answer within 10 s.'
        : String(error?.message ?? error).slice(0, 300)
    }
  } finally {
    clearTimeout(timer)
  }
}
