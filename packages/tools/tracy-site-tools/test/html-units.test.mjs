import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decodeEntities,
  foldForMatch,
  markupAt,
  regionOf,
  renderedUnits,
  tameMarkup,
  unitLink,
  unitParts,
  unitRuns,
  views
} from '../src/host/html-units.mjs'
import { readablePage } from '../src/host/site.mjs'

/** The visible units of a page: [region, block tag, shown text]. */
const seen = (html) =>
  renderedUnits(html)
    .units.filter((u) => u.attr === undefined && !u.hidden)
    .map((u) => [u.region, (u.chain.find((el) => !el.inline) ?? { tag: '' }).tag, u.shown])

/** A chain as regionOf reads it, innermost first, from outermost-first `[tag, class]` pairs. */
const chain = (...outerFirst) =>
  outerFirst
    .map(([tag, cls = '', extra = {}]) => ({
      tag,
      id: extra.id ?? '',
      cls,
      data: '',
      role: extra.role ?? '',
      inline: false,
      hide: false,
      open: extra.open ?? false,
      href: null
    }))
    .reverse()

// ── entities ──────────────────────────────────────────────────────────────────────────────────────

test('decodeEntities: Latin-1 by name (case-sensitive), numeric, punctuation; unknown left as written', () => {
  assert.equal(decodeEntities('Xin ch&agrave;o &Agrave;'), 'Xin chào À')
  assert.equal(decodeEntities('&#9660; &#x25BC; &hellip; &mdash; &amp;amp;'), '▼ ▼ … — &amp;')
  assert.equal(decodeEntities('m&sup2; &frac12; &there4; &le; &rarr;'), 'm² ½ ∴ ≤ →')
  assert.equal(decodeEntities('&fake; &#0; &#x110000;'), '&fake; &#0; &#x110000;')
})

test('🔒 the entity table agrees with readablePage on every name (one table since 27/09/2026)', () => {
  // site.mjs kept its own copy with `[a-z]+` until 27/09, so a name with a digit (`&sup2;`,
  // `&frac12;`) decoded here and stayed literal in page.text. It imports this table now: every name,
  // digits included, decodes to the same letter in both, or the outline and the page text disagree.
  const names = 'sup1 sup2 sup3 frac14 frac12 frac34 there4 le ge ne rarr larr permil minus infin '
    .split(' ')
    .filter(Boolean)
    .concat(NAMES_BEFORE)
  for (const name of names) {
    const ours = `x${decodeEntities(`&${name};`)}x`.replace(/[^\S\n]+/g, ' ')
    const theirs = readablePage(`<p>x&${name};x</p>`).text
    assert.equal(ours, theirs, name)
    assert.notEqual(ours, `x&${name};x`, `${name} is in the table`)
  }
})

const NAMES_BEFORE =
  'amp lt gt quot apos hellip mdash ndash lsquo rsquo ldquo rdquo bull dagger trade euro nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn acute micro para middot cedil ordm raquo iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(
    ' '
  )

// ── views / folding ───────────────────────────────────────────────────────────────────────────────

test('views: spaces, dashes, quotes and invisible marks fold; every index maps back to its raw span', () => {
  const raw = 'Mon&ndash;Fri\u00a0 “9:00”\u00ad café'
  const v = views(raw)
  assert.equal(v.cased, 'Mon-Fri "9:00" café')
  assert.equal(v.lower, 'mon-fri "9:00" café')
  assert.equal(v.bare, 'mon-fri "9:00" cafe')
  // the folded hyphen maps back to the whole `&ndash;` entity in the source
  const dash = v.cased.indexOf('-')
  assert.deepEqual(v.map[dash], [3, 10])
  assert.equal(raw.slice(...v.map[dash]), '&ndash;')
  assert.equal(views('Đà Nẵng').bare, 'da nang')
})

test('foldForMatch: a customer typing "Mon-Fri" finds the page\'s "Mon–Fri" (and the other way)', () => {
  assert.equal(foldForMatch('Mon–Fri,  9:00'), 'mon-fri, 9:00')
  assert.ok(foldForMatch('Open Mon–Fri').includes(foldForMatch('mon-fri')))
  assert.equal(foldForMatch(undefined), '')
})

