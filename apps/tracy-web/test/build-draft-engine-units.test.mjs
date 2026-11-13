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
import { researchStep } from '../src/build-draft/engine-steps.js'
import { brandFor, stoppedOf } from '../src/build-draft/engine.js'
import { KIT_ROOT, gatheredBrief, kits, needsReading } from './build-draft-engine-fixtures.mjs'

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

test('a failure of the business look stops with the brand sentence; the gate look codes count, others do not', () => {
  const brand = { state: 'stopped', say: SAY.brand, reason: 'brand-unavailable' }
  for (const code of [
    'brand_missing',
    'brand_step_failed',
    'brand_file_unreadable',
    'brand_logo_colours_unmeasured'
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
