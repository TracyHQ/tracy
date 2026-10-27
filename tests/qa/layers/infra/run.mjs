#!/usr/bin/env node
// Standalone entry: node tests/qa/layers/infra/run.mjs [--area X] [--target local] [--prove-red] [--out DIR]
// Exit: 0 every requested case PASS · 1 any FAIL · 2 invalid usage/contract · 3 ENV/PENDING only.
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { readBoundedJsonSync, MAX_LAYER_FILE_BYTES } from '../../lib/bounded-reader.mjs'
import { assertCommitted } from '../../lib/denominator.mjs'
import { coverage, summaryLines } from './lib/coverage.mjs'
import { LAYER_DIR, REPO } from './lib/harness.mjs'
import { counts, exitCodeFor, writeOutputs } from './lib/report.mjs'

const usage = 'usage: run.mjs [--area <area>] [--target local|dev|prod] [--prove-red] [--out <dir>]'

export function parseArgs(argv) {
  const opts = { area: undefined, target: 'local', proveRed: false, out: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const value = () => {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value`)
      i += 1
      return next
    }
    if (arg === '--area') opts.area = value()
    else if (arg === '--target') opts.target = value()
    else if (arg === '--out') opts.out = value()
    else if (arg === '--prove-red') opts.proveRed = true
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!['local', 'dev', 'prod'].includes(opts.target))
    throw new Error(`--target must be local, dev or prod (got ${opts.target})`)
  return opts
}

export async function main(argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (error) {
    console.error(`${error.message}\n${usage}`)
    return 2
  }
  const { listCases, run, ContractError } = await import('./index.mjs')
  let cases
  try {
    cases = await listCases({ area: opts.area })
  } catch (error) {
    console.error(`${error instanceof ContractError ? 'contract error' : 'error'}: ${error.message}`)
    return 2
  }
  // The denominator is checked BEFORE anything runs: a malformed or drifted denominator, or a case
  // naming an item it does not list, is a contract error, never a report that looks complete.
  let denominator
  try {
    denominator = assertCommitted(
      readBoundedJsonSync(path.join(LAYER_DIR, 'denominator.json'), { maxBytes: MAX_LAYER_FILE_BYTES }),
      'infra'
    )
    if (!Array.isArray(denominator.items) || denominator.items.length === 0)
      throw new Error('denominator.json lists no items')
    if (!Array.isArray(denominator.unresolved)) throw new Error('denominator.json has no unresolved list')
    const known = new Set(denominator.items.map((i) => i.id))
    if (known.size !== denominator.items.length) throw new Error('denominator.json has duplicate item ids')
    const unknown = [...new Set(cases.flatMap((c) => c.itemIds))].filter((id) => !known.has(id)).sort()
    if (unknown.length > 0)
      throw new Error(`cases name items missing from the denominator: ${unknown.join(', ')}`)
    const { extract } = await import('./lib/extract.mjs')
    const fresh = extract()
    if (fresh.revision !== denominator.revision)
      throw new Error(
        `denominator.json (${denominator.revision}) no longer matches the sources (${fresh.revision}); regenerate it with: ${fresh.command}`
      )
  } catch (error) {
    console.error(`contract error: denominator: ${error.message}`)
    return 2
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = path.resolve(opts.out ?? path.join(REPO, 'qa-results', `infra-${stamp}`))
  let results
  try {
    results = await run({ cases, target: opts.target, proveRed: opts.proveRed, outDir })
  } catch (error) {
    console.error(`${error instanceof ContractError ? 'contract error' : 'error'}: ${error.message}`)
    return 2
  }
  let extra
  try {
    extra = summaryLines(denominator, coverage(denominator, cases, results))
  } catch (error) {
    console.error(`contract error: coverage could not be computed: ${error.message}`)
    return 2
  }
  try {
    writeOutputs(outDir, results, { target: opts.target, proveRed: opts.proveRed, extra })
  } catch (error) {
    console.error(`error: cannot write the results to ${outDir}: ${error.message}`)
    return 2
  }
  const c = counts(results)
  console.log(
    `infra: PASS ${c.PASS} · FAIL ${c.FAIL} · ENV ${c.ENV} · PENDING ${c.PENDING} · RED-proven ${c.redProven} · cases ${results.length} → ${outDir}`
  )
  return exitCodeFor(results)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
