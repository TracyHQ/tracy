// Whether the Claude Cowork plugin a new site gets carries its contract's maps, read from the
// plugin's own bytes (`lib/cowork-contract-evidence.js`, STAB-1 (3), 25/10/2026). Every zip here is
// built in memory: no network.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'

import {
  artifactFetchers,
  collectCoworkEvidence,
  CorruptArchive,
  expectedContractFiles,
  MAX_ENTRY_BYTES,
  pluginAnswer,
  readFleetLatest,
  readZipStrict,
  Unreachable
} from '../src/lib/cowork-contract-evidence.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const BOXING = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.3')
const DINER = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts/ja-diner/wp7/1.0.1')
const BOXING_ID = 'ja-boxing/j6/1.0.3'
const DINER_ID = 'ja-diner/wp7/1.0.1'
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const file = (dir, name) => readFileSync(path.join(dir, name))

/** A zip of `files` (path -> text or Buffer), deflated when `deflate`. */
function zipOf(files, { deflate = false } = {}) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content)
    const stored = deflate ? deflateRawSync(data) : data
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(deflate ? 8 : 0, 8)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(stored.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(deflate ? 8 : 0, 10)
    central.writeUInt32LE(crc32(data), 16)
    central.writeUInt32LE(stored.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, stored)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + stored.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

/** The contract's files as a plugin would carry them, without the ones named in `drop`. */
const contractFiles = (dir, drop = []) =>
  Object.fromEntries(
    [
      'manifest.json',
      'content-map.json',
      'presentation-lock.json',
      'showcase-nav-map.json',
      'demo-trim-map.json'
    ]
      .filter((f) => !drop.includes(f))
      .flatMap((f) => {
        try {
          return [[f, file(dir, f)]]
        } catch {
          return []
        }
      })
  )

/** A Joomla package whose component carries the contract folder (up to 0.24.53). */
const embeddedJoomla = (files, version = '0.24.40') =>
  zipOf({
    'pkg_claudecowork.xml': `<extension><version>${version}</version></extension>`,
    'packages/com_claudecowork.zip': zipOf(
      Object.fromEntries(
        Object.entries(files).map(([f, b]) => [`administrator/lib/contracts/${BOXING_ID}/${f}`, b])
      ),
      { deflate: true }
    )
  })

/** A slim Joomla package (0.24.54 on): an index row, and the asset published beside it. */
function slimJoomla(assetFiles, { version = '0.24.62', row = {} } = {}) {
  const asset = zipOf(assetFiles, { deflate: true })
  const name = 'ja-boxing--j6--1.0.3.zip'
  const pkg = zipOf({
    'pkg_claudecowork.xml': `<extension><version>${version}</version></extension>`,
    'packages/com_claudecowork.zip': zipOf({
      'administrator/lib/contracts.json': JSON.stringify({
        contracts: {
          [BOXING_ID]: {
            asset: name,
            sha256: sha256(asset),
            bytes: asset.length,
            template: 'ja_boxing',
            ...row
          }
        }
      })
    })
  })
  const url = `https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v${version}/${name}`
  return { pkg, asset, url }
}

const wordpressPlugin = (files) =>
  zipOf(
    {
      'claude-cowork/claude-cowork.php': '<?php\n',
      ...Object.fromEntries(
        Object.entries(files).map(([f, b]) => [`claude-cowork/lib/contracts/${DINER_ID}/${f}`, b])
      )
    },
    { deflate: true }
  )

test('expectedContractFiles: the maps a contract has, and the files they read; nothing more', () => {
  const boxing = expectedContractFiles(BOXING)
  assert.deepEqual(Object.keys(boxing.files).sort(), [
    'content-map.json',
    'manifest.json',
    'showcase-nav-map.json'
  ])
  assert.deepEqual(boxing.maps, ['showcase-nav-map.json'])
  assert.equal(boxing.files['showcase-nav-map.json'], sha256(file(BOXING, 'showcase-nav-map.json')))
  const diner = expectedContractFiles(DINER)
  assert.deepEqual(diner.maps, ['showcase-nav-map.json', 'demo-trim-map.json'])
  // A contract with no map asks nothing of the plugin's files (only that it carries the id).
  const base = expectedContractFiles(
    path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts/tracy-base/wp7/1.1.2')
  )
  assert.deepEqual(base, { files: {}, maps: [] })
})

test('pluginAnswer: an embedded Joomla package carries the maps, or names the one it lacks', async () => {
  const { files } = expectedContractFiles(BOXING)
  const whole = await pluginAnswer({
    platform: 'joomla',
    bytes: embeddedJoomla(contractFiles(BOXING)),
    id: BOXING_ID,
    expected: files,
    label: 'P'
  })
  assert.equal(whole.state, 'carries', whole.problems.join('; '))
  const lacking = await pluginAnswer({
    platform: 'joomla',
    bytes: embeddedJoomla(contractFiles(BOXING, ['showcase-nav-map.json'])),
    id: BOXING_ID,
    expected: files,
    label: 'P'
  })
  assert.equal(lacking.state, 'lacks')
  assert.deepEqual(lacking.problems, ['P has no showcase-nav-map.json'])
  const other = await pluginAnswer({
    platform: 'joomla',
    bytes: embeddedJoomla({ ...contractFiles(BOXING), 'showcase-nav-map.json': '{"items":[]}' }),
    id: BOXING_ID,
    expected: files,
    label: 'P'
  })
  assert.equal(other.state, 'lacks')
  assert.match(other.problems[0], /carries another showcase-nav-map\.json than this contract/)
})

test('pluginAnswer: a slim Joomla package as 0.24.62 shipped JA Boxing 1.0.3 (the asset without its map) lacks it', async () => {
  const { files } = expectedContractFiles(BOXING)
  const { pkg, asset, url } = slimJoomla(
    contractFiles(BOXING, ['showcase-nav-map.json', 'demo-trim-map.json'])
  )
  const asked = []
  const fetchAsset = async (u) => {
    asked.push(u)
    return asset
  }
  const r = await pluginAnswer({
    platform: 'joomla',
    bytes: pkg,
    id: BOXING_ID,
    expected: files,
    label: 'Claude Cowork 0.24.62',
    version: '0.24.62',
    fetchAsset
  })
  assert.equal(r.state, 'lacks')
  assert.deepEqual(r.problems, [
    'ja-boxing--j6--1.0.3.zip of Claude Cowork 0.24.62 has no showcase-nav-map.json'
  ])
  // The asset is read from THAT plugin version's release, as the site's ContractFetch does.
  assert.deepEqual(asked, [url])
  const fixed = slimJoomla(contractFiles(BOXING), { version: '0.24.64' })
  const ok = await pluginAnswer({
    platform: 'joomla',
    bytes: fixed.pkg,
    id: BOXING_ID,
    expected: files,
    label: 'P',
    fetchAsset: async () => fixed.asset
  })
  assert.equal(ok.state, 'carries', ok.problems.join('; '))
})

test('pluginAnswer: a slim asset that is not the file its index lists lacks it; one not uploaded is not checked', async () => {
  const { files } = expectedContractFiles(BOXING)
  const { pkg } = slimJoomla(contractFiles(BOXING))
  const wrong = await pluginAnswer({
    platform: 'joomla',
    bytes: pkg,
    id: BOXING_ID,
    expected: files,
    label: 'P',
    fetchAsset: async () => zipOf({ 'manifest.json': '{}' })
  })
  assert.equal(wrong.state, 'lacks')
  assert.match(wrong.problems[0], /is not the file its contracts\.json lists \(size or sha256\)/)
  const missing = await pluginAnswer({
    platform: 'joomla',
    bytes: pkg,
    id: BOXING_ID,
    expected: files,
    label: 'P',
    fetchAsset: async (u) => {
      throw new Unreachable(`${u} answered HTTP 404`)
    }
  })
  assert.equal(missing.state, 'not-checked')
  assert.match(missing.reason, /HTTP 404/)
  const unlisted = await pluginAnswer({
    platform: 'joomla',
    bytes: slimJoomla({}).pkg,
    id: 'ja-boxing/j6/1.0.4',
    expected: files,
    label: 'P'
  })
  assert.equal(unlisted.state, 'lacks')
  assert.match(unlisted.problems[0], /does not list the contract ja-boxing\/j6\/1\.0\.4/)
})

test('pluginAnswer: a WordPress plugin carries both maps, or names the one it lacks', async () => {
  const { files } = expectedContractFiles(DINER)
  const whole = await pluginAnswer({
    platform: 'wordpress',
    bytes: wordpressPlugin(contractFiles(DINER)),
    id: DINER_ID,
    expected: files,
    label: 'P'
  })
  assert.equal(whole.state, 'carries', whole.problems.join('; '))
  const lacking = await pluginAnswer({
    platform: 'wordpress',
    bytes: wordpressPlugin(contractFiles(DINER, ['demo-trim-map.json'])),
    id: DINER_ID,
    expected: files,
    label: 'P'
  })
  assert.deepEqual(lacking.problems, ['P has no demo-trim-map.json'])
  const none = await pluginAnswer({
    platform: 'wordpress',
    bytes: wordpressPlugin({}),
    id: 'ja-diner/wp7/1.0.2',
    expected: {},
    label: 'P'
  })
  assert.equal(none.state, 'lacks')
})

test('pluginAnswer: a map the contract does not have is never asked for', async () => {
  // JA Boxing 1.0.3 has no demo-trim map: a plugin without one still carries the contract.
  const { files } = expectedContractFiles(BOXING)
  assert.ok(!('demo-trim-map.json' in files))
  const r = await pluginAnswer({
    platform: 'joomla',
    bytes: embeddedJoomla(contractFiles(BOXING, ['demo-trim-map.json'])),
    id: BOXING_ID,
    expected: files,
    label: 'P'
  })
  assert.equal(r.state, 'carries')
})

test('readZipStrict and pluginAnswer: a corrupt zip is not checked, never "lacks"', async () => {
  const good = embeddedJoomla(contractFiles(BOXING))
  assert.throws(() => readZipStrict(good.subarray(0, 100)), /no end of central directory|too short/)
  const cut = Buffer.from(good)
  cut.writeUInt32LE(0xdeadbeef, cut.length - 22 + 16)
  const r = await pluginAnswer({
    platform: 'joomla',
    bytes: cut,
    id: BOXING_ID,
    expected: expectedContractFiles(BOXING).files,
    label: 'P'
  })
  assert.equal(r.state, 'not-checked')
  assert.match(r.reason, /is not a readable zip/)
  // A component zip whose deflated bytes are broken.
  const member = `administrator/lib/contracts/${BOXING_ID}/manifest.json`
  const inner = zipOf({ [member]: 'x'.repeat(200) }, { deflate: true })
  // Over the deflated data, right after the local header and its name.
  inner.fill(0xff, 30 + member.length, 30 + member.length + 4)
  const broken = await pluginAnswer({
    platform: 'joomla',
    bytes: zipOf({ 'packages/com_claudecowork.zip': inner }),
    id: BOXING_ID,
    expected: { 'manifest.json': 'a'.repeat(64) },
    label: 'P'
  })
  assert.equal(broken.state, 'not-checked', JSON.stringify(broken))
})

test('collectCoworkEvidence: the fleet latest lacks the map while the floor carries it: the evidence lacks it', async () => {
  const latest = slimJoomla(contractFiles(BOXING, ['showcase-nav-map.json']), { version: '0.24.62' })
  const floor = slimJoomla(contractFiles(BOXING), { version: '0.24.63' })
  const byUrl = new Map([
    ['https://x.test/latest.zip', latest.pkg],
    ['https://x.test/floor.zip', floor.pkg]
  ])
  const assets = new Map([
    [latest.url, latest.asset],
    [floor.url, floor.asset]
  ])
  const evidence = await collectCoworkEvidence({
    platform: 'joomla',
    contract: { id: BOXING_ID, dir: BOXING },
    selection: {
      source: 'fleet',
      candidates: [
        {
          role: 'latest',
          version: '0.24.62',
          file: 'pkg_claudecowork-0.24.62.zip',
          url: 'https://x.test/latest.zip'
        },
        {
          role: 'floor',
          version: '0.24.63',
          file: 'pkg_claudecowork-0.24.63.zip',
          url: 'https://x.test/floor.zip'
        }
      ]
    },
    fetchArtifact: async (c) => byUrl.get(c.url),
    fetchAsset: async (u) => assets.get(u),
    now: () => Date.parse('2026-10-25T10:00:00Z')
  })
  assert.equal(evidence.state, 'lacks')
  assert.equal(evidence.checkedAt, '2026-10-25T10:00:00.000Z')
  assert.deepEqual(
    evidence.plugins.map((p) => [p.role, p.state]),
    [
      ['latest', 'lacks'],
      ['floor', 'carries']
    ]
  )
  assert.equal(evidence.plugins[1].index.asset, 'ja-boxing--j6--1.0.3.zip')
})

test('collectCoworkEvidence: a pin whose bytes are not its sha256 lacks; an unreadable one is not checked', async () => {
  const pkg = embeddedJoomla(contractFiles(BOXING))
  const base = { platform: 'joomla', contract: { id: BOXING_ID, dir: BOXING } }
  const pin = {
    role: 'pin',
    version: '0.24.40',
    file: 'pkg.zip',
    url: 'https://x.test/p.zip',
    sha256: sha256(pkg),
    bytes: pkg.length
  }
  const ok = await collectCoworkEvidence({
    ...base,
    selection: { source: 'pin', candidates: [pin] },
    fetchArtifact: async () => pkg
  })
  assert.equal(ok.state, 'carries')
  const wrong = await collectCoworkEvidence({
    ...base,
    selection: { source: 'pin', candidates: [{ ...pin, sha256: 'f'.repeat(64) }] },
    fetchArtifact: async () => pkg
  })
  assert.equal(wrong.state, 'lacks')
  const timeout = await collectCoworkEvidence({
    ...base,
    selection: { source: 'pin', candidates: [pin] },
    fetchArtifact: async () => {
      throw new Unreachable(
        'https://x.test/p.zip could not be read (The operation was aborted due to timeout)'
      )
    }
  })
  assert.equal(timeout.state, 'not-checked')
  assert.match(timeout.plugins[0].reason, /timeout/)
  // update.json never answered: the latest is a candidate nobody can name.
  const unread = await collectCoworkEvidence({
    ...base,
    selection: {
      source: 'fleet',
      candidates: [
        { role: 'latest', version: null, file: null, url: null },
        { ...pin, role: 'floor' }
      ]
    },
    fetchArtifact: async () => pkg
  })
  assert.equal(unread.state, 'not-checked')
  assert.match(unread.plugins[0].reason, /update\.json could not be read/)
})

test('collectCoworkEvidence: no contract, or a CMS with no Claude Cowork plugin, is not applicable', async () => {
  const none = await collectCoworkEvidence({
    platform: 'joomla',
    contract: null,
    selection: { source: 'fleet', candidates: [] },
    fetchArtifact: async () => {
      throw new Error('never read')
    }
  })
  assert.equal(none.state, 'not-applicable')
})

test('artifactFetchers: bounded, cached by digest, and a 404 or a cut connection is Unreachable', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cowork-cache-'))
  try {
    const body = zipOf({ a: 'b' })
    let calls = 0
    const fetchImpl = async (url) => {
      calls += 1
      if (url.endsWith('/missing.zip')) return new Response('no', { status: 404 })
      if (url.endsWith('/big.zip')) return new Response(Buffer.alloc(2048))
      if (url.endsWith('/cut.zip')) throw new TypeError('fetch failed')
      return new Response(body)
    }
    const f = artifactFetchers({ fetchImpl, repo: 'TracyHQ/releases', cacheDir: dir, maxBytes: 1024 })
    const c = {
      role: 'floor',
      version: '1',
      file: 'p.zip',
      url: 'https://x.test/p.zip',
      sha256: sha256(body)
    }
    assert.deepEqual(await f.fetchArtifact(c), body)
    assert.deepEqual(await f.fetchArtifact(c), body)
    assert.equal(calls, 1, 'the second read comes from the cache')
    for (const name of ['missing', 'big', 'cut'])
      await assert.rejects(
        f.fetchArtifact({ ...c, sha256: undefined, url: `https://x.test/${name}.zip` }),
        Unreachable
      )
    await assert.rejects(
      f.fetchArtifact({ ...c, sha256: undefined, url: null, githubAssetId: 7 }),
      /cannot read TracyHQ\/releases/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** Where the first central directory entry of `zip` starts. */
const centralAt = (zip) => zip.readUInt32LE(zip.length - 22 + 16)

test('readZipStrict: a length field that runs past the archive is corrupt, never a short name', async () => {
  const member = `administrator/lib/contracts/${BOXING_ID}/manifest.json`
  for (const [field, label] of [
    [28, 'name'],
    [30, 'extra field'],
    [32, 'comment']
  ]) {
    const zip = zipOf({ [member]: 'x' })
    zip.writeUInt16LE(0xffff, centralAt(zip) + field)
    assert.throws(() => readZipStrict(zip), CorruptArchive, `${label} length`)
  }
  // Through pluginAnswer: a plugin whose directory is cut reads not checked, not "lacks".
  const inner = zipOf({ [member]: file(BOXING, 'manifest.json') })
  inner.writeUInt16LE(0xffff, centralAt(inner) + 28)
  const r = await pluginAnswer({
    platform: 'joomla',
    bytes: zipOf({ 'packages/com_claudecowork.zip': inner }),
    id: BOXING_ID,
    expected: { 'manifest.json': sha256(file(BOXING, 'manifest.json')) },
    label: 'P'
  })
  assert.equal(r.state, 'not-checked', JSON.stringify(r))
})

test('readZipStrict: an entry over the per-file limit is refused before it is inflated; a lying size stops at it', () => {
  assert.ok(MAX_ENTRY_BYTES >= 4 * 3147137, 'room for the largest content-map.json (ja-resume, 3 MB)')
  const big = zipOf({ 'content-map.json': Buffer.alloc(MAX_ENTRY_BYTES + 1) }, { deflate: true })
  assert.ok(big.length < 64 * 1024, 'a small zip')
  assert.throws(() => readZipStrict(big).get('content-map.json').read(), /declares .* more than/)
  // A file that declares 10 bytes but inflates to 1 MiB stops at the declared size.
  const liar = zipOf({ 'manifest.json': Buffer.alloc(1024 * 1024) }, { deflate: true })
  liar.writeUInt32LE(10, centralAt(liar) + 24)
  assert.throws(() => readZipStrict(liar).get('manifest.json').read(), /inflates past 10 bytes/)
  // The embedded component may be larger than a contract file, up to the download limit.
  const component = zipOf(
    { 'packages/com_claudecowork.zip': Buffer.alloc(MAX_ENTRY_BYTES + 1) },
    { deflate: true }
  )
  assert.equal(
    readZipStrict(component)
      .get('packages/com_claudecowork.zip')
      .read(MAX_ENTRY_BYTES * 2).length,
    MAX_ENTRY_BYTES + 1
  )
})

test('readFleetLatest: an update.json past its small limit is not read', async () => {
  const pair = {
    version: '0.24.64',
    package: 'https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v0.24.64/p.zip'
  }
  const answer = (text) => async () => new Response(text)
  assert.deepEqual(await readFleetLatest('joomla', { fetchImpl: answer(JSON.stringify(pair)) }), pair)
  const padded = JSON.stringify(pair).replace('{', `{${' '.repeat(2 * 1024 * 1024)}`)
  assert.equal(await readFleetLatest('joomla', { fetchImpl: answer(padded) }), 'unread')
  // A body that never ends is cut by the time limit.
  const endless = async (_url, { signal }) =>
    new Response(
      new ReadableStream({
        pull: (c) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve(c.enqueue(new Uint8Array([32]))), 5)
            signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(signal.reason)
            })
          })
      })
    )
  assert.equal(await readFleetLatest('joomla', { fetchImpl: endless, timeoutMs: 50 }), 'unread')
})

