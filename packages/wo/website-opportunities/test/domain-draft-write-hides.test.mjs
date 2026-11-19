// The `omit` and `empty` hides of the draft write (ticket #597, `draft-write-plan-hides.mjs`): a list row the write
// does not fill leaves the stored value it is a piece of, last first; a control left empty is written empty in every
// location the copy keeps; a control printed for every item from the first item's words must hold the same words in
// every item. Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-hides.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyControl, omitRows, removalsOf } from '../domain/draft-write-plan-hides.mjs'
import { put, recordOf, sinkOf } from '../domain/draft-write-sink.mjs'
import { addressOf } from '../domain/draft-write-codec.mjs'
import { frameOf } from '../domain/draft-write-frame.mjs'
import { memoryHtml } from '../domain/write-order-memory-html.mjs'
import { guardPlan } from '../domain/draft-write-guards.mjs'
import { kit, plan, site } from './fixtures/draft-write/guarded.mjs'

const at = (item, xpath) => ({
  entity: 'module-9',
  column: 'params',
  jsonPath: ['cards', 'cards[info]', item],
  nestedJson: 'config',
  xpath
})
const feature = (item, n) => at(item, `/html/body/div/ul/li[${n}]`)
const cta = (field, item) => ({
  entity: 'module-9',
  column: 'params',
  jsonPath: ['cards', `cards[${field}]`, item],
  nestedJson: 'config'
})
const kitOf = () => ({
  mapping: {
    blocks: {
      'block-9': {
        itemFields: { label: [cta('label', 0), cta('label', 1)], url: [cta('url', 0), cta('url', 1)] },
        itemLists: {
          features: {
            fields: { feature: [[1, 2, 3].map((n) => feature(0, n)), [1, 2, 3].map((n) => feature(1, n))] }
          }
        }
      }
    }
  }
})
function stateOf(kind = 'copy') {
  const sink = sinkOf()
  const record = recordOf(sink, 'copy:p.b9', { kind, block: 'block-9', entity: 'module-9' })
  return { state: { sink, kit: kitOf() }, record }
}

test('omit: the unfilled row elements of a list leave the copy value, last first; a filled row stays', () => {
  const { state, record } = stateOf()
  put(state.sink, record.key, feature(0, 1), 'Hand tied', { entry: 'e1' })
  omitRows(state, record, { by: 'omit', rows: 'features' })
  const removed = record.removes.map((r) => [r.loc.jsonPath[2], r.xpath])
  assert.deepEqual(removed, [
    [0, '/html/body/div/ul/li[3]'],
    [0, '/html/body/div/ul/li[2]'],
    [1, '/html/body/div/ul/li[3]'],
    [1, '/html/body/div/ul/li[2]'],
    [1, '/html/body/div/ul/li[1]']
  ])
  let value = '((ul))((li))((li))((li))((/ul))'
  for (const r of removed.filter(([item]) => item === 0)) value = memoryHtml.remove(value, r[1])
  assert.equal(value, '((ul))((li))((/li))((/ul))')
})

test('omit: a row of an item the copy cuts is not named; an empty row before a filled one stays, flagged', () => {
  const { state, record } = stateOf()
  put(state.sink, record.key, feature(0, 2), 'Seasonal', { entry: 'e1' })
  record.cuts.push({
    row: { column: 'params', nestedJson: 'config', parent: ['cards'], arrays: ['cards[info]'] },
    kept: [0]
  })
  omitRows(state, record, { by: 'omit', rows: 'features' })
  assert.deepEqual(
    record.removes.map((r) => r.xpath),
    ['/html/body/div/ul/li[3]']
  )
  assert.deepEqual(
    state.sink.unproven.map((u) => u.code),
    ['omit_row_gap']
  )
})

test('omit on a record written in place: the rows stay, flagged omit_on_record_in_place', () => {
  const { state, record } = stateOf('store')
  omitRows(state, record, { by: 'omit', rows: 'features' })
  assert.equal(record.removes.length, 0)
  assert.deepEqual(
    state.sink.unproven.map((u) => u.code),
    ['omit_on_record_in_place']
  )
})

test('empty: a control left empty is written empty in every location, label and address together', () => {
  const { state, record } = stateOf()
  emptyControl(state, record, { by: 'empty', control: ['label', 'url'] })
  assert.equal(record.values.size, 4)
  assert.ok([...record.values.values()].every((v) => v.value === '' && v.rule === 'hides.empty'))
})

test('empty on item fields: the same words in every item pass; other words or an empty first item are flagged', () => {
  const same = stateOf()
  for (const item of [0, 1]) {
    put(same.state.sink, same.record.key, cta('label', item), 'Order', { entry: `l${item}` })
    put(same.state.sink, same.record.key, cta('url', item), '/order', { entry: `u${item}` })
  }
  emptyControl(same.state, same.record, { by: 'empty', control: ['label', 'url'] })
  assert.equal(same.state.sink.unproven.length, 0)
  const other = stateOf()
  put(other.state.sink, other.record.key, cta('label', 1), 'Order', { entry: 'l1' })
  put(other.state.sink, other.record.key, cta('url', 1), '/order', { entry: 'u1' })
  emptyControl(other.state, other.record, { by: 'empty', control: ['label', 'url'] })
  assert.deepEqual(
    other.state.sink.unproven.map((u) => u.code),
    ['control_shared_by_items']
  )
})

