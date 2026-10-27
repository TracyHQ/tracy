/**
 * The harness layer: `listCases` and `run`.
 *
 * Verdicts (plan §2): PASS needs a green assertion, a valid oracle, a green positive control AND a
 * RED proof of its own (the same assertion failing on a recorded mutation of product code, with the
 * mutant still booting). Green without that proof is PENDING; a missing dependency proven by a probe
 * is ENV; a violated expectation is FAIL. A run without `proveRed` therefore cannot produce PASS.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  MAX_LAYER_FILE_BYTES,
  readBoundedJsonSync,
  readBoundedSync,
  readTextSync
} from '../../lib/bounded-reader.mjs'
import { resolve as resolveAssertion } from './assertions.mjs'
import { expandTo, generated } from './generate.mjs'
import { runLive } from './live-model.mjs'
import { MUTANTS, mutantsFor, noMutantReason, sha } from './mutations.mjs'
import { writeReport } from './report.mjs'
import { EnvProbeError, REPO, createRuntime, probeRuntime, removeScratch, tmpRootFor } from './runtime.mjs'
import { standardOptions } from './scenarios.mjs'
import { DEFAULT_PATHS } from './staticchecks.mjs'

export const layer = 'harness'
const here = path.dirname(fileURLToPath(import.meta.url))
const TARGETS = ['local', 'dev', 'prod']
// Every name the manifests may declare; only `local` can be run (see `run`).
const CASE_TIMEOUT_MS = 120_000
const MARKER = '.qa-harness-out'

export class UsageError extends Error {}

const REQUIRED_FIELDS = [
  'id',
  'itemIds',
  'requirement',
  'oracle',
  'edgeTags',
  'targets',
  'effects',
  'prerequisites',
  'assertionIds',
  'redProof',
  'legacyIds'
]

const isList = (v) => Array.isArray(v)
const isStrings = (v) => isList(v) && v.every((x) => typeof x === 'string' && x !== '')
const isPlain = (v) => typeof v === 'object' && v !== null && !isList(v)

/** Full manifest contract check: returns the list of problems (empty = valid). Never throws. */
export function manifestProblems(manifest) {
  if (!isPlain(manifest)) return ['manifest is not an object']
  const problems = []
  const missing = REQUIRED_FIELDS.filter((field) => !(field in manifest))
  if (missing.length > 0) problems.push(`lacks ${missing.join(', ')}`)
  if (typeof manifest.id !== 'string' || !/^QA-HARNESS-[A-Za-z0-9_-]+$/.test(manifest.id))
    problems.push('id does not match QA-HARNESS-<item-key>-<tag>')
  for (const field of ['itemIds', 'edgeTags', 'prerequisites', 'legacyIds'])
    if (field in manifest && !isStrings(manifest[field])) problems.push(`${field} must be a list of strings`)
  if ('itemIds' in manifest && isList(manifest.itemIds) && manifest.itemIds.length === 0)
    problems.push('itemIds is empty')
  if ('assertionIds' in manifest && !(isStrings(manifest.assertionIds) && manifest.assertionIds.length > 0))
    problems.push('assertionIds must be a non-empty list of strings')
  if ('targets' in manifest) {
    if (!isStrings(manifest.targets) || manifest.targets.length === 0)
      problems.push('targets must be a non-empty list of strings')
    else if (manifest.targets.some((t) => !TARGETS.includes(t)))
      problems.push('targets holds an unknown target')
  }
  if ('requirement' in manifest && (typeof manifest.requirement !== 'string' || manifest.requirement === ''))
    problems.push('requirement must be a non-empty string')
  if ('oracle' in manifest) {
    const o = manifest.oracle
    if (!isPlain(o) || ['source', 'ref', 'invariant'].some((k) => typeof o[k] !== 'string' || o[k] === ''))
      problems.push('oracle needs non-empty source, ref and invariant strings')
  }
  if ('effects' in manifest) {
    const e = manifest.effects
    if (!isPlain(e)) problems.push('effects must be an object')
    else {
      for (const k of ['reads', 'writes']) if (!isList(e[k])) problems.push(`effects.${k} must be a list`)
      for (const k of ['mail', 'model', 'containers'])
        if (typeof e[k] !== 'boolean') problems.push(`effects.${k} must be a boolean`)
    }
  }
  if ('redProof' in manifest && manifest.redProof !== null && !isPlain(manifest.redProof))
    problems.push('redProof must be null or an object')
  return problems
}

