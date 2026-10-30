// Every brief asset keeps where it came from, who must be credited and who uploaded it, from research to the revision.
// The seam: a researched place's stored pictures (fictional) go through `fromPlace` and `makeSiteBrief`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as domain from '../domain/index.mjs'
import { fromPlace, makeSiteBrief } from '../src/brief-research.js'

const AT = '2026-10-28T09:00:00.000Z'
const sha = (n) => String(n).padStart(64, '0')

/** A stored place picture as `wo_place_media` holds it. */
const row = (id, n, extra) => ({
  id,
  status: 'stored',
  kind: 'image',
  category: 'other',
  sha256: sha(n),
  mime: 'image/jpeg',
  width: 1600,
  height: 1000,
  bytes: 120000,
  source_url: `https://example.test/${id}.jpg`,
  ...extra
})

const MEDIA = [
  row('own-site', 1, { source: 'website' }),
  row('own-ig', 2, { source: 'instagram' }),
  row('places-1', 3, {
    source: 'google-places',
    source_url: 'google-places:places/ChIJfictional/photos/A1',
    credit: {
      provider: 'Google',
      authors: [{ displayName: 'Maple Example', uri: 'https://maps.example.test/contrib/1' }, 'Pat Sample']
    }
  }),
  row('maps-review', 4, {
    source: 'google-maps',
    credit: { provider: 'Google', photoSource: 'review', authors: [] }
  }),
  // A legacy per-account row keeps the Google credit inside its labels.
  row('places-legacy', 5, {
    source: 'google-places',
    labels: { credit: { provider: 'Google', authors: [{ displayName: 'Wren Example' }] } }
  })
]

const briefOf = (media) =>
  makeSiteBrief(
    domain,
    fromPlace({ sources: [], profile: { name: 'Harbour Sport Club' }, brand: null, media }),
    {
      opportunity: { id: 'o1', name: 'Harbour Sport Club', candidate: { trade: 'fitness' } },
      madeAt: AT
    }
  )

test('every brief asset carries source, credit and uploader role from research', () => {
  const brief = briefOf(MEDIA)
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  const by = new Map(brief.assets.map((a) => [a.id, a]))
  assert.equal(by.size, MEDIA.length)
  for (const a of by.values()) {
    assert.ok(a.source && typeof a.source === 'string', `${a.id} source`)
    assert.equal(typeof a.credit, 'string', `${a.id} credit`)
    assert.ok(['owner', 'customer', 'unknown'].includes(a.uploaderRole), `${a.id} uploaderRole`)
  }
  assert.deepEqual(
    [by.get('own-site').source, by.get('own-site').credit, by.get('own-site').uploaderRole],
    ['website', '', 'owner']
  )
  assert.equal(by.get('own-ig').uploaderRole, 'owner')
  assert.equal(by.get('maps-review').uploaderRole, 'customer')
  assert.equal(by.get('places-1').uploaderRole, 'unknown')
})

test('Google Places photos keep their author attribution in the brief', () => {
  const by = new Map(briefOf(MEDIA).assets.map((a) => [a.id, a]))
  assert.equal(by.get('places-1').source, 'google-places')
  assert.equal(by.get('places-1').credit, 'Maple Example (https://maps.example.test/contrib/1); Pat Sample')
  assert.equal(by.get('places-legacy').credit, 'Wren Example')
})

test('validation rejects an asset without a source, a credit or an uploader role', () => {
  for (const [field, value] of [
    ['source', undefined],
    ['source', ''],
    ['credit', undefined],
    ['uploaderRole', undefined],
    ['uploaderRole', 'visitor']
  ]) {
    const brief = briefOf(MEDIA)
    if (value === undefined) delete brief.assets[0][field]
    else brief.assets[0][field] = value
    const checked = domain.validateBrief(brief)
    assert.equal(checked.ok, false, `${field}=${value}`)
    assert.match(checked.errors.join('\n'), new RegExp(`assets\\[0\\]\\.${field}`))
  }
})

test('a brief stored before the fields (assets with none) is still tolerated by readers', () => {
  const brief = briefOf(MEDIA)
  for (const a of brief.assets) {
    delete a.source
    delete a.credit
    delete a.uploaderRole
  }
  assert.equal(domain.validateBrief(brief).ok, false, 'a new write is refused')
  assert.deepEqual(domain.validateBrief(brief, { legacy: true }), { ok: true, errors: [] })
  assert.deepEqual(
    domain.validateBrief({ ...brief, schemaVersion: 1 }).errors.filter((e) => e.startsWith('assets')),
    []
  )
})
