/**
 * REG-192: a site redirect to its own hostname on a stale port or scheme lands on the address the
 * visitor used. Runs bar.test.mjs against the Postgres in TEST_DATABASE_URL (run.needs postgres)
 * and requires the stale-self test plus the redirect tests the case says must still pass.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

testDatabaseUrl()
const c = checks()
const r = nodeTest([
  'apps/tracy-web/test/bar.test.mjs',
  'apps/tracy-web/test/preview-ticket.test.mjs',
  'apps/tracy-web/test/frame-policy.test.mjs',
  'apps/tracy-host/test/public-origin.test.mjs',
  'packages/fleet/tracy-fleet-operation/test/frame-policy.test.mjs',
  'packages/fleet/tracy-fleet-operation/test/site-apache-conf.test.mjs',
  'packages/fleet/tracy-fleet-operation/test/emdash-quickstart.test.mjs'
])
c.tapClean('S2', r)
for (const name of [
  // Location http://stale.tracy.test:8080/ and https://stale.tracy.test/en/?x=1 → :51710.
  "a redirect to the site's OWN hostname on a stale port or scheme lands on the address the visitor used",
  'a redirect to a THIRD party is left exactly as the site wrote it',
  'a redirect naming the INTERNAL container is reframed onto the address the visitor used',
  'an EmDash redirect to /ru does not carry the container port onto the public address',
  'an EmDash redirect to http://emd-web-1:4321/ru does not carry the container port onto the public address',
  'a local CMS redirect that adds a port to its Docker hostname stays on the public site'
])
  c.passes('S3', r, name)
c.done()
