import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { menuItemsFromHtml, menuItemsFromPdfPages } from '../domain/menu-reader.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

const AT = '2026-10-26T10:00:00.000Z'
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
function restaurant() {
  const menuItems = menuItemsFromHtml(fixture('menu/menu-page.html'), {
    source: { url: 'https://phin.test/menu', kind: 'page' },
    collectedAt: AT
  })
  menuItems[0].photo = {
    mediaId: 'local-photo',
    status: 'accepted',
    how: 'menu-card',
    evidence: { quote: menuItems[0].name }
  }
  menuItems[1].photo = { mediaId: 'candidate-photo', status: 'candidate', how: 'caption' }
  menuItems[0].size = 'Large'
  menuItems[0].priceScale = 1000
  menuItems[2].currency = 'VND'
  menuItems[2].currencyAssumed = true
  return {
    identity: { namespace: 'google', externalId: 'phin-coffee', name: 'Brewlet Coffee' },
    madeAt: AT,
    profile: {
      name: 'Brewlet Coffee',
      menuItems,
      googlePlace: {
        primaryType: 'cafe',
        types: ['cafe', 'food'],
        reviews: [{ text: 'Lovely coffee.', author: 'Guest', publishTime: AT, language: 'en' }]
      }
    },
    sources: [
      {
        source: 'website',
        ref: 'https://phin.test',
        status: 'complete',
        collected: { profile: { name: 'Brewlet Coffee' } }
      },
      { source: 'menu-file', ref: 'https://phin.test/menu', status: 'complete' }
    ],
    media: [
      {
        id: 'local-photo',
        status: 'stored',
        kind: 'image',
        source: 'website',
        source_url: 'https://phin.test/coffee.jpg',
        sha256: 'coffee'
      },
      {
        id: 'candidate-photo',
        status: 'stored',
        kind: 'image',
        source: 'website',
        source_url: 'https://phin.test/egg.jpg',
        sha256: 'egg'
      }
    ],
    brand: {
      website: { origin: 'website', colors: [{ hex: '#123456', role: 'primary' }], fonts: ['Example Sans'] }
    },
    posts: JSON.parse(fixture('content-pool-posts.json'))['les-ombrine'].slice(0, 1)
  }
}
const valid = (doc) => assert.deepEqual(validatePlaceProfile(doc), { ok: true, errors: [] })
const coverage = (doc, target) => doc.coverage.find((c) => c.target === target).status

test('restaurant research preserves printed prices, sizes, brand, quotations and accepted dish photos', () => {
  const input = restaurant()
  const original = structuredClone(input)
  const doc = placeProfileFromResearch(input)
  valid(doc)
  assert.equal(doc.classification.derivedCategories[0].value.code, 'food')
  assert.deepEqual(doc.classification.providerCategories[0].value.types, ['cafe', 'food'])
  assert.deepEqual(
    doc.offerings.map((f) => f.value.name),
    input.profile.menuItems.map((i) => i.name)
  )
  assert.deepEqual(
    doc.offerings.map((f) => f.value.kind),
    ['drink', 'drink', 'dish', 'dish', 'dish']
  )
  assert.deepEqual(doc.offerings[0].value.variants[0], {
    size: 'Large',
    price: {
      kind: 'exact',
      raw: input.profile.menuItems[0].price,
      currency: input.profile.menuItems[0].currency,
      priceScale: 1000
    }
  })
  assert.equal(doc.offerings[2].value.variants[0].price.currency, undefined)
  assert.equal(doc.media[0].value.relations[0].entityId, doc.offerings[0].id)
  assert.deepEqual(doc.media[1].value.relations, [])
  assert.deepEqual(doc.brand.colors.value, input.brand.website.colors)
  assert.equal(doc.quotes.find((q) => q.value.kind === 'post').value.text, input.posts[0].caption)
  assert.deepEqual(doc.quotes.find((q) => q.value.kind === 'review').value.restrictions, [])
  assert.equal(coverage(doc, 'menu'), 'found')
  assert.equal(coverage(doc, 'people'), 'not_researched')
  assert.deepEqual(input, original)
  assert.equal(JSON.stringify(placeProfileFromResearch(input)), JSON.stringify(doc))
})

