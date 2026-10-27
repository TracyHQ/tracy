import { visionKey } from '../src/lib/picture-vision.js'
/** What the site's build did with the photographs, as the hand-off names it to the agent. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  leftoverPictures,
  pictureCredit,
  picturesOfBuild,
  pictureWorth,
  poorPicture,
  videoFrameIds
} from '../src/opportunities-build/handoff.js'

const vision = (labels) => ({ vision: { model: 'v', key: visionKey({ model: 'v' }), labels } })

test('placed photographs and drawn pictures are named with their origin; a place that holds a placeholder is listed apart', () => {
  const held = {
    plan: {
      placements: [
        { groupId: 'gallery/1.jpg', mediaId: 'm1', origin: 'real' },
        { groupId: 'gallery/2.jpg', mediaId: 'm2' }
      ],
      unfilled: [
        { groupId: 'hero/1.jpg', routes: ['home'], reason: 'no picture fits' },
        { groupId: 'food/1.jpg', routes: ['menu'], reason: 'no picture fits' }
      ]
    },
    receipts: {
      'gallery/1.jpg': { state: 'verified', path: 'images/tracy-content/a.jpg' },
      'gallery/2.jpg': { state: 'refused', path: null },
      'hero/1.jpg': {
        state: 'verified',
        kind: 'drawn',
        origin: 'outpainted',
        referenceIds: ['m3'],
        path: 'images/tracy-content/h.jpg'
      },
      'food/1.jpg': { state: 'verified', kind: 'placeholder', path: 'images/tracy-content/p.jpg' }
    },
    report: {
      demoLeft: [{ file: 'x.jpg' }, { file: 'x.jpg' }],
      demoOutside: ['images/joomlart/y.jpg'],
      never: []
    }
  }
  const p = picturesOfBuild(held)
  assert.deepEqual(p.placed, [
    { file: 'gallery/1.jpg', mediaId: 'm1', path: 'images/tracy-content/a.jpg', origin: 'real' },
    { file: 'hero/1.jpg', mediaId: 'm3', path: 'images/tracy-content/h.jpg', origin: 'outpainted' }
  ])
  assert.deepEqual(
    p.placeholders.map((u) => u.file),
    ['food/1.jpg']
  )
  assert.deepEqual(p.demoLeft, [{ file: 'x.jpg' }])
  assert.deepEqual(p.demoOutside, ['images/joomlart/y.jpg'])
  assert.equal(picturesOfBuild(null), null)
})

test('the pictures left for the agent: no poster, menu board, logo or words on it; the most useful first, then the largest; the build’s own left out', () => {
  const m = (id, w, h, vision) => ({
    id,
    kind: 'image',
    width: w,
    height: h,
    labels: vision ? { vision: { model: 'v', key: visionKey({ model: 'v' }), labels: vision } } : null
  })
  const media = [
    m('poster', 2000, 2000, { subject: 'poster', textPresence: 'present' }),
    m('small', 400, 300, { subject: 'food', textPresence: 'absent' }),
    m('big', 1600, 1200, { subject: 'interior', textPresence: 'absent' }),
    m('words', 1600, 1200, { subject: 'food', textPresence: 'present' }),
    m('unlabelled', 800, 600, null),
    m('placed', 3000, 2000, { subject: 'exterior', textPresence: 'absent' }),
    m('beach', 4000, 3000, { subject: 'event', quality: 'good', textPresence: 'absent' }),
    m('wall', 4000, 3000, { subject: 'other', quality: 'cluttered', textPresence: 'absent' }),
    m('dish', 600, 400, { subject: 'food', quality: 'good', heroWorthy: true, textPresence: 'absent' }),
    { id: 'clip', kind: 'video' }
  ]
  // A small good dish outranks a huge beach event or a cluttered wall: the agent places by what a picture shows.
  assert.deepEqual(
    leftoverPictures(media, new Set(['placed'])).map((p) => p.id),
    ['dish', 'small', 'big', 'beach', 'unlabelled', 'wall']
  )
  assert.equal(pictureWorth(m('x', 1, 1, null)), 3)
  assert.ok(
    pictureWorth(m('x', 1, 1, { subject: 'food', quality: 'good' })) >
      pictureWorth(m('y', 1, 1, { subject: 'people', quality: 'good' }))
  )
})

test("a video's frame ranks below every photograph, never out: a video post's cover, or an image of a video page", () => {
  const post = 'https://www.facebook.com/lr/posts/1'
  const food = vision({ subject: 'food', quality: 'good', textPresence: 'absent' })
  const media = [
    { id: 'cover', kind: 'image', width: 1600, height: 900, sourceUrl: post, labels: food },
    { id: 'clip', kind: 'video', sourceUrl: post },
    {
      id: 'reel',
      kind: 'image',
      width: 1600,
      height: 900,
      source_url: 'https://www.instagram.com/reel/x/',
      labels: food
    },
    { id: 'thumb', kind: 'image', width: 1280, height: 720, url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' },
    {
      id: 'photo',
      kind: 'image',
      width: 800,
      height: 600,
      sourceUrl: 'https://www.facebook.com/lr/posts/2',
      labels: food
    }
  ]
  assert.deepEqual([...videoFrameIds(media)].sort(), ['cover', 'reel', 'thumb'])
  assert.deepEqual(
    leftoverPictures(media, new Set()).map((p) => p.id),
    ['photo', 'cover', 'reel', 'thumb']
  )
  assert.equal(pictureWorth({ labels: null, videoFrame: true }), 0)
  assert.equal(poorPicture({ videoFrame: true }), true)
  assert.equal(poorPicture({ labels: vision({ subject: 'interior', quality: 'blurry' }) }), true)
  assert.equal(poorPicture({ labels: vision({ subject: 'people', quality: 'good' }) }), true)
  assert.equal(poorPicture({ labels: food }), false)
  assert.equal(poorPicture({ labels: null }), false)
})

test('a Google listing photo is credited to its authors and Google; any other picture has no credit line', () => {
  const credit = (authors) => ({ labels: { features: {}, credit: { provider: 'Google', authors } } })
  assert.equal(pictureCredit(credit([{ displayName: 'Minh', uri: 'https://x' }])), 'Photo: Minh / Google')
  assert.equal(
    pictureCredit(credit([{ displayName: 'Minh' }, { displayName: 'Hoa' }])),
    'Photo: Minh, Hoa / Google'
  )
  assert.equal(pictureCredit(credit([])), 'Photo: Google')
  assert.equal(pictureCredit({ labels: { features: {} } }), null)
  assert.equal(pictureCredit({ labels: null }), null)
})

test('a photo the build placed as a dish keeps the dish it was placed for', () => {
  const held = {
    plan: { placements: [{ groupId: 'menu/1.jpg', mediaId: 'm1', dish: 'Phở bò tái lăn' }] },
    receipts: { 'menu/1.jpg': { state: 'verified', path: 'images/tracy-content/m1.jpg' } }
  }
  assert.equal(picturesOfBuild(held).placed[0].dish, 'Phở bò tái lăn')
})

test('an accepted dish photo is handed to the agent before the others, so the picture cap never cuts it', () => {
  const media = [
    { id: 'big', kind: 'image', width: 4000, height: 3000 },
    { id: 'dish', kind: 'image', width: 600, height: 600 }
  ]
  assert.deepEqual(
    leftoverPictures(media, new Set(), new Set(['dish'])).map((m) => m.id),
    ['dish', 'big']
  )
})
