// W03 per part and W15 (ADR 0042, 2026-11-04): a text follows the demo's length, between 80% and 100% of it, and a slot whose
// demo is a lead paragraph followed by short points is written in that shape. The shape comes from lib/site-copy/slot-shape.js,
// which the writer's input reads too. Fixtures are the invented Quay Fitness Studio of _site-copy-check.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { demoCharsOf, demoTotalFor, slotShape } from '../src/lib/site-copy/slot-shape.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { brief, copy, kit, plan, slotOf } from './_site-copy-check.mjs'

/** A text of exactly n characters with no sentence break inside it. */
const chars = (n) =>
  'train hard with friends '
    .repeat(Math.ceil(n / 24) + 1)
    .slice(0, n)
    .replace(/\s$/, 'x')

const LEAD_SAMPLE =
  'Every class starts with a slow warm up and ends with a calm stretch for the whole group…\n- Warm up\n- Pads and bags with a partner\n- Core work\n- Footwork drills\n- Stretch'

/** The kit with block-2.2 changed: `changes` are merged into the slot. */
function kitWith(changes) {
  const k = kit()
  const slot = k.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.2')
  Object.assign(slot, changes)
  return k
}
const run = (k, text) => {
  const c = copy()
  slotOf(c, 'block-2.2').text = text
  return checkCopy({ copy: c, plan: plan(), kit: k, brief: brief() }).rules
}
const rule = (rules, id) => rules.find((r) => r.id === id)

test('the shape comes from the kit demoChars, or from the sample when the kit has none', () => {
  const withChars = {
    sample: 'cut…',
    paragraphs: 1,
    bullets: 5,
    demoChars: { total: 150, lead: 90, bullets: [9, 28, 10, 15, 7] }
  }
  assert.deepEqual(slotShape(withChars), {
    lead: true,
    points: 5,
    leadChars: 90,
    pointChars: { min: 7, max: 28 }
  })
  assert.equal(demoCharsOf(withChars).total, 150)
  const fromSample = { sample: LEAD_SAMPLE, paragraphs: 1, bullets: 5 }
  const d = demoCharsOf(fromSample)
  assert.equal(d.from, 'sample')
  assert.equal(d.lead, 87)
  assert.deepEqual(d.bullets, [7, 28, 9, 15, 7])
  assert.deepEqual(slotShape(fromSample), {
    lead: true,
    points: 5,
    leadChars: 87,
    pointChars: { min: 7, max: 28 }
  })
  assert.deepEqual(slotShape({ sample: 'A plain paragraph of words.', paragraphs: 1, bullets: 0 }), {
    lead: false,
    points: 0,
    leadChars: null,
    pointChars: null
  })
  // Three points written of the five the demo shows: the lead plus three average points, and the spaces between them.
  assert.equal(demoTotalFor(withChars, 4), Math.round(90 + (69 / 5) * 3 + 3))
})

test('the writer is given demoChars, the shape and only the start of the sample', () => {
  const long = `${chars(400)}.`
  const k = kitWith({ sample: long, demoChars: { total: 401, lead: null, bullets: [] } })
  const slot = writerInput({ plan: plan(), brief: brief(), kit: k })
    .blocks.find((b) => b.id === 'block-2')
    .slots.find((s) => s.id === 'block-2.2')
  assert.ok(slot.sample.length <= 161 && slot.sample.endsWith('…'))
  assert.deepEqual(slot.demoChars, { total: 401, lead: null, bullets: [] })
  assert.deepEqual(slot.shape, { lead: false, points: 0, leadChars: null, pointChars: null })
})

test('W03 fails a text at 55% of the demo and one at 120%, and passes one at 85%', () => {
  const k = kitWith({ paragraphs: 1, demoChars: { total: 150, lead: null, bullets: [] } })
  const under = rule(run(k, chars(83)), 'W03')
  assert.equal(under.status, 'fail')
  assert.match(
    under.failures[0].detail,
    /block-2\.2: 83 characters, floor 120 \(80% of the 150 character demo text\)/
  )
  assert.equal(rule(run(k, chars(128)), 'W03').status, 'pass')
  const over = rule(run(k, chars(180)), 'W03')
  assert.equal(over.status, 'fail')
  assert.match(
    over.failures[0].detail,
    /180 characters, ceiling 153 \(the 150 character demo text is the top\)/
  )
  assert.equal(over.failures[0].cause, 'over-demo')
})

test('W03 measures the demo on the sample when the kit has no demoChars, and leaves a short heading alone', () => {
  const k = kitWith({ paragraphs: 1, sample: chars(100) })
  assert.equal(rule(run(k, chars(50)), 'W03').status, 'fail')
  assert.equal(rule(run(k, chars(90)), 'W03').status, 'pass')
  const short = kitWith({ paragraphs: 1, sample: 'Classes every day' })
  assert.equal(rule(run(short, chars(150)), 'W03').status, 'pass')
})

const leadKit = () =>
  kitWith({
    sample: LEAD_SAMPLE,
    paragraphs: 1,
    bullets: 5,
    demoChars: { total: 160, lead: 88, bullets: [7, 26, 9, 15, 7] }
  })

test('W15 fails three equal long sentences in a lead and points slot', () => {
  const rules = run(leadKit(), [
    'Every class starts slowly with a warm up for the whole group and the coach. Then you move on.',
    'Pads and bags follow with a partner of your level, so nobody trains alone at any time. Rest after.',
    'The class ends with a calm stretch and a short talk about the next session together. Go home.'
  ])
  const w15 = rule(rules, 'W15')
  assert.equal(w15.status, 'fail')
  assert.ok(
    w15.failures.some((f) => f.cause === 'point-sentences'),
    JSON.stringify(w15.failures)
  )
  assert.ok(w15.failures.some((f) => f.cause === 'lead-long'))
  assert.equal(rule(rules, 'W03').status, 'fail')
})

test('W15 fails a single string where the demo is a lead and points, and passes a lead with short points', () => {
  assert.equal(rule(run(leadKit(), chars(150)), 'W15').failures[0].cause, 'no-points')
  const lead = `${chars(80)}.`
  const rules = run(leadKit(), [lead, 'Slow warm up', 'Pads with a partner', 'Footwork', 'Calm stretch'])
  assert.equal(rule(rules, 'W15').status, 'pass', JSON.stringify(rule(rules, 'W15').failures))
  assert.equal(rule(rules, 'W03').status, 'pass', JSON.stringify(rule(rules, 'W03').failures))
})
