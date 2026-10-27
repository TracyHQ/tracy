#!/usr/bin/env node
/**
 * The viewer's role on the page's site (ADR 0028), `src/client/seat-role.mjs`.
 *
 *   node --test packages/ui/tracy-chat-input/test/seat-role.test.mjs
 *
 * What can go wrong is a guess: a page that hides Edit or Undo from a seat that may press them, or
 * an "Ask for edit access" that says "sent" when the door refused.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  askForEditAccess,
  askOutcomeLine,
  createAskedSites,
  createSeatRole,
  editRequestedOf,
  editAccessPath,
  isViewerRole,
  siteRoleOf
} from '../src/client/seat-role.mjs'

test('only the viewer role is a viewer; anything unknown keeps the page as it is', () => {
  assert.equal(isViewerRole('viewer'), true)
  for (const other of ['owner', 'editor', 'admin', 'developer', 'Viewer', '', null, undefined, 3])
    assert.equal(isViewerRole(other), false, String(other))
})

test('the role is the site row of /api/sites, found by key or alias', () => {
  const body = {
    sites: [
      { siteKey: 'a.test', role: 'owner' },
      { siteKey: 'b.test', aliases: ['new-b.test'], role: 'viewer' },
      { siteKey: 'c.test' }
    ]
  }
  assert.equal(siteRoleOf(body, 'a.test'), 'owner')
  assert.equal(siteRoleOf(body, 'b.test'), 'viewer')
  assert.equal(siteRoleOf(body, 'new-b.test'), 'viewer')
  assert.equal(siteRoleOf(body, 'c.test'), null)
  assert.equal(siteRoleOf(body, 'z.test'), null)
  assert.equal(siteRoleOf(null, 'a.test'), null)
  assert.equal(siteRoleOf({ sites: 'nope' }, 'a.test'), null)
})

test('the store says the role once read, and nothing for a failed read or no site', async () => {
  const body = { sites: [{ siteKey: 'a.test', role: 'viewer' }] }
  const store = createSeatRole({ siteKey: 'a.test', read: async () => ({ status: 200, body }) })
  assert.equal(store.getSnapshot(), null)
  let told = 0
  store.subscribe(() => told++)
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(store.getSnapshot(), 'viewer')
  assert.equal(told, 1)

  const failed = createSeatRole({ siteKey: 'a.test', read: async () => ({ status: 500, body }) })
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(failed.getSnapshot(), null)

  const thrown = createSeatRole({ siteKey: 'a.test', read: () => Promise.reject(new Error('x')) })
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(thrown.getSnapshot(), null)

  let asked = false
  createSeatRole({
    siteKey: null,
    read: async () => {
      asked = true
      return { status: 200, body }
    }
  })
  assert.equal(asked, false, 'no site, no read')
})

test('Ask for edit access posts to the site door and reads the refusal by its code', async () => {
  const calls = []
  const ok = await askForEditAccess({
    siteKey: 'a b.test',
    fetch: async (url, init) => {
      calls.push([url, init])
      return new Response('{}', { status: 200 })
    }
  })
  assert.deepEqual(ok, { kind: 'sent' })
  assert.equal(calls[0][0], '/api/sites/a%20b.test/edit-access-request')
  assert.equal(calls[0][1].method, 'POST')
  assert.equal(calls[0][1].credentials, 'same-origin')
  assert.equal(editAccessPath('x.test'), '/api/sites/x.test/edit-access-request')

  const refused = await askForEditAccess({
    siteKey: 'a.test',
    fetch: async () => new Response(JSON.stringify({ code: 'SEAT_NOT_AUTHORIZED' }), { status: 403 })
  })
  assert.deepEqual(refused, { kind: 'failed', code: 'SEAT_NOT_AUTHORIZED' })
  const bare = await askForEditAccess({
    siteKey: 'a.test',
    fetch: async () => new Response('', { status: 404 })
  })
  assert.deepEqual(bare, { kind: 'failed', code: 'HTTP_404' })
  const down = await askForEditAccess({
    siteKey: 'a.test',
    fetch: async () => {
      throw new Error('offline')
    }
  })
  assert.deepEqual(down, { kind: 'failed', code: 'UNREACHABLE' })
})

test('the line after a press: sent, signed out, or the code of the refusal', () => {
  assert.deepEqual(askOutcomeLine({ kind: 'sent' }), { key: 'viewer.ask.sent' })
  for (const code of ['NOT_SIGNED_IN', 'NO_VIEWER', 'HTTP_401'])
    assert.deepEqual(askOutcomeLine({ kind: 'failed', code }), { key: 'viewer.ask.signedOut' })
  assert.deepEqual(askOutcomeLine({ kind: 'failed', code: 'HTTP_500' }), {
    key: 'viewer.ask.failed',
    params: { code: 'HTTP_500' }
  })
})

test('an ask the door accepted is remembered per site for the page, and told once', () => {
  const asked = createAskedSites()
  let told = 0
  const off = asked.subscribe(() => told++)
  assert.equal(asked.has('a.test'), false)
  asked.mark('a.test')
  asked.mark('a.test')
  assert.equal(asked.has('a.test'), true)
  assert.equal(asked.has('b.test'), false, 'another site was not asked')
  assert.equal(told, 1, 'a second mark of the same site changes nothing')
  off()
  asked.mark('b.test')
  assert.equal(told, 1, 'an unsubscribed listener hears nothing')
})

test('a seat that already edits is told to reload, not shown a code', () => {
  assert.deepEqual(askOutcomeLine({ kind: 'failed', code: 'ALREADY_EDITOR' }), {
    key: 'viewer.ask.alreadyEditor'
  })
})

test('a request still waiting, read from /api/sites, starts the bar as sent after a reload', async () => {
  const body = {
    sites: [
      {
        siteKey: 'a.test',
        aliases: ['a.test', 'new.test'],
        role: 'viewer',
        editRequestedAt: '2026-10-08T00:00:00Z'
      },
      { siteKey: 'b.test', role: 'viewer', editRequestedAt: null },
      { siteKey: 'c.test', role: 'viewer' }
    ]
  }
  assert.equal(editRequestedOf(body, 'a.test'), true)
  assert.equal(editRequestedOf(body, 'new.test'), true, 'found by alias like the role')
  assert.equal(editRequestedOf(body, 'b.test'), false)
  assert.equal(editRequestedOf(body, 'c.test'), false, 'an older server without the field: not asked')
  assert.equal(editRequestedOf(null, 'a.test'), false)

  for (const [siteKey, expected] of [
    ['a.test', true],
    ['b.test', false]
  ]) {
    const asked = createAskedSites()
    const role = createSeatRole({ siteKey, read: async () => ({ status: 200, body }), asked })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(asked.has(siteKey), expected)
    assert.equal(role.getSnapshot(), 'viewer')
    role.stop()
  }
})
