// The picture numbers of one plan agree with each other (#575 build chat, a real plan card): the pictures summary said
// 19 photos, 15 placed and 4 unused "no fitting frame", while the left out list said 7 photos had no gallery room and
// the galleries showed 12. Three of those 7 filled a frame outside the galleries (the hero, a section picture), so they
// were counted placed by the summary and left out by the list, and the 4 others were counted under two reasons. The
// step chain had one placement and one list: a photo is placed (in any frame) or unused, never both, with one reason
// (`quickstart-picture-plan.js` `unused`). Invented club, invented photos, scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-picture-count.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { ownPicturesOf } from '../domain/picture-frames.mjs'
import { assignPictures } from '../domain/picture-policy.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { blockMapOf, composePlan } from '../domain/plan-composer.mjs'
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

/** The club with `n` own gallery photos, the three of the fixture first. */
function clubWithPhotos(n) {
  const profile = clubProfile()
  const [first] = profile.items.gallery
  for (let i = profile.items.gallery.length; i < n; i++)
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
  return profile
}

/** Two galleries of six (home and team page): the other photos of the club are shown by no gallery. */
async function twoGalleriesOfSix(n) {
  const profile = clubWithPhotos(n)
  const ids = profile.items.gallery.map((g) => g.id)
  const recipes = pageRecipes()
  recipes.recipes.find((r) => r.pageType === 'team').blocks.splice(2, 0, 'gallery-strip')
  const composition = goodComposition()
  composition.pages[0].blocks.find((b) => b.block === 'gallery-strip').data = ids.slice(0, 6)
  composition.pages[1].blocks.push({
    block: 'gallery-strip',
    label: 'Photos',
    data: ids.slice(6, 12),
    reason: 'Your courts.'
  })
  const { plan } = await composePlan({
    profile,
    blockStore: blockStore(),
    pageRecipes: recipes,
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(composition))
  })
  assert.ok(plan, 'the plan passes the gate')
  return { plan, profile, ids }
}

/** The photos that fill a frame of the plan's pages, as the pictures step's policy places them. */
function placedPhotosOf(plan, profile) {
  const data = planDataOf(profile)
  const pictures = ownPicturesOf(data).map((p) => (p.label ? p : { ...p, label: 'counted' }))
  const { frames } = assignPictures({ pages: plan.pages, blocks: blockStoreMap(), data, pictures })
  return new Set(frames.filter((f) => f.source === 'own').map((f) => f.picture))
}
const blockStoreMap = () => blockMapOf(blockStore(), library())

const sum = (entries) => (entries ?? []).reduce((n, e) => n + e.count, 0)
const countOf = (entries, code) => (entries ?? []).find((e) => e.code === code)?.count ?? 0

test('a photo no gallery shows but a frame takes is placed, never left out', async () => {
  const { plan, profile, ids } = await twoGalleriesOfSix(19)
  const own = plan.pictures.own
  const inGalleries = plan.pages
    .flatMap((p) => p.blocks.filter((b) => b.type === 'gallery').flatMap((b) => b.data))
    .filter((id) => ids.includes(id))
  assert.equal(inGalleries.length, 12)
  const placed = placedPhotosOf(plan, profile)
  const elsewhere = [...placed].filter((id) => ids.includes(id) && !inGalleries.includes(id))
  assert.ok(elsewhere.length > 0, 'the fixture places a photo outside the galleries')
  assert.equal(own.photos, 19)
  assert.equal(own.placed, placed.size)
  const leftOutPhotos = plan.leftOut.filter((e) => ids.includes(e.item))
  assert.deepEqual(
    leftOutPhotos.filter((e) => placed.has(e.item)).map((e) => e.item),
    [],
    'a placed photo is not left out'
  )
  // Every photo shown by neither a gallery nor a frame is left out once, under the reason the summary counts it by.
  assert.equal(leftOutPhotos.length, 19 - 12 - elsewhere.length)
  assert.equal(new Set(leftOutPhotos.map((e) => e.item)).size, leftOutPhotos.length)
  const roomless = leftOutPhotos.filter((e) => e.code === 'no_gallery_room')
  assert.equal(countOf(own.unused, 'no_gallery_room'), roomless.length)
  assert.ok(roomless.every((e) => e.params?.count === roomless.length))
  assert.equal(own.photos, own.placed + sum(own.unused))
  assert.deepEqual(pictureCountProblems(plan), [])
})

test('the gate guard refuses picture numbers that do not add up', () => {
  const plan = {
    items: [
      { id: 'g1', kind: 'gallery' },
      { id: 'g2', kind: 'gallery' },
      { id: 'g3', kind: 'gallery' }
    ],
    pictures: {
      own: { frames: 2, photos: 3, placed: 2, unused: [{ code: 'no_fitting_frame', count: 1 }] }
    },
    leftOut: [
      { kind: 'item', item: 'g2', code: 'no_gallery_room', params: { count: 2 } },
      { kind: 'item', item: 'g3', code: 'no_gallery_room', params: { count: 2 } }
    ]
  }
  const problems = pictureCountProblems(plan)
  assert.ok(problems.some((p) => p.at === 'pictures.own.unused'))
  plan.pictures.own.unused = [{ code: 'no_gallery_room', count: 1 }]
  plan.leftOut.pop()
  plan.leftOut[0].params.count = 1
  assert.deepEqual(pictureCountProblems(plan), [])
})

test('a plan made before the photo counts is not checked', () => {
  assert.deepEqual(pictureCountProblems({ pictures: { own: { frames: 0 } }, leftOut: [] }), [])
})
