import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Manifest, SCHEMA, findAbandoned } from '../lib/manifest.mjs'

const fresh = () => mkdtempSync(join(tmpdir(), 'e2e-manifest-'))

test('intent is on disk before anything is created', () => {
  const root = fresh()
  const m = Manifest.create(join(root, 'r1'), 'r1abc')
  m.intend('site', 'e2er1abcw.tracy.site', { label: 'e2er1abcw', owner: 'e2e-r1abc-owner@example.test' })
  const onDisk = JSON.parse(readFileSync(join(root, 'r1', 'manifest.json'), 'utf8'))
  assert.equal(onDisk.schema, SCHEMA)
  assert.equal(onDisk.resources[0].state, 'intended')
  assert.equal(onDisk.resources[0].data.label, 'e2er1abcw')
})

test('the same resource cannot be named twice', () => {
  const m = Manifest.create(join(fresh(), 'r'), 'r2abc')
  m.intend('site', 'a.tracy.site')
  assert.throws(() => m.intend('site', 'a.tracy.site'), /already names/)
})

test('cleanup calls the cleaner of each open resource and records its answer', async () => {
  const m = Manifest.create(join(fresh(), 'r'), 'r3abc')
  m.intend('site', 'one.tracy.site')
  m.intend('site', 'two.tracy.site')
  m.intend('account', 'e2e-r3abc-owner@example.test')
  m.mark('site', 'two.tracy.site', 'cleaned')
  const seen = []
  const after = await m.cleanup({
    site: async (r) => {
      seen.push(r.id)
      return { state: 'cleaned', detail: { status: 200 } }
    },
    account: async () => ({ state: 'kept-no-door' })
  })
  assert.deepEqual(seen, ['one.tracy.site'])
  assert.deepEqual(
    after.map((r) => r.state),
    ['cleaned', 'cleaned', 'kept-no-door']
  )
  assert.equal(m.open().length, 0)
})

test('a cleaner that throws leaves the resource marked left, with the reason', async () => {
  const m = Manifest.create(join(fresh(), 'r'), 'r4abc')
  m.intend('site', 'x.tracy.site')
  const [r] = await m.cleanup({
    site: async () => {
      throw new Error('door answered 502')
    }
  })
  assert.equal(r.state, 'left')
  assert.match(JSON.stringify(r.history.at(-1)), /door answered 502/)
})

test('a kind with no cleaner is left, never guessed at', async () => {
  const m = Manifest.create(join(fresh(), 'r'), 'r5abc')
  m.intend('seat', 'something')
  const [r] = await m.cleanup({})
  assert.equal(r.state, 'left')
})

test('--keep marks open resources kept and calls no cleaner', async () => {
  const m = Manifest.create(join(fresh(), 'r'), 'r6abc')
  m.intend('site', 'k.tracy.site')
  const [r] = await m.cleanup(
    {
      site: async () => {
        throw new Error('must not be called')
      }
    },
    { keep: true }
  )
  assert.equal(r.state, 'kept')
})

test('an unfinished manifest of a dead process is found; a live, finished or foreign one is not', () => {
  const root = fresh()
  const dead = Manifest.create(join(root, 'dead'), 'deadrun', { pid: 111 })
  dead.intend('site', 'd.tracy.site')
  const alive = Manifest.create(join(root, 'alive'), 'aliverun', { pid: 222 })
  alive.intend('site', 'a.tracy.site')
  const done = Manifest.create(join(root, 'done'), 'donerun', { pid: 333 })
  done.intend('site', 'f.tracy.site')
  done.finish()
  const empty = Manifest.create(join(root, 'empty'), 'emptyrun', { pid: 444 })
  empty.intend('site', 'e.tracy.site')
  empty.mark('site', 'e.tracy.site', 'cleaned')
  // Another tool's folder in the shared results root: ignored.
  writeFileSync(join(root, 'notes.txt'), 'x')
  Manifest.create(join(root, 'other'), 'otherrun', { pid: 555 })
  writeFileSync(join(root, 'other', 'manifest.json'), JSON.stringify({ schema: 'something-else' }))

  const found = findAbandoned(root, { isAlive: (pid) => pid === 222 })
  assert.deepEqual(
    found.map((m) => m.read().runId),
    ['deadrun']
  )
  assert.deepEqual(
    findAbandoned(root, { isAlive: () => false, except: 'dead' }).map((m) => m.read().runId),
    ['aliverun']
  )
})

test('a run id is never reused: create refuses an existing manifest', () => {
  const root = fresh()
  Manifest.create(join(root, 'r'), 'r7abc')
  assert.throws(() => Manifest.create(join(root, 'r'), 'r7abc'), /already exists/)
})
