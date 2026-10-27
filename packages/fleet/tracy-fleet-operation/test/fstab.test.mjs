#!/usr/bin/env node
/**
 * The lines this fleet writes into /etc/fstab, and the ones it has to take back out.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/fstab.test.mjs
 *
 * 🔒 WHY THIS FILE EXISTS. A line in /etc/fstab is a promise the boot keeps.
 * systemd-fstab-generator turns each one into a `.mount` unit that `local-fs.target` REQUIRES
 * unless it says `nofail`; a mount whose source was deleted then fails the target and drops the
 * host into an emergency shell. So a site torn down in September takes every customer site on that
 * host down at the next reboot in October, and nothing connects the two events.
 *
 * That failure cannot be reproduced anywhere but on a host, at boot, weeks later — which is
 * exactly why the two halves that prevent it (`nofail` on every line, and detach removing the
 * lines) are pinned here, against a fstab file in a temp directory (TRACY_FSTAB).
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = fileURLToPath(new URL('../scripts/lib/fstab.sh', import.meta.url))
const DETACH = fileURLToPath(new URL('../scripts/provision/detach-site.sh', import.meta.url))

/** Run a snippet with the library sourced and TRACY_FSTAB pointed at a scratch file. */
function sh(fstab, snippet) {
  return execFileSync('bash', ['-c', `. "$1"; ${snippet}`, '_', LIB], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_FSTAB: fstab }
  })
}

function scratchFstab(contents = '') {
  const dir = mkdtempSync(path.join(tmpdir(), 'fstab-'))
  const file = path.join(dir, 'fstab')
  writeFileSync(file, contents)
  return file
}

const EXISTING = [
  '# /etc/fstab: static file system information.',
  'UUID=1111-2222 / ext4 defaults 0 1',
  '/dev/sdb1 /srv ext4 defaults 0 2',
  ''
].join('\n')

test('every line a site gets carries nofail — the boot must survive a deleted source', () => {
  const file = scratchFstab(EXISTING)
  sh(file, 'tracy_fstab_add /srv/tracy/acme/site /srv/tracy-sites/acme')
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.includes('/srv/tracy-sites/acme'))
  assert.ok(line, 'the line was not written')
  assert.match(line, /\bnofail\b/)
  assert.equal(line, '/srv/tracy/acme/site /srv/tracy-sites/acme none bind,nofail 0 0')
})

test('adding twice writes one line — attach-site runs on every provision', () => {
  const file = scratchFstab(EXISTING)
  sh(file, 'tracy_fstab_add /srv/tracy/acme/site /srv/tracy-sites/acme')
  sh(file, 'tracy_fstab_add /srv/tracy/acme/site /srv/tracy-sites/acme')
  const hits = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.includes('/srv/tracy-sites/acme'))
  assert.equal(hits.length, 1)
})

test('a line is matched on its TARGET, so a re-provision does not leave two answers', () => {
  const file = scratchFstab(EXISTING)
  sh(file, 'tracy_fstab_add /srv/tracy/acme/site /srv/tracy-sites/acme')
  // Same target, different source — what a label reused for a new site would produce.
  sh(file, 'tracy_fstab_add /srv/tracy/acme-2/site /srv/tracy-sites/acme')
  const hits = readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.includes('/srv/tracy-sites/acme'))
  assert.equal(hits.length, 1, 'two lines for one directory is two answers at boot')
})

test('remove takes out only the named targets, and leaves the host lines alone', () => {
  const file = scratchFstab(EXISTING)
  sh(file, 'tracy_fstab_add /srv/tracy/acme/site /srv/tracy-sites/acme')
  sh(file, 'tracy_fstab_add /srv/tracy/acme/webroot /srv/tracy-sites/acme/.webroot')
  sh(file, 'tracy_fstab_add /srv/tracy/other/site /srv/tracy-sites/other')
  sh(file, 'tracy_fstab_remove /srv/tracy-sites/acme/.webroot /srv/tracy-sites/acme')
  const out = readFileSync(file, 'utf8')
  assert.ok(!out.includes('/srv/tracy-sites/acme'), out)
  assert.ok(out.includes('/srv/tracy-sites/other'), 'another site must keep its line')
  assert.ok(out.includes('UUID=1111-2222 / ext4'), 'the root filesystem line must survive')
  assert.ok(out.startsWith('# /etc/fstab'), 'comments must survive')
})

test('removing what is not there is a success — teardown runs on sites never attached', () => {
  const file = scratchFstab(EXISTING)
  sh(file, 'tracy_fstab_remove /srv/tracy-sites/ghost')
  assert.equal(readFileSync(file, 'utf8'), EXISTING)
})

test('detach-site.sh clears every line a site can have, and runs twice', () => {
  const file = scratchFstab(EXISTING)
  const sites = mkdtempSync(path.join(tmpdir(), 'sites-'))
  mkdirSync(path.join(sites, 'acme'), { recursive: true })
  for (const [source, target] of [
    ['/srv/tracy/acme/site', `${sites}/acme`],
    ['/srv/tracy/acme/webroot', `${sites}/acme/.webroot`],
    ['/srv/tracy/acme/data', `${sites}/acme/.webroot/data`],
    ['/srv/tracy/acme/uploads', `${sites}/acme/.webroot/uploads`]
  ]) {
    sh(file, `tracy_fstab_add ${source} ${target}`)
  }
  const run = () =>
    execFileSync('bash', [DETACH, 'acme'], {
      encoding: 'utf8',
      env: { ...process.env, TRACY_FSTAB: file, TRACY_SITES_ROOT: sites }
    })
  run()
  let out = readFileSync(file, 'utf8')
  assert.ok(!out.includes('/acme'), `lines left behind:\n${out}`)
  // Twice, because a teardown that half-finished once must be safe to run again.
  run()
  out = readFileSync(file, 'utf8')
  assert.equal(out, EXISTING)
})

test('detach-site.sh refuses a label that is not one', () => {
  const file = scratchFstab(EXISTING)
  for (const bad of ['..', '.', 'a/b', 'a b']) {
    assert.throws(
      () =>
        execFileSync('bash', [DETACH, bad], {
          encoding: 'utf8',
          stdio: 'pipe',
          env: { ...process.env, TRACY_FSTAB: file }
        }),
      `${bad} should be refused`
    )
  }
})
