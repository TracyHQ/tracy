/**
 * The picker's two pure halves, against a stub DOM: which element a pointer means (`pickAt`), and
 * what the page may say about it (`describe`). Held by machine because both fail quietly — a wrong
 * hit-test still outlines SOMETHING, and a descriptor that leaks an input's value looks exactly like
 * one that does not.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { INSIDE_MAX, LIMITS } from '../protocol.mjs'
import { describe, levelElements, locate, pickAt, reboxed, unseen, widened } from '../src/pick.mjs'
import { doc, h } from './stub-dom.mjs'

/** A page shaped like a small CMS home: a nav, a hero with empty space, a 1px rule, an article. */
function home() {
  const span = h('span', { rect: [110, 20, 60, 16], text: 'Home' })
  const nav = h('nav', { rect: [0, 0, 1280, 56], cls: 'site-nav main' }, [
    h('ul', { rect: [100, 10, 400, 36] }, [
      h('li', { rect: [100, 10, 90, 36], cls: 'item-101 current' }, [
        h('a', { rect: [105, 15, 80, 26], attrs: { href: '/' } }, [span])
      ]),
      h('li', { rect: [220, 10, 90, 36], attrs: { 'data-id': '102' } }, [
        h('a', { rect: [225, 15, 80, 26] }, [h('span', { rect: [230, 20, 60, 16], text: 'Blog' })])
      ])
    ])
  ])
  const heading = h('h1', { rect: [100, 120, 600, 60], text: 'Welcome' })
  const hero = h('section', { rect: [0, 56, 1280, 500], id: 'hero', cls: 'hero' }, [heading])
  const rule = h('hr', { rect: [100, 600, 400, 1] })
  const img = h('img', {
    rect: [100, 700, 300, 200],
    currentSrc: 'https://site.example/a-800.jpg',
    src: 'https://site.example/a.jpg',
    alt: 'A lake'
  })
  const title = h(
    'h2',
    { rect: [100, 910, 500, 40], attrs: { 'data-tracy-src': 'post:12:lake field:title' } },
    ['  The   lake\n  ']
  )
  const article = h('article', { rect: [80, 680, 800, 400], attrs: { 'data-tracy-src': 'post:12:lake' } }, [
    h('template', { attrs: { 'data-tracy-owner': 'block:core/post-template' } }),
    img,
    title
  ])
  const main = h('main', { rect: [0, 560, 1280, 700], attrs: { 'data-tracy-src': 'template:home' } }, [
    rule,
    article
  ])
  const body = h('body', { rect: [0, 0, 1280, 4000] }, [nav, hero, main])
  return { document: doc(body), span, nav, hero, heading, rule, img, title, article, main }
}

test('text in a nav picks the span, not the link, the item or the bar around it', () => {
  const page = home()
  assert.equal(pickAt(130, 28, page.document), page.span)
})

test('empty space in a hero picks the section, even with a heading within reach', () => {
  const page = home()
  assert.equal(pickAt(900, 300, page.document), page.hero)
  assert.equal(pickAt(640, 195, page.document), page.hero, 'the heading does not hold the pointer')
})

test('a 1px rule is pickable from 5px away — a small box earns tolerance', () => {
  const page = home()
  assert.equal(pickAt(300, 605, page.document), page.rule)
  assert.equal(pickAt(300, 596, page.document), page.rule)
})

test("the picker's own overlay is never an answer", () => {
  const page = home()
  const overlay = h('tracy-pick', { rect: [120, 22, 10, 10], attrs: { 'data-tracy-picker': '' } })
  overlay.parentElement = page.span
  page.span.children.push(overlay)
  page.span.childNodes.push(overlay)
  overlay.ownerDocument = page.document
  assert.equal(pickAt(125, 25, page.document), page.span)
})

test('nothing under the pointer is null, not a guess', () => {
  const page = home()
  assert.equal(pickAt(5000, 5000, page.document), null)
})

test('a descriptor names the element: own text collapsed, tag, path, a unique selector, its box', () => {
  const page = home()
  const target = describe(page.title)
  assert.equal(target.text, 'The lake')
  assert.equal(target.tag, 'h2')
  assert.equal(target.image, null)
  assert.deepEqual(target.rect, { x: 100, y: 910, width: 500, height: 40 })
  assert.equal(target.domPath, 'html > body > main > article > h2')
  // Runtime 14: the steps stop once they name this one element (the whole path from the root before).
  assert.equal(target.selector, 'article:nth-child(2) > h2:nth-child(3)')
  assert.deepEqual(page.document.querySelectorAll(target.selector), [page.title])
  assert.equal(target.level, 0)
})

test('an id that is unique shortens the selector; classes appear in the path', () => {
  const page = home()
  assert.equal(describe(page.heading).selector, '#hero > h1:nth-child(1)')
  assert.equal(describe(page.hero).selector, '#hero')
  assert.equal(
    describe(page.span).domPath,
    'html > body > nav.site-nav.main > ul > li.item-101.current > a > span'
  )
})

test('an image reports the source actually shown and its alt', () => {
  const page = home()
  assert.deepEqual(describe(page.img).image, { src: 'https://site.example/a-800.jpg', alt: 'A lake' })
  const bg = h('div', { rect: [0, 0, 10, 10], bg: 'url("https://site.example/bg.png")' })
  doc(h('body', {}, [bg]))
  assert.deepEqual(describe(bg).image, { src: 'https://site.example/bg.png', alt: '' })
})

test('a link around one image reports that image; the pick itself stays the link', () => {
  const img = h('img', {
    rect: [10, 10, 300, 200],
    currentSrc: 'https://site.example/card-600.jpg',
    src: 'https://site.example/card.jpg',
    alt: 'Card photo'
  })
  const link = h('a', { rect: [10, 10, 300, 200], attrs: { href: '/post' } }, ['\n  ', img, '\n'])
  doc(h('body', {}, [h('div', { cls: 'card' }, [link])]))
  const target = describe(link)
  assert.deepEqual(target.image, { src: 'https://site.example/card-600.jpg', alt: 'Card photo' })
  assert.equal(target.tag, 'a')
  assert.deepEqual(target.rect, { x: 10, y: 10, width: 300, height: 200 })
  assert.match(target.selector, /> a:nth-child\(1\)$/)
})

test('a text-less wrapper reaches its one image through picture and figure', () => {
  const img = h('img', { src: 'https://site.example/p.jpg', alt: 'P' })
  const link = h('a', {}, [h('figure', {}, [h('picture', {}, [h('source'), img])])])
  doc(h('body', {}, [link]))
  assert.deepEqual(describe(link).image, { src: 'https://site.example/p.jpg', alt: 'P' })
})

test('a wrapper with words of its own, or with two images, reports no image', () => {
  const one = () => h('img', { src: 'https://site.example/1.jpg', alt: 'one' })
  const worded = h('a', {}, [one(), h('span', { text: 'Read more' })])
  const captioned = h('figure', {}, [one(), h('figcaption', { text: 'A caption' })])
  const pair = h('a', {}, [one(), h('img', { src: 'https://site.example/2.jpg', alt: 'two' })])
  doc(h('body', {}, [worded, captioned, pair]))
  assert.equal(describe(worded).image, null)
  assert.equal(describe(captioned).image, null)
  assert.equal(describe(pair).image, null)
})

test('the image inside a wrapper stays private when it is marked private', () => {
  const img = h('img', { src: 'https://site.example/secret.jpg', attrs: { 'data-tracy-private': '' } })
  const link = h('a', {}, [img])
  doc(h('body', {}, [link]))
  assert.equal(describe(link).image, null)
})

test('a direct image and a background image are reported as before', () => {
  const page = home()
  assert.deepEqual(describe(page.img).image, { src: 'https://site.example/a-800.jpg', alt: 'A lake' })
  const inner = h('img', { src: 'https://site.example/inner.jpg' })
  const bg = h('a', { bg: 'url(https://site.example/own-bg.png)' }, [inner])
  doc(h('body', {}, [bg]))
  assert.deepEqual(describe(bg).image, { src: 'https://site.example/own-bg.png', alt: '' })
})

