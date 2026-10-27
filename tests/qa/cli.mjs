#!/usr/bin/env node
// Tracy QA suite entry point: `pnpm qa <layer|all|affected|coverage|stand|inventory> ...`.
// Run by a person on demand; never wired into CI. See tests/qa/README.md.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { UsageError, parseArgv } from './lib/args.mjs'
import { CONTRACTS_DIR } from './lib/contracts.mjs'
import { AffectedError, computeAffected, renderAffected } from './lib/affected.mjs'
import { computeCoverage, coverageExitCode, renderCoverage } from './lib/coverage.mjs'
import { makeDocker } from './lib/docker.mjs'
import { UnsafePathError, lstatOrNull } from './lib/fsafe.mjs'
import { ProvenanceError, gitProvenance, makeGit, treeFingerprint } from './lib/git.mjs'
import { ContractError, discoverLayers, runLayer } from './lib/runner.mjs'
import { SchemaError } from './lib/schema.mjs'
import { StandError, standDown, standReuse, standUp } from './lib/stand.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const USAGE = `usage:
  pnpm qa <layer> [--area X] [--target local|dev|prod] [--prove-red] [--out DIR]
  pnpm qa all [same options]
  pnpm qa affected --base <sha> --head <sha> [layer options]
  pnpm qa coverage [--layer X] [--require-complete] [--json]
  pnpm qa stand up|reuse|down --id <id> [-v] [--dry-run]
