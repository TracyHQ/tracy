// post-content.test.mjs — what a seeded post carries besides its body: the date the source
// printed, the category its eyebrow named, the lead as its excerpt, and a body that does not
// repeat what the single template already prints (title, featured image, byline).
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDateText, articleHead, articleTail, sourceCards, sourceTocs, categoryLabel, scheduleDates, distinctDates, isFeatured, stripSourceBreadcrumb } from '../lib/post-content.mjs'

test('parseDateText: the date inside a byline, in the shapes a design export prints', () => {
  assert.equal(parseDateText('Head of Structures · 28 Jul 2026 · 7 min read'), '2026-07-28 00:00:00')
  assert.equal(parseDateText('12 Aug 2026 · Communications · 4 min read'), '2026-08-12 00:00:00')
  assert.equal(parseDateText('3 Jul 2026'), '2026-07-03 00:00:00')
  assert.equal(parseDateText('12 August 2026'), '2026-08-12 00:00:00')
  assert.equal(parseDateText('August 12, 2026'), '2026-08-12 00:00:00')
  assert.equal(parseDateText('Начальник отдела КЖ/КМ · 28.07.2026 · 7 мин чтения'), '2026-07-28 00:00:00')
  assert.equal(parseDateText('03.07.2026'), '2026-07-03 00:00:00')
  assert.equal(parseDateText('12 августа 2026'), '2026-08-12 00:00:00')
  assert.equal(parseDateText('2026-06-19'), '2026-06-19 00:00:00')
  assert.equal(parseDateText('7 min read'), null)
  assert.equal(parseDateText('Established 2004'), null, 'a bare year is not a date')
  assert.equal(parseDateText(null), null)
})

test('scheduleDates: undated posts step back one day from the earliest dated one, in source order', () => {
  const dates = scheduleDates([
    { date: '2026-08-12 00:00:00' },
    { date: null },
    { date: '2026-07-03 00:00:00' },
    { date: null }
  ])
  assert.deepEqual(dates, ['2026-08-12 00:00:00', '2026-07-02 00:00:00', '2026-07-03 00:00:00', '2026-07-01 00:00:00'])
  assert.deepEqual(scheduleDates([{ date: null }, { date: null }]), [null, null], 'no anchor: nothing is invented')
})

test('distinctDates: posts sharing a date get one second each, first in source order the latest, same day, deterministic', () => {
  const input = ['2021-09-14 00:00:00', '2021-09-14 00:00:00', '2026-01-02 10:00:00', '2021-09-14 00:00:00', null]
  const { dates, tied } = distinctDates(input)
  assert.deepEqual(dates, ['2021-09-14 00:00:02', '2021-09-14 00:00:01', '2026-01-02 10:00:00', '2021-09-14 00:00:00', null])
  assert.equal(tied, 3)
  // a date-sorted listing (newest first) now reads in source order
  const order = [0, 1, 3].sort((a, b) => (dates[a] < dates[b] ? 1 : -1))
  assert.deepEqual(order, [0, 1, 3])
  assert.deepEqual(distinctDates(input), { dates, tied }, 'a second run computes the same dates')
  assert.equal(new Set(dates.filter(Boolean)).size, 4, 'no two dated posts share a date')
  // 51 posts at midnight — the Tracy Base wp7 shape — all distinct, all on the same calendar day
  const many = distinctDates(Array(51).fill('2021-09-14 00:00:00')).dates
  assert.equal(new Set(many).size, 51)
  assert.ok(many.every((d) => d.startsWith('2021-09-14 ')))
  assert.equal(many[0], '2021-09-14 00:00:50')
  // a group that would cross midnight counts back from the date instead
  const late = distinctDates(['2021-09-14 23:59:59', '2021-09-14 23:59:59']).dates
  assert.deepEqual(late, ['2021-09-14 23:59:59', '2021-09-14 23:59:58'])
  assert.deepEqual(distinctDates([null, null]), { dates: [null, null], tied: 0 }, 'nothing is invented')
})

test('categoryLabel: the eyebrow of a card or an article, without its "Featured" prefix', () => {
  assert.equal(categoryLabel('Engineering'), 'Engineering')
  assert.equal(categoryLabel('Featured · Disclosure'), 'Disclosure')
  assert.equal(categoryLabel('FEATURED · DISCLOSURE'), 'DISCLOSURE')
  assert.equal(categoryLabel('Главное · Раскрытие'), 'Раскрытие')
  assert.equal(categoryLabel(''), null)
  assert.equal(categoryLabel('28 Jul 2026'), null, 'a date is not a category')
})

