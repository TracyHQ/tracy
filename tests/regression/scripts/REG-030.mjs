/**
 * REG-030: a Joomla quickstart provision ends its pairing on the inspect answer a bound site really
 * gives (no `bound` field). The suite runs the real joomla-bootstrap.php — local php, else one
 * `php:8.3-cli-alpine` container (scripts/test-support/php.mjs) — so a machine with neither cannot
 * run the case; that is said apart from a failure.
 */
import { checks, cannotRun, nodeTest, run } from './lib.mjs'

const hasPhp = run('php', ['-v']).status === 0
const hasDocker = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeoutS: 30 }).status === 0
if (!hasPhp && !hasDocker) cannotRun('neither php nor a running docker daemon on this machine')

const c = checks()
const r = nodeTest(['packages/fleet/tracy-fleet-operation/test/joomla-contract-bind.test.mjs'])
// "0 failures and 0 skipped": the bootstrap really ran.
c.tapClean('S1', r)
for (const name of [
  // A first pairing and a re-run complete on {ok:true, contract} with or without revision, no `bound`.
  'REGRESSION #824: a first pairing is confirmed by the inspect a bound site really answers',
  'REGRESSION #824: a re-run is confirmed by the same answer',
  // The read-back refuses another/empty/missing contract, ok not exactly true, bound:false,
  // construction:true, non-boolean flags; and any answer outside 2xx or no answer.
  'the read-back takes `ok`, the exact contract, and no flag that says otherwise',
  'an inspect that does not confirm stops the pairing after the bind',
  'a door answer counts only over a 2xx, whatever its body says',
  // A bind still needs bound:true beside the contract, or the exact "already bound" conflict.
  'a bind or an inspect that does not confirm THIS contract fails',
  'a re-run told the site is ALREADY bound to this contract is accepted only once inspect agrees',
  '"already bound" is read only as the whole supported answer'
])
  c.passes('S2', r, name)
c.done()
