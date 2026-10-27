#!/usr/bin/env node
/**
 * The store of site viewing keys: which cookie to send to which host, and for how long.
 *
 * WHY IT IS IN THE HOST HALF. The sidebar's embed route runs server-side, so it is the only thing that can send
 * a cookie to the customer's site — in the browser the frame is third-party and the cookie is blocked. But
 * that route does not know who is viewing, so the plugin's host half keeps this table and answers when asked.
 *
 * 🔒 TIME-LIMITED, AND SHORT. A viewing session cannot be revoked once issued; the only thing limiting
 * the damage of a stolen copy is that it expires. The seat book is still the real gate — fleet-bar re-asks
 * the role on every load — so the limit here only stops an old key lingering in memory.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CredentialStore } from '../src/client/credentials.mjs'

test('stores by host and returns it for that same host', () => {
  const store = new CredentialStore(() => 1000)
  store.put('a.tracy.ai', 'v1.abc')
  assert.deepEqual(store.forHost('a.tracy.ai'), { cookie: 'tracy_sess=v1.abc' })
  assert.equal(store.forHost('b.tracy.ai'), null)
})

test('hosts compare case-INSENSITIVELY — DNS does', () => {
  const store = new CredentialStore(() => 1000)
  store.put('A.Tracy.AI', 'v1.abc')
  assert.deepEqual(store.forHost('a.tracy.ai'), { cookie: 'tracy_sess=v1.abc' })
})

test('expired is as if it never existed', () => {
  let now = 1000
  const store = new CredentialStore(() => now)
  store.put('a.tracy.ai', 'v1.abc', 60_000)
  now = 1000 + 59_999
  assert.notEqual(store.forHost('a.tracy.ai'), null)
  now = 1000 + 60_001
  assert.equal(store.forHost('a.tracy.ai'), null)
})

test('a new key for the same host replaces the old one, does not stack', () => {
  const store = new CredentialStore(() => 1000)
  store.put('a.tracy.ai', 'v1.old')
  store.put('a.tracy.ai', 'v1.new')
  assert.deepEqual(store.forHost('a.tracy.ai'), { cookie: 'tracy_sess=v1.new' })
})

test('an empty or wrongly shaped token is NOT stored', () => {
  // `v1.` is the shape `mintSession` produces. Storing another string promises a key that opens
  // nothing, and that promise only breaks on the customer's page load.
  const store = new CredentialStore(() => 1000)
  store.put('a.tracy.ai', '')
  store.put('b.tracy.ai', 'not-a-token')
  assert.equal(store.forHost('a.tracy.ai'), null)
  assert.equal(store.forHost('b.tracy.ai'), null)
})

test('forget one host', () => {
  const store = new CredentialStore(() => 1000)
  store.put('a.tracy.ai', 'v1.abc')
  store.forget('a.tracy.ai')
  assert.equal(store.forHost('a.tracy.ai'), null)
})

test('expired keys are cleared from memory, not left behind', () => {
  let now = 1000
  const store = new CredentialStore(() => now)
  store.put('a.tracy.ai', 'v1.abc', 10)
  now = 2000
  store.forHost('a.tracy.ai')
  assert.equal(store.size, 0)
})
