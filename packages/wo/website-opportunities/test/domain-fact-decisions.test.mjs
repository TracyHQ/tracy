// May this fact go on the site (#1791): code decides from rules, the owner's choice on the Profile card wins.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALLOWED_INFERRED_KINDS, assessProfile, factDecisions } from '../domain/fact-assessment.mjs'
import { emptyPlaceProfile } from '../domain/place-profile.mjs'

const AT = '2026-10-27T00:00:00.000Z'

function harbourSportClub() {
  const profile = emptyPlaceProfile('business_dsc')
  profile.madeAt = AT
  for (const id of ['google', 'instagram', 'magicpin']) {
    profile.sources.push({
      id,
      kind: 'website',
      ref: `https://${id}.example`,
      collectedAt: '2026-10-20T00:00:00.000Z'
    })
    profile.evidence.push({
      id: `ev_${id}`,
      sourceId: id,
      locator: { kind: 'url', value: `https://${id}.example` },
      extraction: { method: 'test', version: '1' }
    })
  }
  const check = (code) => ({ method: 'on-site-check', version: 'on-site-check/1', reason: `${code}: why` })
  profile.business.name = {
    id: 'fact_name',
    value: 'Harbour Sport Club',
    evidenceRefs: ['ev_google', 'ev_instagram']
  }
  profile.business.phone = { id: 'fact_phone', value: '+971 50 123 4567', evidenceRefs: ['ev_google'] }
  profile.business.hours = {
    id: 'fact_hours',
    value: ['Monday: Open 24 hours'],
    evidenceRefs: ['ev_google'],
    derivation: check('implausible-all-week-hours')
  }
  profile.claims.statistics.push(
    {
      id: 'fact_rating',
      value: { label: 'rating', value: 5 },
      evidenceRefs: ['ev_google'],
      derivation: check('few-reviews')
    },
    { id: 'fact_followers', value: { label: 'followers', value: 1200 }, evidenceRefs: ['ev_instagram'] }
  )
  profile.people.push({
    id: 'fact_coach',
    value: { name: 'Alex' },
    evidenceRefs: ['ev_google'],
    derivation: check('review-only-person')
  })
  profile.links.push({
    id: 'fact_whatsapp',
    value: { kind: 'whatsapp', url: 'https://wa.me/971501234567' },
    evidenceRefs: ['ev_google'],
    derivation: {
      method: 'inferred',
      version: 'business-phones/1',
      inputRefs: ['fact_phone'],
      reason: 'whatsapp-uae-mobile: the main phone is a UAE mobile number'
    }
  })
  profile.links.push({
    id: 'fact_telegram',
    value: { kind: 'telegram', url: 'https://t.me/harboursportclub' },
    evidenceRefs: ['ev_google'],
    derivation: {
      method: 'inferred',
      version: '1',
      inputRefs: ['fact_phone'],
      reason: 'telegram-guess: never stated'
    }
  })
  return profile
}

const decide = (profile, overrides) => factDecisions(profile, { overrides, at: AT })

test('every assessed fact carries confidence, on-site decision, who decided and why', () => {
  const rows = assessProfile(harbourSportClub(), { origin: 'research', at: AT })
  for (const row of rows) {
    assert.ok(['corroborated', 'single-source', 'inferred'].includes(row.confidence), row.factId)
    assert.equal(typeof row.onSite, 'boolean')
    assert.equal(row.decidedBy, 'rule')
    assert.ok(Array.isArray(row.reasons))
    assert.equal(row.policyVersion, 'demo-evidence/2')
  }
})

test('the rule: sourced facts go on, facts with a reason to doubt stay off with the reason', () => {
  const d = decide(harbourSportClub())
  assert.deepEqual(d.get('fact_name'), {
    confidence: 'corroborated',
    onSite: true,
    decidedBy: 'rule',
    reasons: ['research-evidence']
  })
  assert.equal(d.get('fact_phone').confidence, 'single-source')
  assert.equal(d.get('fact_phone').onSite, true)
  assert.equal(d.get('fact_followers').onSite, true)
  for (const [id, code] of [
    ['fact_hours', 'implausible-all-week-hours'],
    ['fact_rating', 'few-reviews'],
    ['fact_coach', 'review-only-person']
  ]) {
    assert.equal(d.get(id).onSite, false, id)
    assert.ok(d.get(id).reasons.includes(code), id)
  }
})

test('the inferred UAE-mobile WhatsApp goes on, labelled inferred; an inferred kind not on the list stays off', () => {
  assert.deepEqual([...ALLOWED_INFERRED_KINDS], ['whatsapp-uae-mobile'])
  const d = decide(harbourSportClub())
  assert.equal(d.get('fact_whatsapp').confidence, 'inferred')
  assert.equal(d.get('fact_whatsapp').onSite, true)
  assert.ok(d.get('fact_whatsapp').reasons.includes('allowed-inferred-kind'))
  assert.equal(d.get('fact_telegram').confidence, 'inferred')
  assert.equal(d.get('fact_telegram').onSite, false)
  assert.ok(d.get('fact_telegram').reasons.includes('inferred-kind-not-allowed'))
  const rows = assessProfile(harbourSportClub(), { origin: 'research', at: AT })
  assert.equal(
    rows.find((r) => r.factId === 'fact_telegram').status,
    'withheld',
    'status readers withhold it too'
  )
  assert.equal(rows.find((r) => r.factId === 'fact_rating').status, 'withheld')
})

test('the owner overrides the rule both ways, keyed by fact id', () => {
  const d = decide(harbourSportClub(), { fact_rating: { onSite: true }, fact_phone: { onSite: false } })
  assert.equal(d.get('fact_rating').onSite, true)
  assert.equal(d.get('fact_rating').decidedBy, 'owner')
  assert.ok(d.get('fact_rating').reasons.includes('few-reviews'), 'the rule reason is still shown')
  assert.ok(d.get('fact_rating').reasons.includes('owner-override'))
  assert.equal(d.get('fact_phone').onSite, false)
  assert.equal(d.get('fact_phone').decidedBy, 'owner')
  assert.equal(d.get('fact_name').decidedBy, 'rule')
})

test('an override for a fact id that no longer exists is inert', () => {
  const plain = decide(harbourSportClub())
  const withGone = decide(harbourSportClub(), { fact_gone: { onSite: true }, fact_hours: false })
  assert.equal(withGone.has('fact_gone'), false)
  assert.equal(withGone.size, plain.size)
  assert.equal(withGone.get('fact_hours').decidedBy, 'owner', 'a bare boolean is read as onSite')
  assert.equal(withGone.get('fact_name').onSite, plain.get('fact_name').onSite)
})

test('a Map of overrides and a malformed override are read safely', () => {
  const d = decide(harbourSportClub(), new Map([['fact_rating', { onSite: true }]]))
  assert.equal(d.get('fact_rating').onSite, true)
  const bad = decide(harbourSportClub(), { fact_rating: { onSite: 'yes' } })
  assert.equal(bad.get('fact_rating').decidedBy, 'rule')
})
