import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { HEAD_DEFAULT_CHARS, headAnswer, headHits, jsonLdNodes, readHead } from '../src/host/page-head.mjs'

// 🔒 WHAT A CRAWLER READS, ON THE THREE BENCH SITES' OWN MARKUP (suite v6 #3). The fixtures are cut
// from benchwp02, benchjoomla02 and benchemdash02 with a read-only curl on 28/09/2026 — each keeps
// its CMS's own head tags verbatim — so these answers are what `page.text {head:true}` gives an SEO
// agent on the stand, and every value below is one the page itself prints.
const HEAD = path.join(import.meta.dirname, 'fixtures', 'pages', 'head')
const fixture = (/** @type {string} */ name) => readFileSync(path.join(HEAD, name), 'utf8')
const PAGES = path.join(import.meta.dirname, 'fixtures', 'pages')

/** The whole answer `pageAnswer` would send for one page: its base fields and the head's. */
const answerOf = (
  /** @type {string} */ html,
  /** @type {string} */ url,
  cap = HEAD_DEFAULT_CHARS,
  match = null
) => {
  const base = { ok: true, url, path: new URL(url).pathname, lang: 'en', title: 'T' }
  const got = headAnswer(html, { cap, base, pageUrl: url, match })
  return { answer: { ...base, ...got.fields }, got }
}

test('WordPress (benchwp02 "/"): the tags a block theme prints, its mega menu headings filed under header', () => {
  const { answer, got } = answerOf(fixture('wp-home.html'), 'http://benchwp02.tracy.test:51710/')
  assert.equal(
    answer.description,
    null,
    'WordPress core prints no meta description: said as null, never guessed'
  )
  assert.equal(answer.robots, 'max-image-preview:large')
  assert.equal(answer.canonical, 'http://benchwp02.tracy.test:51710/')
  assert.equal(answer.og, null)
  assert.equal(answer.twitter, null)
  assert.deepEqual(answer.meta, {
    viewport: 'width=device-width, initial-scale=1',
    generator: 'WordPress 7.1.2'
  })
  // this site's own addresses as paths, pairs while they fit
  assert.equal(answer.hreflang, 'en / · ru /ru/ · de /de/ · af /af/')
  assert.deepEqual(answer.jsonLd, [])
  assert.deepEqual(answer.headings, [
    'header h3: News & updates',
    'header h4: Northgate wins the Zavolzhye 2 infrastructure tender',
    // a <br> parts the words, as a visitor reads them
    'main h1: Building the groundwork for next-generation plants',
    'main h2: Four core service lines',
    'main h3: Industrial park infrastructure',
    'main h3: M&E engineering',
    'main h2: Selected projects',
    'main h3: Elektra appliance plant, Lipetsk SEZ',
    'footer h3: Services',
    'footer h3: Company',
    'footer h3: Contact'
  ])
  // the two flags carry alt="" inside an aria-hidden span; the oracle counts them, and so does this
  assert.deepEqual(answer.images, { total: 4, missingAlt: [], emptyAlt: ['header us.png', 'header ru.png'] })
  assert.deepEqual(answer.lengths, { title: 37 })
  assert.equal(got.cut, false)
  assert.ok(JSON.stringify(answer).length <= HEAD_DEFAULT_CHARS)
})

test('Joomla (benchjoomla02 "/en/news"): JSON-LD out of a <script> body, x-default after the scripts, microdata not a tag', () => {
  const { answer } = answerOf(fixture('joomla-news.html'), 'http://benchjoomla02.tracy.test:51710/en/news')
  assert.equal(answer.description, null)
  assert.equal(answer.robots, null)
  assert.equal(answer.canonical, null)
  assert.equal(answer.hreflang, 'ru-ru /ru/news · en-gb /en/news · x-default /en/news')
  // the template prints a second viewport tag; the first is the one kept here
  assert.equal(/** @type {any} */ (answer.meta).viewport, 'width=device-width, initial-scale=1')
  assert.ok(!('position' in /** @type {any} */ (answer.meta)), 'an itemprop <meta> in the body is microdata')
  assert.deepEqual(answer.jsonLd, [
    {
      '@type': 'BreadcrumbList',
      '@id': 'http://benchjoomla02.tracy.test:51710/#/schema/BreadcrumbList/426',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          item: { '@id': 'http://benchjoomla02.tracy.test:51710/en/', name: 'Home' }
        },
        {
          '@type': 'ListItem',
          position: 2,
          item: { '@id': 'http://benchjoomla02.tracy.test:51710/en/news', name: 'News' }
        }
      ]
    }
  ])
  assert.deepEqual(answer.headings, [
    'nav h3: Marketing Kit',
    'nav h3: News & updates',
    'header h1: News & engineering notes',
    'body h2: Northgate Industrial wins the Zavolzhye 2 infrastructure tender',
    'body h3: Four common mistakes in heavy machine foundation design',
    'footer h3: Services',
    'footer h3: Company',
    'footer h3: Contact'
  ])
  assert.deepEqual(answer.images, { total: 1, missingAlt: [], emptyAlt: ['body en_gb.gif'] })
})

