/**
 * The signed feed, driven through the REAL electron-updater 6.8.9 updaters (NsisUpdater,
 * AppImageUpdater, MacUpdater's provider path) with only the network and the Electron app faked:
 * a channel file reaches electron-updater — and so `update-available`, and so a download — only when
 * its signature verifies against a pinned key.
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const kit = require('../build/electron-updater-entry.cjs')
const { createSignedFeedProvider } = require('../src/signed-feed-provider.js')
const { signFeed, publicKeyText } = require('../src/feed-signature.js')

const FEED = 'https://update.tracy.ai/desktop'

/** A channel file of version 0.5.0 listing both Windows installers and a Linux AppImage. */
const yml = (version = '0.5.0') =>
  [
    `version: ${version}`,
    'files:',
    `  - url: stable/${version}/b1/Tracy-Cowork-${version}-win-x64-setup.exe`,
    '    sha512: eDY0',
    '    size: 10',
    `  - url: stable/${version}/b1/Tracy-Cowork-${version}-win-arm64-setup.exe`,
    '    sha512: YXJtNjQ=',
    '    size: 11',
    `path: stable/${version}/b1/Tracy-Cowork-${version}-win-x64-setup.exe`,
    'sha512: eDY0',
    "releaseDate: '2026-10-10T00:00:00.000Z'",
    ''
  ].join('\n')

/** An updater of `Updater` with a fake app at 0.4.0 and a feed served from `served` (url path → text). */
function harness(Updater, served, { publicKeys, version = '0.4.0', platform = 'win32', onVerified } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'signed-feed-'))
  const config = path.join(dir, 'app-update.yml')
  writeFileSync(config, `provider: generic\nurl: ${FEED}\nchannel: stable\nupdaterCacheDirName: t\n`)
  const app = {
    version,
    name: 'Tracy Cowork',
    isPackaged: true,
    appUpdateConfigPath: config,
    userDataPath: dir,
    baseCachePath: dir,
    whenReady: () => Promise.resolve(),
    relaunch: () => {},
    quit: () => {},
    onQuit: () => {}
  }
  const updater = new Updater(undefined, app)
  updater.logger = null
  const requested = []
  const headers = []
  updater.httpExecutor = {
    request: async (options) => {
      requested.push(options.path.replace(/\?.*$/, ''))
      headers.push(options.headers)
      const key = options.path.replace(/\?.*$/, '')
      if (!(key in served)) throw Object.assign(new Error(`HTTP 404 ${key}`), { statusCode: 404 })
      return served[key]
    },
    download: async () => {
      throw new Error('no download in this test')
    }
  }
  updater.autoDownload = false
  updater.channel = 'stable'
  updater.allowDowngrade = false
  // The provider names the channel file by the platform it runs on: pin it, the test runs anywhere.
  updater._testOnlyOptions = { platform }
  const Provider = createSignedFeedProvider(kit, { publicKeys, onVerified })
  updater.setFeedURL({ provider: 'custom', updateProvider: Provider, url: FEED })
  const events = []
  for (const name of ['update-available', 'update-not-available', 'error'])
    updater.on(name, (arg) => events.push([name, arg?.version ?? arg?.message]))
  return { updater, events, requested, headers, done: () => rmSync(dir, { recursive: true, force: true }) }
}

const keys = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return { privateKey, pinned: [publicKeyText(publicKey)] }
}

/** The feed folder's path on the server, as the provider requests it. */
const at = (file) => `/desktop/${file}`

