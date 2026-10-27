/**
 * The customer's words into the inspiration's slots — order, roles, cutting, and an agent's copy
 * winning over the cut (spec §4f).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cutTo, planBrandFill, planFill } from '../src/client/fill.mjs'

const SITE = {
  name: 'Tracy',
  nav: ['Skills', 'MCP Servers', 'Learn', 'Pricing'],
  eyebrow: 'AI workstation for website operations',
  headline: 'One desk for every site you run.',
  sub: 'Tracy pairs an AI agent with each of your sites — armed with the skills of the teams who operate these platforms best. It reads, checks and proposes; you approve what ships.',
  cta: 'Download for macOS & Windows',
  cta2: 'Browse Skills & Bundles'
}
const PAGES = [
  { path: '/', type: 'home', label: 'Home', data: {} },
  {
    path: '/skills/',
    type: 'listing',
    label: 'Skills',
    data: {
      title: 'Claude Skills for the sites you run',
      items: [
        { name: 'WordPress', kind: 'Skills' },
        { name: 'Shopify', kind: 'Skills' }
      ]
    }
  },
  {
    path: '/pricing/',
    type: 'pricing',
    label: 'Pricing',
    data: { title: 'Per person. Not per site.', plans: ['Monthly', 'Yearly'], prices: ['$29', '$299'] }
  }
]
const slot = (id, role, words, inNav = false) => ({ id, role, words, inNav })

test('cutTo: within 125% of the slot the words pass whole; beyond, cut at a word and marked; a floor keeps meaning', () => {
  assert.equal(cutTo('One desk for every site you run.', 9), 'One desk for every site you run.')
  assert.equal(cutTo('One desk for every site you run.', 3), 'One desk for every…')
  assert.equal(cutTo('One desk for every site you run.', 3, 6), 'One desk for every site you…')
  assert.equal(cutTo('  spaced   out ', 5), 'spaced out')
})

test('home page: brand, eyebrow, headline, lead, two CTAs, nav buttons in order; titles and figures stay as drawn', () => {
  const slots = [
    slot('span.0', 'brand', 1, true),
    slot('button.0', 'button', 1, true),
    slot('button.1', 'button', 2, true),
    slot('button.2', 'button', 3, false),
    slot('p.0', 'eyebrow', 4),
    slot('h1.0', 'headline', 9),
    slot('p.1', 'paragraph', 46),
    slot('h2.0', 'title', 7),
    slot('h2.1', 'title', 5),
    slot('span.9', 'number', 1)
  ]
  const fills = Object.fromEntries(
    planFill(slots, { site: SITE, pages: PAGES, page: PAGES[0] }).map((f) => [f.id, f.text])
  )
  assert.equal(fills['span.0'], 'Tracy')
  assert.equal(fills['button.0'], 'Skills', 'a button inside the nav takes a menu label')
  assert.equal(fills['button.1'], 'MCP Servers')
  assert.equal(
    fills['button.2'],
    'Download for macOS &…',
    'a button outside the nav is the CTA, cut to the slot (3 words → 4 max)'
  )
  assert.equal(fills['p.0'], 'AI workstation for website operations')
  assert.equal(fills['h1.0'], 'One desk for every site you run.')
  assert.match(fills['p.1'], /^Tracy pairs an AI agent/)
  assert.equal(fills['h2.0'], undefined, 'a component card keeps its own title')
  assert.equal(fills['h2.1'], undefined)
  assert.equal(
    fills['span.9'],
    undefined,
    'a metric tile keeps its own figure — prices belong to the pricing section, not a fixture'
  )
})

test('listing page: the listing title is the headline; item names, labels stay as drawn', () => {
  const slots = [
    slot('h1.0', 'headline', 9),
    slot('h3.0', 'subtitle', 2),
    slot('h3.1', 'subtitle', 2),
    slot('span.4', 'label', 1)
  ]
  const fills = Object.fromEntries(
    planFill(slots, { site: SITE, pages: PAGES, page: PAGES[1] }).map((f) => [f.id, f.text])
  )
  assert.equal(fills['h1.0'], 'Claude Skills for the sites you run')
  assert.equal(fills['h3.0'], undefined, "the fixture's card titles are the author's")
  assert.equal(fills['h3.1'], undefined)
  assert.equal(fills['span.4'], undefined, 'stat captions and badges have no honest source')
})

test('pricing page: the page title is the headline and its eyebrow the label; plans, prices and quotes stay as drawn', () => {
  const slots = [
    slot('p.0', 'eyebrow', 2),
    slot('h1.0', 'headline', 6),
    slot('h3.0', 'subtitle', 2),
    slot('span.1', 'number', 1),
    slot('blockquote.0', 'quote', 8)
  ]
  const fills = planFill(slots, { site: SITE, pages: PAGES, page: PAGES[2] })
  assert.deepEqual(
    fills.map((f) => [f.id, f.text]),
    [
      ['p.0', 'Pricing'],
      ['h1.0', 'Per person. Not per site.']
    ],
    'a fixture has no honest slot for a plan or a price'
  )
})

test("an agent's copy wins over the cut, slot by slot", () => {
  const slots = [slot('h1.0', 'headline', 9), slot('p.1', 'paragraph', 10)]
  const fills = planFill(slots, {
    site: SITE,
    pages: PAGES,
    page: PAGES[0],
    copy: { 'h1.0': 'One desk. Every site.' }
  })
  assert.equal(fills[0].text, 'One desk. Every site.')
  assert.match(fills[1].text, /…$/, 'the paragraph still falls back to the cut')
})

test('planFill: every fill carries the slot role, so the DOM half knows which elements replace whole', () => {
  const out = planFill([{ id: 'p.0', role: 'paragraph', words: 12 }], {
    site: { sub: 'Every component here is styled by one seed and nothing else at all today' }
  })
  assert.equal(out[0].role, 'paragraph')
})

test("planBrandFill: a sample product keeps the author's words; only the brand slot, buttons and nav become the site's", () => {
  const slots = [
    { id: 'p.0', role: 'eyebrow', words: 2, text: 'Deck module' },
    { id: 'h1.0', role: 'headline', words: 3, text: 'Bugatti Executive deck' },
    { id: 'p.1', role: 'paragraph', words: 8, text: 'Slide-scale title, metric, and section patterns.' },
    { id: 'a.0', role: 'button', words: 1, text: 'Continue' },
    { id: 'a.1', role: 'button', words: 2, text: 'View details' },
    { id: 'span.0', role: 'brand', words: 1, text: 'Bugatti' },
    { id: 'a.3', role: 'button', words: 1, text: 'Docs', inNav: true }
  ]
  const site = {
    name: 'Tracy',
    nav: ['Skills', 'Pricing'],
    cta: 'Download for macOS & Windows',
    cta2: 'Browse Skills & Bundles'
  }
  const fills = planBrandFill(slots, { site })
  const by = Object.fromEntries(fills.map((f) => [f.id, f.text]))
  assert.deepEqual(
    Object.keys(by).sort(),
    ['a.0', 'a.1', 'a.3', 'span.0'],
    "headline, eyebrow, paragraph stay the author's"
  )
  assert.equal(by['span.0'], 'Tracy')
  assert.equal(
    by['a.0'],
    'Download for macOS &…',
    'a one-word button slot: the call to action cut at the button floor'
  )
  assert.equal(by['a.1'], 'Browse Skills & Bundles')
  assert.equal(by['a.3'], 'Skills', 'nav from the site')
  const withCopy = planBrandFill(slots, { site, copy: { 'h1.0': 'Written headline' } })
  assert.equal(withCopy.find((f) => f.id === 'h1.0').text, 'Written headline')
  assert.deepEqual(
    planBrandFill(slots, { site: { name: '' } }).map((f) => f.id),
    [],
    'no site data: nothing changes'
  )
})
