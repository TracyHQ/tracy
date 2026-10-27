/**
 * Labelling collected pictures with a vision model (OpenAI-compatible: DeepSeek by default, OpenRouter alike): which door,
 * one call per batch with each picture introduced by its id, answers held to the schema and to the ids asked, the
 * tokens counted, and a failure that costs its batch only.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import {
  held,
  labelWithVision,
  PICTURE_LABEL_SYSTEM,
  pictureLabelSystem,
  SUBJECTS,
  visionDoor,
  visionKey,
  VISION_PROMPT_VERSION
} from '../src/lib/picture-vision.js'

const jpeg = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#996633' } })
    .jpeg()
    .toBuffer()

const answer = (pictures, usage = { prompt_tokens: 800, completion_tokens: 120 }) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ pictures }) } }], usage }), {
    status: 200
  })

test('the door: DeepSeek by default when a key is set, none without a key; model and address configurable', () => {
  assert.equal(visionDoor({}), null)
  assert.deepEqual(visionDoor({ TRACY_VISION_API_KEY: 'k' }), {
    url: 'https://api.deepseek.com/chat/completions',
    key: 'k',
    model: 'deepseek-chat'
  })
  assert.deepEqual(
    visionDoor({
      TRACY_VISION_API_KEY: 'k',
      TRACY_VISION_MODEL: 'google/gemini-flash',
      TRACY_VISION_URL: 'https://openrouter.ai/api/v1/chat/completions'
    }),
    { url: 'https://openrouter.ai/api/v1/chat/completions', key: 'k', model: 'google/gemini-flash' }
  )
})

test('the cache key changes with the model and the prompt, never with the picture order', () => {
  const a = visionKey({ model: 'deepseek-chat' })
  assert.equal(a, visionKey({ model: 'deepseek-chat' }))
  assert.notEqual(a, visionKey({ model: 'other' }))
  assert.match(a, new RegExp(`${VISION_PROMPT_VERSION}`))
})

test('one call per batch: every picture is introduced by its id, thumbnailed, and only asked ids are kept', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ url, body, auth: init.headers.authorization })
    const ids = body.messages[0].content
      .filter((c) => c.type === 'text' && c.text.startsWith('Picture id: '))
      .map((c) => c.text.slice(12))
    return answer([
      ...ids.map((id) => ({
        id,
        subject: 'interior',
        textPresence: 'absent',
        quality: 'good',
        focus: 'center',
        heroWorthy: true,
        isCollage: false,
        oneLine: 'A warm room'
      })),
      { id: 'not-asked', subject: 'food' }
    ])
  }
  const pictures = await Promise.all(
    ['a', 'b', 'c'].map(async (id) => ({ id, bytes: await jpeg(2000, 1500) }))
  )
  const { labels, usage, failed } = await labelWithVision({
    door: { url: 'https://v.test/chat', key: 'k', model: 'm' },
    pictures,
    batch: 2,
    fetchImpl
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].auth, 'Bearer k')
  assert.equal(calls[0].body.response_format.type, 'json_object')
  const image = calls[0].body.messages[0].content.find((c) => c.type === 'image_url').image_url.url
  assert.match(image, /^data:image\/jpeg;base64,/)
  const thumb = await sharp(Buffer.from(image.split(',')[1], 'base64')).metadata()
  assert.equal(Math.max(thumb.width, thumb.height), 512)
  assert.deepEqual([...labels.keys()].sort(), ['a', 'b', 'c'])
  assert.equal(labels.get('a').subject, 'interior')
  assert.equal(failed, 0)
  assert.deepEqual(usage, {
    calls: 2,
    promptTokens: 1600,
    completionTokens: 240,
    requests: Array.from({ length: 2 }, () => ({
      model: 'm',
      requestId: null,
      usage: { prompt_tokens: 800, completion_tokens: 120 }
    }))
  })
})

test('an answer outside the schema is cut to it: an unknown subject is "other", a bad enum is dropped', async () => {
  const fetchImpl = async () =>
    answer([
      {
        id: 'a',
        subject: 'spaceship',
        textPresence: 'maybe',
        quality: 'good',
        heroWorthy: 'yes',
        oneLine: 'x'.repeat(400)
      }
    ])
  const { labels } = await labelWithVision({
    door: { url: 'https://v.test/chat', key: 'k', model: 'm' },
    pictures: [{ id: 'a', bytes: await jpeg(300, 300) }],
    fetchImpl
  })
  const a = labels.get('a')
  assert.equal(a.subject, 'other')
  assert.equal(a.textPresence, undefined)
  assert.equal(a.heroWorthy, undefined)
  assert.ok(a.oneLine.length <= 120)
})

test('a batch the model refuses or garbles costs that batch only', async () => {
  let n = 0
  const fetchImpl = async () => {
    n += 1
    if (n === 1) return new Response('busy', { status: 429 })
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"pictures":[{"id":"b","subject":"food"}]}' } }] }),
      { status: 200 }
    )
  }
  const { labels, failed } = await labelWithVision({
    door: { url: 'https://v.test/chat', key: 'k', model: 'm' },
    pictures: [
      { id: 'a', bytes: await jpeg(300, 300) },
      { id: 'b', bytes: await jpeg(300, 300) }
    ],
    batch: 1,
    concurrency: 1,
    fetchImpl
  })
  assert.equal(failed, 1)
  assert.deepEqual([...labels.keys()], ['b'])
})

test('the vision prompt names "the business" and its trade, bumps the version key, and accepts non-food subjects', async () => {
  assert.notEqual(visionKey({ model: 'deepseek-chat' }), 'deepseek-chat|p1|s1|512q70')
  assert.equal(visionKey({ model: 'deepseek-chat' }), 'deepseek-chat|p2|s1|512q70')
  assert.match(PICTURE_LABEL_SYSTEM, /the business/)
  assert.doesNotMatch(PICTURE_LABEL_SYSTEM, /restaurant/i)
  const fitnessPrompt = pictureLabelSystem('fitness')
  assert.match(fitnessPrompt, /the business/)
  assert.match(fitnessPrompt, /fitness/)

  const newSubjects = ['service-in-action', 'work-result', 'equipment', 'room', 'product']
  for (const s of newSubjects) {
    assert.ok(SUBJECTS.includes(s), `SUBJECTS includes ${s}`)
    assert.equal(held({ id: 'p1', subject: s })?.labels.subject, s)
  }

  let sentText = ''
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    sentText = body.messages[0].content.find((c) => c.type === 'text').text
    return answer(newSubjects.map((subject, i) => ({ id: `pic-${i}`, subject, quality: 'good' })))
  }
  const pictures = await Promise.all(
    newSubjects.map(async (_, i) => ({ id: `pic-${i}`, bytes: await jpeg(800, 600) }))
  )
  const { labels } = await labelWithVision({
    door: { url: 'https://v.test/chat', key: 'k', model: 'm' },
    pictures,
    trade: 'beauty',
    fetchImpl
  })
  assert.match(sentText, /the business/)
  assert.match(sentText, /beauty/)
  newSubjects.forEach((subject, i) => {
    assert.equal(labels.get(`pic-${i}`)?.subject, subject)
  })
})
