// The business's own marks and own words in the place profile (#1791): a name its logo and social page do not carry
// waits for the owner, a website field that is only a social page is that social page, and a channel the business
// invites people to use ("DM us") is a contact channel resting on its own words. Fictional business throughout.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefFactsOf, withheldMissing } from '../domain/brief-facts.mjs'
import { factDecisions } from '../domain/fact-assessment.mjs'
import { ownChannelInvitesOf } from '../domain/own-channels.mjs'
import { ownMarkNamesOf } from '../domain/own-marks.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

const AT = '2026-10-27T10:00:00.000Z'
const IG = 'https://www.instagram.com/harbour.sportclub/'
// A proper name the own marks contradict: the case that still holds the name (#189). A listing name that is only a
// trade description gives way to the own marks instead (domain-name-own-marks-over-trade-description.test.mjs).
const SERVICE_NAME = 'Marina Racquet House'
const LOGO = {
  readsAs: 'HARBOUR SPORT CLUB EST. 2023',
  showsName: true,
  mediaId: 'm-logo',
  source: 'instagram'
}

function research({ profile = {}, brand = {}, posts = [], sources } = {}) {
  return placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: 'ChIJharbourtest', name: SERVICE_NAME },
    profile: {
      name: SERVICE_NAME,
      address: 'Harbour Lane - Al Barsha - Dubai - United Arab Emirates',
      phone: '+971 50 000 1234',
      nameClaims: [
        { source: 'google', name: SERVICE_NAME, via: 'name' },
        { source: 'instagram', name: 'harbour.sportclub', via: 'handle' },
        { source: 'listing', name: SERVICE_NAME, via: 'name', label: 'magicpin' }
      ],
      nameCheck: { name: SERVICE_NAME, state: 'agreed', current: SERVICE_NAME, suggested: SERVICE_NAME },
      socials: { instagram: IG },
      ...profile
    },
    brand,
    posts,
    sources: sources ?? [{ source: 'instagram', ref: IG, status: 'complete', collected_at: AT }],
    madeAt: AT
  })
}
const excerptsOf = (doc, fact) =>
  fact.evidenceRefs.map((ref) => doc.evidence.find((e) => e.id === ref)?.excerpt)
const sourceKindsOf = (doc, fact) =>
  fact.evidenceRefs.map(
    (ref) => doc.sources.find((s) => s.id === doc.evidence.find((e) => e.id === ref)?.sourceId)?.kind
  )

// ── 1. The name its own marks do not carry ──────────────────────────────────────────────────────────────────────────

test('own marks: the logo text (less its founding year) and the handle that matches it give one other name', () => {
  const names = ownMarkNamesOf({
    chosen: SERVICE_NAME,
    claims: [
      { source: 'google', name: SERVICE_NAME, via: 'name' },
      { source: 'instagram', name: 'harbour.sportclub', via: 'handle' }
    ],
    logo: LOGO
  })
  assert.deepEqual(
    names.map((n) => [n.name, n.marks.map((m) => [m.source, m.via, m.text])]),
    [
      [
        'Harbour Sport Club',
        [
          ['logo', 'logo', 'HARBOUR SPORT CLUB EST. 2023'],
          ['instagram', 'handle', 'harbour.sportclub']
        ]
      ]
    ]
  )
})

test('own marks: a handle alone, a mark that holds the chosen name, or a logo without the name never differ', () => {
  const claims = [{ source: 'instagram', name: 'hsc_dxb', via: 'handle' }]
  assert.deepEqual(ownMarkNamesOf({ chosen: 'Harbour Sport Club', claims }), [])
  assert.deepEqual(
    ownMarkNamesOf({
      chosen: 'Harbour Sport Club',
      logo: { readsAs: 'HARBOUR SPORT CLUB DUBAI', showsName: true }
    }),
    []
  )
  assert.deepEqual(
    ownMarkNamesOf({ chosen: 'Harbour Sport Club', logo: { readsAs: 'SEA DOGS', showsName: false } }),
    []
  )
  // A display name the page writes counts on its own.
  assert.deepEqual(
    ownMarkNamesOf({
      chosen: SERVICE_NAME,
      claims: [{ source: 'instagram', name: 'Harbour Sport Club', via: 'name' }]
    }).map((n) => n.name),
    ['Harbour Sport Club']
  )
})

