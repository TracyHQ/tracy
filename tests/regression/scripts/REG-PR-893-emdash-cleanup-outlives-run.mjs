/**
 * REG-PR-893-emdash-cleanup-outlives-run: the EmDash clean-up of a hidden language finishes after
 * the run's signal is aborted. S1/S2: the EmDash brief suite exits 0 with # fail 0, # pass equal to
 * # tests (at least 30), and the named test 'ok'.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

const s1 = nodeTest(['apps/tracy-web/test/brief-emdash.test.mjs'])
c.tapClean('S1', s1, { noSkip: false })
c.eq('S1: # pass equals # tests', s1.counts.pass, s1.counts.tests)
c.check('S1: # tests is at least 30', s1.counts.tests >= 30, s1.counts.tests)
c.passes(
  'S1',
  s1,
  'the clean-up outlives the run: the run’s signal is aborted as it ends, before its end waits for the clean-up'
)
c.done()
