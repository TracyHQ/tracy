import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeFactsFromDetails } from '../../../packages/wo/website-opportunities/domain/gplaces-details.mjs'
import {
  buildQualityDossier,
  checkClaimRefs,
  deterministicFacts,
  qualityHash,
  validateFact
} from '../src/opportunities-build/quality-dossier.js'
import { qualitySourceInput, qualitySourcesOf } from '../src/opportunities-build/quality-sources.js'

test('frozen place sources retain provenance, exclude generated bios/reviews and scope private overlays', () => {
  const input = {
    account_id: 'a',
    place_snapshot_id: 'snapshot',
    overlay: { branch: 'main', candidate: { phone: '+84 235 555 0172' } },
    profile_effective: {
      bio: 'Happy hour 7AM to 10PM',
      googlePlace: { internationalPhoneNumber: '+84 235 555 0171', reviews: [{ text: 'Open 24 hours' }] }
    },
    raw_sources: [
      {
        source: 'website',
        ref: 'https://example.test',
        status: 'complete',
        shared: true,
        updated_at: '2026-10-20T00:00:00Z',
        collected: {
          pages: [
            { url: 'https://example.test/menu', text: 'Coffee and sandwiches.' },
            { url: 'https://reviews.test', text: 'Open 24 hours' }
          ]
        }
      },
      {
        source: 'instagram',
        ref: 'https://instagram.com/own',
        status: 'partial',
        shared: false,
        collected: {
          profile: { bio: 'Wrong generated hours' },
          posts: [
            { id: 'own', caption: 'Open daily from 7AM to 10PM.', postedAt: '2020-01-01' },
            { id: 'review', caption: 'Best restaurant', isReview: true }
          ]
        }
      },
      {
        source: 'website',
        ref: 'https://blocked.test',
        status: 'blocked',
        collected: { pages: [{ url: 'https://blocked.test', text: 'No evidence' }] }
      }
    ]
  }
  const sources = qualitySourcesOf(input)
  assert.equal(sources.length, 4)
  assert.equal(sources.find((s) => s.id === 'post:instagram:own').accountId, 'a')
  assert.equal(sources.find((s) => s.id === 'post:instagram:own').postedAt, '2020-01-01T00:00:00.000Z')
  assert.ok(sources.every((s) => !s.body.includes('24 hours') && !s.body.includes('Wrong generated')))
  const d = buildQualityDossier({
    accountId: 'a',
    snapshotId: 'snapshot',
    sources,
    proposals: deterministicFacts(sources),
    at: '2026-10-20T00:00:00Z'
  })
  assert.equal(d.conflicts.length, 1)
  assert.ok(d.facts.filter((f) => f.type === 'phone').every((f) => f.status === 'conflicted'))
  assert.throws(
    () => buildQualityDossier({ accountId: 'b', sources, at: '2026-10-20T00:00:00Z' }),
    /QUALITY_SOURCE_SCOPE/
  )
})

test('an extracted profile contact stays pending and contradictory contacts withhold the public claim', () => {
  const frozen = {
    account_id: 'a',
    raw_sources: [
      {
        source: 'website',
        ref: 'https://example.test',
        status: 'complete',
        collected: {
          profile: { phone: '+84 235 555 0172', address: 'Unverified address', bio: 'Open 24 hours' },
          pages: [{ url: 'https://example.test/contact', text: 'Call +84 235 555 0171.' }]
        }
      }
    ]
  }
  const sources = qualitySourcesOf(frozen)
  const dossier = buildQualityDossier({
    accountId: 'a',
    sources,
    proposals: deterministicFacts(sources),
    at: '2026-10-20T00:00:00Z'
  })
  assert.equal(dossier.conflicts.length, 1)
  assert.ok(dossier.facts.filter((f) => f.type === 'phone').every((f) => f.status === 'conflicted'))
  assert.equal(dossier.facts.find((f) => f.type === 'address').reason, 'PROFILE_PROVENANCE_PENDING')
  assert.ok(dossier.missing.includes('phone'))
  assert.ok(sources.every((s) => !s.body.includes('24 hours')))
  const profileOnly = sources.filter((s) => s.kind === 'collected-profile')
  const pending = buildQualityDossier({
    accountId: 'a',
    sources: profileOnly,
    proposals: deterministicFacts(profileOnly),
    at: '2026-10-20T00:00:00Z'
  })
  assert.ok(pending.facts.length >= 2)
  assert.ok(pending.facts.every((f) => f.status === 'unknown' && f.reason === 'PROFILE_PROVENANCE_PENDING'))
})

