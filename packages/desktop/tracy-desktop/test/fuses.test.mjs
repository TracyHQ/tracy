/**
 * Electron fuses of a packaged app (`build/fuses.mjs`): a shipped, notarized app must not run as
 * plain Node (`ELECTRON_RUN_AS_NODE`), take `NODE_OPTIONS`, or open an inspector for `--inspect`;
 * cookies are encrypted at rest. Read from EVERY fuse wire in the framework binary — a universal app
 * carries one per arch slice.
 *
 *   node --test packages/desktop/tracy-desktop/test/fuses.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { SENTINEL, flipRequiredFuses, fuseProblems, readAppFuses, readFuseWires } from '../build/fuses.mjs'

const ON = 49
const OFF = 48

/**
 * The stock framework binary inside node_modules' Electron. Since Electron 42 the package has no
 * postinstall: the binary is downloaded the first time `require('electron')` RUNS (it returns the
 * executable's path), so this goes through it rather than through the package folder.
 */
function stockFramework() {
  const executable = createRequire(import.meta.url)('electron') // …/dist/Electron.app/Contents/MacOS/Electron
  const electronApp = path.resolve(executable, '../../..')
  return path.join(electronApp, 'Contents/Frameworks/Electron Framework.framework/Electron Framework')
}

/** A fake binary: filler, then for each wire the sentinel, version 1, the length and the states. */
function binary(...wires) {
  const parts = [Buffer.from('filler bytes before the wire ')]
  for (const states of wires)
    parts.push(Buffer.from(SENTINEL), Buffer.from([1, states.length, ...states]), Buffer.from(' more code '))
  return Buffer.concat(parts)
}

// RunAsNode, EnableCookieEncryption, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments,
// EnableEmbeddedAsarIntegrityValidation, OnlyLoadAppFromAsar, LoadBrowserProcessSpecificV8Snapshot,
// GrantFileProtocolExtraPrivileges
const STOCK = [ON, OFF, ON, ON, OFF, OFF, OFF, ON]
const HARDENED = [OFF, ON, OFF, OFF, OFF, OFF, OFF, ON]

test('every fuse wire in a binary is read: one for an arch binary, two for a universal one', () => {
  assert.deepEqual(readFuseWires(binary(STOCK)), [{ version: 1, states: STOCK }])
  assert.deepEqual(readFuseWires(binary(HARDENED, STOCK)), [
    { version: 1, states: HARDENED },
    { version: 1, states: STOCK }
  ])
  assert.deepEqual(readFuseWires(Buffer.from('no wire here')), [])
})

test('a hardened wire passes; each fuse left as Electron ships it is named', () => {
  assert.deepEqual(fuseProblems(readFuseWires(binary(HARDENED))), [])
  const problems = fuseProblems(readFuseWires(binary(STOCK)))
  for (const name of [
    'RunAsNode',
    'EnableCookieEncryption',
    'EnableNodeOptionsEnvironmentVariable',
    'EnableNodeCliInspectArguments'
  ])
    assert.ok(
      problems.some((p) => p.includes(name)),
      `${name} in ${problems.join('; ')}`
    )
})

test('a universal binary passes only when BOTH slices are hardened', () => {
  assert.deepEqual(fuseProblems(readFuseWires(binary(HARDENED, HARDENED))), [])
  const problems = fuseProblems(readFuseWires(binary(HARDENED, STOCK)))
  assert.ok(problems.length > 0)
  assert.match(problems.join('; '), /slice 2/)
})

test('no fuse wire, or none read, is a problem — never "fine"', () => {
  assert.match(fuseProblems([]).join(), /no fuse wire/)
  assert.match(fuseProblems(undefined).join(), /not read/)
})

test('flipping a real Electron framework binary hardens it, and the reader agrees', {
  skip: process.platform !== 'darwin'
}, async (t) => {
  const framework = stockFramework()
  const dir = mkdtempSync(path.join(tmpdir(), 'fuses-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const copy = path.join(dir, 'Electron Framework')
  // A copy-on-write clone: the framework is ~200 MB, and node_modules' copy must stay untouched.
  execFileSync('cp', ['-c', framework, copy])
  assert.notDeepEqual(fuseProblems(readFuseWires(readFileSync(copy))), [], 'stock Electron is not hardened')
  await flipRequiredFuses(copy)
  assert.deepEqual(fuseProblems(readFuseWires(readFileSync(copy))), [])
  assert.notDeepEqual(fuseProblems(readFuseWires(readFileSync(framework))), [], 'the original is untouched')
})

test('flipping an .app hardens its framework binary — the path package.sh hands over', {
  skip: process.platform !== 'darwin'
}, async (t) => {
  const framework = stockFramework()
  const dir = mkdtempSync(path.join(tmpdir(), 'fuses-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const app = path.join(dir, 'Tracy Cowork Test.app')
  const inside = path.join(app, 'Contents/Frameworks/Electron Framework.framework')
  mkdirSync(inside, { recursive: true })
  execFileSync('cp', ['-c', framework, path.join(inside, 'Electron Framework')])
  await flipRequiredFuses(app)
  assert.deepEqual(fuseProblems(readAppFuses(app)), [])
})

test('a Windows .exe or a Linux binary is flipped in place, with the @electron/fuses the caller loaded', async (t) => {
  // build/package-win-linux.mjs runs where `@electron/fuses` is not next to build/ (a CI tools folder),
  // so it hands the module over; the target is the executable itself, the file the wire lives in there.
  const fuses = await import('@electron/fuses')
  const dir = mkdtempSync(path.join(tmpdir(), 'fuses-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const name of ['Tracy Cowork.exe', 'tracy-cowork']) {
    const target = path.join(dir, name)
    writeFileSync(target, binary(STOCK))
    await flipRequiredFuses(target, fuses)
    assert.deepEqual(fuseProblems(readAppFuses(target)), [], name)
  }
})
