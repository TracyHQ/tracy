// Shared kit of the `cms` and `related` QA layers (both owned by W8). Contract files are read through
// the shared bounded reader in tests/qa/lib.
//
// A case never passes on a green assertion alone. PASS needs (1) the positive control of the
// assertion to hold, (2) the check to hold on the real tree, and (3) the very same assertion to FAIL on
// a recorded mutation of the product or of the artifact it reads, with a log naming that assertion.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BoundedReadError,
  MAX_LAYER_FILE_BYTES,
  readBoundedAsync,
  readBoundedSync,
  readBytesAsync,
  readTextAsync
} from '../../../lib/bounded-reader.mjs'

export const VERDICTS = Object.freeze(['PASS', 'FAIL', 'ENV', 'PENDING'])
export const TARGETS = Object.freeze(['local', 'dev', 'prod'])
const ID_PATTERN = /^QA-[A-Z0-9]+-[^\s]+$/
const MANIFEST_KEYS = new Set([
  'id',
  'itemIds',
  'controlId',
  'requirement',
  'oracle',
  'edgeTags',
  'dimensions',
  'area',
  'targets',
  'effects',
  'prerequisites',
  'command',
  'assertionIds',
  'fixtures',
  'redProof',
  'legacyIds'
])

/** A usage or contract fault: exit code 2, and nothing has been run. */
export class ContractError extends Error {
  constructor(message, problems = [], cause = undefined) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ContractError'
    this.problems = problems
  }
}

/** The harness itself is wrong (a mutation that does not apply, a module that does not import): never a verdict about the product. */
export class HarnessError extends Error {
  constructor(message) {
    super(message)
    this.name = 'HarnessError'
  }
}

export const sha256Of = (data) => createHash('sha256').update(data).digest('hex')

export async function sha256File(file) {
  return sha256Of(await readBoundedAsync(file, { maxBytes: MAX_LAYER_FILE_BYTES }))
}

export const safeName = (text) => String(text).replace(/[^A-Za-z0-9._-]+/g, '_')

/** Canonical JSON (sorted keys) so a generated file is byte-identical from run to run. */
export function canonicalJson(value, indent = 2) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort(v[k])])
      )
    return v
  }
  return `${JSON.stringify(sort(value), null, indent)}\n`
}

/** Write through a temp file and rename, so a reader never sees half a file. */
export async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    await fs.writeFile(tmp, data)
    await fs.rename(tmp, file)
  } catch (error) {
    await fs.rm(tmp, { force: true })
    throw error
  }
}

/** Read a JSON file that must be a regular file; anything else is a contract problem, not a crash. */
export async function readJsonFile(file, what = file) {
  let text
  try {
    text = (await readBoundedAsync(file, { maxBytes: MAX_LAYER_FILE_BYTES })).toString('utf8')
  } catch (error) {
    if (!(error instanceof BoundedReadError)) throw error
    if (error.code === 'SYMLINK' || error.code === 'NOT_REGULAR' || error.code === 'REPLACED')
      throw new ContractError(`${what}: not a regular file (symlink, directory or FIFO refused)`, [], error)
    throw new ContractError(
      `${what}: cannot be read (${error.code === 'MISSING' ? 'ENOENT' : error.message})`,
      [],
      error
    )
  }
  if (text.trim() === '') throw new ContractError(`${what}: empty file`)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new ContractError(`${what}: malformed JSON (${error.message})`)
  }
}

