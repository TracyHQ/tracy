import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateEligibility } from '../src/invitations/eligibility.js'
import { previewRows } from '../src/invitations/import.js'
import { renderTemplate } from '../src/invitations/render.js'

const NOW = '2026-10-08T09:10:00.000Z'
const POLICY = { version: 'fixture-policy', maxAgeMs: 900000, requiredSendyCoverage: ['fixture-brand'] }

function preview(rows) {
  return previewRows({
    headers: ['Email', 'Member', 'Group', 'Name', 'Plan', 'OptOut'],
    rows,
    mapping: {
      Email: 'email',
      Member: 'source_member_id',
      Group: 'group_key',
      Name: 'first_name',
      Plan: 'plan',
      OptOut: 'global_unsubscribed'
    },
    sourceChecksum: 'a'.repeat(64),
    schemaVersion: 'invitations-v1',
    groupCatalogue: { version: 'fixture-groups', keys: ['one', 'two', 'three', 'four', 'five'] }
  })
}

function facts(memberIds = ['member-one']) {
  const meta = {
    status: 'known',
    sourceVersion: 'fixture-source',
    memberIds,
    asOf: '2026-10-08T09:00:00.000Z',
    checkedAt: '2026-10-08T09:05:00.000Z',
    validUntil: '2026-10-08T09:30:00.000Z',
    evidenceRefs: ['fixture-evidence']
  }
  return {
    membership: {
      ...meta,
      value: { eligible: true, expiresAt: '2026-11-01T00:00:00.000Z', lifetime: false }
    },
    marketingBasis: { ...meta, value: 'allowed' },
    amember: { ...meta, value: { globalUnsubscribed: false } },
    sendy: { ...meta, value: { state: 'clear', coverage: ['fixture-brand'] } },
    tracy: { ...meta, value: { suppressed: false } }
  }
}

function evaluate(candidate, currentFacts) {
  return evaluateEligibility({ candidate, currentFacts, knownSuppressions: [], policy: POLICY, now: NOW })
}

test('preview alone never supplies eligibility, but complete current facts can qualify the same candidate', () => {
  const candidate = preview([['person@example.test', 'member-one', 'one', '', 'Annual', '0']]).candidates[0]
  assert.equal(candidate.state, 'recheck')
  assert.equal(evaluate(candidate).state, 'recheck')
  const decision = evaluate(candidate, facts())
  assert.equal(decision.state, 'ready')
  assert.equal(decision.validUntil, '2026-10-08T09:15:00.000Z')
  assert.equal(candidate.state, 'recheck')
})

test('rejected duplicate identities still demand current fact coverage before eligibility', () => {
  const candidate = preview([
    ['person@example.test', 'member-one', 'one', '', 'Annual', '0'],
    ['person@example.test', 'member-two', 'invalid-group', '', 'Annual', '0']
  ]).candidates[0]
  assert.equal(evaluate(candidate, facts()).state, 'recheck')
  assert.ok(evaluate(candidate, facts()).reasons.includes('AMEMBER_MEMBER_COVERAGE_INCOMPLETE'))
})

test('an opt-out on a rejected source row survives preview and positive current fixtures', () => {
  const candidate = preview([
    ['person@example.test', 'member-one', 'one', '', 'Annual', '0'],
    ['person@example.test', 'member-two', 'invalid-group', '', 'Annual', '1']
  ]).candidates[0]
  const decision = evaluate(candidate, facts(['member-one', 'member-two']))
  assert.equal(decision.state, 'suppressed')
  assert.ok(decision.reasons.includes('PREVIEW_GLOBAL_UNSUBSCRIBED'))
  assert.equal(decision.validUntil, null)
})

test('uncertain imported flags remain review-required even with current positive fixtures', () => {
  const candidate = preview([['person@example.test', 'member-one', 'one', '', 'Annual', 'perhaps']])
    .candidates[0]
  assert.equal(candidate.needsReview, true)
  const decision = evaluate(candidate, facts())
  assert.equal(decision.state, 'recheck')
  assert.ok(decision.reasons.includes('CANDIDATE_REVIEW_REQUIRED'))
})

test('preview personalization renders text without changing source state or approving content', () => {
  const candidate = preview([['person@example.test', 'member-one', 'one', '', 'Annual', '0']]).candidates[0]
  const result = renderTemplate({
    template: {
      id: 'fixture-one',
      version: 'v1',
      subject: 'Hi {{first_name}}',
      paragraphs: [
        { text: 'Your plan is {{plan}}.' },
        { text: 'You used {{last_template}}.', whenPresent: 'last_template' },
        { text: 'Try Tracy: {{invitation_url}}' }
      ]
    },
    personalization: candidate.personalization,
    systemLinks: {
      invitationUrl: 'https://example.test/i/fixture',
      unsubscribeUrl: 'https://example.test/u/fixture'
    }
  })
  assert.equal(result.subject, 'Hi there')
  assert.equal(
    result.bodyText,
    'Your plan is Annual.\n\nTry Tracy: https://example.test/i/fixture\n\nUnsubscribe: https://example.test/u/fixture'
  )
  assert.ok(result.dependencyFields.includes('last_template'))
  assert.equal(result.usedFields.includes('last_template'), false)
  assert.equal(candidate.state, 'recheck')
  assert.equal(Object.hasOwn(result, 'approval'), false)
})
