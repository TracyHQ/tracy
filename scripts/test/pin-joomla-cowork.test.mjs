// pin-joomla-cowork.mjs moves the Joomla quickstarts' Claude Cowork pins onto a published release and
// nothing else: five values per older pin, the same text in both catalogues, and a refusal (nothing
// written) whenever the release does not carry the profiles the pins record byte for byte, or the
// download is not what GitHub states. No network: the release is a fixture (`--release`, `--zip`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'
import { contractFor, readContracts } from '../../apps/tracy-web/src/lib/contracts.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = path.join(ROOT, 'scripts/pin-joomla-cowork.mjs')
const CATALOGUES = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const CONTRACTS = 'packages/cms/tracy-joomla-quickstart/contracts'
const REPO_URL = 'https://github.com/TracyHQ/claude-cowork/releases/download'
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const MOVED = ['file', 'version', 'bytes', 'sha256', 'url']
/** `object` without `key`. */
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key))

/** A zip of `files` (name -> bytes), deflated like the real package; `zipFiles` reads it back. */
function zip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content)
    const packed = deflateRawSync(data)
    const nameBytes = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc32(data), 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, packed)
    centrals.push(central, nameBytes)
    offset += 30 + nameBytes.length + packed.length
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

/**
 * A Claude Cowork for Joomla package the way `joomla/cowork/build.sh` lays it out, carrying `profiles`
 * (id -> name -> bytes), and the release JSON `gh api` answers for it.
 */
function release(dir, version, profiles, { asset = {}, release: meta = {}, declares = version } = {}) {
  const component = {}
  for (const [id, files] of Object.entries(profiles))
    for (const [name, bytes] of Object.entries(files))
      component[`administrator/lib/contracts/${id}/${name}`] = bytes
  component['administrator/lib/contracts/README.md'] = 'profiles\n'
  const pkg = zip({
    'pkg_claudecowork.xml': `<extension type="package">\n    <version>${declares}</version>\n</extension>\n`,
    'packages/com_claudecowork.zip': zip(component)
  })
  const tag = `joomla-v${version}`
  const file = `pkg_claudecowork-${version}.zip`
  const zipPath = path.join(dir, file)
  writeFileSync(zipPath, pkg)
  const releasePath = path.join(dir, `${tag}.json`)
  writeFileSync(
    releasePath,
    JSON.stringify({
      tag_name: tag,
      draft: false,
      prerelease: false,
      assets: [
        {
          id: 900001,
          name: file,
          state: 'uploaded',
          size: pkg.length,
          digest: `sha256:${sha(pkg)}`,
          browser_download_url: `${REPO_URL}/${tag}/${file}`,
          ...asset
        },
        { id: 900002, name: 'tracy-release.json', state: 'uploaded', size: 2 }
      ],
      ...meta
    })
  )
  return { tag, file, pkg, args: ['--tag', tag, '--release', releasePath, '--zip', zipPath] }
}

const run = (root, args) =>
  spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' })
const texts = (root) => CATALOGUES.map((name) => readFileSync(path.join(root, name), 'utf8'))

/** Profile files on disk, and the hashes a pin records for them. */
const PROFILES = {
  'alpha/j6/1.0.0': { 'content-map.json': '{"slots":[]}\n', 'presentation-lock.json': '{"a":0}\n' },
  'alpha/j6/1.0.1': { 'content-map.json': '{"slots":[1]}\n', 'presentation-lock.json': '{"a":1}\n' },
  'beta/j6/2.0.0': {
    'content-map.json': '{"slots":[2]}\n',
    'demo-trim-map.json': '{"hide":[]}\n',
    'presentation-lock.json': '{"b":2}\n'
  }
}
const manifest = (id) => {
  const [slug, cms, version] = id.split('/')
  const release = slug === 'alpha' ? `quickstart/${slug}/${cms}` : `${slug}/${cms}`
  return `${JSON.stringify({ id, platform: 'joomla', quickstart: { release, version } })}\n`
}
const profile = (id) => ({ 'manifest.json': manifest(id), ...PROFILES[id] })
const hashes = (id) => Object.fromEntries(Object.entries(profile(id)).map(([n, b]) => [n, sha(b)]))
const pinOf = (version) => ({
  file: `pkg_claudecowork-${version}.zip`,
  version,
  bytes: 1000 + Number(version.split('.')[2]),
  sha256: String(version.split('.')[2]).repeat(64).slice(0, 64),
  url: `${REPO_URL}/joomla-v${version}/pkg_claudecowork-${version}.zip`
})

