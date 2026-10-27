// A source `<section>` that stacks two or three heading-led blocks is two or three spec sections,
// not one. The Northgate canvas does it on Services ("How the work runs" + "Indicative pricing"),
// Investor relations ("Dividends" + "Investor calendar" + "Corporate governance") and Slides
// ("Ready-made decks" + "House rules"); read as one section, the pricing table fell off the site
// because the fields and items of the section only ever describe its first block.
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { extractMain, textOf } from '../lib/html-content.mjs'

const sectionsOf = (html, ctx = { idPrefix: 'p-en', view: 'page' }) => extractMain(new JSDOM(`<body><main>${html}</main></body>`).window.document, ctx).sections
const words = (s) => textOf(new JSDOM(s).window.document.body)

test('split: a <section> with two h2-led blocks is two sections, ids run on, every word lands in exactly one', () => {
  // The Services page shape: one <section>, two column <div>s, each led by its own <h2>.
  const source = `<section style="display:grid">
      <div><h2>How the work runs</h2>
        <div><div>01</div><div><div>Enquiry</div><div>Dimensions, loads, region.</div></div></div>
        <div><div>02</div><div><div>Contract</div><div>Price and dates fixed.</div></div></div>
        <div><div>03</div><div><div>Construction</div><div>Weekly report.</div></div></div>
        <div><div>04</div><div><div>Handover</div><div>Five-year warranty.</div></div></div>
      </div>
      <div><h2>Indicative pricing</h2><p>Ranges are for early budgeting.</p>
        <div>
          <div><div><div>Class A warehouse</div><div>Frame, envelope, floors</div></div><div>from ₽48,000/m²</div></div>
          <div><div><div>Production building</div><div>With crane beams</div></div><div>from ₽62,000/m²</div></div>
          <div><div><div>Steel frame only</div><div>Fabrication, erection</div></div><div>from ₽145,000/t</div></div>
          <div><div><div>Design</div><div>BIM model</div></div><div>from ₽890/m²</div></div>
        </div>
      </div>
    </section>
    <section><h2>Price your facility</h2><a href="/contact">Get a quote</a></section>`
  const sections = sectionsOf(source)
  assert.deepEqual(
    sections.map((s) => [s.id, s.fields.heading]),
    [
      ['p-en-1', 'How the work runs'],
      ['p-en-2', 'Indicative pricing'],
      ['p-en-3', 'Price your facility']
    ]
  )
  const [steps, pricing] = sections
  assert.equal(steps.fields.intro, null, 'the pricing intro no longer leaks into the steps block')
  assert.equal(pricing.fields.intro, 'Ranges are for early budgeting.')
  // A numbered row: the ordinal is the meta, the next line the title, the rest the text — and the
  // list is the numbered-card type, not whatever its heading says.
  assert.deepEqual(
    steps.items.map((i) => [i.meta, i.title, i.text]),
    [
      ['01', 'Enquiry', 'Dimensions, loads, region.'],
      ['02', 'Contract', 'Price and dates fixed.'],
      ['03', 'Construction', 'Weekly report.'],
      ['04', 'Handover', 'Five-year warranty.']
    ]
  )
  assert.equal(steps.type, 'services')
  assert.deepEqual(
    pricing.items.map((i) => i.title),
    ['Class A warehouse', 'Production building', 'Steel frame only', 'Design']
  )
  // Nothing lost, nothing doubled: the words of the source section are the words of the two pieces.
  assert.equal(`${words(steps.html)} ${words(pricing.html)}`, words(source.slice(0, source.indexOf('</section>') + 10)))
  assert.match(steps.html, /^<section style="display:grid">/)
  assert.match(pricing.html, /^<section style="display:grid">/, 'a later piece keeps the wrapper tag and style')
})

test('split: an h2 inside a card of a row is an item title, not a block; one heading is one section', () => {
  // Three cards with h2 titles under a section h2: the row is the item set, the section stays one.
  const cards = `<section id="sec-team"><h2>Leadership</h2><div>
      <article><img src="/wp-content/uploads/a.png" alt=""><h2>Anna</h2><p>CEO</p></article>
      <article><img src="/wp-content/uploads/b.png" alt=""><h2>Boris</h2><p>CFO</p></article>
      <article><img src="/wp-content/uploads/c.png" alt=""><h2>Vera</h2><p>COO</p></article>
    </div></section>`
  const [team, ...rest] = sectionsOf(cards)
  assert.equal(rest.length, 0)
  assert.equal(team.fields.heading, 'Leadership')
  assert.deepEqual(
    team.items.map((i) => i.title),
    ['Anna', 'Boris', 'Vera']
  )
  // The same three cards as plain <div>s: the row (≥3 of one shape) still owns its headings.
  const divs = cards.replace(/<\/?article>/g, (m) => m.replace('article', 'div'))
  assert.equal(sectionsOf(divs).length, 1)
  // One heading, its h3 subsections under it: untouched, html byte-for-byte the source element.
  const one = `<section id="sec-history" class="dark"><div style="text-transform:uppercase">Since 2004</div><h2>History</h2><p>Lead.</p><h3>2004</h3><p>Founded.</p><h3>2012</h3><p>Grew.</p></section>`
  const [history] = sectionsOf(one)
  assert.equal(history.id, 'p-en-1')
  assert.equal(history.html, one)
  assert.equal(history.fields.eyebrow, 'Since 2004')
  // Two <li> with h2 in a list are items too.
  assert.equal(sectionsOf('<section><h2>Steps</h2><ul><li><h2>One</h2><p>a</p></li><li><h2>Two</h2><p>b</p></li></ul></section>').length, 1)
})

