// Write-step doors and plan repairs measured on dev lat32 (23/11/2026). A phone or e-mail link the template prints from its own
// words follows them, never the row's address slot; the look guard lets the record alt stage give a picture its alt and
// nothing else; a credit link of the template leaves with its line; a block the kit does not share is its one page's.
// Every site, slot and word here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkDoors } from '../src/write-step/link-doors.js'
import { lineOrder } from '../src/write-step/link-lines.js'
import { altOnlyUpdate } from '../src/write-step/look-guard-alts.js'
import { withCreditLinksHidden } from '../src/site-planner/plan-undecided-links.js'
import { withUnsharedBlocksOnTheirPage } from '../src/site-planner/plan-shape-repairs.js'

const url = (key, item) => ({
  key,
  entity: 'module-7',
  column: 'params',
  type: 'url',
  role: 'editorial.navigation_url',
  sample: '#',
  current: '#',
  group: { id: `module-7.item.${item}`, item, kind: 'service' }
})
const words = (key, item, sample, role) => ({
  key,
  entity: 'module-7',
  column: 'params',
  type: 'text',
  role,
  sample,
  current: sample,
  group: { id: `module-7.item.${item}`, item, kind: 'service' }
})
const KIT = {
  blocks: [
    {
      id: 'block-7',
      source: { entity: 'module-7' },
      links: [
        {
          id: 'block-7.4',
          label: 'PRIVATE COACHING',
          target: null,
          labelId: 'block-7.2',
          action: 'page-control'
        },
        // Its id names the second card's address slot, which holds "#", not this address.
        {
          id: 'block-7.5',
          label: 'desk@example.test',
          target: 'mailto:desk@example.test',
          labelId: 'block-7.11',
          action: 'contact'
        },
        {
          id: 'block-7.link-3',
          label: '(000) 555-0101',
          target: 'tel:(000) 555-0101',
          labelId: 'block-7.14',
          action: 'contact'
        }
      ]
    }
  ]
}
const reading = {
  slots: [
    url('module-7.4', 0),
    url('module-7.5', 1),
    words('module-7.2', 0, 'PRIVATE COACHING', 'offering.name'),
    words('module-7.11', 1, 'desk@example.test', 'contact.email'),
    words('module-7.14', 0, '(000) 555-0101', 'contact.phone')
  ]
}

test("a phone or e-mail link the template prints from its words follows them; the row's address slot is the title's", () => {
  const doorOf = linkDoors({ kit: KIT, reading, rows: [] })
  assert.deepEqual(doorOf('block-7.4').keys, ['module-7.4'])
  for (const id of ['block-7.5', 'block-7.link-3']) {
    const door = doorOf(id)
    assert.equal(door.via, 'from-words', id)
    const line = lineOrder(
      { slot: id, content: 'phone:f-1' },
      door,
      { kind: 'phone', url: 'tel:+15550101' },
      {
        hiddenKeys: new Map(),
        leaving: new Set()
      }
    )
    assert.equal(line.status, 'skipped', id)
  }
})

test('the look guard lets through an update that changes only the alts of pictures of a row read first', () => {
  const html = '<p>Words stay.</p><img src="images/tracy-content/a.jpg">'
  const images = JSON.stringify({ image_intro: 'images/tracy-content/b.jpg', image_intro_alt: '' })
  const state = { rows: new Map([['article:4', { introtext: html, images }]]) }
  const update = (fields) => altOnlyUpdate({ kind: 'article', id: 4, fields }, state)
  assert.equal(
    update({
      introtext: '<p>Words stay.</p><img alt="Tea on the terrace" src="images/tracy-content/a.jpg">'
    }),
    true
  )
  assert.equal(
    update({
      images: JSON.stringify({ image_intro: 'images/tracy-content/b.jpg', image_intro_alt: 'A tea glass' })
    }),
    true
  )
  assert.equal(
    update({ introtext: '<p>Words changed.</p><img alt="x" src="images/tracy-content/a.jpg">' }),
    false
  )
  assert.equal(
    update({ images: JSON.stringify({ image_intro: 'images/other.jpg', image_intro_alt: 'x' }) }),
    false
  )
  assert.equal(update({ introtext: html.replace('<img ', '<img alt="<b>x</b>" ') }), false)
  assert.equal(
    altOnlyUpdate({ kind: 'article', id: 9, fields: { introtext: html } }, state),
    false,
    'a row not read first'
  )
})

test("a credit link of the template is hidden with its hideable line; the business's own links stay as the plan kept them", () => {
  const kit = {
    blocks: [
      {
        id: 'block-9',
        links: [
          {
            id: 'block-9.link-1',
            label: 'Invented CMS',
            target: 'https://cms.example',
            fixedLabel: { rule: 'template-words' }
          },
          { id: 'block-9.link-2', label: 'Home', target: '/', action: 'navigation' }
        ],
        fixedText: [{ id: 'block-9.fixed-credit', text: 'Invented CMS is free software.', canHide: true }]
      }
    ]
  }
  const plan = {
    sharedBlocks: [
      {
        block: 'block-9',
        decision: 'keep',
        links: [
          { link: 'block-9.link-1', leadsTo: 'page-home' },
          { link: 'block-9.link-2', leadsTo: 'page-home' }
        ]
      }
    ],
    pages: []
  }
  const [d] = withCreditLinksHidden(plan, kit).sharedBlocks
  assert.deepEqual(
    d.links.map((l) => l.link),
    ['block-9.link-2']
  )
  assert.deepEqual(
    d.hiddenSlots.map((h) => h.slot),
    ['block-9.link-1', 'block-9.fixed-credit']
  )
  assert.equal(
    withCreditLinksHidden(
      { ...plan, sharedBlocks: [{ ...plan.sharedBlocks[0], links: [plan.sharedBlocks[0].links[1]] }] },
      kit
    ).sharedBlocks[0].hiddenSlots,
    undefined
  )
})

test('a block the kit does not share, decided in sharedBlocks, moves to its one kept page, and leaves with a dropped one', () => {
  const kit = {
    blocks: [
      { id: 'block-5', shared: false },
      { id: 'block-6', shared: true },
      { id: 'block-8', shared: false }
    ],
    pages: [
      { id: 'page-team', blocks: { 1440: ['block-5', 'block-6'] } },
      { id: 'page-old', blocks: { 1440: ['block-8', 'block-6'] } }
    ]
  }
  const plan = {
    sharedBlocks: [
      { block: 'block-5', decision: 'keep' },
      { block: 'block-6', decision: 'keep' },
      { block: 'block-8', decision: 'keep' }
    ],
    pages: [
      { id: 'page-team', decision: 'keep', blocks: [] },
      { id: 'page-old', decision: 'drop' }
    ]
  }
  const out = withUnsharedBlocksOnTheirPage(plan, kit)
  assert.deepEqual(
    out.sharedBlocks.map((d) => d.block),
    ['block-6']
  )
  assert.deepEqual(
    out.pages[0].blocks.map((d) => d.block),
    ['block-5']
  )
  assert.equal(
    withUnsharedBlocksOnTheirPage({ ...plan, sharedBlocks: [plan.sharedBlocks[1]] }, kit).sharedBlocks.length,
    1
  )
})