/**
 * Two catalogues in the repository's layout (inline arrays, notes, keys in hand-written order):
 * alpha on 0.30.1 with a profile it also carries, beta on 0.30.0 sealed through its manifest,
 * gamma on a newer 0.31.0, and a WordPress pin that is none of this script's business.
 */
function tree({ alpha = '0.30.1', mutate = (c) => c } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'pin-joomla-cowork-'))
  for (const id of Object.keys(PROFILES))
    for (const [name, bytes] of Object.entries(profile(id))) {
      mkdirSync(path.join(root, CONTRACTS, id), { recursive: true })
      writeFileSync(path.join(root, CONTRACTS, id, name), bytes)
    }
  const catalogue = mutate({
    'quickstart/alpha/j6': {
      platform: 'joomla',
      version: '1.0.1',
      cowork: {
        ...pinOf(alpha),
        contractVersions: ['1.0.0'],
        contractFiles: hashes('alpha/j6/1.0.1'),
        alsoCarries: { 'alpha/j6/1.0.0': hashes('alpha/j6/1.0.0') }
      },
      note: `Pinned on Claude Cowork ${alpha} by hand; this sentence is prose and stays.`,
      contract: 'alpha/j6/1.0.1'
    },
    'beta/j6': {
      platform: 'joomla',
      version: '2.0.0',
      cowork: {
        file: 'pkg_claudecowork-0.30.0.zip',
        overridesRelease: true,
        ...pinOf('0.30.0'),
        contractFiles: hashes('beta/j6/2.0.0')
      }
    },
    'quickstart/gamma/j6': { platform: 'joomla', version: '3.0.0', cowork: pinOf('0.31.0') },
    'delta/wp7': {
      platform: 'wordpress',
      version: '1.1.0',
      cowork: { ...pinOf('0.14.9'), url: 'https://x.test/w.zip' }
    }
  })
  const text = `${JSON.stringify(catalogue, null, 2).replace(/\[\n\s+("[^"\n]*")\n\s+\]/g, '[$1]')}\n`
  for (const name of CATALOGUES) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), text)
  }
  return root
}
const carried = () => ({
  'alpha/j6/1.0.0': profile('alpha/j6/1.0.0'),
  'alpha/j6/1.0.1': profile('alpha/j6/1.0.1'),
  'beta/j6/2.0.0': profile('beta/j6/2.0.0'),
  'other/j6/9.9.9': { 'manifest.json': '{}\n' }
})