test('a gym keeps Google types, has no food fallback, and does not claim its prices or FAQs were searched', () => {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'gym' },
    profile: {
      name: 'Example Gym',
      googlePlace: { primaryType: 'gym', types: ['gym', 'health', 'establishment'] }
    },
    sources: [{ source: 'google-places', ref: 'gym', status: 'complete' }]
  })
  valid(doc)
  assert.equal(doc.classification.derivedCategories[0].value.code, 'fitness')
  assert.equal(doc.classification.derivedCategories[0].value.mappingVersion, 'tracy-trade/1')
  assert.deepEqual(doc.offerings, [])
  assert.equal(coverage(doc, 'prices'), 'not_researched')
  assert.equal(coverage(doc, 'faqs'), 'not_researched')
  const unknown = placeProfileFromResearch({
    identity: { namespace: 'url', externalId: 'https://example.test' }
  })
  valid(unknown)
  assert.equal(unknown.classification.derivedCategories[0].value.code, 'other')
  const spa = placeProfileFromResearch({ profile: { businessType: 'DaySpa' } })
  valid(spa)
  assert.equal(spa.classification.derivedCategories[0].value.code, 'beauty')
})

test('coverage distinguishes pending, unsuccessful searches, failures and blocked collectors', () => {
  for (const [row, expected] of [
    [{ status: 'pending' }, 'not_researched'],
    [{ status: 'complete' }, 'searched_not_found'],
    [{ status: 'blocked' }, 'blocked'],
    [{ status: 'failed', reason: 'timeout' }, 'failed'],
    [{ status: 'failed', reason: 'not_found' }, 'searched_not_found']
  ]) {
    const doc = placeProfileFromResearch({
      sources: [{ source: 'menu-file', ref: 'https://example.test/menu', ...row }]
    })
    valid(doc)
    assert.equal(coverage(doc, 'menu'), expected)
  }
})

test('ids survive deployment ids and revoked photos cannot retain dish or logo relations', () => {
  const input = restaurant()
  const first = placeProfileFromResearch(input)
  input.identity.id = 'another-local-place'
  input.snapshot = { id: 'another-local-snapshot' }
  input.media[0].id = 'imported-photo'
  input.profile.menuItems[0].photo.mediaId = 'imported-photo'
  const second = placeProfileFromResearch(input)
  assert.equal(JSON.stringify(second), JSON.stringify(first))
  input.media[0].revoked_at = AT
  input.brand.logoResearch = { chosen: { mediaId: 'imported-photo', url: input.media[0].source_url } }
  const revoked = placeProfileFromResearch(input)
  valid(revoked)
  assert.equal(revoked.media.length, 1)
  assert.equal(revoked.brand.logo, undefined)
})

test('each PDF menu item cites its own excerpt even when several prices share one page', () => {
  const items = menuItemsFromPdfPages(JSON.parse(fixture('menu/two-column-sizes.layout.json')), {
    source: { url: 'https://example.test/menu.pdf', kind: 'pdf' },
    collectedAt: AT
  })
  const doc = placeProfileFromResearch({ profile: { menuItems: items } })
  valid(doc)
  for (const [i, offering] of doc.offerings.entries()) {
    const evidence = doc.evidence.find((e) => e.id === offering.evidenceRefs[0])
    assert.equal(evidence.locator.kind, 'pdfPage')
    assert.equal(evidence.excerpt, `${items[i].name} — ${items[i].price}`)
  }
})

test('research conflicts retain competing observations without producing an approved value', () => {
  const doc = placeProfileFromResearch({
    profile: {
      name: 'Example',
      phone: '+1 111',
      evidence: {
        phone: [
          { value: '+1 111', sources: ['website'] },
          { value: '+1 222', sources: ['facebook'] }
        ]
      },
      hours: ['Mon 9-5'],
      hoursBySource: { website: ['Mon 9-5'], facebook: ['Mon 10-5'] },
      hoursConflict: true,
      menuItems: [
        {
          name: 'Coffee',
          price: null,
          priceConflict: true,
          otherPrices: [
            { price: '20', mediaId: 'old-local-id', priceScale: 1000 },
            { price: '25', mediaId: 'new-local-id' }
          ]
        }
      ]
    }
  })
  valid(doc)
  assert.equal(doc.conflicts.length, 3)
  assert.deepEqual(
    doc.conflicts.find((c) => c.target === 'business.phone').values.map((f) => f.value),
    ['+1 111', '+1 222']
  )
  assert.equal(coverage(doc, 'hours'), 'partial')
  assert.equal(doc.offerings[0].value.variants[0].price.kind, 'unknown')
  assert.equal(JSON.stringify(doc).includes('old-local-id'), false)
})

