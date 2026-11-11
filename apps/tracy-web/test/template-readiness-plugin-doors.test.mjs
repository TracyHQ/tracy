/**
 * The write doors check of the template readiness verdict (ticket #434): the write step declares the plugin doors it
 * needs (`src/write-step/plugin-doors.js`), the doors each released Claude Cowork for Joomla package offers are read
 * from its own bytes into a derived manifest, and the check holds the pinned plugin to the declared list.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { defaultContracts } from '../src/lib/contracts.js'
import { latestPin, readPins, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'
import { evidenceOfPackage } from '../src/lib/template-readiness/plugin-doors-of-package.js'
import { passed, readinessVerdict } from '../src/lib/template-readiness/verdict.js'
import { WRITE_DOORS_CHECK } from '../src/lib/template-readiness/write-doors-check.js'
import { opens, WRITE_STEP_DOORS } from '../src/write-step/plugin-doors.js'
import { zipOf } from './template-customization-question-readiness-fixtures.mjs'

test('the write step declares every plugin door it reads, each with the evidence a package shows it by', () => {
  assert.deepEqual(
    WRITE_STEP_DOORS.map((d) => d.id),
    ['hide-orders', 'rows-remove', 'page-create', 'slot-corrections', 'menu-item-alias']
  )
  // test-quality: contract the evidence is what the manifest is keyed by; each string was read in the plugin source.
  // The plugin's own words for each door (its info block, and the alias cleaner of content.update), read in its source.
  assert.deepEqual(
    WRITE_STEP_DOORS.map((d) => d.evidence),
    [
      "'hide_ops' =>",
      "'rows_remove' =>",
      "'page_create' =>",
      "'slot_corrections' =>",
      'function urlSafeAlias('
    ]
  )
  for (const door of WRITE_STEP_DOORS) {
    assert.equal(typeof door.evidence, 'string', door.id)
    assert.ok(door.evidence.length > 0, door.id)
    assert.equal(typeof door.what, 'string', door.id)
  }
})

test('a door read from the info answer opens only when the plugin says so', () => {
  const hide = WRITE_STEP_DOORS.find((d) => d.id === 'hide-orders')
  const rows = WRITE_STEP_DOORS.find((d) => d.id === 'rows-remove')
  assert.equal(opens(hide, { hide_ops: { version: 1, rows_remove: 1 } }), true)
  assert.equal(opens(rows, { hide_ops: { version: 1, rows_remove: 1 } }), true)
  assert.equal(opens(rows, { hide_ops: { version: 1 } }), false)
  assert.equal(opens(hide, {}), false)
  assert.equal(opens(hide, null), false)
})

/** A Claude Cowork for Joomla package as a release publishes it: the package manifest and the component zip inside. */
function joomlaPackage(version, engine) {
  return zipOf({
    'pkg_claudecowork.xml': `<extension type="package"><version>${version}</version></extension>`,
    'packages/com_claudecowork.zip': zipOf({
      'administrator/lib/Engine.php': engine,
      'administrator/lib/Other.php': '<?php // nothing here',
      'site/claudecowork.php': `<?php // ${WRITE_STEP_DOORS.map((d) => d.evidence).join(' ')}`
    })
  })
}

test('a package is read for each piece of evidence in its component library, and says its own version', () => {
  const engine =
    "<?php $info = ['hide_ops' => ['version' => 1, 'rows_remove' => 1], 'page_create' => ['version' => 1]];"
  const read = evidenceOfPackage(
    joomlaPackage('0.24.90', engine),
    WRITE_STEP_DOORS.map((d) => d.evidence)
  )
  assert.equal(read.version, '0.24.90')
  assert.deepEqual(read.evidence, {
    "'hide_ops' =>": true,
    "'rows_remove' =>": true,
    "'page_create' =>": true,
    // Only the component's library is read: the same words in a site file are not the door.
    "'slot_corrections' =>": false,
    'function urlSafeAlias(': false
  })
})

test('a package that is not a Joomla package of the plugin says so rather than reading as one without doors', () => {
  assert.throws(() => evidenceOfPackage(Buffer.from('not a zip'), ["'hide_ops' =>"]), /zip/)
  assert.throws(() => evidenceOfPackage(zipOf({ 'readme.txt': 'x' }), ["'hide_ops' =>"]), /com_claudecowork/)
})

/** Every door's evidence set to `has` (one answer for all, or a function of the door). */
const evidenceOf = (has, doors = WRITE_STEP_DOORS) =>
  Object.fromEntries(doors.map((d) => [d.evidence, typeof has === 'function' ? has(d) : has]))

/** A manifest of four released packages, in the shape scripts/cowork-plugin-doors.mjs writes. */
const MANIFEST = {
  platform: 'joomla',
  releases: {
    '0.24.80': { evidence: evidenceOf(false) },
    '0.24.81': { evidence: evidenceOf((d) => d.id === 'menu-item-alias') },
    '0.24.85': { evidence: evidenceOf(true) },
    '0.24.87': { evidence: evidenceOf(true) }
  }
}