test('marks run innermost first: stamps, a template owner, a Joomla menu item', () => {
  const page = home()
  assert.deepEqual(describe(page.title).marks, [
    'post:12:lake field:title',
    'post:12:lake',
    'block:core/post-template',
    'template:home'
  ])
  assert.deepEqual(describe(page.span).marks, ['menuItem:101'])
  const blog = page.nav.children[0].children[1].children[0].children[0]
  assert.deepEqual(describe(blog).marks, ['menuItem:102'])
})

test('levels: the element first, then each ancestor that carries a mark', () => {
  const page = home()
  const target = describe(page.img)
  assert.deepEqual(
    target.levels.map((level) => [level.tag, level.mark]),
    [
      ['img', null],
      ['article', 'post:12:lake'],
      ['main', 'template:home']
    ]
  )
  assert.deepEqual(target.levels[1].rect, { x: 80, y: 680, width: 800, height: 400 })
  assert.deepEqual(levelElements(page.img), [page.img, page.article, page.main])
  assert.equal(describe(page.title).levels[0].mark, 'post:12:lake field:title')
})

test('levels (runtime 19): an ancestor with a box of its own counts without a mark; a same-box wrapper and the page do not', () => {
  const heading = h('h1', { rect: [120, 120, 400, 60], text: 'Ship fast' })
  const inner = h('div', { rect: [100, 100, 600, 300], cls: 'inner' }, [heading])
  const column = h('div', { rect: [100, 100, 600, 300], cls: 'col' }, [inner])
  const empty = h('div', { rect: [0, 0, 0, 0], cls: 'contents' }, [column])
  const hero = h('section', { rect: [0, 56, 1280, 500], cls: 'hero' }, [empty])
  const wrapper = h('div', { rect: [0, 0, 1280, 4000], cls: 'site' }, [hero])
  doc(h('body', { rect: [0, 0, 1280, 4000] }, [wrapper]))
  assert.deepEqual(levelElements(heading), [heading, inner, hero])
  assert.deepEqual(
    describe(heading).levels.map((level) => [level.tag, level.mark]),
    [
      ['h1', null],
      ['div', null],
      ['section', null]
    ]
  )
})

/**
 * The kineticakemi.tracy.site home hero (wp-ja-kinetic, measured on cowork.tracy.site 01/10/2026):
 * the h1 sits in four anonymous `div.wp-block-group` wrappers, the hero is one of several ACM blocks in
 * the post content, and the post content has the same box as `main`. Runtime 19 reported
 * h1 › div › div › div › div › div (the side card: "Block › Block › Block › Block › Heading").
 */
function kinetic() {
  const heading = h('h1', { rect: [108, 192, 526, 108], text: 'Ship fast. Sleep through the night.' })
  const copy = h('div', { rect: [108, 147, 526, 358], cls: 'wp-block-group acm-hero-copy' }, [heading])
  const visual = h('div', { rect: [700, 147, 584, 358], cls: 'wp-block-group acm-hero-visual' })
  const grid = h('div', { rect: [108, 147, 1176, 358], cls: 'wp-block-group hx-hero-grid' }, [copy, visual])
  const inner = h('div', { rect: [76, 67, 1240, 502], cls: 'wp-block-group hx-container acm-hero-inner' }, [
    grid
  ])
  const hero = h(
    'div',
    { rect: [0, 67, 1391, 502], id: 'acm-hero-177', cls: 'wp-block-group ja-acm acm-hero' },
    [inner]
  )
  const clients = h('div', { rect: [0, 569, 1391, 200], cls: 'wp-block-group ja-acm acm-clients' }, [
    h('p', { rect: [100, 600, 400, 20], text: 'Trusted by' })
  ])
  const bento = h('div', { rect: [0, 769, 1391, 800], cls: 'wp-block-group ja-acm acm-bento' }, [
    h('h2', { rect: [100, 800, 600, 50], text: 'Everything you need' }),
    h('h3', { rect: [100, 900, 300, 30], text: 'Traces' })
  ])
  const content = h('div', { rect: [0, 67, 1391, 4009], cls: 'entry-content wp-block-post-content' }, [
    hero,
    clients,
    bento
  ])
  const main = h('main', { rect: [0, 67, 1391, 4009], id: 'wp--skip-link--target', cls: 'wp-block-group' }, [
    content
  ])
  const header = h('header', { rect: [0, 0, 1391, 67], cls: 'tracy-header' })
  const site = h('div', { rect: [0, 0, 1391, 4576], cls: 'wp-site-blocks' }, [header, main])
  doc(h('body', { rect: [0, 0, 1391, 4576] }, [site]))
  return { heading, copy, grid, inner, hero, content, main }
}

/** Elements compared by identity, reported by index: a failed deepEqual on stub elements takes minutes to print. */
const sameEls = (actual, expected) =>
  assert.deepEqual(
    actual.map((el) => expected.indexOf(el)),
    expected.map((_, i) => i)
  )

/** A level as the side card reads it: tag, the page's own name for it, its landmark. */
const named = (level) => [level.tag, level.name ?? null, level.landmark ?? null]

test('levels (runtime 20): the kinetic hero path names the hero and main, one Block for the wrappers', () => {
  const page = kinetic()
  sameEls(levelElements(page.heading), [page.heading, page.inner, page.hero, page.main])
  assert.deepEqual(describe(page.heading).levels.map(named), [
    ['h1', null, null],
    ['div', null, null],
    ['div', 'Ship fast. Sleep through the night.', null],
    ['main', null, 'main']
  ])
  // Pressing a step still moves the pick to that very element: the outermost of the collapsed run.
  const els = levelElements(page.heading)
  assert.equal(widened(els, 1).selector, describe(page.inner).selector)
  assert.equal(widened(els, 2).tag, 'div')
  assert.deepEqual(widened(els, 2).rect, { x: 0, y: 67, width: 1391, height: 502 })
  assert.equal(widened(els, 3).tag, 'main')
})

test('levels (runtime 20): an explicit label names a container, before its landmark and its heading', () => {
  const button = h('button', { rect: [120, 320, 100, 40], text: 'Buy' })
  const card = h('div', { rect: [100, 200, 300, 200], cls: 'card' }, [
    h('h3', { rect: [110, 210, 200, 30], text: 'Pro' }),
    button
  ])
  const team = h('div', { rect: [500, 200, 300, 200], cls: 'card' }, [
    h('h3', { rect: [510, 210, 200, 30], text: 'Team' })
  ])
  const plans = h('div', { rect: [80, 150, 1000, 400], attrs: { 'aria-label': 'Pricing  plans' } }, [
    card,
    team
  ])
  const caption = h('h2', { rect: [80, 600, 400, 40], id: 'faq-title', text: 'Questions' })
  const link = h('a', { rect: [100, 700, 80, 20], text: 'Refunds' })
  const faq = h('section', { rect: [60, 590, 1100, 300], attrs: { 'aria-labelledby': 'faq-title' } }, [
    caption,
    h('div', { rect: [80, 680, 600, 100] }, [link])
  ])
  const nav = h('nav', { rect: [0, 0, 1280, 60], attrs: { 'aria-label': 'Footer links' } }, [
    h('a', { rect: [10, 10, 60, 20], text: 'About' })
  ])
  doc(h('body', { rect: [0, 0, 1280, 4000] }, [plans, faq, nav]))
  assert.deepEqual(describe(button).levels.map(named), [
    ['button', null, null],
    ['div', 'Pro', null],
    ['div', 'Pricing plans', null]
  ])
  assert.deepEqual(describe(link).levels.map(named), [
    ['a', null, null],
    ['div', null, null],
    ['section', 'Questions', null]
  ])
  assert.deepEqual(describe(nav.children[0]).levels.map(named), [
    ['a', null, null],
    ['nav', 'Footer links', 'nav']
  ])
})