// ── the units ─────────────────────────────────────────────────────────────────────────────────────

test('renderedUnits: one unit per block; inline tags do not split it; scripts, styles, comments skipped', () => {
  const html =
    '<!DOCTYPE html><html lang="vi"><head><title>Home &amp; more</title><style>p{}</style></head>' +
    '<body class="home page"><!-- note --><p>Call <strong>now</strong> to book</p><script>var p = "<p>no</p>"</script>' +
    '<div>One<div>Two</div>Three</div></body></html>'
  const r = renderedUnits(html)
  assert.equal(r.lang, 'vi')
  assert.equal(r.body, 'home page')
  assert.deepEqual(
    r.units.map((u) => u.shown),
    ['Home & more', 'Call now to book', 'One', 'Two', 'Three']
  )
  assert.equal(r.units[0].region, 'title')
  assert.ok(!r.units.some((u) => /DOCTYPE|no</.test(u.cased)))
})

test('renderedUnits: <br> is a space and is counted; an inline edge is a soft space', () => {
  const [h1] = renderedUnits('<h1>Furniture built to fit<br><em>your exact space</em></h1>').units
  assert.equal(h1.shown, 'Furniture built to fit your exact space')
  assert.equal(h1.breaks, 1)
  const [p] = renderedUnits('<p><br>Only<br><br>one break<br></p>').units
  assert.equal(p.breaks, 1)
  const [brand] = renderedUnits('<a href="/"><span>BXT</span><span class="block">Name</span></a>').units
  assert.equal(brand.shown, 'BXT Name')
})

test('renderedUnits: alt and placeholder are units of their own (attr set), in their region', () => {
  const units = renderedUnits(
    '<header><form><input type="search" placeholder="Search languages"></form></header><main><img alt="Our workshop"></main>'
  ).units
  const attrs = units.filter((u) => u.attr !== undefined).map((u) => [u.attr, u.region, u.shown, u.inForm])
  assert.deepEqual(attrs, [
    ['placeholder', 'header', 'Search languages', true],
    ['alt', 'main', 'Our workshop', false]
  ])
})

test('renderedUnits: the chain is innermost first; chainAt follows inline segments inside one unit', () => {
  const [u] = renderedUnits(
    '<nav><ul><li><a href="/n"><span class="title">Newsletter</span><small class="cap">Digest email template</small></a></li></ul></nav>'
  ).units
  assert.deepEqual(
    u.chain.map((el) => el.tag),
    ['span', 'a', 'li', 'ul', 'nav']
  )
  assert.equal(u.inNav, true)
  const at = (word) => u.chainAt(u.cased.indexOf(word))[0]
  assert.equal(at('Newsletter').cls, 'title')
  assert.equal(at('Digest').cls, 'cap')
  assert.equal(unitLink(u)?.href, '/n')
})

test('🔒 hidden words: the hidden attribute, aria-hidden, sr-only — but not md:not-sr-only, not class "hidden"', () => {
  const html =
    '<header><p hidden>No matching languages</p><span aria-hidden="true">NG</span>' +
    '<button><span aria-hidden="true">▼</span><span class="sr-only md:not-sr-only">English</span></button>' +
    '<a class="skip-link screen-reader-text">Skip to content</a><nav class="hidden md:flex"><a>Home</a></nav></header>'
  const units = renderedUnits(html).units
  const shown = units.filter((u) => !u.hidden).map((u) => u.shown)
  assert.deepEqual(shown, ['English', 'Home'])
  // the hidden words are still units (the replace job may need them), flagged
  assert.ok(units.some((u) => u.hidden && u.cased === 'No matching languages'))
})

// ── regions (D3) ──────────────────────────────────────────────────────────────────────────────────

