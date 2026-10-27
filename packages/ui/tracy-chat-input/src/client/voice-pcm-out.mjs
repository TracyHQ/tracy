/**
 * Sound in both directions of a voice conversation, as numbers (`voice-player.ts`, `voice-mode.mjs`):
 *   - Tracy's voice arrives from `POST /api/speech/say` as 16-bit little-endian mono PCM in network
 *     chunks of any length — a sample may be split across two of them ({@link pcmSamples});
 *   - the microphone's 100 ms frames (`voice-pcm.mjs`) are measured for speech before any voice
 *     session is opened ({@link frameRms}), with the relay's own threshold.
 * Kept free of the page so `test/voice-pcm-out.test.mjs` can hold it.
 */

/**
 * A 16-bit frame louder than this RMS counts as speech: about -36 dBFS, the relay's `SPEECH_RMS`
 * (`apps/tracy-web/src/speech/relay.js`).
 */
export const SPEECH_RMS = 500

/**
 * Turn chunks of 16-bit little-endian PCM into samples, keeping a byte split across two chunks.
 * @returns {{ push(chunk: Uint8Array): Float32Array<ArrayBuffer> }}
 */
export function pcmSamples() {
  /** @type {number | null} */
  let carry = null
  return {
    push(chunk) {
      const bytes = carry === null ? chunk : concat(carry, chunk)
      const whole = bytes.length - (bytes.length % 2)
      carry = whole < bytes.length ? bytes[bytes.length - 1] : null
      const view = new DataView(bytes.buffer, bytes.byteOffset, whole)
      const out = new Float32Array(whole / 2)
      for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true) / 32768
      return out
    }
  }
}

/** @param {number} first @param {Uint8Array} rest */
function concat(first, rest) {
  const bytes = new Uint8Array(rest.length + 1)
  bytes[0] = first
  bytes.set(rest, 1)
  return bytes
}

/**
 * The RMS of one microphone frame of 16-bit PCM, on the 16-bit scale.
 * @param {ArrayBuffer} frame
 * @returns {number}
 */
export function frameRms(frame) {
  const samples = new Int16Array(frame, 0, Math.floor(frame.byteLength / 2))
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / samples.length)
}
