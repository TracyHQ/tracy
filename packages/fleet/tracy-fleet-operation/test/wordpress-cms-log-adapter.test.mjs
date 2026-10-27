/**
 * The WordPress admin log adapter (`scripts/webroot/cms-log-wordpress.php`) on a stub WordPress
 * (`test/fixtures/wp-adapter/wp-load.php`), then tracy-host's mapping of its answer.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/wordpress-cms-log-adapter.test.mjs
 *
 * F-L4-5 (Site changes V2, round L4): the hook creates its table on the first action it logs, so
 * a new site nobody has edited in the admin has the hook and NO table. That used to read as
 * `hook-not-installed` — a missing collector, "At least N" on the tab. Three states now:
 * table present · hook present, no table yet (an empty log) · no logging hook at all.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { mapCmsLog } from '../../../../apps/tracy-host/src/cms-log.js'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const PHP_SKIP = phpSupport().skip
const HOOK_DIR = 'scripts/provision/access/wordpress'
const HOOK_VERSION = /Version:\s+(\S+)/.exec(readFileSync(`${PKG}/${HOOK_DIR}/tracy-access.php`, 'utf8'))?.[1]

const out = {}
let php
before(() => {
  if (PHP_SKIP) return
  php = startPhp({
    files: {
      cwd: PKG,
      paths: [
        'scripts/webroot/cms-log-wordpress.php',
        `${HOOK_DIR}/tracy-access.php`,
        'test/fixtures/wp-adapter'
      ]
    }
  })
  const root = php.root
  const run = (env) => ({
    args: [`${root}/scripts/webroot/cms-log-wordpress.php`],
    env: { TRACY_CMS_LOG_WP_ROOT: `${root}/test/fixtures/wp-adapter`, TRACY_CMS_LOG_CURSOR: '0', ...env }
  })
  const cases = {
    table: run({ STUB_TABLE: 'yes', STUB_MU: `${root}/${HOOK_DIR}` }),
    attach: run({ STUB_TABLE: 'yes', STUB_ATTACH: 'yes', STUB_MU: `${root}/${HOOK_DIR}` }),
    hookNoTable: run({ STUB_TABLE: 'no', STUB_MU: `${root}/${HOOK_DIR}` }),
    oldHook: run({ STUB_TABLE: 'no', STUB_MU: `${root}/test/fixtures/wp-adapter/old-hook` }),
    noHook: run({ STUB_TABLE: 'no', STUB_MU: `${root}/test/fixtures/wp-adapter/none` })
  }
  const keys = Object.keys(cases)
  const results = php.run(keys.map((k) => cases[k]))
  keys.forEach((k, i) => {
    assert.equal(results[i].status, 0, `${k}: php failed: ${results[i].stderr}${results[i].stdout}`)
    out[k] = JSON.parse(results[i].stdout)
  })
})
after(() => php?.stop())

test('a table that exists is read as before, with the producer columns', { skip: PHP_SKIP }, () => {
  assert.equal(out.table.installed, true)
  assert.equal(out.table.hook, undefined)
  const mapped = mapCmsLog('wordpress', out.table, '')
  assert.equal(mapped.enabled, true)
  assert.equal(mapped.entries.length, 1)
  assert.deepEqual(mapped.entries[0].producer, { schema: '2', version: '0.3.0', context: 'cron' })
})

test('F-L4-5: the hook in place but nothing logged yet is an EMPTY log, not a missing hook', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(out.hookNoTable, {
    ok: true,
    platform: 'wordpress',
    installed: false,
    hook: { present: true, version: HOOK_VERSION }
  })
  assert.deepEqual(mapCmsLog('wordpress', out.hookNoTable, ''), {
    entries: [],
    cursor: '0',
    enabled: true,
    reset: false
  })
})

test('no logging hook (none, or an older sign-in-only one) is still hook-not-installed', {
  skip: PHP_SKIP
}, () => {
  for (const k of ['oldHook', 'noHook']) {
    assert.deepEqual(out[k].hook, { present: false, version: null }, k)
    assert.deepEqual(mapCmsLog('wordpress', out[k], ''), {
      entries: [],
      cursor: '0',
      enabled: false,
      reason: 'hook-not-installed',
      reset: false
    })
  }
})

test('E5.1c: an upload row carries the files the upload wrote (its file and sizes), read off the attachment', {
  skip: PHP_SKIP
}, () => {
  const [upload, post] = out.attach.rows
  assert.deepEqual(upload.files, [
    'wp-content/uploads/2026/10/e2e04-upload.png',
    'wp-content/uploads/2026/10/e2e04-upload-150x150.png',
    'wp-content/uploads/2026/10/e2e04-upload-300x200.png',
    'wp-content/uploads/2026/10/e2e04-upload-orig.png'
  ])
  assert.equal(post.files, undefined, 'only an upload names files')
  const mapped = mapCmsLog('wordpress', out.attach, '')
  assert.deepEqual(mapped.entries[0].files, upload.files)
  assert.equal(mapped.entries[1].files, undefined)
})
