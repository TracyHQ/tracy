/**
 * Voice input's samples (`voice-pcm.mjs`): any recording rate down to the 16 kHz the voice socket
 * takes, as 16-bit integers, in 100 ms frames, with the loudness the recording row draws.
 *
 *   node --test packages/ui/tracy-chat-input/test/voice-pcm.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FRAME_SAMPLES, downsampler, framer, loudness, toPcm16 } from '../src/client/voice-pcm.mjs'

const sine = (rate, hz, seconds, amplitude = 0.5) =>
  Float32Array.from(
    { length: Math.round(rate * seconds) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate)
  )

/** Feed `samples` in render-quantum blocks of 128, as an AudioWorklet does. */
function feed(down, samples) {
  const out = []
  for (let i = 0; i < samples.length; i += 128) out.push(...down(samples.subarray(i, i + 128)))
  return Float32Array.from(out)
}

test('one second at 48, 44.1, 16 or 8 kHz is one second at 16 kHz, whatever the block boundaries', () => {
  for (const rate of [48_000, 44_100, 16_000, 8_000]) {
    const out = feed(downsampler(rate), sine(rate, 440, 1))
    assert.ok(Math.abs(out.length - 16_000) <= 2, `${rate}: ${out.length} samples`)
  }
})

test('speech-band audio keeps its level; a tone above 8 kHz is mostly filtered out', () => {
  const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length)
  const speech = feed(downsampler(48_000), sine(48_000, 440, 0.5))
  assert.ok(rms(speech) > 0.3, `440 Hz kept: ${rms(speech)}`)
  const high = feed(downsampler(48_000), sine(48_000, 15_000, 0.5))
  assert.ok(rms(high) < 0.15, `15 kHz folded back at ${rms(high)}`)
})

test('samples become clipped 16-bit integers', () => {
  assert.deepEqual(
    [...toPcm16(Float32Array.from([0, 1, -1, 0.5, 2, -3]))],
    [0, 32767, -32768, 16384, 32767, -32768]
  )
})

test('loudness is 0 for silence and grows with the voice, capped at 1', () => {
  assert.equal(loudness(new Float32Array(128)), 0)
  assert.equal(loudness(new Float32Array(0)), 0)
  const quiet = loudness(sine(16_000, 200, 0.01, 0.02))
  const spoken = loudness(sine(16_000, 200, 0.01, 0.15))
  assert.ok(quiet < spoken && spoken <= 1)
  assert.equal(loudness(sine(16_000, 200, 0.01, 1)), 1)
})

test('frames are 100 ms each, and flush hands out the shorter rest once', () => {
  const sent = []
  const f = framer((frame) => sent.push(new Int16Array(frame)))
  f.push(new Int16Array(1000).fill(1))
  assert.equal(sent.length, 0)
  f.push(new Int16Array(2500).fill(2))
  assert.equal(sent.length, 2)
  assert.equal(sent[0].length, FRAME_SAMPLES)
  assert.equal(sent[0][999], 1)
  assert.equal(sent[0][1000], 2)
  f.flush()
  assert.equal(sent.length, 3)
  assert.equal(sent[2].length, 3500 - 2 * FRAME_SAMPLES)
  f.flush()
  assert.equal(sent.length, 3, 'nothing left to hand out')
})
