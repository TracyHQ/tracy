#!/usr/bin/env node
/**
 * One-off: give old Undo/Restore presses their presser in `site_operation` (Site changes V2,
 * contract §5, plan §4.3). Reads `audit` rows `action = 'site.restore'` in batches on the primary
 * key (no audit index, no full scan in a migration, nothing at server startup), asks each site's
 * host for the commit in `detail.head`, and writes a row ONLY where the evidence is complete:
 * site + full head that is a real restore commit (author fleet@, raw subject of the audit's mode
 * naming its target). Ambiguous, missing or contradictory rows stay Unknown. Reruns and restarts
 * add nothing (`source_ref` = audit id is unique; `resulting_sha` is unique per site). Rules:
 * `backfillFromAudit` in `src/sites/operations.js`.
 *
 * WHY NOT A MIGRATION: it needs every site's Git (one host job per old restore), and a migration
 * runs in one transaction before the server listens.
 *
 * Run where tracy-web runs — it needs the same DATABASE_URL and HOST_* settings to reach the hosts.
 * The image carries it (apps/tracy-web/Dockerfile names it; an image built before 03/10 does not —
 * `docker cp` it to /opt/tracy-web/scripts/ there):
 *
 *   docker exec <web> node scripts/backfill-site-operations.mjs --dry-run [--batch 200] [--after <audit id>]
 *
 * Prints a JSON report: rows scanned, written, already present, and skipped by reason.
 */
import { readConfig } from '../src/config.js'
import { createPool } from '../src/db/index.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { backfillFromAudit, inspectCommit } from '../src/sites/operations.js'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const dryRun = args.includes('--dry-run')
const batch = Number(flag('--batch') ?? 200)
const after = Number(flag('--after') ?? 0)
if (!Number.isInteger(batch) || batch < 1 || !Number.isInteger(after) || after < 0) {
  process.stderr.write('usage: backfill-site-operations.mjs [--dry-run] [--batch N] [--after AUDIT_ID]\n')
  process.exit(2)
}
const url = process.env.DATABASE_URL
if (!url) {
  process.stderr.write('DATABASE_URL is required\n')
  process.exit(1)
}

const config = readConfig(process.env)
const pool = createPool(url)

/** One `webroot-*` job on the site's host, polled to the end — `runSiteJob` without a job row. */
async function runJob(site, input, deadlineMs) {
  const answer = await hostCall(config, site.host, '/site', { ...input, label: site.label })
  if (!answer.ok || typeof answer.body?.jobId !== 'string') {
    return { ok: false, reason: String(answer.body?.code ?? 'FLEET_REFUSED') }
  }
  const begun = Date.now()
  while (Date.now() - begun < deadlineMs) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const polled = await hostJob(config, site.host, answer.body.jobId)
    if (!polled.ok || !polled.body) continue
    if (polled.body.state === 'done') return { ok: true, output: String(polled.body.output ?? '') }
    if (polled.body.state === 'failed')
      return { ok: false, reason: String(polled.body.output ?? 'failed').slice(0, 200) }
  }
  return { ok: false, reason: 'timeout' }
}

const sites = new Map()
async function siteOf(siteKey) {
  if (!sites.has(siteKey)) {
    const { rows } = await pool.query('select site_key, label, host from site where site_key = $1', [siteKey])
    sites.set(siteKey, rows[0] ?? null)
  }
  return sites.get(siteKey)
}

try {
  const report = await backfillFromAudit(pool, {
    batch,
    after,
    dryRun,
    log: (line) => process.stderr.write(`${line}\n`),
    inspect: async (siteKey, sha) => {
      const site = await siteOf(siteKey)
      if (!site) return { state: 'missing' }
      return inspectCommit(runJob, site, sha)
    }
  })
  process.stdout.write(`${JSON.stringify(report)}\n`)
} finally {
  await pool.end()
}
