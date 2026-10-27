/**
 * Voice input in the chat box (`@tracy/dsh-chat-input` `VoiceInput.tsx`): one WebSocket at
 * `/api/speech/stream` carries the browser's microphone here, and this process relays it to the
 * speech service — ElevenLabs Scribe v2 Realtime — and the words back as they are recognised.
 *
 * WHY A RELAY, NOT A TOKEN FOR THE BROWSER (council 15/10/2026, gpt-6.1-sol). ElevenLabs offers
 * single-use tokens so a browser can stream to it directly. Once a token is handed out, Tracy is no
 * longer on the path: nothing here could end that session, count its minutes or stop a second one,
 * and the service bills per minute of audio. Relayed, every rule below holds where the key is, the
 * key never leaves this process, and the model and its settings are this file's, not the page's.
 *
 * THE BROWSER'S SIDE OF THE SOCKET:
 *   → binary frame       PCM, 16-bit little-endian, mono, 16 kHz, at most one second per frame
 *   → {"type":"stop"}    the person is done: what is still being spoken is transcribed, then `end`
 *   ← {"type":"ready"}   the service took the session
 *   ← {"type":"partial","text"}    the phrase being spoken, revised as it goes
 *   ← {"type":"committed","text"}  a finished phrase; the next partial starts a new one
 *   ← {"type":"language","code"}   the language the service heard (ISO 639 code), when it says
 *   ← {"type":"end","reason","settled"}  then the socket closes; `reason` is one of END_REASONS,
 *                        `settled` false when the last phrase was not confirmed before the close,
 *                        or a busy local server had to drop audio (`lib/speech-voicestudio.js`)
 * Nothing else is accepted from the browser but one hint, `?language=<code>`: the language the chat
 * is in (its first clear message, `@tracy/core/language`), and the site the page stands in,
 * `?site=<site key>`. No model, no setting, no word rides along.
 *
 * KEYTERMS, A PILOT OFF BY DEFAULT (council 19/10/2026, A1; `lib/speech-keyterms.js`): for a site an
 * operator listed on /ops › Agents › Voice, and only when the signed-in account holds a live seat on
 * it, the session asks the service to listen for the site's own names (`keyterms`, ElevenLabs only).
 * The page names the site and nothing more; the names are Tracy's, read on this side. They go out in
 * the service's handshake only — never in a URL of Tracy's, never in a log line, which says how many
 * went and how many the service echoed in `session_started`.
 *
 * LANGUAGES, AS MEASURED AGAINST THE LIVE SERVICE (15/10/2026, `tasks/evidence/voice-mixed-language-*`):
 *   - with no `language_code` the service recognises the language itself, and pure Vietnamese,
 *     English or Japanese come back right — but a request that switches from Vietnamese to English
 *     half-way loses its English part entirely;
 *   - with `language_code=vi` that switch is transcribed, and English or mixed speech still is; but a
 *     hint the speech is not in comes back empty (`en` on Vietnamese, `vi` on Japanese).
 *   So the chat's language is sent as `language_code` only where it was measured to help (`vi`,
 *   `HINT_LANGUAGES`), and when a hinted session hears `rescueMs` of speech with no word at all it is
 *   reopened without the hint and the audio of the phrase being spoken is replayed into it, once.
 *   - when the language switches inside a phrase the service may REPLACE what it had of it
 *     ("Đổi màu nền … And" becomes "And add a contact button…", and the commit holds only the English): the
 *     words already shown are kept as a finished phrase (`isRestart`), and the commit that follows
 *     is trimmed of them if it repeats them. Words on screen never vanish.
 * The agent replies in the chat's language, or in the message's when it is plainly another
 * (`tracy-site-tools` `replyLanguageRule`).
 *
 * WHAT THIS ENFORCES (council 15/10/2026: a cost cap counted in minutes of audio, not in sessions):
 *   - only while the operator has voice on (switch `composer-voice-input`, /ops › Agents › Voice):
 *     off, every handshake is refused like a deployment without a key — off is off, not a hidden
 *     button over an open door; a switch the database cannot read refuses for now (503);
 *   - only a signed-in person, only from a page on Tracy's own origin (`Origin`, and
 *     `Sec-Fetch-Site` when the browser sends it): a customer site on `*.tracy.ai` is the same SITE
 *     as Tracy and its pages carry the session cookie (`lib/csrf.js`), so the cookie alone proves
 *     nothing about who opened the socket;
 *   - one live session per account: a new one ends the older one (`elsewhere`), so a tab left open
 *     cannot keep a second stream running;
 *   - `sessionSeconds` of audio per session, `silenceSeconds` without a recognised word, and a
 *     daily budget in SECONDS OF AUDIO received, per account and for the whole deployment, counted in
 *     the same `rate_bucket` windows as every other limit (`lib/rate.js`, fail closed). Not in started
 *     minutes per session (until 17/10/2026): a voice conversation opens a session per phrase, so
 *     twelve sessions with 105 s of speech in all cost 12 minutes on the stand, and sixty phrases ended
 *     a day's budget (council 17/10/2026: count the audio, not the sockets);
 *   - frames of at most one second, and at most `queuedSeconds` of audio waiting for the service:
 *     a slow link ends the session (`network`) instead of building a backlog;
 *   - at most `SPEECH_STT_MAX_CONCURRENT` sessions at once in this process, per speech service
 *     ({@link sttSlots}; council 19/10/2026): the key's own concurrency is a few sessions, and a
 *     voice conversation opens one per phrase, so a busy hour would otherwise meet the service's
 *     refusal mid-phrase. One more ends as `provider-busy` right after the upgrade (the page pauses
 *     with its message); nothing waits in a queue.
 *   - an anonymous widget visitor (`widget-guest+<hex16>@widget.invalid`, `lib/speech.js`
 *     `ANONYMOUS_SPEECH`, council 19/10/2026) has a smaller day, is charged to the anonymous visitors'
 *     shared day too, and its address may start sessions only so fast and hold only so many at once.
 * Neither audio nor words are logged or stored here: one line per session says how long it ran,
 * how soon the first words came and why it ended.
 */
