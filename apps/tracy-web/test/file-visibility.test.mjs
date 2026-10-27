/**
 * Which webroot files a seat may read the bytes of (plan todo-site-changes Q1, invariant 10).
 *
 * Three runtimes judge this and none can import another: `file-visibility.js` at the door,
 * tracy-host's job validator (`isSensitiveWebrootPath`) and `lib/webroot-sensitive.sh` inside the
 * fleet script, so a caller that reaches the host job directly is refused too. The last tests run
 * all three over the same paths and demand one verdict, and hold the list to the agent file fence
 * it was copied from (`secretsFileReason`), so none can drift.
 *
 *   node --test apps/tracy-web/test/file-visibility.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isSensitiveWebrootPath } from '../../tracy-host/src/webroot.js'
import { secretsFileReason } from '../../../packages/tools/tracy-subprocess-docker/src/site-guards.mjs'
import { fileVisibility, isSensitivePath } from '../src/sites/file-visibility.js'

const here = dirname(fileURLToPath(import.meta.url))
const SENSITIVE_SH = join(
  here,
  '..',
  '..',
  '..',
  'packages',
  'fleet',
  'tracy-fleet-operation',
  'scripts',
  'lib',
  'webroot-sensitive.sh'
)

const SENSITIVE = [
  'wp-config.php',
  'blog/wp-config.php',
  'WP-CONFIG.PHP',
  'wp-config.php.bak',
  'wp-config.old.php',
  '.wp-config.php.swp',
  'configuration.php',
  'configuration.php-dist',
  'configuration.php.orig',
  '.env',
  '.env.local',
  'app/.env.production',
  'production.env',
  'data/data.db',
  'data/data.db-wal',
  'content.sqlite3',
  'data/tracy-agent.token'
]
const ORDINARY = [
  'index.php',
  'wp-config-sample.php',
  'wp-content/themes/tracy/style.css',
  'templates/tpl_tracy/css/template.css',
  'environment.php',
  'src/pages/index.astro',
  'configuration.xml',
  'dbx/readme.txt'
]

test('the known configuration files are sensitive, ordinary files are not', () => {
  for (const p of SENSITIVE) assert.equal(isSensitivePath(p), true, p)
  for (const p of ORDINARY) assert.equal(isSensitivePath(p), false, p)
})

test('fileVisibility: a configuration file is blocked with a reason, by any spelling of its path', () => {
  for (const raw of [
    'wp-config.php',
    './wp-config.php',
    'blog//wp-config.php',
    'blog/./wp-config.php',
    'wp%2Dconfig.php',
    'wp-config%252Ephp',
    'configuration.php',
    '.env'
  ]) {
    const v = fileVisibility(raw)
    assert.equal(v.blocked, true, raw)
    assert.equal(v.reason, 'configuration-file', raw)
  }
})

test('fileVisibility: an ordinary file passes, its path normalized', () => {
  assert.deepEqual(fileVisibility('wp-content//themes/./tracy/style.css'), {
    ok: true,
    path: 'wp-content/themes/tracy/style.css',
    blocked: false
  })
})

test('fileVisibility: paths that leave the webroot, name nothing, or carry git pathspec magic are invalid', () => {
  for (const raw of [
    '',
    '.',
    './',
    '/etc/passwd',
    '../x',
    'a/../../x',
    'a/..',
    'administrator/../configuration.php',
    'a\\b',
    'a\u0000b',
    'a\nb',
    ':(glob)**/wp-config.php',
    '*config.php',
    'wp-config.ph?',
    'wp-config.[p]hp',
    'x'.repeat(401),
    null,
    42
  ]) {
    assert.deepEqual(fileVisibility(raw), { ok: false, code: 'INVALID_PATH' }, String(raw))
  }
})

test('the fleet script judges every path exactly as the door does', () => {
  const paths = [...SENSITIVE, ...ORDINARY]
  const out = execFileSync(
    'bash',
    [
      '-c',
      `. "$1"; shift; for p in "$@"; do if tracy_webroot_path_sensitive "$p"; then echo 1; else echo 0; fi; done`,
      'bash',
      SENSITIVE_SH,
      ...paths
    ],
    { encoding: 'utf8' }
  )
  assert.deepEqual(
    out.trim().split('\n'),
    paths.map((p) => (isSensitivePath(p) ? '1' : '0'))
  )
})

test('tracy-host judges every path exactly as the door does', () => {
  for (const p of [...SENSITIVE, ...ORDINARY]) assert.equal(isSensitiveWebrootPath(p), isSensitivePath(p), p)
})

test('every webroot file the agent file fence refuses as a secret is hidden from the diff too', () => {
  const site = '/srv/sites/x'
  for (const p of ['wp-config.php', 'configuration.php', '.env', 'app/.env', 'data/.env']) {
    assert.notEqual(secretsFileReason(`${site}/.webroot/${p}`, site), null, `fence refuses ${p}`)
    assert.equal(isSensitivePath(p), true, p)
  }
})
