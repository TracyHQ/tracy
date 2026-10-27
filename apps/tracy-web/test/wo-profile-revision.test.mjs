import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { canonicalJson } from 'website-opportunities/src/canonical-json.js'
import { placeProfileFromDemoRequest } from 'website-opportunities/domain/place-profile-from-demo-request.mjs'
import { placeProfileFromResearch } from 'website-opportunities/domain/place-profile-from-research.mjs'
import { freezePlaceProfile, freezePlaceProfileOrNull } from '../src/opportunities-build/profile-revision.js'
import { snapshotRequest } from '../src/opportunities-build/public-demo-profile.js'

const at = '2026-10-26T12:00:00.000Z'
const legacy = () => ({
  schema: 'website-opportunities/demo-request/v1',
  business: {
    name: 'North Studio',
    category: 'fitness',
    phone: '+1 555 0100',
    location: { lat: 25.2, lon: 55.3 },
    hours: ['Monday 09:00–17:00'],
    website: 'https://studio.example',
    description: 'Training in small groups.',
    items: [
      {
        name: 'Training session',
        price: '40',
        currency: 'USD',
        size: '60 minutes',
        photo: 'https://images.example/studio.jpg'
      }
    ]
  },
  photos: [{ url: 'https://images.example/studio.jpg' }, { url: 'https://images.example/logo.png' }],
  brand: { logo: 'https://images.example/logo.png', colors: [{ hex: '#123456' }] },
  links: { menu: 'https://studio.example/services', booking: 'https://studio.example/book' },
  posts: [
    {
      text: 'The studio is open.',
      url: 'https://studio.example/news',
      photos: ['https://images.example/studio.jpg']
    }
  ],
  cms: 'wordpress'
})
const v2 = () => {
  const request = legacy()
  return {
    schema: 'website-opportunities/demo-request/v2',
    profile: placeProfileFromDemoRequest(request),
    photos: request.photos,
    cms: request.cms
  }
}

test('the sender profile is kept exactly; metadata and host assessment name its canonical hash', () => {
  const request = v2()
  const frozen = freezePlaceProfile({ request, at })
  assert.deepEqual(frozen.profile, request.profile)
  assert.equal(frozen.profileSchemaVersion, '1.0.0')
  assert.equal(frozen.converterVersion, 'place-profile/1')
  assert.equal(frozen.origin, 'sender')
  assert.equal(frozen.profileHash, createHash('sha256').update(canonicalJson(request.profile)).digest('hex'))
  assert.equal(frozen.assessment.profileHash, frozen.profileHash)
  assert.equal(
    frozen.assessment.facts.find((f) => f.factId === request.profile.business.name.id).status,
    'accepted'
  )
  const reordered = { ...request, profile: Object.fromEntries(Object.entries(request.profile).reverse()) }
  assert.equal(freezePlaceProfile({ request: reordered, at }).profileHash, frozen.profileHash)
  request.profile.business.name.value = 'New name'
  request.profile.business.name.evidenceRefs = []
  const changed = freezePlaceProfile({ request, at })
  assert.notEqual(changed.profileHash, frozen.profileHash)
  assert.equal(
    changed.assessment.facts.find((f) => f.factId === request.profile.business.name.id).status,
    'unassessed'
  )
  assert.equal(frozen.profile.business.name.value, 'North Studio', 'no alias into mutable input')
})

test('v1 adapts sender statements and research converts precisely the frozen read', () => {
  const request = legacy()
  const external = freezePlaceProfile({ request, at })
  assert.deepEqual(external.profile, placeProfileFromDemoRequest(request))
  assert.equal(external.converterVersion, 'place-profile-from-demo-request/1')
  const research = {
    opportunity: { provider: 'google', providerId: 'place-1', name: 'North Studio' },
    profile: { name: 'North Studio', hours: ['Monday 09:00–17:00'] },
    brand: {},
    rawSources: [{ source: 'website', status: 'complete', ref: 'https://studio.example' }],
    media: [],
    posts: []
  }
  const internal = freezePlaceProfile({ research, at })
  assert.deepEqual(
    internal.profile,
    placeProfileFromResearch({
      identity: research.opportunity,
      profile: research.profile,
      brand: research.brand,
      sources: research.rawSources,
      media: research.media,
      posts: research.posts
    })
  )
  assert.equal(internal.converterVersion, 'place-profile-from-research/1')
  assert.equal(
    internal.assessment.facts.find((f) => f.factId === internal.profile.business.name.id).status,
    'accepted'
  )
})

