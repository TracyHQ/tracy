// `scripts/lib/dsh-build-state.mjs` decides two things `scripts/build-dsh.mjs` acts on: which files
// a build must delete before and after itself (`*.tsbuildinfo`, the incremental state that leaked between PRs
// on the CI runners, 26/09), and which files ARE the build (what CI caches and restores). Both are
// pinned here on a throwaway git tree shaped like the submodule — never on the real one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { buildKey, buildOutputs, incrementalState, readStamp, staleBuild } from '../lib/dsh-build-state.mjs'

/** A small tree with the submodule's shape: sources tracked, build output and deps ignored. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-build-state-'))
  const put = (path, body = 'x') => {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  put('.gitignore', 'lib/\ndist/\nbin/\nnode_modules/\n*.tsbuildinfo\n')
  put('packages/a/b/package.json', '{}')
  put('packages/a/b/src/index.ts')
  put('packages/a/b/lib/index.js')
  put('packages/a/b/lib/tsconfig.tsbuildinfo')
  put('packages/a/b/node_modules/dep/lib/index.js')
  put('packages/a/b/node_modules/dep/tsconfig.tsbuildinfo')
  put('apps/web/dist/index.html')
  put('native/system/packages/linux-x64/bin/glibc/system.node')
  put('tsconfig.host.tsbuildinfo')
  put('node_modules/.pnpm/x/lib/y.js')
  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  git('init', '-q')
  git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init')
  return dir
}

test('incremental state: every *.tsbuildinfo outside node_modules, nested ones included', (t) => {
  const dir = fixture()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.deepEqual(
    incrementalState(dir).map((file) => relative(dir, file)),
    ['packages/a/b/lib/tsconfig.tsbuildinfo', 'tsconfig.host.tsbuildinfo']
  )
})

test('build outputs: what git ignores, whole directories as one entry, dependency trees left out', (t) => {
  const dir = fixture()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.deepEqual(buildOutputs(dir), [
    'apps/web/dist/',
    'native/system/packages/linux-x64/bin/',
    'packages/a/b/lib/',
    'tsconfig.host.tsbuildinfo'
  ])
})

// 07/10: a worktree whose dsh `lib/` was built at an older submodule commit booted a blank page
// (`@tracy/dsh-assistant: pending (waiting for service: chatLocal)`) — the pin had moved to a fork
// commit that adds `chatLocal`, the build had not. `run.sh` now refuses to boot such a tree.
test('stale build: a stamp naming another key, or no stamp at all, is stale; a matching one is not', () => {
  const key = 'd89d1528d29c42e15161a20b14989afce4d37fb7fa97fa831fa9d70dde553a02'
  assert.equal(staleBuild({ key, stamp: key }), null)
  assert.match(
    staleBuild({ key, stamp: '4fe6002bdfd634929e1547f0e3d46f5828691e927f996198f717574935ea6a93' }) ?? '',
    /another submodule commit/
  )
  assert.match(staleBuild({ key, stamp: '' }) ?? '', /no build stamp/)
})

test('build key: a clean checkout has one, a tracked edit has none, the script and HEAD both change it', (t) => {
  const dir = fixture()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const script = join(dir, 'build.mjs')
  writeFileSync(script, 'one')
  const first = buildKey(dir, script)
  assert.match(first ?? '', /^[0-9a-f]{64}$/)
  assert.equal(buildKey(dir, script), first, 'the same tree and script give the same key')
  writeFileSync(script, 'two')
  assert.notEqual(buildKey(dir, script), first, 'a change to the build script is a different build')
  writeFileSync(join(dir, 'packages/a/b/src/index.ts'), 'edited')
  assert.equal(buildKey(dir, script), null, 'tracked edits: nothing honest to compare against')
  spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'next'])
  writeFileSync(script, 'one')
  assert.notEqual(buildKey(dir, script), first, 'another commit is a different build')
})

test('build key: a folder that is not a git checkout is an error, not "no key"', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-build-key-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'build.mjs'), 'x')
  assert.throws(() => buildKey(dir, join(dir, 'build.mjs')), /not a git checkout/)
})

test('stamp: read from the place build-dsh.mjs writes it, empty when absent', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-stamp-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.equal(readStamp(dir), '')
  mkdirSync(join(dir, 'apps/cli/lib'), { recursive: true })
  writeFileSync(join(dir, 'apps/cli/lib/.tracy-build-stamp'), 'abc\n')
  assert.equal(readStamp(dir), 'abc')
})
