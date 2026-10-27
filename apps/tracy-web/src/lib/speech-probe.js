import { openSpeechTts } from './speech-tts.js'
import WebSocket from 'ws'
import { SPEAK_SERVICE } from './speech.js'
import { failureOf, wordOf } from './speech-health.js'
import { speechTtsRequest, speechVoices } from './speech-provider.js'
import { VoiceStudioListening } from './speech-voicestudio.js'
const PROBE_MS = 10_000
const READ_SERVICE = 'https://api.elevenlabs.io/v1/text-to-speech'
const PROBE_VOICE = 'EXAVITQu4vr4xnSDxMaL'
const serviceAddress = () =>
  new URL(
    'wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=vad&include_language_detection=true'
  )
/**
 * Try speech to text: open a realtime session with the key and close it — no audio is sent.
 * @param {{ key: string, connect?: (address: URL, options: object) => WebSocket, timeoutMs?: number }} deps
 * @returns {Promise<{ outcome: Outcome | null, reason: string | null }>} null: nothing could be told
 */
export function probeListening({
  key,
  connect = (address, options) => new WebSocket(address, options),
  timeoutMs = PROBE_MS
}) {
  return new Promise((resolve) => {
    let done = false
    /** @type {WebSocket | null} */
    let socket = null
    const finish = (/** @type {Outcome | null} */ outcome, /** @type {string | null} */ reason = null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        socket?.terminate()
      } catch {
        // Already closed.
      }
      resolve({ outcome, reason })
    }
    const timer = setTimeout(() => finish(null, 'timeout'), timeoutMs)
    try {
      socket = connect(serviceAddress(), {
        headers: { 'xi-api-key': key },
        perMessageDeflate: false,
        handshakeTimeout: timeoutMs
      })
    } catch {
      return finish(null, 'unreachable')
    }
    socket.on('unexpected-response', (_request, response) => {
      const status = response.statusCode ?? 0
      // The service's own word in the answer decides (`lib/speech-health.js` `failureOf`).
      let body = ''
      response.on('data', (chunk) => {
        if (body.length < 2000) body += chunk
      })
      response.on('end', () => {
        let parsed = null
        try {
          parsed = JSON.parse(body)
        } catch {
          // Not the service's JSON: nothing known of the key.
        }
        const { word, type } = wordOf(parsed)
        finish(failureOf(word, type), word ?? `HTTP ${status}`)
      })
      response.on('error', () => finish(null, `HTTP ${status}`))
    })
    socket.on('message', (data) => {
      let message = null
      try {
        message = JSON.parse(data.toString())
      } catch {
        return
      }
      const type = typeof message?.message_type === 'string' ? message.message_type : ''
      if (type === 'session_started') return finish('ok')
      if (/permission/i.test(String(message?.error ?? ''))) return finish('refused', 'missing_permissions')
      const failure = failureOf(type)
      if (failure !== null) return finish(failure, type)
      if (type.endsWith('error')) return finish(null, type)
    })
    socket.on('error', () => finish(null, 'unreachable'))
    socket.on('close', () => finish(null, 'closed'))
  })
}

/**
 * Try text to speech: read one character with the key.
 * @param {{ key: string, fetchImpl?: typeof fetch, timeoutMs?: number }} deps
 * @returns {Promise<{ outcome: Outcome | null, reason: string | null }>}
 */
export async function probeReading({ key, fetchImpl = fetch, timeoutMs = PROBE_MS }) {
  const url = new URL(`${READ_SERVICE}/${PROBE_VOICE}/stream`)
  url.searchParams.set('output_format', SPEAK_SERVICE.format)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'application/octet-stream' },
      body: JSON.stringify({ text: '.', model_id: SPEAK_SERVICE.model }),
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (res.ok) {
      await res.body?.cancel().catch(() => {})
      return { outcome: 'ok', reason: null }
    }
    // By the service's word, not the status: a made-up key is a 400 here (measured 18/10/2026).
    const { word, type } = await res
      .json()
      .then(wordOf)
      .catch(() => ({ word: null, type: null }))
    return { outcome: failureOf(word, type), reason: word ?? type ?? `HTTP ${res.status}` }
  } catch {
    return { outcome: null, reason: 'unreachable' }
  }
}

/** Probe a draft or saved snapshot without changing the active profile. Local tests may warm models. */
export async function probeSpeechProfile(snapshot, { fetchImpl = fetch, connect } = {}) {
  if (!snapshot.configured)
    return {
      stt: { outcome: 'refused', reason: 'not_configured' },
      tts: { outcome: 'refused', reason: 'not_configured' }
    }
  const local = snapshot.provider === 'voicestudio'
  const listening = local
    ? new Promise((resolve) => {
        const socket = new VoiceStudioListening(snapshot, connect ? { connect } : {})
        let done = false
        const finish = (outcome, reason = null) => {
          if (done) return
          done = true
          clearTimeout(timer)
          socket.terminate()
          resolve({ outcome, reason })
        }
        const timer = setTimeout(() => finish('unavailable', 'timeout'), 90_000)
        socket.on('message', (raw) => {
          const message = JSON.parse(raw.toString())
          if (message.message_type === 'session_started') {
            socket.send(JSON.stringify({ audio_base_64: Buffer.alloc(9600).toString('base64') }))
            socket.send(JSON.stringify({ commit: true }))
          }
          if (message.message_type === 'committed_transcript') finish('ok')
          if (message.message_type.endsWith('_error'))
            finish(
              /HTTP_(401|403)/.test(message.error) ? 'refused' : 'unavailable',
              /^[a-zA-Z0-9_]{1,80}$/.test(message.error) ? message.error : 'provider_error'
            )
        })
        socket.on('close', () => finish('unavailable', 'closed'))
      })
    : probeListening({ key: snapshot.key, ...(connect ? { connect } : {}) })
  // Local engines share GPU admission; the probe must not saturate its own server.
  if (local) await listening
  const reading = (async () => {
    const asked = {
      text: ['eleven_v4', 'eleven_v4_turbo'].includes(snapshot.profile.ttsModel) ? 'Ready.' : '.',
      voice: speechVoices(snapshot)[0].id,
      language: null
    }
    const req = speechTtsRequest(snapshot, asked)
    try {
      const res = await openSpeechTts(snapshot, asked, {
        fetchImpl,
        connect,
        signal: AbortSignal.timeout(req.timeoutMs)
      })
      if (res.ok) {
        await res.body?.cancel().catch(() => {})
        return { outcome: 'ok', reason: null }
      }
      const body = await res.json().catch(() => null)
      const code = body?.error?.code ?? body?.detail?.code ?? body?.detail?.status
      return {
        outcome: local
          ? [401, 403].includes(res.status)
            ? 'refused'
            : res.status !== 429
              ? 'unavailable'
              : null
          : failureOf(wordOf(body).word, wordOf(body).type),
        reason: typeof code === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(code) ? code : `HTTP ${res.status}`
      }
    } catch {
      return { outcome: local ? 'unavailable' : null, reason: 'unreachable_or_timeout' }
    }
  })()
  const [stt, tts] = await Promise.all([listening, reading])
  return {
    stt: { ...stt, check: local ? 'audio_finalization' : 'handshake' },
    tts: { ...tts, check: 'short_speech' }
  }
}
