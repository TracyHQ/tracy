import { checks, nodeTest, run, cannotRun } from './lib.mjs'

if (!process.env.TEST_DATABASE_URL) cannotRun('set TEST_DATABASE_URL to a scratch PostgreSQL database')
const c = checks()
const suite = nodeTest(['apps/tracy-web/test/ops-quickstarts.test.mjs'])
c.tapClean('Publish coverage fixture', suite, { pass: 47 })
for (const name of [
  'Publish of a card served by a lower contract still publishes, with a warning',
  'Publish of a card bound exactly to a contract publishes without a warning',
  'Publish of a release whose contract declares no slot roles is held by Content coverage (ADR 0038)',
  'Publish refuses missing Content coverage without changing GitHub',
  'Publish refuses stale Content coverage without changing GitHub'
])
  c.passes('Publish', suite, name, 1, true)
const shifted = run(process.execPath, [
  'scripts/run-clock-shift.mjs',
  'apps/tracy-web/test/ops-quickstarts.test.mjs'
])
c.eq('Clock-shift suite exit code', shifted.status, 0)
c.done()
