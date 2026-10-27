/**
 * A page that repeats a named section (LANG-2, TCH #1013). Measured 11/10/2026 in the JA Essence WordPress 1.0.12 dump: home-2
 * holds three blocks named `articles-category.main-section` ("…", "Trending", "Features post") and home-3, home-5 two each
 * ("Features Lead" twice). The contract finds a slot by the FIRST block of a name, so only the first is a slot; the others were
 * nobody's, because the line pass (`wp-leaves.js`) left out every named block, and they stayed English on a Vietnamese site
 * (dev g60-ess-wp-full). A named block that is not the first of its name on its page is now an ordinary block of the page.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseBlocks } from '../src/sites/brief-engines/wp-blocks.js'
import {
  editLines,
  labelLines,
  slotCountsByPage,
  slottedOn,
  staticLines
} from '../src/sites/brief-engines/wp-leaves.js'

const NAME = 'articles-category.main-section'
const heading = (/** @type {string} */ text) =>
  `<!-- wp:heading {"metadata":{"name":"${NAME}"},"className":"je-sec__title"} -->\n<h2 class="wp-block-heading je-sec__title">${text}</h2>\n<!-- /wp:heading -->`

/** JA Essence's capture: each name of a page listed once, so the first block of a name is the only slot's. */
const MAP = {
  entities: [{ key: 'page-home-2', kind: 'page', identity: { postType: 'page', slug: 'home-2' } }],
  slots: [
    {
      key: 'home-2.articles-category.main-section',
      entity: 'page-home-2',
      target: { block: NAME, attr: 'content' }
    }
  ]
}
const onPage = slottedOn(slotCountsByPage(MAP), 'home-2')

const HOME_2 = [
  heading('Editor’s picks of the week'),
  heading('Trending'),
  heading('Features post of the day')
].join('\n\n')

test('the first block of a name is the slot’s; a later block of the same name is a line of the page', () => {
  assert.deepEqual(
    staticLines(HOME_2, { slotted: onPage }).map((l) => l.text),
    ['Features post of the day']
  )
  assert.deepEqual(
    labelLines(HOME_2, { slotted: onPage }).map((l) => l.text),
    ['Trending']
  )
  // A template part keeps the old reading: there a name is the theme's (`namedRuns`), never a slot's.
  assert.deepEqual(staticLines(HOME_2), [])
  assert.deepEqual(labelLines(HOME_2), [])
  // A contract that lists a name three times (Tracy Business, `wp-duplicates.js`) writes all three itself.
  const thrice = { ...MAP, slots: [MAP.slots[0], MAP.slots[0], MAP.slots[0]] }
  assert.deepEqual(staticLines(HOME_2, { slotted: slottedOn(slotCountsByPage(thrice), 'home-2') }), [])
})

test('a later block of a name is written where it stands; the first, the slot’s, is never touched', () => {
  const twice = [heading('Features Lead stories'), heading('Features Lead stories')].join('\n\n')
  const out = editLines(twice, [{ text: 'Features Lead stories', value: 'Bài nổi bật' }], { slotted: onPage })
  assert.equal(out.edited, 1)
  assert.ok(parseBlocks(out.markup))
  const [first, second] = out.markup.split('\n\n')
  assert.match(first, />Features Lead stories</, 'the slot’s block keeps what the contract wrote')
  assert.match(second, />Bài nổi bật</)
  assert.equal(editLines(twice, [{ text: 'Features Lead stories', value: 'x' }]).edited, 0)
})
