#!/usr/bin/env node
// Standalone entry of the flows layer:
//   node tests/qa/layers/flows/run.mjs [--area X] [--target local] [--prove-red] [--out DIR]
//
// Writes DIR/results.json, DIR/report.md, DIR/coverage.json, DIR/provenance.json and
// DIR/checklist.json (screenshots for a person to tick; the machine never judges them).
// Exit: 0 every requested case PASS · 1 any FAIL · 2 invalid usage/contract · 3 ENV/PENDING only.
//
// The stand comes from the environment (QA_STAND_URL …, set by stand.mjs `check`); this entry never
// starts one. Without it every case that needs a stand is ENV with its probe.

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { computeCoverage, loadDenominator } from './coverage.mjs'
import { AREAS, TARGETS, listCases, readManifests, run } from './index.mjs'
import {
  LAYER_DIR,
  REPO,
  UsageError,
  VERDICTS,
  nowIso,
  redactText,
  sha256File,
  stamp,
  writeAtomic,
  writeJsonAtomic
} from './util.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

export function exitCodeFor(results) {
  if (results.some((r) => r.verdict === 'FAIL')) return 1
  if (results.every((r) => r.verdict === 'PASS')) return 0
  return 3
}

export function reportMarkdown({ results, args, coverage, startedAt, outDir }) {
  const count = (v) => results.filter((r) => r.verdict === v).length
  const proven = results.filter((r) => r.verdict === 'PASS' && r.redProof).length
  const lines = [
    '# flows layer — report',
    '',
    `Run ${startedAt} · target ${args.target} · area ${args.area ?? 'all'} · prove-red ${args.proveRed}`,
    '',
    `**PASS ${count('PASS')} · FAIL ${count('FAIL')} · ENV ${count('ENV')} · PENDING ${count('PENDING')}** of ${results.length} case(s); RED-proven ${proven}.`,
    '',
    'PASS needs an independent oracle, a positive control and a red proof; everything else is named below.',
    ''
  ]
  const non = results.filter((r) => r.verdict !== 'PASS')
  if (non.length) {
    lines.push('## Not PASS', '')
    for (const v of ['FAIL', 'ENV', 'PENDING'])
      for (const r of results.filter((x) => x.verdict === v))
        lines.push(`- **${v}** \`${r.id}\` — ${String(r.reason).replace(/\n/g, ' ').slice(0, 400)}`)
    lines.push('')
  }
  const t = coverage.totals
  lines.push(
    '## Coverage (not a percentage)',
    '',
    `Obligations ${t.obligations} (item × required tag) · N-A with reason ${t.na} · N-A without reason ${t.naWithoutReason} · open (no case) ${t.open} · implemented ${t.implemented} · executed ${t.executed} · RED-proven ${t.proven}.`,
    '',
    `Extraction is **incomplete**: ${coverage.incompleteBecause}. Unresolved sources: ${coverage.unresolved.length} (see coverage.json).`,
    '',
    `Evidence under \`${path.basename(outDir)}/\`: evidence/, red/, legacy/ (provenance.jsonl lists every transport patch applied to the legacy suite), stand/ when the stand wrote there.`,
    ''
  )
  return lines.join('\n')
}

/** Screenshots a person should tick: every png under outDir, unreviewed. */
export function checklistFor(outDir) {
  const items = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) walk(p)
      else if (/\.(png|jpe?g)$/i.test(e.name))
        items.push({
          file: path.relative(outDir, p),
          question: 'Does this screen look and read right (wording, layout, language)?',
          reviewed: null,
          accepted: null,
          note: ''
        })
    }
  }
  if (existsSync(outDir)) walk(outDir)
  return { note: 'For a person. The machine never judges look or wording.', items }
}

export async function main(argv, { runImpl = run, env = process.env } = {}) {
  let args
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        area: { type: 'string' },
        target: { type: 'string', default: 'local' },
        'prove-red': { type: 'boolean', default: false },
        out: { type: 'string' }
      },
      allowPositionals: false,
      strict: true
    })
    args = { area: values.area, target: values.target, proveRed: values['prove-red'], out: values.out }
    if (!TARGETS.includes(args.target))
      throw new UsageError(`unknown target "${args.target}" (known: ${TARGETS.join(', ')})`)
    if (args.area !== undefined && !AREAS.includes(args.area))
      throw new UsageError(`unknown area "${args.area}" (known: ${AREAS.join(', ')})`)
  } catch (error) {
    console.error(`flows: ${error.message}`)
    return 2
  }
  const outDir = path.resolve(args.out ?? path.join(REPO, 'qa-results', `flows-${stamp()}`))
  let cases
  try {
    cases = await listCases({ area: args.area })
    mkdirSync(outDir, { recursive: true })
  } catch (error) {
    console.error(`flows: contract error: ${error.message}`)
    return 2
  }
  const startedAt = nowIso()
  const controller = new AbortController()
  const onSignal = () => controller.abort()
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  let results
  try {
    results = await runImpl({
      cases,
      target: args.target,
      proveRed: args.proveRed,
      outDir,
      signal: controller.signal,
      env
    })
  } catch (error) {
    console.error(`flows: ${error.message}`)
    return error instanceof UsageError ? 2 : 1
  } finally {
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
  }
  for (const r of results)
    if (!VERDICTS.includes(r.verdict)) {
      console.error(`flows: contract error: ${r.id} has verdict ${r.verdict}`)
      return 2
    }
  const denominator = loadDenominator(path.join(LAYER_DIR, 'denominator.json'))
  const coverage = computeCoverage(denominator, readManifests(), results)
  writeJsonAtomic(
    path.join(outDir, 'results.json'),
    results.map((r) => JSON.parse(redactText(JSON.stringify(r))))
  )
  writeJsonAtomic(path.join(outDir, 'coverage.json'), coverage)
  writeJsonAtomic(path.join(outDir, 'checklist.json'), checklistFor(outDir))
  writeJsonAtomic(path.join(outDir, 'provenance.json'), provenance(outDir, denominator))
  writeAtomic(
    path.join(outDir, 'report.md'),
    redactText(reportMarkdown({ results, args, coverage, startedAt, outDir }))
  )
  const count = (v) => results.filter((r) => r.verdict === v).length
  console.log(
    `flows: PASS ${count('PASS')} FAIL ${count('FAIL')} ENV ${count('ENV')} PENDING ${count('PENDING')} — ${path.join(outDir, 'report.md')}`
  )
  return exitCodeFor(results)
}

function provenance(outDir, denominator) {
  const patches = []
  const file = path.join(outDir, 'legacy', 'provenance.jsonl')
  if (existsSync(file))
    for (const line of readTextSync(file).split('\n').filter(Boolean))
      try {
        patches.push(JSON.parse(line))
      } catch {
        patches.push({ unreadable: line.slice(0, 80) })
      }
  return {
    generatedAt: nowIso(),
    denominatorRevision: denominator.revision,
    layerFiles: Object.fromEntries(
      ['registry.mjs', 'scenarios.mjs', 'scenario-meta.mjs', 'stand.mjs'].map((f) => [
        f,
        sha256File(path.join(LAYER_DIR, f))
      ])
    ),
    legacyTransportPatches: patches,
    note: 'tests/e2e-dev is run unchanged except for the transport patches listed here (see SOURCE.md).'
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`flows: ${error.stack ?? error.message}`)
      process.exit(1)
    }
  )
}
