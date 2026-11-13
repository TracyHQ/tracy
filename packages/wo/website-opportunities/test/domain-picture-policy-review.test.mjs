// Review findings on the picture policy (ticket #595): real video frames (`business.video` link fields) are in the
// policy, research's printed text survives labelling, logo frames are never generated, the build reports how it differs
// from the approved counts, and the small edges (approved count, missing plan, left out list, a stock item's reason).
// Invented club, invented pictures, scripted fake vision; the JA Boxing block store is read for its declaration only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-policy-review.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { framesOfPlan } from '../domain/picture-frames.mjs'
import { pictureProblemsOf } from '../domain/picture-policy-check.mjs'
import {
  GENERATED_PICTURE_ROLES,
  NEVER_GENERATED_ROLES,
  pictureRolesOfVocabulary
} from '../domain/picture-roles.mjs'
import { blocksOf, picturesStep } from '../domain/picture-step.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { picturesOf } from '../domain/plan-look-pictures.mjs'
import {
  clubVideo,
  PHOTOS,
  pictureBlocks,
  picturePlan,
  pictureProfile,
  scriptedModel,
  visionReply
} from './fixtures/picture-policy/invented-pictures.mjs'

const BOXING = new URL(
  '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/block-store.json',
  import.meta.url
)
const store = () => ({ blocks: [...pictureBlocks().values()] })
const ids = (request) => JSON.parse(request.user).pictures.map((p) => p.id)
const labelAll = (over = {}) => scriptedModel((request) => visionReply(ids(request), over))
const run = (input = {}) =>
  picturesStep({
    plan: picturePlan(),
    profile: pictureProfile(),
    blockStore: store(),
    vision: labelAll(),
    ...input
  })
const CLIP = 'home.home-b1.clip'
const frame = (result, id) => result.frames.find((f) => f.id === id)

test('every business.video link field of the JA Boxing block store is a video frame of the policy', () => {
  const boxing = JSON.parse(readFileSync(BOXING, 'utf8'))
  const declared = []
  const pages = []
  const items = []
  for (const block of boxing.blocks) {
    const mine = (where, fields) =>
      fields
        .filter((f) => f.kind === 'business.video')
        .map((f) => ({ block: block.id, field: f.name, where }))
    const own = [...mine('block', block.fields ?? []), ...mine('item', block.itemFields ?? [])]
    if (own.length === 0) continue
    declared.push(...own)
    // An invented item per place the block holds, so every item field is counted once per item.
    const data = Array.from({ length: block.items.max }, (_, n) => `${block.id}-item-${n + 1}`)
    for (const id of data) items.push({ id, kind: 'gallery', sources: ['site'], label: id, fields: {} })
    pages.push({ id: `p-${block.id}`, blocks: [{ id: 'b1', type: block.type, block: block.id, data }] })
  }
  const profile = { sources: [{ id: 'site', origin: 'website' }], facts: {}, items: { gallery: items } }
  const frames = framesOfPlan(pages, blocksOf(boxing), planDataOf(profile))
  const videoFrames = frames.filter((f) => f.kind === 'business.video')
  const expected = declared.reduce(
    (sum, d) => sum + (d.where === 'item' ? boxing.blocks.find((b) => b.id === d.block).items.max : 1),
    0
  )
  console.log(
    `business.video: ${declared.length} declared fields, ${expected} frames expected, ${videoFrames.length} seen`
  )
  assert.ok(declared.length > 0, 'the JA Boxing store declares video fields')
  assert.equal(videoFrames.length, expected)
  for (const d of declared)
    assert.ok(
      videoFrames.some((f) => f.blockId === d.block && f.field === d.field),
      `${d.block}.${d.field}`
    )
  assert.ok(videoFrames.every((f) => f.place === 'video'))
})

test('text printed over a video, known from research, survives a vision reply that omits it', async () => {
  const omits = () =>
    scriptedModel((request) => {
      const reply = visionReply(ids(request))
      for (const p of reply.pictures) delete p.burnedInText
      return reply
    })
  const printed = await run({ pictures: [clubVideo({ burnedInText: true })], vision: omits() })
  assert.deepEqual([frame(printed, CLIP).source, frame(printed, CLIP).reason], ['none', 'no_fitting_video'])
  // Neither research nor the reply says: unknown, which the video check refuses.
  const unknown = await run({ pictures: [clubVideo()], vision: omits() })
  assert.equal(frame(unknown, CLIP).source, 'none')
  assert.ok(unknown.leftOut.some((l) => l.frame === CLIP && l.reason === 'no_fitting_video'))
})

