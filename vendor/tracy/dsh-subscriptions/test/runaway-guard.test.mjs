import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RunawayDetector, withRunawayGuard } from '../lib/runaway-guard.js'
import { streamWithRotation } from '../lib/stream-rotate.js'

test('RunawayDetector detects consecutive identical chunk repetitions', () => {
  const detector = new RunawayDetector({ maxIdenticalConsecutive: 5 })
  assert.equal(detector.feed('foo'), false)
  assert.equal(detector.feed('foo'), false)
  assert.equal(detector.feed('foo'), false)
  assert.equal(detector.feed('foo'), false)
  assert.equal(detector.feed('foo'), true)
  assert.equal(detector.isTripped(), true)
  assert.match(detector.getReason(), /identical_chunk_loop/)
})

test('RunawayDetector resets identical chunk counter on different text', () => {
  const detector = new RunawayDetector({ maxIdenticalConsecutive: 3 })
  assert.equal(detector.feed('a'), false)
  assert.equal(detector.feed('a'), false)
  assert.equal(detector.feed('b'), false)
  assert.equal(detector.feed('a'), false)
  assert.equal(detector.isTripped(), false)
})

test('RunawayDetector detects repeating n-gram cyclic loops', () => {
  const detector = new RunawayDetector({
    minPatternLength: 4,
    maxPatternLength: 10,
    maxPatternRepetitions: 4,
  })

  const cycle = 'abcd'
  assert.equal(detector.feed(cycle), false)
  assert.equal(detector.feed(cycle), false)
  assert.equal(detector.feed(cycle), false)
  assert.equal(detector.feed(cycle), true)
  assert.equal(detector.isTripped(), true)
  assert.match(detector.getReason(), /pattern_repetition_loop/)
})

test('withRunawayGuard terminates stream gracefully on runaway detection', async () => {
  async function* runawayStream() {
    yield { type: 'text-delta', text: 'Hello ' }
    yield { type: 'text-delta', text: 'world! ' }
    for (let i = 0; i < 50; i++) {
      yield { type: 'text-delta', text: 'loop ' }
    }
    yield { type: 'text-delta', text: 'never reached' }
  }

  const guarded = withRunawayGuard(runawayStream(), {
    maxPatternRepetitions: 4,
    minPatternLength: 4,
  })

  const chunks = []
  for await (const chunk of guarded) {
    chunks.push(chunk)
  }

  const lastChunk = chunks[chunks.length - 1]
  assert.equal(lastChunk.type, 'finish')
  assert.equal(lastChunk.reason.kind, 'stop')
  assert.equal(lastChunk.reason.message, 'runaway_loop_detected')

  // Verify that the stream was cut off before yielding all 50 loop chunks
  assert.ok(chunks.length < 20)
  assert.ok(!chunks.some((c) => c.text === 'never reached'))
})

test('withRunawayGuard allows normal stream to pass through unchanged', async () => {
  async function* normalStream() {
    yield { type: 'text-delta', text: 'function calculateSum(a, b) {\n' }
    yield { type: 'text-delta', text: '  return a + b;\n' }
    yield { type: 'text-delta', text: '}\n' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }

  const chunks = []
  for await (const chunk of withRunawayGuard(normalStream())) {
    chunks.push(chunk)
  }

  assert.equal(chunks.length, 4)
  assert.equal(chunks[3].type, 'finish')
})

test('streamWithRotation applies runaway guard and terminates gracefully', async () => {
  const accounts = [
    { ref: 'ACC_1', hasToken: true, cooldownUntil: 0 },
  ]

  async function* loopingStream() {
    for (let i = 0; i < 40; i++) {
      yield { type: 'text-delta', text: 'repeated_token ' }
    }
  }

  const chunks = []
  for await (const chunk of streamWithRotation({
    accounts,
    nowMs: () => 1000,
    cooldownMs: 5000,
    switchAtRemaining: 0,
    streamOnce: () => loopingStream(),
    options: {
      provider: 'test',
      model: 'test',
      runawayGuard: { maxPatternRepetitions: 3, minPatternLength: 5 },
    },
  })) {
    chunks.push(chunk)
  }

  const finish = chunks[chunks.length - 1]
  assert.equal(finish.type, 'finish')
  assert.equal(finish.reason.message, 'runaway_loop_detected')
})
