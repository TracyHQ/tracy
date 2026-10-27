/**
 * Which content contract seals a site built from a quickstart — read from the contract profiles
 * themselves, not from a field somebody copied into a catalog.
 *
 * The state that matters most here is the one that is NOT an error: no contract at all. A site with
 * no contract is a site the Claude Cowork plugin accepts structural writes on, so "I could not find one" and
 * "this one installs as released" must never be the same answer by accident — the first is a
 * mistake, the second is what a template quickstart is (Lee, 15/09).
 *
 * No database, no network: the profiles are files this repository ships.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { contractFor, designOfRelease, mayName, readContracts } from '../src/lib/contracts.js'

/** A contract tree shaped like the one the seeder ships, written from literals. */
function treeWith(profiles) {
  const dir = mkdtempSync(path.join(tmpdir(), 'contracts-'))
  for (const [at, manifest] of Object.entries(profiles)) {
    mkdirSync(path.join(dir, at), { recursive: true })
    // `design` is not a manifest key: it travels in `<version>.design.json` beside the SEALED directory.
    const { design, tokens, ...sealed } = manifest
    writeFileSync(path.join(dir, at, 'manifest.json'), JSON.stringify(sealed))
    if (design !== undefined)
      writeFileSync(
        `${path.join(dir, at)}.design.json`,
        JSON.stringify({ schemaVersion: 'tracy-contract-design/v1', design, ...(tokens ? { tokens } : {}) })
      )
  }
  return dir
}

const WP7 = {
  schemaVersion: 'tracy-quickstart-contract/v1',
  id: 'tracy-base/wp7/1.0.0',
  platform: 'wordpress',
  quickstart: { release: 'tracy-base/wp7', version: '1.0.0' },
  coworkMinVersion: '0.8.0',
  mode: 'content-recommendation'
}

test('a quickstart is sealed by the profile that names it, with the floor that profile declares', () => {
  const dir = treeWith({ 'tracy-base/wp7/1.0.0': WP7 })
  assert.deepEqual(contractFor(readContracts(dir), 'tracy-base/wp7', '1.0.0'), {
    id: 'tracy-base/wp7/1.0.0',
    platform: 'wordpress',
    coworkMinVersion: '0.8.0',
    mode: 'content-recommendation',
    // No `.design.json` beside this profile: it wears no design system the index can name.
    design: null,
    // `dir` joined the shape in cad15abe4, for a reader that needs the files beside the manifest
    // (`content-map.json`). The commit did not update this expectation, so the test has been red
    // since; asserted here rather than dropped, because WHERE a profile sits is part of what
    // `contractFor` now promises.
    dir: path.join(dir, 'tracy-base/wp7/1.0.0')
  })
})

test('a release with no profile is installed as released — null, not an error', () => {
  const dir = treeWith({ 'tracy-base/wp7/1.0.0': WP7 })
  // Tracy Business is exactly this case: a finished site the customer pressed on the gallery.
  assert.equal(contractFor(readContracts(dir), 'tracy-business/emdash-0.x', '1.0.0'), null)
  // A version in ANOTHER MAJOR is not a neighbour: still null.
  assert.equal(contractFor(readContracts(dir), 'tracy-base/wp7', '2.0.0'), null)
})

