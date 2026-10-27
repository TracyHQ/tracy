#!/usr/bin/env node
// Standalone entry of the mail layer:
//   node tests/qa/layers/mail/run.mjs [--area X] [--target local] [--prove-red] [--out DIR] [--receipt FILE] [--ledger FILE] [--case ID]
// Exit: 0 every requested case PASS · 1 any FAIL · 2 invalid usage or contract · 3 ENV/PENDING only.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT, UsageError, parseFlags, utcStamp, writeAtomic } from './common.mjs'
import { AREAS, exitCodeFor, listCases, run } from './index.mjs'

export async function main(argv) {
  const flags = parseFlags(argv, {
    area: 'value',
    target: 'value',
    'prove-red': 'bool',
    out: 'value',
    receipt: 'value',
    ledger: 'value',
    case: 'value',
    'no-capture': 'bool',
    'no-suites': 'bool'
  })
  if (flags.area && !AREAS.includes(flags.area))
    throw new UsageError(`unknown area "${flags.area}"; one of ${AREAS.join(', ')}`)
  let cases = await listCases({ area: flags.area })
  if (flags.case) {
    cases = cases.filter((c) => c.id === flags.case)
    if (cases.length === 0) throw new UsageError(`no case ${flags.case}`)
  }
  const outDir = path.resolve(flags.out ?? path.join(REPO_ROOT, 'qa-results', `mail-${utcStamp()}`))
  const results = await run({
    cases,
    target: flags.target ?? 'local',
    proveRed: Boolean(flags['prove-red']),
    outDir,
    receipt: flags.receipt ? path.resolve(flags.receipt) : null,
    ...(flags.ledger ? { ledger: path.resolve(flags.ledger) } : {}),
    capture: !flags['no-capture'],
    skipSuites: Boolean(flags['no-suites'])
  })
  const code = exitCodeFor(results)
  const count = (v) => results.filter((r) => r.verdict === v).length
  console.log(
    `mail: PASS ${count('PASS')} FAIL ${count('FAIL')} ENV ${count('ENV')} PENDING ${count('PENDING')} of ${results.length} — ${path.join(outDir, 'report.md')}`
  )
  writeAtomic(path.join(outDir, 'exit-code.txt'), `${code}\n`)
  return code
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      if (error instanceof UsageError) {
        console.error(`usage error: ${error.message}`)
        process.exit(2)
      }
      console.error(error)
      process.exit(2)
    }
  )
}