const html = (s) => `<!-- wp:html -->\n${s}\n<!-- /wp:html -->`
const article = [
  html('<div style="text-transform: uppercase; color: rgb(218, 90, 42);"><span class="sc-interp">Engineering</span></div>'),
  '<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading"><span class="sc-interp">Four common mistakes</span></h1>\n<!-- /wp:heading -->',
  '<!-- wp:paragraph -->\n<p><span class="sc-interp">Get one dynamic load parameter wrong and the line vibrates.</span></p>\n<!-- /wp:paragraph -->',
  html(
    '<div style="display: flex;"><div style="border-radius: 50%;"></div><div><div>Sergey Trofimov</div><div>Head of Structures · 28 Jul 2026 · 7 min read</div></div><div><a href="#">in</a><a href="#">f</a><a href="#">⧉</a></div></div>'
  ),
  html('<div style="height: 420px;">\n  <img src="/wp-content/uploads/art-hero-2.png" alt="Article photo" data-image-slot="rect">\n</div>'),
  html('<div style="font-size: 13px;"><span class="sc-interp">Foundation works for a 1,600-tonne press.</span></div>'),
  html('<div style="max-width: 44em;"><p>A heavy machine foundation is not simply a bigger block of concrete.</p><h2 id="a">1. Taking loads from the catalogue</h2></div>'),
  html('<div><span>Tags:</span> <a href="#">machine foundations</a></div>')
].join('\n')

test('articleHead: eyebrow, h1, byline and featured image leave the body; the lead stays as the intro', () => {
  const out = articleHead({
    content: article,
    title: 'Four common mistakes',
    featuredImage: '/wp-content/uploads/art-hero-2.png',
    dateText: 'Head of Structures · 28 Jul 2026 · 7 min read'
  })
  assert.equal(out.eyebrow, 'Engineering')
  assert.equal(out.lead, 'Get one dynamic load parameter wrong and the line vibrates.')
  assert.deepEqual(out.removed, ['eyebrow', 'title', 'lead', 'byline', 'featured-image'])
  assert.doesNotMatch(out.content, /<h1/, 'the template prints the title')
  assert.doesNotMatch(out.content, /art-hero-2/, 'the template prints the featured image')
  assert.doesNotMatch(out.content, /7 min read|Sergey/, 'the byline is the template\'s date and author')
  assert.deepEqual(out.author, { name: 'Sergey Trofimov', role: 'Head of Structures' }, 'the byline names the author: the template prints post_author')
  assert.doesNotMatch(out.content, /Get one dynamic load/, 'the lead is the excerpt; the template prints it as the lede')
  assert.match(out.content, /^<!-- wp:html -->\n<div[^>]*><span class="sc-interp">Foundation works for a 1,600-tonne press\./, 'the caption is first: it sits under the featured image')
  assert.match(out.content, /bigger block of concrete/, 'the body is untouched')
  assert.match(out.content, /Tags:/)
})

test('articleHead: a byline with a role and date but no name gives the role alone; a bare date gives nothing', () => {
  const byline = (t) => `<!-- wp:heading {"level":1} -->\n<h1>T</h1>\n<!-- /wp:heading -->\n<!-- wp:html -->\n<div><div>${t}</div></div>\n<!-- /wp:html -->\n<!-- wp:paragraph -->\n<p>Body of the post here.</p>\n<!-- /wp:paragraph -->`
  const ru = articleHead({ content: byline('Начальник отдела КЖ/КМ · 28.07.2026 · 7 мин чтения'), title: 'T', dateText: 'Начальник отдела КЖ/КМ · 28.07.2026 · 7 мин чтения' })
  assert.deepEqual(ru.author, { name: null, role: 'Начальник отдела КЖ/КМ' })
  assert.equal(articleHead({ content: byline('28 Jul 2026 · 4 min read'), title: 'T', dateText: '28 Jul 2026 · 4 min read' }).author, null)
  assert.equal(articleHead({ content: byline('x'), title: 'T', dateText: null }).author, null)
})

