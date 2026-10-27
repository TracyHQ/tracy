import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import {
  baselineOf,
  briefPricesOf,
  checkCtaReal,
  checkFactsFromBrief,
  checkNoDemoWords,
  FILLER_SOURCE,
  factsIn,
  holdsTitle,
  namesSomething,
  postPathOf,
  templateNamesOf,
  residueOf
} from '../src/demo-qa.js'
import { readResidueInPage } from '../src/demo-residue-page.js'
import { LR_BRIEF, ORIGIN, lrRead } from './fixtures/residue/lr.mjs'

const baseline = baselineOf([lrRead('lr-before.html')])

test('the residue read keeps one text node per unit: a dish heading is its name and its price', () => {
  const { units } = lrRead('lr-before.html').residue
  const venison = units.filter((u) => u.item && /Smoked Venison|\$147|oysters/.test(u.text))
  assert.deepEqual(
    venison.map((u) => [u.text, u.field]),
    [
      ['Smoked Venison', 'name'],
      ['$147', 'price'],
      ['w/ pork, oysters, veggie, ginger', 'desc']
    ]
  )
  assert.ok(
    units.some(
      (u) => u.kind === 'date' && u.text === '10.09.2021' && u.post?.includes('/cocktail-bar-alchemist')
    )
  )
  // Nav labels are the site's pages, never residue.
  assert.ok(!units.some((u) => u.text === 'Our Blog'))
})

test('the baseline ledger holds the template dishes, prices, dates and links of every tab', () => {
  const texts = baseline.ledger.units.map((u) => u.text)
  for (const t of ['Crisped Duck', '$156', '10.09.2021', 'w/ pickled ginger, chili'])
    assert.ok(texts.includes(t), t)
  assert.ok(baseline.ledger.links.some((l) => l.text === 'View full menu' && l.href === '/menu'))
})

test('lr-now: every template dish, price and date is residue; words the agent wrote are not, unless filler', () => {
  const residue = residueOf([lrRead('lr-now.html')], { baseline, briefText: LR_BRIEF })
  const of = (field) => residue.items.filter((i) => i.field === field).map((i) => i.text)
  // "Sandwich Suggestion" is the agent's: facts-from-brief judges it, the sweep never rewrites it. "Ask" and "Sample"
  // are filler (product owner, 25/10/2026): swept like the template's own price.
  assert.deepEqual(of('dish-price'), ['Ask', 'Sample', 'Ask', '$147', '$156'])
  assert.ok(residue.items.filter((i) => /^(Ask|Sample)$/.test(i.text)).every((i) => i.filler))
  assert.deepEqual(of('dish-name'), ['Smoked Venison', 'Crisped Duck'])
  assert.deepEqual(of('dish-desc'), [
    'Menu idea for owner review, not a confirmed dish.',
    'w/ shaved beans, wild flowers',
    'w/ pork, oysters, veggie, ginger',
    'w/ pickled ginger, chili'
  ])
  assert.deepEqual(of('date'), ['10.09.2021', '10.09.2021'])
  assert.ok(residue.items.filter((i) => i.field === 'date').every((i) => i.post))
  // A template passage is one, wherever it sits: the partner link's label too.
  assert.deepEqual(of('text'), [
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    'Reserve with OpenTable today'
  ])
  const links = residue.items.filter((i) => i.field === 'link').map((i) => [i.text, i.href, i.to])
  assert.deepEqual(links, [
    ['Book a Table', '/about-us', 'contact'],
    ['View full menu', '/reservation', '/menu'],
    ['Reserve with OpenTable today', 'https://www.opentable.com/r/ja-diner', 'contact']
  ])
})

