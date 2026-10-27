/**
 * The channel file a release publishes (`build/release-feed.mjs`): `<channel>-mac.yml`, the file
 * electron-updater's generic provider reads, with each artifact's size and base64 sha512.
 *
 *   node --test packages/desktop/tracy-desktop/test/release-feed.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  MAC_FLOOR,
  artifactName,
  channelYml,
  describeFile,
  comparePolicy,
  readPolicy,
  withPolicy
} from '../build/release-feed.mjs'

/** A temp folder removed when the test ends, pass or fail. */
function tempDir(t, prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const SCRIPT = fileURLToPath(new URL('../build/release-feed.mjs', import.meta.url))
// sha512("abc"), base64 — FIPS 180-2's test vector.
const ABC_SHA512 = '3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw=='

test('artifact names carry the variant, the version and the arch, as the updater matches them', () => {
  assert.equal(
    artifactName({ channel: 'stable', version: '0.2.1', arch: 'arm64', ext: 'zip' }),
    'Tracy-Cowork-0.2.1-arm64.zip'
  )
  assert.equal(
    artifactName({ channel: 'dev', version: '0.2.1', arch: 'x64', ext: 'dmg' }),
    'Tracy-Cowork-Dev-0.2.1-x64.dmg'
  )
  assert.equal(
    artifactName({ channel: 'dev', version: '0.3.0-dev.2', arch: 'universal', ext: 'dmg' }),
    'Tracy-Cowork-Dev-0.3.0-dev.2-universal.dmg'
  )
})

test('a file is described by its name, size and base64 sha512', async (t) => {
  const dir = tempDir(t, 'release-feed-')
  const file = path.join(dir, 'Tracy-Cowork-0.2.1-arm64.zip')
  writeFileSync(file, 'abc')
  assert.deepEqual(await describeFile(file), {
    url: 'Tracy-Cowork-0.2.1-arm64.zip',
    sha512: ABC_SHA512,
    size: 3
  })
})

test('the channel file lists every artifact, zip first as the legacy path', () => {
  const yml = channelYml({
    version: '0.2.1',
    releaseDate: '2026-10-09T10:00:00.000Z',
    files: [
      { url: 'Tracy-Cowork-0.2.1-arm64.dmg', sha512: 'D==', size: 9 },
      { url: 'Tracy-Cowork-0.2.1-arm64.zip', sha512: ABC_SHA512, size: 3 }
    ]
  })
  assert.equal(
    yml,
    [
      'version: 0.2.1',
      'files:',
      '  - url: Tracy-Cowork-0.2.1-arm64.zip',
      `    sha512: ${ABC_SHA512}`,
      '    size: 3',
      '  - url: Tracy-Cowork-0.2.1-arm64.dmg',
      '    sha512: D==',
      '    size: 9',
      'path: Tracy-Cowork-0.2.1-arm64.zip',
      `sha512: ${ABC_SHA512}`,
      "releaseDate: '2026-10-09T10:00:00.000Z'",
      // macOS 13 is Darwin 22: electron-updater compares this with os.release(), the Darwin version.
      'minimumSystemVersion: 22.0.0',
      ''
    ].join('\n')
  )
})

test('a channel file with no zip, or a version that is not x.y.z, is refused', () => {
  assert.throws(() =>
    channelYml({ version: '0.2.1', releaseDate: 'x', files: [{ url: 'a.dmg', sha512: 'D==', size: 1 }] })
  )
  assert.throws(() =>
    channelYml({ version: 'v0.2', releaseDate: 'x', files: [{ url: 'a.zip', sha512: 'D==', size: 1 }] })
  )
})

test('the command line prints the channel file for the files it is given', (t) => {
  const dir = tempDir(t, 'release-feed-')
  const file = path.join(dir, 'Tracy-Cowork-Dev-0.2.1-arm64.zip')
  writeFileSync(file, 'abc')
  const out = execFileSync(process.execPath, [SCRIPT, '0.2.1', file], {
    env: { ...process.env, RELEASE_DATE: '2026-10-09T10:00:00.000Z' }
  }).toString()
  assert.match(out, /^version: 0\.2\.1$/m)
  assert.match(out, /^path: Tracy-Cowork-Dev-0\.2\.1-arm64\.zip$/m)
  assert.match(out, /^releaseDate: '2026-10-09T10:00:00\.000Z'$/m)
})

test('a dev build version X.Y.Z-dev.N is accepted, so the dev feed can tell candidates apart', () => {
  const yml = channelYml({
    version: '0.3.0-dev.2',
    releaseDate: 'x',
    files: [{ url: 'Tracy-Cowork-Dev-0.3.0-dev.2-arm64.zip', sha512: 'D==', size: 1 }]
  })
  assert.match(yml, /^version: 0\.3\.0-dev\.2$/m)
  assert.throws(() =>
    channelYml({
      version: '0.3.0-beta.1',
      releaseDate: 'x',
      files: [{ url: 'a-0.3.0-beta.1-x64.zip', sha512: 'D==', size: 1 }]
    })
  )
})

test('a build id, when given, is a top-level line the release preflight reads back', () => {
  const files = [{ url: 'Tracy-Cowork-0.2.1-arm64.zip', sha512: 'D==', size: 1 }]
  assert.match(
    channelYml({ version: '0.2.1', releaseDate: 'x', files, buildId: '20261009-ab12cd3' }),
    /^buildId: 20261009-ab12cd3$/m
  )
  assert.doesNotMatch(channelYml({ version: '0.2.1', releaseDate: 'x', files }), /buildId/)
  assert.throws(() => channelYml({ version: '0.2.1', releaseDate: 'x', files, buildId: 'a b' }))
})

test('both archs of one release go in one channel file, and an artifact of another version is refused', () => {
  const yml = channelYml({
    version: '0.2.1',
    releaseDate: 'x',
    files: [
      { url: 'Tracy-Cowork-0.2.1-x64.zip', sha512: 'X==', size: 2 },
      { url: 'Tracy-Cowork-0.2.1-arm64.zip', sha512: 'A==', size: 1 }
    ]
  })
  assert.match(yml, /- url: Tracy-Cowork-0\.2\.1-x64\.zip/)
  assert.match(yml, /- url: Tracy-Cowork-0\.2\.1-arm64\.zip/)
  assert.throws(() =>
    channelYml({
      version: '0.2.1',
      releaseDate: 'x',
      files: [
        { url: 'Tracy-Cowork-0.2.1-arm64.zip', sha512: 'A==', size: 1 },
        { url: 'Tracy-Cowork-0.2.0-x64.zip', sha512: 'X==', size: 2 }
      ]
    })
  )
  assert.throws(() =>
    channelYml({
      version: '0.2.1',
      releaseDate: 'x',
      files: [
        { url: 'Tracy-Cowork-0.2.1-arm64.zip', sha512: 'A==', size: 1 },
        { url: 'Tracy-Cowork-0.2.1-arm64.zip', sha512: 'B==', size: 1 }
      ]
    })
  )
})

test('the command line writes the build id from BUILD_ID', (t) => {
  const dir = tempDir(t, 'release-feed-')
  const file = path.join(dir, 'Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip')
  writeFileSync(file, 'abc')
  const out = execFileSync(process.execPath, [SCRIPT, '0.3.0-dev.1', file], {
    env: { ...process.env, RELEASE_DATE: 'x', BUILD_ID: 'b-1' }
  }).toString()
  assert.match(out, /^buildId: b-1$/m)
})

test('an artifact may sit in its release folder <channel>/<version>/<build id>/, nothing deeper or stranger', () => {
  const url = 'dev/0.3.0-dev.1/b-1/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip'
  const yml = channelYml({
    version: '0.3.0-dev.1',
    releaseDate: 'x',
    buildId: 'b-1',
    files: [{ url, sha512: 'D==', size: 1 }]
  })
  assert.match(yml, new RegExp(`^path: ${url.replaceAll('.', '\\.')}$`, 'm'))
  for (const bad of [
    '../Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip',
    'dev/x/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip',
    '/abs/Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip'
  ])
    assert.throws(
      () =>
        channelYml({
          version: '0.3.0-dev.1',
          releaseDate: 'x',
          files: [{ url: bad, sha512: 'D==', size: 1 }]
        }),
      bad
    )
})

test('the command line puts the files in their release folder when RELEASE_FOLDER is set', (t) => {
  const dir = tempDir(t, 'release-feed-')
  const file = path.join(dir, 'Tracy-Cowork-Dev-0.3.0-dev.1-arm64.zip')
  writeFileSync(file, 'abc')
  const out = execFileSync(process.execPath, [SCRIPT, '0.3.0-dev.1', file], {
    env: { ...process.env, RELEASE_DATE: 'x', BUILD_ID: 'b-1', RELEASE_FOLDER: 'dev/0.3.0-dev.1/b-1' }
  }).toString()
  assert.match(out, /^ {2}- url: dev\/0\.3\.0-dev\.1\/b-1\/Tracy-Cowork-Dev-0\.3\.0-dev\.1-arm64\.zip$/m)
})

test('release notes, when given, are a literal block electron-updater hands to the dialog as plain text', () => {
  const files = [{ url: 'Tracy-Cowork-0.2.1-arm64.zip', sha512: 'D==', size: 1 }]
  const yml = channelYml({
    version: '0.2.1',
    releaseDate: 'x',
    files,
    releaseNotes: "Sign-in returns to the app.\nIt's faster: no extra window."
  })
  assert.match(
    yml,
    /^releaseNotes: \|-\n {2}Sign-in returns to the app\.\n {2}It's faster: no extra window\.\n/m
  )
  assert.doesNotMatch(channelYml({ version: '0.2.1', releaseDate: 'x', files }), /releaseNotes/)
  assert.doesNotMatch(
    channelYml({ version: '0.2.1', releaseDate: 'x', files, releaseNotes: ' \n' }),
    /releaseNotes/
  )
})

test('the feed floor is the macOS the bundled Electron needs, so an older Mac keeps its working app', {
  skip: process.platform !== 'darwin'
}, () => {
  // Electron's own Info.plist is the template package.sh ships: its LSMinimumSystemVersion is the
  // lowest macOS the packaged app opens on. An Electron bump that raises it turns this red until the
  // floor follows — otherwise the feed would hand those Macs an update that never opens.
  const executable = createRequire(import.meta.url)('electron') // …/dist/Electron.app/Contents/MacOS/Electron
  const plist = path.resolve(executable, '../../Info.plist')
  const needs = execFileSync('plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', plist]).toString().trim()
  assert.equal(needs, MAC_FLOOR.macOS)
  // Darwin N is macOS N - 9 since macOS 11 (Big Sur = Darwin 20).
  assert.equal(MAC_FLOOR.darwin, `${Number(needs.split('.')[0]) + 9}.0.0`)
})

