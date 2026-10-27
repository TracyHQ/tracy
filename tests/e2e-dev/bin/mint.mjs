#!/usr/bin/env node
// Mint a `tracy_sess` token for one of a run's accounts and write it to a file, chmod 600:
//
//   node tests/e2e-dev/bin/mint.mjs <email> [<file>]
//
// `<email>` must be a run account (`e2e-<runId>-<role>@example.test`; `devExec.mint` refuses any
// other). `<file>` defaults to `$Q/cookie-<role>.txt` and must lie under the results root
// (`~/TCH-local/e2e-dev/`), so a token never lands inside the repository. The token is NEVER
// printed: stdout stays empty, stderr says where it went.

import { chmodSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { mintCookie } from '../lib/dev.mjs'
import { ENV } from '../lib/env.mjs'

const [email, fileArg] = process.argv.slice(2)
if (!email) {
  process.stderr.write('usage: mint.mjs <email> [<file>]\n')
  process.exit(2)
}
const role = /^e2e-[a-z0-9]+-([a-z]+)@/.exec(email)?.[1]
const q = process.env.Q
const file = fileArg ? resolve(fileArg) : q && role ? resolve(q, `cookie-${role}.txt`) : null
if (!file) {
  process.stderr.write('mint.mjs: no <file> given and $Q is not set\n')
  process.exit(2)
}
const inside = relative(resolve(ENV.resultsRoot), file)
if (inside.startsWith('..') || inside === '' || resolve(ENV.resultsRoot, inside) !== file) {
  process.stderr.write(`mint.mjs: ${file} is outside ${ENV.resultsRoot}; refusing to write a token there\n`)
  process.exit(2)
}
try {
  const token = await mintCookie(email)
  writeFileSync(file, token, { mode: 0o600 })
  chmodSync(file, 0o600)
  process.stderr.write(`mint.mjs: wrote a session for ${email} to ${file}\n`)
} catch (error) {
  process.stderr.write(`mint.mjs: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