test('lr-now fails no-demo-words and cta-real, and the sweep can clear every finding', () => {
  const reads = [lrRead('lr-now.html')]
  const residue = residueOf(reads, { baseline, briefText: LR_BRIEF })
  const words = checkNoDemoWords(reads, { baseline, briefText: LR_BRIEF, residue })
  assert.equal(words.pass, false)
  assert.equal(words.sweepable, true)
  const ctas = checkCtaReal(
    [
      {
        ...reads[0],
        ctas: [{ href: '/about-us', text: 'Book a Table', booking: true, button: true, selector: 'p > a' }]
      }
    ],
    { residue }
  )
  assert.equal(ctas.pass, false)
  assert.equal(ctas.sweepable, true)
  assert.ok(ctas.detail.some((f) => f.text === 'View full menu' && /\/menu/.test(f.problem)))
})

test('a page whose dishes show their neutral name and an empty price, and whose posts are dated today, has no residue; a made-up dish name and "Coming soon" are filler', () => {
  const { document } = parseHTML(
    readFileSync(new URL('./fixtures/residue/lr-now.html', import.meta.url), 'utf8')
  )
  document.body.normalize()
  for (const h of document.querySelectorAll('.dish-name')) {
    h.firstChild.nodeValue = /Brunch|Coffee/.test(h.firstChild.nodeValue)
      ? h.firstChild.nodeValue
      : 'Menu item '
    h.querySelector('.dish-price').textContent = ''
  }
  for (const p of document.querySelectorAll('.dish-description')) p.textContent = ''
  for (const t of document.querySelectorAll('time')) t.textContent = '24.10.2026'
  document.querySelectorAll('.wp-block-post-excerpt__excerpt')[1].textContent = ''
  const [book, menu] = document.querySelectorAll('.slide-btn a')
  book.setAttribute('href', '/contact-us/')
  menu.setAttribute('href', '/menu')
  document.querySelector('.partner a').setAttribute('href', '/contact-us/')
  document.querySelector('.partner a').textContent = 'Contact'
  const read = { ...lrRead('lr-now.html'), residue: readResidueInPage({ origin: ORIGIN }, document) }
  assert.deepEqual(residueOf([read], { baseline, briefText: LR_BRIEF }).items, [])
  // 🔒 No filler on a demo (product owner, 27/10/2026): "Chef's selection" and "Coming soon" are filler, never a
  // stand-in, so the sweep empties them (a dish's name takes its neutral item name).
  const [one, two] = [...document.querySelectorAll('.dish-name')].filter(
    (x) => x.firstChild.nodeValue === 'Menu item '
  )
  one.firstChild.nodeValue = 'Chef’s selection '
  two.firstChild.nodeValue = 'Coming soon '
  const filler = { ...lrRead('lr-now.html'), residue: readResidueInPage({ origin: ORIGIN }, document) }
  const items = residueOf([filler], { baseline, briefText: LR_BRIEF }).items
  assert.deepEqual(
    items.map((i) => [i.field, i.text.trim(), i.filler]),
    [
      ['dish-name', 'Chef’s selection', true],
      ['dish-name', 'Coming soon', true]
    ]
  )
})

test('the page read keeps a short filler line ("Chef’s selection" with no price beside it) as a unit; a short heading that is not filler stays out', () => {
  const { document } = parseHTML(
    '<html><body><main><div class="dish"><h4 class="dish-name">Chef’s selection Market price</h4></div>' +
      '<h4 class="dish-name">House favourite</h4><h3>Our rooms</h3></main></body></html>'
  )
  const units = readResidueInPage({ origin: ORIGIN, filler: FILLER_SOURCE }, document).units
  assert.deepEqual(
    units.map((u) => [u.kind, u.text]),
    [
      ['text', 'Chef’s selection Market price'],
      ['text', 'House favourite']
    ]
  )
})

test('no ledger, no residue: nothing is known, so nothing is planned', () => {
  assert.equal(residueOf([lrRead('lr-now.html')], { baseline: { texts: [] } }), null)
})

