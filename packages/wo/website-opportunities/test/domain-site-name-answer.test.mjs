// The customer's answer to the site name question (#593 G4): settled into the profile, held to the template's
// business name limit and to plain text, and carried through the real composer (scripted fake model) to the text
// logo, the header, the footer and the home page's search title. A held name the customer types is shown; any other
// held name stays hidden. Invented florist on the real JA Boxing store, invented club; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-site-name-answer.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { TRACY_LIBRARY } from '../domain/library.mjs'
import { pageWriterUser } from '../domain/page-writer-request.mjs'
import { ANSWER_SOURCE, settleAnswers } from '../domain/plan-answers.mjs'
import { blockMapOf, composePlan, composerContextOf, planComposerRequest } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { keptAssumptionsOf } from '../domain/plan-gate-pages.mjs'
import { withWithheld, withoutWithheld } from '../domain/plan-withheld.mjs'
import { scriptedModel } from './fixtures/plan-composer/invented-club.mjs'
import {
  boxingComposition,
  boxingProfile,
  boxingRecipes,
  boxingStore
} from './fixtures/write-order/boxing-florist.mjs'

const HELD = 'Larkspur Bloom'
const OTHER = 'Ambermoor Blooms'
const LIMITS = new Map([['business.name', 20]])
const answer = (text) => ({ schema: 'tracy-build-answer/v1', question: 'site-name', text })
const INPUT = {
  blockStore: boxingStore,
  pageRecipes: boxingRecipes,
  library: TRACY_LIBRARY,
  template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
  brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
  allowTemplateLook: true,
  planId: 'p'
}
const MAIN = { schema: 'tracy-build-answer/v1', question: 'main-button', text: 'Order flowers' }

/** The florist whose name research holds with no neutral identity, a review and a row that write it. */
function pending() {
  const profile = boxingProfile()
  profile.facts['business.name'] = [{ value: HELD, sources: ['site'], confidence: 'single-source' }]
  profile.items.quote[0].fields['quote.text'].value = `${HELD} made our wedding.`
  profile.rows = [
    { id: 'row-held', fields: { 'business.summary': { value: `${HELD} opens at nine.` } } },
    { id: 'row-plain', fields: { 'business.summary': { value: 'Open every day.' } } }
  ]
  return withWithheld(profile, { withheld: { name: true } }, { limits: LIMITS })
}
const quoteId = (profile) => profile.items.quote[0].id

test('3: a different name becomes business.name and the site name, the original held name stays hidden everywhere', () => {
  const profile = pending()
  assert.deepEqual(
    profile.rows.map((r) => r.id),
    ['row-held', 'row-plain']
  )
  const settled = settleAnswers(profile, [answer(`  ${OTHER} `)], LIMITS).profile
  assert.deepEqual(settled.facts['business.name'], [
    { value: OTHER, sources: [ANSWER_SOURCE], confidence: 'single-source' }
  ])
  assert.deepEqual(settled.withheld, { name: true, siteName: OTHER, names: [HELD] })
  assert.deepEqual(
    settled.rows.map((r) => r.id),
    ['row-plain']
  )
  const data = planDataOf(settled)
  assert.deepEqual([...data.withheld], [quoteId(settled)])
  assert.equal(
    withoutWithheld(settled).items.quote.some((q) => q.id === quoteId(settled)),
    false
  )
  const said = [{ field: 'x', said: `${HELD} is loved.` }]
  assert.deepEqual(keptAssumptionsOf({ assumptions: said }, [], { profile: settled }), [])
})

test('3: the held name typed by the customer is their choice to show it: nothing hides it any more', () => {
  const settled = settleAnswers(pending(), [answer(HELD.toLowerCase().replace(' ', '   '))], LIMITS).profile
  const name = 'larkspur bloom'
  assert.deepEqual(settled.facts['business.name'], [
    { value: name, sources: [ANSWER_SOURCE], confidence: 'single-source' }
  ])
  assert.deepEqual(settled.withheld, { name: true, siteName: name })
  assert.deepEqual(
    settled.rows.map((r) => r.id),
    ['row-held', 'row-plain']
  )
  assert.deepEqual([...planDataOf(settled).withheld], [])
  assert.ok(withoutWithheld(settled).items.quote.some((q) => q.id === quoteId(settled)))
  const said = [{ field: 'x', said: `${HELD} is loved.` }]
  assert.equal(keptAssumptionsOf({ assumptions: said }, [], { profile: settled }).length, 1)
  const context = composerContextOf({ ...INPUT, profile: pending(), answers: [MAIN, answer(HELD)] })
  assert.ok(planComposerRequest(context).user.includes(`${HELD} made our wedding.`))
})

