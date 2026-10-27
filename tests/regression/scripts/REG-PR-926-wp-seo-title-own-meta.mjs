/**
 * REG-PR-926-wp-seo-title-own-meta: on WordPress the search title is written to the plugin's own
 * meta (or the running SEO plugin's keys), never by renaming the page. Runs the three commands of
 * the case: S1 the `seo:` normalize tests, S2 the where-map suite, S3 the filtered site-context
 * tests; each exits 0 with 0 failures, and the tests that carry each expectation pass.
 */
import { checks, nodeTest } from './lib.mjs'

const c = checks()

// S1
const s1 = nodeTest(['packages/tools/tracy-site-tools/test/normalize.test.mjs'], { pattern: '^seo:' })
c.tapClean('S1', s1, { noSkip: false })
for (const name of [
  'seo: a WordPress write of the plugin’s own search title or description reads the site before it is sent',
  // < 0.18.0, no SEO plugin: SEO_TITLE_UNSUPPORTED, the page title is the only title.
  'seo: a plugin older than the one that prints it never gets the key — the refusal says the page title is the only title',
  // 0.18.0+: sent, with a note when the title holds no site name.
  'seo: a plugin that prints it gets the key, and a title without the site name is pointed out',
  // Yoast / Rank Math keys.
  'seo: with Yoast or Rank Math running, their own keys are written instead, on any plugin version',
  // AIOSEO, SmartCrawl, SureRank, Jetpack seo-tools: SEO_PLUGIN_FIELDS.
  'seo: another SEO plugin keeps its fields where this door cannot write: said, not written',
  // A post write's seo on an older plugin: SEO_TITLE_UNSUPPORTED or SEO_FIELD_DROPPED.
  'seo: a post write’s seo is held to the same rules — never dropped by an older plugin without a word'
])
  c.passes('S1', s1, name)

// S2
const s2 = nodeTest(['apps/tracy-web/test/content-where.test.mjs'])
c.tapClean('S2', s2, { noSkip: false })
c.passes(
  'S2',
  s2,
  'where-maps: on WordPress only the search title is offered before the page title, and the page title says what else it renames'
)
c.passes('S2', s2, 'where-maps: every entry is complete, and every proof holds on the released bytes')

// S3
const s3 = nodeTest(['packages/tools/tracy-site-tools/test/site-context.test.mjs'], {
  pattern: 'WP_SEO_META|SEO/GEO mode'
})
c.tapClean('S3', s3, { noSkip: false })
c.passes(
  'S3',
  s3,
  'WP_SEO_META: the Claude Cowork plugin’s own search title and description keys, word for word'
)
c.passes('S3', s3, 'modes: the SEO/GEO mode, and only it, reads where the site keeps its head')
c.done()
