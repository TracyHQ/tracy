// The infra layer's case engine: probes, GREEN run, RED proof by mutation in a scratch tree,
// verdict assignment. A case is PASS only when GREEN holds, its oracle anchors still exist, and the
// SAME assertion fails on a mutated copy of the product (an assertion error tagged with the case's
// own assertion id; import/boot failures are not RED).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import net from 'node:net'
import { MAX_LAYER_FILE_BYTES, readBoundedJsonSync } from '../../../lib/bounded-reader.mjs'
import { docRel } from '../../../lib/doc-source.mjs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { DOCKER_MUTATIONS, dockerCases, DOCKERFILES } from './cases-docker.mjs'
import { CRON_MUTATIONS, cronCases } from './cases-cron.mjs'
import { HOST_MUTATIONS, hostCases } from './cases-host.mjs'
import { SHELL_MUTATIONS, shellCases } from './cases-shell.mjs'
import { miscCases } from './cases-misc.mjs'
import {
  REPO,
  LAYER_DIR,
  applyMutation,
  containedPath,
  fileSha,
  hashPaths,
  HarnessError,
  isAssertionFailure,
  readRegular,
  makeTree,
  sha256,
  writeEvidence
} from './harness.mjs'
import { takeObservedFixtures } from './scratch.mjs'
import { LEGACY_SUITES, PYTHON_SUITES, runLegacySuite, runPythonSuite, suiteFiles } from './legacy.mjs'

export const TREES = {
  host: {
    copy: ['apps/tracy-host/src', 'apps/tracy-host/package.json'],
    link: ['apps/tracy-host/node_modules']
  },
  fleet: { copy: ['packages/fleet/tracy-fleet-operation/scripts'], link: [] },
  web: { copy: ['apps/tracy-web/src', 'apps/tracy-web/package.json'], link: ['apps/tracy-web/node_modules'] },
  docker: { copy: DOCKERFILES.map((d) => d.file), link: [] }
}

export const MUTATIONS = new Map(
  [...HOST_MUTATIONS, ...SHELL_MUTATIONS, ...CRON_MUTATIONS, ...DOCKER_MUTATIONS].map((m) => [m.id, m])
)