test('regionOf: the OUTERMOST landmark decides; tags, roles and id/class tokens all count', () => {
  assert.equal(regionOf(chain(['body'], ['header'], ['div', 'inner'], ['p'])), 'header')
  assert.equal(regionOf(chain(['body'], ['footer'], ['p'])), 'footer')
  assert.equal(regionOf(chain(['body'], ['main'], ['div', 'card-header'], ['p'])), 'main')
  assert.equal(regionOf(chain(['body'], ['div', '', { role: 'banner' }], ['p'])), 'header')
  assert.equal(regionOf(chain(['body'], ['div', '', { role: 'contentinfo' }], ['p'])), 'footer')
  // Joomla T4: the header section is a div whose id/class says so
  assert.equal(
    regionOf(chain(['body'], ['div', 't4-section t4-tb-header', { id: 't4-tb-header' }], ['div'])),
    'header'
  )
  assert.equal(
    regionOf(chain(['body'], ['div', 't4-section t4-tb-footer'], ['footer', 'tb-footer'], ['p'])),
    'footer'
  )
  // no landmark at all: the words are the page's body
  assert.equal(regionOf(chain(['body'], ['div'], ['p'])), 'main')
})

test("🔒 regionOf: a <header> inside a section is that section's head, not the page header (Joomla, no <main>)", () => {
  // tracy-business on Joomla: `section.tb-services > div > header.tb-section__head > h2`, and no <main>.
  assert.equal(
    regionOf(
      chain(
        ['body'],
        ['div', 't4-section t4-top-a'],
        ['section', 'tb-section'],
        ['div'],
        ['header', 'tb-section__head'],
        ['h2']
      )
    ),
    'main'
  )
  assert.equal(regionOf(chain(['body'], ['article'], ['footer', 'entry-meta'], ['p'])), 'main')
  assert.equal(regionOf(chain(['body'], ['section'], ['div', 'card-header'], ['p'])), 'main')
})

test('regionOf: topbar and breadcrumb tokens refine; <title> is title', () => {
  assert.equal(
    regionOf(chain(['body'], ['header', 'tracy-header'], ['div', 'tracy-topbar__inner'], ['p'])),
    'topbar'
  )
  assert.equal(regionOf(chain(['body'], ['div', 'ng-topbar-left'], ['ul'], ['li'])), 'topbar')
  assert.equal(regionOf(chain(['body'], ['main'], ['nav', 'breadcrumb'], ['a'])), 'title')
  assert.equal(regionOf(chain(['html'], ['head'], ['title'])), 'title')
})

test('🔒 regionOf: off-canvas, drawers, dropdown PANELS and closed dialogs are drawer — their triggers are not', () => {
  assert.equal(
    regionOf(chain(['body'], ['div', 't4-offcanvas tb-drawer', { id: 'off-canvas-right' }], ['a'])),
    'drawer'
  )
  assert.equal(
    regionOf(chain(['body'], ['header'], ['nav'], ['div', 'dropdown-menu mega-dropdown-menu'], ['h3'])),
    'drawer'
  )
  assert.equal(
    regionOf(
      chain(['body'], ['header'], ['div', 'tracy-mega__panel wp-block-navigation__submenu-container'], ['h3'])
    ),
    'drawer'
  )
  assert.equal(
    regionOf(chain(['body'], ['header'], ['dialog', 'tracy-lang__panel'], ['ul'], ['li'])),
    'drawer'
  )
  // …but the visible trigger of a dropdown, an OPEN dialog, and WordPress's responsive container (the
  // header menu on every desktop) are not
  assert.equal(regionOf(chain(['body'], ['header'], ['nav'], ['a', 'nav-link dropdown-toggle'])), 'header')
  assert.equal(regionOf(chain(['body'], ['main'], ['dialog', '', { open: true }], ['p'])), 'main')
  assert.equal(
    regionOf(
      chain(
        ['body'],
        ['header'],
        ['nav', 'wp-block-navigation'],
        ['div', 'wp-block-navigation__responsive-container'],
        ['ul'],
        ['li']
      )
    ),
    'header'
  )
})

