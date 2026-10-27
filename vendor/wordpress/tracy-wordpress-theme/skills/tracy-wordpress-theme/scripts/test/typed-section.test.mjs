// typed-section.test.mjs — a spec section with `sectionType` + `fields` + `items` fills the theme
// pattern of that type by the uniform metadata names (wp-tracy-business convention), and an
// untyped section that is a list of links is caught by shape. Two typed sections (one with four
// items), one untyped section that stays core/html, one links-shaped section.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseArgs, renderTypedSection, linksShape, typedDef, buildPageContent } from '../seed.mjs'
import { checkMarkup, parseBlocks, repeatItems, findBlock, serializeBlocks } from '../lib/block-fill.mjs'

const fixture = (name) => readFileSync(new URL(`./fixtures/block-fill/${name}`, import.meta.url), 'utf8')

const field = (block, path, attr, repeat = null) => ({ block, path, attr, repeat })
const patternsMap = {
  schemaVersion: 'wp-tracy-business-patterns-map/v1',
  namespace: 'wp-tracy-business',
  types: {
    projects: {
      pattern: 'wp-tracy-business/section-projects',
      root: '.wtb-projects',
      item: 'projects.item.<n>',
      fields: {
        eyebrow: field('core/paragraph', 'projects.eyebrow', 'content'),
        heading: field('core/heading', 'projects.heading', 'content'),
        headingLevel: field('core/heading', 'projects.heading', 'level'),
        intro: field('core/paragraph', 'projects.intro', 'content'),
        ctas: field('core/button', 'projects.cta.<n>', 'text+href', 'ctas'),
        'items.img': field('core/image', 'projects.item.<n>.img', 'src+alt', 'items'),
        'items.meta': field('core/paragraph', 'projects.item.<n>.meta', 'content', 'items'),
        'items.title': field('core/heading', 'projects.item.<n>.title', 'content', 'items'),
        'items.text': field('core/paragraph', 'projects.item.<n>.text', 'content', 'items'),
        'items.href': field('core/paragraph', 'projects.item.<n>.href', 'href', 'items')
      }
    },
    hero: {
      pattern: 'wp-tracy-business/section-hero',
      root: '.wtb-hero',
      item: 'hero.item.<n>',
      fields: {
        eyebrow: field('core/paragraph', 'hero.eyebrow', 'content'),
        heading: field('core/heading', 'hero.heading', 'content'),
        headingLevel: field('core/heading', 'hero.heading', 'level'),
        intro: field('core/paragraph', 'hero.intro', 'content'),
        ctas: field('core/button', 'hero.cta.<n>', 'text+href', 'ctas'),
        img: field('core/image', 'hero.img', 'src+alt'),
        'items.title': field('core/paragraph', 'hero.item.<n>.title', 'content', 'items'),
        'items.text': field('core/paragraph', 'hero.item.<n>.text', 'content', 'items'),
        'items.meta': field('core/paragraph', 'hero.item.<n>.meta', 'content', 'items')
      },
      styles: { 404: { when: { view: '404' }, add: ['wtb-hero--404'] } }
    },
    links: {
      pattern: 'wp-tracy-business/section-links',
      root: '.wtb-links',
      item: 'links.item.<n>',
      shape: 'links',
      fields: {
        heading: field('core/heading', 'links.heading', 'content'),
        headingLevel: field('core/heading', 'links.heading', 'level'),
        'items.title': field('core/paragraph', 'links.item.<n>.title', 'content', 'items'),
        'items.meta': field('core/paragraph', 'links.item.<n>.meta', 'content', 'items'),
        'items.href': field('core/paragraph', 'links.item.<n>.title', 'href', 'items')
      }
    },
    // An ACM entry of the old shape lives in the same map without getting in the way.
    'accordion:style-1': { pattern: 'tracy-base/section-accordion', root: '.acm-accordion', fields: {} }
  }
}
const patterns = {
  'wp-tracy-business/section-projects': fixture('typed-cards.html'),
  'wp-tracy-business/section-hero': fixture('typed-hero.html'),
  'wp-tracy-business/section-links': fixture('typed-links.html')
}
const media = (ref) => {
  const m = { '/wp-content/uploads/a.png': { url: '/wp-content/uploads/2026/09/a.png', id: 11 }, '/wp-content/uploads/hero.png': { url: '/wp-content/uploads/2026/09/hero.png', id: 12 } }
  return m[ref] ?? null
}
const links = new Map([
  ['/projects', '/projects'],
  ['/about', '/about']
])

