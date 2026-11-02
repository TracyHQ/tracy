// One source for a link's label: `links[].labelId`, or a fixed-text reason decided by rule. A link that shows words
// with neither fails the kit's `linksWithoutLabel` check; no slot carries a `labelOf` copy. Fabricated swim club.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fixedLinkLabels, linkLabelChecks, relabelKit } from '../template-kit/lib/link-label-reasons.mjs'
import { linkLabelSlots } from '../template-kit/lib/link-label-slots.mjs'

const MAP = {
  slots: [
    { key: 'module-7.1', entity: 'module-7', type: 'text', role: 'contact.phone', sample: '(555) 010-2233' },
    { key: 'module-9.1', entity: 'module-9', type: 'text', role: 'contact.phone', sample: '(555) 010-2233' },
    { key: 'module-7.2', entity: 'module-7', type: 'text', role: 'cta.button_label', sample: 'Book a lane' }
  ]
}

const kitOf = () => ({
  pages: [
    { id: 'page-news', path: '/news', blocks: ['body-news'] },
    { id: 'page-news-2', path: '/news?start=6', blocks: ['body-news-2'] },
    { id: 'page-home', path: '/', blocks: ['block-7', 'footer'] }
  ],
  blocks: [
    {
      id: 'block-7',
      source: { entity: 'module-7', contains: [] },
      slots: [{ id: 'block-7.2', type: 'text', sample: 'Book a lane', labelOf: ['block-7.link-2'] }],
      demoOwned: [{ id: 'block-7.1', role: 'contact.phone', sample: '(555) 010-2233' }],
      links: [
        { id: 'block-7.link-1', label: '(555) 010-2233', target: 'tel:5550102233' },
        { id: 'block-7.link-2', label: 'Book a lane', target: '/book', labelId: 'block-7.2' },
        {
          id: 'block-7.link-3',
          label: 'facebook',
          target: null,
          icon: { title: 'facebook', network: 'facebook' }
        },
        { id: 'block-7.link-4', label: null, target: '/', icon: { title: null } }
      ]
    },
    {
      id: 'footer',
      fixedText: [{ id: 'footer.fixed-cms', text: 'Powered by Harbour CMS under the Open Licence.' }],
      links: [
        { id: 'footer.link-1', label: 'Harbour CMS', target: 'https://cms.example' },
        { id: 'footer.link-2', label: 'Open Licence.', target: 'https://licence.example' }
      ]
    },
    {
      id: 'body-news',
      links: [
        { id: 'body-news.link-1', label: '2', target: '/news?start=6' },
        { id: 'body-news.link-2', label: 'Go to next page', target: '/news?start=6' }
      ]
    },
    { id: 'body-news-2', links: [{ id: 'body-news-2.link-1', label: '1', target: '/news' }] }
  ],
  checks: {},
  errors: []
})

test('a phone link names its block slot: words without a letter pick only a slot of the block', () => {
  const kit = kitOf()
  linkLabelSlots(kit, MAP)
  assert.equal(kit.blocks[0].links[0].labelId, 'block-7.1')
  // The same number in an unrelated block is a coincidence: no global pick for words without letters.
  const lone = {
    blocks: [{ id: 'block-3', source: { entity: 'module-3' }, links: [{ id: 'x', label: '(555) 010-2233' }] }]
  }
  linkLabelSlots(lone, MAP)
  assert.equal(lone.blocks[0].links[0].labelId, undefined)
})

test('links with fixed words carry a reason by rule: template words, an icon name, pagination', () => {
  const kit = kitOf()
  linkLabelSlots(kit, MAP)
  fixedLinkLabels(kit)
  const rules = Object.fromEntries(
    kit.blocks.flatMap((b) => b.links).map((l) => [l.id, l.fixedLabel?.rule ?? null])
  )
  assert.deepEqual(rules, {
    'block-7.link-1': null,
    'block-7.link-2': null,
    'block-7.link-3': 'icon-name',
    'block-7.link-4': null,
    'footer.link-1': 'template-words',
    'footer.link-2': 'template-words',
    'body-news.link-1': 'pagination',
    'body-news.link-2': 'pagination',
    'body-news-2.link-1': 'pagination'
  })
  for (const l of kit.blocks.flatMap((b) => b.links))
    if (l.fixedLabel) assert.ok(l.fixedLabel.reason.length > 20)
})

test('the check counts a link with words and neither a label slot nor a reason, and a label slot outside its block', () => {
  const kit = kitOf()
  kit.blocks[0].links.push({ id: 'block-7.link-5', label: 'Lane times', target: '/times' })
  kit.blocks[0].links[1].labelId = 'block-99.0'
  linkLabelSlots(kit, MAP)
  fixedLinkLabels(kit)
  const errors = []
  assert.equal(linkLabelChecks({ kit, errors }), 2)
  assert.deepEqual(
    errors.map((e) => e.field),
    ['blocks[block-7].links[block-7.link-2].labelId', 'blocks[block-7].links[block-7.link-5]']
  )
})

test('relabel drops every labelOf copy, and a settled kit passes the check', () => {
  const kit = kitOf()
  const r = relabelKit(kit, { map: MAP, linkLabelSlots })
  assert.deepEqual(r, { set: 1, fixed: 6, wrong: 0 })
  assert.equal(kit.checks.linksWithoutLabel, 0)
  assert.ok(!JSON.stringify(kit).includes('labelOf'))
})