/** Every case with its implementation. Deterministic order (by id). */
export function allDefs() {
  const defs = [...hostCases(), ...shellCases(), ...cronCases(), ...dockerCases(), ...miscCases()]
  const seen = new Set()
  for (const d of defs) {
    if (seen.has(d.id)) throw new HarnessError(`duplicate case id ${d.id}`)
    seen.add(d.id)
    if (d.mutation && !MUTATIONS.has(d.mutation))
      throw new HarnessError(`${d.id}: unknown mutation ${d.mutation}`)
    if (d.fixMutation && !MUTATIONS.has(d.fixMutation))
      throw new HarnessError(`${d.id}: unknown fix mutation ${d.fixMutation}`)
  }
  return defs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export const areaOf = (id) => {
  const rest = id.replace(/^QA-INFRA-/, '')
  if (rest.startsWith('host-') || rest.startsWith('site-kind-')) return 'host'
  if (rest.startsWith('go-live')) return 'go-live'
  if (rest.startsWith('restore') || rest.startsWith('webroot')) return 'backup'
  if (rest.startsWith('deploy') || rest.startsWith('check-local')) return 'deploy'
  return rest.split('-')[0]
}
export const AREAS = [
  'host',
  'teardown',
  'go-live',
  'provision',
  'backup',
  'cron',
  'dockerfile',
  'lifecycle',
  'deploy',
  'legacy'
]

let oraclesCache = null
export function loadOracles(file = path.join(REPO, 'tests/qa/oracles/infra/oracles.json')) {
  oraclesCache ??= readBoundedJsonSync(file, { maxBytes: MAX_LAYER_FILE_BYTES }).oracles
  return oraclesCache
}

const DOCUMENT_ANCHOR = /^(SYSTEM\.md|CONTEXT\.md|docs\/|tasks\/)/

/** Pin an oracle: hash of its entry and of every anchor file, written into each proof log. */
export function oracleFingerprint(key, repo = REPO) {
  const oracle = loadOracles()[key]
  const files = (oracle?.anchors ?? []).map((a) => {
    try {
      return {
        file: a.file,
        sha256: sha256(readRegular(containedPath(repo, docRel(repo, a.file)))),
        excerptSha256: sha256(a.excerpt)
      }
    } catch {
      return { file: a.file, sha256: null }
    }
  })
  return { oracle: key, entrySha256: sha256(JSON.stringify(oracle ?? null)), files }
}

/** Verify an oracle's anchors still exist; returns {ok, detail}. */
export function checkOracle(key, repo = REPO) {
  const oracle = loadOracles()[key]
  if (!oracle) return { ok: false, detail: `oracle ${key} is not defined` }
  if (oracle.strength === 'intent')
    return {
      ok: false,
      detail: `oracle ${key} is the author's own intent (comment/header), not an independent source: no verdict until a spec, ADR or external source states the rule`
    }
  if (oracle.strength === 'external') {
    // An external source counts only as a copy pinned in the repo: a URL string proves nothing.
    const pin = oracle.pin
    if (!pin?.file || !pin.sha256 || !pin.retrievedAt)
      return {
        ok: false,
        detail: `oracle ${key}: the external source ${oracle.external} is not pinned (no copy with sha256 and retrieval date under tests/qa/oracles/infra/external/); a URL is not a pinned oracle`
      }
    try {
      const copy = readRegular(containedPath(path.join(repo, 'tests/qa/oracles/infra/external'), pin.file))
      if (sha256(copy) !== pin.sha256)
        return {
          ok: false,
          detail: `oracle ${key}: the pinned copy ${pin.file} no longer matches its sha256`
        }
    } catch (error) {
      return {
        ok: false,
        detail: `oracle ${key}: the pinned copy ${pin.file} is unusable (${error.message})`
      }
    }
  }
  if (!oracle.anchors?.length && oracle.strength !== 'external')
    return { ok: false, detail: `oracle ${key} has no anchor and no external source` }
  // An anchor in product code is a pointer, not a source: the expectation would come from the code
  // under test. A spec oracle needs at least one anchor in a document, or an external source.
  if (oracle.strength !== 'external' && !oracle.anchors.some((a) => DOCUMENT_ANCHOR.test(a.file)))
    return {
      ok: false,
      detail: `oracle ${key}: every anchor is product code (${oracle.anchors.map((a) => a.file).join(', ')}); the expectation would be taken from the code under test, so there is no independent source yet`
    }
  for (const anchor of oracle.anchors ?? []) {
    if (/(^|\/)(AGENTS|CLAUDE)\.md$/.test(anchor.file))
      return {
        ok: false,
        detail: `oracle ${key}: ${anchor.file} is agent guidance, not an independent oracle`
      }
    try {
      const file = containedPath(repo, docRel(repo, anchor.file))
      if (!existsSync(file)) return { ok: false, detail: `oracle ${key}: ${anchor.file} is missing` }
      if (!readRegular(file).includes(anchor.excerpt)) {
        return {
          ok: false,
          detail: `oracle ${key} drifted: "${anchor.excerpt.slice(0, 70)}" no longer in ${anchor.file}`
        }
      }
    } catch (error) {
      return { ok: false, detail: `oracle ${key}: ${anchor.file} is unusable (${error.message})` }
    }
  }
  return { ok: true, detail: '' }
}

export function manifestOf(def) {
  const oracle = loadOracles()[def.oracle]
  return {
    id: def.id,
    itemIds: [...def.itemIds],
    requirement: def.requirement,
    oracle: {
      source: oracle?.anchors?.[0]?.file ?? oracle?.external ?? '',
      ref: def.oracle,
      invariant: oracle?.invariant ?? ''
    },
    edgeTags: [...def.edgeTags],
    targets: [...def.targets],
    effects: def.effects,
    prerequisites: [...(def.prerequisites ?? [])],
    assertionIds: [...def.assertionIds],
    redProof: null,
    legacyIds: [...(def.legacyIds ?? [])]
  }
}

// ── probes ──────────────────────────────────────────────────────────────────────────────────
const tool = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10_000 })
  return r.error || r.status !== 0
    ? { ok: false, detail: `${cmd} ${args.join(' ')}: ${r.error?.message ?? `exit ${r.status}`}` }
    : { ok: true, detail: '' }
}
const tcp = (host, port, ms = 2000) =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const done = (ok, detail) => {
      socket.destroy()
      resolve({ ok, detail })
    }
    socket.setTimeout(ms, () => done(false, `connect to ${host}:${port} timed out`))
    socket.once('connect', () => done(true, ''))
    socket.once('error', (error) => done(false, `connect to ${host}:${port}: ${error.message}`))
  })