test('Windows: a signed stable.yml is offered; electron-updater sees exactly the signed version and files', async () => {
  const { privateKey, pinned } = keys()
  const text = yml()
  const h = harness(
    kit.NsisUpdater,
    {
      [at('stable.yml')]: text,
      [at('stable.yml.sig')]: signFeed({ channelFile: 'stable.yml', text, privateKey })
    },
    { publicKeys: pinned }
  )
  try {
    const result = await h.updater.checkForUpdates()
    assert.equal(result.isUpdateAvailable, true)
    assert.equal(result.updateInfo.version, '0.5.0')
    assert.deepEqual(
      result.updateInfo.files.map((f) => [f.sha512, f.size]),
      [
        ['eDY0', 10],
        ['YXJtNjQ=', 11]
      ]
    )
    assert.deepEqual(h.events, [['update-available', '0.5.0']])
    assert.deepEqual(h.requested, [at('stable.yml'), at('stable.yml.sig')])
  } finally {
    h.done()
  }
})

test('a tampered channel file is refused before update-available: nothing is offered, nothing downloads', async () => {
  const { privateKey, pinned } = keys()
  const signature = signFeed({ channelFile: 'stable.yml', text: yml(), privateKey })
  const tampered = yml().replace('eDY0', 'ZXZpbA==')
  const h = harness(
    kit.NsisUpdater,
    { [at('stable.yml')]: tampered, [at('stable.yml.sig')]: signature },
    { publicKeys: pinned }
  )
  try {
    await assert.rejects(h.updater.checkForUpdates(), /does not match it under any pinned key/)
    assert.equal(
      h.events.some(([name]) => name === 'update-available'),
      false
    )
    // downloadUpdate has nothing to download: the unverified info never became the update.
    await assert.rejects(h.updater.downloadUpdate(), /check update first/)
  } finally {
    h.done()
  }
})

test('no .sig on the feed, or a feed signed by a key the app does not pin: no update, the error says why', async () => {
  const ours = keys()
  const theirs = keys()
  const text = yml()
  const missing = harness(kit.NsisUpdater, { [at('stable.yml')]: text }, { publicKeys: ours.pinned })
  try {
    await assert.rejects(missing.updater.checkForUpdates(), /stable\.yml\.sig.*not signed/s)
  } finally {
    missing.done()
  }
  const foreign = harness(
    kit.NsisUpdater,
    {
      [at('stable.yml')]: text,
      [at('stable.yml.sig')]: signFeed({ channelFile: 'stable.yml', text, privateKey: theirs.privateKey })
    },
    { publicKeys: ours.pinned }
  )
  try {
    await assert.rejects(foreign.updater.checkForUpdates(), /under any pinned key/)
  } finally {
    foreign.done()
  }
})

test('a build that pins no key never takes an update, whatever the feed says', async () => {
  const { privateKey } = keys()
  const text = yml()
  const h = harness(
    kit.NsisUpdater,
    {
      [at('stable.yml')]: text,
      [at('stable.yml.sig')]: signFeed({ channelFile: 'stable.yml', text, privateKey })
    },
    { publicKeys: [] }
  )
  try {
    await assert.rejects(h.updater.checkForUpdates(), /no feed key is pinned/)
  } finally {
    h.done()
  }
})

test('Linux: the AppImage updater reads the channel file of its own arch, signed for that name', async (t) => {
  const { privateKey, pinned } = keys()
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const file = arch === 'x64' ? 'stable-linux.yml' : `stable-linux-${arch}.yml`
  const text = yml()
  const h = harness(
    kit.AppImageUpdater,
    { [at(file)]: text, [at(`${file}.sig`)]: signFeed({ channelFile: file, text, privateKey }) },
    { publicKeys: pinned, platform: 'linux' }
  )
  const before = process.env.APPIMAGE
  process.env.APPIMAGE = '/tmp/Tracy-Cowork.AppImage'
  t.after(() => {
    if (before === undefined) delete process.env.APPIMAGE
    else process.env.APPIMAGE = before
    h.done()
  })
  const result = await h.updater.checkForUpdates()
  assert.equal(result.updateInfo.version, '0.5.0')
  assert.deepEqual(h.requested, [at(file), at(`${file}.sig`)])
})

