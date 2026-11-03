// set_name, compose_logo, fit_logo and make_lettermark at the seam tool.run(input, ctx), logos drawn by code.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { BrandToolError, toolByName } from '../src/brand-step/tools/index.js'
import { KIT, makeCtx, markPng } from './_brand-tool-fixtures.mjs'

const run = (name, input, ctx) => toolByName(name).run(input, ctx)
const meta = (ctx, f) => sharp(ctx.files.read(f)).metadata()

test('set_name: one line and two lines, per side, in the kit heading colours; a second run keeps the first', async () => {
  const ctx = makeCtx()
  const a = await run('set_name', { text: 'Harbor Padel Club' }, ctx)
  assert.equal(a.ok, true)
  assert.equal(a.rendersAs, 'HARBOR PADEL CLUB')
  assert.deepEqual(a.twoLines.lines.length, 2)
  assert.equal(a.sidecar, 'name/name.json')
  assert.deepEqual(a.files, { light: 'name/name.light.png', dark: 'name/name.dark.png' })
  assert.deepEqual(a.twoLines.files, { light: 'name/name-2l.light.png', dark: 'name/name-2l.dark.png' })
  assert.equal(a.letterHeightPx, 160)
  assert.match(a.colours.dark, /^#[0-9a-f]{6}$/)
  assert.equal((await meta(ctx, a.files.light)).height, 160)
  assert.equal((await meta(ctx, a.twoLines.files.light)).height, 160 * 2 + 48)
  const b = await run('set_name', { text: 'Lumen' }, ctx)
  assert.equal(b.sidecar, 'name/name.v2.json')
  assert.equal(b.files.light, 'name/name.light.v2.png')
  assert.equal(b.twoLines, null)
  assert.ok(b.note.includes('one word: no two-line variant'))
  assert.equal(ctx.files.has('name/name.json'), true)
  await assert.rejects(run('set_name', { text: '  ' }, ctx), BrandToolError)
})

test('compose_logo: mark left, name right, both name variants, hard 3:1 on the name, advice on the mark', async () => {
  const ctx = makeCtx()
  ctx.files.write('mark/m.png', await markPng('#2a7f5f'))
  const name = await run('set_name', { text: 'Harbor Padel Club' }, ctx)
  const r = await run('compose_logo', { mark: 'mark/m.png', name: name.sidecar }, ctx)
  assert.equal(r.ok, true)
  assert.equal(r.run, 1)
  assert.equal(r.sidecar, 'logo/logo.json')
  assert.equal(r.sides.light.file, 'logo/logo.light.png')
  assert.equal(r.sides.dark.variants.twoLines.file, 'logo/logo-2l.dark.png')
  assert.equal(r.sides.light.nameReads, true)
  assert.equal(r.sides.light.variants.oneLine.letterHeight, 168)
  assert.equal((await meta(ctx, r.sides.light.file)).height, 400)
  assert.ok(['reads', 'weak'].includes(r.sides.dark.markAdviceSummary))
  assert.match(r.sides.dark.markAdviceNote, /advisory/)
  // run 2 keeps run 1; the name folder can be given instead of the sidecar
  const again = await run('compose_logo', { mark: 'mark/m.png', name: 'name' }, ctx)
  assert.equal(again.run, 2)
  assert.equal(again.sides.light.file, 'logo/logo.light.v2.png')
  assert.equal(ctx.files.has('logo/logo.v2.json'), true)
  await assert.rejects(run('compose_logo', { mark: 'mark/m.png', name: 'empty' }, makeCtx()), /no name\.json/)
})

test('compose_logo: a name that does not reach 3:1 on a ground of its side fails the hard rule', async () => {
  const kit = structuredClone(KIT)
  kit.site.logoSpots = kit.site.logoSpots.map((s) =>
    s.ground.side === 'dark' ? { ...s, ground: { ...s.ground, colour: '#fafafa' } } : s
  )
  const ctx = makeCtx({ kit })
  ctx.files.write('m.png', await markPng())
  const name = await run('set_name', { text: 'Lumen' }, ctx)
  const r = await run('compose_logo', { mark: 'm.png', name: name.sidecar }, ctx)
  assert.equal(r.ok, false)
  assert.match(r.error, /3:1/)
  assert.equal(r.sides.dark.nameReads, false)
})

test('fit_logo: picks one line, two lines or the mark from the letter height; never overwrites', async () => {
  const ctx = makeCtx()
  ctx.files.write('m.png', await markPng())
  const name = await run('set_name', { text: 'Harbor Padel Club' }, ctx)
  const logo = await run('compose_logo', { mark: 'm.png', name: name.sidecar }, ctx)
  const spots = KIT.site.logoSpots
  const shows = {}
  for (const s of spots) {
    const r = await run('fit_logo', { logo: logo.sides[s.ground.side].file, spot: s.id }, ctx)
    shows[s.id] = r.shows
    assert.deepEqual(r.size2x, [s.width * 2, s.height * 2])
    assert.equal(r.writable, s.setting !== null)
    assert.deepEqual((await meta(ctx, r.file)).width, s.width * 2)
    if (r.shows === 'logo') assert.ok(r.nameLetterHeightPx >= 14)
    if (r.shows === 'mark') assert.equal(r.nameLetterHeightPx, null)
  }
  assert.ok(Object.values(shows).includes('logo'))
  assert.ok(Object.values(shows).includes('mark'), JSON.stringify(shows))
  const first = spots[0]
  const again = await run('fit_logo', { logo: logo.sides[first.ground.side].file, spot: first.id }, ctx)
  assert.equal(again.run, 2)
  assert.equal(again.file, `spots/${first.id}.v2.png`)
})

test('fit_logo: the usage errors the lab named', async () => {
  const ctx = makeCtx()
  ctx.files.write('m.png', await markPng())
  const name = await run('set_name', { text: 'Lumen' }, ctx)
  const logo = await run('compose_logo', { mark: 'm.png', name: name.sidecar }, ctx)
  const lightSpot = KIT.site.logoSpots.find((s) => s.ground.side === 'light')
  await assert.rejects(
    run('fit_logo', { logo: logo.sides.light.file, spot: 'nope' }, ctx),
    (e) => /unknown spot/.test(e.message) && e.extra.spots.length > 0
  )
  await assert.rejects(
    run('fit_logo', { logo: logo.sides.dark.file, spot: lightSpot.id }, ctx),
    /logo of the dark side given for a light spot/
  )
  await assert.rejects(
    run('fit_logo', { logo: 'm.png', spot: lightSpot.id }, ctx),
    /no logo\.json next to the logo/
  )
  await assert.rejects(
    run('fit_logo', { logo: 'logo/other.png', spot: lightSpot.id }, ctx),
    /not a one-line logo/
  )
})

test('make_lettermark: initials on a rounded accent square, 512, black or white letters', async () => {
  const ctx = makeCtx()
  const r = await run('make_lettermark', { letters: 'HP', accent: '#2a7f5f' }, ctx)
  assert.equal(r.ok, true)
  assert.equal(r.file, 'mark/lettermark.png')
  assert.deepEqual(r.size, [512, 512])
  assert.equal(r.letterColour, '#ffffff')
  assert.ok(r.letterContrast >= 3)
  const m = await meta(ctx, r.file)
  assert.deepEqual([m.width, m.height, m.hasAlpha], [512, 512, true])
  const light = await run('make_lettermark', { letters: 'L', accent: '#f4d35e' }, ctx)
  assert.equal(light.letterColour, '#000000')
  assert.equal(light.file, 'mark/lettermark.v2.png')
  for (const bad of [
    { letters: 'ABCD', accent: '#2a7f5f' },
    { letters: 'A', accent: 'green' },
    { letters: '', accent: '#2a7f5f' }
  ])
    await assert.rejects(run('make_lettermark', bad, ctx), BrandToolError)
})
