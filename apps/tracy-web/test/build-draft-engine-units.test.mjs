// The pure parts of the build chat's engine (#609): the request bodies, the question card, the rerun rule, the
// research step with a chosen kit, and the build model door's call. Fakes only: no database, no model key, no network.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-engine-units.test.mjs
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { rmSync } from 'node:fs'
import { needsProfileOf, researchOf } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildModelDoor, modelCallOf } from '../src/build-draft/build-model.js'
import { STEP_ATTEMPTS, faultOf, runWithRerun } from '../src/build-draft/engine-rerun.js'
import { readEngineRequest } from '../src/build-draft/engine-request.js'
import { MAX_QUESTIONS_AT_ONCE, SAY, askOf, engineStateOf } from '../src/build-draft/engine-state.js'
import { composeStep, planProfileOf, researchStep } from '../src/build-draft/engine-steps.js'
import { SAY_CANCELLED, brandFor, stoppedOf } from '../src/build-draft/engine.js'
import { KIT_ROOT, gatheredBrief, heldClubBrief, kits, needsReading } from './build-draft-engine-fixtures.mjs'

after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

/** An en or em dash, written by code point. */
const DASHES = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`)

const question = (id, extra = {}) => ({
  schema: 'tracy-build-question/v1',
  id,
  topic: 'contact-method',
  prompt: `Question ${id}?`,
  choices: [
    { id: 'a', label: 'Phone', recommended: true },
    { id: 'b', label: 'Email', detail: 'Messages reach your inbox.' }
  ],
  freeText: { maxLength: 120 },
  ...extra
})

test('the request bodies are read into plain inputs, and anything else is refused', () => {
  assert.deepEqual(
    readEngineRequest('research', { links: ['https://larkfen.example', 'https://larkfen.example/'] }),
    {
      links: ['https://larkfen.example/']
    }
  )
  assert.deepEqual(readEngineRequest('research', { links: [], description: ' A racquet club. ' }), {
    links: [],
    description: 'A racquet club.'
  })
  for (const bad of [{ links: [] }, { links: ['javascript:alert(1)'] }, { links: 'x' }, null, []])
    assert.equal(readEngineRequest('research', bad), null, JSON.stringify(bad))
  assert.deepEqual(readEngineRequest('compose', {}), {})
  assert.deepEqual(readEngineRequest('compose', { request: 'Add a page for events' }), {
    request: 'Add a page for events'
  })
  assert.deepEqual(readEngineRequest('compose', { restart: true }), { restart: true })
  assert.deepEqual(readEngineRequest('compose', { restart: false }), {})
  assert.equal(readEngineRequest('compose', { restart: 'yes' }), null)
  assert.deepEqual(
    readEngineRequest('edit', { changes: [{ field: 'items[x].label', value: 'Y', extra: 1 }] }),
    {
      changes: [{ field: 'items[x].label', value: 'Y' }]
    }
  )
  for (const bad of [{ changes: [] }, { changes: [{ value: 1 }] }, { changes: [{ field: 'a' }] }])
    assert.equal(readEngineRequest('edit', bad), null, JSON.stringify(bad))
})

test('the card shows at most three unanswered questions, and every question the profile issued stays listed', () => {
  const questions = ['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => question(id))
  const first = askOf(questions, [])
  assert.equal(MAX_QUESTIONS_AT_ONCE, 3)
  assert.deepEqual(
    first.questions.map((q) => q.id),
    ['q1', 'q2', 'q3']
  )
  assert.deepEqual(first.questions[0], {
    id: 'q1',
    question: 'Question q1?',
    options: [{ label: 'Phone' }, { label: 'Email', description: 'Messages reach your inbox.' }],
    multiSelect: false,
    recommended: 'Phone'
  })
  const answers = ['q1', 'q3'].map((q) => ({ schema: 'tracy-build-answer/v1', question: q, choice: 'a' }))
  assert.deepEqual(
    askOf(questions, answers).questions.map((q) => q.id),
    ['q2', 'q4', 'q5']
  )
  assert.equal(askOf(questions.slice(0, 1), answers), null)
  const state = engineStateOf({
    engine: { step: 'research', state: 'done' },
    research: { profile: { facts: {}, items: {}, questions } },
    answers
  })
  assert.equal(state.result.questions.length, 5, 'no cap on how many the engine issues')
  assert.equal(state.result.ask.questions.length, 3)
})

test('a stopped step says one plain sentence and nothing else; every sentence has no dash', () => {
  assert.deepEqual(
    engineStateOf({
      engine: { step: 'compose', state: 'stopped', say: SAY.brand, reason: 'brand-unavailable' }
    }),
    {
      step: 'compose',
      state: 'stopped',
      say: SAY.brand,
      reason: 'brand-unavailable'
    }
  )
  for (const say of Object.values(SAY)) assert.doesNotMatch(say, DASHES)
  assert.deepEqual(engineStateOf(null), { step: null, state: 'idle' })
})

test('an owner cancel of the brand step stops with its own plain sentence, not the brand fault one', () => {
  const stopped = stoppedOf({ code: 'brand_step_stopped' })
  assert.equal(stopped.state, 'stopped')
  assert.equal(stopped.reason, 'cancelled')
  assert.equal(stopped.say, SAY_CANCELLED)
  assert.notEqual(stopped.say, SAY.brand)
  assert.doesNotMatch(stopped.say, /team can see/)
  assert.doesNotMatch(stopped.say, DASHES)
})

test('a failure of the business look stops with the brand sentence; the gate look codes count, others do not', () => {
  const brand = { state: 'stopped', say: SAY.brand, reason: 'brand-unavailable' }
  for (const code of [
    'brand_missing',
    'brand_step_failed',
    'brand_file_unreadable',
    'brand_logo_colours_unmeasured',
    'brand_logo_path_relative',
    'brand_brief_changed'
  ])
    assert.deepEqual(stoppedOf({ code }), brand, code)
  for (const look of ['template_accent', 'neutral_accent', 'template_logo', 'template_look_said'])
    assert.deepEqual(
      stoppedOf({ code: 'plan_gate_failed', problems: [{ code: 'x' }, { code: look }] }),
      brand,
      look
    )
  assert.deepEqual(stoppedOf({ code: 'plan_gate_failed', problems: [{ code: 'items_order' }] }), {
    state: 'stopped',
    say: SAY.fault
  })
  assert.equal(stoppedOf({ code: 'research_empty' }).say, SAY.research)
  // The stored record serves only the template it ran on.
  const row = {
    brand: { record: { schema: 'tracy-brand-look/v1' }, template: { slug: 'ja-a', version: '1.0.0' } }
  }
  assert.equal(brandFor(row, { slug: 'ja-a', version: '1.0.0' }), row.brand.record)
  assert.equal(brandFor(row, { slug: 'ja-a', version: '1.0.1' }), null)
  assert.deepEqual(
    engineStateOf({ engine: { step: 'brand', state: 'done' }, brand: row.brand }),
    { step: 'brand', state: 'done', result: { look: 'ready' } },
    'the brand step answers nothing of the record'
  )
})

test('the rerun rule: once more with the same inputs, never after noRerun, a fault after the second failure', async () => {
  const seen = []
  const flaky = async (inputs) => {
    seen.push(structuredClone(inputs))
    inputs.links.push('https://changed.example/')
    if (seen.length === 1) throw new Error('the provider hung up')
    return 'ok'
  }
  assert.deepEqual(await runWithRerun(flaky, { links: ['https://larkfen.example/'] }), {
    ok: true,
    value: 'ok',
    attempts: 2
  })
  assert.deepEqual(seen[0], seen[1], 'the rerun read exactly the stored inputs')

  let calls = 0
  const gate = Object.assign(new Error('gate'), {
    code: 'plan_gate_failed',
    noRerun: true,
    details: { problems: [{ at: 'x' }] }
  })
  const refused = await runWithRerun(async () => {
    calls++
    throw gate
  }, {})
  assert.equal(calls, 1)
  assert.deepEqual(faultOf('compose', refused), {
    step: 'compose',
    code: 'plan_gate_failed',
    message: 'gate',
    attempts: 1,
    noRerun: true,
    problems: [{ at: 'x' }]
  })
  const twice = await runWithRerun(async () => {
    throw new Error('down')
  }, {})
  assert.equal(twice.attempts, STEP_ATTEMPTS)
  assert.equal(faultOf('research', twice).code, 'step_failed')
})

test('research with a chosen kit gives the needs profile the kit, so answers get the real lengths', async () => {
  const kit = kits.loadKit(club.template().slug)
  const model = async () => JSON.stringify(needsReading())
  const record = await researchStep(
    { links: ['https://larkfen-racquets.example/'] },
    {
      gather: async () => gatheredBrief(),
      model,
      kit
    }
  )
  const { brief, manifest } = gatheredBrief()
  const sources = researchOf(brief, { manifest }).sources
  const expected = needsProfileOf({ sources }, needsReading(), {
    blockStore: kit.blockStore,
    library: kit.library
  })
  assert.deepEqual(record.profile.questions, expected.questions)
  const main = record.profile.questions.find((q) => q.topic === 'main-button')
  assert.ok(main.freeText.maxLength < 80, 'the kit button field limit, not the default 80')
  assert.equal(record.trade, 'fitness')
  await assert.rejects(researchStep({ links: [] }, { gather: async () => ({}), model, kit: null }), {
    code: 'research_empty'
  })
})

test('the build model door: text and pictures in one call shape; an unset door is model_missing', async () => {
  const sent = []
  const fetchImpl = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
      status: 200
    })
  }
  const model = modelCallOf(
    { apiKey: 'test-key', baseUrl: 'https://models.example/v1/', words: 'invented-model' },
    { fetchImpl }
  )
  assert.equal(await model({ system: 'S', user: 'U', format: 'json' }), '{"ok":true}')
  await model({ system: 'S', user: 'Look', images: ['https://images.example/a.jpg'] })
  assert.equal(sent[0].url, 'https://models.example/v1/chat/completions')
  assert.deepEqual(sent[0].body.response_format, { type: 'json_object' })
  assert.deepEqual(sent[1].body.messages[1].content, [
    { type: 'text', text: 'Look' },
    { type: 'image_url', image_url: { url: 'https://images.example/a.jpg' } }
  ])
  const failing = modelCallOf(
    { apiKey: 'k', baseUrl: 'https://models.example', words: 'm' },
    {
      fetchImpl: async () => new Response('{}', { status: 500 })
    }
  )
  await assert.rejects(failing({ system: 'S', user: 'U' }), { code: 'model_call_failed' })
  // No database and no environment model: nothing to call.
  await assert.rejects(buildModelDoor({ pool: null, config: { model: null, sessionSecret: 's' } })(), {
    code: 'model_missing',
    noRerun: true
  })
})

/** The invented club's held name and people, and the neutral identity its brief gives a site it may not name. */
const HELD_NAME = 'Brindlewick'
const HELD_PEOPLE = ['Ilse Varrow', 'Osric Vale']
const NEUTRAL = 'Racket club by the river'
/** The club's composition without its team page: the held coach has no place on the site. */
const withoutTeam = () => {
  const c = club.goodComposition()
  c.pages.splice(1, 1)
  c.assumptions = []
  return c
}
const composeHeld = (research, model) =>
  composeStep(
    { research, answers: [], template: club.template(), brand: club.brand() },
    { model, kit: kits.loadKit(club.template().slug) }
  )

/** The gathered club of the engine fixtures, its name and people held as the held club brief holds them. */
function heldGathered() {
  const gathered = gatheredBrief()
  const { facts, missing, sitemap } = heldClubBrief(NEUTRAL)
  gathered.brief.facts = gathered.brief.facts.map((f) => (f.field === 'name' ? { ...f, ...facts[0] } : f))
  Object.assign(gathered.brief, { missing, sitemap })
  return gathered
}

test('research keeps what the owner keeps off the site, for compose to read', async () => {
  const model = async () => JSON.stringify(needsReading())
  const held = await researchStep(
    { links: ['https://larkfen-racquets.example/'] },
    { gather: async () => heldGathered(), model, kit: null }
  )
  assert.deepEqual(held.withheld, { name: true, siteName: NEUTRAL, people: HELD_PEOPLE })
  const shown = await researchStep(
    { links: ['https://larkfen-racquets.example/'] },
    { gather: async () => gatheredBrief(), model, kit: null }
  )
  assert.equal('withheld' in shown, false, 'nothing held, no key')
})

test('compose shows a held name by its neutral identity and never shows the held name or held people', async () => {
  const model = club.scriptedModel(JSON.stringify(withoutTeam()))
  const composed = await composeHeld(
    { profile: club.clubProfile(), withheld: { name: true, siteName: NEUTRAL, people: HELD_PEOPLE } },
    model
  )
  assert.equal(model.calls.length, 1)
  for (const call of model.calls)
    for (const held of [HELD_NAME, ...HELD_PEOPLE]) assert.equal(call.user.includes(held), false, held)
  const plan = JSON.stringify(composed.plan)
  for (const held of [HELD_NAME, ...HELD_PEOPLE]) assert.equal(plan.includes(held), false, held)
  assert.deepEqual(
    composed.plan.facts.filter((f) => f.kind === 'business.name').map((f) => f.value),
    [NEUTRAL]
  )
  assert.equal(
    composed.plan.items.some((i) => i.id === club.COACH),
    false
  )
})

test('a draft researched before research kept withheld gets it again from its stored brief', async () => {
  const legacy = { profile: club.clubProfile(), brief: heldClubBrief(NEUTRAL) }
  assert.deepEqual(planProfileOf(legacy).withheld.siteName, NEUTRAL)
  const model = club.scriptedModel(JSON.stringify(withoutTeam()))
  const plan = JSON.stringify((await composeHeld(legacy, model)).plan)
  for (const held of [HELD_NAME, ...HELD_PEOPLE]) assert.equal(plan.includes(held), false, held)
  // Nothing held and no brief: the stored profile as it is.
  const plain = { profile: club.clubProfile() }
  assert.equal(planProfileOf(plain), plain.profile)
})

test('a held name with nothing else to name the site stops before any model call; with no question its sentence is the fallback', async () => {
  const model = club.scriptedModel()
  await assert.rejects(
    composeHeld({ profile: club.clubProfile(), brief: heldClubBrief(null) }, model),
    (error) => error.code === 'site_name_missing' && error.noRerun === true
  )
  assert.equal(model.calls.length, 0)
  const stopped = stoppedOf({ code: 'site_name_missing' })
  assert.deepEqual(stopped, { state: 'stopped', say: SAY.siteName, reason: 'site-name-missing' })
  assert.notEqual(stopped.say, SAY.fault)
  assert.notEqual(stopped.say, SAY.brand)
})

/** The club's profile with one more question, invented, that names a held person. */
function profileAskingAboutHeld() {
  const profile = club.clubProfile()
  const phone = profile.questions.find((q) => q.topic === 'main-button')
  profile.questions.push({ ...phone, id: 'q-held', prompt: 'Should Ilse Varrow lead the main button?' })
  return profile
}

test('the question card leaves out questions about what the owner keeps off the site', () => {
  const profile = profileAskingAboutHeld()
  const stateOf = (research) =>
    engineStateOf({ engine: { step: 'research', state: 'done' }, research, answers: [] })
  const ids = (state) => state.result.questions.map((q) => q.id)
  const all = ids(stateOf({ profile }))
  assert.ok(all.includes('q-held'))
  assert.deepEqual(
    ids(stateOf({ profile, withheld: { people: ['Ilse Varrow'] } })),
    all.filter((id) => id !== 'q-held')
  )
})

test('an answer to a question the withheld profile drops is left out; any other unknown answer is still refused', async () => {
  const research = { profile: profileAskingAboutHeld(), withheld: { people: HELD_PEOPLE } }
  const answer = (question) => ({ schema: 'tracy-build-answer/v1', question, text: 'Book a court' })
  const run = (answers, model) =>
    composeStep(
      { research, answers, template: club.template(), brand: club.brand() },
      { model, kit: kits.loadKit(club.template().slug) }
    )
  const ok = await run([answer('q-held')], club.scriptedModel(JSON.stringify(withoutTeam())))
  assert.equal(ok.plan.schema, 'tracy-build-plan/v1')
  await assert.rejects(run([answer('q-never-asked')], club.scriptedModel()), { code: 'answer_invalid' })
})