test('a UI patch release falls back to the nearest LOWER profile of the same release and major', () => {
  const at = (v) => ({
    ...WP7,
    id: `tracy-base/wp7/${v}`,
    quickstart: { release: 'tracy-base/wp7', version: v }
  })
  const dir = treeWith({
    'tracy-base/wp7/1.0.0': at('1.0.0'),
    'tracy-base/wp7/1.2.0': at('1.2.0'),
    'tracy-base/wp7/1.10.0': at('1.10.0'),
    'tracy-base/wp7/2.0.0': at('2.0.0'),
    'tracy-base/wp7/0.9.0': at('0.9.0'),
    'other/wp7/1.0.5': {
      ...at('1.0.5'),
      id: 'other/wp7/1.0.5',
      quickstart: { release: 'other/wp7', version: '1.0.5' }
    }
  })
  const index = readContracts(dir)
  const hit = contractFor(index, 'tracy-base/wp7', '1.0.3')
  assert.equal(hit.id, 'tracy-base/wp7/1.0.0')
  assert.equal(hit.fallbackFrom, '1.0.3')
  assert.equal(hit.dir, path.join(dir, 'tracy-base/wp7/1.0.0'))
  // Highest lower, compared as numbers (1.10.0 > 1.2.0), never a higher one.
  assert.equal(contractFor(index, 'tracy-base/wp7', '1.5.0').id, 'tracy-base/wp7/1.2.0')
  assert.equal(contractFor(index, 'tracy-base/wp7', '1.11.0').id, 'tracy-base/wp7/1.10.0')
  // Exact still wins and carries no marker.
  const exact = contractFor(index, 'tracy-base/wp7', '1.2.0')
  assert.equal(exact.id, 'tracy-base/wp7/1.2.0')
  assert.equal('fallbackFrom' in exact, false)
  // Nothing lower in the same major: null (1.0.0 is the floor; 0.9.0 and 2.0.0 are other majors).
  assert.equal(contractFor(index, 'tracy-base/wp7', '0.8.0'), null)
  assert.equal(contractFor(index, 'tracy-base/wp7', '3.0.1'), null)
  assert.equal(contractFor(index, 'tracy-base/wp7', '2.0.0').fallbackFrom, undefined)
  // Another release is never borrowed, and a non-semver version answers null.
  assert.equal(contractFor(index, 'tracy-base/j6', '1.0.3'), null)
  for (const v of ['1.0', '1.0.3-rc.1', 'latest', '', '1.0.3+b1'])
    assert.equal(contractFor(index, 'tracy-base/wp7', v), null, v)
  // The fallback never mutates the shared index entry.
  assert.equal('fallbackFrom' in index.get('tracy-base/wp7@1.0.0'), false)
})

test('a release served by a fallback profile may be named, bound to the PROFILE id', () => {
  const dir = treeWith({ 'tracy-base/wp7/1.0.0': WP7 })
  const contract = contractFor(readContracts(dir), 'tracy-base/wp7', '1.0.3')
  assert.equal(mayName(row({ setting: { version: '1.0.3' } }), contract), true)
  assert.equal(contract.id, 'tracy-base/wp7/1.0.0')
})

test('the release a profile names wins over the directory it sits in', () => {
  // Airbnb is why: its profiles are `tracy-airbnb/j6/*`, a design installed on the Apple base, and
  // no such quickstart is published. A reader that trusted the path would invent one.
  const dir = treeWith({
    'somewhere/else/1.0.0': { ...WP7, id: 'tracy-base/wp7/1.0.0' }
  })
  assert.equal(contractFor(readContracts(dir), 'tracy-base/wp7', '1.0.0').id, 'tracy-base/wp7/1.0.0')
})

test('a profile that does not say which quickstart it seals is refused, loudly', () => {
  const dir = treeWith({
    'tracy-base/wp7/1.0.0': { ...WP7, quickstart: { version: '1.0.0' } }
  })
  assert.throws(() => readContracts(dir), /names no quickstart/)
})

test('two profiles claiming one quickstart and version is refused, loudly', () => {
  const dir = treeWith({
    'tracy-base/wp7/1.0.0': WP7,
    'copy/of/wp7': { ...WP7, id: 'copy/of/wp7' }
  })
  assert.throws(() => readContracts(dir), /claimed twice/)
})

test('an empty tree reads as no contracts, and is not mistaken for a missing one', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'contracts-'))
  const empty = readContracts(dir)
  assert.equal(contractFor(empty, 'tracy-base/wp7', '1.0.0'), null)
  rmSync(dir, { recursive: true, force: true })
})

