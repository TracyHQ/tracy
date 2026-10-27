#!/usr/bin/env node
/**
 * sync-site-folders.sh, run for real against a throwaway TRACY_SITES_ROOT: two site directories,
 * one with a readable `.tracy/site.json` and one without. What is asserted is the contract this
 * script's only caller (tracy-host's hourly clock, `apps/tracy-host/src/sync.js`) depends on: every site whose folder
 * carries a `siteKey` gets pushed with `<label> <siteKey>`, and a site that doesn't is skipped and
 * named on stderr rather than silently dropped or guessed at.
 *
 * `push-site-folder.sh` itself is stubbed out — a real push needs a GitHub token and a network —
 * via TRACY_PUSH_SITE_FOLDER, the explicit override the script under test reads instead of always
 * shelling out to its real sibling script (Plan 3 Task 2 fix round 2: a PATH lookup was rejected as
 * a hijack surface for a script that runs as root from a timer).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/sync-site-folders.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pathWithFlock } from './flock-shim.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/tools/sync-site-folders.sh', import.meta.url))

/**
 * Runs the script with stderr folded into stdout — every `say()` in it writes to stderr, and
 * `execFileSync`'s return value is stdout alone, so a plain call would see nothing it prints.
 */
function run(args, env) {
  return execFileSync('bash', ['-c', 'exec "$0" "$@" 2>&1', SCRIPT, ...args], {
    encoding: 'utf8',
    env
  })
}

/** A stub push-site-folder.sh that records its own argv, one call per line, to recordFile. */
function stubPush(recordFile) {
  const bin = mkdtempSync(join(tmpdir(), 'sync-stub-bin-'))
  const script = join(bin, 'push-site-folder.sh')
  writeFileSync(script, `#!/usr/bin/env bash\necho "$1 $2" >> "${recordFile}"\n`)
  chmodSync(script, 0o755)
  return { bin, script }
}

/** One site directory under a TRACY_SITES_ROOT, shaped the way ensure-site-folder.mjs leaves one. */
function makeSite(sitesRoot, label, { gitignore = true, siteJson } = {}) {
  const dir = join(sitesRoot, label)
  mkdirSync(dir, { recursive: true })
  if (gitignore) writeFileSync(join(dir, '.gitignore'), '.webroot/\n.tracy/\n')
  if (siteJson !== undefined) {
    mkdirSync(join(dir, '.tracy'), { recursive: true })
    writeFileSync(join(dir, '.tracy', 'site.json'), siteJson)
  }
  return dir
}

