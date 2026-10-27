import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aspectClass,
  hammingDistance,
  labelPicture,
  looksGraphic,
  nearCopies,
  subjectsFromWords
} from '../domain/pictures/picture-labels.mjs'

test('a caption about grilled seafood says food; one about the terrace at sunset says the outside', () => {
  assert.equal(
    labelPicture({ id: 'a', width: 1200, height: 800, caption: 'Fresh grilled seafood platter tonight' })
      .subject,
    'food'
  )
  assert.equal(
    labelPicture({ id: 'b', width: 1200, height: 800, caption: 'Our terrace at sunset, right on the beach' })
      .subject,
    'exterior'
  )
})

test('a picture nothing speaks for is unknown, not "other"', () => {
  const label = labelPicture({ id: 'c', width: 800, height: 800, caption: 'Thank you all!' })
  assert.equal(label.subject, 'unknown')
  assert.equal(label.subjectFrom, 'none')
  assert.equal(label.textPresence, 'unknown')
})

test('a vision label overrides the words and says where it came from', () => {
  const label = labelPicture({
    id: 'd',
    width: 1600,
    height: 900,
    caption: 'seafood night',
    vision: {
      subject: 'interior',
      textPresence: 'absent',
      quality: 'good',
      focus: 'center',
      heroWorthy: true,
      oneLine: 'Warm dining room with lanterns'
    }
  })
  assert.equal(label.subject, 'interior')
  assert.equal(label.subjectFrom, 'vision')
  assert.equal(label.textPresence, 'absent')
  assert.equal(label.heroWorthy, true)
  assert.ok(label.words.includes('lanterns'))
})

test('graphic detector: a flat two-tone ground is a graphic; so is a busy one with few tones; a photo is not (C10)', () => {
  assert.equal(looksGraphic({ top2Share: 0.72, edgeDensity: 0.05 }), true)
  assert.equal(looksGraphic({ top2Share: 0.5, edgeDensity: 0.22 }), true)
  assert.equal(looksGraphic({ top2Share: 0.5, edgeDensity: 0.1 }), false)
  assert.equal(looksGraphic({ top2Share: 0.2, edgeDensity: 0.3 }), false)
  assert.equal(looksGraphic(null), false)
  const poster = labelPicture({
    id: 'p',
    width: 1080,
    height: 1350,
    features: { top2Share: 0.8, edgeDensity: 0.1 }
  })
  assert.equal(poster.graphic, true)
  assert.equal(poster.textPresence, 'present')
})

test('shape classes', () => {
  assert.deepEqual([1.78, 1.33, 1, 0.75].map(aspectClass), ['wide', 'landscape', 'square', 'portrait'])
})

test('alt text weighs twice a caption; a URL path counts too', () => {
  const s = subjectsFromWords({
    alt: 'cocktail',
    caption: 'pizza',
    sourceUrl: 'https://x.test/img/pizza-oven.jpg'
  })
  assert.equal(s.drink, 0.5)
  assert.equal(s.food, 0.5)
})

test('near-copies: hashes ≤ 6 bits apart share a cluster, the largest picture first; nothing is dropped', () => {
  assert.equal(hammingDistance('ffffffffffffffff', 'fffffffffffffff0'), 4)
  assert.equal(hammingDistance('0', null), null)
  const labels = [
    { id: 'small', width: 400, height: 400, dhash: 'ffffffffffffffff' },
    { id: 'big', width: 1200, height: 1200, dhash: 'fffffffffffffff0' },
    { id: 'other', width: 800, height: 800, dhash: '0783719562751226' }
  ]
  const { clusters, clusterOf } = nearCopies(labels)
  assert.deepEqual(clusters, [['big', 'small'], ['other']])
  assert.equal(clusterOf.get('small'), clusterOf.get('big'))
})
