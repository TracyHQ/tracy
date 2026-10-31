#!/usr/bin/env node
/** Paired deterministic engine experiment; latency is synthetic, with no model or paid calls. */
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { discoveryTrial } from '../../packages/tools/tracy-site-tools/test/fixtures/replace/discovery-bench.mjs'

const args = process.argv.slice(2)
const value = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback)
let baseline = value('--baseline', null)
const baselineRef = value('--baseline-ref', null)
const enginePath = 'packages/tools/tracy-site-tools/src/host/replace-wordpress.mjs'
let temporary = null
let baselineEngineHash = null
if (baselineRef) {
  const source = execFileSync('git', ['show', `${baselineRef}:${enginePath}`], { encoding: 'utf8' })
  baselineEngineHash = createHash('sha256').update(source).digest('hex')
  temporary = mkdtempSync(resolve(tmpdir(), 'tracy-discovery-'))
  baseline = resolve(temporary, 'replace-wordpress.mjs')
  // Compare this engine alone against shared, fixed dependencies. No running plugin is replaced.
  writeFileSync(
    baseline,
    source.replace(
      /from '(\.\/[^']+)'/g,
      (_match, file) => `from '${pathToFileURL(resolve(enginePath, '..', file)).href}'`
    )
  )
  process.on('exit', () => rmSync(temporary, { recursive: true, force: true }))
}
if (!baseline) throw new Error('Pass --baseline-ref <git revision> or --baseline <engine module path>.')
const candidate = value('--candidate', 'packages/tools/tracy-site-tools/src/host/replace-wordpress.mjs')
const repeats = Number(value('--repeats', '7'))
const delayMs = Number(value('--delay-ms', '5'))
if (
  !Number.isInteger(repeats) ||
  repeats < 1 ||
  repeats > 100 ||
  !Number.isFinite(delayMs) ||
  delayMs < 0 ||
  delayMs > 1000
)
  throw new Error('Invalid repeat count or delay')
const engines = await Promise.all(
  [baseline, candidate].map(
    async (file) => (await import(pathToFileURL(resolve(file)).href)).replaceOnWordPress
  )
)
const results = []
for (const wide of [false, true]) {
  const arms = [[], []]
  for (let i = 0; i < repeats; i++) {
    const pair = []
    for (const arm of i % 2 ? [1, 0] : [0, 1]) {
      const trial = await discoveryTrial(engines[arm], { wide, delayMs })
      arms[arm].push(trial)
      pair[arm] = trial
    }
    assert.deepEqual(pair[1].receipt, pair[0].receipt, 'identical model-facing receipt')
    assert.deepEqual(pair[1].changed, pair[0].changed, 'identical changed targets')
  }
  const median = (xs) => {
    const a = [...xs].sort((x, y) => x - y)
    const h = Math.floor(a.length / 2)
    return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2
  }
  const summary = arms.map((trials, arm) => ({
    arm: arm ? 'candidate' : 'baseline',
    verified: trials.length,
    reads: trials[0].reads,
    medianMs: median(trials.map((t) => t.elapsedMs)),
    counts: trials[0].counts
  }))
  results.push({
    cohort: wide ? 'template-widening' : 'direct-page',
    arms: summary,
    readReductionPct: 100 * (1 - summary[1].reads / summary[0].reads),
    syntheticLatencyReductionPct: 100 * (1 - summary[1].medianMs / summary[0].medianMs)
  })
}
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
process.stdout.write(
  `${JSON.stringify({ baseline: baselineRef ?? resolve(baseline), baselineEngineHash: baselineEngineHash ?? hash(baseline), candidate: candidate, engineOnly: true, sharedDependencies: 'current checkout', candidateRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), candidateWorkingTree: true, candidateEngineHash: hash(candidate), fixtureHash: hash('packages/tools/tracy-site-tools/test/fixtures/replace/discovery-bench.mjs'), repeats, injectedReadDelayMs: delayMs, model: null, actualCost: null, results }, null, 2)}\n`
)
