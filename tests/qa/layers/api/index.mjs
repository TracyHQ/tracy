// Layer module of the api layer (contract: `layer`, `listCases`, `run`).
//
// run() order, so nothing with a side effect happens before it is allowed:
//   1. validate the manifests and apply the TARGET POLICY (before any docker call or request);
//   2. probe docker directly (missing → ENV with the probe's own words);
//   3. start an owned PostgreSQL (a container this run created, removed by id) → ENV when it never answers;
//   4. run the cases against the tree under test; optionally prove RED on scratch mutants;
//   5. PASS only with a valid RED proof; every other outcome keeps its reason.
import { existsSync, lstatSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ContractError,
  contained,
  ensureOutDir,
  readJson,
  readRegular,
  writeAtomic,
  stableStringify
} from './io.mjs'
import { assertCommitted } from '../../lib/denominator.mjs'
import { dockerAvailable, startOwnedDatabase } from './database.mjs'
import { probeDatabase, loadProduct } from './harness.mjs'
import { runAgainst } from './runner.mjs'
import { ALL_MUTANTS, inputHashes, proofIsValid, proveRed } from './red.mjs'
import { buildCoverage, countVerdicts, renderReport } from './report.mjs'
import { OracleEnvError, loadDoors } from './oracle.mjs'
import { expandPlan } from './planfile.mjs'
import { expandAll, verifyFamilies, writeExpanded } from './generate.mjs'

export const layer = 'api'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..', '..')
const ORACLE_DIR = join(REPO, 'tests/qa/oracles/api')
export const APP_ROOT = join(REPO, 'apps/tracy-web')
export const TARGETS = ['local', 'dev', 'prod']

const REQUIRED_FIELDS = [
  'id',
  'itemIds',
  'requirement',
  'oracle',
  'edgeTags',
  'targets',
  'effects',
  'assertionIds'
]

export function validateManifest(m, where = 'manifest') {
  if (!m || typeof m !== 'object') throw new ContractError(`${where}: not an object`)
  for (const f of REQUIRED_FIELDS)
    if (!(f in m)) throw new ContractError(`${where} ${m.id ?? '?'}: missing ${f}`)
  if (typeof m.id !== 'string' || !/^QA-API-\S+$/.test(m.id))
    throw new ContractError(`${where}: bad id ${JSON.stringify(m.id)}`)
  for (const f of ['itemIds', 'edgeTags', 'targets', 'assertionIds'])
    if (!Array.isArray(m[f]) || m[f].length === 0)
      throw new ContractError(`${m.id}: ${f} must be a non-empty array`)
  if (!m.oracle?.source || !m.oracle?.ref || !m.oracle?.invariant)
    throw new ContractError(`${m.id}: oracle needs source, ref, invariant`)
  for (const t of m.targets) if (!TARGETS.includes(t)) throw new ContractError(`${m.id}: unknown target ${t}`)
  if (!m.effects || !Array.isArray(m.effects.writes) || !Array.isArray(m.effects.reads))
    throw new ContractError(`${m.id}: effects incomplete`)
}

/**
 * Every manifest, derived from the pinned oracle (never read from a committed expansion) and checked
 * against the family counts and hashes in `cases.manifest.json`.
 */
let expanded = null
export async function expandCases() {
  expanded ??= expandAll({ repoRoot: REPO, pinPath: join(ORACLE_DIR, 'pin.json') }).then(({ lists }) => {
    verifyFamilies(lists, readJson(join(HERE, 'cases.manifest.json')))
    const all = [...lists.values()].flat()
    for (const m of all) validateManifest(m, 'expanded')
    return { lists, all }
  })
  expanded.catch(() => {
    expanded = null
  })
  return expanded
}

/** `area` matches `scenario` (the door scenarios), an edge tag, a membership (public | internal-only) or the first path segment of a door. */
export async function listCases({ area } = {}) {
  const { all } = await expandCases()
  if (area === undefined || area === null || area === '') return all
  const segment = (id) => /^QA-API-[A-Z]+:\/?([^/{}-]*)/.exec(id)?.[1] ?? ''
  const hit = all.filter(
    (m) =>
      (area === 'scenario' ? Boolean(m.scenario) : m.edgeTags.includes(area)) ||
      m.membership === area ||
      segment(m.id) === area
  )
  if (hit.length === 0)
    throw new ContractError(
      `area ${JSON.stringify(area)} matches no case (tags, public|internal-only, or a first path segment)`
    )
  return hit
}

/** Decided before any transport call. */
export function targetPolicy(manifest, target) {
  if (!TARGETS.includes(target)) return { allowed: false, reason: `target-policy: unknown target ${target}` }
  if (!manifest.targets.includes(target))
    return {
      allowed: false,
      reason: `target-policy: the case declares targets [${manifest.targets}]; this layer boots tracy-web in-process and drives no live ${target} system`
    }
  if (target !== 'local' && manifest.effects.writes.length > 0)
    return { allowed: false, reason: `target-policy: writes are refused on ${target}` }
  if (target === 'prod' && (manifest.effects.mail || manifest.effects.model || manifest.effects.containers))
    return { allowed: false, reason: 'target-policy: production allows read-only cases' }
  return { allowed: true }
}

