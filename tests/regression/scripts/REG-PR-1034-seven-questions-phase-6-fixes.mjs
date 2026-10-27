/**
 * REG-PR-1034-seven-questions-phase-6-fixes: the defects of the seven default questions measured on dev after #1024.
 * S1 runs the Joomla side (a ticked page the demo trim took off comes back, pages at any menu depth named by path,
 * logo height of the re-released j6 templates), S2 the WordPress side (navigation inside a template part and emptied
 * submenus, Polylang source locale, the 1.3.4 / 1.1.2 / 1.1.12 contract files, the editions builder), S3 the EmDash side
 * (no template hide rule applies; a page goes only when the customer unticks it). Each run must exit 0 with 0 failed and 0 skipped.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest([
  'apps/tracy-web/test/joomla-ticked-trimmed-page.test.mjs',
  'apps/tracy-web/test/joomla-nested-pages.test.mjs',
  'apps/tracy-web/test/brief-joomla.test.mjs',
  'apps/tracy-web/test/brief-brand-joomla.test.mjs'
])
c.tapClean('S1', s1)

// S2
const s2 = nodeTest([
  'apps/tracy-web/test/brief-wp-residue.test.mjs',
  'apps/tracy-web/test/brief-wordpress.test.mjs',
  'packages/cms/tracy-wordpress-quickstart/test/contract-entity-kinds.test.mjs',
  'packages/cms/tracy-seeder/test/wordpress-contract-door.test.mjs',
  'scripts/test/build-wordpress-editions.test.mjs'
])
c.tapClean('S2', s2)

// S3
const s3 = nodeTest([
  'apps/tracy-web/test/brief-emdash.test.mjs',
  'packages/cms/tracy-emdash-theme-base/tests/personalize-pages.test.mjs',
  'packages/cms/tracy-emdash-theme-business/tests/personalize-pages.test.mjs',
  'packages/cms/tracy-emdash-theme-saas/tests/personalize-pages.test.mjs'
])
c.tapClean('S3', s3)
c.done()
