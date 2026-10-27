import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { migrateIdentity } from '../tools/content-api/identity-sqlite.mjs'
function fixture(db = new DatabaseSync(':memory:')) {
  db.exec(
    `CREATE TABLE _emdash_collections(id TEXT,slug TEXT,supports TEXT);CREATE TABLE _emdash_fields(id TEXT,collection_id TEXT,slug TEXT,type TEXT,options TEXT,translatable INTEGER);CREATE TABLE revisions(id TEXT,collection TEXT,entry_id TEXT,data TEXT,created_at TEXT);CREATE TABLE ec_posts(id TEXT PRIMARY KEY,rows TEXT,status TEXT,live_revision_id TEXT,draft_revision_id TEXT,deleted_at TEXT);INSERT INTO _emdash_collections VALUES('c','posts','["revisions"]');INSERT INTO _emdash_fields VALUES('f','c','rows','repeater','{}',1);`
  )
  return db
}
const get = (db, id) => JSON.parse(db.prepare('SELECT rows FROM ec_posts WHERE id=?').get(id).rows)
const put = (db, id, rows) =>
  db.prepare('UPDATE ec_posts SET rows=? WHERE id=?').run(JSON.stringify(rows), id)
const ids = (rows) => rows.map((r) => r._rowId)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
test('install stamps missing, invalid and duplicated row ids, keeps pointers and reruns without changes', () => {
  const db = fixture(),
    same = randomUUID()
  db.prepare('INSERT INTO ec_posts VALUES(?,?,?,?,?,NULL)').run(
    'a',
    JSON.stringify([{ text: 'live' }, { _rowId: same }, { _rowId: same }, { _rowId: 'bad' }]),
    'published',
    'live',
    'draft'
  )
  db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?)').run(
    'draft',
    'posts',
    'a',
    JSON.stringify({ title: 'x', rows: [{ text: 'draft' }] }),
    'today'
  )
  const first = migrateIdentity(db)
  assert.deepEqual([first.changedRows, first.changedRevisions, first.fields], [1, 1, ['posts.rows']])
  const before = db.prepare('SELECT * FROM ec_posts').get()
  assert.equal(before.status, 'published')
  assert.equal(before.draft_revision_id, 'draft')
  const rows = get(db, 'a')
  assert.equal(rows[0].text, 'live')
  assert.equal(rows[1]._rowId, same, 'the first valid occurrence keeps its id')
  assert.ok(rows.every((r) => UUID.test(r._rowId)))
  assert.equal(new Set(ids(rows)).size, 4)
  const draft = JSON.parse(db.prepare('SELECT data FROM revisions').get().data)
  assert.equal(draft.title, 'x')
  assert.ok(Array.isArray(draft.rows) && UUID.test(draft.rows[0]._rowId), 'stored as JSON, not a string')
  assert.deepEqual([migrateIdentity(db).changedRows, migrateIdentity(db).changedRevisions], [0, 0])
  assert.deepEqual(db.prepare('SELECT * FROM ec_posts').get(), before)
  db.close()
})
test('option A: ids survive edits and reorders, a deleted and recreated row gets a new id', () => {
  const db = fixture()
  db.prepare('INSERT INTO ec_posts VALUES(?,?,?,?,?,NULL)').run('a', '[]', 'draft', null, null)
  migrateIdentity(db)
  put(db, 'a', [{ text: 'one' }, { text: 'two' }, { text: 'three' }])
  const created = get(db, 'a')
  assert.ok(
    created.every((r) => UUID.test(r._rowId)),
    'new rows are stamped on write'
  )
  // An ordinary edit and a reorder round-trip the stored rows, _rowId included.
  put(db, 'a', [{ ...created[2] }, { ...created[0], text: 'one (edited)' }, { ...created[1] }])
  assert.deepEqual(ids(get(db, 'a')), [created[2]._rowId, created[0]._rowId, created[1]._rowId])
  // Delete "two", then recreate it with the same text: a new row, a new id.
  put(db, 'a', [created[2], created[0]])
  put(db, 'a', [created[2], created[0], { text: 'two' }])
  const recreated = get(db, 'a')
  assert.equal(recreated[2].text, 'two')
  assert.notEqual(recreated[2]._rowId, created[1]._rowId)
  assert.ok(UUID.test(recreated[2]._rowId))
  // A pasted copy of an existing row is a new row too.
  put(db, 'a', [...recreated, { ...recreated[0] }])
  const copied = get(db, 'a')
  assert.equal(copied[0]._rowId, recreated[0]._rowId)
  assert.notEqual(copied[3]._rowId, recreated[0]._rowId)
  db.close()
})
test('nothing is refused: a revert that brings old rows back keeps their ids', () => {
  const db = fixture(),
    id = randomUUID()
  db.prepare('INSERT INTO ec_posts VALUES(?,?,?,?,?,NULL)').run(
    'a',
    JSON.stringify([{ _rowId: id, text: 'original' }]),
    'published',
    null,
    null
  )
  migrateIdentity(db)
  const before = get(db, 'a')
  put(db, 'a', [])
  put(db, 'a', before)
  assert.deepEqual(get(db, 'a'), before)
  // Revision payloads (drafts, autosave, native restore) are stamped the same way.
  db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?)').run(
    'restored',
    'posts',
    'a',
    JSON.stringify({ rows: [{ _rowId: id, text: 'restored' }, { text: 'added in a draft' }] }),
    'today'
  )
  const draft = JSON.parse(db.prepare("SELECT data FROM revisions WHERE id='restored'").get().data).rows
  assert.equal(draft[0]._rowId, id)
  assert.ok(UUID.test(draft[1]._rowId) && draft[1]._rowId !== id)
  // Values the reader cannot identify are left exactly as stored.
  put(db, 'a', ['not an object'])
  assert.deepEqual(get(db, 'a'), ['not an object'])
  db.close()
})
test('the old guard triggers are replaced, not kept beside the stamp', () => {
  const db = fixture()
  db.exec(
    `CREATE TRIGGER tracy_identity_posts_rows_update AFTER UPDATE ON ec_posts BEGIN SELECT RAISE(ABORT,'Repeater identity retired or owned elsewhere'); END`
  )
  migrateIdentity(db)
  db.prepare('INSERT INTO ec_posts VALUES(?,?,?,?,?,NULL)').run('a', '[]', 'draft', null, null)
  put(db, 'a', [{ text: 'fine' }])
  assert.ok(UUID.test(get(db, 'a')[0]._rowId))
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
    .all()
    .map((t) => t.name)
  assert.deepEqual(names, [
    'tracy_rowid_posts_rows_ai',
    'tracy_rowid_posts_rows_au',
    'tracy_rowid_posts_rows_rev_ai',
    'tracy_rowid_posts_rows_rev_au'
  ])
  db.close()
})
test('fork retries keep the new seed; same-site restore only rotates cursor epoch', () => {
  const db = fixture()
  migrateIdentity(db)
  const state = () => db.prepare('SELECT * FROM _tracy_content_identity').get(),
    before = state(),
    op = randomUUID()
  migrateIdentity(db, { newSite: true, operationId: op })
  const fork = state()
  assert.notEqual(fork.seed, before.seed)
  assert.notEqual(fork.epoch, before.epoch)
  migrateIdentity(db, { newSite: true, operationId: op })
  assert.deepEqual(state(), fork)
  migrateIdentity(db, { restore: true, operationId: randomUUID() })
  assert.equal(state().seed, fork.seed)
  assert.notEqual(state().epoch, fork.epoch)
  assert.throws(() => migrateIdentity(db, { newSite: true }), /operation UUID/)
  db.close()
})
test('a failed install rolls back everything and can retry', () => {
  const db = fixture()
  db.prepare('INSERT INTO ec_posts VALUES(?,?,?,?,?,NULL)').run('a', '[{}]', 'draft', null, null)
  db.exec("INSERT INTO _emdash_fields VALUES('g','c','Bad Name','repeater','{}',1)")
  assert.throws(() => migrateIdentity(db), /Invalid schema identifier/)
  assert.deepEqual(get(db, 'a'), [{}])
  assert.equal(
    db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='_tracy_content_identity'").get().n,
    0
  )
  db.exec("DELETE FROM _emdash_fields WHERE id='g'")
  assert.equal(migrateIdentity(db).changedRows, 1)
  db.close()
})