const isStringList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s !== '')
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** Every way a case manifest can be wrong, as sentences. Empty means valid. */
export function manifestProblems(m, layerUpper) {
  const problems = []
  if (!isObject(m)) return ['manifest is not an object']
  for (const key of Object.keys(m)) if (!MANIFEST_KEYS.has(key)) problems.push(`unknown key ${key}`)
  if (typeof m.id !== 'string' || !ID_PATTERN.test(m.id)) problems.push('id must match QA-<LAYER>-<key>')
  else if (!m.id.startsWith(`QA-${layerUpper}-`)) problems.push(`id must start with QA-${layerUpper}-`)
  if (!isStringList(m.itemIds) || new Set(m.itemIds).size !== m.itemIds.length)
    problems.push('itemIds must be a unique list of strings')
  if (typeof m.requirement !== 'string' || m.requirement === '') problems.push('requirement is empty')
  const o = m.oracle
  if (!isObject(o) || ['source', 'ref', 'invariant'].some((k) => typeof o[k] !== 'string' || o[k] === ''))
    problems.push('oracle needs source, ref and invariant')
  if (!isStringList(m.edgeTags)) problems.push('edgeTags must be a list of strings')
  if (!Array.isArray(m.targets) || m.targets.some((t) => !TARGETS.includes(t)))
    problems.push('targets must be a list of local|dev|prod')
  const e = m.effects
  if (
    !isObject(e) ||
    !Array.isArray(e.reads) ||
    !Array.isArray(e.writes) ||
    typeof e.mail !== 'boolean' ||
    typeof e.model !== 'boolean' ||
    typeof e.containers !== 'boolean'
  )
    problems.push('effects must declare reads, writes, mail, model, containers')
  if (!isStringList(m.prerequisites)) problems.push('prerequisites must be a list of strings')
  if (!isStringList(m.assertionIds) || m.assertionIds.length === 0)
    problems.push('assertionIds must name at least one assertion')
  if (!isStringList(m.legacyIds)) problems.push('legacyIds must be a list of strings')
  if (m.redProof !== null && !isObject(m.redProof)) problems.push('redProof must be null or an object')
  return problems
}

/** Validate a whole list: schema, duplicate ids. Throws ContractError listing every problem. */
export function assertManifests(manifests, layerUpper) {
  const problems = []
  const seen = new Set()
  for (const m of manifests) {
    for (const p of manifestProblems(m, layerUpper)) problems.push(`${m?.id ?? '<no id>'}: ${p}`)
    if (m?.id) {
      if (seen.has(m.id)) problems.push(`${m.id}: duplicate case id`)
      seen.add(m.id)
    }
  }
  if (problems.length > 0)
    throw new ContractError(`invalid case manifests (${problems.length} problems)`, problems)
}

/** Load `cases/*.json` (each a JSON array of manifests) in a stable order. */
export async function loadCaseFiles(casesDir, layerUpper) {
  let names
  try {
    names = (await fs.readdir(casesDir)).filter((n) => n.endsWith('.json')).sort()
  } catch (error) {
    throw new ContractError(`${casesDir}: cannot list cases (${error.code ?? error.message})`)
  }
  const all = []
  for (const name of names) {
    const doc = await readJsonFile(path.join(casesDir, name), `cases/${name}`)
    if (!Array.isArray(doc)) throw new ContractError(`cases/${name}: must be a JSON array of manifests`)
    all.push(...doc)
  }
  assertManifests(all, layerUpper)
  return all
}

/**
 * Parse `--area X --target T --prove-red --out DIR`. Anything else is a usage fault.
 * @param {string[]} argv
 * @param {{ areas: string[] }} opts
 */
export function parseCli(argv, { areas }) {
  const out = { area: null, target: 'local', proveRed: false, out: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = () => {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new ContractError(`${arg} needs a value`)
      i += 1
      return next
    }
    if (arg === '--prove-red') out.proveRed = true
    else if (arg === '--area') out.area = value()
    else if (arg === '--target') out.target = value()
    else if (arg === '--out') out.out = value()
    else throw new ContractError(`unknown argument ${JSON.stringify(arg)}`)
  }
  if (!TARGETS.includes(out.target)) throw new ContractError(`--target must be one of ${TARGETS.join(', ')}`)
  if (out.area !== null && !areas.includes(out.area))
    throw new ContractError(`--area must be one of ${areas.join(', ')}; got ${JSON.stringify(out.area)}`)
  return out
}

