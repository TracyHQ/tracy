// The article columns the record door writes (fault of the release gate's real write on plugin 0.24.85): a created
// article was sent `created` and `created_by_alias`, the door's `content.update` wrote neither (its article whitelist
// names neither; on a create the site stamps `created` with its own time), the read back found other values and the
// write stopped (`read_back_mismatch`). The memory site now keeps only the columns the door writes and stamps
// `created` itself, and the plan sends no column the door drops. Real JA Boxing kit, invented florist.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-door-columns.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DOOR_COLUMNS, doorWrites } from '../domain/draft-write-door-columns.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { memoryDoors } from '../domain/write-order-memory-doors.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const SITE_NOW = Date.UTC(2026, 9, 1, 12, 0, 0)
const fresh = () =>
  memoryDoors({ lock: site.kit.lock, contentMap: site.kit.blankContract, now: () => SITE_NOW })
const ARTICLE = {
  title: 'Invented class',
  alias: 'invented-class',
  state: 1,
  introtext: '<p>Invented words</p>',
  publish_up: '2026-09-30 10:00:00',
  ordering: 2
}

test('the door writes an article whitelist: no created, no author name', () => {
  for (const column of [
    'title',
    'alias',
    'introtext',
    'images',
    'attribs',
    'metadata',
    'publish_up',
    'ordering'
  ])
    assert.equal(doorWrites('article', column), true, column)
  for (const column of ['created', 'created_by_alias', 'created_by', 'modified'])
    assert.equal(doorWrites('article', column), false, column)
  // A kind not measured is not restricted here.
  assert.equal(doorWrites('module', 'anything'), true)
  assert.ok(Object.isFrozen(DOOR_COLUMNS.article))
})

test('the memory site keeps what the door keeps: created is its own time, the author name is dropped', async () => {
  const memory = fresh()
  const fields = { ...ARTICLE, created: '2020-01-01 00:00:00', created_by_alias: 'Invented Florist' }
  const { id } = await memory.doors.update({ applyId: 'a1', kind: 'article', id: 0, fields })
  const row = await memory.doors.get({ kind: 'article', id })
  assert.equal(row.created, '2026-10-01 12:00:00', 'the site stamps a new article with its own UTC time')
  assert.equal(row.created_by_alias, undefined, 'the door drops the author name')
  for (const [column, value] of Object.entries(ARTICLE)) assert.equal(row[column], value, column)
  // An update keeps its created and drops both again.
  await memory.doors.update({
    applyId: 'a2',
    kind: 'article',
    id,
    fields: { title: 'Invented class two', created: '2020-01-01 00:00:00', created_by_alias: 'X' }
  })
  const after = await memory.doors.get({ kind: 'article', id })
  assert.deepEqual(
    [after.title, after.created, after.created_by_alias],
    ['Invented class two', row.created, undefined]
  )
})

test('an article update that names no column the door writes is refused, as the site refuses it', async () => {
  const memory = fresh()
  const { id } = await memory.doors.update({ applyId: 'a1', kind: 'article', id: 0, fields: ARTICLE })
  await assert.rejects(
    memory.doors.update({
      applyId: 'a2',
      kind: 'article',
      id,
      fields: { created_by_alias: 'Invented Florist' }
    }),
    (e) => e.code === 'write_failed' && /no writable column for kind article/.test(e.message)
  )
})

test('the plan sends no article column the door drops: a record fact there is flagged, not written', () => {
  const plan = writePlanOf(site.order, site.aiq, { stored: site.stored })
  const created = plan.ops.filter((op) => op.kind === 'article.create')
  assert.ok(created.length > 0)
  for (const op of created) {
    for (const v of op.values ?? [])
      assert.equal(doorWrites('article', v.loc.column), true, `${op.key} ${v.loc.column}`)
    for (const column of Object.keys(op.base ?? {})) assert.equal(doorWrites('article', column), true, column)
  }
  const flagged = plan.unproven.filter((u) => u.code === 'record_fact_no_door')
  assert.ok(flagged.length > 0, 'the kit declares created_by_alias: the plan says it cannot be written')
  for (const u of flagged) assert.deepEqual([u.column, u.fact], ['created_by_alias', 'name'])
})
