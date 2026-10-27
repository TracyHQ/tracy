#!/usr/bin/env node
/**
 * Which dependency specifiers `check-self-contained` refuses — the ONE decision in that gate a
 * regex cannot document by itself.
 *
 *   node --import tsx --test scripts/test/self-contained-specifier.test.ts
 *
 * WHY THIS FILE EXISTS. The gate guards two escapes out of the tree, and they fail in opposite
 * directions, so each needs its own witness:
 *
 *   1. **Sideways** — `link:` / `file:` / `portal:` / an absolute path reach another tree on
 *      THIS machine. Everything works perfectly on exactly one machine, and the break shows up
 *      on a clean clone or on the fleet (BOUNDARY RULE #1).
 *   2. **Along time** — `github:owner/repo`, `git+https://`, `git+ssh://`, `git://`, a bare
 *      tarball URL. These resolve to whatever the other repo's HEAD says TODAY, so a stranger's
 *      commit becomes a release into Tracy production, at a moment nobody here picked
 *      (ADR 0006 §Decision 3).
 *
 * The tilde case is the trap. `~/foo` is a home path; `~18.3.1` is a semver range, and a
 * TIGHTER pin than caret. A gate that bans both pushes authors toward `^`, i.e. the safety gate
 * makes versions looser. Measured 2026-08-30 on `@types/react`.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bannedSpecifierReason } from '../check-self-contained.ts'

test('a path on disk is refused, and says so', () => {
  for (const range of ['link:../ui', 'file:./local', 'portal:../x', '/home/user/pkg', '~/pkg']) {
    const reason = bannedSpecifierReason(range)
    assert.notEqual(reason, null, `${range} must be refused`)
    assert.match(reason ?? '', /a path on disk/)
  }
})

test('a live GitHub reference is refused, and is NOT called a path on disk', () => {
  const live = [
    'github:V1ki/dsh-plugin-subscriptions',
    'git+https://github.com/owner/repo.git',
    'git+ssh://git@github.com/owner/repo.git',
    'git://github.com/owner/repo',
    'https://example.com/pkg-1.0.0.tgz'
  ]
  for (const range of live) {
    const reason = bannedSpecifierReason(range)
    assert.notEqual(reason, null, `${range} must be refused`)
    assert.match(reason ?? '', /live link|the latest of that repo/)
  }
})

test('semver tilde is a version, not a home path', () => {
  assert.equal(bannedSpecifierReason('~18.3.1'), null)
  assert.equal(bannedSpecifierReason('~2.0'), null)
})

test('the ways TCH is allowed to name a dependency stay allowed', () => {
  for (const range of ['1.2.3', '^1.2.3', '>=1.0.0 <2.0.0', 'workspace:*', 'catalog:', 'npm:x@1']) {
    assert.equal(bannedSpecifierReason(range), null, `${range} must stay allowed`)
  }
})
