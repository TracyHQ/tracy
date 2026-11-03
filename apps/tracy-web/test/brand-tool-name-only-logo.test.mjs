// A name-only logo (brand step trial bench, #320): the safe version puts the name alone on every spot, no mark. The
// approved spec says "a name-only logo per spot"; the favicon keeps the initials in the template accent.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { buildSafeVersion } from '../src/brand-step/brand-safe-version.js'
import { brandTools, toolByName } from '../src/brand-step/tools/index.js'
import { BRIEF, KIT, makeCtx } from './_brand-tool-fixtures.mjs'

const run = (name, input, ctx) => toolByName(name).run(input, ctx)
const meta = (ctx, f) => sharp(ctx.files.read(f)).metadata()

test('compose_logo nameOnly: the name alone, no mark and no gap; fit_logo never falls back to a mark', async () => {
  const ctx = makeCtx()
  const name = await run('set_name', { text: 'Harbor Padel Club' }, ctx)
  const r = await run('compose_logo', { name: name.sidecar, nameOnly: true }, ctx)
  assert.equal(r.ok, true)
  assert.equal(r.nameOnly, true)
  for (const side of ['light', 'dark']) {
    const s = r.sides[side]
    assert.equal(s.mark, null)
    assert.equal(s.markBox, null)
    assert.equal(s.markAdvice, null)
    assert.equal(s.nameReads, true)
    const sized = await meta(ctx, s.file)
    assert.equal(sized.height, 168, 'the canvas is the name, not a mark-high band')
    assert.equal(sized.width, Math.round(((await meta(ctx, name.files[side])).width * 168) / 160))
    assert.equal(s.variants.twoLines.height, 360)
  }
  for (const spot of KIT.site.logoSpots) {
    const fit = await run('fit_logo', { logo: r.sides[spot.ground.side].file, spot: spot.id }, ctx)
    assert.notEqual(fit.shows, 'mark')
  }
})

test('compose_logo nameOnly: a spot too small for the name still shows the name, with a note', async () => {
  const kit = structuredClone(KIT)
  kit.site.logoSpots = kit.site.logoSpots.map((s) => ({ ...s, width: 40, height: 10 }))
  const ctx = makeCtx({ kit })
  const name = await run('set_name', { text: 'Harbor Padel Club' }, ctx)
  const r = await run('compose_logo', { name: name.sidecar, nameOnly: true }, ctx)
  const spot = kit.site.logoSpots[0]
  const fit = await run('fit_logo', { logo: r.sides[spot.ground.side].file, spot: spot.id }, ctx)
  assert.ok(['logo', 'logo-2-lines'].includes(fit.shows))
  assert.match(fit.note.join(' '), /name only/)
})

test('compose_logo without nameOnly still needs a mark', async () => {
  const ctx = makeCtx()
  const name = await run('set_name', { text: 'Lumen' }, ctx)
  await assert.rejects(run('compose_logo', { name: name.sidecar }, ctx), /usage/)
})

test('the safe version shows the name alone on every spot and the initials only in the favicon', async () => {
  const ctx = makeCtx()
  const calls = []
  const tools = brandTools.map((t) => ({
    ...t,
    run: (input, c) => (calls.push([t.name, input]), t.run(input, c))
  }))
  const file = await buildSafeVersion({ tools, ctx, kit: { doc: KIT }, brief: BRIEF, reason: 'gate' })
  const compose = calls.find(([n]) => n === 'compose_logo')[1]
  assert.equal(compose.nameOnly, true)
  assert.equal(compose.mark, undefined, 'no mark goes into the logo')
  const sidecar = JSON.parse(ctx.files.read('logo/logo.json'))
  assert.ok(Object.values(sidecar.sides).every((s) => s.markBox === null))
  assert.equal(file.logo.spots.length, KIT.site.logoSpots.length)
  assert.ok(file.logo.spots.every((s) => ['logo', 'logo-2-lines'].includes(s.shows)))
  // The mark is still the initials: the favicon is made from it.
  assert.equal(file.logo.mark.decision, 'lettermark')
  assert.equal(file.logo.mark.letters, 'HP')
  assert.equal(file.favicon.mark, file.logo.mark.file)
})
