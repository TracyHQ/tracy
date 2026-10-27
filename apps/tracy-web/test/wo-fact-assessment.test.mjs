import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placeProfileFromDemoRequest } from 'website-opportunities/domain/place-profile-from-demo-request.mjs'
import { assessProfile } from '../src/opportunities-build/fact-assessment.js'

const at = '2026-10-26T12:00:00.000Z'
function profileOf() {
  const profile = placeProfileFromDemoRequest({
    business: {
      name: 'North Studio',
      phone: '+1 555 0100',
      hours: ['Monday 09:00–17:00'],
      category: 'fitness',
      items: [{ name: 'Training session', price: '40', currency: 'USD' }]
    },
    photos: [{ url: 'https://images.example/studio.jpg' }]
  })
  const fact = (id, value) => ({ id, value, evidenceRefs: [...profile.business.name.evidenceRefs] })
  profile.people.push(fact('coach', { name: 'Casey', role: 'Coach' }))
  profile.claims.recognitions.push(fact('award', { name: 'Local award' }))
  profile.quotes.push(
    fact('testimonial', { kind: 'testimonial', text: 'Excellent coaching.', restrictions: [] })
  )
  profile.quotes.push(
    fact('review', { kind: 'review', text: 'A visitor review.', restrictions: ['not-on-demo'] })
  )
  profile.faqs.push(fact('faq', { question: 'Is parking free?', answer: 'Yes.' }))
  return profile
}
const byId = (profile, options) =>
  Object.fromEntries(assessProfile(profile, options).map((a) => [a.factId, a]))

test('sender statements accept identity, contact, offerings and hours but withhold sensitive assertions', () => {
  const profile = profileOf()
  const saved = structuredClone(profile)
  const facts = byId(profile, { origin: 'sender', at })
  for (const fact of [
    profile.business.name,
    profile.business.phone,
    profile.business.hours,
    profile.offerings[0]
  ])
    assert.deepEqual(facts[fact.id], {
      factId: fact.id,
      status: 'accepted',
      reasonCodes: ['sender-statement'],
      policyVersion: 'demo-evidence/2',
      confidence: 'single-source',
      onSite: true,
      decidedBy: 'rule',
      reasons: ['sender-statement']
    })
  for (const id of ['coach', 'award', 'testimonial']) {
    assert.equal(facts[id].status, 'withheld')
    assert.ok(facts[id].reasonCodes.includes('sender-sensitive-fact'))
  }
  assert.equal(facts.faq.status, 'unassessed')
  assert.equal(facts.review.status, 'withheld')
  assert.ok(facts.review.reasonCodes.includes('not-on-demo'))
  assert.deepEqual(profile, saved, 'assessment never annotates the public document')
})

test('research evidence is accepted, but declaring a research source does not elevate an external sender', () => {
  const profile = profileOf()
  profile.sources.forEach((source) => {
    source.kind = 'website'
  })
  const research = byId(profile, { origin: 'research', at })
  assert.equal(research.coach.status, 'accepted')
  assert.equal(research.award.status, 'accepted')
  assert.equal(research.faq.status, 'accepted')
  assert.equal(research.review.status, 'withheld')
  assert.equal(byId(profile, { origin: 'sender', at }).coach.status, 'withheld')
  profile.sources.forEach((source) => {
    source.kind = 'sender-statement'
  })
  assert.equal(byId(profile, { origin: 'research', at }).coach.status, 'withheld')
})

test('staleness uses the frozen assessment time and the brief’s strict 365-day boundary', () => {
  const profile = profileOf()
  profile.sources.forEach((source) => {
    source.kind = 'website'
    source.collectedAt = '2025-10-26T12:00:00.000Z'
  })
  assert.equal(byId(profile, { origin: 'research', at }).coach.status, 'accepted')
  profile.sources.forEach((source) => {
    source.collectedAt = '2025-10-26T11:59:59.999Z'
  })
  const older = byId(profile, { origin: 'research', at })
  assert.equal(older.coach.status, 'stale')
  assert.ok(older.coach.reasonCodes.includes('stale'))
  assert.ok(older.review.reasonCodes.includes('not-on-demo'), 'stale reviews still cannot go on demos')
  profile.sources.forEach((source) => {
    source.collectedAt = at
  })
  profile.media[0].value.publishedAt = '2024-01-01T00:00:00Z'
  assert.equal(byId(profile, { origin: 'research', at })[profile.media[0].id].status, 'stale')
})

test('missing evidence stays unassessed, broken references are rejected, and source values are not facts', () => {
  const profile = profileOf()
  profile.people[0].evidenceRefs = []
  profile.claims.recognitions[0].evidenceRefs = ['absent']
  profile.business.name.value = { id: 'provider-value', value: 'not a fact', evidenceRefs: [] }
  const facts = byId(profile, { origin: 'research', at })
  assert.equal(facts.coach.status, 'unassessed')
  assert.equal(facts.award.status, 'rejected')
  assert.equal(facts['provider-value'], undefined)
  assert.equal(byId(profile, { origin: 'unknown', at })[profile.business.phone.id].status, 'unassessed')
})

test('assessment tolerates provider values in extension facts without coercing their types', () => {
  const profile = profileOf()
  profile.extensions['sender:extra'] = {
    id: 'extra-fact',
    value: { restrictions: 7, asOf: { toString: 'provider-value' }, publishedAt: [] },
    evidenceRefs: profile.business.name.evidenceRefs
  }
  const facts = byId(profile, { origin: 'sender', at })
  assert.equal(facts['extra-fact'].status, 'unassessed')
  assert.deepEqual(facts['extra-fact'].reasonCodes, ['sender-unsupported-fact'])
})

test('the origin-only call assesses staleness against the current clock', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) })
  const profile = profileOf()
  profile.sources.forEach((source) => {
    source.collectedAt = '2020-01-01T00:00:00Z'
  })
  assert.equal(byId(profile, { origin: 'research' })[profile.business.phone.id].status, 'stale')
})
