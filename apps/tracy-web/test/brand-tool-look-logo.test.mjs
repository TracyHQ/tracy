// look_logo at the seam tool.run(input, ctx) with a scripted reviewer (ctx.review): the images and the question it is
// given and the verdicts. Blind mode is in brand-tool-look-logo-blind.test.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { BrandToolError, toolByName } from '../src/brand-step/tools/index.js'
import { fakeReview, makeCtx, markPng, materialPng } from './_brand-tool-fixtures.mjs'

const look = (input, ctx) => toolByName('look_logo').run(input, ctx)
async function ctxWith(answers, entries = {}) {
  const { review, calls } = fakeReview(answers)
  const ctx = makeCtx({ review })
  ctx.files.write('logo.png', await materialPng(null))
  ctx.files.write('icon.png', await markPng('#2a7f5f', 180))
  for (const [k, v] of Object.entries(entries)) ctx.files.write(k, v)
  return { ctx, calls }
}

test('look_logo: each image is shown on its ground, the question lists the checks, verdicts come from the answer', async () => {
  const checks = ['the name reads exactly Harbor', 'nothing but the mark and the name']
  const { ctx, calls } = await ctxWith(
    [
      {
        images: [
          {
            image: 1,
            checks: [
              { check: checks[0], verdict: 'pass', reason: 'a' },
              { check: checks[1], verdict: 'pass', reason: 'b' }
            ]
          },
          {
            image: 2,
            checks: [
              { check: checks[0], verdict: 'pass', reason: 'a' },
              { check: checks[1], verdict: 'fail', reason: 'stray mark' }
            ]
          }
        ]
      }
    ],
    { 'orig.png': await materialPng('#f4efe6') }
  )
  const r = await look(
    { files: ['logo.png@#ffffff', { file: 'logo.png', ground: '#121111' }], checks, original: 'orig.png' },
    ctx
  )
  assert.equal(r.ok, true)
  assert.equal(r.cost, 0.0001)
  assert.deepEqual(
    r.results.map((x) => [x.file, x.ground, x.verdict]),
    [
      ['logo.png', '#ffffff', 'pass'],
      ['logo.png', '#121111', 'fail']
    ]
  )
  assert.equal(r.results[1].checks[1].reason, 'stray mark')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].blind, false)
  assert.equal(calls[0].images.length, 3, 'two looks and the original')
  const [first] = calls[0].images
  assert.equal((await sharp(first).metadata()).width, 400 + 40)
  assert.deepEqual(
    [...(await sharp(first).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer())],
    [255, 255, 255, 255]
  )
  assert.match(
    calls[0].question,
    /image 1 = logo\.png shown on #ffffff; image 2 = logo\.png shown on #121111/
  )
  assert.match(calls[0].question, /ORIGINAL material/)
  assert.match(calls[0].question, /1\. the name reads exactly Harbor\n2\. nothing but the mark and the name/)
})

test('look_logo: a missing answer for a check is a fail, an answer in a fenced block is read', async () => {
  const { ctx } = await ctxWith([
    '```json\n' +
      JSON.stringify({ images: [{ image: 1, checks: [{ check: 'a', verdict: 'pass', reason: '' }] }] }) +
      '\n```'
  ])
  const r = await look({ files: [{ file: 'logo.png', ground: '#ffffff' }], checks: ['a', 'b'] }, ctx)
  assert.equal(r.results[0].verdict, 'fail')
})

test('look_logo: an unreadable answer, no reviewer and bad inputs are errors the agent sees', async () => {
  const { ctx } = await ctxWith(['I think it looks fine'])
  await assert.rejects(
    look({ files: [{ file: 'logo.png' }], checks: ['a'] }, ctx),
    (e) => e instanceof BrandToolError && /no parsable answer/.test(e.message) && e.extra.cost === 0.0001
  )
  await assert.rejects(
    look({ files: [{ file: 'logo.png' }], checks: ['a'] }, makeCtx()),
    /no reviewer is available/
  )
  await assert.rejects(look({ files: [], checks: ['a'] }, ctx), /non-empty/)
  await assert.rejects(look({ files: [{ file: 'missing.png' }], checks: ['a'] }, ctx), /image not found/)
})