// ── Windows and Linux (tasks/todo-desktop-windows.md §4 contract) ────────────────────────────────

test('Windows and Linux artifact names follow the contract: win-<arch>-setup.exe, linux-<arch>.AppImage / .deb', () => {
  assert.equal(
    artifactName({ channel: 'stable', version: '0.4.0', arch: 'x64', platform: 'win', ext: 'exe' }),
    'Tracy-Cowork-0.4.0-win-x64-setup.exe'
  )
  assert.equal(
    artifactName({ channel: 'dev', version: '0.4.0-dev.3', arch: 'arm64', platform: 'win', ext: 'exe' }),
    'Tracy-Cowork-Dev-0.4.0-dev.3-win-arm64-setup.exe'
  )
  assert.equal(
    artifactName({ channel: 'stable', version: '0.4.0', arch: 'arm64', platform: 'linux', ext: 'AppImage' }),
    'Tracy-Cowork-0.4.0-linux-arm64.AppImage'
  )
  assert.equal(
    artifactName({ channel: 'dev', version: '0.4.0-dev.3', arch: 'x64', platform: 'linux', ext: 'deb' }),
    'Tracy-Cowork-Dev-0.4.0-dev.3-linux-x64.deb'
  )
  assert.throws(() =>
    artifactName({ channel: 'stable', version: '0.4.0', arch: 'x64', platform: 'win', ext: 'zip' })
  )
})

