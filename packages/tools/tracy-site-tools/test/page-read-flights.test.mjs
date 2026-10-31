/** Concurrent page reads share transport, never mutable answers or settled state. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createPageReadFlights } from '../src/host/page-read-flights.mjs'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('overlapping reads share one transport but independent answer objects; settled reads refresh', async () => {
  const share = createPageReadFlights(),
    gate = deferred()
  let calls = 0
  const read = async () => {
    calls++
    await gate.promise
    return { pages: [{ id: 'opaque-a' }] }
  }
  const a = share('same-scope', read),
    b = share('same-scope', read)
  await Promise.resolve()
  assert.equal(calls, 1)
  gate.resolve()
  const [one, two] = await Promise.all([a, b])
  one.pages[0].id = 'changed-by-one-consumer'
  assert.equal(two.pages[0].id, 'opaque-a')
  await share('same-scope', read)
  assert.equal(calls, 2)
})

test('different scopes and unshareable calls run independently', async () => {
  const share = createPageReadFlights(),
    gate = deferred()
  let calls = 0
  const read = async () => {
    calls++
    await gate.promise
    return calls
  }
  const work = ['site-a', 'site-b', 'actor-b', 'next-turn', 'after-write', null, null].map((key) =>
    share(key, read)
  )
  await Promise.resolve()
  assert.equal(calls, 7)
  gate.resolve()
  await Promise.all(work)
})

test('a rejected flight is removed and subsequent requests can recover', async () => {
  const share = createPageReadFlights(),
    gate = deferred()
  let calls = 0
  const read = async () => {
    calls++
    return gate.promise
  }
  const work = Promise.allSettled([share('scope', read), share('scope', read)])
  gate.reject(new Error('reader unavailable'))
  const results = await work
  assert.equal(calls, 1)
  assert(results.every((result) => result.status === 'rejected'))
  assert.equal(await share('scope', async () => 'recovered'), 'recovered')
})

test('excess distinct pending requests bypass sharing and do not evict active work', async () => {
  const share = createPageReadFlights(),
    gate = deferred()
  let calls = 0
  const read = async () => {
    calls++
    await gate.promise
    return 'ok'
  }
  const work = Array.from({ length: 128 }, (_, i) => share(String(i), read))
  work.push(share('overflow', read), share('overflow', read), share('0', read))
  await Promise.resolve()
  assert.equal(calls, 130)
  gate.resolve()
  await Promise.all(work)
})
