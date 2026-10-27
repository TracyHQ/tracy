/**
 * REG-PR-926-page-look-viewport-hidden: page.look reads a page at the viewport asked for, and an
 * element hidden there is said hidden, not "not found". Runs the case's command from
 * packages/tools/tracy-site-tools: exit 0 with 0 failed, 0 skipped, 0 cancelled, and the three
 * named tests passing (a skipped test would not be a pass, which `run.tests` alone cannot tell).
 */
import { join } from 'node:path'
import { ROOT, checks, nodeTest } from './lib.mjs'

const c = checks()

const s1 = nodeTest(['test/look-style.test.mjs'], { cwd: join(ROOT, 'packages/tools/tracy-site-tools') })
c.tapClean('S1', s1)
for (const name of [
  'viewportOf: a name, a device word or a size, each read at the viewport of its width class',
  '🔒 findTarget + describeTarget: an element hidden on this viewport is found by its exact words and said hidden, not "not found"',
  'BROWSER_SCRIPT (style): a tablet read at 768×1024'
])
  c.passes('S1', s1, name)
c.done()