test('EmDash (benchemdash02 "/"): a repeated value is said once, a bare alt is an empty one', () => {
  const { answer } = answerOf(fixture('emdash-home.html'), 'http://benchemdash02.tracy.test:51710/')
  const description =
    'Design–build main contractor for industrial park infrastructure, factory buildings and engineering systems across 14 regions of Central and Volga Russia.'
  assert.equal(answer.description, description)
  assert.equal(answer.robots, 'index, follow')
  assert.equal(answer.canonical, 'http://benchemdash02.tracy.test:51710/')
  assert.deepEqual(answer.og, {
    title: 'Home',
    description: '(= description)',
    url: 'http://benchemdash02.tracy.test:51710/',
    image:
      'http://benchemdash02.tracy.test:51710/_emdash/api/media/file/01M3GF56T5K3S92ZRJFQKWZFPE.01M3GF56T7DEH9V3AAPYRVEB07.png',
    type: 'website',
    site_name: 'Northgate Industrial'
  })
  assert.deepEqual(answer.twitter, {
    title: '(= og:title)',
    description: '(= description)',
    image: '(= og:image)',
    card: 'summary_large_image'
  })
  assert.equal(answer.hreflang, 'en / · af /af · ru /ru · zh /zh · x-default /')
  assert.deepEqual(answer.jsonLd, [
    { '@type': 'WebSite', name: 'Northgate Industrial', url: 'http://benchemdash02.tracy.test:51710' }
  ])
  assert.deepEqual(answer.images, {
    total: 3,
    missingAlt: [],
    emptyAlt: [
      'main 01M3GF56T5K3S92ZRJFQKWZFPE.01M3GF56T7DEH9V3AAPYRVEB07.png',
      'main 01M3GF56SDTQNX44ASTS83651P.01M3GF56SF75906DY94DCJ24VW.png'
    ]
  })
  assert.deepEqual(answer.lengths, { title: 27, description: [...description].length })
})

test('only what the page carries: two descriptions are both said; one outside <head> counts only when <head> has none', () => {
  const two =
    '<html><head><title>A</title><meta name="description" content="one"><meta name="description" content="two"></head><body></body></html>'
  assert.deepEqual(answerOf(two, 'http://x.test/').answer.description, ['one', 'two'])
  const body =
    '<html><head><title>A</title></head><body><meta name="description" content="late"></body></html>'
  assert.equal(answerOf(body, 'http://x.test/').answer.description, 'late')
  const both =
    '<html><head><meta name="description" content="head"></head><body><meta name="description" content="body"></body></html>'
  assert.equal(answerOf(both, 'http://x.test/').answer.description, 'head')
  // an <svg><title> is not the page's title, and a heading's hidden twin is marked, not dropped
  const svg =
    '<html><head><title>Real</title></head><body><svg><title>Icon</title></svg><h1 class="screen-reader-text">Site</h1><h2>Shown</h2></body></html>'
  const facts = readHead(svg)
  assert.deepEqual(
    facts.titles.map((t) => t.text),
    ['Real']
  )
  assert.deepEqual(answerOf(svg, 'http://x.test/').answer.headings, [
    'body h1 (hidden): Site',
    'body h2: Shown'
  ])
})

test('pictures: aria-hidden and <noscript> copies are not counted; a missing alt and an empty one are told apart', () => {
  const html =
    '<html><body><main><img src="/a/hero.jpg"><img src="/a/deco.png" alt=""><img src="/a/team.jpg" alt="Team">' +
    '<img src="/a/icon.svg" aria-hidden="true"><noscript><img src="/a/lazy.jpg"></noscript>' +
    '<img data-src="/a/lazy-2.jpg"></main><footer><img src="/a/deco.png" alt=""><img src="/a/deco.png" alt=""></footer></body></html>'
  assert.deepEqual(answerOf(html, 'http://x.test/').answer.images, {
    total: 6,
    missingAlt: ['main hero.jpg', 'main lazy-2.jpg'],
    emptyAlt: ['main deco.png', 'footer deco.png ×2']
  })
})