const projectsSection = {
  id: 'home-en-3',
  sectionType: 'projects',
  title: 'Selected projects',
  images: [{ src: '/wp-content/uploads/a.png', alt: 'Project photo' }],
  fields: {
    eyebrow: null,
    heading: 'Selected projects',
    headingLevel: 3,
    intro: 'Main contractor for 62,000 m² of cleanroom space.',
    ctas: [
      { text: 'All projects →', href: '/projects' },
      { text: 'Elektra plant', href: '/about' }
    ]
  },
  items: [
    { title: 'Elektra plant', text: 'Main contractor for 62,000 m² of cleanroom space.', meta: 'Factory · 2025', img: '/wp-content/uploads/a.png', alt: 'Elektra', href: null },
    { title: 'Vorsino phase 3', text: '48 ha of earthworks.', meta: 'Infrastructure · 2024', img: null, alt: null, href: '/projects' },
    { title: 'Obninsk-2 substation', text: '', meta: null, img: '/wp-content/uploads/missing.png', alt: 'x', href: '#' },
    { title: 'Zavolzhye logistics', text: 'Fourth card.', meta: 'Logistics · 2023', img: null, alt: null, href: '/nowhere' }
  ]
}

test('typed: items are cloned to the count and every child is filled by name', () => {
  const { markup, notes } = renderTypedSection(projectsSection, patternsMap, patterns, media, { links })
  assert.equal(checkMarkup(markup), true)
  const blocks = parseBlocks(markup)
  for (let n = 1; n <= 4; n++) assert.ok(findBlock(blocks, `projects.item.${n}`), `item ${n} present`)
  assert.equal(findBlock(blocks, 'projects.item.5'), null)
  assert.match(markup, /<h3 class="wp-block-heading wtb-card__title">Zavolzhye logistics<\/h3>/)
  assert.match(markup, /<p class="wtb-card__meta">Infrastructure · 2024<\/p>/)
  // Item 1: its image comes from the media map, alt from the item, id on the block.
  assert.match(markup, /"name":"projects.item.1.img"\},"id":11\}/)
  assert.match(markup, /src="\/wp-content\/uploads\/2026\/09\/a.png" alt="Elektra"/)
  // Item 2 has no image: the image block goes, the card keeps its body.
  assert.equal(findBlock(blocks, 'projects.item.2.img'), null)
  assert.ok(findBlock(blocks, 'projects.item.2.text'))
  // Item 3: empty text and meta go; an image not in the media map goes and is noted.
  assert.equal(findBlock(blocks, 'projects.item.3.text'), null)
  assert.equal(findBlock(blocks, 'projects.item.3.meta'), null)
  assert.equal(findBlock(blocks, 'projects.item.3.img'), null)
  assert.ok(notes.some((n) => /item\.3\.img: image .*missing\.png not in the media map/.test(n)))
  // Links: item 2 → /projects, item 3 → #, item 4 kept and noted as not a spec page, item 1 gets
  // the href of the cta that repeated its title.
  const href = (n) => /href="([^"]*)"/.exec(findBlock(blocks, `projects.item.${n}.href`).innerContent.join(''))[1]
  assert.equal(href(1), '/about')
  assert.equal(href(2), '/projects')
  assert.equal(href(3), '#')
  assert.equal(href(4), '/nowhere')
  assert.ok(notes.some((n) => /item\.4\.href: link \/nowhere is not a page of the spec/.test(n)))
})

test('typed: bare break spellings render as breaks while other text stays escaped', () => {
  for (const [i, br] of ['</br>', '<br>', '<br/>'].entries()) {
    const section = {
      id: `break-${i}`, sectionType: 'projects', images: [], items: [],
      fields: { eyebrow: null, heading: `before${br}after & <tag>`, headingLevel: 2, intro: null, ctas: [] }
    }
    const markup = renderTypedSection(section, patternsMap, patterns, media).markup
    assert.match(markup, /before <br>after &amp; &lt;tag&gt;/)
    assert.doesNotMatch(markup, /&lt;br\/?&gt;/)
  }
})

