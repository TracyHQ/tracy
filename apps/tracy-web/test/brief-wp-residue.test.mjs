/**
 * What "Apply" takes off a WordPress site once the words are in: the blocks the customer's words never reached
 * (another company's history, certificates, plants, menus), cut out of the body without moving a byte of the rest.
 * The markup below is the shape of the real `tracy-business/wp7` pages, header and footer, measured 03/10/2026.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { showcasePageIds } from '../src/lib/showcase-nav-map.js'
import { cut, hasLive, leavesOf, parseBlocks, plain } from '../src/sites/brief-engines/wp-blocks.js'
import {
  judgeSite,
  navLabels,
  navWithout,
  pruneBody,
  PROTECTED,
  relabel,
  showcasePages,
  editionPageIds,
  sweepWordPress,
  writtenLines
} from '../src/sites/brief-engines/wp-residue.js'

const section = (name, ...lines) =>
  `<!-- wp:group {"className":"wtb-section ${name}"} -->\n<div class="wp-block-group wtb-section ${name}">\n` +
  lines
    .map(
      (l, i) => `<!-- wp:paragraph {"metadata":{"name":"line.${i}"}} -->\n<p>${l}</p>\n<!-- /wp:paragraph -->`
    )
    .join('\n') +
  `\n</div>\n<!-- /wp:group -->`

const heading = (text) => `<!-- wp:heading {"level":2} -->\n<h2>${text}</h2>\n<!-- /wp:heading -->`

const html = (raw) => `<!-- wp:html -->\n${raw}\n<!-- /wp:html -->`

/** An About page as the plugin leaves it after the contract write: two written sections around demo ones. */
const ABOUT = [
  section('wtb-text', 'Our bakery', 'A family bakery in Hanoi.'),
  html(
    '<section class="timeline"><h2>History</h2><p>2004 Founded. First projects near Moscow.</p></section>'
  ),
  section('wtb-team', 'Our bakers', 'Baking team'),
  html(
    '<section><h2>Accreditations</h2><ul><li>ISO 9001:2015</li><li>NAKS certification</li></ul></section>'
  ),
  section('wtb-text', 'Safety', 'Zero lost-time incidents over the last 36 months.'),
  section('wtb-cta', 'Order your bakes')
].join('\n\n')

const WRITTEN = writtenLines([
  'Our bakery',
  'A family bakery in Hanoi.',
  'Our bakers',
  'Baking team',
  'Order your bakes',
  'Golden Crust Bakery'
])

test('blocks are read as ranges of the original string, with their names and attributes', () => {
  const root = parseBlocks(ABOUT)
  assert.ok(root)
  assert.deepEqual(
    root.children.map((b) => b.name),
    ['core/group', 'core/html', 'core/group', 'core/html', 'core/group', 'core/group']
  )
  assert.equal(root.children[0].attrs.className, 'wtb-section wtb-text')
  assert.equal(root.children[0].children.length, 2)
  // Not one byte is dropped: the ranges of the top-level blocks and what lies between them are the body.
  const [first] = root.children
  assert.equal(ABOUT.slice(first.start, first.end).startsWith('<!-- wp:group'), true)
  assert.equal(ABOUT.slice(first.start, first.end).endsWith('<!-- /wp:group -->'), true)
})

test('a body that is not well-formed block markup is never read as one', () => {
  assert.equal(parseBlocks('<!-- wp:group -->\n<div>\n'), null, 'an unclosed block')
  assert.equal(
    parseBlocks('<!-- wp:group --><!-- /wp:paragraph -->'),
    null,
    'a closing comment that does not match'
  )
  assert.equal(parseBlocks('<!-- wp:paragraph {not json} -->\n<p>x</p>\n<!-- /wp:paragraph -->'), null)
  assert.ok(parseBlocks('plain text with no blocks at all'), 'classic content has no blocks and is fine')
})

test('the text a visitor reads is what is inside the tags, decoded and tidy', () => {
  assert.equal(plain('M&amp;E  engineering&nbsp;&#8211; 24&#x2F;7'), 'M&E engineering – 24/7')
  const root = parseBlocks(ABOUT)
  assert.deepEqual(leavesOf(ABOUT, root.children[1]), [
    'History',
    '2004 Founded. First projects near Moscow.'
  ])
  assert.deepEqual(leavesOf(ABOUT, root.children[0]), ['Our bakery', 'A family bakery in Hanoi.'])
  const withScript = html('<style>.a{}</style><p>Shown</p><script>var hidden = 1</script>')
  assert.deepEqual(leavesOf(withScript, parseBlocks(withScript).children[0]), ['Shown'])
})

test('sections the written words never reached are cut, and nothing else moves', () => {
  const out = pruneBody(ABOUT, { written: WRITTEN })
  assert.deepEqual(
    out.cut.map((c) => c.text),
    ['History', 'Accreditations', 'Safety']
  )
  assert.equal(out.refused, undefined)
  const root = parseBlocks(out.markup)
  assert.deepEqual(
    root.children.map((b) => leavesOf(out.markup, b)[0]),
    ['Our bakery', 'Our bakers', 'Order your bakes']
  )
  // The sections that stay are byte for byte what they were.
  for (const kept of root.children) {
    const block = out.markup.slice(kept.start, kept.end)
    assert.ok(ABOUT.includes(block), `changed on the way: ${block.slice(0, 80)}`)
  }
  assert.equal(out.markup.includes('\n\n\n'), false, 'no stack of blank lines is left where a block was')
})

test("a section with one written line is the customer's, however much of the demo is around it", () => {
  const page = section(
    'wtb-text',
    'Where we work',
    'Head office and plant sit in the Vorsino industrial park.',
    'Our counter'
  )
  const out = pruneBody(page, { written: writtenLines(['Our counter']) })
  assert.deepEqual(out.cut, [])
  assert.equal(out.markup, page)
})

test("a raw HTML section whose line happens to equal a written one is still the template's", () => {
  // Measured 03/10/2026: the model wrote "What we offer" into a heading, and the Services page's own raw HTML
  // "What we offer" (six industrial services) counted as the customer's because of it.
  const page = [
    section('wtb-text', 'What we offer', 'Fresh bread every day'),
    html('<section><h2>What we offer</h2><p>General contracting</p><p>Steel structures</p></section>'),
    section('wtb-cta', 'Order now'),
    section('wtb-more', 'Cakes to order')
  ].join('\n\n')
  const out = pruneBody(page, {
    written: writtenLines(['What we offer', 'Fresh bread every day', 'Order now', 'Cakes to order'])
  })
  assert.deepEqual(
    out.cut.map((c) => [c.name, c.text]),
    [['core/html', 'What we offer']]
  )
})

test('a written value stands for any line that contains it', () => {
  const page = section('wtb-text', 'Welcome to Golden Crust Bakery, baked fresh every single day')
  assert.deepEqual(pruneBody(page, { written: writtenLines(['Golden Crust Bakery, baked fresh']) }).cut, [])
})

test('a page that would lose most of what it says is left alone and said so', () => {
  const page = [
    section('a', 'One', 'One more'),
    section('b', 'Two', 'Two more'),
    section('c', 'Three', 'Three more'),
    section('d', 'Four', 'Four more')
  ].join('\n\n')
  const out = pruneBody(page, { written: writtenLines(['One']) })
  assert.equal(out.markup, page)
  assert.match(out.refused, /3 of its 4 sections/)
})

test('a lone untouched line is for the other words of the page to say again, not for the cutting; raw HTML has no one to say it', () => {
  const page = [
    section('wtb-text', 'Our bakery', 'A family bakery.'),
    heading('Get our industry brief every two weeks'),
    html('<p>A single demo sentence in raw HTML</p>')
  ].join('\n\n')
  const out = pruneBody(page, { written: writtenLines(['Our bakery', 'A family bakery.']) })
  assert.deepEqual(
    out.cut.map((c) => [c.name, c.text]),
    [['core/html', 'A single demo sentence in raw HTML']]
  )
  assert.ok(out.markup.includes('Get our industry brief every two weeks'))
})

test('a body that cannot be read is left alone', () => {
  const out = pruneBody('<!-- wp:group -->\n<div>', { written: new Set() })
  assert.equal(out.markup, '<!-- wp:group -->\n<div>')
  assert.match(out.refused, /not block markup/)
})

// The header of the real template: a menu, an identity token, and a mega menu whose columns are two lists of the
// template's own pages and projects and one live query.
const HEADER = `<!-- wp:group {"className":"tracy-header__menu"} -->
<div class="wp-block-group tracy-header__menu">
<!-- wp:navigation {"className":"tracy-nav","metadata":{"name":"nav.tracy"}} /-->
<!-- wp:wp-tracy-business/mega-menu {"label":"Resources"} -->
<!-- wp:columns {"className":"tracy-mega__columns"} -->
<div class="wp-block-columns tracy-mega__columns">
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Marketing kit</h3>
<!-- /wp:heading -->
<!-- wp:list -->
<ul class="wp-block-list">
<!-- wp:list-item -->
<li><a href="/newsletter/">Newsletter</a><span>Digest email template</span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><a href="/email/">Email</a><span>Transactional emails</span></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:column -->
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">Recent projects</h3>
<!-- /wp:heading -->
<!-- wp:list -->
<ul class="wp-block-list">
<!-- wp:list-item -->
<li><a href="/project-detail/">Elektra plant, Lipetsk SEZ</a><span>62,000 m² · 2025</span></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><a href="/project-detail/">Vorsino IP, phase 3</a><span>48 ha · 2024</span></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:column -->
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading">News &amp; updates</h3>
<!-- /wp:heading -->
<!-- wp:query {"queryId":11,"query":{"perPage":5}} -->
<div class="wp-block-query">
<!-- wp:post-template -->
<!-- wp:post-title /-->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->
<!-- /wp:wp-tracy-business/mega-menu -->
<!-- wp:paragraph -->
<p data-tracy-identity="contact.phone">Hotline: {contact.phone}</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->`

test('live blocks are found by name and by identity token, and are never cut', () => {
  const root = parseBlocks(HEADER)
  assert.equal(hasLive(HEADER, root.children[0]), true)
  const nav = root.children[0].children[0]
  assert.equal(nav.name, 'core/navigation')
  assert.equal(hasLive(HEADER, nav), true)
  const phone = root.children[0].children.at(-1)
  assert.equal(hasLive(HEADER, phone), true, 'an identity token is live')
  const plainParagraph = parseBlocks(section('x', 'Just words')).children[0]
  assert.equal(hasLive(section('x', 'Just words'), plainParagraph), false)
})

test("the mega menu loses its two columns of the template's own pages and projects, and keeps the live one", () => {
  const out = pruneBody(HEADER, { written: new Set() })
  assert.equal(out.refused, undefined)
  assert.equal(out.cut.length, 2)
  assert.deepEqual(
    out.cut.map((c) => c.text),
    ['Marketing kit', 'Recent projects']
  )
  assert.equal(out.markup.includes('Elektra'), false)
  assert.equal(out.markup.includes('Newsletter'), false)
  // The menu, the live query with the label that sits beside it, and the identity token are all still there.
  assert.ok(out.markup.includes('wp:navigation'))
  assert.ok(out.markup.includes('News &amp; updates'))
  assert.ok(out.markup.includes('wp:query'))
  assert.ok(out.markup.includes('{contact.phone}'))
  assert.ok(parseBlocks(out.markup))
})

