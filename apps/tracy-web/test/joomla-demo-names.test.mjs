/**
 * The demo company's name renamed inside kept demo text (TCH #1013, D9; `joomla-demo-names.js`): as a whole word, in its declared
 * case, never inside markup, a URL, an email address, a file, a path or a site token.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoNameChanges, renameDemoCompany } from '../src/sites/brief-engines/joomla-demo-names.js'

const NAMES = ['Northgate', 'Northgate Industrial', 'Нортгейт']

test('a whole word in its declared case, the longest spelling first', () => {
  assert.equal(
    renameDemoCompany('Northgate Industrial builds plants. Ask Northgate.', NAMES, 'Golden Crust'),
    'Golden Crust builds plants. Ask Golden Crust.'
  )
  assert.equal(
    renameDemoCompany('Нортгейт строит заводы', NAMES, 'Golden Crust'),
    'Golden Crust строит заводы'
  )
  assert.equal(
    renameDemoCompany('Northgates and northgate stay', NAMES, 'X Co'),
    'Northgates and northgate stay'
  )
  assert.equal(renameDemoCompany('Northgate-built', NAMES, 'X Co'), 'X Co-built')
})

test('never inside markup, a link, an email, a file, a domain, a path or a token', () => {
  const value =
    '<a href="https://northgate.example/Northgate" title="Northgate">Northgate</a> mail Northgate@corp.com, ' +
    'see Northgate.com or /docs/Northgate/ and {site.Northgate}'
  assert.equal(
    renameDemoCompany(value, NAMES, 'Golden'),
    '<a href="https://northgate.example/Northgate" title="Northgate">Golden</a> mail Northgate@corp.com, ' +
      'see Northgate.com or /docs/Northgate/ and {site.Northgate}'
  )
  assert.equal(
    renameDemoCompany('images/x/Northgate Deck.pdf', NAMES, 'Golden'),
    'images/x/Northgate Deck.pdf'
  )
})

test('a renamed line past its length is left; one with no name is not written', () => {
  const slots = [
    { key: 'a', type: 'text', maxCharacters: 12 },
    { key: 'b', type: 'text', maxCharacters: 100 },
    { key: 'c', type: 'text', maxCharacters: 100 },
    { key: 'd', type: 'url', maxCharacters: 100 }
  ]
  const values = { a: 'By Northgate', b: 'By Northgate', c: 'Nothing here', d: 'Northgate' }
  assert.deepEqual(
    demoNameChanges({
      slots,
      valueOf: (s) => values[s.key],
      names: NAMES,
      replacement: 'Golden Crust Bakery'
    }),
    { b: 'By Golden Crust Bakery' }
  )
})
