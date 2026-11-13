// Invariants of every draft write plan (ticket #597): no operation of any kind carries an undefined, null or empty key,
// slot, id reference or path, on the florist's plan and on plans made from kits that lack a mapping entry, a slot or a
// declaration. A value of an in-place record with no slot is skipped at plan time (`kept_record_without_slot`), never
// sent as `changes[undefined]`. Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-invariants.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteCoverage, writePlanOf } from '../domain/draft-write-plan.mjs'
import { site } from './fixtures/draft-write/guarded.mjs'

const NAMED = new Set([
  'key',
  'slot',
  'entity',
  'record',
  'mark',
  'ref',
  'path',
  'id',
  'page',
  'alias',
  'xpath'
])

/** Every place of an operation that names something and names nothing: `<op key> <path>`. */
export function blankNamesOf(plan) {
  const out = []
  const walk = (value, path, op) => {
    if (value === undefined) return out.push(`${op} ${path}: undefined`)
    if (typeof value === 'string' && /\bundefined\b|:null\b|^null$/.test(value))
      return out.push(`${op} ${path}: ${value.slice(0, 40)}`)
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`, op))
    if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) {
        const named = NAMED.has(k) && !(k === 'ref' && path === '' && v === null)
        if (named && (v === null || v === '')) out.push(`${op} ${path}.${k}: ${JSON.stringify(v)}`)
        else walk(v, `${path}.${k}`, op)
      }
  }
  for (const op of plan.ops) {
    if (typeof op.key !== 'string' || op.key === '') out.push(`op without key: ${op.kind}`)
    const { stored: _stored, alt: _alt, initials: _initials, ...rest } = op
    walk(rest, '', op.key)
    if (op.kind === 'contract.apply')
      for (const v of op.values)
        if (typeof v.loc?.slot !== 'string') out.push(`${op.key} contract value without slot`)
    for (const r of op.removes ?? []) if (!r) out.push(`${op.key} empty remove`)
  }
  return out
}

const kitWith = (mutate) => {
  const aiq = structuredClone(site.aiq)
  mutate(aiq.mapping)
  return aiq
}
const KITS = {
  florist: () => {},
  no_mapping_entry: (m) => delete m.blocks['block-156'].fields.paragraph,
  entity_not_declared: (m) => {
    m.blocks['block-156'].fields.paragraph = { entity: 'module-99999', column: 'title' }
  },
  kept_record_without_slot: (m) => {
    for (const b of Object.values(m.blocks))
      for (const f of Object.values(b.fields ?? {})) if (f?.slot === 'module-175.5') delete f.slot
  },
  fact_place_not_on_site: (m) => {
    m.facts.phone = []
  },
  seo_record_not_declared: (m) => delete m.seo.pageTypes.class,
  article_category_not_declared: (m) => {
    for (const k of Object.keys(m.buildSets)) if (m.buildSets[k].sets === 'category') delete m.buildSets[k]
  }
}

test('no operation carries an undefined, null or empty key, slot, id reference or path', () => {
  for (const [name, mutate] of Object.entries(KITS)) {
    const plan = writePlanOf(site.order, kitWith(mutate), { stored: site.stored })
    assert.deepEqual(blankNamesOf(plan), [], name)
    const c = draftWriteCoverage(site.order, plan)
    assert.deepEqual([c.unexplained, c.twice], [[], []], name)
  }
})

test('a value of an in-place record whose location has no slot is skipped at plan time, documented reason', () => {
  const plan = writePlanOf(site.order, kitWith(KITS.kept_record_without_slot), { stored: site.stored })
  const skipped = plan.skipped.find((s) => s.entry === 'home.home-b10.heading')
  assert.equal(skipped?.reason, 'kept_record_without_slot')
  for (const op of plan.ops) assert.ok(!(op.entries ?? []).includes('home.home-b10.heading'), op.key)
  // One half of a button with no slot: the plan stops typed before any door, never half a button on the site.
  const aiq = kitWith((m) => {
    const f = m.blocks['block-176'].fields
    delete f[Object.keys(f).find((k) => f[k]?.slot === 'module-176.1')].slot
  })
  assert.throws(
    () => writePlanOf(site.order, aiq, { stored: site.stored }),
    (error) => error.code === 'pair_incomplete' && error.noRerun === true
  )
})

test('the omit hide tells row 1 from row 10: a list of eleven rows keeps exactly the rows it fills', async () => {
  const { omitRows } = await import('../domain/draft-write-plan-hides.mjs')
  const row = (n) => ({ entity: 'module-1', column: 'content', xpath: `/html/body/div/ul/li[${n}]/text()` })
  const rows = Array.from({ length: 11 }, (_, i) => row(i + 1))
  const removes = (filled) => {
    const record = {
      key: 'copy:x',
      kind: 'copy',
      block: 'b',
      cuts: [],
      removes: [],
      values: new Map(filled.map((n) => [String(n), { loc: row(n), value: 'x' }]))
    }
    const state = {
      kit: { mapping: { blocks: { b: { lists: { r: { fields: { text: rows } } } } } } },
      sink: { unproven: [] }
    }
    omitRows(state, record, { by: 'omit', rows: 'r' })
    return {
      out: record.removes.map((r) => r.xpath),
      gap: state.sink.unproven.some((u) => u.code === 'omit_row_gap')
    }
  }
  // Row 10 filled: rows 1 to 9 hold a gap, row 11 is out. Row 1 filled alone: rows 2 to 11 are out, row 10 among them.
  assert.deepEqual(removes([10]).out, ['/html/body/div/ul/li[11]'])
  assert.equal(removes([1]).out.length, 10)
  assert.equal(removes([1]).gap, false)
  // Rows 2 to 11 filled, row 1 empty: row 1 is a gap (row 10 or 11 written is no write of row 1).
  assert.deepEqual(removes([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), { out: [], gap: true })
})

test('the omit hide reads a row by whole steps: a piece inside the row fills it, a longer name does not', async () => {
  const { omitRows } = await import('../domain/draft-write-plan-hides.mjs')
  const at = (xpath) => ({ entity: 'module-1', column: 'content', xpath })
  const rows = [at('/html/body/div/p/text()'), at('/html/body/div/p[2]/text()')]
  const removes = (written) => {
    const record = { key: 'copy:x', kind: 'copy', block: 'b', cuts: [], removes: [] }
    record.values = new Map(written.map((x) => [x, { loc: at(x), value: 'x' }]))
    const state = { kit: { mapping: { blocks: { b: { lists: { r: { fields: { text: rows } } } } } } } }
    state.sink = { unproven: [] }
    omitRows(state, record, { by: 'omit', rows: 'r' })
    return record.removes.map((r) => r.xpath)
  }
  // A paragraph is no pre: the written pre leaves both rows unfilled.
  assert.deepEqual(removes(['/html/body/div/pre/text()']), ['/html/body/div/p[2]', '/html/body/div/p'])
  // A link inside row 2 fills row 2 and row 1 stays (a gap before a filled row is never taken out).
  assert.deepEqual(removes(['/html/body/div/p[2]/a/text()']), [])
  // Row 1 written as `p[1]` is the unindexed `p`.
  assert.deepEqual(removes(['/html/body/div/p[1]/text()']), ['/html/body/div/p[2]'])
})