/** Spawn a command with a hard timeout and a bounded capture. Never throws for a nonzero exit. */
export function spawnBounded({ argv, cwd, env, timeoutMs = 120_000, maxBytes = 2_000_000, stdin = null }) {
  return new Promise((resolve) => {
    const started = Date.now()
    let child
    try {
      // A parent started by `node --test` leaves NODE_TEST_CONTEXT behind; a child `node --test` that inherits it
      // refuses to run ("called recursively"), which would read as "no tests" instead of as a run.
      const childEnv = { ...(env ?? process.env) }
      delete childEnv.NODE_TEST_CONTEXT
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env: childEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true
      })
    } catch (error) {
      resolve({
        exit: null,
        signal: null,
        spawnError: error.message,
        spawnErrorCode: error.code ?? null,
        stdout: '',
        stderr: '',
        timedOut: false
      })
      return
    }
    let stdout = ''
    let stderr = ''
    let truncated = false
    let timedOut = false
    const take = (which) => (chunk) => {
      const text = chunk.toString('utf8')
      if (which === 'out') stdout += text
      else stderr += text
      if (stdout.length + stderr.length > maxBytes) {
        truncated = true
        stdout = stdout.slice(0, maxBytes)
        stderr = stderr.slice(0, Math.max(0, maxBytes - stdout.length))
        kill()
      }
    }
    const kill = () => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {}
      }
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)
    child.stdout.on('data', take('out'))
    child.stderr.on('data', take('err'))
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        exit: null,
        signal: null,
        spawnError: error.message,
        spawnErrorCode: error.code ?? null,
        stdout,
        stderr,
        timedOut,
        truncated
      })
    })
    child.on('close', (exit, signal) => {
      clearTimeout(timer)
      resolve({ exit, signal, stdout, stderr, timedOut, truncated, durationMs: Date.now() - started })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin ?? undefined)
  })
}

/**
 * Apply a mutation `{ id, files: [edit] }` to a scratch tree. An edit is one of
 *   { path, find, replace }  text replacement; `find` must hit exactly once
 *   { path, json(obj) }      parse the file as JSON, let the function change it, write it back
 *   { path, text(string) }   let the function return the new text
 *   { path, remove: true }   delete the file
 * It returns the before/after hashes so the proof log can name exactly what changed.
 */
export async function applyMutation(scratchRoot, mutation) {
  const hashes = []
  for (const edit of mutation.files) {
    const file = path.join(scratchRoot, edit.path)
    if (edit.remove) {
      let before
      try {
        before = await readBytesAsync(file)
      } catch (error) {
        throw new HarnessError(`mutation ${mutation.id}: ${edit.path} is not readable (${error.code})`)
      }
      await fs.rm(file)
      hashes.push({ path: edit.path, before: sha256Of(before), after: null })
      continue
    }
    let text
    try {
      text = await readTextAsync(file)
    } catch (error) {
      throw new HarnessError(`mutation ${mutation.id}: ${edit.path} is not readable (${error.code})`)
    }
    let mutated
    if (edit.text) {
      mutated = edit.text(text)
    } else if (edit.json) {
      let doc
      try {
        doc = JSON.parse(text)
      } catch (error) {
        throw new HarnessError(`mutation ${mutation.id}: ${edit.path} is not JSON (${error.message})`)
      }
      edit.json(doc)
      mutated = `${JSON.stringify(doc, null, 2)}\n`
    } else {
      const parts = text.split(edit.find)
      if (parts.length !== 2)
        throw new HarnessError(
          `mutation ${mutation.id}: expected exactly one match of ${JSON.stringify(edit.find.slice(0, 60))} in ${edit.path}, found ${parts.length - 1}`
        )
      mutated = parts.join(edit.replace)
    }
    if (mutated === text)
      throw new HarnessError(`mutation ${mutation.id}: ${edit.path} is unchanged by the edit`)
    await fs.writeFile(file, mutated)
    hashes.push({ path: edit.path, before: sha256Of(text), after: sha256Of(mutated) })
  }
  return hashes
}

/** Copy a list of repo-relative paths (files or directories, regular files only) into a scratch root. */
export async function copyTree(repoRoot, scratchRoot, relPaths) {
  for (const rel of relPaths) {
    const from = path.join(repoRoot, rel)
    const info = await fs.lstat(from).catch(() => null)
    if (!info) continue
    if (info.isSymbolicLink()) continue
    await fs.mkdir(path.dirname(path.join(scratchRoot, rel)), { recursive: true })
    await fs.cp(from, path.join(scratchRoot, rel), {
      recursive: true,
      filter: (src) => !src.split(path.sep).includes('node_modules')
    })
  }
}

