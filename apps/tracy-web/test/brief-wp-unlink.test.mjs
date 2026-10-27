/**
 * A link into a page the customer unticked is taken off the WordPress site, never sent to the contact page (product owner,
 * 08/10/2026, TCH #1013): a button goes on its own and its section stays, a link inside a sentence keeps its words, an item
 * that is nothing but the link goes. A block a contract slot writes into is hidden (`metadata.blockVisibility: false`)
 * instead of cut, so guided editing still finds it.
 *
 * The pages below are verbatim from the tracy-base wp7 1.1.2 release (`tracy-base-wp7-database-1.1.2.sql.gz`, read
 * 08/10/2026), and the slot blocks are the real contract's (`slotBlocksByPage`).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { namedBlocks, parseBlocks } from '../src/sites/brief-engines/wp-blocks.js'
import { slotBlocksByPage, slotBlocksLost } from '../src/sites/brief-engines/wp-residue.js'
import { linksOff } from '../src/sites/brief-engines/wp-unlink.js'

const fixture = (/** @type {string} */ name) =>
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', `tracy-base-wp7-1.1.2-${name}.html`),
    'utf8'
  )
const contract = contractFor(defaultContracts(), 'tracy-base/wp7', '1.1.2')
assert.ok(contract, 'the checkout ships tracy-base/wp7 1.1.2')
const SLOTS = slotBlocksByPage(JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8')))
/** Whether a link leads to one of `paths` of this site, the way the sweep reads an address (path, no query). */
const goes = (/** @type {string[]} */ paths) => (/** @type {string} */ url) =>
  url.startsWith('/') &&
  paths.includes(new URL(url, 'http://site.invalid').pathname.replace(/\/+$/, '') || '/')

test("Product page, Pricing unticked: the hero's slot button to Pricing is hidden, its partner and the section stay", () => {
  const body = fixture('product')
  const keep = SLOTS.get('product') ?? new Set()
  assert.ok(keep.has('hero.btn-1'), 'the contract writes into the hero button')
  const out = linksOff(body, goes(['/pricing']), keep)
  assert.deepEqual(out.removed, ['Explore sample plans'])
  assert.equal(out.hidden, 1)
  const root = parseBlocks(out.markup)
  assert.ok(root)
  const [button] = namedBlocks(root, 'hero.btn-1')
  assert.equal(button.attrs.metadata.blockVisibility, false, 'WordPress renders it as nothing')
  assert.equal(button.attrs.metadata.name, 'hero.btn-1', 'and the slot still finds it')
  assert.equal(slotBlocksLost(body, out.markup, keep), 0)
  const [partner] = namedBlocks(root, 'hero.btn-2')
  assert.equal(partner.attrs.metadata.blockVisibility, undefined, 'the contact button is not touched')
  assert.equal(button.parent?.name, 'core/buttons')
  assert.equal(button.parent?.attrs?.metadata, undefined, 'a group that still shows a button stays as it is')
  assert.equal(out.markup.replace(/"blockVisibility":false,/, ''), body, 'nothing else of the page moves')
})

test('Product page with no slot named: the button to Pricing goes on its own, its buttons group and section stay', () => {
  const body = fixture('product')
  const out = linksOff(body, goes(['/pricing']))
  assert.deepEqual(out.removed, ['Explore sample plans'])
  assert.equal(out.hidden, 0)
  assert.equal(out.markup.includes('href="/pricing"'), false)
  assert.ok(out.markup.includes('href="/resources/contact">Talk about a project</a>'))
  assert.ok(out.markup.includes('A clear foundation for the work ahead.'), 'the hero stays')
  assert.ok(parseBlocks(out.markup))
})

test('About page, Product unticked: a button alone in its group goes with the group; the section around it stays', () => {
  const body = fixture('about')
  const keep = SLOTS.get('about') ?? new Set()
  const out = linksOff(body, goes(['/product']), keep)
  assert.deepEqual(out.removed, ['See the website toolkit'])
  // The second block named story-chapter.link is no slot's own (the slot is the first): it is cut, not hidden.
  assert.equal(out.hidden, 0)
  assert.equal(out.markup.includes('/product'), false)
  assert.equal(slotBlocksLost(body, out.markup, keep), 0)
  const root = parseBlocks(out.markup)
  assert.ok(root)
  assert.equal(namedBlocks(root, 'story-chapter.link').length, 1, 'the first chapter link (Services) stays')
  assert.equal(
    (out.markup.match(/<!-- wp:buttons /g) ?? []).length,
    (body.match(/<!-- wp:buttons /g) ?? []).length - 1,
    'the emptied buttons group goes'
  )
})

test('Home page, Product unticked: a paragraph that is only the link goes; the words beside it stay', () => {
  const body = [
    '<!-- wp:group {"className":"tracy-zig__text"} -->',
    '<div class="wp-block-group tracy-zig__text">',
    '<!-- wp:paragraph {"className":"mb-0"} -->',
    '<p class="mb-0">Connect colour, typography and imagery across service pages, team profiles and articles.</p>',
    '<!-- /wp:paragraph -->',
    '<!-- wp:paragraph -->',
    '<p><a href="/product">Explore the website toolkit</a></p>',
    '<!-- /wp:paragraph -->',
    '</div>',
    '<!-- /wp:group -->'
  ].join('\n')
  const out = linksOff(body, goes(['/product']))
  assert.deepEqual(out.removed, ['Explore the website toolkit'])
  assert.equal(out.markup.includes('/product'), false)
  assert.ok(out.markup.includes('Connect colour, typography and imagery'))
  assert.ok(parseBlocks(out.markup))
})

test('a heading that links to an unticked page keeps its words and loses the link (All categories, Blog unticked)', () => {
  const body = fixture('all-categories')
  const out = linksOff(body, goes(['/resources/blog']))
  assert.equal(out.unwrapped, 1)
  assert.deepEqual(out.removed, [])
  assert.ok(out.markup.includes('<h3 class="wp-block-heading">Content guides</h3>'))
  assert.equal(out.markup.includes('href="/resources/blog"'), false)
  assert.ok(out.markup.includes('href="/services"'), 'a link to a page that stays is left')
})

test('a link inside a sentence keeps every word; a raw HTML button goes whole; what is not a link into the page is left', () => {
  const away = goes(['/pricing'])
  const body = [
    '<!-- wp:paragraph -->\n<p>See <a href="/pricing/?from=home">our <strong>plans</strong></a> first.</p>\n<!-- /wp:paragraph -->',
    '<!-- wp:html -->\n<div class="cta"><a class="btn btn-primary" href="/pricing">Get started</a> <a href="/pricing">or compare</a> <a href="https://partner.example/pricing">partner</a> <span data-href="/pricing">x</span></div>\n<!-- /wp:html -->',
    '<!-- wp:navigation-link {"label":"Pricing","url":"/pricing"} /-->',
    '<!-- wp:list -->\n<ul class="wp-block-list"><!-- wp:list-item -->\n<li><strong>Plans:</strong> <a href="/pricing">Pricing</a></li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->'
  ].join('\n')
  const out = linksOff(body, away)
  assert.ok(out.markup.includes('<p>See our <strong>plans</strong> first.</p>'))
  assert.ok(out.markup.includes('<div class="cta"> or compare <a href="https://partner.example/pricing">'))
  assert.ok(
    out.markup.includes('<span data-href="/pricing">x</span>'),
    'an attribute that is not a link is left'
  )
  assert.ok(out.markup.includes('{"label":"Pricing","url":"/pricing"}'), "a menu's own link is navWithout's")
  assert.ok(
    out.markup.includes('<li><strong>Plans:</strong> Pricing</li>'),
    'an item with other words keeps them'
  )
  assert.deepEqual(out.removed, ['Get started'])
  assert.equal(out.unwrapped, 3)
  assert.ok(parseBlocks(out.markup))
})

test('a block whose own url leads there goes; a hidden slot button hides the group it leaves with nothing to show', () => {
  const away = goes(['/pricing'])
  const card =
    '<!-- wp:wp-tracy-business/cta-card {"url":"/pricing/"} -->\n<div class="cta-card"><p>Plans</p></div>\n<!-- /wp:wp-tracy-business/cta-card -->'
  assert.deepEqual(linksOff(card, away), { markup: '', removed: ['Plans'], unwrapped: 0, hidden: 0 })
  const button = (/** @type {string} */ attrs) =>
    `<!-- wp:buttons -->\n<div class="wp-block-buttons"><!-- wp:button ${attrs}-->\n<div class="wp-block-button"><a class="wp-block-button__link" href="/pricing">Plans</a></div>\n<!-- /wp:button --></div>\n<!-- /wp:buttons -->`
  const empty = linksOff(button('{"metadata":{},"className":"x"} '), away, new Set())
  assert.equal(empty.markup, '', 'no slot: the button and its emptied group go')
  const slot = linksOff(button('{"metadata":{"name":"cta.btn"}} '), away, new Set(['cta.btn']))
  const root = parseBlocks(slot.markup)
  assert.ok(root)
  assert.equal(namedBlocks(root, 'cta.btn')[0].attrs.metadata.blockVisibility, false)
  assert.deepEqual(
    root.children[0].attrs,
    { metadata: { blockVisibility: false } },
    'the group of a hidden slot button is hidden with it'
  )
})

test('the Tracy Base header loses the items that only lead to an unticked page, and nothing else', () => {
  const header = fixture('header')
  const out = linksOff(header, goes(['/pricing', '/blog']))
  assert.deepEqual(out.removed, ['Pricing', 'Blog'])
  assert.equal(out.markup.includes('href="/pricing"'), false)
  assert.equal(out.markup.includes('href="/blog"'), false)
  for (const kept of ['href="/">Home', 'href="/product">Product', 'href="/contact">Contact'])
    assert.ok(out.markup.includes(kept), `${kept} stays`)
  assert.deepEqual(
    linksOff(header, () => false),
    { markup: header, removed: [], unwrapped: 0, hidden: 0 }
  )
})