export async function probe(name, env = process.env) {
  if (name === 'bash' || name === 'git') return tool(name, ['--version'])
  if (name === 'python3') return tool('python3', ['--version'])
  if (name === 'non-root') {
    return process.getuid?.() === 0
      ? {
          ok: false,
          detail:
            'running as root: a root process ignores directory modes, so a permission denial cannot be produced'
        }
      : { ok: true, detail: '' }
  }
  if (name === 'stand') {
    if (!env.QA_STAND_URL) return { ok: false, detail: 'QA_STAND_URL is not set' }
    try {
      const url = new URL(env.QA_STAND_URL)
      const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
      if (!['http:', 'https:'].includes(url.protocol))
        return { ok: false, detail: `QA_STAND_URL must be http(s), got ${url.protocol}` }
      const reached = await tcp(url.hostname, port)
      if (!reached.ok) return { ok: false, detail: `QA_STAND_URL unreachable: ${reached.detail}` }
      // TCP only says something listens: ask it a question. Any HTTP answer proves a web server is
      // there; a 5xx is still "reachable" (the cases decide what it means), a network error is ENV.
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) })
        return { ok: true, detail: `HTTP ${res.status}` }
      } catch (error) {
        return {
          ok: false,
          detail: `QA_STAND_URL accepted a connection but did not answer HTTP: ${error.message}`
        }
      }
    } catch (error) {
      return { ok: false, detail: `QA_STAND_URL is not a URL: ${error.message}` }
    }
  }
  if (name === 'stand-fixture') {
    // The stand owner must name the fixture this layer may touch and give its credential; without
    // both there is nothing this layer is allowed to act on.
    const missing = ['QA_STAND_FIXTURE_LABEL', 'QA_STAND_CREDENTIAL'].filter((k) => !env[k])
    return missing.length > 0
      ? {
          ok: false,
          detail: `${missing.join(', ')} not set: the stand has not granted a fixture to this layer`
        }
      : { ok: true, detail: '' }
  }
  if (name === 'database') {
    if (!env.TEST_DATABASE_URL) return { ok: false, detail: 'TEST_DATABASE_URL is not set' }
    try {
      const url = new URL(env.TEST_DATABASE_URL)
      const reached = await tcp(url.hostname, Number(url.port || 5432))
      return reached.ok ? reached : { ok: false, detail: `TEST_DATABASE_URL unreachable: ${reached.detail}` }
    } catch (error) {
      return { ok: false, detail: `TEST_DATABASE_URL is not a URL: ${error.message}` }
    }
  }
  if (name === 'docker') return tool('docker', ['info'])
  if (name.startsWith('docker-image:')) {
    const daemon = tool('docker', ['info'])
    return daemon.ok ? tool('docker', ['image', 'inspect', name.slice('docker-image:'.length)]) : daemon
  }
  return { ok: false, detail: `unknown probe ${name}` }
}

// ── scratch trees ───────────────────────────────────────────────────────────────────────────
const safe = (text) => text.replace(/[^A-Za-z0-9._-]+/g, '_')

export function createMutantStore(outDir) {
  const trees = new Map()
  return {
    outDir,
    /** A scratch product tree with `mutationId` applied (cached), or an Error. */
    tree(mutationId) {
      if (trees.has(mutationId)) return trees.get(mutationId)
      const mutation = MUTATIONS.get(mutationId)
      let entry
      try {
        const dest = containedPath(outDir, `red/trees/${safe(mutationId)}`)
        makeTree(dest, TREES[mutation.tree])
        const hashes = applyMutation(dest, mutation)
        entry = { root: dest, mutation, hashes }
      } catch (error) {
        entry = { error }
      }
      trees.set(mutationId, entry)
      return entry
    },
    cleanup() {
      rmSync(containedPath(outDir, 'red/trees'), { recursive: true, force: true })
    }
  }
}

const message = (error) =>
  String(error?.message ?? error)
    .split('\n')
    .slice(0, 6)
    .join(' ⏎ ')
    .slice(0, 600)

