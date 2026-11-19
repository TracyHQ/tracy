/**
 * An AI quickstart has its own release (`ai-quickstart/<slug>/<cms>`, ADR 0045): its installer is the blank site and
 * it is sealed by the blank site contract, which no Claude Cowork plugin release carries, so the install information
 * carries the profile's files. The human quickstart's release is untouched: it still installs the demo, sealed by its
 * own released contract, and nothing is claimed twice.
 *
 * No database, no network: the profiles are files (the shipped ones, and invented trees written here).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { aiQuickstartToInstall } from '../src/build-draft-build-wiring.js'
import { carriedProfileOf, contractFor, readContracts, releaseOfContract } from '../src/lib/contracts.js'
import { readLocalPacks } from '../src/lib/local-releases.js'

const sha = (text) => createHash('sha256').update(text).digest('hex')

/** A folder holding `<at>/manifest.json` for each profile given. */
function tree(profiles, leaf = '') {
  const dir = mkdtempSync(path.join(tmpdir(), 'blank-release-'))
  for (const [at, manifest] of Object.entries(profiles)) {
    mkdirSync(path.join(dir, at, leaf), { recursive: true })
    writeFileSync(path.join(dir, at, leaf, 'manifest.json'), JSON.stringify(manifest))
  }
  return dir
}

const RELEASED = {
  id: 'example-ring/j6/2.0.1',
  platform: 'joomla',
  quickstart: { release: 'quickstart/example-ring/j6', version: '2.0.1' },
  coworkContractVersion: '0.24.0'
}
const BLANK = {
  id: 'example-ring-blank/j6/2.0.1',
  platform: 'joomla',
  quickstart: { release: 'ai-quickstart/example-ring/j6', version: '2.0.1' },
  coworkContractVersion: '0.24.0',
  blankSiteOf: { contract: 'example-ring/j6/2.0.1' }
}

test('a blank site contract seals its AI quickstart release; the human release keeps its own contract', () => {
  const released = tree({ 'example-ring/j6/2.0.1': RELEASED })
  const kits = tree({ 'example-ring/j6/2.0.1': BLANK }, 'blank-site-contract')
  const index = readContracts([released], { blankRoots: [kits] })
  const demo = contractFor(index, 'quickstart/example-ring/j6', '2.0.1')
  assert.equal(demo?.id, 'example-ring/j6/2.0.1')
  assert.equal(demo?.carried, undefined)
  const blank = contractFor(index, 'ai-quickstart/example-ring/j6', '2.0.1')
  assert.equal(blank?.id, 'example-ring-blank/j6/2.0.1')
  assert.equal(blank?.carried, true)
  assert.equal(blank?.madeFrom, 'example-ring/j6/2.0.1')
  // A stand's local pack of the AI release is sealed as the release it stands for.
  assert.equal(
    contractFor(index, 'local/ai-quickstart/example-ring/j6', '2.0.1')?.id,
    'example-ring-blank/j6/2.0.1'
  )
  // The release the blank site was made from, whose Claude Cowork plugin pin the blank site is installed with.
  assert.equal(releaseOfContract(index, blank?.madeFrom), 'quickstart/example-ring/j6')
})

test('a blank site contract that still names the human release is refused as a second claim, loudly', () => {
  const released = tree({ 'example-ring/j6/2.0.1': RELEASED })
  const kits = tree(
    { 'example-ring/j6/2.0.1': { ...BLANK, quickstart: RELEASED.quickstart } },
    'blank-site-contract'
  )
  assert.throws(() => readContracts([released], { blankRoots: [kits] }), /claimed twice/)
})

test('a caller naming its own folders reads no blank site contracts unless it names kits too', () => {
  const released = tree({ 'example-ring/j6/2.0.1': RELEASED })
  assert.equal(contractFor(readContracts(released), 'ai-quickstart/example-ring/j6', '2.0.1'), null)
})

test('the shipped profiles: JA Boxing demo and JA Boxing AI quickstart each resolve their own contract', () => {
  const index = readContracts()
  const demo = contractFor(index, 'quickstart/ja-boxing/j6', '1.0.11')
  assert.equal(demo?.id, 'ja-boxing/j6/1.0.11')
  assert.equal(demo?.carried, undefined)
  assert.equal(carriedProfileOf(demo), null)
  const blank = contractFor(index, 'ai-quickstart/ja-boxing/j6', '1.0.11')
  assert.equal(blank?.id, 'ja-boxing-blank/j6/1.0.11')
  assert.equal(releaseOfContract(index, blank?.madeFrom), 'quickstart/ja-boxing/j6')
  // Every shipped blank site contract seals an AI quickstart release, never a human one.
  for (const [key, contract] of index)
    if (contract.carried) assert.match(key, /^ai-quickstart\/[a-z0-9-]+\/[a-z0-9]+@/, contract.id)
})

