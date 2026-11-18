/** Photo labels and observations preserve the provider-specific quiet request and bounded answer from PR #296. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { observeWithModel } from '../src/lib/picture-observations.js'
import { labelMaxTokens, labelWithVision, postVisionDoor } from '../src/lib/picture-vision.js'

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

test('quiet fallback preserves cancellation and output bounds without retrying an unrelated refusal', async () => {
  const controller = new AbortController()
  const calls = []
  const result = await postVisionDoor({
    door: DOORS.deepseek,
    signal: controller.signal,
    bodyFor: (quiet) => JSON.stringify({ max_tokens: labelMaxTokens(8), ...quiet }),
    fetchImpl: async (_url, init) => {
      calls.push(init)
      return calls.length === 1 ? new Response('thinking unsupported', { status: 400 }) : new Response('{}')
    }
  })
  assert.equal(result.status, 200)
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.signal, controller.signal)
    assert.equal(JSON.parse(call.body).max_tokens, 6912)
  }
})

test('photo observations retry a refused quiet field once and retain their output bound', async () => {
  const bodies = []
  const result = await observeWithModel({
    door: DOORS.openrouter,
    prompt: 'Photo id: first',
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body)
      bodies.push(body)
      return bodies.length === 1
        ? new Response('reasoning unsupported', { status: 400 })
        : answer({ facts: [] })
    }
  })
  assert.deepEqual(JSON.parse(result.answer), { facts: [] })
  assert.equal(bodies.length, 2)
  assert.deepEqual(bodies[0].reasoning, { enabled: false })
  assert.equal(bodies[1].reasoning, undefined)
  assert.equal(bodies[0].max_tokens, bodies[1].max_tokens)
})

test('an unrelated provider refusal keeps its readable body and request boundaries', async () => {
  const controller = new AbortController()
  const refusal = JSON.stringify({ error: { message: 'image too large' } })
  const calls = []
  const response = await postVisionDoor({
    door: DOORS.deepseek,
    signal: controller.signal,
    bodyFor: (quiet) => JSON.stringify({ max_tokens: labelMaxTokens(8), ...quiet }),
    fetchImpl: async (_url, init) => {
      calls.push(init)
      return new Response(refusal, { status: 400 })
    }
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].signal, controller.signal)
  assert.equal(JSON.parse(calls[0].body).max_tokens, 6912)
  assert.equal(response.status, 400)
  assert.equal(response.bodyUsed, false)
  assert.equal(await response.text(), refusal)
})