// ── The profiles this repository actually ships ────────────────────────────────────────────────
//
// The expected values come from the catalog `provision/quickstarts.json`, which is what the fleet
// has been gating on all along — so this pins the new reader against the old hand-copied answer
// rather than against itself. When the catalog's `contract` field goes, this test is the record of
// what it used to say.

test('the shipped profiles seal exactly the quickstarts the catalog bound by hand', () => {
  const index = readContracts()
  assert.equal(contractFor(index, 'tracy-base/wp7', '1.0.0')?.id, 'tracy-base/wp7/1.0.0')
  assert.equal(contractFor(index, 'tracy-base/wp7', '1.0.0')?.coworkMinVersion, '0.8.0')
  assert.equal(contractFor(index, 'tracy-base/j6', '1.0.0')?.id, 'tracy-base/j6/1.0.0')
  assert.equal(contractFor(index, 'tracy-apple/j6', '1.2.0')?.id, 'tracy-apple/j6/1.2.0')
  // Tracy Business is sealed since 21/09: the Build's `check` stage needs a bound contract, and
  // an unbound site was inspected against tracy-apple's lock. Both editions name the real tag
  // (`tracy-business/j6`, no `quickstart/` prefix — that prefix is the JA releases' own).
  assert.equal(contractFor(index, 'tracy-business/j6', '1.0.0')?.id, 'tracy-business/j6/1.0.0')
  assert.equal(contractFor(index, 'tracy-business/j6', '1.1.0')?.id, 'tracy-business/j6/1.1.0')
  assert.equal(contractFor(index, 'tracy-business/j6', '1.1.0')?.coworkMinVersion, '0.15.0')
  // EmDash Business stays a finished site installed as released: `contract: null`.
  assert.equal(contractFor(index, 'tracy-business/emdash-0.x', '1.0.0'), null)
})

// ── May a caller name this quickstart? ─────────────────────────────────────────────────────────
//
// The pure half of the create door's guard. What it protects: a site provisioned with no contract
// is a site the Claude Cowork plugin accepts STRUCTURAL writes on, so "sealed by a contract" and "a finished
// template installed as released" are the only two ways in — anything else is a 400.

const row = (over = {}) => ({
  tag: 'tracy-base/wp7',
  choosable: true,
  setting: { platform: 'wordpress', version: '1.0.0', ...over.setting },
  ...over
})

test('a quickstart sealed by a contract may be named', () => {
  const index = readContracts()
  assert.equal(mayName(row(), contractFor(index, 'tracy-base/wp7', '1.0.0')), true)
})

test('a quickstart nothing seals may NOT be named — that is the unsealed state', () => {
  assert.equal(mayName(row({ tag: 'tracy-base/j6' }), null), false)
})

test('a template card is named on its own ground: installed as released, sealed by nothing', () => {
  const template = row({
    tag: 'tracy-business/emdash-0.x',
    setting: { card: { template: 'tracy-business' } }
  })
  assert.equal(mayName(template, null), true)
})

test('a release Tracy cannot choose is never named, contract or not', () => {
  // Draft, or a setting Tracy could not read: `choosable` already folds the three-part rule.
  assert.equal(mayName(row({ choosable: false }), { id: 'tracy-base/wp7/1.0.0' }), false)
})

// ── The minimum Claude Cowork plugin version a profile names ────────────────────────────────────────────────────────
//
// 🔒 THE FIELD HAS TWO NAMES, AND READING ONE OF THEM WAS A SILENT NULL FOR EVERY JOOMLA PROFILE.
// The WordPress profile writes `coworkMinVersion`; all eight Joomla profiles write `coworkContractVersion`.
// Nothing downstream asked for the value, so the null never showed up here — it showed up two steps
// away, as a sealed card provisioned with a Claude Cowork plugin too old to bind, dying at `content.contract`
// after the site was already standing. These four tests are the only place that mismatch is cheap
// to catch.

