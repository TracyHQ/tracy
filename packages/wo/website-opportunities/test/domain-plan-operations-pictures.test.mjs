// The plan card's structured operations meet the picture numbers (#575): a page, a section or a photo the owner takes
// off the plan, brought back, or the whole review gone back, leaves the pictures summary and the left out list counting
// the owner's photos once (`plan-picture-count.mjs`), and the videos the plan has no place for said once with their
// count (`plan-videos.mjs`). A photo of a gallery the owner removed is counted under `owner_removed`, once, and fills
// no frame. Invented club, invented photos and videos, scripted fake model: no real model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-operations-pictures.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { gateOperatedPlan } from '../domain/plan-edit-gate.mjs'
import { OWNER_REMOVED } from '../domain/plan-operations.mjs'
import { pictureCountProblems } from '../domain/plan-picture-count.mjs'
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

/** The club with `photos` own gallery photos (the three of the fixture first) and `videos` invented videos. */
function clubWith(photos, videos) {
  const profile = clubProfile()
  const [first] = profile.items.gallery
  for (let i = profile.items.gallery.length; i < photos; i++)
    profile.items.gallery.push({
      ...structuredClone(first),
      id: `gallery-court-${i + 1}`,
      fields: {
        'business.gallery_image': {
          ...first.fields['business.gallery_image'],
          value: `https://brindlewick-tennis.example/img/court-${i + 1}.jpg`
        }
      },
      label: `Court ${i + 1} in the morning`
    })
  const items = Array.from({ length: videos }, (_, i) => ({
    id: `video-${i + 1}`,
    ref: `https://brindlewick-tennis.example/video/clip-${i + 1}.mp4`,
    source: 'insta'
  }))
  profile.videos = { count: videos, sources: [{ id: 'insta', origin: 'social', count: videos }], items }
  return profile
}

/**
 * A plan of 19 photos (two galleries of six, home and team page, the rest shown by no gallery) and 3 videos, with one
 * video frame on the home banner, so 2 videos have no place.
 */
async function base(videoBlock = 'hero-home') {
  const profile = clubWith(19, 3)
  const ids = profile.items.gallery.map((g) => g.id)
  const recipes = pageRecipes()
  recipes.recipes.find((r) => r.pageType === 'team').blocks.splice(2, 0, 'gallery-strip')
  const store = blockStore()
  store.blocks
    .find((b) => b.id === videoBlock)
    .fields.push({ name: 'video', type: 'link', kind: 'business.video' })
  const composition = goodComposition()
  composition.pages[0].blocks.find((b) => b.block === 'gallery-strip').data = ids.slice(0, 6)
  composition.pages[1].blocks.push({
    block: 'gallery-strip',
    label: 'Photos',
    data: ids.slice(6, 12),
    reason: 'Your courts.'
  })
  const composed = await composePlan({
    profile,
    blockStore: store,
    pageRecipes: recipes,
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(composition))
  })
  assert.ok(composed.plan, JSON.stringify(composed.problems))
  const kit = { blockStore: store, pageRecipes: recipes, library: library() }
  return { plan: composed.plan, profile: composed.profile, kit, ids }
}

const opOf = (plan, operation) => ({
  schema: 'tracy-build-plan-edit/v1',
  id: 'edit-op',
  plan: { id: plan.id, revision: plan.revision },
  operation
})

function operate(state, kit, operation, removal = `removal-${state.review.removals.length + 1}`) {
  const out = gateOperatedPlan({
    plan: state.plan,
    profile: state.profile,
    edit: opOf(state.plan, operation),
    review: state.review,
    removal,
    ...kit
  })
  if (!out.ok) return out
  const removals = out.removal
    ? [...state.review.removals, out.removal]
    : state.review.removals.filter((r) => r.id !== out.restored)
  return { ...out, state: { plan: out.plan, profile: out.profile, review: { ...state.review, removals } } }
}

const startOf = ({ plan, profile }) => ({ plan, profile, review: { base: { plan, profile }, removals: [] } })
const withoutRevision = ({ revision: _r, ...rest }) => rest
const sum = (entries) => (entries ?? []).reduce((n, e) => n + e.count, 0)
const countOf = (entries, code) => (entries ?? []).find((e) => e.code === code)?.count ?? 0
const videoLines = (plan) => plan.leftOut.filter((e) => e.params?.known !== undefined)
const galleryOf = (plan, page) =>
  plan.pages.find((p) => p.id === page).blocks.find((b) => b.type === 'gallery')

/** The numbers of a plan agree: the guard has nothing to say, photos = placed + unused, one video line. */
function assertCounted(plan, at) {
  assert.deepEqual(pictureCountProblems(plan), [], at)
  assert.deepEqual(checkBuildDocument(plan).problems, [], at)
  const own = plan.pictures.own
  assert.equal(own.photos, 19, at)
  assert.equal(own.photos, own.placed + sum(own.unused), at)
  const owned = plan.leftOut.filter(
    (e) => e.code === OWNER_REMOVED && e.kind === 'item' && e.item?.startsWith('gallery-')
  )
  assert.equal(
    new Set(owned.map((e) => e.item)).size,
    owned.length,
    `${at}: an owner-removed photo is said once`
  )
  assert.ok(
    countOf(own.unused, OWNER_REMOVED) >= owned.length,
    `${at}: owner-removed photos counted under their code`
  )
  assert.equal(videoLines(plan).length <= 1, true, at)
}

test('the base plan counts its photos once and says the two videos with no place', async () => {
  const b = await base()
  assertCounted(b.plan, 'base')
  assert.deepEqual(videoLines(b.plan)[0].params, { count: 2, known: 3 })
})

