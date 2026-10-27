/**
 * REG-PR-1024-seven-questions-phase-4-5: phases 4+5 of the seven default questions. S1 runs the brand step (dark logo
 * pair, name fallback, logo height) on WordPress and Joomla, S2 the Joomla brief writers (bare-number lines, home
 * title, unticked blog) and the template profiles, S3 the tracy-host display-locale door, S4 the WordPress theme's
 * shared brand logo. Each run must exit 0 with 0 failed and 0 skipped.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest([
  'apps/tracy-web/test/brief-brand.test.mjs',
  'apps/tracy-web/test/brief-brand-joomla.test.mjs'
])
c.tapClean('S1', s1)

// S2
const s2 = nodeTest([
  'apps/tracy-web/test/brief-joomla.test.mjs',
  'apps/tracy-web/test/joomla-home-title.test.mjs',
  'apps/tracy-web/test/joomla-unticked-blog.test.mjs',
  'apps/tracy-web/test/template-profiles.test.mjs'
])
c.tapClean('S2', s2)

// S3
const s3 = nodeTest(['apps/tracy-host/test/display-locale.test.mjs'])
c.tapClean('S3', s3)

// S4
const s4 = nodeTest(['packages/cms/tracy-wordpress-theme/test/brand-logo.test.mjs'], {
  extra: ['--test-timeout=120000']
})
c.tapClean('S4', s4)
c.done()
