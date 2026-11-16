// The place choice in the build chat's engine (#609): a research whose Google link matches more than one place ends
// `asking` with the place question on the card (never a stop, never a fault); the owner's answer, kept in the draft,
// is handed to the same research run again. Invented places, a fake gatherer and a scripted model; no database.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-engine-place-choice.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { askingOf } from '../src/build-draft/engine-asking.js'
import { engineStateOf } from '../src/build-draft/engine-state.js'
import { researchStep } from '../src/build-draft/engine-steps.js'
import { placeAmbiguousError, placeAnswerOf, placeAsked } from '../src/build-draft/gather-place.js'
import { placeReadingOf, placeStatementOf } from '../src/build-draft/answer-readings.js'
import { scriptedModel } from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'

const LINKS = ['https://www.google.com/maps/search/?api=1&query=Hollowmere+Bakehouse']
const BRANCHES = [
  {
    provider: 'google-places',
    providerId: 'ChIJinventedNorth01',
    name: 'Hollowmere Bakehouse',
    address: '12 Quillan Lane'
  },
  {
    provider: 'google-places',
    providerId: 'ChIJinventedSouth02',
    name: 'Hollowmere Bakehouse',
    address: '4 Fernwick Road'
  }
]

/** The draft row of a research that ended asking which place is the owner's, with `answers`. */
function askingRow(answers = []) {
  const asking = askingOf(placeAmbiguousError(BRANCHES))
  return {
    engine: { step: 'research', inputs: { links: LINKS }, ...asking },
    research: null,
    answers
  }
}
const answer = (choice) => ({ schema: 'tracy-build-answer/v1', question: 'place-choice', choice })

test('an ambiguous link ends research asking: the card holds both branches and None of these', () => {
  const asking = askingOf(placeAmbiguousError(BRANCHES))
  assert.equal(asking.state, 'asking')
  const state = engineStateOf(askingRow())
  assert.equal(state.step, 'research')
  assert.equal(state.state, 'asking')
  assert.deepEqual(state.result.ask.questions, [
    {
      id: 'place-choice',
      question: 'We found more than one place on Google Maps under this name. Which one is yours?',
      options: [
        { label: 'Hollowmere Bakehouse, 12 Quillan Lane' },
        { label: 'Hollowmere Bakehouse, 4 Fernwick Road' },
        { label: 'None of these' }
      ],
      multiSelect: false
    }
  ])
})

test('the answer the draft keeps is the place the same research runs again with', () => {
  assert.equal(placeAsked(askingRow()), true)
  assert.equal(placeAnswerOf(askingRow(), LINKS), undefined, 'not answered yet')
  assert.deepEqual(placeAnswerOf(askingRow([answer('ChIJinventedSouth02')]), LINKS), {
    provider: 'google-places',
    providerId: 'ChIJinventedSouth02',
    name: 'Hollowmere Bakehouse',
    address: '4 Fernwick Road'
  })
  assert.equal(placeAnswerOf(askingRow([answer('none')]), LINKS), 'none')
  // Other links are another research: the answer is not theirs.
  assert.equal(placeAnswerOf(askingRow([answer('none')]), ['https://other.example/']), undefined)
  // A research that asks nothing has no place answer.
  assert.equal(placeAnswerOf({ engine: { step: 'research', state: 'done' }, answers: [] }, LINKS), undefined)
})

test('research hands the answer to the gatherer, and asks nothing of it otherwise', async () => {
  const seen = []
  const gather = async (input) => {
    seen.push(input)
    throw Object.assign(new Error('stop here'), { code: 'test_stop' })
  }
  const run = (place) =>
    researchStep({ links: LINKS }, { gather, model: async () => assert.fail('no model'), place }).catch(
      (e) => e
    )
  await run(BRANCHES[1])
  await run(undefined)
  assert.deepEqual(seen[0].place, BRANCHES[1])
  assert.equal('place' in seen[1], false)
})

const typedRow = (text) => askingRow([{ schema: 'tracy-build-answer/v1', question: 'place-choice', text }])
const tools = (model, reserved = []) => ({
  reserve: async () => (reserved.push('answers'), { run: (fn) => fn() }),
  modelOf: async () => ({ model, cost: () => ({}) })
})
const pick = (choice) =>
  JSON.stringify({ answers: [{ question: 'place-choice', ...(choice ? { choice } : {}) }] })

test('a typed place answer is read by the model under the answers step; the place it names is the pick', async () => {
  const row = typedRow('the one on Fernwick Road')
  const reserved = []
  const model = scriptedModel(pick('ChIJinventedSouth02'))
  const read = await placeReadingOf(row, LINKS, tools(model, reserved))
  assert.deepEqual([read, reserved, model.calls.length], ['ChIJinventedSouth02', ['answers'], 1])
  assert.equal(placeAnswerOf(row, LINKS, read).providerId, 'ChIJinventedSouth02')
  // Code reads nothing in the text: unread, the answer is None of these.
  assert.equal(placeAnswerOf(row, LINKS), 'none')
  // The owner's text joins the description only when no place was read.
  assert.equal(placeStatementOf(row, LINKS, read, 'We bake bread.'), 'We bake bread.')
})

test('a typed place answer the model cannot place is None of these, its text kept with the description', async () => {
  const row = typedRow('Neither, we opened a new shop last month')
  for (const model of [scriptedModel(pick('none')), scriptedModel(pick(null)), scriptedModel('not json')]) {
    const read = await placeReadingOf(row, LINKS, tools(model))
    assert.equal(placeAnswerOf(row, LINKS, read), 'none')
    assert.equal(
      placeStatementOf(row, LINKS, read, 'We bake bread.'),
      'We bake bread.\n\nNeither, we opened a new shop last month'
    )
  }
  assert.equal(placeStatementOf(row, LINKS, null, undefined), 'Neither, we opened a new shop last month')
})

test('a pressed place, or one typed as its exact label, makes no call', async () => {
  const model = scriptedModel()
  assert.equal(await placeReadingOf(askingRow([answer('none')]), LINKS, tools(model)), null)
  const label = askingOf(placeAmbiguousError(BRANCHES)).question.choices[1].label
  const exact = typedRow(` ${label.toUpperCase()} `)
  assert.equal(await placeReadingOf(exact, LINKS, tools(model)), null)
  assert.equal(placeAnswerOf(exact, LINKS).providerId, 'ChIJinventedSouth02')
  assert.equal(model.calls.length, 0)
})