/** lr-now as `readDemoPage` hands it over, with a changed DOM and the page's text. */
function nowWith(change = () => {}) {
  const { document } = parseHTML(
    readFileSync(new URL('./fixtures/residue/lr-now.html', import.meta.url), 'utf8')
  )
  document.body.normalize()
  change(document)
  return {
    ...lrRead('lr-now.html'),
    text: document.body.textContent,
    residue: readResidueInPage({ origin: ORIGIN }, document)
  }
}

test('a template price stays residue when the brief holds its number only as an address, not as a price', () => {
  const briefText = `${LR_BRIEF}\n{"address":"147 Main Street, Copenhagen"}`
  const reads = [nowWith()]
  const residue = residueOf(reads, { baseline, briefText })
  assert.ok(residue.items.some((i) => i.field === 'dish-price' && i.text === '$147'))
  assert.equal(checkFactsFromBrief(reads, { briefText, residue }).pass, false)
  // A price fact of the brief sources it: a menu item's price, a price range, money in the research's text.
  for (const held of [
    '{"menuItems":[{"name":"Smoked Venison","price":"147"}]}',
    '"Venison": "$147" — menu page'
  ])
    assert.ok(
      !residueOf(reads, { baseline, briefText: `${LR_BRIEF}\n${held}` }).items.some((i) => i.text === '$147'),
      held
    )
  assert.deepEqual([...briefPricesOf('147 Main Street, open since 2013, phone 33 12 34 56')], [])
  assert.deepEqual(
    [...briefPricesOf('"priceRange":{"startPrice":{"currencyCode":"DKK","units":"100"}}, brunch $12')].sort(),
    ['100', '12']
  )
})

test("a template dish price stays residue when the brief holds its number only as a bound of the place's price range", () => {
  // The Willow Nook build 8c (25/10/2026): Google's priceRange "33–350 kr" sourced the template's "$33", so the
  // sweep left "Coming soon $33" in two home menu tabs while every other price said "Market price".
  const reads = [nowWith()]
  for (const range of [
    '{"priceRange": "147–350 kr"}',
    '{"priceRange":{"startPrice":{"currencyCode":"DKK","units":"147"}}}'
  ])
    assert.ok(
      residueOf(reads, { baseline, briefText: `${LR_BRIEF}\n${range}` }).items.some(
        (i) => i.field === 'dish-price' && i.text === '$147'
      ),
      range
    )
  // The range still states its prices for what the agent writes ("Prices from 147 kr").
  assert.deepEqual([...briefPricesOf('{"priceRange": "147–350 kr"}')].sort(), ['147', '350'])
  assert.deepEqual([...briefPricesOf('{"priceRange": "147–350 kr"} brunch $12', { ranges: false })], ['12'])
})

test('a dish name the agent wrote is never residue, even when it does not word-match the brief ("Espresso tonic" for "Espresso")', () => {
  const reads = [
    nowWith((d) => {
      d.querySelectorAll('.dish-name')[3].firstChild.nodeValue = 'Espresso tonic '
    })
  ]
  const residue = residueOf(reads, { baseline, briefText: `${LR_BRIEF} Espresso` })
  assert.ok(!residue.items.some((i) => /Espresso/.test(i.text)))
  assert.ok(!residue.items.some((i) => i.text === 'Smoked Venison'))
  assert.ok(residue.items.some((i) => i.text === 'Crisped Duck'))
})

test('a template price fails facts-from-brief as residue the sweep clears, and a post date is no phone number', () => {
  const reads = [nowWith()]
  const residue = residueOf(reads, { baseline, briefText: LR_BRIEF })
  const facts = checkFactsFromBrief(reads, { briefText: LR_BRIEF, residue })
  assert.equal(facts.pass, false)
  assert.deepEqual(
    facts.detail.map((f) => f.shown),
    ['$147', '$156']
  )
  assert.equal(facts.sweepable, true)
  assert.ok(!factsIn('Posted 10.09.2021, updated 24.10.2026').some((f) => f.kind === 'phone'))
  // A price the agent invented is no residue: the check fails, and the sweep is not the answer.
  const invented = [nowWith((d) => (d.querySelectorAll('.dish-price')[0].textContent = '$9'))]
  const asked = { briefText: LR_BRIEF, residue: residueOf(invented, { baseline, briefText: LR_BRIEF }) }
  assert.equal(checkFactsFromBrief(invented, asked).sweepable, undefined)
})

