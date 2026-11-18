// tools/state-residue.mjs, the check tools/release.mjs runs on the state before it is packed: a state equal to a fresh seed
// passes; the QA leftovers JA Diner 0.1.2 shipped (independent review, 16/11/2026) are each named.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { stateResidue } from '../tools/state-residue.mjs'

const rev = (version, at) => Buffer.from(`${version}:${at}`).toString('base64')
const SEEDED_AT = '2026-11-16T03:00:26.059Z'

/** A state as a fresh seed leaves it: one post at the version its receipt names, its seed revision, the forms. */
function freshState() {
  const db = new Database(':memory:')
  db.exec(`
    create table _plugin_storage (plugin_id text, collection text, id text, data text);
    create table options (name text primary key, value text);
    create table revisions (id text primary key, collection text, entry_id text, data text, created_at text);
    create table ec_posts (id text primary key, version integer, updated_at text, title text);
    insert into _plugin_storage values ('emdash-forms', 'forms', 'contact', '{}'), ('emdash-forms', 'forms', 'subscribe', '{}');
    insert into options values ('emdash:exclusive_hook:email:deliver', '"emdash-smtp"');
    insert into ec_posts values ('P1', 4, '${SEEDED_AT}', 'Seeded');
    insert into revisions values ('R1', 'posts', 'P1', '{"title":"Seeded"}', '2026-11-16 03:00:26');
  `)
  const sql = (q) =>
    db
      .prepare(q)
      .raw()
      .all()
      .map((r) => r.join('|'))
      .join('\n')
  const receipts = { entries: { 'posts/seeded/en': { id: 'P1', rev: rev(4, SEEDED_AT) } } }
  return { db, sql, receipts }
}

test('a state equal to a fresh seed has no residue (the seed sets the mail hook, not a mail provider)', () => {
  const { sql, receipts } = freshState()
  assert.deepEqual(stateResidue(sql, receipts), [])
})

test('form submissions and the mail log a gate left are named', () => {
  const { db, sql, receipts } = freshState()
  db.exec(`insert into _plugin_storage values ('emdash-forms', 'submissions', 's1', '{}'), ('emdash-forms', 'submissions', 's2', '{}'),
    ('emdash-smtp', 'deliveryLogs', 'l1', '{}')`)
  assert.deepEqual(stateResidue(sql, receipts), [
    '_plugin_storage emdash-forms/submissions: 2 row(s) a seed does not write',
    '_plugin_storage emdash-smtp/deliveryLogs: 1 row(s) a seed does not write'
  ])
})

test('the mail settings of the build machine are named', () => {
  const { db, sql, receipts } = freshState()
  db.exec(`insert into options values ('plugin:emdash-smtp:settings:provider:generic', '{"host":"127.0.0.1","port":1025}'),
    ('plugin:emdash-smtp:state:lastTestResult', '{"status":"sent"}')`)
  assert.deepEqual(stateResidue(sql, receipts), [
    'option plugin:emdash-smtp:settings:provider:generic: mail settings of the build machine',
    'option plugin:emdash-smtp:state:lastTestResult: mail settings of the build machine'
  ])
})

test('a post edited and restored after the seed reads as an editor mark', () => {
  const { db, sql, receipts } = freshState()
  db.exec(`update ec_posts set version = 10, updated_at = '2026-11-16T03:38:26.000Z';
    insert into revisions values ('R2', 'posts', 'P1', '{"title":"Edited in admin 1"}', '2026-11-16 03:38:26')`)
  assert.deepEqual(stateResidue(sql, receipts), [
    'posts/seeded/en: live version 10, the seed wrote 4 (an edit after the seed)'
  ])
})

test('a revision written after the seed is named even when the entry is back at its seeded version', () => {
  const { db, sql, receipts } = freshState()
  db.exec(
    `insert into revisions values ('R2', 'posts', 'P1', '{"title":"Recovery 1"}', '2026-11-16 03:38:11')`
  )
  assert.deepEqual(stateResidue(sql, receipts), ['posts/seeded/en: 1 revision(s) written after the seed'])
})

test('a receipted entry the state no longer holds is named', () => {
  const { db, sql, receipts } = freshState()
  db.exec(`delete from ec_posts`)
  assert.deepEqual(stateResidue(sql, receipts), ['posts/seeded/en: the receipted entry is gone'])
})