const fetchedAt = '2026-10-20T09:15:00.000Z'
const listingInput = (googlePlace) => ({
  account_id: 'listing-account',
  place_snapshot_id: 'published-listing-snapshot',
  overlay: { branch: 'riverfront' },
  profile_effective: { googlePlace },
  raw_sources: []
})

test('the actual Google producer output retains exact phone, address, website and weekly hours with frozen provenance', () => {
  const raw = {
    id: 'ChIJfixture',
    displayName: { text: 'Riverfront Cafe' },
    websiteUri: 'https://riverfront.example/',
    internationalPhoneNumber: '+84 235 555 0171',
    formattedAddress: '12 Bach Dang, Hoi An, Vietnam',
    addressComponents: [{ longText: 'A component is not a source-exact postal address', types: ['route'] }],
    regularOpeningHours: {
      weekdayDescriptions: ['Monday: 7:00 AM – 10:00 PM', 'Tuesday: 8:00 AM – 11:00 PM', 'Wednesday: Closed']
    },
    editorialSummary: { text: 'Happy hour 2PM to 6PM.' },
    generativeSummary: { overview: { text: 'Open 24 hours with free food.' } },
    reviewSummary: { text: { text: 'Call +84 999 999 999.' } },
    reviews: [{ text: { text: 'The cafe never closes.' }, authorAttribution: { displayName: 'A guest' } }]
  }
  const producer = placeFactsFromDetails(raw, { now: () => new Date(fetchedAt) })
  const frozen = listingInput(producer),
    before = structuredClone(frozen)
  const sources = qualitySourcesOf(frozen),
    listing = sources.find((s) => s.kind === 'business-listing')
  assert.deepEqual(listing.structuredFacts, [
    { type: 'name', value: 'Riverfront Cafe' },
    { type: 'phone', value: '+84 235 555 0171' },
    { type: 'address', value: '12 Bach Dang, Hoi An, Vietnam' },
    { type: 'website', value: 'https://riverfront.example/' },
    { type: 'opening-hours', value: producer.openingHours.join('\n') }
  ])
  assert.equal(
    listing.body,
    `name: Riverfront Cafe\n\nphone: +84 235 555 0171\n\naddress: 12 Bach Dang, Hoi An, Vietnam\n\nwebsite: https://riverfront.example/\n\nopening-hours: ${producer.openingHours.join('\n')}`
  )
  assert.equal(listing.observedAt, fetchedAt)
  assert.equal(listing.snapshotId, frozen.place_snapshot_id)
  assert.equal(listing.accountId, frozen.account_id)
  assert.equal(listing.branch, 'riverfront')
  assert.ok(listing.structuredFacts.every((fact) => listing.body.includes(fact.value)))
  assert.ok(
    qualitySourceInput(sources)[0].spans.every(
      (span) => listing.body.slice(span.start, span.end) === span.text
    )
  )
  assert.deepEqual(frozen, before)
  const dossier = buildQualityDossier({
    accountId: frozen.account_id,
    snapshotId: frozen.place_snapshot_id,
    sources,
    proposals: deterministicFacts(sources),
    at: fetchedAt
  })
  const hours = dossier.facts.filter((f) => f.type === 'opening-hours' && f.status === 'supported')
  assert.equal(hours.length, 1)
  assert.equal(hours[0].value, producer.openingHours.join('\n'))
  assert.equal(dossier.conflicts.length, 0)
  assert.equal(
    dossier.facts.some((f) => f.type === 'promotion'),
    false
  )
  assert.equal(
    checkClaimRefs(
      [{ id: hours[0].id, type: 'promotion', branch: hours[0].branch, value: hours[0].value }],
      dossier
    ).ok,
    false
  )
  assert.throws(
    () => buildQualityDossier({ accountId: 'other-account', sources, at: fetchedAt }),
    /QUALITY_SOURCE_SCOPE/
  )
})