test('a date on a single post page, under a title with no link, is a template date with no post link of its own', () => {
  const html = `<html><body><article class="post-11 post"><h1 class="entry-title">Three Broomsticks's autumn menu unveiled</h1>
<div class="entry-meta"><time datetime="2021-09-10T01:36:00+00:00">10.09.2021</time></div><p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p></article></body></html>`
  const read = (h) => {
    const { document } = parseHTML(h)
    return {
      path: '/three-broomsticks-s-autumn-menu-unveiled/',
      url: `${ORIGIN}/three-broomsticks-s-autumn-menu-unveiled/`,
      status: 200,
      blocks: [],
      ctas: [],
      residue: readResidueInPage({ origin: ORIGIN }, document)
    }
  }
  const single = baselineOf([read(html)])
  const items = residueOf([read(html)], { baseline: single, briefText: LR_BRIEF }).items
  const date = items.find((i) => i.text === '10.09.2021')
  assert.equal(date.field, 'date')
  assert.equal(date.post, undefined)
  assert.equal(date.page, '/three-broomsticks-s-autumn-menu-unveiled/')
})

test('a price field states as prices only the amounts it marks as money, never a quantity beside them', () => {
  assert.deepEqual([...briefPricesOf('{"price":"2 for 147 USD"}')], ['147'])
  assert.deepEqual([...briefPricesOf('{"price":"2 PCS for 9"}')], [])
  assert.deepEqual(
    [...briefPricesOf('{"price":"45"} {"price":12} {"priceRange":"€10–20"} {"price":"95 kr"}')].sort(),
    ['10', '12', '20', '45', '95']
  )
  // The template's $156 stays residue when the research's 156 is a weight, not the price.
  const briefText = `${LR_BRIEF}\n{"menuItems":[{"name":"Steak","price":"156 g for 99 DKK"}]}`
  const reads = [nowWith()]
  const residue = residueOf(reads, { baseline, briefText })
  assert.ok(residue.items.some((i) => i.field === 'dish-price' && i.text === '$156'))
  assert.equal(checkFactsFromBrief(reads, { briefText, residue }).pass, false)
})

// ── lrsweep rig, 24/10/2026: what a real template left after the sweep ──────────────────────────────

/** A page read of one body, as `readDemoPage` would hand it to the judge. */
function pageRead(path, body) {
  const { document } = parseHTML(`<!doctype html><html><body>${body}</body></html>`)
  document.body.normalize()
  return {
    path,
    url: `${ORIGIN}${path}`,
    status: 200,
    navLinks: [],
    blocks: [],
    ctas: [],
    residue: readResidueInPage({ origin: ORIGIN }, document)
  }
}

const dish = (name, price) =>
  `<div class="dish-item"><h4 class="dish-name">${name} <span class="dish-price">${price}</span></h4>` +
  '<p class="dish-description">w/ pickled ginger, chili</p></div>'
const LONG =
  'Nam quam nunc, blandit vel, luctus pulvinar, hendrerit id, lorem. Maecenas nec odio et ante tincidunt tempus. ' +
  'Donec vitae sapien ut libero venenatis faucibus. Nullam quis ante. Etiam sit amet orci eget eros faucibus ' +
  'tincidunt. Duis leo. Sed fringilla mauris sit amet nibh. Donec sodales sagittis magna.'
