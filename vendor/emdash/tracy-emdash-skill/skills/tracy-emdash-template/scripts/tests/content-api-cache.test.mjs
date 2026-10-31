// The reader keeps a read's source rows while the database provably has not changed. That may
// never change an answer: these tests compare every answer over kept rows, byte for byte, with the
// per-entry scan, prove that a second read neither calls the source nor projects the records
// again, and that a write anywhere a native read looks invalidates the kept rows while the writes
// routine traffic makes (token use, the scheduler's stamp) do not.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import {
  sourceRows,
  envelope,
  cachedRows,
  changeKey,
  changesWatched,
  ContentError,
  CHANGES_TABLE
} from '../tools/content-api/reader.mjs'
import { migrateIdentity } from '../tools/content-api/identity-sqlite.mjs'

const options = {
  mapping: {
    chrome: { collection: 'site', slug: 'site' },
    collections: {
      pages: { type: 'page', urlPattern: '/{slug}' },
      posts: { type: 'article', urlPattern: '/news/{slug}' },
      home: { type: 'page', urlPattern: '/' },
      site: { type: 'shared', urlPattern: null }
    }
  },
  types: [
    {
      name: 'pages',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'hero', type: 'image' }
      ]
    },
    { name: 'posts', fields: [{ name: 'title', type: 'text' }] },
    { name: 'home', fields: [{ name: 'title', type: 'text' }] },
    { name: 'site', fields: [{ name: 'title', type: 'text' }] }
  ],
  locales: ['en', 'fr'],
  defaultLocale: 'en'
}
const collections = Object.keys(options.mapping.collections)
// `home` has a reference field: its GET reads the relation tables, so no list item stands for it.
const plain = new Set(['pages', 'posts', 'site'])

// 2000 records as EmDash 1.1 maps a row; every 50th has a pending draft, every 70th is unpublished,
// every 11th has no translation group. The GET is EmDash's: draft overlay, then `references`.
function source({ stripDrafts = false } = {}) {
  const store = Object.fromEntries(collections.map((c) => [c, []]))
  const revisions = new Map()
  for (let n = 1; n <= 2000; n++) {
    const collection = n % 50 === 7 ? 'site' : n % 97 === 3 ? 'home' : n % 3 ? 'pages' : 'posts'
    const id = `01K${String(n).padStart(23, '0')}`
    const at = new Date(Date.UTC(2026, 8, 1) + n * 1000).toISOString()
    const draft = n % 50 === 0 ? `REV${id}` : null
    if (draft) revisions.set(draft, { title: `Draft ${n}` })
    store[collection].push({
      id,
      type: collection,
      slug: collection === 'site' ? 'site' : `entry-${n}`,
      status: n % 70 === 0 ? 'draft' : 'published',
      data: {
        title: `Entry ${n}`,
        ...(collection === 'pages' ? { hero: { id: `m${n}`, src: `/img/${n}.png`, alt: null } } : {})
      },
      authorId: null,
      primaryBylineId: null,
      createdAt: at,
      updatedAt: at,
      publishedAt: at,
      scheduledAt: null,
      liveRevisionId: `L${id}`,
      draftRevisionId: draft,
      version: 1,
      locale: n % 2 ? 'en' : 'fr',
      translationGroup: n % 11 === 0 ? null : `${collection}-${Math.ceil(n / 2)}`,
      seo: null,
      bylines: [],
      byline: null
    })
  }
  const calls = { list: 0, get: 0 }
  const wire = (value) => JSON.parse(JSON.stringify(value))
  const visible = (collection) =>
    store[collection].filter((e) => !stripDrafts || e.status === 'published').toReversed()
  return {
    store,
    calls,
    list: async (collection, cursor) => {
      calls.list++
      const all = visible(collection)
      const from = cursor ? Number(cursor) : 0
      return wire({
        items: all.slice(from, from + 100),
        nextCursor: from + 100 < all.length ? String(from + 100) : null,
        total: all.length
      })
    },
    get: async (collection, id) => {
      calls.get++
      let item = wire(store[collection].find((e) => e.id === id))
      if (item.translationGroup)
        item.references = plain.has(collection) ? {} : { project: { children: [{ id: `p-${id}` }] } }
      if (item.draftRevisionId) {
        const liveData = item.data
        item = { ...item, data: { ...liveData, ...revisions.get(item.draftRevisionId) }, liveData }
      }
      if (stripDrafts) {
        if (item.status !== 'published') throw new ContentError(503, 'CONTENT_SOURCE_UNAVAILABLE')
        if (item.liveData) item.data = item.liveData
        delete item.liveData
        delete item.draftRevisionId
      }
      return wire({ item, _rev: 'rev' })
    }
  }
}
// The scan before list items stood for GETs: one native GET per listed entry.
async function perEntryRows({ list, get }, published) {
  const rows = []
  for (const collection of collections) {
    let cursor
    do {
      const page = await list(collection, cursor)
      for (const entry of page.items) {
        const { item } = await get(collection, entry.id)
        if (published) {
          if (item.status !== 'published') continue
          item.data = item.liveData ?? item.data
          item.draftRevisionId = null
          delete item.liveData
        }
        rows.push({ collection, item })
      }
      cursor = page.nextCursor
    } while (cursor)
  }
  return rows
}

