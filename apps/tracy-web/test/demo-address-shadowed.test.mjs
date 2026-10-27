// A demo is reported live only when its public name reaches this tracy-web (`ADDRESS_SHADOWED`).
// Measured 15/10/2026: business-joomla.tracy.ai answered Cloudflare 502 on every path — a hand-made
// DNS record and tunnel rule outranked the zone's wildcard — while the /ops reinstall said live.
// No Postgres needed: the pool, the host and the network are fakes that record what was asked.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { barRoutes } from '../src/bar/route.js'
import { readConfig } from '../src/config.js'
import { addressReachesTracy } from '../src/lib/address-probe.js'
import { ADDRESS_SHADOWED, advanceDemo, demoAddress, failureReason } from '../src/lib/demo-sites.js'
import { bornSiteAddress } from '../src/lib/site-address.js'

const env = {
  TRACY_ORIGIN: 'https://cowork.tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOST_NAME: 'demo',
  HOSTS: 'demo',
  HOST_demo_ORIGIN: 'http://demo-host',
  HOST_demo_DSH_ORIGIN: 'http://demo-host',
  HOST_demo_SECRET: 'h2',
  SEAT_demo_SECRET: 'k2'
}
const config = readConfig(env)
const fast = { tries: 2, gapMs: 0, waitMs: 1000 }

function fakePool() {
  const queries = []
  return { queries, query: async (sql, params) => (queries.push({ sql, params }), { rows: [], rowCount: 0 }) }
}

function fakeHost() {
  const calls = []
  return {
    calls,
    hostJob: async () => ({
      ok: true,
      body: { state: 'done', step: 'ready', port: 8084, output: '==> ready' }
    }),
    hostCall: async (_config, _host, path) => (calls.push(path), { ok: true, status: 202, body: {} })
  }
}

const provisionDone = (over = {}) => ({
  id: 'job-1',
  site_key: 'demo:tracy-business-j6',
  host: 'demo',
  kind: 'provision',
  state: 'running',
  step: 'install',
  detail: { by: 'a@b.test' },
  label: 'business-joomla',
  publish: 'draft',
  quickstart_tag: 'tracy-business/j6',
  demo: true,
  ...over
})

const marked = (pool) => pool.queries.some((q) => q.sql.includes("publish = 'published'"))

test('no echo from the public name: the demo is not live, the job fails ADDRESS_SHADOWED', async () => {
  const pool = fakePool()
  const asked = []
  const fetchImpl = async (url) => (asked.push(String(url)), new Response('Bad gateway', { status: 502 }))
  const view = await advanceDemo({
    pool,
    config,
    host: fakeHost(),
    fetchImpl,
    job: provisionDone(),
    addressProbe: fast
  })
  assert.equal(view.error, ADDRESS_SHADOWED)
  assert.equal(view.live, false)
  assert.equal(view.state, 'failed')
  assert.match(view.reason, /does not reach Tracy/)
  assert.match(view.reason, /https:\/\/business-joomla\.tracy\.test\//)
  assert.equal(marked(pool), false, 'markDemoLive must not run')
  assert.deepEqual(asked, Array(2).fill('https://business-joomla.tracy.test/__tracy/address-probe'))
  // The failure is written down, so /ops reads the same reason after a reload.
  const note = pool.queries.findLast((q) => q.sql.startsWith('update job'))
  assert.equal(note.params[1], 'failed')
  assert.equal(note.params[2], 'address')
  assert.equal(failureReason(JSON.parse(note.params[3])), view.reason)
})

test('a local stand is probed at its own scheme and port, the address every other site gets', async () => {
  // Measured 21/10/2026 bootstrapping demos on a stand at http://cowork.tracy.test:51710 whose host
  // answers go-live: the probe went to https://…tracy.test/ (no port), which nothing answers, and
  // every demo failed ADDRESS_SHADOWED.
  const local = readConfig({ ...env, TRACY_ORIGIN: 'http://cowork.tracy.test:51710' })
  const asked = []
  const fetchImpl = async (url, init) => (
    asked.push(String(url)), new Response(init.headers['x-tracy-address-probe'])
  )
  const view = await advanceDemo({
    pool: fakePool(),
    config: local,
    host: fakeHost(),
    fetchImpl,
    job: provisionDone(),
    addressProbe: fast
  })
  assert.equal(view.live, true)
  assert.deepEqual(asked, ['http://business-joomla.tracy.test:51710/__tracy/address-probe'])
})

test('demoAddress: a bare config is the born site address; a target keeps its own scheme and port', () => {
  assert.equal(demoAddress('ja-kinetic', config), 'https://ja-kinetic.tracy.test/')
  const local = { origin: 'http://cowork.tracy.test:51710', siteDomain: 'tracy.test' }
  assert.equal(demoAddress('ja-kinetic', local), bornSiteAddress('ja-kinetic', local))
  assert.equal(demoAddress('ja-kinetic', local), 'http://ja-kinetic.tracy.test:51710/')
  const target = { name: 'tracy', zone: 'tracy.test', scheme: 'http', port: ':8080' }
  assert.equal(demoAddress('ja-kinetic', target), 'http://ja-kinetic.tracy.test:8080/')
  assert.equal(
    demoAddress('ja-kinetic', { name: 'joomlart', zone: 'demo.joomlart.com' }),
    'https://ja-kinetic.demo.joomlart.com/'
  )
})

test('the public name echoes the token: the demo is marked live', async () => {
  const pool = fakePool()
  const fetchImpl = async (_url, init) => new Response(init.headers['x-tracy-address-probe'])
  const view = await advanceDemo({
    pool,
    config,
    host: fakeHost(),
    fetchImpl,
    job: provisionDone(),
    addressProbe: fast
  })
  assert.equal(view.error, undefined)
  assert.equal(view.live, true)
  assert.equal(marked(pool), true)
})

test('an echo that is not the token (a site answering 200) is not enough', async () => {
  const fetchImpl = async () => new Response('<html>a page</html>')
  assert.equal(await addressReachesTracy('https://x.tracy.test/', { fetchImpl, ...fast }), false)
})

test('a failed ADDRESS_SHADOWED job is not re-read from the host as done', async () => {
  const host = fakeHost()
  let asked = false
  host.hostJob = async () => ((asked = true), { ok: true, body: { state: 'done' } })
  const job = provisionDone({
    state: 'failed',
    detail: { tracyRefusal: { code: ADDRESS_SHADOWED, message: 'm' } }
  })
  const view = await advanceDemo({ pool: fakePool(), config, host, fetchImpl: fetch, job })
  assert.equal(asked, false)
  assert.equal(view.state, 'failed')
  assert.equal(view.reason, 'm')
})

test('bar route echoes the probe for a demo reached by its label', async () => {
  const demo = { site_key: 'demo:x', label: 'business-joomla', host: 'demo', demo: true, publish: 'draft' }
  const app = barRoutes({
    pool: fakePool(),
    config,
    sites: { byLabel: async () => demo },
    seats: {},
    fetchImpl: async () => new Response('upstream', { status: 500 })
  })
  const res = await app.fetch(
    new Request('https://business-joomla.tracy.test/__tracy/address-probe', {
      headers: { host: 'business-joomla.tracy.test', 'x-tracy-address-probe': 'tok123' }
    })
  )
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'tok123')
  assert.equal(res.headers.get('cache-control'), 'no-store')
})
