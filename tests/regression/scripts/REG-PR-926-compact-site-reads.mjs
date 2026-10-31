/**
 * REG-PR-926-compact-site-reads: site reads answer compact by default and full:true answers as
 * before. Runs S2 and S3 and checks the committed bundle carries the change (S4, RULE #3).
 */
import { checks, countLines, nodeTest } from './lib.mjs'

const c = checks()
const T = 'packages/tools/tracy-site-tools/test'
const LIB = 'packages/tools/tracy-site-tools/lib/index.js'
// The compact-read cases include searchable page rows, complete continuation and native/content ID recovery.
c.tapClean('S2', nodeTest([`${T}/read-compact.test.mjs`]), { pass: 23 })
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
c.tapClean('S6 product AgentLoop and scoped CMS tools', nodeTest([`${T}/page-search-harness.test.mjs`]), {
  pass: 12
})
c.tapClean('S7 in-flight inventory isolation', nodeTest([`${T}/page-read-flights.test.mjs`]), { pass: 4 })
c.tapClean(
  'S8 validated relay inventory and URL index',
  nodeTest([
    'apps/tracy-web/test/page-inventory.test.mjs',
    'apps/tracy-web/test/content-pages.test.mjs',
    'apps/tracy-web/test/content-versions.test.mjs'
  ]),
  { pass: 13 }
)
c.done()
