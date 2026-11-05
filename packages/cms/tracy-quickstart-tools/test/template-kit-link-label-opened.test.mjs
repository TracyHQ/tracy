// A link whose words several items share names the item the link opens; a count or a block string beside the words
// still finds the slot from what is left. Fabricated bakery blog.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkLabelSlots } from '../template-kit/lib/link-label-slots.mjs'

const MAP = {
  entities: [
    { key: 'article-4', kind: 'article', identity: { alias: 'sourdough-basics' } },
    { key: 'article-5', kind: 'article', identity: { alias: 'sourdough-basics-2' } },
    { key: 'category-8', kind: 'category', identity: { path: 'blog/rye' } },
    { key: 'tag-3', kind: 'tag', identity: { path: 'rye' } },
    { key: 'category-9', kind: 'category', identity: { path: 'blog/events' } },
    { key: 'contact-1', kind: 'contact', identity: { alias: 'shop' } }
  ],
  pages: [{ entity: 'menu-21', route: 'blog/events', link: 'index.php?option=com_content&view=category&id=9' }],
  slots: [
    { key: 'article-4.1', entity: 'article-4', type: 'text', role: 'article.title', sample: 'Sourdough basics' },
    { key: 'article-5.1', entity: 'article-5', type: 'text', role: 'article.title', sample: 'Sourdough basics' },
    { key: 'category-8.0', entity: 'category-8', type: 'text', role: 'category.title', sample: 'Rye' },
    { key: 'tag-3.0', entity: 'tag-3', type: 'text', role: 'tag.title', sample: 'Rye' },
    { key: 'category-9.0', entity: 'category-9', type: 'text', role: 'category.title', sample: 'Events' },
    { key: 'menu-21.0', entity: 'menu-21', type: 'text', role: 'menu.title', sample: 'Events' },
    { key: 'contact-1.1', entity: 'contact-1', type: 'text', role: 'contact.address', sample: 'Leith, Scotland' },
    { key: 'article-7.1', entity: 'article-7', type: 'text', role: 'article.body', sample: 'Leith, Scotland' }
  ]
}

const kitOf = (links, extra = {}) => ({ blocks: [{ id: 'body-x', source: { entity: 'menu-1' }, links, ...extra }] })
const labels = (kit) => kit.blocks[0].links.map((l) => l.labelId ?? null)

test('twin titles name the item whose alias the address ends with', () => {
  const kit = kitOf([
    { id: 'l1', label: 'Sourdough basics', target: '/blog/sourdough-basics-2' },
    { id: 'l2', label: 'Sourdough basics', target: '/blog/sourdough-basics' }
  ])
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['article-5.1', 'article-4.1'])
})

test('a tag and a category of one name: the view segment of the address tells them apart', () => {
  const kit = kitOf([
    { id: 'l1', label: 'Rye', target: '/component/tags/tag/rye' },
    { id: 'l2', label: 'Rye', target: '/index.php/blog/category/8-rye' }
  ])
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['tag-3.0', 'category-8.0'])
})

test('a page of a category list names the category, and a count after the title is the CMS', () => {
  const kit = kitOf([
    { id: 'l1', label: 'Events', target: '/blog/events' },
    { id: 'l2', label: 'Events 9', target: '/blog/events' }
  ])
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['category-9.0', 'category-9.0'])
})

test('words beside a block string name only a slot of the block, never a step line of the template', () => {
  const near = kitOf([{ id: 'l1', label: 'Leith, Scotland Open in Maps', target: 'https://maps.example' }], {
    source: { entity: 'contact-1' },
    fixedText: [{ id: 'f1', text: 'Open in Maps' }]
  })
  linkLabelSlots(near, MAP)
  assert.deepEqual(labels(near), ['contact-1.1'])
  // The same words in a block of no such entity are a coincidence, even where one slot alone prints them.
  const far = kitOf([{ id: 'l1', label: 'Leith, Scotland Open in Maps', target: 'https://maps.example' }], {
    fixedText: [{ id: 'f1', text: 'Open in Maps' }]
  })
  linkLabelSlots(far, { ...MAP, slots: MAP.slots.filter((s) => s.key !== 'article-7.1') })
  assert.deepEqual(labels(far), [null])
  // "Previous article: X" with X again: the whole line is the template's words.
  const step = kitOf(
    [{ id: 'l1', label: 'Previous article: Leith, Scotland Leith, Scotland', target: '/blog/leith' }],
    { source: { entity: 'contact-1' }, fixedText: [{ id: 'f1', text: 'Previous article: Leith, Scotland' }] }
  )
  linkLabelSlots(step, MAP)
  assert.deepEqual(labels(step), [null])
})

