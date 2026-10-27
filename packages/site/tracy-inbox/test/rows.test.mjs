/**
 * Every notification kind of spec #809 step 1 → the sentence key, its values, the quote, the
 * context line and where a press goes. The log stores no sentence, so this table IS the copy's
 * wiring: a kind that lands on the wrong key shows the wrong sentence in eight languages at once.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { actorName, describe } from '../src/client/rows.ts'
import { en } from '../src/client/strings.ts'

const LEE = { id: 'a1', email: 'lee@lab3.example', name: 'Lee' }
const row = (kind, data = {}, extra = {}) => ({
  id: 'n1',
  kind,
  siteKey: 'kinetic.vn',
  actor: LEE,
  data,
  settledAt: null,
  createdAt: '2026-10-03T10:00:00.000Z',
  readAt: null,
  ...extra
})

/** The two English lines a row shows (Figma layout), the site inside the phrase (option F). */
function sentence(view) {
  const params = { ...view.params, site: view.context.site ?? '' }
  if (view.asRole !== null) params.asRole = en[`asRole.${view.asRole}`]
  if (view.role !== null) params.role = en[`role.${view.role}`]
  const action = en[view.key].replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)
  const title = view.actorName ?? view.context.site ?? ''
  return `${title} | ${action}`
}

test('every team kind reads the approved English sentence', () => {
  const cases = [
    ['team.invited', { role: 'editor' }, 'Lee | Invited you as an Editor on kinetic.vn'],
    ['team.invited', { role: 'viewer' }, 'Lee | Invited you as a Viewer on kinetic.vn'],
    // A row written before ADR 0028 reads as the role that seat holds now.
    ['team.invited', { role: 'developer' }, 'Lee | Invited you as an Editor on kinetic.vn'],
    ['team.join_request', {}, 'Lee | Asked to join kinetic.vn'],
    [
      'team.join_answered',
      { decision: 'approved', requesterName: 'Vincent', role: 'editor' },
      'Lee | Approved Vincent’s request to join kinetic.vn'
    ],
    [
      'team.join_answered',
      { decision: 'declined', requesterName: 'Vincent' },
      'Lee | Declined Vincent’s request to join kinetic.vn'
    ],
    ['team.approved', { role: 'editor' }, 'Lee | Approved your request to join kinetic.vn'],
    ['team.declined', {}, 'Lee | Your request to join kinetic.vn was declined'],
    ['team.invite_accepted', { role: 'editor' }, 'Lee | Accepted your invitation to kinetic.vn'],
    ['team.invite_declined', {}, 'Lee | Declined your invitation to kinetic.vn'],
    ['team.joined', { role: 'editor' }, 'Lee | Joined kinetic.vn as an Editor'],
    ['team.removed', {}, 'Lee | Removed you from kinetic.vn'],
    ['team.role_changed', { to: 'viewer' }, 'Lee | Changed your role on kinetic.vn to Viewer'],
    ['team.role_changed', { to: 'admin' }, 'Lee | Changed your role on kinetic.vn to Editor'],
    ['team.left', { role: 'editor' }, 'Lee | Left kinetic.vn'],
    ['team.invite_cancelled', {}, 'Lee | Cancelled your invitation to kinetic.vn'],
    [
      'team.site_restored',
      { backup: 'Before the menu change', version: 3 },
      'Lee | Restored kinetic.vn to the backup “Before the menu change”'
    ],
    ['team.site_deleted', { siteName: 'kinetic.vn' }, 'Lee | Deleted kinetic.vn'],
    ['team.site_renamed', { oldSite: 'kinetic-old.vn' }, 'Lee | Renamed kinetic-old.vn to kinetic.vn'],
    ['team.edit_access_request', {}, 'Lee | Asked for edit access on kinetic.vn'],
    [
      'team.edit_access_answered',
      { decision: 'approved', requesterName: 'Vincent', role: 'editor' },
      'Lee | Approved Vincent’s request for edit access on kinetic.vn'
    ],
    [
      'team.edit_access_answered',
      { decision: 'declined', requesterName: 'Vincent' },
      'Lee | Declined Vincent’s request for edit access on kinetic.vn'
    ],
    [
      'team.edit_access_approved',
      { role: 'editor' },
      'Lee | Approved your request for edit access on kinetic.vn'
    ],
    ['team.edit_access_declined', {}, 'Lee | Your request for edit access on kinetic.vn was declined']
  ]
  for (const [kind, data, expected] of cases) {
    const view = describe(row(kind, data))
    assert.ok(view, kind)
    assert.equal(sentence(view), expected, kind)
    assert.equal(view.context.place, 'team', kind)
  }
})

