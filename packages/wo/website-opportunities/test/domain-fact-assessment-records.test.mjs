import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assessProfile } from '../domain/fact-assessment.mjs'
import { neutralFor } from '../domain/neutral-copy.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'
import { planSlotFill } from '../domain/slot-fill.mjs'

// A review published years ago is still a real review; only facts about the place as it is now age out.
const AT = '2026-10-26T00:00:00.000Z'
const OLD = '2023-03-01T00:00:00.000Z'
const AVATAR = 'https://lh3.googleusercontent.com/a/old-guest'

function oldPlace() {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'old-cafe', name: 'Old Cafe' },
    profile: {
      name: 'Old Cafe',
      phone: '+84 28 0000 0000',
      provenance: { phone: { source: 'website' } },
      googlePlace: { primaryType: 'cafe' },
      reviewSources: {
        googleMaps: {
          url: 'https://maps.google.com/?cid=9',
          rating: 4.7,
          reviewCount: 320,
          fetchedAt: OLD,
          reviews: [
            { text: 'Old but true.', author: 'An', rating: 5, publishTime: OLD, authorAvatarUrl: AVATAR },
            { text: 'Newer words.', author: 'Binh', rating: 4, publishTime: '2026-09-01T00:00:00.000Z' }
          ]
        }
      }
    },
    sources: [
      { source: 'website', ref: 'https://old.example', status: 'complete', collected_at: OLD },
      {
        source: 'instagram',
        ref: 'https://instagram.com/oldcafe',
        status: 'complete',
        collected_at: OLD,
        collected: { profile: { followers: 5100 } }
      },
      { source: 'google-maps', ref: 'https://maps.google.com/?cid=9', status: 'complete', collected_at: OLD }
    ],
    media: [
      {
        id: 'guest-photo',
        kind: 'image',
        status: 'stored',
        source: 'google-maps',
        source_url: 'https://lh3.googleusercontent.com/p/guest-photo',
        posted_at: OLD
      }
    ]
  })
  assert.equal(validatePlaceProfile(doc).ok, true)
  return doc
}
const statusOf = (profile) =>
  Object.fromEntries(assessProfile(profile, { origin: 'research', at: AT }).map((a) => [a.factId, a]))

test('reviews, ratings, review counts, follower counts and guest photos older than a year stay accepted', () => {
  const profile = oldPlace()
  const status = statusOf(profile)
  const records = [
    ...profile.quotes.filter((q) => q.value.kind === 'review'),
    ...profile.claims.statistics,
    ...profile.media
  ]
  assert.equal(records.length, 6)
  for (const fact of records) assert.equal(status[fact.id].status, 'accepted', JSON.stringify(fact.value))
})

test('a phone number read more than a year ago is still stale', () => {
  const profile = oldPlace()
  const phone = statusOf(profile)[profile.business.phone.id]
  assert.equal(phone.status, 'stale')
  assert.ok(phone.reasonCodes.includes('stale'))
})

test('a year-old review and its avatar fill a testimonial card, newest review first', () => {
  const profile = oldPlace()
  const groups = []
  const bindings = []
  for (const i of [0, 1]) {
    groups.push({ id: `quote.${i}`, entityKind: 'quote', allowedKinds: ['quote'], itemIndex: i })
    for (const role of ['quote.text', 'quote.author_image'])
      bindings.push({ slotKey: `${role}.${i}`, groupId: `quote.${i}`, role, mode: 'copy' })
  }
  const plan = planSlotFill({
    slotRoles: { schemaVersion: 'tracy-quickstart-slot-roles/v1', groups, bindings },
    profile,
    assessment: assessProfile(profile, { origin: 'research', at: AT }),
    neutralFor
  })
  const w = Object.fromEntries(plan.writes.map((x) => [x.slotKey, x]))
  assert.equal(w['quote.text.0'].value, 'Newer words.')
  assert.equal(w['quote.text.1'].value, 'Old but true.')
  assert.deepEqual(w['quote.author_image.1'].value, { url: AVATAR })
})
