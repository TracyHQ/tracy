/**
 * The app inside a Windows installer or a Linux AppImage / .deb (`build/payload.mjs`), as the release
 * preflight reads it: version, the arch of the main binary, fuses, pinned origin and feed, debug guard.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { SENTINEL, readAppFuses } from '../build/fuses.mjs'
import {
  appImageOffset,
  binaryArch,
  extractPayload,
  missingUnpackers,
  readPayload
} from '../build/payload.mjs'

const HARDENED = [48, 49, 48, 48, 48, 48, 48, 49]
const wire = (states = HARDENED) =>
  Buffer.concat([Buffer.from(SENTINEL), Buffer.from([1, states.length, ...states])])

/** A PE image header for `machine` (0x8664 x64, 0xaa64 arm64), with a fuse wire after it. */
function pe(machine, states) {
  const head = Buffer.alloc(0x100)
  head.write('MZ', 0)
  head.writeUInt32LE(0x80, 0x3c)
  head.write('PE\0\0', 0x80, 'latin1')
  head.writeUInt16LE(machine, 0x84)
  return Buffer.concat([head, wire(states)])
}

/** A 64-bit little-endian ELF header for `machine` (62 x86-64, 183 aarch64), with a fuse wire. */
function elf(machine, { states, shoff = 0x1000, shentsize = 64, shnum = 10 } = {}) {
  const head = Buffer.alloc(0x40)
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]).copy(head, 0)
  head.writeUInt16LE(machine, 0x12)
  head.writeBigUInt64LE(BigInt(shoff), 0x28)
  head.writeUInt16LE(shentsize, 0x3a)
  head.writeUInt16LE(shnum, 0x3c)
  return Buffer.concat([head, wire(states)])
}

const MAIN_JS =
  "const { refuseDebugSwitches } = require('./debug-switches.js')\nrefuseDebugSwitches(process.argv)\nrequire('./x.js')\napp.whenReady()\n"

/** An unpacked install folder as the packaging lays it out: `<dir>/<binary>`, `<dir>/resources/…`. */
function installTree(
  dir,
  { binary, bytes, version = '0.4.0', channel = 'stable', feed = 'https://update.tracy.ai/desktop' }
) {
  mkdirSync(path.join(dir, 'resources/app/src'), { recursive: true })
  writeFileSync(path.join(dir, binary), bytes)
  // A helper binary without fuses next to it, as Electron ships (crashpad, sandbox).
  writeFileSync(path.join(dir, binary.endsWith('.exe') ? 'crashpad_handler.exe' : 'chrome-sandbox'), 'helper')
  writeFileSync(
    path.join(dir, 'resources/app/package.json'),
    JSON.stringify({ name: 'tracy-cowork', productName: 'Tracy Cowork', version, main: 'src/main.js' })
  )
  writeFileSync(path.join(dir, 'resources/app/origin'), 'https://cowork.tracy.ai\n')
  writeFileSync(path.join(dir, 'resources/app/update-channel'), `${channel}\n`)
  writeFileSync(path.join(dir, 'resources/app/src/main.js'), MAIN_JS)
  writeFileSync(path.join(dir, 'resources/app/src/debug-switches.js'), 'module.exports = {}\n')
  writeFileSync(
    path.join(dir, 'resources/app-update.yml'),
    `provider: generic\nurl: ${feed}\nchannel: ${channel}\nupdaterCacheDirName: tracy-cowork-updater\n`
  )
}

const scratch = (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'payload-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('the arch of a Windows or Linux binary is read from its PE or ELF header', () => {
  assert.equal(binaryArch(pe(0x8664)), 'x64')
  assert.equal(binaryArch(pe(0xaa64)), 'arm64')
  assert.equal(binaryArch(elf(62)), 'x64')
  assert.equal(binaryArch(elf(183)), 'arm64')
  assert.equal(binaryArch(pe(0x14c)), 'machine 0x14c')
  assert.equal(binaryArch(Buffer.from('not a binary')), null)
})

test('an unpacked Windows install is read: version, arch, fuses, origin, channel, feed, debug guard', (t) => {
  const root = scratch(t)
  // The installer unpacks into a folder of its own, one level down.
  const dir = path.join(root, 'app')
  installTree(dir, { binary: 'Tracy Cowork.exe', bytes: pe(0xaa64) })
  assert.deepEqual(readPayload(root), {
    binary: path.join(dir, 'Tracy Cowork.exe'),
    version: '0.4.0',
    arch: 'arm64',
    fuses: [{ version: 1, states: HARDENED }],
    origin: 'https://cowork.tracy.ai',
    updateChannel: 'stable',
    updateFeed: 'https://update.tracy.ai/desktop',
    debugGuard: true,
    // A hand-staged tree carries no notes of its own.
    releaseNotes: null,
    releaseNotesInfo: null
  })
})

