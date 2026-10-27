/**
 * Sidebar native surface vs. an unloading host registry.
 * Runs the fork's own vitest over tests/native-host-teardown.spec.ts, which drives a REAL cordis
 * fiber and the fork's REAL `SidebarRightTabRegistry`: after the host fiber unloads, a Files relist
 * and a new type registration must report nothing (no red "native relist files error: cannot create
 * effect on inactive context" strip), while a live registry that refuses is still reported.
 */
import { checks } from './lib.mjs'
import { vitestRun } from './vitest.mjs'

const c = checks()
const r = vitestRun('vendor/tracy/dsh-better-sidebar', [
  'tests/native-host-teardown.spec.ts',
  'tests/no-diagnostic-strip.spec.ts'
])
c.eq('exit code', r.status, 0)
c.eq('passed', r.counts.passed, 5)
c.eq('failed', r.counts.failed, 0)
for (const title of [
  'a Files relist after the host unloaded is dropped silently',
  'a new type registered after the host unloaded is dropped silently',
  'a live registry that refuses is still reported',
  'never pins anything to the page'
])
  c.check(`passed: ${title}`, r.passed.includes(title))
c.done()
