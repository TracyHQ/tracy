// Same input means nothing changes (TracyHQ/tracy#374): a second run with the same files on the same site writes nothing and asks
// for no new site, whichever way an earlier run took a slot off it. A real change that needs a slot back is still refused. Every
// fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideDoor, hideKit } from './_write-step-hide.mjs'
import { keptSite, menuRow, runInTurn } from './_write-step-rewrite.mjs'
import { copy, fakeSite, plan } from './_write-step-run.mjs'

const lineOf = (report, slot) => report.slots.find((s) => s.slot === slot)
const RECORDS = () => [menuRow(101, { home: 1, path: 'home' }), menuRow(102, { path: 'about-us' })]

/** Two runs of one file set: the guard every rerun test stands on. */
async function twice({ kit = hideKit(), site = {}, steps = [{}, {}], contentMap = null }) {
  const fake = fakeSite({ hideDoor: hideDoor({ overrides: {} }), records: RECORDS(), ...site })
  const kept = keptSite(fake, { kit, contentMap })
  const reports = await runInTurn(kept, steps)
  return { kept, fake, first: reports[0], second: reports.at(-1) }
}

function assertNothingChanged({ kept, second }) {
  assert.equal(second.status, 'done', JSON.stringify(second.cause))
  assert.deepEqual(kept.writes(), [], 'the second run writes nothing')
  assert.equal(second.counts.written, 0)
  assert.equal(second.counts.hidden, 0)
}

const withLink = (kit, link) => {
  kit.doc.blocks.find((b) => b.id === 'block-2').links = [link]
  return kit
}
function planLinking(link, labelSlot) {
  const p = plan()
  p.pages[0].blocks[0].links = [{ link, leadsTo: 'page-about', labelSlot }]
  return p
}

test('a link that left with its emptied words is no slot to bring back: the same files change nothing', async () => {
  const link = {
    id: 'block-2.link-1',
    position: 0,
    target: null,
    labelId: 'block-2.3',
    action: 'page-control'
  }
  const p = planLinking('block-2.link-1', 'block-2.3')
  const run = await twice({ kit: withLink(hideKit(), link), steps: [{ plan: p }, { plan: p }] })
  assert.equal(lineOf(run.first, 'block-2.link-1').status, 'hidden')
  assertNothingChanged(run)
  assert.equal(lineOf(run.second, 'block-2.link-1').unchanged, true)
})

test('a real change is still refused: the words a link left with come back, and the refusal names them', async () => {
  const link = {
    id: 'block-2.link-1',
    position: 0,
    target: null,
    labelId: 'block-2.3',
    action: 'page-control'
  }
  const p = planLinking('block-2.link-1', 'block-2.3')
  const shown = planLinking('block-2.link-1', 'block-2.3')
  shown.pages[0].blocks[0].hiddenSlots = []
  const c = copy()
  c.slots.push({ slot: 'block-2.3', owner: 'writer', text: 'A line the plan now keeps', factIds: [] })
  const { second, kept } = await twice({
    kit: withLink(hideKit(), link),
    steps: [{ plan: p }, { plan: shown, copy: c }]
  })
  assert.equal(second.cause.code, 'NEEDS_NEW_SITE')
  assert.match(second.cause.reason, /block-2\.3/)
  assert.deepEqual(kept.writes(), [])
})

/** A plugin with the `rows.remove` door, and a slot of HTML the plan hides: it leaves the stored field. */
const removingSite = (over = {}) => ({
  info: { ok: true, info: { hide_ops: { version: 1, rows_remove: 1 } } },
  overSlot: (slot) => (slot.key === 'module-2.3' ? { xpath: '/html/body/p', current: 'Demo line' } : {}),
  ...over
})

test('a slot that left the stored field stays gone: the same files change nothing', async () => {
  const run = await twice({ site: removingSite() })
  assert.equal(lineOf(run.first, 'block-2.3').ordered, 'removed')
  assertNothingChanged(run)
})

test('filling a slot that left the stored field is refused by name, before it reaches the site', async () => {
  const shown = plan()
  shown.pages[0].blocks[0].hiddenSlots = []
  const c = copy()
  c.slots.push({ slot: 'block-2.3', owner: 'writer', text: 'A line the plan now keeps', factIds: [] })
  const { second } = await twice({ site: removingSite(), steps: [{}, { plan: shown, copy: c }] })
  assert.equal(second.cause?.code, 'NEEDS_NEW_SITE', JSON.stringify(second.cause))
  assert.match(second.cause.reason, /block-2\.3/)
})

/** A contact page on block-5 whose form the plan hides, opened by the menu item of page-about. */
function formFixture() {
  const kit = hideKit()
  kit.doc.pages[1].path = '/about-us'
  kit.doc.blocks.find((b) => b.id === 'block-5').source = { entity: 'contact-1' }
  const p = plan()
  p.pages.find((page) => page.id === 'page-about').decision = 'keep'
  p.site = { ...p.site, forms: [{ block: 'block-5', decision: 'hide', why: 'no address to send it to' }] }
  return { kit, plan: p }
}

test('a form closed by the first run is not closed again', async () => {
  const { kit, plan: p } = formFixture()
  const run = await twice({ kit, steps: [{ plan: p }, { plan: p }] })
  assert.equal(lineOf(run.first, 'block-5').status, 'hidden')
  assertNothingChanged(run)
  assert.equal(lineOf(run.second, 'block-5').unchanged, true)
})

test('opening a form the first run closed is refused by name: nothing reopens it', async () => {
  const { kit, plan: p } = formFixture()
  const open = structuredClone(p)
  open.site.forms = []
  const { second } = await twice({ kit, steps: [{ plan: p }, { plan: open }] })
  assert.equal(second.cause?.code, 'NEEDS_NEW_SITE', JSON.stringify(second.cause))
  assert.match(second.cause.reason, /block-5 \(a form that was closed\)/)
})