test('🔒 renderedUnits: unlabelled words BEFORE the first page landmark are the top bar (EmDash)', () => {
  const html =
    '<body><div class="bg-forest"><div class="ng-topbar-left"><ul><li>Hotline: 0123</li></ul></div>' +
    '<div class="ml-auto"><button>English</button></div></div><header><a href="/">BXT</a></header><main><h1>Hi</h1></main>' +
    '<div>after</div></body>'
  assert.deepEqual(seen(html), [
    ['topbar', 'li', 'Hotline: 0123'],
    ['topbar', 'button', 'English'],
    ['header', 'header', 'BXT'],
    ['main', 'h1', 'Hi'],
    ['main', 'div', 'after']
  ])
  // a page with no landmark at all: nothing is moved, it is all body
  assert.deepEqual(seen('<body><div>one</div><p>two</p></body>'), [
    ['main', 'div', 'one'],
    ['main', 'p', 'two']
  ])
})

// ── parts and runs ────────────────────────────────────────────────────────────────────────────────

test('unitParts: a row of links is cut into its links; a sentence with a link stays one sentence', () => {
  const [nav] = renderedUnits(
    '<nav><a href="/">Home</a><a href="/about">About</a> <a href="/x">X</a></nav>'
  ).units
  assert.deepEqual(
    unitParts(nav).map((p) => [p.text, p.link?.href]),
    [
      ['Home', '/'],
      ['About', '/about'],
      ['X', '/x']
    ]
  )
  const [prose] = renderedUnits(
    '<p>Call <a href="tel:1">us</a> or <a href="mailto:a@b.c">write</a> today</p>'
  ).units
  assert.deepEqual(
    unitParts(prose).map((p) => p.text),
    ['Call us or write today']
  )
  const [one] = renderedUnits('<li><a href="/n"><span>Newsletter</span></a></li>').units
  assert.deepEqual(
    unitParts(one).map((p) => p.text),
    ['Newsletter']
  )
})

test("unitRuns: a logo link's parts, hidden mark left out", () => {
  const [logo] = renderedUnits(
    '<div class="navbar-brand"><a class="tb-brand__link" href="/en/"><span aria-hidden="true">NG</span>' +
      '<span class="words"><span class="name">Northgate</span> <span class="sub">Industrial infrastructure</span></span></a></div>'
  ).units
  assert.deepEqual(unitRuns(logo), ['Northgate', 'Industrial infrastructure'])
})

// ── one pass, linear (review finding 3) ───────────────────────────────────────────────────────────

test('markupAt: quoted, unquoted and bare attributes; the first of a repeated one; a quoted `>` stays inside', () => {
  const t = markupAt('<a HREF="/x" class=btn data-x hidden title=\'a>b\' href="/y">after', 0)
  assert.equal(t.kind, 'tag')
  assert.deepEqual(t.kind === 'tag' && [t.name, t.close, t.selfClosed, t.end, { ...t.attrs }], [
    'a',
    false,
    false,
    59,
    { href: '/x', class: 'btn', 'data-x': '', hidden: '', title: 'a>b' }
  ])
  const close = /** @type {any} */ (markupAt('</P >', 0))
  assert.deepEqual([close.kind, close.close, close.name, close.end], ['tag', true, 'p', 5])
  assert.equal(/** @type {any} */ (markupAt('<img src="a"/>', 0)).selfClosed, true)
  // a `<` before anything but a letter is a letter
  assert.deepEqual(markupAt('< 3', 0), { kind: 'text' })
  assert.deepEqual(markupAt('<3', 0), { kind: 'text' })
  // comments, declarations and bogus comments are skipped whole; `<!-->` is a whole empty comment
  for (const [s, end] of [
    ['<!-- x -->', 10],
    ['<!DOCTYPE html>', 15],
    ['<?xml ?>', 8],
    ['</ x>', 5],
    ['<!-->', 5]
  ])
    assert.deepEqual(markupAt(`${s}tail`, 0), { kind: 'skip', end }, s)
})