test('split: headings under one shared wrapper cut at any depth; an <aside> is a block of its own', () => {
  // The Investor relations shape: <section><div> [column A: h2 + rows] [column B: h2, rows, h2, links].
  const ir = `<section style="background:#14171A"><div style="display:grid">
      <div><h2>Dividends</h2><p>At least 30% of net profit.</p>
        <div><div>RUB 14.20</div><div>FY 2025</div></div><div><div>RUB 10.80</div><div>FY 2024</div></div><div><div>RUB 8.40</div><div>FY 2023</div></div></div>
      <div><h2>Investor calendar</h2>
        <div><div>30 Oct 2026</div><div>Q3 results</div></div><div><div>12 Dec 2026</div><div>Investor day</div></div><div><div>27 Mar 2027</div><div>Annual report</div></div>
        <h2>Corporate governance</h2>
        <div><a href="/d/charter"><b>Charter and internal documents</b></a><a href="/d/board"><b>Board of directors composition</b></a><a href="/d/policy"><b>Dividend policy</b></a><a href="/d/anti"><b>Anti-corruption policy text</b></a></div></div>
    </div></section>`
  const blocks = sectionsOf(ir)
  assert.deepEqual(
    blocks.map((s) => [s.id, s.fields.heading, s.items.length]),
    [
      ['p-en-1', 'Dividends', 3],
      ['p-en-2', 'Investor calendar', 3],
      ['p-en-3', 'Corporate governance', 4]
    ]
  )
  assert.equal(blocks.map((s) => words(s.html)).join(' '), words(ir))
  for (const s of blocks) assert.match(s.html, /^<section style="background:#14171A"><div style="display:grid">/, 'the wrapper chain above the heading is kept, shallow')
  assert.equal(blocks[1].fields.intro, null, 'the Dividends paragraph does not travel')

  // The Slides shape: a flex ROW — a <div> column with two h2 blocks beside an <aside>. A row
  // with a sidebar is a page layout, not a stack: cut apart, the aside became a full-width block
  // under the decks and the source's two columns were gone. It stays one section (round 2).
  const slides = `<div style="display:flex"><div>
      <h2>Ready-made decks</h2><a href="/d/1.pdf"><div>Corporate deck</div><span>PDF</span></a><a href="/d/2.pdf"><div>Sales proposal</div><span>PDF</span></a>
      <h2>House rules</h2><div><span>→</span><span>One idea per slide.</span></div><div><span>→</span><span>No stock photos.</span></div>
    </div><aside><div><div>Brand assets</div><a href="/d/logos.zip">Logos</a><a href="/d/fonts.zip">Fonts</a></div><div><div>Palette</div><div>Ink #14171A</div></div></aside></div>`
  const [, ...parts] = sectionsOf(`<section><h1>Presentations and slides</h1></section>${slides}`)
  assert.deepEqual(
    parts.map((s) => [s.id, s.title, s.fields.heading]),
    [['p-en-2', 'Ready-made decks', 'Ready-made decks']]
  )
  assert.equal(parts.map((s) => words(s.html)).join(' '), words(slides))
  // The same two blocks stacked in a column (no sidebar) still split.
  const column = slides.replace('<div style="display:flex"><div>', '<div><div>').replace(/<aside>[\s\S]*<\/aside>/, '')
  assert.deepEqual(sectionsOf(`<section><h1>Presentations and slides</h1></section>${column}`).map((s) => s.title).slice(1), ['Ready-made decks', 'House rules'])
  // An aside before the first heading stays ahead of it; a lone aside splits nothing.
  assert.deepEqual(
    sectionsOf('<section><aside><div>Note</div></aside><h2>Body</h2><p>x</p></section>').map((s) => s.title),
    ['Note', 'Body']
  )
  assert.equal(sectionsOf('<section><h2>Body</h2><p>x</p></section>').length, 1)
})

test('split: a card column cut away leaves no empty box behind in the block it left', () => {
  // The About shape: a grid of two columns, the second a bordered card with its own h2 (Safety).
  // The card is a block of its own; the first block used to keep the card's wrapper as an empty
  // bordered div — a 560×55 grey box under Accreditations on the site.
  const about = `<section style="display:grid"><div><h2>Accreditations</h2>
      <div><span>→</span><div><div>SRO membership</div><div>Liability cover</div></div></div>
      <div><span>→</span><div><div>ISO 9001:2015</div><div>Quality management</div></div></div>
      <div><span>→</span><div><div>ISO 45001:2018</div><div>Health and safety</div></div></div>
    </div><div style="border:1px solid #dcd7cc;padding:28px"><h2>Safety</h2><p>Zero lost-time incidents.</p><div><img src="/wp-content/uploads/safety-1.png" alt=""></div></div></section>`
  const [acc, safety] = sectionsOf(about)
  assert.equal(acc.fields.heading, 'Accreditations')
  assert.equal(safety.fields.heading, 'Safety')
  assert.doesNotMatch(acc.html, /<div style="border:1px solid #dcd7cc;padding:28px">\s*<\/div>/, 'the emptied card wrapper is dropped')
  assert.match(safety.html, /^<section style="display:grid"><div style="border:1px solid #dcd7cc;padding:28px"><h2>Safety<\/h2>/)
  assert.equal(`${words(acc.html)} ${words(safety.html)}`, words(about))
})
