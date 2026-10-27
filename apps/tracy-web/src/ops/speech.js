/**
 * `/ops` › Agents › Voice — voice input in the customer's chat box, for the operator.
 *
 *   GET  /api/ops/speech           → { on, configured, key, writable, service, limits, today, speak }
 *   PUT  /api/ops/speech/key       { apiKey } → the same document; an empty `apiKey` removes the key
 *   POST /api/ops/speech/key/test  { apiKey? } → { ok } or { ok: false, status, reason, message }
 *
 * `on` is the User Interface switch `composer-voice-input` (`lib/speech.js`), or `null` when the
 * database could not say; the screen presses it through `PUT /api/ops/ui`, the one door every switch
 * goes through, so this screen and /ops › User Interface can never disagree.
 *
 * The speech key is typed here instead of set in the environment (15/10/2026): saved sealed
 * in `speech_setting`, used before `SPEECH_TO_TEXT_API_KEY`, which stays the fallback while nothing
 * is saved. `key` says where the key in use comes from and a hint of it, never the key. The test
 * asks the speech service for a realtime session token with the typed key, or the one in use, and
 * says what the service answered (a key without the Speech to Text permission says so).
 *
 * Everyone who may see /ops may read; saving or testing a key is an owner's or admin's, from this
 * origin. `today` is the started minutes and accounts of the current UTC day, the window the daily
 * budget counts in, or `null` without a database.
 *
 * `speak` is the voice conversation the same switch turns on (`speech/say.js`): who reads Tracy's
 * replies out loud, its character limits, and today's characters and accounts (`null` without a
 * database). The key needs the Text to Speech permission for it; the Test above checks only Speech to
 * Text, since a reading costs characters.
 *
 * `turns` is how long voice turns took over the last day and the last seven, as the pages timed them
 * (`speech/trace.js`, `lib/voice-trace.js`; council 19/10/2026): each span's median and 95th
 * percentile with the turns it stands on, and the shares that failed or were cut off — by the Usage
 * rules, Tracy staff left out (`null` without a database).
 *
 *   PUT  /api/ops/speech/keyterms  { sites } → the same document
 *
 * `keyterms` is the keyterms pilot (council 19/10/2026, A1; `lib/speech-keyterms.js`): the site keys
 * whose voice sessions hand the speech service the site's own names — none by default, an empty list
 * is the pilot off — and the bounds a list keeps. An owner or admin sets the list, from this origin;
 * it holds on the next voice session, as the key does. `null` when it cannot be read.
 */
import { Hono } from 'hono'
import {
  parseSpeechKey,
  readSpeechKey,
  saveSpeechKey,
  SPEAK_LIMITS,
  SPEAK_SERVICE,
  speakUsageToday,
  SPEECH_LIMITS,
  SPEECH_SERVICE,
  speechKeyFacts,
  speechSwitchOn,
  speechUsageToday,
  testSpeechKey
} from '../lib/speech.js'
import {
  parseSpeechProfile,
  readSpeechProfile,
  saveSpeechProfile,
  speechProfileFacts,
  speechServices
} from '../lib/speech-provider.js'
import { speechRuntimeFacts } from '../lib/speech-session.js'
import { speechHealth } from '../lib/speech-health.js'
import { probeSpeechProfile } from '../lib/speech-probe.js'
import { discoverSpeechModels, readSpeechModels, saveSpeechModels } from '../lib/speech-models.js'
import { voiceTurnSummary } from '../lib/voice-trace.js'
import { KEYTERM_LIMITS, keytermSites, parseKeytermSites, saveKeytermSites } from '../lib/speech-keyterms.js'
import { admit, denied } from './admit.js'

/**
 * @param {{
 *   pool: import('pg').Pool | null,
 *   config: { origin: string, sessionSecret: string, speech?: { apiKey: string } | null },
 *   now?: () => number,
 *   fetchImpl?: typeof fetch,
 *   log?: { log: (...a: any[]) => void }
 * }} deps
 */
