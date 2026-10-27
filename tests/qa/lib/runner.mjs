// Runs one layer: load → validate manifests → target policy → run → validate/reconcile results →
// publish artifacts atomically. Exit codes: 0 all PASS, 1 any FAIL, 2 invalid usage/contract,
// 3 only ENV/PENDING (or cancelled / nothing selected).
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { KNOWN_LAYERS, LAYER_NAME } from './args.mjs'
import { validateAgainst } from './contracts.mjs'
import {
  UnsafePathError,
  RESERVATION_FILE,
  assertNoSymlinkPath,
  containedPath,
  createUniqueDir,
  hashJson,
  lstatOrNull,
  reserveDir,
  sha256,
  utcStamp,
  writeJson,
  atomicWrite
} from './fsafe.mjs'
import { receiptForProof, receiptsForEvidence } from './evidence.mjs'
import { gitProvenance } from './git.mjs'
import { targetPolicy } from './policy.mjs'

export const DEFAULT_LAYER_TIMEOUT_MS = 30 * 60 * 1000
export const DEFAULT_CANCEL_GRACE_MS = 5000
export const VERDICTS = ['PASS', 'FAIL', 'ENV', 'PENDING']

export class ContractError extends Error {
  constructor(message, details = []) {
    super(message)
    this.details = details
  }
}

export function layerFolderStatus(layersDir, name) {
  return lstatOrNull(path.join(layersDir, name))
}

// Layers `all` runs: the ten scoped ones plus any other folder under layers/.
export async function discoverLayers(layersDir) {
  const present = new Set()
  const info = await lstatOrNull(layersDir)
  if (info?.isDirectory()) {
    for (const entry of await fs.readdir(layersDir, { withFileTypes: true })) {
      if (LAYER_NAME.test(entry.name)) present.add(entry.name)
    }
  }
  return [...new Set([...KNOWN_LAYERS, ...present])]
}

async function loadLayerModule(layersDir, name) {
  const dir = path.join(layersDir, name)
  const info = await lstatOrNull(dir)
  if (!info) return { missing: `layer folder tests/qa/layers/${name} does not exist yet` }
  if (!info.isDirectory())
    throw new ContractError(`layers/${name} is not a directory (symlink or file refused)`)
  const entry = path.join(dir, 'index.mjs')
  const entryInfo = await lstatOrNull(entry)
  if (!entryInfo) return { missing: `layers/${name}/index.mjs does not exist yet` }
  if (!entryInfo.isFile()) throw new ContractError(`layers/${name}/index.mjs is not a regular file`)
  let mod
  try {
    mod = await import(pathToFileURL(entry).href)
  } catch (error) {
    throw new ContractError(`layers/${name}/index.mjs failed to import: ${error.message}`)
  }
  if (mod.layer !== name)
    throw new ContractError(
      `layers/${name}/index.mjs exports layer=${JSON.stringify(mod.layer)}, expected "${name}"`
    )
  if (typeof mod.listCases !== 'function' || typeof mod.run !== 'function') {
    throw new ContractError(`layers/${name}/index.mjs must export listCases() and run()`)
  }
  return { mod }
}

async function validateManifests(name, manifests, contractsDir) {
  if (!Array.isArray(manifests)) throw new ContractError(`${name}: listCases() must return an array`)
  const errors = []
  const ids = new Set()
  const prefix = `QA-${name.toUpperCase()}-`
  for (const [i, manifest] of manifests.entries()) {
    const label = manifest?.id ?? `#${i}`
    for (const e of await validateAgainst('case.schema.json', manifest, contractsDir))
      errors.push(`${label}: ${e}`)
    if (typeof manifest?.id !== 'string') continue
    if (!manifest.id.startsWith(prefix)) errors.push(`${label}: id must start with ${prefix}`)
    if (ids.has(manifest.id)) errors.push(`${label}: duplicate case id`)
    ids.add(manifest.id)
  }
  if (errors.length > 0)
    throw new ContractError(`${name}: invalid case manifests (${errors.length} error(s))`, errors)
}

// Runs `promiseFactory(signal)` under a deadline. On timeout or outer abort the layer's own
// signal is aborted and we wait up to `graceMs` for it to settle: only a confirmed termination
// lets the caller publish the run, because a layer that is still running could keep writing.
function withTimeout(promiseFactory, ms, signal, graceMs) {
  const control = new AbortController()
  let timer
  let onAbort
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ cancelled: `layer timed out after ${ms} ms` }), ms)
    onAbort = () => resolve({ cancelled: 'cancelled by signal' })
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
  const work = (async () => {
    try {
      return { value: await promiseFactory(control.signal) }
    } catch (error) {
      return { error }
    }
  })()
  return Promise.race([work, guard])
    .then(async (outcome) => {
      if (!outcome.cancelled) return outcome
      control.abort()
      let graceTimer
      const settled = await Promise.race([
        work.then(() => true),
        new Promise((resolve) => {
          graceTimer = setTimeout(() => resolve(false), graceMs)
        })
      ])
      clearTimeout(graceTimer)
      return { ...outcome, terminated: settled }
    })
    .finally(() => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    })
}

