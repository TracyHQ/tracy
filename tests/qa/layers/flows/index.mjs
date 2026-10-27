// Layer module of `flows` (contract: tests/qa/layers/<layer>/index.mjs).
//   layer      'flows'
//   listCases  the case manifests, optionally for one area
//   run        run them on a target and return one result per case

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { runLegacy } from './adapter/legacy.mjs'
import { runPilot } from './drivers/publish-pilot.mjs'
import { loadMutations, proveMutation, verifyProof } from './red.mjs'
import { FLOWS } from './registry.mjs'
import { Fixtures, runScenario } from './scenarios.mjs'
import { SCENARIOS } from './scenario-meta.mjs'
import { Intent, layout } from './stand.mjs'
import { installLoopbackLookup, probeStand, standFromEnv } from './stand-client.mjs'
import {
  LAYER_DIR,
  REPO,
  UsageError,
  VERDICTS,
  findSecrets,
  nowIso,
  readJson,
  readRegular,
  redactText,
  sha256,
  sha256File,
  writeAtomic,
  writeJsonAtomic
} from './util.mjs'
import { lstatSync } from 'node:fs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

export const layer = 'flows'
export const TARGETS = Object.freeze(['local', 'dev', 'prod'])
const KINDS = ['scripted', 'legacy', 'pilot', 'pending']
const MUTATIONS_FILE = path.join(REPO, 'tests/qa/fixtures/flows/mutations.json')

/** Areas a person may ask for: a flow key, or one of the serving kinds. */
export const AREAS = Object.freeze([...FLOWS.map((f) => f.key), ...KINDS])

function validateManifest(m, file) {
  const need = (cond, what) => {
    if (!cond) throw new Error(`${file}: case ${m?.id ?? '(no id)'}: ${what}`)
  }
  need(m && typeof m === 'object' && !Array.isArray(m), 'not an object')
  need(typeof m.id === 'string' && /^QA-FLOWS-[a-z0-9-]+$/.test(m.id), 'bad id')
  need(
    Array.isArray(m.itemIds) && m.itemIds.length > 0 && m.itemIds.every((x) => typeof x === 'string'),
    'itemIds'
  )
  need(typeof m.requirement === 'string' && m.requirement !== '', 'requirement')
  need(m.oracle && ['source', 'ref', 'invariant'].every((k) => typeof m.oracle[k] === 'string'), 'oracle')
  need(Array.isArray(m.edgeTags) && m.edgeTags.length > 0, 'edgeTags')
  need(Array.isArray(m.targets) && m.targets.every((t) => TARGETS.includes(t)), 'targets')
  need(m.effects && typeof m.effects === 'object', 'effects')
  need(Array.isArray(m.prerequisites), 'prerequisites')
  need(Array.isArray(m.assertionIds), 'assertionIds')
  need(m.redProof === null || (typeof m.redProof === 'object' && m.redProof.kind), 'redProof')
  need(Array.isArray(m.legacyIds), 'legacyIds')
  need(KINDS.includes(m.kind), `kind ${m.kind}`)
  if (m.kind === 'scripted') need(SCENARIOS[m.ref], `scenario ${m.ref} unknown`)
  if (m.kind === 'pending')
    need(typeof m.pendingReason === 'string' && m.pendingReason !== '', 'pendingReason')
  return m
}

/** Read every manifest file; any unreadable, malformed or duplicate entry is a contract error. */
export function readManifests(dir = path.join(LAYER_DIR, 'cases')) {
  if (!existsSync(dir)) throw new Error(`no cases directory: ${dir}`)
  const out = []
  const seen = new Map()
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith('.json'))
    .sort()) {
    const file = path.join(dir, f)
    const st = lstatSync(file)
    if (!st.isFile()) throw new Error(`${f}: not a regular file`)
    const rows = readJson(file)
    if (!Array.isArray(rows)) throw new Error(`${f}: expected an array of cases`)
    for (const m of rows) {
      validateManifest(m, f)
      if (seen.has(m.id)) throw new Error(`duplicate case id ${m.id} (${seen.get(m.id)} and ${f})`)
      seen.set(m.id, f)
      out.push(m)
    }
  }
  if (out.length === 0) throw new Error('no cases found')
  return out
}