const key = 'fixture-only-not-a-production-secret'
const identity = { contentPrincipal: null, contentScope: 'published', user: 'u', role: 50, scopes: [] }
const origin = 'https://example.test'
const answer = (rows, q) => {
  const now = Date.now
  Date.now = () => 1790000000000
  try {
    const a = envelope(rows, q, options, identity, key, origin, 'seed')
    a.snapshot.readAt = null
    return JSON.stringify(a)
  } finally {
    Date.now = now
  }
}

test('the second read takes the kept rows: no native call, no record projected again', async () => {
  const s = source()
  const cache = new Map()
  const read = () =>
    sourceRows({
      collections,
      list: s.list,
      get: s.get,
      referenceFree: plain,
      published: true
    })
  const first = await cachedRows(cache, 'true:true', 'n:1:7', read)
  const calls = { ...s.calls }
  assert.equal(first.hit, false)
  const second = await cachedRows(cache, 'true:true', 'n:1:7', read)
  assert.equal(second.hit, true)
  assert.deepEqual(s.calls, calls, 'no native list or GET')
  assert.equal(second.rows, first.rows)
  assert.ok(Object.isFrozen(second.rows) && Object.isFrozen(second.rows[0].item.data))
  // Count the reads of each record's createdAt, which only a projection makes.
  let reads = 0
  const watched = Object.freeze(
    first.rows.map(({ collection, item }) =>
      Object.freeze({
        collection,
        item: new Proxy(item, { get: (t, k) => (k === 'createdAt' && reads++, t[k]) })
      })
    )
  )
  const id = JSON.parse(answer(watched, { limit: 1 })).contents[0].id
  const perRecord = reads / watched.length
  assert.ok(Number.isInteger(perRecord) && perRecord > 0, 'the first answer projects every record once')
  reads = 0
  answer(watched, { limit: 30 })
  assert.equal(reads, 0, 'a listing over kept rows projects nothing again')
  answer(watched, { id, limit: 30 })
  assert.equal(reads, perRecord, 'an id read projects only its own record, in full')
  // Another key, one slot per caller right, and no key at all.
  assert.equal((await cachedRows(cache, 'true:true', 'n:2:7', read)).hit, false)
  assert.equal((await cachedRows(cache, 'false:true', 'n:2:7', read)).hit, false)
  assert.equal((await cachedRows(cache, 'true:true', null, read)).hit, false)
  assert.equal((await cachedRows(cache, 'true:true', null, read)).hit, false)
  assert.equal(cache.has('true:true'), false)
})

test('answers over kept rows are byte-identical to fresh ones', async () => {
  for (const [published, stripDrafts] of [
    [true, false],
    [false, false],
    [true, true]
  ]) {
    const fresh = await perEntryRows(source({ stripDrafts }), published)
    const s = source({ stripDrafts })
    const cache = new Map()
    const read = () =>
      sourceRows({
        collections,
        list: s.list,
        get: s.get,
        referenceFree: plain,
        published
      })
    await cachedRows(cache, 'slot', 'k', read)
    const { rows, hit } = await cachedRows(cache, 'slot', 'k', read)
    assert.equal(hit, true)
    const probes = [
      { limit: 30 },
      { limit: 100 },
      { limit: 1, maxBytes: 8192 },
      ...['page', 'article', 'shared'].map((type) => ({ type, limit: 5 })),
      { locale: 'fr', limit: 7 }
    ]
    for (const q of probes) {
      // Twice over the kept rows: the first answer must not have altered the second.
      const want = answer(fresh, q)
      assert.equal(answer(rows, q), want)
      assert.equal(answer(rows, q), want)
      const cursor = JSON.parse(want).pagination.nextCursor
      if (cursor) assert.equal(answer(rows, { ...q, cursor }), answer(fresh, { ...q, cursor }))
    }
    for (const c of JSON.parse(answer(fresh, { limit: 100 })).contents.filter((_, i) => i % 4 === 0)) {
      const want = answer(fresh, { id: c.id, limit: 30 })
      assert.equal(answer(rows, { id: c.id, limit: 30 }), want)
      assert.equal(
        answer(rows, { id: c.id, limit: 1, maxBytes: 8192 }),
        answer(fresh, { id: c.id, limit: 1, maxBytes: 8192 })
      )
    }
  }
})

