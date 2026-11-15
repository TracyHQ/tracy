// What research keeps of the link-in-bio pages and booking platforms it read (`src/executor.js` mergeCollected,
// mergeProfile), and what the brief does with it: the booking link a social page's link-in-bio page lists is the
// business's verified booking link, so the build's booking button opens it; a menu or price list there is a menu link.
// A research whose sources point at none keeps exactly what it kept before.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeCollected, mergeProfile } from '../src/executor.js'
import { buildBrief, validateBrief } from '../domain/brief.mjs'

const LINKTREE = 'https://linktr.ee/harbourcuts'
const FRESHA = 'https://www.fresha.com/a/harbour-cuts-bristol-12-quay-street-abc123'
const PRICES = 'https://harbourcuts.test/files/salon-2026.pdf'
const opportunity = {
  id: 'opp-salon',
  name: 'Harbour Cuts',
  provider: 'google-places',
  candidate: {
    provider: 'google-places',
    providerId: 'ChIJsalon',
    name: 'Harbour Cuts',
    types: ['hair_salon']
  }
}

const websiteRow = {
  source: 'website',
  ref: 'https://harbourcuts.test/',
  status: 'complete',
  updated_at: new Date('2026-11-14T00:00:00Z'),
  collected: { profile: { name: 'Harbour Cuts' }, pages: [], menus: [], bookings: [] }
}
const instagramRow = {
  source: 'instagram',
  ref: 'https://www.instagram.com/harbourcuts',
  status: 'complete',
  updated_at: new Date('2026-11-14T00:00:00Z'),
  collected: mergeCollected(
    {},
    {
      profile: {
        name: 'Harbour Cuts',
        website: LINKTREE,
        links: ['https://www.tiktok.com/@harbourcuts']
      },
      posts: [],
      media: [],
      bookings: [{ url: FRESHA, sourceUrl: LINKTREE, via: LINKTREE, platform: 'Fresha' }],
      menus: [{ url: PRICES, sourceUrl: LINKTREE, via: LINKTREE }],
      bioPages: [
        {
          url: LINKTREE,
          status: 'complete',
          sourceUrl: 'https://www.instagram.com/harbourcuts/',
          links: [{ url: FRESHA, text: 'Book an appointment' }]
        }
      ]
    }
  )
}

test('the source row keeps the link-in-bio pages it read, and a row that read none keeps no such field', () => {
  assert.equal(instagramRow.collected.bioPages[0].url, LINKTREE)
  assert.deepEqual(instagramRow.collected.bookings[0].url, FRESHA)
  const plain = mergeCollected({}, { profile: { name: 'x' }, posts: [], media: [] })
  assert.equal('bioPages' in plain, false)
  // A resumed read adds to the pages already read, never twice the same page.
  const again = mergeCollected(instagramRow.collected, {
    bioPages: [{ url: LINKTREE, status: 'complete', links: [] }]
  })
  assert.equal(again.bioPages.length, 1)
})

test("the booking link and price list a social page's link-in-bio page lists are the business's own, verified", () => {
  const profile = mergeProfile(opportunity, [websiteRow, instagramRow])
  assert.deepEqual(profile.booking, [{ url: FRESHA, verified: true, source: 'instagram', via: LINKTREE }])
  assert.deepEqual(profile.menus, [
    { url: PRICES, source: 'instagram', seenAt: '2026-11-14T00:00:00.000Z', via: LINKTREE }
  ])
  assert.ok(profile.links.includes('https://www.tiktok.com/@harbourcuts'))
})

test("the brief's booking button opens the booking link the link-in-bio page listed", () => {
  const profile = mergeProfile(opportunity, [websiteRow, instagramRow])
  const brief = buildBrief({
    opportunity,
    profile: { ...profile, socials: { instagram: instagramRow.ref } },
    sources: [
      { source: 'website', status: 'complete' },
      { source: 'instagram', status: 'complete' }
    ],
    madeAt: '2026-11-15T10:00:00.000Z'
  })
  assert.deepEqual(
    brief.integrations.filter((x) => x.kind === 'booking'),
    [{ kind: 'booking', url: FRESHA, verified: true }]
  )
  const hero = brief.sitemap[0].sections.find((s) => s.kind === 'hero')
  assert.equal(hero.cta.kind, 'booking')
  assert.equal(hero.cta.href, FRESHA)
  assert.equal(
    brief.missing.some((m) => m.field === 'booking'),
    false
  )
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
})

test("a website address that is itself a booking platform's page is the booking link before any other", () => {
  const opentable = 'https://www.opentable.com/r/the-lantern-cafe-portland'
  const profile = mergeProfile({ provider: 'url', name: 'x', candidate: {} }, [
    {
      source: 'website',
      ref: opentable,
      collected: {
        profile: { name: 'The Lantern Cafe' },
        bookings: [{ url: 'https://resy.com/cities/ny/lantern' }]
      }
    }
  ])
  assert.deepEqual(
    profile.booking.map((b) => [b.url, b.source]),
    [
      [opentable, 'website'],
      ['https://resy.com/cities/ny/lantern', 'website']
    ]
  )
})

test('a research whose social pages point at no link-in-bio page keeps the menus and booking it kept before', () => {
  const profile = mergeProfile({ provider: 'url', name: 'x', candidate: {} }, [
    {
      source: 'website',
      ref: 'https://bistro.test/',
      updated_at: new Date('2026-10-18T00:00:00Z'),
      collected: {
        profile: { name: 'Bistro' },
        menus: [{ url: 'https://bistro.test/menu' }],
        bookings: [{ url: 'https://bistro.test/book-online' }]
      }
    },
    {
      source: 'instagram',
      ref: 'https://www.instagram.com/bistro',
      collected: mergeCollected(
        {},
        { profile: { name: 'Bistro', website: 'https://bistro.test/' }, posts: [], media: [] }
      )
    }
  ])
  assert.deepEqual(profile.menus, [
    { url: 'https://bistro.test/menu', source: 'website', seenAt: '2026-10-18T00:00:00.000Z' }
  ])
  assert.deepEqual(profile.booking, [
    { url: 'https://bistro.test/book-online', verified: true, source: 'website' }
  ])
})