test('a release carrying the recorded profiles moves every older Joomla pin: five values each, both copies one text', () => {
  const root = tree()
  const before = texts(root)
  const rel = release(root, '0.30.2', carried())
  const out = run(root, rel.args)
  assert.equal(out.status, 0, out.stderr)
  const after = texts(root)
  assert.equal(after[0], after[1], 'both catalogues are one text')
  const was = JSON.parse(before[0])
  const now = JSON.parse(after[0])
  const target = {
    file: rel.file,
    version: '0.30.2',
    bytes: rel.pkg.length,
    sha256: sha(rel.pkg),
    url: `${REPO_URL}/${rel.tag}/${rel.file}`
  }
  for (const id of ['quickstart/alpha/j6', 'beta/j6'])
    assert.deepEqual(now[id], { ...was[id], cowork: { ...was[id].cowork, ...target } }, id)
  assert.deepEqual(now['quickstart/gamma/j6'], was['quickstart/gamma/j6'], 'a newer pin stays')
  assert.deepEqual(now['delta/wp7'], was['delta/wp7'], 'a WordPress pin is not touched')
  // Only the ten value lines changed; layout (inline arrays), key order and the note are kept.
  const changed = before[0].split('\n').filter((line, i) => line !== after[0].split('\n')[i])
  assert.equal(changed.length, 10)
  assert.match(after[0], /"contractVersions": \["1\.0\.0"\]/)
  assert.match(after[0], /Pinned on Claude Cowork 0\.30\.1 by hand/)
  assert.match(out.stderr, /quickstart\/alpha\/j6: 0\.30\.1 -> 0\.30\.2/)
  assert.match(out.stderr, /beta\/j6: 0\.30\.0 -> 0\.30\.2/)
  assert.match(out.stderr, /quickstart\/gamma\/j6: on 0\.31\.0, newer than 0\.30\.2; left alone/)
  assert.match(out.stdout, /^diff --git a\/apps\/tracy-web\/src\/quickstarts\.json/)
})

test('--dry-run prints the diff and writes nothing', () => {
  const root = tree()
  const before = texts(root)
  const out = run(root, [...release(root, '0.30.2', carried()).args, '--dry-run'])
  assert.equal(out.status, 0, out.stderr)
  assert.deepEqual(texts(root), before)
  for (const name of CATALOGUES) assert.ok(out.stdout.includes(`+++ b/${name}`), name)
  assert.match(out.stdout, /\n-\s+"version": "0\.30\.1",\n/)
  assert.match(out.stdout, /\n\+\s+"version": "0\.30\.2",\n/)
  assert.match(out.stderr, /dry run: nothing written/)
})

test('a pin already on the release is verified and left alone, and --quickstart narrows the move', () => {
  const root = tree({ alpha: '0.30.2', mutate: (c) => c })
  const rel = release(root, '0.30.2', carried())
  // The pin names the release's real bytes, as a pin made from it would.
  const fix = (text) =>
    text
      .replace('"bytes": 1002', `"bytes": ${rel.pkg.length}`)
      .replace(`"${'2'.repeat(64)}"`, `"${sha(rel.pkg)}"`)
  for (const name of CATALOGUES)
    writeFileSync(path.join(root, name), fix(readFileSync(path.join(root, name), 'utf8')))
  const before = texts(root)
  const same = run(root, [...rel.args, '--quickstart', 'quickstart/alpha/j6'])
  assert.equal(same.status, 0, same.stderr)
  assert.equal(same.stdout, '')
  assert.match(same.stderr, /quickstart\/alpha\/j6: already on 0\.30\.2, verified/)
  assert.match(same.stderr, /nothing to move/)
  assert.deepEqual(texts(root), before)
  // The same tag with other bytes is a re-cut release, not a pin to keep.
  const recut = release(mkdtempSync(path.join(tmpdir(), 'recut-')), '0.30.2', {
    ...carried(),
    'x/j6/1.0.0': { 'a.json': '1' }
  })
  const refused = run(root, [...recut.args, '--quickstart', 'quickstart/alpha/j6'])
  assert.equal(refused.status, 1)
  assert.match(
    refused.stderr,
    /already on 0\.30\.2 but bytes, sha256 differ from the release — was joomla-v0\.30\.2 re-cut\?/
  )
  const beta = run(root, [...rel.args, '--quickstart', 'beta/j6'])
  assert.equal(beta.status, 0, beta.stderr)
  const now = JSON.parse(texts(root)[0])
  assert.equal(now['beta/j6'].cowork.version, '0.30.2')
  assert.equal(now['quickstart/alpha/j6'].cowork.bytes, rel.pkg.length)
  const unknown = run(root, [...rel.args, '--quickstart', 'delta/wp7'])
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /delta\/wp7 is not a Joomla quickstart with a Claude Cowork pin/)
})