test('3: an answer is trimmed with its white space collapsed, and an empty one is refused', () => {
  // A tab is a control character (`checkAnswer`), so only spaces collapse here.
  const settled = settleAnswers(pending(), [answer(' Ambermoor   Blooms')], LIMITS)
  assert.equal(settled.profile.facts['business.name'][0].value, OTHER)
  for (const text of ['', '   '])
    assert.throws(
      () => settleAnswers(pending(), [answer(text)], LIMITS),
      (e) => e.code === 'answer_invalid' && e.noRerun === true
    )
  assert.throws(
    () => settleAnswers(pending(), [{ ...answer(OTHER), text: undefined, skipped: true }], LIMITS),
    (e) => e.code === 'answer_invalid'
  )
})

test('3: an answer of 21 characters fails when the limit is 20, with a typed error that carries the limit', () => {
  assert.doesNotThrow(() => settleAnswers(pending(), [answer('A'.repeat(20))], LIMITS))
  assert.throws(
    () => settleAnswers(pending(), [answer('A'.repeat(21))], LIMITS),
    (e) => {
      assert.equal(e.code, 'site_name_too_long')
      assert.equal(e.noRerun, true)
      assert.equal(e.details.limit, 20)
      assert.equal(e.details.length, 21)
      assert.equal(e.details.question, 'site-name')
      return true
    }
  )
})

test('6: the answer gets the guards of other typed text: no control character, no markup, no markdown', () => {
  for (const text of ['Ambermoor\u0007', 'Ambermoor\nBlooms', '<b>Ambermoor</b>', '**Ambermoor**'])
    assert.throws(
      () => settleAnswers(pending(), [answer(text)], LIMITS),
      (e) => e.code === 'answer_invalid',
      JSON.stringify(text)
    )
})

test('4: after the answer the real composer proceeds; text logo, header, footer and home title use the name', async () => {
  const profile = pending()
  const model = scriptedModel(JSON.stringify(boxingComposition(profile)))
  const result = await composePlan({ ...INPUT, profile, answers: [MAIN, answer(OTHER)], model })
  assert.equal(model.calls.length, 1)
  assert.equal(model.calls[0].user.includes(HELD), false)
  const { plan } = result
  assert.equal(JSON.stringify(plan).includes(HELD), false)
  const name = plan.facts.find((f) => f.kind === 'business.name')
  assert.equal(name.value, OTHER)
  assert.equal(plan.look.logo.kind, 'text')
  const home = plan.pages.find((p) => p.pageType === 'home')
  for (const block of ['header', 'block-170', 'block-174'])
    assert.ok(home.blocks.find((b) => b.block === block).data.includes(name.id), block)
  const user = pageWriterUser({
    plan,
    page: home,
    slots: [],
    byId: planDataOf(result.profile).byId,
    blocks: blockMapOf(boxingStore, TRACY_LIBRARY),
    seo: { title: 60, description: 160 }
  })
  assert.deepEqual(user.business, { name: OTHER })
  assert.deepEqual(result.profile.facts['business.name'][0].value, OTHER)
})

test('4: composePlan after withWithheld with the question open stops with site_name_missing before any model call', async () => {
  const model = scriptedModel()
  await assert.rejects(composePlan({ ...INPUT, profile: pending(), answers: [MAIN], model }), (e) => {
    assert.equal(e.code, 'site_name_missing')
    assert.equal(e.noRerun, true)
    assert.equal(e.details.question.topic, 'site-name')
    assert.equal(e.details.question.freeText.maxLength, 20)
    return true
  })
  assert.equal(model.calls.length, 0)
})
