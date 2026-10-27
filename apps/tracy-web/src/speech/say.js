import { openSpeechTts } from '../lib/speech-tts.js'
/**
 * Voice conversation's spoken replies (`@tracy/dsh-chat-input` `voice-mode.mjs`): the chat box hands
 * over the start of Tracy's reply it is about to say, and this door answers with it spoken — raw PCM,
 * streamed as the speech service makes it, so the first words play before the last are made.
 *
 *   POST /api/speech/say  {text, voice?, language?}
 *     → 200 application/octet-stream: 16-bit little-endian mono PCM at `SPEAK_SERVICE.sampleRate`
 *           (`x-sample-rate` says it too)
 *     → 400 TEXT_MISSING | TEXT_TOO_LONG | VOICE_UNKNOWN
 *     → 401 NOT_SIGNED_IN
 *     → 404 VOICE_OFF             no speech key, or the operator has voice off
 *     → 429 SPEAK_QUOTA           this account's characters, or the deployment's (or every anonymous
 *                                 widget visitor's together), are used for today
 *     → 502 SPEAK_PROVIDER        the service refused the key or failed before any sound
 *     → 503 SPEAK_PROVIDER_BUSY   the service is over its own rate; SPEAK_UNAVAILABLE when a switch
 *                                 or the budget could not be read (fail closed)
 * `voice` is one of `SPEAK_VOICES` (the first when absent); `language` is the reply's language as the
 * chat box read it, sent to the service only when it is one of `SPEAK_LANGUAGES`.
 *
 * WHY RELAYED, like the voice socket (`relay.js`, council 15/10/2026): the key stays in this process,
 * and every limit below holds where the key is. The page could not be trusted to count its own
 * characters. The same-origin rule for a write with the session cookie is `lib/csrf.js`'s, in front of
 * every door.
 *
 * WHAT THIS ENFORCES:
 *   - only while the operator has voice on (switch `composer-voice-input`, /ops › Agents › Voice, the
 *     one switch the microphone follows too); a switch the database cannot read refuses for now;
 *   - at most `SPEAK_LIMITS.maxChars` characters a reading, counted before the service is asked, per
 *     account and for the whole deployment per UTC day (`rate_bucket`, fail closed); a reading the
 *     service refuses before any sound gives its characters back; an anonymous widget visitor
 *     (`lib/speech.js` `ANONYMOUS_SPEECH`, council 19/10/2026) has a smaller day and is counted in the
 *     anonymous visitors' shared day too;
 *   - the reading ends when the page lets go of it (End, Stop, the next words): the service's stream
 *     is cut too, so a dropped reply is not made to the end.
 * Neither the words nor the sound are logged or stored: one line per reading says how many characters,
 * how soon the first sound came and how it ended.
 */
import { resolveSpeechSession } from '../lib/speech-session.js'
import { readSpeechProfile, speechTtsRequest, speechVoices } from '../lib/speech-provider.js'
import { speechHealth } from '../lib/speech-health.js'
import { failureOf, wordOf } from '../lib/speech-health.js'
import { switchWatch } from '../lib/speech-switch.js'
import { json, requireViewer } from '../lib/http.js'
import {
  ANONYMOUS_SPEECH,
  DAY_MS,
  SPEAK_LANGUAGES,
  SPEAK_LIMITS,
  SPEAK_SERVICE,
  SPEAK_VOICES,
  isAnonymousSpeech,
  speechSwitchOn
} from '../lib/speech.js'

export const SPEAK_PATH = '/api/speech/say'

/**
 * The service's answer to a request it refused, as this door says it.
 * @param {number} status
 * @returns {{ status: 502 | 503, code: string }}
 */
export function providerRefusal(status) {
  if (status === 429) return { status: 503, code: 'SPEAK_PROVIDER_BUSY' }
  return { status: 502, code: 'SPEAK_PROVIDER' }
}

/**
 * Read a request's body: the words, the voice, the language. Never throws.
 * @param {unknown} body
 * @returns {{ ok: true, text: string, chars: number, voice: string, language: string | null } | { ok: false, code: string }}
 */
