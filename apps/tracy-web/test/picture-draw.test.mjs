/**
 * A picture drawn for an empty wide place from the restaurant's own photographs (plan §8): what the model is asked, what
 * it is shown, and what comes back.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { drawForPlace, drawKey, drawPrompt } from '../src/lib/picture-draw.js'

const jpeg = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#557799' } })
    .jpeg()
    .toBuffer()
const door = {
  url: 'https://draw.test/v1/chat/completions',
  key: 'k',
  imageModel: 'google/gemini-3.1-flash-lite-image'
}

test('the prompt keeps the real photograph in the middle, names the shape, and forbids words, faces and new dishes', () => {
  const outpaint = drawPrompt({ mode: 'outpaint', aspect: 16 / 9 })
  assert.match(outpaint, /Keep the original photograph unchanged in the middle/)
  assert.match(outpaint, /16:9/)
  const scene = drawPrompt({ mode: 'scene', aspect: 1920 / 824 })
  assert.match(scene, /reference photos/)
  for (const p of [outpaint, scene]) assert.match(p, /No text.*no recognisable faces, no new dishes/)
})

test('the cache key changes with what the drawing is made from and how, never with time', () => {
  const item = { mode: 'outpaint', aspect: 16 / 9 }
  const a = drawKey(item, { model: 'm', shas: ['s1'] })
  assert.equal(a, drawKey(item, { model: 'm', shas: ['s1'] }))
  assert.notEqual(a, drawKey(item, { model: 'm', shas: ['s2'] }))
  assert.notEqual(a, drawKey({ ...item, mode: 'scene' }, { model: 'm', shas: ['s1'] }))
})

test('the model is shown the photographs, thumbnailed, and its picture comes back measured with its cost', async () => {
  const calls = []
  const chat = async (d, req) => {
    calls.push({ d, req })
    return {
      images: [
        {
          mime: 'image/png',
          bytes: await sharp(await jpeg(1376, 768))
            .png()
            .toBuffer()
        }
      ],
      usage: { cost: 0.034 },
      model: req.model
    }
  }
  const got = await drawForPlace({
    door,
    chat,
    item: { mode: 'outpaint', aspect: 16 / 9 },
    references: [await jpeg(3000, 2000)]
  })
  assert.deepEqual([got.width, got.height, got.costUsd], [1376, 768, 0.034])
  const content = calls[0].req.messages[0].content
  assert.equal(calls[0].req.images, true)
  const ref = content.find((c) => c.type === 'image_url').image_url.url
  const meta = await sharp(Buffer.from(ref.split(',')[1], 'base64')).metadata()
  assert.equal(Math.max(meta.width, meta.height), 1024)
  await assert.rejects(
    drawForPlace({
      door,
      chat: async () => ({ images: [] }),
      item: { mode: 'scene', aspect: 2 },
      references: [await jpeg(10, 10)]
    }),
    /answered no picture/
  )
})

test('a model that never answers is given up at the signal, not waited on through its own retries', async () => {
  const never = () => new Promise(() => {})
  // A ref'd timer: `AbortSignal.timeout` would let the test's event loop end before it fires.
  const stop = new AbortController()
  setTimeout(() => stop.abort(), 50)
  const started = Date.now()
  await assert.rejects(
    drawForPlace({
      door,
      chat: never,
      item: { mode: 'scene', aspect: 16 / 9 },
      references: [await jpeg(40, 30), await jpeg(30, 40)],
      signal: stop.signal
    }),
    /the picture took too long/
  )
  assert.ok(Date.now() - started < 5000)
})