/** Throws UsageError (exit 2) listing the problems of one manifest, if any. */
export function assertManifest(manifest, where) {
  const problems = manifestProblems(manifest)
  if (problems.length > 0)
    throw new UsageError(`case ${manifest?.id ?? '?'} in ${where}: ${problems.join('; ')}`)
}

/** Validate a whole list of manifests (shape, then unique ids). */
export function assertManifests(list, where) {
  if (!isList(list)) throw new UsageError(`${where} must hold a list of manifests`)
  for (const manifest of list) assertManifest(manifest, where)
  const ids = list.map((m) => m.id)
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dup.length > 0) throw new UsageError(`duplicate case ids: ${[...new Set(dup)].join(', ')}`)
}

/**
 * Validate and flatten the case documents (`cases/<family>.json` → text). A malformed one is a contract
 * error (exit 2), never skipped.
 * @param {Map<string, string>} documents - relative name → text; only `cases/*.json` entries are read.
 */
export function manifestsFromDocuments(documents) {
  const out = []
  for (const name of [...documents.keys()].filter((n) => /^cases\/[^/]+\.json$/.test(n)).sort()) {
    const family = name.slice(6).replace(/\.json$/, '')
    let list
    try {
      list = JSON.parse(documents.get(name))
    } catch (error) {
      throw new UsageError(`case file ${name} is not valid JSON: ${error.message}`)
    }
    if (!isList(list)) throw new UsageError(`case file ${name} must hold a list of manifests`)
    for (const manifest of list) {
      assertManifest(manifest, name)
      out.push({ ...manifest, family })
    }
  }
  assertManifests(out, 'the case set')
  return out
}

/** Read the case files of a folder (an expanded `generated/cases` or a test fixture) and validate them. */
export function loadManifests(dir) {
  if (!fs.existsSync(dir)) throw new UsageError(`no case manifests at ${dir}`)
  const documents = new Map()
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')))
    documents.set(
      `cases/${name}`,
      readBoundedSync(path.join(dir, name), { maxBytes: MAX_LAYER_FILE_BYTES }).toString('utf8')
    )
  return manifestsFromDocuments(documents)
}

/** The documents of this tree, rebuilt and pinned by manifest.json; a mismatch is a contract error. */
export async function generatedFiles() {
  try {
    return (await generated()).files
  } catch (error) {
    if (error.drift === undefined) throw error
    throw new UsageError(error.message)
  }
}

export async function listCases({ area } = {}) {
  const all = manifestsFromDocuments(await generatedFiles())
  if (area === undefined || area === null || area === '') return all
  const wanted = String(area)
  const known = new Set(all.map((m) => m.family))
  if (
    !known.has(wanted) &&
    !all.some((m) => m.id.includes(wanted) || m.itemIds.some((i) => i.includes(wanted)))
  ) {
    throw new UsageError(
      `unknown area "${wanted}"; known: ${[...known].sort().join(', ')} (or part of a case/item id)`
    )
  }
  return all.filter(
    (m) => m.family === wanted || m.id.includes(wanted) || m.itemIds.some((i) => i.includes(wanted))
  )
}

const MARKER_TEXT = 'qa harness layer output\n'

/** realpath of `abs` through its deepest existing ancestor (the rest does not exist yet). */
function realPathOfFuture(abs) {
  const rest = []
  let cur = abs
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...rest.reverse())
    } catch {
      const parent = path.dirname(cur)
      if (parent === cur) return abs
      rest.push(path.basename(cur))
      cur = parent
    }
  }
}

/**
 * Refuse an output folder that is not ours to write: a symlink or a non-folder, a folder holding other
 * data (our marker must be a regular file with our text), or a place inside tracked code. Every check
 * is made on the real path, so a link cannot lead a write or a delete somewhere else.
 */