/** Run a case body; an async error that escapes it (a mutant that crashes a timer) is a harness failure. */
async function runImpl(def, root, outDir) {
  const escaped = []
  const on = (error) => escaped.push(error)
  process.on('unhandledRejection', on)
  process.on('uncaughtException', on)
  try {
    const value = await def.run({ root, repo: REPO, outDir })
    await new Promise((resolve) => setImmediate(resolve))
    if (escaped.length > 0)
      throw new HarnessError(`unhandled asynchronous error escaped the case: ${message(escaped[0])}`)
    return value
  } finally {
    process.off('unhandledRejection', on)
    process.off('uncaughtException', on)
  }
}

/** Run one case. `store` is the mutant store (needed only with proveRed). */
export async function runCase(def, { target, proveRed, outDir, store, env = process.env }) {
  const started = performance.now()
  const result = {
    id: def.id,
    verdict: 'PENDING',
    reason: '',
    assertionIds: [...def.assertionIds],
    evidence: [],
    durationMs: 0,
    redProof: null
  }
  const finish = (verdict, reason) => {
    result.verdict = verdict
    result.reason = reason
    result.durationMs = Math.round(performance.now() - started)
    return result
  }
  if (target !== 'local')
    return finish(
      'PENDING',
      `target-policy: the infra layer's cases write scratch files and start fake commands; none declares a read-only effect contract for target ${target}`
    )
  // A missing dependency is ENV and a legacy adapter reports what it ran; both come before the
  // oracle check, which can only ever turn a would-be verdict into PENDING.
  for (const need of def.requires ?? []) {
    const p = await probe(need, env)
    if (!p.ok) return finish('ENV', `probe ${need}: ${p.detail}`)
  }
  if (def.legacy) {
    const reason = await legacyReason(def, env, outDir, result)
    return finish(
      reason.startsWith('LEGACY-FAIL ') ? 'FAIL' : reason.startsWith('LEGACY-ENV ') ? 'ENV' : 'PENDING',
      reason
    )
  }
  const oracle = checkOracle(def.oracle)
  if (!oracle.ok) return finish('PENDING', oracle.detail)
  if (!def.run) return finish('PENDING', def.pending ?? 'no implementation')

  let green
  takeObservedFixtures()
  try {
    green = await runImpl(def, REPO, outDir)
  } catch (error) {
    if (isAssertionFailure(error)) {
      let note = ''
      if (proveRed && def.fixMutation) note = await fixProof(def, store, outDir, result)
      return finish('FAIL', `${error.assertionId ?? '?'}: ${message(error)}${note}`)
    }
    return finish('PENDING', `harness error (not a product verdict): ${message(error)}`)
  }
  const greenFixtures = takeObservedFixtures()
  if (green?.pendingReason) return finish('PENDING', green.pendingReason)
  if (!proveRed) return finish('PENDING', 'GREEN passed; RED proof not requested (run with --prove-red)')
  if (!def.mutation)
    return finish(
      'PENDING',
      'GREEN passed; no RED proof: no mutation of product code is defined that makes this assertion fail'
    )

  const entry = store.tree(def.mutation)
  if (entry.error)
    return finish(
      'PENDING',
      `GREEN passed; RED proof not obtained: mutation ${def.mutation} could not be applied (${message(entry.error)})`
    )
  let observed
  takeObservedFixtures()
  try {
    await runImpl(def, entry.root, outDir)
  } catch (error) {
    observed = error
  }
  const log = {
    case: def.id,
    mutation: def.mutation,
    mutationFile: entry.mutation.file ?? entry.mutation.edits?.map((e) => e.file),
    hashes: entry.hashes,
    caseSource: sha256(String(def.run)),
    pins: {
      productTree: hashPaths(REPO, TREES[entry.mutation.tree].copy),
      mutantTree: hashPaths(entry.root, TREES[entry.mutation.tree].copy),
      testHarness: hashPaths(LAYER_DIR, ['lib']),
      fixtures: hashPaths(REPO, ['tests/qa/fixtures/infra']),
      oracle: oracleFingerprint(def.oracle)
    },
    scratchFixtures: { green: greenFixtures, mutant: takeObservedFixtures() },
    expectedAssertion: def.redAssertion,
    observedAssertion: observed?.assertionId ?? null,
    observed: observed ? message(observed) : 'the assertion PASSED on the mutated product',
    green: 'passed on the unmodified tree'
  }
  const rel = writeEvidence(outDir, `red/${safe(def.id)}.log`, `${JSON.stringify(log, null, 2)}\n`)
  result.evidence.push(rel)
  if (!observed)
    return finish(
      'PENDING',
      `GREEN passed; the mutation ${def.mutation} did not make the assertion fail (mutant not detected)`
    )
  if (!isAssertionFailure(observed))
    return finish(
      'PENDING',
      `GREEN passed; mutation ${def.mutation} produced a non-assertion failure (${message(observed)}), which is not RED proof`
    )
  if (observed.assertionId !== def.redAssertion)
    return finish(
      'PENDING',
      `GREEN passed; mutation ${def.mutation} failed assertion ${observed.assertionId}, not the case's ${def.redAssertion}`
    )
  result.redProof = {
    kind: 'mutation',
    ref: `${def.mutation}@${entry.hashes.after.slice(0, 12)}`,
    assertionId: def.redAssertion,
    log: rel
  }
  return finish('PASS', `GREEN on the product; ${def.redAssertion} fails on mutant ${def.mutation}`)
}