test('JSON-LD: an @graph is its members, a broken block is said, CDATA wrappers are read through', () => {
  const html =
    '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[' +
    '{"@type":"Organization","name":"Northgate","telephone":"+7 800 550-67-89","address":{"@type":"PostalAddress","addressLocality":"Kaluga"}},' +
    '{"@type":"WebSite","name":"Northgate"}]}</script>' +
    '<script type="application/ld+json">{"@type": "Broken",</script>' +
    '<script type="application/ld+json">/*<![CDATA[*/{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Do you build?","acceptedAnswer":{"@type":"Answer","text":"Yes."}}]}/*]]>*/</script>' +
    '</head><body></body></html>'
  const ld = jsonLdNodes(readHead(html))
  assert.equal(ld.bad, 1)
  assert.deepEqual(
    ld.nodes.map((n) => n['@type']),
    ['Organization', 'WebSite', 'FAQPage']
  )
  const { answer } = answerOf(html, 'http://x.test/')
  assert.deepEqual(answer.jsonLd, [
    {
      '@type': 'Organization',
      name: 'Northgate',
      telephone: '+7 800 550-67-89',
      address: { '@type': 'PostalAddress', addressLocality: 'Kaluga' }
    },
    { '@type': 'WebSite', name: 'Northgate' },
    {
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Do you build?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } }
      ]
    },
    '1 block not valid JSON'
  ])
})

test('the budget: the long lists give way first, level by level; the description never does', () => {
  const html = fixture('wp-home.html')
  const url = 'http://benchwp02.tracy.test:51710/'
  const whole = JSON.stringify(answerOf(html, url, 8000).answer).length
  let before = Infinity
  for (const cap of [2000, 800, 600, 450]) {
    const { answer, got } = answerOf(html, url, cap)
    const size = JSON.stringify(answer).length
    assert.ok(size <= before, `a smaller budget never gives a larger answer (${cap}: ${size})`)
    assert.ok(size <= cap, `${cap}: ${size}`)
    before = size
    assert.equal(answer.robots, 'max-image-preview:large', 'the SEO fields stay whole')
    assert.equal(answer.canonical, url)
    assert.equal(got.cut, whole > cap, `${cap}: cut says whether anything was left out`)
  }
  // the tightest level still counts every heading by level
  const tight = answerOf(html, url, 100).answer
  assert.deepEqual(tight.headings, ['+11 more: h1 ×1, h2 ×2, h3 ×7, h4 ×1'])
  assert.match(String(tight.hreflang), /^4: /)
})

test('match with head: the tags and script lines that carry the words, head or body', () => {
  const html =
    '<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST12345"></script>' +
    '<script>gtag(\'config\', \'G-TEST12345\');</script><meta name="google-site-verification" content="abc"></head>' +
    '<body><p>No id here</p></body></html>'
  const hits = headHits(html, 'g-test12345', readHead(html).headEnd)
  assert.deepEqual(hits, [
    'head: <script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST12345">',
    `head: …om/gtag/js?id=G-TEST12345"></script><script>gtag('config', 'G-TEST12345');</script><meta name="google-site-verification" content="a…`
  ])
  const { answer } = answerOf(html, 'http://x.test/', HEAD_DEFAULT_CHARS, 'google-site-verification')
  assert.deepEqual(answer.found, ['head: <meta name="google-site-verification" content="abc">'])
  assert.deepEqual(answerOf(html, 'http://x.test/', HEAD_DEFAULT_CHARS, 'nowhere').answer.found, [])
})

test('🔒 one linear pass: markup that never closes costs a scan, not a square', () => {
  const t0 = Date.now()
  readHead(`<html><head>${'<a"'.repeat(200_000)}`)
  readHead(`<html><body>${'<h1>x'.repeat(100_000)}`)
  readHead(`<html><body><script type="application/ld+json">${'{'.repeat(300_000)}`)
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`)
})

test('the saved ja-business pages read whole: every heading and picture counted, JSON-LD parsed', () => {
  for (const name of ['wp-home.html', 'j-home.html', 'ed-home.html', 'wp-contact.html']) {
    const facts = readHead(readFileSync(path.join(PAGES, name), 'utf8'))
    assert.ok(facts.titles.length >= 1, `${name}: a title`)
    assert.ok(
      facts.headings.some((h) => h.level === 1),
      `${name}: an h1`
    )
    assert.equal(jsonLdNodes(facts).bad, 0, `${name}: every JSON-LD block parses`)
  }
})