export function checkOutDir(outDir) {
  const abs = path.resolve(outDir)
  if (abs === path.parse(abs).root || abs === process.env.HOME)
    throw new UsageError(`unsafe output path ${abs}`)
  let stat = null
  try {
    stat = fs.lstatSync(abs)
  } catch {
    // does not exist yet: made by this run
  }
  if (stat?.isSymbolicLink()) throw new UsageError(`output path ${abs} is a symbolic link`)
  if (stat !== null && !stat.isDirectory())
    throw new UsageError(`output path ${abs} exists and is not a folder`)
  const real = realPathOfFuture(abs)
  const repoReal = realPathOfFuture(REPO)
  const rel = path.relative(repoReal, real)
  const insideRepo = !rel.startsWith('..') && !path.isAbsolute(rel)
  const resultsRoot = path.join(repoReal, 'qa-results')
  const underResults = real === resultsRoot || real.startsWith(`${resultsRoot}${path.sep}`)
  if (insideRepo && !underResults)
    throw new UsageError(`unsafe output path ${abs}: inside the repository but outside qa-results/`)
  if (stat !== null) {
    const entries = fs.readdirSync(abs)
    if (entries.length > 0) {
      let ours = false
      try {
        const marker = fs.lstatSync(path.join(abs, MARKER))
        ours = marker.isFile() && readTextSync(path.join(abs, MARKER)) === MARKER_TEXT
      } catch {
        ours = false
      }
      if (!ours) throw new UsageError(`output folder ${abs} is not empty and was not made by this layer`)
    }
  }
  return abs
}

const utc = () => new Date().toISOString().replace(/[:.]/g, '-')
export const defaultOutDir = () => path.join(REPO, 'qa-results', `harness-${utc()}`)

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

const timeout = (promise, ms, what) => {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(Object.assign(new Error(`${what} did not finish within ${ms / 1000}s`), { timedOut: true })),
        ms
      )
    })
  ])
}

/** `{ ok }` of a scenario result: controls first (invalid test), then checks (product). */
export function judge(result) {
  const badControls = (result.controls ?? []).filter((c) => !c.ok)
  if (badControls.length > 0) return { kind: 'invalid', controls: badControls, failed: [] }
  const failed = (result.checks ?? []).filter((c) => !c.ok)
  if (failed.length > 0) return { kind: 'fail', controls: [], failed }
  return { kind: 'green', controls: [], failed: [] }
}

/**
 * Run cases.
 * @param {object} options
 * @param {object[]} [options.cases] - manifests to run (default: all).
 * @param {'local'|'dev'|'prod'} [options.target]
 * @param {boolean} [options.proveRed]
 * @param {string} [options.outDir]
 * @param {boolean} [options.liveModel]
 * @param {Map<string, string>} [options.documents] - generated documents to expand into `<out>/generated/`.
 * @param {object} [options.hooks] - test seams: `resolve`, `mutantsFor`, `probe`, `runtimeOptions`, `live`.
 */
