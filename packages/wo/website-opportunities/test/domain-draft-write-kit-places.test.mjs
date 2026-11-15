// The places the kit declares and the write plan names, held by the blank site the memory doors are seeded from
// (ticket #597): the memory site is seeded from the kit's own blank site contract (`presentation-lock.json`,
// `content-map.json`), so every xpath the mapping declares on a store record (a field, a hide's `element`) must name a
// node of the seeded value, and every element a copy's write takes out (`removes`) must name one element of the value
// that copy writes, after its values are set and its rows cut, as `writtenFields` writes it. A `rows.remove` inside a
// cut row list (the masthead stat, block-162 row 14) is named at its row's place after the cut, by the element the
// hide declares. Real JA Boxing kit, invented florist.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-kit-places.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cutRows, getAt, removeAt, setAt } from '../domain/draft-write-codec.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { memoryHtml } from '../domain/write-order-memory-html.mjs'
import { boxingKit, boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** Every location with an xpath inside a block description (fields, item fields, item lists). */
const locationsOf = (node) =>
  Array.isArray(node)
    ? node.flatMap(locationsOf)
    : node && typeof node === 'object'
      ? node.entity && node.xpath
        ? [node]
        : Object.values(node).flatMap(locationsOf)
      : []

/** The places the mapping declares on a store record that the seeded blank site value does not hold. */
function unheldPlaces(kit) {
  const out = []
  const holds = (name, row, loc) => {
    try {
      getAt(row, loc, memoryHtml)
    } catch (error) {
      out.push(`${name} ${JSON.stringify(loc.jsonPath ?? [])} ${loc.xpath}: ${error.code ?? error.message}`)
    }
  }
  for (const [id, block] of Object.entries(kit.mapping.blocks))
    for (const loc of locationsOf(block)) {
      const row = kit.lock.entities?.[loc.entity]
      if (row) holds(id, row, loc)
    }
  for (const [id, hides] of Object.entries(kit.mapping.hides ?? {}))
    for (const hide of hides) {
      if (!hide.element) continue
      const link = kit.mapping.blocks[id].fields[hide.control.at(-1)]
      const row = kit.lock.entities?.[link.entity]
      if (row) holds(`${id} hide`, row, { ...link, xpath: hide.element })
    }
  return out
}

/** The `removes` of the plan's copies that name no single element of the value the copy writes. */
function unheldRemoves(plan, kit) {
  const out = []
  for (const op of plan.ops) {
    if (!list(op.removes).length || typeof op.removes[0] !== 'object') continue
    const row = kit.lock.entities?.[op.source?.entity]
    if (!row) continue
    // As `writtenFields` writes a copy: its values (a reference stands as plain words), its rows cut, then removes.
    let fields = structuredClone(row)
    for (const v of list(op.values))
      fields = setAt(fields, v.loc, typeof v.value === 'object' ? 'x' : v.value, memoryHtml)
    for (const cut of list(op.cuts)) fields = cutRows(fields, cut.row, cut.kept)
    for (const r of op.removes)
      try {
        fields = removeAt(fields, r.loc, r.xpath, memoryHtml)
      } catch (error) {
        out.push(
          `${op.key} ${JSON.stringify(r.loc.jsonPath ?? [])} ${r.xpath}: ${error.code ?? error.message}`
        )
      }
  }
  return out
}

const site = await boxingSite()
const plan = writePlanOf(site.order, site.aiq, { stored: site.stored })

test('every place the kit declares on a store record is held by the seeded blank site', () => {
  assert.deepEqual(unheldPlaces(boxingKit()), [])
})

test('a seed out of step with the kit is caught: the stat element missing from the masthead row', () => {
  const kit = boxingKit()
  const params = JSON.parse(kit.lock.entities['module-162'].params)
  params.menuitem_config.description[14] = '<p>Only words</p>'
  kit.lock.entities['module-162'].params = JSON.stringify(params)
  const unheld = unheldPlaces(kit)
  assert.ok(
    unheld.some((u) => u.startsWith('block-162 hide') && u.includes('/html/body/div/div:')),
    unheld.join('\n')
  )
})

test('every element a copy takes out is one element of the value it writes, after its rows are cut', () => {
  assert.deepEqual(unheldRemoves(plan, site.kit), [])
})

test('the masthead stat left empty is taken out as the declared element, at its row after the cut', () => {
  const op = plan.ops.find((o) => o.key === 'copy:site.block-162')
  assert.ok(op, 'the plan holds the masthead copy')
  const stat = list(op.removes).filter((r) => r.rule === 'hides.rows.remove')
  assert.equal(stat.length, 1)
  const [cut] = op.cuts
  const at = cut.kept.indexOf(14)
  assert.ok(at >= 0 && at < 14, `row 14 is kept and moves up: ${JSON.stringify(cut.kept)}`)
  assert.deepEqual(stat[0].loc.jsonPath, ['menuitem_config', 'description', at])
  assert.equal(stat[0].xpath, '/html/body/div/div')
})