test('a site with a readable siteKey is pushed; one without is skipped and named', () => {
  const sitesRoot = mkdtempSync(join(tmpdir(), 'tracy-sites-'))
  const lockDir = mkdtempSync(join(tmpdir(), 'tracy-lock-'))
  const recordFile = join(lockDir, 'pushed.txt')
  const { bin, script } = stubPush(recordFile)
  try {
    makeSite(sitesRoot, 'good-site', {
      siteJson: `${JSON.stringify({ siteKey: 'good-site.tracy.ai', platform: 'wordpress' }, null, 1)}\n`
    })
    // No .tracy/site.json at all — the shape a site mid-provision, or one whose folder predates
    // this file, would have.
    makeSite(sitesRoot, 'bad-site', {})

    const out = run([], {
      ...process.env,
      PATH: pathWithFlock(),
      TRACY_PUSH_SITE_FOLDER: script,
      TRACY_SITES_ROOT: sitesRoot,
      TRACY_SYNC_LOCK: join(lockDir, 'sync.lock')
    })

    assert.match(out, /done: 1 synced, 0 skipped, 0 failed/)
    assert.match(out, /bad-site: no \.tracy\/site\.json \(or no siteKey in it\) — skipped/)
    assert.doesNotMatch(out, /bad-site \(/)

    const pushed = readFileSync(recordFile, 'utf8').trim().split('\n')
    assert.deepEqual(pushed, ['good-site good-site.tracy.ai'])
  } finally {
    rmSync(sitesRoot, { recursive: true, force: true })
    rmSync(lockDir, { recursive: true, force: true })
    rmSync(bin, { recursive: true, force: true })
  }
})

test('a site with no .gitignore is skipped before the siteKey is even read', () => {
  const sitesRoot = mkdtempSync(join(tmpdir(), 'tracy-sites-'))
  const lockDir = mkdtempSync(join(tmpdir(), 'tracy-lock-'))
  const recordFile = join(lockDir, 'pushed.txt')
  const { bin, script } = stubPush(recordFile)
  try {
    // A directory that happens to sit under TRACY_SITES_ROOT but was never built by
    // ensure-site-folder.mjs (e.g. a stray directory, or one caught mid-build).
    mkdirSync(join(sitesRoot, 'no-gitignore'), { recursive: true })

    const out = run([], {
      ...process.env,
      PATH: pathWithFlock(),
      TRACY_PUSH_SITE_FOLDER: script,
      TRACY_SITES_ROOT: sitesRoot,
      TRACY_SYNC_LOCK: join(lockDir, 'sync.lock')
    })

    assert.match(out, /no-gitignore: no \.gitignore in .* — not a site folder, skipped/)
    assert.match(out, /done: 0 synced, 0 skipped, 0 failed/)
  } finally {
    rmSync(sitesRoot, { recursive: true, force: true })
    rmSync(lockDir, { recursive: true, force: true })
    rmSync(bin, { recursive: true, force: true })
  }
})

test('--label filters to one site, by name', () => {
  const sitesRoot = mkdtempSync(join(tmpdir(), 'tracy-sites-'))
  const lockDir = mkdtempSync(join(tmpdir(), 'tracy-lock-'))
  const recordFile = join(lockDir, 'pushed.txt')
  const { bin, script } = stubPush(recordFile)
  try {
    makeSite(sitesRoot, 'site-a', {
      siteJson: `${JSON.stringify({ siteKey: 'a.tracy.ai' }, null, 1)}\n`
    })
    makeSite(sitesRoot, 'site-b', {
      siteJson: `${JSON.stringify({ siteKey: 'b.tracy.ai' }, null, 1)}\n`
    })

    run(['site-a'], {
      ...process.env,
      PATH: pathWithFlock(),
      TRACY_PUSH_SITE_FOLDER: script,
      TRACY_SITES_ROOT: sitesRoot,
      TRACY_SYNC_LOCK: join(lockDir, 'sync.lock')
    })

    const pushed = readFileSync(recordFile, 'utf8').trim().split('\n')
    assert.deepEqual(pushed, ['site-a a.tracy.ai'])
  } finally {
    rmSync(sitesRoot, { recursive: true, force: true })
    rmSync(lockDir, { recursive: true, force: true })
    rmSync(bin, { recursive: true, force: true })
  }
})

/** A stub push-site-folder.sh whose exit code is picked per label: `<label>=<code>` lines in codesFile. */
function stubPushByLabel(codesFile) {
  const bin = mkdtempSync(join(tmpdir(), 'sync-stub-bin-'))
  const script = join(bin, 'push-site-folder.sh')
  writeFileSync(
    script,
    `#!/usr/bin/env bash\ncode=$(sed -n "s/^$1=//p" "${codesFile}")\necho "pushing $1"\nexit "\${code:-0}"\n`
  )
  chmodSync(script, 0o755)
  return { bin, script }
}

test('synced, skipped (exit 3: no repo) and failed are counted apart; only a failure fails the run (R5)', () => {
  const sitesRoot = mkdtempSync(join(tmpdir(), 'tracy-sites-'))
  const lockDir = mkdtempSync(join(tmpdir(), 'tracy-lock-'))
  const codesFile = join(lockDir, 'codes.txt')
  const { bin, script } = stubPushByLabel(codesFile)
  const env = {
    ...process.env,
    PATH: pathWithFlock(),
    TRACY_PUSH_SITE_FOLDER: script,
    TRACY_SITES_ROOT: sitesRoot,
    TRACY_SYNC_LOCK: join(lockDir, 'sync.lock')
  }
  try {
    for (const label of ['ok-site', 'demo-site', 'broken-site']) {
      makeSite(sitesRoot, label, { siteJson: `${JSON.stringify({ siteKey: `${label}.tracy.ai` })}\n` })
    }
    writeFileSync(codesFile, 'ok-site=0\ndemo-site=3\nbroken-site=1\n')
    const failedRun = spawnSync('bash', ['-c', 'exec "$0" 2>&1', SCRIPT], { encoding: 'utf8', env })
    assert.notEqual(failedRun.status, 0, 'one failed site fails the run')
    assert.match(failedRun.stdout, /demo-site: no repo on record — skipped/)
    assert.match(failedRun.stdout, /broken-site: push failed \(exit 1\)/)
    assert.match(failedRun.stdout, /done: 1 synced, 1 skipped, 1 failed\n?$/)

    // No failure: a skipped site alone leaves the run green.
    writeFileSync(codesFile, 'ok-site=0\ndemo-site=3\nbroken-site=0\n')
    const greenRun = spawnSync('bash', ['-c', 'exec "$0" 2>&1', SCRIPT], { encoding: 'utf8', env })
    assert.equal(greenRun.status, 0, greenRun.stdout)
    assert.match(greenRun.stdout, /done: 2 synced, 1 skipped, 0 failed/)
  } finally {
    rmSync(sitesRoot, { recursive: true, force: true })
    rmSync(lockDir, { recursive: true, force: true })
    rmSync(bin, { recursive: true, force: true })
  }
})
