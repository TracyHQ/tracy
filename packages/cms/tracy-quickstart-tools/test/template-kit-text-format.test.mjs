// Formatted text slots: how many paragraphs and bullets each one shows, measured on the page (the content map's
// markup when the page does not show it), and a sample that gives every part whole, with its lengths. Fabricated studio.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatOf, formatTextSlots, partsOf, textFormatChecks } from '../template-kit/lib/text-format.mjs'

const P1 = 'Ten rounds split between skill work and conditioning, closed with a calm cooldown and breathwork.'
const P2 = 'We opened the Harbour Studio in 2011 with a method that brings the sport to everyday people.'
const QUOTE = `((p))${P1}((/p))\n((p))${P2}((/p))`
const BULLETS = [
  'Warm up',
  'Footwork and guard',
  'Pads with a partner',
  'Core and strength',
  'Cooldown and stretch'
]
const TAB = `((p))Start every session slowly.((/p))\n((ul class="list"))${BULLETS.map((b) => `((li))${b}((/li))`).join('')}((/ul))`

test('a sample splits into its paragraphs and bullets, whatever markup the CMS stores', () => {
  assert.deepEqual(
    partsOf(QUOTE).map((p) => p.kind),
    ['p', 'p']
  )
  assert.deepEqual(
    partsOf(TAB).map((p) => p.kind),
    ['p', 'li', 'li', 'li', 'li', 'li']
  )
  assert.deepEqual(partsOf('<p>One</p><ul><li>Two</li></ul>'), [
    { kind: 'p', text: 'One' },
    { kind: 'li', text: 'Two' }
  ])
  assert.deepEqual(
    partsOf('  Our Classes  '),
    [{ kind: 'p', text: 'Our Classes' }],
    'plain words are one paragraph'
  )
  assert.deepEqual(partsOf('Training ((br/))((span))route((/span))'), [{ kind: 'p', text: 'Training route' }])
})

test('counts come from the page when it shows the slot; the sample gives every part whole', () => {
  const f = formatOf(QUOTE, { paragraphs: [P1, P2, 'Another block words'], bullets: [], texts: [P1, P2] })
  assert.equal(f.paragraphs, 2)
  assert.equal(f.bullets, 0)
  assert.equal(f.formatFrom, 'page')
  const lines = f.sample.split('\n')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines, [P1, P2], 'each paragraph whole, one per line, never cut')
  assert.deepEqual(f.demoChars, { total: P1.length + 1 + P2.length, lead: null, bullets: [] })
})

test('a tab the page does not show is counted from the content map', () => {
  // The tab titles are list items too; one is a word of the paragraph, one repeats a bullet.
  const tabs = ['SLOWLY', 'Warm up', 'ADVANCED']
  const shown = formatOf(TAB, {
    paragraphs: ['Start every session slowly.'],
    bullets: [...tabs, ...BULLETS],
    texts: []
  })
  assert.deepEqual([shown.paragraphs, shown.bullets, shown.formatFrom], [1, 5, 'page'])
  assert.match(shown.sample, /\n- Warm up\n- Footwork and guard/)
  const hidden = formatOf(TAB, { paragraphs: [], bullets: [], texts: [] })
  assert.deepEqual([hidden.paragraphs, hidden.bullets, hidden.formatFrom], [1, 5, 'content map'])
})

test('a heading shown as one text is one paragraph', () => {
  const f = formatOf('Our Classes', { paragraphs: [], bullets: [], texts: ['Our Classes'] })
  assert.deepEqual([f.paragraphs, f.bullets, f.formatFrom, f.sample], [1, 0, 'page', 'Our Classes'])
})

test('self-check: every declared text slot says how many paragraphs and bullets it has', () => {
  const blocks = [
    {
      id: 'quote-1',
      slots: [
        { id: 'quote-1.1', type: 'text', paragraphs: 2, bullets: 0 },
        { id: 'quote-1.2', type: 'text' },
        { id: 'quote-1.3', type: 'url' }
      ],
      lists: [{ rows: [{ slots: [{ id: 'quote-1.4', type: 'text', paragraphs: 1 }] }] }],
      demoOwned: []
    }
  ]
  const errors = []
  assert.equal(textFormatChecks({ blocks, errors }), 2)
  assert.deepEqual(
    errors.map((e) => e.slot),
    ['quote-1.2', 'quote-1.4']
  )
})

test('a menu label shown as a list item is one text, not a bullet', () => {
  const f = formatOf('Home', { paragraphs: [], bullets: ['Home', 'Classes'], texts: ['Home'] })
  assert.deepEqual([f.paragraphs, f.bullets], [1, 0])
})

test('the kit formats every declared text slot from the content map sample and the block page reading', () => {
  const block = {
    id: 'quote-1',
    slots: [{ id: 'quote-1.2', type: 'text', sample: 'Ten rounds split between skill wo' }],
    lists: [],
    demoOwned: [
      { id: 'quote-1.3', sample: 'Sam Doe' },
      { id: 'quote-1.4', sample: 'images/a.png' }
    ]
  }
  const raw = {
    'quote-1.2': { type: 'text', sample: QUOTE },
    'quote-1.3': { type: 'text', sample: 'Sam Doe' }
  }
  formatTextSlots({
    blocks: [block],
    slotOf: (id) => raw[id] ?? { type: 'image' },
    detailsOf: () => ({ paragraphs: [P1, P2], bullets: [], texts: ['Sam Doe'] })
  })
  assert.equal(block.slots[0].paragraphs, 2)
  assert.match(block.slots[0].sample, /\nWe opened/)
  assert.deepEqual([block.demoOwned[0].type, block.demoOwned[0].paragraphs], ['text', 1])
  assert.equal(block.demoOwned[1].paragraphs, undefined, 'a picture is no text slot')
  assert.equal(textFormatChecks({ blocks: [block], errors: [] }), 0)
})

test('a page reading without bullets (an older capture) counts bullets from the content map', () => {
  const f = formatOf(TAB, { paragraphs: ['Start every session slowly.'], texts: [] })
  assert.deepEqual([f.paragraphs, f.bullets], [1, 5])
})