test('levels (runtime 20): header, footer, nav and a landmark role say what they are', () => {
  const link = h('a', { rect: [110, 20, 60, 20], text: 'Home' })
  const nav = h('nav', { rect: [100, 10, 600, 40] }, [
    h('ul', { rect: [100, 10, 600, 40] }, [h('li', { rect: [100, 10, 90, 40] }, [link])])
  ])
  const header = h('header', { rect: [0, 0, 1280, 60] }, [h('div', { rect: [80, 0, 1120, 60] }, [nav])])
  const legal = h('a', { rect: [110, 3920, 60, 20], text: 'Privacy' })
  const footerNav = h('div', { rect: [100, 3910, 600, 40], attrs: { role: 'navigation' } }, [legal])
  const footer = h('footer', { rect: [0, 3800, 1280, 200] }, [footerNav])
  doc(h('body', { rect: [0, 0, 1280, 4000] }, [header, footer]))
  assert.deepEqual(describe(link).levels.map(named), [
    ['a', null, null],
    ['li', null, null],
    ['nav', null, 'nav'],
    ['div', null, null],
    ['header', null, 'header']
  ])
  assert.deepEqual(describe(legal).levels.map(named), [
    ['a', null, null],
    ['div', null, 'nav'],
    ['footer', null, 'footer']
  ])
})

test('levels (runtime 20): a page with no names collapses its wrappers into one Block, the outermost', () => {
  const leaf = h('span', { rect: [120, 120, 80, 20], text: 'Hello' })
  const a = h('div', { rect: [110, 110, 200, 60] }, [leaf])
  const b = h('div', { rect: [100, 100, 400, 100] }, [a])
  const c = h('div', { rect: [90, 90, 600, 200] }, [b])
  const d = h('div', { rect: [80, 80, 800, 300] }, [c])
  doc(h('body', { rect: [0, 0, 1280, 4000] }, [d]))
  const els = levelElements(leaf)
  sameEls(els, [leaf, d])
  assert.deepEqual(describe(leaf).levels.map(named), [
    ['span', null, null],
    ['div', null, null]
  ])
  assert.deepEqual(widened(els, 1).rect, { x: 80, y: 80, width: 800, height: 300 })
})

test('levels (runtime 20): a heading never names a container it is not the title of, nor a private one', () => {
  // The only section on the page: its heading titles the page, not a block among others.
  const lone = h('h2', { rect: [100, 100, 400, 40], text: 'Alone' })
  const wrap = h('div', { rect: [80, 80, 800, 300] }, [
    lone,
    h('p', { rect: [100, 160, 400, 20], text: 'x' })
  ])
  // Two headings of the same rank: no single title.
  const twin = h('p', { rect: [100, 600, 100, 20], text: 'y' })
  const pair = h('div', { rect: [80, 500, 800, 300] }, [
    h('h2', { rect: [100, 510, 400, 40], text: 'One' }),
    h('h2', { rect: [100, 560, 400, 40], text: 'Two' }),
    twin
  ])
  const secret = h('p', { rect: [100, 1000, 100, 20], text: 'z' })
  const hidden = h('div', { rect: [80, 900, 800, 300], attrs: { 'data-tracy-private': '' } }, [
    h('h2', { rect: [100, 910, 400, 40], text: 'Balance' }),
    secret
  ])
  doc(h('body', { rect: [0, 0, 1280, 4000] }, [h('div', { rect: [0, 0, 1000, 70] }, [wrap]), pair, hidden]))
  assert.equal(describe(lone).levels[1].name, undefined)
  assert.equal(describe(twin).levels[1].name, undefined)
  assert.ok(!JSON.stringify(describe(secret).levels).includes('Balance'))
})

test("widened: the level described as the pick, the first pick's levels kept and the index said", () => {
  const page = home()
  const els = levelElements(page.img)
  const target = widened(els, 1)
  assert.equal(target.level, 1)
  assert.equal(target.tag, 'article')
  assert.deepEqual(target.rect, { x: 80, y: 680, width: 800, height: 400 })
  assert.deepEqual(target.levels, describe(page.img).levels)
  assert.deepEqual(widened(els, 0), { ...describe(page.img), level: 0 })
})

test('form values, private subtrees and script text never leave the page', () => {
  const input = h('input', { rect: [0, 0, 100, 20], attrs: { type: 'password', value: 'hunter2' } })
  const area = h('textarea', { rect: [0, 30, 100, 40], text: 'draft secret' })
  const select = h('select', { rect: [0, 80, 100, 20] }, [h('option', { text: 'Visa 4242' })])
  const secret = h('p', { rect: [0, 110, 100, 20], text: 'Account balance 1,204' })
  const box = h('div', { rect: [0, 100, 200, 100], attrs: { 'data-tracy-private': '' } }, [secret])
  const script = h('script', { text: 'var token = "abc"' })
  doc(h('body', {}, [input, area, select, box, script]))
  for (const node of [input, area, select, select.children[0], secret, box, script]) {
    const text = JSON.stringify(describe(node))
    for (const leak of ['hunter2', 'draft secret', 'Visa 4242', '1,204', 'abc'])
      assert.ok(!text.includes(leak), `${node.tagName} leaked ${leak}`)
  }
})

test('limits hold: text, marks, levels and path are capped', () => {
  let node = h('span', { rect: [0, 0, 5, 5], text: 'x'.repeat(1000) })
  const leaf = node
  for (let i = 0; i < 20; i += 1)
    node = h('div', { rect: [0, 0, 10, 10], attrs: { 'data-tracy-src': `block:${String(i)}` } }, [node])
  doc(h('body', {}, [node]))
  const target = describe(leaf)
  assert.equal(target.text.length, LIMITS.text)
  assert.ok(target.text.endsWith('…'), 'a cut text says it was cut')
  assert.equal(target.marks.length, LIMITS.marks)
  assert.equal(target.levels.length, LIMITS.levels)
  assert.equal(target.domPath.split(' > ').length, LIMITS.domPath)
})

// ── text: the element's words, inline descendants included, block descendants not ──────────────

test('a heading wrapping a link sends the link words (a WordPress query-loop post title)', () => {
  const link = h('a', { rect: [100, 10, 200, 30], attrs: { href: '/hello-northwind/' } }, ['Hello Northwind'])
  const title = h('h2', { rect: [100, 10, 500, 30], cls: 'wp-block-post-title' }, [link])
  doc(h('body', {}, [title]))
  assert.equal(describe(title).text, 'Hello Northwind')
  assert.equal(describe(title).levels[0].text, 'Hello Northwind')
  assert.equal(describe(link).text, 'Hello Northwind')
})

test('a menu item whose label is a link, and a link whose label is a span, send the label', () => {
  const li = h('li', { rect: [0, 0, 100, 20] }, [
    h('a', { rect: [0, 0, 80, 20] }, [h('span', {}, ['Services'])])
  ])
  doc(h('body', {}, [h('ul', {}, [li])]))
  assert.equal(describe(li).text, 'Services')
})

test('verify6 L3: inline tags the page lays out as blocks are separate words (a T4 mega-menu link)', () => {
  // <a><span>Newsletter</span><span>Digest email template</span></a>, the spans shown as two lines.
  const link = h('a', { rect: [0, 0, 200, 40] }, [
    h('span', { css: { display: 'block' } }, ['Newsletter']),
    h('span', { css: { display: 'flex' } }, ['Digest  email template'])
  ])
  // Laid out inline, the same markup keeps the words as written (a word split by a tag stays one word).
  const word = h('p', { rect: [0, 50, 200, 20] }, [
    h('b', {}, ['W']),
    h('span', { css: { display: 'inline-block' } }, ['ord'])
  ])
  doc(h('body', {}, [link, word]))
  assert.equal(describe(link).text, 'Newsletter Digest email template')
  assert.equal(describe(word).text, 'Word')
})

