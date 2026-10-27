// An EmDash site's SQLite, read with an engine that can parse the site's schema (ADR 0024, QA-I01).
//
// Run by lib/site-backup.sh with `node --no-warnings`, never sourced. Why node and not the
// host's python3: EmDash writes its database with a recent SQLite (better-sqlite3, 3.53 on
// 02/10/2026) and its schema uses syntax an older engine refuses — the tracy-host image's Debian
// python3 links SQLite 3.40, which answered "malformed database schema (…) near ORDER" on every
// EmDash site, so the Initial backup silently stood as a file backup. node:sqlite ships its own
// SQLite with each Node release (24.21: 3.53.4), the same line EmDash's runtime follows.
//
//   backup <src> <dst>   online backup of a live database (WAL included, never the raw file), then
//                        `check` on the copy; prints its table count
//   check <file>         integrity_check must answer "ok"; prints the table count
//
// Exit 0 with the count as the last line of stdout; anything else is a failure with one line on
// stderr. Never prints a row.
import { backup, DatabaseSync } from 'node:sqlite'

const TABLES = "select count(*) as n from sqlite_master where type='table' and name not like 'sqlite_%'"

function check(file) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const ok = db.prepare('pragma integrity_check').get()
    const verdict = ok ? Object.values(ok)[0] : null
    if (verdict !== 'ok') throw new Error(`integrity_check: ${verdict}`)
    return db.prepare(TABLES).get().n
  } finally {
    db.close()
  }
}

const [op, a, b] = process.argv.slice(2)
try {
  if (op === 'backup' && a && b) {
    const src = new DatabaseSync(a, { readOnly: true, timeout: 30_000 })
    try {
      await backup(src, b)
    } finally {
      src.close()
    }
    // The copy inherits EmDash's WAL mode; a read-only check of a WAL file leaves -wal/-shm beside
    // it (QA r2: `.v1.sqlite.tmp-shm` in backups/). One self-contained file is what a dump is.
    const dst = new DatabaseSync(b)
    try {
      dst.exec('pragma journal_mode=delete')
    } finally {
      dst.close()
    }
    console.log(check(b))
  } else if (op === 'check' && a) {
    console.log(check(a))
  } else {
    console.error('usage: sqlite-tool.mjs backup <src> <dst> | check <file>')
    process.exit(2)
  }
} catch (e) {
  console.error(String(e?.message ?? e).split('\n')[0])
  process.exit(1)
}
