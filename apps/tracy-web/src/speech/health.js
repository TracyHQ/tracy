/** Speech health for the configured primary, checked every ten minutes and after Apply.
 * Local probes finalize a short silent stream to exercise model/license gates; cloud STT probes
 * only open a session, so remaining audio quota is not promised. TTS generates one character.
 * Results are tied to the configuration revision. Transient cloud failures leave the previous
 * key result standing; local unavailability has its own outcome and reason.
 */
import { probeSpeechProfile, probeListening, probeReading } from '../lib/speech-probe.js'
import { speechHealth } from '../lib/speech-health.js'

/** How often the key is tried while voice is on. */
export const HEALTH_EVERY_MS = 10 * 60_000
/** How long one try may take before it says nothing. */
export const PROBE_MS = 10_000

export { probeListening, probeReading } from '../lib/speech-probe.js'

/**
 * Try the key now and every {@link HEALTH_EVERY_MS} while voice is on; again soon after a key is saved.
 * @param {{
 *   readKey: () => Promise<string | null>,
 *   switchOn: () => Promise<boolean>,
 *   health?: ReturnType<typeof createSpeechHealth>,
 *   fetchImpl?: typeof fetch,
 *   connect?: (address: URL, options: object) => WebSocket,
 *   log?: { log: (...a: any[]) => void, warn: (...a: any[]) => void },
 *   every?: number
 * }} deps
 * @returns {{ check: () => Promise<void>, stop: () => void }}
 */
export function startSpeechHealth({
  readKey,
  readProfile,
  switchOn,
  health = speechHealth,
  fetchImpl = fetch,
  connect,
  log = console,
  every = HEALTH_EVERY_MS
}) {
  /** The try under way: a second ask waits for it rather than starting another. @type {Promise<void> | null} */
  let running = null
  /** A key was saved while a try was under way: one more try, of the new key, once that one ends. */
  let again = false
  const check = () => {
    if (running) return running
    running = tryKey().finally(() => {
      running = null
      if (again) {
        again = false
        void check()
      }
    })
    return running
  }
  const tryKey = async () => {
    // The generation of the key tried: a key saved meanwhile drops what this try finds (`note`).
    const generation = health.generation()
    const on = await switchOn().catch(() => false)
    if (readProfile && on) {
      const snapshot = await readProfile().catch(() => null)
      if (!snapshot) return
      health.bind(snapshot.revision)
      const result = await probeSpeechProfile(snapshot, { fetchImpl, connect })
      const current = await readProfile().catch(() => null)
      if (current?.revision !== snapshot.revision) return
      for (const part of ['stt', 'tts'])
        if (result[part].outcome !== null)
          health.note(part, result[part].outcome, result[part].reason, {
            revision: snapshot.revision,
            probe: true
          })
      return
    }
    const key = on && readKey ? await readKey().catch(() => null) : null
    if (!key) return
    const [listening, reading] = await Promise.all([
      probeListening({ key, ...(connect ? { connect } : {}) }),
      probeReading({ key, fetchImpl })
    ])
    // Another key was saved while this one was tried: nothing it found is about the key now.
    if (generation !== health.generation()) return
    for (const [part, result] of /** @type {const} */ ([
      ['stt', listening],
      ['tts', reading]
    ])) {
      if (result.outcome === null) continue
      const was = health.get()[part]?.outcome ?? null
      health.note(part, result.outcome, result.reason, { generation, probe: true })
      if (result.outcome === 'refused' && was !== 'refused')
        log.warn(
          `[speech] the service refuses the key for ${part === 'stt' ? 'speech to text' : 'text to speech'}: ${result.reason}`
        )
      if (result.outcome === 'ok' && was === 'refused')
        log.log(
          `[speech] the service takes the key again for ${part === 'stt' ? 'speech to text' : 'text to speech'}`
        )
    }
  }
  const timer = setInterval(() => void check(), every)
  timer.unref?.()
  health.onKick(() => {
    health.reset()
    // A try of the old key still running ends unheard (its generation is gone); the new key is tried
    // after it, never left untried until the next round.
    if (running) again = true
    else void check()
  })
  void check()
  return {
    check,
    stop() {
      clearInterval(timer)
      health.onKick(null)
    }
  }
}