test('articleHead: without a title or featured image nothing of theirs is stripped; the byline needs its date', () => {
  const out = articleHead({ content: article, title: 'Another title', featuredImage: null, dateText: null })
  assert.match(out.content, /<h1/)
  assert.match(out.content, /art-hero-2/)
  assert.match(out.content, /7 min read/)
  assert.deepEqual(out.removed, ['eyebrow', 'lead'], 'an eyebrow is a header: the lead leaves with it')
  assert.equal(out.lead, 'Get one dynamic load parameter wrong and the line vibrates.')
})

test('articleHead: a card post (one paragraph) keeps it as the lead; an empty post is untouched', () => {
  const card = '<!-- wp:paragraph -->\n<p>How the safety team held site discipline.</p>\n<!-- /wp:paragraph -->'
  const out = articleHead({ content: card, title: '500,000 work hours', featuredImage: '/wp-content/uploads/safety-2.png', dropLead: true })
  assert.equal(out.lead, 'How the safety team held site discipline.')
  assert.equal(out.content, '', 'a card stub: the card text is the excerpt; the body has nothing else')
  assert.deepEqual(out.removed, ['lead'])
  // A CMS article that is only paragraphs keeps its first one: no header around it, nothing dropped.
  const prose = articleHead({ content: card, title: '500,000 work hours' })
  assert.equal(prose.lead, 'How the safety team held site discipline.')
  assert.equal(prose.content, card)
  assert.deepEqual(prose.removed, [])
  assert.equal(articleHead({ content: '', title: 'x' }).content, '')
  assert.equal(articleHead({ content: '', title: 'x' }).lead, null)
})

test('articleHead: the scan stops at the first body block — a later short html block is not an eyebrow', () => {
  const content = [
    '<!-- wp:paragraph -->\n<p>Lead paragraph of the post.</p>\n<!-- /wp:paragraph -->',
    html('<div><p>Long body paragraph that goes on for a while and is clearly the article itself.</p></div>'),
    html('<div>Note</div>')
  ].join('\n')
  const out = articleHead({ content, title: 'T' })
  assert.equal(out.eyebrow, null)
  assert.match(out.content, /<div>Note<\/div>/)
})

test('sourceCards: the listing cards of the spec sections by title — eyebrow, excerpt, date text', () => {
  const sections = {
    custom: [
      {
        id: 'news-en-2',
        html: `<section><h1>News</h1><article><div><img src="/wp-content/uploads/blog-feat-2.png"></div><div><div><span>Featured · Disclosure</span></div><h2><a href="#">Northgate wins the tender</a></h2><p>The RUB 1.2bn package covers 62 ha.</p><div>12 Aug 2026 · Communications · 4 min read</div></div></article>
        <article><div><img src="/wp-content/uploads/blog-1.png"></div><div><span>Engineering</span></div><h3><a href="#">Four common mistakes</a></h3><p>Field notes from 12 plants.</p><div>28 Jul 2026</div></article>
        <article><h3>No eyebrow card</h3><p>Just text here.</p></article></section>`
      },
      { id: 'about-en-2', html: '<section><h2>About</h2><p>Nothing here</p></section>' }
    ]
  }
  const cards = sourceCards(sections)
  assert.deepEqual(cards.get('northgate wins the tender'), { eyebrow: 'Featured · Disclosure', text: 'The RUB 1.2bn package covers 62 ha.', dateText: '12 Aug 2026 · Communications · 4 min read' })
  // A home-page teaser of the same post, listed first, words the excerpt differently: the listing page's card wins the text.
  const teaser = { id: 'home-en-6', pages: [{ wpPath: '/' }], html: '<section><article><h3><a href="#">Four common mistakes</a></h3><p>Field notes, teaser wording.</p></article></section>' }
  const both = sourceCards({ custom: [teaser, { ...sections.custom[0], pages: [{ wpPath: '/news' }] }] }, { listingPaths: new Set(['/news']) })
  assert.equal(both.get('four common mistakes').text, 'Field notes from 12 plants.')
  assert.equal(sourceCards({ custom: [teaser, sections.custom[0]] }).get('four common mistakes').text, 'Field notes, teaser wording.', 'without listing paths, first wins')
  assert.deepEqual(cards.get('four common mistakes'), { eyebrow: 'Engineering', text: 'Field notes from 12 plants.', dateText: '28 Jul 2026' })
  assert.deepEqual(cards.get('no eyebrow card'), { eyebrow: null, text: 'Just text here.', dateText: null })
  assert.equal(cards.size, 3)
})

