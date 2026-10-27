/**
 * Voice input's HTTP doors. The live session itself is a WebSocket the `upgrade` event hands to
 * `relay.js` (`server.js`); these say whether there is one to open, and read Tracy's replies out loud.
 *
 *   GET  /api/speech         → {available, sessionSeconds, silenceSeconds, voices, speak}
 *   GET  /api/speech/stream  → 426 `UPGRADE_REQUIRED` when asked over plain HTTP
 *   POST /api/speech/say     → a reply spoken (`say.js`)
 *   POST /api/speech/trace   → how long a voice turn took, as the page heard it (`trace.js`)
 *
 * `available` is false while this deployment has no speech key (saved on /ops › Agents › Voice, else
 * `SPEECH_TO_TEXT_API_KEY`; `lib/speech.js` `readSpeechKey`) or the
 * operator has voice off (switch `composer-voice-input`, /ops › Agents › Voice; a switch the
 * database cannot read counts as off): the chat box then draws no microphone. It does not promise the service will take the key — a key without
 * the speech permission is refused when a session opens, and that session ends with `provider`.
 * Where `available` is true the chat's header also offers a voice conversation (the same switch,
 * `lib/speech.js`): `voices` are the voices a customer may pick, the first the default, and `speak` the
 * longest reading `POST /api/speech/say` takes and the rate its sound comes at.
 * No session → 401 `NOT_SIGNED_IN`.
 */
import {
  readSpeechProfile,
  speechVoices,
  speechCapabilities,
  speechSpeakFacts
} from '../lib/speech-provider.js'
import { speechHealth } from '../lib/speech-health.js'
import { Hono } from 'hono'
import { json, requireViewer } from '../lib/http.js'
import { memoryRateLimiter, overLimitBy } from '../lib/rate.js'
import { speechSwitchOn } from '../lib/speech.js'
import { SPEECH_LIMITS, SPEECH_STREAM_PATH } from './relay.js'
import { mountSpeak } from './say.js'
import { mountTrace } from './trace.js'

/**
 * @param {{
 *   config: {sessionSecret: string, speech: {apiKey: string} | null},
 *   pool?: import('pg').Pool | null,
 *   fetchImpl?: typeof fetch,
 *   log?: { log: (...a: any[]) => void, warn: (...a: any[]) => void }
 * }} deps - `fetchImpl` reaches the speech service for a spoken reply (tests hand in a stand-in).
 */
export function speechRoutes({
  config,
  pool = null,
  fetchImpl = fetch,
  connect,
  log = console,
  health = speechHealth,
  signals
}) {
  const app = new Hono()

  app.get('/api/speech', async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    c.header('cache-control', 'no-store')
    const snapshot = await readSpeechProfile(pool, config).catch(() => null)
    if (snapshot) health.bind(snapshot.revision)
    const effective =
      snapshot?.alternative?.configured && (!snapshot.configured || health.refused('stt', snapshot.revision))
        ? snapshot.alternative
        : snapshot
    const keyed = Boolean(
      (snapshot?.configured || snapshot?.alternative?.configured) &&
        (!health.refused('stt', snapshot?.revision) || snapshot?.alternative?.configured)
    )
    return json(c, {
      available: keyed && (await speechSwitchOn(pool).catch(() => false)),
      sessionSeconds: SPEECH_LIMITS.sessionSeconds,
      silenceSeconds: SPEECH_LIMITS.silenceSeconds,
      transcriptWaitMs: effective?.provider === 'voicestudio' ? 90_000 : 6000,
      revision: snapshot?.revision ?? null,
      provider: snapshot?.provider ?? null,
      actualProvider: effective?.provider ?? null,
      capabilities: effective ? speechCapabilities(effective) : null,
      fallbackUsed: Boolean(effective?.fallbackUsed),
      voices: (effective ? speechVoices(effective) : []).map(({ id, name }) => ({ id, name })),
      speak:
        health.refused('tts', snapshot?.revision) && !snapshot?.alternative?.configured
          ? undefined
          : effective
            ? speechSpeakFacts(effective)
            : undefined
    })
  })

  // A real handshake never reaches Hono (`server.js` takes the `upgrade` event); a plain GET here
  // would otherwise fall through to the dsh catch-all and answer with a page.
  app.get(SPEECH_STREAM_PATH, (c) => {
    c.header('upgrade', 'websocket')
    return json(c, { code: 'UPGRADE_REQUIRED' }, 426)
  })

  // The characters a reading costs, in the same `rate_bucket` windows as every limit; in this
  // process's memory without a pool (a laptop on the memory store).
  const memory = memoryRateLimiter()
  const count = pool
    ? (bucket, amount, max, windowMs) => overLimitBy(pool, bucket, amount, max, Date.now(), windowMs)
    : async (bucket, amount, max, windowMs) => memory.overLimitBy(bucket, amount, max, Date.now(), windowMs)
  mountSpeak(app, { config, pool, count, fetchImpl, connect, log, health })
  mountTrace(app, { config, pool, ...(signals ? { signals } : {}) })

  return app
}
