#!/usr/bin/env node
// node tests/qa/layers/api/run.mjs [--area X] [--target local] [--prove-red] [--red-from DIR] [--out DIR]
// Exit: 0 every requested case PASS · 1 any FAIL · 2 invalid usage or contract · 3 ENV/PENDING only.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ContractError } from './io.mjs'
import { TARGETS, listCases, run } from './index.mjs'

export function parseArgs(argv) {
  const opts = { area: undefined, target: 'local', proveRed: false, redFrom: null, out: null, help: false }
  const seen = new Set()
  const once = (name) => {
    if (seen.has(name)) throw new ContractError(`${name} given more than once`)
    seen.add(name)
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    const value = () => {
      const v = argv[(i += 1)]
      if (v === undefined || v.startsWith('--') || v === '') throw new ContractError(`${a} needs a value`)
      return v
    }
    switch (a) {
      case '--area':
        once(a)
        opts.area = value()
        break
      case '--target':
        once(a)
        opts.target = value()
        if (!TARGETS.includes(opts.target))
          throw new ContractError(`--target must be one of ${TARGETS.join(', ')}`)
        break
      case '--out':
        once(a)
        opts.out = value()
        break
      case '--red-from':
        once(a)
        opts.redFrom = value()
        break
      case '--prove-red':
        once(a)
        opts.proveRed = true
        break
      case '--help':
      case '-h':
        opts.help = true
        break
      default:
        throw new ContractError(`unknown argument ${a}`)
    }
  }
  if (opts.proveRed && opts.redFrom)
    throw new ContractError('--prove-red and --red-from are mutually exclusive')
  return opts
}

export const exitCodeFor = (results) =>
  results.some((r) => r.verdict === 'FAIL') ? 1 : results.every((r) => r.verdict === 'PASS') ? 0 : 3

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(
      'usage: node tests/qa/layers/api/run.mjs [--area X] [--target local] [--prove-red] [--red-from DIR] [--out DIR]'
    )
    return 0
  }
  const repo = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = opts.out ?? join(repo, 'qa-results', `api-${stamp}`)
  const cases = await listCases({ area: opts.area })
  const results = await run({
    cases,
    target: opts.target,
    proveRed: opts.proveRed,
    redFrom: opts.redFrom,
    outDir
  })
  const counts = { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }
  for (const r of results) counts[r.verdict] += 1
  console.log(
    `api: ${results.length} cases · PASS ${counts.PASS} · FAIL ${counts.FAIL} · ENV ${counts.ENV} · PENDING ${counts.PENDING} · out ${outDir}`
  )
  if (!results.meta.cleanup.ok) console.error(`cleanup FAILED: ${results.meta.cleanup.detail}`)
  return exitCodeFor(results)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof ContractError ? `contract error: ${error.message}` : error)
      process.exit(2)
    }
  )
}