/** The door list, derived from the pinned git revision and verified against the pin's sha256. */
const loadOracle = () => loadDoors(REPO, join(ORACLE_DIR, 'pin.json'))

const base = (m, verdict, reason, extra = {}) => ({
  id: m.id,
  verdict,
  reason,
  assertionIds: m.assertionIds,
  evidence: [],
  durationMs: 0,
  redProof: null,
  ...extra
})

/**
 * @param {{ cases: object[], target?: string, proveRed?: boolean, outDir: string, redFrom?: string|null,
 *   deps?: object, appRoot?: string, mutants?: object[], now?: () => Date }} input
 */
export async function run({
  cases,
  target = 'local',
  proveRed: wantRed = false,
  outDir,
  redFrom = null,
  deps = {},
  appRoot = APP_ROOT,
  mutants = ALL_MUTANTS,
  now = () => new Date()
}) {
  if (!Array.isArray(cases) || cases.length === 0) throw new ContractError('no cases requested')
  for (const m of cases) validateManifest(m)
  const out = ensureOutDir(outDir)
  const d = {
    dockerAvailable,
    startOwnedDatabase,
    loadOracle,
    runAgainst,
    proveRed,
    loadProduct,
    ...deps
  }
  const results = new Map()
  const executable = []
  for (const m of cases) {
    const p = targetPolicy(m, target)
    if (!p.allowed) results.set(m.id, base(m, 'PENDING', p.reason))
    else executable.push(m)
  }
  const meta = { cleanup: { ok: true, detail: 'nothing was created' }, mutants: [], probe: null, target }
  let db = null
  let oracle = null
  const signalHandlers = []
  try {
    if (executable.length > 0) {
      // The oracle comes first: without a verified door list nothing may run, and nothing is a pass.
      try {
        oracle = await d.loadOracle()
      } catch (error) {
        if (!(error instanceof OracleEnvError)) throw error
        meta.probe = error.probe
        for (const m of executable)
          results.set(
            m.id,
            base(m, 'ENV', `pinned oracle unavailable: ${error.message} [probe: ${error.probe}]`)
          )
        executable.splice(0)
      }
    }
    if (executable.length > 0) {
      const docker = d.dockerAvailable()
      if (!docker.ok) {
        meta.probe = docker.detail
        for (const m of executable)
          results.set(m.id, base(m, 'ENV', `docker is not available: ${docker.detail}`))
      } else {
        const product = await d.loadProduct(appRoot)
        db = await d.startOwnedDatabase({
          probe: probeDatabase(product),
          onAcquire: (handle) => {
            for (const sig of ['SIGINT', 'SIGTERM']) {
              const onSignal = () => {
                handle.remove()
                process.exit(sig === 'SIGINT' ? 130 : 143)
              }
              signalHandlers.push([sig, onSignal])
              process.once(sig, onSignal)
            }
          }
        })
        if (!db.ok) {
          meta.probe = db.probe
          for (const m of executable)
            results.set(m.id, base(m, 'ENV', `owned PostgreSQL unavailable: ${db.probe}`))
        } else {
          const { doorIndex, doorsByPath } = oracle
          const exceptions = readJson(join(ORACLE_DIR, 'exceptions.json'))
          const good = await d.runAgainst({
            appRoot,
            clusterUrl: db.url,
            manifests: executable,
            doorIndex,
            doorsByPath,
            exceptions,
            label: 'good'
          })
          if (!good.ok) {
            for (const m of executable)
              results.set(
                m.id,
                base(
                  m,
                  'PENDING',
                  `TEST_INVALID: the tree under test did not boot in the harness: ${good.bootError}`
                )
              )
          } else {
            const hashes = inputHashes(HERE, ORACLE_DIR)
            let proofs = new Map()
            if (wantRed) {
              const red = await d.proveRed({
                repoRoot: REPO,
                appRoot,
                clusterUrl: db.url,
                outDir: out,
                hashes,
                goodResults: good.results,
                manifests: executable,
                doorIndex,
                doorsByPath,
                exceptions,
                mutants
              })
              proofs = red.proofs
              meta.mutants = red.mutants
            } else if (redFrom) proofs = loadProofs(redFrom, out, executable, hashes)
            for (const m of executable) {
              const g = good.results.get(m.id)
              if (!g) {
                results.set(m.id, base(m, 'PENDING', 'TEST_INVALID: the case produced no result'))
                continue
              }
              const extra = { durationMs: g.ms }
              if (g.v === 'PASS') {
                const proof = proofs.get(m.id) ?? null
                const check = proofIsValid(proof, {
                  caseManifest: m,
                  hashes,
                  logExists: (rel) => existsSync(contained(out, rel)),
                  readLog: (rel) => readRegular(contained(out, rel), { allowEmpty: true }).toString('utf8')
                })
                if (check.ok) results.set(m.id, base(m, 'PASS', g.reason, { ...extra, redProof: proof }))
                else
                  results.set(
                    m.id,
                    base(
                      m,
                      'PENDING',
                      `no RED proof: ${proof ? check.why : wantRed ? 'no mutant broke this assertion' : 'run with --prove-red (or --red-from a previous run)'} (green on the tree: ${g.reason})`,
                      extra
                    )
                  )
              } else results.set(m.id, base(m, g.v === 'FAIL' ? 'FAIL' : 'PENDING', g.reason, extra))
              attachEvidence(results.get(m.id), m, g)
            }
            writeEvidence(out, executable, good.results, results)
          }
        }
      }
    }
  } finally {
    if (db) {
      const r = db.remove()
      meta.cleanup = { ok: r.ok, detail: r.detail }
    }
    for (const [sig, handler] of signalHandlers) process.removeListener(sig, handler)
  }
  const ordered = cases.map((m) => results.get(m.id))
  await finish({ out, ordered, cases, target, wantRed, redFrom, meta, now })
  Object.defineProperty(ordered, 'meta', { value: meta, enumerable: false })
  return ordered
}

