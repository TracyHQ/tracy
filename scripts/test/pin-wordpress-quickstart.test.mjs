// pin-wordpress-quickstart.mjs writes a WordPress quickstart's catalogue entry from a published Claude Cowork
// plugin release (and, with --version, a quickstart release): both catalogue copies one text, the contract
// hashes taken from this tree, and a refusal (nothing written) whenever the plugin does not carry the contract
// byte for byte. No network: every release is a fixture (`--release`, `--zip`, `--quickstart-release`, ...).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SCRIPT = path.join(ROOT, 'scripts/pin-wordpress-quickstart.mjs')
const CATALOGUES = [
  'apps/tracy-web/src/quickstarts.json',
  'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json'
]
const CONTRACTS = 'packages/cms/tracy-wordpress-quickstart/contracts'
const PLUGIN_URL = 'https://github.com/TracyHQ/claude-cowork/releases/download'
const QS_URL = 'https://github.com/JoomlArt-Products/joomlart-products/releases/download'
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

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

/** Invented profiles: the files the plugin carries plus one it does not (inventory.json). */
const profile = (id, tag, floor = '0.30.0') => ({
  'manifest.json': `${JSON.stringify({ id, coworkContractVersion: floor })}\n`,
  'content-map.json': `{"slots":["${tag}"]}\n`,
  'presentation-lock.json': `{"lock":"${tag}"}\n`,
  'inventory.json': `{"pages":["${tag}"]}\n`
})
const PROFILES = {
  'alpha/wp7/1.0.0': profile('alpha/wp7/1.0.0', 'a'),
  'alpha/wp7/1.0.1': profile('alpha/wp7/1.0.1', 'b'),
  'alpha/wp7/1.0.2': profile('alpha/wp7/1.0.2', 'c')
}
const CARRIED = ['content-map.json', 'manifest.json', 'presentation-lock.json']
const hashes = (id) => Object.fromEntries(CARRIED.map((n) => [n, sha(PROFILES[id][n])]))

/** A plugin release (zip + the JSON `gh api` answers) carrying `profiles` (id -> name -> bytes). */
function plugin(dir, version, profiles, { asset = {}, release: meta = {}, declares = version } = {}) {
  const files = {
    'claude-cowork/claude-cowork.php': `<?php\n/**\n * Plugin Name: Claude Cowork\n * Version:     ${declares}\n */\n`
  }
  for (const [id, parts] of Object.entries(profiles))
    for (const [name, bytes] of Object.entries(parts))
      files[`claude-cowork/lib/contracts/${id}/${name}`] = bytes
  const pkg = zip(files)
  const tag = `wordpress-v${version}`
  const file = `claude-cowork-${version}.zip`
  writeFileSync(path.join(dir, file), pkg)
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
          browser_download_url: `${PLUGIN_URL}/${tag}/${file}`,
          ...asset
        }
      ],
      ...meta
    })
  )
  return {
    tag,
    file,
    pkg,
    args: ['--plugin-tag', tag, '--release', releasePath, '--zip', path.join(dir, file)]
  }
}
/** The profiles of the tree, as the plugin would carry them (carried files only). */
const carriedOf = (ids) =>
  Object.fromEntries(ids.map((id) => [id, Object.fromEntries(CARRIED.map((n) => [n, PROFILES[id][n]]))]))

const oldPin = {
  file: 'claude-cowork-0.30.1.zip',
  version: '0.30.1',
  bytes: 1001,
  sha256: '1'.repeat(64),
  url: `${PLUGIN_URL}/wordpress-v0.30.1/claude-cowork-0.30.1.zip`,
  contractVersions: ['1.0.0'],
  alsoCarries: { 'alpha/wp7/1.0.0': hashes('alpha/wp7/1.0.0') },
  contractFiles: hashes('alpha/wp7/1.0.1')
}
const part = (kind, version, ext) => ({
  file: `alpha-wp7-${kind}-${version}.${ext}`,
  bytes: 10,
  sha256: '2'.repeat(64),
  githubAssetId: 5,
  url: `${QS_URL}/quickstart%2Falpha%2Fwp7/alpha-wp7-${kind}-${version}.${ext}`
})