test('typed: head fields — empty eyebrow goes, heading level follows the spec, noisy intro and cta drop', () => {
  const { markup, notes } = renderTypedSection(projectsSection, patternsMap, patterns, media, { links })
  const blocks = parseBlocks(markup)
  assert.equal(findBlock(blocks, 'projects.eyebrow'), null, 'null eyebrow removes the block')
  assert.match(markup, /<h3 class="wp-block-heading wtb-heading">Selected projects<\/h3>/, 'headingLevel 3')
  assert.equal(findBlock(blocks, 'projects.intro'), null, 'intro equal to item 1 text is extractor noise')
  assert.ok(notes.some((n) => /intro: repeats an item's text, dropped/.test(n)))
  // One cta survives (the other was a card's own link): text and href written.
  assert.ok(findBlock(blocks, 'projects.cta.1'))
  assert.equal(findBlock(blocks, 'projects.cta.2'), null)
  assert.match(markup, /href="\/projects">All projects →<\/a>/)
})

test('typed: no ctas removes the buttons row, no items removes the grid, no image removes the figure', () => {
  const bare = {
    id: 'about-en-2',
    sectionType: 'projects',
    images: [],
    fields: { eyebrow: 'Where we work', heading: 'Regions', headingLevel: 2, intro: null, ctas: [] },
    items: []
  }
  const { markup, notes } = renderTypedSection(bare, patternsMap, patterns, media, { links })
  assert.equal(checkMarkup(markup), true)
  assert.doesNotMatch(markup, /wp:buttons/)
  assert.doesNotMatch(markup, /wtb-projects__grid/)
  assert.doesNotMatch(markup, /wp:image/)
  assert.match(markup, /<p class="wtb-eyebrow">Where we work<\/p>/)
  assert.match(markup, /<h2 class="wp-block-heading wtb-heading">Regions<\/h2>/)
  assert.deepEqual(notes, [])
})

test('typed: the hero takes the section image, a null-href cta is a control and goes, the 404 view adds its style', () => {
  const hero = {
    id: '404-en-1',
    sectionType: 'hero',
    images: [{ src: '/wp-content/uploads/hero.png', alt: 'Site' }],
    fields: {
      eyebrow: '404',
      heading: 'We could not find that page',
      headingLevel: 1,
      intro: 'The link may have changed.',
      ctas: [
        { text: 'Search', href: null },
        { text: '← Back to home', href: '#' }
      ]
    },
    items: [
      { title: '380+', text: 'Projects delivered', meta: null, img: null, alt: null, href: null },
      { title: '0', text: '', meta: 'Serious incidents in 2025', img: null, alt: null, href: null }
    ]
  }
  const { markup, notes } = renderTypedSection(hero, patternsMap, patterns, media, { links, view: '404' })
  assert.equal(checkMarkup(markup), true)
  // The attribute JSON escapes "--" as WordPress does; the HTML carries the class plainly.
  assert.match(markup, /^<!-- wp:group \{"tagName":"section","className":"wtb-section wtb-hero wtb-hero\\u002d\\u002d404"\}/)
  assert.match(markup, /<section class="wp-block-group wtb-section wtb-hero wtb-hero--404">/)
  assert.match(markup, /"name":"hero.img"\},"id":12\}/)
  assert.match(markup, /src="\/wp-content\/uploads\/2026\/09\/hero.png" alt="Site"/)
  const blocks = parseBlocks(markup)
  assert.equal(findBlock(blocks, 'hero.cta.2'), null, 'the two ctas collapse to one')
  assert.match(markup, /is-style-orange[^\n]*\n[^\n]*href="#">← Back to home<\/a>/, 'the first button keeps its style')
  assert.ok(notes.some((n) => /cta "Search": no href, dropped/.test(n)))
  assert.ok(findBlock(blocks, 'hero.item.2'))
  // The caption with a year in it was filed under meta by an older extractor; it is the label,
  // set like its sibling's, not a meta line a size smaller (N-2b88ff).
  assert.equal(findBlock(blocks, 'hero.item.2.meta'), null)
  assert.match(markup, /<p class="wtb-stat__label">Serious incidents in 2025<\/p>/)
  // Without the 404 view the class stays off.
  const plain = renderTypedSection(hero, patternsMap, patterns, media, { links, view: 'front-page' })
  assert.doesNotMatch(plain.markup, /wtb-hero--404/)
})

test('typed: two ctas keep the pattern\'s two button styles; a third clones; meta equal to text is noise', () => {
  const two = {
    id: 'home-en-1',
    sectionType: 'hero',
    images: [],
    fields: { eyebrow: null, heading: 'H', headingLevel: 1, intro: null, ctas: [{ text: 'A', href: '#' }, { text: 'B', href: '#' }] },
    items: [{ title: '380+', text: 'Projects', meta: 'Projects', img: null, alt: null, href: null }]
  }
  const { markup } = renderTypedSection(two, patternsMap, patterns, media, { links })
  assert.match(markup, /is-style-orange[^\n]*\n[^\n]*>A<\/a>/)
  assert.match(markup, /is-style-outline[^\n]*\n[^\n]*>B<\/a>/)
  assert.equal(findBlock(parseBlocks(markup), 'hero.item.1.meta'), null)
  const three = { ...two, fields: { ...two.fields, ctas: [...two.fields.ctas, { text: 'C', href: '#' }] } }
  const out = renderTypedSection(three, patternsMap, patterns, media, { links }).markup
  assert.ok(findBlock(parseBlocks(out), 'hero.cta.3'))
  assert.match(out, />C<\/a>/)
})

