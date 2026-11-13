// The operations a plan revision writes on a built site (ticket #599, `writeDeltaOf`), on the JA Boxing florist's
// write plan (`fixtures/draft-write/boxing-site.mjs`): the same plan writes nothing; a changed operation is written
// again; a picture with new bytes writes again every operation that shows it, an alt text alone does not; a record
// written whole again writes again what was written into it (a tab container's position); an added operation runs; a
// removed record, a place a record written in place no longer gets, are named for the typed stop; an upload no longer
// needed leaves its file.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-revision-write-delta.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { makesRecord, opsRecordOf, writeDeltaOf } from '../domain/revision-write-delta.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const plan = writePlanOf(site.order, site.aiq, { stored: site.stored })
const previous = opsRecordOf(plan)
const edited = (edit) => {
  const next = structuredClone(plan)
  edit(next.ops)
  return writeDeltaOf({ previous, plan: next })
}
const opOf = (ops, key) => ops.find((op) => op.key === key)
const keys = (rewrite) => rewrite.map((r) => r.key)

test('the same plan writes nothing', () => {
  const delta = writeDeltaOf({ previous, plan })
  assert.equal(delta.same.length, plan.ops.length)
  for (const part of ['rewrite', 'added', 'removed', 'dropped', 'orphaned']) assert.deepEqual(delta[part], [])
})

test('a changed operation is written again, and only it', () => {
  const delta = edited((ops) => {
    opOf(ops, 'copy:home.home-b5').values[0].value = 'Hedgerow bouquets, tied today'
  })
  assert.deepEqual(delta.rewrite, [{ key: 'copy:home.home-b5', reasons: ['changed'] }])
  assert.equal(delta.same.length, plan.ops.length - 1)
})

test('a picture with new bytes writes again every operation showing it; a new alt text alone does not', () => {
  const picture = plan.ops.find(
    (op) =>
      op.kind === 'picture.upload' && plan.ops.some((o) => JSON.stringify(o).includes(`"ref":"${op.key}"`))
  )
  const showing = plan.ops.filter(
    (o) => o.kind !== 'picture.upload' && JSON.stringify(o).includes(`"ref":"${picture.key}"`)
  )
  const bytes = edited((ops) => {
    opOf(ops, picture.key).stored = { id: 'stored-another-photo' }
  })
  assert.deepEqual(keys(bytes.rewrite).sort(), [picture.key, ...showing.map((o) => o.key)].sort())
  for (const op of showing)
    assert.ok(bytes.rewrite.find((r) => r.key === op.key).reasons.includes(`ref:${picture.key}`))
  const alt = edited((ops) => {
    opOf(ops, picture.key).alt = 'Another alt text'
  })
  assert.deepEqual(alt.rewrite, [])
})

test('a record written whole again writes again the position written into it; not its page assignment', () => {
  const position = plan.ops.find((op) => op.kind === 'module.position')
  const delta = edited((ops) => {
    opOf(ops, position.record).ordering = 99
  })
  assert.deepEqual(delta.rewrite.find((r) => r.key === position.key).reasons, [`record:${position.record}`])
  assert.ok(!keys(delta.rewrite).includes(`assign:${position.record}`))
})

test('added, removed, dropped and orphaned are named, each with what it is', () => {
  const contract = plan.ops.find((op) => op.kind === 'contract.apply' && op.values.length > 1)
  const delta = edited((ops) => {
    ops.push({ key: 'menuItem:mainmenu:class-3', kind: 'menuItem.create', values: [] })
    ops.splice(
      ops.findIndex((op) => op.key === 'article:service-seasonal-posy'),
      1
    )
    ops.splice(
      ops.findIndex((op) => op.kind === 'picture.upload'),
      1
    )
    opOf(ops, contract.key).values.pop()
  })
  assert.deepEqual(delta.added, ['menuItem:mainmenu:class-3'])
  assert.deepEqual(delta.removed, [
    { key: 'article:service-seasonal-posy', kind: 'article.create', record: true }
  ])
  assert.equal(delta.orphaned.length, 1)
  assert.equal(delta.dropped[0].key, contract.key)
  assert.ok(makesRecord('module.copy') && makesRecord('library.create') && !makesRecord('contract.apply'))
})
