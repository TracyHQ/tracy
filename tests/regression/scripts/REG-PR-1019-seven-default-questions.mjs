/**
 * REG-PR-1019-seven-default-questions: every template on every CMS is asked the same seven questions, fitted to the
 * template before the snapshot is hashed (logo tiles, the template's own pages, one language); the brand pictures are
 * checked on the server, written by one brand step and undone by one apply id; unticked pages are hidden by id.
 * S1 runs the server-side units, S2 the sheet units, S3 the sheet end to end in a real browser over the wizard fixture.
 * Each run must exit 0 with 0 failed and 0 skipped.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest([
  'apps/tracy-web/test/build-questions.test.mjs',
  'apps/tracy-web/test/fit-questions.test.mjs',
  'apps/tracy-web/test/template-profiles.test.mjs',
  'apps/tracy-web/test/site-pages-schema.test.mjs',
  'apps/tracy-web/test/brief-brand-images.test.mjs',
  'apps/tracy-web/test/brief-brand.test.mjs',
  'apps/tracy-web/test/brief-picked-pages.test.mjs'
])
c.tapClean('S1', s1)

// S2
const s2 = nodeTest([
  'packages/site/tracy-add-site/test/site-brief.test.mjs',
  'packages/site/tracy-add-site/test/brand-picture.test.mjs'
])
c.tapClean('S2', s2)

// S3
const s3 = nodeTest(['packages/site/tracy-add-site/test/e2e/create-brief-sheet.test.mjs'], {
  extra: ['--test-timeout=120000']
})
c.tapClean('S3', s3)
c.done()