test('a paragraph with inline formatting sends the whole sentence, spacing as written', () => {
  const p = h('p', { rect: [0, 0, 400, 20] }, [
    'Some ',
    h('strong', {}, ['bold']),
    ' words, ',
    h('em', {}, ['a ', h('code', {}, ['snippet'])]),
    ' and a',
    h('br'),
    'break'
  ])
  doc(h('body', {}, [p]))
  assert.equal(describe(p).text, 'Some bold words, a snippet and a break')
})

test('a card keeps its blocks apart: picking the card does not concatenate heading and body', () => {
  const card = h('div', { rect: [0, 0, 300, 200], cls: 'card' }, [h('h3', {}, ['T']), h('p', {}, ['P'])])
  const linked = h('a', { rect: [0, 300, 300, 200], cls: 'card' }, [
    h('h3', {}, ['Title']),
    h('p', {}, ['Body'])
  ])
  const lead = h('div', { rect: [0, 600, 300, 200] }, ['Lead', h('p', {}, ['inner']), 'tail'])
  doc(h('body', {}, [card, linked, lead]))
  assert.equal(describe(card).text, '')
  assert.equal(describe(linked).text, '')
  assert.equal(describe(lead).text, 'Lead tail')
})

test('inline descendants never carry a private subtree, a form value or script text out', () => {
  const p = h('p', { rect: [0, 0, 400, 20] }, [
    'Balance ',
    h('span', { attrs: { 'data-tracy-private': '' } }, ['1,204']),
    ' ',
    h('label', {}, [h('select', {}, [h('option', {}, ['Visa 4242'])])]),
    h('script', {}, ['var token = "abc"']),
    'shown'
  ])
  doc(h('body', {}, [p]))
  assert.equal(describe(p).text, 'Balance shown')
})

test('the text cap holds across inline descendants', () => {
  const p = h('p', { rect: [0, 0, 5, 5] }, [h('a', {}, ['x'.repeat(200)]), h('b', {}, ['y'.repeat(200)])])
  doc(h('body', {}, [p]))
  assert.equal(describe(p).text.length, LIMITS.text)
})

test('own text includes the words of inline tags inside the element, never a block child', () => {
  // 27/09/2026: an h1 with an <em> half was described as its first half only, and the agent rewrote half.
  const em = h('em', { text: 'next-generation plants' })
  const heading = h('h1', {}, ['Building the groundwork for ', em])
  const note = h('p', { text: 'Block text' })
  const hidden = h('span', { text: 'secret', attrs: { 'data-tracy-private': '' } })
  const box = h('div', {}, ['Lead ', h('strong', { text: 'bold' }), hidden, note])
  h('body', {}, [heading, box])
  assert.equal(describe(heading).text, 'Building the groundwork for next-generation plants')
  assert.equal(describe(box).text, 'Lead bold')
})

test('a text at the limit is whole and unmarked; one character more is cut and marked', () => {
  const exact = h('p', { rect: [0, 0, 5, 5], text: 'y'.repeat(LIMITS.text) })
  const over = h('p', { rect: [0, 0, 5, 5], text: `${'z'.repeat(LIMITS.text)}!` })
  doc(h('body', {}, [exact, over]))
  assert.equal(describe(exact).text, 'y'.repeat(LIMITS.text))
  assert.equal(describe(over).text, `${'z'.repeat(LIMITS.text - 1)}…`)
})

test('reboxed measures every box again and changes nothing else', () => {
  const page = home()
  const target = describe(page.title)
  const els = levelElements(page.title)
  const moved = els.map((el) => {
    const r = el.getBoundingClientRect()
    return { ...el, getBoundingClientRect: () => ({ ...r, left: r.left, top: r.top - 500 }) }
  })
  const again = reboxed(target, moved[0], moved)
  assert.deepEqual(again.rect, { ...target.rect, y: target.rect.y - 500 })
  assert.deepEqual(
    again.levels.map((level) => level.rect.y),
    target.levels.map((level) => level.rect.y - 500)
  )
  assert.deepEqual({ ...again, rect: target.rect, levels: target.levels }, target)
  const words = (level) => [level.tag, level.mark, level.text]
  assert.deepEqual(again.levels.map(words), target.levels.map(words))
})

// ── inside: a container with no words of its own says what is in it ────────────────────────────

test('a picked container reports the words inside it, blocks apart, in reading order', () => {
  const card = h('div', { rect: [0, 0, 300, 200], cls: 'card' }, [
    h('h3', {}, ['Ana Lopez']),
    h('p', {}, ['Head of ', h('strong', { text: 'design' })])
  ])
  doc(h('body', {}, [card]))
  const target = describe(card)
  assert.equal(target.text, '')
  assert.equal(target.inside, 'Ana Lopez Head of design')
})

test('inside is left out when the element has words of its own, or none below it', () => {
  const heading = h('h2', { rect: [0, 0, 100, 20], text: 'Hello' })
  const empty = h('div', { rect: [0, 30, 100, 20] }, [h('img', { rect: [0, 30, 10, 10] })])
  doc(h('body', {}, [heading, empty]))
  assert.ok(!('inside' in describe(heading)))
  assert.ok(!('inside' in describe(empty)))
})

test('inside is capped at INSIDE_MAX with the cut mark, and never carries private or silent words', () => {
  const long = h('div', { rect: [0, 0, 300, 200] }, [h('p', {}, ['w'.repeat(INSIDE_MAX + 50)])])
  const secret = h('p', { attrs: { 'data-tracy-private': '' } }, ['balance 1,204'])
  const script = h('script', { text: 'var token = "abc"' })
  const area = h('textarea', { text: 'draft secret' })
  const box = h('div', { rect: [0, 300, 300, 200] }, [h('p', {}, ['Shown']), secret, script, area])
  const inPrivate = h('div', { rect: [0, 600, 300, 100], attrs: { 'data-tracy-private': '' } }, [
    h('p', {}, ['hidden words'])
  ])
  doc(h('body', {}, [long, box, inPrivate]))
  const cut = describe(long).inside
  assert.equal(cut.length, INSIDE_MAX)
  assert.ok(cut.endsWith('…'))
  assert.equal(describe(box).inside, 'Shown')
  assert.ok(!('inside' in describe(inPrivate)))
})

// ── Finding a tracked element again (`locate`, runtime 5) ─────────────────────────────────────

/** A document whose selectors resolve through `table` (the stub has no CSS engine). */
function withTable(document, table) {
  const base = document.querySelectorAll
  document.querySelectorAll = (selector) => {
    if (selector === 'p:has(') throw new SyntaxError('bad')
    return selector in table ? table[selector]() : base(selector)
  }
  return document
}

test('locate finds the one element whose words still begin as picked, and nothing else', () => {
  const title = h('h2', { rect: [0, 0, 10, 10], text: 'Our services for everyone who builds websites daily' })
  const twins = [h('li', { rect: [0, 0, 1, 1], text: 'A' }), h('li', { rect: [0, 0, 1, 1], text: 'A' })]
  const picker = h('tracy-pin', { rect: [0, 0, 1, 1], attrs: { 'data-tracy-picker': '' } })
  const document = withTable(doc(h('body', { rect: [0, 0, 100, 100] }, [title, ...twins, picker])), {
    'body > h2': () => [title],
    li: () => twins,
    'tracy-pin': () => [picker],
    'h2, tracy-pin': () => [title, picker]
  })
  const at = (selector, text) => locate({ selector, text }, document)
  assert.equal(at('body > h2', 'Our services').el, title)
  // Only the first 40 characters are held: what follows may have changed.
  assert.equal(at('body > h2', 'Our services for everyone who builds web PAGES').el, title)
  assert.deepEqual(at('body > h2', 'What we do'), { el: null, reason: 'changed' })
  assert.deepEqual(at('li', 'A'), { el: null, reason: 'many' })
  assert.deepEqual(at('#none', 'A'), { el: null, reason: 'missing' })
  assert.deepEqual(at('p:has(', 'A'), { el: null, reason: 'missing' }, 'a selector the page cannot parse')
  assert.deepEqual(
    at('tracy-pin', ''),
    { el: null, reason: 'missing' },
    'never one of the picker’s own drawings'
  )
  assert.equal(at('h2, tracy-pin', 'Our').el, title)
})

