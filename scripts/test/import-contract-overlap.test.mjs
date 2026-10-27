import assert from 'node:assert/strict'
import test from 'node:test'
import { overlapSummary, modelEvidence } from '../e2e/import-contract-overlap.mjs'

test('distinct runtime intervals prove overlap and separate wall from summed work', () => {
  assert.deepEqual(
    overlapSummary([
      { session: 'a', turns: [{ startedAt: 10, endedAt: 40 }] },
      { session: 'b', turns: [{ startedAt: 20, endedAt: 50 }] }
    ]),
    { overlapObserved: true, uniqueSessions: true, groupWallMs: 40, summedTurnMs: 60 }
  )
})

test('same sessions, adjacent intervals and missing completion do not prove parallel work', () => {
  const stream = (session, startedAt, endedAt) => ({ session, turns: [{ startedAt, endedAt }] })
  assert.equal(overlapSummary([stream('a', 10, 20), stream('b', 20, 30)]).overlapObserved, false)
  const duplicate = overlapSummary([stream('a', 10, 30), stream('a', 20, 40)])
  assert.equal(duplicate.uniqueSessions, false)
  assert.equal(duplicate.overlapObserved, false)
  assert.equal(overlapSummary([stream('a', 10, null), stream('b', 15, 20)]).overlapObserved, false)
})

test('model metadata alone cannot attest actual requests; mismatched requests invalidate pinning', () => {
  const model = { provider: 'deepseek-official', id: 'deepseek-flash' }
  const header = (id) => ({
    type: 'request/header',
    data: { header: { config: { provider: model.provider, model: id } } }
  })
  assert.equal(modelEvidence([], model).modelPinned, false)
  assert.equal(modelEvidence([header(model.id)], model).modelPinned, true)
  assert.equal(modelEvidence([header(model.id), header('different')], model).modelPinned, false)
})
