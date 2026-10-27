/**
 * A source run of the app keeps its data in its own profile folder (`src/dev-profile.js`):
 * `<root>/<worktree>/<origin>/<instance>`, so two agent sessions in two worktrees, or against two
 * origins, never share a cookie jar. A packaged app keeps Electron's own folder.
 *
 *   node --test packages/desktop/tracy-desktop/test/dev-profile.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { sourceProfile, cdpFromActivePort, runtimeRecord, secondLaunch } = require('../src/dev-profile.js')

// Electron's `appData` on macOS; the root sits in it.
const APP_DATA = '/Users/someone/Library/Application Support'
const DEFAULT_ROOT = '/Users/someone/Library/Application Support/Tracy Cowork Source'
const base = { packaged: false, repo: '/work/TCH', origin: 'local', env: {}, appData: APP_DATA }

test('a source run lives under the default root, in the default instance', () => {
  const profile = sourceProfile(base)
  assert.equal(path.dirname(path.dirname(path.dirname(profile.dir))), DEFAULT_ROOT)
  assert.equal(path.basename(profile.dir), 'default')
  assert.equal(profile.instance, 'default')
  assert.equal(profile.explicitInstance, false)
})

test('two worktrees, two origins and two instances give four different folders', () => {
  const dirs = new Set([
    sourceProfile(base).dir,
    sourceProfile({ ...base, repo: '/work/TCH-worktrees/other' }).dir,
    sourceProfile({ ...base, origin: 'http://tracy.test:8080' }).dir,
    sourceProfile({ ...base, env: { TRACY_DESKTOP_INSTANCE: 'agent-1' } }).dir
  ])
  assert.equal(dirs.size, 4)
})

test('the same inputs always give the same folder, so a second run finds the first one’s data', () => {
  const input = { ...base, origin: 'https://cowork.tracy.site' }
  assert.equal(sourceProfile(input).dir, sourceProfile({ ...input }).dir)
})

test('worktrees with the same folder name in different places do not collide', () => {
  const a = sourceProfile({ ...base, repo: '/a/TCH' }).dir
  const b = sourceProfile({ ...base, repo: '/b/TCH' }).dir
  assert.notEqual(a, b)
})

test('a trailing slash on the repo path or the origin is the same worktree and origin', () => {
  const a = sourceProfile({ ...base, origin: 'https://cowork.tracy.site' }).dir
  const b = sourceProfile({ ...base, repo: '/work/TCH/', origin: 'https://cowork.tracy.site/' }).dir
  assert.equal(a, b)
})

test('TRACY_DESKTOP_PROFILE_ROOT moves the root', () => {
  const profile = sourceProfile({ ...base, env: { TRACY_DESKTOP_PROFILE_ROOT: '/tmp/profiles' } })
  assert.ok(profile.dir.startsWith('/tmp/profiles/'))
})

test('a relative root, an empty root or / is refused with an error naming the variable', () => {
  for (const root of ['profiles', './profiles', '/', '//', '/./']) {
    assert.throws(
      () => sourceProfile({ ...base, env: { TRACY_DESKTOP_PROFILE_ROOT: root } }),
      /TRACY_DESKTOP_PROFILE_ROOT/,
      `root ${JSON.stringify(root)}`
    )
  }
})

test('an explicit instance is marked explicit', () => {
  const profile = sourceProfile({ ...base, env: { TRACY_DESKTOP_INSTANCE: 'e2e-42' } })
  assert.equal(profile.instance, 'e2e-42')
  assert.equal(profile.explicitInstance, true)
  assert.equal(path.basename(profile.dir), 'e2e-42')
})

test('an instance that is not one plain path component is refused', () => {
  for (const instance of ['', '.', '..', 'a/b', '../up', 'a\\b', 'with space', 'x'.repeat(65)]) {
    assert.throws(
      () => sourceProfile({ ...base, env: { TRACY_DESKTOP_INSTANCE: instance } }),
      /TRACY_DESKTOP_INSTANCE/,
      `instance ${JSON.stringify(instance)}`
    )
  }
})

test('a packaged app keeps Electron’s folder and ignores both variables, even invalid ones', () => {
  const env = { TRACY_DESKTOP_PROFILE_ROOT: 'relative', TRACY_DESKTOP_INSTANCE: '../x' }
  assert.equal(sourceProfile({ ...base, packaged: true, env }), undefined)
})

test('the CDP address comes from the port Electron wrote, always on loopback', () => {
  assert.equal(cdpFromActivePort('53123\n/devtools/browser/0f1e\n'), 'http://127.0.0.1:53123')
})

test('no debug port, an empty file or garbage means no CDP address', () => {
  for (const text of [undefined, '', '\n', 'abc\n/devtools', '0\n/devtools', '70000\n']) {
    assert.equal(cdpFromActivePort(text), null, `text ${JSON.stringify(text)}`)
  }
})

test('runtime.json carries pid, sha, origin, profile, cdp and inspect, with null for what is missing', () => {
  assert.deepEqual(
    runtimeRecord({
      pid: 42,
      sha: null,
      origin: 'local',
      profile: '/p',
      activePort: undefined,
      inspect: undefined
    }),
    { pid: 42, sha: null, origin: 'local', profile: '/p', cdp: null, inspect: null }
  )
  assert.deepEqual(
    runtimeRecord({
      pid: 7,
      sha: 'abc123',
      origin: 'http://tracy.test:8080',
      profile: '/p',
      activePort: '61000\n/devtools/browser/x',
      inspect: 'ws://127.0.0.1:61001/uuid'
    }),
    {
      pid: 7,
      sha: 'abc123',
      origin: 'http://tracy.test:8080',
      profile: '/p',
      cdp: 'http://127.0.0.1:61000',
      inspect: 'ws://127.0.0.1:61001/uuid'
    }
  )
})

test('a second launch on the same profile quietly hands over to the first one', () => {
  assert.deepEqual(secondLaunch({ explicitInstance: false, dir: '/p' }), { code: 0, message: undefined })
})

test('a second launch with an explicit instance fails loudly, naming the profile', () => {
  const result = secondLaunch({ explicitInstance: true, dir: '/p/agent-1' })
  assert.notEqual(result.code, 0)
  assert.match(result.message, /\/p\/agent-1/)
  assert.match(result.message, /TRACY_DESKTOP_INSTANCE/)
})

test('a source run is always the Dev variant, whatever origin it opens', () => {
  for (const origin of ['local', 'http://tracy.test:8080', 'https://cowork.tracy.site']) {
    assert.equal(sourceProfile({ ...base, origin }).name, 'Tracy Cowork Dev', origin)
  }
})
