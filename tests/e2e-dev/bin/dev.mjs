#!/usr/bin/env node
// The dev host, for a regression case run under `tests/regression/run.mjs --profile dev`. Only the
// fixed operations of `lib/dev.mjs` are reachable; there is no shell:
//
//   node tests/e2e-dev/bin/dev.mjs ps [<label>]               # containers, JSON lines
//   node tests/e2e-dev/bin/dev.mjs images                     # image of each stack container
//   node tests/e2e-dev/bin/dev.mjs logs <container> <since>   # a stack container's log (redacted)
//   node tests/e2e-dev/bin/dev.mjs psql "<select>"            # read-only; must name this run
//   node tests/e2e-dev/bin/dev.mjs dsh-grep <text> <file>     # count of lines holding <text>
//   node tests/e2e-dev/bin/dev.mjs dsh-file <file>            # exit 0 when the file exists
//   node tests/e2e-dev/bin/dev.mjs em <label> "<select>"      # EmDash SQLite of a run's site
//
// The run id comes from `$E2E_RUN_ID` (the case's env file sets it). Output is redacted.

import { devExec } from '../lib/dev.mjs'
import { redactText } from '../lib/redact.mjs'

const [op, ...args] = process.argv.slice(2)
const runId = process.env.E2E_RUN_ID ?? ''
const out = (value) =>
  process.stdout.write(`${redactText(typeof value === 'string' ? value : JSON.stringify(value))}\n`)

const OPS = {
  async ps() {
    for (const row of await devExec.ps(args[0] ? { label: args[0] } : {})) out(row)
  },
  async images() {
    out(await devExec.images())
  },
  async logs() {
    out(await devExec.logs(args[0], args[1]))
  },
  async psql() {
    for (const row of await devExec.psqlAboutRun(runId, args[0] ?? '')) out(row.join('|'))
  },
  async 'dsh-grep'() {
    const { exists, count } = await devExec.dshGrepCount(args[0] ?? '', args[1] ?? '')
    if (!exists) {
      process.stderr.write(`no such file: ${args[1]}\n`)
      process.exitCode = 2
    }
    out(String(count))
  },
  async 'dsh-file'() {
    const exists = await devExec.dshFileExists(args[0] ?? '')
    out(exists ? 'exists' : 'missing')
    process.exitCode = exists ? 0 : 1
  },
  async em() {
    out(await devExec.emSelect(runId, args[0] ?? '', args[1] ?? ''))
  }
}

if (!op || !Object.hasOwn(OPS, op)) {
  process.stderr.write(`usage: dev.mjs <${Object.keys(OPS).join('|')}> …\n`)
  process.exit(2)
}
try {
  await OPS[op]()
} catch (error) {
  process.stderr.write(`dev.mjs ${op}: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
