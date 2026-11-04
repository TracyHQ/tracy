// Rewriting what the plan takes off a site (ADR 0044, decisions 2 and 6): it is not ordered off again, more can go, and bringing
// anything back is refused with nothing written, since that needs a new site. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptSite, menuRow, runInTurn } from './_write-step-rewrite.mjs'
import { fixedSentence, hideDoor, hideKit, planHiding, withFixedText } from './_write-step-hide.mjs'
import { copy, fakeSite, frozenFiles, plan } from './_write-step-run.mjs'

const lineOf = (report, slot) => report.slots.find((s) => s.slot === slot)
const hideSite = (over = {}) => fakeSite({ hideDoor: hideDoor({ overrides: {} }), ...over })
const keptHide = (over = {}, kit = hideKit()) => keptSite(hideSite(over), { kit })

function planShowing() {
  const shown = plan()
  shown.pages[0].blocks[0].hiddenSlots = []
  return shown
}

test('a hidden slot and a dropped block are not ordered off the site again', async () => {
  const kept = keptHide()
  const [first, second] = await runInTurn(kept, [{}, {}])
  assert.equal(lineOf(first, 'block-2.3').status, 'hidden')
  assert.equal(lineOf(first, 'block-4').status, 'hidden')
  assert.deepEqual(kept.writes(), [])
  const seen = (slot) => [lineOf(second, slot).status, lineOf(second, slot).unchanged]
  assert.deepEqual(seen('block-2.3'), ['hidden', true])
  assert.deepEqual(seen('block-4'), ['hidden', true])
  assert.equal(lineOf(second, 'block-4').readFrom.path.at(-1), 'published', 'still read back')
  assert.equal(second.counts.hidden, 0)
  assert.equal(second.counts.unchanged, first.counts.written + first.counts.hidden)
})

test('a slot the site now reads as empty stays the same line', async () => {
  const [first] = await runInTurn(keptHide(), [{}])
  const kept = keptHide({ overSlot: (slot) => (slot.key === 'module-2.3' ? { current: '' } : {}) })
  const frozen = frozenFiles({})
  try {
    const second = await kept.run(frozen.files, first)
    assert.equal(lineOf(second, 'block-2.3').reason, lineOf(first, 'block-2.3').reason)
    assert.equal(lineOf(second, 'block-2.3').unchanged, true)
  } finally {
    frozen.done()
  }
})

test('hiding one more slot empties only that one', async () => {
  const kept = keptHide()
  const c = copy()
  c.slots = c.slots.filter((s) => s.slot !== 'block-3.1')
  const p = planHiding(['block-3.1'])
  p.pages[0].blocks[1].copy = []
  const [, second] = await runInTurn(kept, [{}, { plan: p, copy: c }])
  assert.equal(second.status, 'done', JSON.stringify(second.cause))
  const [apply, ...others] = kept.writes()
  assert.deepEqual(others, [])
  assert.deepEqual(apply.params.empty_slots, ['module-3.1'])
  assert.equal(apply.params.changes, undefined)
  assert.equal(lineOf(second, 'block-3.1').status, 'hidden')
  assert.equal(lineOf(second, 'block-3.1').unchanged, undefined)
})

test('showing a slot that was emptied is refused, names it, and asks nothing of the site', async () => {
  const kept = keptHide()
  const c = copy()
  c.slots.push({ slot: 'block-2.3', owner: 'writer', text: 'A line the plan now keeps', factIds: [] })
  const [first, refused] = await runInTurn(kept, [{}, { plan: planShowing(), copy: c }])
  assert.equal(refused.status, 'stopped')
  assert.equal(refused.cause.code, 'NEEDS_NEW_SITE')
  assert.match(refused.cause.reason, /block-2\.3/)
  assert.match(refused.cause.reason, /new site/)
  assert.equal(kept.calls().length, 0)
  assert.equal(lineOf(refused, 'block-2.3').status, 'hidden', 'the next run still knows')
  assert.equal(lineOf(refused, 'block-2.1').ordered, lineOf(first, 'block-2.1').ordered)
})

