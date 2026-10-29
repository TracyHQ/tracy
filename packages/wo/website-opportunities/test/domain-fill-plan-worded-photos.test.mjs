// Photos with words on them (a poster, a before/after label) never fill a card, thumbnail, hero or offering picture; a
// real gallery takes one only as its last photo. Fictional briefs of two trades: a bakery and a dental clinic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFill, wordedPhoto } from '../domain/fill-plan.mjs'

const slot = (key, entity, role, group, size = [400, 300]) => ({
  key,
  entity,
  type: 'image',
  sample: `images/demo/${key}.jpg`,
  label: key,
  role,
  ...(group ? { group } : {}),
  fit: {
    measured: true,
    kind: 'photo',
    replace: 'photo',
    transparent: false,
    source: { width: size[0], height: size[1], format: 'jpg' },
    aspect: size[0] / size[1],
    tolerance: 0.02,
    crop: 'cover'
  }
})
const asset = (id, extra = {}) => ({ id, kind: 'image', width: 1200, height: 900, ...extra })

// An article row of card thumbnails (a gallery group inside an article) and a real gallery module.
const mapOf = () => ({
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [
    { key: 'article-1', kind: 'article' },
    { key: 'module-1', kind: 'module' },
    { key: 'module-2', kind: 'module' }
  ],
  slots: [
    slot('a1', 'article-1', 'business.gallery_image', { id: 'article-1.video.1', item: 1, kind: 'gallery' }),
    slot('m1', 'module-1', 'business.gallery_image', { id: 'module-1.gallery.0', item: 0, kind: 'gallery' }),
    slot('h1', 'module-2', 'business.hero_image')
  ]
})

for (const trade of ['bakery', 'dental clinic']) {
  test(`${trade}: a worded photo takes no card thumbnail or hero, a gallery only when nothing clean is left`, () => {
    const brief = {
      business: { name: 'Fictional Co', trade },
      assets: [
        asset('p-clean'),
        asset('p-words', { hasTextOverlay: true }),
        asset('p-poster', { content: 'text-graphic' })
      ]
    }
    const fill = planFill({ contentMap: mapOf(), brief })
    const by = (k) => fill.slots.find((d) => d.key === k)
    assert.notEqual(by('a1').mediaId, 'p-words')
    assert.notEqual(by('a1').mediaId, 'p-poster')
    assert.notEqual(by('h1').mediaId, 'p-words')
    assert.notEqual(by('h1').mediaId, 'p-poster')
    for (const d of fill.slots) assert.ok(!['p-words', 'p-poster'].includes(d.mediaId) || d.key === 'm1')
  })

  test(`${trade}: only worded photos in the brief leave a card thumbnail without a photo`, () => {
    const brief = {
      business: { name: 'Fictional Co', trade },
      assets: [asset('p-words', { hasTextOverlay: true })]
    }
    const fill = planFill({ contentMap: mapOf(), brief })
    const a1 = fill.slots.find((d) => d.key === 'a1')
    assert.notEqual(a1.action, 'photo')
  })
}

test('wordedPhoto reads overlay words, text graphics and posters', () => {
  assert.equal(wordedPhoto({ hasTextOverlay: true }), true)
  assert.equal(wordedPhoto({ content: 'text-graphic' }), true)
  assert.equal(wordedPhoto({ subject: 'poster' }), true)
  assert.equal(wordedPhoto({ subject: 'interior', content: 'venue-interior' }), false)
})