import { speechVoices, speechCapabilities, speechSpeakFacts } from '../lib/speech-provider.js'
import { bindSpeechSession, endSpeechSession } from '../lib/speech-session.js'
import { VoiceStudioListening } from '../lib/speech-voicestudio.js'
import { speechHealth, failureOf, wordOf } from '../lib/speech-health.js'
import { switchWatch } from '../lib/speech-switch.js'
import WebSocket, { WebSocketServer } from 'ws'
import { clientIp } from '../lib/login-mail-rate.js'
import { refuseUpgrade } from '../lib/refuse-upgrade.js'
import { sessionFromCookieHeader } from '../lib/session.js'
import { ANONYMOUS_SPEECH, DAY_MS, SPEECH_LIMITS, isAnonymousSpeech } from '../lib/speech.js'
import { KEYTERM_LIMITS, SITE_KEY } from '../lib/speech-keyterms.js'

// The limits above live in lib/speech.js, which /ops reads too; re-exported for this domain.
export { SPEECH_LIMITS }

export const SPEECH_STREAM_PATH = '/api/speech/stream'
export const SAMPLE_RATE = 16_000
const BYTES_PER_SECOND = SAMPLE_RATE * 2

/** Why a session ended, as the chat box words it (`voice.end.*` in its strings). */
export const END_REASONS = Object.freeze([
  'stopped',
  'time-limit',
  'silence',
  'quota',
  'elsewhere',
  'provider',
  'provider-busy',
  'network'
])

const SERVICE = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'

/** Chat languages sent to the service as `language_code`, each measured to help (see the file comment). */
export const HINT_LANGUAGES = Object.freeze(new Set(['vi']))
/** Speech heard with no word coming back before a hinted session is reopened without its hint. */
const RESCUE_MS = 2500
/** Speech in a phrase the hinted service then finished EMPTY that also reopens it without the hint. */
const RESCUE_EMPTY_MS = 1000
/** Fewest words of a last partial kept when the service finishes its phrase empty (not a cough's "Thôi."). */
const KEEP_PARTIAL_WORDS = 3
/** A 16-bit frame louder than this RMS counts as speech for the rescue (about -36 dBFS). */
const SPEECH_RMS = 500
/** The longest phrase audio kept for a replay. */
const SEGMENT_MAX_BYTES = 15 * BYTES_PER_SECOND

/** A word as compared across two partials: lower case, no marks, no punctuation. */
const plainWord = (word) =>
  word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
const plainWords = (text) => text.split(/\s+/).map(plainWord).filter(Boolean)

/**
 * Whether `next` is the service starting the phrase again rather than revising `previous`: a revision
 * keeps the phrase's first words (the marks aside) or reuses its opening words; a restart begins
 * elsewhere, at a word from the end of what it had — where the language switched. Phrases of fewer
 * than three words, and scripts written without spaces, are never read as restarts.
 * @returns {number} how many words at the end of `previous` the restart repeats (0: not a restart, -1: a restart that repeats none)
 */
export function isRestart(previous, next) {
  const a = plainWords(previous)
  const b = plainWords(next)
  if (a.length < 3 || b.length === 0) return 0
  if (a[0] === b[0] && (a.length < 2 || b.length < 2 || a[1] === b[1])) return 0
  // The longest end of what it had that the new phrase begins with (measured: five words, "And add a
  // contact button", on the real page).
  for (let k = Math.min(a.length - 1, b.length); k >= 1; k--)
    if (a.slice(-k).join(' ') === b.slice(0, k).join(' ')) return k
  return a.slice(0, Math.ceil(a.length / 2)).some((word) => b.includes(word)) ? 0 : -1
}

/**
 * Whether `partial`, sent right after `phrase` was finished, is the service reading that phrase again
 * rather than a new one: most of its length, and mostly its words. Measured 17/10/2026 on the stand:
 * "À, tiêu đề chỉ viết hoa chữ cái đầu thôi nhé." finished, then 200 ms later
 * "À, tiêu đề chỉ viết hoa chứ cái đầu thôi, hả?" as a partial that was never confirmed — shown, it wrote the phrase twice and
 * held it unsent until the session closed for silence, 30 s on. A new phrase starts with a few words.
 * @param {string} partial
 * @param {string} phrase
 */
export function rereads(partial, phrase) {
  const a = plainWords(partial)
  const left = plainWords(phrase)
  if (a.length < 3 || a.length < left.length * 0.6) return false
  let same = 0
  for (const word of a) {
    const i = left.indexOf(word)
    if (i < 0) continue
    same += 1
    left.splice(i, 1)
  }
  return same >= a.length * 0.7
}

/** `text` without its last `count` words. */
const withoutLastWords = (text, count) =>
  text
    .trim()
    .split(/\s+/)
    .slice(0, count > 0 ? -count : undefined)
    .join(' ')

/**
 * What `text` says after the words of `kept`, when it starts with them (marks and punctuation aside);
 * null when it does not.
 * @param {string} text
 * @param {string} kept
 * @returns {string | null}
 */
export function afterKept(text, kept) {
  const want = plainWords(kept)
  const tokens = text.trim().split(/\s+/)
  let matched = 0
  let i = 0
  for (; i < tokens.length && matched < want.length; i++) {
    const word = plainWord(tokens[i])
    if (word === '') continue
    if (word !== want[matched]) return null
    matched += 1
  }
  return matched === want.length ? tokens.slice(i).join(' ') : null
}

/** How loud a frame of 16-bit PCM is (RMS). */
function loudness(frame) {
  let sum = 0
  const samples = Math.floor(frame.length / 2)
  for (let i = 0; i < samples; i++) {
    const v = frame.readInt16LE(i * 2)
    sum += v * v
  }
  return samples === 0 ? 0 : Math.sqrt(sum / samples)
}

/**
 * The service's error messages that mean something to the person; any other one is `provider`.
 * `quota_exceeded` is the key's credits used up (`lib/speech-health.js` marks it `limited`): nothing a
 * minute's wait fixes, so it is "not available", never "busy, try again in a minute".
 */
const SERVICE_ERRORS = {
  quota_exceeded: 'provider',
  rate_limited: 'provider-busy',
  queue_overflow: 'provider-busy',
  resource_exhausted: 'provider-busy',
  session_time_limit_exceeded: 'time-limit',
  insufficient_audio_activity: 'silence'
}

