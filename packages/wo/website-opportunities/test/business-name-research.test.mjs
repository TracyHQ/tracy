// The name research decides (`src/business-name.js`): the claims `mergeProfile` records, the logo text and the
// person's pick a read adds, and the brief that carries the result to the build and its site check.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeProfile } from '../src/executor.js'
import { logoTextOf, nameClaimsOf, withNameDecision } from '../src/business-name.js'
import { LISTING_SOURCE } from '../src/sources.js'
import { buildBrief } from '../domain/brief.mjs'

const MAGICPIN = 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001'
const GOOGLE_OPP = {
  id: 'o1',
  name: 'Padel & Tennis Coach',
  provider: 'google-places',
  provider_id: 'ChIJcoachBarsha',
  candidate: { provider: 'google-places', providerId: 'ChIJcoachBarsha', name: 'Padel & Tennis Coach' }
}
const ROWS = [
  {
    source: 'instagram',
    ref: 'https://www.instagram.com/harbour.sportclub',
    status: 'complete',
    collected: { profile: { name: 'Harbour Sport Club', bio: 'Tennis and padel coaching' } }
  },
  {
    source: LISTING_SOURCE,
    ref: MAGICPIN,
    status: 'complete',
    collected: {
      listings: [{ url: MAGICPIN, ok: true, facts: { name: 'Padel & Tennis Coach' } }],
      profile: { name: 'Padel & Tennis Coach' }
    }
  }
]
const LOGO_BRAND = {
  logoResearch: {
    chosen: { mediaId: 'm1', showsName: true, readsAs: 'HARBOUR SPORT CLUB', recognised: 'vision' }
  }
}

test('nameClaimsOf: Google, each page’s name, a social handle and each listing site by its name', () => {
  assert.deepEqual(nameClaimsOf(GOOGLE_OPP, ROWS), [
    { source: 'google', name: 'Padel & Tennis Coach', via: 'name' },
    { source: 'instagram', name: 'Harbour Sport Club', via: 'name' },
    { source: 'instagram', name: 'harbour.sportclub', via: 'handle' },
    { source: 'listing', name: 'Padel & Tennis Coach', via: 'name', label: 'magicpin' }
  ])
})

test('nameClaimsOf: an Instagram name equal to its handle is the handle, not a display name (dev 5a1e2b3c)', () => {
  const rows = [
    { ...ROWS[0], collected: { profile: { name: 'harbour.sportclub', handle: 'harbour.sportclub' } } },
    ROWS[1]
  ]
  assert.deepEqual(nameClaimsOf(GOOGLE_OPP, rows), [
    { source: 'google', name: 'Padel & Tennis Coach', via: 'name' },
    { source: 'instagram', name: 'harbour.sportclub', via: 'handle' },
    { source: 'listing', name: 'Padel & Tennis Coach', via: 'name', label: 'magicpin' }
  ])
  const p = withNameDecision(mergeProfile(GOOGLE_OPP, rows), { opportunity: GOOGLE_OPP, brand: LOGO_BRAND })
  assert.equal(p.name, 'Harbour Sport Club')
  assert.equal(p.nameCheck.options[0].name, 'Harbour Sport Club')
  // No logo text: the handle is not suggested, Google's name stays.
  assert.equal(mergeProfile(GOOGLE_OPP, rows).name, 'Padel & Tennis Coach')
})

test('logoTextOf: only a logo a model saw the name on', () => {
  assert.equal(logoTextOf(LOGO_BRAND), 'HARBOUR SPORT CLUB')
  assert.equal(logoTextOf({ logoResearch: { chosen: { showsName: false, readsAs: 'X' } } }), null)
  assert.equal(logoTextOf(null), null)
})

test('mergeProfile without the logo: Instagram alone does not outvote Google, and the name is to be checked', () => {
  const p = mergeProfile(GOOGLE_OPP, ROWS)
  assert.equal(p.name, 'Padel & Tennis Coach')
  assert.equal(p.nameCheck.state, 'check')
  assert.equal(p.nameClaims.length, 4)
})

test('Harbour Sport Club: the logo’s text and Instagram agree, so the read suggests their name', () => {
  const p = withNameDecision(mergeProfile(GOOGLE_OPP, ROWS), { opportunity: GOOGLE_OPP, brand: LOGO_BRAND })
  assert.equal(p.name, 'Harbour Sport Club')
  assert.equal(p.nameCheck.state, 'check')
  assert.equal(p.nameCheck.current, 'Padel & Tennis Coach')
  assert.deepEqual(
    p.nameCheck.options.map((o) => [o.name, o.sources.map((s) => s.label ?? s.source)]),
    [
      ['Harbour Sport Club', ['instagram', 'logo']],
      ['Padel & Tennis Coach', ['google', 'magicpin']]
    ]
  )
})

