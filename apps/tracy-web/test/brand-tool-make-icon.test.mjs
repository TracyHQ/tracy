// make_icon at the seam tool.run(input, ctx) with a fake draw door and a fake cost tracker: the drawing prompt, the
// exact colours, the plate fallback (the disc rule), tool failures, and the cost cap and call log around the drawing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BrandToolError, brandTools, toolByName } from '../src/brand-step/tools/index.js'
import { DrawRefused } from '../src/brand-step/brand-draw.js'
import { block, disc, drawing, fakeDraw, fakeSpend, pixelsOf } from './_brand-icon-fixtures.mjs'
import { makeCtx } from './_brand-tool-fixtures.mjs'

const GREEN = '#2a7f5f'
const NAVY = '#14213d'
const make = (input, ctx) => toolByName('make_icon').run(input, ctx)
const setup = (answers, spendOptions) => {
  const door = fakeDraw(answers)
  const spend = fakeSpend(spendOptions)
  return { door, spend, ctx: makeCtx({ draw: door.draw, spend }) }
}

test('make_icon is one of the brand tools', () => {
  assert.ok(brandTools.some((t) => t.name === 'make_icon'))
})

test('one colour: every visible pixel is exactly that colour, in a transparent 512 square, attempt files kept', async () => {
  const { ctx, door } = setup([await drawing(disc(GREEN))])
  const r = await make({ subject: 'a padel club: a racket', colours: [GREEN] }, ctx)
  assert.equal(r.ok, true)
  assert.equal(r.toolFailure, false)
  assert.equal(r.attempt, 1)
  assert.equal(r.file, 'icon/icon-1.png')
  assert.deepEqual([r.model, r.provider, r.cost], ['vendor/picture-model', 'fake-provider', 0.034])
  const px = await pixelsOf(ctx.files.read(r.file))
  assert.deepEqual([...px.colours], [GREEN])
  assert.deepEqual([px.width, px.height, px.alphaAt(0, 0), px.alphaAt(256, 256)], [512, 512, 0, 255])
  assert.equal(r.measure.colours[0].share, 1)
  for (const f of [r.raw, r.proofs['on-black'], r.proofs['on-white'], 'icon/icon-1.json'])
    assert.ok(ctx.files.has(f), f)
  assert.equal(r.plate, null)
  // the drawing prompt is the tool's: subject and colour in, the lab's rules in, a plain ground named
  const { prompt } = door.calls[0]
  assert.match(prompt, /for a padel club: a racket/)
  assert.match(prompt, new RegExp(`exactly one colour for the whole symbol: ${GREEN}`))
  assert.match(prompt, /128 x 128 pixels/)
  assert.match(prompt, /ONE subject only/)
  assert.match(prompt, /bold geometric pictogram or emblem/)
  assert.match(prompt, /one tenth of the icon width/)
  assert.match(prompt, /symbolic or abstract/)
  assert.match(prompt, /No text, no letters/)
  assert.match(prompt, /Plain uniform white background \(#ffffff\)/)
})

test('two colours: both exact, both present, and a JPEG answer is read too', async () => {
  const { ctx } = setup([await drawing(disc(GREEN, NAVY), { ground: '#ffffff', format: 'jpeg' })])
  const r = await make({ subject: 'a bakery: a loaf', colours: `${GREEN}, ${NAVY}` }, ctx)
  assert.equal(r.ok, true, r.error)
  assert.ok(r.raw.endsWith('.raw.jpg'))
  assert.deepEqual([...(await pixelsOf(ctx.files.read(r.file))).colours].sort(), [NAVY, GREEN].sort())
  assert.ok(r.measure.colours.every((c) => c.share >= 0.03))
})

test('disc rule: a one-colour drawing for two colours goes on a circle of the missing colour, by code', async () => {
  const { ctx, door } = setup([await drawing(disc(GREEN))])
  const r = await make({ subject: 'a cafe: a cup', colours: [GREEN, NAVY] }, ctx)
  assert.equal(r.ok, true, r.error)
  assert.equal(door.calls.length, 1, 'no second drawing for the plate')
  assert.equal(r.plate.used, true)
  assert.equal(r.plate.shape, 'circle')
  assert.deepEqual([r.plate.iconColour, r.plate.plateColour, r.plate.swapped], [GREEN, NAVY, false])
  assert.ok(r.plate.ratio >= 3)
  assert.ok(ctx.files.has(r.plate.unplated))
  const px = await pixelsOf(ctx.files.read(r.file))
  assert.deepEqual([...px.colours].sort(), [NAVY, GREEN].sort())
  assert.equal(px.alphaAt(0, 0), 0, 'the plate is a circle: the corner stays clear')
  assert.equal(px.alphaAt(256, 40), 255, 'the plate fills the square from the edge in')
})

test('disc rule: an icon that is not compact goes on a rounded square', async () => {
  const square = setup([await drawing(block(GREEN))])
  const r = await make({ subject: 'a bank: a vault', colours: [GREEN, NAVY] }, square.ctx)
  assert.equal(r.plate.shape, 'rounded-square')
  const px = await pixelsOf(square.ctx.files.read(r.file))
  assert.deepEqual([px.alphaAt(256, 40), px.alphaAt(36, 36)], [255, 0], 'a square plate with rounded corners')
})

test('disc rule: two colours under 3:1 fail the plate, as a tool failure, with the one-colour icon kept', async () => {
  const { ctx } = setup([await drawing(disc('#777777'))])
  const r = await make({ subject: 'a studio: a lamp', colours: ['#777777', '#888888'] }, ctx)
  assert.equal(r.ok, false)
  assert.equal(r.toolFailure, true)
  assert.match(r.error, /plate fallback: the two colours read/)
  assert.equal(r.plate.used, false)
  assert.ok(ctx.files.has(r.file))
})

test('a failing drawing is a tool failure: it keeps its attempt number, writes its record and logs the call', async () => {
  const { ctx, spend } = setup([new Error('model call failed: HTTP 500'), await drawing(disc(GREEN))])
  const failed = await make({ subject: 'a gym: a kettlebell', colours: [GREEN] }, ctx)
  assert.deepEqual([failed.ok, failed.toolFailure, failed.attempt], [false, true, 1])
  assert.match(failed.error, /HTTP 500/)
  assert.ok(ctx.files.has('icon/icon-1.json'))
  assert.equal(spend.events.at(-1).status, 'failed')
  assert.equal(spend.events.at(-1).error.code, 'DRAW_FAILED')
  const next = await make({ subject: 'a gym: a kettlebell', colours: [GREEN] }, ctx)
  assert.deepEqual([next.ok, next.attempt, next.file], [true, 2, 'icon/icon-2.png'])
})

test('other tool failures: an empty picture, no image at all, a ground that matches a colour, a refused door', async () => {
  const empty = await drawing(() => null)
  const sameGround = await drawing(disc('#f0f0f0'), { ground: '#ffffff' })
  const cases = [
    [[empty], /empty/],
    [[Buffer.alloc(0)], /without an image/],
    [[sameGround], /too close to a requested colour/],
    [[new DrawRefused('The picture door "seedImage" has no provider and model.')], /no provider and model/]
  ]
  for (const [answers, message] of cases) {
    const { ctx, spend } = setup(answers)
    const r = await make(
      { subject: 'a shop: a bag', colours: answers[0] === sameGround ? ['#f0f0f0'] : [GREEN] },
      ctx
    )
    assert.deepEqual([r.ok, r.toolFailure], [false, true], String(message))
    assert.match(r.error, message)
    const logged = spend.events.filter((e) => e !== 'check')
    assert.equal(
      logged.length,
      answers[0] instanceof DrawRefused ? 0 : 1,
      'a refusal spent nothing, so logs nothing'
    )
  }
})

test('usage errors throw and use no attempt number, no cost check and no drawing', async () => {
  const { ctx, door, spend } = setup([await drawing(disc(GREEN))])
  for (const input of [
    { subject: '', colours: [GREEN] },
    { subject: 'x', colours: [] },
    { subject: 'x', colours: ['green'] },
    { subject: 'x', colours: [GREEN, GREEN] },
    { subject: 'x', colours: [GREEN, NAVY, '#000000'] },
    { subject: 'x'.repeat(201), colours: [GREEN] }
  ])
    await assert.rejects(make(input, ctx), BrandToolError)
  await assert.rejects(make({ subject: 'x', colours: [GREEN] }, makeCtx()), /no picture model/)
  assert.deepEqual([door.calls.length, spend.events.length, ctx.files.list('icon/').length], [0, 0, 0])
})

test('the cost cap is checked before the drawing and the drawing is recorded after it, with no bytes or key', async () => {
  const { ctx, spend } = setup([await drawing(disc(GREEN))])
  await make({ subject: 'a school: a book', colours: [GREEN] }, ctx)
  assert.equal(spend.events[0], 'check')
  const call = spend.events[1]
  assert.deepEqual(
    [call.kind, call.tool, call.model, call.status, call.costUsd],
    ['drawing', 'make_icon', 'vendor/picture-model', 'answered', 0.034]
  )
  assert.equal(typeof call.latencyMs, 'number')
  assert.doesNotMatch(JSON.stringify(spend.events), /base64|\[\d+,\d+|"data":/)
})

test('a reached cap refuses before anything is drawn, written or recorded', async () => {
  const { ctx, door, spend } = setup([await drawing(disc(GREEN))], { capAfter: 0 })
  await assert.rejects(make({ subject: 'a school: a book', colours: [GREEN] }, ctx), {
    code: 'BRAND_COST_CAP'
  })
  assert.deepEqual([door.calls.length, ctx.files.list('icon/').length, spend.events], [0, 0, ['check']])
})
