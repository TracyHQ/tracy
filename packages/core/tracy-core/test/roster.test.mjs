#!/usr/bin/env node
/**
 * The seat book's rules as the My Sites tab applies them — `src/client/roster.ts`.
 *
 *   node --test packages/site/tracy-my-sites/test/roster.test.mjs
 *
 * What can go wrong here is not a look but an OFFER: an icon on a row the registry would refuse
 * (a 403 the reader did not earn), or a missing icon on a row it would accept (a change the
 * reader cannot make). Both are pure functions of the row and the viewer, so they are checked
 * here, against the same rules `tracy-desk` ships in its Team table.
 *
 * Node strips the types on import; nothing in `roster.ts` needs a build.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  actionsFor,
  editAccessAnswer,
  isEditRequest,
  agoOf,
  approveRolesFor,
  editsSite,
  roleAllows,
  roleLabelKey,
  seatRoleOf,
  viewsOnly,
  agoUnitsOf,
  assignableRoles,
  canInvite,
  closedAs,
  INVITABLE_ROLES,
  acceptedInviteRole,
  inviteRolesAcross,
  inviteRolesFor,
  isJoinRequest,
  PERMISSIONS,
  removalOf,
  removeLabelKey,
  runsSite,
  splitEmails,
  granterOf
} from '../src/team/roster.ts'

const row = (over = {}) => ({
  id: 'g1',
  email: 'ana@example.com',
  displayName: null,
  role: 'editor',
  status: 'active',
  grantedAt: '2026-09-01T00:00:00Z',
  grantedBy: 'lee@example.com',
  revokedAt: null,
  requestedAt: null,
  scope: 'site',
  ...over
})
const lee = { email: 'lee@example.com', role: 'owner' }
const editor = { email: 'ed@example.com', role: 'editor' }
const viewer = { email: 'vi@example.com', role: 'viewer' }

// ── ADR 0028: three roles, Viewer / Editor / Owner ──────────────────────────────────────────────

test('only an Owner runs a site', () => {
  assert.equal(runsSite('owner'), true)
  for (const role of ['editor', 'viewer', 'admin', 'developer', null, undefined, 'Owner'])
    assert.equal(runsSite(role), false, String(role))
})

test('an Owner and an Editor edit the site; a Viewer only views', () => {
  assert.equal(editsSite('owner'), true)
  assert.equal(editsSite('editor'), true)
  assert.equal(editsSite('viewer'), false)
  assert.equal(viewsOnly('viewer'), true)
  assert.equal(viewsOnly('editor'), false)
  assert.equal(viewsOnly(null), false)
})

test('a retired role from an older server reads as its successor, never as a raw code', () => {
  assert.equal(seatRoleOf('admin'), 'editor')
  assert.equal(seatRoleOf('developer'), 'editor')
  for (const role of ['owner', 'editor', 'viewer']) assert.equal(seatRoleOf(role), role)
  for (const none of [null, undefined, '', 'member', 'Owner', 'EDITOR', 'toString', 'constructor'])
    assert.equal(seatRoleOf(none), null, String(none))
  assert.equal(roleLabelKey('viewer'), 'role.viewer')
  assert.equal(roleLabelKey('admin'), 'role.editor')
  assert.equal(roleLabelKey('guest'), null)
})

// ── #798: who may invite whom — one description, read by the control, the site list and the roles ──

test('an Owner or an Editor invites a Viewer or an Editor; a Viewer invites nobody', () => {
  assert.deepEqual([...INVITABLE_ROLES], ['editor', 'viewer'])
  assert.deepEqual([...inviteRolesFor('owner')], ['editor', 'viewer'])
  assert.deepEqual([...inviteRolesFor('editor')], ['editor', 'viewer'])
  assert.deepEqual([...inviteRolesFor('viewer')], [])
  assert.equal(canInvite('owner'), true)
  assert.equal(canInvite('editor'), true)
  assert.equal(canInvite('viewer'), false)
  // Owner is made from the Team list, never by invitation.
  for (const role of ['owner', 'editor']) assert.ok(!inviteRolesFor(role).includes('owner'), role)
})

test('no accepted role, or a word the seat book does not have, invites nobody', () => {
  for (const none of [null, undefined, '', 'member', 'Owner', 'EDITOR', 'guest', 'invited']) {
    assert.deepEqual([...inviteRolesFor(none)], [], String(none))
    assert.equal(canInvite(none), false, String(none))
  }
})

test('several sites share one invitation: only the roles every one of them accepts', () => {
  assert.deepEqual([...inviteRolesAcross(['owner', 'editor'])], ['editor', 'viewer'])
  assert.deepEqual([...inviteRolesAcross(['editor'])], ['editor', 'viewer'])
  // Nowhere to invite to is no role, and one site that accepts nothing empties the choice.
  assert.deepEqual([...inviteRolesAcross([])], [])
  assert.deepEqual([...inviteRolesAcross(['owner', 'viewer'])], [])
  assert.deepEqual([...inviteRolesAcross(['owner', null])], [])
  assert.deepEqual([...inviteRolesAcross(['owner', 'member'])], [])
})

test('acceptedInviteRole: only an accepted seat with a readable book and an inviting role', () => {
  const site = (over) => ({
    siteKey: 'a.test',
    platform: null,
    myRole: 'editor',
    status: 'accepted',
    seats: [],
    ...over
  })
  for (const role of ['owner', 'editor']) assert.equal(acceptedInviteRole(site({ myRole: role })), role)
  assert.equal(acceptedInviteRole(site({ myRole: 'viewer' })), null)
  assert.equal(acceptedInviteRole(site({ myRole: 'admin' })), 'editor')
  assert.equal(acceptedInviteRole(site({ status: 'pending' })), null)
  assert.equal(acceptedInviteRole(site({ status: 'requested' })), null)
  assert.equal(acceptedInviteRole(site({ seats: null })), null)
  assert.equal(acceptedInviteRole(site({ myRole: null })), null)
  assert.equal(acceptedInviteRole(site({ myRole: 'member' })), null)
  assert.equal(acceptedInviteRole(undefined), null)
  assert.equal(acceptedInviteRole(null), null)
})

test('inviting is not running the site: an Editor and a Viewer get no row actions', () => {
  const other = row({ email: 'other@example.com' })
  for (const who of [editor, viewer])
    assert.deepEqual(actionsFor(other, who, 1), {
      changeRole: false,
      reinvite: false,
      approve: false,
      answerEdit: false,
      remove: false
    })
})

test('the permission table: each role adds to the one before it', () => {
  assert.deepEqual(
    PERMISSIONS.map((p) => `${p.key}:${p.from}`),
    [
      'permission.view:viewer',
      'permission.commentAsk:viewer',
      'permission.changeSite:editor',
      'permission.publish:editor',
      'permission.invite:editor',
      'permission.manageRoster:owner',
      'permission.domain:owner',
      'permission.makeOwner:owner',
      'permission.deleteSite:owner'
    ]
  )
  assert.equal(PERMISSIONS.filter((p) => roleAllows('viewer', p.from)).length, 2)
  assert.equal(PERMISSIONS.filter((p) => roleAllows('editor', p.from)).length, 5)
  assert.equal(PERMISSIONS.filter((p) => roleAllows('owner', p.from)).length, 9)
  // The legend never reads as "a Viewer can do nothing": its first rows hold for every role.
  for (const role of ['viewer', 'editor', 'owner'])
    assert.deepEqual(
      PERMISSIONS.slice(0, 2).map((p) => roleAllows(role, p.from)),
      [true, true]
    )
})

test('approving a request: only an Owner, offering Editor then Viewer', () => {
  assert.deepEqual([...approveRolesFor('owner')], ['editor', 'viewer'])
  assert.deepEqual([...approveRolesFor('editor')], [])
  assert.deepEqual([...approveRolesFor('viewer')], [])
  assert.deepEqual([...approveRolesFor(null)], [])
})

test('a join request is an invited row that carries requestedAt', () => {
  assert.equal(isJoinRequest(row({ status: 'invited', requestedAt: '2026-09-04T00:00:00Z' })), true)
  assert.equal(isJoinRequest(row({ status: 'invited' })), false)
  assert.equal(isJoinRequest(row({ status: 'active', requestedAt: '2026-09-04T00:00:00Z' })), false)
})

test('assignable roles: only an Owner, Editor / Viewer / Owner; the last owner cannot move', () => {
  assert.deepEqual(assignableRoles('owner', row(), 1), ['editor', 'viewer', 'owner'])
  assert.deepEqual(assignableRoles('owner', row({ role: 'viewer' }), 1), ['editor', 'viewer', 'owner'])
  assert.deepEqual(assignableRoles('owner', row({ role: 'owner' }), 1), [])
  assert.deepEqual(assignableRoles('owner', row({ role: 'owner' }), 2), ['editor', 'viewer', 'owner'])
  assert.deepEqual(assignableRoles('owner', row({ status: 'invited' }), 2), [])
  assert.deepEqual(assignableRoles('editor', row(), 2), [])
  assert.deepEqual(assignableRoles('viewer', row(), 2), [])
})

test('actions: an editor viewing the book is offered nothing', () => {
  const a = actionsFor(row(), editor, 1)
  assert.deepEqual(a, {
    changeRole: false,
    reinvite: false,
    approve: false,
    answerEdit: false,
    remove: false
  })
})

test('actions: an owner may change and remove an active editor, but not themselves', () => {
  assert.deepEqual(actionsFor(row(), lee, 1), {
    changeRole: true,
    reinvite: false,
    approve: false,
    answerEdit: false,
    remove: true
  })
  const self = actionsFor(row({ email: 'lee@example.com', role: 'owner' }), lee, 2)
  assert.equal(self.changeRole, false)
  assert.equal(self.remove, false)
})

test('actions: the last owner cannot be removed, even by another owner', () => {
  const a = actionsFor(row({ email: 'other@example.com', role: 'owner' }), lee, 1)
  assert.equal(a.remove, false)
})

test('actions: a request offers Approve and Decline, a declined seat offers Re-invite only', () => {
  const asked = actionsFor(row({ status: 'invited', requestedAt: '2026-09-04T00:00:00Z' }), lee, 1)
  assert.equal(asked.approve, true)
  assert.equal(asked.remove, true)
  assert.equal(asked.changeRole, false)
  // An Editor sees the request but cannot decide it (ADR 0028 §4).
  assert.equal(actionsFor(row({ status: 'invited', requestedAt: 'x' }), editor, 1).approve, false)
  const declined = actionsFor(row({ status: 'declined' }), lee, 1)
  assert.deepEqual(declined, {
    changeRole: false,
    reinvite: true,
    approve: false,
    answerEdit: false,
    remove: false
  })
})

test('actions: a Viewer asking for edit access is answered by an Owner only (ADR 0028 §6)', () => {
  const asking = row({ role: 'viewer', editRequestedAt: '2026-10-08T00:00:00Z' })
  assert.equal(isEditRequest(asking), true)
  assert.equal(isEditRequest(row({ role: 'viewer', editRequestedAt: null })), false)
  assert.equal(isEditRequest(row({ role: 'editor', editRequestedAt: '2026-10-08T00:00:00Z' })), false)
  assert.equal(actionsFor(asking, lee, 1).answerEdit, true)
  assert.equal(actionsFor(asking, editor, 1).answerEdit, false)
  assert.equal(actionsFor(asking, viewer, 1).answerEdit, false)
})

test('the edit-access answer names the seat and sends exactly {decision}', () => {
  const call = editAccessAnswer({ siteKey: 'one.example', seatId: 'a b', decision: 'decline' })
  assert.equal(call.path, '/api/sites/one.example/seats/a%20b/edit-access')
  assert.equal(call.init.method, 'POST')
  assert.deepEqual(JSON.parse(call.init.body), { decision: 'decline' })
})

test('actions: a seat inherited from the workspace gets no icon at all', () => {
  const a = actionsFor(row({ scope: 'workspace' }), lee, 1)
  assert.deepEqual(a, {
    changeRole: false,
    reinvite: false,
    approve: false,
    answerEdit: false,
    remove: false
  })
})

test('the destructive verb meets the person where they are', () => {
  assert.equal(removeLabelKey(row()), 'action.revoke')
  assert.equal(removeLabelKey(row({ status: 'invited' })), 'action.cancelInvite')
  assert.equal(removeLabelKey(row({ status: 'invited', requestedAt: 'x' })), 'action.declineRequest')
})

// ── #792: one control, one action ────────────────────────────────────────────────────────────────

test('each removal is one entry: its label, its consequence and the kind the write names', () => {
  const cases = [
    [row(), 'revoke', 'action.revoke', 'dialog.revokeConsequence'],
    // A request that was approved is a seat somebody holds: removing it is a revoke.
    [row({ requestedAt: '2026-09-04T00:00:00Z' }), 'revoke', 'action.revoke', 'dialog.revokeConsequence'],
    [row({ status: 'invited' }), 'cancel_invite', 'action.cancelInvite', 'dialog.cancelInviteConsequence'],
    [
      row({ status: 'invited', requestedAt: '2026-09-04T00:00:00Z' }),
      'decline_request',
      'action.declineRequest',
      'dialog.declineRequestConsequence'
    ]
  ]
  for (const [seat, kind, labelKey, consequenceKey] of cases) {
    assert.deepEqual(removalOf(seat), { kind, labelKey, consequenceKey })
    assert.equal(removeLabelKey(seat), labelKey)
  }
  // Three acts, no two of which share a word: a kind, a label or a consequence.
  const three = cases.slice(1).map(([seat]) => removalOf(seat))
  for (const field of ['kind', 'labelKey', 'consequenceKey'])
    assert.equal(new Set(three.map((r) => r[field])).size, 3, field)
})

test('a closed row is worded by the act that closed it, and by "Revoked" when the book does not say', () => {
  const closed = (removalKind) => closedAs(row({ status: 'revoked', revokedAt: 'x', removalKind }))
  assert.deepEqual(closed('revoke'), { statusKey: 'status.revoked', accessKey: 'access.revoked' })
  assert.deepEqual(closed('cancel_invite'), {
    statusKey: 'status.inviteCancelled',
    accessKey: 'access.inviteCancelled'
  })
  assert.deepEqual(closed('decline_request'), {
    statusKey: 'status.requestDeclined',
    accessKey: 'access.requestDeclined'
  })
  // Closed before the kind was stored, by a server that sends no such field, by the holder
  // leaving, or by a kind this build does not know: the act is not guessed.
  for (const unknown of [null, undefined, 'something_new', 'toString', 7])
    assert.deepEqual(closed(unknown), { statusKey: 'status.revoked', accessKey: 'access.revoked' })
  const { removalKind: _absent, ...older } = row({ status: 'revoked' })
  assert.deepEqual(closedAs(older), { statusKey: 'status.revoked', accessKey: 'access.revoked' })
})

test('a row that is already closed, however it was closed, offers no removal', () => {
  for (const removalKind of ['revoke', 'cancel_invite', 'decline_request', null]) {
    const a = actionsFor(row({ status: 'revoked', revokedAt: 'x', removalKind }), lee, 2)
    assert.deepEqual(a, {
      changeRole: false,
      reinvite: false,
      approve: false,
      answerEdit: false,
      remove: false
    })
  }
  // Declined by the invitee: Re-invite only, as before.
  assert.deepEqual(actionsFor(row({ status: 'declined' }), lee, 2), {
    changeRole: false,
    reinvite: true,
    approve: false,
    answerEdit: false,
    remove: false
  })
})

test('splitEmails takes a pasted list, lowercases, drops duplicates, keeps the rest in the box', () => {
  const { good, rest } = splitEmails('Ana@Example.com, bob@example.com ana@example.com not-an-address', [
    'bob@example.com'
  ])
  assert.deepEqual(good, ['ana@example.com'])
  assert.equal(rest, 'not-an-address')
})

test('agoOf rounds to the largest unit and survives a stamp that will not parse', () => {
  // Whole phrases with the number inside (02/10): a language orders the words, not the code.
  const unit = {
    justNow: 'just now',
    minute: (n) => `${n} minute ago`,
    minutes: (n) => `${n} minutes ago`,
    hour: (n) => `${n} hour ago`,
    hours: (n) => `${n} hours ago`,
    day: (n) => `${n} day ago`,
    days: (n) => `${n} days ago`
  }
  const now = Date.parse('2026-09-04T12:00:00Z')
  assert.equal(agoOf('2026-09-04T11:59:50Z', now, unit), 'just now')
  assert.equal(agoOf('2026-09-04T11:30:00Z', now, unit), '30 minutes ago')
  assert.equal(agoOf('2026-09-04T09:00:00Z', now, unit), '3 hours ago')
  assert.equal(agoOf('2026-09-01T12:00:00Z', now, unit), '3 days ago')
  // cowork.tracy.site, 29/09: the Team tab read "Granted 1 days ago". One of a unit is singular.
  assert.equal(agoOf('2026-09-04T11:59:00Z', now, unit), '1 minute ago')
  assert.equal(agoOf('2026-09-04T11:00:00Z', now, unit), '1 hour ago')
  assert.equal(agoOf('2026-09-03T12:00:00Z', now, unit), '1 day ago')
  assert.equal(agoOf('yesterday', now, unit), 'yesterday')
  assert.equal(agoOf(null, now, unit), '')
})

test('agoUnitsOf hands the count to t, so a language may put the number anywhere', () => {
  const de = {
    'ago.justNow': 'gerade eben',
    'ago.minute': 'vor {count} Minute',
    'ago.minutes': 'vor {count} Minuten',
    'ago.hour': 'vor {count} Stunde',
    'ago.hours': 'vor {count} Stunden',
    'ago.day': 'vor {count} Tag',
    'ago.days': 'vor {count} Tagen'
  }
  const t = (key, params) => de[key].replace('{count}', String(params?.count ?? '{count}'))
  const now = Date.parse('2026-09-04T12:00:00Z')
  assert.equal(agoOf('2026-09-04T11:30:00Z', now, agoUnitsOf(t)), 'vor 30 Minuten')
  assert.equal(agoOf('2026-09-03T12:00:00Z', now, agoUnitsOf(t)), 'vor 1 Tag')
  assert.equal(agoOf('2026-09-04T11:59:50Z', now, agoUnitsOf(t)), 'gerade eben')
})

test('readDeepLink: only a link that names this tab is a request; team and member are lowercased', async () => {
  const { readDeepLink, stripDeepLink } = await import('../src/team/roster.ts')
  assert.equal(readDeepLink(''), null)
  assert.equal(readDeepLink('?open=add-site'), null)
  assert.deepEqual(readDeepLink('?open=my-sites'), { team: null, member: null })
  assert.deepEqual(readDeepLink('?open=my-sites&team=fijitrips.example&member=Dinh%40Example.com'), {
    team: 'fijitrips.example',
    member: 'dinh@example.com'
  })
  // Everything else on the address survives the strip; ours goes.
  assert.equal(stripDeepLink('?open=my-sites&team=x.com&member=a%40b.c'), '')
  assert.equal(stripDeepLink('?open=my-sites&keep=1'), '?keep=1')
})

test('the link the seat book mints and the link the tab reads agree on the parameter names', async () => {
  const { readDeepLink } = await import('../src/team/roster.ts')
  // The other half moved house 16/09/2026: it was `workers/shared/team-invite.js` until the
  // Cloudflare tree was deleted, and the same function now lives in the app that mints the link.
  const { siteTeamUrl } = await import('../../../../apps/tracy-web/src/lib/team-invite.js')
  // `origin` is a parameter here, where the Worker read it off its own request — the app serves
  // more than one address (tracy.ai, a site's own domain), so the caller says which one.
  const url = new URL(
    siteTeamUrl('fijitrips.example', { member: 'dinh@example.com', origin: 'https://cowork.tracy.ai' })
  )
  // The door, not a place under it: `/<siteKey>/…` only exists on a prefix-aware lane.
  assert.equal(url.pathname, '/fijitrips.example')
  assert.deepEqual(readDeepLink(url.search), { team: 'fijitrips.example', member: 'dinh@example.com' })
})

// cowork.tracy.site, 29/09: "Granted 14 days ago by 14283358-185e-…". The roster now names the
// granter by email (grantedByEmail); this is who the access line says gave the seat.
test('granterOf: an account id is never what the access line prints', () => {
  const seat = (email, grantedByEmail) => ({
    email,
    grantedBy: '14283358-185e-4643-96ef-4b10bad4a4d8',
    grantedByEmail
  })
  assert.deepEqual(granterOf(seat('e@x.y', 'o@x.y'), 'v@x.y'), { kind: 'email', email: 'o@x.y' })
  assert.deepEqual(granterOf(seat('e@x.y', 'v@x.y'), 'v@x.y'), { kind: 'you' })
  assert.deepEqual(granterOf(seat('o@x.y', 'o@x.y'), 'v@x.y'), { kind: 'self' })
  assert.deepEqual(granterOf(seat('v@x.y', 'v@x.y'), 'v@x.y'), { kind: 'self' }, 'your own self-granted seat')
  assert.deepEqual(granterOf(seat('e@x.y', null), 'v@x.y'), { kind: 'unknown' })
  assert.deepEqual(
    granterOf({ email: 'e@x.y', grantedBy: 'x' }, 'v@x.y'),
    { kind: 'unsaid' },
    // tracy-web and the dsh image deploy apart: a new tab can meet a server that sends no email.
    // It then names nobody, never "someone no longer on this site", which would be false.
    'an older server sends no email'
  )
})
