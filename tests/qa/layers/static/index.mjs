/**
 * The `static` QA layer: one case per gate of `scripts/check-all.ts`, each run through the gate's own
 * `--only <gate>`. A case is PASS only when the gate is green on the tree AND the same gate goes red
 * on a recorded mutation of product files applied inside a scratch overlay (never the real tree),
 * after a green positive control in that same overlay. No recorded mutation, or `--prove-red` not
 * given, leaves the case PENDING with that reason.
 */
import { existsSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  buildOverlay,
  gitHead,
  loadManifests,
  overlayRestore,
  overlayWrite,
  readRegular,
  registerScratch,
  removeScratch,
  REPO,
  result,
  runChild,
  sha256,
  targetPolicy,
  UsageError
} from './lib/common.mjs'
import { readBytesSync, readTextSync } from '../../lib/bounded-reader.mjs'

export const layer = 'static'
const HERE = fileURLToPath(new URL('.', import.meta.url))
const SUCCESS = 'check-all: 1 gate(s) passed'
/** Output that means the gate could not load, so a red from it proves nothing about the rule. */
const CANNOT_LOAD = /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)/
/** A gate that exits 0 while announcing it did not do its job is not a pass. */
const STOOD_DOWN =
  /\b(?:stands? down|standing down|stood down|not run|skipped?: no|skipping (?:the )?gate)\b/i

/** @returns {object} parsed oracle JSON under tests/qa/oracles/static (or the context's own). */
function oracle(ctx, name) {
  return JSON.parse(readRegular(join(ctx.oracles, name)).toString('utf8'))
}

/**
 * @param {{area?: string}} o - `--area <gate>`; omitted means every case.
 * @returns {Promise<object[]>} manifests.
 */
export async function listCases({ area } = {}, ctx = defaultContext()) {
  const all = loadManifests(ctx.casesDir, layer)
  if (area === undefined || area === 'all') return all
  return all.filter((c) => c.gate === area || c.id === area)
}

/** @returns {object} the real paths this layer works on; selftests pass their own. */
export function defaultContext() {
  return {
    root: REPO,
    casesDir: join(HERE, 'cases'),
    oracles: join(REPO, 'tests/qa/oracles/static'),
    heavyDirs: ['tasks/evidence', 'packages/cms', 'vendor'],
    env: process.env
  }
}

/**
 * Probe the toolchain every gate needs once.
 * @param {object} ctx - context.
 * @returns {string | null} what is missing, or null.
 */
function toolchainMissing(ctx) {
  if (!existsSync(join(ctx.root, 'scripts/check-all.ts')) && !ctx.skipToolchainProbe)
    return 'scripts/check-all.ts is not present in the tree'
  if (!existsSync(join(ctx.root, 'node_modules')) && !ctx.skipToolchainProbe)
    return 'node_modules is not installed'
  return null
}

/**
 * Heavy gates: decide ENV (prerequisite proven missing) or PENDING (present, not run here).
 * @param {object} gate - gate-policy entry.
 * @param {string} name - gate name.
 * @param {object} ctx - context.
 * @returns {{verdict: 'ENV' | 'PENDING', reason: string}} the verdict.
 */
function heavyProbe(gate, name, ctx) {
  if (gate.probe === 'postgres') {
    const url = ctx.env.TEST_DATABASE_URL
    const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      encoding: 'utf8',
      timeout: 20000
    })
    const dockerUp = docker.status === 0
    if (!url && !dockerUp)
      return {
        verdict: 'ENV',
        reason: `postgres: TEST_DATABASE_URL is unset and the docker daemon is unreachable (docker info: ${docker.error ? docker.error.message : `exit ${docker.status}`})`
      }
    return {
      verdict: 'PENDING',
      reason: `heavy gate ${name} is not run by the static adapter (needs an owned Postgres lease; probe: TEST_DATABASE_URL ${url ? 'set but unverified' : 'unset'}, docker ${dockerUp ? 'up' : 'down'}). Set QA_STATIC_ALLOW_HEAVY=1 to run it, or use the unit layer.`
    }
  }
  const needed = ['node_modules/.bin/dsh', 'tch/profiles/native/node_modules']
  const gone = needed.filter((p) => !existsSync(join(ctx.root, p)))
  if (gone.length > 0)
    return { verdict: 'ENV', reason: `boot-graph: ${gone.join(', ')} not present (probe: existsSync)` }
  return {
    verdict: 'PENDING',
    reason: `heavy gate ${name} boots a real dsh and is not run by the static adapter (prerequisites present). Set QA_STATIC_ALLOW_HEAVY=1 to run it.`
  }
}

