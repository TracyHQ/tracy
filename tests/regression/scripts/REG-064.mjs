/**
 * REG-064: a shell check under pipefail whose reader quits early no longer turns a found match into
 * "not found". Runs the case's five commands (a)–(e) one by one and checks each exact count; the
 * values each test asserts ({already:true}, "ensure answers ok", the refused volume, the kept image)
 * are the tests' own assertions.
 */
import { checks, cannotRun, nodeTest, run } from './lib.mjs'

for (const tool of ['bash', 'git', 'python3'])
  if (run(tool, ['--version']).status !== 0) cannotRun(`${tool} is not on PATH`)

const c = checks()
const P = 'packages/fleet/tracy-fleet-operation/test'
const commands = [
  ['(a)', `${P}/site-backup.test.mjs`, 'runs on past its database line', 1],
  ['(b)', `${P}/webroot-git.test.mjs`, 'thousands of backup points', 1],
  ['(c)', `${P}/db-volume.test.mjs`, 'however long the answer', 1],
  ['(d)', `${P}/prune-old-images.test.mjs`, 'however long the in-use list', 1],
  ['(e)', 'scripts/test/pipefail-early-exit.test.mjs', undefined, 3]
]
for (const [label, file, pattern, pass] of commands) {
  const r = nodeTest([file], { pattern })
  // (a) may skip its MariaDB cases without docker, but the name pattern leaves only one test.
  c.tapClean(label, r, { pass })
}
c.done()