export async function run({
  cases,
  target = 'local',
  proveRed = false,
  outDir,
  liveModel = false,
  documents,
  hooks = {},
  jobs
} = {}) {
  if (!TARGETS.includes(target)) throw new UsageError(`unknown target "${target}" (local)`)
  if (target !== 'local')
    throw new UsageError(
      `target ${target} is refused: this layer reads the local worktree and has no adapter for dev or prod`
    )
  const manifests = cases ?? manifestsFromDocuments(await generatedFiles())
  assertManifests(manifests, 'the cases given to run()')
  const out = checkOutDir(outDir ?? defaultOutDir())
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, MARKER), MARKER_TEXT)
  if (documents !== undefined) expandTo(path.join(out, 'generated'), documents)
  const wanted =
    jobs ?? Number(process.env.QA_HARNESS_JOBS ?? Math.min(6, Math.max(1, Math.floor(os.cpus().length / 2))))
  if (wanted > 1 && manifests.length >= 40 && hooks.resolve === undefined) {
    return await runSharded({ manifests, jobs: wanted, target, proveRed, liveModel, out })
  }
  const ownScratch = process.env.QA_HARNESS_ARTIFACT_ROOT === undefined
  const artifactRoot = process.env.QA_HARNESS_ARTIFACT_ROOT ?? path.join(out, 'scratch')
  if (ownScratch && fs.existsSync(artifactRoot))
    throw new UsageError(`${artifactRoot} already exists: this run only removes scratch it made itself`)
  fs.mkdirSync(artifactRoot, { recursive: true })
  const resolve = hooks.resolve ?? resolveAssertion
  const findMutants = hooks.mutantsFor ?? mutantsFor
  const probe = hooks.probe ?? probeRuntime
  const runtimeOptions = hooks.runtimeOptions ?? (() => ({}))

  const started = Date.now()
  const results = new Map()
  const detail = new Map()
  const record = (manifest, partial, extra = {}) => {
    const entry = {
      id: manifest.id,
      verdict: partial.verdict,
      reason: partial.reason,
      assertionIds: manifest.assertionIds,
      evidence: partial.evidence ?? [],
      durationMs: partial.durationMs ?? 0,
      redProof: partial.redProof ?? null
    }
    results.set(manifest.id, entry)
    detail.set(manifest.id, {
      manifest: {
        id: manifest.id,
        itemIds: manifest.itemIds,
        edgeTags: manifest.edgeTags,
        oracle: manifest.oracle
      },
      ...extra
    })
    return entry
  }
  const writeEvidence = (manifest, body) => {
    const rel = path.join('evidence', `${manifest.id}.json`)
    writeAtomic(path.join(out, rel), `${JSON.stringify(body, null, 2)}\n`)
    return rel
  }

  // ── runtimes: created lazily, recreated after a timeout, always disposed ──
  const live = new Set()
  const missing = probe()
  const getRuntime = async (kind, extra = {}) => {
    const root = tmpRootFor(artifactRoot, kind)
    const options =
      kind === 'legacy'
        ? { root, approval: 'legacy-ask', sites: standardOptions().sites, ...runtimeOptions(), ...extra }
        : { root, ...standardOptions(), ...runtimeOptions(), ...extra }
    let rt
    try {
      rt = await createRuntime(options)
    } catch (error) {
      try {
        removeScratch(root, artifactRoot)
      } catch {
        // swept with the artifact root
      }
      throw error
    }
    const handle = { rt, root, schemas: null }
    handle.schemas = Object.fromEntries(rt.tools().map((t) => [t.name, t.parameters ?? null]))
    live.add(handle)
    return handle
  }
  const dispose = async (handle) => {
    live.delete(handle)
    try {
      await handle.rt.dispose()
    } catch {
      // best effort: the scratch removal below still runs
    }
    try {
      removeScratch(handle.root, artifactRoot)
    } catch {
      // left for the final sweep
    }
  }
  let shared = null
  let legacy = null
  const runtimeFor = async (kind) => {
    // One live runtime at a time: tracy-site-tools keeps its turn ledger in a module-level binding that
    // the latest `apply()` takes over, so a second runtime in this process would blind the first one
    // (writes would leave without `x-tracy-turn`).
    if (kind === 'shared') {
      if (legacy) await resetRuntime('legacy')
      return (shared ??= await getRuntime('shared'))
    }
    if (kind === 'legacy') {
      if (shared) await resetRuntime('shared')
      return (legacy ??= await getRuntime('legacy'))
    }
    if (kind === 'own') {
      // The case boots runtimes of its own: leave none of ours alive beside it, and none stale after it
      // (the next case re-applies the plugins on a fresh one).
      await resetRuntime('shared')
      await resetRuntime('legacy')
    }
    return null
  }
  const resetRuntime = async (kind) => {
    if (kind === 'shared' && shared) {
      await dispose(shared)
      shared = null
    }
    if (kind === 'legacy' && legacy) {
      await dispose(legacy)
      legacy = null
    }
  }

  /** Execute one assertion once, against `rtHandle` and `paths`. Never throws: returns a classification. */
  async function execute(manifest, handle, paths, extra = {}) {
    const assertionId = manifest.assertionIds[0]
    const found = resolve(assertionId)
    if (found === null) return { kind: 'unknown', reason: `no assertion registered for ${assertionId}` }
    try {
      const result = await timeout(
        Promise.resolve(
          found.run({
            rt: handle?.rt,
            schemas: handle?.schemas ?? {},
            paths: paths ?? DEFAULT_PATHS,
            artifactRoot,
            extra
          })
        ),
        CASE_TIMEOUT_MS,
        assertionId
      )
      return { ...judge(result), result }
    } catch (error) {
      if (error.timedOut === true) return { kind: 'timeout', reason: error.message }
      return {
        kind: 'threw',
        reason: `${error.message}`.split('\n')[0],
        stack: String(error.stack ?? '')
          .split('\n')
          .slice(0, 6)
          .join('\n')
      }
    }
  }

  // ── phase 1: run every case on the current tree ──
  const green = []
  try {
    for (const manifest of manifests) {
      const t0 = Date.now()
      const finish = (partial, extra) => record(manifest, { ...partial, durationMs: Date.now() - t0 }, extra)
      const assertionId = manifest.assertionIds[0]
      const readOnly =
        manifest.effects.writes.length === 0 && !manifest.effects.containers && !manifest.effects.model
      if (target !== 'local' && !readOnly) {
        finish({
          verdict: 'PENDING',
          reason: `target-policy: only cases declared read-only run against target ${target}; this case writes scratch state or starts a runtime`
        })
        continue
      }
      if (!manifest.targets.includes(target)) {
        // The assertions read this worktree (DEFAULT_PATHS); a case that does not declare the target has
        // no adapter that reads it there, and a local reading must never carry a dev/prod label.
        finish({
          verdict: 'PENDING',
          reason:
            target === 'local'
              ? 'case does not declare target local'
              : `target-adapter: no adapter reads target ${target} for this case (its assertion reads the local worktree)`
        })
        continue
      }
      if (assertionId.startsWith('harness.live.')) {
        if (!liveModel) {
          finish({
            verdict: 'PENDING',
            reason: 'live-model: not requested (run with --live-model); never part of a default run'
          })
          continue
        }
        const r = await (hooks.live ?? runLive)(manifest)
        finish({
          verdict: r.verdict,
          reason: r.reason,
          evidence: [writeEvidence(manifest, r.evidence ?? {})]
        })
        continue
      }
      const found = resolve(assertionId)
      if (found === null) {
        finish({ verdict: 'PENDING', reason: `TEST_INVALID: no assertion registered for ${assertionId}` })
        continue
      }
      const needsBuild =
        found.runtime !== 'none' && manifest.prerequisites.some((p) => p === 'dsh-built-submodule')
      if (needsBuild && missing.length > 0) {
        finish({
          verdict: 'ENV',
          reason: `prerequisite probe failed — missing built output: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` (+${missing.length - 4} more)` : ''}`
        })
        continue
      }
      let handle = null
      try {
        handle = await runtimeFor(found.runtime)
      } catch (error) {
        const first = String(error.message).split('\n')[0]
        const stillMissing = probe()
        if (error instanceof EnvProbeError) {
          finish({ verdict: 'ENV', reason: `prerequisite probe failed — ${first}` })
        } else if (stillMissing.length > 0) {
          finish({
            verdict: 'ENV',
            reason: `prerequisite probe failed — missing built output: ${stillMissing.slice(0, 4).join(', ')}; boot error: ${first}`
          })
        } else {
          // Nothing proves a dependency is missing: an unexplained boot failure is the test's problem.
          finish({
            verdict: 'PENDING',
            reason: `TEST_INVALID: runtime did not boot and no probe explains it — ${first}`
          })
        }
        continue
      }
      const done = await execute(manifest, handle, DEFAULT_PATHS)
      const evidence = writeEvidence(manifest, {
        assertionId,
        outcome: done.kind,
        controls: done.result?.controls,
        checks: done.result?.checks,
        evidence: done.result?.evidence,
        reason: done.reason,
        stack: done.stack
      })
      if (done.kind === 'timeout') await resetRuntime(found.runtime)
      if (done.kind === 'green') {
        green.push({
          manifest,
          assertionId,
          runtime: found.runtime,
          durationMs: Date.now() - t0,
          evidence,
          result: done.result
        })
        finish({
          verdict: 'PENDING',
          reason: proveRed
            ? 'green; RED proof pending'
            : 'assertions green but no RED proof (run with --prove-red): a case is not PASS without one',
          evidence: [evidence]
        })
      } else if (done.kind === 'fail') {
        const first = done.failed[0]
        finish({
          verdict: 'FAIL',
          reason: `${first.id}: ${String(first.detail).slice(0, 240)}${done.failed.length > 1 ? ` (+${done.failed.length - 1} more failing checks)` : ''}`,
          evidence: [evidence]
        })
      } else if (done.kind === 'invalid') {
        finish({
          verdict: 'PENDING',
          reason: `TEST_INVALID: positive control failed — ${done.controls.map((c) => `${c.id}: ${String(c.detail).slice(0, 120)}`).join('; ')}`,
          evidence: [evidence]
        })
      } else if (done.kind === 'timeout') {
        finish({ verdict: 'FAIL', reason: done.reason, evidence: [evidence] })
      } else {
        finish({
          verdict: 'PENDING',
          reason: `TEST_INVALID: scenario ${done.kind} — ${done.reason}`,
          evidence: [evidence]
        })
      }
    }

    // ── phase 2: RED proofs, mutant by mutant ──
    // The current-tree runtimes are done with: taking them down first keeps the process environment
    // restore order straight (each runtime puts back what it found).
    await resetRuntime('shared')
    await resetRuntime('legacy')
    const attempts = new Map()
    const proven = new Map()
    let budgetExhausted = false
    if (proveRed && green.length > 0) {
      const pending = new Set(green.map((g) => g.manifest.id))
      const mutantList = hooks.mutants ?? MUTANTS
      // The whole run (phase 1 + RED) is bounded: past the budget the remaining cases are PENDING with
      // that reason, never silently PASS and never a hang. Default 12 minutes per worker.
      const budgetMs = Number(process.env.QA_HARNESS_RED_BUDGET_MS ?? 720_000)
      for (const mutant of mutantList) {
        if (Date.now() - started > budgetMs) {
          budgetExhausted = true
          break
        }
        const targets = green.filter(
          (g) => pending.has(g.manifest.id) && findMutants(g.assertionId).some((m) => m.id === mutant.id)
        )
        if (targets.length === 0) continue
        const perCase = mutant.prepare.length >= 2
        let prepared = null
        /** One mutated runtime per kind ('shared' / 'legacy'); static assertions need none. */
        const handles = new Map()
        const disposeHandles = async () => {
          for (const h of handles.values()) await dispose(h)
          handles.clear()
        }
        const scratchBase = tmpRootFor(artifactRoot, `mutant-${mutant.id.replace(/[^A-Za-z0-9]+/g, '-')}`)
        try {
          for (const g of targets) {
            const log = attempts.get(g.manifest.id) ?? []
            attempts.set(g.manifest.id, log)
            try {
              if (perCase || prepared === null) {
                const dir = perCase ? tmpRootFor(scratchBase, 'c') : scratchBase
                prepared = await mutant.prepare(dir, g.assertionId)
                prepared.hash = sha((prepared.changed ?? []).map((c) => c.sha256).join(':'))
                await disposeHandles()
              }
            } catch (error) {
              log.push({
                mutant: mutant.id,
                outcome: 'not-applicable',
                note: String(error.message).split('\n')[0]
              })
              continue
            }
            const found = resolve(g.assertionId)
            if (found.runtime !== 'none' && !handles.has(found.runtime)) {
              // Same one-runtime-at-a-time rule as phase 1 (see runtimeFor).
              await disposeHandles()
              try {
                handles.set(
                  found.runtime,
                  await getRuntime(found.runtime, {
                    productDirs: prepared.productDirs ?? {},
                    profile: prepared.profile ?? {}
                  })
                )
              } catch (error) {
                log.push({
                  mutant: mutant.id,
                  outcome: 'invalid-mutant',
                  note: `did not boot: ${String(error.message).split('\n')[0]}`
                })
                prepared = perCase ? null : prepared
                continue
              }
            }
            const paths = { ...DEFAULT_PATHS, ...prepared.paths }
            const done = await execute(g.manifest, handles.get(found.runtime) ?? null, paths, {
              productDirs: prepared.productDirs ?? {},
              profile: prepared.profile ?? {}
            })
            if (done.kind === 'fail') {
              proven.set(g.manifest.id, {
                mutant,
                prepared,
                failed: done.failed,
                controls: done.result?.controls ?? []
              })
              pending.delete(g.manifest.id)
              log.push({ mutant: mutant.id, outcome: 'red', failed: done.failed.map((f) => f.id) })
            } else if (done.kind === 'green') log.push({ mutant: mutant.id, outcome: 'survived' })
            else
              log.push({
                mutant: mutant.id,
                outcome: done.kind === 'invalid' ? 'invalid-mutant' : done.kind,
                note: done.reason ?? done.controls?.map((c) => c.id).join(',')
              })
            if (done.kind === 'timeout') await disposeHandles()
          }
        } finally {
          await disposeHandles()
          try {
            removeScratch(scratchBase, artifactRoot)
          } catch {
            // swept at the end
          }
        }
      }
      for (const g of green) {
        const manifest = g.manifest
        const log = attempts.get(manifest.id) ?? []
        const proof = proven.get(manifest.id)
        if (proof !== undefined) {
          const rel = path.join('redproofs', `${manifest.id}.json`)
          const failedChecks = proof.failed.map((f) => f.id)
          writeAtomic(
            path.join(out, rel),
            `${JSON.stringify(
              {
                caseId: manifest.id,
                assertionId: g.assertionId,
                oracle: manifest.oracle,
                positiveControl: {
                  runOn: 'current tree',
                  controlsPassed: (g.result.controls ?? []).map((c) => c.id),
                  checksPassed: (g.result.checks ?? []).length
                },
                mutant: {
                  id: proof.mutant.id,
                  title: proof.mutant.title,
                  hash: proof.prepared.hash,
                  changed: (proof.prepared.changed ?? []).map((c) => ({
                    file: path.basename(c.file ?? ''),
                    sha256: c.sha256,
                    note: c.note
                  }))
                },
                onMutant: {
                  controlsPassed: proof.controls.map((c) => c.id),
                  failedChecks: proof.failed.map((f) => ({
                    id: f.id,
                    detail: String(f.detail).slice(0, 300)
                  }))
                },
                attempts: log
              },
              null,
              2
            )}\n`
          )
          const entry = results.get(manifest.id)
          entry.verdict = 'PASS'
          entry.reason = `green on the current tree; RED on mutant ${proof.mutant.id} (${failedChecks.join(', ')})`
          entry.redProof = {
            kind: 'mutation',
            ref: `${proof.mutant.id}@${proof.prepared.hash.slice(0, 12)}`,
            assertionId: failedChecks[0],
            log: rel
          }
          entry.evidence = [...entry.evidence, rel]
        } else {
          const entry = results.get(manifest.id)
          entry.verdict = 'PENDING'
          entry.reason =
            budgetExhausted && log.length === 0 && findMutants(g.assertionId).length > 0
              ? `no RED proof: RED time budget exhausted before mutant ${findMutants(g.assertionId)[0].id} ran (QA_HARNESS_RED_BUDGET_MS)`
              : log.length === 0
                ? `no RED proof: ${noMutantReason(g.assertionId)}`
                : `no RED proof: ${log.map((a) => `${a.mutant} ${a.outcome}${a.note ? ` (${a.note})` : ''}`).join('; ')}`
          writeAtomic(
            path.join(out, 'redproofs', `${manifest.id}.attempts.json`),
            `${JSON.stringify({ caseId: manifest.id, assertionId: g.assertionId, attempts: log, note: log.length === 0 ? noMutantReason(g.assertionId) : null }, null, 2)}\n`
          )
          entry.evidence = [...entry.evidence, path.join('redproofs', `${manifest.id}.attempts.json`)]
        }
      }
    }
  } finally {
    for (const handle of live) await dispose(handle)
    if (ownScratch) {
      try {
        fs.rmSync(artifactRoot, { recursive: true, force: true })
      } catch {
        // reported below if it is still there
      }
    }
  }

  const ordered = manifests.map((m) => results.get(m.id))
  writeAtomic(path.join(out, 'results.json'), `${JSON.stringify(ordered, null, 2)}\n`)
  const durationMs = Date.now() - started
  writeReport({ out, results: ordered, manifests, detail, target, proveRed, liveModel, durationMs, missing })
  return ordered
}

