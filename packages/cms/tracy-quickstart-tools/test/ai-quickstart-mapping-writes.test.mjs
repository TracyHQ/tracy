// The locations of a committed AI quickstart mapping file come from the template's content map, and the existing
// write function takes them unchanged (#584). A location naming a slot carries that slot's own entity, column, JSON
// path, nested JSON key and xpath; a piece (`piece: true`) names a node inside its slot's stored value, so the build
// writes the whole value back under the slot's key. Then the Joomla contract writer (`applyJoomlaContract`, the seeder)
// is called with a door that answers inspect with the content map's slots, and a change on every slot the mapping
// writes: it sends them to the door unchanged, with no fork of the writer. The values written are invented.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyJoomlaContract } from '../../tracy-seeder/src/apply-joomla-contract.mjs'
import { isDerived } from '../../tracy-seeder/src/plan-joomla-contract.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const REL = 'ja-boxing/j6/1.0.11'
const readJson = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))
const MAPPING = readJson(`packages/cms/tracy-joomla-quickstart/ai-quickstarts/${REL}/mapping.json`)
const CONTENT_MAP = readJson(`packages/cms/tracy-joomla-quickstart/contracts/${REL}/content-map.json`)
const SLOTS = new Map(CONTENT_MAP.slots.map((s) => [s.key, s]))
const SAME_KEYS = ['entity', 'column', 'jsonPath', 'nestedJson']

/** Every location of the mapping file that names a content map slot. */
function slotLocations(value, found = []) {
  if (Array.isArray(value)) for (const v of value) slotLocations(v, found)
  else if (value && typeof value === 'object') {
    if (typeof value.slot === 'string' && typeof value.entity === 'string') found.push(value)
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

test('the existing Joomla contract writer takes a change on every slot the mapping writes, unchanged', async () => {
  const keys = [...new Set(LOCATIONS.map((l) => l.slot))].sort()
  assert.deepEqual(
    keys.filter((k) => isDerived(SLOTS.get(k))),
    [],
    'no translated copy'
  )
  const changes = Object.fromEntries(keys.map((k, i) => [k, `Invented value ${i}`]))
  const evidence = Object.fromEntries(
    keys.filter((k) => SLOTS.get(k).requiresEvidence).map((k) => [k, 'invented: the business said so'])
  )
  const state = {
    ok: true,
    contract: 'ja-boxing/1.0.11',
    revision: 'rev-invented',
    pages: [],
    slots: CONTENT_MAP.slots
  }
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    return call.params.operation === 'inspect' ? state : { ok: true, ids: [] }
  }
  const mapping = { contract: state.contract, revision: state.revision, changes, evidence }
  const result = await applyJoomlaContract({ apply, siteKey: 'invented-gym.test', mapping })
  assert.equal(result.ok, true)
  assert.deepEqual(
    calls.map((c) => c.params.operation),
    ['inspect', 'apply']
  )
  assert.deepEqual(calls[1].params.changes, changes)
  assert.equal(Object.keys(calls[1].params.changes).length, keys.length)
})