test('a slot simply no longer hidden, with nothing to fill it, needs a new site as well', async () => {
  const kept = keptHide()
  const [, refused] = await runInTurn(kept, [{}, { plan: planShowing() }])
  assert.equal(refused.cause.code, 'NEEDS_NEW_SITE')
  assert.match(refused.cause.reason, /block-2\.3/)
  assert.deepEqual(kept.writes(), [])
})

test('after a refusal, the first files are still unchanged: the refusal lost nothing', async () => {
  const kept = keptHide()
  const [, , third] = await runInTurn(kept, [{}, { plan: planShowing() }, {}])
  assert.deepEqual(kept.writes(), [])
  assert.equal(third.status, 'done')
  assert.equal(lineOf(third, 'block-2.3').status, 'hidden')
})

test('keeping a block already dropped is refused and names the block', async () => {
  const kept = keptHide()
  const shown = plan()
  shown.pages[0].blocks = shown.pages[0].blocks.filter((b) => b.block !== 'block-4')
  shown.pages[0].blocks.push({ block: 'block-4', seen: 'seen', decision: 'keep', copy: [], pictures: [] })
  const c = copy()
  c.slots.push({ slot: 'block-4.1', owner: 'writer', text: 'Our prices', factIds: [] })
  const [, refused] = await runInTurn(kept, [{}, { plan: shown, copy: c }])
  assert.equal(refused.cause.code, 'NEEDS_NEW_SITE')
  assert.match(refused.cause.reason, /block-4\b/)
  assert.deepEqual(kept.writes(), [])
})

test('a dropped page: its item is not unpublished again, and keeping the page is refused', async () => {
  const site = hideSite({
    records: [menuRow(101, { home: 1, path: 'home' }), menuRow(103, { path: 'about-us/old' })]
  })
  const kept = keptSite(site, { kit: hideKit() })
  const [first] = await runInTurn(kept, [{}])
  assert.equal(lineOf(first, 'page-old').status, 'hidden')
  const frozen = frozenFiles({})
  try {
    // The door now lists the item as unpublished, as it does on the real site.
    site.records.set('menuItem-103', { ...site.records.get('menuItem-103'), published: 0 })
    const second = await kept.run(frozen.files, first)
    assert.deepEqual(kept.writes(), [])
    assert.deepEqual(
      [lineOf(second, 'page-old').status, lineOf(second, 'page-old').unchanged],
      ['hidden', true]
    )
  } finally {
    frozen.done()
  }
  const shown = plan()
  Object.assign(
    shown.pages.find((p) => p.id === 'page-old'),
    { decision: 'keep', blocks: [] }
  )
  const again = frozenFiles({ plan: shown })
  try {
    const refused = await kept.run(again.files, first)
    assert.equal(refused.cause.code, 'NEEDS_NEW_SITE')
    assert.match(refused.cause.reason, /page-old/)
  } finally {
    again.done()
  }
})

test('a fixed sentence: its constant is not sent again, and bringing it back is refused', async () => {
  const kit = () => withFixedText(hideKit(), fixedSentence())
  const kept = keptHide({}, kit())
  const hidden = planHiding(['block-2.fixed-made-up'])
  const [first, second] = await runInTurn(kept, [{ plan: hidden }, { plan: hidden }])
  assert.equal(lineOf(first, 'block-2.fixed-made-up').status, 'hidden')
  assert.deepEqual(kept.writes(), [])
  assert.equal(lineOf(second, 'block-2.fixed-made-up').unchanged, true)
  const [, refused] = await runInTurn(keptHide({}, kit()), [{ plan: hidden }, {}])
  assert.equal(refused.cause.code, 'NEEDS_NEW_SITE')
  assert.match(refused.cause.reason, /block-2\.fixed-made-up/)
})
