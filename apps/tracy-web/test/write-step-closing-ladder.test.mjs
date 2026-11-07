// The closing rule: a slot or frame the plan keeps visible but that holds no customer content is never handed over with its demo.
// It is used if a value exists by now, else emptied at the smallest unit that leaves no orphan, else said. Kit, copy and site are
// the invented ones of the copy check fixtures (demo-gym, Quay Fitness Studio), with a stat card added to the hero.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy as baseCopy, KIT, runStep } from './_write-step-run.mjs'
import { picturePackage, pictureKit, runPictures } from './_write-step-pictures.mjs'

/** The keys the picture fixtures' site holds (`_write-step-pictures.mjs`). */
const PICTURE_KEYS = [
  'module-2.pic',
  'article-7.5',
  'module-2.figure',
  'module-2.gone',
  'module-3.icon',
  'module-88.0',
  'module-88.1'
]

const text = (id, role, max, sample) => ({
  id,
  role,
  type: 'text',
  maxCharacters: max,
  sample,
  paragraphs: 1
})

/** The hero with a stat card: a number and its label in one list, one card. */
function withStatCard() {
  const kit = KIT()
  const hero = kit.doc.blocks.find((b) => b.id === 'block-2')
  hero.lists = [
    {
      id: 'block-2.stat',
      rowSlots: [
        text('block-2.7', 'stat.value', 8, '100k+'),
        text('block-2.8', 'stat.label', 30, 'Members trained')
      ]
    }
  ]
  return kit
}

const hideable = (keys) => (slot) => (keys.includes(slot.key) ? { canHide: true } : {})
/** The site holds the stat card's slots, which the base kit does not list. */
const STAT_KEYS = ['module-2.7', 'module-2.8']

test('a returned stat number is emptied together with the label written beside it', async () => {
  const kit = withStatCard()
  const copy = baseCopy()
  // The writer wrote the label and returned the number: no fact gives one.
  copy.slots.push({ slot: 'block-2.8', owner: 'writer', text: 'Members coached', factIds: ['f-name'] })
  copy.returns = [{ page: 'shared', slot: 'block-2.7', reason: 'No fact states a number.' }]
  const { report, site, line } = await runStep(
    { copy },
    { extraKeys: STAT_KEYS, overSlot: hideable(STAT_KEYS) },
    { kit }
  )
  assert.equal(report.status, 'done')
  assert.equal(site.held['module-2.7'], '')
  assert.equal(site.held['module-2.8'], '', 'the label leaves with its number, no orphan label stays')
  for (const slot of ['block-2.7', 'block-2.8']) {
    assert.equal(line(slot).status, 'hidden')
    assert.equal(line(slot).closing, 'hidden')
  }
  assert.match(line('block-2.7').reason, /the writer returned this slot \(No fact states a number\.\)/)
  assert.match(line('block-2.8').reason, /goes with block-2\.7 in block-2\.stat/)
  assert.deepEqual(
    report.closing.map((c) => [c.slot, c.rung]),
    [
      ['block-2.7', 'hidden'],
      ['block-2.8', 'hidden']
    ]
  )
})

test('a slot no file fills that the site cannot empty is said to keep its demo, never written as fine', async () => {
  const kit = withStatCard()
  const { report, line } = await runStep(
    {},
    { extraKeys: STAT_KEYS, overSlot: hideable(['module-2.7']) },
    { kit }
  )
  assert.equal(report.status, 'done')
  const number = line('block-2.7')
  assert.equal(number.status, 'failed')
  assert.equal(number.closing, 'demo-remains')
  assert.match(number.reason, /the demo content remains on the site/)
})

test('a slot that has a value by the time of the write is left to it', async () => {
  const kit = withStatCard()
  const copy = baseCopy()
  copy.slots.push(
    { slot: 'block-2.7', owner: 'writer', text: '12', factIds: ['f-name'] },
    { slot: 'block-2.8', owner: 'writer', text: 'Coaches', factIds: ['f-name'] }
  )
  const { report, site, line } = await runStep(
    { copy },
    { extraKeys: STAT_KEYS, overSlot: hideable(STAT_KEYS) },
    { kit }
  )
  assert.equal(site.held['module-2.7'], '12')
  assert.equal(line('block-2.7').status, 'written')
  assert.equal(report.closing, undefined)
})

test('a frame whose drawn pictures were all rejected is emptied rather than keep the demo photo', async () => {
  const kit = pictureKit()
  kit.doc.blocks
    .find((b) => b.id === 'block-2')
    .slots.push({ id: 'block-2.lost', role: 'business.photo', type: 'image', maxCharacters: 255 })
  const pictures = picturePackage()
  pictures.problems = [
    {
      where: 'block-2.lost',
      detail: 'no picture is left for this frame after: draw rejected; redraw rejected'
    }
  ]
  const lost = ['module-2.lost']
  const { report, site, line } = await runPictures({
    files: { pictures },
    kit,
    site: { contract: { extraKeys: [...PICTURE_KEYS, ...lost], overSlot: hideable(lost) } }
  })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.ok(
    site.of('content.contract').some((c) => (c.params.empty_slots ?? []).includes('module-2.lost')),
    'the frame is emptied through the contract'
  )
  assert.equal(line('block-2.lost').status, 'hidden')
  assert.match(line('block-2.lost').reason, /the picture step left this frame without a picture/)
})
