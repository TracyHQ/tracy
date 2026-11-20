// A chain build plans its first draft in one conversation (step-chain-steps.js planArgs): parts were measured slower or
// no faster and worse on dev (lat19, lat20), so the planner run is started without --parallel-pages, still with the
// visual review and without the whole kit in its first message. The planner bench still plans in parts when a run
// asks for it. No database, no bench.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plansInParts } from '../src/site-planner/plan-parts.js'
import { PLAN_FIRST_DRAFT_EFFORT, planArgs } from '../src/step-chain-steps.js'

const valueOf = (argv, flag) => argv[argv.indexOf(flag) + 1]

test("the chain's planner run plans its first draft in one conversation, with the visual review, reading the kit by tools", () => {
  const argv = planArgs('ja-boxing/j6/1.0.11', '7ef2a1d4-d846-49d1-adaa-2fad610dd665')
  assert.equal(valueOf(argv, '--kit'), 'ja-boxing/j6/1.0.11')
  assert.equal(valueOf(argv, '--brief-revision'), '7ef2a1d4-d846-49d1-adaa-2fad610dd665')
  assert.ok(!argv.includes('--parallel-pages'))
  assert.ok(argv.includes('--require-visual-review'))
  // The whole kit in the first message put all the reasoning into the writing turn (128k output cap, run15).
  assert.ok(!argv.includes('--kit-in-first-message'))
  // A run started without the flag plans round 0 as one conversation.
  assert.equal(plansInParts({}), false)
})

test("the chain's planner run gets the kit index in its first message and thinks its first draft at high", () => {
  const argv = planArgs('ja-boxing/j6/1.0.11', '7ef2a1d4-d846-49d1-adaa-2fad610dd665')
  assert.ok(argv.includes('--kit-index-in-first-message'))
  assert.equal(valueOf(argv, '--first-draft-effort'), PLAN_FIRST_DRAFT_EFFORT)
  assert.ok(['low', 'high'].includes(PLAN_FIRST_DRAFT_EFFORT), 'below the run effort (max)')
})