test('a profile naming coworkContractVersion answers with it — the eight Joomla profiles do', () => {
  const dir = treeWith({
    'tracy-base/j6/1.0.0': {
      id: 'tracy-base/j6/1.0.0',
      platform: 'joomla',
      quickstart: { release: 'tracy-base/j6', version: '1.0.0' },
      coworkContractVersion: '0.15.0'
    }
  })
  try {
    assert.equal(contractFor(readContracts(dir), 'tracy-base/j6', '1.0.0').coworkMinVersion, '0.15.0')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a profile naming coworkMinVersion still answers with it — the WordPress profile does', () => {
  const dir = treeWith({
    'tracy-base/wp7/1.0.0': {
      id: 'tracy-base/wp7/1.0.0',
      platform: 'wordpress',
      quickstart: { release: 'tracy-base/wp7', version: '1.0.0' },
      coworkMinVersion: '0.8.0'
    }
  })
  try {
    assert.equal(contractFor(readContracts(dir), 'tracy-base/wp7', '1.0.0').coworkMinVersion, '0.8.0')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a profile naming neither answers null, which is an answer and not a floor of zero', () => {
  const dir = treeWith({
    'x/j6/1.0.0': { id: 'x/j6/1.0.0', platform: 'joomla', quickstart: { release: 'x/j6', version: '1.0.0' } }
  })
  try {
    assert.equal(contractFor(readContracts(dir), 'x/j6', '1.0.0').coworkMinVersion, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('every Joomla profile this repo ships names a floor the bind can actually use', () => {
  // The regression in one line: each profile must answer a version, and 0.14.0 is where the
  // Claude Cowork plugin grew `content.contract`. A profile below it cannot be bound by any release.
  const index = readContracts()
  const joomla = [...index.values()].filter((contract) => contract.platform === 'joomla')
  assert.ok(joomla.length >= 8, `expected the shipped Joomla profiles, found ${String(joomla.length)}`)
  for (const contract of joomla) {
    assert.match(
      contract.coworkMinVersion ?? '',
      /^\d+\.\d+\.\d+$/,
      `${contract.id} names no minimum Claude Cowork plugin version`
    )
    const [major, minor] = contract.coworkMinVersion.split('.').map(Number)
    assert.ok(
      major > 0 || minor >= 14,
      `${contract.id} floors at ${contract.coworkMinVersion}, below content.contract`
    )
  }
})

import { coworkPinFor } from '../src/lib/contracts.js'

test('coworkPinFor: the Claude Cowork plugin a sealed release pins comes from this repository, at that version only', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pins-'))
  try {
    const file = path.join(dir, 'quickstarts.json')
    const pin = {
      file: 'claude-cowork-0.12.1.zip',
      version: '0.12.1',
      bytes: 135379,
      sha256: 'd'.repeat(64),
      url: 'https://example.test/claude-cowork-0.12.1.zip',
      githubAssetId: 586899907,
      contractFiles: { 'manifest.json': 'a'.repeat(64) }
    }
    writeFileSync(
      file,
      JSON.stringify({
        'tracy-business/wp7': { platform: 'wordpress', version: '1.1.0', cowork: pin },
        'tracy-base/wp7': { platform: 'wordpress', version: '1.0.0' }
      })
    )
    assert.deepEqual(coworkPinFor('tracy-business/wp7', '1.1.0', file), {
      file: pin.file,
      sha256: pin.sha256,
      bytes: pin.bytes,
      githubAssetId: pin.githubAssetId,
      url: pin.url,
      version: '0.12.1'
    })
    // Another version of the same release is another archive: the pin does not carry over,
    // unless the zip says it carries that version's profile too.
    assert.equal(coworkPinFor('tracy-business/wp7', '1.2.0', file), null)
    writeFileSync(
      file,
      JSON.stringify({
        'tracy-business/wp7': {
          platform: 'wordpress',
          version: '1.1.0',
          cowork: { ...pin, contractVersions: ['1.1.0', '1.2.0'] }
        }
      })
    )
    assert.equal(coworkPinFor('tracy-business/wp7', '1.2.0', file)?.file, pin.file)
    assert.equal(coworkPinFor('tracy-business/wp7', '1.3.0', file), null)
    assert.equal(
      coworkPinFor('tracy-base/wp7', '1.0.0', file),
      null,
      'an entry with no Claude Cowork plugin pins none'
    )
    assert.equal(coworkPinFor('nope', '1.0.0', file), null)
    // A half-written pin (no asset id) is no pin: provision would refuse it before any download anyway.
    writeFileSync(
      file,
      JSON.stringify({
        'tracy-business/wp7': {
          platform: 'wordpress',
          version: '1.1.0',
          cowork: { file: 'x.zip', sha256: 'd'.repeat(64) }
        }
      })
    )
    assert.equal(coworkPinFor('tracy-business/wp7', '1.1.0', file), null)
    assert.equal(coworkPinFor('tracy-business/wp7', '1.1.0', path.join(dir, 'missing.json')), null)
    // A public pin carries no asset id and a public https address instead — the Claude Cowork plugin's own
    // release, fetched with no credential. It is a whole pin, and it comes back without an id.
    const { githubAssetId: _, ...publicPin } = pin
    const withCowork = (cowork) =>
      writeFileSync(
        file,
        JSON.stringify({ 'tracy-base/j6': { platform: 'joomla', version: '1.0.0', cowork } })
      )
    withCowork(publicPin)
    assert.deepEqual(coworkPinFor('tracy-base/j6', '1.0.0', file), {
      file: pin.file,
      sha256: pin.sha256,
      bytes: pin.bytes,
      url: pin.url,
      version: '0.12.1'
    })
    // Without an id the address is the whole road, so one a host cannot fetch as-is is no pin.
    for (const url of [
      undefined,
      '',
      'http://example.test/x.zip',
      'https://u:p@example.test/x.zip',
      'file:///x.zip',
      'not a url'
    ]) {
      withCowork({ ...publicPin, url })
      assert.equal(coworkPinFor('tracy-base/j6', '1.0.0', file), null, String(url))
    }
    // An id that is present must be a real one; a bad id does not fall back to the address.
    for (const githubAssetId of [0, -1, 1.5, '594659367']) {
      withCowork({ ...pin, githubAssetId })
      assert.equal(coworkPinFor('tracy-base/j6', '1.0.0', file), null, String(githubAssetId))
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  // The real copy the image carries pins tracy-business/wp7 1.1.0 to a Claude Cowork plugin. A develop pin may
  // be a release candidate (`-rc.N`, a GitHub prerelease not announced to installed sites). Either road
  // to the zip is a real pin: an asset on the private ja-products release, or the plugin's own public
  // release (since 0.14.5, 29/09/2026 — the road tracy-base/j6 and ja-kinetic already take).
  const real = coworkPinFor('tracy-business/wp7', '1.1.0')
  assert.ok(
    real &&
      /^0\.1[2-9]\.\d+(-rc\.\d+)?$/.test(real.version ?? '') &&
      (real.githubAssetId > 0 ||
        /^https:\/\/github\.com\/TracyHQ\/claude-cowork\/releases\/download\/wordpress-v[0-9.]+(-rc\.\d+)?\/claude-cowork-[0-9.]+(-rc\.\d+)?\.zip$/.test(
          real.url
        )),
    JSON.stringify(real)
  )
  // …and pins every sealed Joomla release, the public ones (no asset id) included.
  for (const [tag, version] of [
    ['tracy-business/j6', '1.2.0'],
    ['tracy-apple/j6', '1.3.0'],
    ['quickstart/ja-voyara/j6', '1.0.2'],
    ['tracy-base/j6', '1.0.0'],
    ['quickstart/ja-kinetic/j6', '1.0.0']
  ]) {
    const joomla = coworkPinFor(tag, version)
    assert.ok(joomla && joomla.file.startsWith('pkg_claudecowork-') && joomla.url.startsWith('https://'), tag)
  }
})

test('designOfRelease: the design a released quickstart wears, from the profile sealing THAT version', () => {
  const dir = treeWith({
    'tracy-apple/j6/1.3.0': {
      ...WP7,
      id: 'tracy-apple/j6/1.3.0',
      platform: 'joomla',
      quickstart: { release: 'tracy-apple/j6', version: '1.3.0' },
      design: { id: 'apple', source: 'catalog' }
    }
  })
  const index = readContracts(dir)
  const readable = [
    { tag: 'tracy-apple/j6', platform: 'joomla', setting: { version: '1.3.0' } },
    { tag: 'ja-vega/j6', platform: 'joomla', setting: { version: '1.0.0' } }
  ]
  assert.deepEqual(designOfRelease(index, readable, 'tracy-apple/j6'), { id: 'apple', source: 'catalog' })
  // A release with no profile, a tag nobody read, and no tag at all: none, never a guess.
  assert.equal(designOfRelease(index, readable, 'ja-vega/j6'), null)
  assert.equal(designOfRelease(index, readable, 'tracy-stripe/j6'), null)
  assert.equal(designOfRelease(index, readable, null), null)
})

test('a profile that names the design system it wears carries it into the index; one that names none answers null', () => {
  const dir = treeWith({
    'tracy-apple/j6/1.3.0': {
      ...WP7,
      id: 'tracy-apple/j6/1.3.0',
      platform: 'joomla',
      quickstart: { release: 'tracy-apple/j6', version: '1.3.0' },
      design: { id: 'apple', source: 'catalog' }
    },
    'tracy-base/wp7/1.0.0': { ...WP7, design: null }
  })
  const index = readContracts(dir)
  assert.deepEqual(contractFor(index, 'tracy-apple/j6', '1.3.0').design, { id: 'apple', source: 'catalog' })
  assert.equal(contractFor(index, 'tracy-base/wp7', '1.0.0').design, null)
})

test('a design of another shape is read as none — the reader never invents a binding; the gate says it is wrong', () => {
  const dir = treeWith({
    'a/wp7/1.0.0': {
      ...WP7,
      id: 'a/wp7/1.0.0',
      quickstart: { release: 'a/wp7', version: '1.0.0' },
      design: 'apple'
    },
    'b/wp7/1.0.0': {
      ...WP7,
      id: 'b/wp7/1.0.0',
      quickstart: { release: 'b/wp7', version: '1.0.0' },
      design: { id: 'apple' }
    },
    'c/wp7/1.0.0': {
      ...WP7,
      id: 'c/wp7/1.0.0',
      quickstart: { release: 'c/wp7', version: '1.0.0' },
      design: { id: 'Apple Inc', source: 'catalog' }
    }
  })
  const index = readContracts(dir)
  assert.equal(contractFor(index, 'a/wp7', '1.0.0').design, null)
  assert.equal(contractFor(index, 'b/wp7', '1.0.0').design, null)
  assert.equal(contractFor(index, 'c/wp7', '1.0.0').design, null)
})

test('a quickstart wearing its own look carries its name and resolved tokens; half a quickstart design is none', () => {
  const tokens = { '--bg': '#F5F3EE', '--accent': '#14483A' }
  const base = {
    ...WP7,
    id: 'tracy-business/wp7/1.2.0',
    quickstart: { release: 'tracy-business/wp7', version: '1.2.0' }
  }
  const design = {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    tokensFrom: 'overlay/tokens.css'
  }
  const dir = treeWith({
    'tracy-business/wp7/1.2.0': { ...base, design, tokens },
    'x/wp7/1.0.0': { ...base, id: 'x/wp7/1.0.0', quickstart: { release: 'x/wp7', version: '1.0.0' }, design }
  })
  const index = readContracts(dir)
  assert.deepEqual(contractFor(index, 'tracy-business/wp7', '1.2.0').design, {
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    tokensFrom: 'overlay/tokens.css',
    tokens
  })
  // No tokens beside it: the reader never hands a site a quickstart look with nothing to measure.
  assert.equal(contractFor(index, 'x/wp7', '1.0.0').design, null)
})