test('a signature for the Windows feed served as the Linux one is refused (bound to the channel file name)', async (t) => {
  const { privateKey, pinned } = keys()
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const file = arch === 'x64' ? 'stable-linux.yml' : `stable-linux-${arch}.yml`
  const text = yml()
  const h = harness(
    kit.AppImageUpdater,
    { [at(file)]: text, [at(`${file}.sig`)]: signFeed({ channelFile: 'stable.yml', text, privateKey }) },
    { publicKeys: pinned, platform: 'linux' }
  )
  const before = process.env.APPIMAGE
  process.env.APPIMAGE = '/tmp/Tracy-Cowork.AppImage'
  t.after(() => {
    if (before === undefined) delete process.env.APPIMAGE
    else process.env.APPIMAGE = before
    h.done()
  })
  await assert.rejects(h.updater.checkForUpdates(), /under any pinned key/)
})

test('an older or equal signed version is still not an update (allowDowngrade stays off)', async () => {
  const { privateKey, pinned } = keys()
  const text = yml('0.3.0')
  const h = harness(
    kit.NsisUpdater,
    {
      [at('stable.yml')]: text,
      [at('stable.yml.sig')]: signFeed({ channelFile: 'stable.yml', text, privateKey })
    },
    { publicKeys: pinned }
  )
  try {
    const result = await h.updater.checkForUpdates()
    assert.equal(result.isUpdateAvailable, false)
    assert.deepEqual(h.events, [['update-not-available', '0.3.0']])
  } finally {
    h.done()
  }
})

test('the channel file and its signature are fetched with the headers the server tells an update from a download by', async () => {
  const { updateHeaders } = require('../src/update-plan.js')
  const { privateKey, pinned } = keys()
  const text = yml()
  const h = harness(
    kit.NsisUpdater,
    {
      [at('stable.yml')]: text,
      [at('stable.yml.sig')]: signFeed({ channelFile: 'stable.yml', text, privateKey })
    },
    { publicKeys: pinned }
  )
  try {
    // What src/updater.js sets on every platform.
    h.updater.requestHeaders = updateHeaders({
      version: '0.4.0',
      channel: 'stable',
      arch: 'arm64',
      osVersion: '10.0.26100'
    })
    await h.updater.checkForUpdates()
    assert.equal(h.headers.length, 2)
    for (const sent of h.headers) {
      assert.equal(sent['App-Name'], 'Tracy Cowork')
      assert.equal(sent['App-Version'], '0.4.0')
      assert.equal(sent['X-Arch'], 'arm64')
      assert.equal(sent['X-OS-Version'], '10.0.26100')
      assert.match(sent['x-user-staging-id'], /^[0-9a-f-]{36}$/)
    }
  } finally {
    h.done()
  }
})

test('every verified channel file is handed on — update or not — and an unverified one never is (C5)', async () => {
  const { privateKey, pinned } = keys()
  const text = `${yml()}minimumVersion: 0.4.0\npolicyRevision: 2\n`
  const seen = []
  const served = {
    [at('stable.yml')]: text,
    [at('stable.yml.sig')]: signFeed({ channelFile: 'stable.yml', text, privateKey })
  }
  for (const version of ['0.4.0', '0.5.0']) {
    const h = harness(kit.NsisUpdater, served, {
      publicKeys: pinned,
      version,
      onVerified: (verified) => seen.push(verified)
    })
    try {
      await h.updater.checkForUpdates()
    } finally {
      h.done()
    }
  }
  assert.deepEqual(seen, [
    { channelFile: 'stable.yml', text },
    { channelFile: 'stable.yml', text }
  ])
  const tampered = { ...served, [at('stable.yml')]: text.replace('policyRevision: 2', 'policyRevision: 9') }
  const h = harness(kit.NsisUpdater, tampered, { publicKeys: pinned, onVerified: (v) => seen.push(v) })
  try {
    await assert.rejects(h.updater.checkForUpdates())
  } finally {
    h.done()
  }
  assert.equal(seen.length, 2)
})