/**
 * The service's address with this deployment's settings: realtime model, 16 kHz PCM, phrases
 * committed by the service's own voice activity detection, the heard language reported, and the
 * chat's language as a hint when it is one of `HINT_LANGUAGES`, and the site's names to listen for
 * when the pilot gives some (`keyterms`, one query key per term, as the service reads a list).
 * @param {string} [base]
 * @param {string | null} [language]
 * @param {boolean} [turns]
 * @param {readonly string[]} [keyterms]
 */
export function serviceAddress(base = SERVICE, language = null, turns = false, keyterms = []) {
  const url = new URL(base)
  const params = new URLSearchParams({
    model_id: 'scribe_v2_realtime',
    audio_format: 'pcm_16000',
    commit_strategy: 'vad',
    include_language_detection: 'true',
    ...(language ? { language_code: language } : {}),
    ...(turns ? { vad_silence_threshold_secs: String(TURN_SILENCE_SECONDS) } : {})
  })
  for (const term of keyterms) params.append('keyterms', term)
  url.search = params.toString()
  return url
}

/**
 * The terms a session may send, whatever `keyterms` answered: strings within the service's bounds,
 * at most `KEYTERM_LIMITS.max`. The list is built and cleaned in `lib/speech-keyterms.js`; this is the
 * relay's own fence on what reaches the service's address.
 * @param {unknown} terms
 * @returns {string[]}
 */
export function boundedKeyterms(terms) {
  if (!Array.isArray(terms)) return []
  return terms
    .filter(
      (term) => typeof term === 'string' && term.trim() !== '' && [...term].length <= KEYTERM_LIMITS.chars
    )
    .slice(0, KEYTERM_LIMITS.max)
}

/**
 * The silence that ends a phrase in a voice conversation (`?turns=voice`), where Tracy answers when
 * the person stops; the service's own default (1.5 s) stays for dictation, where a person pauses
 * while composing. Measured 16/10/2026 on the stand: a phrase was confirmed 1.2 s after the speech
 * ended. Council 17/10/2026: 0.6–0.8 s; the service takes 0.3–3.0.
 */
export const TURN_SILENCE_SECONDS = 0.8

/**
 * No audio from the page this long ends the session as `silence`: the page sends a frame every
 * 100 ms while it listens, so a gap this long is a frozen tab or a microphone gone, and the service's
 * session (a slot of the key's) would otherwise stay open until the service or the kernel let go.
 */
export const FRAMES_GONE_MS = 10_000

/** How often the page's socket is pinged; no pong by the next ping and the session is let go. */
export const PING_EVERY_MS = 20_000

/** Audio charged to the day's budget in steps of this many seconds while a session runs; the rest at its end. */
export const CHARGE_SECONDS = 5

/** Sessions open at once in one process, per speech service, when `SPEECH_STT_MAX_CONCURRENT` says nothing. */
export const STT_MAX_CONCURRENT = 4

/**
 * The sessions holding a place at a speech service, one pool per service (council 19/10/2026). A
 * place is taken synchronously — no await between the check and the taking, so two handshakes can
 * never both see the last free place — and held from before the service's handshake until the
 * session's end, closing included. Places are named by the session's own id: a late callback of an
 * ended session can only give back its own place, never a newer session's. A session that switches
 * service before it is ready (`fallbackBeforeReady`) moves its place to the other pool.
 * @param {number} max - places per service
 */
export function sttSlots(max) {
  /** @type {Map<string, Set<number>>} service → session ids holding a place */
  const pools = new Map()
  const pool = (service) => {
    let held = pools.get(service)
    if (!held) pools.set(service, (held = new Set()))
    return held
  }
  return {
    /** Take a place at `service` for session `id`; false when every place is held. */
    take(service, id) {
      const held = pool(service)
      if (held.has(id)) return true
      if (held.size >= max) return false
      held.add(id)
      return true
    },
    /** Give back session `id`'s place at `service`; nothing when it holds none. */
    release(service, id) {
      pools.get(service)?.delete(id)
    },
    /** Places held at `service`, or at every service. */
    size(service) {
      if (service !== undefined) return pools.get(service)?.size ?? 0
      let n = 0
      for (const held of pools.values()) n += held.size
      return n
    }
  }
}

/**
 * One audio frame as the service takes it.
 * @param {Buffer} pcm
 * @param {boolean} [commit]
 */
export function audioChunk(pcm, commit = false) {
  return JSON.stringify({
    message_type: 'input_audio_chunk',
    audio_base_64: pcm.toString('base64'),
    commit,
    sample_rate: SAMPLE_RATE
  })
}

/**
 * Translate one service message into what the browser is told.
 *
 * A finished phrase arrives twice: as `committed_transcript`, and — because the heard language is
 * asked for — as `committed_transcript_with_timestamps` carrying the same text and the
 * `language_code`. Whichever copy comes first is the phrase; the other only gives the language.
 * ElevenLabs sends the stamped copy FIRST, the plain one a millisecond later (measured 15/10/2026
 * against the live service: taking the plain one as the phrase and the stamped one as an extra
 * wrote every phrase twice). Paired by count per kind, never by text: a person may well say the
 * same words twice.
 * @param {any} message - parsed service frame.
 * @param {{plain: number, stamped: number, language: string | null}} state - per session, mutated.
 * @returns {{out: object[], end: string | null}}
 */
export function fromService(message, state) {
  const type = typeof message?.message_type === 'string' ? message.message_type : ''
  const text = typeof message?.text === 'string' ? message.text : ''
  switch (type) {
    case 'session_started':
      return { out: [{ type: 'ready' }], end: null }
    case 'partial_transcript':
      return { out: [{ type: 'partial', text }], end: null }
    case 'committed_transcript': {
      // The stamped copy of this phrase came first: it was told then.
      const first = state.plain >= state.stamped
      state.plain += 1
      return { out: first ? [{ type: 'committed', text }] : [], end: null }
    }
    case 'committed_transcript_with_timestamps': {
      const out = []
      if (state.stamped >= state.plain) out.push({ type: 'committed', text })
      state.stamped += 1
      const code = typeof message.language_code === 'string' ? message.language_code.trim() : ''
      if (code !== '' && code !== state.language) {
        state.language = code
        out.push({ type: 'language', code })
      }
      return { out, end: null }
    }
    default:
      if (
        typeof message?.error === 'string' ||
        type.endsWith('_error') ||
        type in SERVICE_ERRORS ||
        type === 'error'
      )
        return { out: [], end: SERVICE_ERRORS[type] ?? 'provider' }
      // `warning`, the entity and edit messages this session never asks for: nothing to tell.
      return { out: [], end: null }
  }
}

