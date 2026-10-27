/**
 * REG-PR-1427-real-pictures-on-demo-sites: the restaurant's own photographs go into the demo pictures'
 * places when a Website Opportunities site is built.
 * S1: the picture planner's pure tests over the labelled fixture (no database).
 * S2: the engine, cutter, vision/draw doubles, reader and hand-off door tests over a scratch database.
 * S3: every run exits 0 with 0 failures and 0 skipped tests.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()

const PLANNER = [
  'packages/wo/website-opportunities/test/domain-pictures-slot-map.test.mjs',
  'packages/wo/website-opportunities/test/domain-pictures-labels.test.mjs',
  'packages/wo/website-opportunities/test/domain-pictures-placement.test.mjs',
  'packages/wo/website-opportunities/test/domain-pictures-precision.test.mjs'
]
const WEB = [
  'apps/tracy-web/test/website-opportunities-demo-actions.test.mjs',
  'apps/tracy-web/test/website-opportunities-demo-runner.test.mjs',
  'apps/tracy-web/test/wo-quickstart-retry-window.test.mjs',
  'apps/tracy-web/test/wo-quality-runs.test.mjs',
  'apps/tracy-web/test/design-system-site-readers.test.mjs',
  'apps/tracy-web/test/website-opportunities-site-content.test.mjs',
  'apps/tracy-web/test/brief-quickstart-first.test.mjs',
  'apps/tracy-web/test/brief-build.test.mjs',
  'apps/tracy-web/test/wo-picture-settings.test.mjs',
  'apps/tracy-web/test/wo-quality-revisions.test.mjs',
  'apps/tracy-web/test/wo-quality-editorial.test.mjs',
  'apps/tracy-web/test/brief-real-pictures.test.mjs',
  'apps/tracy-web/test/picture-cut.test.mjs',
  'apps/tracy-web/test/picture-vision.test.mjs',
  'apps/tracy-web/test/picture-draw.test.mjs',
  'apps/tracy-web/test/website-opportunities-site-pictures.test.mjs',
  'apps/tracy-web/test/website-opportunities-handoff-pictures.test.mjs',
  'apps/tracy-web/test/website-opportunities-doors.test.mjs'
]

c.tapClean('S1: planner', nodeTest(PLANNER))

const url = testDatabaseUrl()
c.tapClean('S2: web', nodeTest(WEB, { env: { ...process.env, TEST_DATABASE_URL: url } }))

c.tapClean(
  'S11: explicit template picker client',
  nodeTest(
    [
      'packages/site/tracy-website-opportunities/test/client-api.test.mjs',
      'packages/site/tracy-website-opportunities/test/client-row-actions.test.mjs'
    ],
    { extra: ['--import', 'tsx'] }
  )
)
c.tapClean(
  'S11: template picker browser',
  nodeTest(['packages/design/tracy-design-inspiration/test/e2e/template-picker.test.mjs'])
)

c.done()