export function parseSpeakRequest(body, voices = SPEAK_VOICES) {
  const raw = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {}
  const text = typeof raw.text === 'string' ? raw.text.replace(/\s+/g, ' ').trim() : ''
  if (text === '') return { ok: false, code: 'TEXT_MISSING' }
  const chars = [...text].length
  if (chars > SPEAK_LIMITS.maxChars) return { ok: false, code: 'TEXT_TOO_LONG' }
  const voice = raw.voice === undefined || raw.voice === null || raw.voice === '' ? voices[0].id : raw.voice
  if (!voices.some((v) => v.id === voice)) return { ok: false, code: 'VOICE_UNKNOWN' }
  const language =
    typeof raw.language === 'string' && SPEAK_LANGUAGES.has(raw.language.toLowerCase())
      ? raw.language.toLowerCase()
      : null
  return { ok: true, text, chars, voice: /** @type {string} */ (voice), language }
}

/**
 * Mount `POST /api/speech/say` on `app`.
 * @param {import('hono').Hono} app
 * @param {{
 *   config: { sessionSecret: string, speech?: { apiKey: string } | null },
 *   pool: { query: Function } | null,
 *   count: (bucket: string, amount: number, max: number, windowMs: number) => Promise<boolean>,
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   log?: { log: (...a: any[]) => void, warn: (...a: any[]) => void },
 *   switchEveryMs?: number,
 *   watchSwitch?: () => Promise<boolean | null>
 * }} deps - `count`: adds `amount` to the bucket's day and says whether it is now over `max`; throws
 *   when it cannot say (the door then refuses, fail closed). The switch is read fresh before a reading
 *   starts; a reading under way asks `watchSwitch` every `switchEveryMs` — one cached reader for every
 *   reading of this door, where a failed read is not "off" (`lib/speech-switch.js`).
 */