test('locate holds an element with no words by the tag its selector names', () => {
  const img = h('img', { rect: [0, 0, 10, 10], src: 'https://site.example/a.jpg' })
  const box = h('div', { rect: [0, 0, 10, 10] })
  let now = img
  const document = withTable(doc(h('body', { rect: [0, 0, 100, 100] }, [img, box])), {
    'body > img:nth-child(1)': () => [now],
    '#hero': () => [now]
  })
  assert.equal(locate({ selector: 'body > img:nth-child(1)', text: '' }, document).el, img)
  now = box
  assert.deepEqual(locate({ selector: 'body > img:nth-child(1)', text: '' }, document), {
    el: null,
    reason: 'changed'
  })
  // An id names no tag: the one element it matches is taken.
  assert.equal(locate({ selector: '#hero', text: '' }, document).el, box)
})

test('locate checks words only while a comment waits; once sent, the selector alone holds it', () => {
  const title = h('h2', { rect: [0, 0, 10, 10], text: 'What we do' })
  const document = withTable(doc(h('body', { rect: [0, 0, 100, 100] }, [title])), {
    'body > h2': () => [title]
  })
  for (const state of ['saved', 'pending', 'active'])
    assert.deepEqual(locate({ selector: 'body > h2', text: 'Our services', state }, document), {
      el: null,
      reason: 'changed'
    })
  for (const state of ['sent', 'working', 'done', 'failed', 'asked'])
    assert.equal(locate({ selector: 'body > h2', text: 'Our services', state }, document).el, title, state)
  assert.deepEqual(locate({ selector: '#none', text: '', state: 'done' }, document), {
    el: null,
    reason: 'missing'
  })
})

// ── Picking lands on content (stage 6 acceptance v2, K01 / K04, 30/09/2026) ──────────────────────
//
// The smallest box under the pointer is not always what the person meant: a theme's empty wrapper,
// icon span or transparent overlay can be smaller than — or sit on top of — the words. Measured on a
// Joomla quickstart: a click on the hero H1 picked its empty column `<div>` (a transparent layer was
// painted over the column), and a click on a "Dark" toggle picked the button's empty 15 px icon span.
// Either way Tracy received a tag with no words. Among the boxes that hold the pointer, the smallest
// one WITH content (words, an image, a control) wins; only when none has content does the plain
// smallest box win (a click on a section's empty space still picks the section).

test('an empty icon span inside a worded button picks the button', () => {
  const icon = h('span', { rect: [938, 9, 15, 15], cls: 'icon-moon' })
  const button = h('button', { rect: [930, 4, 70, 26] }, [
    icon,
    h('span', { rect: [958, 9, 36, 16], text: 'Dark' })
  ])
  // The words sit in a span of their own: a click on them still picks that span.
  doc(h('body', { rect: [0, 0, 1280, 4000] }, [button]))
  assert.equal(pickAt(945, 16, button.ownerDocument), button)
  assert.equal(pickAt(970, 16, button.ownerDocument), button.children[1])
})

test('a text-less wrapper smaller than the heading it holds does not win over the heading', () => {
  // An animation wrapper with a fixed height: the H1 overflows it.
  const heading = h('h1', { rect: [32, 270, 448, 261], text: 'Industrial parks, built to run' })
  const wrap = h('div', { rect: [32, 300, 448, 120], cls: 'reveal' }, [heading])
  const body = h('body', { rect: [0, 0, 1280, 4000] }, [h('section', { rect: [0, 150, 1280, 700] }, [wrap])])
  const document = doc(body)
  assert.equal(pickAt(62, 350, document), heading)
})

test('a transparent layer painted over a column picks the words under it, not the layer or the column', () => {
  const heading = h('h1', { rect: [32, 270, 448, 261], text: 'Industrial parks, built to run' })
  const lead = h('p', { rect: [32, 540, 448, 89], text: 'Design–build main contractor' })
  const column = h('div', { rect: [32, 206, 448, 503] }, [heading, lead])
  const layer = h('div', { rect: [0, 150, 1280, 700], cls: 'hero-overlay' })
  const hero = h('section', { rect: [0, 150, 1280, 700], id: 'tb-hero-441' }, [column, layer])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [hero]))
  assert.equal(document.elementFromPoint(62, 282), layer, 'the stub paints the layer on top, as the page did')
  assert.equal(pickAt(62, 282, document), heading)
  assert.equal(describe(pickAt(62, 282, document)).text, 'Industrial parks, built to run')
})

test('an icon drawn in SVG picks the svg, not one of its paths (outside any control)', () => {
  const path = h('path', { rect: [12, 12, 6, 6] })
  const svg = h('svg', { rect: [10, 10, 16, 16] }, [path])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [h('div', { rect: [4, 4, 28, 28] }, [svg])]))
  assert.equal(pickAt(14, 14, document), svg)
})

test('with no content under the pointer the smallest box still wins', () => {
  const inner = h('div', { rect: [100, 100, 200, 200] })
  const outer = h('div', { rect: [50, 50, 400, 400] }, [inner])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [outer]))
  assert.equal(pickAt(150, 150, document), inner)
})

test('WordPress cover block: words pick their paragraph; the padding picks the background image under the dim layer', () => {
  // core/cover: <div.wp-block-cover><span.wp-block-cover__background/> <img.__image-background/>
  // <div.__inner-container><p/></div></div> — the empty dim span is painted over the image.
  const words = h('p', { rect: [200, 300, 500, 40], text: 'Built for the long run' })
  const inner = h('div', { rect: [200, 280, 500, 80], cls: 'wp-block-cover__inner-container' }, [words])
  const image = h('img', {
    rect: [0, 100, 1280, 500],
    cls: 'wp-block-cover__image-background',
    src: 'https://wp.example/hero.jpg'
  })
  const dim = h('span', { rect: [0, 100, 1280, 500], cls: 'wp-block-cover__background has-background-dim' })
  const cover = h('div', { rect: [0, 100, 1280, 500], cls: 'wp-block-cover' }, [image, dim, inner])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [cover]))
  assert.equal(pickAt(260, 318, document), words)
  assert.equal(pickAt(1000, 500, document), image)
})

test('EmDash slide: a click on the title beside a 3 px decorative bar picks the title, not the bar', () => {
  // KitSlides.astro cover mock: <div.h-[3px].w-9.bg-signal/> right above the serif title.
  const bar = h('div', { rect: [22, 208, 36, 3], cls: 'mb-2.5 h-[3px] w-9 bg-signal' })
  const title = h('div', { rect: [22, 213, 300, 24], cls: 'font-serif', text: 'Vorsino Phase 3' })
  const block = h('div', { rect: [22, 200, 300, 37] }, [bar, title])
  const slide = h('div', { rect: [0, 150, 640, 360], cls: 'absolute inset-0 flex flex-col' }, [block])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [slide]))
  assert.equal(pickAt(30, 219, document), title)
})

// ── Round 5 (stage 6 acceptance v3, 30/09/2026; runtime 14) ───────────────────────────────────────

