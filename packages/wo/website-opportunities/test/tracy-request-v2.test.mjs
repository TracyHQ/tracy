import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toDemoRequestV2, toLegacyDemoRequest } from '../src/plugins/builders/tracy-request.js'
import { validateDemoRequest } from '../domain/demo-request.mjs'

test('v2 reads full research, keeping menu provenance, original posts and only fetchable media', () => {
  const media = Array.from({ length: 27 }, (_, i) => ({
    id: `photo-${i}`,
    kind: 'image',
    source: 'website',
    sourceUrl: `https://img.example/${i}.jpg`
  }))
  media.push({ id: 'private', kind: 'image', sourceUrl: 'https://localhost/private.jpg' })
  const rows = {
    profile: {
      name: 'Town Gym',
      bio: 'Train here.',
      googlePlace: { primaryType: 'gym' },
      menuItems: [
        {
          name: 'Juice',
          price: '55',
          priceScale: 1000,
          source: { kind: 'page', url: 'https://gym.example/menu' },
          photo: { status: 'accepted', assetId: 'photo-26' }
        }
      ]
    },
    brand: {
      website: { colors: [{ hex: '#112233', role: 'primary' }] },
      logoResearch: { chosen: { mediaId: 'photo-25' } }
    },
    rawSources: [{ source: 'website', ref: 'https://gym.example', status: 'complete', collected: {} }],
    posts: [{ source: 'website', url: 'https://gym.example/news', text: 'New class on Monday.' }]
  }
  const brief = {
    business: { name: 'Town Gym' },
    assets: media.map((m) => ({ id: m.id, kind: m.kind })),
    sitemap: []
  }
  const request = toDemoRequestV2(
    { name: 'Town Gym', provider: 'google', providerId: 'gym' },
    brief,
    { cms: 'joomla', template: { quickstart: 'tracy-base/j6' } },
    media,
    rows
  )
  assert.equal(validateDemoRequest(request).ok, true, JSON.stringify(validateDemoRequest(request)))
  assert.equal(request.profile.classification.derivedCategories[0].value.code, 'fitness')
  assert.equal(request.profile.offerings[0].value.variants[0].price.priceScale, 1000)
  assert.equal(request.photos.length, 24)
  assert.ok(request.photos.some((p) => p.url === media[26].sourceUrl))
  assert.ok(request.photos.some((p) => p.url === media[25].sourceUrl))
  assert.ok(request.profile.quotes.some((q) => q.value.text === 'New class on Monday.'))
  assert.ok(
    request.profile.evidence.some(
      (e) => request.profile.sources.find((s) => s.id === e.sourceId)?.ref === 'https://gym.example/menu'
    )
  )
  assert.equal(
    request.profile.media.some((m) => m.value.url?.includes('localhost')),
    false
  )
  assert.equal(request.profile.brand.logo.value.url, media[25].sourceUrl)
  const legacy = toLegacyDemoRequest(request)
  assert.equal(validateDemoRequest(legacy).ok, true, JSON.stringify(validateDemoRequest(legacy)))
  assert.equal(legacy.business.name, 'Town Gym')
  assert.equal(legacy.business.category, 'fitness')
  assert.equal(legacy.business.items[0].price, undefined, 'an old host must not read 55 as the full price')
  assert.equal(legacy.business.items[0].name, 'Juice')
  assert.deepEqual(legacy.template, request.template)
  assert.deepEqual(legacy.photos, request.photos)
})

test('v2 can send an unresearched place and leaves nameless places unsent', () => {
  const request = toDemoRequestV2({ name: 'Corner Cafe', candidate: { address: '1 Main Street' } }, null)
  assert.equal(validateDemoRequest(request).ok, true)
  assert.equal(request.profile.business.name.value, 'Corner Cafe')
  assert.equal(request.profile.business.address.value, '1 Main Street')
  assert.equal(toDemoRequestV2({}, null), null)
})

test('a place with more research than v2 holds is cut to the limits, priced dishes first, and keeps no reviews', () => {
  const menuItems = Array.from({ length: 260 }, (_, i) => ({
    name: `Dish ${i}`,
    ...(i % 2 ? { price: String(10 + i) } : {}),
    source: { kind: 'page', url: 'https://cafe.example/menu' }
  }))
  const reviews = Array.from({ length: 101 }, (_, i) => ({
    text: `Review ${i}`,
    author: `Reviewer ${i}`,
    authorUri: `https://maps.example/contrib/${i}`
  }))
  const posts = Array.from({ length: 130 }, (_, i) => ({
    source: 'website',
    url: `https://cafe.example/news/${i}`,
    text: `Post ${i}`
  }))
  const rows = {
    profile: { name: 'Busy Cafe', googlePlace: { primaryType: 'cafe', reviews }, menuItems },
    posts
  }
  const request = toDemoRequestV2(
    { name: 'Busy Cafe', provider: 'google', providerId: 'busy' },
    null,
    {},
    [],
    rows
  )
  const checked = validateDemoRequest(request)
  assert.equal(checked.ok, true, JSON.stringify(checked.errors))
  assert.equal(request.profile.offerings.length, 200)
  const names = request.profile.offerings.map((f) => f.value.name)
  const priced = menuItems.filter((i) => i.price).map((i) => i.name)
  for (const name of priced) assert.ok(names.includes(name), `${name} has a price and is kept`)
  assert.deepEqual(
    names,
    menuItems.map((i) => i.name).filter((n) => names.includes(n)),
    'the profile order stays'
  )
  assert.equal(request.profile.quotes.length, 100)
  assert.equal(
    request.profile.quotes.some((q) => q.value.kind === 'review'),
    false
  )
  const body = JSON.stringify(request)
  for (const leak of ['Reviewer 0', 'maps.example/contrib', 'Review 0'])
    assert.equal(body.includes(leak), false, leak)
  const cover = (target) => request.profile.coverage.find((c) => c.target === target)
  assert.equal(cover('offerings').status, 'partial')
  assert.match(cover('offerings').reason, /200 of 260/)
  assert.equal(cover('quotes').status, 'partial')
  assert.deepEqual(
    toDemoRequestV2({ name: 'Busy Cafe', provider: 'google', providerId: 'busy' }, null, {}, [], rows),
    request,
    'the cut is deterministic'
  )
})
