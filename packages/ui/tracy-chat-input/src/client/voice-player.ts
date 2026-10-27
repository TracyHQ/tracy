/**
 * The speakers, for a voice conversation (`voice-mode.mjs`): Tracy's voice as it arrives from
 * `POST /api/speech/say`, played chunk after chunk with no gap, and how loud it is now for the bars.
 *
 * 🔒 THE AudioContext IS MADE IN THE PRESS (`openPlayer` is called by Start, `VoiceMode.tsx`): a
 * browser lets a page start sound only from the person's press; made later, Safari keeps it
 * suspended and every reply would play as silence (as for the microphone, `voice-capture.ts`).
 *
 * Each chunk becomes one AudioBuffer, scheduled to start where the one before ends; the context
 * resamples Tracy's 24 kHz to the device's rate itself. A chunk late from the network starts as soon
 * as it can, a moment of silence rather than a lost word.
 */
import { pcmSamples } from './voice-pcm-out.mjs'

/** What `voice-mode.mjs` plays through. */
export interface Player {
  /**
   * Play a sound to its end, or until `stop()`. Resolves either way. `onStart` is told once, when the
   * first chunk is scheduled, when it will be heard: `performance.now()` plus how far ahead of the
   * context's clock `source.start(at)` was set — the page's own clock, never the server's (the
   * per-turn trace, `voice-mode.mjs`; council 19/10/2026).
   */
  play(sound: ReadableStream<Uint8Array>, sampleRate: number, onStart?: (at: number) => void): Promise<void>
  stop(): void
  /** Turn Tracy down while the person may be talking over it, or back up. */
  duck(on: boolean): void
  /** How loud the sound playing is now, 0…1. */
  level(): number
  close(): Promise<void>
}

/** Tracy's volume while the person may be talking over it. */
const DUCKED = 0.25
/** Room left before the first chunk plays, so a second one arrives in time. */
const LEAD_SECONDS = 0.08
/**
 * A stream that sends nothing for this long is let go: what arrived plays to its end, and the voice
 * goes on (the server bounds only the wait for the first byte, `speech/say.js` `ANSWER_MS`).
 */
export const STALL_MS = 6000

export function openPlayer(): Player {
  const Context = globalThis.AudioContext
  const context = Context ? new Context() : null
  void context?.resume().catch(() => {})
  const analyser = context?.createAnalyser() ?? null
  const volume = context?.createGain() ?? null
  if (analyser && volume && context) {
    analyser.fftSize = 512
    analyser.connect(volume)
    volume.connect(context.destination)
  }
  const samples = new Float32Array(512)
  let playing: Set<AudioBufferSourceNode> = new Set()
  let stopCurrent: (() => void) | null = null

  return {
    async play(sound, sampleRate, onStart) {
      if (!context || !analyser) {
        await sound.cancel().catch(() => {})
        return
      }
      if (context.state === 'suspended') await context.resume().catch(() => {})
      const reader = sound.getReader()
      const pcm = pcmSamples()
      const sources = new Set<AudioBufferSourceNode>()
      playing = sources
      let next = 0
      let stopped = false
      let lastEnded: Promise<void> = Promise.resolve()
      stopCurrent = () => {
        stopped = true
        void reader.cancel().catch(() => {})
        for (const source of sources) {
          try {
            source.stop()
          } catch {
            // Never started.
          }
        }
        sources.clear()
      }
      try {
        for (;;) {
          let timer: ReturnType<typeof setTimeout> | undefined
          const stalled = new Promise<'stalled'>((resolve) => {
            timer = setTimeout(() => resolve('stalled'), STALL_MS)
          })
          const read = await Promise.race([reader.read(), stalled])
          clearTimeout(timer)
          if (read === 'stalled') {
            void reader.cancel().catch(() => {})
            break
          }
          const { done, value } = read
          if (done || stopped) break
          const chunk = pcm.push(value)
          if (chunk.length === 0) continue
          const buffer = context.createBuffer(1, chunk.length, sampleRate)
          buffer.copyToChannel(chunk, 0)
          const source = context.createBufferSource()
          source.buffer = buffer
          source.connect(analyser)
          const at = Math.max(next, context.currentTime + (next === 0 ? LEAD_SECONDS : 0.01))
          source.start(at)
          if (next === 0) onStart?.(performance.now() + Math.max(0, at - context.currentTime) * 1000)
          next = at + buffer.duration
          sources.add(source)
          lastEnded = new Promise((resolve) => {
            source.onended = () => {
              sources.delete(source)
              resolve()
            }
          })
        }
      } catch {
        // The connection broke: what arrived plays to its end.
      }
      if (!stopped) await lastEnded
      if (playing === sources) stopCurrent = null
    },
    stop() {
      stopCurrent?.()
      stopCurrent = null
    },
    duck(on) {
      if (!volume || !context) return
      volume.gain.setTargetAtTime(on ? DUCKED : 1, context.currentTime, 0.04)
    },
    level() {
      if (!analyser || playing.size === 0) return 0
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const sample of samples) sum += sample * sample
      return Math.min(1, Math.sqrt(sum / samples.length) * 4)
    },
    async close() {
      stopCurrent?.()
      stopCurrent = null
      await context?.close().catch(() => {})
    }
  }
}
