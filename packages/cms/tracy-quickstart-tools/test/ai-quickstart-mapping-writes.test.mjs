// The locations of a committed AI quickstart mapping file come from the template's content map, and the plugin that
// writes a site takes them unchanged on the blank site (#584). A location naming a slot carries that slot's own entity,
// column, JSON path, nested JSON key and xpath; a piece (`piece: true`) names a node inside its slot's stored value, so
// the build sets the piece and writes the whole value back under the slot's key. The write test runs the Claude Cowork
// plugin release the quickstart pins (its `checkValue` and `changeRow`, as `content.contract` apply runs them) on the
// demo rows as the blank site step leaves them, under the slots of the blank site contract the site is bound to
// (`blank-site-contract/`, each slot the blank site empties opened: its sample the blank value, `opensEmpty`), and
// reads each value back. The same writes run through the real door of a blank site in `door-proof.mjs`. The values
// written are invented.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { EMPTY_HTML } from '../../tracy-joomla-quickstart/scripts/blank-site-empty-fields.mjs'
import {
  blankRows,
  coworkLib,
  mappingLocations,
  PHP_SKIP,
  placeKey
} from './fixtures/ai-quickstart-ja-boxing-blank.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const REL = 'ja-boxing/j6/1.0.11'
const readJson = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))
const MAPPING = readJson(`packages/cms/tracy-joomla-quickstart/ai-quickstarts/${REL}/mapping.json`)
const CONTENT_MAP = readJson(`packages/cms/tracy-joomla-quickstart/contracts/${REL}/content-map.json`)
const SLOTS = new Map(CONTENT_MAP.slots.map((s) => [s.key, s]))
const BLANK_MAP = readJson(
  `packages/cms/tracy-joomla-quickstart/ai-quickstarts/${REL}/blank-site-contract/content-map.json`
)
const BLANK_SLOTS = new Map(BLANK_MAP.slots.map((s) => [s.key, s]))
const SAME_KEYS = ['entity', 'column', 'jsonPath', 'nestedJson']

/** Every location of the mapping file that names a content map slot. */
function slotLocations(value, found = []) {
  if (Array.isArray(value)) for (const v of value) slotLocations(v, found)
  else if (value && typeof value === 'object') {
    if (typeof value.slot === 'string' && typeof value.column === 'string') found.push(value)
    for (const v of Object.values(value)) slotLocations(v, found)
  }
  return found
}

const LOCATIONS = slotLocations(MAPPING)

test('every location naming a slot carries that slot of the content map unchanged', () => {
  assert.ok(LOCATIONS.length > 900, `${LOCATIONS.length} locations`)
  for (const loc of LOCATIONS) {
    const slot = SLOTS.get(loc.slot)
    assert.ok(slot, `${loc.slot} is a slot of the content map`)
    for (const key of SAME_KEYS)
      assert.deepEqual(loc[key], slot[key], `${loc.slot}: ${key} is the content map's`)
    if (loc.piece)
      assert.ok(loc.xpath.startsWith(slot.xpath ?? '/html/body/div'), `${loc.slot}: a piece of the value`)
    else assert.equal(loc.xpath, slot.xpath, `${loc.slot}: xpath is the content map's`)
  }
})

// The text node places the blank site emptied into nothing before the #584 review, by content map key.
const EMPTIED_TEXT_NODES = [
  'module-176.1',
  'module-157.21',
  'module-157.23',
  'module-190.21',
  'module-190.23',
  'module-160.1',
  'module-160.3',
  'module-160.4',
  'module-160.5',
  'module-162.31',
  'module-162.33',
  'module-162.34',
  'module-162.35',
  'module-169.1',
  'module-175.1',
  'module-175.4'
]

/** One location per case the build writes, taken from the mapping file. */
function cases(rows) {
  const all = mappingLocations().filter(({ loc }) => rows.after.has(loc.entity) && loc.slot)
  const pick = (name, test) => {
    const found = all.find(({ at, loc }) => test(loc, at))
    assert.ok(found, `the mapping has a ${name}`)
    return { name, ...found }
  }
  const isAttr = (l) => /\/@[a-z]+$/.test(l.xpath ?? '')
  return [
    pick('plain slot', (l) => !l.jsonPath && !l.xpath),
    pick('xpath piece', (l) => l.piece && !isAttr(l) && !/text\(\)/.test(l.xpath)),
    pick('attribute piece', (l) => l.piece && isAttr(l)),
    pick('nestedJson place', (l) => l.nestedJson && !l.piece),
    pick('child list row', (l, at) => /\.(lists|itemLists)\./.test(at) && !l.piece),
    pick('fact place', (l, at) => at.startsWith('.facts.')),
    ...EMPTIED_TEXT_NODES.map((key) => pick(`emptied text node ${key}`, (l) => l.slot === key && !l.piece))
  ]
}

