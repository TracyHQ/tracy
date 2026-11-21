// A chain build plans its first draft in one conversation at the run's effort (step-chain-steps.js planArgs): parts
// (lat19, lat20) and a frame with parts after it at high (lat22) were measured slower and worse on dev, so the planner
// run is started without --parallel-pages, --framed-parts or --first-draft-effort, with the visual review and the kit
// index in its first message, and without the whole kit in it. The planner bench keeps those settings for runs that
// ask. No database, no bench.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plansInParts } from '../src/site-planner/plan-parts.js'
import { framesPlan } from '../src/site-planner/plan-frame.js'
import { planArgs } from '../src/step-chain-steps.js'

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

test("the chain's planner run gets the kit index in its first message and thinks its first draft at the run's effort", () => {
  const argv = planArgs('ja-boxing/j6/1.0.11', '7ef2a1d4-d846-49d1-adaa-2fad610dd665')
  assert.ok(argv.includes('--kit-index-in-first-message'))
  assert.ok(!argv.includes('--first-draft-effort'))
})

test("the chain's planner run plans its first draft as one conversation, not as a frame with parts after it", () => {
  const argv = planArgs('ja-boxing/j6/1.0.11', '7ef2a1d4-d846-49d1-adaa-2fad610dd665')
  assert.ok(!argv.includes('--framed-parts'))
  // A run started without the flag plans round 0 as one conversation.
  assert.equal(framesPlan({}), false)
})
