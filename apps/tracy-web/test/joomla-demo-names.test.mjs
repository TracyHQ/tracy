/**
 * The demo company's name renamed inside kept demo text (TCH #1013, D9; `joomla-demo-names.js`): as a whole word, in its declared
 * case, never inside markup, a URL, an email address, a file, a path or a site token.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  demoNameChanges,
  renameDemoCompany,
  statesFact
} from '../src/sites/brief-engines/joomla-demo-names.js'

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

test('#189 a demo line stating a year, a founding or a count is never renamed onto the owner, it is handed back to empty', () => {
  // A bakery brief on an engineering demo, and a dental clinic brief on the same demo: the rule reads the sentence, not the trade.
  const slots = [
    { key: 'about.story', type: 'text' },
    { key: 'about.count', type: 'text' },
    { key: 'hero.lead', type: 'text' },
    { key: 'footer.credit', type: 'text' },
    { key: 'card.other', type: 'text' }
  ]
  const values = {
    'about.story': 'We opened Northgate in 2008. Our team builds with care.',
    'about.count': 'Northgate Industrial has served over a thousand clients.',
    'hero.lead': 'Welcome to Northgate, where every detail matters.',
    'footer.credit': '© 2024 Northgate. All rights reserved.',
    'card.other': 'Founded in 1999, a partner we trust.'
  }
  for (const owner of ['Golden Crust Bakery', 'Bright Smile Dental']) {
    /** @type {string[]} */
    const factLines = []
    const changes = demoNameChanges({
      slots,
      valueOf: (s) => values[s.key],
      names: NAMES,
      replacement: owner,
      factLines
    })
    assert.deepEqual(changes, {
      'hero.lead': `Welcome to ${owner}, where every detail matters.`,
      'footer.credit': `© 2024 ${owner}. All rights reserved.`
    })
    assert.deepEqual(factLines, ['about.story', 'about.count'])
    for (const text of Object.values(changes)) assert.doesNotMatch(text, /opened|since|founded|clients/i)
  }
  // A fact sentence that does not name the demo company is no rename at all; a plain line naming it is no fact.
  assert.equal(statesFact('Founded in 1999, a partner we trust.', NAMES), false)
  assert.equal(statesFact('Ask Northgate about a quote.', NAMES), false)
  assert.equal(statesFact('Northgate, established 1987.', NAMES), true)
})

test('#189 a figure that is part of a demo name is no fact', () => {
  assert.equal(statesFact('Northgate wins the Harbour 2 tender', ['Northgate', 'Harbour 2']), false)
  assert.equal(statesFact('Harbour 2 opened in 2011', ['Harbour 2']), true)
})

test('#189 a bare figure beside the name is a label; a year or a tally is a fact', () => {
  assert.equal(statesFact('Northgate wins the Harbour 2 tender', ['Northgate']), false)
  assert.equal(statesFact('Northgate: 500+ happy guests', ['Northgate']), true)
  assert.equal(statesFact('Northgate since 1994', ['Northgate']), true)
})
