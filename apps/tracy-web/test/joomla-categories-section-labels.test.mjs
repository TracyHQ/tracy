/**
 * A blog category whose name is a generic section label keeps it (JA Boxing 1.0.4 on dev, 25/10/2026): the trade rename of
 * decision (3) of 12/10/2026 turned JA Boxing's "Classes" category into "Boxing Basics", and its main-menu entry "Classes"
 * took the new name with it (`joomla-menu-categories.js`), while the planner keeps that same menu label as the template has
 * it (`nav-labels.mjs` in the seeder). A label any business of the kind uses as is ("Classes", "Blog", "News") is how the
 * site files a section, not another company's topic: it is translated where the site is in another language, never renamed.
 * The demo's topics ("Boxing Legends", "Health") are still renamed for the trade.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { categoryLanguageSteps } from '../src/sites/brief-engines/joomla-categories.js'

const CATEGORIES = [
  {
    id: 8,
    title: 'Blog',
    alias: 'blog',
    parent_id: 1,
    extension: 'com_content',
    published: 1,
    language: '*'
  },
  {
    id: 9,
    title: 'Classes',
    alias: 'classes',
    parent_id: 1,
    extension: 'com_content',
    published: 1,
    language: '*'
  },
  {
    id: 10,
    title: 'Boxing Legends',
    alias: 'legends',
    parent_id: 8,
    extension: 'com_content',
    published: 1,
    language: '*'
  },
  {
    id: 11,
    title: 'Ring Stories',
    alias: 'stories',
    parent_id: 8,
    extension: 'com_content',
    published: 1,
    language: '*'
  }
]

/** A site door that lists the categories above and no article. */
const apply = async (/** @type {any} */ call) => ({
  ok: true,
  items: call.params.kind === 'category' && call.params.offset === 0 ? CATEGORIES : []
})

test('a category named with a generic section label keeps its name; the demo topics are renamed', async () => {
  /** @type {any[]} */
  const asked = []
  const generate = async (/** @type {any} */ call) => {
    asked.push(call.input)
    const names = ['Fight Night Recaps', 'Gym Life']
    return JSON.stringify({
      names: Object.fromEntries(
        call.input.categories.map((/** @type {any} */ c, /** @type {number} */ i) => [c.key, names[i]])
      )
    })
  }
  const { steps, renamed } = await categoryLanguageSteps({
    apply,
    siteKey: 's',
    locale: 'en-GB',
    source: 'en-GB',
    model: null,
    rename: { generate, about: 'A boxing gym in Ho Chi Minh City for beginners.', name: 'Saigon Iron Boxing' }
  })
  assert.equal(asked.length, 1)
  assert.deepEqual(
    asked[0].categories.map((/** @type {any} */ c) => c.name),
    ['Boxing Legends', 'Ring Stories'],
    'only the demo topics are asked'
  )
  assert.deepEqual([...renamed.keys()].sort(), [10, 11])
  assert.equal(
    steps.some((s) => s.id === 9),
    false,
    'Classes is not written'
  )
})
