// How sure Tracy is of one fact (#1791): a pure rule over the fact's own evidence, never a sender's declared confidence.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { confidenceOf } from '../domain/fact-confidence.mjs'
import { emptyPlaceProfile } from '../domain/place-profile.mjs'

function profileWith(sources) {
  const profile = emptyPlaceProfile('business_1')
  for (const id of sources) {
    profile.sources.push({ id, kind: 'website', ref: `https://${id}.example` })
    profile.evidence.push({
      id: `ev_${id}`,
      sourceId: id,
      locator: { kind: 'url', value: `https://${id}.example` },
      extraction: { method: 'test', version: '1' }
    })
  }
  return profile
}
const fact = (refs, extra = {}) => ({
  id: 'fact_phone',
  value: '+971 50 123 4567',
  evidenceRefs: refs,
  ...extra
})

test('one source states it: single-source', () => {
  const profile = profileWith(['google'])
  assert.equal(confidenceOf(fact(['ev_google']), { profile }), 'single-source')
})

test('two distinct sources state the same fact: corroborated', () => {
  const profile = profileWith(['google', 'instagram'])
  assert.equal(confidenceOf(fact(['ev_google', 'ev_instagram']), { profile }), 'corroborated')
})

test('two evidence refs from one source are still one source', () => {
  const profile = profileWith(['google'])
  profile.evidence.push({ ...profile.evidence[0], id: 'ev_google_2' })
  assert.equal(confidenceOf(fact(['ev_google', 'ev_google_2']), { profile }), 'single-source')
})

test('conflicting sources are not agreement', () => {
  const profile = profileWith(['google', 'instagram'])
  const phone = fact(['ev_google', 'ev_instagram'])
  profile.conflicts.push({
    id: 'conflict_phone',
    target: '$.business.phone',
    values: [phone, { id: 'fact_other_phone', value: '+971 4 000 0000', evidenceRefs: ['ev_google'] }]
  })
  assert.equal(confidenceOf(phone, { profile }), 'single-source')
  assert.equal(confidenceOf(phone, { profile, path: ['conflicts', '0', 'values', '0'] }), 'single-source')
})

test('a fact Tracy derived with no direct source: inferred, whatever evidence it cites', () => {
  const profile = profileWith(['google', 'instagram'])
  const whatsapp = fact(['ev_google', 'ev_instagram'], {
    id: 'fact_whatsapp',
    value: { kind: 'whatsapp', url: 'https://wa.me/971501234567' },
    derivation: {
      method: 'inferred',
      version: '1',
      inputRefs: ['fact_phone'],
      reason: 'whatsapp-uae-mobile: x'
    }
  })
  assert.equal(confidenceOf(whatsapp, { profile }), 'inferred')
})

test('evidence that resolves to no source states nothing: inferred', () => {
  const profile = profileWith(['google'])
  assert.equal(confidenceOf(fact(['ev_missing']), { profile }), 'inferred')
})

test("a sender's declared confidence or verified flag changes nothing", () => {
  const profile = profileWith(['google'])
  const declared = fact(['ev_google'], {
    value: { number: '+971 50 123 4567', verified: true, confidence: 'corroborated' }
  })
  assert.equal(confidenceOf(declared, { profile }), 'single-source')
})

test('a derivation from a direct quote (the business reading) is not inferred', () => {
  const profile = profileWith(['instagram'])
  const service = fact(['ev_instagram'], {
    derivation: { method: 'business-reading', version: '1', reason: 'services: its own words' }
  })
  assert.equal(confidenceOf(service, { profile }), 'single-source')
})
