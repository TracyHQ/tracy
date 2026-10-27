/**
 * REG-PR-1185-backup-export: an Owner downloads a backup as one zip (plan tasks/todo-backup-export.md).
 * S1: the host packs a verified point (config placeholders, dump byte for byte, sums, locks let go
 * before the upload, refusals for a tampered dump / too large / a refused upload) — no container.
 * S2: tracy-host takes `webroot-export` with an https upload address only, never on argv.
 * S3: tracy-web — Owner only on both doors, one per site, caps per account, ready only once the
 * store holds the size, five-minute download link, expiry + sweep, site delete, and the generic
 * artifact doors refusing `backup-exports/` and dot segments (needs Postgres).
 * S4: the Download… item is offered to an Owner on a full backup only.
 * Each run must exit 0 with 0 failed and 0 skipped.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const url = testDatabaseUrl()

// S1
const s1 = nodeTest(['packages/fleet/tracy-fleet-operation/test/backup-export.test.mjs'])
c.tapClean('S1', s1, { pass: 9 })
c.passes('S1', s1, 'export: a full WordPress point becomes one zip')

// S2
const s2 = nodeTest(['apps/tracy-host/test/webroot.test.mjs', 'apps/tracy-host/test/config.test.mjs'], {
  pattern: 'export'
})
c.tapClean('S2', s2)
c.passes('S2', s2, 'runWebrootJob: webroot-export hands the upload address in the environment')

// S3
const s3 = nodeTest(['apps/tracy-web/test/backup-export.test.mjs'], { env: { TEST_DATABASE_URL: url } })
c.tapClean('S3', s3, { pass: 12 })
c.passes('S3', s3, 'artifact doors: no key in the export namespace')

// S4
const s4 = nodeTest(['packages/core/tracy-core/test/backup-download.test.mjs'])
c.tapClean('S4', s4, { pass: 4 })

c.done()
