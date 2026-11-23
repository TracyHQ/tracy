// picomatch has no release that fixes GHSA-fc5q-39xc-vjpf (CVE-2026-112366): a single-branch
// repeated extglob such as `+(*)` or `+(*a)` compiled to a nested quantifier, `(?:[^/]*?a)+`, and
// a long input that does not match backtracked exponentially (0.4 s at 22 characters, doubling
// with each one more). This template installs both copies with the lib/parse.js part of upstream
// PR #246 (patches/, named in pnpm-workspace.yaml patchedDependencies); this test holds every copy
// this template's own lockfile installs. The same check for the TCH root lives in
// scripts/test/picomatch-extglob-redos.test.mjs there.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { distributionFiles, patchFilesOf } from '../tools/distribution.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const store = path.join(root, 'node_modules/.pnpm')
const copies = readdirSync(store)
  .filter((n) => /^picomatch@\d/.test(n))
  .map((n) => path.join(store, n, 'node_modules/picomatch'))

// The match runs in a child with a deadline, so an unpatched copy fails instead of hanging the suite.
const LONG = 'a'.repeat(40)
const probe = (dir) =>
  execFileSync(
    process.execPath,
    [
      '-e',
      `const pm = require(${JSON.stringify(dir)})
       const t = Date.now()
       const hits = [pm('+(*)')('${LONG}/'), pm.makeRe('+(*a)').test('${LONG}!'),
         pm.makeRe('*(*a)').test('${LONG}!'), pm.makeRe('+(*a)', { capture: true }).test('${LONG}!')]
       console.log(JSON.stringify({ hits, ms: Date.now() - t }))`
    ],
    { encoding: 'utf8', timeout: 5000 }
  )

test('every installed picomatch copy is the patched one', () => {
  assert.ok(copies.length > 0, 'no picomatch in node_modules/.pnpm')
  const names = copies.map((c) => path.basename(path.dirname(path.dirname(c))))
  assert.deepEqual(
    names.filter((n) => !n.includes('_patch_hash=')),
    []
  )
  const workspace = readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8')
  for (const n of names) {
    const id = n.split('_patch_hash=')[0]
    assert.ok(workspace.includes(`${id}: patches/${id}.patch`), `pnpm-workspace.yaml names ${id}`)
  }
})

for (const dir of copies) {
  const { version } = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))

  test(`picomatch ${version}: single-branch repeated extglobs answer a long non-match quickly`, () => {
    const out = JSON.parse(probe(dir))
    assert.deepEqual(out.hits, [false, false, false, false])
    assert.ok(out.ms < 500, `took ${out.ms} ms`)
  })

  test(`picomatch ${version}: ordinary globs match as before`, () => {
    const pm = createRequire(import.meta.url)(dir)
    assert.ok(pm.isMatch('index.js', '*.js'))
    assert.ok(!pm.isMatch('lib/index.js', '*.js'))
    assert.ok(pm.isMatch('docs/a/b.md', '**/*.md'))
    assert.ok(!pm.isMatch('docs/a/b.mdx', '**/*.md'))
    assert.ok(pm.isMatch('abba', '+(a|b)'))
    assert.ok(!pm.isMatch('abc', '+(a|b)'))
    assert.ok(pm.isMatch('y', '!(x)'))
    assert.ok(!pm.isMatch('x', '!(x)'))
    // The patched patterns keep their meaning: `+(*a)` is "ends in a", `+(*)` is one path segment.
    assert.ok(pm.isMatch('baba', '+(*a)'))
    assert.ok(!pm.isMatch('ab', '+(*a)'))
    assert.ok(pm.isMatch('abc', '+(*)'))
    assert.ok(!pm.isMatch('a/b', '+(*)'))
  })
}

// qa.contract.json is kept in the template's repository and not shipped (README, Checks): in an installed package the
// case that reads it skips and says why, as tests/personalize-row-limits.test.mjs does (sixth independent review of
// JA Restaurant 1.0.3: it failed with ENOENT, so `pnpm test` exited 1 in every installed site).
const CONTRACT = path.join(root, 'qa.contract.json')
const inRepo = { skip: existsSync(CONTRACT) ? false : 'qa.contract.json is not shipped: a repository test' }

test('the release pack carries the patch files pnpm-workspace.yaml names', inRepo, () => {
  const contract = JSON.parse(readFileSync(CONTRACT, 'utf8'))
  const named = patchFilesOf(readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'))
  assert.deepEqual(named, ['patches/picomatch@2.3.2.patch', 'patches/picomatch@4.0.7.patch'])
  const files = distributionFiles(root, contract)
  for (const patch of named) assert.ok(files.includes(patch), patch)
  // A contract regenerated without `patches` must stop the pack, not ship an uninstallable zip.
  const without = {
    ...contract,
    distribution: {
      ...contract.distribution,
      include: contract.distribution.include.filter((e) => e !== 'patches')
    }
  }
  assert.throws(() => distributionFiles(root, without), /Patch file omitted/)
})
