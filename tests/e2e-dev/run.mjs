#!/usr/bin/env node
// One command for the E2E suite (tasks/todo-e2e-dev-tracy-site.md):
//
//   node tests/e2e-dev/run.mjs [--env dev|staging] [--tier smoke|core|place-profile] [--runId <id>]
//                              [--cms w|j|e|all|w,j] [--only J0,J2b] [--keep] [--full] [--line]
//
// `--env` picks the deployment (lib/env.mjs PROFILES; dev by default). `--tier smoke` runs the
// journeys that spend no model turn (deploy, session, wizard, start screen, My Sites, delete);
// `core`, the default, runs every covered journey. `--tier place-profile` runs J13 then E1–E13, the
// acceptance of the place-profile line (tasks/plan-wo-place-profile-code.md §4, §7); `--line` says that
// line is deployed (else its journeys end BLOCKED `deploy-of-line`), and the run also writes
// tasks/e2e-wo-place-profile-<date>.md. `--only` overrides the tier.
//
// It recovers what an earlier, killed run left behind, opens this run's manifest, runs the chosen
// journeys one at a time (`node --test`, concurrency 1), cleans every resource the manifest names
// (unless --keep), and writes report.md + report.json to ~/TCH-local/e2e-<env>/<runId>/.

import './lib/select-env.mjs'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { devExec } from './lib/dev.mjs'
import { CMS, ENV, RUN_ID } from './lib/env.mjs'
import { Manifest, findAbandoned } from './lib/manifest.mjs'
import { redactText } from './lib/redact.mjs'
import { writeReport } from './lib/report.mjs'
import { cleanAccountSites } from './lib/account-sites.mjs'
import { writePlaceProfileReport } from './lib/place-profile/report.mjs'
import { cleanDemoResource } from './lib/public-demos.mjs'
import { CLEANERS as SITE_CLEANERS } from './lib/sites.mjs'

const CLEANERS = { ...SITE_CLEANERS, demo: cleanDemoResource, 'account-sites': cleanAccountSites }
/**
 * Cleanup passes, in order: the sites journeys named, then demos (their sites not named in time), then the
 * account-wide sweep for what no journey could name. A site already gone answers its owner 403, never cleaned.
 */
const PASSES = [['site'], ['demo', 'account'], ['account-sites']]
const sweep = async (m, opts = {}) => {
  let out = []
  for (const kinds of PASSES) out = await m.cleanup(CLEANERS, { ...opts, kinds })
  return out
}

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Every journey the suite knows, in the order a run takes them: J13 first, so the report is tied
 * to the deploy it measured before anything else happens. `perCms`: one verdict per CMS.
 * `smoke`: part of `--tier smoke` (no chat turn, so no model spend).
 */
const JOURNEYS = [
  { id: 'J13', perCms: false, smoke: true },
  { id: 'J0', perCms: false, smoke: true },
  { id: 'J1', perCms: false, smoke: true },
  { id: 'J2a', perCms: true, smoke: true },
  { id: 'J2b', perCms: true },
  // Import needs a source site the suite owns; none yet (plan §5 Q4). Asked for by name, it is NOT RUN.
  { id: 'J2c', perCms: true, notCovered: 'import has no suite-owned source yet (plan §5 Q4)' },
  { id: 'J3', perCms: true, smoke: true },
  { id: 'J4a', perCms: true },
  { id: 'J4b', perCms: true },
  { id: 'J4c', perCms: true },
  { id: 'J5', perCms: false },
  { id: 'J6', perCms: false },
  { id: 'J7', perCms: false },
  { id: 'J8', perCms: false },
  { id: 'J9', perCms: false, smoke: true },
  { id: 'J10', perCms: false },
  { id: 'J11', perCms: false },
  { id: 'J12', perCms: true, smoke: true },
  { id: 'J14', perCms: false },
  // The place-profile acceptance (`--tier place-profile`); J13 runs first there too.
  ...['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', 'E13'].map((id) => ({
    id,
    perCms: false,
    tier: 'place-profile'
  }))
]
const TIERS = ['smoke', 'core', 'place-profile']

const { values } = parseArgs({
  options: {
    env: { type: 'string', default: ENV.name },
    tier: { type: 'string', default: 'core' },
    runId: { type: 'string' },
    cms: { type: 'string', default: 'w' },
    only: { type: 'string' },
    keep: { type: 'boolean', default: false },
    full: { type: 'boolean', default: false },
    line: { type: 'boolean', default: false }
  }
})