/** A tree in the repository's layout: inline scalar arrays, notes, a Joomla entry that is none of this script's business. */
function tree({ mutate = (c) => c } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'pin-wordpress-'))
  for (const [id, files] of Object.entries(PROFILES))
    for (const [name, bytes] of Object.entries(files)) {
      mkdirSync(path.join(root, CONTRACTS, id), { recursive: true })
      writeFileSync(path.join(root, CONTRACTS, id, name), bytes)
    }
  const catalogue = mutate({
    'quickstart/alpha/wp7': {
      platform: 'wordpress',
      version: '1.0.1',
      webroot: part('webroot', '1.0.1', 'tar.gz'),
      database: part('database', '1.0.1', 'sql.gz'),
      cowork: oldPin,
      contract: 'alpha/wp7/1.0.1'
    },
    'beta/j6': {
      platform: 'joomla',
      version: '2.0.0',
      cowork: { ...oldPin, file: 'pkg_claudecowork-0.30.1.zip' },
      note: 'prose stays'
    }
  })
  const text = `${JSON.stringify(catalogue, null, 2).replace(/\[\n\s+("[^"\n]*")\n\s+\]/g, '[$1]')}\n`
  for (const name of CATALOGUES) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    writeFileSync(path.join(root, name), text)
  }
  return root
}
const run = (root, args) =>
  spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' })
const texts = (root) => CATALOGUES.map((name) => readFileSync(path.join(root, name), 'utf8'))
const KEY = ['--quickstart', 'quickstart/alpha/wp7']

test('a plugin release carrying the contract byte for byte moves the pin in both copies', () => {
  const root = tree()
  const before = texts(root)
  const rel = plugin(root, '0.30.2', carriedOf(['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1']))
  const out = run(root, [...KEY, ...rel.args])
  assert.equal(out.status, 0, out.stderr)
  const after = texts(root)
  assert.equal(after[0], after[1], 'both catalogues are one text')
  const was = JSON.parse(before[0])
  const now = JSON.parse(after[0])
  assert.deepEqual(now['quickstart/alpha/wp7'].cowork, {
    file: rel.file,
    version: '0.30.2',
    bytes: rel.pkg.length,
    sha256: sha(rel.pkg),
    url: `${PLUGIN_URL}/${rel.tag}/${rel.file}`,
    contractVersions: ['1.0.0'],
    alsoCarries: { 'alpha/wp7/1.0.0': hashes('alpha/wp7/1.0.0') },
    contractFiles: hashes('alpha/wp7/1.0.1')
  })
  assert.deepEqual(now['beta/j6'], was['beta/j6'], 'a Joomla entry is not touched')
  assert.match(after[0], /"contractVersions": \["1\.0\.0"\]/, 'scalar arrays stay on one line')
  assert.match(out.stderr, /quickstart\/alpha\/wp7: plugin 0\.30\.1 -> 0\.30\.2/)
  assert.match(out.stdout, /^diff --git a\/apps\/tracy-web\/src\/quickstarts\.json/)
})

test('--dry-run prints the diff and writes nothing', () => {
  const root = tree()
  const before = texts(root)
  const rel = plugin(root, '0.30.2', carriedOf(['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1']))
  const out = run(root, [...KEY, ...rel.args, '--dry-run'])
  assert.equal(out.status, 0, out.stderr)
  assert.deepEqual(texts(root), before)
  assert.match(out.stdout, /\+\s+"version": "0\.30\.2",/)
  assert.match(out.stderr, /dry run: nothing written/)
})

test('a plugin that was cut before the contract changed is refused', () => {
  const root = tree()
  const before = texts(root)
  const stale = carriedOf(['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1'])
  stale['alpha/wp7/1.0.1']['content-map.json'] = '{"slots":["old"]}\n'
  const out = run(root, [...KEY, ...plugin(root, '0.30.2', stale).args])
  assert.equal(out.status, 1)
  assert.match(
    out.stderr,
    /alpha\/wp7\/1\.0\.1\/content-map\.json in claude-cowork-0\.30\.2\.zip is not this tree/
  )
  assert.match(out.stderr, /nothing written/)
  assert.deepEqual(texts(root), before)
})

