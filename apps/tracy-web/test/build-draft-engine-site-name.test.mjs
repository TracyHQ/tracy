// The site name question in the build chat's engine (#609, #593 G4): research holds the business name and nothing
// neutral names the site, so the owner is asked for a name. The question reaches the card through the research state,
// with the chosen template's limit once a kit is known; compose with the question open, or with a name longer than
// the template holds, answers an owner turn that asks it (again), never a stop and never a fault. The invented club;
// scripted fake models only, no database.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-engine-site-name.test.mjs
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { rmSync } from 'node:fs'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { askingOf } from '../src/build-draft/engine-asking.js'
import { SAY, engineStateOf, siteNameTooLongSay } from '../src/build-draft/engine-state.js'
import { composeStep, planProfileOf } from '../src/build-draft/engine-steps.js'
import { stoppedOf } from '../src/build-draft/engine.js'
import { KIT_ROOT, kits } from './build-draft-engine-fixtures.mjs'

after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

/** An en or em dash, written by code point. */
const DASHES = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`)
const HELD = 'Brindlewick'
const TYPED = 'Riverside Courts'
const LIMIT = 20

/** The club's kit as the catalogue loads it: its business name has no field limit of its own. */
const plainKit = () => kits.loadKit(club.template().slug)
/** The same kit with a footer field that holds the business name in at most `LIMIT` characters. */
function limitKit() {
  const kit = plainKit()
  const blockStore = structuredClone(kit.blockStore)
  const footer = blockStore.blocks.find((b) => b.id === 'footer-main')
  footer.fields.push({ name: 'brand', kind: 'business.name', type: 'text', limit: LIMIT })
  return { ...kit, blockStore }
}
/** The club researched with its name held and nothing neutral to name the site. */
const heldResearch = () => ({ profile: club.clubProfile(), withheld: { name: true } })
const nameAnswer = (text) => ({ schema: 'tracy-build-answer/v1', question: 'site-name', text })
/** The club's composition without its team page. */
const composition = () => {
  const c = club.goodComposition()
  c.pages.splice(1, 1)
  c.assumptions = []
  return c
}
const compose = (research, answers, model, kit = plainKit()) =>
  composeStep({ research, answers, template: club.template(), brand: club.brand() }, { model, kit })

test('research offers the site name question first, as a free text card, with the kit limit once known', () => {
  const row = (extra = {}) => ({
    engine: { step: 'research', state: 'done' },
    research: heldResearch(),
    answers: [],
    ...extra
  })
  const without = engineStateOf(row())
  assert.equal(without.result.questions[0].id, 'site-name')
  assert.equal(without.result.questions[0].freeText.maxLength, 120)
  assert.deepEqual(without.result.ask.questions[0], {
    id: 'site-name',
    question: 'Your site will not show the business name we found. What name should your site show instead?',
    options: [],
    multiSelect: false
  })
  const withKit = engineStateOf(row(), { kit: limitKit() })
  assert.equal(withKit.result.questions[0].freeText.maxLength, LIMIT)
  assert.equal(JSON.stringify(withKit).includes(HELD), false, 'the card never prints the held name')
  // Answered, it leaves the card.
  const answered = engineStateOf(row({ answers: [nameAnswer(TYPED)] }))
  assert.equal(
    (answered.result.ask?.questions ?? []).some((q) => q.id === 'site-name'),
    false
  )
  // A neutral identity names the site: nothing to ask.
  const neutral = engineStateOf(
    row({
      research: {
        profile: club.clubProfile(),
        withheld: { name: true, siteName: 'Racket club by the river' }
      }
    })
  )
  assert.equal(
    neutral.result.questions.some((q) => q.id === 'site-name'),
    false
  )
  assert.equal(planProfileOf(heldResearch(), limitKit()).questions[0].freeText.maxLength, LIMIT)
})

test('answered, compose proceeds and the plan shows the typed name and nothing of the held one', async () => {
  const model = club.scriptedModel(JSON.stringify(composition()))
  const composed = await compose(heldResearch(), [nameAnswer(TYPED)], model)
  assert.equal(model.calls.length, 1)
  for (const call of model.calls) assert.equal(call.user.includes(HELD), false)
  const plan = JSON.stringify(composed.plan)
  assert.equal(plan.includes(HELD), false)
  assert.deepEqual(
    composed.plan.facts.filter((f) => f.kind === 'business.name').map((f) => f.value),
    [TYPED]
  )
})

test('the owner may type the held name again: then the site shows it', async () => {
  const model = club.scriptedModel(JSON.stringify(composition()))
  const composed = await compose(heldResearch(), [nameAnswer('Brindlewick Tennis Club')], model)
  assert.deepEqual(
    composed.plan.facts.filter((f) => f.kind === 'business.name').map((f) => f.value),
    ['Brindlewick Tennis Club']
  )
})

test('compose with the question open answers an owner turn that asks it, not a stop and not a fault', async () => {
  const model = club.scriptedModel()
  const kit = limitKit()
  const error = await compose(heldResearch(), [], model, kit).then(
    () => assert.fail('compose must not proceed'),
    (e) => e
  )
  assert.equal(error.code, 'site_name_missing')
  assert.equal(model.calls.length, 0)
  const asking = askingOf(error, () => planProfileOf(heldResearch(), kit))
  assert.equal(asking.state, 'asking')
  assert.equal(asking.question.id, 'site-name')
  assert.equal(asking.question.freeText.maxLength, LIMIT)
  assert.equal('say' in asking, false)
  const state = engineStateOf({
    engine: { step: 'compose', ...asking },
    research: heldResearch(),
    answers: []
  })
  assert.deepEqual(state, {
    step: 'compose',
    state: 'asking',
    result: {
      questions: [asking.question],
      ask: {
        questions: [{ id: 'site-name', question: asking.question.prompt, options: [], multiSelect: false }]
      }
    }
  })
})

test('a name longer than the template holds asks again with the limit in plain words', async () => {
  const kit = limitKit()
  const tooLong = nameAnswer('Riverside Courts and Racquets')
  const error = await compose(heldResearch(), [tooLong], club.scriptedModel(), kit).then(
    () => assert.fail('compose must not proceed'),
    (e) => e
  )
  assert.equal(error.code, 'site_name_too_long')
  const asking = askingOf(error, () => planProfileOf(heldResearch(), kit))
  assert.equal(asking.state, 'asking')
  assert.equal(asking.say, 'That name is too long for this design. Please keep it to 20 characters or fewer.')
  assert.equal(asking.say, siteNameTooLongSay(LIMIT))
  assert.equal(DASHES.test(asking.say), false)
  assert.equal(asking.question.freeText.maxLength, LIMIT)
  // The stored answer is the one that was too long: the card still asks, and the next answer replaces it.
  const state = engineStateOf({
    engine: { step: 'compose', ...asking },
    research: heldResearch(),
    answers: [tooLong]
  })
  assert.equal(state.say, asking.say)
  assert.equal(state.result.ask.questions[0].id, 'site-name')
})

test('any other failure is not an owner turn; site_name_missing without its question still stops', () => {
  for (const code of ['answer_invalid', 'plan_gate_failed', 'model_missing'])
    assert.equal(
      askingOf(Object.assign(new Error(code), { code }), () => heldResearch().profile),
      null
    )
  assert.equal(
    askingOf(Object.assign(new Error('x'), { code: 'site_name_missing' }), () => ({})),
    null
  )
  assert.deepEqual(stoppedOf({ code: 'site_name_missing' }), {
    state: 'stopped',
    say: SAY.siteName,
    reason: 'site-name-missing'
  })
})

test('a site name answer kept from an older research that holds nothing is set aside, not refused', async () => {
  const model = club.scriptedModel(JSON.stringify(composition()))
  const composed = await compose({ profile: club.clubProfile() }, [nameAnswer(TYPED)], model)
  assert.equal(composed.plan.schema, 'tracy-build-plan/v1')
})
