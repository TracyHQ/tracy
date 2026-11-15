// What is left of kept literals after review 4 (ticket #586, review 5 Z4), on an invented florist template:
//   a  words a kept file writes that a printed row of the dump (an article, a module) also holds are that row's
//   b  an article layout prints only on the pages that layout draws, as far as the page can tell by the layout's own
//      wrapper: a share word or a step number on an article of another layout is no literal of this one, and a page
//      that says nothing of its wrapper tells nothing
//   c  a kept design picture is exempt only where the page draws it as the stylesheet does (a background or a
//      generated picture), never as a picture element a row of the dump wrote
import assert from 'node:assert/strict'
import test from 'node:test'
import { joomlaLiteralScope } from '../ai-quickstart/gate/adapters/joomla-literal-scope.mjs'
import { exemptionOf, keptPictureOf, keptPlacesOf } from '../ai-quickstart/gate/exemptions.mjs'

const LAYOUTS = 'templates/florist/html/com_content/article/'
const files = new Map([
  [LAYOUTS + 'default.php', '<div class="com-content-article item-page<?php echo $sfx; ?>">'],
  [LAYOUTS + 'steps.php', '<div class="com-content-article detail-steps item-page<?php echo $sfx; ?>">']
])
const PICTURE = 'templates/florist/images/leaf.png'
const mapping = {
  keptLiterals: [
    {
      file: LAYOUTS + 'default.php',
      values: ['pinterest'],
      why: 'the share bar the article layout asks for'
    },
    { file: LAYOUTS + 'steps.php', pattern: '^\\d{2}$', why: 'the step numbers the steps layout counts' },
    { file: PICTURE, values: [PICTURE], why: 'the bullet the stylesheet draws before each list item' }
  ]
}
const dump = [
  'INSERT INTO `#__content` (`id`, `title`, `introtext`) VALUES ',
  "(5,'Spring bouquets','<p>Follow us on Pinterest</p><a>pinterest</a>');"
].join('\n')
const keep = keptPlacesOf(mapping)
const scope = joomlaLiteralScope({ dump, files })
const ctx = { origin: 'http://florist.example', kept: new Map(), keep, rules: [], scope }
const ARTICLE = 'index.php?option=com_content&view=article&id=5&Itemid=3'
const at = (value, within) => ({
  kind: 'text',
  value,
  visible: true,
  path: ARTICLE,
  place: { element: 'span', ...(within ? { within } : {}) }
})
const DEFAULT_PAGE = ['com-content-article', 'item-page']
const STEPS_PAGE = ['com-content-article', 'detail-steps', 'item-page']

test('Z4a: a kept word an article row of the dump holds is that row, not the layout', () => {
  assert.equal(exemptionOf(at('pinterest', DEFAULT_PAGE), { ...ctx, source: { class: 'unknown' } }), null)
})

test('Z4b: a step number counts only on a page the steps layout draws', () => {
  assert.match(
    exemptionOf(at('07', STEPS_PAGE), { ...ctx, source: { class: 'unknown' } }),
    /^kept_literal: templates\/florist\/html\/com_content\/article\/steps\.php: /
  )
  assert.equal(exemptionOf(at('07', DEFAULT_PAGE), { ...ctx, source: { class: 'unknown' } }), null)
  // The page tells nothing of its wrapper: no exemption.
  assert.equal(exemptionOf(at('07'), { ...ctx, source: { class: 'unknown' } }), null)
})

test('Z4b: the default layout does not print where another layout of its view draws the page', () => {
  assert.equal(
    scope.renders(LAYOUTS + 'default.php', { place: { within: STEPS_PAGE }, path: ARTICLE }),
    false
  )
  assert.equal(
    scope.renders(LAYOUTS + 'default.php', { place: { within: DEFAULT_PAGE }, path: ARTICLE }),
    true
  )
})

test('Z4c: a kept picture is exempt where the page draws it as a stylesheet does, never as a picture element', () => {
  const source = { class: 'picture_file', file: PICTURE }
  assert.match(
    keptPictureOf(source, keep, { place: { element: 'li::before[background]' } }),
    /^kept_literal: /
  )
  assert.match(keptPictureOf(source, keep, { place: { element: 'a::after[content]' } }), /^kept_literal: /)
  assert.equal(keptPictureOf(source, keep, { place: { element: 'img' } }), null)
  assert.equal(keptPictureOf(source, keep), null)
})
