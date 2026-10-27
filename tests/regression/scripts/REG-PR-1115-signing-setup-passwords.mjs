#!/usr/bin/env node
/**
 * REG-PR-1115: setup-signing-keychain.sh makes BOTH of its passwords under `set -euo pipefail`,
 * and puts the signing keychain first on the search list (S3).
 *
 * The first version made them with `tr < /dev/urandom | head -c 40`: head closes the pipe, tr dies
 * of SIGPIPE, pipefail turns that into exit 141, and `set -e` ended the script silently right after
 * the first password file (10/10/2026, on the iMac). This runs the script's own `random` definition
 * under the script's own shell options, twice, as the script does.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const script = readFileSync('packages/desktop/tracy-desktop/build/setup-signing-keychain.sh', 'utf8')
const options = /^set -euo pipefail$/m.exec(script)
const random = /^random\(\) \{.*\}$/m.exec(script)
const fail = (why) => {
  console.log(`S1: ${why}\nVERDICT: FAIL`)
  process.exit(1)
}
if (!options || !random) fail('the script no longer has `set -euo pipefail` and a one-line `random()`')

let out
try {
  out = execFileSync('bash', ['-c', `${options[0]}\n${random[0]}\na=$(random)\nb=$(random)\necho "$a $b"`], {
    encoding: 'utf8'
  }).trim()
} catch (error) {
  fail(`the two passwords stopped the shell (exit ${error.status})`)
}
const [a, b] = out.split(' ')
console.log(`S1: exit 0, passwords of ${a?.length} and ${b?.length} characters`)
const ok = /^[0-9a-f]{40}$/.test(a ?? '') && /^[0-9a-f]{40}$/.test(b ?? '') && a !== b
console.log(`S2: both 40 hex digits and different: ${ok}`)

// S3: the signing keychain goes FIRST on the search list. codesign without --keychain takes the
// first match, and the same certificate stays in the login keychain, locked over SSH
// (errSecInternalComponent, measured 10/10/2026); sign.sh older than #1112 signs that way.
const first =
  /^LIST=\("\$KEYCHAIN"\)$/m.test(script) &&
  /security list-keychains -d user -s "\$\{LIST\[@\]\}"/.test(script)
console.log(`S3: the list it sets starts with the signing keychain: ${first}`)
const pass = ok && first
console.log(`VERDICT: ${pass ? 'PASS' : 'FAIL'}`)
process.exit(pass ? 0 : 1)
