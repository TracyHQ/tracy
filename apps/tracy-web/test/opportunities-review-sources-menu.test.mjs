import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addReviewSources, renderBriefWithReviews } from 'website-opportunities/src/review-sources.js'
import * as domain from '../../../packages/wo/website-opportunities/domain/index.mjs'

const AT = '2026-10-23T10:00:00.000Z'
const photo = (n) => ({ url: `https://maps.test/menu-${n}.jpg`, mediaId: `m${n}` })
const googleMaps = {
  placeId: 'g1',
  url: 'https://maps.test/place',
  menuFetchedAt: AT,
  menuPhotos: [photo(1), photo(2)]
}
const reading = (name, price, url) => ({
  name,
  price,
  currency: null,
  section: null,
  source: { url, sha256: null, kind: 'photo' },
  collectedAt: AT,
  verified: false
})

function briefFor(profile) {
  return domain.buildBrief({
    opportunity: { id: 'o1', name: 'Sundrift' },
    profile,
    sources: [],
    media: ['m1', 'm2'].map((id) => ({
      id,
      kind: 'image',
      category: 'menu',
      sha256: (id === 'm1' ? 'a' : 'b').repeat(64)
    })),
    madeAt: AT
  })
}

test('dishes read off photos reach the brief as menu items with their photo as source, beside the photo section', () => {
  const profile = {
    name: 'Sundrift',
    reviewSources: { googleMaps },
    menuItems: [
      reading('Shawarma plate', 'AED 38', photo(1).url),
      // A photo outside Google's menu photos (a text-heavy photo of the place) is a source too.
      reading('Mezze platter', '55', 'https://elsewhere.test/x.jpg')
    ]
  }
  const brief = addReviewSources(briefFor(profile), profile)
  assert.equal(domain.validateBrief(brief).ok, true, JSON.stringify(domain.validateBrief(brief).errors))
  const sections = brief.sitemap.find((p) => p.slug === 'menu').sections
  assert.deepEqual(
    sections.flatMap((s) => s.menuItems ?? []).map((i) => [i.name, i.price, i.verified, i.source.url]),
    [
      ['Shawarma plate', 'AED 38', false, photo(1).url],
      ['Mezze platter', '55', false, 'https://elsewhere.test/x.jpg']
    ]
  )
  assert.equal(
    sections.some((s) => s.menuSuggestions),
    false
  )
  assert.ok(sections.some((s) => s.assetIds.includes('m1')))
  assert.equal(
    brief.missing.some((m) => m.field === 'menu' || m.field === 'structured-menu'),
    false
  )
  const md = renderBriefWithReviews(domain, brief)
  assert.match(md, /"Shawarma plate": "AED 38" — .*menu-1\.jpg.*unverified/)
  assert.doesNotMatch(md, /[Dd]o not invent|[Nn]ever facts/)
})

test('menu photos with no reading keep today’s brief: links only', () => {
  const profile = { name: 'Sundrift', reviewSources: { googleMaps } }
  const brief = addReviewSources(briefFor(profile), profile)
  const section = brief.sitemap.find((p) => p.slug === 'menu').sections[0]
  assert.equal(section.menuSuggestions, undefined)
  assert.equal(section.evidence.length, 2)
  assert.match(brief.missing.find((m) => m.field === 'structured-menu').why, /have not been extracted/)
})