test('articleTail: the tags row becomes the post\'s tags; prev/next and related leave the body — the template prints them', () => {
  const content = [
    html('<div><p>Body paragraph that stays where it is.</p></div>'),
    html('<div><span>Tags:</span> <a href="#">machine foundations</a> <a href="#">structures</a> <a href="#">vibration</a></div>'),
    html('<div><a href="#"><div>← Previous</div><div>Choosing sandwich roof panels</div></a><a href="#"><div>Next →</div><div>Checking anchor bolts</div></a></div>'),
    html('<div><h2>Related articles</h2><div><article><h3><a href="#">Mass concrete pours</a></h3><div>9 May 2026</div></article><article><h3><a href="#">As-built documentation</a></h3><div>27 Apr 2026</div></article></div></div>')
  ].join('\n')
  const out = articleTail({ content })
  assert.deepEqual(out.tags, ['machine foundations', 'structures', 'vibration'])
  assert.deepEqual(out.removed, ['related', 'prev-next', 'tags'])
  assert.match(out.content, /Body paragraph that stays/)
  assert.doesNotMatch(out.content, /Tags:|Previous|Related articles|Mass concrete/)
  const ru = articleTail({ content: html('<div><span>Теги:</span> <a href="#">фундаменты</a></div>') })
  assert.deepEqual(ru.tags, ['фундаменты'])
  const none = articleTail({ content: html('<div><p>Just a body.</p></div>') })
  assert.deepEqual([none.tags, none.removed], [[], []])
  assert.match(none.content, /Just a body/)
})

test('isFeatured: a card whose eyebrow says Featured is the sticky post', () => {
  assert.equal(isFeatured('Featured · Disclosure'), true)
  assert.equal(isFeatured('Главное · Раскрытие'), true)
  assert.equal(isFeatured('Engineering'), false)
  assert.equal(isFeatured(null), false)
})

test('stripSourceBreadcrumb: a leading breadcrumb row leaves a page body; a lead paragraph or a heading first is untouched', () => {
  const crumb = '<!-- wp:html -->\n<div style="display: flex"><a href="#"><span>Home</span></a><span>/</span><span>Marketing Kit</span><span>/</span><span>Form</span></div>\n<!-- /wp:html -->'
  const body = '<!-- wp:heading {"level":1} -->\n<h1>Form library</h1>\n<!-- /wp:heading -->\n<!-- wp:paragraph -->\n<p>Fields and states.</p>\n<!-- /wp:paragraph -->'
  const out = stripSourceBreadcrumb(`${crumb}\n${body}`)
  assert.equal(out.removed, true)
  assert.equal(out.content, body)
  assert.deepEqual(stripSourceBreadcrumb(body), { content: body, removed: false })
  // A first html block that is not a crumb (no separators, or a heading in it) stays.
  const note = '<!-- wp:html -->\n<div><a href="#">Back to home</a></div>\n<!-- /wp:html -->'
  assert.equal(stripSourceBreadcrumb(`${note}\n${body}`).removed, false)
})

test('sourceTocs: the "In this article" box beside the article gives its short labels, by source file, in order', () => {
  const aside = (label, links) => `<aside><div><div><span>${label}</span></div><div>${links.map((l) => `<a href="#">${l}</a>`).join('')}</div></div><div><div>Downloads</div><a href="#">Report template <span>PDF</span></a></div></aside>`
  const sections = {
    custom: [
      { id: 'article-en-2', pages: [{ file: 'Article.html' }], html: `<div><h2>1. Taking dynamic loads</h2><p>…</p>${aside('In this article', ['Catalogue dynamic loads', 'Seasonal soil stiffness'])}</div>` },
      { id: 'article-ru-2', pages: [{ file: 'RU/Article_ru.html' }], html: `<div>${aside('В этой статье', ['Нагрузки из каталога', 'Промерзание и пучение'])}</div>` },
      { id: 'about-en-1', pages: [{ file: 'About.html' }], html: '<div><aside><div>Downloads</div><a href="#">x</a></aside></div>' },
      { id: 'news-en-2', pages: [{ file: 'News.html' }], html: '<div><aside><div>Categories</div><a href="#">Engineering</a></aside></div>' }
    ]
  }
  const tocs = sourceTocs(sections)
  assert.deepEqual([...tocs], [
    ['Article.html', ['Catalogue dynamic loads', 'Seasonal soil stiffness']],
    ['RU/Article_ru.html', ['Нагрузки из каталога', 'Промерзание и пучение']]
  ])
  assert.deepEqual([...sourceTocs({ custom: [] })], [])
})