test('a lone line beside a live block is its label and stays; a short list is not cut inside a live block', () => {
  const page =
    '<!-- wp:group -->\n<div>\n<!-- wp:heading -->\n<h3>Subscribe</h3>\n<!-- /wp:heading -->\n' +
    '<!-- wp:paragraph -->\n<p>Get our digest</p>\n<!-- /wp:paragraph -->\n' +
    '<!-- wp:shortcode -->[form id="1"]<!-- /wp:shortcode -->\n</div>\n<!-- /wp:group -->'
  const out = pruneBody(page, { written: new Set() })
  assert.deepEqual(out.cut, [], "two lines beside a form: the form's own words")
})

const FOOTER = `<!-- wp:columns -->
<div class="wp-block-columns">
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:paragraph -->
<p>{site.legalName}. {site.slogan}</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:column -->
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading -->
<h3>Services</h3>
<!-- /wp:heading -->
<!-- wp:list -->
<ul>
<!-- wp:list-item -->
<li><a href="/services/">Industrial park infrastructure</a></li>
<!-- /wp:list-item -->
<!-- wp:list-item -->
<li><a href="/services/">Pre-engineered buildings</a></li>
<!-- /wp:list-item -->
</ul>
<!-- /wp:list -->
</div>
<!-- /wp:column -->
<!-- wp:column -->
<div class="wp-block-column">
<!-- wp:heading -->
<h3>Company</h3>
<!-- /wp:heading -->
<!-- wp:navigation {"metadata":{"name":"nav.footer-company"}} /-->
</div>
<!-- /wp:column -->
</div>
<!-- /wp:columns -->`

test("the footer loses the template's service list and keeps its identity lines and its menu", () => {
  const out = pruneBody(FOOTER, { written: new Set() })
  assert.deepEqual(
    out.cut.map((c) => c.text),
    ['Services']
  )
  assert.equal(out.markup.includes('Pre-engineered'), false)
  assert.ok(out.markup.includes('{site.legalName}') && out.markup.includes('nav.footer-company'))
})

test('cut() takes the blank line a block leaves behind, and only that', () => {
  const text = 'A\n\nB\n\nC'
  assert.equal(cut(text, [[3, 4]]), 'A\n\nC')
  assert.equal(cut('A\nB\nC', [[2, 3]]), 'A\nC')
  assert.equal(cut('B\nC', [[0, 1]]), 'C')
  assert.equal(cut('A\nB', [[2, 3]]), 'A\n')
})

// The shape of JA Essence WordPress 1.0.10's article and kit pages (/detail/layout-1/, /pages/j-pages/error-page/): the
// article body is an unnamed group of paragraphs inside the page's live card, the kit card an unnamed group of raw HTML and a
// picture, and the contract's slots are the sidebar's headings. Measured 11/10/2026 on dev (g57-ess-wp-full): the FULL sweep cut
// both, about 2,100 characters of article on four pages and the whole card on three.
const ARTICLE = [
  '<!-- wp:group {"className":"je-article-main"} -->\n<div class="wp-block-group je-article-main">',
  '<!-- wp:post-title {"level":1,"metadata":{"name":"page.title"}} /-->',
  '<!-- wp:group {"className":"je-prose"} -->\n<div class="wp-block-group je-prose">',
  '<!-- wp:paragraph -->\n<p>Its sometimes her behaviour are contented. Do listening am eagerness.</p>\n<!-- /wp:paragraph -->',
  html(
    '<figure class="area-blockquote"><blockquote><p>If you want to live a happy life, tie it to a goal.</p></blockquote><figcaption>Albert Flores</figcaption></figure>'
  ),
  '<!-- wp:heading -->\n<h2>Me unpleasing impossible</h2>\n<!-- /wp:heading -->',
  '<!-- wp:paragraph -->\n<p>It is remarkable to watch a five-year-old draw.</p>\n<!-- /wp:paragraph -->',
  '</div>\n<!-- /wp:group -->',
  '</div>\n<!-- /wp:group -->'
].join('\n')
const KIT_CARD =
  '<!-- wp:group {"className":"je-articlecard je-articlecard--plain"} -->\n<div class="wp-block-group je-articlecard">\n' +
  html(
    '<div class="well"><center>Each <strong>JA Template</strong> has its own matching 404 page.</center></div>'
  ) +
  '\n<!-- wp:image -->\n<figure class="wp-block-image"><img src="/404-1.jpg" alt=""/></figure>\n<!-- /wp:image -->\n</div>\n<!-- /wp:group -->'
const ESSENCE_SIDEBAR = section('je-side', 'Newsletter', 'Join 70,000 subscribers!')
const BRANDED = html(
  '<section><h2>About JA Essence</h2><p>JA Essence is a magazine theme by JoomlArt.</p></section>'
)

// 🔒 FULL KEEPS THE TEMPLATE'S CONTENT BLOCKS (TCH #1013, spec TCQR: answered fields change, unticked pages go, everything else
// keeps the template's structure and blocks). A block no written word reached keeps its demo words; only one that names the
// template's own company is the template's residue, and goes.
test("with the template's company names given, a block the words never reached stays unless it names that company", () => {
  const body = [ARTICLE, KIT_CARD, ESSENCE_SIDEBAR, BRANDED].join('\n\n')
  const written = writtenLines(['Newsletter', 'Join 70,000 subscribers!'])
  const out = pruneBody(body, { written, names: ['JA Essence'] })
  assert.deepEqual(
    out.cut.map((c) => [c.name, c.text]),
    [['core/html', 'About JA Essence']]
  )
  assert.ok(out.markup.includes('Its sometimes her behaviour'), 'the article body stays')
  assert.ok(out.markup.includes('Albert Flores'), 'its quote stays')
  assert.ok(
    out.markup.includes('matching 404 page') && out.markup.includes('/404-1.jpg'),
    'the kit card stays'
  )
  assert.equal(out.markup.includes('magazine theme by JoomlArt'), false)
  // Spelled any way, the name is the name; a template that declares none has no residue to cut.
  assert.equal(pruneBody(body, { written, names: ['ja essence'] }).cut.length, 1)
  assert.deepEqual(pruneBody(body, { written, names: [] }).cut, [])
  assert.equal(pruneBody(body, { written, names: [] }).markup, body)
})

// 🔒 An opportunity's build replaces, never removes (product owner, 22/10/2026): what would be cut stays, saying the placeholder.
test("with `fill`, a block naming the template's company stays, every line of it saying the placeholder", () => {
  const owned = section('je-about', 'JA Essence story', 'Made by JA Essence since 2010.')
  const body = [ARTICLE, KIT_CARD, BRANDED, owned].join('\n\n')
  const written = writtenLines([])
  const out = pruneBody(body, { written, names: ['JA Essence'], fill: 'Coming soon' })
  assert.deepEqual(
    out.cut.map((c) => c.text),
    ['About JA Essence', 'JA Essence story']
  )
  assert.equal(parseBlocks(out.markup).children.length, parseBlocks(body).children.length, 'no block goes')
  assert.ok(!/JA Essence|JoomlArt/.test(out.markup), 'no line names the company')
  assert.match(out.markup, /<h2>Coming soon<\/h2><p>Coming soon<\/p>/)
  assert.ok(out.markup.includes('class="wp-block-group'), 'the tags and classes stay')
  assert.ok(out.markup.includes('Its sometimes her behaviour'), 'a block not naming it keeps its words')
  const cut = pruneBody(body, { written, names: ['JA Essence'] })
  assert.equal(
    parseBlocks(cut.markup).children.length,
    parseBlocks(body).children.length - 2,
    'without fill, both go'
  )
})

// A page of one section naming the demo's restaurant: the cut limit refused it, so its words stayed (review, 22/10/2026).
test('with `fill`, a page whose every section names the company is still filled: the cut limit does not hold', () => {
  const body = section('je-about', 'JA Essence story', 'Made by JA Essence since 2010.')
  const written = writtenLines([])
  assert.match(
    String(pruneBody(body, { written, names: ['JA Essence'] }).refused),
    /would lose 1 of its 1 sections/
  )
  const out = pruneBody(body, { written, names: ['JA Essence'], fill: 'Coming soon' })
  assert.equal(out.refused, undefined)
  assert.equal(out.cut.length, 1)
  assert.ok(!out.markup.includes('JA Essence'), out.markup)
  assert.equal(out.markup.match(/<p>Coming soon<\/p>/g)?.length, 2, out.markup)
  assert.equal(parseBlocks(out.markup).children.length, 1, 'the block stays')
})

test("a FULL sweep given the template's names leaves the demo's sections, the header's lists and the footer's list in place", async () => {
  const { site, call } = fakeSite()
  const before = { about: site.pages.find((p) => p.id === 37).content, header: site.parts.header }
  const out = await sweepWordPress(sweepInput(call, { names: ['Northgate'] }))
  assert.equal(
    site.pages.find((p) => p.id === 37).content,
    before.about,
    'History and Accreditations name no company'
  )
  assert.ok(site.parts.header.includes('Elektra'), "the header's lists stay")
  assert.ok(site.parts.footer.includes('Pre-engineered'), "the footer's list stays")
  assert.ok(site.parts.header.includes('Recent projects') && site.parts.header.includes('Marketing kit'))
  assert.deepEqual(out.hidden, ['careers'], 'the page the customer unticked still goes')
})

const page = (id, slug, content, status = 'publish') => ({ id, slug, status, content })

test("pages the contract has no slot on and that hold nothing but stored text are the template's own showcase, which stays as released", () => {
  const pages = [
    page(1, 'about', section('a', 'About us')),
    page(2, 'email', section('a', 'Transactional emails', 'Welcome mail')),
    page(3, 'style-guide', html('<h1>Style guide</h1><p>Type scale</p>')),
    page(4, 'news', '<!-- wp:query -->\n<div><!-- wp:post-title /--></div>\n<!-- /wp:query -->'),
    page(5, 'sitemap', ''),
    page(6, 'slide', section('a', 'Slides'), 'draft'),
    page(
      7,
      'newsletter',
      section('a', 'Digest', 'Template') + '\n' + '<!-- wp:shortcode -->[form]<!-- /wp:shortcode -->'
    ),
    page(8, 'careers', section('a', 'Join us'))
  ]
  const out = showcasePages(pages, new Set(['about', 'careers']))
  assert.deepEqual(
    out.map((p) => p.slug),
    ['email', 'style-guide', 'newsletter'],
    "an entity page, the protected pages, an empty page and a draft are left; a live token does not make a kit page the customer's"
  )
  assert.ok(PROTECTED.has('home') && PROTECTED.has('contact'))
})

const NAV = `<!-- wp:navigation-link {"label":"Careers","type":"page","id":38,"url":"http://walk.test/careers/","kind":"post-type"} /-->
<!-- wp:navigation-link {"label":"Investors","type":"page","id":43,"url":"http://walk.test/investor-relations/","kind":"post-type"} /-->
<!-- wp:navigation-link {"label":"About us","type":"page","id":37,"url":"http://walk.test/about/","kind":"post-type"} /-->`

test('a navigation loses the links to pages that are hidden, by id or by address', () => {
  const out = navWithout(NAV, { slugs: new Set(['investor-relations']), ids: new Set([38]) })
  assert.deepEqual(out.cut, ['Careers', 'Investors'])
  assert.ok(out.markup.includes('About us'))
  assert.equal(out.markup.includes('Careers'), false)
  assert.deepEqual(navWithout(NAV, { slugs: new Set(), ids: new Set() }).cut, [])
})

test('a menu label is changed only where it stands in the block exactly as it was shown', () => {
  const nav = `${NAV}\n<!-- wp:navigation-link {"label":"Book a site survey","url":"http://walk.test/contact/"} /-->`
  assert.deepEqual(navLabels(nav), ['Careers', 'Investors', 'About us', 'Book a site survey'])
  const out = relabel(
    nav,
    new Map([
      ['Book a site survey', 'Contact us'],
      ['Missing', 'Nothing']
    ])
  )
  assert.deepEqual(out.changed, ['Book a site survey'])
  assert.ok(out.markup.includes('"label":"Contact us"'))
  assert.equal(out.markup.includes('Book a site survey'), false)
  assert.equal(relabel(nav, new Map()).markup, nav)
})

