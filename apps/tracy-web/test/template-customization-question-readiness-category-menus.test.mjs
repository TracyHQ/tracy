/**
 * Template Customization Question Readiness, ABOUT-2 categories part (final decisions of 12/10/2026): FULL renames the
 * blog categories for the customer's trade, so a menu item that names a category must carry exactly that category's
 * title, or Tracy cannot tell it names the category and leaves the demo's word (g65 JA Essence Joomla FULL: the footer
 * menu kept "Health", "Design", "Fashion" after the categories were renamed).
 *
 * The Joomla rows are JA Essence j6 1.0.4's own (`jd_menu`, `jd_categories`, cut to the columns read): its footer menu
 * `category` names each category exactly (alias items to the "Category Style N" entries), and its "Category Style N"
 * layout samples name no category. Fixtures are built in memory.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { categoryMenuLabels } from '../src/lib/template-customization-question-readiness/readers/category-menu-labels.js'
import { contextOf, dumpOf } from './template-customization-question-readiness-fixtures.mjs'

const J = {
  platform: 'joomla',
  label: 'JA Essence',
  version: '1.0.4',
  template: 'ja_essence',
  install: { database: { file: 'db.sql.gz' } }
}
const WP = { ...J, platform: 'wordpress', template: 'ja-essence' }

const item = (
  /** @type {number} */ id,
  /** @type {string} */ menutype,
  /** @type {string} */ title,
  /** @type {string} */ link,
  type = 'component',
  params = '{}'
) => ({ id, menutype, title, link, type, published: 1, params, client_id: 0 })
const category = (/** @type {number} */ id, /** @type {string} */ title) => ({
  id,
  title,
  extension: 'com_content',
  published: 1
})
const news = (/** @type {number} */ id) =>
  `index.php?option=com_content&view=category&layout=ja_essence:news&id=${id}`

/** JA Essence j6 1.0.4's category menu items, with the footer item of "Design" titled `designLabel`. */
function essenceJoomla(designLabel = 'Design') {
  return contextOf(J, {
    'db.sql.gz': dumpOf({
      jd_menu: [
        item(142, 'mainmenu', 'Category Style 1', news(9)),
        item(144, 'mainmenu', 'Category Style 2', news(10)),
        item(146, 'mainmenu', 'Category Style 4', news(12)),
        item(153, 'category', 'Health', '', 'alias', '{"aliasoptions":"142"}'),
        item(154, 'category', designLabel, '', 'alias', '{"aliasoptions":"144"}'),
        item(156, 'category', 'Resources', news(16)),
        item(160, 'category', 'Shop', 'https://example.com/shop', 'url')
      ],
      jd_categories: [
        category(9, 'Health'),
        category(10, 'Design'),
        category(12, 'Blog'),
        category(16, 'Resources')
      ]
    })
  })
}

test('Joomla: JA Essence 1.0.4 names every category exactly; its "Category Style N" samples name none', async () => {
  const found = await categoryMenuLabels(essenceJoomla())
  assert.deepEqual(found.problems, [])
  assert.deepEqual(found.unrelated.sort(), [
    'mainmenu "Category Style 1" → category 9 "Health"',
    'mainmenu "Category Style 2" → category 10 "Design"',
    'mainmenu "Category Style 4" → category 12 "Blog"'
  ])
})

test('Joomla: a menu item naming its category by another label fails (Tracy cannot follow the rename)', async () => {
  const found = await categoryMenuLabels(essenceJoomla('Design news'))
  assert.deepEqual(found.problems, ['category "Design news" → category 10 "Design"'])
})

/** A WordPress dump with one navigation post of `links` and the category terms. */
function wordpressWith(/** @type {string} */ links) {
  return contextOf(WP, {
    'db.sql.gz': dumpOf({
      tr_posts: [
        {
          ID: '40',
          post_content: `<!-- wp:navigation-link {"label":"Home","type":"page","id":2,"kind":"post-type"} /-->${links}`,
          post_title: 'Footer',
          post_status: 'publish',
          post_name: 'footer',
          post_type: 'wp_navigation'
        }
      ],
      tr_terms: [
        { term_id: '9', name: 'Health', slug: 'health' },
        { term_id: '10', name: 'Design', slug: 'design' }
      ],
      tr_term_taxonomy: [
        { term_taxonomy_id: '9', term_id: '9', taxonomy: 'category' },
        { term_taxonomy_id: '10', term_id: '10', taxonomy: 'category' }
      ]
    })
  })
}

test('WordPress: a navigation link to a category must carry its name; links to pages are not judged', async () => {
  const exact = await categoryMenuLabels(
    wordpressWith(
      '<!-- wp:navigation-link {"label":"Health","type":"category","id":9,"kind":"taxonomy"} /-->'
    )
  )
  assert.deepEqual(exact.problems, [])
  const variant = await categoryMenuLabels(
    wordpressWith(
      '<!-- wp:navigation-link {"label":"Design ideas","type":"category","id":10,"kind":"taxonomy"} /-->'
    )
  )
  assert.deepEqual(variant.problems, ['footer "Design ideas" → category 10 "Design"'])
})

test('EmDash has no blog categories to rename: nothing to judge', async () => {
  const found = await categoryMenuLabels(contextOf({ ...J, platform: 'emdash' }, {}))
  assert.deepEqual(found, { problems: [], unrelated: [] })
})