test('a sign before the words is the template: "$ bake now" names the button label', () => {
  const map = { slots: [{ key: 'module-2.5', entity: 'module-2', type: 'text', role: 'editorial.button_label', sample: 'bake now' }] }
  const kit = { blocks: [{ id: 'block-2', source: { entity: 'module-2' }, links: [{ id: 'l1', label: '$ bake now', target: '/join' }] }] }
  linkLabelSlots(kit, map)
  assert.deepEqual(labels(kit), ['block-2.5'])
})

test('a link wrapping a whole card names the title of the item it opens, shown whole among other words', () => {
  const kit = kitOf([
    { id: 'l1', label: 'RYE Sourdough basics How a starter … Ana Lee · 2 May 2026 · 3 min', target: '/blog/sourdough-basics-2' },
    { id: 'l2', label: 'RYE Sourdough basicsness', target: '/blog/sourdough-basics' }
  ])
  linkLabelSlots(kit, MAP)
  assert.deepEqual(labels(kit), ['article-5.1', null])
})

test("an author card names the author's own card, not a team card of the same words", () => {
  const map = {
    entities: [{ key: 'user-7', kind: 'user', identity: { username: 'ana.lee' } }],
    slots: [
      { key: 'module-3.4', entity: 'module-3', type: 'text', role: 'person.name', sample: 'Ana Lee', group: { id: 'module-3.member.1' } },
      { key: 'module-3.5', entity: 'module-3', type: 'text', role: 'person.role', sample: 'Head baker', group: { id: 'module-3.member.1' } },
      { key: 'user-7.0', entity: 'user-7', type: 'text', role: 'person.name', sample: 'Ana Lee', group: { id: 'user-7.person' } },
      { key: 'profile-70.1', entity: 'profile-70', type: 'text', role: 'person.role', sample: 'Head baker', group: { id: 'user-7.person' } }
    ]
  }
  const kit = {
    blocks: [
      {
        id: 'body-authors',
        slots: [{ id: 'block-3.4' }, { id: 'user-7.0' }],
        fixedText: [{ id: 'f1', text: '12 articles' }],
        links: [{ id: 'l1', label: 'Ana Lee Head baker 12 articles', target: '/authors/author/ana.lee' }]
      }
    ]
  }
  linkLabelSlots(kit, map)
  assert.deepEqual(labels(kit), ['user-7.0'])
})

test("a block with no entity of its own: a link printing a slot of the module its other slots come from names it", () => {
  const map = {
    slots: [
      { key: 'module-110.0', entity: 'module-110', type: 'text', role: 'contact.email', sample: 'hello@bakery.example' },
      { key: 'module-110.1', entity: 'module-110', type: 'text', role: 'contact.phone', sample: '+44-131-555' },
      { key: 'module-110.2', entity: 'module-110', type: 'text', role: 'contact.hours', sample: 'Mon–Sat 7–15' },
      { key: 'module-120.4', entity: 'module-120', type: 'text', role: 'contact.phone', sample: '+44-131-555' }
    ]
  }
  const kit = {
    blocks: [
      {
        id: 'block-110',
        slots: [{ id: 'block-110.0' }, { id: 'block-110.2' }],
        links: [{ id: 'l1', label: '+44-131-555', target: 'tel:+44131555' }]
      }
    ]
  }
  linkLabelSlots(kit, map)
  assert.deepEqual(labels(kit), ['block-110.1'])
})