const business = { name: 'Golden Crust Bakery', about: 'A family bakery in Hanoi.', sector: 'bakery' }
const modelSaying = (answer, asked = []) => ({
  chat: async (call) => {
    asked.push(call)
    return answer
  }
})

// 🔒 THE JUDGE NEVER TAKES A PAGE OFF (product owner, 08/10/2026, TCH #1013): it is asked about the menu labels only, and a
// "hide" in its answer, which it is no longer asked for, is ignored.
test('the judge relabels only labels it was shown, is never asked about pages, and only reads an answer that is JSON', async () => {
  const template = { labels: ['About us', 'Book a site survey'] }
  const asked = []
  const out = await judgeSite(
    modelSaying(
      'Sure! {"hide": ["investor-relations", "about"], "relabel": {"Book a site survey": "Contact us", "Home": "Start", "About us": ""}}',
      asked
    ),
    business,
    template
  )
  assert.deepEqual(Object.keys(out), ['relabel'], 'nothing about pages comes out of the judge')
  assert.deepEqual(
    [...out.relabel],
    [['Book a site survey', 'Contact us']],
    'a label it was not shown, or an empty one, is ignored'
  )
  assert.match(asked[0].messages[1].content, /Golden Crust Bakery/)
  assert.doesNotMatch(asked[0].messages[1].content, /"pages"/, 'the pages are not shown to it')
  assert.doesNotMatch(asked[0].messages[0].content, /"hide"/, 'and it is not asked to hide anything')
  assert.equal(asked[0].temperature, 0, 'the same question is answered the same way each time')
  const none = await judgeSite(modelSaying('{"relabel": []}'), business, template)
  assert.deepEqual([...none.relabel], [])
  const never = []
  await judgeSite(modelSaying('{}', never), business, { labels: [] })
  assert.equal(never.length, 0, 'nothing to judge, nothing asked')
})

test('the judge reads the first JSON object of an answer, whatever surrounds it', async () => {
  const template = { labels: ['Book a site survey'] }
  const out = await judgeSite(
    modelSaying(
      'Here you go:\n```json\n{"relabel": {"Book a site survey": "Contact us"}}\n```\nNote: {keep the rest}'
    ),
    business,
    template
  )
  assert.deepEqual([...out.relabel], [['Book a site survey', 'Contact us']])
})

test('an answer that is not one is asked for again once, and said out loud when it is still not one', async () => {
  const template = { labels: ['Book a site survey'] }
  const answers = ['no idea', '{"relabel": {"Book a site survey": "Contact us"}}']
  const asked = []
  const second = await judgeSite(
    { chat: async (call) => (asked.push(call), answers.shift()) },
    business,
    template
  )
  assert.deepEqual([...second.relabel], [['Book a site survey', 'Contact us']], 'the second try answered')
  assert.equal(asked.length, 2)
  for (const answer of ['', 'no idea', '{}', '{"hide": ["careers"]}']) {
    const tries = []
    await assert.rejects(
      judgeSite(modelSaying(answer, tries), business, template),
      /did not say which menu labels/,
      `"${answer}" is not an answer to the question`
    )
    assert.equal(tries.length, 2, 'asked twice, and no more')
  }
})

// 🔒 A SITE WRITTEN IN ONE LANGUAGE OTHER THAN THE SOURCE'S HAS ITS MENUS IN THAT LANGUAGE (TCH #1013, measured 08/10/2026 on
// dev tamq-8w-bizwp: Vietnamese pages under "Home", "About", "Careers", "Book a site survey"). The menu labels are no slot
// of the contract, so the judge that relabels them is asked for every label in that language.
test('a site written in another language has the judge write every menu label in it, not only the ones it would change', async () => {
  const template = { labels: ['Home', 'About', 'Careers', 'Book a site survey'], language: 'Vietnamese' }
  const asked = []
  const out = await judgeSite(
    modelSaying(
      '{"relabel": {"Home": "Trang chủ", "About": "Giới thiệu", "Careers": "Tuyển dụng", "Book a site survey": "Liên hệ", "Pricing": "Bảng giá"}}',
      asked
    ),
    business,
    template
  )
  assert.deepEqual(
    [...out.relabel],
    [
      ['Home', 'Trang chủ'],
      ['About', 'Giới thiệu'],
      ['Careers', 'Tuyển dụng'],
      ['Book a site survey', 'Liên hệ']
    ],
    'every label it was shown, and none it was not'
  )
  assert.match(asked[0].messages[0].content, /Vietnamese/, 'it is told the language the site is written in')
  assert.doesNotMatch(
    asked[0].messages[0].content,
    /Leave ordinary labels/,
    'and ordinary labels are not left out'
  )
  assert.ok(asked[0].maxTokens >= 600, 'room for every label')
})

test('a site in the source language keeps the judge asking only about labels that name what the business does not do', async () => {
  const asked = []
  await judgeSite(modelSaying('{"relabel": {}}', asked), business, { labels: ['Home'] })
  assert.match(asked[0].messages[0].content, /Leave ordinary labels/)
  await judgeSite(modelSaying('{"relabel": {}}', asked), business, { labels: ['Home'], language: null })
  assert.match(asked[1].messages[0].content, /Leave ordinary labels/)
})

test('the label of a submenu is read and relabelled like a link', () => {
  const nav = `<!-- wp:navigation-submenu {"label":"Product","url":"/product/"} -->
<!-- wp:navigation-link {"label":"Features","url":"/features/"} /-->
<!-- /wp:navigation-submenu -->`
  assert.deepEqual(navLabels(nav), ['Product', 'Features'])
  const out = relabel(
    nav,
    new Map([
      ['Product', 'Sản phẩm'],
      ['Features', 'Tính năng']
    ])
  )
  assert.deepEqual(out.changed.sort(), ['Features', 'Product'])
  assert.ok(out.markup.includes('"label":"Sản phẩm"') && out.markup.includes('"label":"Tính năng"'))
})

/** A small site behind a fake door: what is listed, read and written, and in what order. */
function fakeSite({ refuse = () => false, editions = false } = {}) {
  const site = {
    pages: [
      { id: 37, slug: 'about', title: 'About', status: 'publish', content: ABOUT },
      {
        id: 38,
        slug: 'careers',
        title: 'Careers',
        status: 'publish',
        content: section('c', 'Join us', 'Open roles')
      },
      {
        id: 40,
        slug: 'email',
        title: 'Email',
        status: 'publish',
        content: section('e', 'Transactional emails')
      },
      {
        id: 42,
        slug: 'home',
        title: 'Home',
        status: 'publish',
        content: section('h', 'Golden Crust Bakery')
      },
      {
        id: 51,
        slug: 'news',
        title: 'News',
        status: 'publish',
        content: '<!-- wp:query -->\n<div></div>\n<!-- /wp:query -->'
      },
      { id: 90, slug: 'old', title: 'Old', status: 'draft', content: section('o', 'Never shown') }
    ],
    parts: { header: HEADER, footer: FOOTER },
    navs: [
      { id: 69, slug: 'topbar', title: 'topbar', status: 'publish', content: NAV },
      {
        id: 71,
        slug: 'footer-contact',
        title: 'footer-contact',
        status: 'publish',
        content: '<!-- wp:navigation-link {"label":"Book a site survey","url":"/contact/"} /-->'
      },
      { id: 70, slug: 'footer-company', title: 'footer-company', status: 'draft', content: NAV }
    ],
    /** @type {Array<{ id: number, slug: string, title: string, status: string, url?: string, content?: string }>} */
    posts: [],
    calls: /** @type {Array<{ action: string, params: any }>} */ ([]),
    writes: /** @type {Array<{ action: string, params: any }>} */ ([]),
    open: 0,
    overlap: false
  }
  if (editions)
    site.navs.push({
      id: 169,
      slug: 'topbar-vi',
      title: 'topbar-vi',
      status: 'publish',
      content: '<!-- wp:navigation-link {"label":"Book a site survey","id":1952,"url":"/vi/careers-vi/"} /-->'
    })
  if (editions)
    site.pages.push(
      { id: 1951, slug: 'about-vi', title: 'Giới thiệu', status: 'publish', content: ABOUT },
      {
        id: 1952,
        slug: 'careers-vi',
        title: 'Tuyển dụng',
        status: 'publish',
        content: section('c', 'Tuyển dụng')
      }
    )
  const call = async (action, params) => {
    site.calls.push({ action, params })
    if (action === 'content.update') {
      site.open += 1
      if (site.open > 1) site.overlap = true
      await new Promise((resolve) => setTimeout(resolve, 2))
      site.open -= 1
      if (refuse(params)) return { ok: false, message: 'the site would not take it' }
      site.writes.push({ action, params })
      const { kind, id, key, fields } = params
      if (kind === 'templatePart') site.parts[key] = fields.content
      else {
        const row = [...site.pages, ...site.navs, ...site.posts].find((r) => r.id === id)
        if (fields.post_content !== undefined) row.content = fields.post_content
        if (fields.post_status !== undefined) row.status = fields.post_status
      }
      return { ok: true }
    }
    if (action === 'content.get')
      return { ok: true, item: { content: site.parts[params.key] }, body_revision: `rev-${params.key}` }
    const rows =
      params.post_type === 'page' ? site.pages : params.post_type === 'post' ? site.posts : site.navs
    const items = rows.slice(params.offset, params.offset + params.limit).map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      ...(r.url ? { url: r.url } : {}),
      ...(params.include_body ? { content: r.content } : {})
    }))
    return { ok: true, items }
  }
  return { site, call }
}

const sweepInput = (call, extra = {}) => ({
  call,
  applyId: 'residue-test',
  written: WRITTEN,
  entitySlugs: new Set(['about', 'careers', 'home']),
  judged: { relabel: new Map([['Book a site survey', 'Contact us']]) },
  // The customer unticked Careers in the Pages question.
  unwanted: () => ['careers'],
  ...extra
})

test('the sweep cuts what the words never reached and hides the pages the customer unticked, all under one apply id and one write at a time', async () => {
  const { site, call } = fakeSite()
  const out = await sweepWordPress(sweepInput(call))
  // The About page lost its demo sections; the header its two columns; the footer its list.
  const about = site.pages.find((p) => p.id === 37)
  assert.equal(about.content.includes('Accreditations') || about.content.includes('History'), false)
  assert.ok(about.content.includes('Our bakery'))
  assert.equal(site.parts.header.includes('Elektra'), false)
  assert.equal(site.parts.footer.includes('Pre-engineered'), false)
  // The page the customer unticked is a draft now; the showcase page stays published as released, its sections whole; the
  // posts page and a draft are untouched.
  assert.deepEqual(out.hidden.sort(), ['careers'])
  assert.equal(site.pages.find((p) => p.slug === 'email').status, 'publish')
  assert.equal(site.pages.find((p) => p.slug === 'email').content, section('e', 'Transactional emails'))
  assert.equal(site.pages.find((p) => p.slug === 'news').status, 'publish')
  assert.equal(
    site.writes.some((w) => w.params.id === 90),
    false
  )
  // The menus lose the links to the hidden pages and the label that named the demo's trade.
  assert.equal(site.navs[0].content.includes('Careers'), false)
  assert.ok(site.navs[0].content.includes('About us'))
  assert.ok(site.navs[1].content.includes('"label":"Contact us"'))
  assert.equal(site.navs[2].content, NAV, 'a draft menu is not touched')
  assert.equal(out.relabelled, 1)
  assert.ok(out.cut >= 6)
  assert.equal(site.overlap, false, 'a site takes one writer at a time')
  assert.deepEqual([...new Set(site.writes.map((w) => w.params.apply_id))], ['residue-test'])
  assert.equal(
    site.writes.find((w) => w.params.kind === 'templatePart' && w.params.key === 'header').params
      .expected_body_revision,
    'rev-header'
  )
  assert.deepEqual(out.notes, [])
})

