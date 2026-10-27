// Scores the P0 site-access fix deterministically (no model): the signer reproduces the shared
// vectors, both PHP verifiers give every vector its verdict, and the strict WordPress verifier signs
// nobody in from forged/cross-key/expired/replayed assertions while a real seat reaches the admin.
// One `ok -`/`not ok -` per condition; exits 0 only when all pass.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
let failed = 0
const line = (ok, msg) => {
  if (!ok) failed++
  console.log(`${ok ? 'ok' : 'not ok'} - ${msg}`)
}

/** A node:test file: ok when it runs and reports no failing subtests. */
function suite(rel, label) {
  const r = spawnSync('node', ['--test', rel], { cwd: root, encoding: 'utf8' })
  const out = `${r.stdout}${r.stderr}`
  const pass = /(?:ℹ|#) pass (\d+)/.exec(out)
  const fail = /(?:ℹ|#) fail (\d+)/.exec(out)
  line(
    r.status === 0 && fail && fail[1] === '0' && pass && Number(pass[1]) > 0,
    `${label}: ${pass ? pass[1] : '0'} pass, ${fail ? fail[1] : '?'} fail`
  )
}

suite(
  'packages/fleet/tracy-fleet-operation/test/access-signature.test.mjs',
  'Node signer reproduces the shared vectors'
)
suite(
  'packages/fleet/tracy-fleet-operation/test/access-signature-php.test.mjs',
  'both PHP verifiers verdict every vector'
)
suite(
  'packages/fleet/tracy-fleet-operation/test/wordpress-access.test.mjs',
  'WordPress verifier: forged/cross-key/replay refused, real seat admitted'
)

process.exit(failed === 0 ? 0 : 1)