/** The pin list with JA Boxing j6 pinned to another plugin version (a copy of the latest JA Boxing release). */
function pinsWithBoxingOn(version) {
  const pins = structuredClone(readPins())
  const cowork = pins['quickstart/ja-boxing/j6'].cowork
  cowork.version = version
  cowork.file = `pkg_claudecowork-${version}.zip`
  cowork.url = `https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v${version}/${cowork.file}`
  return pins
}

const boxing = () => releaseOfPin(latestPin('ja-boxing'), defaultContracts())
const judge = (release, world) =>
  WRITE_DOORS_CHECK.judge(release, { contracts: defaultContracts(), ...world })

test('the latest JA Boxing release pins a plugin with every write door: green', () => {
  // test-quality: contract the reference case is the pin named in ticket #434; a new pin should revisit this case.
  assert.equal(latestPin('ja-boxing').cowork, '0.24.85')
  const judged = judge(boxing(), { pluginDoors: MANIFEST })
  assert.deepEqual(judged, {
    state: 'done',
    code: 'cowork-pin-doors-ready',
    params: { plugin: '0.24.85', doors: WRITE_STEP_DOORS.map((d) => d.id) }
  })
})

test('the latest JA Boxing release is green against the doors read from the released packages (committed manifest)', () => {
  const judged = judge(boxing(), {})
  assert.equal(judged.state, 'done', `${judged.code} ${JSON.stringify(judged.params)}`)
})

test('a copy of JA Boxing pinned to a plugin without the doors is red, naming them and the newest release that has them', () => {
  const judged = judge(boxing(), { pluginDoors: MANIFEST, pins: pinsWithBoxingOn('0.24.81') })
  assert.deepEqual(judged, {
    state: 'todo',
    code: 'cowork-pin-missing-doors',
    params: {
      plugin: '0.24.81',
      missing: ['hide-orders', 'rows-remove', 'page-create', 'slot-corrections'],
      fixVersion: '0.24.87'
    }
  })
})

test('a door no released plugin has asks for a plugin release, naming that door', () => {
  const door = { id: 'example-door', what: 'an example door', evidence: "'example_door' =>" }
  const doors = [...WRITE_STEP_DOORS, door]
  const manifest = structuredClone(MANIFEST)
  for (const r of Object.values(manifest.releases)) r.evidence[door.evidence] = false
  const judged = judge(boxing(), { pluginDoors: manifest, writeDoors: doors })
  assert.deepEqual(judged, {
    state: 'todo',
    code: 'cowork-release-needed',
    params: { plugin: '0.24.85', missing: ['example-door'], doors: ['example-door'] }
  })
})

test('a door the write step adds is held to the plugin at once: not read in any package yet, it is never a pass', () => {
  const door = { id: 'example-door', what: 'an example door', evidence: "'example_door' =>" }
  const judged = judge(boxing(), { pluginDoors: MANIFEST, writeDoors: [...WRITE_STEP_DOORS, door] })
  assert.equal(judged.state, 'todo')
  assert.equal(judged.code, 'cowork-pin-doors-unread')
  assert.deepEqual(judged.params.doors, ['example-door'])
  assert.equal(judged.params.plugin, '0.24.85')
})

test('a pinned plugin the manifest has not read is not checked, which is never a pass', () => {
  const judged = judge(boxing(), { pluginDoors: MANIFEST, pins: pinsWithBoxingOn('0.24.84') })
  assert.equal(judged.state, 'todo')
  assert.equal(judged.code, 'cowork-pin-doors-unread')
  assert.equal(judged.params.plugin, '0.24.84')
})

test('the check is listed in the verdict and joins its cowork-pin piece', () => {
  const pin = latestPin('ja-boxing')
  const world = {
    contracts: defaultContracts(),
    server: false,
    readiness: { version: pin.version, state: 'done', report: { results: [] } },
    pluginDoors: MANIFEST,
    pins: pinsWithBoxingOn('0.24.80')
  }
  const piece = readinessVerdict(boxing(), world).pieces.find((p) => p.piece === 'cowork-pin')
  assert.equal(piece.step, 'write-doors')
  assert.equal(piece.code, 'cowork-pin-missing-doors')
  assert.equal(piece.params.fixVersion, '0.24.87')
})

// JA Diner j6 sat on 0.24.80, a plugin older than every door of the write step; #439 moved its pin to 0.24.87, which
// carries the same 1.0.5 contract files and every door. The later stable pins retain them; the current reversible-row and alias candidate is 0.24.95-rc.2.
test('the T3 case: JA Diner j6 on plugin 0.24.80 lacked every write door; on its current pin 0.24.95-rc.2 it has them all', () => {
  const pin = latestPin('ja-diner')
  // test-quality: contract the reviewed RC2 candidate must retain every existing write door.
  assert.equal(pin.cowork, '0.24.95-rc.2')
  const contracts = defaultContracts()
  const now = judge(releaseOfPin(pin, contracts), {})
  assert.deepEqual(
    [now.state, now.code, now.params.plugin],
    ['done', 'cowork-pin-doors-ready', '0.24.95-rc.2']
  )
  const pins = structuredClone(readPins())
  pins['quickstart/ja-diner/j6'].cowork.version = '0.24.80'
  const before = judge(releaseOfPin(pin, contracts), { pins })
  assert.equal(before.state, 'todo')
  assert.equal(before.code, 'cowork-pin-missing-doors')
  assert.deepEqual(
    before.params.missing,
    WRITE_STEP_DOORS.map((d) => d.id)
  )
  // test-quality: contract the fix a missing door names is the newest release the committed manifest has read; it moves
  // with every plugin release (0.24.89 carries the final JA Voyara 1.0.12 profile), so it is read, not copied.
  assert.equal(before.params.fixVersion, newestReadRelease())
})