test('a name the logo and Instagram do not carry stays the name, held off the site until the owner confirms it', () => {
  const doc = research({ brand: { logoResearch: { chosen: LOGO } } })
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
  const name = doc.business.name
  assert.equal(name.value, SERVICE_NAME)
  assert.match(name.derivation.reason, /^name-differs-from-own-marks: /)
  // The other name, with the business's own marks as its evidence.
  const conflict = doc.conflicts.find((c) => c.target === 'business.name')
  assert.ok(conflict, 'the other name is kept as a conflict of the name')
  assert.match(conflict.reason, /^name-differs-from-own-marks: /)
  assert.deepEqual(
    conflict.values.map((v) => v.value),
    [SERVICE_NAME, 'Harbour Sport Club']
  )
  const other = conflict.values[1]
  assert.deepEqual(excerptsOf(doc, other).sort(), ['HARBOUR SPORT CLUB EST. 2023', 'harbour.sportclub'])
  assert.deepEqual(sourceKindsOf(doc, other).sort(), ['instagram', 'logo'])

  const decided = factDecisions(doc)
  assert.equal(decided.get(name.id).onSite, false)
  assert.ok(decided.get(name.id).reasons.includes('name-differs-from-own-marks'))
  // The owner confirms it with the same on/off choice as every fact.
  const confirmed = factDecisions(doc, { overrides: { [name.id]: { onSite: true } } }).get(name.id)
  assert.equal(confirmed.onSite, true)
  assert.equal(confirmed.decidedBy, 'owner')

  // The brief states the name once, off the site, and tells the builder why in plain words.
  const facts = briefFactsOf(doc, { decisions: decided })
  assert.equal(facts.filter((f) => f.field === 'name').length, 1)
  const missing = withheldMissing(facts).find((m) => m.field === 'name')
  assert.ok(missing.why.includes(SERVICE_NAME))
  assert.match(missing.why, /owner confirms/)
  assert.deepEqual(
    missing.withheld.map((w) => w.values),
    [[SERVICE_NAME]]
  )
})

test('no doubt when the marks carry the chosen name, or once the owner chose the name', () => {
  const same = research({
    profile: {
      name: 'Harbour Sport Club',
      nameCheck: { name: 'Harbour Sport Club', state: 'agreed' }
    },
    brand: { logoResearch: { chosen: LOGO } }
  })
  assert.equal(same.business.name.derivation, undefined)
  assert.equal(
    same.conflicts.some((c) => c.target === 'business.name'),
    false
  )
  const chosen = research({
    profile: {
      nameCheck: { name: SERVICE_NAME, state: 'chosen', chosen: { name: SERVICE_NAME, by: 'picked' } }
    },
    brand: { logoResearch: { chosen: LOGO } }
  })
  assert.equal(chosen.business.name.derivation, undefined)
  assert.equal(factDecisions(chosen).get(chosen.business.name.id).onSite, true)
})

// ── 2. A website field that is a social page ────────────────────────────────────────────────────────────────────────

test("Google's website field holding the Instagram page is no website: it is more evidence of the Instagram link", () => {
  const doc = research({
    profile: { googlePlace: { placeId: 'ChIJharbourtest', website: `${IG}?igsh=abc123` } }
  })
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
  assert.equal(
    doc.links.some((l) => l.value.kind === 'website'),
    false
  )
  const instagram = doc.links.filter((l) => l.value.kind === 'instagram')
  assert.equal(instagram.length, 1)
  assert.deepEqual(sourceKindsOf(doc, instagram[0]).sort(), ['google-places', 'instagram'])
  const facts = briefFactsOf(doc, { decisions: factDecisions(doc) })
  assert.equal(facts.filter((f) => f.field === 'website').length, 0)
  assert.equal(facts.filter((f) => f.field === 'socials').length, 1)
})

