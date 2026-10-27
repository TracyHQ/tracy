#!/usr/bin/env node
// Standalone entry:  node tests/qa/layers/related/run.mjs [--area X] [--target local] [--prove-red] [--out DIR]
// Writes DIR/results.json, DIR/report.md, DIR/coverage.json and DIR/provenance.json (the commit of every sibling clone).
// Exit 0 all PASS, 1 any FAIL, 2 invalid usage/contract, 3 ENV/PENDING only.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AREAS, cleanOut, coverage, listCases, run } from './index.mjs'
import { atomicWrite, canonicalJson, standaloneMain } from '../cms/lib/kit.mjs'
import { resolveRoot, snapshotClone } from './lib/clone.mjs'
import { SUITES } from './specs/suites.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const code = await standaloneMain({
  layer: 'related',
  repoRoot: REPO,
  areas: AREAS,
  listCases,
  run,
  argv: process.argv.slice(2),
  extraReport: async ({ outDir, results }) => {
    const where = resolveRoot(process.env)
    const repos = {}
    for (const repo of new Set(SUITES.map((s) => s.repo))) {
      const snap = where.root
        ? await snapshotClone(path.join(where.root, repo))
        : { ok: false, reason: 'no root configured' }
      repos[repo] = snap.ok
        ? { head: snap.head, dirtyFiles: snap.dirtyLines }
        : { head: null, problem: snap.reason }
    }
    await atomicWrite(
      path.join(outDir, 'provenance.json'),
      canonicalJson({ root: { from: where.from }, repos })
    )
    const cov = await coverage({ results })
    await atomicWrite(path.join(outDir, 'coverage.json'), canonicalJson(cov))
    await cleanOut(outDir)
    const t = cov.totals
    return [
      '## Sibling repositories (see provenance.json)',
      '',
      ...Object.entries(repos).map(
        ([r, v]) =>
          `- ${r}: ${v.head ? `${v.head.slice(0, 10)} (${v.dirtyFiles} uncommitted)` : `unavailable (${v.problem})`}`
      ),
      '',
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