/** A WordPress header as the e2e site printed it (`wp-tracy-business`, Polylang switcher, mega menu). */
function wpHeader() {
  const icon = h('span', {
    rect: [938, 9, 13, 13],
    cls: 'tracy-theme-toggle__icon',
    attrs: { 'aria-hidden': 'true' }
  })
  const dark = h('button', { rect: [930, 4, 70, 26], cls: 'tracy-theme-toggle' }, [icon, 'Dark'])
  const path = h('path', { rect: [884, 11, 11, 11] })
  const svg = h('svg', { rect: [882, 9, 15, 15] }, [path])
  const search = h(
    'button',
    { rect: [876, 4, 28, 28], cls: 'wp-block-search__button', attrs: { 'aria-label': 'Search' } },
    [svg]
  )
  const cartSvg = h('svg', { rect: [842, 9, 16, 16] }, [h('title', { rect: [0, 0, 0, 0] }, ['Cart'])])
  const cart = h('a', { rect: [840, 7, 20, 20], attrs: { href: '/cart' } }, [cartSvg])
  const caret = h('span', { rect: [769, 97, 8, 23], cls: 'caret', attrs: { 'aria-hidden': 'true' } })
  const mega = h('button', { rect: [700, 97, 80, 23], attrs: { 'aria-label': 'Open Resources menu' } }, [
    caret
  ])
  const header = h('header', { rect: [0, 0, 1280, 130], attrs: { 'data-tracy-src': 'part:header' } }, [
    dark,
    search,
    cart,
    mega
  ])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [header]))
  return { document, dark, icon, search, svg, path, cart, cartSvg, mega, caret }
}

test('item 5: an icon inside a button or a link picks the control, named by its accessible label', () => {
  const page = wpHeader()
  assert.equal(pickAt(944, 15, page.document), page.dark)
  assert.equal(pickAt(889, 16, page.document), page.search, 'the magnifier path picks the Search button')
  assert.equal(describe(page.search).name, 'Search')
  assert.equal(pickAt(850, 17, page.document), page.cart, 'an svg link picks the link')
  assert.equal(describe(page.cart).name, 'Cart', "an svg's <title> names its link")
  assert.equal(pickAt(772, 108, page.document), page.mega, 'a CSS caret picks its menu button')
  assert.equal(describe(page.mega).name, 'Open Resources menu')
  assert.ok(!('name' in describe(page.dark)), 'words of its own: no name')
})

test('item 5: a title names an icon link; aria-labelledby names a control by the words it points at', () => {
  const words = h('span', { rect: [0, 0, 0, 0], id: 'lbl', text: 'Close the dialog' })
  const close = h('button', { rect: [10, 10, 20, 20], attrs: { 'aria-labelledby': 'lbl' } }, [
    h('svg', { rect: [12, 12, 16, 16] })
  ])
  const home = h('a', { rect: [40, 10, 20, 20], attrs: { href: '/', title: 'Home page' } }, [
    h('svg', { rect: [42, 12, 16, 16] })
  ])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [words, close, home]))
  assert.equal(describe(pickAt(20, 20, document)).name, 'Close the dialog')
  assert.equal(describe(pickAt(50, 20, document)).name, 'Home page')
})

/** A hero as WordPress prints `core/image` blocks: an alt, a caption, and a bare one under a heading. */
function heroImages() {
  const src = 'https://wp.example/wp-content/uploads/2026/09/12f6e6ac883957ea6fc4e6cb73890c8b93e556c1.png'
  const withAlt = h('img', { rect: [32, 100, 400, 250], src, alt: 'Drop a site photo here · 4:5' })
  const captioned = h('img', { rect: [32, 400, 400, 250], src })
  const caption = h('figcaption', { rect: [32, 650, 400, 20], text: 'Our harbour office' })
  const heading = h('h2', { rect: [32, 700, 400, 40], text: 'Four core service lines' })
  const bare = h('img', { rect: [32, 760, 400, 250], src })
  const section = h(
    'section',
    { rect: [0, 80, 1280, 1000], attrs: { 'data-tracy-src': 'post:42:home block:core/group' } },
    [
      h('figure', { rect: [32, 100, 400, 250], cls: 'wp-block-image' }, [withAlt]),
      h('figure', { rect: [32, 400, 400, 270], cls: 'wp-block-image' }, [captioned, caption]),
      h('div', { rect: [32, 690, 400, 60] }, [heading]),
      h('figure', { rect: [32, 760, 400, 250], cls: 'wp-block-image' }, [bare])
    ]
  )
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [section]))
  return { document, withAlt, captioned, bare }
}

test('item 2: an image is named by its alt, else its figure caption, else the heading above it', () => {
  const page = heroImages()
  assert.equal(describe(page.withAlt).name, 'Drop a site photo here · 4:5')
  assert.equal(describe(page.captioned).name, 'Our harbour office')
  assert.equal(describe(page.bare).name, 'image near "Four core service lines"')
})

test('item 2: the selector is short, unique and never empty — a deep flag image with no id', () => {
  // The Polylang flag: html > body > div > header > div > div > div > div > div > button > span > img.
  let node = h('img', {
    rect: [826, 43, 16, 11],
    src: 'https://wp.example/wp-content/plugins/polylang/flags/us.png'
  })
  const flag = node
  for (const tag of ['span', 'button', 'div', 'div', 'div', 'div', 'div', 'header', 'div'])
    node = h(tag, { rect: [0, 0, 1280, 130] }, [h('i', { rect: [0, 0, 0, 0] }), node])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [h('p', { rect: [0, 0, 0, 0] }), node]))
  const { selector } = describe(flag)
  assert.ok(selector !== '' && selector.length < 80, selector)
  assert.deepEqual(document.querySelectorAll(selector), [flag])
  assert.equal(locate({ selector, text: '', state: 'saved' }, document).el, flag)
})

test('item 6: an invisible slide laid over the visible one is never picked — the visible words are', () => {
  const slide = (id, words, css) =>
    h('div', { rect: [20, 300, 400, 80], id, css }, [h('p', { rect: [20, 300, 200, 20], text: words })])
  const one = slide('s1', 'Slide one words', {})
  const two = slide('s2', 'Slide two words', { opacity: '0' })
  const three = slide('s3', 'Slide three words', { opacity: '0' })
  const carousel = h('div', { rect: [20, 300, 400, 80], cls: 'carousel' }, [one, two, three])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [carousel]))
  assert.equal(document.elementFromPoint(60, 310), three.children[0], 'the stub paints the last slide on top')
  assert.equal(pickAt(60, 310, document), one.children[0])
  const hidden = h('div', { rect: [20, 300, 400, 80], css: { visibility: 'hidden' } }, [
    h('p', { rect: [20, 300, 200, 20], text: 'Hidden' })
  ])
  const shown = h('div', { rect: [20, 300, 400, 80] }, [h('p', { rect: [20, 300, 200, 20], text: 'Shown' })])
  const other = doc(h('body', { rect: [0, 0, 1280, 4000] }, [shown, hidden]))
  assert.equal(pickAt(60, 310, other), shown.children[0])
})

test('item 3: an iframe (a video, a map) is picked itself and named as an embed with its title and host', () => {
  // While picking, the runtime makes embeds transparent to the pointer (so their events reach the
  // page); the stub models that with pointer-events:none on the element itself.
  const video = h('iframe', {
    rect: [100, 500, 320, 180],
    attrs: { title: 'Company film', src: 'https://www.youtube.com/embed/abc?autoplay=1&token=secret' }
  })
  video.style.pointerEvents = 'none'
  const map = h('iframe', {
    rect: [500, 500, 300, 200],
    attrs: { src: 'https://www.google.com/maps/embed?pb=1' }
  })
  map.style.pointerEvents = 'none'
  const bare = h('iframe', { rect: [100, 800, 200, 80], attrs: { srcdoc: '<p>x</p>' } })
  bare.style.pointerEvents = 'none'
  const wrap = h('div', { rect: [80, 480, 800, 420], cls: 'wp-block-embed__wrapper' }, [video, map, bare])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [wrap]))
  assert.equal(pickAt(200, 600, document), video)
  assert.equal(describe(video).name, 'embedded video "Company film" · youtube.com')
  assert.equal(pickAt(600, 600, document), map)
  assert.equal(describe(map).name, 'embedded map · google.com')
  assert.equal(describe(bare).name, 'embedded content')
  assert.ok(!JSON.stringify(describe(video)).includes('secret'), 'the address never leaves the page')
})

