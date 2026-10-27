/**
 * REG-PR-1134-ds-emdash-fixes: the EmDash findings 9 and 11 of the Design system walkthrough
 * (11/10/2026, `tasks/evidence/ds-walkthrough-2026-10-11/`, fixes in `tasks/evidence/ds-fix-em-2026-10-11/`):
 *   S1 Tracy Business 1.7.11 shipped eight classes pinning values the design-system slot owns, and its zip
 *      unpacked seven hours in the future, so the first `site.rebuild` of every new site read the whole
 *      template as just saved and named all eight: Tracy Base reads the slot there and the fleet dates the
 *      unpacked source at the unpack (Tracy Business's own class fix waits for its next version: develop
 *      released 1.7.13 first).
 *   S2 slot-pins looks for a `&` class string in the spelling Astro writes (`&amp;`), and a restarted site
 *      is warmed before the restart answers.
 *   S3 the first presses after a restart waited 5–8 s on the door's one page load: the door waits at most
 *      SEEN_WAIT_MS. Tracy SaaS's reader ships as 1.4.12 (develop's 1.4.10, #1013, came without it; 1.4.11 was never served, TCH #1196), so
 *      older sites are told to update.
 * No model, no stand, no database.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const c = checks()
const theme = (t) => `packages/cms/tracy-emdash-theme-${t}`
// Tracy Business's own fix is NOT in this release (11/10/2026 evening): another line released 1.7.13
// first, and develop's theme wins; the eight classes are fixed again on top of it as the next version
const base = nodeTest(['tests/ds-slot-no-shipped-pins.test.mjs'], { cwd: theme('base') })
c.tapClean('S1 base theme test', base)
c.passes('S1 base', base, 'the shadcn components read the slot’s radius')
const fleet = nodeTest(['test/emdash-quickstart.test.mjs'], { cwd: 'packages/fleet/tracy-fleet-operation' })
c.tapClean('S1 fleet quickstart tests', fleet)
c.passes('S1 fleet', fleet, 'the unpacked source is dated at the unpack, never in the future')

const build = 'packages/site/tracy-site-build-emdash'
const host = nodeTest(['test/slot-pins.test.mjs', 'test/stages.test.mjs'], { cwd: build })
c.tapClean('S2 site-build-emdash tests', host)
c.passes('S2', host, 'the read: a class string with `&` that the last build holds escaped is not new')
c.passes('S2', host, 'site.restart warms the restarted site')
const bundle = readFileSync(join(ROOT, build, 'lib/index.js'), 'utf8')
c.check(
  'S4 the committed host bundle looks up the escaped spelling',
  bundle.includes('replaceAll("&","&amp;")')
)
c.check('S4 the committed host bundle warms a restarted site', /WARM_MS/.test(bundle))

const door = nodeTest(['test/design-system-door.test.mjs'], { cwd: 'apps/tracy-web' })
c.tapClean('S3 design-system door tests', door)
c.passes('S3', door, 'apply: a page load slower than the door’s wait answers seen null')
c.passes('S3', door, 'apply: a page load within the wait is said')

const where = JSON.parse(
  readFileSync(join(ROOT, 'apps/tracy-web/src/sites/where/emdash-tracy-business.json'), 'utf8')
)
c.check('S4 the where-map names 1.7.13', where.versions.includes('1.7.13'))
c.check(
  'S4 1.7.12 is a verified release',
  where.verifiedReleases.some((r) => r.version === '1.7.12')
)
const profiles = JSON.parse(
  readFileSync(join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8')
).releases
c.check('S4 profile row Business 1.7.13', Boolean(profiles['tracy-business/emdash-0.x']?.['1.7.13']))
// 1.4.10 is develop's release (#1013, no reader); the reader's release row comes with its publish
c.check('S4 profile row SaaS 1.4.10', Boolean(profiles['tracy-saas/emdash-0.x']?.['1.4.10']))
const saasContract = JSON.parse(
  readFileSync(join(ROOT, 'packages/design/tracy-ds-slot/templates/emdash-tracy-saas.json'), 'utf8')
)
c.eq('S3 SaaS contract minVersion', saasContract.minVersion['tracy-saas/emdash-0.x'], '1.4.12')

c.done()