test('typed: a field the pattern has no block for is a note, not a silent drop', () => {
  const withHref = {
    ...projectsSection,
    sectionType: 'hero',
    items: [{ title: '1', text: 'x', meta: null, img: '/wp-content/uploads/a.png', alt: 'a', href: '/about' }]
  }
  const { notes } = renderTypedSection(withHref, patternsMap, patterns, media, { links })
  assert.ok(notes.some((n) => /hero\.item\.1\.img: no block in pattern/.test(n)))
  assert.ok(notes.some((n) => /hero\.item\.1\.href: no block in pattern/.test(n)))
  assert.deepEqual(renderTypedSection({ id: 'x', sectionType: 'nope' }, patternsMap, patterns, media), {
    markup: null,
    notes: ['no typed pattern mapped for nope']
  })
  assert.equal(typedDef(patternsMap, 'accordion:style-1'), null, 'ACM entries are not typed entries')
})

const linksHtml = `<div>
  <div><span>You may be looking for</span></div>
  <a href="/about"><span>Capability statement 2026</span> <span>→</span></a>
  <a href="#"><div><div>Annual report 2025</div><div><span>PDF · 6.4 MB</span> · <span>28 Mar 2026</span></div></div><span>↓</span></a>
</div>`

test('linksShape: a label and two or more anchor rows; anything else is null', () => {
  const groups = linksShape(linksHtml)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].heading, 'You may be looking for')
  assert.deepEqual(
    groups[0].items.map(({ title, meta, href }) => ({ title, meta, href })),
    [
      { title: 'Capability statement 2026', meta: '', href: '/about' },
      { title: 'Annual report 2025', meta: 'PDF · 6.4 MB · 28 Mar 2026', href: '#' }
    ]
  )
  // Two groups side by side (the investor reports page).
  const two = linksShape(`<section>${linksHtml}${linksHtml.replace('You may', 'Also')}</section>`)
  assert.equal(two.length, 2)
  assert.equal(two[1].heading, 'Also be looking for')
  assert.equal(linksShape('<div><p>Prose.</p><a href="#">One link</a></div>'), null)
  assert.equal(linksShape('<div><div><input type="text"></div><a href="#">a</a><a href="#">b</a></div>'), null)
  assert.equal(linksShape('<div><a href="#">only one</a></div>'), null)
  // Cards that happen to be anchors (a slide thumbnail with its caption stack) are not rows.
  const card = '<a href="#"><div><span>NG</span><span>Northgate</span><div>Plant</div><span>01</span></div><div>Title slide</div><div>Use this slide →</div></a>'
  assert.equal(linksShape(`<div>${card}${card}</div>`), null)
  assert.equal(linksShape('<div><a href="#"><img src="x.png"><span>a</span></a><a href="#"><span>b</span></a></div>'), null)
})

test('buildPageContent: typed sections fill, a links-shaped untyped one fills, the rest stays core/html', () => {
  const untyped = {
    id: 'about-en-5',
    sectionType: null,
    fields: { eyebrow: null, heading: 'History', headingLevel: 2, intro: null, ctas: [] },
    items: [],
    images: [],
    html: '<section><h2>History</h2><p>Founded in 2004.</p></section>'
  }
  const linksSection = { id: '404-en-2', sectionType: null, fields: {}, items: [], images: [], html: linksHtml }
  const spec = {
    content: { pages: [], posts: [], categories: [], archives: [] },
    sections: { acm: [], custom: [projectsSection, untyped, linksSection] }
  }
  const ctx = {
    spec,
    patternsMap,
    patterns,
    links,
    media,
    rewrite: (m) => m,
    cf7: null,
    log: [],
    sections: [],
    terms: new Map()
  }
  const page = {
    path: '/about',
    view: 'page',
    contentKind: 'sections',
    content: [
      { kind: 'section', sectionType: 'projects', moduleId: 'home-en-3', html: '<section>ignored, the spec section is used</section>' },
      { kind: 'section', sectionType: null, moduleId: 'about-en-5', html: untyped.html },
      // The links list arrives as the extractor wrote it: pre-converted, the html on the spec section.
      { kind: 'html', moduleId: '404-en-2', blocks: `<!-- wp:html -->\n${linksHtml}\n<!-- /wp:html -->` },
      { kind: 'html', moduleId: 'x', blocks: '<!-- wp:html -->\n<p>raw</p>\n<!-- /wp:html -->' }
    ]
  }
  const out = buildPageContent(page, ctx)
  assert.equal(checkMarkup(out), true)
  assert.match(out, /wtb-section wtb-projects/)
  assert.match(out, /wtb-section wtb-links/)
  assert.match(out, /<a href="\/about">Capability statement 2026<\/a>/)
  assert.match(out, /<p class="wtb-links__meta">PDF · 6.4 MB · 28 Mar 2026<\/p>/)
  assert.match(out, /<!-- wp:html -->\n<section><h2>History<\/h2>/, 'untyped prose stays core/html')
  assert.match(out, /<!-- wp:html -->\n<p>raw<\/p>/, 'an html entry that is not a links list stays as written')
  assert.deepEqual(
    ctx.sections.map((s) => [s.module, s.kind, s.via ?? null]),
    [
      ['home-en-3', 'typed', null],
      ['about-en-5', 'fallback', null],
      ['404-en-2', 'typed', 'links-shape'],
      ['x', 'html', null]
    ]
  )
})

