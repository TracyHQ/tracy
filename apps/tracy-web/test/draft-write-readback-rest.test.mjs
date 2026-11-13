// The read back of the parts of an HTML value the draft write did not touch (#597, `readRest`), and the run report:
// a fault of the HTML piece functions that changes a sibling of the written node stops the write, typed, where
// comparing the written node alone saw nothing; a read back difference is redone once, then stops; the counts give
// each entry once with the conflicts apart; a stale run record names what it had done. Invented data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-readback-rest.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteCoverage } from 'website-opportunities/domain/draft-write-plan.mjs'
import { memoryHtml } from 'website-opportunities/domain/write-order-memory-doors.mjs'
import { readRest } from '../src/step-chain-draft-write-check.js'
import { florist, floristPlan, blankSite, runOn } from './draft-write-fixtures.mjs'

const html = memoryHtml
const op = (xpaths, extra = {}) => ({
  key: 'copy:x',
  values: xpaths.map((xpath) => ({ loc: { entity: 'module-1', column: 'content', xpath }, value: 'x' })),
  ...extra
})
const code = (run) => {
  try {
    run()
  } catch (error) {
    return [error.code, error.details.what]
  }
  return ['passed']
}

test('a sibling the write did not name must read the same after it: entities, elements and words', () => {
  const before = { content: '<p>Caf&eacute; one</p><p>Two</p><ul><li>a</li><li>b</li></ul>' }
  const write = op(['/html/body/div/p[2]/text()'])
  const ok = { content: html.set(before.content, '/html/body/div/p[2]/text()', 'New words') }
  assert.deepEqual(
    code(() => readRest(before, ok, write, { html })),
    ['passed']
  )
  for (const content of [
    '<p>Caf&amp;eacute; one</p><p>New words</p><ul><li>a</li><li>b</li></ul>',
    '<p>Cafe one</p><p>New words</p><ul><li>a</li><li>b</li></ul>',
    '<p>Café one</p><p>New words</p><ul><li>a</li></ul>',
    '<p class="x">Café one</p><p>New words</p><ul><li>a</li><li>b</li></ul>',
    '<p>Café one</p><p>New words</p><ul><li>b</li><li>a</li></ul>'
  ])
    assert.deepEqual(
      code(() => readRest(before, { content }, write, { html })),
      ['read_back_mismatch', 'untouched value']
    )
  // The same words in another spelling are no change: `&eacute;` and the letter read alike.
  const same = { content: '<p>Café one</p><p>New words</p><ul><li>a</li><li>b</li></ul>' }
  assert.deepEqual(
    code(() => readRest(before, same, write, { html })),
    ['passed']
  )
})

test('an element the write took out is gone, the elements after it move up', () => {
  const before = { content: '<p>Lead</p><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>' }
  const write = op(['/html/body/div/p/text()'], {
    removes: [{ loc: { entity: 'module-1', column: 'content' }, xpath: '/html/body/div/a[2]' }]
  })
  const after = { content: '<p>New</p><a href="/a">A</a><a href="/c">C</a>' }
  assert.deepEqual(
    code(() => readRest(before, after, write, { html })),
    ['passed']
  )
  const wrong = { content: '<p>New</p><a href="/a">A</a><a href="/b">B</a>' }
  assert.equal(code(() => readRest(before, wrong, write, { html }))[0], 'read_back_mismatch')
})

test('the memory piece functions keep every sibling as it was, and a block closes an open paragraph', () => {
  const value = '<p>Caf&eacute; &copy; one</p><p>Two</p>'
  assert.equal(
    html.set(value, '/html/body/div/p[2]/text()', 'Three'),
    '<p>Caf&eacute; &copy; one</p><p>Three</p>'
  )
  const open = '<p>Lead<div>Box</div><p>Tail<ul><li>a</li></ul>'
  assert.equal(html.get(open, '/html/body/div/p[1]'), 'Lead')
  assert.equal(html.get(open, '/html/body/div/div'), 'Box')
  assert.equal(html.get(open, '/html/body/div/ul/li'), 'a')
})

test('a piece function that changes a sibling stops the run, typed, after one redo', async () => {
  const memory = blankSite()
  let sets = 0
  // A fault of the plugin's piece functions: a write also gives a plain sibling element an attribute. Every written
  // node still reads its own words, so the node by node read back sees nothing.
  memory.doors.html = {
    ...memoryHtml,
    set: (value, xpath, words) => {
      const out = memoryHtml.set(value, xpath, words)
      if (out.includes('<div>')) sets += 1
      return out.replace('<div>', '<div class="stray">')
    }
  }
  const error = await runOn(memory).then(
    () => assert.fail('the write ended done'),
    (e) => e
  )
  assert.equal(error.code, 'read_back_mismatch')
  assert.equal(error.details.what, 'untouched value')
  assert.equal(error.noRerun, true)
  assert.match(error.message, /failed 2 time\(s\)/)
  assert.ok(sets > 0)
})

test('a read back difference is redone once: a site that reads right the second time ends done', async () => {
  const memory = blankSite()
  const read = memory.doors.read
  let wrong = 1
  memory.doors.read = async (input) => {
    const got = await read(input)
    if (wrong-- > 0) for (const k of Object.keys(got)) got[k] = 'other'
    return got
  }
  assert.equal((await runOn(memory)).status, 'done')
})

test('the run counts give written, skipped and conflicted apart, each entry once', async () => {
  const report = await runOn(blankSite())
  const c = draftWriteCoverage(florist.order, floristPlan)
  assert.deepEqual(
    [report.counts.written, report.counts.conflicted, report.counts.ops],
    [c.written, c.conflicted, floristPlan.ops.length]
  )
  assert.equal(report.counts.conflicts.length, new Set(floristPlan.conflicts.map((x) => x.entry)).size)
  assert.ok(!floristPlan.skipped.some((s) => s.reason === 'address_conflict'))
})

test('a stale run record names what it had done', async () => {
  const memory = blankSite({ crash: { at: 6 } })
  const record = {}
  await assert.rejects(runOn(memory, { record }), (e) => e.fatal === true)
  const other = structuredClone(floristPlan)
  other.ops = other.ops.filter((x) => x.kind !== 'look.accent')
  const error = await runOn(memory, { plan: other, record }).then(
    () => assert.fail('resumed'),
    (e) => e
  )
  assert.equal(error.code, 'write_record_stale')
  assert.deepEqual(error.report.stale.done, record.state.done)
  assert.ok(error.report.stale.done.length + error.report.stale.made.length > 0)
})
