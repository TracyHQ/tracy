/**
 * REG-PR-1022-brand-pages-language-joomla-emdash: the logo, favicon and pages answers change Joomla and EmDash sites
 * too. S1 runs the Joomla brand writer (T3 template styles, T4 site profiles through template.siteSettings) over a fake
 * Apply door, S2 the EmDash brand step over the real template tool, S3 the Tracy Business tool's brand-only run, page
 * hiding and tone. Each run must exit 0 with 0 failed and 0 skipped.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest(['apps/tracy-web/test/brief-brand-joomla.test.mjs'])
c.tapClean('S1', s1)

// S2
const s2 = nodeTest(['apps/tracy-web/test/brief-emdash-brand.test.mjs'], { extra: ['--test-timeout=120000'] })
c.tapClean('S2', s2)

// S3
const s3 = nodeTest(
  ['tests/personalize-brand.test.mjs', 'tests/personalize-pages.test.mjs', 'tests/personalize-tone.test.mjs'],
  { cwd: 'packages/cms/tracy-emdash-theme-business', extra: ['--test-timeout=120000'] }
)
c.tapClean('S3', s3)
c.done()
