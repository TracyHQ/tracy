// open_image and measure_logo at the seam tool.run(input, ctx), on logos drawn by code.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { BrandToolError, toolByName } from '../src/brand-step/tools/index.js'
import { makeCtx, markPng, materialPng } from './_brand-tool-fixtures.mjs'

const ctxWith = async (entries) =>
  makeCtx({ files: (await import('../src/brand-step/run-files.js')).memoryRunFiles(entries) })

test('measure_logo: a symbol over two lines on a solid ground', async () => {
  const ctx = await ctxWith({ 'media/m1.png': await materialPng('#f4efe6') })
  const r = await toolByName('measure_logo').run({ mediaId: 'm1' }, ctx)
  assert.equal(r.ok, true)
  assert.equal(r.file, 'media/m1.png')
  assert.deepEqual([r.width, r.height], [400, 360])
  assert.equal(r.ground.kind, 'solid')
  assert.equal(r.ground.colour, '#f4efe6')
  assert.equal(r.shapes.length, 3)
  assert.equal(r.shapes[0].kind, 'symbol')
  assert.deepEqual(
    r.shapes.slice(1).map((s) => s.kind),
    ['word line', 'small line']
  )
})

test('measure_logo: a transparent ground, a path as the reference, and the usage errors', async () => {
  const ctx = await ctxWith({ 'logo.png': await materialPng(null) })
  const r = await toolByName('measure_logo').run({ mediaId: 'logo.png' }, ctx)
  assert.deepEqual(r.ground, { kind: 'transparent', colour: null })
  await assert.rejects(
    toolByName('measure_logo').run({ mediaId: 'missing' }, ctx),
    (e) => e instanceof BrandToolError && /image not found: missing/.test(e.message)
  )
  const blank = await sharp({
    create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .png()
    .toBuffer()
  const empty = await ctxWith({ 'blank.png': blank })
  await assert.rejects(toolByName('measure_logo').run({ mediaId: 'blank.png' }, empty), /no foreground found/)
})

test('open_image: a brief image comes back at 512 px, a kit image through ctx.kitImage', async () => {
  const wide = await sharp({ create: { width: 1600, height: 800, channels: 3, background: '#336699' } })
    .png()
    .toBuffer()
  const ctx = await ctxWith({ 'media/hero.png': wide })
  const r = await toolByName('open_image').run({ id: 'hero' }, ctx)
  assert.deepEqual([r.width, r.height, r.shownAt], [1600, 800, [512, 256]])
  assert.equal(r.image.mediaType, 'image/png')
  assert.equal((await sharp(Buffer.from(r.image.base64, 'base64')).metadata()).width, 512)
  JSON.stringify(r) // JSON-serialisable
  const kit = makeCtx({ kitImage: async (id) => (id === 'home-1440' ? await markPng('#aa3300') : null) })
  const k = await toolByName('open_image').run({ id: 'home-1440' }, kit)
  assert.equal(k.file, null)
  await assert.rejects(toolByName('open_image').run({ id: 'nope' }, kit), /image not found/)
})