const exe = (arch, sha512 = 'E==', size = 5) => ({
  url: `stable/0.4.0/b1/Tracy-Cowork-0.4.0-win-${arch}-setup.exe`,
  sha512,
  size
})

test('the Windows channel file lists both installers, x64 first, with no macOS floor', () => {
  const yml = channelYml({
    platform: 'win',
    version: '0.4.0',
    releaseDate: '2026-10-10T10:00:00.000Z',
    buildId: 'b1',
    files: [exe('arm64', 'A==', 7), exe('x64', 'X==', 6)]
  })
  assert.equal(
    yml,
    [
      'version: 0.4.0',
      'files:',
      '  - url: stable/0.4.0/b1/Tracy-Cowork-0.4.0-win-x64-setup.exe',
      '    sha512: X==',
      '    size: 6',
      '  - url: stable/0.4.0/b1/Tracy-Cowork-0.4.0-win-arm64-setup.exe',
      '    sha512: A==',
      '    size: 7',
      'path: stable/0.4.0/b1/Tracy-Cowork-0.4.0-win-x64-setup.exe',
      'sha512: X==',
      "releaseDate: '2026-10-10T10:00:00.000Z'",
      'buildId: b1',
      ''
    ].join('\n')
  )
})

test('a Windows channel file missing an arch, or holding anything but the two installers, is refused', () => {
  const win = (files) => () => channelYml({ platform: 'win', version: '0.4.0', releaseDate: 'x', files })
  // NsisUpdater falls back to the FIRST exe when none names its arch: a missing arm64 would put x64 on arm64.
  assert.throws(win([exe('x64')]), /no installer for arm64/)
  assert.throws(win([exe('arm64')]), /no installer for x64/)
  assert.throws(
    win([
      exe('x64'),
      exe('arm64'),
      { url: 'stable/0.4.0/b1/Tracy-Cowork-0.4.0-arm64.zip', sha512: 'Z==', size: 1 }
    ]),
    /not a Windows installer/
  )
})