// Validates returned results against the manifests and applies the PASS downgrade rules.
async function reconcile({ name, eligible, returned, outDir, repoRoot, contractsDir }) {
  const errors = await validateAgainst('layer-result.schema.json', returned, contractsDir)
  if (errors.length > 0) throw new ContractError(`${name}: run() returned invalid results`, errors)
  const byId = new Map(eligible.map((m) => [m.id, m]))
  const seen = new Map()
  const problems = []
  for (const r of returned) {
    if (!byId.has(r.id)) problems.push(`${r.id}: unsolicited result (not in the list passed to run())`)
    else if (seen.has(r.id)) problems.push(`${r.id}: duplicate result`)
    else seen.set(r.id, r)
  }
  for (const [id, r] of seen) {
    const allowed = byId.get(id).assertionIds
    for (const a of r.assertionIds)
      if (!allowed.includes(a)) problems.push(`${id}: assertion "${a}" is not declared in the manifest`)
    for (const e of r.evidence) {
      try {
        await containedPath(outDir, e)
      } catch (error) {
        problems.push(`${id}: evidence ${error.message}`)
      }
    }
  }
  if (problems.length > 0)
    throw new ContractError(`${name}: results do not match the requested cases`, problems)
  const finals = []
  for (const manifest of eligible) {
    const r = seen.get(manifest.id)
    if (!r) {
      finals.push(
        entryFor(manifest, {
          verdict: 'PENDING',
          reason: 'no result returned by the layer',
          assertionIds: [],
          evidence: [],
          durationMs: 0,
          redProof: null
        })
      )
      continue
    }
    let final = { ...r }
    if (r.verdict === 'PASS') {
      let why = null
      let receipts = null
      if (r.assertionIds.length === 0) why = 'no assertion id reported'
      else {
        const proof = await receiptForProof(r.redProof, r.assertionIds, outDir, repoRoot)
        const evidence = proof.problem ? proof : await receiptsForEvidence(r.evidence, outDir)
        why = proof.problem ?? evidence.problem ?? null
        if (!why) receipts = { proof, evidence: evidence.receipts }
      }
      if (why)
        final = {
          ...r,
          verdict: 'PENDING',
          reason: `PASS downgraded to PENDING: ${why}`,
          downgradedFrom: 'PASS'
        }
      else final = { ...r, receipts }
    }
    finals.push(entryFor(manifest, final))
  }
  return finals
}

function entryFor(manifest, result) {
  return {
    ...result,
    itemIds: manifest.itemIds,
    edgeTags: manifest.edgeTags,
    targets: manifest.targets,
    effects: manifest.effects,
    requirement: manifest.requirement,
    oracle: manifest.oracle,
    legacyIds: manifest.legacyIds,
    manifestHash: hashJson(manifest)
  }
}

const blockedEntry = (manifest, reason) =>
  entryFor(manifest, {
    verdict: 'PENDING',
    reason,
    assertionIds: [],
    evidence: [],
    durationMs: 0,
    redProof: null
  })

export function countVerdicts(entries) {
  const counts = { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }
  for (const e of entries) counts[e.verdict] += 1
  return counts
}

export function exitCodeFor(counts, { cancelled = false, total }) {
  if (counts.FAIL > 0) return 1
  if (cancelled || total === 0 || counts.ENV + counts.PENDING > 0) return 3
  return 0
}

export function renderReport({ layer, target, runId, counts, entries, notes, git }) {
  const lines = [
    `# QA report: ${layer}`,
    '',
    `- run: ${runId}`,
    `- target: ${target}`,
    `- revision: ${git.sha}${git.dirty ? ' (dirty tree)' : ''}`,
    `- PASS ${counts.PASS} · FAIL ${counts.FAIL} · ENV ${counts.ENV} · PENDING ${counts.PENDING} · total ${entries.length}`,
    '',
    'PASS means a deterministic assertion passed AND a RED-proof log is recorded for that case. The harness checks that the log exists and is non-empty; it does not judge the log text. ENV and PENDING are not PASS.',
    ''
  ]
  for (const n of notes) lines.push(`> ${n}`)
  if (notes.length) lines.push('')
  const open = entries.filter((e) => e.verdict !== 'PASS')
  lines.push(`## Not passed (${open.length})`, '')
  for (const e of open) lines.push(`- **${e.verdict}** \`${e.id}\` — ${e.reason || '(no reason given)'}`)
  if (open.length === 0) lines.push('- none')
  return `${lines.join('\n')}\n`
}