test('repeatItems: a child named under its wrapper renumbers with it', () => {
  const blocks = parseBlocks(fixture('typed-cards.html'))
  repeatItems(blocks, 'projects', 3, { itemName: 'projects.item' })
  assert.ok(findBlock(blocks, 'projects.item.3.title'))
  assert.ok(findBlock(blocks, 'projects.item.3.href'))
  assert.equal(findBlock(blocks, 'projects.item.4'), null)
  assert.equal(checkMarkup(serializeBlocks(blocks)), true)
})

test('parseArgs: --pattern-ns names the theme pattern namespace', () => {
  const o = parseArgs(['--spec', '/s', '--wp', 'wp', '--theme', 't', '--patterns-map', '/m', '--images', '/i', '--pattern-ns', 'wp-tracy-business'])
  assert.equal(o.patternNs, 'wp-tracy-business')
})

// ---- coverage gate: a typed pattern that drops text of the source section is not used ----

const coverageSpec = (section) => ({
  content: { pages: [], posts: [], categories: [], archives: [] },
  sections: { acm: [], custom: [section] }
})
const coverageCtx = (spec, extra = {}) => ({
  spec,
  patternsMap,
  patterns,
  links,
  media,
  rewrite: (m) => m,
  cf7: null,
  log: [],
  sections: [],
  terms: new Map(),
  inlineColors: [],
  ...extra
})
const coveragePage = (moduleId, html) => ({
  path: '/projects',
  view: 'page',
  contentKind: 'sections',
  content: [{ kind: 'section', sectionType: 'projects', moduleId, html }]
})
// The two cards as the canvas wrote them: everything the pattern renders, and nothing else.
const coveredHtml = `<section>
  <h2>Selected projects</h2>
  <div><a href="/about"><h3>Elektra plant</h3><p>Main contractor for 62,000 m² of cleanroom space.</p><div>Factory · 2025</div></a></div>
  <div><a href="/projects"><h3>Vorsino phase 3</h3><p>48 ha of earthworks.</p><div>Infrastructure · 2024</div></a></div>
  <a href="/projects">All projects →</a>
</section>`
const coveredSection = {
  ...projectsSection,
  id: 'projects-en-2',
  html: coveredHtml,
  items: projectsSection.items.slice(0, 2)
}

test('coverage: a typed pattern that renders every run of the source section is kept', () => {
  const ctx = coverageCtx(coverageSpec(coveredSection))
  const out = buildPageContent(coveragePage('projects-en-2', coveredHtml), ctx)
  assert.match(out, /wtb-section wtb-projects/)
  assert.deepEqual(ctx.sections.map((s) => [s.kind, s.via ?? null]), [['typed', null]])
  assert.ok(!ctx.log.some((n) => /drops/.test(n.note ?? '')), 'nothing dropped')
})

test('coverage: a run the pattern has no block for sends the section to core/html, with the runs named', () => {
  const html = coveredHtml
    .replace('<div>Factory · 2025</div>', '<div>Factory · 2025</div><ul><li>Covered by the contract</li></ul><div>Timeline: 6–10 weeks from mobilisation</div>')
    .replace('All projects →', 'Read more →')
  const section = { ...coveredSection, html }
  const ctx = coverageCtx(coverageSpec(section))
  const out = buildPageContent(coveragePage('projects-en-2', html), ctx)
  assert.doesNotMatch(out, /wtb-section wtb-projects/, 'the pattern is not used')
  assert.match(out, /<!-- wp:html -->\n<section>\n\s*<h2>Selected projects<\/h2>/, 'the source goes in verbatim')
  assert.deepEqual(
    ctx.sections.map((s) => [s.kind, s.via, s.type, s.dropped]),
    [['html', 'coverage', 'projects', ['Covered by the contract', 'Timeline: 6–10 weeks from mobilisation']]]
  )
  const note = ctx.log.find((n) => /drops/.test(n.note ?? ''))
  assert.deepEqual(note, {
    page: '/projects',
    module: 'projects-en-2',
    type: 'projects',
    dropped: ['Covered by the contract', 'Timeline: 6–10 weeks from mobilisation'],
    note: 'typed render drops 2 runs → core/html'
  })
  // `--typed-loss allow` keeps the pattern and still says what it dropped.
  const allow = coverageCtx(coverageSpec(section), { typedLoss: 'allow' })
  const kept = buildPageContent(coveragePage('projects-en-2', html), allow)
  assert.match(kept, /wtb-section wtb-projects/)
  assert.deepEqual(allow.sections.map((s) => [s.kind, s.dropped?.length]), [['typed', 2]])
  assert.ok(allow.log.some((n) => n.note === 'typed render drops 2 runs, kept (--typed-loss allow)'))
})

