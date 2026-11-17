// Contract B carries the step chain's page and block intent (#575, plan stage restore): each page's visitor question,
// key message, search intent and end action, each block's point and the key messages it carries, the brief's key
// messages with their ids, the main action, and what the owner can send later. All optional and additive: a plan
// stored before them still reads. Invented club only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'

const scenario = JSON.parse(
  readFileSync(
    new URL('./fixtures/build-contract/sunrise-tennis-club.build-scenario.json', import.meta.url),
    'utf8'
  )
)
const plan = () => structuredClone(scenario.plan)
const atsOf = (doc) => checkBuildDocument(doc).problems.map((p) => p.at)

/** The sample plan with every new field set right. */
function withIntent() {
  const p = plan()
  p.keyMessages = [
    { id: 'km-1', label: 'Coaching for every age' },
    { id: 'km-2', label: 'Courts open early' }
  ]
  p.primaryAction = { factIds: ['button', 'phone'] }
  p.later = [
    { what: 'Prices', reason: 'Send your prices and a prices section can be added.', code: 'later_prices' }
  ]
  const home = p.pages[0]
  home.visitorQuestion = 'Is this a club for me and my children?'
  home.keyMessage = 'Coaching for every age, close to home.'
  home.seo = {
    titleIntent: 'The club and its coaching, with the town',
    descriptionIntent: 'Who the club coaches and how to book',
    searchTerms: ['tennis coaching', 'junior tennis']
  }
  home.endAction = { block: 'h4', factIds: ['phone'] }
  home.blocks[0].message = 'The club coaches every age; book by phone.'
  home.blocks[0].carries = ['km-1']
  return p
}

test('a plan stored before the intent fields still passes', () => {
  assert.deepEqual(checkBuildDocument(plan()), { ok: true, problems: [] })
})

test('the intent fields pass when they are right', () => {
  assert.deepEqual(checkBuildDocument(withIntent()), { ok: true, problems: [] })
})

test('a block carries only key messages the plan lists, each once', () => {
  const p = withIntent()
  p.pages[0].blocks[0].carries = ['km-1', 'km-9', 'km-1']
  assert.deepEqual(atsOf(p).sort(), [
    'pages[home].blocks[h1].carries[1]',
    'pages[home].blocks[h1].carries[2]'
  ])
})

test('an end action names a block of its own page and facts of the plan', () => {
  const p = withIntent()
  p.pages[0].endAction = { block: 'v1', factIds: ['nope'] }
  assert.deepEqual(atsOf(p).sort(), ['pages[home].endAction.block', 'pages[home].endAction.factIds[0]'])
})

test('the main action names facts of the plan, at least one', () => {
  const p = withIntent()
  p.primaryAction = { factIds: [] }
  assert.deepEqual(atsOf(p), ['primaryAction.factIds'])
  p.primaryAction = { factIds: ['ghost'] }
  assert.deepEqual(atsOf(p), ['primaryAction.factIds[0]'])
})

test('intent texts are short notes, closed shapes, with their limits', () => {
  const p = withIntent()
  p.pages[0].visitorQuestion = 'x'.repeat(161)
  p.pages[0].seo.heading = 'Not a field'
  p.pages[0].seo.searchTerms = []
  p.pages[0].blocks[0].message = ''
  p.keyMessages.push({ id: 'km-1', label: 'Again' })
  p.later[0].code = 'Not A Code'
  assert.deepEqual(atsOf(p).sort(), [
    'keyMessages[2].id',
    'later[0].code',
    'pages[home].blocks[h1].message',
    'pages[home].seo.heading',
    'pages[home].seo.searchTerms',
    'pages[home].visitorQuestion'
  ])
})