test('a release that does not carry a recorded profile byte for byte is refused and nothing is written', () => {
  const cases = [
    [
      {
        ...carried(),
        'alpha/j6/1.0.1': { ...profile('alpha/j6/1.0.1'), 'content-map.json': '{"slots":[9]}\n' }
      },
      /alpha\/j6\/1\.0\.1\/content-map\.json in pkg_claudecowork-0\.30\.2\.zip is not the recorded/
    ],
    [
      { ...carried(), 'beta/j6/2.0.0': { ...profile('beta/j6/2.0.0'), 'editions.json': '{}\n' } },
      /carries beta\/j6\/2\.0\.0\/editions\.json, which the pin does not record/
    ],
    [without(carried(), 'alpha/j6/1.0.0'), /carries no alpha\/j6\/1\.0\.0/],
    [
      { ...carried(), 'beta/j6/2.0.0': without(profile('beta/j6/2.0.0'), 'demo-trim-map.json') },
      /carries beta\/j6\/2\.0\.0 without demo-trim-map\.json/
    ]
  ]
  for (const [profiles, problem] of cases) {
    const root = tree()
    const before = texts(root)
    const out = run(root, release(root, '0.30.2', profiles).args)
    assert.equal(out.status, 1, out.stderr)
    assert.match(out.stderr, problem)
    assert.match(out.stderr, /refused, nothing written/)
    assert.equal(out.stdout, '')
    assert.deepEqual(texts(root), before)
  }
})

test('a download or a release that is not what it claims is refused', () => {
  const cases = [
    [{ asset: { size: 12 } }, /downloaded as \d+ bytes, GitHub states 12/],
    [{ asset: { digest: `sha256:${'0'.repeat(64)}` } }, /hashes to [0-9a-f]{64}, GitHub states sha256:0{64}/],
    [{ declares: '0.30.1' }, /declares version 0\.30\.1, not 0\.30\.2/],
    [{ release: { draft: true } }, /joomla-v0\.30\.2 is a draft/],
    [{ release: { prerelease: true } }, /joomla-v0\.30\.2 is a pre-release/],
    [
      { asset: { browser_download_url: 'https://elsewhere.test/p.zip' } },
      /is served at https:\/\/elsewhere\.test\/p\.zip/
    ],
    [{ asset: { state: 'starter' } }, /is starter, not uploaded/]
  ]
  for (const [options, problem] of cases) {
    const root = tree()
    const before = texts(root)
    const out = run(root, release(root, '0.30.2', carried(), options).args)
    assert.equal(out.status, 1, `${problem}: ${out.stderr}`)
    assert.match(out.stderr, problem)
    assert.deepEqual(texts(root), before)
  }
  const root = tree()
  const bad = run(root, ['--tag', 'joomla-v0.30.2-rc.1'])
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /a release candidate is never pinned/)
})

test('two catalogues that already differ, or a pin fetched by githubAssetId, are refused', () => {
  const root = tree()
  writeFileSync(path.join(root, CATALOGUES[1]), `${texts(root)[1]}\n`)
  const differ = run(root, release(root, '0.30.2', carried()).args)
  assert.equal(differ.status, 1)
  assert.match(differ.stderr, /differ; make them one text first/)
  const byId = tree({
    mutate: (c) => ({
      ...c,
      'beta/j6': { ...c['beta/j6'], cowork: { ...c['beta/j6'].cowork, githubAssetId: 594659367 } }
    })
  })
  const before = texts(byId)
  const out = run(byId, release(byId, '0.30.2', carried()).args)
  assert.equal(out.status, 1)
  assert.match(out.stderr, /beta\/j6: pinned by githubAssetId 594659367 .*move it by hand/)
  assert.deepEqual(texts(byId), before)
})

