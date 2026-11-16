// A kept pattern is scoped to its file as kept words are (ticket #587 triage of run 4, review 4 W1): the page numbers
// of a list's pagination (`^[1-9]\d{0,2}$` for the pagination layout file) are exempt in the pagination only. A number
// an article body prints, outside any module, is not the pagination's. The page reader marks what sits in a
// pagination element (`place.pagination`). An invented bakery page.
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { joomlaLiteralScope } from '../ai-quickstart/gate/adapters/joomla-literal-scope.mjs'
import { exemptionOf, keptKeysOf, keptPlacesOf } from '../ai-quickstart/gate/exemptions.mjs'
import { observeInPage } from '../ai-quickstart/gate/observe-in-page.mjs'

const FILE = 'layouts/joomla/pagination/link.php'
const mapping = {
  keptLiterals: [{ file: FILE, pattern: '^[1-9]\\d{0,2}$', why: 'the page numbers of a list' }]
}
const ctx = {
  origin: 'http://bakery.example',
  kept: keptKeysOf(mapping),
  keep: keptPlacesOf(mapping),
  rules: [],
  scope: joomlaLiteralScope({ dump: '' }),
  source: { class: 'unknown' }
}
const PAGE = `<html><body><article><p>Bake for</p><p>25</p></article>
<nav class="pagination__wrapper"><ul class="pagination"><li><a href="?start=10">2</a></li></ul></nav></body></html>`

test('pattern scope: the page reader marks a pagination element', () => {
  const { observations } = observeInPage(parseHTML(PAGE).document)
  const of = (v) => observations.find((o) => o.kind === 'text' && o.value === v)?.place
  assert.equal(of('2')?.pagination, true)
  assert.equal(of('25')?.pagination, undefined)
})

test('pattern scope: a page number in the pagination is kept, a number of an article body is a leak', () => {
  const at = (value, place) => ({
    kind: 'text',
    value,
    visible: true,
    place,
    path: 'index.php?view=category'
  })
  assert.match(
    exemptionOf(at('2', { element: 'a', pagination: true }), ctx),
    /^kept_literal: layouts\/joomla\/pagination\//
  )
  assert.equal(exemptionOf(at('25', { element: 'p' }), ctx), null)
})

// Review 6 S4: the pagination layout prints the pagination of the page's own list, outside any module. A pagination
// element inside a module (a demo module's own list of numbers) is that module's, and its numbers are no page numbers.
test('S4: a number in a pagination element inside a module is not the pagination layout', () => {
  const at = { kind: 'text', value: '12', visible: true, path: 'index.php?view=category' }
  assert.equal(exemptionOf({ ...at, place: { element: 'span', pagination: true, module: 157 } }, ctx), null)
  assert.match(exemptionOf({ ...at, place: { element: 'span', pagination: true } }, ctx), /^kept_literal: /)
})