export function renderReport({ layer, results, extra = [] }) {
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  for (const r of results) counts[r.verdict] += 1
  const lines = [
    `# QA layer \`${layer}\``,
    '',
    `PASS ${counts.PASS} · FAIL ${counts.FAIL} · ENV ${counts.ENV} · PENDING ${counts.PENDING} · total ${results.length}`,
    `RED-proven: ${results.filter((r) => r.redProof).length}`,
    ''
  ]
  lines.push(...extra, '')
  const rest = results.filter((r) => r.verdict !== 'PASS')
  if (rest.length > 0) {
    // Group identical reasons so a matrix of 800 ENV cases is one line, not 800.
    const groups = new Map()
    for (const r of rest) {
      const key = `${r.verdict}: ${r.reason}`
      const g = groups.get(key) ?? []
      g.push(r.id)
      groups.set(key, g)
    }
    lines.push('## Not PASS', '')
    for (const [key, ids] of [...groups.entries()].sort()) {
      lines.push(`- ${key} — ${ids.length} case(s), e.g. \`${ids[0]}\``)
    }
  }
  return `${lines.join('\n')}\n`
}

/** Format generated JSON the way the repository formatter would, so the committed file passes `biome format` unchanged. */
export function formatWithBiome(repoRoot, relPath, text) {
  const bin = path.join(repoRoot, 'node_modules/.bin/biome')
  if (!existsSync(bin))
    throw new ContractError('node_modules/.bin/biome is missing: run pnpm install before generating')
  try {
    return execFileSync(bin, ['format', `--stdin-file-path=${relPath}`], {
      cwd: repoRoot,
      input: text,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
  } catch (error) {
    throw new ContractError(`biome could not format ${relPath}: ${error.stderr ?? error.message}`)
  }
}

export function exitCodeFor(results) {
  if (results.some((r) => r.verdict === 'FAIL')) return 1
  if (results.some((r) => r.verdict !== 'PASS')) return 3
  return 0
}

export const defaultOutDir = (repoRoot, layer, now = new Date()) =>
  path.join(repoRoot, 'qa-results', `${layer}-${now.toISOString().replace(/[:.]/g, '-')}`)

/** The case's mutation reference, stored as `mutation:<id>` in `fixtures` so the manifest stays schema-clean. */
export const mutationRefOf = (c) =>
  (c.fixtures ?? []).find((f) => f.startsWith('mutation:'))?.slice(9) ?? null

/**
 * Run a list of case manifests against an assertion registry.
 *
 * registry[assertionId] = { execute(ctx) -> { control:{ok,detail}, check:{ok,detail}, verdict?, reason?, evidence? },
 *                           mutations: { [mutationId]: { id, files? , data? } } }
 * probes[prerequisiteId] = async (ctx) => null | { reason, probe }   (null = prerequisite holds)
 */
export async function runCases({
  layer: _layer,
  cases,
  target,
  proveRed,
  outDir,
  registry,
  probes,
  repoRoot,
  envOf = process.env,
  fetchImpl = undefined,
  concurrency = 4
}) {
  const evidenceDir = path.join(outDir, 'evidence')
  const redDir = path.join(outDir, 'red')
  const scratchBase = path.join(outDir, 'scratch')
  await fs.mkdir(evidenceDir, { recursive: true })
  const results = []
  const probeCache = new Map()
  const probeOnce = async (id, ctx) => {
    if (!probeCache.has(id)) {
      const probe = probes[id]
      probeCache.set(
        id,
        probe
          ? Promise.resolve(probe(ctx)).catch((e) => ({
              reason: `probe ${id} crashed: ${e.message}; a crashed probe says nothing about the prerequisite`,
              probe: id,
              harness: true
            }))
          : Promise.resolve({
              reason: `no probe is defined for prerequisite ${id}`,
              probe: id,
              harness: true
            })
      )
    }
    return probeCache.get(id)
  }
  const runOne = async (c) => {
    const started = Date.now()
    const base = { id: c.id, assertionIds: c.assertionIds, evidence: [], redProof: null }
    let outcome = null
    const done = (verdict, reason, extra = {}) => {
      outcome = { ...base, verdict, reason, durationMs: Date.now() - started, ...extra }
    }
    try {
      const writesAnything =
        c.effects.writes.length > 0 || c.effects.mail || c.effects.model || c.effects.containers
      if (!c.targets.includes(target) || (target === 'prod' && writesAnything)) {
        done('PENDING', `target-policy: ${c.id} declares no read-only effects for target ${target}`)
        return outcome
      }
      const unknown = c.assertionIds.filter((a) => !registry[a])
      if (unknown.length > 0) {
        done('PENDING', `assertion not implemented: ${unknown.join(', ')}`)
        return outcome
      }
      const ctx = {
        repoRoot,
        root: repoRoot,
        dataRoot: repoRoot,
        params: c.dimensions ?? {},
        env: envOf,
        outDir,
        caseId: c.id,
        fetchImpl
      }
      let blocked = null
      for (const pre of c.prerequisites) {
        const missing = await probeOnce(pre, ctx)
        if (missing) {
          blocked = missing
          break
        }
      }
      if (blocked) {
        const reason = `${blocked.reason} [probe: ${blocked.probe}]`
        done(blocked.harness || blocked.inconclusive ? 'PENDING' : 'ENV', reason)
        return outcome
      }
      const outcomes = []
      for (const id of c.assertionIds) {
        let outcome
        try {
          outcome = await registry[id].execute(ctx)
        } catch (error) {
          outcome = { harnessError: `${error.name}: ${error.message}` }
        }
        outcomes.push({ id, outcome })
      }
      const evidenceRel = `evidence/${safeName(c.id)}.json`
      await atomicWrite(path.join(outDir, evidenceRel), canonicalJson({ case: c.id, target, outcomes }))
      base.evidence = [evidenceRel]

      const harness = outcomes.find((o) => o.outcome.harnessError)
      if (harness) {
        done('PENDING', `TEST_INVALID: ${harness.id}: ${harness.outcome.harnessError}`, {
          evidence: [evidenceRel]
        })
        return outcome
      }
      const forced = outcomes.find((o) => o.outcome.verdict)
      if (forced) {
        done(forced.outcome.verdict, forced.outcome.reason, {
          evidence: [evidenceRel, ...(forced.outcome.evidence ?? [])]
        })
        return outcome
      }
      const badControl = outcomes.find((o) => !o.outcome.control?.ok)
      if (badControl) {
        done(
          'PENDING',
          `TEST_INVALID: positive control failed in ${badControl.id}: ${badControl.outcome.control?.detail}`,
          {
            evidence: [evidenceRel]
          }
        )
        return outcome
      }
      const failed = outcomes.find((o) => !o.outcome.check.ok)
      if (failed) {
        done('FAIL', `${failed.id}: ${failed.outcome.check.detail}`, { evidence: [evidenceRel] })
        return outcome
      }
      if (!proveRed) {
        done('PENDING', 'no RED proof yet: run with --prove-red', { evidence: [evidenceRel] })
        return outcome
      }
      const proof = await proveRedFor({ c, registry, ctx, redDir, scratchBase, repoRoot, outDir })
      if (!proof.ok) {
        done('PENDING', `RED proof not established: ${proof.reason}`, {
          evidence: [evidenceRel, ...(proof.log ? [proof.log] : [])]
        })
        return outcome
      }
      done(
        'PASS',
        'check held on the tree, positive control held, and the same assertion failed on the recorded mutation',
        {
          evidence: [evidenceRel, proof.log],
          redProof: { kind: 'mutation', ref: proof.ref, assertionId: proof.assertionId, log: proof.log }
        }
      )
    } catch (error) {
      if (error instanceof ContractError) throw error
      done('PENDING', `TEST_INVALID: runner fault: ${error?.message ?? error}`)
    }
    return outcome
  }
  // Cases are independent (each has its own scratch folder), so they run through a small pool; results keep case order.
  const slots = Array.from({ length: cases.length })
  let next = 0
  const worker = async () => {
    for (;;) {
      const i = next
      next += 1
      if (i >= cases.length) return
      slots[i] = await runOne(cases[i])
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, cases.length)) }, worker))
  for (const r of slots) results.push(r)
  await fs.rm(scratchBase, { recursive: true, force: true })
  return results
}

