/**
 * Which quickstarts may have stock installed from them — read off job evidence, never off the site
 * row.
 *
 * The case that shapes this file was measured on the local stand 22/09: `business-emdash` and
 * `saas-emdash` carry `quickstart_version = '1.0.0'` on their site rows with `provision` jobs in
 * state `failed` and not one `done`, because `upsertDemoSite` rewrites the row at the START of
 * every attempt. A reader that trusted the row would have called both eligible.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import {
  eligibleQuickstarts,
  recordDemoAttestations,
  versionFromJobKey
} from '../src/inventory/eligibility.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const BUSINESS_J6 = 'tracy-business/j6'
const BASE_J6 = 'tracy-base/j6'
const BUSINESS_EMDASH = 'tracy-business/emdash-0.x'

/** A demo site row as `upsertDemoSite` leaves it: the version ASKED FOR, not the one installed. */
async function demoSite(pool, { siteKey, label, platform, tag, version, sha256 = null }) {
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, demo, quickstart_tag, quickstart_version, quickstart_sha256)
     values ($1, $2, 'demo', $3, 'demo', true, $4, $5, $6)`,
    [siteKey, label, platform, tag, version, sha256]
  )
}

async function job(pool, { id, siteKey, state, kind = 'provision', detail = {} }) {
  await pool.query(
    `insert into job (id, site_key, host, kind, state, detail) values ($1, $2, 'demo', $3, $4, $5::jsonb)`,
    [id, siteKey, kind, state, JSON.stringify(detail)]
  )
}

/** A `resolveInstall` that answers from a table, so no release rows are needed. */
function releases(byTag) {
  return async (_pool, tag) => byTag[tag] ?? null
}

test('a redeploy job key carries no version, a direct install does', () => {
  assert.equal(versionFromJobKey({ jobKey: 'demo:business-joomla:1.0.0:2' }), '1.0.0')
  assert.equal(versionFromJobKey({ jobKey: 'demo:business-joomla:redeploy:job-teardown-7' }), null)
  // A redeploy whose job id ends in digits must not hand back the word `redeploy`.
  assert.equal(versionFromJobKey({ jobKey: 'demo:business-joomla:redeploy:12345' }), null)
  assert.equal(versionFromJobKey({ jobKey: 'inv:some-label:1.0.0:1' }), null)
  assert.equal(versionFromJobKey({}), null)
  assert.equal(versionFromJobKey(null), null)
})

test('a site row with only FAILED provisions is not eligible — the stand case', dbOpts, async () => {
  const { pool } = db
  // Exactly what was measured: the row says 1.0.0, every job says failed.
  await demoSite(pool, {
    siteKey: 'business-emdash',
    label: 'business-emdash',
    platform: 'emdash',
    tag: BUSINESS_EMDASH,
    version: '1.0.0'
  })
  await job(pool, {
    id: 'job-1',
    siteKey: 'business-emdash',
    state: 'failed',
    detail: { jobKey: 'demo:business-emdash:1.0.0:1' }
  })
  await job(pool, {
    id: 'job-2',
    siteKey: 'business-emdash',
    state: 'failed',
    detail: { jobKey: 'demo:business-emdash:1.0.0:2' }
  })

  assert.deepEqual(await recordDemoAttestations(pool), { recorded: 0 })
  const rows = await eligibleQuickstarts(pool, {
    resolveInstall: releases({ [BUSINESS_EMDASH]: { platform: 'emdash', version: '1.0.0' } })
  })
  const row = rows.find((r) => r.tag === BUSINESS_EMDASH)
  assert.ok(row, 'the tag must still be listed, saying why')
  assert.equal(row.eligible, false)
  assert.equal(row.attestedVersion, null)
  assert.equal(row.reason, 'no successful demo install recorded')
})

test('a done provision attests the version from its own job key', dbOpts, async () => {
  const { pool } = db
  await demoSite(pool, {
    siteKey: 'business-joomla',
    label: 'business-joomla',
    platform: 'joomla',
    tag: BUSINESS_J6,
    version: '1.0.0',
    sha256: 'sha-of-1-0-0'
  })
  await job(pool, {
    id: 'job-done-1',
    siteKey: 'business-joomla',
    state: 'done',
    detail: { jobKey: 'demo:business-joomla:1.0.0:1' }
  })

  assert.deepEqual(await recordDemoAttestations(pool), { recorded: 1 })
  // Idempotent: a second sweep over the same evidence writes nothing new.
  assert.deepEqual(await recordDemoAttestations(pool), { recorded: 0 })

  const [row] = await eligibleQuickstarts(pool, {
    resolveInstall: releases({ [BUSINESS_J6]: { platform: 'joomla', version: '1.0.0' } })
  })
  assert.equal(row.eligible, true)
  assert.equal(row.attestedVersion, '1.0.0')
  assert.equal(row.versionSource, 'job-key')
  assert.equal(row.jobId, 'job-done-1')
  assert.equal(row.siteKey, 'business-joomla')
  assert.equal(row.sha256, 'sha-of-1-0-0')
  assert.equal(row.drift, null)
  assert.equal(row.reason, null)
})

test('the job key wins over the site row when the row has moved on', dbOpts, async () => {
  const { pool } = db
  // The 1.0.0 install succeeded; a later 1.1.0 attempt rewrote the row and then failed. The row
  // now names a release that has never installed.
  await demoSite(pool, {
    siteKey: 'business-joomla',
    label: 'business-joomla',
    platform: 'joomla',
    tag: BUSINESS_J6,
    version: '1.1.0'
  })
  await job(pool, {
    id: 'job-done-1',
    siteKey: 'business-joomla',
    state: 'done',
    detail: { jobKey: 'demo:business-joomla:1.0.0:1' }
  })
  await job(pool, {
    id: 'job-failed-2',
    siteKey: 'business-joomla',
    state: 'failed',
    detail: { jobKey: 'demo:business-joomla:1.1.0:2' }
  })
  await recordDemoAttestations(pool)

  const { rows } = await pool.query('select quickstart_version, version_source from demo_install_attestation')
  assert.deepEqual(rows, [{ quickstart_version: '1.0.0', version_source: 'job-key' }])
})

test('drift is reported with both numbers, not swallowed', dbOpts, async () => {
  const { pool } = db
  await demoSite(pool, {
    siteKey: 'business-joomla',
    label: 'business-joomla',
    platform: 'joomla',
    tag: BUSINESS_J6,
    version: '1.0.0'
  })
  await demoSite(pool, {
    siteKey: 'base-joomla',
    label: 'base-joomla',
    platform: 'joomla',
    tag: BASE_J6,
    version: '1.0.0'
  })
  await job(pool, {
    id: 'job-b-1',
    siteKey: 'business-joomla',
    state: 'done',
    detail: { jobKey: 'demo:business-joomla:1.0.0:1' }
  })
  await job(pool, {
    id: 'job-base-1',
    siteKey: 'base-joomla',
    state: 'done',
    detail: { jobKey: 'demo:base-joomla:1.0.0:1' }
  })
  await recordDemoAttestations(pool)

  const rows = await eligibleQuickstarts(pool, {
    resolveInstall: releases({
      // The business release has moved on since its demo; the base release has not.
      [BUSINESS_J6]: { platform: 'joomla', version: '1.1.0' },
      [BASE_J6]: { platform: 'joomla', version: '1.0.0' }
    })
  })
  const business = rows.find((r) => r.tag === BUSINESS_J6)
  const base = rows.find((r) => r.tag === BASE_J6)
  assert.equal(business.eligible, false)
  assert.equal(business.drift, 'version')
  assert.equal(business.attestedVersion, '1.0.0')
  assert.equal(business.currentVersion, '1.1.0')
  assert.match(business.reason, /1\.0\.0/)
  assert.match(business.reason, /1\.1\.0/)
  assert.equal(base.eligible, true)
})

test('a redeploy falls back to the site row and says the evidence is weaker', dbOpts, async () => {
  const { pool } = db
  await demoSite(pool, {
    siteKey: 'base-joomla',
    label: 'base-joomla',
    platform: 'joomla',
    tag: BASE_J6,
    version: '1.0.0'
  })
  await job(pool, {
    id: 'job-redeploy-1',
    siteKey: 'base-joomla',
    state: 'done',
    detail: { jobKey: 'demo:base-joomla:redeploy:job-teardown-3' }
  })
  await recordDemoAttestations(pool)

  const [row] = await eligibleQuickstarts(pool, {
    resolveInstall: releases({ [BASE_J6]: { platform: 'joomla', version: '1.0.0' } })
  })
  assert.equal(row.versionSource, 'site-row')
  assert.equal(row.eligible, true, 'weaker evidence is still evidence')
})

test('a done job on a site that is NOT a demo attests nothing', dbOpts, async () => {
  const { pool } = db
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, demo, quickstart_tag, quickstart_version)
     values ('customer-1', 'customer-1', 'prod1', 'joomla', 'fleet_born', false, $1, '1.0.0')`,
    [BUSINESS_J6]
  )
  await job(pool, {
    id: 'job-c-1',
    siteKey: 'customer-1',
    state: 'done',
    detail: { jobKey: 'inv:customer-1:1.0.0:1' }
  })
  assert.deepEqual(await recordDemoAttestations(pool), { recorded: 0 })
  assert.deepEqual(await eligibleQuickstarts(pool, { resolveInstall: releases({}) }), [])
})