const linux = (arch, ext, sha512 = 'L==') => ({
  url: `dev/0.4.0-dev.2/b2/Tracy-Cowork-Dev-0.4.0-dev.2-linux-${arch}.${ext}`,
  sha512,
  size: 4
})

test('a Linux channel file is one arch: its AppImage first (the one that updates), its .deb for the link', () => {
  const yml = channelYml({
    platform: 'linux',
    arch: 'arm64',
    version: '0.4.0-dev.2',
    releaseDate: '2026-10-10T10:00:00.000Z',
    files: [linux('arm64', 'deb', 'D=='), linux('arm64', 'AppImage', 'A==')]
  })
  assert.equal(
    yml,
    [
      'version: 0.4.0-dev.2',
      'files:',
      '  - url: dev/0.4.0-dev.2/b2/Tracy-Cowork-Dev-0.4.0-dev.2-linux-arm64.AppImage',
      '    sha512: A==',
      '    size: 4',
      '  - url: dev/0.4.0-dev.2/b2/Tracy-Cowork-Dev-0.4.0-dev.2-linux-arm64.deb',
      '    sha512: D==',
      '    size: 4',
      'path: dev/0.4.0-dev.2/b2/Tracy-Cowork-Dev-0.4.0-dev.2-linux-arm64.AppImage',
      'sha512: A==',
      "releaseDate: '2026-10-10T10:00:00.000Z'",
      ''
    ].join('\n')
  )
})

