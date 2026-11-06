// The site check's `accent-emphasis` (ADR 0044 decision 19): a heading the demo marks with an accent span prints one in the brand
// accent. Kit, pages and colours are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judgeAccentEmphasis } from '../src/site-check/accent-emphasis.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'

const KIT = {
  blocks: [
    {
      id: 'block-2',
      slots: [
        { id: 'block-2.1', type: 'text', inline: [{ tag: 'span', attrs: '', text: 'NO1', at: 'start' }] },
        { id: 'block-2.2', type: 'text' }
      ]
    }
  ]
}
const HEAD = 'tracy brand style accent-only: replaces=#e03a3e accent=#bf5b3d family=#e03a3e words=#c4623f'
const page = (spans) => [
  {
    path: '/',
    width: 1440,
    brandStyle: { worn: true, head: HEAD },
    headingSpans: [{ text: 'European Coaching in Dubai', color: 'rgb(255, 255, 255)', spans }]
  }
]
const line = (ordered) => [{ slot: 'block-2.1', status: 'written', ordered }]

test('a heading with an accent span in the brand accent is fine', () => {
  const r = judgeAccentEmphasis(
    KIT,
    line('European Coaching in ((span))Dubai((/span))'),
    page([{ text: 'Dubai', color: 'rgb(191, 91, 61)' }])
  )
  assert.deepEqual([r.checked, r.failures], [1, []])
})

test('no span blocks: on the writer when the copy marks none, on the write step when it does', () => {
  const writer = judgeAccentEmphasis(KIT, line('European Coaching in Dubai'), page([]))
  assert.deepEqual(
    writer.failures.map((f) => [f.level, f.causingStep, f.slot]),
    [['block', 6, 'block-2.1']]
  )
  const write = judgeAccentEmphasis(KIT, line('European Coaching in ((span))Dubai((/span))'), page([]))
  assert.deepEqual(
    write.failures.map((f) => [f.level, f.causingStep]),
    [['block', 9]]
  )
})

test('a span in a fixed template colour is a step 0 warning; a heading no page prints is not judged', () => {
  const r = judgeAccentEmphasis(
    KIT,
    line('European Coaching in ((span))Dubai((/span))'),
    page([{ text: 'Dubai', color: 'rgb(0, 128, 255)' }])
  )
  assert.deepEqual(
    r.failures.map((f) => [f.level, f.causingStep]),
    [['warn', 0]]
  )
  assert.equal(judgeAccentEmphasis(KIT, line('Something else'), page([])).checked, 0)
  assert.ok(PAGE_CHECK_GROUPS.some((g) => g.name === 'accent-emphasis'))
})

const measure = (path, headings, width = 1440) => ({
  path,
  width,
  brandStyle: { worn: true, head: HEAD },
  headingSpans: headings
})

test('a heading broken onto two lines is found as the page prints it, a space where the break is', () => {
  const r = judgeAccentEmphasis(KIT, line('European Coaching((br/))((span))Dubai((/span))'), [
    measure('/', [{ text: 'EUROPEAN COACHING DUBAI', spans: [{ text: 'DUBAI', color: 'rgb(191, 91, 61)' }] }])
  ])
  assert.deepEqual([r.checked, r.failures], [1, []])
})

test('content map codes printed as words block on the write step, whatever the slot or the page', () => {
  const r = judgeAccentEmphasis(KIT, line('European Coaching((br/))((span))Dubai((/span))'), [
    measure('/classes/evening', [
      { text: 'EUROPEAN COACHING((BR/))((SPAN))DUBAI((/SPAN))', spans: [] },
      { text: 'OPEN((BR/))LATE', spans: [{ text: 'LATE', color: 'rgb(191, 91, 61)' }] }
    ])
  ])
  assert.deepEqual(
    r.failures.map((f) => [f.level, f.causingStep, f.page, f.slot]),
    [
      ['block', 9, '/classes/evening', 'block-2.1'],
      ['block', 9, '/classes/evening', null]
    ]
  )
  assert.match(r.failures[0].reason, /codes/)
  assert.equal(r.checked, 2)
})

test('a heading printed on several pages is judged on each of them', () => {
  const r = judgeAccentEmphasis(KIT, line('European Coaching in ((span))Dubai((/span))'), [
    measure('/', [
      { text: 'European Coaching in Dubai', spans: [{ text: 'Dubai', color: 'rgb(191, 91, 61)' }] }
    ]),
    measure('/about', [{ text: 'European Coaching in Dubai', spans: [] }]),
    measure('/about', [{ text: 'European Coaching in Dubai', spans: [] }], 390)
  ])
  assert.deepEqual(
    r.failures.map((f) => [f.page, f.causingStep]),
    [['/about', 9]]
  )
  assert.equal(r.checked, 2)
})