export async function listCases({ area } = {}) {
  const all = readManifests()
  if (!area) return all
  if (!AREAS.includes(area)) throw new UsageError(`unknown area "${area}" (known: ${AREAS.join(', ')})`)
  if (KINDS.includes(area)) return all.filter((m) => m.kind === area)
  return all.filter((m) => m.itemIds.includes(`flow:${area}`))
}

// ── helpers for results ─────────────────────────────────────────────────────────────────────────

const result = (m, verdict, reason, extra = {}) => {
  if (!VERDICTS.includes(verdict)) throw new Error(`bad verdict ${verdict}`)
  return {
    id: m.id,
    verdict,
    reason,
    assertionIds: m.assertionIds,
    evidence: [],
    durationMs: 0,
    redProof: null,
    ...extra
  }
}

function writeEvidence(outDir, name, data) {
  const rel = path.join('evidence', `${name}.json`)
  writeAtomic(path.join(outDir, rel), redactText(`${JSON.stringify(data, null, 2)}\n`))
  return rel
}

/**
 * The secrets scan over every text file under outDir: returns [{ file, kinds }]. Every entry that is
 * neither a directory nor a regular file (a symlink to a file or to a directory, a FIFO, a device) and
 * every directory that cannot be listed is recorded as unscannable, whatever its name: it was not scanned.
 */
export function scanArtifacts(outDir) {
  const hits = []
  const unscannable = (p, why) =>
    hits.push({ file: path.relative(outDir, p) || '.', kinds: [`unscannable: ${why}`] })
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      unscannable(dir, `cannot be listed (${error?.code ?? error?.message})`)
      return
    }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (!e.isFile()) unscannable(p, e.isSymbolicLink() ? 'symlink' : 'not a regular file')
      else if (/\.(json|jsonl|md|log|txt|tap)$/.test(e.name)) {
        let text = ''
        try {
          text = readRegular(p, { maxBytes: 64 * 1024 * 1024 })
        } catch (error) {
          // A file the reader refuses (oversized, unstable...) was not scanned: that is a hit, not a skip.
          unscannable(p, error.message)
          continue
        }
        const kinds = findSecrets(text)
        if (kinds.length) hits.push({ file: path.relative(outDir, p), kinds })
      }
    }
  }
  let top = null
  try {
    top = lstatSync(outDir)
  } catch (error) {
    if (error?.code !== 'ENOENT')
      unscannable(outDir, `cannot be inspected (${error?.code ?? error?.message})`)
  }
  if (top?.isDirectory()) walk(outDir)
  else if (top) unscannable(outDir, top.isSymbolicLink() ? 'symlink' : 'not a directory')
  return hits
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ cases: any[], target?: string, proveRed?: boolean, outDir: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv,
 *   deps?: { runScenario?: typeof runScenario, runLegacy?: typeof runLegacy, runPilot?: typeof runPilot, proveMutation?: typeof proveMutation, probeStand?: typeof probeStand } }} opts
 */
