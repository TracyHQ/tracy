// Adapter around the infra suites that already exist in the repo. It runs them with node:test's TAP
// reporter, reads every assertion line, and reports what ran, what failed and what was skipped.
// Their expected values were never bound to an independent oracle, so a green legacy suite is
// reported as evidence (PENDING: oracle unbound), never as a layer PASS.
import { removeScratch, scratchBase, scratchDir } from './scratch.mjs'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO, containedPath } from './harness.mjs'

const TEST_DIR = (p) => path.join(REPO, p)

/** The suites the plan names, with what each needs to be able to run at all. */
export const LEGACY_SUITES = [
  {
    key: 'host',
    label: 'apps/tracy-host/test/*.test.mjs',
    dir: 'apps/tracy-host/test',
    glob: /\.test\.mjs$/
  },
  ...[0, 1, 2, 3].map((shard) => ({
    key: `fleet-${shard + 1}of4`,
    label: `packages/fleet/tracy-fleet-operation/test/*.test.mjs (shard ${shard + 1} of 4)`,
    dir: 'packages/fleet/tracy-fleet-operation/test',
    glob: /\.test\.mjs$/,
    shard: [shard, 4]
  })),
  ...['cron', 'inventory-reconcile', 'provision-settles', 'backup-restore'].map((name) => ({
    key: `web-${name}`,
    label: `apps/tracy-web/test/${name}.test.mjs`,
    files: [`apps/tracy-web/test/${name}.test.mjs`],
    requires: 'TEST_DATABASE_URL'
  }))
]

export const PYTHON_SUITES = [
  'packages/fleet/tracy-fleet-operation/test/quickstart-jpa.test.py',
  'packages/fleet/tracy-fleet-operation/test/render-canonical.test.py'
]

export function suiteFiles(suite) {
  if (suite.files) return suite.files
  const all = readdirSync(TEST_DIR(suite.dir))
    .filter((f) => suite.glob.test(f))
    .sort()
    .map((f) => `${suite.dir}/${f}`)
  // Shards are interleaved so each gets a comparable mix of heavy and light files.
  return suite.shard ? all.filter((_, i) => i % suite.shard[1] === suite.shard[0]) : all
}

