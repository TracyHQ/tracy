/**
 * REG-PR-926-compact-site-reads: site reads answer compact by default and full:true answers as
 * before. Runs S2 and S3 and checks the committed bundle carries the change (S4, RULE #3).
 */
import { checks, countLines, nodeTest } from './lib.mjs'

const c = checks()
const T = 'packages/tools/tracy-site-tools/test'
const LIB = 'packages/tools/tracy-site-tools/lib/index.js'
// The 14 tests of read-compact.test.mjs each carry one of S2's sentences.
c.tapClean('S2', nodeTest([`${T}/read-compact.test.mjs`]), { pass: 14 })
c.tapClean(
  'S3',
  nodeTest([
    `${T}/describe-compact.test.mjs`,
    `${T}/site-call.test.mjs`,
    `${T}/content-read-grammar.test.mjs`
  ])
)
c.eq("S4 grep -c 'blockKindsOmitted' lib/index.js", countLines(LIB, 'blockKindsOmitted'), 1)
c.eq("S4 grep -c 'var BODY_SHOWN_MAX = 4e3'", countLines(LIB, 'var BODY_SHOWN_MAX = 4e3'), 1)
c.eq("S4 grep -c 'function takeViewParams'", countLines(LIB, 'function takeViewParams'), 1)
c.done()
