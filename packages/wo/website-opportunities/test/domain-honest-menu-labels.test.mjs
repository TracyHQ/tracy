// A menu label in the demo's words takes the title of the page it opens (`honestWritten`, spec TracyHQ/tracy#189): an
// article's, a category's, the home page's own page title, or, through an alias entry, whatever the entry it points to opens.
// Never "Learn more" when the page's own title is known. Templates and businesses are made up; two trades.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { honestWritten, openedTitleSlot } from '../domain/honest-written.mjs'

const text = (key, extra) => ({ key, entity: key.split('.')[0], type: 'text', maxCharacters: 40, ...extra })
const label = (entity, sample) =>
  text(`${entity}.0`, { column: 'title', role: 'editorial.menu_label', sample })

test('a demo menu label takes the title of the category, home page or alias target it opens', () => {
  const slots = [
    label('menuItem-201', 'Boxing classes'),
    label('menuItem-202', 'Kickboxing gym'),
    label('menuItem-203', 'Sparring room'),
    label('menuItem-204', 'Ringside'),
    text('menuItem-202.1', {
      column: 'params',
      jsonPath: ['page_title'],
      role: 'seo.title',
      sample: 'Kickboxing gym'
    }),
    text('category-9.0', { column: 'title', role: 'editorial.heading', sample: 'Boxing classes' }),
    text('article-31.0', { column: 'title', role: 'editorial.heading', sample: 'Sparring room' })
  ]
  const pages = [
    { entity: 'menuItem-201', link: 'index.php?option=com_content&view=category&layout=blog&id=9' },
    { entity: 'menuItem-202', link: 'index.php?option=com_content&view=featured' },
    { entity: 'menuItem-203', link: 'index.php?Itemid=205' },
    { entity: 'menuItem-205', link: 'index.php?option=com_content&view=article&id=31' },
    { entity: 'menuItem-204', link: 'index.php?option=com_users&view=login' }
  ]
  const out = honestWritten({
    slots,
    written: {
      'category-9.0': 'Swimming lessons',
      'menuItem-202.1': 'Harbourline Swim School',
      'article-31.0': 'Our pool'
    },
    ownText: 'Harbourline Swim School. Swimming lessons for children and adults in Port Arden. Our pool.',
    honesty: {},
    pages
  })
  assert.equal(out.values['menuItem-201.0'], 'Swimming lessons', 'the category it lists')
  assert.equal(out.values['menuItem-202.0'], 'Harbourline Swim School', 'the home page title')
  assert.equal(out.values['menuItem-203.0'], 'Our pool', 'what the alias target opens')
  assert.equal(out.values['menuItem-204.0'], 'Learn more', 'a component view names no page title')
})

test('openedTitleSlot: an alias loop ends, and an alias to a component view falls back to the target entry’s label', () => {
  const slots = [label('menuItem-1', 'Bakery tour'), label('menuItem-2', 'Bread school')]
  const pages = [
    { entity: 'menuItem-1', link: 'index.php?Itemid=2' },
    { entity: 'menuItem-2', link: 'index.php?Itemid=1' }
  ]
  assert.equal(openedTitleSlot('menuItem-1', pages, slots)?.key, 'menuItem-2.0')
  const viewOnly = [
    { entity: 'menuItem-1', link: 'index.php?Itemid=2' },
    { entity: 'menuItem-2', link: 'index.php?option=com_finder&view=search' }
  ]
  assert.equal(openedTitleSlot('menuItem-1', viewOnly, slots)?.key, 'menuItem-2.0')
})
