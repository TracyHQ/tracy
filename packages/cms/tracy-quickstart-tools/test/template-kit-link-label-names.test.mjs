// A link's label slot found from what the link really carries: an alias that starts with a number, a tag menu page
// (`id[0]=`), a tag sign glued to the title, a picture link named by its aria-label, a card link made of the block's
// own slots one after another, and an e-mail address written inside a body text. Fabricated bakery site.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkLabelSlots } from '../template-kit/lib/link-label-slots.mjs'
import { indexMap, ownerOfPath } from '../template-kit/lib/map-index.mjs'

const MAP = {
  entities: [
    { key: 'article-4', kind: 'article', identity: { alias: '48-hour-rye-loaf' } },
    { key: 'article-5', kind: 'article', identity: { alias: 'hour-rye-loaf' } },
    { key: 'article-6', kind: 'article', identity: { alias: 'seeded-spelt' } },
    { key: 'article-9', kind: 'article', identity: { alias: 'privacy' } },
    { key: 'tag-3', kind: 'tag', identity: { path: 'rye-classes' } },
    { key: 'tag-11', kind: 'tag', identity: { path: 'classes' } },
    { key: 'category-2', kind: 'category', identity: { path: 'journal/classes' } }
  ],
  pages: [
    { entity: 'menuItem-30', route: 'classes', link: 'index.php?option=com_tags&view=tag&id[0]=3' },
    { entity: 'menuItem-31', route: 'privacy', link: 'index.php?option=com_content&view=article&id=9' }
  ],
  slots: [
    {
      key: 'article-4.1',
      entity: 'article-4',
      type: 'text',
      role: 'article.title',
      sample: '48-hour rye loaf'
    },
    { key: 'article-5.1', entity: 'article-5', type: 'text', role: 'article.title', sample: 'Hour rye loaf' },
    { key: 'article-6.1', entity: 'article-6', type: 'text', role: 'offering.name', sample: 'Seeded spelt' },
    { key: 'article-6.2', entity: 'article-6', type: 'text', role: 'offering.variant_meta', sample: '4.9' },
    { key: 'tag-3.0', entity: 'tag-3', type: 'text', role: 'editorial.heading', sample: 'Rye classes' },
    { key: 'tag-11.0', entity: 'tag-11', type: 'text', role: 'editorial.heading', sample: 'Classes' },
    {
      key: 'ls-1.0',
      entity: 'ls-1',
      type: 'text',
      role: 'editorial.paragraph',
      sample: 'Forgot your password?'
    },
    {
      key: 'ls-2.0',
      entity: 'ls-2',
      type: 'text',
      role: 'editorial.paragraph',
      sample: 'Reset it in a minute.'
    },
    {
      key: 'article-9.3',
      entity: 'article-9',
      type: 'text',
      role: 'contact.email',
      sample: 'Write to us at hello@bakery.example and we answer within a day.'
    }
  ]
}

const kitOf = (links, extra = {}) => ({
  blocks: [{ id: 'body-x', source: { entity: 'menuItem-1' }, links, ...extra }]
})
const labels = (kit) => kit.blocks[0].links.map((l) => l.labelId ?? null)

test('an alias that starts with a number is the alias itself, not an id and an alias', () => {
  const kit = kitOf(
    [{ id: 'l1', label: '48-hour rye loaf Jo Baker 2 May', target: '/journal/48-hour-rye-loaf' }],
    { fixedText: [{ text: 'Jo Baker' }, { text: '2 May' }] }
  )
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['article-4.1'])
  const idx = indexMap(MAP)
  assert.equal(ownerOfPath(idx, '/journal/48-hour-rye-loaf').owner, 'article-4')
  // The Joomla id prefix of an address with no menu item is still dropped.
  assert.equal(ownerOfPath(idx, '/journal/6-seeded-spelt').owner, 'article-6')
})

test('a tag menu page names its tag by id[0], and a tag sign glued to the title is no part of it', () => {
  const kit = kitOf([{ id: 'l1', label: '#Rye classes 4 stories Bake with us.', target: '/classes' }], {
    fixedText: [{ text: '#Rye' }, { text: '4 stories' }]
  })
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['tag-3.0'])
})

test('a picture link that shows a badge and a rating is named by its aria-label', () => {
  const kit = kitOf(
    [
      {
        id: 'l1',
        label: 'FEATURED 4.9',
        target: '/tours/seeded-spelt',
        icon: { mechanism: 'image-file', file: 'spelt.jpg', title: 'Seeded spelt' }
      }
    ],
    { fixedText: [{ text: 'Featured' }] }
  )
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['article-6.1'])
})

test("a card link made of the block's own slots one after another names the first, or its title", () => {
  const kit = kitOf([{ id: 'l1', label: 'Forgot your password? Reset it in a minute.', target: '/reset' }], {
    slots: [{ id: 'ls-1.0' }, { id: 'ls-2.0' }]
  })
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['ls-1.0'])
  // Words that only some of the block's slots print stay unnamed.
  const part = kitOf([{ id: 'l1', label: 'Forgot your password? Call us', target: '/reset' }], {
    slots: [{ id: 'ls-1.0' }, { id: 'ls-2.0' }]
  })
  linkLabelSlots(part, MAP)
  assert.deepEqual(labels(part), [null])
})

test("an e-mail address written in a body text of the block's own item names that text slot", () => {
  const kit = kitOf([{ id: 'l1', label: 'hello@bakery.example', target: 'mailto:hello@bakery.example' }], {
    source: { entity: 'article-9' }
  })
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['article-9.3'])
  // The same words in a block of another item are not its slot.
  const far = kitOf([{ id: 'l1', label: 'hello@bakery.example', target: 'mailto:hello@bakery.example' }])
  linkLabelSlots(far, MAP)
  assert.deepEqual(labels(far), [null])
})
