import assert from 'node:assert/strict'
import test from 'node:test'
import { draftActions, visibleRecipients, simulationReason } from '../src/invitations/review-state.ts'

const recipient = (overrides = {}) => ({
  id: 'one',
  email: 'one@example.test',
  group: 'group_1',
  state: 'draft',
  firstName: 'Sandbox Friend',
  messages: [],
  attempts: [],
  draft: { subject: 'Hello', bodyText: 'Invitation', approved: false, revision: 1, contentHash: 'a' },
  ...overrides
})
test('unchanged draft can be approved, but saving requires changes', () => {
  const actions = draftActions(recipient(), 'Hello', 'Invitation', true, false)
  assert.ok(actions.saveReason)
  assert.equal(actions.approveReason, '')
  const changed = draftActions(recipient(), 'Edited', 'Invitation', true, false)
  assert.equal(changed.saveReason, '')
  assert.ok(changed.approveReason)
})
test('suppressed and attempted recipients remain read-only even if their draft is approved', () => {
  for (const r of [
    recipient({ state: 'suppressed' }),
    recipient({ attempts: [{ id: 'a', state: 'simulated' }] })
  ]) {
    const actions = draftActions(r, 'Edited', 'Invitation', true, false)
    assert.equal(actions.editable, false)
    assert.ok(actions.saveReason)
    assert.ok(actions.approveReason)
  }
})
test('busy, missing permission, invalid text and approved content explain blocked actions', () => {
  for (const [subject, writable, busy] of [
    ['', true, false],
    ['Hello', false, false],
    ['Hello', true, true],
    ['Bad\nHeader', true, false]
  ]) {
    const actions = draftActions(recipient(), subject, 'Invitation', writable, busy)
    assert.ok(actions.saveReason)
    assert.ok(actions.approveReason)
  }
  const r = recipient()
  r.draft.approved = true
  assert.ok(draftActions(r, 'Hello', 'Invitation', true, false).approveReason)
})
test('review and conversations expose different records and group/search/status filters combine', () => {
  const rows = [
    recipient(),
    recipient({ id: 'two', email: 'two@example.test', group: 'group_2', draft: null }),
    recipient({
      id: 'three',
      state: 'suppressed',
      messages: [{ id: 'm', direction: 'inbound', bodyText: 'STOP', createdAt: '' }]
    })
  ]
  assert.deepEqual(
    visibleRecipients(rows, 'review', '', '', '').map((r) => r.id),
    ['one', 'three']
  )
  assert.deepEqual(
    visibleRecipients(rows, 'conversations', '', '', '').map((r) => r.id),
    ['three']
  )
  assert.deepEqual(
    visibleRecipients(rows, 'recipients', 'group_2', '', 'two').map((r) => r.id),
    ['two']
  )
  assert.deepEqual(
    visibleRecipients(rows, 'review', 'group_1', 'needs_review', '').map((r) => r.id),
    ['one']
  )
})
test('simulation is blocked by unsaved work and needs an approved editable draft', () => {
  const r = recipient()
  r.draft.approved = true
  assert.ok(simulationReason([r], true, false, true))
  assert.equal(simulationReason([r], true, false, false), '')
  assert.ok(simulationReason([{ ...r, state: 'suppressed' }], true, false, false))
})
