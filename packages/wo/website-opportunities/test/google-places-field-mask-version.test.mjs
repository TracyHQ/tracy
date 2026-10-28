/**
 * Research again refreshes Google Place Details when the stored place was fetched under an older field mask: the
 * collector version of `google-places` names the mask, so a field the code asks for now (the amenity groups) makes
 * every place fetched without it due once, and a place fetched under today's mask stays cached.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GPLACES_DETAIL_FIELDS } from '../domain/gplaces-details.mjs'
import { SOURCE_VERSIONS, sourceVersionOf } from '../src/collector-versions.js'
import { researchAgainPlan } from '../src/research-again.js'

const NOW = Date.parse('2026-10-28T08:00:00.000Z')
const DAY = 86400000

/** The google-places row of the fictional Harbour Sport Club, fetched a day ago under `version`. */
const placesRow = (version) => ({
  source: 'google-places',
  ref: 'ChIJHarbourSportClub1',
  status: 'complete',
  collected_at: new Date(NOW - DAY).toISOString(),
  attempted_at: new Date(NOW - DAY).toISOString(),
  collector_version: version,
  collected: { placeId: 'ChIJHarbourSportClub1', amenities: {} }
})

const plan = (row) =>
  researchAgainPlan(
    { 'google-places': row },
    { now: NOW, parts: ['google-places'], versions: { ...SOURCE_VERSIONS }, prices: { 'google-places': 4 } }
  )

test('the field mask asks for the amenity fields any trade can have', () => {
  const fields = GPLACES_DETAIL_FIELDS.split(',')
  for (const f of ['accessibilityOptions', 'parkingOptions', 'paymentOptions', 'restroom', 'outdoorSeating'])
    assert.ok(fields.includes(f), `${f} is requested`)
})

test('a place fetched before the amenity fields joined the mask is refreshed by Research again', () => {
  const out = plan(placesRow('google-places-2'))
  assert.deepEqual(
    out.run.map((r) => [r.part, r.reason]),
    [['google-places', 'rule-changed']]
  )
  assert.equal(out.ceilingCents, 4, 'the refresh is one Place Details call, priced in the preview')
})

test('a place fetched under the current mask keeps its cache', () => {
  const out = plan(placesRow(sourceVersionOf('google-places')))
  assert.deepEqual(out.run, [])
  assert.deepEqual(out.kept, [{ part: 'google-places', reason: 'up-to-date' }])
})

test('the google-places version names the field mask, so a new field is never kept from older places', () => {
  const version = sourceVersionOf('google-places')
  assert.notEqual(version, 'google-places-2')
  const again = sourceVersionOf('google-places')
  assert.equal(version, again, 'stable between calls')
  assert.match(version, /^google-places-3-[0-9a-f]{12}$/)
})