function attachEvidence(result, m, g) {
  if (g.observations?.length) result.evidence = [`evidence/${m.edgeTags[0]}.jsonl`]
}

function writeEvidence(out, manifests, goodResults, results) {
  const byTag = new Map()
  for (const m of manifests) {
    const g = goodResults.get(m.id)
    if (!g?.observations?.length) continue
    const line = JSON.stringify({
      id: m.id,
      verdict: results.get(m.id)?.verdict,
      observations: g.observations
    })
    byTag.set(m.edgeTags[0], [...(byTag.get(m.edgeTags[0]) ?? []), line])
  }
  for (const [tag, lines] of byTag) writeAtomic(out, `evidence/${tag}.jsonl`, `${lines.join('\n')}\n`)
}

function loadProofs(redFrom, out, manifests, hashes) {
  const prior = readJson(join(redFrom, 'results.json'))
  const byId = new Map(prior.map((r) => [r.id, r]))
  const proofs = new Map()
  for (const m of manifests) {
    const proof = byId.get(m.id)?.redProof
    const check = proofIsValid(proof, {
      caseManifest: m,
      hashes,
      logExists: (rel) => existsSync(contained(redFrom, rel)),
      readLog: (rel) => readRegular(contained(redFrom, rel), { allowEmpty: true }).toString('utf8')
    })
    if (!check.ok) continue
    mkdirSync(join(out, dirname(proof.log)), { recursive: true })
    if (!existsSync(join(out, proof.log))) copyFileSync(contained(redFrom, proof.log), join(out, proof.log))
    proofs.set(m.id, proof)
  }
  return proofs
}

async function finish({ out, ordered, cases, target, wantRed, redFrom, meta, now }) {
  const denominator = assertCommitted(readJson(join(HERE, 'denominator.json')), 'api')
  const { all, lists } = await expandCases()
  const plan = expandPlan(readJson(join(HERE, 'coverage.plan.json')), all)
  // The expansion is evidence of exactly what ran, kept beside the results (never in the repository).
  if (cases.length === all.length) writeExpanded(lists, join(out, 'cases'))
  const requested = new Set(cases.map((m) => m.id))
  const redProven = new Set(ordered.filter((r) => r.redProof).map((r) => r.id))
  const coverage = buildCoverage({ denominator, plan, results: ordered, requestedIds: requested, redProven })
  const fails = new Map()
  for (const r of ordered.filter((x) => x.verdict === 'FAIL')) {
    const key = String(r.reason).replace(/\d+/g, 'N').slice(0, 120)
    const g = fails.get(key) ?? { reason: key, count: 0, example: r.id }
    g.count += 1
    fails.set(key, g)
  }
  const when = now().toISOString()
  writeAtomic(out, 'results.json', `${JSON.stringify(ordered, null, 1)}\n`)
  writeAtomic(out, 'coverage.json', stableStringify(coverage, 1))
  writeAtomic(
    out,
    'report.md',
    renderReport({
      results: ordered,
      coverage,
      header: { when, target, proveRed: wantRed, redFrom },
      mutants: meta.mutants,
      productFails: [...fails.values()].sort((a, b) => b.count - a.count)
    }) +
      `\n## Cleanup\n\n${meta.cleanup.ok ? 'ok' : 'FAILED'}: ${meta.cleanup.detail}${meta.probe ? `\n\nProbe: ${meta.probe}` : ''}\n`
  )
  writeAtomic(
    out,
    'run.json',
    stableStringify(
      {
        when,
        target,
        counts: countVerdicts(ordered),
        cleanup: meta.cleanup,
        probe: meta.probe,
        mutants: meta.mutants
      },
      1
    )
  )
  void lstatSync
}
