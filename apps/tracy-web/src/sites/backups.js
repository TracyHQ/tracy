/**
 * BACKUPS — what each restore point holds, as tracy-web hands it to a client (ADR 0024
 * `docs/adr/0024-backup-is-a-complete-restore-point.md`, plan `tasks/todo-backup.md` §2).
 *
 * A point is a backup tag (`tracy-release/vN`: the prefix the points were first numbered under, kept
 * because it is data on every site) on the site's webroot history. From ADR 0024 on the host also
 * dumps the site's database in the same job and says, per point, what it holds:
 *
 *   host (backup row of `webroot-history`, and the answer of `webroot-backup`):
 *     database: {engine, bytes, sha256, ok, reason?} | null
 *       null      the point has no database (a tag made before ADR 0024)
 *       ok:true   the dump is on the host and its sha256 matches the tag's trailer
 *       ok:false  the tag names a dump that is gone or does not match (`reason`)
 *     (the key ABSENT: a host that predates ADR 0024 — it cannot tell)
 *
 *   client (`database` on each backup row of `/backups`, and on the `POST /backup` answer):
 *     {state: 'full' | 'missing' | 'none' | 'unknown-host', engine, sha256, size, reason?}
 *
 * 🔒 A POINT IS `full` ONLY WHEN THE HOST PROVED IT. "Restore everything" is offered and accepted
 * only for `full`; every other state is a file backup at most (ADR 0024 sub-decision 1: never call a
 * point a full backup that cannot prove it has a database). No dump byte ever reaches a client:
 * only its engine, size and hash.
 */

/** The states a point's database may be in, for a client. */
export const DATABASE_STATES = ['full', 'missing', 'none', 'unknown-host']
/** Why a named dump is not usable, as the host may say it. */
const REASONS = new Set(['missing', 'mismatch', 'removed'])
/** The engines a host dumps (ADR 0024: MariaDB for WordPress/Joomla, SQLite for EmDash). */
const ENGINES = new Set(['mariadb', 'mysql', 'sqlite'])
/** Marks the host may set on a point it made by itself (ADR 0024 sub-decision 2). */
const AUTO_MARKS = new Set(['pre-restore'])

const SHA256 = /^[0-9a-f]{64}$/

/**
 * A point's `database` for a client, from what the host reported.
 * @param {Record<string, unknown>} row the host's backup row or backup answer
 * @returns {{state: 'full'|'missing'|'none'|'unknown-host', engine: string|null, sha256: string|null,
 *   size: number|null, reason?: string}}
 */
export function databaseOf(row) {
  const empty = { engine: null, sha256: null, size: null }
  if (!row || typeof row !== 'object' || !Object.hasOwn(row, 'database'))
    return { state: 'unknown-host', ...empty }
  const db = /** @type {any} */ (row).database
  if (db === null || typeof db !== 'object') return { state: 'none', ...empty }
  const engine = typeof db.engine === 'string' && ENGINES.has(db.engine) ? db.engine : null
  const sha256 = typeof db.sha256 === 'string' && SHA256.test(db.sha256) ? db.sha256 : null
  const size = Number.isSafeInteger(db.bytes) && db.bytes >= 0 ? db.bytes : null
  // `full` needs the host's own proof AND the facts that prove it: an `ok` without a hash is not one.
  if (db.ok === true && sha256 !== null) return { state: 'full', engine, sha256, size }
  const reason = typeof db.reason === 'string' && REASONS.has(db.reason) ? db.reason : undefined
  return { state: 'missing', engine, sha256, size, ...(reason ? { reason } : {}) }
}

/**
 * The host's `webroot-history` rows with each backup row's `database` (and `auto` mark) in the
 * client's shape. Other rows pass through as they were: fields are only ever added.
 * @param {unknown[]} rows
 */
export function withDatabases(rows) {
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || /** @type {any} */ (row).kind !== 'backup') return row
    const r = /** @type {Record<string, unknown>} */ (row)
    const { database: _raw, auto, ...rest } = r
    return {
      ...rest,
      database: databaseOf(r),
      ...(typeof auto === 'string' && AUTO_MARKS.has(auto) ? { auto } : {})
    }
  })
}

/**
 * The row of backup `version`, or null. A point is named by its version, not its commit:
 * two tags can sit on one commit (v1 on the baseline, a later backup with nothing changed since),
 * and only one of them may hold a database.
 * @param {unknown[]} rows the host's `webroot-history` rows
 * @param {number} version
 */
export function pointOf(rows, version) {
  for (const row of rows) {
    const r = /** @type {any} */ (row)
    if (r?.kind === 'backup' && r.version === version && typeof r.sha === 'string') return r
  }
  return null
}