test('a gallery taken off counts its photos under owner_removed once, fills no frame with them, and comes back', async () => {
  const b = await base()
  const start = startOf(b)
  const gallery = galleryOf(b.plan, 'team')
  const out = operate(start, b.kit, { op: 'remove-block', page: 'team', block: gallery.id })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assertCounted(out.plan, 'after remove-block')
  const own = out.plan.pictures.own
  // The six photos of the removed gallery are counted under owner_removed, never placed, never under another code.
  assert.equal(countOf(own.unused, OWNER_REMOVED), 6)
  const off = out.plan.leftOut.filter((e) => e.code === OWNER_REMOVED && gallery.data.includes(e.item))
  assert.deepEqual(off.map((e) => e.item).sort(), [...gallery.data].sort())
  assert.ok(own.placed <= b.plan.pictures.own.placed, 'no removed photo fills another frame')
  // The videos line survives the operation untouched: the video frame is on the home banner.
  assert.deepEqual(videoLines(out.plan), videoLines(b.plan))
  const back = operate(out.state, b.kit, { op: 'restore', removal: 'removal-1' })
  assert.equal(back.ok, true, JSON.stringify(back.problems))
  assert.deepEqual(withoutRevision(back.plan), withoutRevision(b.plan))
})

test('one photo taken off a gallery is counted once under owner_removed; revert gives back the plan', async () => {
  const b = await base()
  const start = startOf(b)
  const gallery = galleryOf(b.plan, 'home')
  const photo = gallery.data[2]
  const out = operate(start, b.kit, { op: 'remove-item', page: 'home', block: gallery.id, item: photo })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assertCounted(out.plan, 'after remove-item')
  assert.equal(countOf(out.plan.pictures.own.unused, OWNER_REMOVED), 1)
  assert.deepEqual(
    out.plan.leftOut.filter((e) => e.item === photo).map((e) => e.code),
    [OWNER_REMOVED]
  )
  const reverted = operate(out.state, b.kit, { op: 'revert' })
  assert.equal(reverted.ok, true, JSON.stringify(reverted.problems))
  assert.deepEqual(withoutRevision(reverted.plan), withoutRevision(b.plan))
})

test('the home page keeps the video frame; a page taken off keeps the videos line as it was', async () => {
  const b = await base()
  const out = operate(startOf(b), b.kit, { op: 'remove-page', page: 'team' })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assertCounted(out.plan, 'after remove-page')
  assert.equal(countOf(out.plan.pictures.own.unused, OWNER_REMOVED), 6)
  assert.deepEqual(videoLines(out.plan)[0].params, { count: 2, known: 3 })
  const back = operate(out.state, b.kit, { op: 'restore', removal: 'removal-1' })
  assert.deepEqual(withoutRevision(back.plan), withoutRevision(b.plan))
})

test('a gallery holding a video frame taken off says one more video, and one fewer when it comes back', async () => {
  // The video frame on the gallery: home and team galleries each take one of the 3 videos, 1 has no place.
  const b = await base('gallery-strip')
  assert.deepEqual(videoLines(b.plan)[0].params, { count: 1, known: 3 })
  const at = b.plan.leftOut.findIndex((e) => e.params?.known !== undefined)
  const gallery = galleryOf(b.plan, 'team')
  const out = operate(startOf(b), b.kit, { op: 'remove-block', page: 'team', block: gallery.id })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assertCounted(out.plan, 'after removing the gallery with a video frame')
  assert.deepEqual(videoLines(out.plan)[0].params, { count: 2, known: 3 })
  assert.equal(videoLines(out.plan)[0].what, '2 videos')
  assert.equal(
    out.plan.leftOut.findIndex((e) => e.params?.known !== undefined),
    at,
    'the line keeps its place'
  )
  const back = operate(out.state, b.kit, { op: 'restore', removal: 'removal-1' })
  assert.deepEqual(withoutRevision(back.plan), withoutRevision(b.plan))
})

/** A seeded random number generator (mulberry32), so a failing sequence can be run again. */
function randomOf(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function candidatesOf(state) {
  const ops = []
  for (const page of state.plan.pages) {
    ops.push({ op: 'remove-page', page: page.id })
    for (const block of page.blocks) {
      ops.push({ op: 'remove-block', page: page.id, block: block.id })
      for (const item of block.data) ops.push({ op: 'remove-item', page: page.id, block: block.id, item })
    }
  }
  for (const r of state.review.removals) ops.push({ op: 'restore', removal: r.id })
  return ops
}

test('hundreds of random operations on a plan with photos and videos keep every picture number consistent', async () => {
  const b = await base()
  let states = 0
  for (const seed of [3, 11, 29]) {
    const random = randomOf(seed)
    let s = startOf(b)
    let n = 0
    for (let step = 0; step < 100; step++) {
      const ops = candidatesOf(s)
      const op = ops[Math.floor(random() * ops.length)]
      const out = operate(s, b.kit, op, `removal-${seed}-${n++}`)
      if (!out.ok) {
        // A refusal is a lock of the card, never the picture guard turning down a legal operation.
        assert.ok(
          out.problems.every((p) => typeof p.code === 'string' && p.code !== 'picture_count'),
          JSON.stringify(out.problems)
        )
        continue
      }
      assertCounted(out.plan, `seed ${seed} step ${step} ${JSON.stringify(op)}`)
      s = out.state
      states++
    }
    while (s.review.removals.length) {
      const last = s.review.removals.at(-1)
      const out = operate(s, b.kit, { op: 'restore', removal: last.id })
      assert.equal(out.ok, true, `seed ${seed} restore ${last.id}: ${JSON.stringify(out.problems)}`)
      s = out.state
    }
    assert.deepEqual(withoutRevision(s.plan), withoutRevision(b.plan), `seed ${seed}`)
  }
  assert.ok(states >= 100, `${states} valid states visited`)
})
