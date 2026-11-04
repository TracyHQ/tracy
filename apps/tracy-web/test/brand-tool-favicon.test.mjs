// make_favicon at the seam tool.run(input, ctx): the tab icon order transparent -> tile -> tile with a recoloured mark.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { toolByName } from '../src/brand-step/tools/index.js'
import { KIT, makeCtx, markPng } from './_brand-tool-fixtures.mjs'

const run = (input, ctx) => toolByName('make_favicon').run(input, ctx)
const GROUND = KIT.site.brandColours.opensOn.ground

test('make_favicon: a mark that stands out on both tabs goes out transparent, with the full set', async () => {
  const ctx = makeCtx()
  ctx.files.write('mark.png', await markPng('#e8c872', 300))
  const r = await run({ mark: 'mark.png' }, ctx)
  // the mid-tone mark reads on the dark tab but not on the light one: it falls to the tile
  assert.ok(['transparent', 'tile'].includes(r.tabIcons))
  assert.equal(r.ok, true)
  assert.equal(r.run, 1)
  assert.deepEqual(r.icoSizes, [16, 32, 48])
  for (const f of Object.values(r.files)) assert.equal(ctx.files.has(f), true, f)
  assert.equal((await sharp(ctx.files.read(r.files.phone180)).metadata()).width, 180)
  assert.equal((await sharp(ctx.files.read(r.files.png512)).metadata()).width, 512)
  assert.equal(r.phoneGround, GROUND)
  assert.equal(r.check.pass, true)
  // ICO: three PNG entries
  const ico = ctx.files.read(r.files.ico)
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3])
  assert.deepEqual([ico[6], ico[22], ico[38]], [16, 32, 48])
  assert.equal(
    ico.subarray(ico.readUInt32LE(18), ico.readUInt32LE(18) + 8).toString('hex'),
    '89504e470d0a1a0a'
  )
})

test('make_favicon: a side with its own mark skips the transparent icon and uses the tile', async () => {
  const ctx = makeCtx()
  ctx.files.write('mark.png', await markPng('#f2e3b3', 300))
  ctx.files.write('dark-mark.png', await markPng('#f2e3b3', 300))
  const r = await run({ mark: 'mark.png', sideMarks: { dark: 'dark-mark.png' } }, ctx)
  assert.equal(r.tabIcons, 'tile')
  assert.equal(r.tileGround, GROUND)
  assert.deepEqual(
    r.candidates.map((c) => c.kind),
    ['tile']
  )
  assert.match(r.tabIconsWhy, /a side has its own mark/)
  const again = await run({ mark: 'mark.png', sideMarks: { dark: 'dark-mark.png' } }, ctx)
  assert.equal(again.run, 2)
  assert.equal(again.files.ico, 'favicon/favicon.v2.ico')
  assert.equal(ctx.files.has('favicon/favicon.ico'), true)
})

test('make_favicon: a dark mark fails both icons, then passes with the mark recoloured by recolour_mark', async () => {
  const ctx = makeCtx()
  ctx.files.write('mark.png', await markPng('#0b3d20', 300))
  const real = await run({ mark: 'mark.png' }, ctx)
  assert.equal(real.ok, true)
  assert.equal(real.tabIcons, 'tile')
  assert.equal(real.tileMarkRecoloured, true)
  assert.deepEqual(
    real.candidates.map((c) => [c.kind, c.pass]),
    [
      ['transparent', false],
      ['tile', false],
      ['tile-recoloured', true]
    ]
  )
  assert.equal(real.recolour.mode, 'palette')
  assert.match(real.tileMark, /^favicon\/tile-mark\.dark/)
  assert.equal(ctx.files.has('mark.png'), true, 'the mark itself is untouched')

  const broken = await run(
    { mark: 'mark.png' },
    makeCtx({
      files: ctx.files,
      recolourMark: async () => {
        throw new Error('recolour broke')
      }
    })
  )
  assert.equal(broken.ok, false)
  assert.match(broken.recolour.error, /recolour broke/)

  const calls = []
  const wired = makeCtx({
    files: ctx.files,
    recolourMark: async ({ mark, side, nameHint }) => {
      calls.push({ mark, side })
      return {
        ok: true,
        file: ctx.files.write(nameHint, await markPng('#f2e3b3', 300)),
        mode: 'palette',
        palette: ['#f2e3b3']
      }
    }
  })
  const r = await run({ mark: 'mark.png' }, wired)
  assert.equal(r.ok, true)
  assert.equal(r.tabIcons, 'tile')
  assert.equal(r.tileMarkRecoloured, true)
  assert.deepEqual(calls, [{ mark: 'mark.png', side: 'dark' }])
  assert.deepEqual(
    r.candidates.map((c) => c.kind),
    ['transparent', 'tile', 'tile-recoloured']
  )
  assert.deepEqual(r.recolour, { ok: true, palette: ['#f2e3b3'], mode: 'palette' })
})

test('make_favicon: a mark too thin to fill the square fails with every measurement', async () => {
  const thin = await sharp({
    create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      {
        input: await sharp({ create: { width: 300, height: 6, channels: 4, background: '#f2e3b3' } })
          .png()
          .toBuffer(),
        left: 0,
        top: 147
      }
    ])
    .png()
    .toBuffer()
  const ctx = makeCtx()
  ctx.files.write('thin.png', thin)
  const r = await run({ mark: 'thin.png' }, ctx)
  // the mark is trimmed to its bounding box and contained, so a wide thin line stays thin in the 32 px square
  assert.equal(r.ok, false)
  assert.ok(r.candidates.every((c) => c.bboxShare < 0.2))
})
