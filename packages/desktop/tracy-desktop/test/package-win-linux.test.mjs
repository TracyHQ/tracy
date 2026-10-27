/**
 * Windows and Linux packaging (`build/package-win-linux.mjs`): which app a pinned origin builds, the
 * installer identity Windows keys an install by, the file names a release carries, and the icon file
 * the Windows build embeds.
 *
 *   node --test packages/desktop/tracy-desktop/test/package-win-linux.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildRun,
  artifactNames,
  buildInfo,
  builderConfig,
  icoFromPngs,
  packagingPlan,
  renderPng
} from '../build/package-win-linux.mjs'

test('the production origin builds Tracy Cowork on the stable feed', () => {
  const plan = packagingPlan({ origin: 'https://cowork.tracy.ai', version: '0.4.0' })
  assert.equal(plan.productName, 'Tracy Cowork')
  assert.equal(plan.appId, 'ai.tracy.cowork')
  assert.equal(plan.channel, 'stable')
  assert.equal(plan.feed, 'https://update.tracy.ai/desktop')
  assert.equal(plan.linuxExecutable, 'tracy-cowork')
  assert.equal(plan.nsisGuid, 'e6436d31-4d91-46c7-bcda-6291575eeda0')
})

test('cowork.tracy.site builds Tracy Cowork Dev, installed beside the production app', () => {
  const stable = packagingPlan({ origin: 'https://cowork.tracy.ai', version: '0.4.0' })
  const dev = packagingPlan({ origin: 'https://cowork.tracy.site/', version: '0.4.0-dev.3' })
  assert.equal(dev.productName, 'Tracy Cowork Dev')
  assert.equal(dev.appId, 'ai.tracy.cowork.dev')
  assert.equal(dev.channel, 'dev')
  assert.equal(dev.feed, 'https://update.tracy.site/desktop')
  assert.equal(dev.linuxExecutable, 'tracy-cowork-dev')
  assert.notEqual(dev.nsisGuid, stable.nsisGuid)
})

test('any other origin builds a Preview that never updates itself', () => {
  const plan = packagingPlan({ origin: 'http://tracy.test:8080', version: '0.4.0' })
  assert.equal(plan.productName, 'Tracy Cowork Preview')
  assert.equal(plan.appId, 'ai.tracy.cowork.preview')
  assert.equal(plan.channel, null)
  assert.equal(plan.feed, null)
})

test('a dev version never goes into a stable build', () => {
  assert.throws(
    () => packagingPlan({ origin: 'https://cowork.tracy.ai', version: '0.4.0-dev.1' }),
    /dev version/
  )
  assert.throws(() => packagingPlan({ origin: 'https://cowork.tracy.ai', version: 'v0.4' }), /X\.Y\.Z/)
  assert.throws(() => packagingPlan({ origin: 'cowork.tracy.ai', version: '0.4.0' }), /origin/)
})

test('release files are named <product>-<version>-<os>-<arch>', () => {
  const stable = packagingPlan({ origin: 'https://cowork.tracy.ai', version: '0.4.0' })
  assert.deepEqual(artifactNames(stable, 'win', 'arm64'), ['Tracy-Cowork-0.4.0-win-arm64-setup.exe'])
  assert.deepEqual(artifactNames(stable, 'linux', 'x64'), [
    'Tracy-Cowork-0.4.0-linux-x64.AppImage',
    'Tracy-Cowork-0.4.0-linux-x64.deb'
  ])
  const dev = packagingPlan({ origin: 'https://cowork.tracy.site', version: '0.4.0-dev.3' })
  assert.deepEqual(artifactNames(dev, 'win', 'x64'), ['Tracy-Cowork-Dev-0.4.0-dev.3-win-x64-setup.exe'])
})

test('the .ico holds every PNG as its own entry, sized from the PNG header', () => {
  const png = (size) => {
    // A PNG signature plus an IHDR chunk is all the writer reads: width and height at bytes 16 and 20.
    const bytes = Buffer.alloc(40)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
    bytes.write('IHDR', 12, 'latin1')
    bytes.writeUInt32BE(size, 16)
    bytes.writeUInt32BE(size, 20)
    return bytes
  }
  const ico = icoFromPngs([png(16), png(256)])
  assert.equal(ico.readUInt16LE(0), 0) // reserved
  assert.equal(ico.readUInt16LE(2), 1) // type 1 = icon
  assert.equal(ico.readUInt16LE(4), 2) // two images
  // Directory entry 1: 16x16; entry 2: 256 is written as 0.
  assert.equal(ico[6], 16)
  assert.equal(ico[6 + 16], 0)
  assert.equal(ico.readUInt32LE(6 + 8), 40) // byte size of the first PNG
  assert.equal(ico.readUInt32LE(6 + 12), 6 + 2 * 16) // first PNG right after the directory
  assert.equal(ico.readUInt32LE(6 + 16 + 12), 6 + 2 * 16 + 40)
  assert.equal(ico.length, 6 + 2 * 16 + 80)
  assert.throws(() => icoFromPngs([Buffer.from('not a png')]), /PNG/)
})

test('the installer is per-user, keeps user data, and carries the id the running app groups its windows by', () => {
  const plan = packagingPlan({ origin: 'https://cowork.tracy.site', version: '0.4.0-dev.3' })
  const config = builderConfig(plan, '/stage', '/out', async () => {})
  // The NSIS shortcuts take their AppUserModelID from appId; src/platform.js sets the same one at run time.
  assert.equal(config.appId, 'ai.tracy.cowork.dev')
  assert.equal(config.nsis.oneClick, true)
  assert.equal(config.nsis.perMachine, false)
  assert.equal(config.nsis.deleteAppDataOnUninstall, false)
  assert.equal(config.nsis.guid, plan.nsisGuid)
  // Linux: Electron classes every window by the product name (src/platform.js `wmClass`).
  assert.equal(config.linux.desktop.entry.StartupWMClass, 'Tracy Cowork Dev')
  assert.equal(config.publish, null)
})

test('without rsvg-convert or sips the icon is drawn by resvg, at the size asked for', (t) => {
  // The self-hosted runners have neither tool and no root to install one (CI installs
  // @resvg/resvg-js into TRACY_PACK_TOOLS instead), so the last renderer must need no system package.
  const dir = mkdtempSync(path.join(tmpdir(), 'icon-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const asked = []
  const resvg = {
    Resvg: class {
      constructor(svg, options) {
        asked.push({ svg: String(svg).slice(0, 4), fitTo: options.fitTo })
      }
      render() {
        return { asPng: () => Buffer.from('png bytes') }
      }
    }
  }
  const savedPath = process.env.PATH
  process.env.PATH = dir // no rsvg-convert, no sips
  t.after(() => (process.env.PATH = savedPath))
  const out = path.join(dir, '48.png')
  renderPng(new URL('../build/icon.svg', import.meta.url).pathname, 48, out, () => resvg)
  assert.equal(readFileSync(out, 'utf8'), 'png bytes')
  assert.deepEqual(asked, [{ svg: '<!--', fitTo: { mode: 'width', value: 48 } }])
})

test('a release run builds against a test feed only when it names one, and a Preview takes none', () => {
  const own = packagingPlan({ origin: 'https://cowork.tracy.site', version: '0.4.0-dev.3' })
  assert.equal(own.feed, 'https://update.tracy.site/desktop')
  const test = packagingPlan({
    origin: 'https://cowork.tracy.site',
    version: '0.4.0-dev.3',
    feed: 'https://stand.example/desktop/'
  })
  assert.equal(test.feed, 'https://stand.example/desktop')
  assert.throws(
    () => packagingPlan({ origin: 'http://tracy.test:8080', version: '0.4.0', feed: 'https://x.example/d' }),
    /Preview/
  )
  assert.throws(
    () => packagingPlan({ origin: 'https://cowork.tracy.ai', version: '0.4.0', feed: 'not a url' }),
    /feed/
  )
})

test('the build record names the sha, the candidate and every installer with its hash and size', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'build-info-'))
  try {
    const plan = packagingPlan({ origin: 'https://cowork.tracy.site', version: '0.4.0-dev.3' })
    const names = ['win', 'linux'].flatMap((os) =>
      ['x64', 'arm64'].flatMap((a) => artifactNames(plan, os, a))
    )
    for (const name of names) writeFileSync(path.join(dir, name), `bytes of ${name}`)
    const info = buildInfo({
      plan,
      dir,
      sha: 'a'.repeat(40),
      buildId: '20261010T120000Z-aaaaaaa',
      releaseDate: '2026-10-10T12:00:00.000Z',
      electronVersion: '44.7.0',
      lockfileSha256: 'b'.repeat(64),
      run: { id: '1', trigger: 'workflow_dispatch', ref: 'develop', runner: 'tracy-build-dev-1' }
    })
    assert.equal(info.schema, 1)
    assert.equal(info.variant, 'dev')
    assert.equal(info.version, '0.4.0-dev.3')
    assert.equal(info.origin, 'https://cowork.tracy.site')
    assert.equal(info.feed, 'https://update.tracy.site/desktop')
    assert.equal(info.files.length, 6)
    const exe = info.files.find((f) => f.name === 'Tracy-Cowork-Dev-0.4.0-dev.3-win-arm64-setup.exe')
    const body = Buffer.from('bytes of Tracy-Cowork-Dev-0.4.0-dev.3-win-arm64-setup.exe')
    assert.deepEqual(exe, {
      name: 'Tracy-Cowork-Dev-0.4.0-dev.3-win-arm64-setup.exe',
      platform: 'win',
      arch: 'arm64',
      kind: 'exe',
      sha512: createHash('sha512').update(body).digest('base64'),
      size: body.length
    })
    assert.deepEqual(
      info.files.filter((f) => f.platform === 'linux').map((f) => `${f.arch} ${f.kind}`),
      ['x64 AppImage', 'x64 deb', 'arm64 AppImage', 'arm64 deb']
    )
    // A missing installer is refused: the record is the candidate, all six or nothing.
    rmSync(path.join(dir, names[1]))
    assert.throws(
      () => buildInfo({ plan, dir, sha: 'a'.repeat(40), buildId: 'b', releaseDate: 'd', run: {} }),
      /missing/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the installer carries every file staged in resources/: the feed file and the build notes (D1)', (t) => {
  const stage = mkdtempSync(path.join(tmpdir(), 'stage-'))
  t.after(() => rmSync(stage, { recursive: true, force: true }))
  const plan = packagingPlan({ origin: 'https://cowork.tracy.ai', version: '0.5.1' })
  mkdirSync(path.join(stage, 'resources'))
  for (const name of ['app-update.yml', 'release-notes.txt', 'release-notes.json'])
    writeFileSync(path.join(stage, 'resources', name), 'x')
  const config = builderConfig(plan, stage, '/out', async () => {})
  assert.deepEqual(config.extraResources.map((r) => [path.relative(stage, r.from), r.to]).sort(), [
    ['resources/app-update.yml', 'app-update.yml'],
    ['resources/release-notes.json', 'release-notes.json'],
    ['resources/release-notes.txt', 'release-notes.txt']
  ])
})

test('a record says which run built it: the Actions run with its attempt, or manual outside Actions', () => {
  assert.deepEqual(
    buildRun({
      GITHUB_RUN_ID: '42',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'TracyHQ/tch',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REF_NAME: 'main',
      RUNNER_NAME: 'tracy-build-1',
      TRACY_RELEASE_ON_ORIGIN: 'origin/main'
    }),
    {
      id: '42',
      attempt: '2',
      url: 'https://github.com/TracyHQ/tch/actions/runs/42',
      trigger: 'workflow_dispatch',
      ref: 'main',
      runner: 'tracy-build-1',
      onOrigin: 'origin/main'
    }
  )
  assert.deepEqual(buildRun({ TRACY_MANUAL_RUNNER: 'prod1-builder' }), {
    id: null,
    attempt: null,
    url: null,
    trigger: 'manual',
    ref: null,
    runner: 'prod1-builder',
    onOrigin: null
  })
})