const RIG_HOME =
  dish('Baked Squid', '$56') +
  dish('Baked Squid', '$56') +
  dish('Crisped Duck', '$33') +
  '<h2>Menu changes frequently, here is a sample of what may be available.</h2>' +
  '<div class="num-phone"><h3>413-305-7497</h3></div>' +
  '<dl><dt>Phone</dt><dd>(084) 555-0110</dd></dl>' +
  `<p>${LONG}</p>` +
  '<p><a href="/post-a/">Read More<span class="screen-reader-text">: Cocktail Bar Alchemist opens</span></a></p>' +
  '<ul><li><a href="/post-a/">Cocktail Bar Alchemist set to open at MediaCity</a></li></ul>' +
  '<p><a class="btn" href="/post-a/">Read more</a></p><p><a class="btn" href="/post-b/">Read more</a></p>'
const squashed = (t) => String(t).toLowerCase().replace(/\s+/g, ' ').trim()
const rigBaseline = baselineOf([pageRead('/', RIG_HOME)])
const rigItems = residueOf([pageRead('/', RIG_HOME)], { baseline: rigBaseline }).items
const rigItem = (text) => rigItems.filter((i) => i.text === text)

test('one template dish shown twice takes one neutral name: its places share their number', () => {
  const squid = rigItem('Baked Squid')
  assert.equal(squid.length, 2)
  assert.equal(new Set(squid.map((i) => i.n)).size, 1)
  assert.notEqual(rigItem('Crisped Duck')[0].n, squid[0].n)
  assert.ok(rigItem('$56').every((i) => i.field === 'dish-price'))
})

test("a generic heading is the page's frame; a phone shown as a heading or a short line is a fact", () => {
  assert.equal(rigItem('Menu changes frequently, here is a sample of what may be available.').length, 0)
  assert.equal(namesSomething('Menu changes frequently, here is a sample'), false)
  assert.equal(namesSomething('413-305-7497'), true)
  assert.equal(rigItem('413-305-7497').length, 1)
  assert.equal(rigItem('(084) 555-0110').length, 1)
})

test("a heading that repeats a template post's title is a passage the sweep plans, never the page's frame", () => {
  // ja-diner's About, as the rig read it: the heading split over spans, its block the whole sentence.
  const about =
    '<h2><span>Efforts to curb</span> <span>soda consumption</span> <span>bring results on both coasts</span></h2>' +
    '<h2>We take <span>reservations</span> for lunch and dinner efforts to curb soda consumption</h2>' +
    '<h2>Menu changes frequently, here is a sample of what may be available.</h2>'
  const reads = [pageRead('/about-us/', about)]
  const titles = ['Efforts to curb soda consumption bring results on both coasts']
  const asked = { baseline: baselineOf(reads), templateTitles: titles }
  const residue = residueOf(reads, asked)
  const shown = residue.items.map((i) => squashed(i.passage ?? i.text))
  assert.ok(shown.some((t) => t.includes('efforts to curb')))
  assert.ok(shown.some((t) => t.startsWith('we take')))
  assert.ok(residue.frame.some((f) => f.includes('menu changes frequently')))
  assert.ok(!residue.frame.some((f) => f.includes('curb soda')))
  // Without the titles both read as the frame: what the rig measured.
  assert.equal(residueOf(reads, { baseline: asked.baseline }).frame.length, 3)
  assert.equal(checkNoDemoWords(reads, { baseline: asked.baseline, residue }).pass, false)
  assert.equal(holdsTitle('Our story', titles), false)
  assert.equal(holdsTitle('Curb soda consumption bring', titles), true)
})

test('a heading labelling one of the template\'s demo blocks ("HAPPY HOURS STYLE 1") names the template', () => {
  assert.equal(namesSomething('HAPPY HOURS STYLE 1'), true)
  assert.equal(namesSomething('Pricing Layout 2'), true)
  assert.equal(namesSomething('Our Style'), false)
  assert.equal(namesSomething('Happy Hours'), false)
})

