#!/usr/bin/env node
/**
 * lib/roots.sh — the two roots every fleet-host script derives its paths from.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/roots.test.mjs
 *
 * Plan 5 moves a host from one root (today: /srv/tracy, with /srv/tracy-sites bind-mounted over
 * its site/ and webroot/) to two — TRACY_SITES_ROOT and TRACY_PRIVATE_ROOT — with no bind mount.
 * This file is sourced by bash, not imported, so a JS test that only reads its text would miss a
 * typo in the `:=` defaults or in the TRACY_SRV fallback — both are shell syntax that only bash
 * can tell apart from a silently-wrong path. It is invoked the same way every caller invokes it:
 * `. lib/roots.sh` in a subshell, with the environment this test controls.
 */

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const ROOTS = fileURLToPath(new URL('../scripts/lib/roots.sh', import.meta.url))

// Names roots.sh reads. Deleted from the child's env on every call (not just left unset in the
// override object) so a value inherited from the shell running the test suite can never leak in
// and make a test pass for the wrong reason.
const ROOT_VARS = [
  'TRACY_SITES_ROOT',
  'TRACY_PRIVATE_ROOT',
  'TRACY_FLEET_DIR',
  'TRACY_BRANDS_DIR',
  'TRACY_SRV'
]

function childEnv(env) {
  const out = { ...process.env }
  for (const key of ROOT_VARS) delete out[key]
  Object.assign(out, env)
  return out
}

/** Calls one of roots.sh's own functions with `label` as its one argument. */
function run(fn, label, env = {}) {
  return execFileSync('bash', ['-c', `. "$1"; ${fn} "$2"`, '_', ROOTS, label], {
    encoding: 'utf8',
    env: childEnv(env)
  }).trimEnd()
}

/** Reads one of the `:=` defaults roots.sh sets, with no function call involved. */
function readVar(name, env = {}) {
  return execFileSync('bash', ['-c', `. "$1"; printf '%s' "\$${name}"`, '_', ROOTS], {
    encoding: 'utf8',
    env: childEnv(env)
  }).trimEnd()
}

test("unset env: today's single root, exactly the bind that already exists", () => {
  // The whole point of the default — a host that has not migrated must not notice this change.
  assert.equal(run('tracy_site_dir', 'acme'), '/srv/tracy-sites/acme')
  assert.equal(run('tracy_webroot_dir', 'acme'), '/srv/tracy-sites/acme/.webroot')
  assert.equal(run('tracy_private_dir', 'acme'), '/srv/tracy/acme')
  assert.equal(run('tracy_repo_dir', 'acme'), '/srv/tracy/acme/webroot-baseline.git')
})

test('unset env: the two other defaults roots.sh carries', () => {
  assert.equal(readVar('TRACY_FLEET_DIR'), '/opt/tracy-fleet')
  assert.equal(readVar('TRACY_BRANDS_DIR'), '/srv/tracy/_brands')
})

test("the brief's own four-string check: bash -c with roots.sh, empty env", () => {
  const out = execFileSync(
    'bash',
    ['-c', '. "$1"; tracy_repo_dir x; echo; tracy_webroot_dir x', '_', ROOTS],
    {
      encoding: 'utf8',
      env: childEnv()
    }
  )
  assert.equal(out, '/srv/tracy/x/webroot-baseline.git\n/srv/tracy-sites/x/.webroot')
})

test('both roots set: every path moves off /srv, nothing left behind on the old one', () => {
  const env = { TRACY_SITES_ROOT: '/mnt/sites', TRACY_PRIVATE_ROOT: '/mnt/private' }
  assert.equal(run('tracy_site_dir', 'acme', env), '/mnt/sites/acme')
  assert.equal(run('tracy_webroot_dir', 'acme', env), '/mnt/sites/acme/.webroot')
  assert.equal(run('tracy_private_dir', 'acme', env), '/mnt/private/acme')
  assert.equal(run('tracy_repo_dir', 'acme', env), '/mnt/private/acme/webroot-baseline.git')
  assert.equal(readVar('TRACY_BRANDS_DIR', env), '/mnt/private/_brands')
})

