// The change request and the plan revision of Contract B (ticket #617): closed shapes, the request's length limit, the
// closed set of not done reasons, and a request held to its plan's revision.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import {
  checkPlanRequest,
  NOT_DONE_REASONS,
  PLAN_REQUEST_MAX_LENGTH
} from '../domain/build-contract-plan-request.mjs'

const plan = { id: 'plan-sunrise', revision: 3 }
const request = (text, extra = {}) => ({
  schema: 'tracy-build-plan-request/v1',
  id: 'r1',
  plan: { ...plan },
  text,
  ...extra
})
const revision = (extra = {}) => ({
  schema: 'tracy-build-plan-revision/v1',
  request: 'r1',
  plan: { id: 'plan-sunrise', revision: 4 },
  changed: ['The Prices page is removed.'],
  notDone: [{ what: 'A blog', reason: 'no_recipe', why: 'Your template has no blog page.' }],
  ...extra
})
const at = (doc) => checkBuildDocument(doc).problems.map((p) => p.at)

test('a change request is a closed shape whose text is limited in Contract B', () => {
  assert.deepEqual(at(request('Drop the prices page.')), [])
  assert.deepEqual(at(request('a'.repeat(PLAN_REQUEST_MAX_LENGTH))), [])
  assert.deepEqual(at(request('a'.repeat(PLAN_REQUEST_MAX_LENGTH + 1))), ['text'])
  assert.deepEqual(at(request('   ')), ['text'])
  assert.deepEqual(at(request('Hi', { copy: 'x' })), ['copy'])
})

test('a change request for another plan or an older revision is refused', () => {
  assert.equal(checkPlanRequest(request('Hi'), plan).ok, true)
  assert.deepEqual(
    checkPlanRequest(request('Hi'), { ...plan, revision: 4 }).problems.map((p) => p.at),
    ['plan.revision']
  )
  assert.deepEqual(
    checkPlanRequest(request('Hi'), { ...plan, id: 'other' }).problems.map((p) => p.at),
    ['plan.id']
  )
})

test('a plan revision lists changed lines and not done entries with a reason of the closed set', () => {
  assert.deepEqual(NOT_DONE_REASONS, ['no_recipe', 'no_data', 'fact_missing', 'kept_private', 'outside_plan'])
  assert.deepEqual(at(revision()), [])
  assert.deepEqual(at(revision({ notDone: [{ what: 'A blog', reason: 'too_hard', why: 'No.' }] })), [
    'notDone[0].reason'
  ])
  assert.deepEqual(at(revision({ changed: ['x'.repeat(201)] })), ['changed[0]'])
  assert.deepEqual(
    at(revision({ notDone: [{ what: 'A blog', reason: 'no_data', why: 'No.', heading: 'x' }] })),
    ['notDone[0].heading']
  )
})