// 🔒 THE SHOWCASE IS PUT AWAY FROM NAVIGATION, NEVER DRAFTED (showcase-nav-map.json): provisioning took its links out of the
// menus, so a page of the map stays published even when the Pages answer leaves it unticked; a business page the customer
// unticked is drafted as before.
test('a page of the showcase-navigation map stays published when unticked; an unticked business page is drafted as before', async () => {
  const { site, call } = fakeSite()
  const out = await sweepWordPress(
    sweepInput(call, { unwanted: () => ['careers', 'email'], showcase: new Set([40]) })
  )
  assert.deepEqual(out.hidden.sort(), ['careers'])
  assert.equal(site.pages.find((p) => p.slug === 'careers').status, 'draft')
  assert.equal(site.pages.find((p) => p.slug === 'email').status, 'publish')
  assert.equal(
    site.writes.some((w) => w.params.id === 40 && w.params.fields?.post_status !== undefined),
    false
  )
  // Without the map the same answer drafts both: the map, not a second rule, is what keeps the showcase page.
  const bare = fakeSite()
  const before = await sweepWordPress(sweepInput(bare.call, { unwanted: () => ['careers', 'email'] }))
  assert.deepEqual(before.hidden.sort(), ['careers', 'email'])
})

// A showcase page the map names only by address (JA Kinetic's header links, `templatePart.removeBlock` with no page id) is
// found by its path among the source pages, and stays published all the same.
test('a showcase page the map names only by its address stays published when unticked', async () => {
  const map = {
    operations: [
      {
        op: 'templatePart.removeBlock',
        block: { name: 'core/list-item', contains: '<a href="/email">' }
      }
    ]
  }
  const { site, call } = fakeSite()
  const out = await sweepWordPress(
    sweepInput(call, {
      unwanted: () => ['careers', 'email'],
      showcase: (pages) => showcasePageIds(map, pages)
    })
  )
  assert.deepEqual(out.hidden.sort(), ['careers'])
  assert.equal(site.pages.find((p) => p.slug === 'email').status, 'publish')
  assert.equal(site.pages.find((p) => p.slug === 'careers').status, 'draft')
})

// 🔒 A PAGE IS HIDDEN ONLY WHEN THE CUSTOMER UNTICKED IT (product owner, 08/10/2026, TCH #1013). A page no slot names (the
// template's email kit) and a page a model would call another company's (Careers, for a bakery) stay published, their menu
// links stay where they lead, and nothing is said about them to the customer.
test('a page with sample text and no slot, and a page the judge would not want, stay published when the customer unticked nothing', async () => {
  const { site, call } = fakeSite()
  site.pages.push({
    id: 44,
    slug: 'contact',
    title: 'Contact',
    status: 'publish',
    content: section('c', 'Golden Crust Bakery')
  })
  const email = site.pages.find((p) => p.slug === 'email').content
  const out = await sweepWordPress(sweepInput(call, { unwanted: () => [] }))
  assert.deepEqual(out.hidden, [])
  for (const slug of ['careers', 'email', 'about', 'news'])
    assert.equal(site.pages.find((p) => p.slug === slug).status, 'publish', slug)
  assert.equal(site.pages.find((p) => p.slug === 'email').content, email, 'the showcase keeps its sections')
  // The menus keep their links to those pages, where they led: nothing is sent to the contact page.
  assert.ok(
    site.navs[0].content.includes('"label":"Careers","type":"page","id":38,"url":"http://walk.test/careers/"')
  )
  assert.ok(site.navs[0].content.includes('"label":"Investors"'))
  assert.equal(out.unlinked, 0)
  assert.ok(site.navs[1].content.includes('"label":"Contact us"'), 'the judge still relabels')
  // A page a slot names is swept as ever (its unwritten section is said); the showcase, which no slot names, is not.
  assert.equal(
    out.notes.some((n) => /email/.test(n)),
    false,
    'the customer is told nothing about the showcase that stays'
  )
})

test('the other editions are swept with their own words, and the translation of a hidden page goes with it', async () => {
  const { site, call } = fakeSite({ editions: true })
  const out = await sweepWordPress(
    sweepInput(call, {
      extras: [{ slug: 'vi', written: writtenLines(['Our bakery', 'Our bakers', 'Order your bakes']) }]
    })
  )
  assert.equal(site.pages.find((p) => p.id === 1952).status, 'draft', 'careers-vi goes with careers')
  assert.deepEqual(out.hidden.sort(), ['careers', 'careers-vi'])
  // The translation of a page that stays is swept with the words written into THAT edition.
  const aboutVi = site.pages.find((p) => p.id === 1951)
  assert.equal(aboutVi.status, 'publish')
  assert.equal(aboutVi.content.includes('Accreditations'), false)
  // Its menu loses the link to the hidden translation by id, and keeps its own label.
  const vi = site.navs.find((n) => n.slug === 'topbar-vi')
  assert.equal(vi.content.includes('"id":1952'), false)
  assert.equal(site.navs.find((n) => n.id === 71).content.includes('Contact us'), true)
})

test('a write the site refuses costs that change and is said; the rest is still done', async () => {
  const { site, call } = fakeSite({ refuse: (p) => p.id === 37 })
  const out = await sweepWordPress(sweepInput(call))
  assert.equal(out.notes.length, 1)
  assert.match(out.notes[0], /the about page could not be changed: the site would not take it/)
  assert.equal(site.pages.find((p) => p.id === 37).content, ABOUT, 'the refused page is as it was')
  assert.equal(site.parts.header.includes('Elektra'), false, 'the header is still done')
  assert.deepEqual(out.hidden.sort(), ['careers'])
})

test('a site the sweep has nothing to take off is not written to at all', async () => {
  const clean = section('x', 'Our bakery')
  const { site, call } = fakeSite()
  site.pages = [{ id: 42, slug: 'home', title: 'Home', status: 'publish', content: clean }]
  site.parts = { header: clean, footer: clean }
  site.navs = []
  const out = await sweepWordPress(
    sweepInput(call, {
      written: writtenLines(['Our bakery']),
      judged: { relabel: new Map() },
      unwanted: () => []
    })
  )
  assert.equal(site.writes.length, 0)
  assert.deepEqual([out.cut, out.pages, out.parts, out.navs, out.hidden], [0, 0, 0, 0, []])
})

const SIDEBAR = `<!-- wp:group {"className":"tracy-aside__card"} -->
<div class="wp-block-group tracy-aside__card">
<!-- wp:search {"label":"Search"} /-->
<!-- wp:heading {"level":2} -->
<h2>Get our industry brief every two weeks</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>Tender news, material price movements and engineering notes.</p>
<!-- /wp:paragraph -->
<!-- wp:shortcode -->
[contact-form-7 id="349"]
<!-- /wp:shortcode -->
</div>
<!-- /wp:group -->`

test("the theme's other parts are cleaned like the header, by the lines placed in them; a part the theme does not have is skipped", async () => {
  const { site, call } = fakeSite()
  site.parts['sidebar-news'] = SIDEBAR
  const out = await sweepWordPress(
    sweepInput(call, {
      lines: [
        {
          slug: 'part-sidebar-news',
          text: 'Get our industry brief every two weeks',
          value: 'Fresh news in your inbox'
        },
        {
          slug: 'part-sidebar-news',
          text: 'Tender news, material price movements and engineering notes.',
          value: null
        }
      ]
    })
  )
  assert.ok(site.parts['sidebar-news'].includes('<h2>Fresh news in your inbox</h2>'))
  assert.equal(site.parts['sidebar-news'].includes('Tender news'), false)
  assert.ok(site.parts['sidebar-news'].includes('[contact-form-7 id="349"]'), 'the form is as it was')
  const written = site.writes
    .filter((w) => w.params.kind === 'templatePart')
    .map((w) => w.params.key)
    .sort()
  assert.deepEqual(
    written,
    ['footer', 'header', 'sidebar-news'],
    'no write for a part the theme has no such thing as'
  )
  assert.ok(out.edited >= 1 && out.dropped >= 1)
})

test('a menu written inside a part (no wp_navigation post behind it) has its labels changed like any menu', async () => {
  const { site, call } = fakeSite()
  site.parts.header = `${site.parts.header}
<!-- wp:navigation {"className":"inline-nav"} -->
<!-- wp:navigation-link {"label":"Book a site survey","url":"/contact/"} /-->
<!-- wp:navigation-link {"label":"Pricing","url":"/pricing/"} /-->
<!-- /wp:navigation -->`
  const out = await sweepWordPress(sweepInput(call))
  assert.ok(site.parts.header.includes('"label":"Contact us"'), 'the label in the part is changed')
  assert.ok(site.parts.header.includes('"label":"Pricing"'), 'one the judge did not name is left')
  assert.ok(out.relabelled >= 2, 'counted with the menus')
  assert.ok(
    site.writes.every((w) => w.params.apply_id === 'residue-test'),
    'under the one apply id the undo takes back'
  )
})

/**
 * A site that runs Polylang, as its door really answers: `content.list` of pages follows the request's language, so only
 * the source edition is listed, and a translation is read only by its id (`content.get`, the raw post fields). Measured
 * 05/10/2026 on a two-language `tracy-business/wp7` site: 17 pages listed, every `-vi` copy absent.
 */
function polylangSite() {
  const clinic = [
    section('wtb-text', 'Gentle dentistry', 'A dental clinic in Lyon.'),
    section('wtb-list', 'Steel mills', 'Port cranes', 'Rail yards'),
    section('wtb-cta', 'Book a check-up')
  ].join('\n\n')
  const cliniqueFr = [
    section('wtb-text', 'Dentisterie douce', 'Un cabinet dentaire à Lyon.'),
    section('wtb-list', 'Aciéries', 'Grues portuaires', 'Gares de triage'),
    section('wtb-cta', 'Prendre rendez-vous')
  ].join('\n\n')
  const site = {
    pages: [
      { id: 10, slug: 'home', title: 'Home', status: 'publish', content: section('h', 'Lotus Dental') },
      { id: 11, slug: 'services', title: 'Services', status: 'publish', content: clinic },
      {
        id: 13,
        slug: 'careers',
        title: 'Careers',
        status: 'publish',
        content: section('c', 'Join us', 'Open roles')
      }
    ],
    translations: [
      { id: 110, slug: 'fr', title: 'Accueil', status: 'publish', content: section('h', 'Lotus Dental') },
      { id: 111, slug: 'services-fr', title: 'Services', status: 'publish', content: cliniqueFr },
      // A copy whose slug carries no language suffix (the shape of the Russian copies, percent-encoded Cyrillic).
      {
        id: 113,
        slug: 'carrieres',
        title: 'Carrières',
        status: 'publish',
        content: section('c', 'Rejoignez-nous', 'Postes ouverts')
      },
      {
        id: 114,
        slug: 'about-fr',
        title: 'À propos',
        status: 'draft',
        content: section('a', 'Jamais publié', 'Brouillon')
      },
      // An id the release gave a page and this site gave a blog post.
      {
        id: 116,
        type: 'post',
        slug: 'a-blog-post',
        title: 'A post',
        status: 'publish',
        content: section('p', 'Someone else’s words')
      }
    ],
    navs: [
      {
        id: 160,
        slug: 'topbar-fr',
        title: 'topbar-fr',
        status: 'publish',
        content: '<!-- wp:navigation-link {"label":"Carrières","id":113,"url":"/fr/carrieres/"} /-->'
      }
    ],
    writes: /** @type {Array<{ action: string, params: any }>} */ ([]),
    gets: /** @type {number[]} */ ([])
  }
  const rowOf = (/** @type {number} */ id) =>
    [...site.pages, ...site.translations, ...site.navs].find((r) => r.id === id)
  const call = async (/** @type {string} */ action, /** @type {any} */ params) => {
    if (action === 'content.update') {
      site.writes.push({ action, params })
      const row = rowOf(params.id)
      if (params.fields.post_content !== undefined) row.content = params.fields.post_content
      if (params.fields.post_status !== undefined) row.status = params.fields.post_status
      return { ok: true }
    }
    if (action === 'content.get' && params.kind === 'post') {
      site.gets.push(params.id)
      const row = rowOf(params.id)
      if (!row) return { ok: false, error: 'not_found', message: `no post ${params.id}` }
      return {
        ok: true,
        item: {
          ID: row.id,
          post_type: row.type ?? 'page',
          post_name: row.slug,
          post_title: row.title,
          post_status: row.status,
          post_content: row.content
        }
      }
    }
    if (action === 'content.get') return { ok: false, error: 'not_found', message: 'no such part' }
    const rows = params.post_type === 'page' ? site.pages : site.navs
    const items = rows.slice(params.offset, params.offset + params.limit).map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      status: r.status,
      ...(params.include_body ? { content: r.content } : {})
    }))
    return { ok: true, items }
  }
  return { site, call }
}

