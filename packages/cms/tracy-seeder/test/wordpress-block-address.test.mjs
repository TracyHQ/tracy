/**
 * A WordPress slot is found by its block's `metadata.name`, or, for a block with no name (or one that repeats a name), by
 * its POSITION: `blockType` + `occurrence` (TracyHQ/tracy#139). The capture (`capture-all-text.mjs`) makes those
 * addresses; this file pins that the writer reaches the very block the capture read, writes it, and reads the value back
 * equal, in a page and in a header template part. The fixture is a made-up tea room.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyWordPressContract, setBlockValue, writeSlotValue } from '../src/apply-wordpress-contract.mjs'
import { readSlotValue } from '../src/wordpress-block-address.mjs'
import { allTextSlots } from '../../tracy-wordpress-quickstart/scripts/capture-all-text.mjs'

const wp = (type, inner, attrs = '') =>
  `<!-- wp:${type}${attrs ? ` ${attrs}` : ''} -->\n${inner}\n<!-- /wp:${type} -->`
const named = (type, name, inner, extra = '') => wp(type, inner, `{"metadata":{"name":"${name}"}${extra}}`)

const PAGE = [
  wp('heading', '<h1 class="wp-block-heading">Larkspur <br>Tea Room</h1>', '{"level":1}'),
  named('paragraph', 'intro', '<p>Open daily, all year.</p>'),
  wp('paragraph', '<p>Scones at 7am. <a href="/menu/">See the menu</a> or <a href="/book/">book</a>.</p>'),
  wp('paragraph', '<p>Scones are baked at 7am.</p>'),
  named('paragraph', 'intro', '<p>A second block of the same name</p>'),
  wp(
    'buttons',
    wp(
      'button',
      '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/book/">Book now</a></div>'
    )
  ),
  wp(
    'list',
    `${wp('list-item', '<li>Pot of tea</li>')}\n${wp('list-item', '<li>Cream scone<!-- wp:list -->\n<ul><!-- wp:list-item -->\n<li>Jam</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list --></li>')}`
  ),
  wp('list', '<ul class="wp-block-list"><li>Soup of the day</li><li>Rye toast</li></ul>'),
  wp('quote', `${wp('paragraph', '<p>The best scones in the valley.</p>')}\n<cite>Mira Holt</cite>`),
  wp(
    'table',
    '<figure class="wp-block-table"><table><tbody><tr><td>Mon</td><td>9 to 5</td></tr></tbody></table></figure>'
  ),
  '<!-- wp:navigation-link {"label":"Visit us","url":"/visit/","kind":"custom"} /-->'
].join('\n')

const HEADER = [
  wp(
    'group',
    [
      '<!-- wp:site-title /-->',
      '<!-- wp:navigation-link {"label":"Menu","url":"/menu/","kind":"custom"} /-->',
      '<!-- wp:navigation-link {"label":"Book a table","url":"/book/","kind":"custom"} /-->',
      wp('paragraph', '<p>Call 555 0100 to book</p>')
    ].join('\n'),
    '{"tagName":"header"}'
  )
].join('\n')

const nameProblem = () => null
const slotsOf = (content, prefix, entityKey) =>
  allTextSlots({ content, entityKey, prefix, nameProblem }).slots

test('every slot the capture makes reads back its own sample from the markup it was captured from', () => {
  for (const [content, prefix] of [
    [PAGE, 'home'],
    [HEADER, 'part-header']
  ]) {
    const slots = slotsOf(content, prefix, `x-${prefix}`)
    assert.ok(
      slots.some((s) => s.target.blockType),
      'the fixture has slots found by position'
    )
    for (const slot of slots) assert.equal(readSlotValue(content, slot.target), slot.sample, slot.key)
  }
})

test('a slot found by position is written, reads back equal, and leaves every other slot as it was', () => {
  const slots = slotsOf(PAGE, 'home', 'page-home')
  for (const slot of slots) {
    const value = slot.type === 'url' ? '/new-place/' : `New words & more for ${slot.key}`
    const next = writeSlotValue(PAGE, slot.target, value)
    assert.equal(readSlotValue(next, slot.target), value, slot.key)
    for (const other of slots)
      if (other.key !== slot.key && !sharesField(other, slot))
        assert.equal(readSlotValue(next, other.target), other.sample, `${slot.key} left ${other.key}`)
  }
})

/** A text and the links inside it are one field: writing the text drops its links, as the contract writes plain text. */
const sharesField = (a, b) =>
  JSON.stringify({ ...a.target, attr: 0, link: 0 }) === JSON.stringify({ ...b.target, attr: 0, link: 0 })

test('a named slot is written exactly as the named writer always wrote it', () => {
  const target = { block: 'intro', attr: 'content' }
  assert.equal(writeSlotValue(PAGE, target, 'Hello'), setBlockValue(PAGE, 'intro', 'content', 'Hello'))
  assert.equal(readSlotValue(PAGE, target), 'Open daily, all year.')
})

test('a position past the last block of that type is refused, never written somewhere else', () => {
  assert.throws(
    () => writeSlotValue(PAGE, { blockType: 'heading', occurrence: 2, attr: 'content' }, 'x'),
    /heading 2 is not in this markup/
  )
  assert.equal(readSlotValue(PAGE, { blockType: 'heading', occurrence: 2, attr: 'content' }), null)
})

test('the contract writer writes a position slot of a page and the slots of the header part, each in one read and one write', async () => {
  const store = { page: PAGE, header: HEADER }
  const calls = []
  const ops = {
    find: async (type, slug) => (calls.push(['find', type, slug]), slug === 'home' ? 10 : null),
    readContent: async (id) => (calls.push(['readContent', id]), id === 10 ? store.page : null),
    setContent: async (id, content) => {
      calls.push(['setContent', id])
      store.page = content
    },
    readPart: async (slug) => (calls.push(['readPart', slug]), slug === 'header' ? store.header : null),
    setPart: async (slug, content) => {
      calls.push(['setPart', slug])
      store.header = content
    },
    setOption: async () => {}
  }
  const home = { key: 'page-home', kind: 'page', identity: { postType: 'page', slug: 'home' } }
  const header = { key: 'part-header', kind: 'templatePart', identity: { slug: 'header' } }
  const nav = { blockType: 'navigation-link', occurrence: 2, attr: 'label' }
  const writes = [
    {
      slot: 'home.paragraph.3',
      entity: home,
      target: { blockType: 'paragraph', occurrence: 3, attr: 'content' },
      value: 'Fresh bread daily.'
    },
    { slot: 'part-header.navigation-link.2', entity: header, target: nav, value: 'Reserve' },
    {
      slot: 'part-header.paragraph.1',
      entity: header,
      target: { blockType: 'paragraph', occurrence: 1, attr: 'content' },
      value: 'Call us to reserve'
    }
  ]
  const r = await applyWordPressContract({ ops, writes })
  assert.deepEqual(r.skipped, [])
  assert.deepEqual(
    r.written.map((w) => w.slot),
    writes.map((w) => w.slot)
  )
  assert.deepEqual(calls, [
    ['find', 'page', 'home'],
    ['readContent', 10],
    ['setContent', 10],
    ['readPart', 'header'],
    ['setPart', 'header']
  ])
  assert.equal(readSlotValue(store.page, writes[0].target), 'Fresh bread daily.')
  assert.equal(readSlotValue(store.header, nav), 'Reserve')
  assert.equal(readSlotValue(store.header, writes[2].target), 'Call us to reserve')
  assert.equal(readSlotValue(store.header, { ...nav, occurrence: 1 }), 'Menu')
})
