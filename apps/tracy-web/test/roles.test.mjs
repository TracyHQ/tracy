import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  actingEditor,
  actingOwner,
  INVITABLE_ROLES,
  isLive,
  normalizeRole,
  permissionsFor,
  RETIRED_ROLES,
  ROLES,
  toolsetsFor
} from '../src/seats/roles.js'
import { effectiveRolePolicy, toolsetsOn } from '../src/lib/role-policy.js'

const live = (role) => ({ role, accepted_at: new Date(), revoked_at: null, declined_at: null })

test('ROLES: the three roles of ADR 0028, widest first; only viewer and editor are invited', () => {
  assert.deepEqual(ROLES, ['owner', 'editor', 'viewer'])
  assert.deepEqual(INVITABLE_ROLES, ['editor', 'viewer'])
  assert.deepEqual(RETIRED_ROLES, { admin: 'editor', developer: 'editor' })
})

test('normalizeRole: current roles as they are, retired ones as editor, anything else null', () => {
  for (const role of ROLES) assert.equal(normalizeRole(role), role)
  assert.equal(normalizeRole('admin'), 'editor')
  assert.equal(normalizeRole('developer'), 'editor')
  for (const other of ['guest', '', null, undefined, 3, 'constructor'])
    assert.equal(normalizeRole(other), null)
})

test('isLive: accepted, and neither revoked nor declined', () => {
  assert.equal(isLive(live('viewer')), true)
  assert.equal(isLive({ ...live('owner'), accepted_at: null }), false)
  assert.equal(isLive({ ...live('owner'), revoked_at: new Date() }), false)
  assert.equal(isLive({ ...live('owner'), declined_at: new Date() }), false)
  assert.equal(isLive(null), false)
})

test('actingOwner: a live owner only', () => {
  assert.equal(actingOwner(live('owner')), true)
  assert.equal(actingOwner({ ...live('owner'), accepted_at: null }), false) // pending invite
  assert.equal(actingOwner(live('editor')), false)
  assert.equal(actingOwner(live('admin')), false)
  assert.equal(actingOwner(null), false)
})

test('actingEditor: a live owner or editor; never a viewer, a pending seat or a retired name', () => {
  assert.equal(actingEditor(live('owner')), true)
  assert.equal(actingEditor(live('editor')), true)
  assert.equal(actingEditor(live('viewer')), false)
  assert.equal(actingEditor({ ...live('editor'), accepted_at: null }), false)
  assert.equal(actingEditor(live('admin')), false)
  assert.equal(actingEditor(undefined), false)
})

test('permissionsFor and toolsetsFor: one fixed set per role, a viewer holds none', () => {
  assert.deepEqual(toolsetsFor('owner'), ['content', 'code', 'site', 'lifecycle'])
  assert.deepEqual(toolsetsFor('editor'), ['content', 'code', 'site'])
  assert.deepEqual(toolsetsFor('viewer'), [])
  assert.deepEqual(toolsetsFor('admin'), ['content', 'code', 'site'])
  assert.deepEqual(toolsetsFor('guest'), [])
  assert.deepEqual(permissionsFor('viewer'), { content: false, code: false, site: false, lifecycle: false })
  assert.deepEqual(permissionsFor('editor'), { content: true, code: true, site: true, lifecycle: false })
})

test('permissionsFor: a policy handed in (an old caller) changes nothing', () => {
  const narrowed = { editor: { content: false, code: false, site: false, lifecycle: false } }
  assert.deepEqual(permissionsFor('editor', narrowed), permissionsFor('editor'))
})

test('lib/role-policy.js: no policy is ever in force, and toolsetsOn answers the fixed sets', async () => {
  assert.equal(await effectiveRolePolicy(), null)
  for (const role of ['owner', 'editor', 'viewer', 'admin', 'guest']) {
    assert.deepEqual(toolsetsOn(permissionsFor, role, { [role]: { lifecycle: true } }), toolsetsFor(role))
  }
})