test('a Linux channel file without its AppImage, or with another arch, is refused', () => {
  const lin = (arch, files) => () =>
    channelYml({ platform: 'linux', arch, version: '0.4.0-dev.2', releaseDate: 'x', files })
  assert.throws(lin('x64', [linux('x64', 'deb')]), /no AppImage for x64/)
  // findFile takes the first AppImage when none names the arch: another arch's must never be there.
  assert.throws(lin('x64', [linux('x64', 'AppImage'), linux('arm64', 'AppImage')]), /not linux-x64/)
  assert.throws(lin(undefined, [linux('x64', 'AppImage')]), /arch/)
})

// ── minimum version policy (tasks/todo-desktop-update-policy.md C1) ─────────────────────────────

/** A Mac channel file of `version` with this policy. */
const policyYml = (version, policy, extra = {}) =>
  channelYml({
    version,
    releaseDate: '2026-10-11T10:00:00.000Z',
    buildId: 'b1',
    files: [{ url: `Tracy-Cowork-${version}-arm64.zip`, sha512: 'D==', size: 1 }],
    policy,
    ...extra
  })

test('a policy is three top-level lines after the build id, and reads back as the same set', () => {
  const policy = { minimumVersion: '0.5.0', minimumVersionAfter: '2026-10-20T00:00:00Z', policyRevision: 3 }
  const yml = policyYml('0.6.0', policy, { releaseNotes: 'Faster sign-in.' })
  assert.equal(
    yml,
    [
      'version: 0.6.0',
      'files:',
      '  - url: Tracy-Cowork-0.6.0-arm64.zip',
      '    sha512: D==',
      '    size: 1',
      'path: Tracy-Cowork-0.6.0-arm64.zip',
      'sha512: D==',
      "releaseDate: '2026-10-11T10:00:00.000Z'",
      'minimumSystemVersion: 22.0.0',
      'buildId: b1',
      'minimumVersion: 0.5.0',
      "minimumVersionAfter: '2026-10-20T00:00:00Z'",
      'policyRevision: 3',
      'releaseNotes: |-',
      '  Faster sign-in.',
      ''
    ].join('\n')
  )
  assert.deepEqual(readPolicy(yml), policy)
})

test('a policy the channel file cannot carry is refused, saying what is wrong', () => {
  const at = (version, policy) => () => policyYml(version, policy)
  // min above the version offered: a blocked app would have nothing to update to (S-C3).
  assert.throws(at('0.6.0', { minimumVersion: '0.7.0', policyRevision: 1 }), /0\.7\.0 is above 0\.6\.0/)
  assert.throws(at('0.6.0-dev.3', { minimumVersion: '0.6.0', policyRevision: 1 }), /above 0\.6\.0-dev\.3/)
  // the wrong channel: stable never names a dev build; dev may name either.
  assert.throws(at('0.6.0', { minimumVersion: '0.6.0-dev.2', policyRevision: 1 }), /stable channel file/)
  assert.doesNotThrow(at('0.6.0-dev.3', { minimumVersion: '0.6.0-dev.2', policyRevision: 1 }))
  assert.doesNotThrow(at('0.6.0-dev.3', { minimumVersion: '0.5.1', policyRevision: 1 }))
  // a date with no minimum to start, or a date without its timezone.
  assert.throws(
    at('0.6.0', { minimumVersionAfter: '2026-10-20T00:00:00Z', policyRevision: 1 }),
    /there is no minimumVersion/
  )
  for (const after of ['2026-10-20T00:00:00', '2026-10-20', 'next week', '2026-13-45T00:00:00Z'])
    assert.throws(
      at('0.6.0', { minimumVersion: '0.5.0', minimumVersionAfter: after, policyRevision: 1 }),
      /ISO time with its timezone/,
      after
    )
  assert.doesNotThrow(
    at('0.6.0', {
      minimumVersion: '0.5.0',
      minimumVersionAfter: '2026-10-20T07:00:00+07:00',
      policyRevision: 1
    })
  )
  // the revision: missing, not whole, zero or below.
  for (const policyRevision of [undefined, 1.5, '3', 0, -1])
    assert.throws(
      at('0.6.0', { minimumVersion: '0.5.0', policyRevision }),
      /policyRevision/,
      String(policyRevision)
    )
  // a malformed version, or a field the set does not have.
  assert.throws(at('0.6.0', { minimumVersion: 'v0.5', policyRevision: 1 }), /minimumVersion must be/)
  assert.throws(
    at('0.6.0', { minimumVersion: '0.5.0', policyRevision: 1, maxVersion: '1.0.0' }),
    /no field maxVersion/
  )
})

