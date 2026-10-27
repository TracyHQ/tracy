// The relay's version store (`src/sites/content-versions.js`): what `changedSince` may compare with.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  changesBetween,
  createVersionStore,
  queryScope,
  VERSION_MAX_KEPT,
  VERSION_TTL_MS,
  versionOf
} from '../src/sites/content-versions.js'

const rows = [
  { id: 'a', revision: '1' },
  { id: 'b', revision: '1' }
]

test('a version is the same for the same read and moves with a revision, a seat or a query', () => {
  const scope = { site: 's', principal: 'p1', query: { type: 'page' } }
  assert.equal(
    versionOf(scope, rows),
    versionOf(
      { ...scope },
      rows.map((row) => ({ ...row }))
    )
  )
  assert.notEqual(versionOf(scope, rows), versionOf(scope, [rows[0], { id: 'b', revision: '2' }]))
  assert.notEqual(versionOf(scope, rows), versionOf({ ...scope, principal: 'p2' }, rows))
  assert.notEqual(versionOf(scope, rows), versionOf({ ...scope, query: { type: 'article' } }, rows))
  assert.deepEqual(queryScope({ type: 'page', ifVersion: 'x', changedSince: 'y', locale: 'en' }), {
    locale: 'en',
    type: 'page'
  })
})

test('a walk is recalled only in its own scope and only while fresh', () => {
  let clock = 0
  const store = createVersionStore({ now: () => clock })
  const scope = { site: 's', principal: 'p1', walk: {} }
  store.remember('v1', scope, rows)
  assert.deepEqual(
    [...store.recall('v1', scope)],
    [
      ['a', '1'],
      ['b', '1']
    ]
  )
  assert.equal(store.recall('v1', { ...scope, principal: 'p2' }), null, 'another seat')
  clock = VERSION_TTL_MS + 1
  assert.equal(store.recall('v1', scope), null, 'too old')
})

test('the store keeps a bounded number of walks, oldest out first', () => {
  const store = createVersionStore({ now: () => 0 })
  for (let i = 0; i <= VERSION_MAX_KEPT; i += 1) store.remember(`v${i}`, {}, rows)
  assert.equal(store.recall('v0', {}), null)
  assert.ok(store.recall(`v${VERSION_MAX_KEPT}`, {}))
})

test('changes are the moved and new rows, and the ids that are gone', () => {
  const before = new Map([
    ['a', '1'],
    ['b', '1']
  ])
  const { changed, removed } = changesBetween(before, [
    { id: 'b', revision: '2' },
    { id: 'c', revision: '1' }
  ])
  assert.deepEqual(
    changed.map((row) => row.id),
    ['b', 'c']
  )
  assert.deepEqual(removed, ['a'])
})
