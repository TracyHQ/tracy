#!/usr/bin/env node
// Standalone entry:  node tests/qa/layers/cms/run.mjs [--area X] [--target local] [--prove-red] [--out DIR]
// Writes DIR/results.json, DIR/report.md and DIR/coverage.json. Exit 0 all PASS, 1 any FAIL, 2 invalid, 3 ENV/PENDING only.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AREAS, cleanOut, coverage, listCases, run } from './index.mjs'
import { atomicWrite, canonicalJson, standaloneMain } from './lib/kit.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const code = await standaloneMain({
  layer: 'cms',
  repoRoot: REPO,
  areas: AREAS,
  listCases,
  run,
  argv: process.argv.slice(2),
  extraReport: async ({ outDir, results }) => {
    const cov = await coverage({ results })
    await atomicWrite(path.join(outDir, 'coverage.json'), canonicalJson(cov))
    await cleanOut(outDir)
    const t = cov.totals
    return [
      '## Coverage (see coverage.json)',
      '',
      `denominator items ${t.items}; required obligations ${t.obligations}: N-A ${t.na}, covered by a case ${t.implemented}, open ${t.open}.`,
      `executed ${t.executed} (PASS ${t.pass}, FAIL ${t.fail}); RED-proven obligations ${t.redProven}.`,
      cov.complete
        ? 'Inventory complete.'
        : `**Inventory INCOMPLETE** (${cov.incompleteBecause.length} unresolved source(s)); no percentage is claimed.`,
      ...cov.incompleteBecause.map((s) => `- ${s}`)
    ]
  }
})
process.exitCode = code
