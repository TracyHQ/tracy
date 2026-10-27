// Approving a join request ADDS the person at once (Akemi 04/10/2026): one role pick, one call, and
// the seat is accepted. No invitation wizard, no "Seats are granted when they accept".
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approvalOutcome, approveRequestInit, approveRolesFor } from '../src/team/roster.ts'

test('the approve call is the invite door for that one address and site, in the chosen role', () => {
  const init = approveRequestInit({ siteKey: 'kinetic.vn', email: 'vincent@lab3.example', role: 'viewer' })
  assert.equal(init.method, 'POST')
  assert.deepEqual(JSON.parse(init.body), {
    emails: ['vincent@lab3.example'],
    role: 'viewer',
    siteKeys: ['kinetic.vn']
  })
})

test('only an "approved" answer counts as approved; anything else is said as such', () => {
  const answer = (outcome) => ({
    results: [{ email: 'vincent@lab3.example', sites: [{ siteKey: 'kinetic.vn', outcome }] }]
  })
  assert.equal(approvalOutcome(answer('approved'), 'kinetic.vn'), 'approved')
  assert.equal(approvalOutcome(answer('invited'), 'kinetic.vn'), 'invited')
  assert.equal(approvalOutcome(null, 'kinetic.vn'), 'unknown')
})

test('only an Owner approves, offering Editor (the default) then Viewer (ADR 0028)', () => {
  assert.deepEqual(approveRolesFor('owner'), ['editor', 'viewer'])
  assert.deepEqual(approveRolesFor('editor'), [])
  assert.deepEqual(approveRolesFor('viewer'), [])
  assert.deepEqual(approveRolesFor(null), [])
})

test('a seat its holder gave up reads "Left", a removal still reads "Revoked"', async () => {
  const { closedAs } = await import('../src/team/roster.ts')
  assert.deepEqual(closedAs({ removalKind: 'left' }), { statusKey: 'status.left', accessKey: 'access.left' })
  assert.deepEqual(closedAs({ removalKind: 'revoke' }), {
    statusKey: 'status.revoked',
    accessKey: 'access.revoked'
  })
  assert.deepEqual(closedAs({ removalKind: null }), {
    statusKey: 'status.revoked',
    accessKey: 'access.revoked'
  })
})