/** Re-run the case's primary assertion on a mutated scratch copy; it must fail with its control intact. */
async function proveRedFor({ c, registry, ctx, redDir, scratchBase, repoRoot, outDir }) {
  const mutationId = mutationRefOf(c)
  const assertionId = c.assertionIds[0]
  const entry = registry[assertionId]
  if (!mutationId) return { ok: false, reason: 'the case names no mutation' }
  const rawMutation = entry.mutations?.[mutationId]
  const mutation = typeof rawMutation === 'function' ? rawMutation(c.dimensions ?? {}) : rawMutation
  if (!mutation) return { ok: false, reason: `assertion ${assertionId} has no mutation ${mutationId}` }
  const scratch = path.join(scratchBase, safeName(c.id))
  await fs.rm(scratch, { recursive: true, force: true })
  await fs.mkdir(scratch, { recursive: true })
  let hashes = []
  const redCtx = { ...ctx, root: repoRoot, dataRoot: repoRoot, scratch }
  try {
    if (mutation.copy) await copyTree(repoRoot, scratch, mutation.copy)
    if (mutation.files) hashes = await applyMutation(scratch, mutation)
    if (mutation.prepare) await mutation.prepare({ scratch, repoRoot, ctx: redCtx })
    if (mutation.kind === 'data') redCtx.dataRoot = scratch
    else redCtx.root = scratch
    // A product mutation may also need the real data (and vice versa).
    if (mutation.kind === 'data') redCtx.root = repoRoot
    else redCtx.dataRoot = repoRoot
  } catch (error) {
    return { ok: false, reason: error.message }
  }
  let outcome
  try {
    outcome = await entry.execute(redCtx)
  } catch (error) {
    outcome = { harnessError: `${error.name}: ${error.message}` }
  }
  const key = sha256Of(
    JSON.stringify({
      assertionId,
      mutationId,
      hashes,
      assertion: entry.sourceHash ?? null,
      params: c.dimensions ?? {}
    })
  )
  const logRel = `red/${safeName(c.id)}.log`
  const failedAsIntended =
    !outcome.harnessError && outcome.control?.ok === true && outcome.check?.ok === false
  const lines = [
    `case: ${c.id}`,
    `assertionId: ${assertionId}`,
    `mutation: ${mutationId} (${mutation.describe ?? ''})`,
    `proofKey: ${key}`,
    `mutatedFiles: ${JSON.stringify(hashes)}`,
    `control: ${JSON.stringify(outcome.control ?? null)}`,
    `check: ${JSON.stringify(outcome.check ?? null)}`,
    outcome.harnessError ? `harnessError: ${outcome.harnessError}` : 'harnessError: none',
    `result: ${failedAsIntended ? `RED - ${assertionId} failed on the mutant` : 'NOT RED'}`
  ]
  await fs.mkdir(redDir, { recursive: true })
  await atomicWrite(path.join(outDir, logRel), `${lines.join('\n')}\n`)
  await fs.rm(scratch, { recursive: true, force: true })
  if (!failedAsIntended)
    return {
      ok: false,
      reason: outcome.harnessError
        ? `mutant run was invalid (${outcome.harnessError})`
        : outcome.control?.ok !== true
          ? `positive control broke on the mutant (${outcome.control?.detail})`
          : `${assertionId} still held on the mutant`,
      log: logRel
    }
  return { ok: true, ref: `${mutationId}@${key.slice(0, 12)}`, assertionId, log: logRel }
}

