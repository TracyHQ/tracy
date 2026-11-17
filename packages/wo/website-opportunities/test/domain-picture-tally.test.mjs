// The picture counts a plan card shows (#575 pictures gap audit; a real run said "14 of your 19 photos" while 12
// photos were placed and 7 reported unused). Spots and photos are two counts: one photo may fill several spots (a
// person's photo on two pages), so the plan carries the owner's photos, the photos placed, the photos not used each
// with its coded reason, the spots the owner's photos fill, the spots left empty and the spots Tracy will draw.
// photos = placed + every unused count, whatever the plan. Invented club, invented pictures.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-picture-tally.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { ownPicturesOf } from '../domain/picture-frames.mjs'
import { assignPictures } from '../domain/picture-policy.mjs'
import { pictureTallyOf } from '../domain/picture-tally.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { picturesOf } from '../domain/plan-look-pictures.mjs'
import { pictureBlocks, picturePlan, pictureProfile } from './fixtures/picture-policy/invented-pictures.mjs'

const sum = (entries) => entries.reduce((n, e) => n + e.count, 0)

test('the tally counts photos and spots apart, and every photo is placed or unused with a code', () => {
  const data = planDataOf(pictureProfile())
  const pictures = ownPicturesOf(data).map((p) => (p.label ? p : { ...p, label: 'counted' }))
  const assignment = assignPictures({ pages: picturePlan().pages, blocks: pictureBlocks(), data, pictures })
  const tally = pictureTallyOf(assignment, pictures)
  const photos = pictures.filter((p) => p.media === 'photo')
  assert.equal(tally.photos, photos.length)
  const placed = new Set(assignment.frames.filter((f) => f.source === 'own').map((f) => f.picture))
  assert.equal(tally.placed, placed.size)
  assert.equal(tally.photos, tally.placed + sum(tally.unused))
  assert.ok(tally.unused.every((u) => /^[a-z_]+$/.test(u.code) && u.count > 0))
  // The stock photo is never used, and says so.
  assert.ok(tally.unused.some((u) => u.code === 'stock'))
  assert.equal(tally.spots, assignment.counts.own)
  assert.equal(tally.drawn, assignment.counts.generated)
  assert.equal(sum(tally.empty), tally.emptySpots)
})

test('the plan summary carries the tally: photos, placed, unused codes, empty spots', () => {
  const summary = picturesOf(picturePlan().pages, pictureBlocks(), planDataOf(pictureProfile())).pictures
  assert.equal(typeof summary.own.photos, 'number')
  assert.equal(typeof summary.own.placed, 'number')
  assert.ok(summary.own.placed <= summary.own.frames || summary.own.frames === 0 || summary.own.placed > 0)
  assert.equal(summary.own.photos, summary.own.placed + sum(summary.own.unused))
  assert.ok(Array.isArray(summary.empty))
  assert.equal(summary.generated.frames >= 0, true)
})

test('one photo shown in two spots counts as one photo placed and two spots', () => {
  const tally = pictureTallyOf(
    {
      frames: [
        { id: 'a', source: 'own', picture: 'p1' },
        { id: 'b', source: 'own', picture: 'p1' },
        { id: 'c', source: 'none', reason: 'no_generated_people' },
        { id: 'd', source: 'generated' },
        { id: 'e', source: 'own', picture: 'p1', sameAs: 'a' }
      ],
      reduced: [],
      counts: { own: 2, generated: 1 }
    },
    [
      { id: 'p1', media: 'photo', stock: false },
      { id: 'p2', media: 'photo', stock: false }
    ]
  )
  assert.deepEqual(
    { photos: tally.photos, placed: tally.placed, spots: tally.spots, drawn: tally.drawn },
    { photos: 2, placed: 1, spots: 2, drawn: 1 }
  )
  assert.deepEqual(tally.unused, [{ code: 'no_fitting_frame', count: 1 }])
  assert.deepEqual(tally.empty, [{ code: 'no_generated_people', count: 1 }])
})

const HAPPY = JSON.parse(
  readFileSync(
    new URL('./fixtures/build-contract/sunrise-tennis-club.build-scenario.json', import.meta.url),
    'utf8'
  )
)
const problemsAt = (doc) => checkBuildDocument(doc).problems.map((p) => p.at)

test('Contract B holds the counts: photos = placed + unused, codes once, given together', () => {
  const plan = structuredClone(HAPPY.plan)
  assert.deepEqual(problemsAt(plan), [])
  plan.pictures.own = {
    ...plan.pictures.own,
    photos: 19,
    placed: 12,
    unused: [{ code: 'shape_unfit', count: 7 }]
  }
  plan.pictures.empty = [{ code: 'no_generated_people', count: 2 }]
  assert.deepEqual(problemsAt(plan), [])
  plan.pictures.own.photos = 14
  assert.ok(problemsAt(plan).includes('pictures.own'))
  plan.pictures.own = { ...plan.pictures.own, photos: 19, unused: [{ code: 'Shape', count: 7 }] }
  assert.ok(problemsAt(plan).includes('pictures.own.unused[0].code'))
  delete plan.pictures.own.unused
  assert.ok(problemsAt(plan).includes('pictures.own'))
})
