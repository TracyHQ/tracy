// A showcase block the site plan keeps on one page is narrowed to it on Joomla (spec TracyHQ/tracy#189, COO decision
// 30/10/2026): its page assignment loses the pages it is taken off, it is never unpublished. Two invented trades: a bakery
// and a dental clinic, against a fake site.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  narrowRepeatedBlocks,
  repeatedBlockSteps
} from '../src/sites/brief-engines/joomla-repeated-blocks.js'

const once = (entity, keep, off) => ({
  entity,
  repeat: 'once',
  keepOn: { id: 'home', entity: `menuItem-${keep}` },
  takenOffFrom: off.map((id) => ({ id: `page-${id}`, entity: `menuItem-${id}` })),
  reason: 'repeated-showcase'
})

test('bakery: the photo strip on home, About and services keeps home and any page the plan does not name', () => {
  const { steps, skipped } = repeatedBlockSteps({
    blocks: [once('module-30', 101, [102, 103]), { entity: 'module-31', repeat: 'everywhere' }],
    assignments: new Map([
      [30, [101, 102, 103, 140]],
      [31, [101, 102]]
    ])
  })
  assert.deepEqual(steps, [{ kind: 'moduleAssignment', id: 30, fields: { menuids: '[101,140]' } }])
  assert.deepEqual(skipped, [])
})

test('dental clinic: an assignment that is every page, unreadable, or misses the kept page is left alone, with why', () => {
  const { steps, skipped } = repeatedBlockSteps({
    blocks: [
      once('module-40', 2, [3]),
      once('module-41', 2, [3]),
      once('module-42', 2, [3]),
      once('article-5', 2, [3])
    ],
    assignments: new Map([
      [40, [0]],
      [41, null],
      [42, [3, 4]]
    ])
  })
  assert.deepEqual(steps, [])
  assert.deepEqual(
    skipped.map((s) => s.entity),
    ['module-40', 'module-41', 'module-42', 'article-5']
  )
  assert.ok(skipped.every((s) => s.why.length > 10))
})

test('the writer reads each assignment, narrows it with one update, and notes what it took off', async () => {
  const calls = []
  const apply = async (call) => {
    calls.push(call)
    if (call.action === 'content.get') return { ok: true, item: { menuids: '[1,2,3]' } }
    return { ok: true }
  }
  const notes = []
  const out = await narrowRepeatedBlocks({
    apply,
    siteKey: 'fictional-bakery',
    sitePlan: { repeatedBlocks: [once('module-30', 1, [2, 3])] },
    applyId: 'repeat-test',
    note: (n) => notes.push(n)
  })
  assert.equal(out.narrowed, 1)
  const update = calls.find((c) => c.action === 'content.update')
  assert.deepEqual(update.params, {
    kind: 'moduleAssignment',
    id: 30,
    apply_id: 'repeat-test',
    fields: { menuids: '[1]' }
  })
  assert.ok(!calls.some((c) => c.params?.fields?.published === 0), 'never unpublished')
  assert.equal(notes.length, 1)
})

test('no plan, or nothing shown only once: nothing is read or written', async () => {
  let called = 0
  const apply = async () => {
    called += 1
    return { ok: true }
  }
  await narrowRepeatedBlocks({ apply, siteKey: 'x', sitePlan: null, applyId: 'a' })
  await narrowRepeatedBlocks({
    apply,
    siteKey: 'x',
    sitePlan: { repeatedBlocks: [{ entity: 'module-1', repeat: 'everywhere' }] },
    applyId: 'a'
  })
  assert.equal(called, 0)
})