/** Common standalone entry: parse, list, run, write results.json + report.md atomically, exit. */
export async function standaloneMain({ layer, repoRoot, areas, listCases, run, argv, extraReport }) {
  let cli
  try {
    cli = parseCli(argv, { areas })
  } catch (error) {
    process.stderr.write(`${layer}: ${error.message}\n`)
    return 2
  }
  const outDir = path.resolve(cli.out ?? defaultOutDir(repoRoot, layer))
  try {
    const cases = await listCases({ area: cli.area })
    if (cases.length === 0)
      throw new ContractError(`no cases selected${cli.area ? ` for area ${cli.area}` : ''}`)
    await fs.mkdir(outDir, { recursive: true })
    const results = await run({ cases, target: cli.target, proveRed: cli.proveRed, outDir })
    for (const r of results)
      for (const rel of r.evidence)
        if (!existsSync(path.join(outDir, rel)))
          throw new ContractError(`${r.id}: evidence ${rel} is missing`)
    await atomicWrite(path.join(outDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)
    const extra = extraReport ? await extraReport({ outDir, results }) : []
    await atomicWrite(path.join(outDir, 'report.md'), renderReport({ layer, results, extra }))
    return exitCodeFor(results)
  } catch (error) {
    if (error instanceof ContractError) {
      process.stderr.write(`${layer}: ${error.message}\n${(error.problems ?? []).slice(0, 20).join('\n')}\n`)
      return 2
    }
    process.stderr.write(`${layer}: ${error?.stack ?? error}\n`)
    return 2
  }
}

export function readTextSync(file) {
  return readBoundedSync(file, { maxBytes: MAX_LAYER_FILE_BYTES }).toString('utf8')
}
