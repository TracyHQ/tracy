// Font icon values are verified as body classes, never as visible words.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pagePrints, printedSlotsOf } from '../src/lib/printed-in-body.js'
import { writtenNotPrintedGroup } from '../src/site-check/written-not-printed.js'

const body = (inner, head = '') => `<html><head>${head}</head><body>${inner}</body></html>`

test('a text-valued icon slot needs its complete classes on a body icon element, not visible class words', () => {
  const kit = { blocks: [{ slots: [{ id: 'block-social.1', type: 'text', role: 'editorial.item_icon' }] }] }
  const slots = printedSlotsOf(
    [{ slot: 'block-social.1', status: 'written', ordered: 'fa fa-instagram' }],
    kit
  )
  assert.deepEqual(slots, [{ slot: 'block-social.1', kind: 'icon', value: 'fa fa-instagram' }])
  assert.deepEqual(
    pagePrints(body('<a href="/social"><i class="extra fa-instagram fa" aria-hidden="true"></i></a>'), slots)
      .notPrinted,
    []
  )
  for (const markup of [
    '<i class="fa fa-facebook"></i>',
    '<i class="fa fa-instagram-other"></i>',
    '<p>fa fa-instagram</p>',
    '<div data-icon="fa fa-instagram"></div>',
    '<script><i class="fa fa-instagram"></i></script>',
    ''
  ])
    assert.deepEqual(pagePrints(body(markup, '<i class="fa fa-instagram"></i>'), slots).notPrinted, [
      'block-social.1'
    ])
  const pair = [...slots, { ...slots[0], slot: 'block-social.2' }]
  assert.deepEqual(pagePrints(body('<span class="fa fa-instagram"></span>'), pair).notPrinted, [
    'block-social.2'
  ])
})

test('the site check accepts a rendered icon and reports a missing glyph as an icon failure', async () => {
  const slot = 'block-social.1'
  const kit = {
    blocks: [{ id: 'block-social', slots: [{ id: slot, type: 'text', role: 'editorial.item_icon' }] }],
    pages: [{ id: 'home', blocks: { 1440: ['block-social'] } }]
  }
  const report = {
    keptPages: [{ id: 'home', path: '/' }],
    slots: [{ slot, status: 'written', ordered: 'fa fa-instagram' }]
  }
  const shown = await writtenNotPrintedGroup.run({
    kit,
    report,
    pageHtml: async () => body('<i class="fa fa-instagram"></i>')
  })
  assert.equal(shown.checked, 1)
  assert.deepEqual(shown.failures, [])
  const missing = await writtenNotPrintedGroup.run({
    kit,
    report,
    pageHtml: async () => body('<i class="fa fa-facebook"></i>')
  })
  assert.equal(missing.failures[0].slot, slot)
  assert.equal(missing.failures[0].ordered, 'fa fa-instagram')
  assert.match(missing.failures[0].reason, /icon.*classes/)
})