test('the committed catalogues move whole: every Joomla pin, five values each, nothing else', () => {
  // A release carrying exactly the profiles the committed pins record, built from this tree's own
  // profile files (the gates hold those pins to these bytes), under a version newer than any pin.
  const root = mkdtempSync(path.join(tmpdir(), 'pin-joomla-cowork-real-'))
  for (const name of CATALOGUES) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    cpSync(path.join(ROOT, name), path.join(root, name))
  }
  mkdirSync(path.join(root, CONTRACTS), { recursive: true })
  const catalogue = JSON.parse(readFileSync(path.join(ROOT, CATALOGUES[0]), 'utf8'))
  const index = readContracts([path.join(ROOT, CONTRACTS)])
  const profiles = {}
  const joomla = Object.entries(catalogue).filter(([, e]) => e?.platform === 'joomla' && e.cowork)
  assert.ok(joomla.length >= 8, `${joomla.length} Joomla pins`)
  for (const [id, entry] of joomla) {
    const sealed = entry.contract ?? contractFor(index, entry.release ?? id, entry.version).id
    const versions = (entry.cowork.contractVersions ?? []).map(
      (v) => contractFor(index, entry.release ?? id, v).id
    )
    const recorded = { [sealed]: entry.cowork.contractFiles, ...entry.cowork.alsoCarries }
    for (const profileId of [...Object.keys(recorded), ...versions]) {
      cpSync(
        path.join(ROOT, CONTRACTS, profileId, 'manifest.json'),
        path.join(root, CONTRACTS, profileId, 'manifest.json')
      )
      profiles[profileId] ??= {}
      // A profile served only through `contractVersions` is carried whole; one the pin records, as recorded.
      for (const name of Object.keys(recorded[profileId] ?? { 'manifest.json': '' }))
        profiles[profileId][name] = readFileSync(path.join(ROOT, CONTRACTS, profileId, name))
    }
  }
  const before = texts(root)
  const rel = release(root, '0.99.0', profiles)
  const out = run(root, rel.args)
  assert.equal(out.status, 0, out.stderr)
  const after = texts(root)
  assert.equal(after[0], after[1])
  const was = JSON.parse(before[0])
  const now = JSON.parse(after[0])
  for (const [id] of joomla) {
    assert.equal(now[id].cowork.version, '0.99.0', id)
    assert.equal(now[id].cowork.sha256, sha(rel.pkg), id)
    const contractHalf = (pin) => Object.fromEntries(Object.entries(pin).filter(([k]) => !MOVED.includes(k)))
    assert.deepEqual(
      contractHalf(now[id].cowork),
      contractHalf(was[id].cowork),
      `${id}: the contract half of the pin`
    )
    assert.deepEqual(
      { ...now[id], cowork: null },
      { ...was[id], cowork: null },
      `${id}: the rest of the entry`
    )
  }
  for (const [id, entry] of Object.entries(was))
    if (!joomla.some(([j]) => j === id)) assert.deepEqual(now[id], entry, id)
  const changed = before[0].split('\n').filter((line, i) => line !== after[0].split('\n')[i])
  assert.equal(changed.length, joomla.length * 5)
})

/**
 * A SLIM Claude Cowork for Joomla release (after joomla-v0.24.53): the component holds only
 * `administrator/lib/contracts.json`, and each profile is its own release asset,
 * `<id with "/" -> "--">.zip` with its files at the root, written into `<dir>/assets`.
 * `index(id, row)` may rewrite an index row; `attach(id, bytes)` the bytes the release serves.
 */