test('raw Google fields stay compatible without turning the resource name or address components into facts', () => {
  const frozen = listingInput({
    name: 'places/ChIJraw',
    displayName: { text: 'Raw Cafe' },
    websiteUri: 'https://raw.example/',
    internationalPhoneNumber: '+84 235 555 0171',
    formattedAddress: '12 River Road',
    addressComponents: [{ longText: 'Not an address' }],
    regularOpeningHours: { weekdayDescriptions: ['Friday: 9:00 AM – 10:00 PM', 'Saturday: Closed'] },
    observedAt: '2026-10-20T16:15:00+07:00',
    reviews: [{ text: 'Free drinks all day' }]
  })
  const [source] = qualitySourcesOf(frozen)
  assert.deepEqual(source.structuredFacts, [
    { type: 'name', value: 'Raw Cafe' },
    { type: 'phone', value: '+84 235 555 0171' },
    { type: 'address', value: '12 River Road' },
    { type: 'website', value: 'https://raw.example/' },
    { type: 'opening-hours', value: 'Friday: 9:00 AM – 10:00 PM\nSaturday: Closed' }
  ])
  assert.equal(source.observedAt, fetchedAt)
  assert.equal(source.body.includes('places/ChIJraw'), false)
  assert.equal(source.body.includes('Not an address'), false)
  assert.equal(source.body.includes('Free drinks'), false)
})

test('listing summaries, reviews and surrounding profile or overlay values never supply Google contacts or hours', () => {
  const frozen = listingInput({
    name: 'Sparse Cafe',
    fetchedAt,
    addressComponents: [{ longText: 'Unproven street' }],
    summaries: { editorial: 'Open 24 hours', generative: 'Call +84 999 999 999' },
    reviews: [{ text: 'Happy hour 2PM to 6PM' }],
    editorialSummary: { text: 'Opening hours are 24 hours' },
    regularOpeningHours: { openNow: true }
  })
  frozen.profile_effective.phone = '+84 888 888 888'
  frozen.profile_effective.address = 'Aggregated profile address'
  frozen.profile_effective.openingHours = ['Unproven profile hours']
  frozen.overlay.candidate = { phone: '+84 777 777 777', address: 'Private account address' }
  const listing = qualitySourcesOf(frozen).find((s) => s.kind === 'business-listing')
  assert.deepEqual(listing.structuredFacts, [{ type: 'name', value: 'Sparse Cafe' }])
  assert.equal(listing.body, 'name: Sparse Cafe')
})

test('a promotion put in an opening-hours field cannot become supported opening hours or a current promotion', () => {
  const sources = qualitySourcesOf(
    listingInput({ name: 'Cafe', openingHours: ['Happy hour 2PM to 6PM.'], fetchedAt })
  )
  const proposals = deterministicFacts(sources)
  assert.ok(proposals.some((p) => p.type === 'opening-hours'))
  for (const proposal of proposals.filter((p) => p.type === 'opening-hours' || p.type === 'promotion'))
    assert.equal(validateFact(proposal, sources, fetchedAt).fact.status, 'unknown')
})

test('malformed collection timestamps remain unknown instead of using another field or a normalized rollover', () => {
  for (const malformed of [
    null,
    42,
    {},
    [],
    'not a timestamp',
    '2026-10-20',
    '2026-02-30T09:15:00Z',
    '2026-10-20T24:00:00Z',
    '2026-10-20T09:15:00+99:00'
  ]) {
    const [listing] = qualitySourcesOf(
      listingInput({ name: 'Cafe', fetchedAt: malformed, observedAt: fetchedAt })
    )
    assert.equal(listing.observedAt, null)
  }
  const [valid] = qualitySourcesOf(
    listingInput({ name: 'Cafe', fetchedAt, observedAt: '1999-01-01T00:00:00Z' })
  )
  assert.equal(valid.observedAt, fetchedAt)
})

test('malformed normalized hours cannot fall back to another object or synthesized text', () => {
  for (const openingHours of [null, 'Monday: 7AM to 10PM', {}, [null, 42, {}, ' ']]) {
    const [listing] = qualitySourcesOf(
      listingInput({
        name: 'Cafe',
        openingHours,
        regularOpeningHours: { weekdayDescriptions: ['Wrong fallback hours'] },
        fetchedAt
      })
    )
    assert.deepEqual(listing.structuredFacts, [{ type: 'name', value: 'Cafe' }])
  }
})