/**
 * Apply one mutation edit to an overlay file.
 * @returns {{file: string, before: string, after: string, original: Buffer}} hashes and the original bytes.
 */
function applyEdit(overlay, edit) {
  const path = resolve(overlay, edit.file)
  if (!path.startsWith(resolve(overlay) + sep))
    throw new UsageError(`mutation path escapes the overlay: ${edit.file}`)
  const original = readRegular(path)
  const text = original.toString('utf8')
  let next
  if (edit.op === 'append') next = text + edit.text
  else if (edit.op === 'replace') {
    const parts = text.split(edit.find)
    if (parts.length !== 2)
      throw new UsageError(
        `mutation anchor must occur exactly once in ${edit.file} (found ${parts.length - 1})`
      )
    next = parts.join(edit.replace)
  } else if (edit.op === 'json-delete-key') {
    const json = JSON.parse(text)
    if (!(edit.key in json)) throw new UsageError(`key ${edit.key} not in ${edit.file}`)
    delete json[edit.key]
    next = `${JSON.stringify(json, null, 2)}\n`
  } else throw new UsageError(`unknown mutation op ${edit.op}`)
  if (next === text) throw new UsageError(`mutation changed nothing in ${edit.file}`)
  overlayWrite(overlay, edit.file, next)
  return { file: edit.file, before: sha256(original), after: sha256(next), original }
}

/**
 * Run the RED proof of one case.
 * @returns {Promise<{ok: true, proof: object} | {ok: false, reason: string, evidence: string[]}>} the proof or why not.
 */
async function proveRedFor(manifest, mutations, scratch, outDir, ctx, rel) {
  const proofs = []
  const evidence = []
  const control = await runChild({
    argv: manifest.command,
    cwd: scratch.root,
    log: join(outDir, 'logs', `${manifest.id}.control.log`),
    timeoutMs: ctx.timeoutMs ?? 600000
  })
  evidence.push(rel(control.log))
  const controlText = readTextSync(control.log)
  if (control.status !== 0 || control.timedOut || !controlText.includes(manifest.successMarker ?? SUCCESS))
    return {
      ok: false,
      reason: `positive control is not green in the scratch overlay (exit ${control.status}); RED not accepted`,
      evidence
    }
  for (const m of mutations) {
    const applied = []
    let failure = null
    let restoreError = null
    try {
      for (const edit of m.edits) applied.push(applyEdit(scratch.root, edit))
      const red = await runChild({
        argv: manifest.command,
        cwd: scratch.root,
        log: join(outDir, 'logs', `${manifest.id}.${m.id}.red.log`),
        timeoutMs: ctx.timeoutMs ?? 600000
      })
      evidence.push(rel(red.log))
      const text = readTextSync(red.log)
      if (red.timedOut || red.status === 0 || red.status === null)
        failure = `mutation ${m.id}: gate did not go red (exit ${red.status}${red.timedOut ? ', timed out' : ''})`
      else if (CANNOT_LOAD.test(text)) failure = `mutation ${m.id}: red is a load failure, not the assertion`
      else {
        const absent = m.expect.output.filter((s) => !text.includes(s))
        if (absent.length > 0)
          failure = `mutation ${m.id}: gate went red but not with the expected assertion (missing: ${absent.join(' | ')})`
      }
      if (failure === null)
        proofs.push({
          mutation: m.id,
          assertionId: m.assertionId,
          log: rel(red.log),
          files: applied.map(({ file, before, after }) => ({ file, before, after })),
          signal: m.expect.output,
          definitionSha256: sha256(JSON.stringify(m))
        })
    } catch (error) {
      failure =
        error instanceof UsageError
          ? `mutation ${m.id}: invalid (${error.message})`
          : `mutation ${m.id}: ${error.message}`
    } finally {
      for (const a of applied) {
        try {
          overlayRestore(scratch.root, ctx.root, a.file)
          if (
            // The scratch overlay links product files, so the file is resolved first and the real file is read.
            sha256(readBytesSync(realpathSync(resolve(scratch.root, a.file)))) !== a.before
          )
            restoreError ??= new Error(`scratch restore failed for ${a.file}`)
        } catch (error) {
          restoreError ??= error
        }
      }
    }
    if (restoreError !== null) throw restoreError
    if (failure !== null) return { ok: false, reason: failure, evidence }
  }
  return {
    ok: true,
    proof: {
      kind: 'mutation',
      ref: mutations.map((m) => m.id).join(','),
      assertionId: mutations.map((m) => m.assertionId).join(','),
      log: proofs.map((p) => p.log).join(','),
      controlLog: rel(control.log),
      product: { head: safeHead(ctx.root), gateScriptSha256: scriptHash(manifest, ctx) },
      mutations: proofs
    },
    evidence
  }
}

