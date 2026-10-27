import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { createVisionChallenge, renderVisionCode, imageCodeMatches } from '../src/lib/vision-challenge.js'

test('the real input-check renderer uses pixels without fonts or textual metadata', async () => {
  const bytes = await renderVisionCode('01234567')
  const meta = await sharp(bytes).metadata()
  assert.equal(meta.format, 'png')
  assert.deepEqual([meta.width, meta.height], [604, 124])
  assert.ok(bytes.length < 16 * 1024)
  assert.ok(!bytes.includes(Buffer.from('01234567')))
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const at = (x, y) => data[(y * info.width + x) * info.channels]
  assert.equal(at(0, 0), 255)
  assert.equal(at(38, 26), 0)
  assert.equal(at(50, 50), 255)
  const a = await createVisionChallenge()
  const b = await createVisionChallenge()
  assert.match(a.expectedCode, /^[0-9]{8}$/)
  assert.match(b.expectedCode, /^[0-9]{8}$/)
  assert.equal(imageCodeMatches({ imageCode: a.expectedCode }, a), true)
  assert.equal(imageCodeMatches({ imageCode: null }, a), false)
})