test('an unpacked .deb is read where it installs (opt/<name>/)', (t) => {
  const root = scratch(t)
  const dir = path.join(root, 'opt/Tracy Cowork Dev')
  installTree(dir, {
    binary: 'tracy-cowork-dev',
    bytes: elf(62, { states: [49, 49, 48, 48] }),
    version: '0.4.0-dev.2',
    channel: 'dev',
    feed: 'https://update.tracy.site/desktop'
  })
  const facts = readPayload(root)
  assert.equal(facts.arch, 'x64')
  assert.equal(facts.version, '0.4.0-dev.2')
  assert.equal(facts.updateChannel, 'dev')
  assert.deepEqual(facts.fuses, [{ version: 1, states: [49, 49, 48, 48] }])
})

test('a tree with no app-update.yml, or no binary carrying fuses, says so instead of guessing', (t) => {
  const root = scratch(t)
  assert.throws(() => readPayload(root), /no resources\/app-update\.yml/)
  const dir = path.join(root, 'x')
  installTree(dir, { binary: 'Tracy Cowork.exe', bytes: Buffer.from('MZ no fuses') })
  assert.throws(() => readPayload(root), /no Electron binary/)
})

test('fuses of an unpacked Windows or Linux folder are read from its main binary (build/fuses.mjs)', (t) => {
  const dir = scratch(t)
  installTree(dir, { binary: 'Tracy Cowork.exe', bytes: pe(0x8664) })
  assert.deepEqual(readAppFuses(dir), [{ version: 1, states: HARDENED }])
})

test('an AppImage holds its squashfs right after the runtime ELF: the end of its section headers', () => {
  assert.equal(appImageOffset(elf(62, { shoff: 0x2a000, shentsize: 64, shnum: 29 })), 0x2a000 + 64 * 29)
  assert.throws(() => appImageOffset(Buffer.from('MZ')), /not an ELF/)
})

test('an unpacker this machine lacks means "cannot unpack here", not a failure of the artifact', async () => {
  for (const kind of ['exe', 'AppImage', 'deb'])
    assert.equal(
      await extractPayload(
        { name: `a.${kind}`, platform: kind === 'exe' ? 'win' : 'linux', kind, body: Buffer.from('x') },
        { has: () => false }
      ),
      null,
      kind
    )
})

const hasBsdtar = spawnSync('bsdtar', ['--version']).status === 0
test('a .deb is unpacked to the folder it installs (data.tar), with bsdtar', {
  skip: !hasBsdtar && 'no bsdtar'
}, async (t) => {
  const work = scratch(t)
  const data = path.join(work, 'data')
  installTree(path.join(data, 'opt/Tracy Cowork'), { binary: 'tracy-cowork', bytes: elf(183) })
  execFileSync('bsdtar', ['-czf', path.join(work, 'data.tar.gz'), '-C', data, '.'])
  writeFileSync(path.join(work, 'control.tar.gz'), '')
  writeFileSync(path.join(work, 'debian-binary'), '2.0\n')
  const deb = path.join(work, 'a.deb')
  // A .deb is an `ar` archive of these three members (macOS `ar` adds a symbol table; bsdtar writes it plain).
  execFileSync('bsdtar', ['--format=argnu', '-cf', deb, 'debian-binary', 'control.tar.gz', 'data.tar.gz'], {
    cwd: work
  })
  const opened = await extractPayload({
    name: 'a.deb',
    platform: 'linux',
    kind: 'deb',
    body: readFileSync(deb)
  })
  try {
    assert.equal(readPayload(opened.root).arch, 'arm64')
  } finally {
    opened.cleanup()
  }
})

test('the publishing machine is told which unpacker it lacks and how to get it', () => {
  const only =
    (...present) =>
    (command) =>
      present.includes(command)
  assert.deepEqual(missingUnpackers(only('7zz', 'unsquashfs', 'bsdtar')), [])
  // `7z` (p7zip) does the job of `7zz`.
  assert.deepEqual(missingUnpackers(only('7z', 'unsquashfs', 'bsdtar')), [])
  assert.deepEqual(
    missingUnpackers(only('bsdtar')).map((t) => `${t.tool}: ${t.hint}`),
    ['7zz: brew install sevenzip', 'unsquashfs: brew install squashfs']
  )
  assert.equal(missingUnpackers(only())[2].tool, 'bsdtar')
})

test('the notes a Windows or Linux build carries are read from resources/, next to the feed file (D1)', (t) => {
  const root = scratch(t)
  const dir = path.join(root, 'app')
  installTree(dir, { binary: 'Tracy Cowork.exe', bytes: pe(0x8664) })
  writeFileSync(path.join(dir, 'resources/release-notes.txt'), '- Windows remember their size.\n')
  writeFileSync(
    path.join(dir, 'resources/release-notes.json'),
    '{"version":"0.4.0","page":"0.4","docsOrigin":"https://docs.tracy.ai"}\n'
  )
  const payload = readPayload(root)
  assert.equal(payload.releaseNotes, '- Windows remember their size.\n')
  assert.deepEqual(payload.releaseNotesInfo, {
    version: '0.4.0',
    page: '0.4',
    docsOrigin: 'https://docs.tracy.ai'
  })
})