export async function run({
  cases,
  target = 'local',
  proveRed = false,
  outDir,
  signal,
  env = process.env,
  deps = {}
}) {
  if (!TARGETS.includes(target))
    throw new UsageError(`unknown target "${target}" (known: ${TARGETS.join(', ')})`)
  if (!Array.isArray(cases)) throw new UsageError('cases must be an array of manifests')
  if (!outDir) throw new UsageError('outDir is required')
  mkdirSync(outDir, { recursive: true })
  const d = { runScenario, runLegacy, runPilot, proveMutation, probeStand, ...deps }
  const results = new Map()
  const t0 = Date.now()
  const done = (m, r) => {
    results.set(m.id, r)
    writeJsonAtomic(path.join(outDir, 'results.partial.json'), [...results.values()])
  }

  // 1. Target policy: every case of this layer writes (accounts, seats, sites, containers).
  if (target !== 'local') {
    for (const m of cases)
      done(
        m,
        result(
          m,
          'PENDING',
          `PENDING: target-policy — ${m.id} writes (${(m.effects.writes ?? []).join(', ') || 'state'}); only read-only cases may run on ${target}`
        )
      )
    return finalize(cases, results, outDir, t0)
  }

  // 2. Pending by name, and ENV with a probe where the missing dependency is provable.
  const live = []
  for (const m of cases) {
    if (m.kind === 'pending') {
      const missing = await probePending(m, env, d)
      if (missing) done(m, result(m, 'ENV', `ENV: ${missing}`, { probe: missing }))
      else done(m, result(m, 'PENDING', m.pendingReason))
    } else live.push(m)
  }

  // 3. A stand is needed for everything else.
  const stand = standFromEnv(env)
  const probe = live.length ? await d.probeStand(stand) : { ok: true, detail: 'no live case requested' }
  if (live.length && !probe.ok) {
    const boot = parseBootstrap(env.QA_STAND_BOOTSTRAP)
    for (const m of live) {
      if (boot && boot.kind !== 'env')
        // The stand did not come up for a reason that is not a missing dependency (a build that
        // failed, a deadline): the case did not run, and that is not an ENV claim.
        done(
          m,
          result(
            m,
            'PENDING',
            `PENDING: stand-bootstrap-${boot.kind} — ${boot.detail}${boot.logFile ? ` (raw log: ${boot.logFile})` : ''}`,
            { probe: probe.detail }
          )
        )
      else {
        const why = boot ? `${boot.detail}${boot.probe ? ` — ${boot.probe}` : ''}` : probe.detail
        done(m, result(m, 'ENV', `ENV: ${why}`, { probe: why }))
      }
    }
    return finalize(cases, results, outDir, t0)
  }
  if (live.length) await installLoopbackLookup(stand.siteDomain, REPO).catch(() => {})

  const infoFile = env.QA_STAND_INFO
  const l = infoFile ? { ...layout(path.resolve(path.dirname(infoFile), '..')) } : null
  const intent = l && existsSync(l.intent) ? new Intent(l.intent) : null
  const fx = live.length ? new Fixtures({ stand, intent }) : null
  const aborted = () => signal?.aborted === true
  const greenScenarios = new Map()
  /** @type {Map<string, any>} */
  const scripted = new Map()

  try {
    // 4. Legacy journeys through the adapter, in one runner invocation. First: the runner uses
    // pool labels (tchqa-sw…) that the scripted scenarios also need, and it deletes its own sites.
    const legacy = live.filter((x) => x.kind === 'legacy')
    if (legacy.length && !aborted()) {
      const journeys = [...new Set(legacy.map((m) => m.ref))]
      const started = Date.now()
      let lr
      try {
        lr = await d.runLegacy({ journeys, stand, outDir, signal })
      } catch (error) {
        lr = { byJourney: new Map(), problem: error.message }
      }
      for (const m of legacy) {
        const j = lr.byJourney.get(m.ref)
        if (!j) {
          done(
            m,
            result(
              m,
              'PENDING',
              `TEST_INVALID: the legacy run gave no record for ${m.ref}${lr.problem ? ` (${lr.problem})` : ''}`,
              { durationMs: Date.now() - started }
            )
          )
        } else if (j.candidate) {
          done(
            m,
            result(
              m,
              'PENDING',
              `legacy ${m.ref} passed; no RED proof is recorded for a legacy journey, so it does not count as PASS`,
              { evidence: j.evidence, durationMs: Date.now() - started }
            )
          )
        } else
          done(m, result(m, j.verdict, j.reason, { evidence: j.evidence, durationMs: Date.now() - started }))
      }
    } else for (const m of legacy) done(m, result(m, 'PENDING', 'interrupted before this case ran'))

    // 5. Scripted scenarios, one after another (one stand, no parallelism), after the legacy run has
    // deleted its sites.
    for (const m of live.filter((x) => x.kind === 'scripted')) {
      if (aborted()) {
        done(m, result(m, 'PENDING', 'interrupted before this case ran'))
        continue
      }
      const started = Date.now()
      const r = await d.runScenario(m.ref, fx)
      greenScenarios.set(m.ref, r)
      scripted.set(m.id, { m, r })
      const ev = writeEvidence(outDir, m.id, {
        case: m.id,
        at: nowIso(),
        outcome: r.outcome,
        reason: r.reason,
        probe: r.probe ?? null,
        assertions: r.assertions
      })
      const base = { evidence: [ev], durationMs: Date.now() - started }
      if (r.outcome === 'PASS')
        done(m, result(m, 'PENDING', 'assertions held; no RED proof yet', base)) // upgraded below
      else
        done(
          m,
          result(m, r.outcome, r.outcome === 'ENV' ? `ENV: ${r.reason}` : r.reason, {
            ...base,
            ...(r.probe ? { probe: r.probe } : {})
          })
        )
    }

    // 6. The publish pilot (needs stubs that are not shipped; says so).
    for (const m of live.filter((x) => x.kind === 'pilot')) {
      const r = await d.runPilot({
        stand,
        outDir,
        cdp: env.QA_FLOWS_CDP ?? 'http://127.0.0.1:9222',
        stubDir: env.QA_FLOWS_PILOT_STUBS ?? null,
        intent
      })
      done(
        m,
        result(
          m,
          'PENDING',
          r.status === 'PENDING'
            ? r.reason
            : 'pilot rows are recorded as evidence; no approved oracle for publish in this tree (REG-PR-948 is absent), so no verdict is derived from them'
        )
      )
    }

    // 7. RED proof by mutation, one mutation at a time on the one stand.
    if (proveRed) {
      const promoted = await proveAll({ scripted, greenScenarios, l, stand, fx, outDir, signal, d })
      for (const [id, proof] of promoted) {
        const cur = results.get(id)
        results.set(id, {
          ...cur,
          verdict: proof.verdict,
          reason: proof.reason,
          redProof: proof.redProof ?? null,
          evidence: [...cur.evidence, ...proof.evidence]
        })
      }
      writeJsonAtomic(path.join(outDir, 'results.partial.json'), [...results.values()])
    }
  } finally {
    if (fx) {
      const problems = await fx.cleanup()
      writeJsonAtomic(path.join(outDir, 'fixtures-cleanup.json'), { at: nowIso(), problems })
    }
  }
  return finalize(cases, results, outDir, t0)
}

