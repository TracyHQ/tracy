/**
 * No call on the vision door reasons by default (02/11/2026): the photo labels (`lib/picture-vision.js`), the demo look
 * (`opportunities-build/demo-look.js`) and the photo observations (`lib/picture-observations.js`) ask each provider in its own words not to reason (`seed-model.js` `noReasoningBody`), bound
 * the answer with `max_tokens`, and ask once more without the field when a provider refuses it.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'

import { labelWithVision } from '../src/lib/picture-vision.js'
import { observeWithModel } from '../src/lib/picture-observations.js'
import { createDemoLook } from '../src/opportunities-build/demo-look.js'

const DOORS = {
  deepseek: { url: 'https://api.deepseek.com/chat/completions', key: 'k', model: 'deepseek-flash' },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: 'k',
    model: 'google/gemini-flash'
  },
  other: { url: 'https://vision.test/v1/chat/completions', key: 'k', model: 'vision-x' }
}
const challengeFor = async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' })
const answer = (content, usage = { prompt_tokens: 900, completion_tokens: 40 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage }), {
    status: 200
  })

/** The provider's own field for "do not reason", and the bound, as a request carries them. */
function assertQuiet(body, provider) {
  if (provider === 'deepseek') {
    assert.deepEqual(body.thinking, { type: 'disabled' })
    assert.equal(body.reasoning, undefined)
  } else if (provider === 'openrouter') {
    assert.deepEqual(body.reasoning, { enabled: false })
    assert.equal(body.thinking, undefined)
  } else {
    assert.equal(body.thinking, undefined)
    assert.equal(body.reasoning, undefined)
  }
  assert.ok(Number.isInteger(body.max_tokens), 'max_tokens is set')
  assert.ok(body.max_tokens <= 8192, `max_tokens ${body.max_tokens} stays inside DeepSeek's limit`)
}

const jpeg = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: '#996633' } })
    .jpeg()
    .toBuffer()

for (const provider of Object.keys(DOORS))
  test(`photo labels on ${provider}: the model is asked not to reason, and a batch of 8 has room for 8 labels`, async () => {
    const bodies = []
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(init.body)
      bodies.push(body)
      const ids = body.messages[0].content
        .filter((c) => c.type === 'text' && c.text.startsWith('Picture id: '))
        .map((c) => c.text.slice(12))
      return answer({ imageCode: 'ABC12345', pictures: ids.map((id) => ({ id, subject: 'food' })) })
    }
    const bytes = await jpeg()
    const pictures = Array.from({ length: 9 }, (_, n) => ({ id: `p${n}`, bytes }))
    const { labels } = await labelWithVision({ door: DOORS[provider], pictures, challengeFor, fetchImpl })
    assert.equal(labels.size, 9)
    assert.equal(bodies.length, 2)
    for (const body of bodies) assertQuiet(body, provider)
    assert.ok(bodies[0].max_tokens >= 1500, `${bodies[0].max_tokens} tokens for eight labels`)
    assert.ok(
      bodies[1].max_tokens < bodies[0].max_tokens,
      'a batch of one asks for less than a batch of eight'
    )
  })

test('photo labels: a provider that refuses the field is asked once more without it', async () => {
  const bodies = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    bodies.push(body)
    if (body.thinking)
      return new Response(JSON.stringify({ error: { message: 'Unknown parameter: thinking' } }), {
        status: 400
      })
    return answer({ imageCode: 'ABC12345', pictures: [{ id: 'a', subject: 'food' }] })
  }
  const { labels, failed } = await labelWithVision({
    door: DOORS.deepseek,
    pictures: [{ id: 'a', bytes: await jpeg() }],
    challengeFor,
    fetchImpl
  })
  assert.equal(failed, 0)
  assert.equal(labels.get('a').subject, 'food')
  assert.equal(bodies.length, 2)
  assert.equal(bodies[1].thinking, undefined)
  assert.equal(bodies[1].max_tokens, bodies[0].max_tokens)
})

