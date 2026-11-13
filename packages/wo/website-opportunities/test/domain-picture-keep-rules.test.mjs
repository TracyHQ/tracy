// The approved picture rules the new pictures step must keep (ticket #595, the step chain audit): every service the plan
// lists stays on the site whether or not it has a photo; a person without a photo shows their initials; a gallery only
// ever shows the business's own photos; and a photo smaller than its frame needs is never enlarged into it. Invented
// club, invented pictures, scripted fake vision.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-keep-rules.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unfitReason } from '../domain/picture-fit.mjs'
import { FRAME_SOURCES, pictureProblemsOf } from '../domain/picture-policy-check.mjs'
import { generationOf } from '../domain/picture-roles.mjs'
import { picturesStep } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { picturesOf } from '../domain/plan-look-pictures.mjs'
import {
  COACH,
  PHOTOS,
  pictureBlocks,
  picturePlan,
  pictureProfile,
  scriptedModel,
  SERVICES,
  visionReply
} from './fixtures/picture-policy/invented-pictures.mjs'

const ids = (request) => JSON.parse(request.user).pictures.map((p) => p.id)
const labelAll = (over = {}) => scriptedModel((request) => visionReply(ids(request), over))
const run = (input = {}) =>
  picturesStep({
    plan: picturePlan(),
    profile: pictureProfile(),
    blockStore: { blocks: [...pictureBlocks().values()] },
    vision: labelAll(),
    ...input
  })
const COACH_FRAME = `team.team-b1.${COACH}.photo`
const frame = (result, id) => result.frames.find((f) => f.id === id)
const serviceFrames = (result) => result.frames.filter((f) => f.block === 'home-b2')
const noCoachPhoto = () => {
  const profile = pictureProfile()
  delete profile.items.person[0].fields['person.image']
  return profile
}

test('every planned service stays: its own photo first, then a drawn one', async () => {
  const result = await run()
  assert.deepEqual(result.reduced, [], 'no service is dropped for want of a photo')
  assert.deepEqual(result.droppedFrames, [])
  assert.deepEqual(
    serviceFrames(result).map((f) => [f.item, f.source]),
    [
      [SERVICES[0], 'generated'],
      [SERVICES[1], 'generated'],
      [SERVICES[2], 'own'],
      [SERVICES[3], 'generated']
    ]
  )
  // The plan summary the customer approves keeps every service too.
  const summary = picturesOf(picturePlan().pages, pictureBlocks(), planDataOf(pictureProfile()))
  assert.deepEqual(summary.pages[0].blocks[1].data, [...SERVICES])
  assert.equal(summary.leftOut.filter((e) => e.kind === 'item').length, 0)
})

test('a service with neither an own nor a drawn picture stays, with its picture frame left empty', async () => {
  const plan = picturePlan({ pictures: { own: { frames: 1, from: [] }, generated: { frames: 0 } } })
  const result = await run({ plan })
  assert.deepEqual(result.reduced, [])
  const services = serviceFrames(result)
  assert.deepEqual(
    services.map((f) => f.item),
    [...SERVICES]
  )
  for (const f of services.filter((f) => f.item !== SERVICES[2]))
    assert.deepEqual([f.source, f.reason], ['none', 'over_approved_count'], `${f.item} keeps an empty frame`)
})

test('a person without an own photo shows their initials, never an empty frame and never a drawn person', async () => {
  const result = await run({ profile: noCoachPhoto() })
  const coach = frame(result, COACH_FRAME)
  assert.equal(coach.source, 'initials')
  assert.deepEqual(coach.substitute, {
    kind: 'initials-avatar',
    initials: 'IV',
    personId: COACH,
    frame: { width: 600, height: 600 }
  })
  assert.ok(FRAME_SOURCES.includes('initials'))
  assert.equal(result.counts.initials, 1)
  assert.ok(!result.leftOut.some((l) => l.frame === COACH_FRAME), 'an initials frame is not an empty frame')
  assert.ok(!result.frames.some((f) => f.people && f.source === 'generated'))
  const bare = { frames: [{ ...coach, substitute: undefined }] }
  assert.equal(pictureProblemsOf(bare, [])[0].code, 'initials_missing')
  const stranger = { frames: [{ ...frame(result, `home.home-b2.${SERVICES[0]}.photo`), source: 'initials' }] }
  assert.equal(pictureProblemsOf(stranger, [])[0].code, 'initials_not_a_person')
})

test('a gallery only shows the business own photos: a gallery frame is never drawn', async () => {
  assert.deepEqual(generationOf('business.gallery_image'), { may: false, reason: 'gallery_own_photos_only' })
  // The courts photo reads as a text graphic: it fits no gallery frame, and the strip is at its minimum of three.
  const profile = pictureProfile()
  profile.items.gallery.find((p) => p.id === PHOTOS[0]).content = 'text-graphic'
  const result = await run({ profile })
  const courts = frame(result, `home.home-b3.${PHOTOS[0]}.photo`)
  assert.deepEqual([courts.source, courts.reason], ['none', 'gallery_own_photos_only'])
  for (const f of result.frames.filter((f) => f.blockType === 'gallery'))
    assert.notEqual(f.source, 'generated', `${f.id} is never drawn`)
  const drawn = { frames: [{ ...courts, source: 'generated', generate: { people: false, stock: false } }] }
  assert.ok(pictureProblemsOf(drawn, []).some((p) => p.code === 'generated_gallery'))
})

test('a photo smaller than its frame needs is never enlarged into it', () => {
  const photo = (width, height) => ({ media: 'photo', content: 'venue-exterior', width, height })
  const square = { place: 'item', kind: 'offering.image', shape: 'square', size: { width: 600, height: 600 } }
  assert.equal(unfitReason(photo(400, 400), square), 'too_small')
  assert.equal(unfitReason(photo(1000, 500), square), 'too_small', 'its square crop is 500 wide, not 600')
  assert.equal(unfitReason(photo(600, 600), square), null)
  assert.equal(unfitReason(photo(1200, 600), square), null)
  assert.equal(unfitReason(photo(undefined, undefined), square), null, 'an unmeasured photo is not judged')
  assert.equal(
    unfitReason(photo(400, 400), { ...square, size: undefined }),
    null,
    'an unsized frame has no floor'
  )
})

test('a person photo below the floor is not used: the person shows their initials and the build says why', async () => {
  const profile = pictureProfile()
  Object.assign(profile.items.person[0], { width: 300, height: 300 })
  const result = await run({ profile })
  assert.equal(frame(result, COACH_FRAME).source, 'initials')
  const unplaced = result.difference?.unplaced.find((u) => u.picture === `${COACH}:person.image`)
  assert.equal(unplaced?.reason, 'too_small')
})