test("a short heading holding a name the template's sentences use names it; a Title Case label does not", () => {
  const names = templateNamesOf([
    'The Three Broomsticks is a café & restaurant nestled in the beautiful and quaint Hogsmeade Village.',
    'Discover Our Menu'
  ])
  assert.deepEqual(names, ['three broomsticks', 'hogsmeade village'])
  assert.equal(namesSomething('Meet Three Broomsticks.', names), true)
  assert.equal(namesSomething('Discover Our Menu', names), false)
  assert.equal(namesSomething('Meet Three Broomsticks.'), false)
})

test("a heading under four words naming the template's business is residue the sweep plans, with the name it holds", () => {
  // The Willow Nook build 13 (25/10/2026): About's `h5` "Meet Three BroomSticks" is three words, so the page read
  // never kept it and no check or sweep saw the template's name; "Our rooms" names nothing and stays out.
  const html =
    '<html><body><main><p>The Three Broomsticks is a café nestled in the beautiful and quaint Hogsmeade Village.</p>' +
    '<div class="title-small"><h5 class="wp-block-heading jd-f-small">Meet Three BroomSticks</h5></div>' +
    '<h3>Our rooms</h3></main></body></html>'
  const read = (markup) => {
    const { document } = parseHTML(markup)
    return {
      path: '/about-us/',
      url: `${ORIGIN}/about-us/`,
      status: 200,
      navLinks: [],
      blocks: [],
      ctas: [],
      residue: readResidueInPage({ origin: ORIGIN }, document)
    }
  }
  const before = read(html)
  assert.deepEqual(
    before.residue.units.filter((u) => u.short).map((u) => u.text),
    ['Meet Three BroomSticks']
  )
  const now = read(
    html.replace(/<p>.*?<\/p>/, '<p>The Willow Nook is a café and cocktail bar in Copenhagen.</p>')
  )
  const residue = residueOf([now], { baseline: baselineOf([before]), briefText: LR_BRIEF })
  const label = residue.items.find((i) => i.text === 'Meet Three BroomSticks')
  assert.equal(label?.field, 'text')
  assert.equal(label?.templateName, 'three broomsticks')
  assert.equal(
    residue.items.some((i) => i.text === 'Our rooms'),
    false
  )
  // no-demo-words counts it: the check says what the page shows.
  const words = checkNoDemoWords([now], { baseline: baselineOf([before]), briefText: LR_BRIEF, residue })
  assert.ok(words.detail.some((d) => d.words === 'meet three broomsticks' && d.sweep === true))
})

test("a passage longer than 200 characters is still known as the template's", () => {
  assert.ok(LONG.length > 200)
  assert.equal(rigItem(LONG).length, 1)
})

test('"Read More" with words for a screen reader is a label; a list link of a post is its title', () => {
  assert.ok(!rigItems.some((i) => /^Read More/i.test(i.text ?? '')))
  const [title] = rigItem('Cocktail Bar Alchemist set to open at MediaCity')
  assert.equal(title.field, 'title')
  assert.equal(title.post, '/post-a/')
  assert.equal(postPathOf([pageRead('/', RIG_HOME)], ORIGIN), '/post-a/')
})

test('buttons sharing their words each keep the post they led to', () => {
  assert.equal(rigItems.filter((i) => i.field === 'link').length, 0)
})

test('a web address shown as a link is a fact, never a title, even once it leads to the page it sits on', () => {
  const before = pageRead(
    '/contact-us/',
    '<dl><dt>Website</dt><dd><span class="contact-webpage"><a href="http://vendor.example">http://vendor.example</a></span></dd></dl>'
  )
  const after = pageRead(
    '/contact-us/',
    '<dl><dt>Website</dt><dd><span class="contact-webpage"><a href="/contact-us/">http://vendor.example</a></span></dd></dl>'
  )
  const items = residueOf([after], { baseline: baselineOf([before]) }).items
  const site = items.filter((i) => i.text === 'http://vendor.example')
  assert.equal(site.length, 1)
  assert.equal(site[0].field, 'text')
  assert.equal(site[0].post, undefined)
})

