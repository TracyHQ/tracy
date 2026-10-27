/**
 * `page.text {match}` names the pictures that share a card with the words it finds (`picturesNear`,
 * 09/10/2026). Bench hb's "use the picture of project X, shown lower on this page, as the hero" took 11–17
 * calls on every CMS — curl and a Python parser in bash, each card's record, the contract's image slots —
 * because no read said which picture sits beside a title. The fixtures below are the card shapes of the three
 * Tracy templates (Joomla `article.tb-pcard` with its picture in an aria-hidden link, WordPress `div.wtb-card`
 * with a `figure`, EmDash `article` with a photo frame).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { PICTURES_NEAR_MAX, pageAnswer, parsePage, picturesNear } from '../src/host/page.mjs'

const URL_ = 'http://shop.tracy.test:51710/'

const JOOMLA_CARDS = `<html><body><main><section><div class="tb-projects__grid">
<article class="tb-pcard"><a class="tb-pcard__media" href="/en/projects/a" tabindex="-1" aria-hidden="true"><img src="/images/p/one.png" alt=""></a>
<div class="tb-pcard__body"><p class="tb-pcard__tag">Production · 2025</p><h3 class="tb-pcard__title"><a href="/en/projects/a">Elektra plant</a></h3></div></article>
<article class="tb-pcard"><a class="tb-pcard__media" href="/en/projects/b" tabindex="-1" aria-hidden="true"><img src="/images/p/two.png" alt=""></a>
<div class="tb-pcard__body"><p class="tb-pcard__tag">Infrastructure · 2024</p><h3 class="tb-pcard__title"><a href="/en/projects/b">Vorsino Industrial Park, phase 3</a></h3></div></article>
<article class="tb-pcard"><a class="tb-pcard__media" href="/en/projects/c" tabindex="-1" aria-hidden="true"><img src="/images/p/three.png" alt=""></a>
<div class="tb-pcard__body"><h3 class="tb-pcard__title">Obninsk substation</h3></div></article>
</div><p>Offices in Vorsino and Kaluga.</p></section></main></body></html>`

const WORDPRESS_CARD = `<html><body><main><div class="wp-block-group wtb-card wtb-projects__item">
<figure class="wp-block-image wtb-card__media"><img src="${URL_}wp-content/uploads/2026/09/two.png" alt="Project photo · 4:3"></figure>
<div class="wp-block-group wtb-card__body"><p class="wtb-card__meta">Infrastructure · 2024</p><h3 class="wtb-card__title">Vorsino Industrial Park, phase 3</h3></div>
</div></main></body></html>`

const EMDASH_CARD = `<html><body><main><article class="border"><div class="photo-frame"><img src="/_emdash/api/media/file/01AB.01CD.png" alt="Vorsino Industrial Park, phase 3" class="ng-photo"></div>
<div class="p-6"><div>Infrastructure · 2024</div><h3>Vorsino Industrial Park, phase 3</h3></div></article></main></body></html>`

test("picturesNear: the picture in the card that holds the words, on the three templates' card shapes", () => {
  assert.deepEqual(picturesNear(JOOMLA_CARDS, 'Vorsino', URL_), [
    { near: 'Vorsino Industrial Park, phase 3', src: '/images/p/two.png' }
  ])
  assert.deepEqual(picturesNear(WORDPRESS_CARD, 'phase 3', URL_), [
    {
      near: 'Vorsino Industrial Park, phase 3',
      src: '/wp-content/uploads/2026/09/two.png',
      alt: 'Project photo · 4:3'
    }
  ])
  assert.deepEqual(picturesNear(EMDASH_CARD, 'vorsino industrial', URL_), [
    {
      near: 'Vorsino Industrial Park, phase 3',
      src: '/_emdash/api/media/file/01AB.01CD.png',
      alt: 'Vorsino Industrial Park, phase 3'
    }
  ])
})

test('picturesNear: words outside a card name no picture — an ancestor with more than two pictures is a grid, not a card', () => {
  // "Offices in Vorsino…" sits in the section that holds all three cards: no picture is its.
  const near = picturesNear(JOOMLA_CARDS, 'Offices in Vorsino', URL_)
  assert.deepEqual(near, [])
  // words the page does not carry, an empty match, a page with no picture
  assert.deepEqual(picturesNear(JOOMLA_CARDS, 'nowhere here', URL_), [])
  assert.deepEqual(picturesNear(JOOMLA_CARDS, '   ', URL_), [])
  assert.deepEqual(picturesNear('<main><h3>Vorsino</h3></main>', 'Vorsino', URL_), [])
})

test("picturesNear: a picture in noscript, an inline data: picture and another site's address", () => {
  const html = `<main><article><noscript><img src="/lazy.png"></noscript><img src="data:image/png;base64,AAAA">
<img src="https://cdn.example.com/p/x.png?w=900" alt=" A  photo "><h3>Card title</h3></article></main>`
  assert.deepEqual(picturesNear(html, 'Card title', URL_), [
    { near: 'Card title', src: 'https://cdn.example.com/p/x.png?w=900', alt: 'A photo' }
  ])
  // a lazy loader's data-src is the picture's address
  assert.deepEqual(
    picturesNear('<main><li><img data-src="/l.png"><span>Lazy one</span></li></main>', 'Lazy', URL_),
    [{ near: 'Lazy one', src: '/l.png' }]
  )
})

test(`picturesNear: at most ${PICTURES_NEAR_MAX} pictures, each named once`, () => {
  const cards = Array.from(
    { length: 9 },
    (_, k) =>
      `<article><img src="/p/${k}.png"><h3>Card ${k}</h3></article><article><img src="/p/0.png"><h3>Card again ${k}</h3></article>`
  ).join('')
  const got = picturesNear(`<main>${cards}</main>`, 'Card', URL_)
  assert.equal(got.length, PICTURES_NEAR_MAX)
  assert.equal(new Set(got.map((p) => p.src)).size, got.length)
})

test('page.text {match}: the answer carries pictures only when the match found words that share a card with one', () => {
  const read = parsePage(JOOMLA_CARDS, '/en/', 'joomla')
  assert.equal(read.ok, true)
  const found = /** @type {any} */ (
    pageAnswer(read.page, {
      url: URL_,
      path: '/en/',
      params: { match: 'Vorsino' },
      html: read.html,
      pageUrl: URL_
    })
  )
  assert.deepEqual(found.pictures, [{ near: 'Vorsino Industrial Park, phase 3', src: '/images/p/two.png' }])
  // with the outline too
  const outlined = /** @type {any} */ (
    pageAnswer(read.page, {
      url: URL_,
      path: '/en/',
      params: { match: 'Vorsino', outline: true },
      html: read.html,
      pageUrl: URL_
    })
  )
  assert.deepEqual(outlined.pictures, found.pictures)
  // no match, a match that found nothing, a head read: no pictures key at all
  for (const params of [{}, { match: 'nowhere here' }, { match: 'Vorsino', head: true }]) {
    const a = /** @type {any} */ (
      pageAnswer(read.page, { url: URL_, path: '/en/', params, html: read.html, pageUrl: URL_ })
    )
    assert.equal('pictures' in a, false, JSON.stringify(params))
  }
})

test('a picture an element’s own style paints is the picture beside its words, marked as a background (15/10/2026)', () => {
  // JA Mood's top picture is a T3 masthead's inline background; the only <img> is a lower picture
  const html =
    '<html><body><div class="t3-masthead"><div class="t3-masthead-mask" style="background-image: url(&quot;/images/bg-2.jpg&quot;)"></div>' +
    '<div class="t3-masthead-detail"><h1>Bánh mì mỗi sáng</h1></div></div>' +
    '<div class="m"><img src="/images/hero-2.png" alt="Lower picture"><p>Lower words</p></div>' +
    '<div style="background:#fff url(data:image/png;base64,AAAA)"><p>Inline data</p></div></body></html>'
  assert.deepEqual(picturesNear(html, 'Bánh mì mỗi sáng', 'http://site.test/'), [
    { near: 'Bánh mì mỗi sáng', src: '/images/bg-2.jpg', background: true }
  ])
  assert.deepEqual(picturesNear(html, 'Lower words', 'http://site.test/'), [
    { near: 'Lower words', src: '/images/hero-2.png', alt: 'Lower picture' }
  ])
  // a data: background is no picture of the site
  assert.deepEqual(picturesNear(html, 'Inline data', 'http://site.test/'), [])
})