function newRunId() {
  const d = new Date()
  const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${mmdd}${randomBytes(4).readUInt32BE(0).toString(36).slice(0, 4)}`
}

if (!TIERS.includes(values.tier)) {
  console.error(`--tier: unknown ${values.tier} (use ${TIERS.join(', ')})`)
  process.exit(2)
}

const runId = values.runId ?? newRunId()
if (!RUN_ID.test(runId)) {
  console.error(`--runId must match ${RUN_ID} (it becomes part of site labels and emails)`)
  process.exit(2)
}
const letters = values.cms === 'all' ? Object.keys(CMS) : values.cms.split(',').map((s) => s.trim())
const unknownCms = letters.filter((l) => !CMS[l])
if (unknownCms.length) {
  console.error(`--cms: unknown ${unknownCms.join(', ')} (use w, j, e or all)`)
  process.exit(2)
}
const platforms = letters.map((l) => CMS[l])

const files = existsSync(join(HERE, 'journeys'))
  ? new Map(
      readdirSync(join(HERE, 'journeys'))
        .filter((f) => /^[JE]\w+\.test\.mjs$/.test(f))
        .map((f) => [f.replace('.test.mjs', ''), join(HERE, 'journeys', f)])
    )
  : new Map()
const only = values.only ? values.only.split(',').map((s) => s.trim()) : null
const unknownOnly = (only ?? []).filter((id) => !JOURNEYS.some((j) => j.id === id))
if (unknownOnly.length) {
  console.error(`--only: unknown journey ${unknownOnly.join(', ')}`)
  process.exit(2)
}
const inTier = (j) =>
  values.tier === 'place-profile'
    ? j.tier === 'place-profile' || j.id === 'J13'
    : !j.tier && (values.tier === 'core' || j.smoke)
const chosen = JOURNEYS.filter((j) => (only ? only.includes(j.id) : !j.notCovered && inTier(j)))
const runnable = chosen.filter((j) => files.has(j.id))
// A journey asked for by name that has no file yet is reported, not silently dropped.
const requested = chosen.flatMap((j) =>
  j.perCms ? platforms.map((cms) => ({ id: j.id, cms })) : [{ id: j.id, cms: null }]
)

const runDir = join(ENV.resultsRoot, runId)
const startedAt = new Date().toISOString()
const log = (...a) => console.log(`[e2e ${ENV.name} ${runId}]`, ...a)

// ── 1. What an earlier run left behind ───────────────────────────────────────────────────────
const recovered = []
for (const m of findAbandoned(ENV.resultsRoot, { except: runId })) {
  const before = m.read()
  log(`recovering run ${before.runId}: ${m.open().length} open resource(s)`)
  const after = await sweep(m)
  m.finish()
  recovered.push({
    runId: before.runId,
    resources: after.map((r) => ({ kind: r.kind, id: r.id, state: r.state }))
  })
}

// ── 2. This run ──────────────────────────────────────────────────────────────────────────────
const manifest = Manifest.create(runDir, runId)
log(`${ENV.origin} (ssh ${ENV.ssh.target}) · results in ${runDir}`)
log(`journeys: ${runnable.map((j) => j.id).join(', ') || '(none)'} · cms: ${platforms.join(', ')}`)

let child = null
let interrupted = false
const onSignal = (sig) => {
  interrupted = true
  log(`${sig}: stopping the journeys, then cleaning up`)
  child?.kill('SIGTERM')
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

let output = ''
let code = 0
try {
  // One `node --test` per journey, in the table's order: a single invocation sorts its files by
  // name (J0 before J13), and J13 has to run first so the report is tied to the deploy it saw.
  for (const j of runnable) {
    if (interrupted) break
    const exit = await new Promise((resolve) => {
      child = spawn(
        process.execPath,
        ['--test', '--test-concurrency=1', '--test-timeout=3600000', '--test-reporter=spec', files.get(j.id)],
        {
          env: {
            ...process.env,
            E2E_RUN_ID: runId,
            E2E_RUN_DIR: runDir,
            E2E_CMS: platforms.join(','),
            E2E_KEEP: values.keep ? '1' : '0',
            E2E_FULL: values.full ? '1' : '0',
            E2E_PP_LINE: values.line ? '1' : (process.env.E2E_PP_LINE ?? '0')
          },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
      const tee = (d) => {
        const s = redactText(String(d))
        output += s
        process.stdout.write(s)
      }
      child.stdout.on('data', tee)
      child.stderr.on('data', tee)
      child.on('close', (c) => resolve(c ?? 1))
    })
    if (exit !== 0) code = exit
  }
} finally {
  // ── 3. Cleanup: every resource the manifest names, through the doors ──────────────────────
  const resources = await sweep(manifest, { keep: values.keep })
  // The images again, once everything ran: dev deploys on every push to develop, so a run can
  // straddle two deploys, and then its verdicts belong to neither (plan §1 "xong khi" (a)).
  if (existsSync(join(runDir, 'deploy.json'))) {
    const images = await devExec.images().catch((error) => ({ error: String(error) }))
    writeFileSync(
      join(runDir, 'deploy-end.json'),
      `${JSON.stringify({ measuredAt: new Date().toISOString(), images }, null, 2)}\n`
    )
  }
  manifest.finish()
  writeFileSync(join(runDir, 'run.log'), output)
  if (recovered.length)
    writeFileSync(join(runDir, 'recovered.json'), `${JSON.stringify(recovered, null, 2)}\n`)
  const { json } = writeReport({
    runDir,
    runId,
    requested,
    startedAt,
    finishedAt: new Date().toISOString(),
    flags: {
      env: ENV.name,
      tier: only ? null : values.tier,
      cms: platforms,
      only,
      keep: values.keep,
      full: values.full,
      line: values.line,
      ...(interrupted ? { interrupted } : {})
    }
  })
  if (requested.some((r) => r.id.startsWith('E'))) {
    const file = writePlaceProfileReport({ runDir, runId, report: json })
    log(`place-profile acceptance: ${file}`)
  }
  if (values.keep) {
    const kept = resources.filter((r) => r.state === 'kept')
    log(`--keep: ${kept.length} resource(s) kept: ${kept.map((r) => r.id).join(', ') || 'none'}`)
  }
  const s = json.summary
  log(
    `${s.pass} PASS · ${s.fail} FAIL · ${s.blocked} BLOCKED · ${s.notRun} NOT RUN — ${join(runDir, 'report.md')}`
  )
  // Kept on request is not a cleanup failure; anything else the manifest still names is.
  const uncleaned = json.leftover.filter((r) => r.state !== 'kept')
  if (uncleaned.length)
    log(`NOT CLEANED: ${uncleaned.map((r) => `${r.kind} ${r.id} (${r.state})`).join(', ')}`)
  process.exitCode = interrupted || code !== 0 || s.fail || s.notRun || uncleaned.length ? 1 : 0
}