// A site database as the identity tool leaves it, with the tables a native read looks at and the
// ones routine traffic writes.
function site() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE _emdash_collections(id TEXT,slug TEXT,supports TEXT);
    CREATE TABLE _emdash_fields(id TEXT,collection_id TEXT,slug TEXT,type TEXT,options TEXT,translatable INTEGER);
    CREATE TABLE revisions(id TEXT,collection TEXT,entry_id TEXT,data TEXT,created_at TEXT);
    CREATE TABLE ec_posts(id TEXT PRIMARY KEY,title TEXT,status TEXT,draft_revision_id TEXT,deleted_at TEXT);
    CREATE TABLE _emdash_seo(collection TEXT,content_id TEXT,seo_title TEXT);
    CREATE TABLE _emdash_bylines(id TEXT,display_name TEXT);
    CREATE TABLE media(id TEXT,alt TEXT);
    CREATE TABLE options(name TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE _emdash_api_tokens(id TEXT,last_used_at TEXT);
    CREATE TABLE _emdash_redirect_state(id INTEGER,revision INTEGER);
    CREATE TABLE _emdash_media_usage_work(id TEXT);
    CREATE VIRTUAL TABLE _emdash_fts_posts USING fts5(title);
    INSERT INTO _emdash_collections VALUES('c','posts','[]');
    INSERT INTO ec_posts VALUES('a','A','published',NULL,NULL);
    INSERT INTO _emdash_api_tokens VALUES('t',NULL);
    INSERT INTO options VALUES('site:title','"S"'),('system:scheduler:last_completed_at','"x"');`)
  return db
}
const changes = (db) => ({
  counter: async () => db.prepare(`SELECT nonce,n FROM ${CHANGES_TABLE} WHERE id=1`).get(),
  schema: async () => db.prepare('SELECT schema_version FROM pragma_schema_version').get().schema_version,
  master: async () => db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master').all()
})

test('a write wherever a native read looks changes the key; routine bookkeeping does not', async () => {
  const db = site()
  const memo = { schema: null, watched: false }
  assert.equal(await changeKey(changes(db), memo), null, 'no counter yet: read fresh')
  migrateIdentity(db)
  const keyOf = () => changeKey(changes(db), memo)
  const start = await keyOf()
  assert.match(start, /^[0-9a-f]{32}:\d+:\d+$/)
  for (const routine of [
    "UPDATE _emdash_api_tokens SET last_used_at='now'",
    'UPDATE _emdash_redirect_state SET revision=1',
    "INSERT INTO _emdash_media_usage_work VALUES('w')",
    `UPDATE options SET value='"y"' WHERE name='system:scheduler:last_completed_at'`,
    "INSERT INTO _emdash_fts_posts VALUES('words')"
  ]) {
    db.exec(routine)
    assert.equal(await keyOf(), start, routine)
  }
  let last = start
  for (const write of [
    "UPDATE ec_posts SET title='B'",
    "INSERT INTO ec_posts VALUES('b','B','draft',NULL,NULL)",
    "DELETE FROM ec_posts WHERE id='b'",
    "INSERT INTO revisions VALUES('r','posts','a','{}','now')",
    'UPDATE revisions SET data=\'{"title":"C"}\'',
    "INSERT INTO _emdash_seo VALUES('posts','a','T')",
    "INSERT INTO _emdash_bylines VALUES('b','Ann')",
    "INSERT INTO media VALUES('m','alt')",
    `UPDATE options SET value='"T"' WHERE name='site:title'`,
    "INSERT INTO _emdash_fields VALUES('f','c','project','reference','{}',1)",
    'ALTER TABLE ec_posts ADD COLUMN summary TEXT'
  ]) {
    db.exec(write)
    const now = await keyOf()
    assert.notEqual(now, last, write)
    last = now
  }
  db.close()
})

test('a table without its triggers reads fresh until the identity tool runs again', async () => {
  const db = site()
  migrateIdentity(db)
  const memo = { schema: null, watched: false }
  assert.notEqual(await changeKey(changes(db), memo), null)
  db.exec('CREATE TABLE _emdash_new_feature(id TEXT)')
  assert.equal(await changeKey(changes(db), memo), null, 'a table created since')
  assert.equal(changesWatched(await changes(db).master()), false)
  migrateIdentity(db)
  assert.notEqual(await changeKey(changes(db), memo), null)
  db.exec('DROP TRIGGER "tracy_change_ec_posts_u"')
  assert.equal(await changeKey(changes(db), memo), null, 'a dropped trigger')
  db.exec(`CREATE TRIGGER "tracy_change_ec_posts_u" AFTER UPDATE ON "ec_posts" BEGIN SELECT 1; END`)
  assert.equal(await changeKey(changes(db), memo), null, 'a trigger that counts nothing')
  const rerun = migrateIdentity(db)
  assert.ok(rerun.watched > 5)
  const key = await changeKey(changes(db), memo)
  assert.notEqual(key, null)
  db.exec("UPDATE ec_posts SET title='Z'")
  assert.notEqual(await changeKey(changes(db), memo), key, 'the replaced trigger counts')
  // A recreated counter row is a new nonce, so a count that comes round again is still new.
  db.exec(`DELETE FROM ${CHANGES_TABLE}`)
  assert.equal(await changeKey(changes(db), memo), null)
  migrateIdentity(db)
  assert.notEqual((await changeKey(changes(db), memo)).split(':')[0], key.split(':')[0])
  db.close()
})
