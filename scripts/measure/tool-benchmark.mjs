#!/usr/bin/env node
/** Compare independently verified paired tasks using the existing session parser. No model calls. */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { turnsIn } from '../agent-turn-cost.mjs'

const median = (values) => {
  const a = [...values].sort((x, y) => x - y)
  if (!a.length) return null
  const h = Math.floor(a.length / 2)
  return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2
}
const p90 = (values) => {
  const a = [...values].sort((x, y) => x - y)
  return a.length ? a[Math.ceil(0.9 * a.length) - 1] : null
}
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0)

/**
 * Prices must be settled dollars for ALL attempts, supplied explicitly; token counts are never dollars.
 * Outcome evidence comes from the task verifier, never from the assistant's final answer.
 */
export function compareToolRuns(
  manifest,
  load = (run) => turnsIn(run.sessionFile).find((row) => row.turn === run.turn)
) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.runs))
    throw new Error('Expected schemaVersion:1 and runs')
  const reasons = []
  for (const arm of ['baseline', 'candidate'])
    for (const field of ['revision', 'image'])
      if (typeof manifest[arm]?.[field] !== 'string' || !manifest[arm][field])
        reasons.push(`Missing ${arm}.${field}`)
  const pairs = new Map()
  const arms = { baseline: [], candidate: [] }
  for (const run of manifest.runs) {
    if (!['baseline', 'candidate'].includes(run.arm) || typeof run.pair !== 'string')
      throw new Error('Every run needs an arm and pair')
    if (typeof run.verification?.success !== 'boolean' || !run.verification.evidence)
      throw new Error(`Missing independent verification for ${run.pair}/${run.arm}`)
    if (run.costUsd !== null && (!Number.isFinite(run.costUsd) || run.costUsd < 0))
      throw new Error('costUsd must be settled dollars or null')
    for (const field of ['cms', 'fixture', 'cache'])
      if (typeof run[field] !== 'string' || !run[field]) throw new Error(`Missing ${field}`)
    const turn = load(run)
    if (!turn) throw new Error(`Missing turn ${run.pair}/${run.arm}`)
    const row = { ...turn, costUsd: run.costUsd, verified: run.verification.success }
    arms[run.arm].push(row)
    const pair = pairs.get(run.pair) ?? {}
    if (pair[run.arm])
      throw new Error(`Duplicate ${run.pair}/${run.arm}; include every attempt in its task session`)
    pair[run.arm] = { run, row }
    pairs.set(run.pair, pair)
  }
  for (const [name, pair] of pairs) {
    if (!pair.baseline || !pair.candidate) {
      reasons.push(`Unpaired task ${name}`)
      continue
    }
    const [a, b] = [pair.baseline, pair.candidate]
    for (const field of ['cms', 'fixture', 'cache'])
      if (a.run[field] !== b.run[field]) reasons.push(`${name}: mismatched ${field}`)
    if (!a.row.preset || a.row.preset !== b.row.preset) reasons.push(`${name}: missing/mismatched preset`)
    const route = (row) =>
      row.requests?.map((r) =>
        typeof r?.provider === 'string' && r.provider && typeof r?.model === 'string' && r.model
          ? JSON.stringify([r.provider, r.model, r.reasoningEffort])
          : null
      ) ?? []
    const routes = [...new Set([...route(a.row), ...route(b.row)])]
    if (!routes.length || routes.includes(null) || routes.length !== 1)
      reasons.push(`${name}: missing/mismatched model route`)
    if (!a.row.usageComplete || !b.row.usageComplete) reasons.push(`${name}: incomplete model usage`)
    if (a.row.seconds === null || b.row.seconds === null)
      reasons.push(`${name}: unfinished task; latency censored`)
    if (a.row.verified && !b.row.verified) reasons.push(`${name}: verified success regressed`)
  }
  const summary = (rows) => {
    const successes = rows.filter((row) => row.verified).length
    const costKnown = rows.length > 0 && rows.every((row) => row.costUsd !== null)
    const finished = rows.filter((row) => row.seconds !== null)
    return {
      tasks: rows.length,
      successes,
      unfinished: rows.length - finished.length,
      totalCostUsd: costKnown ? sum(rows, 'costUsd') : null,
      costPerSuccessUsd: costKnown && successes ? sum(rows, 'costUsd') / successes : null,
      latencyP50: median(finished.map((row) => row.seconds)),
      latencyP90: p90(finished.map((row) => row.seconds)),
      steps: sum(rows, 'steps'),
      calls: sum(rows, 'calls'),
      resultChars: sum(rows, 'resultChars'),
      input: sum(rows, 'input'),
      output: sum(rows, 'output'),
      cacheRead: sum(rows, 'cacheRead')
    }
  }
  const baseline = summary(arms.baseline)
  const candidate = summary(arms.candidate)
  const improvement = (a, b) => (a !== null && a > 0 && b !== null ? 1 - b / a : null)
  const latencyImprovement = improvement(baseline.latencyP50, candidate.latencyP50)
  const costImprovement = improvement(baseline.costPerSuccessUsd, candidate.costPerSuccessUsd)
  const minimumPairs = manifest.minimumPairs ?? 12
  if (!Number.isInteger(minimumPairs) || minimumPairs < 3) throw new Error('minimumPairs must be at least 3')
  if (pairs.size < minimumPairs) reasons.push(`Only ${pairs.size} pairs; requires ${minimumPairs}`)
  if (baseline.costPerSuccessUsd === null || candidate.costPerSuccessUsd === null)
    reasons.push('Settled task costs unknown')
  if (manifest.boundariesVerified !== true) reasons.push('Boundary fault matrix not verified')
  const tailsOkay =
    baseline.latencyP90 !== null &&
    candidate.latencyP90 !== null &&
    candidate.latencyP90 <= baseline.latencyP90 * 1.1
  const winning =
    tailsOkay &&
    latencyImprovement !== null &&
    costImprovement !== null &&
    ((latencyImprovement >= 0.2 && costImprovement >= -0.1) ||
      (costImprovement >= 0.2 && latencyImprovement >= -0.1))
  return {
    verdict: reasons.length ? 'inconclusive' : winning ? 'meets-target' : 'does-not-meet-target',
    reasons,
    baseline,
    candidate,
    latencyImprovement,
    costImprovement,
    scope: 'Exploratory paired sample; no statistical or production claim',
    provenance: { baseline: manifest.baseline, candidate: manifest.candidate }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [file, output] = process.argv.slice(2)
  if (!file) throw new Error('Usage: node scripts/measure/tool-benchmark.mjs <manifest.json> [report.json]')
  const manifest = JSON.parse(readFileSync(file, 'utf8'))
  manifest.runs = manifest.runs.map((run) => ({
    ...run,
    sessionFile: resolve(dirname(file), run.sessionFile)
  }))
  const report = `${JSON.stringify(compareToolRuns(manifest), null, 2)}\n`
  if (output) writeFileSync(output, report)
  else process.stdout.write(report)
}
