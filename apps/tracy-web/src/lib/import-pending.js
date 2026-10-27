/**
 * Whether an imported site is still waiting for its import to finish — ONE rule for every door that
 * decides whether a site may be opened as a workspace (landing on `/`, a named site path, the
 * `tracy_site` pointer, `POST /api/sites/:key/agent`, `GET /api/sites`).
 *
 * 🔒 THE RULE: a row with `origin = 'migrated'` for which no `provision` job was filed since the row
 * was written, and no port was ever recorded. An import claims its row BEFORE the read
 * (`POST /api/sites {origin:'import'}`), and the host folder is built only by the provision the
 * wizard files when the read is done (`POST /api/sites/:key/provision`, which writes that job). A
 * read that failed or was abandoned keeps its row on purpose, so Retry can reuse it (#1578), and
 * that row is an accepted seat with no folder behind it: dsh answers `workspace/invalid-path`.
 *
 * - `attached` is NOT proof: `/attach` (the Start the agent door) sets it too, and on such a row it
 *   only made an empty skeleton folder.
 * - Only a `provision` job counts, the same one `provisionedInPlace` reads (`sites/store.js`): a
 *   job of another kind says nothing about a copy being built.
 * - Jobs older than the row belong to a deleted site under the same name (`provisionedInPlace`).
 * - `port is null` keeps a row that a host already built, but whose job is not on record, from ever
 *   reading as unfinished: the port is written only from a finished provision's answer (the job
 *   poll and `cron.js`'s provision sweep).
 *
 * A filed provision that later failed is a failed BUILD, not an unfinished import: it has a job,
 * the build console and My Sites already speak for it, and its claim is no longer retryable.
 */

/**
 * The rule as one SQL condition on a `site` row named `alias`, for a batch read.
 * @param {string} alias - the table alias of `site` in the caller's query.
 * @returns {string}
 */
export function importPendingSql(alias) {
  return `(${alias}.origin = 'migrated' and ${alias}.port is null and not exists (
    select 1 from job j where j.site_key = ${alias}.site_key and j.kind = 'provision'
      and j.created_at >= ${alias}.created_at))`
}

/**
 * Of `siteKeys`, the ones whose import is not finished.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string[]} siteKeys
 * @returns {Promise<Set<string>>}
 */
export async function importPendingKeys(db, siteKeys) {
  if (siteKeys.length === 0) return new Set()
  const { rows } = await db.query(
    `select s.site_key from site s where s.site_key = any($1::text[]) and ${importPendingSql('s')}`,
    [siteKeys]
  )
  return new Set(rows.map((row) => row.site_key))
}

/**
 * Whether this one site's import is not finished. False for a site the book does not hold.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} siteKey
 * @returns {Promise<boolean>}
 */
export async function importPending(db, siteKey) {
  return (await importPendingKeys(db, [siteKey])).has(siteKey)
}

/** The refusal a door answers for a site whose import is not finished. */
export const IMPORT_NOT_FINISHED = 'IMPORT_NOT_FINISHED'

/**
 * Where a person goes for an unfinished import: the Add site tab of the creation workspace, which
 * rebuilds the run from the host's status door and offers Retry or Continue
 * (`packages/site/tracy-add-site/src/client/import-recovery.mjs` reads `import=`).
 * @param {string} siteKey
 * @returns {string}
 */
export function importRecoveryPath(siteKey) {
  return `/new/?tab=tracy:add-site&import=${encodeURIComponent(siteKey)}`
}

/** The refusal of every door that would begin something for an import being removed (`removing_at`). */
export const IMPORT_REMOVING = 'IMPORT_REMOVING'

/**
 * How long an unfinished import may sit with no activity before the sweep removes it
 * (`cron.js` `sweepAbandonedImports`): 6 h 30 min.
 *
 * 🔒 NEVER BELOW THE HOST'S `RUN_TTL_MS` (6 h), which is never below the upload cursor's idle window
 * (6 h) — both stated once in `packages/site/tracy-add-site/src/host/import-ttl.mjs`. Retry (#1578)
 * and Continue (#1565) work only while the host keeps the run; removing the import sooner would leave
 * the recovery page offering a Retry that can no longer work. The 30 min are margin for clock skew
 * between this server and the host and for the hourly sweep's spacing.
 * `scripts/test/import-ttl.test.mjs` fails when the order breaks.
 */
export const ABANDONED_IMPORT_MS = 6.5 * 60 * 60_000
