import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildBrief } from '../domain/brief.mjs'
import { menuItemsFromHtml } from '../domain/menu-reader.mjs'
import { placeProfileFromBrief } from '../domain/place-profile-from-brief.mjs'
import { placeProfileFromDemoRequest } from '../domain/place-profile-from-demo-request.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

const valid = (doc) => assert.deepEqual(validatePlaceProfile(doc), { ok: true, errors: [] })
const sourceOf = (doc, fact) => {
  const evidence = doc.evidence.find((e) => e.id === fact.evidenceRefs[0])
  return doc.sources.find((s) => s.id === evidence.sourceId)
}

test('a brief keeps sourced menu facts and original quotations, never its generated copy or verification', () => {
  const menuItems = menuItemsFromHtml(
    readFileSync(new URL('./fixtures/menu/menu-page.html', import.meta.url), 'utf8'),
    { source: { url: 'https://cafe.example/menu', kind: 'page' }, collectedAt: '2026-10-26T00:00:00Z' }
  )
  menuItems[0].size = 'Large'
  menuItems[0].priceScale = 1000
  const brief = buildBrief({
    opportunity: { id: 'local', name: 'Corner Cafe', candidate: { trade: 'food' } },
    profile: { name: 'Corner Cafe', phone: '+1 555 0100', menuItems },
    sources: [
      { source: 'menu-file', ref: 'https://cafe.example/menu', status: 'complete', coverage: { fetched: 1 } }
    ],
    media: [],
    madeAt: '2026-10-26T00:00:00Z'
  })
  brief.sitemap[0].sections[0].copy = 'Invented award-winning team.'
  brief.sitemap[0].sections[0].evidence = [
    { source: 'website', url: 'https://cafe.example/about', quote: 'Coffee roasted here.' }
  ]
  const before = structuredClone(brief)
  const doc = placeProfileFromBrief(brief)
  valid(doc)
  assert.equal(doc.business.name.value, 'Corner Cafe')
  assert.equal(sourceOf(doc, doc.business.phone).kind, 'sender-statement')
  assert.equal(sourceOf(doc, doc.business.phone).ref, undefined)
  assert.deepEqual(doc.coverage.find((c) => c.target === 'phone').sourceRefs, [
    sourceOf(doc, doc.business.phone).id
  ])
  assert.equal(doc.classification.derivedCategories[0].value.code, 'food')
  assert.equal(doc.offerings.length, menuItems.length)
  assert.equal(doc.offerings[0].value.variants[0].size, 'Large')
  assert.equal(doc.offerings[0].value.variants[0].price.raw, menuItems[0].price)
  assert.equal(doc.offerings[0].value.variants[0].price.priceScale, 1000)
  assert.equal(sourceOf(doc, doc.offerings[0]).ref, 'https://cafe.example/menu')
  assert.ok(doc.quotes.some((q) => q.value.text === 'Coffee roasted here.'))
  assert.equal(JSON.stringify(doc).includes('Invented award-winning'), false)
  assert.equal(JSON.stringify(doc).includes('"verified"'), false)
  assert.deepEqual(brief, before)
  assert.deepEqual(placeProfileFromBrief(brief), doc)
})

