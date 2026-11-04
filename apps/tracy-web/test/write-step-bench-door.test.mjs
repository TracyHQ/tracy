// The write step bench's real site door (ADR 0044) against a fake fetch: it calls the customer's doors as the bench
// account, with a signed session cookie, and reads their answers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sessionFromCookieHeader } from '../src/lib/session.js'
import { httpSiteDoor } from '../src/write-step/bench-site-door.js'

const SECRET = 'test-secret-test-secret-test-secret-0000'

function door(answers) {
  const seen = []
  const fetchImpl = async (url, init) => {
    seen.push({ url, init })
    const [status, body] = answers.shift()
    return { status, text: async () => JSON.stringify(body) }
  }
  return {
    seen,
    door: httpSiteDoor({
      baseUrl: 'http://app.test',
      secret: SECRET,
      email: 'Bench@Example.test',
      platform: 'joomla',
      templateOf: async (quickstart) => (quickstart === 'no-card/j6' ? null : 'demo-gym'),
      fetchImpl,
      sleep: async () => {}
    })
  }
}

test('create posts the customer request as the bench account and wants a 202 with a job id', async () => {
  const { seen, door: d } = door([[202, { siteKey: 'write-bench-abc.sites.example', jobId: 'j1' }]])
  assert.deepEqual(await d.create({ label: 'write-bench-abc', quickstart: 'demo-gym/j6' }), {
    ok: true,
    siteKey: 'write-bench-abc.sites.example',
    jobId: 'j1'
  })
  assert.equal(seen[0].url, 'http://app.test/api/sites')
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    label: 'write-bench-abc',
    platform: 'joomla',
    design: 'demo-gym',
    quickstart: 'demo-gym/j6'
  })
  assert.equal(await sessionFromCookieHeader(seen[0].init.headers.cookie, SECRET), 'bench@example.test')
})

test('a quickstart no template card installs is refused before anything is asked of the server', async () => {
  const { seen, door: d } = door([])
  const made = await d.create({ label: 'write-bench-abc', quickstart: 'no-card/j6' })
  assert.equal(made.ok, false)
  assert.equal(made.code, 'NO_TEMPLATE_CARD')
  assert.equal(seen.length, 0)
})

test('a refused create keeps the code', async () => {
  const { door: d } = door([[400, { code: 'UNSUPPORTED_QUICKSTART' }]])
  const made = await d.create({ label: 'write-bench-abc', quickstart: 'x' })
  assert.equal(made.ok, false)
  assert.equal(made.code, 'UNSUPPORTED_QUICKSTART')
})

test('job states map to running, done and failed', async () => {
  const { door: d } = door([
    [200, { state: 'running', step: 'install' }],
    [200, { state: 'done' }],
    [200, { state: 'failed', step: 'install', error: 'disk full' }]
  ])
  assert.deepEqual(await d.job('k', 'j'), { state: 'running', step: 'install', reason: undefined })
  assert.equal((await d.job('k', 'j')).state, 'done')
  const failed = await d.job('k', 'j')
  assert.equal(failed.state, 'failed')
  assert.equal(failed.reason, 'disk full')
})

test('inspect reads the contract through the Apply door', async () => {
  const { seen, door: d } = door([[200, { ok: true, contract: 'demo-gym/j6/1.2.3', revision: 'r1' }]])
  assert.deepEqual(await d.inspect('k.sites.example'), { ok: true, contract: 'demo-gym/j6/1.2.3' })
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    action: 'content.contract',
    params: { operation: 'inspect' }
  })
})

test('remove waits through a pending delete until the site is removed', async () => {
  const { door: d } = door([
    [202, { code: 'DELETE_PENDING' }],
    [200, { removed: true }]
  ])
  assert.deepEqual(await d.remove('k.sites.example'), { ok: true })
  const refused = door([[403, { code: 'NOT_SITE_OWNER' }]])
  assert.equal((await refused.door.remove('k.sites.example')).ok, false)
})

test('apply hands back the plugin answer, per-slot errors included, and shapes a door refusal as a refusal', async () => {
  const refusal = {
    ok: false,
    error: 'contract_failed',
    errors: [{ code: 'A', field: { slotKey: 'module-1.1' } }]
  }
  const { seen, door: d } = door([
    [200, refusal],
    [403, { code: 'TOOLSET_NOT_GRANTED', role: 'viewer' }],
    [400, { error: { code: 'CONTENT_BAD_QUERY', message: 'bad query' } }],
    [200, { ok: true, contract: 'demo-gym/j6/1.2.3' }]
  ])
  const call = { siteKey: 'a.sites.example', action: 'content.contract', params: { operation: 'apply' } }
  assert.deepEqual(await d.apply(call), refusal)
  assert.equal(seen[0].url, 'http://app.test/api/sites/a.sites.example/apply')
  assert.deepEqual(JSON.parse(seen[0].init.body), { action: call.action, params: call.params })
  const noSeat = await d.apply(call)
  assert.deepEqual([noSeat.ok, noSeat.code, noSeat.status], [false, 'TOOLSET_NOT_GRANTED', 403])
  const nested = await d.apply(call)
  assert.deepEqual([nested.ok, nested.code, nested.message], [false, 'CONTENT_BAD_QUERY', 'bad query'])
  assert.equal((await d.apply(call)).contract, 'demo-gym/j6/1.2.3')
})
