/**
 * REG-PR-1100-p9-emdash-business-1-7-6: the hero padding the design-system slot sets ships under a
 * number of its own. Tracy Business EmDash 1.7.5 was published on ja-products on 10/10/2026 (10:09Z,
 * zip 0fc612da…) from a tree whose hero call to action still pins `!px-7 !py-[15px]`; a released
 * number names one source (a fleet host never rebuilds an image whose tag it already has), so the
 * change is 1.7.6, registered where Tracy reads a version before the release is cut.
 *
 * No network, no Docker: the stamps, the two registration tables, and the two test files that hold
 * them (`content-where.test.mjs`, the theme's `ds-slot-hero.test.mjs`).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, nodeTest, ROOT } from './lib.mjs'

const THEME = 'packages/cms/tracy-emdash-theme-business'
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const text = (p) => readFileSync(join(ROOT, p), 'utf8')
const c = checks()

c.eq('package.json version', json(`${THEME}/package.json`).version, '1.7.6')
c.eq('template.config.json version', json(`${THEME}/template.config.json`).version, '1.7.6')
c.check(
  'Dockerfile label io.tracy.template.version="1.7.6"',
  text(`${THEME}/Dockerfile`).includes('io.tracy.template.version="1.7.6"')
)
c.eq(
  'generated inventory names 1.7.6',
  json(`${THEME}/docs/generated/inventory.json`).template?.version,
  '1.7.6'
)

const where = json('apps/tracy-web/src/sites/where/emdash-tracy-business.json')
c.check(
  'where-map names 1.7.5 and 1.7.6',
  where.versions.includes('1.7.5') && where.versions.includes('1.7.6'),
  where.versions
)
const rec = (where.verifiedReleases ?? []).find((r) => r.version === '1.7.5')
c.eq(
  'where-map records the released 1.7.5 zip',
  rec?.zipSha256,
  '0fc612da0e30c6a65aac5af322fbabc434b90f0f33814ead0d210c0b696b1017'
)

const row = json('apps/tracy-web/src/lib/template-profiles.json').releases['tracy-business/emdash-0.x']?.[
  '1.7.6'
]
c.check(
  'template-profiles row tracy-business/emdash-0.x 1.7.6: pair, brandReady, faviconReady, note "As 1.7.5;"',
  row?.logos === 'pair' &&
    row?.brandReady === true &&
    row?.faviconReady === true &&
    (row?.note ?? '').startsWith('As 1.7.5;'),
  row
)

c.check(
  'Home.astro hero call to action reads the slot padding and centres its label under a worn system',
  text(`${THEME}/src/views/Home.astro`).includes(
    'class="btn-primary !px-[var(--ds-btn-pad-x,28px)] !py-[var(--ds-btn-pad-y,15px)] !text-[15px] [[data-ds-worn]_&]:inline-flex [[data-ds-worn]_&]:items-center"'
  )
)

c.tapClean('content-where.test.mjs', nodeTest(['apps/tracy-web/test/content-where.test.mjs']))
c.tapClean(
  'the theme ds-slot-hero.test.mjs',
  nodeTest(['tests/ds-slot-hero.test.mjs'], { cwd: join(ROOT, THEME) })
)
c.done()