test('a teardown that reached done is not an install', dbOpts, async () => {
  const { pool } = db
  await demoSite(pool, {
    siteKey: 'base-joomla',
    label: 'base-joomla',
    platform: 'joomla',
    tag: BASE_J6,
    version: '1.0.0'
  })
  await job(pool, { id: 'job-td-1', siteKey: 'base-joomla', kind: 'teardown', state: 'done', detail: {} })
  assert.deepEqual(await recordDemoAttestations(pool), { recorded: 0 })
})

test('a release that no longer resolves is listed as such, never as eligible', dbOpts, async () => {
  const { pool } = db
  await demoSite(pool, {
    siteKey: 'base-joomla',
    label: 'base-joomla',
    platform: 'joomla',
    tag: BASE_J6,
    version: '1.0.0'
  })
  await job(pool, {
    id: 'job-base-1',
    siteKey: 'base-joomla',
    state: 'done',
    detail: { jobKey: 'demo:base-joomla:1.0.0:1' }
  })
  await recordDemoAttestations(pool)

  const [row] = await eligibleQuickstarts(pool, { resolveInstall: releases({}) })
  assert.equal(row.eligible, false)
  assert.equal(row.currentVersion, null)
  assert.equal(row.reason, 'release no longer resolvable')
})

test('the newest attestation is the one compared against the release', dbOpts, async () => {
  const { pool } = db
  await demoSite(pool, {
    siteKey: 'business-joomla',
    label: 'business-joomla',
    platform: 'joomla',
    tag: BUSINESS_J6,
    version: '1.1.0'
  })
  await job(pool, {
    id: 'job-old',
    siteKey: 'business-joomla',
    state: 'done',
    detail: { jobKey: 'demo:business-joomla:1.0.0:1' }
  })
  await job(pool, {
    id: 'job-new',
    siteKey: 'business-joomla',
    state: 'done',
    detail: { jobKey: 'demo:business-joomla:1.1.0:2' }
  })
  await recordDemoAttestations(pool)
  await pool.query(
    "update demo_install_attestation set attested_at = now() - interval '1 day' where quickstart_version = '1.0.0'"
  )

  const [row] = await eligibleQuickstarts(pool, {
    resolveInstall: releases({ [BUSINESS_J6]: { platform: 'joomla', version: '1.1.0' } })
  })
  assert.equal(row.attestedVersion, '1.1.0')
  assert.equal(row.eligible, true)
})
