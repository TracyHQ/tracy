/**
 * The Business brief tab of Details (#517): one row per fact the brief states, each with the words a seller uses for
 * it, its value, a plain note on where it came from and whether the site says it. No internal word and no raw field
 * code reaches the screen.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-business-brief.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { businessBriefRows, sourceNote } from '../src/client/business-brief-model.ts'
import { en } from '../src/client/strings.ts'

/** The real English table, so the test reads what a seller reads. */
const t = (key, params = {}) => {
  const text = en[key]
  if (text === undefined) throw new Error(`missing string ${key}`)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}

// A made-up place: a sailing school with facts from Google, its own website and the person's own edit.
const profile = {
  sources: [
    { id: 'src_g', kind: 'google-places' },
    { id: 'src_w', kind: 'website' },
    { id: 'src_i', kind: 'instagram' },
    { id: 'src_you', kind: 'account-overlay' },
    { id: 'src_m', kind: 'research-merged' }
  ],
  evidence: [
    { id: 'ev_g', sourceId: 'src_g' },
    { id: 'ev_w', sourceId: 'src_w' },
    { id: 'ev_i', sourceId: 'src_i' },
    { id: 'ev_you', sourceId: 'src_you' },
    { id: 'ev_m', sourceId: 'src_m' }
  ],
  business: {
    name: { id: 'f_name', value: 'Blue Cove Sailing', evidenceRefs: ['ev_g', 'ev_w'] },
    phone: { id: 'f_phone', value: '+1 555 0100', evidenceRefs: ['ev_g'] },
    hours: { id: 'f_hours', value: ['Mon-Fri 9:00-17:00'], evidenceRefs: ['ev_you'] },
    serviceAreas: { id: 'f_area', value: ['North Bay'], evidenceRefs: ['ev_m'] },
    rating: { id: 'f_rating', value: { label: 'Google rating', amount: 4.9 }, evidenceRefs: ['ev_g'] }
  },
  links: [
    {
      id: 'f_ig',
      value: { kind: 'instagram', url: 'https://instagram.com/bluecove' },
      evidenceRefs: ['ev_i']
    }
  ]
}
const decision = (factId, field, extra = {}) => ({
  factId,
  field,
  confidence: 'single-source',
  onSite: true,
  decidedBy: 'rule',
  reasons: [],
  ...extra
})
const decisions = [
  decision('f_name', 'name', { confidence: 'corroborated' }),
  decision('f_phone', 'phone'),
  decision('f_hours', 'hours', { decidedBy: 'owner' }),
  decision('f_area', 'serviceAreas', { confidence: 'inferred' }),
  decision('f_rating', 'googleRating', { onSite: false, reasons: ['few-reviews'] }),
  decision('f_ig', 'socials')
]

test('every fact is a row with its label, its value and a plain note on where it came from', () => {
  const rows = businessBriefRows(profile, decisions, t, 'en')
  assert.deepEqual(
    rows.map((r) => [r.label, r.value, r.source]),
    [
      ['Name', 'Blue Cove Sailing', 'From Google and the website'],
      ['Phone', '+1 555 0100', 'From Google'],
      ['Opening hours', 'Mon-Fri 9:00-17:00', 'You entered this'],
      ['Service area', 'North Bay', 'Tracy worked this out'],
      ['Google rating', 'Google rating: 4.9', 'From Google'],
      ['Social profiles', 'https://instagram.com/bluecove', 'From Instagram']
    ]
  )
})

test('a fact off the site says why in plain words; one the person chose says so', () => {
  const rows = businessBriefRows(profile, decisions, t, 'en')
  const rating = rows.find((r) => r.id === 'f_rating')
  assert.equal(rating.onSite, false)
  assert.deepEqual(rating.notes, ['Not on the site: fewer than 5 reviews stand behind it.'])
  const hours = rows.find((r) => r.id === 'f_hours')
  assert.equal(hours.ownerChoice, true)
  assert.deepEqual(hours.notes, [])
})

test('no internal word and no raw field code is shown', () => {
  const rows = businessBriefRows(
    profile,
    [...decisions, decision('f_phone', 'deliveryZones'), decision('f_ig', 'contactChannels')],
    t,
    'en'
  )
  const shown = rows.flatMap((r) => [r.label, r.value, r.source, ...r.notes]).join('\n')
  for (const word of [
    'Single source',
    'Corroborated',
    'Left off by rule',
    'Hand to the agent',
    'serviceAreas',
    'googleRating',
    'deliveryZones',
    'contactChannels',
    'research-merged',
    'account-overlay',
    'google-places'
  ])
    assert.equal(shown.includes(word), false, `"${word}" is shown`)
  assert.match(shown, /Delivery zones/)
})

test('a source note names known places only, else says it came from the research', () => {
  assert.equal(sourceNote(['research-merged'], 'single-source', t, 'en'), 'From the research')
  assert.equal(
    sourceNote(['facebook', 'google', 'website'], 'corroborated', t, 'en'),
    'From Google, Facebook, and the website'
  )
  assert.equal(sourceNote(['logo'], 'single-source', t, 'en'), 'From the logo')
  assert.equal(sourceNote(['google', 'account-overlay'], 'single-source', t, 'en'), 'You entered this')
})

test('no decisions draws no table', () => {
  assert.deepEqual(businessBriefRows(profile, null, t, 'en'), [])
})

test('the confidence and rule words of the string table are plain sentences', () => {
  const internal = /Single source|Corroborated|Left off by rule|Hand to the agent/
  for (const [key, text] of Object.entries(en)) assert.doesNotMatch(text, internal, key)
})

test('a counted fact whose label is a code reads as a number and a word, never as "code: number"', async () => {
  const { factLabel } = await import('../src/client/profile-facts-model.ts')
  assert.equal(factLabel({ label: 'followers', amount: 1819 }), '1,819 followers')
  assert.equal(factLabel({ label: 'posts', amount: 77 }), '77 posts')
  assert.equal(factLabel({ label: 'reviewCount', amount: 4 }), '4 reviews')
  assert.equal(factLabel({ label: 'rating', amount: 5 }), '5.0 stars')
  assert.equal(factLabel({ label: 'reviewCount', amount: 1 }), '1 review')
  // A label already in plain words keeps its own wording.
  assert.equal(factLabel({ label: 'Google rating', amount: 4.9 }), 'Google rating: 4.9')
  assert.equal(factLabel({ label: 'repeatGuests', amount: 12 }), '12 repeat guests')
})
