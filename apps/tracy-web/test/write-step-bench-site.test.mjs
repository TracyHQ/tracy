// The write step bench's site creator (ADR 0044), tested at its entry point with a fake site door and a fake run
// store: it creates a trial site by the customer's path, waits for it, proves the contract the kit names, keeps one
// bench site and deletes only its own. No model is involved.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBenchSite } from '../src/write-step/bench-site-creator.js'
import { fakeClock, fakeDoor, memoryStore, NEWER_SPEC, SPEC } from './_write-step-bench.mjs'

async function go(over = {}) {
  const door = over.door ?? fakeDoor()
  const store = over.store ?? memoryStore()
  const clock = fakeClock()
  const result = await createBenchSite({
    spec: over.spec ?? SPEC,
    door,
    store,
    now: clock.now,
    sleep: clock.sleep,
    pollMs: 1000,
    timeoutMs: 60_000,
    label: over.label ?? 'write-bench-aaa111'
  })
  return { result, door, store, clock }
}

const kinds = (door, kind) => door.calls.filter(([k]) => k === kind)

test('success: creates the kit quickstart, waits for the job, proves the contract and records the creation time', async () => {
  const { result, door, store } = await go()
  assert.equal(result.ok, true)
  assert.equal(result.siteKey, 'write-bench-aaa111.sites.example')
  assert.equal(result.contract, SPEC.contract)
  assert.equal(result.createMs, 1000) // one running poll, one sleep, then done
  assert.deepEqual(kinds(door, 'create'), [
    ['create', { label: 'write-bench-aaa111', quickstart: 'demo-gym/j6' }]
  ])
  assert.equal(store.rows[0].status, 'ready')
  assert.equal(store.rows[0].createMs, 1000)
  assert.equal(store.rows[0].contract, SPEC.contract)
})

test('the contract comes from the kit: a kit naming another version is created and checked against that version', async () => {
  const ok = await go({
    spec: NEWER_SPEC,
    door: fakeDoor({ inspect: { ok: true, contract: NEWER_SPEC.contract } })
  })
  assert.equal(ok.result.ok, true)
  assert.equal(ok.result.contract, 'demo-gym/j6/9.9.9')
  // The default fake site answers the first kit's contract: against the newer kit that is a refusal naming both.
  const wrong = await go({ spec: NEWER_SPEC })
  assert.equal(wrong.result.ok, false)
  assert.equal(wrong.result.code, 'CONTRACT_MISMATCH')
  assert.match(wrong.result.reason, /demo-gym\/j6\/9\.9\.9/)
  assert.match(wrong.result.reason, /demo-gym\/j6\/1\.2\.3/)
})

test('job failure: stops, keeps the host reason, and removes only the failed bench site', async () => {
  const door = fakeDoor({
    jobs: [{ state: 'running' }, { state: 'failed', step: 'install', reason: 'disk full' }]
  })
  const { result, store } = await go({ door })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'SITE_JOB_FAILED')
  assert.match(result.reason, /disk full/)
  assert.equal(kinds(door, 'inspect').length, 0)
  assert.equal(store.rows[0].status, 'removed') // the failed site is gone ...
  assert.match(store.rows[0].reason, /disk full/) // ... and the reason stays on its record
  assert.equal(store.rows[0].code, 'SITE_JOB_FAILED')
})

test('a job that never finishes times out with the last step named', async () => {
  const door = fakeDoor({ jobs: [{ state: 'running', step: 'install' }] })
  const { result } = await go({ door })
  assert.equal(result.code, 'SITE_JOB_TIMEOUT')
  assert.match(result.reason, /install/)
})

test('a refused create keeps the door reason and leaves no site to delete', async () => {
  const door = fakeDoor({
    created: { ok: false, code: 'UNSUPPORTED_QUICKSTART', reason: 'not a quickstart' }
  })
  const { result, store } = await go({ door })
  assert.equal(result.code, 'UNSUPPORTED_QUICKSTART')
  assert.equal(kinds(door, 'remove').length, 0)
  assert.equal(store.rows[0].status, 'failed')
})

test('the account has no seat on its new site: the refusal says so', async () => {
  const door = fakeDoor({
    inspect: { ok: false, code: 'SEAT_NOT_AUTHORIZED', message: 'SEAT_NOT_AUTHORIZED' }
  })
  const { result } = await go({ door })
  assert.equal(result.code, 'SEAT_NOT_AUTHORIZED')
})

test('the previous bench site is removed only after the new one succeeded', async () => {
  const previous = {
    id: 'run-0',
    status: 'ready',
    label: 'write-bench-old001',
    siteKey: 'write-bench-old001.sites.example'
  }
  // A failing new run leaves the previous site alone.
  const failing = await go({
    door: fakeDoor({ jobs: [{ state: 'failed', reason: 'boom' }] }),
    store: memoryStore([{ ...previous }])
  })
  assert.equal(failing.result.ok, false)
  assert.deepEqual(
    kinds(failing.door, 'remove').map(([, key]) => key),
    ['write-bench-aaa111.sites.example']
  )
  assert.equal(failing.store.rows[0].status, 'ready')
  // A succeeding one removes it, and only it.
  const winning = await go({ store: memoryStore([{ ...previous }]) })
  assert.equal(winning.result.ok, true)
  assert.deepEqual(winning.result.removed, ['write-bench-old001.sites.example'])
  assert.deepEqual(
    kinds(winning.door, 'remove').map(([, key]) => key),
    ['write-bench-old001.sites.example']
  )
  assert.equal(winning.store.rows[0].status, 'removed')
  assert.equal(winning.store.rows.filter((r) => r.status === 'ready').length, 1)
})

test('never deletes a site that is not the bench own: a record whose address does not match its label is refused', async () => {
  const tampered = {
    id: 'run-0',
    status: 'ready',
    label: 'write-bench-old001',
    siteKey: 'customer-shop.sites.example'
  }
  const notBench = {
    id: 'run-00',
    status: 'ready',
    label: 'customer-shop',
    siteKey: 'customer-shop.sites.example'
  }
  const { result, door, store } = await go({ store: memoryStore([tampered, notBench]) })
  assert.equal(result.ok, true)
  assert.equal(kinds(door, 'remove').length, 0)
  assert.equal(result.removed.length, 0)
  assert.equal(result.notRemoved.length, 2)
  assert.match(result.notRemoved[0].reason, /not a bench site/)
  assert.equal(store.rows[0].status, 'ready')
})

test('a delete the host refuses is reported and the record stays for the next run', async () => {
  const previous = {
    id: 'run-0',
    status: 'ready',
    label: 'write-bench-old001',
    siteKey: 'write-bench-old001.sites.example'
  }
  const door = fakeDoor({ removeFails: ['write-bench-old001.sites.example'] })
  const { result, store } = await go({ door, store: memoryStore([previous]) })
  assert.equal(result.ok, true)
  assert.equal(result.notRemoved[0].siteKey, 'write-bench-old001.sites.example')
  assert.match(result.notRemoved[0].reason, /host busy/)
  assert.equal(store.rows[0].status, 'ready')
})
