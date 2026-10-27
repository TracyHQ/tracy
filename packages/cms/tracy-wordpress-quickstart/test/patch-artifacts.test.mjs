import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { BRAND_FACTS_SCHEMA } from '../../../design/tracy-ds-slot/src/brand-facts.mjs'
import {
  classifyListing,
  inheritedMeasurement,
  manifestFor,
  measureCommands,
  rowFor,
  run,
  sumsOf,
  themeFilesDiff,
  themeVersionOf,
  withMaxVersion,
  withRow
} from '../scripts/patch-artifacts.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../../..')
const contract = (/** @type {string} */ id, /** @type {string} */ f) =>
  JSON.parse(readFileSync(path.join(HERE, '../contracts', id, f), 'utf8'))

test('the manifest of the patch is the previous one moved to the release: id, version, parts', () => {
  const previous = contract('ja-restaurant/wp7/1.0.0', 'manifest.json')
  const committed = contract('ja-restaurant/wp7/1.0.1', 'manifest.json')
  const parts = {
    webroot: { ...committed.quickstart.parts.webroot },
    database: { ...committed.quickstart.parts.database }
  }
  const out = manifestFor(
    previous,
    { version: '1.0.1', wpVersion: '7.1.3', phpVersion: '8.3.35', prefix: 'tr_' },
    parts
  )
  // the bytes the hand recipe produced for JA Restaurant 1.0.1 (#1590s), key order included
  assert.equal(JSON.stringify(out, null, 2), JSON.stringify(committed, null, 2))
  assert.equal(previous.id, 'ja-restaurant/wp7/1.0.0', 'the previous manifest is not touched')
})

test('SHA256SUMS lines, with or without the binary star', () => {
  const a = 'a'.repeat(64)
  const b = 'b'.repeat(64)
  assert.deepEqual(sumsOf(`${a}  x.tar.gz\n${b} *y.zip\nnot a line\n`), { 'x.tar.gz': a, 'y.zip': b })
})

test('the webroot diff names the theme files that moved and classifies the rest by area', () => {
  assert.deepEqual(
    themeFilesDiff({ files: { a: '1', b: '2', c: '3' } }, { files: { a: '1', b: '9', d: '4' } }),
    { added: ['d'], removed: ['c'], changed: ['b'] }
  )
  const out = classifyListing(
    { 'wp-content/themes/t/style.css': 10, 'wp-includes/x.php': 5, 'wp-content/uploads/a.jpg': 1 },
    { 'wp-content/themes/t/style.css': 11, 'wp-includes/x.php': 5, 'wp-content/plugins/p/p.php': 2 },
    't'
  )
  assert.deepEqual(out, {
    theme: { added: [], removed: [], resized: ['wp-content/themes/t/style.css'] },
    plugins: { added: ['wp-content/plugins/p/p.php'], removed: [], resized: [] },
    uploads: { added: [], removed: ['wp-content/uploads/a.jpg'], resized: [] }
  })
})

const facts = (/** @type {string} */ version, /** @type {any} */ over = {}) => ({
  schemaVersion: BRAND_FACTS_SCHEMA,
  version,
  facts: {
    spots: [{ where: 'header x', option: 'site_logo' }],
    logos: 'single',
    brandReady: true,
    darkLogo: false,
    nameFallback: true,
    faviconReady: true,
    favicons: 2,
    frame: { width: 100, height: 50 },
    heightHeld: false,
    ...over
  }
})

const MAP = {
  slots: [
    { key: 'footer.logo', type: 'image', sample: 'a.png' },
    { key: 'hero.title', type: 'text' }
  ]
}
const CARRY = { from: '1.0.0', themeSame: false, contentMapBefore: MAP, contentMapAfter: MAP }

