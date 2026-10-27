import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { machineHost, machineSetting } from '../lib/machine-hosts.mjs'

const fileWith = (text) => {
  const p = join(mkdtempSync(join(tmpdir(), 'hosts-')), 'hosts.env')
  writeFileSync(p, text)
  return p
}

test('the environment wins over the hosts file', () => {
  const file = fileWith('E2E_SSH_DEV=ubuntu@from-file\n')
  assert.equal(
    machineHost('E2E_SSH_DEV', { env: { E2E_SSH_DEV: 'ubuntu@from-env' }, file }),
    'ubuntu@from-env'
  )
})

test('a key missing from the environment is read from the hosts file', () => {
  const file = fileWith('# team machines\nE2E_SSH_DEV = ubuntu@dev-host  # vpn\nOTHER=x\n')
  assert.equal(machineHost('E2E_SSH_DEV', { env: {}, file }), 'ubuntu@dev-host')
})

test('a key set nowhere fails with a message naming the key and the file', () => {
  const file = join(tmpdir(), 'does-not-exist', 'hosts.env')
  assert.throws(
    () => machineHost('E2E_SSH_DEV', { env: {}, file }),
    (e) => {
      assert.match(e.message, /E2E_SSH_DEV/)
      assert.ok(e.message.includes(file))
      return true
    }
  )
})

test('an optional setting falls back to its default when neither the environment nor the file sets it', () => {
  const file = fileWith('E2E_STAND_EMAIL=me@team.example\n')
  assert.equal(machineSetting('E2E_STAND_EMAIL', 'x@example.com', { env: {}, file }), 'me@team.example')
  assert.equal(machineSetting('MISSING_KEY', 'x@example.com', { env: {}, file }), 'x@example.com')
})
