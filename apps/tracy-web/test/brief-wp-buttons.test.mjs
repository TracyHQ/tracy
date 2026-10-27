/**
 * The buttons of a WordPress page or part, told apart by where they lead (`wp-buttons.js`): a button into a page names that
 * page, a social button and one to `#` are translated only (K6), a button to a demo document leads to Contact (DEMO FILE LINKS).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseBlocks } from '../src/sites/brief-engines/wp-blocks.js'
import {
  buttonKind,
  buttonLink,
  fileLinksToContact,
  holdTargets,
  pageAt,
  sharesWord,
  targetName
} from '../src/sites/brief-engines/wp-buttons.js'
import { labelLines, staticLines } from '../src/sites/brief-engines/wp-leaves.js'
import { buttonLabels, buttonTargets, buttonWords } from '../src/sites/brief-engines/wp-residue.js'

const button = (label, href, attrs = '') =>
  `<!-- wp:button${attrs} -->\n<div class="wp-block-button"><a class="wp-block-button__link wp-element-button"${href === null ? '' : ` href="${href}"`}>${label}</a></div>\n<!-- /wp:button -->`
const PAGES = [
  { slug: 'home', title: 'Home', url: 'https://bake.test/' },
  { slug: 'contact', title: 'Contact', url: 'https://bake.test/contact/' },
  { slug: 'menu', title: 'Our &amp; menu', url: 'https://bake.test/menu/' }
]

test('a button is social by its label, class or address; void by an empty, `#` or script link; file by a document', () => {
  for (const [b, kind] of [
    [{ text: '@Grazia on instagram', href: '#' }, 'social'],
    [{ text: 'Follow us', href: 'https://www.facebook.com/example.bakery' }, 'social'],
    [{ text: 'Follow', href: '/x', className: 'is-style-social' }, 'social'],
    [{ text: 'Book a demo', href: '#' }, 'void'],
    [{ text: 'Book a demo', href: '' }, 'void'],
    [{ text: 'Book a demo', href: null }, 'void'],
    [{ text: 'Book a demo', href: 'javascript:void(0)' }, 'void'],
    [{ text: 'Company profile', href: '/wp-content/uploads/profile.PDF?v=2' }, 'file'],
    [{ text: 'Become a subscriber', href: '/contact/' }, 'page'],
    [{ text: 'Read on', href: '#section-2' }, 'page']
  ])
    assert.equal(buttonKind(b), kind, JSON.stringify(b))
})

test('a button link is read from its anchor, its classes from the block and the anchor', () => {
  const markup = button('Go', '/a/?x=1&amp;y=2', ' {"className":"je-btn"}')
  const node = parseBlocks(markup).children[0]
  assert.deepEqual(buttonLink(markup, node), {
    href: '/a/?x=1&y=2',
    className: 'je-btn wp-block-button__link wp-element-button'
  })
})

test('the page a link opens is found by its path, on this site only; the planner is told its title', () => {
  assert.equal(pageAt('/contact', PAGES)?.slug, 'contact')
  assert.equal(pageAt('https://bake.test/contact/', PAGES)?.slug, 'contact')
  assert.equal(pageAt('https://other.test/contact/', PAGES), null)
  assert.equal(pageAt('/', PAGES)?.slug, 'home')
  assert.equal(pageAt('mailto:a@b.c', PAGES), null)
  assert.equal(targetName('/contact/', PAGES), 'the "Contact" page')
  assert.equal(targetName('/menu/', PAGES), 'the "Our & menu" page')
  assert.equal(targetName('https://other.test/', PAGES), 'a page of another site')
  assert.equal(targetName('#', PAGES), 'no page')
})

test('holdTargets gives a disobedient label the name of the page it opens; one that names it, or has no known name, stays', () => {
  const relabel = new Map([
    ['Become a subscriber', 'Xem thực đơn'],
    ['Subscribe', 'Liên hệ đặt bánh'],
    ['Visit', 'Ghé tiệm'],
    ['Contact', 'Liên hệ']
  ])
  const out = holdTargets(
    relabel,
    [
      { text: 'Become a subscriber', target: 'Contact' },
      { text: 'Subscribe', target: 'Contact' },
      { text: 'Visit', target: 'Our story' }
    ],
    { language: true }
  )
  assert.deepEqual(out, { held: ['Become a subscriber'], unsure: ['Visit'] })
  assert.equal(relabel.get('Become a subscriber'), 'Liên hệ')
  assert.equal(relabel.get('Subscribe'), 'Liên hệ đặt bánh')
  assert.equal(relabel.get('Visit'), 'Ghé tiệm')
  assert.equal(sharesWord('Contact the bakery', 'Contact'), true)
})

test('a social button, one to `#` and one to a document are no lines to rewrite; the first two are labels to translate', () => {
  const body = [
    button('@Grazia on instagram for more', '#'),
    button('Book a Consultation today', '#'),
    button('Download the company profile', '/files/profile.pdf'),
    button('Become a subscriber', '/contact/')
  ].join('\n')
  assert.deepEqual(staticLines(body), [
    { text: 'Become a subscriber', block: 'core/button', href: '/contact/' }
  ])
  assert.deepEqual(
    labelLines(body).map((l) => l.text),
    ['@Grazia on instagram for more', 'Book a Consultation today']
  )
  assert.deepEqual(buttonLabels(body), [])
  assert.deepEqual(buttonWords(body), ['@Grazia on instagram for more', 'Book a Consultation today'])
  const part = [
    button('Subscribe', '/contact/'),
    button('Donate', '#'),
    button('Instagram', 'https://instagram.com/x')
  ].join('\n')
  assert.deepEqual(buttonLabels(part), ['Subscribe'])
  assert.deepEqual(buttonTargets(part), [{ text: 'Subscribe', href: '/contact/' }])
  assert.deepEqual(buttonWords(part), ['Donate', 'Instagram'])
})

test('a button to a document of the demo company leads to the Contact page and says contact; nothing else moves', () => {
  const body = [
    '<!-- wp:paragraph -->\n<p>Our profile</p>\n<!-- /wp:paragraph -->',
    button('Download profile', '/wp-content/uploads/profile.pdf', ' {"className":"is-style-outline"}'),
    button('Become a subscriber', '/contact/')
  ].join('\n')
  const out = fileLinksToContact(body, { url: 'https://bake.test/contact/', label: 'Liên hệ' })
  assert.equal(out.moved, 1)
  assert.equal(out.left, 0)
  assert.ok(out.markup.includes('href="https://bake.test/contact/">Liên hệ</a>'))
  assert.ok(
    out.markup.includes('<!-- wp:button {"className":"is-style-outline"} -->'),
    'the block keeps its comment'
  )
  assert.ok(out.markup.includes('href="/contact/">Become a subscriber</a>'))
  assert.ok(out.markup.includes('<p>Our profile</p>'))
  assert.equal(out.markup.includes('.pdf'), false)
  assert.ok(parseBlocks(out.markup))
})

// 🔒 ON FULL A BUTTON TO NOWHERE OF A PAGE OR A PART LEADS TO THE CONTACT PAGE UNDER THE TEMPLATE'S CONTACT LABEL (PAGE-5, decision
// of 11/10/2026): the seeder does it for the content slots; a header or footer button is no slot, so it is done here. A social
// button keeps its `#` (K6), decor keeps its arrow, a button that leads somewhere is left; without `voids` (BLANK) none moves.
test('with voids, a button to nowhere with words leads to the Contact page; social, decor and real links stay', () => {
  const body = [
    button('Join the club', '#'),
    button('Book now', null),
    button('@Grazia on instagram', '#'),
    button('→', '#'),
    button('Become a subscriber', '/contact/')
  ].join('\n')
  const to = { url: '/contact/', label: 'Liên hệ' }
  const blank = fileLinksToContact(body, to)
  assert.equal(blank.moved, 0, 'BLANK: nothing moves')
  assert.equal(blank.markup, body)
  const out = fileLinksToContact(body, { ...to, voids: true })
  assert.equal(out.moved, 2, 'an anchor without an address is given one')
  assert.equal(out.left, 0)
  assert.equal(out.markup.split('>Liên hệ</a>').length - 1, 2, out.markup)
  assert.equal(out.markup.split('href="/contact/"').length - 1, 3, 'two moved, one already there')
  assert.equal(/Join the club|Book now/.test(out.markup), false)
  assert.ok(out.markup.includes('href="#">@Grazia on instagram</a>'), 'social stays (K6)')
  assert.ok(out.markup.includes('href="#">→</a>'), 'decor stays')
  assert.ok(out.markup.includes('href="/contact/">Become a subscriber</a>'))
  assert.ok(parseBlocks(out.markup))
})