test('coverage: filter chips (also read together with a button), utility runs and inline spacing are not drops', () => {
  // The chip row as the canvas writes it: inline anchors, so leaf mode reads the row as one run
  // together with the button that follows; the heading is split over spans with no whitespace.
  const html = coveredHtml
    .replace(
      '<h2>Selected projects</h2>',
      '<h2>Selected <span>projects</span></h2><div><a href="#">All projects</a> <a href="#">Industrial buildings</a> <a href="#">Infrastructure and roads</a> <a href="/projects">All projects →</a></div><a href="#">Back to top ↑</a>'
    )
    .replace('cleanroom space', 'cleanroom<span>space</span>')
  const section = {
    ...coveredSection,
    html,
    fields: { ...coveredSection.fields, filters: ['All projects', 'Industrial buildings', 'Infrastructure and roads'] }
  }
  const ctx = coverageCtx(coverageSpec(section))
  const out = buildPageContent(coveragePage('projects-en-2', html), ctx)
  assert.match(out, /wtb-section wtb-projects/)
  assert.deepEqual(ctx.sections.map((s) => s.kind), ['typed'])
})

test('typed: when the map says the items are the button labels again, the buttons stay', () => {
  const band = {
    id: 'about-en-9',
    sectionType: 'hero',
    images: [],
    fields: { eyebrow: null, heading: 'Need a contractor?', headingLevel: 2, intro: null, ctas: [{ text: 'Request a quote', href: '#' }, { text: 'See projects', href: '/projects' }] },
    items: [{ title: 'Request a quote', text: '', meta: null, img: null, alt: null, href: null }, { title: 'See projects', text: '', meta: null, img: null, alt: null, href: null }]
  }
  // Without the declaration the buttons are taken for the cards' own links and go (the cards carry them).
  const asCards = renderTypedSection(band, patternsMap, patterns, media, { links }).markup
  assert.doesNotMatch(asCards, /wp:button /)
  const map = { ...patternsMap, types: { ...patternsMap.types, hero: { ...patternsMap.types.hero, dropped: { items: 'the items of a cta section are its own button labels again' } } } }
  const { markup } = renderTypedSection(band, map, patterns, media, { links })
  assert.match(markup, /href="#">Request a quote<\/a>/)
  assert.match(markup, /href="\/projects">See projects<\/a>/)
})

test('coverage: a filter chip is removed as a word, not as a substring of a run', () => {
  // "All" is a chip on every listing; "Installation" contains it. Cutting the chip out of the
  // middle of the word left "inst ation", the key never matched, and the whole projects section
  // fell back to core/html on the Northgate home page.
  const html = coveredHtml
    .replace('<h2>Selected projects</h2>', '<h2>Selected projects</h2><div><a href="#">All</a> <a href="#">M&amp;E</a></div>')
    .replace('Main contractor for 62,000 m² of cleanroom space.', 'Installation, testing and energisation completed in nine months')
  const section = {
    ...coveredSection,
    html,
    fields: { ...coveredSection.fields, filters: ['All', 'M&E'] },
    items: coveredSection.items.map((it, i) => (i === 0 ? { ...it, text: 'Installation, testing and energisation completed in nine months' } : it))
  }
  const ctx = coverageCtx(coverageSpec(section))
  const out = buildPageContent(coveragePage('projects-en-2', html), ctx)
  assert.match(out, /wtb-section wtb-projects/)
  assert.deepEqual(ctx.sections.map((s) => s.kind), ['typed'])
})

// ---- the contact form: one CF7 form, where the source's controls stood ----

