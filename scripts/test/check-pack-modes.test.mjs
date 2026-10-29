/**
 * `scripts/check-pack-modes.mjs` on a pack folder: a webroot at 0644/0755 passes, one holding
 * 0600/0700 members (the 12/10/2026 WordPress packs) is refused, a pack without a webroot has
 * nothing to check, and an unreadable argument is exit 2, never a pass. The quickstart-contract
 * skill, which tells an agent how to restore and pack, never runs those under `umask 077` (moved
 * here from step S3 of REG-PR-1228 so CI runs it whenever the skill changes).
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = path.join(ROOT, 'scripts', 'check-pack-modes.mjs')

/** A pack folder whose webroot holds `./wp-load.php` at `fileMode` under a root at `dirMode`. */
function pack(fileMode, dirMode) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pack-modes-'))
  const site = path.join(dir, 'site')
  mkdirSync(site)
  writeFileSync(path.join(site, 'wp-load.php'), '<?php\n')
  chmodSync(path.join(site, 'wp-load.php'), fileMode)
  chmodSync(site, dirMode)
  // COPYFILE_DISABLE: macOS tar would add AppleDouble `._*` members for extended attributes.
  execFileSync('tar', ['-czf', path.join(dir, 'x-webroot-1.0.0.tar.gz'), '-C', site, '.'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' }
  })
  chmodSync(site, 0o755)
  writeFileSync(
    path.join(dir, 'tracy_setting.json'),
    JSON.stringify({ install: { webroot: { file: 'x-webroot-1.0.0.tar.gz' } } })
  )
  return dir
}

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

test('a webroot at 0644/0755 passes', () => {
  const dir = pack(0o644, 0o755)
  try {
    const r = run(dir)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /^OK {3}x-webroot-1\.0\.0\.tar\.gz: 2 members/m)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a webroot holding 0600/0700 members is refused', () => {
  const dir = pack(0o600, 0o700)
  try {
    const r = run(dir)
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(
      r.stdout,
      /FAIL x-webroot-1\.0\.0\.tar\.gz holds 2 of 2 members .*1 directory 0700, 1 file 0600/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a pack without a webroot passes with a note; a missing path is exit 2', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pack-modes-'))
  try {
    writeFileSync(
      path.join(dir, 'tracy_setting.json'),
      JSON.stringify({ install: { bundle: { file: 'a.zip' } } })
    )
    const r = run(dir)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /no webroot archive to check/)
    assert.equal(run(path.join(dir, 'absent')).status, 2)
    assert.equal(run().status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const SKILL = path.join(ROOT, '.agents/skills/quickstart-contract')

/** What in a skill folder would cut a pack, or restore one, with 0600/0700 members. */
function umaskProblems(skill) {
  const problems = []
  for (const file of [
    'SKILL.md',
    ...readdirSync(path.join(skill, 'references')).map((f) => `references/${f}`)
  ]) {
    const text = readFileSync(path.join(skill, file), 'utf8')
    if (/\(umask 077;[^)]*"\$TD" (?:restore|quickstart)/.test(text))
      problems.push(`${file} wraps a restore in umask 077`)
    if (/^\s*umask 077; mkdir/m.test(text)) problems.push(`${file} sets umask 077 for the rest of a block`)
  }
  return problems
}

test('the quickstart-contract skill keeps umask 077 off restores and packs', () => {
  assert.ok(readdirSync(path.join(SKILL, 'references')).length > 0, 'the skill has references to read')
  assert.deepEqual(umaskProblems(SKILL), [])
})

test('the skill check flags a wrapped restore and a block-wide umask', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'skill-umask-'))
  try {
    mkdirSync(path.join(dir, 'references'))
    writeFileSync(path.join(dir, 'SKILL.md'), '(umask 077; "$TD" restore x.tar.gz)\n')
    writeFileSync(path.join(dir, 'references', 'packing.md'), '```bash\n  umask 077; mkdir -p "$WORK"\n```\n')
    writeFileSync(path.join(dir, 'references', 'ok.md'), '(umask 022; "$TD" quickstart pack)\n')
    assert.deepEqual(umaskProblems(dir), [
      'SKILL.md wraps a restore in umask 077',
      'references/packing.md sets umask 077 for the rest of a block'
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
