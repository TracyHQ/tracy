// The three acceptance boxes of #599 on the invented florist (JA Boxing kit, memory site, scripted fake model):
//   1. renaming one service re-writes only the pages and blocks that show it;
//   2. unaffected pages and blocks are untouched and cause no model call;
//   3. the previous build can be restored (the whole memory site equal to its snapshot before the revision).
// The fake writer answers search texts too: a page sent for its blocks only keeps them, and one whose search texts
// quote the old name is asked them again.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-acceptance.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from 'website-opportunities/domain/draft-write-plan.mjs'
import { revisedBy, SERVICE } from './draft-revision-edits.mjs'
import {
  firstBuild,
  freshBuild,
  keptWordsOf,
  restoreOf,
  revisionRun,
  sameSite
} from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const WRITER = { seo: true }
const first = await firstBuild({ writer: WRITER })
const before = snapshotOf(first.memory)
const revised = revisedBy('rename a service')
const partial = await revisionRun(first, revised, { writer: WRITER })
const after = snapshotOf(first.memory)
const { run } = partial
const plan = first.run.plan.plan
/** The blocks whose plan data shows the renamed service. */
const showing = plan.pages.flatMap((p) =>
  p.blocks.filter((b) => b.data.includes(SERVICE)).map((b) => `${p.id}.${b.id}`)
)
const writePlan = writePlanOf(run.order.order, run.kit.aiq, {
  stored: Object.fromEntries(
    [...run.order.order.pictures.map((p) => p.frame), ...run.order.order.icons.map((i) => i.id)].map((id) => [
      id,
      { id: `stored-${id}` }
    ])
  )
})
const opOf = (key) => writePlan.ops.find((op) => op.key === key)
const inShowing = (entry) => showing.some((at) => entry.startsWith(`${at}.`))

test('1. renaming one service re-writes only the pages and blocks that show it', () => {
  assert.equal(run.write.report.status, 'done')
  const pages = [...new Set(showing.map((at) => at.split('.')[0]))]
  assert.deepEqual(Object.keys(partial.model.pages).sort(), pages.sort())
  // The blocks sent to the writer are blocks that show the service; every such block with a copy field is one of them.
  const affected = run.plan.revision.impact.blocks.map((b) => `${b.page}.${b.block}`)
  for (const at of affected) assert.ok(showing.includes(at), at)
  const copied = new Set(
    run.copy.pages.flatMap((p) =>
      p.fields.filter((f) => f.from === 'writer').map((f) => `${p.id}.${f.block}`)
    )
  )
  assert.deepEqual(affected.sort(), showing.filter((at) => copied.has(at)).sort())
  for (const block of run.plan.revision.impact.blocks) assert.ok(block.reasons.includes(`data:${SERVICE}`))
  // Every operation written again writes a place of a block that shows the service.
  const rewrite = run.write.report.delta.rewrite
  assert.ok(rewrite.length > 0)
  for (const key of rewrite)
    assert.ok(opOf(key).entries.some(inShowing), `${key} shows no block of the service`)
  assert.deepEqual(run.write.report.delta.added, [])
  // A row of another service in a shared list keeps its words: not asked, read only context.
  const asked = partial.model.calls
    .filter((c) => c.kind === 'writer')
    .flatMap((c) => JSON.parse(c.user).blocks.flatMap((b) => b.fields.map((f) => f.key)))
  const rows = run.copy.pages.flatMap((p) => p.fields).filter((f) => f.from === 'writer' && f.item)
  for (const f of rows.filter((r) => showing.some((at) => at.endsWith(`.${r.block}`))))
    assert.equal(asked.includes(f.key), f.item === SERVICE, f.key)
  // And the site is exactly what a full build of the renamed plan writes, given the words the revision kept.
  const fixed = keptWordsOf(partial)
  return freshBuild(revised, { writer: { ...WRITER, fixed } }).then((fresh) =>
    assert.ok(sameSite(first.memory, fresh.memory))
  )
})