const formHtml = `<section>
  <div id="card"><p>Fields marked * are required.</p>
    <div><label>Full name <span>*</span></label><input type="text" placeholder="Ivan Petrov"></div>
    <div><label>Email <span>*</span></label><input type="text" placeholder="you@company.ru"></div>
    <div><label>Project description <span>*</span></label><textarea placeholder="Location…"></textarea></div>
    <div><button>Send request</button></div>
  </div>
  <div id="aside"><div>Head office</div><div>Vorsino Industrial Park, plot 12</div></div>
</section>`
const formPattern = `<!-- wp:group {"className":"wtb-section wtb-form"} -->
<section class="wp-block-group wtb-section wtb-form">
<!-- wp:paragraph {"metadata":{"name":"form.intro"}} -->
<p>Intro</p>
<!-- /wp:paragraph -->
<!-- wp:shortcode {"metadata":{"name":"form.embed"}} -->
[contact-form-7 id="0" title="x"]
<!-- /wp:shortcode -->
</section>
<!-- /wp:group -->`
const formMap = {
  ...patternsMap,
  types: {
    ...patternsMap.types,
    form: {
      pattern: 'wp-tracy-business/section-form',
      root: '.wtb-form',
      item: 'form.item.<n>',
      fields: { intro: field('core/paragraph', 'form.intro', 'content'), embed: field('core/shortcode', 'form.embed', 'content') }
    }
  }
}
const formSection = {
  id: 'contact-en-3',
  sectionType: 'form',
  locale: 'en',
  html: formHtml,
  fields: { eyebrow: null, heading: null, headingLevel: null, intro: 'Fields marked * are required.', ctas: [{ text: 'Send request', href: null }], filters: [] },
  items: [],
  images: []
}
const contactPage = (html) => ({
  path: '/contact',
  view: 'page-contact',
  locale: 'en',
  contentKind: 'sections',
  content: [{ kind: 'section', sectionType: 'form', moduleId: 'contact-en-3', html }]
})
const cf7 = { id: 7, title: 'Contact', text: 'Full name * Email * Project description * Send request' }

