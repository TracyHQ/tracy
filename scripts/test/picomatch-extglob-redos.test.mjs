// picomatch has no release that fixes GHSA-fc5q-39xc-vjpf (CVE-2026-112366): a single-branch
// repeated extglob such as `+(*)` or `+(*a)` compiled to a nested quantifier, `(?:[^/]*?a)+`, and
// a long input that does not match backtracked exponentially (`+(*)` against 'a' x 22 + '/' took
// 0.4 s, and doubles with each extra character). The root workspace and the six EmDash themes carry
// the lib/parse.js part of upstream PR #246 as a pnpm patch (patches/picomatch@<version>.patch,
// named in patchedDependencies). This file holds every copy the root install placed, and keeps the
// themes' patch files and pnpm-workspace.yaml rows in step with the root ones; each theme's own
// tests/picomatch-extglob-redos.test.mjs holds the copies its own lockfile installs.
// Run from the repository root, as pnpm test:workers does.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'

const R = process.cwd()
const THEMES = ['base', 'business', 'coffee', 'diner', 'restaurant', 'saas'].map(
  (t) => `packages/cms/tracy-emdash-theme-${t}`
)
const PATCHES = readdirSync(path.join(R, 'patches')).filter((f) => /^picomatch@[\d.]+\.patch$/.test(f))
const copies = readdirSync(path.join(R, 'node_modules/.pnpm'))
  .filter((n) => /^picomatch@\d/.test(n))
  .map((n) => path.join(R, 'node_modules/.pnpm', n, 'node_modules/picomatch'))

// The match runs in a child with a deadline, so an unpatched copy fails this test instead of
// hanging the suite. Patched, each match takes well under a millisecond.
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

test('the root install has a patched copy of every picomatch version it holds', () => {
  assert.ok(copies.length > 0, 'no picomatch in node_modules/.pnpm')
  assert.deepEqual(
    copies
      .map((c) => path.basename(path.dirname(path.dirname(c))))
      .filter((n) => !n.includes('_patch_hash=')),
    []
  )
  const workspace = readFileSync(path.join(R, 'pnpm-workspace.yaml'), 'utf8')
  for (const p of PATCHES) {
    const name = p.replace(/\.patch$/, '')
    assert.match(
      workspace,
      new RegExp(`^  ${name.replace(/\./g, '\\.')}: patches/${p.replace(/\./g, '\\.')}$`, 'm')
    )
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
    assert.ok(pm.isMatch('ba', '+(*a)'))
    assert.ok(pm.isMatch('baba', '+(*a)'))
    assert.ok(!pm.isMatch('ab', '+(*a)'))
    assert.ok(pm.isMatch('abc', '+(*)'))
    assert.ok(!pm.isMatch('a/b', '+(*)'))
    assert.ok(pm.isMatch('foo.js', '*(*.js)'))
  })
}

test('each EmDash theme carries the root patch files and names them in patchedDependencies', () => {
  assert.ok(PATCHES.length > 0, 'no picomatch patch in patches/')
  for (const theme of THEMES) {
    const workspace = readFileSync(path.join(R, theme, 'pnpm-workspace.yaml'), 'utf8')
    for (const p of PATCHES) {
      assert.equal(
        readFileSync(path.join(R, theme, 'patches', p), 'utf8'),
        readFileSync(path.join(R, 'patches', p), 'utf8'),
        `${theme}/patches/${p}`
      )
      assert.ok(
        workspace.includes(`${p.replace(/\.patch$/, '')}: patches/${p}`),
        `${theme}/pnpm-workspace.yaml`
      )
    }
    // A production install reads the patch files: the image and the release zip must carry them.
    assert.match(
      readFileSync(path.join(R, theme, 'Dockerfile'), 'utf8'),
      /^COPY patches \.\/patches$/m,
      theme
    )
    const contract = JSON.parse(readFileSync(path.join(R, theme, 'qa.contract.json'), 'utf8'))
    assert.ok(contract.distribution.include.includes('patches'), `${theme}/qa.contract.json`)
  }
})