test('🔒 markupAt: a tag, quote or comment still open at the end swallows the rest — as a browser does, in one scan', () => {
  for (const s of ['<a href="x', '<p class=x', '<!-- open', '<a"<a"<a"'])
    assert.deepEqual(markupAt(s, 0), { kind: 'skip', end: s.length }, s)
  // the words before it stay
  assert.deepEqual(seen('<p>kept</p><p class="x>gone'), [['main', 'p', 'kept']])
})

/** Markup that made the regex tokenizers scan to the end from every `<` (0.8 s → 8.9 s at 30 → 120 KB). */
const NEVER_CLOSING = {
  'the review input': `<p>x</p>${'<a"'.repeat(40_000)}`,
  'a tag with no >': `<p>x</p>${'<p '.repeat(40_000)}`,
  'unclosed comments': '<!--'.repeat(30_000),
  'unclosed scripts': '<script>'.repeat(15_000),
  'script tags with no >': '<script '.repeat(15_000),
  'unclosed titles': '<title>'.repeat(17_000),
  'second heads': '<head>'.repeat(20_000),
  '<script> inside attributes': '<a title="<script">x</a>'.repeat(5_000),
  '<html> with no >': '<html '.repeat(20_000),
  'unclosed quotes': '<a b="'.repeat(20_000),
  'closing tags never opened': `<p>${'<i>'.repeat(20_000)}${'</b>'.repeat(15_000)}`
}

/**
 * The time limit on 120 KB of never-closing markup. The quadratic parse this pins took 8.9 s; a
 * linear one takes tens of milliseconds. 200 ms was measured on an idle laptop and went red once in a
 * full-suite run under load (219 ms, review 25/09) — and the `tests` gate runs on shared, CPU-capped
 * runners — so the limit is set to still catch the 8.9 s class with room for a busy machine. Raised
 * again to 3 s on 25/09: a loaded CI runner ran a sibling test of this file 4–5× slower than a laptop
 * (PR #341), and 3 s still sits a third of the way below the 8.9 s this pins.
 */
const LINEAR_MS = 3_000

test('🔒 renderedUnits and tameMarkup→readablePage: 120 KB of never-closing markup each parse in < 3 s (linear)', () => {
  for (const [name, html] of Object.entries(NEVER_CLOSING)) {
    const t0 = performance.now()
    renderedUnits(html)
    const t1 = performance.now()
    readablePage(tameMarkup(html))
    const t2 = performance.now()
    assert.ok(t1 - t0 < LINEAR_MS, `${name}: renderedUnits ${Math.round(t1 - t0)} ms`)
    assert.ok(t2 - t1 < LINEAR_MS, `${name}: tameMarkup + readablePage ${Math.round(t2 - t1)} ms`)
  }
  // a `<` that opens nothing: readablePage's `<[^>]*>` scanned to the end from each one (the units
  // read it as a letter, one atom each, which is linear — and the heaviest constant, so not timed here)
  const stray = `<p>x</p>${'< '.repeat(60_000)}`
  const t0 = performance.now()
  assert.equal(readablePage(tameMarkup(stray)).text.slice(0, 5), 'x\n< <')
  assert.ok(performance.now() - t0 < LINEAR_MS, `stray <: ${Math.round(performance.now() - t0)} ms`)
})