test('form: labels the CF7 form carries are not drops — the typed pattern with the embed is kept, once', () => {
  const html = formHtml.replace(/<div id="aside">[^]*?<\/div>\n/, '')
  const ctx = coverageCtx(coverageSpec({ ...formSection, html }), { patternsMap: formMap, patterns: { ...patterns, 'wp-tracy-business/section-form': formPattern }, cf7, cf7For: () => cf7 })
  const out = buildPageContent(contactPage(html), ctx)
  assert.match(out, /wtb-section wtb-form/)
  assert.deepEqual(ctx.sections.map((s) => s.kind), ['typed'])
  assert.equal((out.match(/\[contact-form-7 id="7"/g) ?? []).length, 1, 'one form, no second shortcode after the body')
})

test('form: when the pattern cannot hold the source (the aside), the source goes in with the live form in its card', () => {
  const ctx = coverageCtx(coverageSpec(formSection), { patternsMap: formMap, patterns: { ...patterns, 'wp-tracy-business/section-form': formPattern }, cf7, cf7For: () => cf7 })
  const out = buildPageContent(contactPage(formHtml), ctx)
  assert.deepEqual(ctx.sections.map((s) => [s.kind, s.via, s.embed]), [['html', 'coverage', 'in-place']])
  assert.match(out, /<!-- wp:html -->/)
  assert.doesNotMatch(out, /<input|<textarea|<button/, 'the dead controls are gone')
  assert.match(out, /<div id="card"><p>Fields marked \* are required\.<\/p>\s*\n\[contact-form-7 id="7" title="Contact"\]\n\s*<\/div>/, 'the shortcode stands where the controls stood')
  assert.match(out, /Vorsino Industrial Park/, 'the aside stays')
  assert.doesNotMatch(out, /<!-- wp:shortcode -->/, 'no second form appended after the body')
  assert.equal((out.match(/contact-form-7/g) ?? []).length, 1)
  assert.ok(ctx.log.some((n) => /stands where the source's controls stood/.test(n.note ?? '')))
})

test('form: the page of another locale embeds that locale\'s form; a page with no form section still gets the generic append', () => {
  const ru = { id: 9, title: 'Contact (ru)', text: '' }
  const ctx = coverageCtx(coverageSpec(formSection), { patternsMap: formMap, patterns: { ...patterns, 'wp-tracy-business/section-form': formPattern }, cf7, cf7For: (l) => (l === 'ru' ? ru : cf7) })
  const out = buildPageContent({ ...contactPage(formHtml), locale: 'ru' }, ctx)
  assert.match(out, /\[contact-form-7 id="9" title="Contact \(ru\)"\]/)
  const plain = buildPageContent({ path: '/contact', view: 'page-contact', locale: 'en', contentKind: 'blocks', content: '<!-- wp:paragraph -->\n<p>Write to us.</p>\n<!-- /wp:paragraph -->' }, ctx)
  assert.match(plain, /<!-- wp:shortcode -->\n\[contact-form-7 id="7" title="Contact"\]/)
})

test('typed: the hero heading keeps the source\'s <em> — the spec field is plain, the section html is not', () => {
  const html = `<section><h1><span>Building the groundwork for</span><br><em style="color: rgb(218, 90, 42);">next-generation plants</em></h1><p>Design–build main contractor.</p><a href="/about">See our capabilities</a></section>`
  const section = {
    id: 'home-en-1',
    sectionType: 'hero',
    html,
    fields: { eyebrow: null, heading: 'Building the groundwork for next-generation plants', headingLevel: 1, intro: 'Design–build main contractor.', ctas: [{ text: 'See our capabilities', href: '/about' }], filters: [] },
    items: [],
    images: []
  }
  const { markup } = renderTypedSection(section, patternsMap, patterns, media, { view: 'front-page', links })
  // The space in front of the break is deliberate: it draws nothing and it keeps a tag-stripping
  // reader (WordPress's excerpt, a meta description) from gluing "for" to "next-generation".
  assert.match(markup, /<h1[^>]*>Building the groundwork for <br><em>next-generation plants<\/em><\/h1>/)
  assert.match(markup, /<p[^>]*>Design–build main contractor\.<\/p>/, 'a field without emphasis is plain')
  assert.ok(checkMarkup(markup))
  // The coverage gate reads the same text either way.
  const ctx = coverageCtx(coverageSpec(section))
  const out = buildPageContent({ path: '/', view: 'front-page', contentKind: 'sections', content: [{ kind: 'section', sectionType: 'hero', moduleId: 'home-en-1', html }] }, ctx)
  assert.match(out, /<em>next-generation plants<\/em>/)
  assert.deepEqual(ctx.sections.map((s) => s.kind), ['typed'])
})

test('styles.when: a style names the view AND the section it is for; a view alone would hit every page of that view', async () => {
  const { styleApplies } = await import('../seed.mjs')
  const section = { id: 'about-en-10', fields: { heading: 'Need a general contractor?' }, items: [{}, {}] }
  assert.equal(styleApplies({ view: 'page', id: 'about-en-10' }, { view: 'page', section }), true)
  assert.equal(styleApplies({ view: 'page', id: 'about-en-10' }, { view: 'page', section: { ...section, id: 'careers-en-9' } }), false)
  assert.equal(styleApplies({ view: 'page', id: ['about-en-10', 'about-ru-10'] }, { view: 'page', section: { ...section, id: 'about-ru-10' } }), true)
  assert.equal(styleApplies({ view: ['page', 'front-page'] }, { view: 'front-page', section }), true)
  assert.equal(styleApplies({ id: 'about-en-10' }, { view: '404', section }), true, 'no view key: any view')
  assert.equal(styleApplies({ fields: { heading: 'Need a general contractor?' } }, { view: 'page', section }), true)
  assert.equal(styleApplies({ fields: { heading: 'Other' } }, { view: 'page', section }), false)
  assert.equal(styleApplies({ items: 2 }, { view: 'page', section }), true)
  assert.equal(styleApplies({ items: 3 }, { view: 'page', section }), false)
  assert.equal(styleApplies({}, { view: 'page', section }), false, 'a style is opt-in')
  assert.equal(styleApplies({ colour: 'red' }, { view: 'page', section }), false, 'an unknown key never matches')
  // Through the pattern: the map's 404 style still applies by view, and a style by id adds its class to that section only.
  const map = { ...patternsMap, types: { ...patternsMap.types, hero: { ...patternsMap.types.hero, styles: { panel: { when: { view: 'page', id: 'about-en-1' }, add: ['wtb-hero--panel'] } } } } }
  const hero = { id: 'about-en-1', sectionType: 'hero', fields: { eyebrow: null, heading: 'H', headingLevel: 1, intro: null, ctas: [], filters: [] }, items: [], images: [] }
  assert.match(renderTypedSection(hero, map, patterns, media, { view: 'page', links }).markup, /wtb-hero--panel/)
  assert.doesNotMatch(renderTypedSection({ ...hero, id: 'careers-en-1' }, map, patterns, media, { view: 'page', links }).markup, /wtb-hero--panel/)
})

test('typed: a sentence filed under meta with no text beside it is the text (an older spec\'s stat caption)', () => {
  const section = {
    ...projectsSection,
    id: 'home-en-4',
    items: [
      { ...projectsSection.items[0], text: null, meta: 'Serious incidents in 2025' },
      { ...projectsSection.items[1], text: null, meta: 'Factory · 2025' },
      { ...projectsSection.items[1], text: null, meta: '28 Jul 2026' }
    ]
  }
  const { markup } = renderTypedSection(section, patternsMap, patterns, media, { view: 'page', links })
  const blocks = parseBlocks(markup)
  assert.equal(findBlock(blocks, 'projects.item.1.meta'), null, 'the sentence left meta')
  assert.match(findBlock(blocks, 'projects.item.1.text').innerContent.join(''), /Serious incidents in 2025/)
  assert.match(findBlock(blocks, 'projects.item.2.meta').innerContent.join(''), /Factory · 2025/, 'a label with a separator stays meta')
  assert.match(findBlock(blocks, 'projects.item.3.meta').innerContent.join(''), /28 Jul 2026/, 'a date stays meta')
})
