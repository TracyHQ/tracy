#!/usr/bin/env node
/**
 * The package an import uploads (`src/host/slim-package.ts`): the release's own Claude Cowork
 * package carrying only the quickstart contracts the site needs, every other entry as released: a
 * full release's other contracts taken out, a slim release's (contracts as release assets) put in.
 *
 *   node --test packages/site/tracy-add-site/test/slim-package.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { entriesOf, makePackage, makeSlimPackage, memberOf } from './fixtures/cowork-package.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let slim

before(async () => {
  const built = await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src/host/slim-package.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent'
  })
  slim = await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
  )
})

const arrayBufferOf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.length)

test('the contracts go, everything else stays, and both archives read back whole', () => {
  const pkg = makePackage({ contractBytes: 4 * 1024 * 1024 })
  const out = slim.packageForImport(arrayBufferOf(pkg))
  assert.ok(out)
  assert.equal(out.dropped, 4)
  assert.ok(out.to < 200 * 1024, `${out.to} bytes`)
  const sent = Buffer.from(out.bytes)
  assert.deepEqual(entriesOf(sent), entriesOf(pkg), 'the package keeps every entry')
  const before = entriesOf(pkg, 'packages/com_claudecowork.zip')
  const after = entriesOf(sent, 'packages/com_claudecowork.zip')
  assert.deepEqual(
    after,
    before.filter((n) => !n.startsWith('administrator/lib/contracts/'))
  )
  assert.ok(
    after.includes('administrator/lib/language-packs.json'),
    'plugin-wide files beside the contracts stay'
  )
  assert.deepEqual(entriesOf(sent, 'packages/plg_system_claudecoworkapi.zip'), ['claudecoworkapi.php'])
})

test('a contract the site is held to stays, whole; the others go', () => {
  const pkg = makePackage({ contractBytes: 1024 * 1024 })
  const out = slim.packageForImport(arrayBufferOf(pkg), new Set(['ja-resume/j6/1.0.6', 'ja-impact/j6/1.0.1']))
  assert.ok(out)
  assert.deepEqual(
    out.kept,
    ['ja-resume/j6/1.0.6'],
    'a folder the package does not carry is not reported kept'
  )
  assert.equal(out.dropped, 2)
  const before = entriesOf(pkg, 'packages/com_claudecowork.zip')
  const after = entriesOf(Buffer.from(out.bytes), 'packages/com_claudecowork.zip')
  assert.deepEqual(
    after,
    before.filter((n) => !n.startsWith('administrator/lib/contracts/tracy-business/'))
  )
})

// Measured on the 0.24.49 release (21/10/2026): Tracy Business ships nine versions, 3.9 MB together.
const BUSINESS = [
  {
    slug: 'tracy-business',
    version: '1.2.1',
    files: { 'templates/tracy_business/css/template.css': 'a1', 'templates/tracy_business/AGENTS.md': 'x' }
  },
  {
    slug: 'tracy-business',
    version: '1.2.2',
    files: { 'templates/tracy_business/css/template.css': 'a2', 'templates/tracy_business/js/site.js': 'j1' }
  },
  {
    slug: 'tracy-business',
    version: '1.2.5',
    files: { 'templates/tracy_business/css/template.css': 'a5', 'templates/tracy_business/js/site.js': 'j2' }
  },
  {
    slug: 'tracy-business',
    version: '1.2.6',
    names: 'tracy-business/j6/1.2.5',
    files: { 'templates/tracy_business/css/template.css': 'a6', 'templates/tracy_business/js/site.js': 'j2' }
  },
  { slug: 'ja-resume', version: '1.0.6', files: { 'templates/ja_resume/css/template.css': 'r' } }
]

test('the candidates are the contracts of a template the site has, with what tells them apart', () => {
  const pkg = arrayBufferOf(makePackage({ contractBytes: 64 * 1024, contracts: BUSINESS }))
  const found = slim.contractCandidates(pkg, new Set(['tracy_business', 'cassiopeia']))
  assert.deepEqual(
    found.map((c) => c.id),
    [
      'tracy-business/j6/1.2.1',
      'tracy-business/j6/1.2.2',
      'tracy-business/j6/1.2.5',
      'tracy-business/j6/1.2.6'
    ]
  )
  assert.equal(found[3].names, 'tracy-business/j6/1.2.5')
  assert.equal(found[1].names, undefined, 'a quickstart naming its own contract names no other')
  assert.deepEqual(found[1].files, BUSINESS[1].files)
  assert.deepEqual(slim.contractCandidates(pkg, new Set(['cassiopeia'])), [])
  // Only public files that differ between versions are asked for; a Markdown file is not served.
  assert.deepEqual(slim.probePaths(found), [
    'templates/tracy_business/css/template.css',
    'templates/tracy_business/js/site.js'
  ])
  assert.deepEqual(slim.probePaths(found.slice(0, 1)), [], 'one candidate needs no asking')
})

test('the version whose files the site serves is kept, with the contract its quickstart names', () => {
  const pkg = arrayBufferOf(makePackage({ contractBytes: 64 * 1024, contracts: BUSINESS }))
  const found = slim.contractCandidates(pkg, new Set(['tracy_business']))
  const pick = (seen) => [...slim.pickContracts(found, new Map(Object.entries(seen)))].sort()
  assert.deepEqual(
    pick({ 'templates/tracy_business/css/template.css': 'a2', 'templates/tracy_business/js/site.js': 'j1' }),
    ['tracy-business/j6/1.2.2']
  )
  assert.deepEqual(pick({ 'templates/tracy_business/css/template.css': 'a6' }), [
    'tracy-business/j6/1.2.5',
    'tracy-business/j6/1.2.6'
  ])
  // A site whose CSS someone edited still matches its script: the best match wins.
  assert.deepEqual(
    pick({
      'templates/tracy_business/css/template.css': 'edited',
      'templates/tracy_business/js/site.js': 'j1'
    }),
    ['tracy-business/j6/1.2.2']
  )
  // Nothing read, or nothing matched: every candidate stays — a larger package beats a missing contract.
  const all = found.map((c) => c.id).sort()
  assert.deepEqual(pick({}), all)
  assert.deepEqual(pick({ 'templates/tracy_business/css/template.css': 'edited' }), all)
})

test('anything but a Joomla Claude Cowork package with contracts is left as it is', () => {
  assert.equal(slim.packageForImport(new ArrayBuffer(4)), undefined, 'not a zip')
  // A WordPress plugin's zip: no nested component, nothing to take out.
  const wp = execFileSync('python3', ['-c', WP_ZIP], { maxBuffer: 1 << 20 })
  assert.equal(slim.packageForImport(arrayBufferOf(wp)), undefined)
})

const WP_ZIP = `
import io, sys, zipfile
out = io.BytesIO()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('claude-cowork/claude-cowork.php', '<?php // plugin')
sys.stdout.buffer.write(out.getvalue())
`

// The release shape after Joomla 0.24.53: no contract folder in the component, an index
// (`administrator/lib/contracts.json`) and one release asset per contract beside the package.
const COMPONENT = 'packages/com_claudecowork.zip'
const fetcherOf =
  (assets, log = []) =>
  async (name) => {
    log.push(name)
    return assets[name]
  }

test('a slim release: the version the site serves is fetched, checked and put in, with the one it names', async () => {
  const { pkg, assets } = makeSlimPackage({ contracts: BUSINESS })
  const bytes = arrayBufferOf(pkg)
  const templates = new Set(['tracy_business', 'cassiopeia'])
  assert.deepEqual(slim.contractCandidates(bytes, templates), [], 'no folder, no asset: no candidate yet')
  const ids = slim.indexedCandidates(bytes, templates)
  assert.equal(ids.length, 4, 'every Tracy Business version, no JA Resume')
  const log = []
  const fetched = await slim.fetchContractAssets(bytes, ids, fetcherOf(assets, log))
  assert.equal(fetched.size, 4)
  assert.ok(!log.includes('ja-resume--j6--1.0.6.zip'), 'a template the site lacks is not fetched')
  const found = slim.contractCandidates(bytes, templates, fetched)
  assert.equal(found.find((c) => c.id === 'tracy-business/j6/1.2.6')?.names, 'tracy-business/j6/1.2.5')
  assert.deepEqual(slim.probePaths(found), [
    'templates/tracy_business/css/template.css',
    'templates/tracy_business/js/site.js'
  ])
  const keep = slim.pickContracts(found, new Map([['templates/tracy_business/css/template.css', 'a6']]))
  assert.deepEqual([...keep].sort(), ['tracy-business/j6/1.2.5', 'tracy-business/j6/1.2.6'])

  const out = slim.packageForImport(bytes, keep, fetched)
  assert.ok(out)
  assert.deepEqual(out.inserted, ['tracy-business/j6/1.2.5', 'tracy-business/j6/1.2.6'])
  assert.deepEqual(out.kept, out.inserted)
  assert.equal(out.dropped, 0)
  const sent = Buffer.from(out.bytes)
  // `entriesOf` checks both archives' CRCs: the rewrite reads back whole.
  assert.deepEqual(entriesOf(sent), entriesOf(pkg), 'the package keeps every entry')
  const before = entriesOf(pkg, COMPONENT)
  const after = entriesOf(sent, COMPONENT)
  assert.deepEqual(after.slice(0, before.length), before, 'the component keeps every entry, the index too')
  assert.deepEqual(after.slice(before.length).sort(), [
    'administrator/lib/contracts/tracy-business/j6/1.2.5/content-map.json',
    'administrator/lib/contracts/tracy-business/j6/1.2.5/manifest.json',
    'administrator/lib/contracts/tracy-business/j6/1.2.5/presentation-lock.json',
    'administrator/lib/contracts/tracy-business/j6/1.2.6/content-map.json',
    'administrator/lib/contracts/tracy-business/j6/1.2.6/manifest.json',
    'administrator/lib/contracts/tracy-business/j6/1.2.6/presentation-lock.json'
  ])
  const manifest = JSON.parse(
    memberOf(sent, COMPONENT, 'administrator/lib/contracts/tracy-business/j6/1.2.6/manifest.json')
  )
  assert.equal(manifest.id, 'tracy-business/j6/1.2.6')
})

test('a slim package with a contract put in unpacks under PHP ZipArchive, as Joomla installs it', async (t) => {
  let hasZip = false
  try {
    hasZip =
      execFileSync('php', ['-r', 'echo class_exists("ZipArchive") ? 1 : 0;'], { encoding: 'utf8' }) === '1'
  } catch {}
  if (!hasZip) return t.skip('php with ZipArchive is not on this machine')
  const { pkg, assets } = makeSlimPackage()
  const bytes = arrayBufferOf(pkg)
  const keep = new Set(['ja-resume/j6/1.0.6'])
  const out = slim.packageForImport(
    bytes,
    keep,
    await slim.fetchContractAssets(bytes, keep, fetcherOf(assets))
  )
  assert.deepEqual(out?.inserted, ['ja-resume/j6/1.0.6'])
  const dir = mkdtempSync(path.join(tmpdir(), 'slim-package-'))
  try {
    writeFileSync(path.join(dir, 'pkg.zip'), Buffer.from(out.bytes))
    const php = `
      $z = new ZipArchive(); if ($z->open($argv[1], ZipArchive::CHECKCONS) !== true) exit(2);
      if (!$z->extractTo($argv[2] . '/pkg')) exit(3);
      $c = new ZipArchive(); if ($c->open($argv[2] . '/pkg/packages/com_claudecowork.zip', ZipArchive::CHECKCONS) !== true) exit(4);
      if (!$c->extractTo($argv[2] . '/com')) exit(5);
      echo file_get_contents($argv[2] . '/com/administrator/lib/contracts/ja-resume/j6/1.0.6/manifest.json');`
    const manifest = JSON.parse(
      execFileSync('php', ['-r', php, path.join(dir, 'pkg.zip'), dir], { encoding: 'utf8' })
    )
    assert.equal(manifest.id, 'ja-resume/j6/1.0.6')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a slim release: an asset whose sha256 or length does not match the index is dropped', async () => {
  const { pkg, assets } = makeSlimPackage()
  const bytes = arrayBufferOf(pkg)
  const name = 'ja-resume--j6--1.0.6.zip'
  const flipped = Buffer.from(assets[name])
  flipped[flipped.length - 30] ^= 0xff
  const ids = ['ja-resume/j6/1.0.6', 'tracy-business/j6/1.2.6']
  const tampered = await slim.fetchContractAssets(bytes, ids, fetcherOf({ ...assets, [name]: flipped }))
  assert.deepEqual([...tampered.keys()], ['tracy-business/j6/1.2.6'], 'same length, wrong sha256')
  const longer = await slim.fetchContractAssets(
    bytes,
    ids,
    fetcherOf({ ...assets, [name]: Buffer.concat([assets[name], Buffer.alloc(1)]) })
  )
  assert.deepEqual([...longer.keys()], ['tracy-business/j6/1.2.6'], 'wrong length')
  const out = slim.packageForImport(bytes, new Set(ids), tampered)
  assert.deepEqual(out?.inserted, ['tracy-business/j6/1.2.6'], 'the dropped one is not put in')
  assert.ok(!entriesOf(Buffer.from(out.bytes), COMPONENT).some((n) => n.includes('contracts/ja-resume/')))
})

test('a slim release: an asset that cannot be fetched leaves the package as released', async () => {
  const { pkg } = makeSlimPackage()
  const bytes = arrayBufferOf(pkg)
  const ids = slim.indexedCandidates(bytes, new Set(['ja_resume']))
  assert.deepEqual(ids, ['ja-resume/j6/1.0.6'])
  const unreachable = async () => {
    throw new TypeError('fetch failed')
  }
  const fetched = await slim.fetchContractAssets(bytes, ids, unreachable)
  assert.equal(fetched.size, 0)
  assert.equal((await slim.fetchContractAssets(bytes, ids, async () => undefined)).size, 0, 'a 404')
  const keep = slim.pickContracts(slim.contractCandidates(bytes, new Set(['ja_resume']), fetched), new Map())
  assert.equal(slim.packageForImport(bytes, keep, fetched), undefined, 'nothing to change: sent as released')
  // A full release has no index: nothing is fetched for it.
  const full = arrayBufferOf(makePackage({ contractBytes: 1024 }))
  assert.equal(slim.contractIndex(full), undefined)
  assert.deepEqual(slim.indexedCandidates(full, new Set(['ja_resume'])), [])
})

test('a slim index id or asset name that is not plain is ignored; an asset with a path in an entry is dropped', async () => {
  const { pkg, assets } = makeSlimPackage({
    contracts: [
      { slug: 'ja-resume', version: '2.0.0' },
      { slug: 'tracy-business', version: '1.2.6' },
      // A `..` id would put the asset's files one folder up, outside any contract's folder.
      { slug: 'ja-resume', version: 'x', id: 'ja-resume/j6/..' },
      { slug: 'ja-resume', version: 'y', id: 'ja-resume/j6/.' },
      { slug: 'ja-resume', version: 'z', id: 'ja-resume/x6/1.0.0' },
      { slug: 'ja-resume', version: '3.0.0', asset: 'sub/ja-resume--j6--3.0.0.zip' },
      { slug: 'ja-resume', version: '3.0.1', asset: '..zip' },
      { slug: 'ja-resume', version: '4.0.0', extra: { '../x': 'escape' } },
      { slug: 'ja-resume', version: '4.0.1', extra: { 'nested/x.json': '{}' } }
    ]
  })
  const bytes = arrayBufferOf(pkg)
  assert.deepEqual(
    [...slim.contractIndex(bytes).keys()],
    ['ja-resume/j6/2.0.0', 'tracy-business/j6/1.2.6', 'ja-resume/j6/4.0.0', 'ja-resume/j6/4.0.1'],
    'a bad id or asset name is as if not listed'
  )
  const ids = slim.indexedCandidates(bytes, new Set(['ja_resume', 'tracy_business']))
  const fetched = await slim.fetchContractAssets(bytes, ids, fetcherOf(assets))
  assert.deepEqual([...fetched.keys()].sort(), ['ja-resume/j6/2.0.0', 'tracy-business/j6/1.2.6'])
  const keep = new Set([...ids, 'ja-resume/j6/..'])
  const out = slim.packageForImport(bytes, keep, fetched)
  assert.deepEqual(out?.inserted, ['ja-resume/j6/2.0.0', 'tracy-business/j6/1.2.6'], 'real ids still go in')
  const names = entriesOf(Buffer.from(out.bytes), COMPONENT)
  assert.ok(names.includes('administrator/lib/contracts/ja-resume/j6/2.0.0/manifest.json'))
  assert.ok(
    !names.some(
      (n) => n.split('/').includes('..') || n === 'administrator/lib/contracts/ja-resume/manifest.json'
    )
  )
  assert.equal(slim.safeContractId('tracy-business/j6/1.2.6'), true)
  for (const bad of ['ja-resume/j6/..', 'ja-resume//1.0', 'a/j6/1\\0', 'a/j6/1\u00000', '/j6/1', 'a/j6/1/x'])
    assert.equal(slim.safeContractId(bad), false, bad)
})
