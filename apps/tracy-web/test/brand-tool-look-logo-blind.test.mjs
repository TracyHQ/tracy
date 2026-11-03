// look_logo blind mode at the seam tool.run(input, ctx) with a scripted reviewer: the icon at 128 px, the reviewer not
// told the business, the blind match rule decided by code.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { blindVerdict } from '../src/brand-step/blind-match.js'
import { BrandToolError, toolByName } from '../src/brand-step/tools/index.js'
import { fakeReview, makeCtx, markPng, materialPng } from './_brand-tool-fixtures.mjs'

const look = (input, ctx) => toolByName('look_logo').run(input, ctx)
const CHECK = 'it reads clearly on this ground'
const BLIND = {
  businessType: 'padel club',
  accept: ['padel court'],
  neighbour: 'tennis club',
  neighbourAccept: ['tennis academy']
}
const blindAnswer = (guesses) => ({
  business: { answer: guesses[0], guesses, reason: 'a racket' },
  images: [1, 2].map((image) => ({ image, checks: [{ check: CHECK, verdict: 'pass', reason: 'seen' }] }))
})
async function ctxWith(answers, entries = {}) {
  const { review, calls } = fakeReview(answers)
  const ctx = makeCtx({ review })
  ctx.files.write('icon.png', await markPng('#2a7f5f', 180))
  for (const [k, v] of Object.entries(entries)) ctx.files.write(k, v)
  return { ctx, calls }
}
const TWO = [
  { file: 'icon.png', ground: '#ffffff' },
  { file: 'icon.png', ground: '#121111' }
]

test('look_logo blind: the icon is rendered at 128 px, the reviewer is not told the business, code decides', async () => {
  const { ctx, calls } = await ctxWith([blindAnswer(['tennis racket shop', 'padel court club', 'gym'])])
  const r = await look({ files: TWO, checks: [CHECK], blind: true, ...BLIND }, ctx)
  assert.equal(calls[0].blind, true)
  assert.doesNotMatch(calls[0].question, /padel|tennis|icon\.png/i)
  assert.match(calls[0].question, /REAL size of 128 x 128 pixels/)
  assert.equal(r.blind.verdict, 'pass')
  assert.equal(r.blind.matchedPosition, 2)
  assert.equal(r.blind.size, 128)
  assert.deepEqual(
    r.results.map((x) => [x.verdict, x.shownAt, x.checks.at(-1).check]),
    Array(2).fill(['pass', 128, 'blind: the business type the icon suggests at 128 px, unprompted'])
  )
  const rendered = await sharp(ctx.files.read(r.results[0].rendering)).metadata()
  assert.deepEqual([rendered.width, rendered.height], [128, 128])
  assert.equal((await sharp(calls[0].images[0]).metadata()).width, 128 * 2 + 40)
})

test('look_logo blind: only the neighbour named fails the blind check, even when the reviewer passes every check', async () => {
  const { ctx } = await ctxWith([blindAnswer(['tennis club', 'gym', 'yoga'])])
  const r = await look({ files: TWO, checks: [CHECK], blind: true, ...BLIND }, ctx)
  assert.equal(r.blind.verdict, 'fail')
  assert.equal(r.blind.why, 'neighbour')
  assert.deepEqual(
    r.results.map((x) => x.verdict),
    ['fail', 'fail']
  )
  assert.match(r.results[0].checks.at(-1).reason, /the first names the neighbour/)
})

test('look_logo blind: refusals before any reviewer call', async () => {
  const { ctx, calls } = await ctxWith([blindAnswer(['a', 'b', 'c'])], { 'orig.png': await materialPng() })
  const base = { files: [TWO[0]], checks: [CHECK], blind: true, ...BLIND }
  await assert.rejects(
    look({ ...base, checks: ['it shows a padel court'] }, ctx),
    (e) => /names the business/.test(e.message) && e.extra.checks.length === 1
  )
  await assert.rejects(
    look({ ...base, checks: ['it shows a tennis ball'], accept: ['tennis'] }, ctx),
    BrandToolError
  )
  await assert.rejects(look({ ...base, original: 'orig.png' }, ctx), /no original/)
  await assert.rejects(look({ ...base, businessType: '' }, ctx), /needs businessType/)
  await assert.rejects(
    look({ ...base, businessType: 'studio', accept: [] }, ctx),
    (e) => /terms refused/.test(e.message) && e.extra.problems.length > 0
  )
  assert.equal(calls.length, 0)
})

test('blind match rule: stemming, generic words dropped, three guesses, neighbour aliases', () => {
  const t = {
    businessType: 'bakery',
    accept: ['bread shop'],
    neighbour: 'cafe',
    neighbourAccept: ['coffee shop']
  }
  assert.equal(
    blindVerdict({ answer: 'Bakeries', guesses: ['Bakeries', 'cafe', 'deli'], ...t }).verdict,
    'pass'
  )
  assert.equal(
    blindVerdict({ answer: 'deli', guesses: ['deli', 'bread shop', 'gym'], ...t }).matchedPosition,
    2
  )
  assert.equal(blindVerdict({ answer: 'gym', guesses: ['gym', 'coffee shop', 'yoga'], ...t }).verdict, 'fail')
  assert.equal(
    blindVerdict({ answer: 'coffee shop', guesses: ['coffee shop', 'gym', 'deli'], ...t }).why,
    'neighbour'
  )
  assert.equal(
    blindVerdict({ answer: 'bakery cafe', guesses: ['bakery cafe', 'x', 'y'], ...t }).verdict,
    'fail',
    'a guess naming the neighbour never counts'
  )
})
