import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { checkSpotImages, spotInk, BRAND_SPOT_CHECK } from '../src/brand-step/gate-spots.js'
import { brandHarnessFor } from '../src/brand-step/brand-harness.js'
import { checkBrandFile } from '../src/brand-step/save-brand-file.js'
import { toolByName } from '../src/brand-step/tools/index.js'
import { loadCase, blockPng } from './_brand-gate-files.mjs'
import { memoryFiles } from '../src/brand-step/gate-context.js'
import { makeCtx } from './_brand-tool-fixtures.mjs'

const image = async (rgb, width = 80, height = 80) => {
  const data = Buffer.alloc(width * height * 4)
  for (let y = 8; y < height - 8; y++)
    for (let x = 8; x < width - 8; x++) data.set([...rgb, 255], (y * width + x) * 4)
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}
const contain = async (bytes, position = 'left') =>
  sharp(await sharp(bytes).trim({ threshold: 0 }).png().toBuffer())
    .resize(256, 160, { fit: 'contain', position, background: '#00000000' })
    .png()
    .toBuffer()
const context = async ({ wrong = false, raw = false, ownLook = false, center = false } = {}) => {
  const light = await image([34, 34, 34])
  const dark = await image([232, 220, 170])
  const map = new Map([
    ['light.png', light],
    ['dark.png', dark],
    [
      'spot.png',
      raw
        ? await image([232, 220, 170], 512, 512)
        : await contain(wrong ? dark : light, center ? 'centre' : 'left')
    ]
  ])
  const errors = []
  return {
    L: { spots: [{ spot: 'header', file: 'spot.png', shows: 'mark' }] },
    spots: [{ id: 'header', width: 128, height: 80, ground: { side: 'light', colour: '#fcfaf6' } }],
    files: { has: (p) => map.has(p), read: async (p) => map.get(p) },
    norm: (p) => p,
    sideMark: (side) => `${side}.png`,
    lastLookOn: new Map([['light.png@#fcfaf6', 'pass'], ...(ownLook ? [['spot.png@#fcfaf6', 'pass']] : [])]),
    bad: (field, why) => errors.push({ field, why }),
    errors
  }
}

test('a raw square mark is rejected before a rectangular site write', async () => {
  const ctx = await context({ raw: true })
  await checkSpotImages(ctx)
  assert.match(ctx.errors[0].why, /actual image is 512x512.*256x160/)
})
test('reviewing a recoloured side mark does not cover an unrecoloured actual spot', async () => {
  const ctx = await context({ wrong: true })
  await checkSpotImages(ctx)
  assert.ok(ctx.errors.some((x) => /actual spot file needs a passing look/.test(x.why)))
  assert.ok(ctx.errors.some((x) => /100%.*under 2:1/.test(x.why)))
})
test('a misleading passing final review cannot override blocked actual ink contrast', async () => {
  const ctx = await context({ wrong: true, ownLook: true })
  await checkSpotImages(ctx)
  assert.ok(ctx.errors.some((x) => /100%.*under 2:1/.test(x.why)))
})
for (const center of [false, true])
  test(`review transfers to the actual ${center ? 'center' : 'left'} fitted side mark`, async () => {
    const ctx = await context({ center })
    await checkSpotImages(ctx)
    assert.deepEqual(ctx.errors, [])
  })