test('a typed name is final: Google stays Google’s claim, the typed name is the site’s', () => {
  const opp = { ...GOOGLE_OPP, candidate: { ...GOOGLE_OPP.candidate, typedName: 'Harbour Sport Club' } }
  const p = mergeProfile(opp, ROWS)
  assert.equal(p.name, 'Harbour Sport Club')
  assert.equal(p.nameCheck.state, 'chosen')
  assert.equal(p.nameCheck.chosen.by, 'typed')
  assert.ok(p.nameClaims.some((c) => c.source === 'google' && c.name === 'Padel & Tennis Coach'))
})

test('a picked name is final at read time, over the suggestion and the typed name', () => {
  const opp = {
    ...GOOGLE_OPP,
    candidate: { ...GOOGLE_OPP.candidate, typedName: 'HSC', namePick: { name: 'Padel & Tennis Coach' } }
  }
  const p = withNameDecision(mergeProfile(GOOGLE_OPP, ROWS), { opportunity: opp, brand: LOGO_BRAND })
  assert.equal(p.name, 'Padel & Tennis Coach')
  assert.deepEqual(p.nameCheck.chosen, { name: 'Padel & Tennis Coach', by: 'picked' })
})

test('a profile saved before claims existed keeps its name', () => {
  const p = withNameDecision({ name: 'Old Name' }, { opportunity: GOOGLE_OPP })
  assert.equal(p.name, 'Old Name')
  assert.equal(p.nameCheck.state, 'agreed')
})

const briefOf = (profile, opportunity = GOOGLE_OPP) =>
  buildBrief({
    opportunity: { ...opportunity, providerId: opportunity.provider_id },
    profile,
    sources: [],
    media: [],
    brand: null,
    madeAt: '2026-10-26T00:00:00.000Z'
  })

test('the brief, and so the site check, carries the suggested name, never Google’s back', () => {
  const p = withNameDecision(mergeProfile(GOOGLE_OPP, ROWS), { opportunity: GOOGLE_OPP, brand: LOGO_BRAND })
  assert.equal(briefOf(p).business.name, 'Harbour Sport Club')
  // A profile whose `name` was left at Google's still briefs the decided name.
  assert.equal(briefOf({ ...p, name: 'Padel & Tennis Coach' }).business.name, 'Harbour Sport Club')
})

test('the brief carries the picked name', () => {
  const opp = {
    ...GOOGLE_OPP,
    candidate: { ...GOOGLE_OPP.candidate, namePick: { name: 'Padel & Tennis Coach' } }
  }
  const p = withNameDecision(mergeProfile(GOOGLE_OPP, ROWS), { opportunity: opp, brand: LOGO_BRAND })
  assert.equal(briefOf(p, opp).business.name, 'Padel & Tennis Coach')
})

test('bestKnownName: typed, else saved unless a host, else a source shown name (never a handle), else the host', async () => {
  const { bestKnownName } = await import('../src/business-name.js')
  const byLinks = (candidate = {}, name = 'httpbin.org') => ({
    name,
    provider: 'url',
    candidate: { provider: 'url', providerId: 'https://httpbin.org/html', name: 'httpbin.org', ...candidate }
  })
  // The name typed with the links wins from the start.
  assert.equal(bestKnownName(byLinks({ typedName: 'Harbour Sport Club' }), ROWS), 'Harbour Sport Club')
  // A listing's name saved on the row is not a host.
  assert.equal(bestKnownName(byLinks({}, 'Padel & Tennis Coach'), []), 'Padel & Tennis Coach')
  // Only a host so far: the first shown name a source gives, in trust order (Instagram before the listing).
  assert.equal(bestKnownName(byLinks(), ROWS), 'Harbour Sport Club')
  // A social handle alone is not a name to show.
  const handleOnly = [
    { source: 'instagram', ref: 'https://www.instagram.com/harbour.sportclub', collected: {} }
  ]
  assert.equal(bestKnownName(byLinks(), handleOnly), 'httpbin.org')
  // Nothing better: the host, as the last resort.
  assert.equal(bestKnownName(byLinks(), []), 'httpbin.org')
  // A Google place keeps its own name.
  assert.equal(bestKnownName(GOOGLE_OPP, ROWS), 'Padel & Tennis Coach')
})