const LIB = await coworkLib()

/** Run writes through `write-through-cowork.php` with the pinned plugin. */
const throughCowork = (writes) =>
  JSON.parse(
    execFileSync(
      'php',
      [path.join(ROOT, 'packages/cms/tracy-quickstart-tools/test/fixtures/write-through-cowork.php')],
      { input: JSON.stringify({ lib: LIB.lib, markers: EMPTY_HTML, writes }), maxBuffer: 1 << 28 }
    )
  )

test('every slot of the blank site contract has the value the blank site holds as its sample', {
  skip: PHP_SKIP || LIB.skip || false
}, () => {
  const rows = blankRows(MAPPING)
  const slots = BLANK_MAP.slots.filter((s) => rows.after.has(s.entity))
  assert.ok(slots.length > 400, `${slots.length} slots on kept blocks`)
  const out = throughCowork(slots.map((slot) => ({ row: rows.after.get(slot.entity), slot, value: null })))
  out.forEach((r, i) => {
    const s = slots[i]
    assert.equal(r.error, undefined, `${s.key}: ${r.error}`)
    // A text node keeps its white space on the blank site; the plugin reads occupancy trimmed.
    if (s.sample.trim() === '') assert.equal(r.read.trim(), '', `${s.key} is empty on the blank site`)
    else assert.equal(r.read, s.sample, `${s.key}: the sample is the blank value`)
    if (s.opensEmpty) assert.equal(s.sample.trim(), '', `${s.key} opens empty`)
  })
  const opened = slots.filter((s) => s.opensEmpty).length
  assert.ok(opened > 300, `${opened} slots open empty`)
})

test('the pinned plugin writes every case into the blank site rows, and each value reads back', {
  skip: PHP_SKIP || LIB.skip || false
}, (t) => {
  const rows = blankRows(MAPPING)
  const chosen = cases(rows)
  const writes = chosen.map(({ loc }, i) => {
    assert.ok(
      rows.emptied.has(placeKey(loc)),
      `${loc.slot}${loc.piece ? `@${loc.xpath}` : ''} is emptied first`
    )
    return {
      row: rows.after.get(loc.entity),
      slot: BLANK_SLOTS.get(loc.slot),
      value: loc.xpath?.endsWith('/@href') ? `https://invented-gym.example/p/${i}` : `Word ${i}`,
      ...(loc.piece ? { piece: loc.xpath } : {})
    }
  })
  const out = throughCowork(writes)
  out.forEach((r, i) => {
    const { name, at } = chosen[i]
    assert.equal(r.error, undefined, `${name} ${at}: ${r.error}`)
    assert.equal(r.read, writes[i].value, `${name} ${at} reads back what was written`)
  })
  t.diagnostic(
    chosen.map((c) => `${c.name}: ${c.at} ${c.loc.slot}${c.loc.piece ? `@${c.loc.xpath}` : ''}`).join('; ')
  )
})

test('a place the build filled may be emptied again under the blank site contract, not under the released one', {
  skip: PHP_SKIP || LIB.skip || false
}, () => {
  const rows = blankRows(MAPPING)
  const { loc } = mappingLocations().find(
    ({ loc }) =>
      rows.after.has(loc.entity) &&
      loc.slot &&
      !loc.piece &&
      !loc.xpath &&
      BLANK_SLOTS.get(loc.slot)?.opensEmpty
  )
  const [filled] = throughCowork([
    { row: rows.after.get(loc.entity), slot: BLANK_SLOTS.get(loc.slot), value: 'Word 0' }
  ])
  assert.equal(filled.read, 'Word 0')
  const [blank, released] = throughCowork([
    { row: filled.row, slot: BLANK_SLOTS.get(loc.slot), value: '' },
    { row: filled.row, slot: SLOTS.get(loc.slot), value: '' }
  ])
  assert.equal(blank.error, undefined, `${loc.slot}: ${blank.error}`)
  assert.equal(blank.read, '')
  assert.match(released.error, /Content cannot remove an occupied slot/)
})
