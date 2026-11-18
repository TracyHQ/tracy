// The only label of a control that stays on the page is never hidden alone (ADR 0044, decision 31): a button whose words go and
// whose link stays prints an arrow with no words. The write step uses words a file has for the label, else takes the control
// itself, else keeps the label's demo words and says so. A plan that takes the control too is unchanged. Everything is invented:
// the demo-gym kit and plan, with one made-up button on the hero block whose label is the slot the plan hides.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideKit, planHiding, runHide } from './_write-step-hide.mjs'
import { copy } from './_write-step-run.mjs'

const BUTTON = 'block-2.link-1'
const LABEL = 'block-2.3'
const lineOf = (report, slot) => report.slots.find((s) => s.slot === slot)
const emptied = (site) => site.applies().flatMap((c) => c.params.empty_slots ?? [])
const written = (site) => Object.assign({}, ...site.applies().map((c) => c.params.changes ?? {}))

/** The hide kit with a hero button whose only words are the slot the plan hides. */
function buttonKit() {
  const kit = hideKit()
  const hero = kit.doc.blocks.find((b) => b.id === 'block-2')
  hero.links = [{ id: BUTTON, position: 0, label: 'A SHORT LINE', target: '/about-us', labelId: LABEL }]
  return kit
}

/** A site on which the button's address is a url slot of the label's own row, which may be emptied, or no slot at all. */
const site = (withAddress) => ({
  extraKeys: withAddress ? ['module-2.4'] : [],
  overSlot: (slot) => {
    if (!withAddress) return {}
    if (slot.key === 'module-2.3') return { group: { id: 'hero-button' }, type: 'text', current: 'Go' }
    if (slot.key === 'module-2.4')
      return {
        group: { id: 'hero-button' },
        type: 'url',
        role: 'editorial.navigation_url',
        sample: '/about-us',
        current: '/about-us',
        canHide: true
      }
    return {}
  }
})

test('a label whose control no door takes keeps its demo words, and its line says why', async () => {
  const { report, site: door } = await runHide({ kit: buttonKit(), site: site(false) })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.ok(!emptied(door).includes('module-2.3'), 'the button keeps its words')
  const line = lineOf(report, LABEL)
  assert.equal(line.status, 'failed')
  assert.equal(line.part, 'control-label')
  assert.match(line.reason, /only label of block-2\.link-1/)
  assert.match(line.reason, /demo words remain/)
})

test('a plan that hides the control too, when the control cannot leave, still keeps the label', async () => {
  const files = { plan: planHiding([BUTTON]) }
  const { report, site: door } = await runHide({ kit: buttonKit(), site: site(false), files })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.ok(!emptied(door).includes('module-2.3'))
  assert.equal(lineOf(report, BUTTON).status, 'failed')
  assert.equal(lineOf(report, LABEL).status, 'failed')
  assert.match(lineOf(report, LABEL).reason, /only label of block-2\.link-1/)
})

test('a label whose control can leave takes the control with it, at its row, and both lines say so', async () => {
  const { report, site: door } = await runHide({ kit: buttonKit(), site: site(true) })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.deepEqual(
    emptied(door)
      .filter((k) => k.startsWith('module-2.'))
      .sort(),
    ['module-2.3', 'module-2.4']
  )
  assert.equal(lineOf(report, LABEL).status, 'hidden')
  const control = lineOf(report, BUTTON)
  assert.equal(control.status, 'hidden')
  assert.equal(control.part, 'control')
  assert.match(control.reason, /only label/)
  assert.match(control.reason, /module-2\.4/)
})

test('a plan that hides the control and its address is unchanged', async () => {
  const files = { plan: planHiding([BUTTON, 'block-2.4']) }
  const { report, site: door } = await runHide({ kit: buttonKit(), site: site(true), files })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.deepEqual(
    emptied(door)
      .filter((k) => k.startsWith('module-2.'))
      .sort(),
    ['module-2.3', 'module-2.4']
  )
  assert.equal(lineOf(report, LABEL).status, 'hidden')
  assert.match(lineOf(report, LABEL).reason, /^the plan hides this slot$/)
  assert.equal(lineOf(report, BUTTON).status, 'hidden')
  assert.doesNotMatch(lineOf(report, BUTTON).reason, /only label/)
})

test('a label the copy has words for is written with them rather than hidden', async () => {
  const c = copy()
  c.slots.push({ slot: LABEL, owner: 'writer', text: 'Book a class', factIds: [] })
  const { report, site: door } = await runHide({ kit: buttonKit(), site: site(false), files: { copy: c } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.ok(!emptied(door).includes('module-2.3'))
  assert.equal(written(door)['module-2.3'], 'Book a class')
  const line = lineOf(report, LABEL)
  assert.equal(line.status, 'written')
  assert.equal(line.part, 'control-label')
  assert.match(line.reason, /only label of block-2\.link-1/)
})

test('a button the plan drops whole is no concern of the guard: its label goes with its block', async () => {
  const kit = buttonKit()
  const fourth = kit.doc.blocks.find((b) => b.id === 'block-4')
  fourth.links = [{ id: 'block-4.link-1', label: 'OUR PRICES', target: '/about-us', labelId: 'block-4.1' }]
  const { report } = await runHide({ kit, site: site(false) })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(lineOf(report, 'block-4.1').status, 'hidden')
  assert.equal(lineOf(report, 'block-4.link-1'), undefined)
})
