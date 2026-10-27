#!/usr/bin/env node
/**
 * The agent-token custody helpers in `provision/platform/emdash.sh` (#155): the file both provision
 * branches converge on, created before `compose up` and written in place so its read-only bind mount
 * stays valid. This drives the REAL function source — extracted from the script and sourced — with a
 * throwaway SITE_DIR, so what is asserted is the code that ships, not a paraphrase.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/emdash-agent-token.test.mjs
 *
 * Root OWNERSHIP (chown 0:0) is a fleet-host property a non-root test cannot set or observe, so the
 * positive cases here shadow chown/stat to simulate root and a real non-root run is asserted to FAIL
 * closed (no test-env bypass). The root:0600 custody itself — that www-data/nobody can neither read
 * nor replace the RO-bound file while root can, and that a host in-place update is visible and
 * persistent — is proven on a real Linux container by `emdash-agent-token-ro-mount.fixture.mjs` in
 * this package. Here we pin the writer's half: a REGULAR 0600 file, created-if-missing, never
 * clobbered, written IN PLACE (stable inode), and fail-closed on anything that is not the PAT shape.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/provision/platform/emdash.sh', import.meta.url))

// The three helpers, lifted out of the script by their own boundaries (no top-level side effects in
// this range — the image-resolution code runs before it). If these markers move, the test fails
// loudly rather than silently testing nothing.
function helperSource() {
  const src = readFileSync(SCRIPT, 'utf8')
  const start = src.indexOf('_emdash_agent_token_file()')
  const end = src.indexOf('platform_compose() {')
  assert.ok(start !== -1 && end !== -1 && end > start, 'could not locate the token helpers in emdash.sh')
  return src.slice(start, end)
}

// The custody helpers always `chown 0:0` and read the owner back with `stat` — a non-root test can
// do neither for real (that is the point: a real non-root run FAILS closed, proven below). To pin
// the WRITER's half (regular 0600 file, stable inode, fail-closed shapes) without root, these shadow
// the two commands: chown succeeds and stat reports uid 0 for the owner query, while the REAL mode
// is passed through (`command stat`), so a genuine chmod-600 failure is still observable. Injected
// AFTER the helper source so the shadows win over the external commands the helpers call.
const MOCK_ROOT =
  `chown() { return 0; }\n` + `stat() { case "$*" in *'%u'*) echo 0; return 0;; esac; command stat "$@"; }\n`

/** Run one bash body with the helpers sourced and SITE_DIR set; return {status, stdout, stderr}. */
function withHelpers(siteDir, body, { mockRoot = true } = {}) {
  const pre = mockRoot ? MOCK_ROOT : ''
  const script = `set -euo pipefail\nSITE_DIR=${JSON.stringify(siteDir)}\n${helperSource()}\n${pre}${body}\n`
  try {
    const stdout = execFileSync('bash', ['-c', script], { encoding: 'utf8' })
    return { status: 0, stdout, stderr: '' }
  } catch (e) {
    return { status: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }
  }
}

function siteDir(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'emdash-token-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
const tokenPath = (dir) => path.join(dir, 'tracy-agent.token')
const GOOD = 'ec_pat_ABCdef0123456789ghijkl' // ec_pat_ + >=16 of [A-Za-z0-9_-]

test('prepare creates a REGULAR 0600 file when none exists', (t) => {
  const dir = siteDir(t)
  const r = withHelpers(dir, '_emdash_prepare_token_file')
  assert.equal(r.status, 0, r.stderr)
  const st = statSync(tokenPath(dir))
  assert.ok(st.isFile(), 'not a regular file')
  assert.equal(st.mode & 0o777, 0o600)
  assert.equal(st.size, 0, 'the pre-created token file should be empty until minted')
})

test('prepare never clobbers an already-minted token, and re-runs idempotently', (t) => {
  const dir = siteDir(t)
  writeFileSync(tokenPath(dir), `${GOOD}\n`)
  const r = withHelpers(dir, '_emdash_prepare_token_file; _emdash_prepare_token_file')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(tokenPath(dir), 'utf8'), `${GOOD}\n`)
  assert.equal(statSync(tokenPath(dir)).mode & 0o777, 0o600)
})

test('prepare refuses to proceed if a DIRECTORY sits where the file must be (a bad earlier up)', (t) => {
  const dir = siteDir(t)
  execFileSync('mkdir', ['-p', tokenPath(dir)])
  const r = withHelpers(dir, '_emdash_prepare_token_file')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /is a directory/)
})

test('store writes a valid PAT 0600, with a trailing newline, and reports success', (t) => {
  const dir = siteDir(t)
  const r = withHelpers(dir, `_emdash_prepare_token_file; _emdash_store_agent_token ${GOOD}`)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(tokenPath(dir), 'utf8'), `${GOOD}\n`)
  assert.equal(statSync(tokenPath(dir)).mode & 0o777, 0o600)
})

test('store writes IN PLACE — the inode the bind mount holds is preserved across updates', (t) => {
  const dir = siteDir(t)
  withHelpers(dir, '_emdash_prepare_token_file')
  const before = statSync(tokenPath(dir)).ino
  const r = withHelpers(dir, `_emdash_store_agent_token ${GOOD}`)
  assert.equal(r.status, 0, r.stderr)
  const after = statSync(tokenPath(dir)).ino
  assert.equal(after, before, 'the token file was replaced (new inode) — a bind mount would go stale')
})

