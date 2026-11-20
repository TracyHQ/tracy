// A bench step may ask its fix rounds to think less than its first draft (lib/bench-run-loop.js effortFor): the copy
// step's fix rounds run at high where its first draft runs at max; round 0 and every other step keep the run's effort.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effortFor } from '../src/lib/bench-run-loop.js'
import { SITE_PICTURES_STEP } from '../src/site-pictures/bench-worker.js'
import { SITE_PLANNER_STEP } from '../src/site-planner/bench-worker.js'
import { SITE_WRITER_STEP } from '../src/site-writer/bench-worker.js'

test("the copy step's fix rounds think at high where its first draft thinks at max", () => {
  assert.equal(effortFor(SITE_WRITER_STEP, { effort: 'max' }, 0), undefined, 'round 0 keeps the run effort')
  assert.equal(effortFor(SITE_WRITER_STEP, { effort: 'max' }, 1), 'high')
  assert.equal(effortFor(SITE_WRITER_STEP, { effort: 'max' }, 2), 'high')
  // A run already below max, or with no effort, keeps it.
  assert.equal(effortFor(SITE_WRITER_STEP, { effort: 'high' }, 1), undefined)
  assert.equal(effortFor(SITE_WRITER_STEP, {}, 1), undefined)
})

test('a step without the hook keeps the run effort in every round', () => {
  for (const step of [SITE_PLANNER_STEP, SITE_PICTURES_STEP])
    for (const round of [0, 1, 2]) assert.equal(effortFor(step, { effort: 'max' }, round), undefined)
})

test("a run's first draft effort is round 0's only; its fix rounds keep the run's or the step's", () => {
  const harness = { effort: 'max', firstDraftEffort: 'high' }
  assert.equal(effortFor(SITE_PLANNER_STEP, harness, 0), 'high')
  assert.equal(effortFor(SITE_PLANNER_STEP, harness, 1), undefined, 'a fix round keeps the run effort (max)')
  assert.equal(effortFor(SITE_PLANNER_STEP, harness, 2), undefined)
  // The writer's own fix round effort still applies after its first draft.
  assert.equal(effortFor(SITE_WRITER_STEP, harness, 0), 'high')
  assert.equal(effortFor(SITE_WRITER_STEP, harness, 1), 'high')
  assert.equal(effortFor(SITE_PLANNER_STEP, { effort: 'max', firstDraftEffort: 7 }, 0), undefined)
})
