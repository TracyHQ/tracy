// The drawing door of the brand bench (#320): ctx.draw is the existing picture door `seedImage`, called through the
// seeder's chat. It refuses clearly when the door is unset, disabled or cannot draw, never falls back to the
// environment, and never shows the key.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { createDraw, DrawRefused } from '../src/brand-step/brand-draw.js'
import { assignDoor, saveModels, saveProvider } from '../src/lib/llm-store.js'
import { API_KEY, SECRET } from './_brand-bench.mjs'
import { PICTURE_MODEL, pictureReply } from './_brand-bench-doors.mjs'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#cc3322' } })
  .png()
  .toBuffer()
const book = async (pool, { enabled = true, models } = {}) => {
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: API_KEY, enabled },
    SECRET,
    'o@t.test'
  )
  if (models) await saveModels(pool, 'openrouter', models)
  await assignDoor(pool, 'seedImage', { providerId: 'openrouter', model: PICTURE_MODEL }, 'o@t.test')
}
const answering =
  (reply, seen = []) =>
  async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) })
    return new Response(JSON.stringify(reply), { headers: { 'content-type': 'application/json' } })
  }

test(
  'the picture door is called with the prompt, and the picture, cost, model and provider come back',
  opts,
  async () => {
    await book(db.pool)
    const seen = []
    const draw = createDraw({ pool: db.pool, secret: SECRET, fetchImpl: answering(pictureReply(png), seen) })
    const drawn = await draw({ prompt: 'a flat icon of a fish', size: 1024 })
    assert.ok(Buffer.isBuffer(drawn.image))
    assert.deepEqual([drawn.cost, drawn.model, drawn.provider], [0.034, PICTURE_MODEL, 'openrouter'])
    assert.match(seen[0].url, /\/chat\/completions$/)
    assert.deepEqual(seen[0].body.modalities, ['image', 'text'])
    assert.equal(seen[0].body.model, PICTURE_MODEL)
    assert.equal(seen[0].body.messages[0].content, 'a flat icon of a fish')
    assert.equal(seen[0].headers.authorization, `Bearer ${API_KEY}`)
  }
)

test('an unset, disabled or incapable door refuses with its reason and sends nothing', opts, async () => {
  const sent = []
  const draw = createDraw({ pool: db.pool, secret: SECRET, fetchImpl: answering(pictureReply(png), sent) })
  process.env.OPENROUTER_API_KEY = 'sk-env-key-must-not-be-used'
  try {
    await assert.rejects(
      draw({ prompt: 'p' }),
      (e) => e instanceof DrawRefused && /no provider and model/.test(e.message)
    )
    await book(db.pool, { enabled: false })
    await assert.rejects(draw({ prompt: 'p' }), /switched off/)
    await book(db.pool, { models: [{ id: PICTURE_MODEL, draws: false }] })
    await assert.rejects(draw({ prompt: 'p' }), /cannot draw pictures/)
  } finally {
    delete process.env.OPENROUTER_API_KEY
  }
  assert.equal(sent.length, 0)
})

test('an answer with no picture, or a provider error, fails without showing the key', opts, async () => {
  await book(db.pool)
  const text = { model: PICTURE_MODEL, choices: [{ message: { role: 'assistant', content: 'sorry' } }] }
  await assert.rejects(
    createDraw({ pool: db.pool, secret: SECRET, fetchImpl: answering(text) })({ prompt: 'p' }),
    /answered no picture/
  )
  const refuse = async () =>
    new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 })
  await assert.rejects(
    createDraw({ pool: db.pool, secret: SECRET, fetchImpl: refuse })({ prompt: 'p' }),
    (e) => /bad request/.test(e.message) && !e.message.includes(API_KEY)
  )
})
