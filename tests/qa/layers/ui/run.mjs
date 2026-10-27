#!/usr/bin/env node
// Standalone entry of the ui layer.
//
//   node tests/qa/layers/ui/run.mjs [--area X] [--target local|dev|prod] [--prove-red]
//        [--scope pilot|all] [--contact-sheets] [--dry] [--case ID]... [--out DIR]
//
// Writes DIR/results.json, DIR/report.md (plus coverage.json, probes.json, owned.json, red/, measure/,
// sheets/ and manual-review.json when they apply).
// Exit: 0 every requested case PASS · 1 any FAIL · 2 invalid usage or contract · 3 only ENV/PENDING left.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UnsafePathError, confineOutput, writeJson } from './artifacts.mjs'
import { AREAS, ContractError, TARGETS, artifactRoot, dryRun, listCasesFor, runCases } from './engine.mjs'

const VALUE_FLAGS = new Set(['--area', '--target', '--out', '--scope', '--case', '--concurrency'])
const BOOLEAN_FLAGS = new Set(['--prove-red', '--contact-sheets', '--dry'])
const REPEATABLE = new Set(['--case'])

export function parseArgs(argv) {
  const out = {
    target: 'local',
    proveRed: false,
    contactSheets: false,
    dry: false,
    scope: 'pilot',
    area: null,
    outDir: null,
    caseIds: [],
    concurrency: null
  }
  const seen = new Set()
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (!VALUE_FLAGS.has(flag) && !BOOLEAN_FLAGS.has(flag)) throw new UsageError(`unknown argument: ${flag}`)
    if (seen.has(flag) && !REPEATABLE.has(flag)) throw new UsageError(`${flag} given more than once`)
    seen.add(flag)
    if (BOOLEAN_FLAGS.has(flag)) {
      if (flag === '--prove-red') out.proveRed = true
      else if (flag === '--dry') out.dry = true
      else out.contactSheets = true
      continue
    }
    const value = argv[++i]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} needs a value`)
    if (flag === '--area') out.area = value
    else if (flag === '--target') out.target = value
    else if (flag === '--out') out.outDir = value
    else if (flag === '--scope') out.scope = value
    else if (flag === '--case') out.caseIds.push(value)
    else if (flag === '--concurrency') {
      out.concurrency = /^[0-9]+$/.test(value) ? Number.parseInt(value, 10) : Number.NaN
      if (!Number.isInteger(out.concurrency) || out.concurrency < 1 || out.concurrency > 8)
        throw new UsageError('--concurrency must be 1..8')
    }
  }
  if (!TARGETS.includes(out.target))
    throw new UsageError(`unknown target "${out.target}"; known: ${TARGETS.join(', ')}`)
  if (!['pilot', 'all'].includes(out.scope))
    throw new UsageError(`unknown scope "${out.scope}"; known: pilot, all`)
  if (out.area !== null && !AREAS.includes(out.area))
    throw new UsageError(`unknown area "${out.area}"; known: ${AREAS.join(', ')}`)
  return out
}

export class UsageError extends Error {}

export function exitCodeFor(results) {
  if (results.some((r) => r.verdict === 'FAIL')) return 1
  if (results.length > 0 && results.every((r) => r.verdict === 'PASS')) return 0
  return 3
}

const stamp = () =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')

export async function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    console.error(`usage error: ${error.message}`)
    return 2
  }
  let cases
  try {
    cases = await listCasesFor({ area: args.area })
    if (args.caseIds.length) {
      const known = new Set(cases.map((c) => c.id))
      const unknown = args.caseIds.filter((id) => !known.has(id))
      if (unknown.length) throw new ContractError(`unknown case id(s): ${unknown.join(', ')}`)
      cases = cases.filter((c) => args.caseIds.includes(c.id))
    }
    if (cases.length === 0) throw new ContractError('the selection is empty; zero cases is not a pass')
  } catch (error) {
    console.error(`contract error: ${error.message}`)
    return 2
  }
  let outDir
  try {
    outDir = confineOutput(args.outDir ?? path.join(artifactRoot(), `ui-${stamp()}`), process.cwd(), '--out')
  } catch (error) {
    if (!(error instanceof UnsafePathError)) throw error
    console.error(`usage error: ${error.message}`)
    return 2
  }
  if (args.dry) {
    const doc = await dryRun({ cases, outDir })
    console.log(
      `ui dry run: ${doc.selected} case(s), ${doc.edits.length} mutant edit(s) applied to a scratch copy; ${outDir}`
    )
    return 0
  }
  const { results, notes, counts, redProven } = await runCases({
    cases,
    target: args.target,
    proveRed: args.proveRed,
    outDir,
    options: {
      scope: args.scope,
      contactSheets: args.contactSheets,
      concurrency: args.concurrency ?? undefined
    }
  })
  await writeJson(path.join(outDir, 'exit.json'), {
    code: exitCodeFor(results),
    counts,
    redProven,
    selected: results.length,
    args: {
      area: args.area,
      target: args.target,
      scope: args.scope,
      proveRed: args.proveRed,
      contactSheets: args.contactSheets
    }
  })
  console.log(
    `ui: PASS ${counts.PASS} FAIL ${counts.FAIL} ENV ${counts.ENV} PENDING ${counts.PENDING} of ${results.length}; RED-proven ${redProven}; report ${path.join(outDir, 'report.md')}`
  )
  for (const note of notes) console.log(`note: ${note}`)
  return exitCodeFor(results)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(2)
    }
  )
}
