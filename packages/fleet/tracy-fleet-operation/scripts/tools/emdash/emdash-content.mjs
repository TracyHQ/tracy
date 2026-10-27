#!/usr/bin/env node
/**
 * The emdash adapter: `data.db` ⇄ `SiteContent/`. Runs ON the fleet host, beside the database.
 *
 * ## Use
 *
 *   emdash-content.mjs export <siteFolder> [dbPath] [--prune]
 *   emdash-content.mjs apply  <siteFolder> [dbPath] [--dry-run]
 *
 * `dbPath` defaults to `<siteFolder>/.webroot/data/data.db`, which is where the lane mounts it.
 *
 * ## Why this exists
 *
 * WordPress and Joomla keep a site in files, so mounting the webroot is the whole job. emdash does
 * not: its site IS `data.db`, and an agent editing a Markdown file next to it changes nothing at
 * all. Committing the database instead would make every one-word edit a fresh 1.4 MB blob whose
 * diff answers no question — the history would grow while tracking nothing. So the words are
 * projected out, tracked as words, and written back deliberately.
 *
 * ## APPLY REACHES THE PUBLIC SITE, IMMEDIATELY
 *
 * A fleet-born emdash site has no Preview standing in front of it (ADR 0086). What this writes is
 * live. Three things follow, and none of them are optional:
 *
 * 1. **All or nothing.** One file that cannot be read back cancels the whole run. A partial apply
 *    across a set of posts is the state nobody can reason about afterwards.
 * 2. **Refusals are loud and specific.** Every rejected file is named with its reason, and the exit
 *    code is non-zero. A silent skip on a public site is the failure this adapter exists to prevent.
 * 3. **`--dry-run` says exactly what would change** without opening a write transaction.
 *
 * ## What it does not touch
 *
 * `version`, `live_revision_id` and `draft_revision_id` are emdash's own bookkeeping, and writing
 * them from a text file would rewrite a history this tool does not understand. `updated_at` IS set,
 * because a row whose words changed while its timestamp did not is a row every cache downstream
 * will keep serving stale.
 *
 * Full-text search needs no help: `ec_posts` and `ec_pages` carry insert/update/delete triggers
 * into `_emdash_fts_*` (measured 02/09 on `tchemdash1`), so a plain UPDATE reindexes the row.
 */

import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

import { COLLECTIONS, changesFrom, fileFor, pathFor } from './mirror.mjs'
import { splitFile } from './frontmatter.mjs'

/**
 * The columns the mirror reads, in the order the front matter presents them.
 *
 * THE TWO TABLES ARE NOT THE SAME SHAPE. `ec_posts` has `excerpt` and `featured_image`;
 * `ec_pages` has neither (measured 02/09 on `tchemdash1`). So the list is intersected with what the
 * table actually declares rather than written out once — a fixed list throws `no such column` at
 * runtime, and only on a site that has pages, which is the kind of bug that ships.
 */
const WANTED = [
  'id',
  'slug',
  'status',
  'locale',
  'title',
  'excerpt',
  'featured_image',
  'published_at',
  'updated_at',
  'version',
  'content'
]

function columnsFor(db, table) {
  const present = new Set(
    db
      .prepare(`pragma table_info(${table})`)
      .all()
      .map((c) => c.name)
  )
  return WANTED.filter((name) => present.has(name)).join(', ')
}

function liveRows(db, table) {
  return db.prepare(`select ${columnsFor(db, table)} from ${table} where deleted_at is null`).all()
}

async function readIfPresent(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

async function listMarkdown(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.md')).sort()
  } catch {
    return []
  }
}