// Runs one layer end to end. Returns { layer, status, exitCode, runDir, counts, messages }.
export async function runLayer(deps, name, options) {
  const { layersDir, resultsRoot, repoRoot, contractsDir, now, signal } = deps
  const messages = []
  let loaded
  try {
    loaded = await loadLayerModule(layersDir, name)
  } catch (error) {
    return { layer: name, status: 'error', exitCode: 2, messages: [error.message, ...(error.details ?? [])] }
  }
  if (loaded.missing) {
    return { layer: name, status: 'missing', exitCode: 3, messages: [`MISSING: ${loaded.missing}`] }
  }
  const { mod } = loaded
  const timeoutMs = Number(options.timeoutMs ?? deps.layerTimeoutMs ?? DEFAULT_LAYER_TIMEOUT_MS)
  const graceMs = Number(deps.cancelGraceMs ?? DEFAULT_CANCEL_GRACE_MS)
  const unterminated = (what) => ({
    layer: name,
    status: 'error',
    exitCode: 2,
    unterminated: true,
    messages: [
      `${name}: ${what} did not stop within ${graceMs} ms of cancellation; no results were published and the layer may still be running`
    ]
  })
  let manifests
  try {
    const listed = await withTimeout(
      (cancel) => mod.listCases({ area: options.area, signal: cancel }),
      timeoutMs,
      signal,
      graceMs
    )
    if (listed.cancelled && !listed.terminated) return unterminated('listCases()')
    if (listed.cancelled) throw new ContractError(`${name}: listCases() ${listed.cancelled}`)
    if (listed.error) throw new ContractError(`${name}: listCases() threw: ${listed.error.message}`)
    manifests = listed.value
    await validateManifests(name, manifests, contractsDir)
  } catch (error) {
    return { layer: name, status: 'error', exitCode: 2, messages: [error.message, ...(error.details ?? [])] }
  }

  const startedAt = now()
  let git
  try {
    git = { ...(await gitProvenance(deps.git)), fingerprint: await deps.fingerprint() }
  } catch (error) {
    return { layer: name, status: 'error', exitCode: 2, messages: [error.message] }
  }
  const blocked = []
  const eligible = []
  for (const manifest of manifests) {
    const reason = targetPolicy(manifest, options.target)
    if (reason) blocked.push(blockedEntry(manifest, reason))
    else eligible.push(manifest)
  }

  let runDir
  try {
    await assertNoSymlinkPath(path.resolve(resultsRoot))
    const reservation = (runId) => ({
      run_id: runId,
      layer: name,
      target: options.target,
      area: options.area ?? null,
      started_at: startedAt.toISOString()
    })
    if (options.out) {
      const out = path.resolve(options.out)
      await assertNoSymlinkPath(out)
      const info = await lstatOrNull(out)
      if (info && !info.isDirectory()) throw new ContractError(`--out ${options.out} is not a directory`)
      await fs.mkdir(out, { recursive: true })
      // Exclusive reservation: two runs racing for one empty directory cannot both get it.
      try {
        await reserveDir(out, reservation(path.basename(out)))
      } catch (error) {
        if (error.code === 'EEXIST') {
          throw new ContractError(`--out ${options.out} exists and is not an empty directory`)
        }
        throw error
      }
      const leftover = (await fs.readdir(out)).filter((n) => n !== RESERVATION_FILE)
      if (leftover.length > 0) {
        await fs.rm(path.join(out, RESERVATION_FILE), { force: true })
        throw new ContractError(`--out ${options.out} exists and is not an empty directory`)
      }
      runDir = out
    } else {
      runDir = await createUniqueDir(resultsRoot, `${utcStamp(startedAt)}-${name}`)
      await reserveDir(runDir, reservation(path.basename(runDir)))
    }
  } catch (error) {
    if (!(error instanceof ContractError) && !(error instanceof UnsafePathError)) throw error
    return { layer: name, status: 'error', exitCode: 2, messages: [error.message] }
  }
  const runId = path.basename(runDir)

  let entries
  let cancelled = false
  let harnessError = null
  if (manifests.length === 0) {
    entries = []
    messages.push(
      `no cases selected${options.area ? ` for area "${options.area}"` : ''}; nothing was verified`
    )
  } else if (eligible.length === 0) {
    entries = blocked
  } else {
    const outcome = await withTimeout(
      (cancel) =>
        mod.run({
          cases: eligible,
          target: options.target,
          proveRed: options.proveRed,
          outDir: runDir,
          signal: cancel
        }),
      timeoutMs,
      signal,
      graceMs
    )
    if (outcome.cancelled && !outcome.terminated) return { ...unterminated('run()'), runDir }
    if (outcome.cancelled) {
      cancelled = true
      messages.push(`CANCELLED: ${outcome.cancelled}; late results are ignored`)
      entries = [...blocked, ...eligible.map((m) => blockedEntry(m, `cancelled: ${outcome.cancelled}`))]
    } else if (outcome.error) {
      harnessError = `harness error: run() threw: ${outcome.error.message}`
      entries = [...blocked, ...eligible.map((m) => blockedEntry(m, harnessError))]
    } else {
      try {
        const finals = await reconcile({
          name,
          eligible,
          returned: outcome.value,
          outDir: runDir,
          repoRoot,
          contractsDir
        })
        entries = [...blocked, ...finals]
      } catch (error) {
        if (!(error instanceof ContractError)) throw error
        await writeJson(path.join(runDir, 'harness-error.json'), {
          layer: name,
          error: error.message,
          details: error.details
        })
        return {
          layer: name,
          status: 'error',
          exitCode: 2,
          runDir,
          messages: [error.message, ...error.details]
        }
      }
    }
  }
  const order = new Map(manifests.map((m, i) => [m.id, i]))
  entries.sort((a, b) => order.get(a.id) - order.get(b.id))
  for (const e of entries)
    if (e.verdict === 'PENDING' && e.reason.startsWith('PASS downgraded'))
      messages.push(`${e.id}: ${e.reason}`)

  const counts = countVerdicts(entries)
  const exitCode = harnessError ? 2 : exitCodeFor(counts, { cancelled, total: entries.length })
  const outcomeName =
    counts.FAIL > 0 || harnessError
      ? 'failure'
      : cancelled
        ? 'cancelled'
        : counts.ENV + counts.PENDING > 0 || entries.length === 0
          ? 'skipped'
          : 'success'
  const finishedAt = now()
  const evidence = [...new Set(entries.flatMap((e) => e.evidence))]
  const reportNotes = [...messages]
  if (harnessError) reportNotes.push(harnessError)
  const artifacts = ['cases.json', 'report.md', 'provenance.json', ...evidence]
  const command = `pnpm qa ${deps.argv.join(' ')}`
  const results = {
    schema_version: '2',
    adapter: `tch-qa-${name}`,
    outcome: outcomeName,
    repository: git.repository,
    revision: git.sha,
    run_id: runId,
    assurance_target: 'T2',
    command,
    exit_code: cancelled ? null : exitCode,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    environment: { runner_os: os.platform(), runner_arch: os.arch(), workflow_ref: 'manual:pnpm-qa' },
    artifacts,
    findings: []
  }
  const aggregateErrors = await validateAgainst('result.schema.json', results, contractsDir)
  if (aggregateErrors.length > 0) {
    await writeJson(path.join(runDir, 'harness-error.json'), {
      layer: name,
      error: 'aggregate results.json invalid',
      details: aggregateErrors
    })
    return {
      layer: name,
      status: 'error',
      exitCode: 2,
      runDir,
      messages: ['aggregate results.json failed schema validation', ...aggregateErrors]
    }
  }
  const casesDoc = {
    schema_version: '1',
    layer: name,
    target: options.target,
    proveRed: options.proveRed,
    area: options.area ?? null,
    run_id: runId,
    counts,
    cases: entries
  }
  const reportText = renderReport({
    layer: name,
    target: options.target,
    runId,
    counts,
    entries,
    notes: reportNotes,
    git
  })
  const provenance = {
    schema_version: '1',
    report_sha256: sha256(reportText),
    layer: name,
    git_sha: git.sha,
    tree_fingerprint: git.fingerprint,
    dirty: git.dirty,
    node_version: process.version,
    target: options.target,
    prove_red: options.proveRed,
    area: options.area ?? null,
    command
  }
  const complete = {
    schema_version: '1',
    layer: name,
    target: options.target,
    area: options.area ?? null,
    run_id: runId,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    outcome: outcomeName,
    exit_code: exitCode,
    git_sha: git.sha,
    tree_fingerprint: git.fingerprint,
    dirty: git.dirty,
    counts
  }
  await writeJson(path.join(runDir, 'cases.json'), casesDoc)
  await atomicWrite(path.join(runDir, 'report.md'), reportText)
  await writeJson(path.join(runDir, 'provenance.json'), provenance)
  await writeJson(path.join(runDir, 'results.json'), results)
  await writeJson(path.join(runDir, 'complete.json'), complete)
  return { layer: name, status: 'ran', exitCode, runDir, counts, messages }
}

export { UnsafePathError }