/** Exit code of a result list: 0 all PASS, 1 any FAIL, 3 ENV/PENDING only. */
export function exitCodeOf(results) {
  if (results.some((r) => r.verdict === 'FAIL')) return 1
  if (results.every((r) => r.verdict === 'PASS')) return 0
  return 3
}

const VERDICTS = ['PASS', 'FAIL', 'ENV', 'PENDING']

/** Problems of one worker's results against the cases it was given and the exit code it ended with. */
export function shardProblems(list, shard, code) {
  if (!isList(list)) return ['results.json is not a list']
  const problems = []
  const want = new Set(shard.map((m) => m.id))
  const seen = new Set()
  for (const r of list) {
    if (!isPlain(r) || typeof r.id !== 'string') {
      problems.push('a result has no id')
      continue
    }
    if (seen.has(r.id)) problems.push(`duplicate result ${r.id}`)
    seen.add(r.id)
    if (!want.has(r.id)) problems.push(`result ${r.id} was not asked for`)
    if (!VERDICTS.includes(r.verdict)) problems.push(`result ${r.id} has verdict ${String(r.verdict)}`)
    if (typeof r.reason !== 'string' && r.verdict !== 'PASS') problems.push(`result ${r.id} has no reason`)
  }
  for (const id of want) if (!seen.has(id)) problems.push(`result for ${id} is missing`)
  if (problems.length === 0 && code !== exitCodeOf(list))
    problems.push(`exit code ${code} does not match the verdicts (${exitCodeOf(list)})`)
  return problems.slice(0, 6)
}

