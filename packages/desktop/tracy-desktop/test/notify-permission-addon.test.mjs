// The real addon (native/notify-permission/), built with build/build-native.sh into a temporary
// folder and loaded through src/notify-permission.js. Plain Node has no bundle identifier, so the
// addon must answer "unknown" without asking the notification center (asking would raise). The
// answer inside the signed app is measured by hand: tasks/evidence/desktop-onboard-v2/notify-permission.md.
// macOS with a C++ compiler only.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { createPermissionReader } = require('../src/notify-permission.js')
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const hasCompiler = (() => {
  if (process.platform !== 'darwin') return false
  try {
    execFileSync('xcrun', ['--find', 'clang++'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

test('the addon builds for both chips and answers unknown in a process with no bundle id', {
  skip: !hasCompiler && 'macOS with clang++ only'
}, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-notify-addon-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'notify-permission.node')
  execFileSync('bash', [path.join(PKG, 'build/build-native.sh'), 'universal', file], { stdio: 'pipe' })
  assert.deepEqual(execFileSync('lipo', ['-archs', file], { encoding: 'utf8' }).trim().split(' ').sort(), [
    'arm64',
    'x86_64'
  ])

  const reader = createPermissionReader({ platform: 'darwin', load: () => require(file) })
  assert.equal(await reader.read(), 'unknown')
  assert.throws(() => require(file).read('not a function'), TypeError)
})