/**
 * The relay. `handles` says whether an upgrade is this door's; `upgrade` never throws (same rule as
 * `workspace/upgrade.js`: Node drops the promise of an `upgrade` listener, so a rejection would end
 * the process for every site).
 *
 * @param {{
 *   config: { origin: string, sessionSecret: string, speech: { apiKey: string } | null },
 *   count: (bucket: string, amount: number, max: number, windowMs: number) => Promise<boolean>,
 *   log?: { log: (...a: any[]) => void, warn: (...a: any[]) => void },
 *   now?: () => number,
 *   session?: (cookieHeader: string | null, secret: string) => Promise<string | null>,
 *   connect?: (address: URL, options: object) => WebSocket,
 *   switchOn?: () => Promise<boolean>,
 *   resolveKey?: () => Promise<string | null>,
 *   health?: { generation?(): number, note(part: 'stt' | 'tts', outcome: 'ok' | 'refused' | 'limited', reason?: string | null, from?: { generation?: number }): void } | null,
 *   framesGoneMs?: number,
 *   pingEveryMs?: number,
 *   switchEveryMs?: number,
 *   watchSwitch?: () => Promise<boolean | null>
 * }} deps - `count`: adds `amount` to the bucket's window, true when it is then over `max` (`overLimitBy`);
 *   it rejects when it cannot count, and the session ends as `unavailable` (fail closed, never `quota`).
 *   `switchOn`: whether the operator has voice on (`speechSwitchOn`); throws when it cannot say. Read
 *   fresh at every handshake; a running session asks `watchSwitch` every `switchEveryMs` instead — one
 *   cached reader for every session of this relay, where a failed read is not "off" (`lib/speech-switch.js`).
 *   `resolveKey`: the speech key for a new session — the one saved on /ops, else the environment's
 *   (`readSpeechKey`), read per handshake so a key saved on /ops takes effect on the next session.
 *   `health`: told whether the service took the key (`health.js`) — a refusal at once hides voice.
 *   `maxConcurrent`: sessions at once per speech service ({@link sttSlots}); `config.speechSttMaxConcurrent`
 *   (`SPEECH_STT_MAX_CONCURRENT`) when not given.
 *   `keyterms`: the site's names for a session that named its site (`lib/speech-keyterms.js`
 *   `speechKeyterms`: the pilot list, then the account's seat on the site); none when not given. Asked
 *   while the day's budget is looked at, so it adds no wait; a failure is no terms, never a refusal.
 */