test('item 3: an embed under a fixed bar is not picked through the bar', () => {
  const video = h('iframe', { rect: [0, 0, 320, 180], attrs: { title: 'Film', src: 'https://vimeo.com/1' } })
  video.style.pointerEvents = 'none'
  const bar = h('div', { rect: [0, 0, 1280, 40], css: { position: 'fixed' } }, [
    h('a', { rect: [10, 10, 60, 20], text: 'Menu' })
  ])
  const document = doc(
    h('body', { rect: [0, 0, 1280, 4000] }, [h('div', { rect: [0, 0, 400, 200] }, [video]), bar])
  )
  assert.equal(pickAt(30, 20, document), bar.children[0])
  assert.equal(pickAt(200, 100, document), video)
})

test("item 9: Tracy's own badge (fixed, in a shadow root) is never picked — nothing is, over it", () => {
  const badge = h('div', {
    rect: [1100, 740, 160, 40],
    id: 'tracy-badge',
    css: { position: 'fixed' },
    shadow: [h('a', { rect: [1100, 740, 160, 40], text: 'Managed with Tracy' })]
  })
  const footer = h('footer', { rect: [0, 700, 1280, 100] }, [
    h('p', { rect: [1000, 740, 280, 20], text: 'INN 4003' })
  ])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [footer, badge]))
  assert.equal(pickAt(1150, 750, document), null)
  const demo = h('div', { rect: [1100, 740, 160, 40], id: 'build-with-tracy-demo' })
  const other = doc(
    h('body', { rect: [0, 0, 1280, 4000] }, [h('p', { rect: [1000, 740, 280, 20], text: 'x' }), demo])
  )
  assert.equal(pickAt(1150, 750, other), null)
})

test('item 9: a custom element with an open shadow root reports the words inside it', () => {
  const card = h('fx-card', {
    rect: [20, 20, 300, 60],
    shadow: [h('p', { rect: [20, 20, 300, 60], text: 'Card words in shadow' })]
  })
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [card]))
  assert.equal(pickAt(40, 40, document), card)
  assert.equal(describe(card).inside, 'Card words in shadow')
  const slotted = h(
    'fx-box',
    {
      rect: [20, 100, 300, 60],
      shadow: [h('b', { rect: [0, 0, 0, 0], text: 'Title:' }), h('slot', { rect: [0, 0, 0, 0] })]
    },
    [h('p', { rect: [20, 120, 300, 20], text: 'light words' })]
  )
  doc(h('body', { rect: [0, 0, 1280, 4000] }, [slotted]))
  assert.equal(describe(slotted).inside, 'Title: light words')
})

test('item I: a step with a stable class of its own is named by it, not by its position — a sibling added before it keeps the selector', () => {
  const button = h('button', {
    rect: [10, 10, 80, 20],
    cls: 'cta-primary is-active',
    text: 'Request a quote'
  })
  const hero = h('section', { rect: [0, 0, 1280, 500], cls: 'hero' }, [
    h('h1', { rect: [0, 0, 10, 10], text: 'Hi' }),
    button
  ])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [h('div', { rect: [0, 0, 0, 0] }), hero]))
  const { selector } = describe(button)
  assert.ok(/button\.cta-primary/.test(selector), selector)
  assert.ok(!/is-active/.test(selector), 'a state class is never part of it')
  assert.deepEqual(document.querySelectorAll(selector), [button])
})

test('item I: a tracked element its selector no longer finds is found again by its words, when exactly one element of that kind has them', () => {
  const p = h('p', { rect: [0, 0, 100, 20], text: 'Rendered again with a sibling before it' })
  const box = h('div', { rect: [0, 0, 100, 100], id: 'rr2' }, [
    h('p', { rect: [0, 0, 100, 20], text: 'A new sibling' }),
    p
  ])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [box]))
  // Stored when p was the first child; now it is the second.
  assert.equal(
    locate(
      { selector: '#rr2 > p:nth-child(1)', text: 'Rendered again with a sibling before it', state: 'saved' },
      document
    ).el,
    p
  )
  assert.equal(
    locate(
      { selector: '#rr2 > p:nth-child(3)', text: 'Rendered again with a sibling before it', state: 'saved' },
      document
    ).el,
    p
  )
  const twin = h('p', { rect: [0, 0, 100, 20], text: 'Rendered again with a sibling before it' })
  const two = doc(
    h('body', { rect: [0, 0, 1280, 4000] }, [
      h('div', { rect: [0, 0, 0, 0], id: 'rr2' }, [
        twin,
        h('p', { rect: [0, 0, 0, 0], text: 'Rendered again with a sibling before it' })
      ])
    ])
  )
  assert.equal(
    locate(
      { selector: '#rr2 > p:nth-child(3)', text: 'Rendered again with a sibling before it', state: 'saved' },
      two
    ).el,
    null,
    'two with those words: none is a guess'
  )
})

test('item I: a canvas is named, with the heading above it', () => {
  const heading = h('h2', { rect: [0, 0, 100, 20], text: 'Sales by month' })
  const canvas = h('canvas', { rect: [0, 30, 300, 150] })
  doc(h('body', { rect: [0, 0, 1280, 4000] }, [heading, canvas]))
  assert.equal(describe(canvas).name, 'canvas near "Sales by month"')
})