test('a row is carried only on equal measured brand facts, and its note says from where and why', () => {
  const row = {
    logos: 'single',
    brandReady: true,
    faviconReady: true,
    frame: { width: 100, height: 50 },
    note: 'hand words'
  }
  const ok = rowFor(row, facts('1.0.0'), facts('1.0.1'), 'x/wp7/1.0.1', CARRY)
  assert.deepEqual(ok.problems, [])
  assert.equal(ok.row.logos, 'single')
  assert.match(
    ok.row.note,
    /^Carried from 1\.0\.0 by patch-artifacts\.mjs: the brand facts measured on both releases are equal/
  )
  assert.match(ok.row.note, /contracts\/x\/wp7\/1\.0\.1\/patch-evidence\.json/)
  // a logo spot that moved: no row, the difference said
  const moved = rowFor(
    row,
    facts('1.0.0'),
    facts('1.0.1', { frame: { width: 100, height: 64 } }),
    'x/wp7/1.0.1',
    CARRY
  )
  assert.equal(moved.row, null)
  assert.match(moved.problems[0], /^frame: 1\.0\.0/)
  // never measured: no row, never a guess
  assert.match(
    rowFor(row, null, facts('1.0.1'), 'x/wp7/1.0.1', CARRY).problems[0],
    /previous version has no brand-facts\.json/
  )
  assert.match(rowFor(null, facts('1.0.0'), facts('1.0.1'), 'x/wp7/1.0.1', CARRY).problems[0], /no row/)
})

test('a field the brand facts do not measure is carried only on its own proof, else named', () => {
  const base = { logos: 'single', brandReady: true, faviconReady: true, note: 'x' }
  const carried = (/** @type {any} */ row, /** @type {any} */ carry) =>
    rowFor(row, facts('1.0.0'), facts('1.0.1'), 'x/wp7/1.0.1', { ...CARRY, ...carry })
  // footerSlot: the same slot entry in both content maps → carried
  assert.deepEqual(carried({ ...base, footerSlot: 'footer.logo' }, {}).problems, [])
  // the slot's entry changed (a content change accepted with --accept-content-change), or it is gone → stop
  const changed = { slots: [{ key: 'footer.logo', type: 'image', sample: 'b.png' }] }
  assert.match(
    carried({ ...base, footerSlot: 'footer.logo' }, { contentMapAfter: changed }).problems[0],
    /^footerSlot: /
  )
  assert.match(
    carried({ ...base, footerSlot: 'footer.logo' }, { contentMapAfter: { slots: [] } }).problems[0],
    /^footerSlot: /
  )
  // framework, profiles, darkSpots: only on the same theme bytes
  assert.deepEqual(
    carried({ ...base, framework: 't4', profiles: ['default'] }, { themeSame: true }).problems,
    []
  )
  const theme = carried({ ...base, framework: 't4', darkSpots: [] }, { themeSame: false }).problems
  assert.equal(theme.length, 2)
  assert.match(theme[0], /^framework: the theme is not the same bytes/)
  assert.match(theme[1], /^darkSpots: /)
  // unverified is never carried silently; a field nobody taught it is never carried at all
  assert.match(
    carried({ ...base, unverified: ['faviconReady'] }, { themeSame: true }).problems[0],
    /^unverified: /
  )
  assert.match(carried({ ...base, placement: 'x' }, {}).problems[0], /^placement: not a field/)
})

test('every way out of the command removes its scratch tree, a failed --check included', async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'wp-patch-artifacts-test-'))
  const b = {
    id: 'x/wp7/1.0.1',
    tag: 'quickstart/x/wp7',
    version: '1.0.1',
    v0: '1.0.0',
    releaseDir: scratch,
    scratch,
    needs: { measure: true, brand: true, previousBrand: false },
    facts: { problem: 'brand-facts.json is missing' },
    previousFacts: { problem: null }
  }
  const errors = []
  const error = console.error
  console.error = (/** @type {any} */ m) => errors.push(String(m))
  try {
    const code = await run(['--release-dir', scratch, '--previous', 'x/wp7/1.0.0', '--check'], {
      build: () => /** @type {any} */ (b)
    })
    assert.equal(code, 1)
  } finally {
    console.error = error
  }
  assert.match(errors.join('\n'), /measurements missing/)
  assert.equal(existsSync(scratch), false, 'the scratch tree is gone')
})