// 🔒 NO STRING GROWN ONE CHARACTER AT A TIME AND PROBED. The quadratic build this pins (a rope
// flattened per character: `s += c` then `s.endsWith(' ')`, 20 s for 200,000 spans) cannot be told
// from a linear one by the clock: flattening cost depends on V8's heuristics, not just on n (the same
// 6,000 spans measured 5 ms and 630 ms in one process), and a CI runner's load moves any limit or
// ratio (PR #341: 1,051 ms against `< 1 s`). So the test counts the mechanism instead: while a unit
// of 6,000 spans is built, no probing string method (`endsWith`, `at`, `charAt`) may run on a long
// string. A linear build keeps its pieces in arrays and probes none; the rope build probes once per
// character, thousands of times.
test('🔒 views: a unit of many inline spans probes no long string (no rope flattened per character)', () => {
  const PROBES = ['endsWith', 'at', 'charAt']
  const originals = PROBES.map((name) => [name, String.prototype[name]])
  let longProbes = 0
  for (const [name, original] of originals) {
    String.prototype[name] = function probe(...args) {
      if (this.length > 1000) longProbes += 1
      return original.apply(this, args)
    }
  }
  /** @type {{ units: any[] }} */
  let rendered
  try {
    rendered = renderedUnits(`<p>${'<span>ab</span> '.repeat(6_000)}</p>`)
  } finally {
    for (const [name, original] of originals) String.prototype[name] = original
  }
  assert.equal(longProbes, 0, `${longProbes} probes on strings longer than 1,000 characters`)
  const [unit] = rendered.units
  assert.equal(unit.cased.length, 6_000 * 3 - 1)
  assert.equal(unit.map.length, unit.cased.length)
  assert.equal(unit.bmap.length, unit.bare.length)
})

test('renderedUnits: the element stack stops at 128 deep — the outer elements (the region) stay', () => {
  const [unit] = renderedUnits(`<body><footer>${'<div>'.repeat(1000)}deep</footer></body>`).units
  assert.ok(unit.chain.length <= 128, String(unit.chain.length))
  assert.equal(unit.region, 'footer')
  assert.equal(unit.shown, 'deep')
})

test('tameMarkup: comments and declarations out, stray `<` escaped, script/svg bodies emptied, title kept, quotes escaped', () => {
  assert.equal(
    tameMarkup(
      '<!DOCTYPE html><HTML lang=en><head><title>A<B &amp; C</title></head><head><body><p>a < b</p><!-- c -->' +
        '<script>if(a<b)x("</div>")</script><a title="x>y" href=/z data-x>z</a><svg><text>t</text></svg><p>open <a"'
    ),
    '<html lang="en"><head><title>A&lt;B &amp; C</title></head><body><p>a &lt; b</p><script></script>' +
      '<a title="x&gt;y" href="/z" data-x="">z</a><svg></svg><p>open '
  )
})

// ── regions: a page wrapper (review finding 6) ────────────────────────────────────────────────────

test("🔒 renderedUnits: a page WRAPPER's token does not count — its <header> and <footer> stay header and footer", () => {
  for (const wrapper of [
    '<div class="main-wrapper">',
    '<div id="main-container">',
    '<div class="site-main">'
  ]) {
    const html = `<body>${wrapper}<header><a class="logo" href="/">Brand</a></header><main><h1>Title</h1></main><footer><span>© 2026 X</span></footer></div></body>`
    assert.deepEqual(
      seen(html).map(([region, , words]) => [region, words]),
      [
        ['header', 'Brand'],
        ['main', 'Title'],
        ['footer', '© 2026 X']
      ],
      wrapper
    )
  }
})

test("🔒 renderedUnits: a region token around ONE kind of landmark still decides — Joomla's page intro is main", () => {
  // tracy-business (Joomla), the saved contact and news pages: the page's h1 sits in
  // `header.tb-pageintro` INSIDE `div#t4-main-body.t4-main-body`; "a tag always wins" filed it as header
  const html =
    '<body><div id="t4-header" class="t4-section t4-header"><header id="t4-tb-header"><a href="/en/">Northgate</a></header></div>' +
    '<div id="t4-main-body" class="t4-section t4-main-body"><div class="com-contact"><header class="tb-pageintro">' +
    '<h1>Contact</h1><p>Request a quote.</p></header><div class="tb-contact"><p>Head office</p></div></div></div>' +
    '<div id="t4-footer" class="t4-section t4-footer"><footer><span>© 2026</span></footer></div></body>'
  assert.deepEqual(
    seen(html).map(([region, , words]) => [region, words]),
    [
      ['header', 'Northgate'],
      ['main', 'Contact'],
      ['main', 'Request a quote.'],
      ['main', 'Head office'],
      ['footer', '© 2026']
    ]
  )
})
