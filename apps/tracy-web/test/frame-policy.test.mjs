import assert from 'node:assert/strict'
import { test } from 'node:test'
import { managedFramePolicy } from '../src/host/frame-policy.js'

const config = {
  origin: 'https://panel.example:39129',
  hosts: new Map([['local', { origin: 'http://host.example', hostSecret: 'fixture' }]])
}
const site = { host: 'local', label: 'cafe', updated_at: 'v1' }

test('managed frame reconciliation coalesces parallel reads, caches briefly and retries failures', async () => {
  let count = 0,
    time = 100,
    fail = false
  const ensure = managedFramePolicy({
    config,
    now: () => time,
    fetchImpl: async (_url, init) => {
      count++
      assert.equal(JSON.parse(init.body).publicOrigin, config.origin)
      assert.ok(init.headers['x-host-signature'])
      await new Promise((resolve) => setTimeout(resolve, 5))
      return Response.json(fail ? { code: 'BUSY' } : { state: 'updated' }, { status: fail ? 503 : 200 })
    }
  })
  assert.deepEqual(await Promise.all([ensure(site), ensure(site)]), [true, true])
  assert.equal(count, 1)
  assert.equal(await ensure(site), true)
  assert.equal(count, 1)
  time += 30001
  fail = true
  assert.equal(await ensure(site), false)
  assert.equal(await ensure(site), false)
  assert.equal(count, 3)
  fail = false
  assert.equal(await ensure(site), true)
  assert.equal(count, 4)
})

test('external and unknown hosts do not cause managed configuration writes', async () => {
  const ensure = managedFramePolicy({ config, fetchImpl: () => assert.fail('no host request') })
  assert.equal(await ensure({ host: 'external', label: 'cafe' }), true)
  assert.equal(await ensure({}), true)
})