test('a plugin without the contract, with a file the tree lacks, or older than its floor is refused', () => {
  const missing = tree()
  assert.match(
    run(missing, [...KEY, ...plugin(missing, '0.30.2', carriedOf(['alpha/wp7/1.0.0'])).args]).stderr,
    /carries no alpha\/wp7\/1\.0\.1/
  )
  const extra = tree()
  const withExtra = carriedOf(['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1'])
  withExtra['alpha/wp7/1.0.1']['demo-trim-map.json'] = '{}\n'
  assert.match(
    run(extra, [...KEY, ...plugin(extra, '0.30.2', withExtra).args]).stderr,
    /demo-trim-map\.json, which this tree does not have/
  )
  const floored = tree()
  const asked = `${JSON.stringify({ id: 'alpha/wp7/1.0.1', coworkContractVersion: '0.31.0' })}\n`
  writeFileSync(path.join(floored, CONTRACTS, 'alpha/wp7/1.0.1/manifest.json'), asked)
  const carries = carriedOf(['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1'])
  carries['alpha/wp7/1.0.1']['manifest.json'] = asked
  const out = run(floored, [...KEY, ...plugin(floored, '0.30.2', carries).args])
  assert.equal(out.status, 1)
  assert.match(out.stderr, /plugin 0\.30\.2 is older than the coworkContractVersion 0\.31\.0/)
})

test('a sibling profile that differs from the tree is refused', () => {
  const root = tree()
  const sibling = carriedOf(['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1'])
  sibling['alpha/wp7/1.0.0']['presentation-lock.json'] = '{"lock":"other"}\n'
  const out = run(root, [...KEY, ...plugin(root, '0.30.2', sibling).args])
  assert.equal(out.status, 1)
  assert.match(
    out.stderr,
    /alpha\/wp7\/1\.0\.0 in claude-cowork-0\.30\.2\.zip differs from this tree \(presentation-lock\.json\)/
  )
})

test('a draft, a wrong digest, a wrong version header and an unknown key are refused', () => {
  const ids = ['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1']
  const draft = tree()
  assert.match(
    run(draft, [...KEY, ...plugin(draft, '0.30.2', carriedOf(ids), { release: { draft: true } }).args])
      .stderr,
    /is a draft/
  )
  const digest = tree()
  assert.match(
    run(digest, [
      ...KEY,
      ...plugin(digest, '0.30.2', carriedOf(ids), { asset: { digest: `sha256:${'0'.repeat(64)}` } }).args
    ]).stderr,
    /GitHub states sha256:0+/
  )
  const header = tree()
  assert.match(
    run(header, [...KEY, ...plugin(header, '0.30.2', carriedOf(ids), { declares: '0.30.3' }).args]).stderr,
    /declares version 0\.30\.3, not 0\.30\.2/
  )
  const joomla = tree()
  const out = run(joomla, ['--quickstart', 'beta/j6', ...plugin(joomla, '0.30.2', carriedOf(ids)).args])
  assert.equal(out.status, 1)
  assert.match(out.stderr, /beta\/j6 is not a WordPress quickstart/)
})

test('the two catalogue copies must already be one text', () => {
  const root = tree()
  writeFileSync(path.join(root, CATALOGUES[1]), `${readFileSync(path.join(root, CATALOGUES[1]), 'utf8')} `)
  const out = run(root, [...KEY, ...plugin(root, '0.30.2', carriedOf(['alpha/wp7/1.0.1'])).args])
  assert.equal(out.status, 1)
  assert.match(out.stderr, /differ; make them one text first/)
})

/** The quickstart release of version 1.0.2 and its two parts. */
function quickstart(dir, slug = 'alpha') {
  const webroot = Buffer.from('webroot bytes')
  const database = Buffer.from('database bytes')
  writeFileSync(path.join(dir, 'webroot.bin'), webroot)
  writeFileSync(path.join(dir, 'database.bin'), database)
  const asset = (id, name, bytes) => ({
    id,
    name,
    state: 'uploaded',
    size: bytes.length,
    digest: `sha256:${sha(bytes)}`,
    browser_download_url: `${QS_URL}/quickstart%2F${slug}%2Fwp7/${name}`
  })
  const releasePath = path.join(dir, 'quickstart.json')
  writeFileSync(
    releasePath,
    JSON.stringify({
      tag_name: `quickstart/${slug}/wp7`,
      draft: false,
      prerelease: false,
      assets: [
        asset(77, `${slug}-wp7-webroot-1.0.2.tar.gz`, webroot),
        asset(78, `${slug}-wp7-database-1.0.2.sql.gz`, database)
      ]
    })
  )
  return {
    webroot,
    database,
    args: [
      '--version',
      '1.0.2',
      '--quickstart-release',
      releasePath,
      '--webroot',
      path.join(dir, 'webroot.bin'),
      '--database',
      path.join(dir, 'database.bin')
    ]
  }
}

