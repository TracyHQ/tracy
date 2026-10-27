#!/usr/bin/env node
// Acceptance verifier of the api layer.
//   node tests/qa/layers/api/test/acceptance.mjs --out DIR
// Runs the standalone CLI over the whole layer (`--target local --prove-red`), keeps stdout, stderr and the
// exit code under DIR, then checks that the TOOLING is sound on the tree as it is now: one result per
// manifest, every PASS carries a RED proof that matches the current inputs and whose log says so, every
// ENV names a probe, every non-PASS names a reason, the denominator regenerates, no coverage claim is
// complete while extraction is not, and nothing the run created is left (container, scratch, volume).
// The product verdict (PASS/FAIL/ENV/PENDING) is reported separately: this verifier exits 0 when the
// tooling is valid, even when the product has FAILs. Exit 1 tooling invalid, 2 usage.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listCases } from '../index.mjs'
import { contained, readJson, readRegular } from '../io.mjs'
import { inputHashes, proofIsValid } from '../red.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LAYER = join(HERE, '..')
const REPO = join(LAYER, '..', '..', '..', '..')
const ORACLE = join(REPO, 'tests/qa/oracles/api')
const VERDICTS = new Set(['PASS', 'FAIL', 'ENV', 'PENDING'])
const EXIT_FOR_RUN = new Set([0, 1, 3])

const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--out' || !args[1] || args[1].startsWith('--')) {
  console.error('usage: node tests/qa/layers/api/test/acceptance.mjs --out DIR')
  process.exit(2)
}
const out = resolve(args[1])
if (existsSync(out) && readdirSync(out).length > 0) {
  const kept = `${out}.prev-${new Date().toISOString().replace(/[:.]/g, '-')}`
  renameSync(out, kept)
  console.log(`earlier evidence kept at ${kept}`)
}
mkdirSync(out, { recursive: true })
const runOut = join(out, 'run')

const problems = []
const check = (ok, what) => {
  if (!ok) problems.push(what)
}
const docker = (a) => spawnSync('docker', a, { encoding: 'utf8', timeout: 60_000 })
/** The database containers of this layer that exist right now, one `<id> <name>` per line. */
const ownedContainers = () =>
  docker(['ps', '-a', '--filter', 'name=qa-api-pg-', '--format', '{{.ID}} {{.Names}}'])
// Read BEFORE the run: a container that was already there belongs to another run (another session,
// an interrupted run of another day). It is not this run's to judge or to remove.
const before = ownedContainers()
const foreign = new Set(before.status === 0 ? before.stdout.split('\n').filter(Boolean) : [])

const started = Date.now()
const cli = spawnSync(
  process.execPath,
  [join(LAYER, 'run.mjs'), '--target', 'local', '--prove-red', '--out', runOut],
  {
    encoding: 'utf8',
    timeout: 2_100_000,
    maxBuffer: 512 * 1024 * 1024
  }
)
writeFileSync(join(out, 'cli-stdout.txt'), cli.stdout ?? '')
writeFileSync(join(out, 'cli-stderr.txt'), cli.stderr ?? '')
writeFileSync(join(out, 'cli-exit.txt'), `${cli.status ?? `signal ${cli.signal}`}\n`)
check(
  EXIT_FOR_RUN.has(cli.status),
  `the CLI exited ${cli.status ?? cli.signal}; only 0, 1 or 3 are valid for a completed run`
)

let results = []
let cases = []
try {
  cases = await listCases({})
  results = readJson(join(runOut, 'results.json'))
  check(existsSync(join(runOut, 'report.md')), 'report.md is missing')
  const report = readRegular(join(runOut, 'report.md')).toString('utf8')
  check(!/\b100\s*%/.test(report), 'the report prints 100%')
} catch (error) {
  check(false, `cannot read the run output: ${error.message}`)
}

const byId = new Map(results.map((r) => [r.id, r]))
check(
  results.length === cases.length && byId.size === cases.length,
  `results ${results.length} (unique ${byId.size}) ≠ manifests ${cases.length}`
)
const hashes = inputHashes(LAYER, ORACLE)
const counts = { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }
let proven = 0
for (const m of cases) {
  const r = byId.get(m.id)
  if (!r) {
    check(false, `no result for ${m.id}`)
    continue
  }
  if (!VERDICTS.has(r.verdict)) {
    check(false, `${m.id}: unknown verdict ${r.verdict}`)
    continue
  }
  counts[r.verdict] += 1
  if (r.redProof) proven += 1
  if (r.verdict !== 'PASS')
    check(typeof r.reason === 'string' && r.reason.length > 0, `${m.id}: ${r.verdict} without a reason`)
  if (r.verdict === 'ENV')
    check(/probe|docker|PostgreSQL|answered|image/i.test(r.reason), `${m.id}: ENV does not name its probe`)
  if (r.verdict === 'PASS') {
    const v = proofIsValid(r.redProof, {
      caseManifest: m,
      hashes,
      logExists: (rel) => existsSync(contained(runOut, rel)),
      readLog: (rel) => readRegular(contained(runOut, rel), { allowEmpty: true }).toString('utf8')
    })
    check(v.ok, `${m.id}: PASS without a valid RED proof (${v.why})`)
  }
}

try {
  const run = readJson(join(runOut, 'run.json'))
  check(run.cleanup?.ok === true, `run cleanup was not ok: ${run.cleanup?.detail}`)
  const coverage = readJson(join(runOut, 'coverage.json'))
  const unresolved = readJson(join(LAYER, 'denominator.json')).unresolved?.length ?? 0
  if (unresolved > 0)
    check(coverage.complete !== true, 'coverage says complete while extraction has unresolved entries')
} catch (error) {
  check(false, `cannot read run.json/coverage.json: ${error.message}`)
}

const regen = spawnSync(process.execPath, [join(LAYER, 'generate.mjs'), '--check'], {
  encoding: 'utf8',
  timeout: 180_000
})
writeFileSync(
  join(out, 'generate-check.txt'),
  `${regen.stdout ?? ''}${regen.stderr ?? ''}\nexit ${regen.status}\n`
)
check(regen.status === 0, `generate.mjs --check exited ${regen.status}`)

// Nothing the run created may remain: owned database containers (name prefix qa-api-pg-), their volumes, scratch copies.
const left = ownedContainers()
const mine = left.status === 0 ? left.stdout.split('\n').filter((line) => line && !foreign.has(line)) : []
check(before.status === 0, `the containers could not be listed before the run: ${before.stderr.trim()}`)
check(left.status === 0, `the containers could not be listed after the run: ${left.stderr.trim()}`)
check(mine.length === 0, `a qa-api-pg container this run created is left: ${mine.join(', ')}`)
check(!existsSync(join(runOut, 'scratch')), 'the mutant scratch copies were not removed')

const summary = {
  // Containers of this layer that were there before the run started: reported, never touched.
  foreignContainers: [...foreign],
  toolingValid: problems.length === 0,
  problems,
  productVerdicts: counts,
  cases: cases.length,
  redProven: proven,
  cliExit: cli.status,
  seconds: Math.round((Date.now() - started) / 1000)
}
writeFileSync(join(out, 'acceptance.json'), `${JSON.stringify(summary, null, 1)}\n`)
console.log(
  `product verdicts: PASS ${counts.PASS} · FAIL ${counts.FAIL} · ENV ${counts.ENV} · PENDING ${counts.PENDING} (cases ${cases.length}, RED-proven ${proven}; CLI exit ${cli.status})`
)
if (problems.length) {
  console.error(`tooling INVALID:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('tooling valid (this says nothing about the product verdicts above)')
