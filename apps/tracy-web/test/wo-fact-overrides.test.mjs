// The owner's on/off choice for one fact (#1791) is kept on the opportunity, not on a revision: every revision made
// after it, Research again included, freezes the same decision.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { freezePlaceProfile } from '../src/opportunities-build/profile-revision.js'

const research = (candidate, collectedAt) => ({
  opportunity: {
    provider: 'google',
    providerId: 'place-hsc',
    name: 'Harbour Sport Club',
    candidate
  },
  profile: { name: 'Harbour Sport Club', phone: '+971 50 123 4567', hours: ['Monday: Open 24 hours'] },
  brand: {},
  rawSources: [
    { source: 'website', status: 'complete', ref: 'https://hsc.example', collected_at: collectedAt }
  ],
  media: [],
  posts: []
})
const factOf = (frozen, id) => frozen.assessment.facts.find((f) => f.factId === id)

test('an owner override survives a second revision made after Research again', () => {
  const first = freezePlaceProfile({
    research: research({}, '2026-10-20T00:00:00Z'),
    at: '2026-10-21T00:00:00Z'
  })
  const phone = first.profile.business.phone.id
  assert.equal(factOf(first, phone).onSite, true)
  assert.equal(factOf(first, phone).decidedBy, 'rule')

  const candidate = { factOverrides: { [phone]: { onSite: false, at: '2026-10-22T00:00:00Z' } } }
  const second = freezePlaceProfile({
    research: research(candidate, '2026-10-20T00:00:00Z'),
    at: '2026-10-22T00:00:00Z'
  })
  const again = freezePlaceProfile({
    research: research(candidate, '2026-10-27T00:00:00Z'),
    at: '2026-10-27T00:00:00Z'
  })
  for (const frozen of [second, again]) {
    assert.equal(frozen.profile.business.phone.id, phone, 'a fact keeps its id across research')
    assert.equal(factOf(frozen, phone).onSite, false)
    assert.equal(factOf(frozen, phone).decidedBy, 'owner')
  }
})

test('an override for a fact that research no longer finds is inert, and explicit overrides win over the candidate', () => {
  const candidate = { factOverrides: { fact_gone: { onSite: true } } }
  const frozen = freezePlaceProfile({
    research: research(candidate, '2026-10-20T00:00:00Z'),
    at: '2026-10-21T00:00:00Z'
  })
  assert.ok(!frozen.assessment.facts.some((f) => f.factId === 'fact_gone'))
  assert.ok(frozen.assessment.facts.every((f) => f.decidedBy === 'rule'))
  const phone = frozen.profile.business.phone.id
  const explicit = freezePlaceProfile({
    research: research(candidate, '2026-10-20T00:00:00Z'),
    at: '2026-10-21T00:00:00Z',
    overrides: { [phone]: { onSite: false } }
  })
  assert.equal(factOf(explicit, phone).decidedBy, 'owner')
})