test('source posts are not doubled when also read explicitly, even without a provider post id', () => {
  const posts = [{ source: 'website', caption: 'Classes this week.' }]
  const doc = placeProfileFromResearch({
    posts,
    sources: [{ source: 'website', status: 'complete', ref: 'https://example.test', collected: { posts } }]
  })
  valid(doc)
  assert.equal(doc.quotes.length, 1)
})

test('classifications do not conflate a website schema type with Google types on the candidate', () => {
  const doc = placeProfileFromResearch({
    identity: {
      provider: 'google-places',
      providerId: 'example-gym',
      candidate: { primaryType: 'gym', types: ['gym', 'health'] }
    },
    profile: { businessType: 'ExerciseGym' }
  })
  valid(doc)
  assert.equal(doc.classification.derivedCategories[0].value.code, 'fitness')
  assert.equal(doc.classification.providerCategories.length, 2)
  const googleFact = doc.classification.providerCategories.find((f) => f.value.provider === 'google')
  assert.equal(
    doc.evidence.find((e) => e.id === googleFact.evidenceRefs[0]).locator.value,
    '$.identity.candidate.types'
  )
})

test('a primary type alone still determines the trade, and fallback names cite their actual input', () => {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'studio', name: 'Example Studio' },
    profile: { googlePlace: { primaryType: 'gym' } }
  })
  valid(doc)
  assert.equal(doc.classification.derivedCategories[0].value.code, 'fitness')
  const evidence = doc.evidence.find((e) => e.id === doc.business.name.evidenceRefs[0])
  assert.equal(evidence.locator.value, '$.identity.name')
})

test('platform counts retain their scope and a known earlier price remains a conflicting observation', () => {
  const doc = placeProfileFromResearch({
    profile: {
      reviewSources: { googleMaps: { url: 'https://maps.example/place', rating: 4.5, reviewCount: 120 } },
      menuItems: [{ name: 'Coffee', price: '25', otherPrices: [{ price: '20', priceScale: 1000 }] }]
    }
  })
  valid(doc)
  assert.deepEqual(
    doc.claims.statistics.map((f) => [f.value.label, f.value.amount, f.value.scope]),
    [
      ['rating', 4.5, 'https://maps.example/place'],
      ['reviewCount', 120, 'https://maps.example/place']
    ]
  )
  assert.deepEqual(
    doc.conflicts[0].values.map((f) => f.value.price),
    ['25', '20']
  )
})

test('research addresses that are not http(s) never become links, refs, media or attributions', () => {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'unsafe', name: 'Unsafe Cafe' },
    profile: {
      name: 'Unsafe Cafe',
      website: 'javascript:alert(1)',
      socials: { facebook: 'javascript:alert(2)', instagram: 'https://instagram.com/unsafe' },
      menus: [{ url: 'tel:+15550100', source: 'website' }],
      booking: [{ url: 'data:text/html,hi', source: 'website' }],
      reviewSources: {
        tripadvisor: {
          url: 'javascript:alert(3)',
          reviews: [{ text: 'Fine.', authorUri: 'javascript:alert(4)', url: 'https://ta.test/r/1' }]
        }
      }
    },
    posts: [{ source: 'website', url: 'javascript:alert(5)', text: 'Open late.' }],
    media: [
      { id: 'm', status: 'stored', kind: 'image', source: 'website', source_url: 'data:image/png;base64,AA' }
    ]
  })
  assert.deepEqual(validatePlaceProfile(doc), { ok: true, errors: [] })
  assert.deepEqual(
    doc.links.map((l) => l.value.url),
    // The one http(s) link, as Tracy keeps a social profile (#1780 item 10).
    ['https://www.instagram.com/unsafe/']
  )
  assert.equal(JSON.stringify(doc).includes('javascript:'), false)
  assert.equal(JSON.stringify(doc).includes('data:'), false)
  assert.equal(JSON.stringify(doc).includes('tel:'), false)
})

