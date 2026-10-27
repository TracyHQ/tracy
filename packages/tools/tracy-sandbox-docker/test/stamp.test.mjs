/**
 * The stamp is the only thing the sandbox provider adds to an argv, and the subprocess provider
 * must read it back exactly. Both directions pinned here; no Docker, no dsh.
 *
 *   node --test packages/tools/tracy-sandbox-docker/test/stamp.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MARKER, stamp, unstamp } from '../stamp.mjs'
import { DockerSandbox } from '../index.js'

test('stamp puts the mode and the granted root in front, keeping the argv verbatim', () => {
  assert.deepEqual(stamp(['bash', '-c', 'ls -la'], 'read-only', '/site/wpdemo'), [
    MARKER,
    '--mode',
    'read-only',
    '--root',
    '/site/wpdemo',
    '--',
    'bash',
    '-c',
    'ls -la'
  ])
})

test('unstamp reads a stamped argv back, root included', () => {
  assert.deepEqual(
    unstamp([MARKER, '--mode', 'workspace-write', '--root', '/site/wpdemo', '--', 'wp', 'core', 'version']),
    { mode: 'workspace-write', root: '/site/wpdemo', argv: ['wp', 'core', 'version'] }
  )
})

test('unstamp leaves an unstamped argv alone (danger-full-access never confines)', () => {
  assert.deepEqual(unstamp(['bash', '-c', 'true']), {
    mode: null,
    root: null,
    argv: ['bash', '-c', 'true']
  })
})

test('unstamp refuses a half stamp instead of guessing', () => {
  assert.throws(() => unstamp([MARKER, 'read-only', 'bash']), /malformed stamp/)
})

test('unstamp refuses a stamp without a root — the cross-site check has nothing to compare against', () => {
  assert.throws(() => unstamp([MARKER, '--mode', 'read-only', '--', 'bash', '-c', 'id']), /malformed stamp/)
})

test('stamp refuses a mode the subprocess provider has no user for', () => {
  assert.throws(() => stamp(['bash'], 'danger-full-access', '/site/wpdemo'), /not a confined mode/)
})

test('stamp refuses a root it cannot compare a cwd against', () => {
  assert.throws(() => stamp(['bash'], 'read-only', ''), /workspace root/)
  assert.throws(() => stamp(['bash'], 'read-only', undefined), /workspace root/)
})

test('confine() carries the policy workspace root into the stamp', () => {
  const box = Object.create(DockerSandbox.prototype)
  const out = box.confine(['bash', '-c', 'id'], { mode: 'read-only', workspaceRoot: '/site/x' })
  assert.deepEqual(out.argv, [MARKER, '--mode', 'read-only', '--root', '/site/x', '--', 'bash', '-c', 'id'])
  assert.equal(out.enforcement, 'full')
  assert.ok(out.denialSignatures.includes('permission denied'))
  assert.deepEqual(out.runnerFailureRules, [])
})
