/**
 * REG-PR-1399-tracy-address-301-own-domain: the Tracy address of a published site with a connected own
 * domain sends visitors and crawlers to that domain with a 301, and keeps what only works there (seat
 * holders, the CMS back office and sign-in, Tracy's own marked reads, the Design system preview frame).
 * Before the fix the Tracy address answered 200 with its own canonical, so the site was indexable twice.
 * Runs the router tests against the test Postgres (TEST_DATABASE_URL); 0 failed, 0 skipped.
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

const c = checks()
const db = testDatabaseUrl()

const r = nodeTest(['apps/tracy-web/test/bar.test.mjs'], { env: { ...process.env, TEST_DATABASE_URL: db } })
c.tapClean('S1', r)
// S1: a visitor is sent to the own domain; S2: what stays on the Tracy address; S3: what is unchanged.
for (const [step, name] of [
  ['S1', 'Tracy address, published site with a connected own domain: a visitor GET and HEAD are a 301'],
  ['S1', 'connectedOwnDomain: one name for every request'],
  ['S1', 'Tracy address: the own domain is looked up once per site per 60 s'],
  ['S2', 'Tracy address with a connected own domain: a POST is the site’s own to answer'],
  ['S2', 'Tracy address with a connected own domain: a seat holder keeps working here'],
  ['S2', 'Tracy address with a connected own domain: the back office, the CMS sign-in and its API stay here'],
  ['S2', 'Tracy address with a connected own domain: a request that carries its own credentials stays here'],
  [
    'S2',
    'Tracy address with a connected own domain: /__tracy/* and the Design system preview frame are unchanged'
  ],
  ['S2', 'Design system preview on a Tracy address: every answer is noindex'],
  ['S2', 'isOwnRead / markOwnReads'],
  ['S2', 'staysOnTracyAddress'],
  [
    'S3',
    'Tracy address: a draft, a site without an own domain, and a domain still being connected are served here as before'
  ]
])
  c.passes(step, r, name)
c.done()
