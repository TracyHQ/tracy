// cut_mark and recolour_mark at the seam tool.run(input, ctx) (#321): marks and pictures DRAWN BY CODE, the JA Boxing
// 1.0.10 kit. A cut mark keeps the ground its figure encloses (and says so in a mask sidecar); an inverted mark reads on
// the other side; an icon recolours by palette; a lettermark by one solid colour. Tools never overwrite.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { contrastHex, hex } from '../src/brand-step/colour-math.js'
import { BrandToolError, toolByName } from '../src/brand-step/tools/index.js'
import { KIT, makeCtx, markPng, RING_BOX, ringMaterialPng } from './_brand-tool-fixtures.mjs'

const cut = (input, ctx) => toolByName('cut_mark').run(input, ctx)
const recolour = (input, ctx) => toolByName('recolour_mark').run(input, ctx)
const GROUND = { dark: '#121111', light: '#ffffff' }
const pixels = async (bytes) => {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width }
}
const at = ({ data, w }, x, y) => {
  const i = (y * w + x) * 4
  return { hex: hex(data[i], data[i + 1], data[i + 2]), a: data[i + 3] }
}

async function cutRing() {
  const ctx = makeCtx()
  ctx.files.write('media/logo.png', await ringMaterialPng())
  const r = await cut({ mediaId: 'media/logo.png', box: RING_BOX }, ctx)
  return { ctx, r }
}

test('both tools are in the brand tool list', () => {
  for (const name of ['cut_mark', 'recolour_mark']) {
    const t = toolByName(name)
    assert.equal(typeof t.run, 'function')
    assert.equal(t.inputSchema.type, 'object')
  }
})

test('cut_mark: a transparent 512 mark that keeps the ground the figure encloses, with a mask sidecar', async () => {
  const { ctx, r } = await cutRing()
  assert.equal(r.ok, true)
  assert.equal(r.file, 'mark/cut-mark.png')
  const meta = await sharp(ctx.files.read(r.file)).metadata()
  assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [512, 512, true])
  const png = await pixels(ctx.files.read(r.file))
  assert.equal(at(png, 5, 5).a, 0, 'the ground outside the figure is gone')
  // the middle of the mark is the grey bar, beside it the enclosed ground is opaque and keeps its colour
  assert.equal(at(png, 256 - 60, 256).hex, '#f4efe6')
  assert.equal(at(png, 256 - 60, 256).a, 255)
  const mask = await pixels(ctx.files.read(r.fill.mask))
  assert.equal(r.fill.mask, 'mark/cut-mark.mask.png')
  assert.equal(at(mask, 256 - 60, 256).hex, '#ffffff', 'mask 255 = kept fill')
  assert.equal(at(mask, 256 - 215, 256).hex, '#000000', 'the ring itself is figure, not fill')
  assert.ok(r.fill.keptGroundPixels > 3000, String(r.fill.keptGroundPixels))
  assert.match(r.method, /enclosed ground kept opaque/)
  assert.ok(r.edges.fringeShare < 0.1, JSON.stringify(r.edges))
  for (const p of Object.values(r.edges.proofs)) assert.equal(ctx.files.has(p), true, p)
})

test('cut_mark: the text bar outside the box is not in the mark, and it never overwrites', async () => {
  const { ctx, r } = await cutRing()
  const trimmed = await sharp(ctx.files.read(r.file)).trim({ threshold: 0 }).metadata()
  assert.ok(Math.abs(trimmed.width - trimmed.height) <= 2, 'only the round symbol is in the mark')
  const again = await cut({ mediaId: 'media/logo.png', box: [100, 20, 200, 200] }, ctx)
  assert.equal(again.file, 'mark/cut-mark.v2.png')
  assert.equal(again.fill.mask, 'mark/cut-mark.v2.mask.png')
  assert.equal(ctx.files.has('mark/cut-mark.png'), true)
})

test('cut_mark: a transparent source keeps its alpha and has no fill; a bad box is a usage error', async () => {
  const ctx = makeCtx()
  ctx.files.write('media/logo.png', await markPng('#2a7f5f', 200))
  const r = await cut({ mediaId: 'media/logo.png', box: '0,0,200,200' }, ctx)
  assert.equal(r.fill.keptGroundPixels, 0)
  assert.match(r.method, /own transparency/)
  await assert.rejects(cut({ mediaId: 'media/logo.png', box: [1, 2] }, ctx), BrandToolError)
  await assert.rejects(cut({ mediaId: 'media/nope.png', box: [0, 0, 5, 5] }, ctx), /image not found/)
})