const leadsIn = (lang, html) =>
  readResidueInPage(
    { origin: ORIGIN },
    parseHTML(`<html lang="${lang}"><body><article class="page"><h1>News</h1>${html}</article></body></html>`)
      .document
  )
    .units.filter((u) => u.lead)
    .map((u) => u.text)

// 🔒 A post's metadata is never a lead in the page's own language (product owner, 24/10/2026): month and weekday
// names come from `Intl` for the page's `<html lang>`, so no language is listed by hand, and a byline or a count
// known by its markup is one in any language.
for (const [lang, meta, leads] of [
  [
    'de-DE',
    [
      'Freitag, 24. Oktober 2026',
      '24. Okt. 2026',
      '24.10.2026',
      'Veröffentlicht am 24. Oktober 2026',
      'Von Anna Holm',
      '3 Kommentare',
      '3 Kommentare bisher',
      '<span class="author vcard">Anna Holm</span>',
      '<span class="posted-on">Gestern Abend</span>',
      '<time datetime="2026-10-24">Gestern Abend</time>'
    ],
    ['Seit 1998 in Hamburg', 'Frische Pasta und Wein am Hafen', 'Jeden Freitag ab 19 Uhr Livemusik im Garten']
  ],
  [
    'vi',
    [
      'Thứ Sáu, 24 tháng 10, 2026',
      '24 tháng 10, 2026',
      '24/10/2026',
      'Đăng bởi Admin',
      'Bởi Anna Holm',
      '3 bình luận',
      '<span itemprop="datePublished">Hôm qua</span>',
      '<span class="byline">Anna Holm</span>'
    ],
    [
      'Cà phê ngon giữa lòng Hà Nội',
      'Từ năm 1998',
      'Mở cửa thứ Sáu, 24 tháng 10, 2026 với thực đơn mới của bếp trưởng'
    ]
  ],
  [
    'fr',
    [
      'vendredi 24 octobre 2026',
      '24 oct. 2026',
      'Publié le 24 octobre 2026',
      'Par Marie Dupont',
      '3 commentaires',
      '<a rel="author" href="/auteur/marie/">Marie Dupont</a>',
      '12 · 3'
    ],
    ['Cuisine du marché au cœur de Lyon', 'Depuis 1998, Lyon', 'Par ici la bonne cuisine de saison']
  ],
  // Any language `Intl` knows, not only the interface's: a Polish date is one too.
  ['pl', ['piątek, 24 października 2026'], ['Kuchnia domowa w sercu Krakowa']]
]) {
  test(`a ${lang} page: its dates, bylines and counts are no lead; its own short line is`, () => {
    for (const line of meta) assert.deepEqual(leadsIn(lang, `<p>${line}</p>`), [], line)
    for (const line of leads) assert.deepEqual(leadsIn(lang, `<p>${line}</p>`), [line], line)
  })
}

// 🔒 A LONG PASSAGE IS READ WHOLE (25/10/2026): a read that kept a text's first 500 characters left the rest of a
// long template paragraph as sample text after the sweep had replaced its head.
test('the residue read keeps a long paragraph whole, up to the replace job value limit', () => {
  const long = `${'Through weakness of will, which is the same as saying through shrinking from toil. '.repeat(15)}The end.`
  assert.ok(long.length > 1200)
  const { document } = parseHTML(`<html><body><main><h1>About</h1><p>${long}</p></main></body></html>`)
  const { units } = readResidueInPage({ origin: ORIGIN }, document)
  const unit = units.find((u) => u.kind === 'text' && u.text.startsWith('Through weakness'))
  assert.equal(unit.text, long.trim())
})