test('the carried profile is every .json of the profile folder, each with its size and sha256', () => {
  const kits = tree({ 'example-ring/j6/2.0.1': BLANK }, 'blank-site-contract')
  const at = path.join(kits, 'example-ring/j6/2.0.1/blank-site-contract')
  writeFileSync(path.join(at, 'content-map.json'), '{"entities":[]}\n')
  writeFileSync(path.join(at, 'notes.txt'), 'not part of a profile')
  const blank = contractFor(
    readContracts([], { blankRoots: [kits] }),
    'ai-quickstart/example-ring/j6',
    '2.0.1'
  )
  const carried = carriedProfileOf(blank)
  assert.equal(carried?.id, 'example-ring-blank/j6/2.0.1')
  assert.deepEqual(Object.keys(carried?.files ?? {}), ['content-map.json', 'manifest.json'])
  const manifest = readFileSync(path.join(at, 'manifest.json'), 'utf8')
  assert.deepEqual(carried?.files['manifest.json'], {
    text: manifest,
    bytes: Buffer.byteLength(manifest),
    sha256: sha(manifest)
  })
})

/** A local pack at `<dir>/<at>` with a card, as a stand lays one out. */
function writePack(dir, at, label) {
  const to = path.join(dir, at)
  mkdirSync(to, { recursive: true })
  writeFileSync(path.join(to, 'site.zip'), `${label} archive`)
  writeFileSync(
    path.join(to, 'tracy_setting.json'),
    JSON.stringify({
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label,
      version: '2.0.1',
      cms: '6.1.1',
      install: { installer: { file: 'site.zip', sha256: sha(`${label} archive`) } },
      template: 'example_ring'
    })
  )
  writeFileSync(
    path.join(to, 'tracy_design_inspiration.json'),
    JSON.stringify({
      schemaVersion: 'tracy-design-inspiration/v1',
      template: 'example-ring',
      provider: 'JoomlArt',
      category: 'Professional & Corporate',
      blurb: `${label}.`,
      image: 'home-1440.png',
      layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'home-1440.png' } }]
    })
  )
  writeFileSync(path.join(to, 'home-1440.png'), 'png bytes')
}

test('an AI quickstart local pack is read under its own release name, with no card even when it ships one', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'blank-packs-'))
  writePack(dir, 'quickstart/example-ring/j6', 'Example Ring')
  writePack(dir, 'ai-quickstart/example-ring/j6', 'Example Ring blank')
  const packs = await readLocalPacks(dir)
  const byTag = Object.fromEntries(packs.map((p) => [p.release.tag_name, p]))
  assert.deepEqual(Object.keys(byTag).sort(), [
    'local/ai-quickstart/example-ring/j6',
    'local/quickstart/example-ring/j6'
  ])
  assert.ok(byTag['local/quickstart/example-ring/j6'].inspiration, 'the human pack keeps its card')
  assert.equal(byTag['local/ai-quickstart/example-ring/j6'].inspiration, null)
  assert.equal(byTag['local/ai-quickstart/example-ring/j6'].setting?.install?.installer?.file, 'site.zip')
})

test('a build installs the AI quickstart release: published first, else the stand pack, never the demo', () => {
  const site = { platform: 'joomla', quickstart: 'ai-quickstart/example-ring/j6' }
  const demo = { tag: 'quickstart/example-ring/j6', platform: 'joomla' }
  assert.deepEqual(
    aiQuickstartToInstall(site, [demo, { tag: 'ai-quickstart/example-ring/j6', platform: 'joomla' }]),
    { quickstart: 'ai-quickstart/example-ring/j6', published: true }
  )
  assert.deepEqual(
    aiQuickstartToInstall(site, [demo, { tag: 'local/ai-quickstart/example-ring/j6', platform: 'joomla' }]),
    { quickstart: 'local/ai-quickstart/example-ring/j6', published: false }
  )
  // Only the demo here: the build stops, it never installs the demo in its place.
  assert.deepEqual(aiQuickstartToInstall(site, [demo]), {
    refusal: { code: 'AI_QUICKSTART_RELEASE_MISSING', status: 409 }
  })
  // A release of another CMS is not this one.
  assert.deepEqual(
    aiQuickstartToInstall(site, [{ tag: 'ai-quickstart/example-ring/j6', platform: 'wordpress' }]),
    {
      refusal: { code: 'AI_QUICKSTART_RELEASE_MISSING', status: 409 }
    }
  )
  // A kit naming the human release (the demo), or a local tag, is a fault of the kit.
  for (const quickstart of ['quickstart/example-ring/j6', 'local/ai-quickstart/example-ring/j6'])
    assert.deepEqual(aiQuickstartToInstall({ platform: 'joomla', quickstart }, [demo]), {
      refusal: { code: 'SITE_SOURCE_NOT_AI_QUICKSTART', status: 409 }
    })
  assert.deepEqual(aiQuickstartToInstall(null, [demo]), {
    refusal: { code: 'SITE_SOURCE_MISSING', status: 409 }
  })
})
