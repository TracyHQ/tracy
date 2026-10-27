// Database migrations of tracy-web: the numbered .sql files `migrate()` applies in name order
// (apps/tracy-web/src/db/index.js: `readdir(dir).filter((f) => f.endsWith('.sql')).sort()`, top level only).
// One item per file the migrator would apply. Anything else in the folder is reported, never guessed at:
// a nested .sql (the migrator does not descend), a symlink, a FIFO or device, a name outside `NNN-name.sql`.
// What a file creates or alters is read lexically (a regex over the SQL, comments stripped): a fact for a
// reader, not a parse. A file larger than MAX_SQL_BYTES is listed with its hash and no table names.
import { readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { cli, guardParents, isMain, listFiles, readSource, record, SourceError } from './common.mjs'

const DIR = 'apps/tracy-web/src/db/migrations'
const NAME = /^(\d{3})-([a-z0-9][a-z0-9-]*)\.sql$/
export const MAX_SQL_BYTES = 512 * 1024
export const MAX_MIGRATIONS = 2000

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
const names = (sql, re) =>
  [...new Set([...sql.matchAll(re)].map((m) => m[1].replaceAll('"', '').toLowerCase()))].sort()

/** Table names a migration creates and alters, read lexically. */
export function tablesOf(sql) {
  const body = stripComments(sql)
  return {
    creates: names(body, /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)/gi),
    alters: names(body, /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?("?[\w.]+"?)/gi)
  }
}

export const def = {
  sourcePath: `${DIR}/*.sql`,
  extractionKind: 'directory-listing + lexical-sql',
  extract(root) {
    const unresolved = []
    // The entries of the folder itself: this is what the migrator lists. Everything it would not apply, or
    // would choke on, is named here.
    // guardParents refuses a symlinked folder on the way (the listing below would follow it).
    const dir = dirname(guardParents(root, `${DIR}/_`, false))
    const top = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
    if (top.length > MAX_MIGRATIONS)
      throw new SourceError(`${DIR} holds ${top.length} entries, more than ${MAX_MIGRATIONS}`)
    const applied = new Set()
    for (const entry of top) {
      const rel = `${DIR}/${entry.name}`
      if (entry.isSymbolicLink()) continue // listFiles reports it as skipped
      if (entry.isDirectory()) continue // nested files are reported below
      if (!entry.isFile()) {
        // The migrator would try to read it (a FIFO would hang it); what it holds is unknown here.
        if (entry.name.endsWith('.sql'))
          unresolved.push({ kind: 'migration-not-a-regular-file', detail: rel, blocksComplete: true })
        continue
      }
      if (entry.name.endsWith('.sql')) applied.add(rel)
    }
    const { files, skipped } = listFiles(root, DIR, (f) => f.endsWith('.sql'))
    // A symlinked .sql IS applied by the migrator, and is not read here: an item is hidden.
    for (const s of skipped)
      unresolved.push({
        kind: 'symlink-skipped',
        detail: s,
        ...(s.endsWith('.sql') ? { blocksComplete: true } : {})
      })
    const read = []
    const items = []
    const numbers = new Map()
    for (const rel of files) {
      if (!applied.has(rel)) {
        unresolved.push({
          kind: 'migration-in-subfolder',
          detail: `${rel}: migrate() lists the folder itself and never applies this file`
        })
        continue
      }
      const file = rel.slice(DIR.length + 1)
      const match = NAME.exec(file)
      if (!match) unresolved.push({ kind: 'migration-name-unrecognised', detail: rel })
      // readSource refuses a symlink, a FIFO, a file that changes while read and one past the reader's own ceiling.
      const src = readSource(root, rel)
      read.push(src)
      const size = Buffer.byteLength(src.text)
      const tablesRead = size <= MAX_SQL_BYTES
      const tables = tablesRead ? tablesOf(src.text) : { creates: [], alters: [] }
      if (!tablesRead)
        unresolved.push({
          kind: 'migration-too-large',
          detail: `${rel}: ${size} bytes, more than ${MAX_SQL_BYTES}; its tables are not read`
        })
      else if (src.text.trim() === '') unresolved.push({ kind: 'migration-empty', detail: rel })
      const number = match ? match[1] : null
      if (number !== null) numbers.set(number, [...(numbers.get(number) ?? []), file])
      items.push({
        id: `migration:${file}`,
        kind: 'migration',
        file: rel,
        number,
        creates: tables.creates,
        alters: tables.alters,
        tablesRead
      })
    }
    // Two files with one number are applied in name order; that is allowed, and worth seeing.
    const shared = [...numbers].filter(([, list]) => list.length > 1)
    for (const item of items) item.sharesNumber = shared.some(([n]) => n === item.number)
    return record({
      sourcePath: this.sourcePath,
      read,
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root,
      notes: {
        appliedBy:
          'apps/tracy-web/src/db/index.js migrate(): top-level *.sql in name order, one transaction each',
        highestNumber: [...numbers.keys()].sort().at(-1) ?? null,
        sharedNumbers: Object.fromEntries(shared),
        tables: 'creates/alters are a lexical read of the SQL, not a parse'
      }
    })
  }
}
if (isMain(import.meta.url)) cli(def)
