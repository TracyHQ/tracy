// The read back of the draft write (#597, `step-chain-draft-write-check.js`): a door that answers "done" while the site
// keeps something else stops the write, typed `read_back_mismatch`, for every kind of call: a created record's columns,
// a module's pages, the library HTML, a contract slot and a removed slot, an upload's bytes, the site identity, a
// patched record. Also the apply id of every door call, and the run record tied to its plan (`write_record_stale`).
// Invented data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-readback.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readContract, readValues } from '../src/step-chain-draft-write-check.js'
import { RUN } from '../src/step-chain-draft-write-kinds.js'
import { blankSite, floristPlan, runOn } from './draft-write-fixtures.mjs'

/** A memory site whose door `name` hands each call through `tamper` first. */
function tampered(name, tamper) {
  const memory = blankSite()
  const door = memory.doors[name]
  memory.doors[name] = (input) => door(tamper(input))
  return memory
}
const stops = async (memory) => {
  const error = await runOn(memory).then(
    () => assert.fail('the write ended done'),
    (e) => e
  )
  assert.equal(error.code, 'read_back_mismatch', error.message)
  assert.equal(error.report.status, 'failed')
  return error
}
const changed = (when, fields) => (i) => (when(i) ? { ...i, fields: { ...i.fields, ...fields } } : i)

test('a created record kept with other columns stops the write', async () => {
  await stops(
    tampered(
      'update',
      changed((i) => i.id === 0 && i.kind !== 'module', { title: 'Other', name: 'Other' })
    )
  )
  await stops(
    tampered(
      'update',
      changed((i) => i.kind === 'menuItem', { link: 'index.php' })
    )
  )
  await stops(
    tampered(
      'update',
      changed((i) => i.kind === 'article', { catid: '9' })
    )
  )
})

test('a module kept on other pages, or a library module kept without its HTML, stops the write', async () => {
  await stops(
    tampered(
      'update',
      changed((i) => i.kind === 'moduleAssignment', { menuids: '[]' })
    )
  )
  await stops(
    tampered(
      'update',
      changed((i) => i.kind === 'module' && String(i.fields?.note).startsWith('library:'), { content: '' })
    )
  )
})

test('a contract slot, an upload or the site identity kept otherwise stops the write', async () => {
  await stops(
    tampered('contract', (i) => ({
      ...i,
      changes: Object.fromEntries(
        Object.keys(i.changes).map((k, n) => [k, n === 0 ? 'Other words' : i.changes[k]])
      )
    }))
  )
  const lost = blankSite()
  lost.doors.upload = async ({ path }) => ({ path })
  await stops(lost)
  await stops(tampered('identity', (i) => ({ ...i, fields: {} })))
})

test('a removed slot still read, and a patched record kept unpatched, stop the operation', async () => {
  const memory = blankSite()
  const ctx = {
    doors: memory.doors,
    html: memory.doors.html,
    applyId: () => 'test:patch',
    state: { ids: {} }
  }
  const read = {
    ...memory.doors,
    read: async ({ slots }) => Object.fromEntries(slots.map((s) => [s, 'still here']))
  }
  await assert.rejects(
    readContract({ key: 'contract:x' }, {}, ['module-175.2'], { ...ctx, doors: read }),
    (e) => e.code === 'read_back_mismatch' && e.details.what === 'removed slot'
  )
  const [id] = memory.site.records.module.keys()
  const op = {
    key: 'patch:x',
    kind: 'record.patch',
    recordKind: 'module',
    sourceId: id,
    values: [{ loc: { entity: `module-${id}`, column: 'title' }, value: 'Fresh stems' }]
  }
  const ignored = { ...memory.doors, update: async () => ({ id }) }
  await assert.rejects(
    RUN['record.patch'](op, { ...ctx, doors: ignored }),
    (e) => e.code === 'read_back_mismatch'
  )
  await RUN['record.patch'](op, ctx)
  assert.equal(memory.site.records.module.get(id).title, 'Fresh stems')
})

test('every door call carries its own apply id, the same one when a resumed run makes the call again', async () => {
  const ids = (memory) => {
    const seen = []
    for (const name of ['update', 'contract', 'upload', 'identity']) {
      const door = memory.doors[name]
      memory.doors[name] = (input) => {
        seen.push(input.applyId)
        return door(input)
      }
    }
    return seen
  }
  const clean = blankSite()
  const all = ids(clean)
  await runOn(clean)
  assert.equal(new Set(all).size, all.length, 'one apply id per call')
  const memory = blankSite({ crash: { at: 30 } })
  const resumed = ids(memory)
  const record = {}
  await assert.rejects(runOn(memory, { record }), (e) => e.fatal === true && e.report?.status === 'failed')
  await runOn(memory, { record })
  assert.ok(
    resumed.every((id) => all.includes(id)),
    'a resumed call uses the id of the same call'
  )
  // The call that died may be made again (a made record is found by its mark instead): with the same id.
  assert.ok(resumed.length - new Set(resumed).size <= 1, 'no call but the one that died is made again')
  await assert.rejects(
    memory.doors.update({ kind: 'module', id: 0, fields: { title: 'x' } }),
    (e) => e.code === 'APPLY_ID_REQUIRED'
  )
})

test('a run record of another plan is not resumed: write_record_stale, noRerun, nothing written', async () => {
  const memory = blankSite({ crash: { at: 10 } })
  const record = {}
  await assert.rejects(runOn(memory, { record }), (e) => e.fatal === true)
  const other = structuredClone(floristPlan)
  other.ops = other.ops.filter((op) => op.kind !== 'look.accent')
  const calls = memory.calls
  const error = await runOn(memory, { plan: other, record }).then(
    () => assert.fail('resumed'),
    (e) => e
  )
  assert.equal(error.code, 'write_record_stale')
  assert.equal(error.noRerun, true)
  assert.equal(memory.calls, calls)
})

test('a piece whose node the site value no longer holds reads as a difference, typed', () => {
  const memory = blankSite()
  const ctx = { html: memory.doors.html, state: { ids: {}, paths: {} } }
  const op = {
    key: 'copy:x',
    values: [{ loc: { entity: 'module-1', column: 'content', xpath: '/html/body/div/p[2]' }, value: 'Fresh' }]
  }
  assert.throws(
    () => readValues({ content: '<p>only one</p>' }, op, ctx),
    (e) => e.code === 'read_back_mismatch' && e.details.what === 'value'
  )
})