function slimRelease(dir, version, profiles, { index = (_id, row) => row, attach = (_id, b) => b } = {}) {
  const assetsDir = path.join(dir, 'assets')
  mkdirSync(assetsDir, { recursive: true })
  const contracts = {}
  const attached = []
  for (const [id, files] of Object.entries(profiles)) {
    const name = `${id.replaceAll('/', '--')}.zip`
    const bytes = zip(files)
    const row = index(id, {
      asset: name,
      sha256: sha(bytes),
      bytes: bytes.length,
      template: id.split('/')[0]
    })
    if (row) contracts[id] = row
    const served = attach(id, bytes)
    writeFileSync(path.join(assetsDir, name), served)
    attached.push({ name, size: served.length, digest: `sha256:${sha(served)}` })
  }
  const pkg = zip({
    'pkg_claudecowork.xml': `<extension type="package">\n    <version>${version}</version>\n</extension>\n`,
    'packages/com_claudecowork.zip': zip({
      'administrator/lib/Engine.php': '<?php\n',
      'administrator/lib/contracts.json': JSON.stringify({ contracts })
    })
  })
  const tag = `joomla-v${version}`
  const file = `pkg_claudecowork-${version}.zip`
  const zipPath = path.join(dir, file)
  writeFileSync(zipPath, pkg)
  const releasePath = path.join(dir, `${tag}.json`)
  writeFileSync(
    releasePath,
    JSON.stringify({
      tag_name: tag,
      draft: false,
      prerelease: false,
      assets: [
        {
          id: 900001,
          name: file,
          state: 'uploaded',
          size: pkg.length,
          digest: `sha256:${sha(pkg)}`,
          browser_download_url: `${REPO_URL}/${tag}/${file}`
        },
        ...attached.map((a, i) => ({
          id: 910000 + i,
          state: 'uploaded',
          browser_download_url: `${REPO_URL}/${tag}/${a.name}`,
          ...a
        }))
      ]
    })
  )
  return {
    tag,
    file,
    pkg,
    args: ['--tag', tag, '--release', releasePath, '--zip', zipPath, '--assets', assetsDir]
  }
}

test('a slim release: each recorded profile is checked from its own asset, then the pins move', () => {
  const root = tree()
  try {
    const rel = slimRelease(root, '0.30.2', carried())
    const out = run(root, rel.args)
    assert.equal(out.status, 0, out.stderr)
    const now = JSON.parse(texts(root)[0])
    for (const id of ['quickstart/alpha/j6', 'beta/j6']) assert.equal(now[id].cowork.version, '0.30.2', id)
    assert.match(out.stderr, /4 profiles its index lists \(3 fetched\)/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a slim release whose asset is not what its index says, or lists no recorded profile, is refused', () => {
  const cases = [
    [
      'wrong sha256 in the index',
      { index: (id, row) => (id === 'beta/j6/2.0.0' ? { ...row, sha256: '0'.repeat(64) } : row) },
      /beta-?.*hashes to [0-9a-f]{64}, the index says 0{64}/
    ],
    [
      'a profile the index does not list',
      { index: (id, row) => (id === 'alpha/j6/1.0.0' ? undefined : row) },
      /carries no alpha\/j6\/1\.0\.0/
    ],
    [
      'an asset whose files are not the recorded ones',
      {
        attach: (id, bytes) =>
          id === 'alpha/j6/1.0.1' ? zip({ ...profile(id), 'content-map.json': '{"slots":[9]}\n' }) : bytes,
        index: (id, row) => {
          if (id !== 'alpha/j6/1.0.1') return row
          const served = zip({ ...profile(id), 'content-map.json': '{"slots":[9]}\n' })
          return { ...row, sha256: sha(served), bytes: served.length }
        }
      },
      /alpha\/j6\/1\.0\.1\/content-map\.json in .* is not the recorded/
    ],
    [
      'an asset name with a path in it',
      { index: (id, row) => (id === 'beta/j6/2.0.0' ? { ...row, asset: `../${row.asset}` } : row) },
      /beta\/j6\/2\.0\.0's asset "\.\.\/beta--j6--2\.0\.0\.zip", not a plain \.zip file name/
    ]
  ]
  for (const [label, options, message] of cases) {
    const root = tree()
    try {
      const before = texts(root)
      const out = run(root, slimRelease(root, '0.30.2', carried(), options).args)
      assert.equal(out.status, 1, `${label}: ${out.stderr}`)
      assert.match(out.stderr, message, label)
      assert.match(out.stderr, /refused, nothing written/, label)
      assert.deepEqual(texts(root), before, label)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }
})
