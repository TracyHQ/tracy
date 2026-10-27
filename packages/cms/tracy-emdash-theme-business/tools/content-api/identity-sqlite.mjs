// Explicit offline SQLite identity installation. Never imported by a GET route.
import { DatabaseSync } from 'node:sqlite'
import { randomUUID, randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ident = (s) => {
  if (!/^[a-z][a-z0-9_]*$/.test(s)) throw Error('Invalid schema identifier')
  return '"' + s + '"'
}
const lit = (s) => "'" + s.replaceAll("'", "''") + "'"
// Repeater row identity, option A: a row keeps the `_rowId` it carries for its whole life; a row
// that arrives without a usable one (added, or deleted and recreated) is a new row and gets a
// fresh UUID v4. Stock EmDash keeps unknown row keys (repeater rows are `.loose()`), so ordinary
// edits and reorders that round-trip the row keep it. Nothing is ever rejected: a write that
// brings back an old `_rowId` (native restore, `personalize --revert`) keeps that id.
const newUuid = `lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-'||substr('89ab',1+abs(random())%4,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))`
const rowId = (alias) => `json_extract(${alias}.value,'$._rowId')`
const valid = (u) =>
  `(typeof(${u})='text' AND length(${u})=36 AND length(replace(${u},'-',''))=32 AND ${u} NOT GLOB '*[^0-9a-f-]*' AND substr(${u},9,1)='-' AND substr(${u},14,2)='-4' AND substr(${u},19,1)='-' AND substr(${u},20,1) IN ('8','9','a','b') AND substr(${u},24,1)='-')`
// The first valid occurrence keeps its id; a later copy of it is a new row.
const keeps = (rows) =>
  `(${valid(rowId('j'))} AND NOT EXISTS(SELECT 1 FROM json_each(${rows}) k WHERE k.key<j.key AND ${rowId('k')}=${rowId('j')}))`
// Only arrays of objects are stamped; anything else is left as stored and the reader reports it.
const needs = (rows) =>
  `(json_type(${rows})='array' AND NOT EXISTS(SELECT 1 FROM json_each(${rows}) e WHERE e.type<>'object') AND EXISTS(SELECT 1 FROM json_each(${rows}) j WHERE NOT ${keeps(rows)}))`
const stamped = (rows) =>
  `(SELECT json_group_array(json_set(j.value,'$._rowId',CASE WHEN ${keeps(rows)} THEN ${rowId('j')} ELSE ${newUuid} END) ORDER BY j.key) FROM json_each(${rows}) j)`
export function migrateIdentity(
  db,
  { newSite = false, operationId = null, restore = false, repeaters = true } = {}
) {
  db.exec('PRAGMA busy_timeout=10000')
  db.exec('BEGIN IMMEDIATE')
  const result = { changedRows: 0, changedRevisions: 0, fields: [], newSite }
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS _tracy_content_identity (id INTEGER PRIMARY KEY CHECK(id=1), seed TEXT NOT NULL, version INTEGER NOT NULL, epoch TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _tracy_identity_operations (id TEXT PRIMARY KEY, kind TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _tracy_identity_fields (collection TEXT NOT NULL, field TEXT NOT NULL, PRIMARY KEY(collection,field));`)
    db.prepare('INSERT OR IGNORE INTO _tracy_content_identity VALUES(1,?,1,?)').run(
      randomBytes(32).toString('hex'),
      randomUUID()
    )
    if (newSite || restore) {
      if (typeof operationId !== 'string' || !uuid.test(operationId))
        throw Error('Fork/restore requires an authoritative operation UUID')
      const kind = newSite ? 'fork' : 'restore',
        previous = db.prepare('SELECT kind FROM _tracy_identity_operations WHERE id=?').get(operationId)
      if (previous && previous.kind !== kind) throw Error('Operation ID reused for a different action')
      if (!previous) {
        if (newSite)
          db.prepare('UPDATE _tracy_content_identity SET seed=?,epoch=? WHERE id=1').run(
            randomBytes(32).toString('hex'),
            randomUUID()
          )
        else db.prepare('UPDATE _tracy_content_identity SET epoch=? WHERE id=1').run(randomUUID())
        db.prepare('INSERT INTO _tracy_identity_operations VALUES(?,?)').run(operationId, kind)
      }
    }
    const fields = repeaters
      ? db
          .prepare(
            `SELECT c.slug collection,f.slug field FROM _emdash_fields f JOIN _emdash_collections c ON c.id=f.collection_id WHERE f.type='repeater' ORDER BY c.slug,f.slug`
          )
          .all()
      : []
    for (const f of fields) {
      const table = ident('ec_' + f.collection),
        column = ident(f.field),
        path = lit('$.' + f.field),
        own = lit(f.collection),
        name = (suffix) => ident(`tracy_rowid_${f.collection}_${f.field}_${suffix}`)
      // Retire the guard triggers of the earlier experiment (they rejected retired ids).
      for (const event of ['insert', 'update', 'delete'])
        db.exec(`DROP TRIGGER IF EXISTS ${ident(`tracy_identity_${f.collection}_${f.field}_${event}`)}`)
      for (const suffix of ['ai', 'au', 'rev_ai', 'rev_au']) db.exec(`DROP TRIGGER IF EXISTS ${name(suffix)}`)
      // Live columns, then the revision payloads that drafts, autosave and publish go through.
      const live = `UPDATE ${table} SET ${column}=${stamped('NEW.' + column)} WHERE id=NEW.id;`
      db.exec(
        `CREATE TRIGGER ${name('ai')} AFTER INSERT ON ${table} WHEN ${needs('NEW.' + column)} BEGIN ${live} END`
      )
      db.exec(
        `CREATE TRIGGER ${name('au')} AFTER UPDATE OF ${column} ON ${table} WHEN ${needs('NEW.' + column)} BEGIN ${live} END`
      )
      const payload = `json_extract(NEW.data,${path})`
      const revision = `UPDATE revisions SET data=json_set(data,${path},${stamped(payload)}) WHERE id=NEW.id;`
      db.exec(
        `CREATE TRIGGER ${name('rev_ai')} AFTER INSERT ON revisions WHEN NEW.collection=${own} AND ${needs(payload)} BEGIN ${revision} END`
      )
      db.exec(
        `CREATE TRIGGER ${name('rev_au')} AFTER UPDATE OF data ON revisions WHEN NEW.collection=${own} AND ${needs(payload)} BEGIN ${revision} END`
      )
      // Stamp what is already stored through the same triggers: no second implementation.
      result.changedRows += db
        .prepare(`UPDATE ${table} SET ${column}=${column} WHERE ${needs(column)}`)
        .run().changes
      result.changedRevisions += db
        .prepare(
          `UPDATE revisions SET data=data WHERE collection=? AND ${needs(`json_extract(data,${path})`)}`
        )
        .run(f.collection).changes
      db.prepare('INSERT OR IGNORE INTO _tracy_identity_fields VALUES(?,?)').run(f.collection, f.field)
      result.fields.push(f.collection + '.' + f.field)
    }
    db.exec('COMMIT')
    return result
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, path, operationId] = process.argv.slice(2)
  if (!['init', 'fork', 'restore'].includes(command) || !path)
    throw Error('Usage: identity-sqlite.mjs init|fork|restore <SQLite file> [operation UUID]')
  const db = new DatabaseSync(path)
  try {
    console.log(
      JSON.stringify(
        migrateIdentity(db, { newSite: command === 'fork', restore: command === 'restore', operationId })
      )
    )
  } finally {
    db.close()
  }
}