test('2. unaffected pages and blocks are untouched and cause no model call', () => {
  const calls = partial.model.pages
  for (const page of run.plan.revision.impact.reuse) assert.equal(calls[page] ?? 0, 0, page)
  assert.ok(run.plan.revision.impact.reuse.length >= 3)
  // Only writer calls: the labelling and the icons were answered from the previous build's replies. The one other call
  // is the drawings' wish call (#575), asked again because the renamed service is one it draws for; every drawing and
  // every look was answered from the previous build.
  const kinds = partial.model.calls.map((c) => c.kind)
  assert.deepEqual([...new Set(kinds.filter((k) => k !== 'pictures'))], ['writer'])
  const pictures = partial.model.calls.filter((c) => c.kind === 'pictures')
  assert.ok(pictures.length <= 1)
  assert.ok(pictures.every((c) => JSON.parse(c.user).frames.some((f) => f.item?.fields?.['offering.name'])))
  assert.equal(run.icons.recorded.calls.asked, 0)
  // The words of every kept page are the previous build's.
  for (const id of run.plan.revision.impact.reuse)
    assert.deepEqual(
      run.copy.pages.find((p) => p.id === id).fields,
      first.run.copy.pages.find((p) => p.id === id).fields
    )
  // Every place of the site that changed is a place of an operation written again: records by id, slots by key.
  const rewritten = new Set(run.write.report.delta.rewrite)
  const ids = new Set(
    [...rewritten].map((key) =>
      String(first.builds.get(first.ref).write.state.ids[key] ?? opOf(key).sourceId)
    )
  )
  const slots = new Set(
    [...rewritten].flatMap((key) => (opOf(key).values ?? []).map((v) => v.loc.slot).filter(Boolean))
  )
  for (const [kind, rows] of Object.entries(before.records))
    rows.forEach(([id, row], i) => {
      if (JSON.stringify(row) !== JSON.stringify(after.records[kind][i][1]))
        assert.ok(ids.has(String(id)), `${kind} ${id}`)
    })
  before.slots.forEach(([key, value], i) => {
    if (value !== after.slots[i][1]) assert.ok(slots.has(key), key)
  })
  assert.deepEqual(after.assignments, before.assignments)
  assert.deepEqual(after.uploads, before.uploads)
  assert.equal(partial.writes, rewritten.size)
})

test('3. the previous build can be restored: the whole memory site equals its snapshot before the revision', async () => {
  assert.notDeepEqual(after, before)
  const build = first.builds.get(run.write.build.ref)
  const restored = await restoreOf(first, build, { runId: 'restore-larkspur' })
  assert.equal(restored.status, 'done')
  assert.deepEqual(snapshotOf(first.memory), before)
  assert.deepEqual(restored.left, { uploads: [], assignments: [], hidden: [], kept: [] })
  assert.equal(restored.current.ref, first.ref)
  assert.equal(restored.current.write.state.seq, build.write.state.seq + 1)
  assert.equal(first.builds.currentRef, first.ref)
})

const seoOf = (r, id) => r.copy.pages.find((p) => p.id === id)?.seo
const writerCalls = (model) => model.calls.filter((c) => c.kind === 'writer').map((c) => JSON.parse(c.user))

test('4. a page sent for its blocks only keeps its search texts: not asked, not rewritten', () => {
  const asked = writerCalls(partial.model)
  assert.ok(asked.length > 0)
  for (const user of asked) {
    assert.equal(user.seo, undefined, user.page.id)
    assert.ok(seoOf(first.run, user.page.id)?.title, user.page.id)
    assert.deepEqual(seoOf(run, user.page.id), seoOf(first.run, user.page.id))
  }
  assert.deepEqual(
    run.write.report.delta.rewrite.filter((key) => key.startsWith('menuItem:')),
    []
  )
})

test('5. a page whose search title quotes the old name is asked its search texts again', async () => {
  const name = plan.items.find((i) => i.id === SERVICE).label
  const quoted = await firstBuild({ writer: { seo: (page) => (page === 'home' ? `${name}:` : null) } })
  assert.ok(seoOf(quoted.run, 'home').title.startsWith(name))
  const again = await revisionRun(quoted, revised, { writer: WRITER })
  assert.equal(again.run?.write.report.status, 'done', again.error?.code)
  const home = writerCalls(again.model).find((u) => u.page.id === 'home')
  assert.ok(home?.seo, 'the home page call asks its search texts')
  assert.ok(!seoOf(again.run, 'home').title.includes(name))
})