test('unseen (runtime 15): clip-path or clip that leaves nothing, and a skipped box around it, hide an element', () => {
  // Acceptance v5 JS-v5-new-6, 7c, 7d.
  const at = (css) => h('p', { rect: [0, 0, 200, 40], text: 'Words', css })
  const cases = [
    [{ clipPath: 'inset(100%)' }, true],
    [{ clipPath: 'inset(50%)' }, true],
    [{ clipPath: 'inset(20px 0px)' }, true],
    [{ clipPath: 'inset(10%)' }, false],
    [{ clipPath: 'none' }, false],
    [{ position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)' }, true],
    [{ position: 'static', clip: 'rect(0px, 0px, 0px, 0px)' }, false],
    [{ position: 'absolute', clip: 'rect(auto, auto, auto, auto)' }, false],
    // Its own contents skipped: its own box is still painted.
    [{ contentVisibility: 'hidden' }, false]
  ]
  for (const [css, want] of cases) {
    const el = at(css)
    doc(h('body', { rect: [0, 0, 1280, 800] }, [el]))
    assert.equal(unseen(el), want, JSON.stringify(css))
  }
  const inner = h('span', { rect: [0, 0, 50, 20], text: 'Inside' })
  const skipped = h('div', { rect: [0, 0, 200, 40], css: { contentVisibility: 'hidden' } }, [inner])
  const cut = h('span', { rect: [0, 60, 50, 20], text: 'Cut' })
  const wrap = h('div', { rect: [0, 60, 200, 40], css: { clipPath: 'inset(100%)' } }, [cut])
  doc(h('body', { rect: [0, 0, 1280, 800] }, [skipped, wrap]))
  assert.equal(unseen(inner), true, 'inside a box whose contents are skipped')
  assert.equal(unseen(cut), true, 'inside a box cut away whole')
})

// ── Round 10 (acceptance v5 pick, 30/09/2026; runtime 16) ─────────────────────────────────────────
//
// Acceptance v5 PICK-new-14: empty space picked `<body>`, labelled "Skip to content", at 60 of 150
// grid points on a WordPress home — every WordPress page opens with a skip link, an inline child of
// `body`, so `body` had "content" and won before any section. Content now means content AT the
// pointer: the element's own words whose line boxes hold the point, or the element itself being an
// image or a control. `html` and `body` are never an answer.

/** A skip link as each CMS prints it: an inline child of body, moved off screen until focused. */
const skipLink = (words) =>
  h('a', {
    rect: [-9999, 0, 1, 1],
    textRect: [-9999, 0, 1, 1],
    cls: 'skip-link screen-reader-text',
    attrs: { href: '#main' },
    text: words
  })

/** A hero as the e2e WordPress site printed it: words on the left, empty space on the right. */
function heroBand(y) {
  const heading = h('h1', {
    rect: [80, y + 80, 560, 120],
    textRect: [
      [80, y + 80, 540, 60],
      [80, y + 140, 300, 60]
    ],
    text: 'Building the ground the next industrial'
  })
  const lead = h('p', {
    rect: [80, y + 220, 560, 60],
    textRect: [80, y + 220, 420, 24],
    text: 'Design–build main contractor'
  })
  const copy = h('div', { rect: [80, y + 60, 1120, 260], cls: 'wtb-hero__copy' }, [heading, lead])
  return h('section', { rect: [0, y, 1280, 400], cls: 'wtb-hero' }, [copy])
}

/** A fade carousel whose top slide is transparent (acceptance v5 K11). */
function fadeCarousel(y) {
  const slide = (words, css) =>
    h('div', { rect: [80, y, 600, 200], css }, [
      h('p', { rect: [100, y + 20, 400, 24], textRect: [100, y + 20, 300, 24], text: words })
    ])
  return h('div', { rect: [80, y, 600, 200], cls: 'carousel' }, [
    slide('Slide one', {}),
    slide('Slide two', { opacity: '0' })
  ])
}

/** A custom element with a CLOSED shadow root: its words cannot be read, only its box (K12). */
const closedHost = (y) => h('fx-closed', { rect: [80, y, 300, 80] })

function cmsPage(kind) {
  const nav = h('nav', { rect: [0, 0, 1280, 64] }, [
    h('a', { rect: [100, 20, 80, 24], attrs: { href: '/services/' }, text: 'Services' })
  ])
  const services = h('section', { rect: [0, 1000, 1280, 600], cls: 'services' }, [
    h('h2', { rect: [80, 1040, 800, 40], textRect: [80, 1040, 380, 40], text: 'Four core service lines' }),
    h('div', { rect: [80, 1100, 1120, 400], cls: 'grid' }, [
      h('article', { rect: [80, 1100, 540, 400], cls: 'card' }, [
        h('h3', { rect: [100, 1120, 500, 30], textRect: [100, 1120, 200, 30], text: 'Our own plant' })
      ]),
      h('article', { rect: [660, 1100, 540, 400], cls: 'card' }, [
        h('img', { rect: [680, 1120, 300, 200], alt: 'Crane' })
      ])
    ])
  ])
  const band = h('section', { rect: [0, 1700, 1280, 400] }, [fadeCarousel(1720), closedHost(1960)])
  const footer = h('footer', { rect: [0, 2860, 1280, 140] }, [
    h('p', { rect: [80, 2880, 1120, 20], textRect: [80, 2880, 200, 20], text: 'INN 4003xxxxxx' })
  ])
  const main = h('main', { rect: [0, 64, 1280, 2700], id: 'main' }, [heroBand(64), services, band])
  const inner =
    kind === 'wordpress'
      ? [
          skipLink('Skip to content'),
          h('div', { rect: [0, 0, 1280, 3000], cls: 'wp-site-blocks' }, [
            h('header', { rect: [0, 0, 1280, 64] }, [nav]),
            main,
            footer
          ])
        ]
      : kind === 'joomla'
        ? [
            '\n  ',
            skipLink('Skip to main content'),
            h('div', { rect: [0, 0, 1280, 3000], cls: 't4-wrapper' }, [
              h('div', { rect: [0, 0, 1280, 3000], cls: 't4-content' }, [nav, main, footer])
            ])
          ]
        : [
            skipLink('Skip to content'),
            h('div', { rect: [0, 0, 1280, 3000], id: 'app' }, [nav, main, footer])
          ]
  const body = h('body', { rect: [0, 0, 1280, 3000] }, inner)
  return { document: doc(body), body }
}

for (const kind of ['wordpress', 'joomla', 'emdash'])
  test(`R10 item 1 (${kind}): no point of a grid over the whole page picks body, html or a page-sized wrapper`, () => {
    const { document, body } = cmsPage(kind)
    const roots = []
    for (let x = 20; x < 1280; x += 90)
      for (let y = 10; y < 3000; y += 70) {
        const el = pickAt(x, y, document)
        const wrapper =
          el !== null &&
          (/wp-site-blocks|t4-wrapper|t4-content/.test(el.getAttribute('class') || '') || el.id === 'app')
        if (el === body || el === document.documentElement || wrapper) roots.push([x, y, el.tagName])
      }
    assert.deepEqual(roots, [])
  })

test('R10 item 1: empty space beside the hero words picks the hero copy, not the words and not the page', () => {
  const { document } = cmsPage('wordpress')
  const el = pickAt(1000, 250, document)
  assert.equal(el.getAttribute('class'), 'wtb-hero__copy')
  assert.ok(describe(el).inside.startsWith('Building the ground'), 'the section still says what it holds')
})

test('R10 item 1: a word of the heading, or its second line, picks the heading', () => {
  const { document } = cmsPage('wordpress')
  assert.equal(pickAt(200, 170, document).tagName, 'H1')
  assert.equal(pickAt(250, 225, document).tagName, 'H1', 'second line')
  // Right of the words but inside the heading box: no content under the pointer, the heading is the
  // smallest box that holds it (acceptance v5 K01: "the empty space to the right" picked h1).
  assert.equal(pickAt(600, 170, document).tagName, 'H1')
})

test('R10 item 1: a carousel whose top slide is transparent picks the visible words, or the carousel', () => {
  const { document } = cmsPage('wordpress')
  assert.equal(describe(pickAt(150, 1750, document)).text, 'Slide one')
  assert.equal(pickAt(600, 1880, document).getAttribute('class'), 'carousel')
})

test('R10 item 1: a closed shadow host is picked itself', () => {
  const { document } = cmsPage('wordpress')
  assert.equal(pickAt(150, 2000, document).tagName, 'FX-CLOSED')
})

test('R10 item 1: a card picked on its own padding, never its section or the page', () => {
  const { document } = cmsPage('wordpress')
  assert.equal(pickAt(500, 1400, document).getAttribute('class'), 'card')
  assert.equal(pickAt(640, 1300, document).getAttribute('class'), 'grid', 'the gutter between cards')
})

test('R10 item 4: an element whose id went in a re-render is found again by its words — by its tag when known, else the innermost match', () => {
  // Acceptance v5 PICK-new-2.
  const p = h('p', { rect: [0, 0, 100, 20], text: 'Rendered again without an id' })
  const box = h('div', { rect: [0, 0, 100, 100] }, [
    h('span', { rect: [0, 0, 0, 0], text: 'Other words' }),
    p
  ])
  const document = doc(h('body', { rect: [0, 0, 1280, 4000] }, [box]))
  const saved = { selector: '#gone', text: 'Rendered again without an id', state: 'saved' }
  assert.equal(locate({ ...saved, tag: 'p' }, document).el, p, 'by the tag the pick reported')
  assert.equal(
    locate(saved, document).el,
    p,
    'a tracked item carries no tag: the innermost element with those words'
  )
  assert.equal(locate({ ...saved, selector: 'p#gone' }, document).el, p, 'the id dropped from the last step')
  const twice = doc(
    h('body', { rect: [0, 0, 1280, 4000] }, [
      h('p', { rect: [0, 0, 0, 0], text: 'Rendered again without an id' }),
      h('h2', { rect: [0, 0, 0, 0], text: 'Rendered again without an id' })
    ])
  )
  assert.deepEqual(
    locate(saved, twice),
    { el: null, reason: 'missing' },
    'two with those words: none is a guess'
  )
})