test('store is FAIL-CLOSED: anything that is not the minted shape is refused, nonzero', (t) => {
  const dir = siteDir(t)
  withHelpers(dir, '_emdash_prepare_token_file')
  for (const bad of [
    '',
    'not-a-pat',
    'ec_pat_short',
    'sk-live-xxxxxxxxxxxxxxxx',
    'ec_pat_ABCdef0123456789 tail'
  ]) {
    const r = withHelpers(dir, `_emdash_store_agent_token ${JSON.stringify(bad)}`)
    assert.notEqual(r.status, 0, `should refuse ${JSON.stringify(bad)}`)
    // a refusal must not have written the junk into the file
    assert.equal(
      readFileSync(tokenPath(dir), 'utf8'),
      '',
      `refused value ${JSON.stringify(bad)} was written anyway`
    )
  }
})

// 🔒 THE CONFIRMED FAILURE (parent, 12:31 UTC): with a DIRECTORY at the destination, `if
// _emdash_store_agent_token <PAT>; then …` returned SUCCESS — the `if` condition disables errexit
// throughout the helper, so the failed `printf > $dir` was followed by a succeeding `chmod` and the
// function returned 0. This drives the helper in EXACTLY that conditional context and asserts the
// branch that must never be taken is not taken.
test('store called from an `if` condition FAILS CLOSED when the destination is a directory', (t) => {
  const dir = siteDir(t)
  execFileSync('mkdir', ['-p', tokenPath(dir)])
  const r = withHelpers(
    dir,
    `if _emdash_store_agent_token ${GOOD}; then echo REACHED_THEN; else echo took-else rc=$?; fi`
  )
  // The whole point: the success branch of the `if` must not run.
  assert.doesNotMatch(r.stdout, /REACHED_THEN/, 'store returned success against a directory destination')
  assert.match(r.stdout, /took-else/)
  assert.ok(statSync(tokenPath(dir)).isDirectory(), 'the directory must be left untouched, not written into')
})

test('store refuses a SYMLINK destination and does not write through it', (t) => {
  const dir = siteDir(t)
  const outside = path.join(dir, 'outside-target')
  writeFileSync(outside, '')
  execFileSync('ln', ['-s', outside, tokenPath(dir)])
  const r = withHelpers(dir, `_emdash_store_agent_token ${GOOD}`)
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /symlink/)
  // The write must not have followed the link to its target.
  assert.equal(readFileSync(outside, 'utf8'), '', 'the token was written through the symlink to its target')
})

test('prepare refuses a SYMLINK where the file must be, before creating anything', (t) => {
  const dir = siteDir(t)
  const outside = path.join(dir, 'dangling')
  execFileSync('ln', ['-s', outside, tokenPath(dir)])
  const r = withHelpers(dir, '_emdash_prepare_token_file')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /symlink/)
  // It must NOT have followed the dangling link and created the target.
  assert.equal(existsSync(outside), false, 'prepare created the symlink target — it followed the link')
})

// The permission steps are the ones the confirmed bug swallowed. A non-root test cannot make a real
// `chown 0:0` fail, so we shadow the commands with shell functions of the same name (the helper
// calls them as commands, so a function shadows them) to prove each failure PROPAGATES rather than
// being ignored — the property, not the specific errno.
test('store propagates a failed chmod (permission step is not swallowed)', (t) => {
  const dir = siteDir(t)
  withHelpers(dir, '_emdash_prepare_token_file')
  const r = withHelpers(dir, `chmod() { return 1; }\n_emdash_store_agent_token ${GOOD}`)
  assert.notEqual(r.status, 0, 'a failed chmod must fail the store')
  assert.match(r.stderr, /chmod/)
})

test('store propagates a failed chown (there is no non-root skip — chown always runs)', (t) => {
  const dir = siteDir(t)
  withHelpers(dir, '_emdash_prepare_token_file')
  // The helper always `chown 0:0`s — a failure must fail closed rather than leave an agent-readable
  // owner and report success (the old `chown … || true`, and the old "skip when not root" branch).
  const r = withHelpers(dir, `chown() { return 1; }\n_emdash_store_agent_token ${GOOD}`)
  assert.notEqual(r.status, 0, 'a failed chown must fail the store')
  assert.match(r.stderr, /chown/)
})

// 🔒 No test-env bypass: a REAL non-root run (chown/stat unmocked) cannot chown the file to uid 0,
// so prepare must fail closed here — this is the property that keeps a uid-33 (www-data) provision
// from leaving the token under the agent's own owner. Skipped only if the test itself runs as root.
test('prepare FAILS for a real non-root run — chown 0:0 cannot succeed, and is not skipped', (t) => {
  if (process.getuid && process.getuid() === 0) return // a real root run legitimately succeeds
  const dir = siteDir(t)
  const r = withHelpers(dir, '_emdash_prepare_token_file', { mockRoot: false })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /chown|root/)
})

test('secure VERIFIES ownership: a chown that "succeeds" but leaves a non-root owner FAILS', (t) => {
  const dir = siteDir(t)
  // chown lies (returns 0), stat reports uid 33 (www-data): the read-back must reject it.
  const r = withHelpers(
    dir,
    `chown() { return 0; }\nstat() { case "$*" in *'%u'*) echo 33; return 0;; esac; command stat "$@"; }\n_emdash_prepare_token_file`,
    { mockRoot: false }
  )
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /owned by root|uid 33/)
})
