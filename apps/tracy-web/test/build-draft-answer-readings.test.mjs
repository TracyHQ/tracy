// The answer reading step of compose (owner decision of 16/11): one model call, reserved as its own ledger step
// `answers`, only when the owner typed an answer; any refusal or failure answers no reading and never stops compose.
// Invented club, scripted fake model only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-answer-readings.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { answerReadingsOf } from '../src/build-draft/answer-readings.js'
import { composeStep } from '../src/build-draft/engine-steps.js'
import { kits } from './build-draft-engine-fixtures.mjs'
import { STEP_CEILING_CENTS, SPEND_LIMITS } from '../src/build-draft/spend-limits.js'

const THIRD = '+1 555 0177 310'
const typed = club.answer(club.PHONE_QUESTION, { text: `Our real number is ${THIRD}` })
const reply = JSON.stringify({
  answers: [
    {
      question: club.PHONE_QUESTION,
      facts: [{ kind: 'contact.phone', value: THIRD, evidence: THIRD }]
    }
  ]
})

/** A spend gate that records each reservation; `refuse` answers null as a cap would. */
function gate({ refuse = false } = {}) {
  const reserved = []
  return {
    reserved,
    reserve: async () => {
      reserved.push('answers')
      return refuse ? null : { run: (fn) => fn() }
    }
  }
}
const run = (answers, spend, model) =>
  answerReadingsOf(
    { research: { profile: club.conflictedClubProfile() }, answers },
    { kit: null, reserve: spend.reserve, modelOf: async () => ({ model, cost: () => ({ costCents: 1 }) }) }
  )

test('the answers step has its own small ceiling and hourly limit next to compose', () => {
  assert.equal(STEP_CEILING_CENTS.answers, 2)
  assert.ok(STEP_CEILING_CENTS.answers < STEP_CEILING_CENTS.compose)
  assert.equal(SPEND_LIMITS.answers.perHour, SPEND_LIMITS.compose.perHour)
})

test('no reservation and no call when every answer is a chosen option', async () => {
  const spend = gate()
  const model = club.scriptedModel()
  const answers = [
    club.answer(club.PHONE_QUESTION, { choice: 'value-2' }),
    club.answer('main-button', { choice: 'call' })
  ]
  assert.equal(await run(answers, spend, model), null)
  assert.deepEqual([spend.reserved.length, model.calls.length], [0, 0])
})

test('a typed answer is read once, reserved as the answers step', async () => {
  const spend = gate()
  const model = club.scriptedModel(reply)
  const readings = await run([typed], spend, model)
  assert.deepEqual(spend.reserved, ['answers'])
  assert.equal(model.calls.length, 1)
  assert.deepEqual(readings.get(club.PHONE_QUESTION).facts, [
    { kind: 'contact.phone', value: THIRD, primary: false }
  ])
})

test('a refused reservation or a failing call answers no reading, never a stop', async () => {
  const refused = gate({ refuse: true })
  const model = club.scriptedModel(reply)
  assert.equal(await run([typed], refused, model), null)
  assert.equal(model.calls.length, 0)
  const failing = async () => {
    throw new Error('the model door failed')
  }
  const readings = await run([typed], gate(), failing)
  assert.equal(readings.size, 0)
  const broken = await answerReadingsOf(
    { research: { profile: club.conflictedClubProfile() }, answers: [typed] },
    {
      kit: null,
      reserve: gate().reserve,
      modelOf: async () => {
        throw new Error('no model door')
      }
    }
  )
  assert.equal(broken, null)
})

test('compose writes the read phone with origin answer, settling the conflict before the planner', async () => {
  const kit = kits.loadKit(club.template().slug)
  const research = { profile: club.conflictedClubProfile() }
  const readings = await run([typed], gate(), club.scriptedModel(reply))
  const composed = await composeStep(
    { research, answers: [typed], answerReadings: readings, template: club.template(), brand: club.brand() },
    { model: club.scriptedModel(JSON.stringify(club.goodComposition())), kit }
  )
  assert.equal(composed.plan.facts.find((f) => f.id === 'contact-phone').value, THIRD)
  assert.equal(composed.profile.conflicts.find((c) => c.question === club.PHONE_QUESTION).chosenBy, 'answer')
})