export function speechRelay({
  config,
  count,
  log = console,
  now = Date.now,
  session = sessionFromCookieHeader,
  connect = (address, options) => new WebSocket(address, options),
  switchOn = async () => true,
  resolveProfile,
  resolveKey = async () => config.speech?.apiKey ?? null,
  health = null,
  framesGoneMs = FRAMES_GONE_MS,
  pingEveryMs = PING_EVERY_MS,
  switchEveryMs = 1000,
  watchSwitch = switchWatch(switchOn),
  maxConcurrent = config.speechSttMaxConcurrent ?? STT_MAX_CONCURRENT,
  keyterms = null
}) {
  const acceptor = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: SPEECH_LIMITS.frameBytes + 1024
  })
  /** @type {Map<string, (reason: string) => void>} account → ends its live session */
  const live = new Map()
  const slots = sttSlots(maxConcurrent)
  /** Each session's own id, the name its place is held under. */
  let sessions = 0
  /** @type {Map<string, number>} address → anonymous widget sessions running from it */
  const anonymousAt = new Map()

  return {
    /** @param {import('node:http').IncomingMessage} req */
    handles(req) {
      return new URL(req.url ?? '/', 'http://x').pathname === SPEECH_STREAM_PATH
    },
    /**
     * @param {import('node:http').IncomingMessage} req
     * @param {import('node:stream').Duplex} socket
     * @param {Buffer} head
     */
    async upgrade(req, socket, head) {
      const early = () => socket.destroy()
      socket.on('error', early)
      try {
        const admitted = await admit(req, socket)
        if (admitted === null) return
        // Looked at here and taken in `run`, in one synchronous step with the socket (`handleUpgrade`
        // calls back at once), so two handshakes from one address cannot both pass on the last slot.
        const { address } = admitted
        if (address !== null && (anonymousAt.get(address) ?? 0) >= ANONYMOUS_SPEECH.liveSessionsPerAddress) {
          refuse(socket, 429)
          return
        }
        acceptor.handleUpgrade(req, socket, head, (client) => {
          socket.off('error', early)
          run(
            client,
            admitted.email,
            admitted.key,
            admitted.hint,
            admitted.snapshot,
            admitted.turns,
            admitted.keyGeneration,
            admitted.terms,
            address
          )
        })
      } catch (error) {
        log.warn(`[speech] handshake dropped: ${String(error?.message ?? error).slice(0, 200)}`)
        refuseUpgrade(socket, 503)
      }
    },
    /** Sessions running now (tests, and a clean shutdown). */
    get live() {
      return live.size
    },
    /** Places held at the speech services now, handshakes and closings included (tests). */
    get busy() {
      return slots.size()
    }
  }

  /** @returns {Promise<{ email: string, key: string, hint: string | null } | null>} null once the handshake is refused */
  async function admit(req, socket) {
    let key = null
    let on = false
    let snapshot = null
    // The key's generation as it is read: what this session meets is told against this key only.
    let keyGeneration = health?.generation?.()
    try {
      snapshot = resolveProfile ? await resolveProfile() : null
      if (snapshot) {
        ;(health ?? speechHealth).bind?.(snapshot.revision)
        keyGeneration = health?.generation?.()
      }
      key = snapshot ? (snapshot.configured ? (snapshot.key ?? 'local') : null) : await resolveKey()
      on = await switchOn()
    } catch {
      return refuse(socket, 503)
    }
    if (!on) return refuse(socket, 404)
    if (
      (!key ||
        (snapshot &&
          (speechHealth.refused('stt', snapshot.revision) ||
            speechHealth.refused('tts', snapshot.revision)))) &&
      snapshot?.alternative?.configured
    ) {
      snapshot = snapshot.alternative
      key = snapshot.key ?? 'local'
    }
    if (!key) return refuse(socket, 404)
    const site = req.headers['sec-fetch-site']
    if (req.headers.origin !== config.origin || (site !== undefined && site !== 'same-origin'))
      return refuse(socket, 403)
    const email = await session(req.headers.cookie ?? null, config.sessionSecret)
    if (!email) return refuse(socket, 401)
    // An anonymous widget visitor's address may start sessions in a burst, then about two a minute
    // (council 19/10/2026): each visitor is a new identity, so its own day alone would not stop a
    // script making visitors. Counted before anything opens; a count that fails refuses (503).
    const address = isAnonymousSpeech(email)
      ? clientIp({ req: { header: (name) => req.headers[name] } })
      : null
    if (address !== null) {
      const [burst, steady] = await Promise.all([
        count(`widget-speech-starts:${address}`, 1, ANONYMOUS_SPEECH.startsPerMinute, 60_000),
        count(`widget-speech-starts-10m:${address}`, 1, ANONYMOUS_SPEECH.startsPerTenMinutes, 600_000)
      ])
      if (burst || steady) return refuse(socket, 429)
    }
    const query = new URL(req.url ?? '/', 'http://x').searchParams
    const asked = query.get('language') ?? ''
    const hint = HINT_LANGUAGES.has(asked) ? asked : null
    // A voice conversation, where a phrase ends sooner (`TURN_SILENCE_SECONDS`); else dictation.
    const turns = query.get('turns') === 'voice'
    // The site the page stands in: its names are looked up on this side, for this account only, and
    // not awaited here (`run` waits for them with the day's budget). A site key of another shape is
    // no site at all: the session simply goes without terms.
    const named = query.get('site') ?? ''
    const terms =
      keyterms && named.length <= 253 && SITE_KEY.test(named)
        ? Promise.resolve()
            .then(() =>
              keyterms({
                email: email.toLowerCase(),
                siteKey: named,
                language: /^[a-z]{2,3}$/.test(asked) ? asked : ''
              })
            )
            .then(boundedKeyterms, () => [])
        : Promise.resolve([])
    return { email: email.toLowerCase(), key, hint, turns, snapshot, keyGeneration, terms, address }
  }

  function refuse(socket, status) {
    refuseUpgrade(socket, status)
    return null
  }

  /**
   * One session, from an accepted browser socket to its `end`.
   * @param {WebSocket} client
   * @param {string} email
   * @param {string} key - the speech service's key, as `resolveKey` gave it for this session
   * @param {string | null} hint - the chat's language, sent while the service hears words with it
   * @param {boolean} [turns] - a voice conversation (`TURN_SILENCE_SECONDS`)
   * @param {Promise<string[]>} [terms] - the site's names for the service (`keyterms`), none by default
   * @param {string | null} [address] - an anonymous widget visitor's address, held while this runs
   */
  function run(
    client,
    email,
    key,
    hint,
    snapshot = null,
    turns = false,
    keyGeneration = undefined,
    terms = Promise.resolve([]),
    address = null
  ) {
    if (address !== null) anonymousAt.set(address, (anonymousAt.get(address) ?? 0) + 1)
    const anonymous = isAnonymousSpeech(email)
    /** The days this session's audio is charged to: the account's and the deployment's; an anonymous
     * widget visitor's is smaller, and all of them share one more (`ANONYMOUS_SPEECH`). */
    const days = [
      [
        `speech-seconds:${email}`,
        anonymous ? ANONYMOUS_SPEECH.visitorSecondsPerDay : SPEECH_LIMITS.accountMinutesPerDay * 60
      ],
      ['speech-seconds', SPEECH_LIMITS.totalMinutesPerDay * 60],
      ...(anonymous
        ? [[`speech-seconds:${ANONYMOUS_SPEECH.bucket}`, ANONYMOUS_SPEECH.totalSecondsPerDay]]
        : [])
    ]
    let local = snapshot?.provider === 'voicestudio'
    /** The site's names this session sends the service, once `terms` answered; told once in the log. */
    let keyterms = /** @type {string[]} */ ([])
    let keytermsTold = false
    const preferredHint = hint
    if (local) hint = null
    let sessionRecord = null
    let providerReady = !snapshot
    let fallbackAttempted = Boolean(snapshot?.fallbackUsed)
    /** This session's own id, and the service its place is held at (`sttSlots`). */
    const id = ++sessions
    let slotAt = snapshot?.provider ?? 'elevenlabs'

    const told = (outcome, reason = null) => {
      if (snapshot?.fallbackUsed) return
      health?.note('stt', outcome, reason, {
        generation: keyGeneration,
        ...(snapshot ? { revision: snapshot.revision } : {})
      })
    }
    const started = now()
    const hinted = hint
    let state = { plain: 0, stamped: 0, language: null }
    /** The audio of the phrase being spoken (since the last commit), for a replay. */
    let segment = []
    let segmentBytes = 0
    /** Speech heard since the last new word and in the phrase, and whether the hint was dropped already. */
    let speechSinceWords = 0
    let speechInPhrase = 0
    let rescued = false
    /** Bytes the replay puts on the service's socket at once, allowed beyond the backlog bound. */
    let replayAllowance = 0
    /**
     * A reopened service has not taken the replay yet: live audio queues behind it. `providerReady`
     * stays as the first session left it (a reopen is no time for a fallback), so without this a frame
     * spoken between the new socket's open and its `session_started` would reach the service ahead
     * of the phrase it follows.
     */
    let replaying = false
    /** The last partial shown, and the words kept from a restarted phrase (see the file comment). */
    let lastPartial = ''
    let kept = ''
    let keptCount = 0
    let generation = 0
    /** Audio waiting for the service to open, as service frames. */
    let queued = []
    let queuedBytes = 0
    let audioBytes = 0
    /** Audio already charged to the day's budget. */
    let chargedBytes = 0
    let lastWords = started
    let firstWordsMs = null
    let pending = false
    /** The last finished phrase, to know a late copy of it sent as a partial. */
    let lastCommit = { text: '', at: 0 }
    /**
     * Since the last finished phrase: audio sent to the service, and of it, speech. With no speech
     * since, a phrase that reads like the last one is that one read again — the person said nothing
     * new; with speech, it is a new phrase however alike (council 18/10/2026:
     * "Đổi giá thành hai triệu", then "…ba triệu").
     */
    let audioSinceCommit = 0
    let speechSinceCommit = 0
    /** A re-reading of the last phrase the service showed with no speech since: not shown (see below). */
    let phantom = ''
    /** When the page last sent audio: a page that stops sending ends the session (`FRAMES_GONE_MS`). */
    let lastFrameAt = started
    let framesTimer = null
    let pingTimer = null
    let pongWaited = false
    let committedSinceStop = false
    let stopping = false
    let settleTimer = null
    let ended = false
    let detail = ''
    let service = null

    const send = (message) => {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message))
    }

    // Voice turned off ends the session; a switch that cannot be read now is not off. A phrase still
    // being spoken was never confirmed, so the end says so (`settled`) and the page does not send it.
    const switchTimer = setInterval(() => {
      void watchSwitch().then((on) => {
        if (on === false) end('stopped', { settled: !pending })
      })
    }, switchEveryMs)
    switchTimer.unref?.()
    const end = (reason, { settled = true } = {}) => {
      if (ended) return
      ended = true
      // The place at the service is given back once, here, by this session's own id: a callback of
      // an older session that fires late cannot free a newer one's (council 19/10/2026).
      slots.release(slotAt, id)
      if (sessionRecord) endSpeechSession(sessionRecord, reason)
      clearTimeout(settleTimer)
      clearInterval(switchTimer)
      clearTimeout(framesTimer)
      clearInterval(pingTimer)
      if (live.get(email) === endHere) live.delete(email)
      if (address !== null) {
        const left = (anonymousAt.get(address) ?? 1) - 1
        if (left > 0) anonymousAt.set(address, left)
        else anonymousAt.delete(address)
      }
      // A slow local server's hold gave way to newer audio (`HELD_MAX_BYTES`): the session went on,
      // but some words were never heard, so the page is told its last words may be missing.
      const dropped = service?.droppedBytes ?? 0
      if (dropped > 0) {
        settled = false
        detail += `; ${(dropped / BYTES_PER_SECOND).toFixed(1)} s of audio dropped while the speech server was busy`
      }
      if (reason !== null) send({ type: 'end', reason, settled })
      if (client.readyState === WebSocket.OPEN) client.close(1000)
      else client.terminate()
      if (service && service.readyState !== WebSocket.CLOSED) service.terminate()
      // The rest of the audio received, to the next whole second.
      const rest = Math.ceil((audioBytes - chargedBytes) / BYTES_PER_SECOND)
      chargedBytes = audioBytes
      if (rest > 0) void charge(rest).catch(() => {})
      const seconds = (audioBytes / BYTES_PER_SECOND).toFixed(1)
      const first = firstWordsMs === null ? '' : `, first words after ${firstWordsMs} ms`
      const language = `${hinted ? `, hinted ${hinted}` : ''}${rescued ? ', reopened without the hint' : ''}${keptCount ? `, kept ${keptCount} restarted phrase(s)` : ''}`
      log.log(
        `[speech] ended (${reason ?? 'closed'}) after ${seconds} s of audio${first}${language}${detail}`
      )
    }
    const endHere = (reason) => end(reason)

    live.get(email)?.('elsewhere')
    live.set(email, endHere)

    client.on('error', () => end(null))
    client.on('close', () => end(null))
    // A page gone without closing (half-open connection, a laptop shut): no pong to a ping, and the
    // session and its slot at the service are let go.
    client.on('pong', () => {
      pongWaited = false
    })
    pingTimer = setInterval(() => {
      if (pongWaited) {
        client.terminate()
        return end(null)
      }
      pongWaited = true
      try {
        client.ping()
      } catch {
        // Closing already: its 'close' ends the session.
      }
    }, pingEveryMs)
    armFrames()
    client.on('message', (data, binary) => {
      if (ended) return
      if (!binary) return onCommand(data)
      const frame = Buffer.isBuffer(data) ? data : Buffer.from(/** @type {ArrayBuffer} */ (data))
      if (stopping || frame.length === 0 || frame.length % 2 !== 0 || frame.length > SPEECH_LIMITS.frameBytes)
        return
      onAudio(frame)
    })

    // A place at the service, taken before anything is awaited (the budget, the handshake): every
    // place held, the session ends as the service being busy, which the page already words; it never
    // waits in a queue (council 19/10/2026).
    if (!slots.take(slotAt, id)) {
      detail = `; all ${maxConcurrent} sessions at ${slotAt} are taken`
      return end('provider-busy')
    }

    // Today's budget is looked at before any audio goes out, so a person who has used it all never
    // opens a session with the service at all. The site's names are read meanwhile (never failing).
    void Promise.all([spentAll(), terms.catch(() => [])]).then(
      ([over, found]) => {
        if (over) return end('quota')
        if (ended) return
        keyterms = found
        openService()
      },
      () => end('unavailable')
    )

    function onCommand(data) {
      let message = null
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }
      if (message?.type !== 'stop' || stopping) return
      stopping = true
      clearTimeout(framesTimer)
      // Ends at once only when nothing reached the service since its last finished phrase. Any audio
      // since is asked to be finished and waited for: whether it held words is the service's to say,
      // not a guess from what was shown (council 18/10/2026; measured: it answers a commit in
      // 0.35–0.6 s, with "" when there was nothing).
      // A busy local server may still hold audio sent before that phrase was finished (`unanswered`).
      if (!pending && queued.length === 0 && audioSinceCommit === 0 && !service?.unanswered)
        return end('stopped')
      settleTimer = setTimeout(
        () => end('stopped', { settled: false }),
        local ? 90_000 : SPEECH_LIMITS.settleMs
      )
      toService(audioChunk(Buffer.alloc(0), true), 0)
    }

    /** No audio from the page for `framesGoneMs` (a frozen tab, a dead microphone): the session ends. */
    function armFrames(wait = framesGoneMs) {
      clearTimeout(framesTimer)
      framesTimer = setTimeout(() => {
        if (ended || stopping) return
        const left = framesGoneMs - (now() - lastFrameAt)
        if (left <= 0) end('silence')
        else armFrames(left)
      }, wait)
    }

    function onAudio(frame) {
      audioBytes += frame.length
      const at = now()
      lastFrameAt = at
      armFrames()
      audioSinceCommit += frame.length
      if (loudness(frame) > SPEECH_RMS) speechSinceCommit += (frame.length / BYTES_PER_SECOND) * 1000
      if (audioBytes > SPEECH_LIMITS.sessionSeconds * BYTES_PER_SECOND) return end('time-limit')
      if (at - lastWords > SPEECH_LIMITS.silenceSeconds * 1000) return end('silence')
      if (audioBytes - chargedBytes >= CHARGE_SECONDS * BYTES_PER_SECOND) {
        chargedBytes += CHARGE_SECONDS * BYTES_PER_SECOND
        // A count that could not be made ends the session too (fail closed), but as what it is: not
        // "today's minutes are used up", which nobody counted.
        void charge(CHARGE_SECONDS).then(
          (over) => over && end('quota'),
          () => end('unavailable')
        )
      }
      // Kept only while a rescue may still come: the phrase being spoken under the hint.
      if (hint && !rescued) {
        segment.push(frame)
        segmentBytes += frame.length
        while (segmentBytes > SEGMENT_MAX_BYTES) segmentBytes -= segment.shift().length
        if (service?.readyState === WebSocket.OPEN && loudness(frame) > SPEECH_RMS) {
          const ms = (frame.length / BYTES_PER_SECOND) * 1000
          speechSinceWords += ms
          speechInPhrase += ms
          if (speechSinceWords >= RESCUE_MS) return rescue()
        }
      }
      toService(audioChunk(frame), frame.length)
    }

    /**
     * The hint brought no word for `RESCUE_MS` of speech: the person is speaking another language.
     * Reopen without it and replay the phrase so far; once per session, as nothing else would help.
     */
    function rescue() {
      rescued = true
      hint = null
      const old = service
      old.removeAllListeners()
      old.on('error', () => {})
      old.terminate()
      state = { plain: 0, stamped: 0, language: state.language }
      queued = segment.map((frame) => audioChunk(frame))
      queuedBytes = 0
      replayAllowance = queued.reduce((sum, message) => sum + message.length, 0)
      replaying = true
      segment = []
      segmentBytes = 0
      lastPartial = ''
      kept = ''
      // Already stopping: the replayed phrase is what is awaited, so it is asked for again.
      if (stopping) {
        queued.push(audioChunk(Buffer.alloc(0), true))
        pending = true
        clearTimeout(settleTimer)
        settleTimer = setTimeout(
          () => end('stopped', { settled: false }),
          local ? 90_000 : SPEECH_LIMITS.settleMs
        )
      }
      openService()
    }

    function toService(message, bytes) {
      if (service?.readyState === WebSocket.OPEN && providerReady && !replaying) {
        if (service.bufferedAmount > SPEECH_LIMITS.queuedSeconds * BYTES_PER_SECOND * 1.4 + replayAllowance)
          return end('network')
        service.send(message)
        return
      }
      queuedBytes += bytes
      if (queuedBytes > SPEECH_LIMITS.queuedSeconds * BYTES_PER_SECOND) return end('network')
      queued.push(message)
    }

    /** Charge `seconds` of audio to every day of `days`; true when any is then over. */
    async function charge(seconds) {
      const over = await Promise.all(days.map(([bucket, max]) => count(bucket, seconds, max, DAY_MS)))
      return over.some(Boolean)
    }

    /** Today's budget is used up in any day of `days` (nothing is charged). */
    async function spentAll() {
      const over = await Promise.all(days.map(([bucket, max]) => count(bucket, 0, max - 1, DAY_MS)))
      return over.some(Boolean)
    }

    function fallbackBeforeReady() {
      if (providerReady || stopping || ended || fallbackAttempted || !snapshot?.alternative?.configured)
        return false
      fallbackAttempted = true
      // The place moves with the session: taken at the other service first, then given back here,
      // with no await between. The other service full: busy, like a first handshake would be.
      const next = snapshot.alternative.provider ?? slotAt
      if (next !== slotAt) {
        if (!slots.take(next, id)) {
          detail = `; all ${maxConcurrent} sessions at ${next} are taken`
          end('provider-busy')
          return true
        }
        slots.release(slotAt, id)
        slotAt = next
      }
      ++generation
      service?.removeAllListeners()
      service?.on('error', () => {})
      service?.terminate()
      snapshot = snapshot.alternative
      key = snapshot.key ?? 'local'
      local = snapshot.provider === 'voicestudio'
      hint = local ? null : preferredHint
      state = { plain: 0, stamped: 0, language: null }
      openService()
      return true
    }
    function openService() {
      const mine = ++generation
      service = local
        ? new VoiceStudioListening(snapshot, { connect })
        : connect(serviceAddress(undefined, hint, turns, keyterms), {
            headers: { 'xi-api-key': key },
            perMessageDeflate: false,
            handshakeTimeout: 10_000
          })
      service.on('unexpected-response', (_request, response) => {
        // The service refused the key or the request; its answer says why (missing permission,
        // unknown model). Kept for the log line, never shown to the person.
        let body = ''
        response.on('data', (chunk) => {
          if (body.length < 400) body += chunk
        })
        response.on('end', () => {
          detail = `; the service answered ${response.statusCode} ${body.replace(/\s+/g, ' ').slice(0, 300)}`
          // The service's own word decides what this says of the key (`lib/speech-health.js`).
          let parsed = null
          try {
            parsed = JSON.parse(body)
          } catch {
            // Not the service's JSON: nothing known of the key.
          }
          const { word, type } = wordOf(parsed)
          const failure = failureOf(word, type)
          if (failure !== null) told(failure, word ?? type)
          if (!fallbackBeforeReady()) end('provider')
        })
        response.on('error', () => end('provider'))
      })
      service.on('error', (error) => {
        if (!detail) detail = `; ${String(error?.message ?? error).slice(0, 200)}`
        if (!fallbackBeforeReady()) end('provider')
      })
      service.on('close', () => {
        if (mine !== generation) return
        if (!fallbackBeforeReady()) end(stopping ? 'stopped' : 'provider', { settled: !stopping || !pending })
      })

      service.on('open', () => {
        if (!snapshot) {
          for (const message of queued) service.send(message)
          queued = []
          queuedBytes = 0
          replaying = false
        }
      })
      service.on('message', (data) => {
        if (mine !== generation) return
        let message = null
        try {
          message = JSON.parse(data.toString())
        } catch {
          return
        }
        if (message?.message_type === 'session_started') {
          providerReady = true
          if (snapshot && !sessionRecord) sessionRecord = bindSpeechSession(email, snapshot)
          for (const message of queued) service.send(message)
          queued = []
          queuedBytes = 0
          replaying = false
          // The pilot's names went with the handshake: the service's own echo of its config says
          // whether it took them. How many, never which (a site's names are not log material).
          if (!local && keyterms.length > 0 && !keytermsTold) {
            keytermsTold = true
            const echoed = message.config?.keyterms
            log.log(
              `[speech] keyterms: ${keyterms.length} sent, ${Array.isArray(echoed) ? `${echoed.length} echoed by the service` : 'none echoed by the service'}`
            )
          }
        }
        const failure = failureOf(message?.message_type)
        if (message?.message_type === 'session_started') told('ok')
        if (failure !== null) told(failure, message.message_type)
        const { out, end: reason } = fromService(message, state)
        if (reason !== null) {
          detail = `; the service said ${String(message.message_type)}: ${String(message.error ?? '').slice(0, 200)}`
          if (['provider', 'provider-busy'].includes(reason) && fallbackBeforeReady()) return
          return end(reason)
        }
        for (const item of out) {
          // The page was told `ready` once; a reopened session is the same session to it.
          if (item.type === 'ready' && snapshot) {
            if (!snapshot.fallbackUsed) speechHealth.note('stt', 'ok', null, snapshot.revision)
            item.provider = snapshot.provider
            item.actualProvider = snapshot.provider
            item.primaryProvider = snapshot.primaryProvider ?? snapshot.provider
            item.capabilities = speechCapabilities(snapshot)
            item.speak = speechSpeakFacts(snapshot)
            item.fallbackUsed = Boolean(snapshot.fallbackUsed)
            item.sessionToken = sessionRecord
            item.revision = snapshot.revision
            item.voices = speechVoices(snapshot)
            item.transcriptWaitMs = local ? 90_000 : 6000
          }
          let show = !(item.type === 'ready' && rescued)
          // The service sometimes sends one more partial right after a phrase is finished, with
          // the finished text (measured 15/10/2026: 12 ms after the commit, about 1 session in 6
          // on Japanese and Vietnamese), or a second reading of it (`rereads`, 17/10/2026). Shown,
          // it would sit after the phrase and write it twice. Not shown: such a copy within 1.5 s of
          // the commit WITH NO SPEECH SINCE — the person said nothing new, so it cannot be a new
          // phrase however it reads; with speech, a phrase alike is a new one ("xoá ảnh thứ ba"
          // after "Xoá ảnh thứ hai."), and goes. Not shown is not finished: it still counts as
          // words pending, so a stop asks the service to finish them and waits (`onCommand`).
          if (item.type === 'partial') {
            const words = item.text.trim()
            const copy =
              !local &&
              words !== '' &&
              speechSinceCommit === 0 &&
              ((now() - lastCommit.at < 1500 &&
                (words === lastCommit.text || rereads(words, lastCommit.text))) ||
                (phantom !== '' && (words === phantom || rereads(words, phantom))))
            if (copy) {
              phantom = words
              pending = true
              continue
            }
            if (stopping && committedSinceStop) continue
            // The service started the phrase again: what it had is kept as a finished phrase. With no
            // hint, only a restart that picks up the last words (measured: the first partials of an
            // unhinted session can be another language's guess, "팀 러버 크라이시 바", taken back).
            const repeated = local || words === '' ? 0 : isRestart(lastPartial, words)
            if (repeated > 0 || (repeated < 0 && hint)) {
              const keep = withoutLastWords(lastPartial, Math.max(repeated, 0))
              if (keep !== '') {
                send({ type: 'committed', text: keep })
                kept = kept ? `${kept} ${keep}` : keep
                keptCount += 1
              }
            }
            if (words !== '' && words !== lastPartial) speechSinceWords = 0
            lastPartial = words
          }
          if (!local && item.type === 'committed' && item.text.trim() === '' && lastPartial !== '') {
            // The hinted service heard speech and made nothing of it: another language. Reopened
            // without the hint, this phrase replayed (measured: Japanese under `vi`).
            if (hint && !rescued && speechInPhrase >= RESCUE_EMPTY_MS) return rescue()
            // Words were shown and the phrase came back empty (measured, unhinted, on a switch to
            // English): what was heard is kept, unless it is a stray word or two.
            if (plainWords(lastPartial).length >= KEEP_PARTIAL_WORDS) item.text = lastPartial
          }
          if (item.type === 'committed') {
            // The re-reading not shown, finished (a stop asked for it): still nothing new was said.
            const said = item.text.trim()
            const reread =
              phantom !== '' &&
              speechSinceCommit === 0 &&
              said !== '' &&
              (said === phantom || rereads(said, phantom))
            phantom = ''
            audioSinceCommit = 0
            speechSinceCommit = 0
            if (reread) {
              item.text = ''
              show = false
            }
            // As the service said it: a late partial copies this, not the trimmed text below.
            else lastCommit = { text: said, at: now() }
            lastPartial = ''
            // A commit that repeats the words kept from a restart says only what follows them.
            const rest = kept ? afterKept(item.text, kept) : null
            kept = ''
            // Only the kept words: the phrase is finished, with nothing new to show.
            if (rest !== null) {
              item.text = rest
              show = rest !== ''
            }
            speechSinceWords = 0
            speechInPhrase = 0
            segment = []
            segmentBytes = 0
            if (stopping) committedSinceStop = true
          }
          if (item.type === 'partial' || item.type === 'committed') {
            pending = item.type === 'partial' && item.text.trim() !== ''
            if (item.text.trim() !== '') {
              lastWords = now()
              if (firstWordsMs === null) firstWordsMs = lastWords - started
            }
          }
          if (show) send(item)
        }
        // A phrase confirmed after `stop`: what was being spoken is in. A short grace lets the
        // phrase's second copy arrive, so it is not taken for a phrase of a later session; an empty
        // one (nothing was being said) has no copy to wait for.
        const finished = out.filter((item) => item.type === 'committed')
        if (stopping && !pending && finished.length > 0) {
          clearTimeout(settleTimer)
          if (finished.every((item) => item.text.trim() === '')) return end('stopped')
          settleTimer = setTimeout(() => end('stopped'), 400)
        }
      })
    }
  }
}
