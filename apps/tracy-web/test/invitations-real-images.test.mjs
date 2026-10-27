import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import { decodeEmailImage } from '../src/invitations/real-images.js'
test('PNG and JPEG are decoded/re-encoded, strip metadata/trailing bytes, and hash the stored bytes', async () => {
  for (const format of ['png', 'jpeg']) {
    const original = await sharp({ create: { width: 8, height: 4, channels: 3, background: '#123456' } })
      .withMetadata()
      [format]()
      .toBuffer()
    const r = await decodeEmailImage({
      bytes: Buffer.concat([original, Buffer.from('<script>trailing</script>')])
    })
    assert.equal(r.mediaType, `image/${format}`)
    assert.deepEqual([r.width, r.height, r.frames], [8, 4, 1])
    assert.ok(!r.bytes.includes(Buffer.from('<script>')))
    assert.equal((await sharp(r.bytes).metadata()).exif, undefined)
    assert.equal(r.sha256, createHash('sha256').update(r.bytes).digest('hex'))
  }
})
test('magic, 2MiB byte ceiling and 20 million pixel ceiling are enforced before output decode', async () => {
  for (const bytes of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    Buffer.from('GIF89a broken'),
    Buffer.alloc(2 * 1024 * 1024 + 1)
  ])
    await assert.rejects(() => decodeEmailImage({ bytes }))
  const exact = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  assert.equal((await decodeEmailImage({ bytes: exact })).width, 5000)
  const over = await sharp({ create: { width: 5001, height: 4000, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  await assert.rejects(() => decodeEmailImage({ bytes: over }))
})
test('animated GIF preserves its frames and refuses over 100 frames rather than silently flattening', async () => {
  for (const frames of [2, 100, 101]) {
    const raw = Buffer.alloc(2 * frames * 4)
    for (let f = 0; f < frames; f++)
      for (let x = 0; x < 2; x++) {
        const i = (f * 2 + x) * 4
        raw[i] = f * 2
        raw[i + 1] = 255 - f * 2
        raw[i + 2] = f
        raw[i + 3] = 255
      }
    const bytes = await sharp(raw, { raw: { width: 2, height: frames, channels: 4, pageHeight: 1 } })
      .gif({ delay: Array(frames).fill(100), interPaletteMaxError: 0, interFrameMaxError: 0 })
      .toBuffer()
    assert.equal((await sharp(bytes, { animated: true }).metadata()).pages, frames)
    if (frames > 100) await assert.rejects(() => decodeEmailImage({ bytes }))
    else assert.equal((await decodeEmailImage({ bytes })).frames, frames)
  }
})
test('exact 2MiB image input is accepted but actual combined GIF frame pixels may not exceed 20 million', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  assert.equal(
    (await decodeEmailImage({ bytes: Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024 - png.length)]) }))
      .width,
    2
  )
  for (const width of [5000, 5001]) {
    const height = 2000,
      raw = Buffer.alloc(width * height * 2 * 3, 255)
    raw.fill(0, 0, width * height * 3)
    const bytes = await sharp(raw, { raw: { width, height: height * 2, channels: 3, pageHeight: height } })
      .gif({ delay: [100, 100], interPaletteMaxError: 0 })
      .toBuffer()
    assert.equal((await sharp(bytes, { animated: true }).metadata()).pages, 2)
    if (width === 5000) assert.equal((await decodeEmailImage({ bytes })).frames, 2)
    else await assert.rejects(() => decodeEmailImage({ bytes }))
  }
})