test("a language the site's page list does not show is still swept: its pages are read by id, a hidden page's copy goes with it", async () => {
  const { site, call } = polylangSite()
  const out = await sweepWordPress({
    call,
    applyId: 'residue-fr',
    written: writtenLines([
      'Gentle dentistry',
      'A dental clinic in Lyon.',
      'Book a check-up',
      'Lotus Dental'
    ]),
    entitySlugs: new Set(['home', 'services', 'careers']),
    extras: [
      {
        slug: 'fr',
        written: writtenLines([
          'Dentisterie douce',
          'Un cabinet dentaire à Lyon.',
          'Prendre rendez-vous',
          'Lotus Dental'
        ])
      }
    ],
    editionPages: [
      { id: 110, edition: 'fr', slug: 'fr', base: 'home' },
      { id: 111, edition: 'fr', slug: 'services-fr', base: 'services' },
      { id: 113, edition: 'fr', slug: 'carrieres', base: 'careers' },
      { id: 114, edition: 'fr', slug: 'about-fr', base: 'about' },
      { id: 116, edition: 'fr', slug: 'contact-fr', base: 'contact' }
    ],
    judged: { relabel: new Map() },
    unwanted: () => ['careers']
  })
  const row = (/** @type {number} */ id) => site.translations.find((p) => p.id === id)
  assert.equal(row(113).status, 'draft', 'the copy of careers goes with careers, whatever its slug')
  assert.ok(out.hidden.includes('carrieres'))
  // A copy is never taken for a source page: the pages the customer unticked do not draft it.
  assert.equal(row(110).status, 'publish')
  // The copy of a page that stays is swept with the words written into its own language.
  assert.equal(row(111).status, 'publish')
  assert.equal(row(111).content.includes('Aciéries'), false)
  assert.ok(row(111).content.includes('Dentisterie douce'))
  // A draft copy is neither published nor written.
  assert.equal(row(114).status, 'draft')
  assert.equal(
    site.writes.some((w) => w.params.id === 114),
    false
  )
  // An id that is not the release's page on this site is neither read as one nor written, and it is said.
  assert.equal(
    site.writes.some((w) => w.params.id === 116),
    false
  )
  assert.ok(out.notes.some((n) => /1 page\(s\) of the other languages/.test(n)))
  // The French menu loses its link to the hidden copy.
  assert.equal(site.navs[0].content.includes('"id":113'), false)
  assert.deepEqual([...new Set(site.writes.map((w) => w.params.apply_id))], ['residue-fr'])
})

test('the pages of the languages asked for are found in the release inventory, each with its language and the source page it translates', () => {
  const inventory = {
    source: { language: 'en' },
    posts: [
      { id: 10, type: 'page', language: 'en', slug: 'services', group: 'g1' },
      { id: 11, type: 'page', language: 'en', slug: 'careers', group: 'g2' },
      { id: 110, type: 'page', language: 'fr', slug: 'services-fr', group: 'g1' },
      { id: 111, type: 'page', language: 'fr', slug: 'carrieres', group: 'g2' },
      { id: 112, type: 'page', language: 'fr', slug: 'mentions', group: null },
      { id: 210, type: 'page', language: 'pt-br', slug: 'servicos', group: 'g1' },
      { id: 310, type: 'page', language: 'de', slug: 'leistungen', group: 'g1' },
      { id: 500, type: 'post', language: 'fr', slug: 'un-article', group: null },
      { id: 3, type: 'page', language: null, slug: 'privacy-policy', group: null }
    ],
    translations: { g1: { en: 10, fr: 110, 'pt-br': 210, de: 310 }, g2: { en: 11, fr: 111 } }
  }
  assert.deepEqual(editionPageIds(inventory, ['fr', 'pt-br']), [
    { id: 110, edition: 'fr', slug: 'services-fr', base: 'services' },
    { id: 111, edition: 'fr', slug: 'carrieres', base: 'careers' },
    { id: 112, edition: 'fr', slug: 'mentions', base: null },
    { id: 210, edition: 'pt-br', slug: 'servicos', base: 'services' }
  ])
  assert.deepEqual(editionPageIds(inventory, []), [])
  assert.deepEqual(editionPageIds(null, ['fr']), [])
  assert.deepEqual(editionPageIds({ posts: 'broken' }, ['fr']), [])
})

// Measured 05/10/2026 (the same class on Joomla, a Tracy Business j6 site made with Apply): a page the tidy-up takes off is
// taken out of the menus, but a button or a link IN a page that leads to it was left, and a visitor got the 404 from the
// home page. On WordPress the sweep drafts the pages the customer unticked and cuts their menu links (`navWithout`); a link
// in the pages and the template parts that leads there is judged by its path (so a link of the site's own domain, http or
// https, is found too). A link to another site that happens to share the slug, and an attribute that is not a link
// (`data-href`), are not this site's.
// 🔒 A LINK INTO AN UNTICKED PAGE IS TAKEN OFF, NOT SENT TO THE CONTACT PAGE (product owner, 08/10/2026, TCH #1013): a button
// goes on its own (a slot's is hidden), a link inside a sentence keeps its words, an item that is only the link goes.
test('a link in a page or a part that leads to a page the sweep drafts is taken off, its words kept in a sentence; one to another site is left', async () => {
  const { site, call } = fakeSite()
  const button =
    '<!-- wp:buttons -->\n<div class="wp-block-buttons"><!-- wp:button {"metadata":{"name":"cta.primary"}} -->\n' +
    '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/teacher-training/">Train with us</a></div>\n' +
    '<!-- /wp:button --></div>\n<!-- /wp:buttons -->'
  const card =
    '<!-- wp:wp-tracy-business/cta-card {"url":"/teacher-training/","metadata":{"name":"cta.card"}} -->\n' +
    '<div class="cta-card"><p>Our studio</p></div>\n<!-- /wp:wp-tracy-business/cta-card -->'
  const prose = section(
    'wtb-text',
    'Our studio',
    'A yoga studio in Da Nang.',
    'Read about <a href="http://studio.test/teacher-training/">our teacher training</a> or ' +
      '<a href="https://partner.example/teacher-training/">a partner course</a>, ' +
      '<a href="/teacher-training/?from=about">this term</a> and <span data-href="/teacher-training/">the next</span>.'
  )
  site.pages = [
    {
      id: 42,
      slug: 'home',
      title: 'Home',
      status: 'publish',
      url: 'http://studio.test/',
      content: `${section('h', 'Lotus Flow Yoga')}\n\n${button}`
    },
    {
      id: 37,
      slug: 'about',
      title: 'About',
      status: 'publish',
      url: 'http://studio.test/about/',
      content: `${prose}\n\n${card}`
    },
    {
      id: 38,
      slug: 'teacher-training',
      title: 'Teacher training',
      status: 'publish',
      url: 'http://studio.test/teacher-training/',
      content: section('t', 'Become a teacher')
    },
    {
      id: 44,
      slug: 'contact',
      title: 'Contact',
      status: 'publish',
      url: 'http://studio.test/contact/',
      content: section('c', 'Lotus Flow Yoga')
    }
  ]
  site.parts = {
    header: section('x', 'Lotus Flow Yoga'),
    // A button in a part goes, like one in a page; an item that is only the link goes too (`linksOff`).
    footer:
      '<!-- wp:buttons -->\n<div class="wp-block-buttons"><!-- wp:button -->\n' +
      '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/teacher-training/">Teacher training</a></div>\n' +
      '<!-- /wp:button --></div>\n<!-- /wp:buttons -->\n' +
      '<!-- wp:paragraph -->\n<p><a href="/teacher-training/">Teacher training</a></p>\n<!-- /wp:paragraph -->'
  }
  site.navs = []
  const out = await sweepWordPress(
    sweepInput(call, {
      written: writtenLines(['Lotus Flow Yoga', 'Our studio', 'A yoga studio in Da Nang.']),
      entitySlugs: new Set(['home', 'about', 'teacher-training', 'contact']),
      judged: { relabel: new Map() },
      unwanted: () => ['teacher-training']
    })
  )
  const page = (id) => site.pages.find((p) => p.id === id).content
  assert.deepEqual(out.hidden, ['teacher-training'])
  assert.equal(page(42).includes('Train with us'), false, 'the button goes; no slot is named, so it is cut')
  assert.equal(page(42).includes('wp:buttons'), false, 'with the group it leaves empty')
  assert.ok(page(42).includes('Lotus Flow Yoga'), 'the rest of the page stays')
  assert.ok(
    page(37).includes(
      'Read about our teacher training or <a href="https://partner.example/teacher-training/">'
    ),
    'a link in a sentence keeps its words; one to another site is not this one'
  )
  assert.ok(page(37).includes(', this term and'), 'a query does not make it another page')
  assert.ok(
    page(37).includes('<span data-href="/teacher-training/">'),
    'an attribute that is not a link is left'
  )
  assert.equal(page(37).includes('cta.card'), false, 'a block whose own url leads there goes')
  assert.equal(
    site.parts.footer.includes('Teacher training'),
    false,
    'and in a template part, the button and the lone link'
  )
  assert.equal(
    [...Object.values(site.parts), ...site.pages.map((p) => p.content)].join('\n').includes('/contact/'),
    false,
    'nothing is sent to the contact page'
  )
  assert.doesNotMatch(
    [
      ...Object.values(site.parts),
      ...site.pages.filter((p) => p.status === 'publish').map((p) => p.content)
    ].join('\n'),
    /(?:\shref="|"url":")(?:http:\/\/studio\.test)?\/teacher-training\//,
    'nothing this site shows still leads there'
  )
  assert.equal(
    out.unlinked,
    6,
    'one button, one card and two sentence links in pages; one button and one item in the footer'
  )
  assert.equal(site.overlap, false)
  assert.deepEqual([...new Set(site.writes.map((w) => w.params.apply_id))], ['residue-test'])
  assert.deepEqual(out.notes, [])
})

