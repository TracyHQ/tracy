// One name decision (#189, name rule 1): a listing name that only describes the trade is no claim when the business's
// own marks (its logo text, its social page's name or handle) agree on one name. `decideBusinessName` makes that
// decision, so the brief's name, its display name, SEO titles, about line and brand all read it. Fictional businesses.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideBusinessName } from '../domain/business-name.mjs'
import { withNameDecision } from '../src/business-name.js'
import { buildBrief } from '../domain/brief.mjs'

const ADDRESS = 'Mill Road 4 - Old Harbour - Riverton'
const COMPONENTS = [{ longText: 'Riverton', shortText: 'Riverton', types: ['locality'] }]
const PLACES = ['Mill Road 4', 'Old Harbour', 'Riverton']
const BAKERY_CLAIMS = [
  { source: 'google', name: 'Bakery & Cafe', via: 'name' },
  { source: 'instagram', name: 'maplecrust.bakehouse', via: 'handle' },
  { source: 'listing', name: 'Bakery & Cafe', via: 'name', label: 'cityguide' },
  { source: 'logo', name: 'MAPLE CRUST BAKEHOUSE EST. 1998', via: 'logo' }
]
const OPP = {
  id: 'o1',
  name: 'Bakery & Cafe',
  provider: 'google-places',
  provider_id: 'ChIJbakeryfictional',
  candidate: { provider: 'google-places', providerId: 'ChIJbakeryfictional', name: 'Bakery & Cafe' }
}
const LOGO = {
  logoResearch: {
    chosen: {
      mediaId: 'm1',
      showsName: true,
      readsAs: 'MAPLE CRUST BAKEHOUSE EST. 1998',
      recognised: 'vision'
    }
  }
}

test('a trade description listing gives way to the one name the logo and the handle agree on', () => {
  const d = decideBusinessName({ claims: BAKERY_CLAIMS, fallback: 'Bakery & Cafe', places: PLACES })
  assert.equal(d.name, 'Maple Crust Bakehouse')
  assert.equal(d.state, 'agreed')
  assert.equal(d.current, 'Maple Crust Bakehouse')
  assert.equal(d.disagree, false)
  assert.deepEqual(
    d.options.map((o) => [o.name, o.sources.map((s) => s.source)]),
    [['Maple Crust Bakehouse', ['logo', 'instagram']]]
  )
})

test('a listing name that is a real name still wins over the logo, and the name stays to be checked', () => {
  const claims = [
    { source: 'google', name: 'Lakeside Smiles', via: 'name' },
    { source: 'listing', name: 'Lakeside Smiles', via: 'name', label: 'cityguide' },
    { source: 'logo', name: 'HARBOUR DENTAL STUDIO', via: 'logo' }
  ]
  const d = decideBusinessName({ claims, fallback: 'Lakeside Smiles', places: PLACES })
  assert.equal(d.name, 'Lakeside Smiles')
  assert.equal(d.current, 'Lakeside Smiles')
})

test('own marks that disagree keep the listing description as today', () => {
  const claims = [
    ...BAKERY_CLAIMS.slice(0, 3),
    { source: 'facebook', name: 'Riverside Ovens', via: 'name' },
    BAKERY_CLAIMS[3]
  ]
  const d = decideBusinessName({ claims, fallback: 'Bakery & Cafe', places: PLACES })
  assert.notEqual(d.state, 'agreed')
})

test('a typed or picked name stays final over the own marks', () => {
  const d = decideBusinessName({
    claims: BAKERY_CLAIMS,
    places: PLACES,
    chosen: { name: 'Bakery & Cafe', by: 'picked' }
  })
  assert.equal(d.name, 'Bakery & Cafe')
  assert.equal(d.state, 'chosen')
})

test('the brief reads the one decision: name, SEO title, about line and brand', () => {
  const profile = withNameDecision(
    {
      name: 'Bakery & Cafe',
      address: ADDRESS,
      phone: '+1 555 0100 222',
      nameClaims: BAKERY_CLAIMS.filter((c) => c.source !== 'logo'),
      googlePlace: { name: 'Bakery & Cafe', addressComponents: COMPONENTS, primaryType: 'bakery' }
    },
    { opportunity: OPP, brand: LOGO }
  )
  assert.equal(profile.name, 'Maple Crust Bakehouse')
  const brief = buildBrief({
    opportunity: { ...OPP, providerId: OPP.provider_id },
    profile,
    googlePlace: profile.googlePlace,
    sources: [],
    media: [],
    brand: null,
    madeAt: '2026-10-29T00:00:00.000Z'
  })
  assert.equal(brief.business.name, 'Maple Crust Bakehouse')
  const home = brief.sitemap.find((pg) => pg.slug === 'home')
  assert.match(home.seo.title, /^Maple Crust Bakehouse/)
  assert.doesNotMatch(JSON.stringify(brief.sitemap), /Bakery & Cafe/)
  if (brief.brand?.name) assert.equal(brief.brand.name, 'Maple Crust Bakehouse')
  assert.equal(brief.facts.find((f) => f.field === 'name')?.value, 'Maple Crust Bakehouse')
})