test('v1 extensions keep prices, descriptions, logo, links and post/photo relations as sender statements', () => {
  const request = {
    schema: 'website-opportunities/demo-request/v1',
    business: {
      name: 'Corner Cafe',
      category: 'restaurant',
      location: { lat: 21, lon: 105 },
      description: 'Coffee roasted here.',
      items: [
        {
          name: 'Coffee',
          price: '55',
          priceScale: 1000,
          currency: 'VND',
          size: 'Large',
          description: 'With milk',
          photo: 'https://img.example/coffee.jpg'
        }
      ]
    },
    photos: [{ url: 'https://img.example/coffee.jpg', caption: 'Coffee', alt: 'A cup' }],
    brand: {
      logo: 'https://img.example/logo.png',
      colors: [
        { hex: '#aa3300', role: 'primary' },
        { hex: '#ffffff', role: '' }
      ]
    },
    links: { menu: 'https://cafe.example/menu', booking: 'https://cafe.example/book' },
    posts: [
      {
        text: 'Fresh coffee today.',
        source: 'facebook',
        url: 'https://facebook.com/cafe/posts/1',
        photos: ['https://img.example/coffee.jpg']
      }
    ]
  }
  const doc = placeProfileFromDemoRequest(request)
  valid(doc)
  assert.deepEqual(doc.business.location.value, { latitude: 21, longitude: 105 })
  assert.equal(doc.offerings[0].value.description, 'With milk')
  assert.equal(doc.offerings[0].value.kind, 'dish')
  assert.deepEqual(doc.offerings[0].value.variants[0], {
    size: 'Large',
    price: { kind: 'exact', raw: '55', currency: 'VND', priceScale: 1000 }
  })
  assert.equal(
    doc.sources.every((s) => s.kind === 'sender-statement' && !s.ref),
    true
  )
  const photo = doc.media.find((m) => m.value.url === request.photos[0].url)
  assert.ok(photo.value.relations.some((r) => r.entityId === doc.offerings[0].id))
  assert.ok(
    photo.value.relations.some((r) => r.entityId === doc.quotes.find((q) => q.value.kind === 'post').id)
  )
  assert.equal(doc.media.find((m) => m.id === doc.brand.logo.value.mediaId).value.url, request.brand.logo)
  assert.equal(doc.links.find((l) => l.value.kind === 'booking').value.url, request.links.booking)
  assert.equal(doc.quotes.find((q) => q.value.kind === 'post').value.text, request.posts[0].text)
  assert.deepEqual(doc.quotes.find((q) => q.value.kind === 'post').value.attribution, {
    source: 'facebook',
    url: request.posts[0].url
  })
  assert.deepEqual(placeProfileFromDemoRequest(request), doc)
})

test('legacy fact ids follow the cited source while ignoring the deployment opportunity id', () => {
  const brief = buildBrief({
    opportunity: { id: 'local-one', name: 'Corner Cafe' },
    profile: {},
    sources: [],
    media: [],
    madeAt: '2026-10-26T00:00:00Z'
  })
  brief.sitemap[0].sections[0].evidence = [
    { source: 'website', url: 'https://cafe.example/about', quote: 'Coffee roasted here.' }
  ]
  const first = placeProfileFromBrief(brief)
  brief.opportunityId = 'local-two'
  assert.deepEqual(placeProfileFromBrief(brief), first)
  brief.sitemap[0].sections[0].evidence[0].url = 'https://cafe.example/story'
  assert.notEqual(placeProfileFromBrief(brief).quotes[0].id, first.quotes[0].id)
})

test('brief media and Google reviews retain their references, unrestricted for a demo, with no legacy approval', () => {
  const brief = buildBrief({
    opportunity: { name: 'Corner Cafe' },
    profile: {},
    sources: [],
    media: [{ id: 'logo', kind: 'image', category: 'other', sha256: 'a'.repeat(64) }],
    brand: {
      origin: 'website',
      colors: [{ hex: '#112233', role: '' }],
      fonts: ['Example Sans', ''],
      logo: 'logo'
    },
    googlePlace: {
      placeId: 'cafe',
      amenities: { outdoorSeating: true },
      summaries: {},
      reviews: [
        {
          author: 'Guest',
          text: 'Good coffee.',
          rating: 5,
          authorAvatarUrl: 'https://lh3.googleusercontent.com/guest'
        }
      ],
      attribution: 'Google'
    },
    madeAt: '2026-10-26T00:00:00Z'
  })
  const doc = placeProfileFromBrief(brief)
  valid(doc)
  assert.deepEqual(doc.brand.fonts.value, ['Example Sans'])
  const logo = doc.media.find((m) => m.id === doc.brand.logo.value.mediaId)
  assert.equal(logo.value.sha256, 'a'.repeat(64))
  assert.equal(logo.value.url, undefined, 'a brief asset has no public URL to invent')
  assert.equal(logo.value.relations[0].entityId, doc.business.id)
  const review = doc.quotes.find((q) => q.value.kind === 'review')
  assert.equal(review.value.text, 'Good coffee.')
  assert.equal(review.value.author, 'Guest')
  assert.deepEqual(review.value.restrictions, [], 'Google reviews may show on a demo')
  assert.equal(review.value.attribution.authorAvatarUrl, 'https://lh3.googleusercontent.com/guest')
  assert.equal(review.value.attribution.rating, 5)
})

