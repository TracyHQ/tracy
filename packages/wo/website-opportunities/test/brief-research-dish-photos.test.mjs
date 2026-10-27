import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as domain from '../domain/index.mjs'
import { fromPlace, makeSiteBrief } from '../src/brief-research.js'

const AT = '2026-10-25T10:00:00.000Z'

test("a place's social photo keeps its post, so the post's words can name the dish it shows", () => {
  const view = {
    profile: {
      name: 'Quán Huế',
      menus: [{ url: 'https://quan.test/menu', source: 'website' }],
      menuItems: [
        {
          name: 'Bún bò Huế',
          price: '55',
          currency: 'VND',
          section: null,
          source: { url: 'https://quan.test/menu', kind: 'page' },
          collectedAt: AT,
          verified: true
        }
      ]
    },
    brand: null,
    sources: [
      {
        source: 'facebook',
        ref: 'https://facebook.com/quanhue',
        status: 'complete',
        collected: { posts: [{ id: 'p1', url: 'https://fb.test/p1', caption: 'Bún bò Huế sáng nay' }] }
      }
    ],
    media: [
      {
        id: 'm1',
        status: 'stored',
        kind: 'image',
        category: 'food',
        sha256: 'a'.repeat(64),
        width: 1080,
        height: 1080,
        source: 'facebook',
        source_url: 'https://fb.test/p1',
        post_id: 'p1',
        caption: 'Bún bò Huế sáng nay',
        alt: null,
        labels: { vision: { key: 'k', labels: { subject: 'food' } } }
      }
    ]
  }
  const read = fromPlace(view)
  assert.equal(read.media[0].postId, 'p1')
  const brief = makeSiteBrief(domain, read, {
    opportunity: { id: 'o1', name: 'Quán Huế', candidate: { kind: 'restaurants' } },
    madeAt: AT
  })
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  const menu = brief.sitemap.find((p) => p.slug === 'menu').sections.find((s) => s.kind === 'menu')
  assert.deepEqual(
    [menu.menuItems[0].photo.assetId, menu.menuItems[0].photo.how, menu.menuItems[0].photo.status],
    ['m1', 'post-text', 'accepted']
  )
})
