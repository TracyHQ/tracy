import assert from 'node:assert/strict'
import { test } from 'node:test'
import { managedFramePolicy, warmFramePolicies } from '../src/host/frame-policy.js'

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

test('a serving tracy-web brings every EmDash site’s policy up to date at start, one at a time (#205)', async () => {
  const asked = []
  const pool = {
    query: async (sql) => {
      assert.match(sql, /platform = 'emdash'/)
      return {
        rows: [
          { label: 'a', host: 'h1' },
          { label: 'b', host: 'h1' },
          { label: 'c', host: 'h2' }
        ]
      }
    }
  }
  let inFlight = 0
  let most = 0
  const ensure = async (site) => {
    inFlight += 1
    most = Math.max(most, inFlight)
    asked.push(site.label)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight -= 1
    if (site.label === 'b') throw new Error('host down')
    return site.label !== 'c'
  }
  const lines = []
  const result = await warmFramePolicies({ pool, ensure, log: { info: (l) => lines.push(l) }, pauseMs: 0 })
  assert.deepEqual(asked, ['a', 'b', 'c'])
  assert.equal(most, 1, 'one site at a time: never several containers recreated at once')
  assert.deepEqual(result, { checked: 3, ready: 1 })
  assert.match(lines[0], /1 of 3 ready/)
})