exit codes: 0 pass · 1 FAIL · 2 invalid usage/contract · 3 ENV/PENDING/missing (not done)`

function buildDeps(argv, overrides) {
  const env = overrides.env ?? process.env
  const repoRoot = overrides.repoRoot ?? REPO_ROOT
  const git = overrides.git ?? makeGit(repoRoot)
  const fingerprint = overrides.fingerprint ?? (() => treeFingerprint(git, repoRoot))
  const out = overrides.stdout ?? ((text) => process.stdout.write(text))
  const err = overrides.stderr ?? ((text) => process.stderr.write(text))
  return {
    argv,
    repoRoot,
    layersDir: overrides.layersDir ?? env.QA_LAYERS_DIR ?? path.join(repoRoot, 'tests/qa/layers'),
    resultsRoot: overrides.resultsRoot ?? env.QA_RESULTS_ROOT ?? path.join(repoRoot, 'qa-results'),
    inventoryDir: overrides.inventoryDir ?? env.QA_INVENTORY_DIR ?? path.join(repoRoot, 'tests/qa/inventory'),
    contractsDir: overrides.contractsDir ?? CONTRACTS_DIR,
    git,
    fingerprint,
    gitInfo: () => gitProvenance(git),
    docker: overrides.docker ?? makeDocker({ cwd: repoRoot }),
    portBusy: overrides.portBusy,
    fault: overrides.fault,
    platform: overrides.platform,
    now: overrides.now ?? (() => new Date()),
    signal: overrides.signal,
    layerTimeoutMs: overrides.layerTimeoutMs,
    cancelGraceMs: overrides.cancelGraceMs,
    out,
    err
  }
}

function summarize(deps, result) {
  if (result.status === 'missing') {
    deps.out(`${result.layer}: ${result.messages[0]}\n`)
    return
  }
  if (result.status === 'error') {
    deps.err(`${result.layer}: CONTRACT/HARNESS ERROR\n${result.messages.map((m) => `  ${m}`).join('\n')}\n`)
    return
  }
  const c = result.counts
  deps.out(
    `${result.layer}: PASS ${c.PASS} · FAIL ${c.FAIL} · ENV ${c.ENV} · PENDING ${c.PENDING} → ${path.relative(deps.repoRoot, result.runDir)}\n`
  )
  for (const m of result.messages) deps.out(`  ${m}\n`)
}

function combine(results) {
  if (results.some((r) => r.exitCode === 2)) return 2
  if (results.some((r) => r.exitCode === 1)) return 1
  if (results.length === 0 || results.some((r) => r.exitCode !== 0)) return 3
  return 0
}

async function runLayers(deps, layers, options, { perLayerOut }) {
  const results = []
  for (const layer of layers) {
    const opts = perLayerOut && options.out ? { ...options, out: path.join(options.out, layer) } : options
    const result = await runLayer(deps, layer, opts)
    summarize(deps, result)
    results.push(result)
    if (result.unterminated) {
      deps.err(`stopping: ${layer} did not terminate, so no further layer is started\n`)
      break
    }
  }
  return results
}

async function dispatchInventory(deps, rest) {
  const script = path.join(deps.inventoryDir, 'run.mjs')
  if (!(await lstatOrNull(script))) {
    deps.out(
      'inventory: tests/qa/inventory/run.mjs does not exist yet (W1 owns it); nothing was inventoried\n'
    )
    return 3
  }
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...rest], { stdio: 'inherit', cwd: deps.repoRoot })
    child.on('exit', (code) => resolve(code ?? 3))
    child.on('error', () => resolve(2))
  })
}

async function standCommand(deps, parsed) {
  const { id, verbose, dryRun, project } = parsed.options
  void project
  const args = { id, dryRun, volumes: verbose }
  let result
  if (parsed.action === 'up') result = await standUp(deps, args)
  else if (parsed.action === 'reuse') result = await standReuse(deps, args)
  else result = await standDown(deps, args)
  deps.out(`${result.lines.join('\n')}\n`)
  return result.exitCode
}

export async function main(argv, overrides = {}) {
  const deps = buildDeps(argv, overrides)
  let parsed
  try {
    parsed = parseArgv(argv)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    deps.err(`error: ${error.message}\n${USAGE}\n`)
    return 2
  }
  const { options } = parsed
  try {
    if (parsed.command === 'inventory') return await dispatchInventory(deps, parsed.rest)
    if (parsed.command === 'coverage') {
      if (options.runs !== undefined) deps.extraRuns = [path.resolve(options.runs)]
      const reports = await computeCoverage(deps, { layer: options.coverageLayer })
      deps.out(options.json ? `${JSON.stringify(reports, null, 2)}\n` : `${renderCoverage(reports)}\n`)
      return coverageExitCode(reports, options.requireComplete)
    }
    if (parsed.command === 'stand') return await standCommand(deps, parsed)
    if (parsed.command === 'affected') {
      const affected = await computeAffected(deps, { base: options.base, head: options.head })
      deps.out(renderAffected(affected))
      const chosen = [...affected.selection.keys()].sort()
      if (chosen.length === 0) return 0
      const results = await runLayers(deps, chosen, options, { perLayerOut: true })
      return combine(results)
    }
    if (parsed.command === 'all') {
      const layers = await discoverLayers(deps.layersDir)
      const results = await runLayers(deps, layers, options, { perLayerOut: true })
      const missing = results.filter((r) => r.status === 'missing').map((r) => r.layer)
      if (missing.length > 0) deps.out(`MISSING layers (not run, not passed): ${missing.join(', ')}\n`)
      return combine(results)
    }
    const info = await lstatOrNull(path.join(deps.layersDir, parsed.layer))
    if (
      !info &&
      !['static', 'unit', 'api', 'infra', 'ui', 'flows', 'harness', 'cms', 'mail', 'related'].includes(
        parsed.layer
      )
    ) {
      deps.err(`error: unknown layer "${parsed.layer}"\n${USAGE}\n`)
      return 2
    }
    const results = await runLayers(deps, [parsed.layer], options, { perLayerOut: false })
    return combine(results)
  } catch (error) {
    if (error instanceof StandError) {
      deps.err(`${error.message}\n`)
      return error.exitCode
    }
    if (
      error instanceof AffectedError ||
      error instanceof ContractError ||
      error instanceof UnsafePathError ||
      error instanceof SchemaError ||
      error instanceof ProvenanceError
    ) {
      deps.err(`error: ${error.message}\n${(error.details ?? []).map((d) => `  ${d}`).join('\n')}\n`)
      return 2
    }
    deps.err(`error: ${error.stack ?? error}\n`)
    return 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  process.once('SIGTERM', () => controller.abort())
  main(process.argv.slice(2), { signal: controller.signal }).then((code) => {
    process.exitCode = code
  })
}