for (const side of ['dark', 'light']) {
  test(`recolour_mark: a cut mark is inverted for the ${side} side and every figure tone reads there`, async () => {
    const { ctx, r } = await cutRing()
    const out = await recolour({ mark: r.file, side }, ctx)
    assert.equal(out.ok, true)
    assert.equal(out.mode, 'invert')
    assert.equal(out.file, `mark/recoloured.${side}.png`)
    const png = await pixels(ctx.files.read(out.file))
    // the kept fill becomes the side's ground, the darkest figure part the side's heading colour
    assert.equal(at(png, 256 - 60, 256).hex, GROUND[side])
    const ring = at(png, 256 - 215, 256)
    assert.ok(contrastHex(ring.hex, out.colour) < 1.3, `${ring.hex} is the heading colour ${out.colour}`)
    assert.ok(contrastHex(ring.hex, GROUND[side]) >= 3)
    // the grey bar stays a different tone from the ring and still reads 3:1
    const bar = at(png, 256, 256)
    assert.notEqual(bar.hex, ring.hex)
    assert.ok(contrastHex(bar.hex, GROUND[side]) >= 3, bar.hex)
    assert.ok(out.invert.figureFloorOnGround >= 3)
    assert.equal(ctx.files.has(r.file), true, 'the original stays')
  })
}

test('recolour_mark: palette mode for an icon recolours only the colours that do not read; solid for a lettermark', async () => {
  const ctx = makeCtx()
  ctx.files.write('mark/icon.png', await markPng('#0b3d20', 300))
  const p = await recolour({ mark: 'mark/icon.png', side: 'dark' }, ctx)
  assert.equal(p.mode, 'palette')
  assert.deepEqual(
    p.palette.map((c) => [c.from, c.to]),
    [['#0b3d20', '#ffffff']]
  )
  assert.ok(p.palette[0].toOnGround >= 3)
  ctx.files.write('mark/icon2.png', await markPng('#f2e3b3', 300))
  const keeps = await recolour({ mark: 'mark/icon2.png', side: 'dark' }, ctx)
  assert.deepEqual(keeps.palette[0].from, keeps.palette[0].to, 'a colour that reads stays')
  // a lettermark has many colours (anti-aliased letters): one solid colour, alpha kept
  const letters = await sharp({
    create: { width: 64, height: 64, channels: 4, background: '#2a7f5f' }
  })
    .composite([
      { input: await markPng('#ffffff', 40), left: 12, top: 12 },
      { input: await markPng('#888888', 12), left: 2, top: 2 }
    ])
    .png()
    .toBuffer()
  ctx.files.write('mark/lettermark.png', letters)
  const s = await recolour({ mark: 'mark/lettermark.png', side: 'light', colour: '#112233' }, ctx)
  assert.equal(s.mode, 'solid')
  assert.equal(s.colour, '#112233')
  const px = await pixels(ctx.files.read(s.file))
  assert.equal(at(px, 1, 1).hex, '#112233')
  assert.equal(at(px, 32, 32).a, 255)
})

test('recolour_mark: refuses what the lab refuses and never overwrites', async () => {
  const ctx = makeCtx()
  ctx.files.write('mark/icon.png', await markPng('#0b3d20', 100))
  await assert.rejects(
    recolour({ mark: 'mark/icon.png', side: 'dark', mode: 'invert' }, ctx),
    /needs the fill mask/
  )
  await assert.rejects(recolour({ mark: 'mark/icon.png', side: 'left' }, ctx), /light or dark/)
  await assert.rejects(recolour({ mark: 'mark/icon.png', side: 'dark', colour: 'red' }, ctx), /bad colour/)
  const a = await recolour({ mark: 'mark/icon.png', side: 'dark' }, ctx)
  const b = await recolour({ mark: 'mark/icon.png', side: 'dark' }, ctx)
  assert.deepEqual([a.file, b.file], ['mark/recoloured.dark.png', 'mark/recoloured.dark.v2.png'])
  assert.ok(KIT.site.brandColours.sides.some((x) => x.groundSide === 'dark'))
})
