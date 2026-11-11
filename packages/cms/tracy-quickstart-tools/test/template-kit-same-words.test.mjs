// Two slots of one block that hold the same words stay two slots: a "Subscribe" heading above a "Subscribe" button.
// The button is a link whose label is a slot, the heading is a slot of its own; the page prints the words twice.
// Fabricated data only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildBlock } from '../template-kit/lib/kit-blocks.mjs'
import { indexMap } from '../template-kit/lib/map-index.mjs'
import { sampleIndex } from '../template-kit/lib/sample-index.mjs'

const slot = (n, role, sample) => ({ key: `module-7.${n}`, entity: 'module-7', type: 'text', role, sample })
const MAP = {
  entities: [{ key: 'module-7', kind: 'module', identity: {} }],
  slots: [
    slot(0, 'editorial.heading', 'Subscribe'),
    slot(1, 'editorial.paragraph', 'One short note a month.'),
    slot(2, 'editorial.button_label', 'Subscribe')
  ],
  pages: []
}

const build = ({ texts, counts, links }) =>
  buildBlock({
    rec: {
      id: 'block-7',
      source: 'module-7',
      widths: {
        1440: {
          pages: ['home'],
          details: { texts, textCounts: counts, links, repeats: [] }
        }
      }
    },
    entity: 'module-7',
    idx: indexMap(MAP),
    samples: sampleIndex(MAP),
    errors: [],
    minEvidence: {},
    siteUrl: 'http://site.example',
    aliasHosts: [],
    widths: ['1440']
  })

const button = { label: 'SUBSCRIBE', href: '#', element: 'button' }

test('a heading and a button with the same words are two slots of the block', () => {
  const b = build({
    texts: ['SUBSCRIBE', 'One short note a month.'],
    counts: { SUBSCRIBE: 2, 'One short note a month.': 1 },
    links: [button]
  })
  assert.deepEqual(b.slots.map((s) => s.id).sort(), ['block-7.0', 'block-7.1', 'block-7.2'])
  assert.equal(b.links[0].labelId, 'block-7.2', 'the button keeps the slot it is labelled by')
  const declared = new Set([...b.slots.map((s) => s.id), b.links[0].labelId])
  assert.deepEqual([...declared].sort(), ['block-7.0', 'block-7.1', 'block-7.2'])
})

test('words printed once, by the button alone, are the button slot only', () => {
  const b = build({ texts: ['SUBSCRIBE'], counts: { SUBSCRIBE: 1 }, links: [button] })
  assert.deepEqual(
    b.slots.map((s) => s.id),
    ['block-7.2']
  )
  assert.equal(b.links[0].labelId, 'block-7.2')
})

test('two buttons with the same words and nothing else take no heading slot', () => {
  const b = build({
    texts: ['SUBSCRIBE'],
    counts: { SUBSCRIBE: 2 },
    links: [button, { ...button, href: '#b' }]
  })
  assert.deepEqual(
    b.slots.map((s) => s.id),
    ['block-7.2']
  )
})
