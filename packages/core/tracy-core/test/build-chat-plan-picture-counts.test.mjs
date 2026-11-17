// The plan card counts photos, not spots (#575 pictures gap audit: a real run read "14 of your 19 photos" while 12 photos
// were placed, 2 of them in two spots each, and 7 were not used). When the plan carries its picture tally, the card's
// count is the photos placed, its total the owner's photos, and the unused photos and empty spots come with their codes.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/build-chat-plan-picture-counts.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCardOf } from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan

test('with a tally the card shows photos placed of the owner photos, and the spots apart', () => {
  const p = plan()
  p.pictures.own = {
    ...p.pictures.own,
    frames: 14,
    photos: 19,
    placed: 12,
    unused: [
      { code: 'shape_unfit', count: 4 },
      { code: 'no_fitting_frame', count: 3 }
    ]
  }
  p.pictures.empty = [{ code: 'no_generated_people', count: 2 }]
  const own = planCardOf(p).pictures.own
  assert.equal(own.frames, 12, 'the count the card shows is the photos placed')
  assert.equal(own.photos, 19)
  assert.equal(own.spots, 14)
  assert.deepEqual(own.unused, [
    { code: 'shape_unfit', count: 4 },
    { code: 'no_fitting_frame', count: 3 }
  ])
  assert.deepEqual(planCardOf(p).pictures.empty, [{ code: 'no_generated_people', count: 2 }])
})

test('without a tally (a plan made before it) the card reads as before', () => {
  const own = planCardOf(plan()).pictures.own
  assert.equal(own.frames, 31)
  assert.equal(own.spots, undefined)
})
