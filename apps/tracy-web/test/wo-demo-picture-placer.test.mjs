import { visionKey } from '../src/lib/picture-vision.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placePictures } from '../src/opportunities-build/demo-picture-placer.js'
import { agentImageRecipe } from '../src/opportunities-build/agent-demo-image.js'

const photo = (id, subject = 'interior', extra = {}) => ({
  id,
  width: 1600,
  height: 1000,
  labels: {
    vision: {
      model: 'v',
      key: visionKey({ model: 'v' }),
      labels: { subject, heroWorthy: true, quality: 'sharp' }
    }
  },
  ...extra
})
const frame = (frameId, extra = {}) => ({
  frameId,
  page: '/',
  width: 800,
  height: 400,
  underWords: true,
  ...extra
})

test('picture placer excludes unsuitable and unknown photos behind words without inventing a tone', () => {
  const media = ['people', 'event', 'poster', 'menu-board', 'logo'].map((s) => photo(s, s))
  media.push(photo('unknown', 'interior', { labels: {} }))
  const [no] = placePictures({ frames: [frame('hero')], media }).proposals
  assert.equal(no.photo, null)
  assert.equal(no.fallback.code, 'NO_SUITABLE_PHOTO')
  const [yes] = placePictures({ frames: [frame('hero')], media: [...media, photo('room')] }).proposals
  assert.equal(yes.photo, 'room')
  assert.equal(yes.tone, null)
  assert.equal(yes.mapping, 'unmapped')
  assert.doesNotThrow(() => agentImageRecipe({ assetId: yes.photo, crop: yes.crop }, [yes.photo]))
  const [person] = placePictures({
    frames: [frame('team', { underWords: false, subject: 'people' })],
    media
  }).proposals
  assert.equal(person.photo, 'people')
})

test('picture placer is stable across input order and avoids repeating photos on one page', () => {
  const frames = [frame('b'), frame('a'), frame('c', { page: '/about' })]
  const media = [photo('b'), photo('a')]
  const first = placePictures({ frames, media }).proposals
  const second = placePictures({ frames: [...frames].reverse(), media: [...media].reverse() }).proposals
  const sorted = (list) => [...list].sort((a, b) => a.frameId.localeCompare(b.frameId))
  assert.deepEqual(sorted(first), sorted(second))
  assert.notEqual(first[0].photo, first[1].photo)
  assert.equal(first[2].photo, 'a')
})

test('picture placer never upscales and reports missing frame dimensions and fallback candidates', () => {
  const out = placePictures({
    frames: [frame('missing', { width: 0 }), frame('large', { width: 3000 }), frame('ok')],
    media: [photo('a'), photo('b')]
  }).proposals
  assert.equal(out[0].fallback.code, 'FRAME_SIZE_UNKNOWN')
  assert.equal(out[1].photo, null)
  assert.equal(out[2].alternatives.length, 1)
  assert.equal(out[2].fallback.code, 'TRY_ALTERNATIVE')
})

test('broad food labels cannot certify a named product even when one candidate fits better', () => {
  const media = [
    photo('wrong-product', 'food'),
    photo('named-product', 'food', { width: 2000, height: 1800 })
  ]
  const [proposal] = placePictures({
    frames: [frame('named-card', { underWords: false, subject: 'food' })],
    media
  }).proposals
  assert.equal(proposal.photo, 'wrong-product', 'layout ranking alone has no product identity evidence')
  assert.equal(proposal.identity, 'unverified')
  assert.match(proposal.reason, /identity unverified/)
  assert.doesNotMatch(proposal.reason, /matching the frame/)
  assert.ok(proposal.alternatives.every((p) => p.identity === 'unverified'))
})

test('picture placer keeps a photo the vision model calls a graphic out of every photo frame (#48)', () => {
  const banner = photo('banner', 'interior')
  banner.labels.vision.labels.isGraphic = true
  for (const f of [frame('hero'), frame('card', { underWords: false })]) {
    const [out] = placePictures({ frames: [f], media: [banner] }).proposals
    assert.equal(out.photo, null, f.frameId)
  }
  const [kept] = placePictures({
    frames: [frame('card', { underWords: false })],
    media: [banner, photo('room')]
  }).proposals
  assert.equal(kept.photo, 'room')
})