test('a social website with no social link yet becomes that social link; a real website stays a website', () => {
  const only = research({
    profile: {
      socials: {},
      googlePlace: { placeId: 'ChIJharbourtest', website: 'https://www.facebook.com/harboursportclub' }
    }
  })
  // The WhatsApp button inferred from the UAE mobile is another link, not part of this rule.
  const kinds = (doc) => doc.links.map((l) => l.value.kind).filter((k) => k !== 'whatsapp')
  assert.deepEqual(kinds(only), ['facebook'])
  const x = research({ profile: { socials: {}, website: 'https://x.com/harbourclub' } })
  assert.deepEqual(kinds(x), ['x'])
  const real = research({ profile: { website: 'https://harbour-sport-club.example/' } })
  assert.deepEqual(kinds(real).sort(), ['instagram', 'website'])
})

// ── 3. Channels the business names itself ───────────────────────────────────────────────────────────────────────────

test('own channel invites: "DM us" on a social page, "message us on <network>", "WhatsApp us"', () => {
  assert.deepEqual(
    ownChannelInvitesOf('Join our padel sessions!\nDM us today to book your spot!', 'instagram'),
    [{ channel: 'instagram-dm', quote: 'DM us today to book your spot!' }]
  )
  assert.deepEqual(ownChannelInvitesOf('Questions? Message us on Facebook.', 'instagram'), [
    { channel: 'facebook-dm', quote: 'Message us on Facebook.' }
  ])
  assert.deepEqual(ownChannelInvitesOf('Book now: WhatsApp us anytime', null), [
    { channel: 'whatsapp', quote: 'Book now: WhatsApp us anytime' }
  ])
  // Read from no social page and naming none: no network to message on.
  assert.deepEqual(ownChannelInvitesOf('DM us for prices', null), [])
  assert.deepEqual(ownChannelInvitesOf('Tennis and padel for all ages', 'instagram'), [])
  assert.equal(ownChannelInvitesOf('Send us a DM', 'tiktok')[0].channel, 'tiktok-dm')
})

const DM_POST = {
  source: 'instagram',
  id: 'p1',
  url: 'https://www.instagram.com/p/HSCpost0001/',
  caption: 'Join our padel sessions in Dubai!\nDM us today to book your spot!'
}

test('the post that says "DM us" makes an Instagram DM contact channel, resting on its words', () => {
  const doc = research({ posts: [DM_POST] })
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
  const dm = doc.links.find((l) => l.value.kind === 'instagram-dm')
  assert.ok(dm, 'an Instagram DM channel')
  assert.equal(dm.value.url, 'https://ig.me/m/harbour.sportclub')
  assert.ok(excerptsOf(doc, dm).includes('DM us today to book your spot!'))
  const decided = factDecisions(doc).get(dm.id)
  assert.equal(decided.onSite, true)
  // One post says it: one source. The Instagram page it goes to is its input, never a quote (#1791 grading).
  assert.equal(decided.confidence, 'single-source')
  const facts = briefFactsOf(doc, { decisions: factDecisions(doc) })
  const channel = facts.find((f) => f.id === dm.id)
  assert.equal(channel.field, 'contactChannels')
  assert.ok(channel.evidence.some((e) => e.quote === 'DM us today to book your spot!'))
})

test('no invitation, or no page of that network to message, makes no channel', () => {
  assert.equal(
    research({ posts: [{ ...DM_POST, caption: 'Tennis for all ages' }] }).links.some((l) =>
      l.value.kind.endsWith('-dm')
    ),
    false
  )
  assert.equal(
    research({ profile: { socials: {} }, posts: [DM_POST] }).links.some((l) => l.value.kind.endsWith('-dm')),
    false
  )
})

test('a bio that says "WhatsApp us" backs the WhatsApp button with its own words: no longer only inferred', () => {
  const doc = research({
    profile: {
      bio: 'Padel and tennis coaching\nWhatsApp us to book',
      provenance: { bio: { source: 'instagram' } }
    },
    sources: [{ source: 'instagram', ref: IG, status: 'complete', collected_at: AT }]
  })
  const wa = doc.links.find((l) => l.value.kind === 'whatsapp')
  assert.ok(wa)
  assert.ok(excerptsOf(doc, wa).includes('WhatsApp us to book'))
  assert.notEqual(wa.derivation?.method, 'inferred')
  assert.notEqual(factDecisions(doc).get(wa.id).confidence, 'inferred')
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
})