test('every comment kind reads the approved English sentence, with its quote', () => {
  const quote = { quote: 'is this banner colour approved?', page: 'Home page', n: 9 }
  const cases = [
    ['comment.mention', quote, 'Lee | Mentioned you on kinetic.vn'],
    ['comment.reply', { ...quote, yours: true }, 'Lee | Replied to your comment on kinetic.vn'],
    ['comment.reply', { ...quote, yours: false }, 'Lee | Replied in a thread you’re in on kinetic.vn'],
    ['comment.resolved', quote, 'Lee | Resolved your comment on kinetic.vn'],
    ['comment.reopened', quote, 'Lee | Reopened your comment on kinetic.vn']
  ]
  for (const [kind, data, expected] of cases) {
    const view = describe(row(kind, data))
    assert.ok(view, kind)
    assert.equal(sentence(view), expected, kind)
    assert.deepEqual(view.quote, { text: 'is this banner colour approved?' }, kind)
    assert.deepEqual(view.context, { place: 'comment', site: 'kinetic.vn', page: 'Home page', role: null })
    assert.deepEqual(view.target, { kind: 'comments', siteKey: 'kinetic.vn', page: 'Home page' })
  }
})

test('a deleted comment keeps its row, the quote replaced by who deleted it (R3)', () => {
  const view = describe(row('comment.mention', { quote: 'gone', deleted: true }))
  assert.deepEqual(view.quote, { deletedBy: 'Lee' })
})

test('a join request offers Review on the asker until it is settled', () => {
  const open = describe(
    row('team.join_request', {}, { actor: { id: 'v', email: 'vincent@lab3.example', name: 'Vincent' } })
  )
  assert.equal(open.action, 'review')
  assert.deepEqual(open.target, { kind: 'team', siteKey: 'kinetic.vn', member: 'vincent@lab3.example' })
  const settled = describe(row('team.join_request', {}, { settledAt: '2026-10-03T11:00:00.000Z' }))
  assert.equal(settled.action, null)
})

test('a request for edit access offers Review on the Viewer until any Owner answered (ADR 0028 §6)', () => {
  const open = describe(
    row(
      'team.edit_access_request',
      {},
      { actor: { id: 'v', email: 'vincent@lab3.example', name: 'Vincent' } }
    )
  )
  assert.equal(open.action, 'review')
  assert.deepEqual(open.target, { kind: 'team', siteKey: 'kinetic.vn', member: 'vincent@lab3.example' })
  const settled = describe(
    row('team.edit_access_request', { outcome: 'declined' }, { settledAt: '2026-10-08T11:00:00.000Z' })
  )
  assert.equal(settled.action, null)
  assert.equal(settled.outcome, 'declined')
  assert.equal(
    describe(row('team.edit_access_approved', {}, { actor: null })).key,
    'act.team.editAccessGrantedPassive'
  )
  assert.equal(describe(row('team.edit_access_answered', { decision: 'maybe', requesterName: 'V' })), null)
})

test('an invitation offers Accept / Decline until it is answered anywhere', () => {
  assert.equal(describe(row('team.invited', { role: 'editor' })).action, 'answer')
  assert.equal(describe(row('team.invited', {})).action, 'answer')
  const answered = describe(
    row('team.invited', { role: 'editor' }, { settledAt: '2026-10-03T11:00:00.000Z' })
  )
  assert.equal(answered.action, null)
})

test('rows with nothing to open: removed, invitation cancelled, request declined', () => {
  for (const kind of ['team.removed', 'team.invite_cancelled', 'team.declined'])
    assert.equal(describe(row(kind)).target, null, kind)
  assert.deepEqual(describe(row('team.left')).target, { kind: 'team', siteKey: 'kinetic.vn' })
})

