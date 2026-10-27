import assert from 'node:assert/strict'
import { test } from 'node:test'
import { verifyShardRequest } from '../src/lib/shard-channel.js'
import { masterLink } from '../src/shard/master-link.js'

const shard = { name: 's2', masterOrigin: 'https://cowork.tracy.ai', secret: 'ab'.repeat(32) }

/** A master that checks every signature and answers by path. */
function fakeMaster(answer) {
  const calls = []
  const fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    const verified = verifyShardRequest({
      secret: shard.secret,
      headers: init.headers,
      method: init.method,
      path: u.pathname,
      body: init.body ?? ''
    })
    assert.deepEqual(verified, { ok: true }, `unsigned call to ${u.pathname}`)
    const body = JSON.parse(init.body)
    calls.push({ path: u.pathname, body })
    return answer(u.pathname, body)
  }
  return { calls, fetchImpl }
}

test('reserveLabel: held, taken with its reason, or unavailable — never guessed', async () => {
  const master = fakeMaster((path, body) =>
    body.label === 'taken'
      ? Response.json({ code: 'LABEL_TAKEN', reason: 'IN_USE_ON_S3' }, { status: 409 })
      : body.label === 'odd'
        ? Response.json({ code: 'SOMETHING_ELSE' }, { status: 409 })
        : Response.json({ label: body.label, expiresAt: '2026-10-16T10:30:00Z' })
  )
  const link = masterLink({ shard, fetchImpl: master.fetchImpl })
  assert.deepEqual(await link.reserveLabel({ label: 'shop', siteKey: 'shop.tracy.ai' }), { reserved: true })
  assert.deepEqual(master.calls[0], {
    path: '/api/shards/s2/labels/reserve',
    body: { label: 'shop', siteKey: 'shop.tracy.ai' }
  })
  assert.deepEqual(await link.reserveLabel({ label: 'taken' }), { taken: true, reason: 'IN_USE_ON_S3' })
  assert.deepEqual(master.calls[1].body, { label: 'taken' })
  assert.deepEqual(await link.reserveLabel({ label: 'odd' }), { unavailable: true, status: 409 })
  const down = masterLink({
    shard,
    fetchImpl: async () => {
      throw new TypeError('fetch failed')
    }
  })
  assert.deepEqual(await down.reserveLabel({ label: 'shop' }), { unavailable: true, status: 0 })
})

test('events and custom hostnames go to their own paths under this shard’s name, with the contract’s ops only', async () => {
  const master = fakeMaster(() => Response.json({ ok: true }))
  const link = masterLink({ shard, fetchImpl: master.fetchImpl })
  await link.sendEvent({
    eventId: 'a'.repeat(32),
    kind: 'site.created',
    at: '2026-10-16T08:00:00.000Z',
    data: { siteKey: 'shop.tracy.ai' }
  })
  await link.customHostname({ siteKey: 'shop.tracy.ai', domain: 'www.example.com', op: 'add' })
  assert.deepEqual(
    master.calls.map((c) => c.path),
    ['/api/shards/s2/events', '/api/shards/s2/custom-hostname']
  )
  assert.deepEqual(master.calls[1].body, { siteKey: 'shop.tracy.ai', domain: 'www.example.com', op: 'add' })
  for (const op of ['create', 'get', 'find'])
    assert.throws(
      () => link.customHostname({ siteKey: 'shop.tracy.ai', domain: 'www.example.com', op }),
      /add, status or remove/
    )
  assert.equal(master.calls.length, 2, 'a refused op is never sent')
})
