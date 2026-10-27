/**
 * REG-PR-1264-capture-shot-deadline: a listing shot keeps its own deadline on a slow demo host.
 * S1 the shooter and capture route suite: a timed-out shot is aborted and names its phase, every
 * shot reports its timings, every wait fits what is left of the deadline (none when nothing is),
 * and an abort closes the browser context.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()
const s1 = nodeTest(['apps/tracy-host/test/capture.test.mjs'])
c.tapClean('S1', s1)
for (const name of [
  'runCapture: a timed-out shot is cancelled, and its error names the phase it was in',
  'runCapture: a shot that worked says how long each phase took',
  'makeShoot: every wait fits what is left of the deadline, and a slow page is still shot',
  'makeShoot: no time left after the load means no waits at all, and still a picture',
  'makeShoot: an abort closes the shot’s context, so it stops using the machine',
  'makeShoot: a shot past the caller ceiling is retaken at one CSS pixel from the SAME loaded page'
])
  c.passes('S1', s1, name)
c.done()