test('artifactFetchers: one plugin address is downloaded once per process, whichever check asks', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cowork-cache-'))
  try {
    const body = zipOf({ shared: 'plugin' })
    let calls = 0
    const fetchImpl = async () => {
      calls += 1
      return new Response(body)
    }
    const url = `https://x.test/shared-${process.pid}-${Date.now()}.zip`
    const c = { role: 'latest', version: '9', file: 'p.zip', url }
    // Each release's check makes its own fetchers.
    for (let i = 0; i < 3; i += 1)
      assert.deepEqual(await artifactFetchers({ fetchImpl, repo: 'r', cacheDir: dir }).fetchArtifact(c), body)
    assert.equal(calls, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readZipStrict: an end record whose entry count disagrees with its directory is corrupt, never an empty archive', async () => {
  const good = embeddedJoomla(contractFiles(BOXING))
  for (const [label, edit] of [
    [
      'both counts zero',
      (b) => (b.writeUInt16LE(0, b.length - 22 + 8), b.writeUInt16LE(0, b.length - 22 + 10))
    ],
    ['disk count only', (b) => b.writeUInt16LE(0, b.length - 22 + 10)],
    ['directory size', (b) => b.writeUInt32LE(b.readUInt32LE(b.length - 22 + 12) + 1, b.length - 22 + 12)]
  ]) {
    const zip = Buffer.from(good)
    edit(zip)
    assert.throws(() => readZipStrict(zip), CorruptArchive, label)
    const r = await pluginAnswer({
      platform: 'joomla',
      bytes: zip,
      id: BOXING_ID,
      expected: expectedContractFiles(BOXING).files,
      label: 'P'
    })
    assert.equal(r.state, 'not-checked', label)
  }
})