async function runExport(siteFolder, dbPath, { prune }) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let written = 0
  let unchanged = 0
  const wanted = new Set()

  for (const { table, dir } of COLLECTIONS) {
    for (const row of liveRows(db, table)) {
      const relative = pathFor(dir, { ...row, collection: dir })
      wanted.add(relative)
      const target = path.join(siteFolder, relative)
      const next = fileFor({ ...row, collection: dir })
      // Written only when the bytes differ: an export that rewrites every file each run churns the
      // diff and makes the one post that changed impossible to see.
      if ((await readIfPresent(target)) === next) {
        unchanged++
        continue
      }
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, next, 'utf8')
      written++
      console.log(`  + ${relative}`)
    }
  }
  db.close()

  // A file with no row behind it: the post was deleted in emdash, or the file was hand-made. Named,
  // never removed by default — deleting a person's file because a query did not return it is the
  // kind of help nobody asks for twice.
  const orphans = []
  for (const { dir } of COLLECTIONS) {
    for (const name of await listMarkdown(path.join(siteFolder, 'SiteContent', dir))) {
      const relative = `SiteContent/${dir}/${name}`
      if (!wanted.has(relative)) orphans.push(relative)
    }
  }
  for (const relative of orphans) {
    if (prune) {
      await unlink(path.join(siteFolder, relative))
      console.log(`  - ${relative}`)
    } else {
      console.log(`  ? ${relative} — no row behind it (rerun with --prune to remove)`)
    }
  }

  console.log(`export: ${written} written, ${unchanged} unchanged, ${orphans.length} orphaned`)
  return 0
}

async function runApply(siteFolder, dbPath, { dryRun }) {
  const db = new DatabaseSync(dbPath)
  const rowsById = new Map()
  for (const { table, dir } of COLLECTIONS) {
    for (const row of liveRows(db, table)) rowsById.set(row.id, { row, table, dir })
  }

  const planned = []
  const refused = []

  for (const { dir } of COLLECTIONS) {
    for (const name of await listMarkdown(path.join(siteFolder, 'SiteContent', dir))) {
      const relative = `SiteContent/${dir}/${name}`
      const contents = await readFile(path.join(siteFolder, relative), 'utf8')
      const id = splitFile(contents).data.id
      const found = id ? rowsById.get(id) : null
      if (!found) {
        refused.push({ relative, reason: id ? 'no_such_row' : 'no_id_in_frontmatter' })
        continue
      }
      const result = changesFrom(contents, found.row)
      if (!result.ok) {
        refused.push({ relative, reason: result.reason })
        continue
      }
      if (Object.keys(result.changes).length > 0)
        planned.push({ ...found, relative, changes: result.changes })
    }
  }

  for (const { relative, reason } of refused) console.error(`  ✗ ${relative}: ${reason}`)
  for (const { relative, changes } of planned)
    console.log(`  → ${relative}: ${Object.keys(changes).join(', ')}`)

  // ALL OR NOTHING. A partial apply over a set of posts leaves a public site in a state nobody
  // planned, and no later run can tell which half it is looking at.
  if (refused.length > 0) {
    db.close()
    console.error(`apply: refused — ${refused.length} file(s) unreadable, nothing written`)
    return 1
  }
  if (dryRun || planned.length === 0) {
    db.close()
    console.log(`apply: ${planned.length} row(s) would change${dryRun ? ' (dry run)' : ', nothing to do'}`)
    return 0
  }

  const now = new Date().toISOString()
  db.exec('begin')
  try {
    for (const { table, relative, row, changes } of planned) {
      const fields = [...Object.keys(changes), 'updated_at']
      const values = [...Object.keys(changes).map((k) => changes[k]), now, row.id]
      db.prepare(`update ${table} set ${fields.map((f) => `${f} = ?`).join(', ')} where id = ?`).run(
        ...values
      )
      console.log(`  ✓ ${relative}`)
    }
    db.exec('commit')
  } catch (error) {
    db.exec('rollback')
    db.close()
    console.error(`apply: rolled back — ${String(error)}`)
    return 1
  }
  db.close()
  console.log(`apply: ${planned.length} row(s) written`)
  return 0
}

const [verb, siteFolder, ...rest] = process.argv.slice(2)
const flags = new Set(rest.filter((a) => a.startsWith('--')))
const dbPath = rest.find((a) => !a.startsWith('--')) ?? path.join(siteFolder ?? '', '.webroot/data/data.db')

if (!siteFolder || (verb !== 'export' && verb !== 'apply')) {
  console.error('use: emdash-content.mjs export|apply <siteFolder> [dbPath] [--prune|--dry-run]')
  process.exit(2)
}

process.exit(
  verb === 'export'
    ? await runExport(siteFolder, dbPath, { prune: flags.has('--prune') })
    : await runApply(siteFolder, dbPath, { dryRun: flags.has('--dry-run') })
)