test('TRACY_SRV is the old name of the private root, and it wins even over an explicit TRACY_PRIVATE_ROOT', () => {
  // webroot-backup.sh and prior fleet tooling both still write TRACY_SRV — the fallback line
  // in roots.sh runs unconditionally after the default, so a caller passing the new name gets
  // overridden by a caller still passing the old one. That is the one case roots.sh chooses for
  // its own caller (webroot-backup.sh) over the newer name.
  assert.equal(run('tracy_private_dir', 'acme', { TRACY_SRV: '/legacy-srv' }), '/legacy-srv/acme')
  assert.equal(
    run('tracy_private_dir', 'acme', { TRACY_PRIVATE_ROOT: '/mnt/private', TRACY_SRV: '/legacy-srv' }),
    '/legacy-srv/acme'
  )
})

test('TRACY_BRANDS_DIR can be overridden directly, independent of the private root', () => {
  assert.equal(readVar('TRACY_BRANDS_DIR', { TRACY_BRANDS_DIR: '/somewhere/_brands' }), '/somewhere/_brands')
})

test('sourcing under `set -e` survives — every real caller sources this file with it on', () => {
  // Every script this file is written for (provision.sh, render-compose.sh, the webroot/ scripts)
  // opens with `set -euo pipefail` before sourcing roots.sh. A `[ -n "$X" ] && Y=...` fallback
  // line, sourced as the LAST statement of the file, hands its own false exit status to the
  // sourcing shell — and under `set -e` that reads as "the sourced file failed" and kills the
  // caller before its own first line runs, with TRACY_SRV unset (the ordinary case) being exactly
  // when it fires. This is the regression test for that: it runs with `set -e` on, the way
  // provision.sh really does, not the relaxed shell every other test in this file uses.
  const out = execFileSync(
    'bash',
    ['-euo', 'pipefail', '-c', '. "$1"; echo reached; tracy_private_dir x', '_', ROOTS],
    {
      encoding: 'utf8',
      env: childEnv()
    }
  )
  assert.equal(out, 'reached\n/srv/tracy/x')
})

// ── A label is one path segment (QA run 20/10/2026: `--label ../../etc` reached teardown.sh) ──

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))

test('tracy_require_label takes a real label and exits 2 on one that is a path or a flag', () => {
  for (const label of ['acme', 'demo-joomla-1', 'Base_Site.2']) {
    assert.equal(run('tracy_require_label', label), '', `refused ${label}`)
  }
  for (const label of ['', '.', '..', '../x', '../../etc', 'a/b', '-rf', '.hidden', 'a b']) {
    const result = spawnSync(
      'bash',
      ['-c', `. "$1"; tracy_require_label "$2"; echo reached`, '_', ROOTS, label],
      {
        encoding: 'utf8',
        env: childEnv({})
      }
    )
    assert.equal(result.status, 2, `took ${JSON.stringify(label)}`)
    assert.doesNotMatch(result.stdout, /reached/)
  }
})

test('every script the host doors hand a label to refuses one that is a path, before it builds a path', () => {
  const scripts = [
    ['provision/teardown.sh', ['--root', '/nonexistent-root']],
    ['webroot/webroot-git.sh', ['--op', 'changes']],
    ['webroot/webroot-pack.sh', []],
    ['webroot/webroot-push.sh', []],
    ['webroot/webroot-edit.sh', ['--op', 'write', '--path', 'a.txt']],
    ['webroot/webroot-backup.sh', ['--op', 'create']],
    ['webroot/webroot-sync.sh', ['--op', 'sync', '--dir', '/nonexistent-dir']]
  ]
  for (const [script, args] of scripts) {
    for (const label of ['../x', '../../etc', 'a/b']) {
      const result = spawnSync('bash', [`${SCRIPTS}${script}`, '--label', label, ...args], {
        encoding: 'utf8',
        env: childEnv({ TRACY_SITES_ROOT: '/nonexistent-sites', TRACY_PRIVATE_ROOT: '/nonexistent-root' })
      })
      assert.equal(result.status, 2, `${script} took ${label}: ${result.stderr.slice(-300)}`)
      assert.match(result.stderr, /refused label/, `${script} with ${label}`)
    }
  }
})
