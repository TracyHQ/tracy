/**
 * REG-PR-926-head-pointer-every-mode: every Tracy mode is pointed at content.read {describe:true}'s
 * where.seo for a page's title or meta description. Runs S2 and S3 of site-context.test.mjs and
 * checks the committed bundle carries the line (S4, RULE #3).
 */
import { checks, countLines, nodeTest } from './lib.mjs'

const c = checks()
const FILE = 'packages/tools/tracy-site-tools/test/site-context.test.mjs'
const s2 = nodeTest([FILE], { pattern: 'head pointer' })
c.tapClean('S2', s2, { pass: 3 })
for (const platform of ['joomla', 'wordpress', 'emdash'])
  c.passes(
    'S2',
    s2,
    `head pointer: every mode of a quickstart site is sent to \`where.seo\` for a page's title and description, on one line: ${platform}`,
    1
  )
const s3 = nodeTest([FILE], { pattern: 'size: the rules|modes: the SEO/GEO mode' })
c.tapClean('S3', s3)
c.passes('S3', s3, 'size: the rules a site carries stay within the budget')
c.passes('S3', s3, 'modes: the SEO/GEO mode, and only it, reads where the site keeps its head')
c.eq(
  'S4 grep -c the every-mode line in lib/index.js',
  countLines(
    'packages/tools/tracy-site-tools/lib/index.js',
    "A page's head (its title in search results and the browser tab, its meta description)"
  ),
  1
)
c.done()
