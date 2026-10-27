// The My Sites row "…" menu opens that site's Settings tab (Akemi 04/10/2026), beside Team and
// Site changes, for any seat the settings door serves (an accepted one, whatever its role), and,
// right under it, the site's Publish tab (07/10/2026).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rowStatus, showsPublish, showsSettings, tabOfAction } from '../src/client/more-actions.ts'

test('Settings is offered on an accepted seat of any role, never on a pending one', () => {
  for (const role of ['owner', 'admin', 'developer', 'editor'])
    assert.equal(showsSettings({ role, status: 'accepted' }), true, role)
  assert.equal(showsSettings({ role: 'editor', status: 'invited' }), false)
  assert.equal(showsSettings({ role: null, status: 'requested' }), false)
})

test('each tab entry opens its own tab type for the row it was pressed on', () => {
  assert.equal(tabOfAction('settings'), 'tracy:site-settings')
  assert.equal(tabOfAction('changes'), 'tracy:changes')
  assert.equal(tabOfAction('publish'), 'tracy:site-publish')
  // The line that led to a section of Settings is gone, and nothing unknown is a tab.
  for (const kind of ['domains', 'leave', 'delete', '', 'Publish', 'tracy:site-publish'])
    assert.equal(tabOfAction(kind), null, kind)
})

test('the Publish line: one line for every seated row whose state the list gave — draft or live, any role', () => {
  const entry = (role, publish, status = 'accepted') => showsPublish({ role, status, publish })
  for (const role of ['owner', 'admin', 'developer', 'editor'])
    for (const publish of ['draft', 'published'])
      assert.equal(entry(role, publish), true, `${role} ${publish}`)
  // No line where Settings itself is not shown, or the list did not say.
  assert.equal(entry('owner', 'draft', 'invited'), false)
  assert.equal(entry(null, 'published', 'requested'), false)
  for (const publish of [undefined, null, '', 'live', 'DRAFT', 'publishing', 0, true, {}])
    assert.equal(entry('owner', publish), false, String(publish))
})

test("the row's chip: Draft or Live for a seated row, nothing for an unanswered one or an unknown state", () => {
  assert.equal(rowStatus({ status: 'accepted', publish: 'draft' }), 'draft')
  assert.equal(rowStatus({ status: 'accepted', publish: 'published' }), 'live')
  assert.equal(rowStatus({ status: 'invited', publish: 'published' }), null)
  for (const publish of [undefined, null, '', 'publishing', 'live'])
    assert.equal(rowStatus({ status: 'accepted', publish }), null, String(publish))
})

test('while a publish runs the chip reads Publishing…, going back to draft reads Draft from its first moment, and the Publish line stays as it is in either', () => {
  const row = (publish, publishing, role = 'owner') => ({ status: 'accepted', role, publish, publishing })
  assert.equal(rowStatus(row('draft', 'live')), 'publishing')
  // A publish pressed again on a site that is already live: still a publish under way.
  assert.equal(rowStatus(row('published', 'live')), 'publishing')
  assert.equal(rowStatus(row('draft', 'draft')), 'draft')
  for (const role of ['owner', 'admin', 'developer', 'editor'])
    for (const publishing of ['live', 'draft']) {
      assert.equal(showsPublish(row('draft', publishing, role)), true, `${role} ${publishing}`)
      assert.equal(showsPublish(row('published', publishing, role)), true, `${role} ${publishing}`)
    }
  // A site being deleted says so, whatever its publish flag; its menu line is the same one.
  for (const publish of ['draft', 'published']) {
    assert.equal(rowStatus(row(publish, 'delete')), 'deleting', publish)
    for (const role of ['owner', 'admin', 'editor'])
      assert.equal(showsPublish(row(publish, 'delete', role)), true, `${publish} ${role}`)
  }
  assert.equal(rowStatus({ status: 'invited', publish: 'draft', publishing: 'delete' }), null)
  // Nothing the list does not name is an operation: the row reads as it would without the field.
  for (const publishing of [undefined, null, '', 'running', 'published', true, 1]) {
    assert.equal(rowStatus(row('draft', publishing)), 'draft', String(publishing))
    assert.equal(rowStatus(row('published', publishing)), 'live', String(publishing))
    assert.equal(showsPublish(row('draft', publishing)), true, String(publishing))
  }
  // An operation says nothing on a row that has no chip or no menu line to begin with.
  assert.equal(rowStatus({ status: 'invited', publish: 'draft', publishing: 'live' }), null)
  assert.equal(rowStatus({ status: 'accepted', publishing: 'live' }), null)
  assert.equal(
    showsPublish({ status: 'invited', role: 'owner', publish: 'draft', publishing: 'live' }),
    false
  )
  assert.equal(showsPublish({ status: 'accepted', role: 'owner', publishing: 'live' }), false)
})
