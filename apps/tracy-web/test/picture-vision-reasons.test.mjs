/**
 * A picture the vision model did not label says why (per picture, not per batch), and a caller that allows it sends the
 * pictures of a failed call once more, never more calls than the first round made.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { labelWithVision } from '../src/lib/picture-vision.js'

const challengeFor = async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' })
const DOOR = { url: 'https://v.test/chat', key: 'k', model: 'm' }
const jpeg = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#336699' } })
    .jpeg()
    .toBuffer()
const idsOf = (init) =>
  JSON.parse(init.body)
    .messages[0].content.filter((c) => c.type === 'text' && c.text.startsWith('Picture id: '))
    .map((c) => c.text.slice(12))
const answer = (pictures, imageCode = 'ABC12345') =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify({ pictures, imageCode }) } }] }),
    { status: 200 }
  )
const label = (id) => ({ id, subject: 'people', content: 'people-in-action', caption: `Picture ${id}.` })
const pictures = async (ids) => Promise.all(ids.map(async (id) => ({ id, bytes: await jpeg(1600, 2133) })))

test('each picture not labelled carries the reason of its call', async () => {
  const outcomes = [
    () => new Response('busy', { status: 429 }),
    () => new Response(JSON.stringify({ choices: [{ message: { content: '{"pictures": [' } }] })),
    () => answer([label('c')], 'WRONG000'),
    () => answer([label('x')]),
    () => answer([label('e')]),
    () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    }
  ]
  let n = 0
  const result = await labelWithVision({
    challengeFor,
    door: DOOR,
    pictures: [
      ...(await pictures(['a', 'b', 'c', 'd', 'e', 'f'])),
      { id: 'g', bytes: new Uint8Array([1, 2, 3]) }
    ],
    batch: 1,
    concurrency: 1,
    fetchImpl: async () => outcomes[Math.min(n++, outcomes.length - 1)]()
  })
  assert.deepEqual([...result.labels.keys()], ['e'])
  assert.deepEqual(Object.fromEntries(result.reasons), {
    a: 'http_error',
    b: 'answer_unparseable',
    c: 'image_code_mismatch',
    d: 'not_in_answer',
    f: 'timeout',
    g: 'decode_failed'
  })
})

test('a failed batch of large photographs is sent once more and labelled; the retry never exceeds the first round', async () => {
  const sent = []
  let n = 0
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11']
  const result = await labelWithVision({
    challengeFor,
    door: DOOR,
    pictures: await pictures(ids),
    batch: 8,
    retry: 1,
    fetchImpl: async (_url, init) => {
      const asked = idsOf(init)
      sent.push(asked)
      n += 1
      // The first call (the eight largest) times out; the other first-round call answers.
      if (n === 1 && asked.length === 8) return new Response('upstream timeout', { status: 504 })
      return answer(asked.map(label))
    }
  })
  assert.equal(result.labels.size, 11)
  assert.equal(result.reasons.size, 0)
  assert.equal(sent.length, 3)
  assert.deepEqual(sent[2], ids.slice(0, 8))

  // Every call failing: at most two rounds, so at most twice the first round's calls.
  let calls = 0
  const down = await labelWithVision({
    challengeFor,
    door: DOOR,
    pictures: await pictures(ids),
    batch: 8,
    retry: 1,
    fetchImpl: async () => {
      calls += 1
      return new Response('busy', { status: 503 })
    }
  })
  assert.equal(calls, 4)
  assert.equal(down.labels.size, 0)
  assert.equal(down.reasons.size, 11)
})

test('without a retry allowed the call is made once, as a build sends it', async () => {
  let calls = 0
  const { reasons } = await labelWithVision({
    challengeFor,
    door: DOOR,
    pictures: await pictures(['a']),
    fetchImpl: async () => {
      calls += 1
      return new Response('busy', { status: 503 })
    }
  })
  assert.equal(calls, 1)
  assert.equal(reasons.get('a'), 'http_error')
})