export function mountSpeak(
  app,
  {
    config,
    pool,
    count,
    fetchImpl = fetch,
    connect,
    now = Date.now,
    log = console,
    health = speechHealth,
    switchEveryMs = 1000,
    watchSwitch = switchWatch(() => speechSwitchOn(pool))
  }
) {
  app.post(SPEAK_PATH, async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    c.header('cache-control', 'no-store')

    let on
    let snapshot
    let generation = health?.generation?.()
    try {
      on = await speechSwitchOn(pool)
      snapshot = on ? await readSpeechProfile(pool, config) : null
    } catch {
      return json(c, { code: 'SPEAK_UNAVAILABLE' }, 503)
    }
    if (on && !snapshot?.configured && snapshot?.alternative?.configured) snapshot = snapshot.alternative
    if (!on || !snapshot?.configured) return json(c, { code: 'VOICE_OFF' }, 404)

    const raw = await c.req.json().catch(() => null)
    const session = resolveSpeechSession(email, snapshot.revision, raw?.sessionToken)
    if (!session.ok || (raw?.revision && raw.revision !== snapshot.revision))
      return json(c, { code: 'VOICE_RESTART_REQUIRED' }, 409)
    const active = session.snapshot
    if (active) snapshot = active
    health.bind(snapshot.revision)
    generation = health.generation()
    const asked = parseSpeakRequest(
      snapshot.fallbackUsed ? { ...raw, voice: speechVoices(snapshot)[0].id } : raw,
      speechVoices(snapshot)
    )
    if (!asked.ok) return json(c, { code: asked.code }, 400)

    // Counted before the service is asked, every bucket every time (fail closed: a count the
    // database cannot make refuses). Over any, the characters are given back to all.
    const anonymous = isAnonymousSpeech(email)
    const buckets = [
      [
        `speak-chars:${email}`,
        anonymous ? ANONYMOUS_SPEECH.visitorCharsPerDay : SPEAK_LIMITS.accountCharsPerDay
      ],
      ['speak-chars', SPEAK_LIMITS.totalCharsPerDay],
      ...(anonymous ? [[`speak-chars:${ANONYMOUS_SPEECH.bucket}`, ANONYMOUS_SPEECH.totalCharsPerDay]] : [])
    ]
    const giveBack = () =>
      Promise.all(buckets.map(([bucket]) => count(bucket, -asked.chars, Infinity, DAY_MS))).catch(() => {})
    let over
    try {
      over = (
        await Promise.all(buckets.map(([bucket, max]) => count(bucket, asked.chars, max, DAY_MS)))
      ).some(Boolean)
    } catch {
      return json(c, { code: 'SPEAK_UNAVAILABLE' }, 503)
    }
    if (over) {
      await giveBack()
      return json(c, { code: 'SPEAK_QUOTA' }, 429)
    }

    const started = now()
    let abort = new AbortController()
    let cancelled = false
    let request = speechTtsRequest(snapshot, asked)
    let fallbackTimer = null
    const timer = setTimeout(() => abort.abort(), request.timeoutMs)
    const onGone = () => {
      cancelled = true
      abort.abort()
    }
    if (c.req.raw.signal?.aborted) onGone()
    const switchTimer = setInterval(() => {
      void watchSwitch().then((on) => {
        if (on === false) onGone()
      })
    }, switchEveryMs)
    switchTimer.unref?.()
    c.req.raw.signal?.addEventListener?.('abort', onGone)
    const said = (outcome, first = null) =>
      log.log(
        `[speech] said ${asked.chars} characters, ${outcome}${first === null ? '' : `, first sound ${first} ms`}, ${now() - started} ms`
      )

    let upstream
    let failed = null
    try {
      upstream = await fetchTts()
    } catch (error) {
      failed = error
    }
    // Once listening chose a provider, both halves stay on it. Standalone readings may try
    // the explicitly enabled target once, only before any response bytes reach the browser.
    if (
      (!upstream?.ok || !upstream.body || failed) &&
      !active &&
      !cancelled &&
      snapshot.alternative?.configured
    ) {
      await upstream?.body?.cancel().catch(() => {})
      clearTimeout(timer)
      if (abort.signal.aborted) abort = new AbortController()
      snapshot = snapshot.alternative
      asked.voice = speechVoices(snapshot)[0].id
      request = speechTtsRequest(snapshot, asked)
      fallbackTimer = setTimeout(() => abort.abort(), request.timeoutMs)
      try {
        upstream = await fetchTts()
        failed = null
      } catch (error) {
        failed = error
      }
    }
    if (failed || !upstream) {
      clearTimeout(timer)
      clearTimeout(fallbackTimer)
      clearInterval(switchTimer)
      c.req.raw.signal?.removeEventListener?.('abort', onGone)
      await giveBack()
      said(abort.signal.aborted ? 'no answer' : 'unreachable')
      return json(c, { code: 'SPEAK_PROVIDER' }, 502)
    }
    async function fetchTts() {
      return openSpeechTts(snapshot, asked, { fetchImpl, connect, signal: abort.signal })
    }
    clearTimeout(timer)
    clearTimeout(fallbackTimer)
    if (!upstream.ok || !upstream.body) {
      clearInterval(switchTimer)
      c.req.raw.signal?.removeEventListener?.('abort', onGone)
      await giveBack()
      const refusal = providerRefusal(upstream.status)
      // The service's own status word (`detail.status`), never its message: it may quote the request.
      const { word, type } = await upstream
        .json()
        .then(wordOf)
        .catch(() => ({ word: null, type: null }))
      // By the service's word, not the status: a made-up key is a 400 here (measured 18/10/2026), and
      // credits used up limit the account without hiding Voice.
      const failure = failureOf(word, type)
      if (!snapshot.fallbackUsed) {
        const outcome =
          snapshot.provider === 'voicestudio'
            ? [401, 403].includes(upstream.status)
              ? 'refused'
              : upstream.status !== 429
                ? 'unavailable'
                : null
            : failure
        if (outcome !== null)
          health.note('tts', outcome, word ?? type, { generation, revision: snapshot.revision })
      }
      said(`refused ${upstream.status}${word ? ` ${word}` : ''}`)
      return json(c, { code: refusal.code }, refusal.status)
    }

    if (!snapshot.fallbackUsed) health.note('tts', 'ok', null, { generation, revision: snapshot.revision })
    const reader = upstream.body.getReader()
    let first = null
    let ended = false
    const end = (outcome) => {
      if (ended) return
      ended = true
      clearInterval(switchTimer)
      c.req.raw.signal?.removeEventListener?.('abort', onGone)
      said(outcome, first)
    }
    const body = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            end('done')
            return
          }
          if (first === null) first = now() - started
          controller.enqueue(value)
        } catch {
          controller.error(new Error('speech stream broke'))
          end(abort.signal.aborted ? 'let go' : 'broken')
        }
      },
      cancel() {
        abort.abort()
        void reader.cancel().catch(() => {})
        end('let go')
      }
    })
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'cache-control': 'no-store',
        'x-sample-rate': String(SPEAK_SERVICE.sampleRate),
        'x-speech-provider': snapshot.provider,
        'x-speech-fallback': snapshot.fallbackUsed ? 'true' : 'false'
      }
    })
  })
}