// Measured 05/10/2026 (ledger L17) on a one-language JA WordPress template made with Apply: the Contact page and the footer
// still invited visitors to mail the demo company (`mailto:sales@…`, an e-mail tile in the footer), and the email and phone the
// customer typed were on no page at all — no slot of the contract holds a contact line there. A link that mails or calls is
// the business's own door, so the sweep points every one that is not the customer's at what the customer typed, and shows
// that where the link showed the demo's; with nothing typed, a link that is all its block says goes with its block.
const DEMO_MAIL = 'sales@orbitline.example'
const contactGroup = (...blocks) =>
  '<!-- wp:group {"className":"contact"} -->\n<div class="wp-block-group contact">\n' +
  '<!-- wp:paragraph {"metadata":{"name":"contact.heading"}} -->\n<p>Spoke &amp; Chain Cycles</p>\n<!-- /wp:paragraph -->\n' +
  blocks.join('\n') +
  '\n</div>\n<!-- /wp:group -->'
const quick =
  '<!-- wp:paragraph {"className":"quick"} -->\n' +
  `<p class="quick"><a href="mailto:${DEMO_MAIL}?subject=Enterprise%20plan">${DEMO_MAIL}</a></p>\n` +
  '<!-- /wp:paragraph -->'
const phoneItem =
  '<!-- wp:list -->\n<ul class="wp-block-list"><!-- wp:list-item -->\n' +
  '<li><strong>P:</strong> <a href="tel:+1-202-555-0160">+1 (202) 555-0160</a></li>\n' +
  '<!-- /wp:list-item --></ul>\n<!-- /wp:list -->'
const sentence =
  '<!-- wp:paragraph -->\n<p>Questions? <a href="mailto:support@orbitline.example">Write to our team</a> any day.</p>\n<!-- /wp:paragraph -->'
const mailButton =
  '<!-- wp:buttons -->\n<div class="wp-block-buttons"><!-- wp:button -->\n' +
  '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="mailto:support@orbitline.example">Email support</a></div>\n' +
  '<!-- /wp:button --></div>\n<!-- /wp:buttons -->'
const hiddenConfig = html(
  `<form class="callback"><input type="hidden" name="_to" value="${DEMO_MAIL}"><button>Call me back</button></form>`
)
const mailIcon =
  '<!-- wp:social-links -->\n<ul class="wp-block-social-links"><!-- wp:social-link {"url":"mailto:hello@orbitline.example","service":"mail"} /--></ul>\n<!-- /wp:social-links -->'
const mailTile = html(
  '<a class="tile" href="mailto:hello@orbitline.example" aria-label="Email"><svg viewBox="0 0 24 24"></svg></a>'
)

function contactSite() {
  const { site, call } = fakeSite()
  site.pages = [
    {
      id: 42,
      slug: 'home',
      title: 'Home',
      status: 'publish',
      content: section('h', 'Spoke & Chain Cycles')
    },
    {
      id: 44,
      slug: 'contact',
      title: 'Contact',
      status: 'publish',
      content: contactGroup(quick, phoneItem, sentence, mailButton, hiddenConfig, mailIcon)
    },
    {
      id: 45,
      slug: 'press',
      title: 'Press',
      status: 'publish',
      content: contactGroup(quick)
    }
  ]
  site.parts = { header: section('x', 'Spoke & Chain Cycles'), footer: mailTile }
  site.navs = []
  return { site, call }
}

const contactInput = (call, contact) =>
  sweepInput(call, {
    written: writtenLines(['Spoke & Chain Cycles']),
    entitySlugs: new Set(['home', 'contact', 'press']),
    judged: { relabel: new Map() },
    unwanted: () => ['press'],
    contact
  })

test("a link that mails or calls the template's company leads to the customer's own mailbox and phone, and shows them where it showed the demo's", async () => {
  const { site, call } = contactSite()
  const out = await sweepWordPress(
    contactInput(call, { email: 'ride@spokechain.example', phone: '+84 234 555 0199' })
  )
  const contact = site.pages.find((p) => p.id === 44).content
  assert.ok(
    contact.includes('<a href="mailto:ride@spokechain.example">ride@spokechain.example</a>'),
    "the demo's mailbox and the words that showed it are the customer's; the demo's subject line goes with it"
  )
  assert.ok(
    contact.includes('<a href="tel:+842345550199">+84 234 555 0199</a>'),
    'the phone link carries no spaces, and shows the number as the customer typed it'
  )
  assert.ok(
    contact.includes('<a href="mailto:ride@spokechain.example">Write to our team</a> any day.'),
    'a link in a sentence keeps its words'
  )
  assert.ok(contact.includes('href="mailto:ride@spokechain.example">Email support</a>'), 'a button too')
  assert.ok(
    contact.includes('{"url":"mailto:ride@spokechain.example","service":"mail"}'),
    "and a block's own link"
  )
  assert.ok(
    contact.includes(`name="_to" value="${DEMO_MAIL}"`),
    "a form's hidden configuration is not a link a visitor follows, and is left"
  )
  assert.equal(contact.split('orbitline').length - 1, 1, 'only the hidden configuration still names the demo')
  assert.ok(site.parts.footer.includes('href="mailto:ride@spokechain.example" aria-label="Email"'))
  assert.equal(
    site.pages.find((p) => p.id === 45).content,
    contactGroup(quick),
    'a page the sweep takes off is not worth a write'
  )
  assert.equal(out.contacts, 6)
  assert.deepEqual(out.notes, [])
  assert.equal(parseBlocks(contact) !== null, true)
})