test('a gym stays fitness and absent collections stay unresearched', () => {
  for (const doc of [
    placeProfileFromDemoRequest({
      schema: 'website-opportunities/demo-request/v1',
      business: { name: 'Town Gym', category: 'gym' }
    }),
    placeProfileFromBrief(
      buildBrief({
        opportunity: { name: 'Town Gym', candidate: { trade: 'fitness' } },
        profile: {},
        sources: [],
        media: [],
        madeAt: '2026-10-26T00:00:00Z'
      })
    )
  ]) {
    valid(doc)
    assert.equal(doc.classification.derivedCategories[0].value.code, 'fitness')
    assert.deepEqual(doc.offerings, [])
    assert.deepEqual(doc.people, [])
    assert.equal(doc.coverage.find((c) => c.target === 'people').status, 'not_researched')
  }
})

test('legacy adapters drop any address that is not http(s) instead of carrying it', () => {
  const doc = placeProfileFromDemoRequest({
    schema: 'website-opportunities/demo-request/v1',
    business: {
      name: 'Unsafe Cafe',
      website: 'javascript:alert(1)',
      socials: { facebook: 'tel:+15550100', instagram: 'https://instagram.com/unsafe' }
    },
    photos: [{ url: 'data:image/png;base64,AA' }],
    links: { menu: 'javascript:alert(2)' },
    posts: [{ text: 'Open late.', url: 'javascript:alert(3)', source: 'website' }]
  })
  valid(doc)
  assert.deepEqual(
    doc.links.map((l) => l.value.url),
    ['https://instagram.com/unsafe']
  )
  for (const scheme of ['javascript:', 'data:', 'tel:'])
    assert.equal(JSON.stringify(doc).includes(scheme), false)
})

test('a trade read from the sender category is a derivation from that category, not a sender statement', () => {
  const doc = placeProfileFromDemoRequest({
    schema: 'website-opportunities/demo-request/v1',
    business: { name: 'Town Gym', category: 'gym' }
  })
  valid(doc)
  const [input] = doc.classification.providerCategories
  const [trade] = doc.classification.derivedCategories
  assert.equal(trade.value.code, 'fitness')
  assert.deepEqual(trade.derivation.inputRefs, [input.id])
  assert.equal(trade.derivation.method, 'trade-from-category')
  assert.deepEqual(trade.evidenceRefs, input.evidenceRefs)
  assert.equal(
    doc.evidence.some((e) => e.locator.value === '$.classification.trade'),
    false,
    'no locator points at a place the sender never wrote'
  )
  const bare = placeProfileFromDemoRequest({
    schema: 'website-opportunities/demo-request/v1',
    business: { name: 'Corner Shop' }
  })
  valid(bare)
  assert.equal(bare.classification.derivedCategories[0].value.code, 'other')
  assert.deepEqual(bare.classification.derivedCategories[0].derivation.inputRefs, [])
  assert.equal(
    bare.evidence.some((e) => e.locator.value === '$.classification.trade'),
    false
  )
})

test('legacy adapters give a place that is not food services, not dishes; a restaurant keeps its dishes', () => {
  const brief = (trade) => ({
    business: { name: 'Town Place', ...(trade ? { trade } : {}) },
    sitemap: [
      {
        sections: [
          {
            menuItems: [{ name: 'Monthly pass', price: '500', source: { url: 'https://town.test/prices' } }]
          }
        ]
      }
    ]
  })
  const request = (category) => ({
    schema: 'website-opportunities/demo-request/v1',
    business: { name: 'Town Place', category, items: [{ name: 'Monthly pass', price: '500' }] }
  })
  for (const doc of [
    placeProfileFromBrief(brief('fitness')),
    placeProfileFromBrief(brief('beauty')),
    placeProfileFromDemoRequest(request('gym')),
    placeProfileFromDemoRequest(request('beauty'))
  ]) {
    valid(doc)
    assert.deepEqual(
      doc.offerings.map((o) => o.value.kind),
      ['service']
    )
  }
  for (const doc of [placeProfileFromBrief(brief()), placeProfileFromDemoRequest(request('restaurant'))]) {
    valid(doc)
    assert.equal(doc.classification.derivedCategories[0].value.code, 'food')
    assert.deepEqual(
      doc.offerings.map((o) => o.value.kind),
      ['dish']
    )
  }
})