export function speechOpsRoutes({
  pool,
  config,
  now = Date.now,
  fetchImpl = fetch,
  localFetch,
  log = console,
  health = speechHealth
}) {
  const app = new Hono()

  /** Staff read; an owner or admin, from this origin, writes and tests a key. */
  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      // The PUBLIC origin, not the request's: behind the tunnel this app is handed plain http.
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  const doc = async (who) => {
    const snapshot = await readSpeechProfile(pool, config).catch(() => null)
    if (snapshot) health.bind?.(snapshot.revision)
    const services = snapshot ? speechServices(snapshot) : null
    const key = await speechKeyFacts(pool, config).catch(() => null)
    return {
      on: await speechSwitchOn(pool).catch(() => null),
      configured: snapshot?.configured ?? false,
      provider: snapshot ? speechProfileFacts(snapshot) : null,
      health: health.get(),
      runtime: snapshot ? speechRuntimeFacts(snapshot.revision) : null,
      key,
      writable: ['owner', 'admin'].includes(who.role),
      service: services?.listening ?? SPEECH_SERVICE,
      limits: {
        sessionSeconds: SPEECH_LIMITS.sessionSeconds,
        silenceSeconds: SPEECH_LIMITS.silenceSeconds,
        accountMinutesPerDay: SPEECH_LIMITS.accountMinutesPerDay,
        totalMinutesPerDay: SPEECH_LIMITS.totalMinutesPerDay
      },
      today: pool ? await speechUsageToday(pool, now()).catch(() => null) : null,
      speak: {
        service: services?.speaking ?? { provider: SPEAK_SERVICE.provider, model: SPEAK_SERVICE.model },
        limits: { ...SPEAK_LIMITS },
        today: pool ? await speakUsageToday(pool, now()).catch(() => null) : null
      },
      turns: pool ? await voiceTurnSummary(pool, now()).catch(() => null) : null,
      keyterms: await keytermSites(pool).then(
        (sites) => ({
          sites,
          limits: { sites: KEYTERM_LIMITS.sites, terms: KEYTERM_LIMITS.target, chars: KEYTERM_LIMITS.chars }
        }),
        () => null
      )
    }
  }

  app.get('/api/ops/speech', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    return c.json(await doc(g.who))
  })

  app.on(['GET', 'POST'], '/api/ops/speech/providers/:provider/models', async (c) => {
    const refresh = c.req.method === 'POST'
    const g = await guard(c, { write: refresh })
    if (g.deny) return g.deny
    const provider = c.req.param('provider')
    if (!['elevenlabs', 'voicestudio'].includes(provider)) return c.json({ error: 'PROVIDER_UNKNOWN' }, 400)
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const snapshot = await readSpeechProfile(pool, config, { provider, profile: {} })
    c.header('cache-control', 'no-store')
    if (refresh) {
      const found = await discoverSpeechModels(snapshot, { fetchImpl, ...(localFetch ? { localFetch } : {}) })
      if (found.error)
        return c.json({ ...(await readSpeechModels(pool, snapshot, config.sessionSecret)), ...found })
      await saveSpeechModels(pool, snapshot, config.sessionSecret, found.models, now())
    }
    return c.json(await readSpeechModels(pool, snapshot, config.sessionSecret))
  })

  app.put('/api/ops/speech/key', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const body = await c.req.json().catch(() => null)
    const parsed = parseSpeechKey(body?.apiKey)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    await saveSpeechKey(pool, parsed.key, config.sessionSecret, g.who.email)
    const snapshot = await readSpeechProfile(pool, config)
    health.bind?.(snapshot.revision)
    log.log(`[speech] key ${parsed.key === '' ? 'removed' : 'saved'} on /ops by ${g.who.email}`)
    // A new key is tried at once: the old one's answer says nothing about it.
    health.kick()
    c.header('cache-control', 'no-store')
    return c.json(await doc(g.who))
  })

  app.post('/api/ops/speech/key/test', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => ({}))
    const parsed = body?.apiKey === undefined ? { ok: true, key: '' } : parseSpeechKey(body.apiKey)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    const key = parsed.key !== '' ? parsed.key : (await readSpeechKey(pool, config).catch(() => null))?.key
    if (!key) return c.json({ ok: false, status: 0, reason: 'no_key', message: 'No key to test.' })
    c.header('cache-control', 'no-store')
    return c.json(await testSpeechKey(key, fetchImpl))
  })

  app.put('/api/ops/speech/keyterms', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const parsed = parseKeytermSites((await c.req.json().catch(() => null))?.sites)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    await saveKeytermSites(pool, parsed.sites, g.who.email)
    // How many sites, never which words: the names are read per session, not here.
    log.log(`[speech] keyterms pilot set to ${parsed.sites.length} site(s) on /ops by ${g.who.email}`)
    c.header('cache-control', 'no-store')
    return c.json(await doc(g.who))
  })

  app.post('/api/ops/speech/provider/test', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const parsed = parseSpeechProfile(await c.req.json().catch(() => null))
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    const snapshot = await readSpeechProfile(pool, config, parsed)
    c.header('cache-control', 'no-store')
    return c.json(await probeSpeechProfile(snapshot, { fetchImpl }))
  })
  app.put('/api/ops/speech/provider', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const parsed = parseSpeechProfile(await c.req.json().catch(() => null))
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    await saveSpeechProfile(pool, parsed, config.sessionSecret, g.who.email)
    const snapshot = await readSpeechProfile(pool, config)
    health.bind?.(snapshot.revision)
    health.kick()
    c.header('cache-control', 'no-store')
    return c.json(await doc(g.who))
  })
  return app
}