test('photo labels: a 400 about something else is not asked again', async () => {
  let calls = 0
  const { reasons } = await labelWithVision({
    door: DOORS.deepseek,
    pictures: [{ id: 'a', bytes: await jpeg() }],
    challengeFor,
    fetchImpl: async () => {
      calls++
      return new Response(JSON.stringify({ error: { message: 'image too large' } }), { status: 400 })
    }
  })
  assert.equal(calls, 1)
  assert.equal(reasons.get('a'), 'http_error')
})

for (const provider of Object.keys(DOORS))
  test(`photo observations on ${provider}: the model is asked not to reason, with room for every photo's facts`, async () => {
    let body = null
    const fetchImpl = async (_url, init) => {
      body = JSON.parse(init.body)
      return answer({ facts: [] })
    }
    const prompt = Array.from({ length: 30 }, (_, n) => `Photo id: ${n} | shows: food | caption: x`).join(
      '\n'
    )
    await observeWithModel({ door: DOORS[provider], prompt, fetchImpl })
    assertQuiet(body, provider)
    assert.ok(body.max_tokens >= 2048)
  })

/** One page shot at both widths, one tile each: one model call. */
async function capture(_site, layouts, { onFrame, signal }) {
  const frames = []
  for (const layout of layouts)
    for (const [viewport, width, viewportHeight] of [
      ['desktop', 1440, 900],
      ['phone', 390, 844]
    ]) {
      const identity = { page: layout.path, key: layout.key, viewport, width, viewportHeight }
      const bytes = await sharp({
        create: { width, height: viewportHeight, channels: 3, background: '#c86' }
      })
        .jpeg()
        .toBuffer()
      frames.push(
        { type: 'view-start', ...identity, documentHeight: 600 },
        {
          type: 'tile',
          ...identity,
          index: 0,
          y: 0,
          height: viewportHeight,
          from: 0,
          to: 600,
          documentHeight: 600,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          jpeg: bytes.toString('base64')
        },
        { type: 'view-end', ...identity, complete: true, tiles: 1, covered: 600, documentHeight: 600 }
      )
    }
  frames.push({ type: 'end', version: 'vision-tiles/1', complete: true })
  for (const frame of frames) await onFrame(frame, signal)
  return { ok: true }
}

for (const provider of Object.keys(DOORS))
  test(`the demo look on ${provider}: every call is asked not to reason, with room for its faults`, async (t) => {
    const bodies = []
    const fetchImpl = async (_url, init) => {
      bodies.push(JSON.parse(init.body))
      return answer(
        { imageCode: 'ABC12345', faults: [] },
        {
          prompt_tokens: 9000,
          completion_tokens: 6100,
          completion_tokens_details: { reasoning_tokens: 6050 }
        }
      )
    }
    const said = []
    t.mock.method(console, 'info', (line) => said.push(String(line)))
    const look = createDemoLook({ capture, visionFor: async () => DOORS[provider], fetchImpl, challengeFor })
    const r = await look({}, { pages: ['/'] })
    assert.equal(r.looked, true)
    assert.ok(bodies.length >= 1)
    for (const body of bodies) assertQuiet(body, provider)
    assert.ok(bodies[0].max_tokens >= 1024)
    // The look's own line says what its answers cost, so a deployment can tell reasoning from slow pixels.
    const line = said.find((l) => l.startsWith('[demo-look]'))
    assert.match(
      line,
      new RegExp(`${6100 * bodies.length} completion tokens \\(${6050 * bodies.length} reasoning\\)`)
    )
  })

test('the demo look: a provider that refuses the field is asked once more without it', async () => {
  const bodies = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    bodies.push(body)
    if (body.reasoning)
      return new Response(JSON.stringify({ error: { message: 'reasoning is not supported' } }), {
        status: 400
      })
    return answer({ imageCode: 'ABC12345', faults: [] })
  }
  const look = createDemoLook({ capture, visionFor: async () => DOORS.openrouter, fetchImpl, challengeFor })
  const r = await look({}, { pages: ['/'] })
  assert.equal(r.looked, true)
  assert.equal(bodies.length, 2)
  assert.deepEqual(bodies[0].reasoning, { enabled: false })
  assert.equal(bodies[1].reasoning, undefined)
  assert.equal(bodies[1].max_tokens, bodies[0].max_tokens)
})
