// One logged drawing is one paid call (brand step trial bench, #320). The seeder's chat asks again after a timeout, a
// 429 or a 5xx; the drawing door sends only the first attempt, so a failure is one call and make_icon logs it once.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { createDraw } from '../src/brand-step/brand-draw.js'
import { assignDoor, saveProvider } from '../src/lib/llm-store.js'
import { API_KEY, SECRET, TEST_PRICES } from './_brand-bench.mjs'
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

async function drawWith(fetchImpl) {
  await saveProvider(
    db.pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: API_KEY, enabled: true },
    SECRET,
    'o@t.test'
  )
  await assignDoor(db.pool, 'seedImage', { providerId: 'openrouter', model: PICTURE_MODEL }, 'o@t.test')
  return createDraw({ pool: db.pool, secret: SECRET, fetchImpl, prices: TEST_PRICES })({ prompt: 'p' })
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

for (const [name, first, reason] of [
  ['a 500', () => json(500, { error: { message: 'upstream is down' } }), /upstream is down/],
  ['a 429', () => json(429, { error: { message: 'slow down' } }), /slow down/],
  [
    'a timeout',
    () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    },
    /timed out/
  ]
])
  test(`${name} on the first attempt is not asked again`, opts, async () => {
    let sent = 0
    const started = Date.now()
    await assert.rejects(
      drawWith(async () => {
        sent++
        // Would succeed on a second attempt: a retry would hide the failure and pay twice.
        return sent === 1 ? first() : json(200, pictureReply(png))
      }),
      reason
    )
    assert.equal(sent, 1, 'one attempt, one paid call')
    assert.ok(Date.now() - started < 1500, 'no retry delay was waited')
  })

test('a first attempt that answers is returned and sent once', opts, async () => {
  let sent = 0
  const drawn = await drawWith(async () => (sent++, json(200, pictureReply(png))))
  assert.equal(sent, 1)
  assert.ok(Buffer.isBuffer(drawn.image))
})