/** The newest Claude Cowork for Joomla release the committed write doors manifest has read. */
function newestReadRelease() {
  const url = new URL('../src/lib/template-readiness/cowork-plugin-doors.json', import.meta.url)
  const versions = Object.keys(JSON.parse(readFileSync(url, 'utf8')).releases)
  const parts = (v) => v.split('.').map(Number)
  return versions
    .sort((a, b) => {
      const [x, y] = [parts(a), parts(b)]
      for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i]
      return 0
    })
    .at(-1)
}

/** An invented WordPress quickstart release: the write step has no WordPress door list to hold a plugin to yet. */
function wordpressRelease() {
  return {
    tag: 'quickstart/ja-example/wp7',
    name: 'JA Example',
    kind: 'quickstart',
    github: 'published',
    tracy: 'ready',
    reason: null,
    publishedAt: null,
    assets: [{ name: 'w.tar.gz' }],
    setting: {
      schemaVersion: 'tracy-setting/v1',
      platform: 'wordpress',
      label: 'JA Example',
      version: '1.0.0',
      template: 'ja_example',
      install: { webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) } }
    },
    inspiration: null,
    inspirationHidden: false,
    pages: null,
    local: null,
    choosable: true,
    platform: 'wordpress'
  }
}

test('a WordPress release is not judged on the write doors yet: its own code, never a pass', () => {
  const judged = WRITE_DOORS_CHECK.judge(wordpressRelease(), { contracts: defaultContracts() })
  assert.deepEqual(judged, {
    state: 'not-judged',
    code: 'write-doors-not-judged',
    params: { platform: 'wordpress' }
  })
  // Never a pass (not done, not warn) and never a hold: it asks nothing of anyone.
  assert.ok(judged.state !== 'done' && judged.state !== 'warn' && judged.state !== 'todo')
  assert.equal(passed(judged), true)
})

test('the verdict of a WordPress release never passes its cowork-pin piece, and the check is the one listed for it', () => {
  const world = { contracts: defaultContracts(), server: false, checks: [WRITE_DOORS_CHECK] }
  const piece = readinessVerdict(wordpressRelease(), world).pieces.find((p) => p.piece === 'cowork-pin')
  // The invented release has no contract, so the plugin rules of Customize your site decide the piece first; what
  // matters is that the piece is not a pass, and that the listed check gives the not judged answer for it.
  assert.ok(piece.state !== 'done' && piece.state !== 'warn')
  assert.equal(WRITE_DOORS_CHECK.judge(wordpressRelease(), world).code, 'write-doors-not-judged')
})

test('a platform that is neither Joomla nor WordPress is still not judged by this check (no result)', () => {
  const emdash = wordpressRelease()
  emdash.platform = 'emdash'
  emdash.setting.platform = 'emdash'
  assert.equal(WRITE_DOORS_CHECK.judge(emdash, { contracts: defaultContracts() }), null)
})

test('a piece whose only open entry is not judged stays not-judged, and holds nothing', () => {
  const world = {
    contracts: defaultContracts(),
    server: false,
    checks: [WRITE_DOORS_CHECK],
    readiness: { version: '1.0.0', state: 'done', report: { results: [] } }
  }
  const verdict = readinessVerdict(wordpressRelease(), world)
  const piece = verdict.pieces.find((p) => p.piece === 'cowork-pin')
  // The plugin half is blocked for this invented release (no contract), so the piece is held by that, not by us.
  assert.ok(piece.state !== 'not-judged')
  // With the plugin half done, the not judged write doors are what the piece says.
  const done = readinessVerdict(wordpressRelease(), {
    ...world,
    checks: [{ ...WRITE_DOORS_CHECK, piece: 'write-doors-only', judge: WRITE_DOORS_CHECK.judge }]
  })
  const only = done.pieces.find((p) => p.piece === 'write-doors-only')
  assert.deepEqual([only.state, only.code], ['not-judged', 'write-doors-not-judged'])
  assert.equal(passed(only), true)
})

test('the command line exits 0 when every piece is done or not judged, 1 when one holds', async () => {
  const { exitCodeOf } = await import('../scripts/template-readiness.mjs')
  const piece = (state) => ({ state })
  assert.equal(exitCodeOf([piece('done'), piece('not-judged')]), 0)
  assert.equal(exitCodeOf([piece('done'), piece('todo'), piece('not-judged')]), 1)
  assert.equal(exitCodeOf([piece('done'), piece('warn')]), 1)
})
