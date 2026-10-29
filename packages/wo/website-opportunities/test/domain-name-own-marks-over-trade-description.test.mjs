// Name rule 1 (#189): the business's own marks that agree win over a listing name that is only a trade description;
// only own marks that disagree (with each other, or with a listing name that is a proper name) keep the name held.
// Fictional businesses of two trades throughout.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefFactsOf, withheldMissing } from '../domain/brief-facts.mjs'
import { factDecisions } from '../domain/fact-assessment.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'
import { isTradeDescriptionName, placeWordsOf } from '../domain/trade-description-name.mjs'

const AT = '2026-10-29T10:00:00.000Z'

function research({ name, address, components = [], claims, logo = null, socials = {} }) {
  return placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: `ChIJ${name.length}fictional`, name },
    profile: {
      name,
      address,
      phone: '+1 555 0100 222',
      nameClaims: claims,
      nameCheck: { name, state: 'agreed', current: name, suggested: name },
      socials,
      googlePlace: { addressComponents: components }
    },
    brand: logo ? { logoResearch: { chosen: logo } } : {},
    sources: Object.values(socials).map((ref) => ({
      source: 'instagram',
      ref,
      status: 'complete',
      collected_at: AT
    })),
    madeAt: AT
  })
}
const nameFactsOf = (doc) => {
  const decisions = factDecisions(doc)
  const facts = briefFactsOf(doc, { decisions })
  return {
    decision: decisions.get(doc.business.name.id),
    missing: withheldMissing(facts).find((m) => m.field === 'name') ?? null
  }
}

// ── The trade description test ──────────────────────────────────────────────────────────────────────────────────────

test('a trade description is category words plus a place; a proper noun makes it a name', () => {
  const places = placeWordsOf({
    address: 'Mill Road 4 - Old Harbour - Riverton',
    addressComponents: [{ longText: 'Riverton', shortText: 'Riverton' }]
  })
  for (const description of [
    'Bakery in Old Harbour',
    'Dental Clinic Riverton',
    'Padel & Squash Coach',
    'Best Swimming Lessons Riverton',
    'Bakeries'
  ])
    assert.equal(isTradeDescriptionName(description, { places }), true, description)
  for (const name of ['Maple Crust Bakehouse', 'Lakeside Smiles', 'Riverton', 'Best in Riverton', ''])
    assert.equal(isTradeDescriptionName(name, { places }), false, name)
})

// ── Own marks that agree win ────────────────────────────────────────────────────────────────────────────────────────

test('bakery: logo text and handle agree, the listing name is a trade description: the logo name is the name', () => {
  const listing = 'Bakery in Old Harbour'
  const doc = research({
    name: listing,
    address: 'Mill Road 4 - Old Harbour - Riverton',
    claims: [
      { source: 'google', name: listing, via: 'name' },
      { source: 'instagram', name: 'maple.crust', via: 'handle' },
      { source: 'listing', name: listing, via: 'name', label: 'citydirectory' }
    ],
    logo: { readsAs: 'MAPLE CRUST BAKEHOUSE EST. 2019', showsName: true, source: 'instagram' },
    socials: { instagram: 'https://www.instagram.com/maple.crust/' }
  })
  assert.deepEqual(validatePlaceProfile(doc).errors ?? [], [])
  assert.equal(doc.business.name.value, 'Maple Crust Bakehouse')
  assert.equal(doc.business.name.derivation, undefined)
  assert.equal(
    doc.conflicts.some((c) => c.target === 'business.name'),
    false
  )
  const excerpts = doc.business.name.evidenceRefs.map((r) => doc.evidence.find((e) => e.id === r)?.excerpt)
  assert.deepEqual(excerpts.sort(), ['MAPLE CRUST BAKEHOUSE EST. 2019', 'maple.crust'])
  const { decision, missing } = nameFactsOf(doc)
  assert.equal(decision.onSite, true)
  assert.equal(missing, null)
})

test('pilot-like coaching team: a listing named by its sports gives way to the club its logo and handle name', () => {
  const listing = 'Squash & Padel Coach'
  const doc = research({
    name: listing,
    address: 'Palm Street - Sea District - Coral City',
    components: [{ longText: 'Coral City', shortText: 'Coral City' }],
    claims: [
      { source: 'google', name: listing, via: 'name' },
      { source: 'instagram', name: 'coralcity.sportsclub', via: 'handle' }
    ],
    logo: { readsAs: 'CORAL CITY SPORTS CLUB EST. 2021', showsName: true, source: 'instagram' },
    socials: { instagram: 'https://www.instagram.com/coralcity.sportsclub/' }
  })
  assert.equal(doc.business.name.value, 'Coral City Sports Club')
  assert.equal(nameFactsOf(doc).missing, null)
})

// ── Own marks that disagree keep the hold ───────────────────────────────────────────────────────────────────────────

test('dental clinic: two own marks name it differently: the name stays held for the owner', () => {
  const listing = 'Dental Clinic Riverton'
  const doc = research({
    name: listing,
    address: 'Oak Avenue 12 - Riverton',
    claims: [
      { source: 'google', name: listing, via: 'name' },
      { source: 'instagram', name: 'Pearl Dental Studio', via: 'name' }
    ],
    logo: { readsAs: 'BRIGHTSMILE DENTAL', showsName: true, source: 'instagram' },
    socials: { instagram: 'https://www.instagram.com/pearl.dental/' }
  })
  assert.equal(doc.business.name.value, listing)
  assert.match(doc.business.name.derivation.reason, /^name-differs-from-own-marks: /)
  const { decision, missing } = nameFactsOf(doc)
  assert.equal(decision.onSite, false)
  assert.ok(missing)
})

test('dental clinic: a listing name that is a proper name and differs from the logo keeps the hold', () => {
  const doc = research({
    name: 'Lakeside Smiles',
    address: 'Oak Avenue 12 - Riverton',
    claims: [{ source: 'google', name: 'Lakeside Smiles', via: 'name' }],
    logo: { readsAs: 'BRIGHTSMILE DENTAL', showsName: true, source: 'instagram' }
  })
  assert.equal(doc.business.name.value, 'Lakeside Smiles')
  assert.equal(nameFactsOf(doc).decision.onSite, false)
})
