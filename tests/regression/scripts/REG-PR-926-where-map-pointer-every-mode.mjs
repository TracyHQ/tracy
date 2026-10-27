/**
 * REG-PR-926-where-map-pointer-every-mode: every mode on a site whose quickstart release has a
 * where-map ends its "Where visible text lives" line with the where-map pointer, and a site whose
 * release has none gets no pointer (PR #1071: the relay answers no `where` there). Runs S2 and S3 of
 * site-context.test.mjs and checks the committed bundle carries the constant and its row (S4, RULE #3).
 *
 * S3 is judged by the eleven pointer rows by name, not by a total: PR #1071 also added ten other
 * 'where-map:' tests (which release a folder names), so the total moved from 11 to 26.
 */
import { checks, countLines, nodeTest } from './lib.mjs'

const c = checks()
const FILE = 'packages/tools/tracy-site-tools/test/site-context.test.mjs'
c.tapClean('S2', nodeTest([FILE]))
const s3 = nodeTest([FILE], { pattern: 'where-map:|size:' })
c.tapClean('S3', s3)
c.check("S3 'ok' lines >= 16", s3.passed.length >= 16, s3.passed.length)
c.eq("S3 'not ok' lines", s3.failed.length, 0)
// The first four rows' releases have a where-map and get the pointer; the other seven get none.
for (const row of [
  'wm-jsealed',
  'wm-wprecord',
  'wm-wpbound',
  'wm-emdash',
  'wm-joomla',
  'wm-jbase',
  'wm-jderived',
  'wm-wp',
  'wm-wpbase',
  'wm-emdash-open',
  'wm-emdash-base'
])
  c.passes(
    'S3',
    s3,
    `where-map: every mode is pointed at the quickstart's where-map, only on a site whose release has one: ${row}`,
    1,
    true
  )
c.eq("S3 'size:' tests", s3.passed.filter((t) => t.startsWith('size:')).length, 5)
c.eq(
  "S4 grep -c 'WHERE_MAP_POINTER' lib/index.js",
  countLines('packages/tools/tracy-site-tools/lib/index.js', 'WHERE_MAP_POINTER'),
  2
)
c.done()
