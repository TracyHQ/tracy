// The opening hours research's brief holds until the owner confirms them, settled in the build chat the step chain's
// way (#575 walk, second round): asked with research's questions, Edit with nothing typed asks for the hours in words,
// and the answer is kept as the business's hours pick before the brief is made again, the hours then credited to the
// owner's answer. Invented briefs and a fake service only; no database.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-held-hours.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOURS_ANSWER_SOURCE,
  heldHoursQuestionsOf,
  heldHoursWaiting,
  settleHeldHours,
  TYPED_ID
} from '../src/build-draft/held-hours.js'

const brief = {
  missing: [{ field: 'hours', why: 'Held.' }],
  facts: [{ field: 'hours', reasons: ['implausible-all-week-hours'] }]
}
const rowWith = (answers = [], extra = {}) => ({
  research: { brief, ids: { opportunityId: 'opp-1' }, ...extra },
  answers
})
const answer = (question, fields) => ({ schema: 'tracy-build-answer/v1', question, ...fields })

test('research asks the held hours once; Edit with nothing typed asks for them in words', () => {
  assert.deepEqual(
    heldHoursQuestionsOf(rowWith()).map((q) => q.id),
    ['held-hours']
  )
  const edit = rowWith([answer('held-hours', { choice: 'edit' })])
  const [, typed] = heldHoursQuestionsOf(edit)
  assert.equal(typed.id, TYPED_ID)
  assert.equal(typed.code, 'held_hours_typed')
  assert.deepEqual(
    typed.choices.map((c) => c.id),
    ['leave']
  )
  // A research of the owner's words holds no hours of a source: nothing is asked.
  assert.deepEqual(heldHoursQuestionsOf(rowWith([], { owner: { name: 'x' } })), [])
})

function serviceAndRebuild() {
  const picks = []
  const service = { hours: async (input) => picks.push(input) }
  const rebuild = async () => ({
    brief: { missing: [], facts: [] },
    ids: { opportunityId: 'opp-1' },
    profile: {
      sources: [{ id: 'google', origin: 'google' }],
      facts: { 'contact.hours': [{ value: 'x', sources: ['google'] }] }
    }
  })
  return { picks, service, rebuild }
}

test('Keep is kept as the hours pick, the brief made again, the hours credited to the answer', async () => {
  const row = rowWith([answer('held-hours', { choice: 'keep' })])
  assert.equal(heldHoursWaiting(row), true)
  const { picks, service, rebuild } = serviceAndRebuild()
  const record = await settleHeldHours(row, {
    service,
    accountId: 'acc-1',
    readAnswers: async () => null,
    rebuild
  })
  assert.deepEqual(picks, [{ accountId: 'acc-1', opportunityId: 'opp-1', pick: { choice: 'keep' } }])
  assert.deepEqual(record.profile.facts['contact.hours'][0].sources, [HOURS_ANSWER_SOURCE, 'google'])
  assert.ok(record.profile.sources.some((s) => s.id === HOURS_ANSWER_SOURCE && s.origin === 'answer'))
  assert.equal(heldHoursWaiting({ ...row, research: record }), false, 'settled once')
})

test('typed hours are read by the answer reading; unreadable ones stay held and are not asked again', async () => {
  const row = rowWith([
    answer('held-hours', { choice: 'edit' }),
    answer(TYPED_ID, { text: 'weekdays seven to ten' })
  ])
  const { picks, service, rebuild } = serviceAndRebuild()
  const readAnswers = async (questions) =>
    new Map([[questions[0].id, { facts: [{ kind: 'contact.hours', value: 'Mo-Fr 07:00-22:00' }] }]])
  await settleHeldHours(row, { service, accountId: 'acc-1', readAnswers, rebuild })
  assert.deepEqual(picks[0].pick, { choice: 'edit', hours: ['Mo-Fr 07:00-22:00'] })

  const unread = await settleHeldHours(row, {
    service,
    accountId: 'acc-1',
    readAnswers: async () => new Map(),
    rebuild
  })
  assert.equal(picks.length, 1, 'no pick kept')
  assert.equal(heldHoursWaiting({ ...row, research: unread }), false)
})

test('Leave is kept and credits nothing', async () => {
  const row = rowWith([answer('held-hours', { choice: 'leave' })])
  const { picks, service, rebuild } = serviceAndRebuild()
  const record = await settleHeldHours(row, {
    service,
    accountId: 'acc-1',
    readAnswers: async () => null,
    rebuild
  })
  assert.deepEqual(picks[0].pick, { choice: 'leave' })
  assert.ok(!record.profile.sources.some((s) => s.id === HOURS_ANSWER_SOURCE))
})
