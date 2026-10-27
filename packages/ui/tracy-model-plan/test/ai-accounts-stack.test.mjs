/**
 * Which vendors the AI accounts row of the account menu shows (`src/client/account-status.ts`
 * `stackOf`): the connected ones as Settings › AI accounts lists them, else every vendor the
 * deployment allows, greyed; nothing at all while the status is unknown.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stackOf } from '../src/client/account-status.ts'

const connection = (connectionId, provider, name, connected = true) => ({
  connectionId,
  provider,
  name,
  account: `${provider}@example.com`,
  connected
})
const status = (
  connections,
  providers = [
    { id: 'claude', name: 'Claude' },
    { id: 'codex', name: 'ChatGPT Codex' }
  ]
) => ({ enabled: true, providers, connections })

test('an unknown status (still loading, or the read failed) shows no stack at all', () => {
  assert.equal(stackOf(undefined), undefined)
})

test('the connected vendors show, in the order Settings lists their connections', () => {
  const stack = stackOf(
    status([connection('c1', 'codex', 'ChatGPT Codex'), connection('c2', 'claude', 'Claude')])
  )
  assert.deepEqual(stack, {
    connected: true,
    vendors: [
      { id: 'codex', name: 'ChatGPT Codex' },
      { id: 'claude', name: 'Claude' }
    ]
  })
})

test('a vendor with two connected accounts shows once; a disconnected account does not count', () => {
  const stack = stackOf(
    status([
      connection('c1', 'claude', 'Claude'),
      connection('c2', 'claude', 'Claude'),
      connection('c3', 'codex', 'ChatGPT Codex', false)
    ])
  )
  assert.deepEqual(stack, { connected: true, vendors: [{ id: 'claude', name: 'Claude' }] })
})

test('nothing connected: every vendor the deployment allows, marked as not connected', () => {
  const stack = stackOf(status([connection('c1', 'codex', 'ChatGPT Codex', false)]))
  assert.deepEqual(stack, {
    connected: false,
    vendors: [
      { id: 'claude', name: 'Claude' },
      { id: 'codex', name: 'ChatGPT Codex' }
    ]
  })
})

test('nothing connected and nothing allowed: an empty stack, never an invented vendor', () => {
  assert.deepEqual(stackOf(status([], [])), { connected: false, vendors: [] })
})
