/**
 * The microphone's samples as the voice socket takes them (`apps/tracy-web/src/speech/relay.js`):
 * PCM, 16-bit little-endian, mono, 16 kHz, in frames of 100 ms.
 *
 * The browser records at its own rate (44.1 or 48 kHz on most machines, whatever `getUserMedia` was
 * asked for), so the samples are brought down to 16 kHz here, from `AudioContext.sampleRate` as it
 * really is (council 15/10/2026). Each output sample is the mean of the input samples it covers: a
 * box filter, enough to keep speech above 8 kHz from folding back into the band the recogniser hears.
 * Kept out of the audio thread so it is plain, testable JavaScript; the worklet only hands samples over.
 */

export const OUTPUT_RATE = 16_000
/** Samples in one frame sent to the socket: 100 ms. */
export const FRAME_SAMPLES = 1600

/**
 * A stateful converter from `inputRate` to 16 kHz: call it with each block of samples as it comes;
 * a block's tail that does not make a whole output sample is kept for the next one.
 * @param {number} inputRate
 * @returns {(block: Float32Array) => Float32Array}
 */
export function downsampler(inputRate) {
  const ratio = inputRate / OUTPUT_RATE
  /** @type {Float32Array} */
  let carry = new Float32Array(0)
  let pos = 0
  return (block) => {
    const data = new Float32Array(carry.length + block.length)
    data.set(carry)
    data.set(block, carry.length)
    const out = []
    while (pos + ratio <= data.length) {
      const from = Math.floor(pos)
      const to = Math.max(from + 1, Math.floor(pos + ratio))
      let sum = 0
      for (let i = from; i < to; i++) sum += data[i]
      out.push(sum / (to - from))
      pos += ratio
    }
    const used = Math.min(Math.floor(pos), data.length)
    carry = data.slice(used)
    pos -= used
    return Float32Array.from(out)
  }
}

/**
 * Float samples (-1…1) as 16-bit integers, clipped.
 * @param {Float32Array} samples
 * @returns {Int16Array}
 */
export function toPcm16(samples) {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
  }
  return out
}

/**
 * How loud a block is, 0…1, for the bars of the recording row: its RMS, lifted so ordinary speech
 * (an RMS around 0.05–0.2) fills most of the bar's height.
 * @param {Float32Array} samples
 * @returns {number}
 */
export function loudness(samples) {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
}

/**
 * Collect 16 kHz samples and hand out whole 100 ms frames.
 * @param {(frame: ArrayBuffer) => void} send
 */
export function framer(send) {
  let buffer = new Int16Array(FRAME_SAMPLES)
  let filled = 0
  return {
    /** @param {Int16Array} samples */
    push(samples) {
      let offset = 0
      while (offset < samples.length) {
        const take = Math.min(FRAME_SAMPLES - filled, samples.length - offset)
        buffer.set(samples.subarray(offset, offset + take), filled)
        filled += take
        offset += take
        if (filled === FRAME_SAMPLES) {
          send(buffer.buffer)
          buffer = new Int16Array(FRAME_SAMPLES)
          filled = 0
        }
      }
    },
    /** Hand out what is left, shorter than a frame: the last words before Done. */
    flush() {
      if (filled === 0) return
      send(buffer.slice(0, filled).buffer)
      buffer = new Int16Array(FRAME_SAMPLES)
      filled = 0
    }
  }
}
