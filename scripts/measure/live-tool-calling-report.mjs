#!/usr/bin/env node
/** Summarize all attempts from the focused live benchmark; usage-priced cost is never an invoice. */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const [nativeFile, modelFile, output] = process.argv.slice(2)
if (!nativeFile || !modelFile || !output)
  throw new Error('Usage: live-tool-calling-report.mjs native.json model.json output.json')
const quantile = (values, q) => {
  const a = [...values].sort((x, y) => x - y)
  const i = (a.length - 1) * q
  return a[Math.floor(i)] + (a[Math.ceil(i)] - a[Math.floor(i)]) * (i % 1)
}
const total = (a, key) => a.reduce((s, r) => s + r[key], 0)
function usage(row) {
  let hit = 0,
    miss = 0,
    completion = 0,
    estimatedUsd = 0
  for (const r of row.requests) {
    assert(r.usage, 'Missing provider usage; cannot price this attempt')
    const u = r.usage
    assert(Number.isFinite(u.prompt_cache_hit_tokens) && Number.isFinite(u.prompt_cache_miss_tokens))
    assert.equal(u.prompt_tokens, u.prompt_cache_hit_tokens + u.prompt_cache_miss_tokens)
    const at = new Date(r.requestedAt)
    assert(Number.isFinite(at.getTime()), 'Missing request timestamp')
    const weekday = at.getUTCDay() > 0 && at.getUTCDay() < 6
    const h = at.getUTCHours()
    // Published weekday peak intervals. This experiment is outside both intervals.
    const peak = weekday && ((h >= 1 && h < 4) || (h >= 6 && h < 10))
    assert(!peak, 'This report freezes off-peak prices; classify holiday/peak usage explicitly')
    hit += u.prompt_cache_hit_tokens
    miss += u.prompt_cache_miss_tokens
    completion += u.completion_tokens
    estimatedUsd +=
      (u.prompt_cache_hit_tokens * 0.003 + u.prompt_cache_miss_tokens * 0.15 + u.completion_tokens * 0.6) /
      1e6
  }
  return { hit, miss, completion, estimatedUsd }
}
const experiments = {}
for (const [name, file] of [
  ['native', nativeFile],
  ['model', modelFile]
]) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (data.metadata.baselineSnapshot)
    assert.deepEqual(
      data.metadata.hashes.baseline,
      data.metadata.baselineSnapshot.hashes,
      'Frozen baseline source mismatch'
    )
  const groups = {}
  for (const task of new Set(data.rows.map((r) => r.task))) {
    const arms = {}
    const pairs = new Map()
    for (const arm of ['baseline', 'candidate']) {
      const rows = data.rows.filter((r) => r.task === task && r.arm === arm)
      assert.equal(rows.length, data.metadata.repeats, 'Incomplete cohort')
      for (const row of rows) {
        const pair = pairs.get(row.repeat) ?? {}
        assert(!pair[arm], 'Duplicate pair arm')
        pair[arm] = row
        pairs.set(row.repeat, pair)
      }
      const priced = rows.map(usage)
      const successes = rows.filter((r) => r.verified).length
      arms[arm] = {
        attempts: rows.length,
        successes,
        undoPassed: rows.filter((r) => r.undoVerified === true).length,
        undoRequired: rows.filter((r) => r.undoVerified !== null).length,
        elapsedP50Ms: quantile(
          rows.map((r) => r.elapsedMs),
          0.5
        ),
        elapsedP90Ms: quantile(
          rows.map((r) => r.elapsedMs),
          0.9
        ),
        toolP50Ms: quantile(
          rows.map((r) => r.toolMs),
          0.5
        ),
        modelP50Ms: quantile(
          rows.map((r) => r.modelMs),
          0.5
        ),
        backendReads: total(rows, 'backendReads'),
        backendReadsP50: quantile(
          rows.map((r) => r.backendReads),
          0.5
        ),
        modelCalls: total(rows, 'steps'),
        toolCalls: rows.reduce((s, r) => s + r.calls.length, 0),
        resultChars: total(rows, 'resultChars'),
        cacheHitTokens: total(priced, 'hit'),
        cacheMissTokens: total(priced, 'miss'),
        outputTokens: total(priced, 'completion'),
        estimatedUsd: total(priced, 'estimatedUsd'),
        estimatedUsdPerVerifiedSuccess: successes ? total(priced, 'estimatedUsd') / successes : null,
        failures: rows
          .filter((r) => !r.verified)
          .map((r) => ({ repeat: r.repeat, reason: r.verificationFailure, final: r.final }))
      }
    }
    const differences = [...pairs.values()].map((p) => {
      assert(p.baseline && p.candidate, 'Missing pair')
      return p.candidate.elapsedMs - p.baseline.elapsedMs
    })
    groups[task] = {
      ...arms,
      pairedElapsedDifferenceP50Ms: quantile(differences, 0.5),
      candidateFasterPairs: differences.filter((v) => v < 0).length,
      latencyMedianChangePercent: (arms.candidate.elapsedP50Ms / arms.baseline.elapsedP50Ms - 1) * 100
    }
  }
  experiments[name] = { metadata: data.metadata, attempts: data.rows.length, groups }
}
assert.deepEqual(experiments.native.metadata.hashes, experiments.model.metadata.hashes, 'Engine source drift')
assert.equal(experiments.native.metadata.toolSchemaHash, experiments.model.metadata.toolSchemaHash)
assert.deepEqual(experiments.native.metadata.toolSchemaHashes, experiments.model.metadata.toolSchemaHashes)
writeFileSync(
  output,
  JSON.stringify(
    {
      costBasis:
        'Estimated from actual provider token usage at published off-peak USD/1M rates: cache hit 0.003, cache miss 0.15, output 0.60. Not settled billed cost.',
      percentileMethod:
        'Linear interpolation, inclusive of failed attempts. Timing is descriptive; no production or statistical-significance verdict.',
      settledCostUsd: null,
      experiments
    },
    null,
    2
  ) + '\n'
)
console.log(output)