// 🔒 NOTHING TYPED KEEPS THE DEMO'S CONTACT LINKS (Akemi, 11/10/2026, BLANK and FULL alike): with no phone and no mailbox given,
// the template's contact lines and their mailto:/tel: links stay as placeholders; nothing is invented and nothing is cut.
test('with no mailbox and no phone typed, every link that mails or calls the demo stays as the template has it', async () => {
  const { site, call } = contactSite()
  const before = { contact: site.pages.find((p) => p.id === 44).content, footer: site.parts.footer }
  const out = await sweepWordPress(contactInput(call, { email: '', phone: '' }))
  assert.equal(
    site.pages.find((p) => p.id === 44).content,
    before.contact,
    'the Contact page keeps every demo link'
  )
  assert.equal(site.parts.footer, before.footer, "the footer's mail tile stays")
  assert.equal(out.contacts, 0)
  assert.equal(
    out.notes.some((n) => /link\(s\) to the template's mailbox or phone/.test(n)),
    false,
    out.notes.join(' | ')
  )
})

test('with only a phone typed, the phone links lead to it and the mail links keep the demo mailbox', async () => {
  const { site, call } = contactSite()
  await sweepWordPress(contactInput(call, { email: '', phone: '+84 234 555 0199' }))
  const contact = site.pages.find((p) => p.id === 44).content
  assert.ok(contact.includes('<a href="tel:+842345550199">+84 234 555 0199</a>'))
  assert.ok(contact.includes('<a href="mailto:support@orbitline.example">Write to our team</a> any day.'))
  assert.ok(contact.includes('Email support'), 'the demo mail button stays')
  assert.ok(site.parts.footer.includes('mailto:hello@orbitline.example'))
})

test('a sweep asked nothing about contacts leaves every mail and phone link as it is', async () => {
  const { site, call } = contactSite()
  const before = site.pages.find((p) => p.id === 44).content
  await sweepWordPress(contactInput(call, undefined))
  assert.equal(site.pages.find((p) => p.id === 44).content, before)
  assert.equal(site.parts.footer, mailTile)
})

/**
 * A site's options, read and written through the same door as its pages: an option it never stored is `not_found`, as the
 * plugin answers.
 */
function withOptions(call, /** @type {Record<string, any>} */ options, { unreadable = '' } = {}) {
  const writes = /** @type {any[]} */ ([])
  return {
    writes,
    call: async (/** @type {string} */ action, /** @type {any} */ params) => {
      if (params?.kind !== 'option') return call(action, params)
      if (action === 'content.get') {
        if (params.key === unreadable)
          return { ok: false, error: 'read_failed', message: 'the database went away' }
        return params.key in options
          ? { ok: true, item: { value: options[params.key] } }
          : { ok: false, error: 'not_found', message: `no option at id 0, key "${params.key}"` }
      }
      writes.push(params)
      options[params.key] = params.fields.value
      return { ok: true }
    }
  }
}

const TYPED = 'ride@spokechain.example'
const ACCOUNT = 'owner@account.example'

test("the theme's own contact form sends to the mailbox the customer typed, and the site shows it as its public address", async () => {
  const { call } = contactSite()
  const options = {}
  const site = withOptions(call, options)
  const out = await sweepWordPress({
    ...contactInput(site.call, { email: TYPED, phone: '+84 234 555 0199' }),
    to: TYPED
  })
  assert.equal(
    options.tracy_contact_to,
    TYPED,
    'the option every Tracy WordPress theme sends its contact form to'
  )
  assert.deepEqual(options.tracy_site_identity, { contact: { email: TYPED } }, 'the address the themes show')
  assert.ok(
    site.writes.every((w) => w.apply_id === 'residue-test'),
    'under the sweep’s apply id, for its undo'
  )
  assert.equal(out.options, 2, 'the recipient and the public mailbox, nothing else')
  assert.deepEqual(out.notes, [])
})

test('with no mailbox typed, the form sends to the account that pressed Apply, which is never shown; the address the site shows stays the demo one', async () => {
  const { call } = contactSite()
  const options = {
    tracy_site_identity: {
      'site.name': 'Orbitline',
      'contact.email': 'support@orbitline.example',
      'contact.phone': '+1 202 555 0160'
    }
  }
  const site = withOptions(call, options)
  await sweepWordPress({ ...contactInput(site.call, { email: '', phone: '' }), to: ACCOUNT })
  assert.equal(options.tracy_contact_to, ACCOUNT)
  assert.deepEqual(
    options.tracy_site_identity,
    {
      'site.name': 'Orbitline',
      'contact.email': 'support@orbitline.example',
      'contact.phone': '+1 202 555 0160'
    },
    'nothing typed: the demo mailbox stays as a placeholder (Akemi, 11/10/2026)'
  )
  assert.equal(
    JSON.stringify(options.tracy_site_identity).includes(ACCOUNT),
    false,
    'the account is a recipient only'
  )
})

test('an option already right is not written again, a nested identity keeps its shape, and one that cannot be read is said and left', async () => {
  const right = withOptions(contactSite().call, {
    tracy_contact_to: TYPED,
    tracy_site_identity: { site: { name: 'Spoke & Chain' }, contact: { email: TYPED, phone: '1' } }
  })
  await sweepWordPress({ ...contactInput(right.call, { email: TYPED, phone: '' }), to: TYPED })
  assert.deepEqual(right.writes, [])

  const nestedOptions = {
    tracy_site_identity: {
      site: { name: 'Spoke & Chain' },
      contact: { email: 'a@orbitline.example', phone: '1' }
    }
  }
  const nested = withOptions(contactSite().call, nestedOptions)
  await sweepWordPress({ ...contactInput(nested.call, { email: TYPED, phone: '' }), to: TYPED })
  assert.deepEqual(nestedOptions.tracy_site_identity, {
    site: { name: 'Spoke & Chain' },
    contact: { email: TYPED, phone: '1' }
  })

  const broken = withOptions(contactSite().call, {}, { unreadable: 'tracy_site_identity' })
  const out = await sweepWordPress({ ...contactInput(broken.call, { email: TYPED, phone: '' }), to: TYPED })
  assert.deepEqual(
    broken.writes.map((w) => w.key),
    ['tracy_contact_to'],
    'what could not be read is not overwritten'
  )
  assert.ok(
    out.notes.some((n) => /site's public mailbox could not be read: the database went away/.test(n)),
    out.notes.join(' | ')
  )
})

test('a sweep with no recipient and asked nothing about contacts writes no option', async () => {
  const site = withOptions(contactSite().call, {
    tracy_site_identity: { 'contact.email': 'support@orbitline.example' }
  })
  await sweepWordPress(contactInput(site.call, undefined))
  assert.deepEqual(site.writes, [])
})

test('a raw HTML row of icon links, or a linked picture, is never cut whole for the one demo link in it', async () => {
  const row = html(
    '<div class="social"><a href="https://facebook.com/spokechain"><svg viewBox="0 0 24 24"></svg></a>' +
      '<a href="mailto:hello@orbitline.example"><svg viewBox="0 0 24 24"></svg></a></div>'
  )
  const picture =
    '<!-- wp:image -->\n<figure class="wp-block-image"><a href="mailto:hello@orbitline.example">' +
    '<img src="/wp-content/uploads/workshop.jpg" alt=""/></a></figure>\n<!-- /wp:image -->'
  const quiet = contactSite()
  quiet.site.parts.footer = row
  quiet.site.pages[1].content = contactGroup(picture)
  const out = await sweepWordPress(contactInput(quiet.call, { email: '', phone: '' }))
  assert.equal(
    quiet.site.parts.footer,
    row,
    'the row and its other icon stay; the demo mail icon is left and said'
  )
  assert.ok(
    quiet.site.pages[1].content.includes('<img src="/wp-content/uploads/workshop.jpg"'),
    'the picture stays'
  )
  assert.deepEqual(out.notes, [], 'nothing typed: the demo links are kept on purpose, not reported')
  // With a mailbox typed, only the mail icon changes.
  const typed = contactSite()
  typed.site.parts.footer = row
  await sweepWordPress(contactInput(typed.call, { email: 'ride@spokechain.example', phone: '' }))
  assert.ok(typed.site.parts.footer.includes('<a href="https://facebook.com/spokechain">'))
  assert.ok(typed.site.parts.footer.includes('<a href="mailto:ride@spokechain.example">'))
})

test('a phone link is read as a dialler reads it, every number or address a contact link shows becomes the typed one, and only the first typed one is used', async () => {
  const { site, call } = contactSite()
  const para = (inner) => `<!-- wp:paragraph -->\n<p>${inner}</p>\n<!-- /wp:paragraph -->`
  site.pages[1].content = contactGroup(
    para('<a href="tel:+1%20202%20555%200160">Call +1 202 555 0160</a>'),
    para('<a href="tel:+1-202-555-0160">(202) 555-0160</a>'),
    para(
      '<a href="mailto:sales@orbitline.example">Sales: SALES@Orbitline.example or info@orbitline.example</a>'
    )
  )
  await sweepWordPress(
    contactInput(call, {
      email: 'ride@spokechain.example, shop@spokechain.example',
      phone: '+84 234 555 0199 ext. 12'
    })
  )
  const page = site.pages[1].content
  assert.ok(
    page.includes('<a href="tel:+842345550199">Call +84 234 555 0199</a>'),
    'the href is decoded before its digits are read, and the extension is no part of the number'
  )
  assert.ok(
    page.includes('<a href="tel:+842345550199">+84 234 555 0199</a>'),
    'a number shown without its country code is the link’s number all the same'
  )
  assert.ok(
    page.includes(
      '<a href="mailto:ride@spokechain.example">Sales: ride@spokechain.example or ride@spokechain.example</a>'
    ),
    'every address the link shows, whatever its case; the first mailbox typed'
  )
})

test("a block's own contact link is found however its comment spells it, and the note says why a link was left", async () => {
  const icon = (spelt) =>
    `<!-- wp:social-links -->\n<ul class="wp-block-social-links"><!-- wp:social-link ${spelt} /--></ul>\n<!-- /wp:social-links -->`
  const typed = contactSite()
  typed.site.pages[1].content = contactGroup(
    icon('{ "url": "mailto:hello\\u0040orbitline.example", "service": "mail" }'),
    icon('{"url":"tel:+1\\u002d202\\u002d555\\u002d0160","service":"whatsapp"}')
  )
  const out = await sweepWordPress(
    contactInput(typed.call, { email: 'ride@spokechain.example', phone: '+84 234 555 0199' })
  )
  const page = typed.site.pages[1].content
  assert.ok(page.includes('"url":"mailto:ride@spokechain.example"'), page)
  assert.ok(page.includes('"url":"tel:+842345550199"'))
  assert.equal(page.includes('orbitline') || page.includes('202'), false)
  assert.equal(out.contacts, 3, 'the two icons, and the footer tile of the same site')
  // With nothing typed, the block's own demo links stay as they are, and nothing is said about them.
  const quiet = contactSite()
  const icons = contactGroup(icon('{"url":"mailto:hello@orbitline.example","service":"mail"}'))
  quiet.site.pages[1].content = icons
  const left = await sweepWordPress(contactInput(quiet.call, { email: '', phone: '' }))
  assert.equal(quiet.site.pages[1].content, icons)
  assert.deepEqual(left.notes, [], left.notes.join(' | '))
})

test("an unticked page that is the site's posts page stops being it, so its address 404s instead of serving the posts index", async () => {
  const { site, call } = fakeSite()
  const options = { page_for_posts: 51, page_on_front: 42 }
  const door = withOptions(call, options)
  const out = await sweepWordPress(sweepInput(door.call, { unwanted: () => ['news'] }))
  assert.equal(site.pages.find((p) => p.slug === 'news').status, 'draft')
  assert.ok(out.hidden.includes('news'))
  assert.equal(options.page_for_posts, 0, 'WordPress no longer serves /news/ as the blog')
  assert.equal(options.page_on_front, 42, 'the front page setting is never touched')
  assert.deepEqual(
    door.writes.map((w) => [w.key, w.apply_id]),
    [['page_for_posts', 'residue-test']],
    'under the sweep’s apply id, so its undo puts the posts page back'
  )
})

// 🔒 THE POSTS OF AN UNTICKED POSTS PAGE GO WITH IT (product owner, 08/10/2026, TCH #1013). Tracy Business WP 1.3.4 makes
// News (page 51) its posts page, and its four English articles answer at their own addresses whatever News became. The
// slugs below are the release's own (`tracy-business-wp7-database-1.3.4.sql.gz`).
const BUSINESS_POSTS = [
  [26, 'four-common-mistakes-in-heavy-machine-foundation-design'],
  [28, '500-000-work-hours-without-an-incident-in-kaluga'],
  [29, '110-kv-obninsk-2-substation-energised'],
  [30, 'choosing-sandwich-roof-panels-for-plants-in-central-russia']
]

test('an unticked posts page takes its posts along, and a link to one of them goes like a link to the page', async () => {
  const { site, call } = fakeSite()
  site.posts = [
    ...BUSINESS_POSTS.map(([id, slug]) => ({ id, slug, title: slug, status: 'publish', url: `/${slug}/` })),
    { id: 31, slug: 'an-old-draft', title: 'Old', status: 'draft', url: '/an-old-draft/' }
  ]
  site.pages.find((p) => p.slug === 'home').content = section(
    'h',
    'Golden Crust Bakery',
    'Read <a href="/110-kv-obninsk-2-substation-energised/">our substation story</a>.'
  )
  const door = withOptions(call, { page_for_posts: 51 })
  const out = await sweepWordPress(sweepInput(door.call, { unwanted: () => ['news'] }))
  assert.ok(out.hidden.includes('news'))
  assert.equal(out.posts, 4)
  for (const [id] of BUSINESS_POSTS)
    assert.equal(site.posts.find((p) => p.id === id).status, 'draft', String(id))
  assert.ok(
    site.pages.find((p) => p.slug === 'home').content.includes('<p>Read our substation story.</p>'),
    'a link to a drafted post loses its anchor, its words stay'
  )
  const ids = site.writes.filter((w) => w.params.kind === 'post').map((w) => w.params.id)
  assert.ok(ids.indexOf(26) > ids.indexOf(51), 'the posts go after their page')
  assert.equal(
    site.writes.some((w) => w.params.id === 31),
    false,
    'a draft is not written again'
  )
  assert.deepEqual([...new Set(site.writes.map((w) => w.params.apply_id))], ['residue-test'])
})

test('posts stay when the page that goes is not the posts page', async () => {
  const { site, call } = fakeSite()
  site.posts = BUSINESS_POSTS.map(([id, slug]) => ({
    id,
    slug,
    title: slug,
    status: 'publish',
    url: `/${slug}/`
  }))
  const out = await sweepWordPress(sweepInput(withOptions(call, { page_for_posts: 51 }).call))
  assert.equal(out.posts, 0)
  for (const post of site.posts) assert.equal(post.status, 'publish')
  assert.equal(
    site.calls.some((c) => c.params?.post_type === 'post'),
    false,
    'they are not even listed'
  )
})

test('a hidden page that is not the posts page leaves the posts page setting alone', async () => {
  const { call } = fakeSite()
  const options = { page_for_posts: 51 }
  const door = withOptions(call, options)
  await sweepWordPress(sweepInput(door.call))
  assert.equal(options.page_for_posts, 51)
  assert.deepEqual(door.writes, [])
})

// Measured 08/10/2026 on dev (tamq-7q-kinwp, JA Kinetic WP, TCH #1013): the customer unticked Pricing, /pricing/ answered 404,
// and the main menu still offered "Pricing". Kinetic's header navigation is written inside the header template part (no
// `ref` to a wp_navigation post), and its links are custom ones (`/pricing`, no page id), so the sweep's menu clean-up, which
// only read wp_navigation posts, never saw it. The markup below is that navigation, verbatim from the ja-kinetic wp7 1.0.7
// release's header template part.
const KINETIC_NAV = [
  '<!-- wp:navigation {"className":"tracy-nav","overlayMenu":"always","layout":{"type":"flex","flexWrap":"wrap"}} -->',
  '<!-- wp:navigation-submenu {"label":"Home","type":"custom","url":"#"} -->',
  '<!-- wp:navigation-link {"label":"Terminal","url":"/","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Blueprint","url":"/home-menu/home-blueprint","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Signal","url":"/home-menu/home-signal","type":"custom"} /-->',
  '<!-- /wp:navigation-submenu -->',
  '<!-- wp:navigation-submenu {"label":"Product","type":"custom","url":"#"} -->',
  '<!-- wp:navigation-link {"label":"Features","url":"/product/features","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Integrations","url":"/product/integrations","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Changelog","url":"/product/changelog","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Blog","url":"/product/blog","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"FAQ","url":"/product/faq","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"All Categories","url":"/product/all-categories","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Article Archive","url":"/product/article-archive","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Our Writers","url":"/product/authors","type":"custom"} /-->',
  '<!-- /wp:navigation-submenu -->',
  '<!-- wp:navigation-link {"label":"Pricing","url":"/pricing","type":"custom"} /-->',
  '<!-- wp:navigation-submenu {"label":"Company","type":"custom","url":"#"} -->',
  '<!-- wp:navigation-link {"label":"About","url":"/company/about","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Team","url":"/company/team","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Contact","url":"/company/contact","type":"custom"} /-->',
  '<!-- /wp:navigation-submenu -->',
  '<!-- wp:navigation-submenu {"label":"Pages","type":"custom","url":"#"} -->',
  '<!-- wp:navigation-link {"label":"Landing","url":"/pages/landing","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Single Article","url":"/pages/kineticql","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"All Tags","url":"/pages/tags","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Search","url":"/pages/search","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Login","url":"/pages/login","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Register","url":"/pages/register","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Password Reset","url":"/pages/reset","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Username Reminder","url":"/pages/remind","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Engineering","url":"/pages/engineering","type":"custom"} /-->',
  '<!-- wp:navigation-link {"label":"Author","url":"/pages/author","type":"custom"} /-->',
  '<!-- /wp:navigation-submenu -->',
  '<!-- wp:navigation-link {"label":"Sign in","url":"/pages/login","type":"custom","className":"tracy-nav__signin"} /-->',
  '<!-- wp:navigation-link {"label":"Start free","url":"/pages/register","type":"custom","className":"tracy-nav__cta"} /-->',
  '<!-- /wp:navigation -->'
].join('\n')

test('an unticked page leaves the navigation written inside a template part, custom links included; a link to another site stays', async () => {
  const { site, call } = fakeSite()
  const elsewhere =
    '<!-- wp:navigation-link {"label":"Status","url":"https://status.example/pricing","type":"custom"} /-->'
  site.pages = [
    {
      id: 1740,
      slug: 'home',
      title: 'Home',
      status: 'publish',
      url: 'http://kinetic.test/',
      content: section('h', 'Kinetic')
    },
    {
      id: 1741,
      slug: 'pricing',
      title: 'Pricing',
      status: 'publish',
      url: 'http://kinetic.test/pricing/',
      content: section('p', 'Plans')
    },
    {
      id: 1742,
      slug: 'contact',
      title: 'Contact',
      status: 'publish',
      url: 'http://kinetic.test/company/contact/',
      content: section('c', 'Kinetic')
    }
  ]
  site.parts = {
    header: `<!-- wp:group {"className":"tracy-header__menu"} -->\n<div class="wp-block-group tracy-header__menu">\n${KINETIC_NAV.replace('<!-- /wp:navigation -->', `${elsewhere}\n<!-- /wp:navigation -->`)}\n</div>\n<!-- /wp:group -->`,
    footer: section('f', 'Kinetic')
  }
  site.navs = []
  const out = await sweepWordPress(
    sweepInput(call, {
      written: writtenLines(['Kinetic']),
      entitySlugs: new Set(['home', 'pricing', 'contact']),
      judged: { relabel: new Map() },
      unwanted: () => ['pricing']
    })
  )
  assert.deepEqual(out.hidden, ['pricing'])
  const header = site.parts.header
  assert.doesNotMatch(header, /"label":"Pricing"/, 'the menu no longer offers the page taken off')
  for (const kept of ['Features', 'About', 'Sign in', 'Start free'])
    assert.ok(header.includes(`"label":"${kept}"`), `${kept} stays`)
  assert.ok(
    header.includes('https://status.example/pricing'),
    'another site that shares the path is not this one'
  )
  assert.ok(parseBlocks(header), 'the header is still blocks all the way down')
  assert.deepEqual(out.notes, [])
})

// TCH #1013: the Pages question names every content page of the main menu, at any depth. A page the customer unticks may sit
// in a submenu; once every link of a submenu is cut, the submenu itself is a dropdown that opens on nothing, so it goes too,
// unless its own label leads to a page that stays. JA Kinetic WP writes its links IN the header part (no wp_navigation), so
// the header's own navigation loses them like a menu does.
const SUBMENU_NAV = `<!-- wp:navigation-submenu {"label":"Product","type":"custom","url":"#"} -->
<!-- wp:navigation-link {"label":"Features","url":"/product/features","type":"custom"} /-->
<!-- wp:navigation-link {"label":"Blog","url":"/product/blog","type":"custom"} /-->
<!-- /wp:navigation-submenu -->
<!-- wp:navigation-submenu {"label":"Company","type":"page","id":37,"url":"http://walk.test/about/","kind":"post-type"} -->
<!-- wp:navigation-link {"label":"Team","type":"page","id":39,"url":"http://walk.test/about/team/","kind":"post-type"} /-->
<!-- /wp:navigation-submenu -->
<!-- wp:navigation-link {"label":"Pricing","url":"/pricing","type":"custom"} /-->`

test('a submenu whose every link is cut goes with them; one that still holds a link, or leads to a live page, stays', () => {
  const one = navWithout(SUBMENU_NAV, { slugs: new Set(['features']), ids: new Set() })
  assert.deepEqual(one.cut, ['Features'])
  assert.ok(one.markup.includes('"label":"Product"') && one.markup.includes('"label":"Blog"'))
  const all = navWithout(SUBMENU_NAV, { slugs: new Set(['features', 'blog', 'team']), ids: new Set() })
  assert.deepEqual(all.cut, ['Features', 'Blog', 'Product', 'Team'])
  assert.equal(all.markup.includes('Product'), false, 'the emptied dropdown is gone')
  assert.ok(all.markup.includes('"label":"Company"'), 'Company leads to the About page, which stays')
  assert.ok(all.markup.includes('"label":"Pricing"'))
  assert.ok(parseBlocks(all.markup), 'what is left still parses')
  const gone = navWithout(SUBMENU_NAV, { slugs: new Set(['team']), ids: new Set([37]) })
  assert.deepEqual(
    gone.cut,
    ['Team', 'Company'],
    'a submenu whose own page goes and whose links all go, goes'
  )
})

test("the header's own navigation loses the links to pages the sweep drafts (JA Kinetic WP)", async () => {
  const { site, call } = fakeSite()
  site.parts.header = `<!-- wp:navigation {"className":"tracy-nav"} -->\n${SUBMENU_NAV}\n<!-- /wp:navigation -->`
  site.pages.push(
    {
      id: 60,
      slug: 'features',
      title: 'Features',
      status: 'publish',
      url: '/product/features/',
      content: section('f', 'Features')
    },
    {
      id: 61,
      slug: 'blog',
      title: 'Blog',
      status: 'publish',
      url: '/product/blog/',
      content: section('b', 'Blog')
    }
  )
  await sweepWordPress(
    sweepInput(call, {
      entitySlugs: new Set(['about', 'careers', 'home', 'features', 'blog']),
      judged: { relabel: new Map() },
      unwanted: () => new Set(['features', 'blog'])
    })
  )
  assert.equal(site.pages.find((p) => p.id === 60).status, 'draft')
  assert.equal(
    site.parts.header.includes('/product/features'),
    false,
    'no header link leads to a drafted page'
  )
  assert.equal(site.parts.header.includes('"label":"Product"'), false, 'nor an emptied dropdown')
  assert.ok(site.parts.header.includes('"label":"Pricing"'))
})

// Website Opportunities, ja-restaurant wp7 1.0.1 (22/10/2026): an opportunity's menu loses the demo kit's dropdowns and its
// reservation dropdown leads to the contact page (`demoKitOff`, own tests in `brief-wp-wo-leftovers.test.mjs`); a customer's
// build keeps its menu exactly as before.
const KIT_NAV = `<!-- wp:navigation-link {"label":"Home","type":"page","id":1,"url":"/","kind":"post-type"} /-->
<!-- wp:navigation-submenu {"label":"Themes"} -->
<!-- wp:navigation-link {"label":"Default Color","type":"page","id":1,"url":"/","kind":"post-type"} /-->
<!-- /wp:navigation-submenu -->
<!-- wp:navigation-submenu {"label":"Reservation"} -->
<!-- wp:navigation-link {"label":"Contact Us","url":"/contact/contact-us/","kind":"custom"} /-->
<!-- /wp:navigation-submenu -->`

for (const wo of [true, false])
  test(`the menus of ${wo ? "an opportunity's" : "a customer's"} build ${wo ? 'lose the demo kit and lead Reservation to Contact' : 'keep the demo kit as it is'}`, async () => {
    const { site, call } = fakeSite()
    site.navs.push({ id: 72, slug: 'mainmenu', title: 'mainmenu', status: 'publish', content: KIT_NAV })
    await sweepWordPress(sweepInput(call, { judged: { relabel: new Map() }, wo }))
    const nav = site.navs.find((n) => n.id === 72).content
    if (!wo) return assert.equal(nav, KIT_NAV)
    assert.equal(nav.includes('"label":"Themes"'), false)
    assert.ok(nav.includes('{"label":"Reservation","url":"/contact/contact-us/","kind":"custom"}'))
    assert.ok(parseBlocks(nav))
  })

// Measured 08/10/2026 on dev (tamq-9w-tbwp, tamq-9w-tbwp2, Tracy Base WP 1.1.2, TCH #1013): the customer unticked Pricing,
// /pricing/ answered 404 and the wp_navigation menu lost the link, but the desktop header still offered "Pricing", now leading
// to the contact page. Tracy Base writes that header link as a paragraph of its header template part, not as a navigation
// link, so `navWithout` never saw it and the relink step moved its address. 🔒 AN UNTICKED PAGE LEAVES THE SITE'S NAVIGATION
// (product owner): an item whose whole text is the one link to that page goes, in a part and in a page (`linksOff`, whose
// own tests are `brief-wp-unlink.test.mjs`). The header below is verbatim from the tracy-base wp7 1.1.2 release.
const TRACY_BASE_HEADER = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tracy-base-wp7-1.1.2-header.html'),
  'utf8'
)

test('the sweep takes the header link to an unticked page out of the Tracy Base header instead of sending it to the contact page', async () => {
  const { site, call } = fakeSite()
  site.pages = [
    {
      id: 10,
      slug: 'home',
      title: 'Home',
      status: 'publish',
      url: 'http://base.test/',
      content: section('h', 'Base')
    },
    {
      id: 11,
      slug: 'pricing',
      title: 'Pricing',
      status: 'publish',
      url: 'http://base.test/pricing/',
      content: section('p', 'Plans')
    },
    {
      id: 12,
      slug: 'contact',
      title: 'Contact',
      status: 'publish',
      url: 'http://base.test/resources/contact/',
      content: `${section('c', 'Base')}\n\n<!-- wp:paragraph -->\n<p><a href="/pricing">Pricing</a></p>\n<!-- /wp:paragraph -->`
    }
  ]
  site.parts = { header: TRACY_BASE_HEADER, footer: section('f', 'Base') }
  site.navs = []
  const out = await sweepWordPress(
    sweepInput(call, {
      written: writtenLines(['Base']),
      entitySlugs: new Set(['home', 'pricing', 'contact']),
      judged: { relabel: new Map() },
      unwanted: () => ['pricing']
    })
  )
  assert.deepEqual(out.hidden, ['pricing'])
  const header = site.parts.header
  assert.equal(/>Pricing</.test(header), false, 'the header no longer shows Pricing')
  assert.equal(header.includes('/resources/contact/'), false, 'and sends nothing new to the contact page')
  assert.ok(header.includes('href="/product">Product'), 'its other links stay')
  assert.ok(parseBlocks(header))
  assert.equal(
    site.pages.find((p) => p.id === 12).content.includes('Pricing'),
    false,
    'a paragraph in a page that is only the link goes too'
  )
})

test("an opportunity's menu knows a Home link by page id and a custom link to the home address as one place", async () => {
  const { site, call } = fakeSite()
  site.pages = [
    {
      id: 1,
      slug: 'home',
      title: 'Home',
      status: 'publish',
      url: 'http://base.test/',
      content: section('h', 'Base')
    }
  ]
  const nav = [
    '<!-- wp:navigation-link {"label":"Home","type":"page","id":1,"kind":"post-type"} /-->',
    '<!-- wp:navigation-submenu {"label":"Themes","url":"#"} -->',
    '<!-- wp:navigation-link {"label":"Default Color","url":"http://base.test/","kind":"custom"} /-->',
    '<!-- /wp:navigation-submenu -->'
  ].join('\n')
  site.navs.push({ id: 72, slug: 'mainmenu', title: 'mainmenu', status: 'publish', content: nav })
  await sweepWordPress(sweepInput(call, { judged: { relabel: new Map() }, wo: true }))
  const after = site.navs.find((n) => n.id === 72).content
  assert.equal(after.includes('"label":"Themes"'), false, after)
  assert.ok(after.includes('"label":"Home"'))
})