test('a channel file with no policy carries no policy line, and reads back as none', () => {
  for (const policy of [undefined, null]) {
    const yml = policyYml('0.6.0', policy)
    assert.doesNotMatch(yml, /minimumVersion|policyRevision/)
    assert.equal(readPolicy(yml), null)
  }
  // A lock lifted on purpose keeps its revision, so an app holding the older lock lets it go.
  const lifted = policyYml('0.6.0', { policyRevision: 4 })
  assert.match(lifted, /^policyRevision: 4$/m)
  assert.doesNotMatch(lifted, /minimumVersion/)
  assert.deepEqual(readPolicy(lifted), { policyRevision: 4 })
})

test('a channel file whose policy lines are not one well-formed set does not read as a policy', () => {
  const base = policyYml('0.6.0', undefined)
  assert.throws(() => readPolicy(`${base}minimumVersion: 0.5.0\n`), /no policyRevision/)
  assert.throws(() => readPolicy(`${base}policyRevision: 2\npolicyRevision: 3\n`), /2 policyRevision lines/)
  assert.throws(() => readPolicy(`${base}minimumVersion: 0.7.0\npolicyRevision: 2\n`), /above 0\.6\.0/)
  // A note line that looks like a policy line is inside the literal block (indented), never one.
  assert.equal(readPolicy(policyYml('0.6.0', undefined, { releaseNotes: 'policyRevision: 9' })), null)
})

test('two policies are the same only when all three fields are', () => {
  const p = { minimumVersion: '0.5.0', minimumVersionAfter: '2026-10-20T00:00:00Z', policyRevision: 3 }
  assert.equal(comparePolicy(p, { ...p }), true)
  assert.equal(comparePolicy(null, null), true)
  assert.equal(comparePolicy(p, null), false)
  assert.equal(comparePolicy(p, { ...p, policyRevision: 4 }), false)
  assert.equal(comparePolicy(p, { ...p, minimumVersion: '0.5.1' }), false)
  assert.equal(comparePolicy(p, { minimumVersion: '0.5.0', policyRevision: 3 }), false)
})

test('setting a policy on a published channel file gives the file channelYml would have made with it', () => {
  const next = { minimumVersion: '0.5.0', minimumVersionAfter: '2026-10-20T00:00:00Z', policyRevision: 4 }
  const notes = { releaseNotes: 'Faster sign-in.' }
  for (const from of [undefined, { minimumVersion: '0.4.0', policyRevision: 3 }])
    assert.equal(withPolicy(policyYml('0.6.0', from, notes), next), policyYml('0.6.0', next, notes))
  // Lifting the lock keeps a revision line, one above.
  assert.equal(
    withPolicy(policyYml('0.6.0', { minimumVersion: '0.5.0', policyRevision: 4 }), { policyRevision: 5 }),
    policyYml('0.6.0', { policyRevision: 5 })
  )
  // The same policy again changes nothing.
  assert.equal(withPolicy(policyYml('0.6.0', next), next), policyYml('0.6.0', next))
})

test('a policy older than the one a channel file carries is never written over it (replay)', () => {
  const now = policyYml('0.6.0', { minimumVersion: '0.5.0', policyRevision: 5 })
  assert.throws(() => withPolicy(now, { minimumVersion: '0.6.0', policyRevision: 4 }), /replay.*revision 5/)
  assert.throws(() => withPolicy(now, { minimumVersion: '0.6.0', policyRevision: 5 }), /revision 5 already/)
  // and the version rule holds for the file it lands in.
  assert.throws(() => withPolicy(now, { minimumVersion: '0.7.0', policyRevision: 6 }), /above 0\.6\.0/)
})
