/** Tracy's adapter for voicestudio.speech.v1. No VoiceStudio source or model is bundled. */
import { speechLookup } from './speech-network.js'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

const BYTES_PER_SECOND = 32_000
/**
 * Audio held while the server finishes the last phrase: at most this much (160 KB per session).
 * A slow server is not a failure, so a full hold never ends the session (until 20/10/2026 it ended
 * it as `provider`): the oldest held audio gives way to the newest, and the relay tells the page
 * its last words may be missing (`droppedBytes`, `speech/relay.js`). Raising the bound would only
 * trade that for memory on the host.
 */
const HELD_MAX_BYTES = BYTES_PER_SECOND * 5
/** A pause inside held audio is kept to this much: the rest of it carries no words but fills the hold. */
const HELD_PAUSE_BYTES = BYTES_PER_SECOND * 0.5
export function pcmLoud(frame) {
  let sum = 0
  for (let i = 0; i + 1 < frame.length; i += 2) sum += frame.readInt16LE(i) ** 2
  return frame.length > 0 && Math.sqrt(sum / (frame.length / 2)) >= 500
}

/** Exposes the transport interface the shared relay uses; Scribe quirks stay outside this adapter. */
export class VoiceStudioListening extends EventEmitter {
  constructor(
    snapshot,
    { connect = (url, options) => new WebSocket(url, options), timeoutMs = 90_000 } = {}
  ) {
    super()
    this.snapshot = snapshot
    this.connect = connect
    this.timeoutMs = timeoutMs
    this.readyState = WebSocket.CONNECTING
    this.bufferedAmount = 0
    /** Held PCM frames (see `HELD_MAX_BYTES`); `bufferedAmount` is their size while held. */
    this.pending = []
    this.heldQuiet = 0
    /** Held audio given way to newer audio; the relay reads it when the session ends. */
    this.droppedBytes = 0
    this.closed = false
    this.terminal = false
    this.finishing = false
    this.generation = 0
    this.openBackend(true)
  }
  /**
   * Audio taken that no transcript answers yet although the relay saw the last phrase finished:
   * audio held while that phrase was being finished, or sent on from the hold since. A stop waits for it.
   */
  get unanswered() {
    return this.pending.length > 0 || this.spoken
  }
  forward(message) {
    this.emit('message', Buffer.from(JSON.stringify(message)))
  }
  fail(reason) {
    if (this.closed) return
    this.forward({ message_type: 'provider_error', error: reason })
    this.terminate()
  }
  openBackend(initial = false) {
    if (this.closed) return
    const generation = ++this.generation
    const url = new URL(`${this.snapshot.profile.baseUrl}/v1/audio/transcriptions/stream`)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.search = 'pcm=1&sr=16000'
    let ws
    try {
      ws = this.ws = this.connect(url, {
        headers: this.snapshot.key ? { authorization: `Bearer ${this.snapshot.key}` } : {},
        perMessageDeflate: false,
        handshakeTimeout: 10_000,
        followRedirects: false,
        lookup: speechLookup,
        maxPayload: 256_000
      })
    } catch {
      queueMicrotask(() => this.fail('unreachable'))
      return
    }
    this.timer = setTimeout(() => this.fail('startup_timeout'), this.timeoutMs)
    this.spoken = false
    this.lead = []
    this.leadBytes = 0
    this.quietBytes = 0
    ws.on('open', () => {
      if (this.closed || generation !== this.generation) return
      this.readyState = WebSocket.OPEN
      if (initial) this.emit('open')
    })
    ws.on('message', (data) => {
      if (this.closed || generation !== this.generation) return
      let msg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return this.fail('protocol_invalid')
      }
      if (msg.type === 'session.started') {
        if (msg.protocol !== 'voicestudio.speech.v1') return this.fail('protocol_unsupported')
        clearTimeout(this.timer)
        this.finishing = false
        if (initial) this.forward({ message_type: 'session_started' })
        const frames = this.pending.splice(0)
        this.bufferedAmount = 0
        this.heldQuiet = 0
        for (const frame of frames) this.sendPcm(frame)
        if (this.terminal && !this.finishing) this.finish()
      }
      if (msg.type === 'partial' && this.spoken && typeof msg.text === 'string')
        this.forward({ message_type: 'partial_transcript', text: msg.text })
      // Utterance events can precede the authoritative whole-session summary. Committing both
      // duplicates speech. Our bounded utterance sessions consume only the summary.
      if (msg.type === 'final' && (msg.final_kind === 'summary' || msg.final_kind === undefined)) {
        if (this.summarySeen === generation) return
        this.summarySeen = generation
        clearTimeout(this.timer)
        this.forward({
          message_type: 'committed_transcript',
          text: this.spoken && typeof msg.text === 'string' ? msg.text : ''
        })
        if (this.closed) return
        if (this.terminal) return this.terminate()
        ++this.generation
        ws.close()
        this.openBackend()
      }
      if (msg.type === 'error') this.fail(typeof msg.code === 'string' ? msg.code : 'provider_error')
    })
    ws.on('unexpected-response', (_req, res) => {
      res.resume?.()
      this.fail(`HTTP_${res.statusCode}`)
    })
    ws.on('error', () => {
      if (generation === this.generation) this.fail('unreachable')
    })
    ws.on('close', () => {
      if (!this.closed && generation === this.generation) this.fail('closed')
    })
  }
  send(raw) {
    if (this.closed) return
    const msg = JSON.parse(raw.toString())
    if (msg.commit) {
      this.terminal = true
      if (!this.finishing && this.ws?.readyState === WebSocket.OPEN) this.finish()
      return
    }
    const pcm = Buffer.from(msg.audio_base_64 ?? '', 'base64')
    if (!pcm.length) return
    this.sendPcm(pcm)
  }
  sendPcm(pcm) {
    if (this.finishing || this.ws?.readyState !== WebSocket.OPEN) return this.hold(pcm)
    const loud = pcmLoud(pcm)
    // Whisper can invent words from a fresh stream of silence. Keep a short leading buffer,
    // but start inference only after real signal, and never publish words from silent input.
    if (!this.spoken && !loud) {
      this.lead.push(pcm)
      this.leadBytes += pcm.length
      while (this.leadBytes > BYTES_PER_SECOND * 0.5) this.leadBytes -= this.lead.shift().length
      return
    }
    for (const frame of this.lead) this.ws.send(frame)
    this.lead = []
    this.leadBytes = 0
    this.ws.send(pcm)
    this.bufferedAmount = this.ws.bufferedAmount
    if (loud) {
      this.spoken = true
      this.quietBytes = 0
    } else if (this.spoken) this.quietBytes += pcm.length
    if (this.spoken && this.quietBytes >= BYTES_PER_SECOND * 0.8) this.finish()
  }
  /** Audio spoken while the server is busy, kept for the next phrase within `HELD_MAX_BYTES`. */
  hold(pcm) {
    const loud = pcmLoud(pcm)
    // Silence during inference need not become input to the next utterance; once speech resumes
    // its pauses are kept, each to `HELD_PAUSE_BYTES`, so the hold fills with words, not gaps.
    if (!this.pending.length && !loud) return
    if (loud) this.heldQuiet = 0
    else if ((this.heldQuiet += pcm.length) > HELD_PAUSE_BYTES) return
    this.pending.push(pcm)
    this.bufferedAmount += pcm.length
    while (this.bufferedAmount > HELD_MAX_BYTES) {
      const oldest = this.pending.shift()
      this.bufferedAmount -= oldest.length
      this.droppedBytes += oldest.length
    }
  }
  finish() {
    if (this.finishing || this.closed) return
    this.finishing = true
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.fail('final_timeout'), this.timeoutMs)
    // An explicit silent probe still exercises engine finalization; its text is suppressed above.
    for (const frame of this.lead) this.ws.send(frame)
    this.lead = []
    this.leadBytes = 0
    this.ws.send(JSON.stringify({ type: 'input_audio.end' }))
  }
  terminate() {
    if (this.closed) return
    this.closed = true
    ++this.generation
    clearTimeout(this.timer)
    this.pending = []
    this.lead = []
    this.leadBytes = 0
    this.readyState = WebSocket.CLOSED
    this.ws?.terminate()
    this.emit('close')
  }
}