test('logo frames are never generated and never use up the cap; every picture role is explained', async () => {
  const blocks = pictureBlocks()
  const hero = blocks.get('hero-video')
  hero.fields.push(
    { name: 'logo', kind: 'business.logo', type: 'image', frame: { width: 200, height: 80 } },
    { name: 'award', kind: 'claim.entity_logo', type: 'image', frame: { width: 100, height: 100 } }
  )
  const result = await run({ blockStore: { blocks: [...blocks.values()] } })
  assert.deepEqual(
    [frame(result, 'home.home-b1.logo').source, frame(result, 'home.home-b1.logo').reason],
    ['none', 'logo_from_brand_step']
  )
  assert.equal(frame(result, 'home.home-b1.award').reason, 'no_own_logo')
  assert.ok(!result.leftOut.some((l) => l.frame === 'home.home-b1.logo'), 'the brand step fills it')
  const roles = pictureRolesOfVocabulary()
  const may = roles.filter((r) => GENERATED_PICTURE_ROLES.includes(r))
  const never = roles.filter((r) => r in NEVER_GENERATED_ROLES)
  const unexplained = roles.filter((r) => !may.includes(r) && !never.includes(r))
  console.log(
    `picture roles: ${roles.length} = ${may.length} may be generated + ${never.length} never generated with a reason, ${unexplained.length} unexplained`
  )
  assert.deepEqual(unexplained, [])
  assert.equal(roles.length, may.length + never.length)
})

test('the build reports how it differs from the approved counts, and checks content and shape on item frames', async () => {
  const profile = pictureProfile({ unlabelCourts: true })
  for (const g of profile.items.gallery.filter((p) => PHOTOS.includes(p.id)))
    for (const key of ['label', 'width', 'height', 'content']) delete g[key]
  const counted = picturesOf(picturePlan().pages, blocksOf(store()), planDataOf(profile))
  const plan = { ...picturePlan(), pages: counted.pages, pictures: counted.pictures }
  const textGraphics = scriptedModel((request) =>
    visionReply(
      ids(request),
      Object.fromEntries(ids(request).map((id) => [id, { content: 'text-graphic', orientation: 'portrait' }]))
    )
  )
  const result = await run({ plan, profile, vision: textGraphics })
  const own = result.frames.filter((f) => f.source === 'own')
  assert.ok(!own.some((f) => PHOTOS.includes(f.picture)), 'no text graphic fills a gallery frame')
  assert.ok(result.difference, 'the step says it placed fewer own photos than approved')
  assert.equal(result.difference.approved.own, counted.pictures.own.frames)
  assert.ok(result.difference.placed.own < result.difference.approved.own)
  assert.ok(
    result.difference.unplaced.some(
      (u) => u.picture === PHOTOS[0] && u.reason === 'not_a_picture_for_this_frame'
    )
  )
  const agreed = await run({ plan: { ...picturePlan(), ...(await approvedAsPlaced()) } })
  assert.equal(agreed.difference, null)
})

/** A plan whose approved counts are what the build places. */
async function approvedAsPlaced() {
  const first = await run()
  return {
    pictures: { own: { frames: first.counts.own }, generated: { frames: first.counts.generated } }
  }
}

test('a missing or invalid approved count allows no generated picture and says so', async () => {
  for (const generated of [undefined, { frames: 2.5 }, { frames: '1' }, { frames: null }, {}]) {
    const plan = picturePlan({
      pictures: generated === undefined ? undefined : { own: { frames: 0 }, generated }
    })
    const result = await run({ plan })
    assert.equal(result.counts.generated, 0, JSON.stringify(generated))
    assert.equal(result.notes[0].code, 'approved_count_invalid')
  }
  const generatedFrame = { id: 'x', source: 'generated', generate: { people: false, stock: false } }
  assert.equal(
    pictureProblemsOf({ frames: [generatedFrame] }, [], { generated: 0 })[0].code,
    'generated_over_approved'
  )
})

test('no plan is a typed error; a stock gallery item dropped from the plan says so truthfully', async () => {
  for (const plan of [null, {}, { pages: [] }]) await assert.rejects(run({ plan }), { code: 'plan_missing' })
  const plan = picturePlan()
  plan.pages[0].blocks[2].data.push('gallery-stock-racket')
  const counted = picturesOf(plan.pages, blocksOf(store()), planDataOf(pictureProfile()))
  const racket = counted.leftOut.find((l) => l.kind === 'item' && /Racket/.test(l.what))
  assert.match(racket.reason, /stock photo/)
  assert.doesNotMatch(racket.reason, /no photo of yours/)
  const video = picturesOf(picturePlan().pages, blocksOf(store()), planDataOf(pictureProfile()))
  assert.ok(video.leftOut.some((l) => l.what === '1 video spot'))
})