/** Parse node:test TAP output into counts and per-test rows. */
export function parseTap(text) {
  const rows = []
  let last = null
  for (const line of text.split('\n')) {
    const m = /^(\s*)(not ok|ok) (\d+) - (.*?)(?: # (SKIP|skip|TODO|todo)\b(.*))?$/.exec(line)
    if (!m) {
      // The lines between a row and the next row (diagnostics, error block) belong to that row.
      if (last && !/^\s*# Subtest/.test(line)) last.detail += `${line}\n`
      continue
    }
    last = {
      depth: m[1].length,
      ok: m[2] === 'ok',
      name: m[4].trim(),
      directive: m[5] ? m[5].toUpperCase() : null,
      reason: (m[6] ?? '').trim(),
      detail: ''
    }
    rows.push(last)
  }
  const count = (name) => Number(new RegExp(`^# ${name} (\\d+)`, 'm').exec(text)?.[1] ?? 0)
  return {
    rows,
    tests: count('tests'),
    pass: count('pass'),
    fail: count('fail'),
    skipped: count('skipped'),
    todo: count('todo'),
    cancelled: count('cancelled')
  }
}

/** A `docker` that refuses everything: legacy suites must not start containers (policy). */
export function dockerBlockDir() {
  const dir = scratchDir('qa-infra-nodocker-')
  const shim = path.join(dir, 'docker')
  writeFileSync(shim, '#!/bin/sh\necho "docker is blocked by the infra QA layer policy" >&2\nexit 125\n')
  chmodSync(shim, 0o755)
  return dir
}

/**
 * Run one suite. Returns {state, ...}: `ran` (with counts), `env` (prerequisite proven missing,
 * with the probe), or `error` (harness could not run it).
 */
/** Ignored paths git can see (build outputs, caches), as repo-relative strings. */
export function ignoredPaths() {
  const out = spawnSync(
    'git',
    ['-C', REPO, 'status', '--porcelain', '--ignored=matching', '--untracked-files=no'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    }
  )
  return new Set(
    out.stdout
      .split('\n')
      .filter((line) => line.startsWith('!! '))
      .map((line) => line.slice(3))
  )
}

/**
 * Build outputs the existing suites are KNOWN to write into the tree (a seeder build writes `dist/`).
 * They are reported after a run (`leftBehind`) and never removed: a Git observation cannot show who wrote them. Python bytecode is
 * never written into the tree at all (PYTHONPYCACHEPREFIX points at the scratch area), so a
 * `__pycache__` that appears is another session's and is reported, not removed. Any other new ignored path is reported and left alone (it may belong to
 * another session), and the legacy test fails on it so the producer gets added here on purpose.
 */
export const KNOWN_OUTPUT = [/^packages\/cms\/tracy-seeder\/dist\/$/]

export function removeNewIgnored(before) {
  // Ownership cannot be proven from two Git observations (a parallel session may have written the
  // same path), so nothing is removed here: new ignored paths are reported and left in place.
  const created = [...ignoredPaths()].filter((p) => !before.has(p)).sort()
  return {
    removed: [],
    leftBehind: created.filter((p) => KNOWN_OUTPUT.some((re) => re.test(p))),
    unexpected: created.filter((p) => !KNOWN_OUTPUT.some((re) => re.test(p)))
  }
}

/** The child environment: no inherited test-runner context, no bytecode files written into the tree. */
function pycachePrefix() {
  const dir = path.join(scratchBase(), 'pycache')
  mkdirSync(dir, { recursive: true })
  return dir
}

function childEnv(env, extra = {}) {
  const out = { ...env, ...extra, PYTHONDONTWRITEBYTECODE: '1', PYTHONPYCACHEPREFIX: pycachePrefix() }
  delete out.NODE_TEST_CONTEXT
  return out
}

/**
 * A failing child test is ENV only when a probe proves the tool absent AND that test's own error block
 * carries the tool's error signature (`jq` missing makes the quickstart-restore script report
 * "unzipped distribution.json says nothing"). Every other failing test is a product failure and keeps
 * its error excerpt; the two are decided per test, so one environment failure never excuses another.
 */
const TOOL_SIGNATURES = [{ tool: 'jq', signature: '!! unzipped distribution.json says nothing' }]

/** The `error:` part of a TAP failure block (its yaml header is not evidence). */
function errorText(detail) {
  const at = detail.indexOf('error:')
  return (at >= 0 ? detail.slice(at + 6) : detail).trim().slice(0, 600)
}

export function classifyFailures(tap, env = process.env) {
  const absent = new Map()
  for (const { tool } of TOOL_SIGNATURES) {
    const probe = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8', env })
    if (probe.status !== 0) absent.set(tool, probe.status)
  }
  const envFailures = []
  const productFailures = []
  for (const row of tap.rows.filter((r) => r.ok === false && r.depth === 0)) {
    const hit = TOOL_SIGNATURES.find((t) => absent.has(t.tool) && row.detail.includes(t.signature))
    if (hit)
      envFailures.push({
        name: row.name,
        probe: `${hit.tool} not found on PATH (\`command -v ${hit.tool}\` exit ${absent.get(hit.tool)}); the test prints "${hit.signature}"`
      })
    else productFailures.push({ name: row.name, excerpt: errorText(row.detail) })
  }
  return { envFailures, productFailures }
}

export function runLegacySuite(suite, { outDir, timeoutMs = 840_000, env = process.env } = {}) {
  if (suite.requires && !env[suite.requires]) {
    return {
      key: suite.key,
      state: 'env',
      probe: `${suite.requires} is not set in the environment`,
      files: suiteFiles(suite)
    }
  }
  const files = suiteFiles(suite)
  if (files.length === 0) return { key: suite.key, state: 'error', error: 'no test files found' }
  const block = dockerBlockDir()
  const ignoredBefore = ignoredPaths()
  let cleaned = { removed: [], leftBehind: [], unexpected: [] }
  try {
    const run = spawnSync(
      process.execPath,
      ['--test', '--test-reporter=tap', '--test-timeout=120000', ...files.map((f) => path.join(REPO, f))],
      {
        cwd: REPO,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 256 * 1024 * 1024,
        env: childEnv(env, { PATH: `${block}:${env.PATH ?? ''}` })
      }
    )
    const output = (run.stdout ?? '') + (run.stderr ?? '')
    let logPath = null
    if (outDir) {
      const target = containedPath(outDir, `legacy/${suite.key}.tap`)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, output)
      logPath = path.relative(outDir, target)
    }
    if (run.error) return { key: suite.key, state: 'error', error: run.error.message, log: logPath }
    const tap = parseTap(output)
    const skips = tap.rows.filter((r) => r.directive === 'SKIP')
    const { envFailures, productFailures } = classifyFailures(tap, env)
    if (envFailures.length > 0 && productFailures.length === 0 && envFailures.length === tap.fail)
      return {
        key: suite.key,
        state: 'env',
        probe: envFailures[0].probe,
        envFailures,
        files: files.length,
        ...tap,
        log: logPath
      }
    return {
      key: suite.key,
      // `fail`: the suite ran to the end and a child test failed for a reason this machine does not explain.
      state: productFailures.length > 0 ? 'fail' : 'ran',
      envFailures,
      productFailures,
      status: run.status,
      files: files.length,
      ...tap,
      skipReasons: [...new Set(skips.map((s) => s.reason))].slice(0, 10),
      log: logPath,
      get cleaned() {
        return cleaned
      }
    }
  } finally {
    removeScratch(block)
    cleaned = removeNewIgnored(ignoredBefore)
  }
}

export function runPythonSuite(file, { timeoutMs = 300_000 } = {}) {
  const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' })
  if (probe.status !== 0) return { key: file, state: 'env', probe: 'python3 is not available' }
  const run = spawnSync('python3', [path.join(REPO, file)], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: childEnv(process.env)
  })
  if (run.error) return { key: file, state: 'error', error: run.error.message }
  return {
    key: file,
    state: 'ran',
    status: run.status,
    tail: (run.stdout + run.stderr).split('\n').slice(-5).join('\n')
  }
}