/** @returns {string} HEAD of the tree, or 'unknown'. */
function safeHead(root) {
  try {
    return root === REPO ? gitHead() : 'n/a'
  } catch {
    return 'unknown'
  }
}

/** @returns {string} hash of the gate script the case runs, or ''. */
function scriptHash(manifest, ctx) {
  const script = manifest.command.find(
    (a) => /^scripts\/.+\.(?:ts|mjs)$/.test(a) && !a.endsWith('check-all.ts')
  )
  const guess = manifest.gateScript ?? script
  return guess && existsSync(join(ctx.root, guess)) ? sha256(readBytesSync(join(ctx.root, guess))) : ''
}

/**
 * @param {{cases: object[], target: string, proveRed: boolean, outDir: string}} o - what to run.
 * @param {object} [ctx] - paths (selftests inject a fake tree).
 * @returns {Promise<object[]>} one result per case.
 */
export async function run({ cases, target, proveRed, outDir }, ctx = defaultContext()) {
  const rel = (p) => relative(outDir, p)
  const policy = oracle(ctx, 'gate-policy.json')
  const { mutations } = oracle(ctx, 'mutations.json')
  const env = ctx.env
  const results = []
  const scratches = new Map()
  const missing = toolchainMissing(ctx)
  const realBefore = new Map()
  let failed = null
  try {
    for (const manifest of cases) {
      const started = Date.now()
      const done = (verdict, reason, extra = {}) => {
        results.push(result(manifest, verdict, reason, { durationMs: Date.now() - started, ...extra }))
      }
      const denied = targetPolicy(manifest, target)
      if (denied !== null) {
        done('PENDING', denied)
        continue
      }
      if (manifest.mode === 'no-gate') {
        done(
          'PENDING',
          'no gate enforces this rule (CLAUDE.md §8 says so); the open obligation is listed in denominator.json and owned by the UI layer / REG-PR-927'
        )
        continue
      }
      const gp = policy.gates[manifest.gate] ?? {}
      if (manifest.mode === 'recorded-env' || gp.mode === 'recorded-env') {
        const ev = JSON.parse(readRegular(join(ctx.root, gp.evidence)).toString('utf8'))
        done(
          'ENV',
          `known local false red, not executed: ${ev.claim} Evidence: ${ev.source}; packages: ${ev.packages.join(', ')}`,
          { evidence: [gp.evidence] }
        )
        continue
      }
      if (missing !== null) {
        done('ENV', `toolchain probe: ${missing}`)
        continue
      }
      const absent = (gp.requires ?? []).filter((p) => !existsSync(join(ctx.root, p)))
      if (absent.length > 0) {
        done(
          'ENV',
          `${manifest.gate}: ${absent.join(', ')} not present (probe: existsSync; ${gp.requiresWhy})`
        )
        continue
      }
      if (gp.mode === 'heavy' && env.QA_STATIC_ALLOW_HEAVY !== '1') {
        const probe = heavyProbe(gp, manifest.gate, ctx)
        done(probe.verdict, probe.reason)
        continue
      }
      const control = await runChild({
        argv: manifest.command,
        cwd: ctx.root,
        log: join(outDir, 'logs', `${manifest.id}.log`),
        timeoutMs: gp.timeoutMs ?? policy.defaultTimeoutMs ?? 600000
      })
      const evidence = [rel(control.log)]
      const text = readTextSync(control.log)
      if (control.spawnFailed) {
        done('ENV', `command could not start: ${control.tail.trim().split('\n').pop()}`, { evidence })
        continue
      }
      if (control.timedOut) {
        done('FAIL', `gate timed out after ${(gp.timeoutMs ?? policy.defaultTimeoutMs ?? 600000) / 1000}s`, {
          evidence
        })
        continue
      }
      if (control.status !== 0) {
        if (CANNOT_LOAD.test(text))
          done(
            'PENDING',
            'TEST_INVALID: the gate could not load a module (environment suspected), not a rule violation',
            { evidence }
          )
        else
          done(
            'FAIL',
            `gate exited ${control.status ?? control.signal}: ${text.trim().split('\n').slice(-3).join(' / ').slice(0, 400)}`,
            { evidence }
          )
        continue
      }
      const marker = manifest.successMarker ?? SUCCESS
      if (!text.includes(marker)) {
        done('PENDING', `TEST_INVALID: exit 0 but the success line "${marker}" was not printed`, { evidence })
        continue
      }
      const stood = text.split('\n').find((l) => STOOD_DOWN.test(l))
      if (stood !== undefined) {
        done('PENDING', `gate exited 0 but reports it did not run: ${stood.trim().slice(0, 200)}`, {
          evidence
        })
        continue
      }
      const muts = mutations.filter((m) => manifest.mutations.includes(m.id))
      if (muts.length === 0) {
        done('PENDING', 'gate is green; no recorded mutation proves RED for it yet', { evidence })
        continue
      }
      if (!proveRed) {
        done('PENDING', 'gate is green; RED proof not requested (run with --prove-red)', { evidence })
        continue
      }
      const escapes = muts
        .flatMap((m) => m.edits.map((e) => e.file))
        .filter((f) => !resolve(ctx.root, f).startsWith(resolve(ctx.root) + sep))
      if (escapes.length > 0) {
        done(
          'PENDING',
          `gate is green; RED proof invalid: mutation path escapes the tree (${escapes.join(', ')})`,
          { evidence }
        )
        continue
      }
      for (const m of muts)
        for (const e of m.edits)
          if (!realBefore.has(e.file)) realBefore.set(e.file, sha256(readRegular(join(ctx.root, e.file))))
      const realDirs = [...new Set(muts.flatMap((m) => m.realDirs ?? []))].sort()
      const key = realDirs.join(',')
      if (!scratches.has(key)) {
        const dir = join(outDir, `scratch-${scratches.size}`)
        buildOverlay(
          ctx.root,
          dir,
          ctx.heavyDirs.filter((d) => !realDirs.includes(d)),
          { gitPointer: true }
        )
        scratches.set(key, { root: registerScratch(dir) })
      }
      const scratch = scratches.get(key)
      const proof = await proveRedFor(manifest, muts, scratch, outDir, ctx, rel)
      if (proof.ok)
        done('PASS', `gate green and red on ${muts.length} recorded mutation(s)`, {
          evidence: [...evidence, ...proof.evidence],
          redProof: proof.proof
        })
      else
        done('PENDING', `gate is green; RED proof invalid: ${proof.reason}`, {
          evidence: [...evidence, ...proof.evidence]
        })
    }
  } catch (error) {
    failed = error
  }
  // The overlays are this run's own scratch; remove them and prove the real tree was never written.
  for (const { root } of scratches.values()) removeScratch(root)
  for (const [file, hash] of realBefore)
    if (sha256(readRegular(join(ctx.root, file))) !== hash) throw new Error(`REAL TREE CHANGED: ${file}`)
  if (failed !== null) throw failed
  return results
}
