// Slot shape self-checks (slot-shape-checks.mjs) and inline marks (inline-marks.mjs): a kit made by an older tool is
// caught against the content map, never read green. Fabricated studio, fabricated content map.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inlineOf } from '../template-kit/lib/inline-marks.mjs'
import { settleSentenceGroups } from '../template-kit/lib/sentence-groups.mjs'
import { slotShapeChecks } from '../template-kit/lib/slot-shape-checks.mjs'
import { settleSamples } from '../template-kit/lib/slot-samples.mjs'

const INTRO =
  'Ten rounds split between skill work and conditioning, closed with a calm cooldown for everyone.'
const map = {
  slots: [
    { key: 'module-7.1', type: 'text', sample: INTRO },
    { key: 'module-7.2', type: 'text', sample: '((span))TOP((/span)) HARBOUR STUDIO since 2011' },
    {
      key: 'module-7.3',
      type: 'text',
      sample: 'Join over ',
      xpath: '/div/h3/text()[1]',
      entity: 'module-7',
      column: 'params'
    },
    {
      key: 'module-7.4',
      type: 'text',
      sample: '900',
      xpath: '/div/h3/span/text()',
      entity: 'module-7',
      column: 'params'
    },
    {
      key: 'module-7.5',
      type: 'text',
      sample: ' members',
      xpath: '/div/h3/text()[2]',
      entity: 'module-7',
      column: 'params'
    }
  ]
}
const slot = (id, sample) => ({ id, type: 'text', sample, paragraphs: 1, bullets: 0 })
const staleKit = () => ({
  checks: { orphanTexts: 0 },
  coverage: { parts: {}, failures: [{ part: 'slotsMissing', where: 'x', reason: 'kept' }] },
  blocks: [
    {
      id: 'block-7',
      slots: [
        slot('block-7.1', 'Ten rounds split between skill work and…'),
        slot('block-7.2', 'TOP HARBOUR STUDIO since 2011'),
        slot('block-7.3', 'Join over'),
        slot('block-7.4', '900'),
        slot('block-7.5', 'members')
      ]
    }
  ]
})

test('inline marks: an emphasised word, its place, a line break; links and icons are not emphasis', () => {
  assert.deepEqual(inlineOf('((span))TOP((/span)) HARBOUR STUDIO'), [
    { tag: 'span', attrs: '', text: 'TOP', at: 'start' }
  ])
  assert.deepEqual(inlineOf('Training ((br/))((span class="hi"))route((/span))'), [
    { tag: 'br' },
    { tag: 'span', attrs: 'class="hi"', text: 'route', at: 'end' }
  ])
  assert.deepEqual(inlineOf('$90.00((span))/class((/span))')[0].at, 'end')
  assert.deepEqual(inlineOf('Our ((strong))best((/strong)) class')[0].at, 'inside')
  assert.deepEqual(inlineOf('((div))((a href="#"))((i class="icon"))((/i))((/a))((/div))'), [])
  assert.deepEqual(inlineOf('((p))Plain words((/p))'), [])
})

test('samplesCut counts a cut sample or a missing demoChars, and settling brings it to 0', () => {
  const kit = staleKit()
  const before = slotShapeChecks(kit, { map })
  assert.equal(before.samplesCut, 5)
  assert.ok(kit.coverage.failures.some((f) => f.part === 'samplesCut' && f.where === 'slots[block-7.1]'))
  assert.ok(
    kit.coverage.failures.some((f) => f.part === 'slotsMissing'),
    'other failures are kept'
  )
  settleSamples(kit, { map })
  assert.equal(slotShapeChecks(kit, { map }).samplesCut, 0)
  assert.equal(kit.checks.samplesCut, 0)
  assert.ok(!kit.coverage.failures.some((f) => f.part === 'samplesCut'))
})

test('inlineEmphasisMissing counts a slot whose demo marks words and the kit slot does not', () => {
  const kit = staleKit()
  assert.equal(slotShapeChecks(kit, { map }).inlineEmphasisMissing, 1)
  assert.ok(
    kit.coverage.failures.some((f) => f.part === 'inlineEmphasisMissing' && f.where === 'slots[block-7.2]')
  )
  settleSamples(kit, { map })
  assert.deepEqual(kit.blocks[0].slots[1].inline, [{ tag: 'span', attrs: '', text: 'TOP', at: 'start' }])
  assert.equal(slotShapeChecks(kit, { map }).inlineEmphasisMissing, 0)
})

test('sentenceGroupsUnsettled counts a block whose sentence groups were never settled', () => {
  const kit = staleKit()
  assert.equal(slotShapeChecks(kit, { map }).sentenceGroupsUnsettled, 1)
  assert.ok(
    kit.coverage.failures.some((f) => f.part === 'sentenceGroupsUnsettled' && f.where === 'blocks[block-7]')
  )
  settleSentenceGroups(kit, { map })
  assert.equal(kit.blocks[0].sentences.length, 1)
  assert.equal(slotShapeChecks(kit, { map }).sentenceGroupsUnsettled, 0)
})

test('inlineMarkupLost comes from the content coverage measurement, and is 1 when a whole-unit map was not measured', () => {
  const unitMap = {
    slots: [
      ...map.slots,
      { key: 'module-8.0', type: 'text', sample: 'Our Classes', xpath: '/html/body/div', entity: 'module-8' }
    ]
  }
  assert.equal('inlineMarkupLost' in slotShapeChecks(staleKit(), { map: unitMap }), false, 'not asked')
  assert.equal(slotShapeChecks(staleKit(), { map, contentCoverage: null }).inlineMarkupLost, 0)
  const unmeasured = staleKit()
  assert.equal(slotShapeChecks(unmeasured, { map: unitMap, contentCoverage: null }).inlineMarkupLost, 1)
  assert.ok(
    unmeasured.coverage.failures.some((f) => f.part === 'inlineMarkupLost' && f.where === 'content-map')
  )
  const lost = staleKit()
  const contentCoverage = { inlineMarkup: { lost: 2, lostSlots: ['module-8.0', 'module-9.1'] } }
  assert.equal(slotShapeChecks(lost, { map: unitMap, contentCoverage }).inlineMarkupLost, 2)
  assert.equal(lost.checks.inlineMarkupLost, 2)
  assert.deepEqual(
    lost.coverage.failures.filter((f) => f.part === 'inlineMarkupLost').map((f) => f.where),
    ['contentMap.slots[module-8.0]', 'contentMap.slots[module-9.1]']
  )
  const settled = { inlineMarkup: { lost: 0, lostSlots: [] } }
  assert.equal(slotShapeChecks(lost, { map: unitMap, contentCoverage: settled }).inlineMarkupLost, 0)
  assert.equal(lost.coverage.failures.filter((f) => f.part === 'inlineMarkupLost').length, 0)
})