function parseBootstrap(text) {
  if (!text) return null
  try {
    const b = JSON.parse(text)
    return typeof b?.kind === 'string' && typeof b.detail === 'string' ? b : null
  } catch {
    return null
  }
}

/**
 * Probe, now, the dependency a pending case names. Returns the probe text when the dependency is
 * proven missing (→ ENV); null when it is present or the case names none (→ PENDING by name).
 */
async function probePending(m, env, d) {
  if (m.itemIds.includes('flow:import-site')) {
    const source = env.QA_FLOWS_IMPORT_SOURCE
    if (!source) return 'no import source site: QA_FLOWS_IMPORT_SOURCE is not set'
    try {
      const url = new URL(source)
      const res = await (d.fetchImpl ?? fetch)(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
      if (res.status >= 500) return `import source ${url.origin} answered ${res.status}`
    } catch (error) {
      return `import source ${source} is unreachable: ${error.cause?.code ?? error.message}`
    }
    return null
  }
  if (m.id.includes('no-model-credentials')) {
    const key = readStandEnvValue(env, 'MODEL_API_KEY')
    if (key.error) return null // not probed, so not proven missing: the case stays PENDING by name
    if (!key.value)
      return `no model credentials: MODEL_API_KEY is empty in the stand's environment (${key.where})`
  }
  return null
}

/** One value of the stand's generated .env (located through QA_STAND_INFO) or of the process environment. */
function readStandEnvValue(env, name) {
  if (env[name]) return { value: env[name], where: 'process environment' }
  const info = env.QA_STAND_INFO
  if (!info) return { value: '', where: 'QA_STAND_INFO is not set', error: 'QA_STAND_INFO is not set' }
  const file = path.join(path.dirname(info), 'gen', '.env')
  try {
    const line = readTextSync(file)
      .split('\n')
      .find((x) => x.startsWith(`${name}=`))
    return { value: (line ?? '').slice(name.length + 1).trim(), where: file }
  } catch (error) {
    return { value: '', where: file, error: `${file}: ${error.code ?? error.message}` }
  }
}

/** Mutations in file order; returns Map<caseId, { verdict, reason, redProof, evidence }>. */
async function proveAll({ scripted, greenScenarios, l, stand, fx, outDir, signal, d }) {
  const out = new Map()
  const passing = [...scripted.values()].filter((x) => x.r.outcome === 'PASS')
  for (const { m } of passing)
    out.set(m.id, {
      verdict: 'PENDING',
      reason: 'assertions held; no recorded mutation names this case, so no RED proof',
      evidence: []
    })
  if (!passing.length) return out
  if (!l || !existsSync(l.src)) {
    for (const { m } of passing)
      out.set(m.id, {
        verdict: 'PENDING',
        reason:
          "assertions held; RED needs the stand's scratch copy of the tree (DIR/stand/src) and none was found",
        evidence: []
      })
    return out
  }
  let mutations
  try {
    mutations = loadMutations(MUTATIONS_FILE)
  } catch (error) {
    for (const { m } of passing)
      out.set(m.id, { verdict: 'PENDING', reason: `TEST_INVALID: ${error.message}`, evidence: [] })
    return out
  }
  const byScenario = new Map(passing.map((x) => [x.m.ref, x.m]))
  const hashes = {
    testSha256: sha256File(path.join(LAYER_DIR, 'scenarios.mjs')),
    oracleSha256: sha256File(path.join(LAYER_DIR, 'scenario-meta.mjs')),
    fixtureSha256: sha256File(MUTATIONS_FILE)
  }
  const runScenarios = async (names) => {
    const map = new Map()
    for (const n of names) map.set(n, await d.runScenario(n, fx))
    return map
  }
  for (const mut of mutations) {
    if (signal?.aborted) break
    const relevant = mut.cases.filter((c) => byScenario.has(c.scenario))
    if (!relevant.length) continue
    const need = new Set(relevant.map((c) => c.scenario))
    // Only scenarios still without a proof are worth another mutant build.
    if ([...need].every((s) => out.get(byScenario.get(s).id)?.redProof)) continue
    const proof = await d.proveMutation({
      m: { ...mut, cases: relevant },
      l,
      stand,
      outDir,
      runScenarios,
      greenResults: greenScenarios,
      hashes
    })
    for (const scenario of need) {
      const m = byScenario.get(scenario)
      const mine = proof.targets.filter((t) => t.scenario === scenario)
      const want = relevant.filter((c) => c.scenario === scenario)
      if (out.get(m.id)?.redProof) continue
      const verified = verifyProof(proof, { outDir, scenario, assertions: mine.map((t) => t.assertion) })
      if (mine.length === want.length && mine.length > 0 && mine.every((t) => t.red) && verified.ok) {
        const first = mine[0]
        out.set(m.id, {
          verdict: 'PASS',
          reason: `every assertion held on the product and ${mine.map((t) => t.assertion).join(', ')} went red on mutant ${mut.id}`,
          redProof: {
            kind: 'mutation',
            ref: mut.id,
            assertionId: `${scenario}#${first.assertion}`,
            log: proof.log,
            logSha256: proof.logSha256,
            assertionIds: mine.map((t) => `${scenario}#${t.assertion}`),
            ...proof.evidence
          },
          evidence: [proof.log]
        })
      } else {
        const why = !proof.applied
          ? proof.reason
          : !proof.built
            ? proof.reason
            : mine.some((t) => !t.red)
              ? mine.find((t) => !t.red).why
              : !verified.ok
                ? `proof not verified: ${verified.why}${proof.reason ? ` (${proof.reason})` : ''}`
                : (proof.reason ?? 'target not red')
        out.set(m.id, {
          verdict: 'PENDING',
          reason: `assertions held; mutant ${mut.id} gave no red proof (${why})`,
          evidence: [proof.log]
        })
      }
    }
  }
  return out
}

// ── finalize ────────────────────────────────────────────────────────────────────────────────────

function finalize(cases, results, outDir, t0) {
  const list = cases.map((m) => {
    const r = results.get(m.id)
    return r ?? result(m, 'PENDING', 'not run: no result was produced for this case')
  })
  // A PASS without a red proof is not a PASS: the layer never returns one.
  for (const r of list)
    if (r.verdict === 'PASS') {
      const p = r.redProof
      const [scenario] = String(p?.assertionId ?? '').split('#')
      const names = (p?.assertionIds ?? []).map((x) => x.split('#')[1])
      const v = p?.log
        ? verifyProof(
            { ...p, applied: true, built: true, restored: true, evidence: p },
            { outDir, scenario, assertions: names }
          )
        : { ok: false, why: 'no red proof' }
      if (!v.ok) Object.assign(r, { verdict: 'PENDING', reason: `${r.reason} — but ${v.why}, so PENDING` })
    }
  const leaks = scanArtifacts(outDir)
  if (leaks.length)
    list.push({
      id: 'QA-FLOWS-artifacts-no-secret-leak',
      verdict: 'FAIL',
      reason: `secrets in artifacts: ${leaks.map((x) => `${x.file} (${x.kinds.join(',')})`).join('; ')}`,
      assertionIds: ['artifacts#no-secret-leak'],
      evidence: leaks.map((x) => x.file),
      durationMs: 0,
      redProof: null
    })
  list.durationMs = Date.now() - t0
  return list
}

export const _internal = { validateManifest, result, probePending, parseBootstrap, sha256, probeStand }
