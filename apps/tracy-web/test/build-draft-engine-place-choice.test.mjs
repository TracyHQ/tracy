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
