import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { buildBrief } from '../domain/brief.mjs'

const image = (id, category, extra = {}) => ({
  id,
  kind: 'image',
  category,
  width: 1600,
  height: 1000,
  source: 'website',
  sourceUrl: `https://images.example.test/${id}.jpg`,
  sha256: createHash('sha256').update(id).digest('hex'),
  ...extra
})
const brief = (media) =>
  buildBrief({
    opportunity: { id: 'story-products', name: 'Padel Club', candidate: {} },
    profile: { name: 'Padel Club', bio: 'Padel lessons and a pro shop.' },
    media,
    sources: [],
    madeAt: '2026-11-12T00:00:00.000Z'
  })
const story = (value) =>
  value.sitemap.find((page) => page.slug === 'about').sections.find((section) => section.kind === 'story')

test('retail product and equipment photographs cannot illustrate the business story', () => {
  const result = brief([
    image('skirt', 'people', { vision: { content: 'product', caption: 'A black sports skirt.' } }),
    image('racket', 'space', {
      vision: { content: 'equipment', caption: 'A racket on a plain background.' }
    }),
    image('bag', 'people', { vision: { content: 'equipment', caption: 'An isolated padel bag.' } }),
    image('lesson', 'people', {
      vision: { content: 'people-in-action', caption: 'A padel lesson on court.' }
    }),
    image('courts', 'space', { vision: { content: 'venue-interior', caption: 'Indoor padel courts.' } })
  ])
  assert.deepEqual(story(result).assetIds, ['lesson', 'courts'])
  for (const id of ['skirt', 'racket', 'bag']) {
    assert.ok(
      result.assets.some((asset) => asset.id === id && ['product', 'equipment'].includes(asset.content))
    )
    assert.ok(
      result.sitemap
        .find((page) => page.slug === 'gallery')
        .sections.some((section) => section.assetIds.includes(id))
    )
  }
})

test('stored vision labels and legacy positive product subjects also exclude a story photo', () => {
  const result = brief([
    image('stored-product', 'people', { labels: { vision: { labels: { content: 'product' } } } }),
    image('legacy-product', 'space', { vision: { subject: 'product' } }),
    image('real-team', 'people', { vision: { content: 'team' } })
  ])
  assert.deepEqual(story(result).assetIds, ['real-team'])
})

test('a product-only catalogue leaves the story without a photograph and keeps its product assets', () => {
  const result = brief([image('apparel', 'people', { vision: { content: 'product' } })])
  assert.deepEqual(story(result).assetIds, [])
  assert.equal(result.assets.find((asset) => asset.id === 'apparel').content, 'product')
})

test('an unlabelled picture is not inferred to be a product from its caption', () => {
  const result = brief([image('unlabelled', 'people', { caption: 'A product lesson.' })])
  assert.deepEqual(story(result).assetIds, ['unlabelled'])
  assert.equal(result.assets[0].content, 'unlabelled')
})
