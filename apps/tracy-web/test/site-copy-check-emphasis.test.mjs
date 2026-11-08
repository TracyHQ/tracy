// Inline emphasis (ADR 0042 section 11, 2026-11-04): a slot whose demo draws words in the accent colour (a span in the kit's
// `inline`) names its own as `emphasis`; W16 judges it, the writer is told, and the export wraps it in the demo's span. Fixtures
// are the invented Quay Fitness Studio of _site-copy-check.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportContractMapping } from '../src/lib/site-copy/contract-mapping.js'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { brief, copy, kit, plan, slotOf } from './_site-copy-check.mjs'

/** The kit with the hero heading block-2.1 drawn like the demo "((span))NO1((/span)) Fitness club". */
function spanKit() {
  const k = kit()
  const slot = k.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.1')
  slot.inline = [{ tag: 'span', attrs: '', text: 'NO1', at: 'start' }, { tag: 'br' }]
  return k
}
const HEADING = 'Train with a coach who knows your name'
const withHeading = (emphasis) => {
  const c = copy()
  const s = slotOf(c, 'block-2.1')
  s.text = HEADING
  if (emphasis !== undefined) s.emphasis = emphasis
  return c
}
const w16 = (c, k = spanKit()) =>
  checkCopy({ copy: c, plan: plan(), kit: k, brief: brief() }).rules.find((r) => r.id === 'W16')

test('W16 passes a short run of the text, and fails a missing, invented, long or whole emphasis', () => {
  assert.equal(w16(withHeading('coach')).status, 'pass')
  const cause = (emphasis) => w16(withHeading(emphasis)).failures[0]?.cause
  assert.equal(cause(undefined), 'missing')
  assert.equal(cause('Coach'), 'not-in-text', 'case sensitive')
  assert.equal(cause('coach who knows'), 'long')
  assert.match(
    w16(withHeading(undefined)).failures[0].detail,
    /the demo draws "NO1" in the accent colour \(start\)/
  )
})

test('W16 fails an emphasis on a slot whose demo draws no words, and says nothing of a kit without inline', () => {
  assert.equal(w16(withHeading('coach'), kit()).failures[0].cause, 'no-span')
  assert.equal(w16(withHeading(undefined), kit()).status, 'skip')
})

test('the writer is told which words the demo draws in the accent colour', () => {
  const slot = writerInput({ plan: plan(), brief: brief(), kit: spanKit() })
    .blocks.find((b) => b.id === 'block-2')
    .slots.find((s) => s.id === 'block-2.1')
  assert.match(slot.inline, /The demo draws "NO1" in the accent colour, at the start/)
  const plain = writerInput({ plan: plan(), brief: brief(), kit: kit() })
    .blocks.find((b) => b.id === 'block-2')
    .slots.find((s) => s.id === 'block-2.1')
  assert.equal('inline' in plain, false)
})

test('the export wraps the emphasis in the demo span; a slot without inline ignores it', () => {
  const c = withHeading('Dubai')
  slotOf(c, 'block-2.1').text = 'European Coaching in Dubai'
  const out = (k) =>
    exportContractMapping({
      copy: c,
      contract: 'demo-gym/j6/1.0.0',
      revision: 'rev-1',
      kit: k,
      brief: brief()
    }).mapping.changes['module-2.1']
  assert.equal(out(spanKit()), 'European Coaching in ((span))Dubai((/span))')
  assert.equal(out(kit()), 'European Coaching in Dubai')
  const k = spanKit()
  k.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.1').inline[0].attrs =
    'class="hl"'
  assert.equal(out(k), 'European Coaching in ((span class="hl"))Dubai((/span))')
})

test('the export breaks the line before the emphasis only where the demo did, as a two-line title', () => {
  const out = (inline, text, emphasis) => {
    const c = withHeading(emphasis)
    slotOf(c, 'block-2.1').text = text
    const k = kit()
    k.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.1').inline = inline
    return exportContractMapping({
      copy: c,
      contract: 'demo-gym/j6/1.0.0',
      revision: 'rev-1',
      kit: k,
      brief: brief()
    }).mapping.changes['module-2.1']
  }
  // The demo "Our((br/)) ((span))Classes((/span))": a break, then the accent words at the end.
  const twoLines = [{ tag: 'br' }, { tag: 'span', attrs: '', text: 'Classes', at: 'end' }]
  assert.equal(out(twoLines, 'Our Sessions', 'Sessions'), 'Our ((br/))((span))Sessions((/span))')
  // The space before the break stays (a theme may hide the break on a narrow screen), and is never doubled.
  assert.equal(out(twoLines, 'Our   Sessions', 'Sessions'), 'Our ((br/))((span))Sessions((/span))')
  assert.equal(out(twoLines, 'A lesson in the pool', 'pool'), 'A lesson in the ((br/))((span))pool((/span))')
  // An emphasis that opens the text has no line above it.
  assert.equal(out(twoLines, 'Sessions for everyone', 'Sessions'), '((span))Sessions((/span)) for everyone')
  // A demo without the break, or with its break after the accent words, gets none.
  const oneLine = [{ tag: 'span', attrs: '', text: 'Classes', at: 'end' }]
  assert.equal(out(oneLine, 'Our Sessions', 'Sessions'), 'Our ((span))Sessions((/span))')
  const after = [{ tag: 'span', attrs: '', text: 'NO1', at: 'start' }, { tag: 'br' }]
  assert.equal(out(after, 'Our Sessions', 'Sessions'), 'Our ((span))Sessions((/span))')
})
