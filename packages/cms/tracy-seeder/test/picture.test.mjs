import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import jpeg from 'jpeg-js'
import { imageSize } from '../src/hero-images.mjs'
import { drawPicture, pictureDoor } from '../src/picture.mjs'

const jpegOf = (width, height) =>
  Buffer.from(jpeg.encode({ width, height, data: Buffer.alloc(width * height * 4, 128) }, 80).data)

// The picture model a customer's site uses is the one /ops pushed, and the environment still wins on
// any name it sets — the same rule the seeder's text model follows.
test('the picture door is read from the credential store, the environment winning', (t) => {
  const home = mkdtempSync(path.join(tmpdir(), 'picture-door-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  assert.equal(pictureDoor({ DSH_HOME: home }), null)
  writeFileSync(
    path.join(home, '.credentials.yaml'),
    'refs:\n  OPENROUTER_API_KEY: sk-or-stored\n  TRACY_SEED_IMAGE_MODEL: google/gemini-3.1-flash-lite-image\n'
  )
  const stored = pictureDoor({ DSH_HOME: home })
  assert.equal(stored?.key, 'sk-or-stored')
  assert.equal(stored?.imageModel, 'google/gemini-3.1-flash-lite-image')
  assert.equal(pictureDoor({ DSH_HOME: home, OPENROUTER_API_KEY: 'sk-or-env' })?.key, 'sk-or-env')
})

// 🔒 THE PROMPT IS THE CUSTOMER'S, WORD FOR WORD (Lee, 23/09/2026: "the tool need not refuse to draw
// anything — what if the customer wants it drawn?"). Nothing is appended and nothing is filtered here;
// the model provider's own policy is the only one that applies.
test('a picture is drawn from the prompt as given and cut to the shape asked for', async () => {
  let asked = null
  const drawn = await drawPicture({
    door: { url: 'https://example.test', key: 'k', imageModel: 'm' },
    prompt: 'A red bicycle on a beach, with the words SALE 50% painted on it',
    aspect: 1600 / 1000,
    chat: async (_door, req) => {
      asked = req
      return {
        images: [{ mime: 'image/jpeg', bytes: jpegOf(1376, 768) }],
        usage: { cost: 0.0336 },
        model: 'm'
      }
    }
  })
  assert.equal(asked.messages[0].content, 'A red bicycle on a beach, with the words SALE 50% painted on it')
  assert.equal(asked.images, true)
  assert.equal(drawn.ok, true)
  const [w, h] = imageSize(drawn.bytes)
  assert.ok(Math.abs(w / h - 1.6) < 0.01, `${w}x${h} is not 16:10`)
  assert.match(drawn.path, /^images\/tracy-content\/[0-9a-f]{64}\.jpg$/)
  assert.equal(drawn.costUsd, 0.0336)
})

test('no picture answered, or one that cannot be cut, is said plainly', async () => {
  const door = { url: 'https://example.test', key: 'k', imageModel: 'm' }
  const none = await drawPicture({ door, prompt: 'x', chat: async () => ({ images: [], usage: null }) })
  assert.equal(none.ok, false)
  assert.match(none.error, /no picture/)
  const png = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(1024, 16)
  png.writeUInt32BE(1024, 20)
  const square = await drawPicture({
    door,
    prompt: 'x',
    aspect: 2,
    chat: async () => ({ images: [{ mime: 'image/png', bytes: png }], usage: null })
  })
  assert.equal(square.ok, false)
  assert.match(square.error, /shape/)
})

test('without a shape the picture is kept as drawn', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'picture-'))
  mkdirSync(dir, { recursive: true })
  const drawn = await drawPicture({
    door: { url: 'https://example.test', key: 'k', imageModel: 'm' },
    prompt: 'x',
    chat: async () => ({ images: [{ mime: 'image/jpeg', bytes: jpegOf(1376, 768) }], usage: {} })
  })
  assert.deepEqual(imageSize(drawn.bytes), [1376, 768])
  assert.equal(drawn.costUsd, null)
  rmSync(dir, { recursive: true, force: true })
})
