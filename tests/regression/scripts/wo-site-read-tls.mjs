/**
 * WO site read through a Chrome TLS tier (WO_SITE_READ_TLS): against local servers only, a homepage that refuses
 * Node with a 403 challenge is read through `impit` and the guarded proxy (done, read_via impit); with the switch
 * off it stays blocked; the proxy refuses a name that resolves to a private address; a parked domain is
 * failed/parked; a reCAPTCHA contact form is not blocked. Needs TEST_DATABASE_URL (run.needs postgres) and the
 * `impit` dependency installed in apps/tracy-web.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { ROOT, cannotRun, checks, nodeTest, testDatabaseUrl } from './lib.mjs'

testDatabaseUrl()
try {
  createRequire(join(ROOT, 'apps/tracy-web/package.json')).resolve('impit')
} catch {
  cannotRun('impit is not installed in apps/tracy-web (pnpm install there)')
}

const c = checks()
const app = nodeTest(['test/website-opportunities-site-checks.test.mjs'], {
  cwd: 'apps/tracy-web',
  pattern: 'local servers|a contact form with reCAPTCHA|a parked domain is failed'
})
c.tapClean('S1', app)
for (const name of [
  'local servers, switch on: a 403 challenge homepage is read through impit (done, read_via impit)',
  'local servers, switch off: the same 403 challenge homepage stays blocked and impit is never used',
  'local servers, switch on: the proxy refuses a name that resolves to a private address',
  'a parked domain is failed/parked even when PageSpeed answered',
  'a contact form with reCAPTCHA or hCaptcha is the site, not a challenge'
])
  c.passes('S1', app, name)

const proxy = nodeTest(['test/guarded-connect-proxy.test.mjs'], {
  cwd: 'packages/wo/website-opportunities',
  pattern: 'a name answering ANY blocked address|DNS rebinding|CONNECT to blocked IP literals'
})
c.tapClean('S2', proxy)
for (const name of [
  'a name answering ANY blocked address is refused whole, with no connection made',
  'DNS rebinding: one lookup, and the socket goes to that first answer',
  'CONNECT to blocked IP literals is refused at the door, in every spelling'
])
  c.passes('S2', proxy, name)
c.done()