test('independent review still applies to manually fitted final files', async () => {
  const ctx = await context({ ownLook: true })
  ctx.lastLookOn.delete('light.png@#fcfaf6')
  await checkSpotImages(ctx)
  assert.deepEqual(ctx.errors, [])
})
test('matching pixels without an independent review are rejected', async () => {
  const ctx = await context()
  ctx.lastLookOn.clear()
  await checkSpotImages(ctx)
  assert.match(ctx.errors[0].why, /passing look_logo/)
})
test('new brand runs freeze the spot checker and unknown checker versions refuse', async () => {
  assert.equal(brandHarnessFor('deepseek-v4-flash', 'deepseek').brandSpotCheck, BRAND_SPOT_CHECK)
  const result = await checkBrandFile({ brandFile: {}, brief: {}, kit: {}, files: {}, spotCheck: 'future' })
  assert.deepEqual(result.rejected, [{ field: '(spot check)', why: 'unsupported brand spot check version' }])
})
test('spot ink uses the site check rule without blocking a minority of faint pixels', () => {
  const rgba = Buffer.alloc(100 * 4)
  for (let i = 0; i < 100; i++) rgba.set([...(i < 34 ? [240, 240, 240] : [20, 20, 20]), 255], i * 4)
  assert.equal(spotInk(rgba, '#ffffff').under2, 0.34)
})
test('fit_logo markOnly supports held names and writes a real 2x transparent spot', async () => {
  const ctx = makeCtx()
  ctx.kit = structuredClone(ctx.kit)
  ctx.kit.site.logoSpots[0] = { ...ctx.kit.site.logoSpots[0], width: 128, height: 80 }
  const source = ctx.files.write('standalone.png', await image([34, 34, 34]))
  const fit = await toolByName('fit_logo').run(
    { logo: source, spot: ctx.kit.site.logoSpots[0].id, markOnly: true },
    ctx
  )
  const meta = await sharp(ctx.files.read(fit.file)).metadata()
  assert.equal(fit.shows, 'mark')
  assert.equal(fit.from, source)
  assert.deepEqual([meta.width, meta.height], [256, 160])
  assert.equal((await sharp(ctx.files.read(fit.file)).stats()).isOpaque, false)
})
test('fit_logo markOnly rejects missing files, opaque marks and invalid mode values', async () => {
  const ctx = makeCtx()
  const spot = ctx.kit.site.logoSpots[0].id
  await assert.rejects(toolByName('fit_logo').run({ logo: 'absent.png', spot, markOnly: true }, ctx))
  ctx.files.write(
    'opaque.png',
    await sharp({ create: { width: 80, height: 80, channels: 3, background: '#222222' } })
      .png()
      .toBuffer()
  )
  await assert.rejects(
    toolByName('fit_logo').run({ logo: 'opaque.png', spot, markOnly: true }, ctx),
    /transparent/
  )
  await assert.rejects(
    toolByName('fit_logo').run({ logo: 'opaque.png', spot, markOnly: 'true' }, ctx),
    /boolean/
  )
})

for (const id of ['1-padel', '2-words-only', '3-no-logo', '4-black-grey-symbol', '5-bakery-words']) {
  test(`the real fitted fixture ${id} passes the versioned complete gate`, async () => {
    const c = await loadCase(id)
    const result = await checkBrandFile({
      brandFile: c.brand,
      brief: c.brief,
      kit: c.kit,
      files: c.files,
      spotCheck: BRAND_SPOT_CHECK
    })
    assert.deepEqual(result.rejected ?? [], [])
  })
}

test('the complete legacy gate accepts a raw 512 square; the new frozen gate rejects that actual file', async () => {
  const c = await loadCase('4-black-grey-symbol')
  c.brand.logo.spots[0].shows = 'mark'
  c.brand.logo.spots[0].file = c.brand.logo.mark.file
  c.brand.logo.logos.light = null
  c.entries.set(c.brand.logo.mark.file, await blockPng('#33261a', 512, 512))
  const input = { brandFile: c.brand, brief: c.brief, kit: c.kit, files: memoryFiles(c.entries) }
  assert.equal((await checkBrandFile({ ...input, spotCheck: null })).ok, true)
  const strict = await checkBrandFile({ ...input, spotCheck: BRAND_SPOT_CHECK })
  assert.ok(strict.rejected.some((x) => x.field === 'logo.spots[0].file' && /512x512/.test(x.why)))
})

test('fit_logo markOnly rejects escaping paths and empty transparent marks', async () => {
  const ctx = makeCtx()
  const spot = ctx.kit.site.logoSpots[0].id
  await assert.rejects(toolByName('fit_logo').run({ logo: '../outside.png', spot, markOnly: true }, ctx))
  ctx.files.write(
    'empty.png',
    await sharp({ create: { width: 80, height: 80, channels: 4, background: '#00000000' } })
      .png()
      .toBuffer()
  )
  await assert.rejects(
    toolByName('fit_logo').run({ logo: 'empty.png', spot, markOnly: true }, ctx),
    /visible ink/
  )
})
