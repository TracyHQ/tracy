// The temporary logo the brand step made is written when it has pictures (#575, P2 of the brand audit). The card said
// "I made a temporary one" while the site printed the business name as text; then it said the name is shown as text,
// though the brand file held the made logo's pictures. A made logo with pictures in its own logo spots is now an image
// logo on the plan (Contract B `own`), said as made (`logo_made`, with the mark it shows), and accepted by the look
// gate; one without pictures stays the name set as text. Scripted model, invented brands.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-brand-made-pictured.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import { quaysidePianoCare } from './fixtures/plan-composer/invented-brands.mjs'
import { template } from './fixtures/plan-composer/invented-club.mjs'

/** The piano tuner with no logo, whose made icon the brand step fitted to every logo spot of the kit. */
const pictured = () => {
  const made = quaysidePianoCare()
  made.brandFile.logo.spots = [
    { spot: 'logo-header-1', shows: 'logo', file: 'spots/logo-header-1.png' },
    { spot: 'logo-header-2', shows: 'logo', file: 'spots/logo-header-2.png' }
  ]
  return made
}

test('a made logo with pictures is recorded as pictured; one without is not', () => {
  assert.equal(brandLookOf(pictured()).logo.pictured, true)
  assert.equal(brandLookOf(quaysidePianoCare()).logo.pictured, undefined)
})

test('a pictured made logo is an image logo on the plan, said as made with the mark it shows', () => {
  const record = brandLookOf(pictured())
  const { look, assumptions, sources } = lookOfBrandRecord(template(), record)
  assert.deepEqual(look.logo, { kind: 'own', source: 'A temporary logo made for you' })
  assert.deepEqual(sources.logo, {
    from: 'made-temporary',
    name: 'A temporary logo made for you',
    pictured: true
  })
  const said = assumptions.find((a) => a.id === 'logo')
  assert.equal(said.code, 'logo_made')
  assert.deepEqual(said.params, { found: false, mark: 'icon' })
  assert.equal(
    said.said,
    "No logo was found, so I made a temporary one: a simple icon of your trade beside your business name, in the design's main colour. Send your logo here in the chat to replace it."
  )
  assert.ok(!/[\u2013\u2014]/.test(said.said), 'no long dash')
})

test('the look gate accepts a pictured made logo as an image, and still refuses a text one said as pictured', () => {
  const record = brandLookOf(pictured())
  const { look, assumptions, sources } = lookOfBrandRecord(template(), record)
  const plan = { look, assumptions }
  assert.deepEqual(lookProblemsOf({ plan, template: template(), lookSources: sources }), [])
  const text = { look: { ...look, logo: { kind: 'text' } }, assumptions }
  assert.deepEqual(
    lookProblemsOf({ plan: text, template: template(), lookSources: sources }).map((p) => p.code),
    ['template_logo']
  )
  const bare = lookOfBrandRecord(template(), brandLookOf(quaysidePianoCare()))
  assert.deepEqual(bare.look.logo, { kind: 'text' })
  assert.equal(bare.assumptions.find((a) => a.id === 'logo').code, 'logo_name_as_text')
})

test('the plan look of a pictured made logo meets Contract B', () => {
  const { look } = lookOfBrandRecord(template(), brandLookOf(pictured()))
  const problems = checkBuildDocument({ look }).problems.filter((p) => String(p.at).startsWith('look'))
  assert.deepEqual(problems, [])
})