/**
 * Run the cases in several processes: contiguous chunks of the sorted case list (so one tool's
 * variants stay together and a mutant is built by as few workers as possible), each worker a plain
 * `run.mjs --jobs 1` over its own output folder. The parent checks every worker's results against
 * the cases it was given, keeps the raw log of any worker it cannot trust (cases become
 * PENDING: TEST_INVALID), merges the rest and writes the one report.
 */
async function runSharded({ manifests, jobs, target, proveRed, liveModel, out }) {
  const sorted = [...manifests].sort((a, b) => a.id.localeCompare(b.id))
  const size = Math.ceil(sorted.length / jobs)
  const shards = []
  for (let i = 0; i < sorted.length; i += size) shards.push(sorted.slice(i, i + size))
  const started = Date.now()
  const shardsRoot = path.join(out, 'shards')
  const scratchRoot = path.join(out, 'scratch')
  const logsRoot = path.join(out, 'worker-logs')
  for (const made of [shardsRoot, scratchRoot])
    if (fs.existsSync(made))
      throw new UsageError(`${made} already exists: this run only removes what it made`)
  const children = shards.map((shard, index) => {
    const dir = path.join(shardsRoot, String(index))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, MARKER), MARKER_TEXT)
    const file = path.join(dir, 'cases.json')
    fs.writeFileSync(file, JSON.stringify(shard))
    const args = [
      ...process.execArgv,
      path.join(here, 'run.mjs'),
      '--cases-file',
      file,
      '--target',
      target,
      '--jobs',
      '1',
      '--out',
      path.join(dir, 'out')
    ]
    if (proveRed) args.push('--prove-red')
    if (liveModel) args.push('--live-model')
    const env = { ...process.env, QA_HARNESS_ARTIFACT_ROOT: path.join(scratchRoot, String(index)) }
    return new Promise((resolve) => {
      let stderr = ''
      let stdout = ''
      let spawnError = null
      const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', (chunk) => {
        stdout = (stdout + chunk).slice(-20_000)
      })
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk).slice(-20_000)
      })
      child.on('error', (error) => {
        spawnError = error
      })
      child.on('close', (code, signal) => resolve({ index, dir, code, signal, stderr, stdout, spawnError }))
    })
  })
  const done = await Promise.all(children)
  const byId = new Map()
  const invalid = (shard, index, why, code) => {
    for (const m of shard) {
      byId.set(m.id, {
        id: m.id,
        verdict: 'PENDING',
        reason: `TEST_INVALID: worker ${index} (exit ${code}) cannot be trusted: ${why}; raw log: worker-logs/${index}.log`,
        assertionIds: m.assertionIds,
        evidence: [`worker-logs/${index}.log`],
        durationMs: 0,
        redProof: null
      })
    }
  }
  fs.mkdirSync(logsRoot, { recursive: true })
  for (const { index, dir, code, signal, stderr, stdout, spawnError } of done) {
    fs.writeFileSync(
      path.join(logsRoot, `${index}.log`),
      `exit: ${code}\nsignal: ${signal}\nspawn error: ${spawnError?.message ?? 'none'}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`
    )
    const resultsFile = path.join(dir, 'out', 'results.json')
    const label = spawnError ? `spawn failed: ${spawnError.message}` : signal ? `killed by ${signal}` : null
    if (label !== null || !fs.existsSync(resultsFile)) {
      invalid(
        shards[index],
        index,
        label ?? `no results.json; ${stderr.split('\n').filter(Boolean).slice(-2).join(' | ')}`,
        code
      )
      continue
    }
    let list
    try {
      list = readBoundedJsonSync(resultsFile, { maxBytes: MAX_LAYER_FILE_BYTES })
    } catch (error) {
      invalid(shards[index], index, `results.json is not JSON (${error.message})`, code)
      continue
    }
    const problems = shardProblems(list, shards[index], code)
    if (problems.length > 0) {
      fs.copyFileSync(resultsFile, path.join(logsRoot, `${index}.results.json`))
      invalid(shards[index], index, problems.join('; '), code)
      continue
    }
    for (const r of list) byId.set(r.id, r)
    for (const sub of ['evidence', 'redproofs']) {
      const from = path.join(dir, 'out', sub)
      if (fs.existsSync(from)) fs.cpSync(from, path.join(out, sub), { recursive: true })
    }
  }
  const ordered = manifests.map((m) => byId.get(m.id))
  writeAtomic(path.join(out, 'results.json'), `${JSON.stringify(ordered, null, 2)}\n`)
  fs.rmSync(shardsRoot, { recursive: true, force: true })
  fs.rmSync(scratchRoot, { recursive: true, force: true })
  writeReport({
    out,
    results: ordered,
    manifests,
    detail: new Map(),
    target,
    proveRed,
    liveModel,
    durationMs: Date.now() - started,
    missing: probeRuntime(),
    workers: shards.length
  })
  return ordered
}
