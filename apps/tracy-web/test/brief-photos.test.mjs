/**
 * The brief photo inventory (spec TracyHQ/tracy#231, ticket #234): every photo of a content brief, with the labels the brief
 * already holds (caption, subject, size, orientation, faces, owner) and a verdict read by code from those labels, so the site
 * plan decides every photo and never places one the labels already refuse. No model is involved. Fictional business: a
 * pottery studio.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { briefFactSheet } from '../src/sites/brief-engines/brief-fact-sheet.js'
import { briefPhotos } from '../src/sites/brief-engines/brief-photos.js'

const sha = (/** @type {string} */ c) => c.repeat(64)
const asset = (/** @type {any} */ over) => ({
  kind: 'image',
  category: 'space',
  source: 'website',
  width: 2000,
  height: 1200,
  orientation: 'landscape',
  quality: 'high',
  content: 'venue-interior',
  isGraphic: false,
  isOwnPhoto: true,
  uploaderRole: 'owner',
  faceBoxes: [],
  peopleCount: 0,
  ...over
})
const BRIEF = {
  reading: {
    about: 'Clay Corner runs wheel-throwing classes in a bright studio.',
    services: [{ id: 'wheel', label: 'Wheel throwing', quote: 'Learn to centre clay on the wheel' }],
    team: [{ id: 'mia', label: 'Mia Stone', role: 'Teacher' }]
  },
  assets: [
    asset({
      id: 'a1',
      sha256: sha('1'),
      caption: 'Hands shaping a bowl on the wheel',
      depicts: { id: 'wheel' }
    }),
    asset({
      id: 'a2',
      sha256: sha('2'),
      caption: 'The teacher at her bench',
      content: 'team',
      portraitOf: { id: 'mia' },
      faceBoxes: [{ x: 0.4, y: 0.2, w: 0.1, h: 0.1 }],
      peopleCount: 1
    }),
    asset({ id: 'a3', sha256: sha('3'), caption: 'Studio logo', content: 'logo', isGraphic: true }),
    asset({ id: 'a4', sha256: sha('1'), caption: 'Hands shaping a bowl, again', depicts: { id: 'wheel' } }),
    asset({
      id: 'a5',
      sha256: sha('5'),
      width: null,
      height: null,
      orientation: 'unknown',
      quality: 'unknown',
      content: 'unlabelled',
      unlabelledReason: 'too_small',
      caption: undefined
    }),
    { ...asset({ id: 'a6', sha256: sha('6'), caption: 'A tour of the kiln room' }), kind: 'video' }
  ]
}

const photos = briefPhotos(BRIEF, briefFactSheet(BRIEF))
const byId = new Map(photos.map((p) => [p.id, p]))

test('every image of the brief is listed once, with a stable id', () => {
  assert.deepEqual(
    photos.map((p) => p.id),
    ['photo:a1', 'photo:a2', 'photo:a3', 'photo:a4', 'photo:a5']
  )
})

test('a photo carries the labels the brief holds, and its fact sheet source id', () => {
  const portrait = byId.get('photo:a2')
  assert.equal(portrait.caption, 'The teacher at her bench')
  assert.equal(portrait.subject, 'team')
  assert.equal(portrait.portraitOf, 'mia')
  assert.equal(portrait.faces, 1)
  assert.equal(portrait.orientation, 'landscape')
  assert.equal(portrait.size, '2000x1200')
  assert.equal(portrait.ownPhoto, true)
  assert.equal(portrait.sourceId, null)
  assert.equal(byId.get('photo:a1').depicts, 'wheel')
  assert.match(byId.get('photo:a1').sourceId, /^photo-\d+$/)
})

test('a graphic, a copy of an earlier photo and a photo too small to label are refused, with the reason', () => {
  assert.equal(byId.get('photo:a1').verdict, 'accept')
  assert.deepEqual(byId.get('photo:a3').rejectedFor, ['graphic'])
  assert.deepEqual(byId.get('photo:a4').rejectedFor, ['duplicate'])
  assert.deepEqual(byId.get('photo:a5').rejectedFor, ['too-small'])
  for (const id of ['photo:a3', 'photo:a4', 'photo:a5']) assert.equal(byId.get(id).verdict, 'reject')
})

test('a label the brief does not hold is named as unknown, never guessed', () => {
  assert.deepEqual(byId.get('photo:a5').unknown, ['subject', 'size'])
  assert.deepEqual(byId.get('photo:a1').unknown, [])
})

test('a brief with no assets has no photos', () => {
  assert.deepEqual(briefPhotos({ reading: {} }), [])
  assert.deepEqual(briefPhotos(null), [])
})

test('a blurry photo, one with text or a watermark, and one of another business are refused, each with its own reason', () => {
  const risky = briefPhotos({
    assets: [
      asset({ id: 'b1', sha256: sha('a'), caption: 'A soft, shaken shot of the kiln', isBlurry: true }),
      asset({
        id: 'b2',
        sha256: sha('b'),
        caption: 'A stock photo with a watermark',
        hasTextOrWatermark: true
      }),
      asset({ id: 'b3', sha256: sha('c'), caption: 'The pottery shop next door', showsOtherBusiness: true }),
      asset({
        id: 'b4',
        sha256: sha('d'),
        caption: 'Glazed cups on a shelf',
        isBlurry: false,
        hasTextOrWatermark: false,
        showsOtherBusiness: false
      })
    ]
  })
  const of = new Map(risky.map((p) => [p.id, p]))
  assert.deepEqual(of.get('photo:b1').rejectedFor, ['blurry'])
  assert.deepEqual(of.get('photo:b2').rejectedFor, ['text-or-watermark'])
  assert.deepEqual(of.get('photo:b3').rejectedFor, ['other-business'])
  for (const id of ['photo:b1', 'photo:b2', 'photo:b3']) assert.equal(of.get(id).verdict, 'reject')
  assert.equal(of.get('photo:b4').verdict, 'accept')
  assert.deepEqual(of.get('photo:b4').unknown, [])
})

test('a risk label the brief does not hold (null) is unknown, not a refusal', () => {
  const [photo] = briefPhotos({
    assets: [
      asset({
        id: 'c1',
        sha256: sha('e'),
        caption: 'A bowl drying',
        isBlurry: null,
        hasTextOrWatermark: null,
        showsOtherBusiness: null
      })
    ]
  })
  assert.equal(photo.verdict, 'accept')
  assert.deepEqual(photo.rejectedFor, [])
  assert.deepEqual(photo.unknown, ['blurry', 'text-or-watermark', 'other-business'])
})