test('the context line of a team row names the role when the row carries one', () => {
  assert.equal(describe(row('team.invite_accepted', { role: 'editor' })).context.role, 'editor')
  assert.equal(describe(row('team.invite_accepted', {})).context.role, null)
  // The sentence already says the new role.
  assert.equal(describe(row('team.role_changed', { to: 'admin' })).context.role, null)
})

test('an unknown kind, or a kind missing what its sentence needs, is skipped', () => {
  assert.equal(describe(row('agent.finished')), null)
  assert.equal(describe(row('team.role_changed', { to: 'boss' })), null)
  assert.equal(describe(row('team.join_answered', { decision: 'maybe', requesterName: 'V' })), null)
  assert.equal(describe(row('team.join_answered', { decision: 'approved' })), null)
  assert.equal(describe(row('team.joined', { role: 'editor' }, { actor: null })), null)
  assert.equal(describe(row('comment.mention', {}, { actor: null })), null)
  assert.equal(describe(null), null)
})

test('a role the row does not carry falls back to the sentence without one', () => {
  assert.equal(sentence(describe(row('team.invited', {}))), 'Lee | Invited you to kinetic.vn')
  assert.equal(sentence(describe(row('team.joined', { role: 'chief' }))), 'Lee | Joined kinetic.vn')
})

test('the actor is named by the account name, else the local part of the address', () => {
  assert.equal(actorName({ id: 'x', email: 'hano@lab3.example', name: null }), 'hano')
  assert.equal(actorName({ id: 'x', email: 'hano@lab3.example', name: '  ' }), 'hano')
  assert.equal(actorName({ id: 'x', email: 'hano@lab3.example', name: 'Hano' }), 'Hano')
  assert.equal(actorName(null), null)
})

test('a renamed site reads by its current name; targets and links keep the key (Akemi 04/10)', () => {
  const view = describe(row('team.joined', { role: 'editor' }, { siteName: 'kinetic.com' }))
  assert.equal(sentence(view), 'Lee | Joined kinetic.com as an Editor')
  assert.deepEqual(view.target, { kind: 'team', siteKey: 'kinetic.vn' })
  const comment = describe(
    row('comment.mention', { quote: 'hi', commentId: 'c1' }, { siteName: 'kinetic.com' })
  )
  assert.equal(comment.context.site, 'kinetic.com')
  assert.equal(comment.target.siteKey, 'kinetic.vn')
  // An older server sends no siteName: the key is shown, as before.
  assert.equal(describe(row('team.left', { role: 'editor' })).context.site, 'kinetic.vn')
})

test('T14: each rename reads the two names of that step, not the name the site has now', () => {
  // E2E dev 04/10 E9.1b: wp → wpx → wp read "Renamed wp to wp" on the first row, because the "to"
  // side was the site's name today. The row keeps the name it was given at that step.
  const first = row(
    'team.site_renamed',
    { oldSite: 'e2e04-wp.tracy.site', newSite: 'e2e04-wpx.tracy.site' },
    { siteKey: 'e2e04-wp.tracy.site', siteName: 'e2e04-wp.tracy.site' }
  )
  const second = row(
    'team.site_renamed',
    { oldSite: 'e2e04-wpx.tracy.site', newSite: 'e2e04-wp.tracy.site' },
    { siteKey: 'e2e04-wp.tracy.site', siteName: 'e2e04-wp.tracy.site' }
  )
  assert.equal(sentence(describe(first)), 'Lee | Renamed e2e04-wp.tracy.site to e2e04-wpx.tracy.site')
  assert.equal(sentence(describe(second)), 'Lee | Renamed e2e04-wpx.tracy.site to e2e04-wp.tracy.site')
  // The press still finds the site by its key today.
  assert.deepEqual(describe(first).target, { kind: 'team', siteKey: 'e2e04-wp.tracy.site' })
  // A row written before `newSite` was stored reads the site's name now, as before.
  const old = row('team.site_renamed', { oldSite: 'a.vn' }, { siteName: 'b.vn' })
  assert.equal(sentence(describe(old)), 'Lee | Renamed a.vn to b.vn')
})

