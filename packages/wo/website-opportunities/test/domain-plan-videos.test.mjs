// The owner's videos a plan has no place for are said, once, with their count (#575 build chat, a real plan: the needs
// profile knew 10 videos, the plan neither placed them nor listed them as left out). The step chain handed every video
// to the build as a link and never said which got no place (`opportunities-build/handoff.js`), so the build chat says
// it: one left out entry `no_place_in_design` with `params.count` (the videos left out) and `params.known` (the videos
// the plan knows), so known = placed + left out. A video frame of the plan takes one video (`picture-frames.mjs`).
// Also: a photo the owner took off by a change request reaches no frame at build time either. Invented club, invented
// videos, scripted fake models.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-videos.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { composePlan } from '../domain/plan-composer.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { placeBuildPictures } from '../domain/picture-step.mjs'
import { visionReply } from './fixtures/picture-policy/invented-pictures.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, kit, revision } from './fixtures/plan-composer/plan-request.mjs'

/** The club with `n` invented videos of its social profile. */
function clubWithVideos(n) {
  const profile = clubProfile()
  const items = Array.from({ length: n }, (_, i) => ({
    id: `video-${i + 1}`,
    ref: `https://brindlewick-tennis.example/video/clip-${i + 1}.mp4`,
    source: 'insta'
  }))
  profile.videos = { count: n, sources: [{ id: 'insta', origin: 'social', count: n }], items }
  return profile
}

/** The invented block store, with a video frame on the home banner when `videoFrame`. */
function storeWith(videoFrame) {
  const store = blockStore()
  if (videoFrame)
    store.blocks
      .find((b) => b.id === 'hero-home')
      .fields.push({ name: 'video', type: 'link', kind: 'business.video' })
  return store
}

const compose = async (profile, store) => {
  const { plan, problems } = await composePlan({
    profile,
    blockStore: store,
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  assert.ok(plan, JSON.stringify(problems))
  return plan
}
const videoLines = (plan) => plan.leftOut.filter((e) => e.params?.known !== undefined)

test('a design with no video place says every video once, with its count', async () => {
  const plan = await compose(clubWithVideos(4), storeWith(false))
  const lines = videoLines(plan)
  assert.equal(lines.length, 1)
  assert.deepEqual(
    { kind: lines[0].kind, code: lines[0].code, params: lines[0].params },
    { kind: 'feature', code: 'no_place_in_design', params: { count: 4, known: 4 } }
  )
  assert.equal(lines[0].what, '4 videos')
})

test('a video frame takes one video: the others are said, and the frame is not said empty', async () => {
  const plan = await compose(clubWithVideos(3), storeWith(true))
  const lines = videoLines(plan)
  assert.deepEqual(lines[0].params, { count: 2, known: 3 })
  assert.equal(
    plan.leftOut.some((e) => e.code === 'no_fitting_video'),
    false
  )
  assert.equal(
    (plan.pictures.empty ?? []).some((e) => e.code === 'no_fitting_video'),
    false
  )
})

test('a plan of a business with no video says nothing of videos', async () => {
  const plan = await compose(clubProfile(), storeWith(false))
  assert.deepEqual(videoLines(plan), [])
})

test('a photo the owner took off by a change request fills no frame at build time', async () => {
  const first = await firstPlan()
  const removed = answer([
    { op: 'remove_block', page: 'home', block: 'home-b4', request: 'Remove the photos' }
  ])
  const revised = await revisePlan(revision(first, 'Remove the photos.', removed).input)
  const off = revised.plan.leftOut.filter((e) => e.item?.startsWith('gallery-')).map((e) => e.item)
  assert.ok(off.length > 0)
  const k = kit()
  const placed = await placeBuildPictures({
    plan: revised.plan,
    profile: revised.draftProfile,
    blockStore: k.blockStore,
    library: k.library,
    vision: scriptedModel((request) =>
      visionReply(
        JSON.parse(request.user).pictures.map((p) => p.id),
        {}
      )
    )
  })
  const own = placed.frames.filter((f) => f.source === 'own').map((f) => f.picture)
  assert.deepEqual(
    own.filter((id) => off.includes(id)),
    [],
    'a photo the owner took off is on no frame'
  )
})