test('--version moves the quickstart: version, contract, parts sized and hashed from the assets', () => {
  const root = tree()
  const qs = quickstart(root)
  const rel = plugin(root, '0.30.2', carriedOf(['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1', 'alpha/wp7/1.0.2']))
  const out = run(root, [...KEY, ...rel.args, ...qs.args])
  assert.equal(out.status, 0, out.stderr)
  const entry = JSON.parse(texts(root)[0])['quickstart/alpha/wp7']
  assert.equal(entry.version, '1.0.2')
  assert.equal(entry.contract, 'alpha/wp7/1.0.2')
  assert.deepEqual(entry.webroot, {
    file: 'alpha-wp7-webroot-1.0.2.tar.gz',
    bytes: qs.webroot.length,
    sha256: sha(qs.webroot),
    githubAssetId: 77,
    url: `${QS_URL}/quickstart%2Falpha%2Fwp7/alpha-wp7-webroot-1.0.2.tar.gz`
  })
  assert.equal(entry.database.sha256, sha(qs.database))
  assert.deepEqual(entry.cowork.contractVersions, ['1.0.0', '1.0.2'])
  assert.deepEqual(Object.keys(entry.cowork.alsoCarries), ['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1'])
  assert.deepEqual(entry.cowork.contractFiles, hashes('alpha/wp7/1.0.2'))
  assert.deepEqual(Object.keys(entry), ['platform', 'version', 'webroot', 'database', 'cowork', 'contract'])
})

test('--version refuses a quickstart asset that does not match what GitHub states, or a missing part', () => {
  const root = tree()
  const qs = quickstart(root)
  writeFileSync(path.join(root, 'webroot.bin'), 'tampered')
  const rel = plugin(root, '0.30.2', carriedOf(['alpha/wp7/1.0.0', 'alpha/wp7/1.0.1', 'alpha/wp7/1.0.2']))
  const out = run(root, [...KEY, ...rel.args, ...qs.args])
  assert.equal(out.status, 1)
  assert.match(out.stderr, /alpha-wp7-webroot-1\.0\.2\.tar\.gz is 8 bytes, GitHub states 13/)
  const none = run(root, [...KEY, ...rel.args, ...qs.args.map((a) => (a === '1.0.2' ? '1.0.3' : a))])
  assert.match(none.stderr, /has no asset alpha-wp7-webroot-1\.0\.3/)
})

test('--version for a new design appends its entry after the others, and needs its contract folder', () => {
  const root = tree()
  const qs = quickstart(root, 'gamma')
  const rel = plugin(root, '0.30.2', {
    ...carriedOf(['alpha/wp7/1.0.2']),
    'gamma/wp7/1.0.2': Object.fromEntries(CARRIED.map((n) => [n, profile('gamma/wp7/1.0.2', 'g')[n]]))
  })
  const key = ['--quickstart', 'quickstart/gamma/wp7']
  const none = run(root, [...key, ...rel.args, ...qs.args])
  assert.equal(none.status, 1)
  assert.match(none.stderr, /gamma\/wp7\/1\.0\.2 has no manifest\.json/)
  for (const [name, bytes] of Object.entries(profile('gamma/wp7/1.0.2', 'g'))) {
    mkdirSync(path.join(root, CONTRACTS, 'gamma/wp7/1.0.2'), { recursive: true })
    writeFileSync(path.join(root, CONTRACTS, 'gamma/wp7/1.0.2', name), bytes)
  }
  const out = run(root, [...key, ...rel.args, ...qs.args])
  assert.equal(out.status, 0, out.stderr)
  const [web, host] = texts(root)
  assert.equal(web, host)
  const now = JSON.parse(web)
  assert.deepEqual(Object.keys(now), ['quickstart/alpha/wp7', 'beta/j6', 'quickstart/gamma/wp7'])
  assert.deepEqual(Object.keys(now['quickstart/gamma/wp7']), [
    'platform',
    'version',
    'webroot',
    'database',
    'cowork',
    'contract'
  ])
  assert.equal(now['quickstart/gamma/wp7'].cowork.contractVersions[0], '1.0.2')
  assert.equal(now['quickstart/gamma/wp7'].cowork.alsoCarries, undefined)
})

test('bad arguments exit 2', () => {
  const root = tree()
  assert.equal(run(root, ['--quickstart', 'quickstart/alpha/wp7', '--plugin-tag', 'joomla-v0.1.0']).status, 2)
  assert.equal(run(root, ['--plugin-tag', 'wordpress-v0.30.2']).status, 2)
})