test('the florist plan: the plans page copies leave every unfilled feature out and empty their card buttons', () => {
  for (const key of ['copy:plans.plans-b4', 'copy:plans.plans-b5']) {
    const op = plan.ops.find((o) => o.key === key)
    assert.equal(op.removes.filter((r) => r.rule === 'hides.omit').length, 7, key)
    assert.equal(op.values.filter((v) => v.rule === 'hides.empty').length, 2, key)
  }
})

test('removals: a removal inside another of the same value is dropped, the same element once, the rest last first', () => {
  const value = (item) => ({
    entity: 'module-9',
    column: 'params',
    jsonPath: ['cards', 'cards[info]', item],
    nestedJson: 'config'
  })
  const removes = [
    { loc: value(0), xpath: '/html/body/div/a[2]', rule: 'hides.omit' },
    { loc: value(0), xpath: '/html/body/div/a[1]/i', rule: 'hides.omit' },
    { loc: value(0), xpath: '/html/body/div/a[2]/i', rule: 'hides.omit' },
    { loc: value(0), xpath: '/html/body/div/a[1]', rule: 'hides.rows.remove' },
    { loc: value(0), xpath: '/html/body/div/a[2]', rule: 'hides.rows.remove' },
    { loc: value(1), xpath: '/html/body/div/a[1]/i', rule: 'hides.omit' }
  ]
  assert.deepEqual(
    removalsOf(removes).map((r) => [r.loc.jsonPath[2], r.xpath]),
    [
      [0, '/html/body/div/a[2]'],
      [0, '/html/body/div/a[1]'],
      [1, '/html/body/div/a[1]/i']
    ]
  )
})

// Every omit and rows.remove hide the real JA Boxing kit declares, on a copy whose rows are all left empty, then with
// only the first row filled: every removal names an element still there when it runs, on the smallest HTML holding
// every piece of the value. A container's removal takes the elements inside it (#575: a social link and its icon).
test('every element hide of the kit runs on its value with no removal naming an element already gone', () => {
  const mapping = site.aiq.mapping
  let checked = 0
  for (const [block, hides] of Object.entries(mapping.hides ?? {}))
    for (const hide of hides) {
      if (hide.by !== 'omit') continue
      const rows =
        mapping.blocks?.[block]?.itemLists?.[hide.rows] ?? mapping.blocks?.[block]?.lists?.[hide.rows]
      const pieces = Object.values(rows?.fields ?? {})
        .flatMap((f) => [f].flat(Infinity))
        .filter((p) => p?.xpath)
      for (const fill of [[], pieces.slice(0, 1)]) {
        const sink = sinkOf()
        const record = recordOf(sink, `copy:p.${block}`, {
          kind: 'copy',
          block,
          entity: mapping.blocks[block].entity
        })
        for (const p of fill) put(sink, record.key, p, 'Invented words', { entry: 'e1' })
        try {
          omitRows({ sink, kit: { mapping } }, record, { ...hide, order: undefined })
        } catch {
          continue
        }
        const byValue = new Map()
        for (const p of pieces) {
          const { xpath, ...whole } = p
          const key = addressOf(whole)
          byValue.set(key, [...(byValue.get(key) ?? []), xpath])
        }
        const html = new Map([...byValue].map(([key, xpaths]) => [key, frameOf(xpaths)]))
        for (const r of removalsOf(record.removes)) {
          const key = addressOf(r.loc)
          assert.doesNotThrow(
            () => html.set(key, memoryHtml.remove(html.get(key), r.xpath)),
            `${block} ${r.xpath}`
          )
          checked += 1
        }
      }
    }
  assert.ok(checked > 0, 'the kit declares element hides')
})

test('a copy removal naming an element an earlier removal took out is refused before any door', () => {
  const removal = (xpath) => ({
    loc: { entity: 'module-9', column: 'params', jsonPath: ['x'], nestedJson: 'config' },
    xpath,
    rule: 'hides.omit'
  })
  const codes = (removes) => {
    const p = structuredClone(plan)
    p.ops.find((op) => op.kind === 'module.copy').removes = removes
    try {
      guardPlan(p, { order: site.order, kit })
      return 'passed'
    } catch (error) {
      return error.details.problems.map((x) => x.code).join(',')
    }
  }
  assert.equal(
    codes([removal('/html/body/div/a[1]'), removal('/html/body/div/a[1]/i')]),
    'removal_element_gone'
  )
  assert.equal(
    codes(removalsOf([removal('/html/body/div/a[1]'), removal('/html/body/div/a[1]/i')])),
    'passed'
  )
})