/** For a FAIL: show the same assertion passes once the product is fixed (the assertion discriminates). */
async function fixProof(def, store, outDir, result) {
  const entry = store.tree(def.fixMutation)
  if (entry.error) return ` [fix proof not obtained: ${message(entry.error)}]`
  let outcome = 'the assertion PASSED on the fixed copy'
  try {
    await runImpl(def, entry.root, outDir)
  } catch (error) {
    outcome = `still failing on the fixed copy: ${message(error)}`
  }
  const rel = writeEvidence(
    outDir,
    `red/${safe(def.id)}.fix.log`,
    `${JSON.stringify({ case: def.id, fixMutation: def.fixMutation, hashes: entry.hashes, outcome }, null, 2)}\n`
  )
  result.evidence.push(rel)
  return outcome.startsWith('the assertion PASSED')
    ? ' [the same assertion passes on a copy with the fix applied]'
    : ` [fix proof inconclusive: ${outcome}]`
}

async function legacyReason(def, env, outDir, result) {
  if (env.QA_INFRA_LEGACY !== '1')
    return `${def.pending}. Not run in this pass (set QA_INFRA_LEGACY=1, or run test/legacy.test.mjs)`
  if (def.legacy === 'python') {
    const ran = PYTHON_SUITES.map((f) => runPythonSuite(f))
    return `${def.pending}. Ran: ${ran.map((r) => `${path.basename(r.key)}=${r.state === 'ran' ? `exit ${r.status}` : r.state}`).join(', ')}`
  }
  const suite = LEGACY_SUITES.find((s) => s.key === def.legacy)
  const r = runLegacySuite(suite, { outDir })
  if (r.log) result.evidence.push(r.log)
  if (r.state === 'env')
    return `LEGACY-ENV probe: ${r.probe}${r.envFailures ? ` (${r.envFailures.length} failing test(s); original log ${r.log})` : ''}`
  if (r.state === 'error') return `${def.pending}. Could not run: ${r.error}`
  const failing = r.rows.filter((row) => row.ok === false).map((row) => row.name)
  if (r.state === 'fail') {
    // A child test of the product's own suite failed for a reason this machine does not explain: a finding.
    result.legacyFail = r.productFailures
    const env = r.envFailures.length
      ? `; ${r.envFailures.length} more failed on a missing tool (${r.envFailures[0].probe})`
      : ''
    return `LEGACY-FAIL ${r.productFailures.map((f) => `${f.name}: ${f.excerpt.split('\n')[0]}`).join(' | ')}${env}. Reproduce: node --test ${suiteFiles(suite).join(' ')}; expected exit 0, actual ${r.status}; original log ${r.log}`
  }
  return `${def.pending}. Ran ${r.files} file(s): exit ${r.status}, ${r.tests} tests, ${r.pass} pass, ${r.fail} fail, ${r.skipped} skipped${r.skipReasons.length ? ` (${r.skipReasons.join('; ')})` : ''}${failing.length ? `. FAILING (legacy expectations are not oracle-bound, so this stays PENDING, but the failure is not hidden): ${failing.slice(0, 8).join(' | ')}` : ''}`
}

export { LAYER_DIR, fileSha, mkdirSync }