test('T12–T14: a deleted site is never a link and opens nothing; the others are links', () => {
  const deleted = describe(row('team.site_deleted', { siteName: 'kinetic.vn' }))
  assert.equal(deleted.siteLink, false)
  assert.equal(deleted.target, null)
  assert.equal(describe(row('team.site_restored', { backup: 'B' })).siteLink, true)
  assert.equal(describe(row('team.site_renamed', { oldSite: 'a.vn' })).siteLink, true)
  // T12 opens the site's Site changes tab: the restore is a row of that ledger, lit as new, and the
  // badge clears in the same press. T14 keeps the Team tab: a rename is not a ledger row.
  assert.deepEqual(describe(row('team.site_restored', { backup: 'B' })).target, {
    kind: 'changes',
    siteKey: 'kinetic.vn'
  })
  assert.deepEqual(describe(row('team.site_renamed', { oldSite: 'a.vn' })).target, {
    kind: 'team',
    siteKey: 'kinetic.vn'
  })
  // Missing what the sentence needs: skipped, never a sentence with a hole.
  assert.equal(describe(row('team.site_restored', {})), null)
  assert.equal(describe(row('team.site_renamed', {})), null)
  assert.equal(describe(row('team.site_deleted', {}, { actor: null })), null)
})

test('describe: a settled invitation carries its recorded outcome, nothing else does', () => {
  const base = {
    id: 'x',
    kind: 'team.invited',
    siteKey: 'a.test',
    actor: { id: 'a', email: 'lee@lab3.example', name: 'Lee' },
    createdAt: '2026-10-04T00:00:00Z',
    readAt: null
  }
  assert.equal(
    describe({ ...base, data: { role: 'editor', outcome: 'accepted' }, settledAt: '2026-10-04T01:00:00Z' })
      .outcome,
    'accepted'
  )
  assert.equal(
    describe({ ...base, data: { role: 'editor', outcome: 'declined' }, settledAt: '2026-10-04T01:00:00Z' })
      .outcome,
    'declined'
  )
  assert.equal(
    describe({ ...base, data: { role: 'editor', outcome: 'weird' }, settledAt: '2026-10-04T01:00:00Z' })
      .outcome,
    null
  )
  assert.equal(
    describe({ ...base, data: { role: 'editor', outcome: 'accepted' }, settledAt: null }).outcome,
    null
  )
  assert.equal(
    describe({ ...base, kind: 'team.joined', data: { role: 'editor', outcome: 'accepted' }, settledAt: null })
      .outcome,
    null
  )
})

test('describe: T2b names the requester by the actor rule, even when an old row stored the address as the name', () => {
  const base = {
    id: 'x',
    kind: 'team.join_answered',
    siteKey: 'a.test',
    actor: { id: 'a', email: 'lee@lab3.example', name: 'Lee' },
    settledAt: null,
    createdAt: '2026-10-04T00:00:00Z',
    readAt: null
  }
  const of = (data) =>
    describe({ ...base, data: { decision: 'approved', role: 'editor', ...data } }).params.requester
  assert.equal(of({ requesterName: 'Brian', requesterEmail: 'brian@lab3.example' }), 'Brian')
  assert.equal(of({ requesterName: null, requesterEmail: 'brian@lab3.example' }), 'brian')
  assert.equal(of({ requesterName: 'brian@lab3.example', requesterEmail: 'brian@lab3.example' }), 'brian')
})

test('an outcome word agrees with its noun: a declined request has its own key (Italian "Rifiutata")', async () => {
  const { outcomeKeyOf } = await import('../src/client/rows.ts')
  assert.equal(outcomeKeyOf('team.invited', 'accepted'), 'outcome.accepted')
  assert.equal(outcomeKeyOf('team.invited', 'declined'), 'outcome.declined')
  assert.equal(outcomeKeyOf('team.join_request', 'approved'), 'outcome.approved')
  assert.equal(outcomeKeyOf('team.join_request', 'declined'), 'outcome.requestDeclined')
  assert.equal(en['outcome.requestDeclined'], 'Declined')
})
