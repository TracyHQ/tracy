/**
 * A brief build's create asks the host to restore the site already on its rebuilding page (#189, criterion 12.1):
 * `siteLock: {previewKey, message}` reaches `provision.sh` through the environment only, checked first; a create
 * without it asks for no lock.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { runProvisionJob, siteLockOf } from '../src/provision.js'

const KEY = 'Fictional_preview-key_0123456789abcdefgh'
const MESSAGE = 'This website is being updated. Please visit again shortly.'

/** @param {Record<string, unknown>} more */
async function provisionEnv(more) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-host-lock-'))
  let seen = null
  try {
    await runProvisionJob({
      jobId: 'j1',
      body: { label: 'crumb-bakery', site: 'crumb-bakery', platform: 'joomla', fresh: true, ...more },
      config: { logDir: dir, privateRoot: '/srv', scriptsDir: '/opt' },
      jobs: { put: async () => {} },
      run: async ({ args, env }) => {
        seen = { args, env }
        return { code: 0, tail: '' }
      }
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return seen
}

test('a brief build’s lock travels to provision.sh as environment, never argv', async () => {
  const seen = await provisionEnv({ siteLock: { previewKey: KEY, message: MESSAGE } })
  assert.equal(seen.env.TRACY_SITE_LOCK_PREVIEW_KEY, KEY)
  assert.equal(seen.env.TRACY_SITE_LOCK_MESSAGE, MESSAGE)
  assert.ok(!seen.args.join(' ').includes(KEY), 'the key is env, never argv')
})

test('a normal create asks for no lock', async () => {
  const seen = await provisionEnv({})
  assert.equal(seen.env.TRACY_SITE_LOCK_PREVIEW_KEY, undefined)
  assert.equal(seen.env.TRACY_SITE_LOCK_MESSAGE, undefined)
})

test('siteLockOf refuses a key of another shape and a message that is not one plain text', () => {
  assert.deepEqual(siteLockOf({ previewKey: KEY, message: MESSAGE }), { previewKey: KEY, message: MESSAGE })
  assert.equal(siteLockOf({ previewKey: 'short', message: MESSAGE }), null)
  assert.equal(siteLockOf({ previewKey: `${KEY};rm`, message: MESSAGE }), null)
  assert.equal(siteLockOf({ previewKey: KEY, message: '' }), null)
  assert.equal(siteLockOf({ previewKey: KEY, message: 'x'.repeat(1001) }), null)
  assert.equal(siteLockOf({ previewKey: KEY, message: 'a\u0000b' }), null)
  assert.equal(siteLockOf('on'), null)
})
