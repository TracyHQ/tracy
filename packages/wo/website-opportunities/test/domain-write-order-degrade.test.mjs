// The build's failure policy at the write order (#575): an entry, a picture or an icon a check refuses is left out
// (a hidden no data entry, a hidden empty frame, an icon of source `none`) and listed with codes and ids only; a problem
// of no single item is kept for the check to stop on. Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-degrade.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { degradeOrder } from '../domain/write-order-degrade.mjs'

const orderOf = () => ({
  pages: [
    {
      id: 'zq',
      home: true,
      blocks: [
        {
          id: 'zq-b1',
          at: 'zq.zq-b1',
          state: 'show',
          fields: [
            {
              place: 'zq.zq-b1.heading',
              type: 'text',
              from: 'writer',
              value: 'Zq <b>words</b>',
              emphasis: 'Zq'
            }
          ]
        }
      ]
    }
  ],
  pictures: [{ frame: 'zq.zq-b1.image', source: 'own', file: 'zq.jpg', alt: '', person: 'zq-person' }],
  icons: [{ id: 'zq.zq-b1.icon', source: 'library', icon: { name: 'zq-icon' } }]
})

test('each item a problem names is left out, its words gone, and listed with ids only', () => {
  const order = orderOf()
  const { skipped, kept } = degradeOrder(order, [
    { code: 'markup_forbidden', at: 'zq.zq-b1.heading', message: 'Zq <b>words</b>' },
    { code: 'alt_text_missing', frame: 'zq.zq-b1.image' },
    { code: 'icon_unknown', at: 'zq.zq-b1.icon' },
    { code: 'home_count', at: 'pages' }
  ])
  assert.deepEqual(order.pages[0].blocks[0].fields[0], {
    place: 'zq.zq-b1.heading',
    type: 'text',
    from: 'no-data',
    action: 'hide',
    reason: 'item_refused'
  })
  assert.deepEqual(order.pictures[0], {
    frame: 'zq.zq-b1.image',
    source: 'none',
    state: 'hidden',
    reason: 'item_refused'
  })
  assert.deepEqual(order.icons[0], { id: 'zq.zq-b1.icon', source: 'none' })
  assert.deepEqual(
    skipped.map((s) => [s.code, s.place]),
    [
      ['markup_forbidden', 'zq.zq-b1.heading'],
      ['alt_text_missing', 'zq.zq-b1.image'],
      ['icon_unknown', 'zq.zq-b1.icon']
    ]
  )
  assert.ok(!JSON.stringify(skipped).includes('words'))
  assert.deepEqual(
    kept.map((p) => p.code),
    ['home_count']
  )
})