test('the row goes in right after the previous one; the rest of the table keeps its bytes', () => {
  const text = readFileSync(path.join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8')
  const table = JSON.parse(text)
  const row = { ...table.releases['quickstart/ja-restaurant/wp7']['1.0.1'], note: 'carried' }
  // a new version after the release's last row
  const added = withRow(text, 'quickstart/ja-restaurant/wp7', '1.0.1', '1.0.2', row)
  const after = JSON.parse(added)
  assert.deepEqual(after.releases['quickstart/ja-restaurant/wp7']['1.0.2'], row)
  assert.deepEqual(Object.keys(after.releases['quickstart/ja-restaurant/wp7']), ['1.0.0', '1.0.1', '1.0.2'])
  const { ['quickstart/ja-restaurant/wp7']: _a, ...restAfter } = after.releases
  const { ['quickstart/ja-restaurant/wp7']: _b, ...restBefore } = table.releases
  assert.deepEqual(restAfter, restBefore)
  assert.equal(
    added.split('\n').length,
    text.split('\n').length + JSON.stringify(row, null, 2).split('\n').length
  )
  // a version between two rows keeps the comma of the one before
  const middle = withRow(text, 'quickstart/ja-restaurant/wp7', '1.0.0', '1.0.0-b', row)
  assert.deepEqual(Object.keys(JSON.parse(middle).releases['quickstart/ja-restaurant/wp7']), [
    '1.0.0',
    '1.0.0-b',
    '1.0.1'
  ])
  // a row already there is replaced in place
  const replaced = withRow(text, 'quickstart/ja-restaurant/wp7', '1.0.0', '1.0.1', row)
  assert.equal(JSON.parse(replaced).releases['quickstart/ja-restaurant/wp7']['1.0.1'].note, 'carried')
  assert.equal(replaced.split('\n').length, text.split('\n').length)
})

test('maxVersion moves with a dated line in its note; nothing else of the contract changes', () => {
  const text = readFileSync(
    path.join(ROOT, 'packages/design/tracy-ds-slot/templates/wordpress-wp-ja-restaurant.json'),
    'utf8'
  )
  const out = withMaxVersion(text, 'wp-ja-restaurant', '1.0.2', '1.0.2: patch of 1.0.1.')
  const a = JSON.parse(text)
  const b = JSON.parse(out)
  assert.deepEqual(b.maxVersion, { 'wp-ja-restaurant': '1.0.2' })
  assert.ok(b.maxVersionNote.endsWith(' 1.0.2: patch of 1.0.1.'))
  delete a.maxVersion
  delete a.maxVersionNote
  delete b.maxVersion
  delete b.maxVersionNote
  assert.deepEqual(b, a)
  assert.throws(() => withMaxVersion(text, 'wp-other', '1.0.2', 'x'), /no maxVersion for wp-other/)
})

test('an inherited measurement keeps every number and says where they came from', () => {
  const prev = {
    schemaVersion: 's',
    template: 't',
    tag: 'q',
    version: '1.0.0',
    measuredAt: 'm',
    perSystem: [1]
  }
  const out = inheritedMeasurement(prev, '1.0.1')
  assert.deepEqual(Object.keys(out), [
    'schemaVersion',
    'template',
    'tag',
    'version',
    'inheritedFrom',
    'measuredAt',
    'perSystem'
  ])
  assert.equal(out.version, '1.0.1')
  assert.equal(out.inheritedFrom, '1.0.0')
  // a chain of database-only patches points at the link before it, each proven by its own evidence
  assert.equal(inheritedMeasurement(out, '1.0.2').inheritedFrom, '1.0.1')
})

test('the theme Version header, and the stand runs a patch still needs', () => {
  assert.equal(themeVersionOf('/*\nTheme Name: X\nVersion: 1.0.1\n*/'), '1.0.1')
  assert.equal(themeVersionOf('/* no header */'), null)
  const b = {
    tag: 'quickstart/x/wp7',
    version: '1.0.1',
    v0: '1.0.0',
    releaseDir: '/r',
    needs: { measure: false, brand: true, previousBrand: true }
  }
  assert.deepEqual(measureCommands(b, null), [
    [
      'node',
      'packages/design/tracy-ds-slot/scripts/release-measure.mjs',
      '--brand-only',
      '--jobs',
      '2',
      'quickstart/x/wp7@1.0.1=/r',
      'quickstart/x/wp7@1.0.0'
    ]
  ])
  // a theme that moved: the full measurement, which takes the brand facts too
  assert.deepEqual(
    measureCommands({ ...b, needs: { measure: true, brand: true, previousBrand: false } }, null),
    [
      [
        'node',
        'packages/design/tracy-ds-slot/scripts/release-measure.mjs',
        '--jobs',
        '2',
        'quickstart/x/wp7@1.0.1=/r'
      ]
    ]
  )
  assert.deepEqual(
    measureCommands({ ...b, needs: { measure: false, brand: false, previousBrand: false } }, null),
    []
  )
})