test('v2 projects into the existing import shape without fetching or discarding the original profile', () => {
  const request = v2()
  const saved = structuredClone(request)
  const snapshot = snapshotRequest(request)
  assert.equal(snapshot.business.name, 'North Studio')
  assert.equal(snapshot.business.category, 'fitness')
  assert.deepEqual(snapshot.business.location, { lat: 25.2, lon: 55.3 })
  assert.equal(snapshot.business.website, 'https://studio.example')
  assert.equal(snapshot.business.items[0].photo, request.photos[0].url)
  assert.equal(snapshot.business.items[0].price, '40')
  assert.equal(snapshot.brand.logo, request.photos[1].url)
  assert.equal(snapshot.posts, undefined, 'unassessed quotations do not leak into legacy content')
  assert.equal(snapshot.business.description, undefined)
  assert.deepEqual(snapshot.links, legacy().links)
  assert.deepEqual(request, saved)
  assert.deepEqual(snapshotRequest(legacy()), legacy(), 'v1 import semantics stay unchanged')
})

test('frozen research preserves the brief’s field provenance dates for assessment', () => {
  const research = {
    opportunity: { name: 'North Studio', provider: 'url', providerId: 'https://studio.example' },
    profile: {
      phone: '+1 555 0100',
      provenance: { phone: { source: 'website', seenAt: '2020-01-01T00:00:00Z' } }
    },
    sources: [],
    media: [],
    posts: []
  }
  const frozen = freezePlaceProfile({ research, at })
  assert.equal(
    frozen.assessment.facts.find((f) => f.factId === frozen.profile.business.phone.id).status,
    'stale'
  )
})

test('v2 legacy projection omits stale offerings and leaves sensitive assertions only in the frozen profile', () => {
  const request = v2()
  request.profile.people.push({
    id: 'person-1',
    value: { name: 'Casey', relationship: 'Employee' },
    evidenceRefs: request.profile.business.name.evidenceRefs
  })
  const itemEvidence = request.profile.evidence.find(
    (e) => e.id === request.profile.offerings[0].evidenceRefs[0]
  )
  const oldSource = { ...request.profile.sources[0], id: 'old-menu', collectedAt: '2020-01-01T00:00:00Z' }
  request.profile.sources.push(oldSource)
  itemEvidence.sourceId = oldSource.id
  const snapshot = snapshotRequest(request, { at })
  assert.deepEqual(snapshot.business.items, [])
  assert.equal(snapshot.business.name, 'North Studio')
  assert.equal(snapshot.business.people, undefined)
  assert.equal(request.profile.people[0].value.name, 'Casey')
})

test('brand source values outside the legacy colour shape stay only in the canonical profile', () => {
  const request = v2()
  request.profile.brand.colors.value = [null, 'blue', { hex: '#123456' }]
  assert.deepEqual(snapshotRequest(request).brand.colors, [{ hex: '#123456' }])
})

test('v2 does not project stale links or restricted media into legacy build inputs', () => {
  const request = v2()
  const website = request.profile.links.find((f) => f.value.kind === 'website')
  const source = { ...request.profile.sources[0], id: 'old-website', collectedAt: '2020-01-01T00:00:00Z' }
  request.profile.sources.push(source)
  request.profile.evidence.find((e) => e.id === website.evidenceRefs[0]).sourceId = source.id
  const menu = request.profile.links.find((f) => f.value.kind === 'menu')
  menu.evidenceRefs = []
  request.profile.media[0].value.restrictions = ['not-on-demo']
  // Another relation to the same URL cannot lift the first fact's restriction.
  request.profile.media.push({
    ...request.profile.media[0],
    id: 'duplicate',
    value: {
      ...request.profile.media[0].value,
      restrictions: []
    }
  })
  const saved = structuredClone(request)
  const snapshot = snapshotRequest(request, { at })
  assert.equal(snapshot.business.website, undefined)
  assert.equal(snapshot.links.menu, undefined)
  assert.equal(snapshot.business.items[0].photo, undefined)
  assert.deepEqual(snapshot.skippedPhotos, [{ index: 0, reason: 'profile_withheld' }])
  assert.deepEqual(request, saved)
})

test('stale logo media is excluded even when its branding fact is current', () => {
  const request = v2()
  const logo = request.profile.media.find((f) => f.id === request.profile.brand.logo.value.mediaId)
  logo.value.publishedAt = '2020-01-01T00:00:00Z'
  const snapshot = snapshotRequest(request, { at })
  assert.equal(snapshot.brand.logo, undefined)
  assert.deepEqual(snapshot.skippedPhotos, [{ index: 1, reason: 'profile_stale' }])
})

test('a profile that cannot be frozen leaves the revision without one, said in the log, never a failed revision', () => {
  const said = []
  const throwing = {
    get opportunity() {
      throw new Error('converter broke')
    }
  }
  assert.equal(freezePlaceProfileOrNull({ research: throwing, at }, { warn: (m) => said.push(m) }), null)
  assert.match(said[0], /place profile not frozen: converter broke/)
  const fine = freezePlaceProfileOrNull({ research: { opportunity: { name: 'Ok' }, profile: {} }, at })
  assert.equal(fine.origin, 'research')
})