test('a merged value cites the source that stated it, or says plainly that none was kept', () => {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'merged', name: 'Merged Cafe' },
    profile: {
      name: 'Merged Cafe',
      phone: '+1 555 0100',
      address: '1 Main Street',
      hours: ['Mon 8-17'],
      hoursBySource: { facebook: ['Mon 8-17'] },
      evidence: { name: [{ value: 'Merged Cafe', sources: ['instagram'] }] }
    },
    sources: [
      {
        source: 'website',
        ref: 'https://merged.test',
        status: 'complete',
        collected: { profile: { phone: '+1 555 0100' } }
      }
    ]
  })
  valid(doc)
  const sourceOf = (f) => {
    const evidence = doc.evidence.find((e) => e.id === f.evidenceRefs[0])
    return { source: doc.sources.find((s) => s.id === evidence.sourceId), evidence }
  }
  assert.equal(sourceOf(doc.business.name).source.kind, 'instagram')
  assert.deepEqual(
    [sourceOf(doc.business.phone).source.kind, sourceOf(doc.business.phone).source.ref],
    ['website', 'https://merged.test']
  )
  assert.equal(sourceOf(doc.business.hours).source.kind, 'facebook')
  const address = sourceOf(doc.business.address)
  assert.equal(address.source.kind, 'research-merged')
  assert.ok(address.source.reason)
  assert.equal(address.evidence.extraction.method, 'merged-without-provenance')
  assert.equal(
    doc.sources.some((s) => s.kind === 'research'),
    false,
    'no business fact hides behind a generic research source'
  )
})

test('ratings and review counts from review sites carry no demo restriction, like every other statistic', () => {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'rated', name: 'Rated Cafe' },
    profile: {
      name: 'Rated Cafe',
      reviewSources: {
        googleMaps: { url: 'https://maps.google.com/?cid=1', rating: 4.6, reviewCount: 210 },
        tripadvisor: { url: 'https://tripadvisor.test/r', rating: 4.5, reviewCount: 88 }
      }
    },
    sources: [
      {
        source: 'tripadvisor',
        ref: 'https://tripadvisor.test/r',
        status: 'complete',
        collected: { profile: { rating: 4.5 } }
      },
      {
        source: 'facebook',
        ref: 'https://facebook.com/rated',
        status: 'complete',
        collected: { profile: { followers: 900 } }
      }
    ]
  })
  valid(doc)
  const byLabel = (scope, label) =>
    doc.claims.statistics.find((f) => f.value.scope === scope && f.value.label === label)
  for (const [scope, label] of [
    ['https://maps.google.com/?cid=1', 'rating'],
    ['https://maps.google.com/?cid=1', 'reviewCount'],
    ['https://tripadvisor.test/r', 'rating'],
    ['https://tripadvisor.test/r', 'reviewCount']
  ])
    assert.deepEqual(byLabel(scope, label).value.restrictions, [], `${scope} ${label}`)
  assert.deepEqual(byLabel('https://facebook.com/rated', 'followers').value.restrictions, [])
})

test('a place that is not food offers services, not dishes: a gym’s passes and a spa’s treatments', () => {
  const gym = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'iron-gym' },
    profile: {
      name: 'Iron Gym',
      googlePlace: { primaryType: 'gym', types: ['gym'] },
      menuItems: [
        {
          name: 'Monthly pass',
          price: '500',
          section: 'Memberships',
          source: { url: 'https://iron.test/prices' }
        },
        {
          name: 'Protein shake',
          price: '60',
          section: 'Drinks',
          source: { url: 'https://iron.test/prices' }
        },
        { name: 'Yoga', kind: 'class', source: { url: 'https://iron.test/prices' } }
      ]
    }
  })
  valid(gym)
  assert.equal(gym.classification.derivedCategories[0].value.code, 'fitness')
  assert.deepEqual(
    gym.offerings.map((o) => [o.value.name, o.value.kind]),
    [
      ['Monthly pass', 'service'],
      ['Protein shake', 'service'],
      ['Yoga', 'class']
    ]
  )
  const spa = placeProfileFromResearch({
    profile: {
      businessType: 'DaySpa',
      menuItems: [{ name: 'Hot stone massage', price: '400', source: { url: 'https://spa.test/menu' } }]
    }
  })
  valid(spa)
  assert.equal(spa.classification.derivedCategories[0].value.code, 'beauty')
  assert.deepEqual(
    spa.offerings.map((o) => o.value.kind),
    ['service']
  )
})
