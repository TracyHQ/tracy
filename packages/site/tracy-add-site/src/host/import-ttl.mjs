/**
 * How long the host half keeps what an import needs to be picked up again, stated once.
 *
 * 🔒 THE ORDER IS A CONTRACT: tracy-web's abandoned-import sweep (`ABANDONED_IMPORT_MS` in
 * `apps/tracy-web/src/lib/import-pending.js`) ≥ `RUN_TTL_MS` ≥ `UPLOAD_IDLE_MS`. Retry (#1578) and
 * Continue (#1565) need the run for `RUN_TTL_MS`, and Continue needs the upload cursor; a sweep that
 * removed the import sooner would leave the recovery page offering a Retry that can no longer work.
 * `scripts/test/import-ttl.test.mjs` fails when the order breaks.
 */

/** A run is kept (in memory and in `runs.json`) this long after its last change (`run.ts`). */
export const RUN_TTL_MS = 6 * 60 * 60_000

/** An upload cursor stays usable this long after its last part (`resume.ts` `isFresh`). */
export const UPLOAD_IDLE_MS = 6 * 60 * 60_000
