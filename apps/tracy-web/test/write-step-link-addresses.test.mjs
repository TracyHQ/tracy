// The addresses a plan names reach a link slot in the one form the site takes (write-step/link-targets.js plainAddress):
// the Joomla plugin refuses an address with a space, an http:// one, and a phone number with dots (QuickstartContract
// checkValue). Dev lat29 (23/11/2026): JA Diner's "Book a table" and "Get directions" kept the template's addresses after
// "Unsupported CTA URL". Invented addresses.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkTarget, plainAddress } from '../src/write-step/link-targets.js'

// The forms the plugin takes for a url slot, as its check writes them.
const TAKEN =
  /^(https:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9 ()-]+|index\.php\?Itemid=[0-9]+|\/[a-zA-Z0-9/_?&=.%#-]*|#[a-zA-Z0-9_-]+)$/

test('a plan address with spaces, http or a dotted phone number becomes one the site takes', () => {
  const cases = [
    [
      'https://maps.example/?q=Tea House, First Floor',
      'https://maps.example/?q=Tea%20House,%20First%20Floor'
    ],
    ['http://booking.example/table', 'https://booking.example/table'],
    ['tel:+971 4 123.4567', 'tel:+97141234567'],
    ['/contact us', '/contact%20us'],
    ['#booking', '#booking'],
    ['mailto:hello@tea.example', 'mailto:hello@tea.example']
  ]
  for (const [given, sent] of cases) {
    assert.equal(plainAddress(given), sent, given)
    assert.match(plainAddress(given), TAKEN, given)
  }
  const site = { plan: { pages: [] }, kit: { pages: [] }, facts: new Map(), rows: [], articles: new Map() }
  assert.deepEqual(linkTarget('http://booking.example/a table', site), {
    kind: 'address',
    url: 'https://booking.example/a%20table'
  })
})

test("a path the plan names that is a kept page's slug or kit path is that page, never a bare path", () => {
  // Dev lat30 (23/11/2026): two buttons were written as "/memberships" and answered 404 on a site without URL rewriting.
  const site = {
    plan: {
      pages: [
        { id: 'page-plans', decision: 'keep', slug: 'memberships' },
        { id: 'page-about', decision: 'keep' },
        { id: 'page-old', decision: 'drop', slug: 'old' }
      ]
    },
    kit: {
      pages: [
        { id: 'page-plans', path: '/plans' },
        { id: 'page-about', path: '/about-us' },
        { id: 'page-old', path: '/old' }
      ]
    },
    facts: new Map(),
    rows: [],
    articles: new Map()
  }
  const at = (target) => linkTarget(target, site)
  assert.deepEqual(at('/memberships'), at('page-plans'), 'by the plan slug')
  assert.deepEqual(at('/about-us'), at('page-about'), 'by the kit path')
  assert.deepEqual(
    at('/somewhere'),
    { kind: 'address', url: '/somewhere' },
    'no kept page: the address as given'
  )
  assert.deepEqual(at('/old'), { kind: 'address', url: '/old' }, 'a dropped page is not a kept page')
})
