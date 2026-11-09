// Red codes of the three gaps met on 2026-11-08 (faults.md F15 to F17), each shown failing on a broken input and
// passing on a good one. F15 and F16 are server facts with no offline checker: the code is the line the demo update
// prints, read by `failureReason` (what /ops shows). F17 is read by the language policy checker on the branch.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const { failureReason } = await import(join(ROOT, 'apps/tracy-web/src/lib/demo-sites.js'))
const { checkRange } = await import(join(ROOT, 'scripts/check-language-policy.mjs'))

const NOT_ON_DISK = '!! contract profile wren-example/j6/1.0.0: not on disk — the site cannot be bound to it'
const FETCH_504 =
  '!! contract-fetch: profile wren-example/j6/1.0.0 could not be put on disk: fetch failed: download failed: The requested URL returned error: 504'
const log = (...lines) => ({
  output: ['==> installing the Cowork component', ...lines, '[stage]    41s  +2s    x'].join('\n')
})

test('F15: a sticky 5xx on the download route is read as the reason, not hidden', () => {
  assert.match(failureReason(log(FETCH_504, NOT_ON_DISK)) ?? '', /returned error: 504/)
})

test('F16: an old provisioner log shows only "not on disk" (red); a fixed one names the cause (green)', () => {
  const old = failureReason(log(NOT_ON_DISK)) ?? ''
  assert.match(old, /not on disk/)
  assert.doesNotMatch(old, /contract-fetch/)
  assert.match(
    failureReason(log(FETCH_504, NOT_ON_DISK)) ?? '',
    /^contract-fetch: profile .* could not be put on disk/
  )
  assert.equal(failureReason(log('==> done')), null)
})

function kitRepo(t, size) {
  const root = mkdtempSync(join(tmpdir(), 'red-codes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...a) =>
    execFileSync(
      'git',
      [
        '-C',
        root,
        '-c',
        'commit.gpgsign=false',
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.test',
        ...a
      ],
      {
        encoding: 'utf8'
      }
    ).trim()
  git('init', '--quiet', '-b', 'main')
  writeFileSync(join(root, 'README.md'), 'English guide.\n')
  git('add', 'README.md')
  git('commit', '--quiet', '-m', 'chore: initial snapshot')
  const base = git('rev-parse', 'HEAD')
  const path = 'contracts/wren-example/j6/1.0.0/template-kit.json'
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), `{"text":"${'a'.repeat(size)}"}\n`)
  git('add', path)
  git('commit', '--quiet', '-m', 'feat: add the example template kit')
  const head = git('rev-parse', 'HEAD')
  const oid = git('rev-parse', `HEAD:${path}`)
  return { root, base, head, path, oid }
}
const policy = (objects = []) => ({ version: 1, translations: [], lines: [], objects })

test('F17: a kit over 16 MB is a finding until an exact object exemption exists; one under 16 MB passes', (t) => {
  const big = kitRepo(t, 16 * 1024 * 1024 + 1024)
  const run = (k, p) => checkRange({ repo: k.root, base: k.base, head: k.head, policy: p }).findings
  const red = run(big, policy())
  assert.ok(red.some((f) => f.path === big.path && /text blob exceeds 16777216 bytes/.test(f.problem)))
  const exempt = policy([{ path: big.path, oid: big.oid, reason: 'Sealed example kit.' }])
  assert.deepEqual(run(big, exempt), [])
  const small = kitRepo(t, 1024)
  assert.deepEqual(run(small, policy()), [])
})
