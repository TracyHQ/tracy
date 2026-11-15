// The places the kit declares and the write plan names, held by the blank site the memory doors are seeded from
// (ticket #597): the memory site is seeded from the kit's own blank site contract (`presentation-lock.json`,
// `content-map.json`), so every xpath the mapping declares on a store record (a field, a hide's `element`) must name a
// node of the seeded value, and every element a copy's write takes out (`removes`) must name one element of the value
// that copy writes, after its values are set and its rows cut, as `writtenFields` writes it. A `rows.remove` inside a
// cut row list (the masthead stat, block-162 row 14) is named at its row's place after the cut, by the element the
// hide declares. Every key of the kit's build declarations (`look.accent`, `pages`, `createdFrames`, the keyed row,
// container copies and menu items of a placement, the featured article, `notWritten`, the hides) is one the write
// knows (`DRAFT_WRITE_KIT_KEYS`). Real JA Boxing kit, invented florist.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-kit-places.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cutRows, getAt, removeAt, setAt } from '../domain/draft-write-codec.mjs'
import { DRAFT_WRITE_HIDE_VALUES, DRAFT_WRITE_KIT_KEYS } from '../domain/draft-write-kit-keys.mjs'
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

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
/** Every declared key of the build families the write step does not know: `<family>.<key>`, and hide values. */
function unknownKitKeys(mapping) {
  const out = []
  const check = (family, value) => {
    if (!isObject(value)) return
    for (const key of Object.keys(value))
      if (!Object.hasOwn(DRAFT_WRITE_KIT_KEYS[family], key)) out.push(`${family}.${key}`)
  }
  check('look.accent', mapping.look?.accent)
  check('look.accent.writtenAs', mapping.look?.accent?.writtenAs)
  check('look.accent.sides', mapping.look?.accent?.sides)
  check('look.accent.sides.values', mapping.look?.accent?.sides?.values)
  for (const page of Object.values(mapping.pages ?? {})) {
    check('pages.<type>', page)
    for (const key of ['menuItem', 'ownItem', 'under', 'record', 'unbuilt'])
      check(`pages.<type>.${key}`, page[key])
    check('pages.<type>.record.category', page.record?.category)
    check('pages.<type>.record.category.title', page.record?.category?.title)
    check('pages.<type>.under.detailPositions', page.under?.detailPositions)
  }
  for (const frame of list(mapping.createdFrames)) check('createdFrames[]', frame)
  for (const p of Object.values(mapping.placements ?? {})) {
    check('placements.<id>.keyedRow', p.keyedRow)
    check('placements.<id>.holds', p.holds)
    check('placements.<id>.holds.copies', p.holds?.copies)
    check('placements.<id>.menu', p.menu)
    check('placements.<id>.menu.items', p.menu?.items)
  }
  check('seo.featuredView', mapping.seo?.featuredView)
  check('seo.featuredView.article', mapping.seo?.featuredView?.article)
  for (const places of Object.values(mapping.facts ?? {}))
    for (const place of list(places)) check('facts.<fact>[i].notWritten', place.notWritten)
  for (const hides of Object.values(mapping.hides ?? {}))
    for (const hide of list(hides)) {
      check('hides.<id>[i]', hide)
      for (const [key, known] of Object.entries(DRAFT_WRITE_HIDE_VALUES))
        if (hide[key] !== undefined && !known.includes(hide[key]))
          out.push(`hides.<id>[i].${key}=${hide[key]}`)
    }
  return out
}

test('every key of the kit build declarations is one the write step knows, with what it does with it', () => {
  assert.deepEqual(unknownKitKeys(boxingKit().mapping), [])
  for (const keys of Object.values(DRAFT_WRITE_KIT_KEYS))
    for (const [key, status] of Object.entries(keys)) assert.ok(typeof status === 'string' && status, key)
})

test('a key the kit declares that the write step does not know is caught, as is an unknown hide value', () => {
  const kit = boxingKit()
  kit.mapping.pages.home.menuItem.invented = 1
  kit.mapping.placements['block-174'].menu.items.sortBy = 'invented'
  kit.mapping.hides['block-167'][0].from = 'last-item'
  kit.mapping.look.accent.sides.values.contrast = 'accent'
  kit.mapping.pages.class.record.category.title.case = 'upper'
  assert.deepEqual(unknownKitKeys(kit.mapping), [
    'look.accent.sides.values.contrast',
    'pages.<type>.menuItem.invented',
    'pages.<type>.record.category.title.case',
    'placements.<id>.menu.items.sortBy',
    'hides.<id>[i].from=last-item'
  ])
})