test('"View full menu" goes to the site\'s menu page when it has one, else where the template\'s button led (JA Diner: /reservation)', () => {
  // JA Diner on WordPress ships no menu page: its menu is the home page's section, and its "View full menu" led to
  // /reservation (The Willow Nook, 25/10/2026: /menu was a 404).
  const ledger = {
    units: [],
    links: [{ page: '/', button: true, off: false, text: 'View full menu', href: '/reservation/' }]
  }
  const read = (navLinks) => ({
    path: '/',
    url: `${ORIGIN}/`,
    navLinks,
    residue: {
      units: [],
      links: [{ href: '/about-us', text: 'View full menu', button: true, selector: 'a.btn' }]
    }
  })
  const to = (navLinks) =>
    residueOf([read(navLinks)], { baseline: { ledger, texts: [] }, briefText: '' }).items.map((i) => i.to)
  assert.deepEqual(to(['/about-us/', '/reservation/', '/food-menu/']), ['/food-menu'])
  assert.deepEqual(to(['/about-us/', '/reservation/']), ['/reservation'])
})

test('"View full menu" goes to the block that shows the menu, by its anchor, on the page holding the most dishes', () => {
  // JA Diner on WordPress: the menu is the home page's tabs block; every "View full menu" (the hero's and the tabs')
  // led to /reservation, /about-us or /contact-us (Hano, 25/10/2026: the button goes to the wrong place).
  const ledger = {
    units: [],
    links: [{ page: '/', button: true, off: false, text: 'View full menu', href: '/reservation/' }]
  }
  const home = (href, menu) => ({
    path: '/',
    url: `${ORIGIN}/`,
    navLinks: ['/about-us/', '/reservation/', '/food-menu/'],
    residue: { units: [], links: [{ href, text: 'View full menu', button: true, selector: 'a.btn' }], menu }
  })
  const other = (path, dishes) => ({
    path,
    url: `${ORIGIN}${path}`,
    navLinks: [],
    residue: { units: [], links: [], ...(dishes ? { menu: { anchor: null, dishes } } : {}) }
  })
  const to = (reads) =>
    residueOf(reads, { baseline: { ledger, texts: [] }, briefText: '' }).items.map((i) => i.to)
  const tabs = { anchor: 'acm-container-tabs-97', dishes: 24 }
  // The page with the dishes wins over a page only named "menu".
  assert.deepEqual(to([home('/reservation/', tabs), other('/food-menu/', 0)]), ['/#acm-container-tabs-97'])
  // A page that shows more of them wins; one with no anchor is the page itself.
  assert.deepEqual(to([home('/reservation/', tabs), other('/food-menu/', 40)]), ['/food-menu'])
  // Already there: nothing to do.
  assert.deepEqual(to([home('/#acm-container-tabs-97', tabs)]), [])
  // Two dishes are no menu: the page named "menu", else the template's target, as before.
  assert.deepEqual(to([home('/about-us', { anchor: 'x', dishes: 2 })]), ['/food-menu'])
})

test("the in-page reader names the block holding most of the page's dishes", () => {
  const dish = (n) =>
    `<div class="dish-item"><h4 class="dish-name">Dish ${n}</h4><p class="dish-description">Coming soon</p></div>`
  const html = `<html><body><main>
    <section id="intro"><p>Welcome to the café, where the coffee is strong and the sofas are deep.</p></section>
    <div id="acm-container-tabs-97"><div id="acm-menu-100" class="jd-tab-panel">${dish(1)}${dish(2)}</div>
      <div id="acm-menu-101" class="jd-tab-panel">${dish(3)}${dish(4)}</div></div></main></body></html>`
  const { document } = parseHTML(html)
  assert.deepEqual(readResidueInPage({}, document).menu, { anchor: 'acm-container-tabs-97', dishes: 4 })
  const { document: none } = parseHTML(
    '<html><body><p>No menu here at all, just a few words.</p></body></html>'
  )
  assert.equal(readResidueInPage({}, none).menu, undefined)
})