test('the Hill-shaped no-listing fixture preserves its pre-adapter frozen source payload', () => {
  const frozen = {
    account_id: '4131ddca-aa1c-4af3-a167-d06a68f2ad0b',
    place_snapshot_id: '3114b2f1-c519-415b-a2c0-8dd4fc1e85c4',
    overlay: { branch: 'hoi-an', candidate: { phone: '+84 235 555 0172' } },
    profile_effective: {
      name: 'The Larch House',
      bio: 'Happy hour 7AM to 10PM',
      openingHours: ['unproven profile hours'],
      address: 'Unproven profile address'
    },
    raw_sources: [
      {
        source: 'website',
        ref: 'https://www.thelarchhouse.example/',
        status: 'complete',
        shared: true,
        updated_at: '2026-10-20T00:00:00Z',
        collected: {
          pages: [
            {
              url: 'https://www.thelarchhouse.example/contact',
              title: 'Contact',
              text: 'Open daily from 7AM to 10PM.\n\nCall +84 235 555 0171.'
            }
          ]
        }
      },
      {
        source: 'instagram',
        ref: 'https://instagram.com/larchhouse',
        status: 'partial',
        shared: false,
        updated_at: '2026-10-19T00:00:00Z',
        collected: { posts: [{ id: 'own-hill', caption: 'Happy hour 2PM to 6PM.', postedAt: '2020-01-01' }] }
      }
    ]
  }
  const sources = qualitySourcesOf(frozen)
  assert.equal(qualityHash(sources), '1bb31f87fd2792aef0b20c6962dfc120e6d7678b8efa0b56aa1a9981cc6440e4')
  assert.equal(
    sources.some((s) => s.kind === 'business-listing'),
    false
  )
})

test('Google opening hours stay out of the sources when the brief marks the hours as conflicting', () => {
  const frozen = listingInput({
    displayName: { text: 'Tin Lantern' },
    internationalPhoneNumber: '+84 235 555 0171',
    regularOpeningHours: { weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM'] },
    observedAt: '2026-10-20T16:15:00+07:00'
  })
  // The brief left the hours out: Google says 09:00–17:00, Facebook "until 12".
  frozen.brief = {
    ...frozen.brief,
    missing: [{ field: 'hours', conflicting: [{ source: 'google' }, { source: 'facebook' }] }]
  }
  const [source] = qualitySourcesOf(frozen)
  assert.deepEqual(
    source.structuredFacts.map((f) => f.type),
    ['name', 'phone']
  )
  assert.equal(source.body.includes('Monday'), false)
  frozen.brief.missing = [{ field: 'email' }]
  assert.ok(qualitySourcesOf(frozen)[0].structuredFacts.some((f) => f.type === 'opening-hours'))
})

test('a collected review is a testimonial source, word for word with its author and platform, and never a fact about the business (product owner, 26/10/2026)', () => {
  const sources = qualitySourcesOf({
    account_id: 'a',
    place_snapshot_id: 'snapshot',
    overlay: { branch: 'main' },
    profile_effective: {
      googlePlace: {
        reviews: [
          {
            text: 'Open 24 hours and the pho is perfect.',
            author: 'Lan',
            googleMapsUri: 'https://maps.test/r1'
          },
          { text: 'No author, no source.' }
        ]
      },
      reviewSources: {
        tripadvisor: {
          attribution: 'TripAdvisor',
          reviews: [
            {
              id: 't1',
              source: 'tripadvisor',
              text: 'Superb broth.',
              author: 'Ben',
              url: 'https://ta.test/t1'
            }
          ]
        }
      }
    },
    raw_sources: []
  })
  const reviews = sources.filter((s) => s.kind === 'review')
  assert.deepEqual(reviews.map((s) => [s.body, s.author, s.provider, s.url]).sort(), [
    ['Open 24 hours and the pho is perfect.', 'Lan', 'Google Reviews', 'https://maps.test/r1'],
    ['Superb broth.', 'Ben', 'TripAdvisor', 'https://ta.test/t1']
  ])
  const review = reviews.find((s) => s.author === 'Lan')
  const checked = validateFact(
    {
      type: 'opening-hours',
      value: 'Open 24 hours',
      branch: 'main',
      sourceRefs: [{ sourceId: review.id, start: 0, end: review.body.length, quote: review.body }]
    },
    sources,
    '2026-10-26T00:00:00Z'
  )
  assert.ok(checked.errors.includes('FACT_AUTHORSHIP'), JSON.stringify(checked.errors))
})
