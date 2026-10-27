// Sound in numbers for a voice conversation (`src/client/voice-pcm-out.mjs`): Tracy's PCM arriving in
// chunks of any length, and the microphone's frames measured for speech.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { frameRms, pcmSamples, SPEECH_RMS } from '../src/client/voice-pcm-out.mjs'

test('a sample split across two chunks is kept whole', () => {
  const reader = pcmSamples()
  // 0x4000 = 16384 (0.5) and 0xC000 = -16384 (-0.5), little-endian, split after the third byte.
  const first = reader.push(new Uint8Array([0x00, 0x40, 0x00]))
  const second = reader.push(new Uint8Array([0xc0]))
  assert.deepEqual([...first], [0.5])
  assert.deepEqual([...second], [-0.5])
  assert.deepEqual([...reader.push(new Uint8Array([]))], [])
})

test('a frame’s loudness on the 16-bit scale, against the relay’s speech threshold', () => {
  assert.equal(frameRms(new Int16Array(1600).fill(1000).buffer), 1000)
  assert.equal(frameRms(new ArrayBuffer(0)), 0)
  assert.ok(frameRms(new Int16Array(1600).fill(30).buffer) < SPEECH_RMS)
})
