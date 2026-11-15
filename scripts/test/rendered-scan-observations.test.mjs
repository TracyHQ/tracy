// What the demo scan reads of a rendered page, with no browser (ticket #585). Invented page only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { observationsFromHtml } from '../ai-quickstart/rendered-scan.mjs'

const HTML = `<!doctype html><html><head><title>Tide Table</title>
<meta name="description" content="Rowing lessons on the bay"><meta name="author" content="Bay Writer">
<meta name="keywords" content="rowing, bay"><meta property="og:title" content="Share title">
<meta name="twitter:description" content="Tweet words"><meta property="og:image" content="/images/share.jpg">
<meta name="viewport" content="width=device-width">
<script type="application/ld+json">{"@type":"Organization","name":"Ld Name","logo":"/images/ld-logo.png"}</script>
<style>.x{content:"style words"}</style></head><body>
<nav class="megamenu"><a href="/lessons" title="Link title">Lessons</a></nav>
<p>Split <strong>by inline</strong> tags</p><div>Own words<p>Nested block</p></div>
<img src="/images/a.jpg" srcset="/images/a-2x.jpg 2x, /images/a-3x.jpg 3x" alt="Alt words" aria-label="Aria words">
<picture><source srcset="/images/b.webp"></picture><video poster="/images/poster.jpg" src="/media/clip.mp4"></video>
<input placeholder="Your boat" value="typed"><input type="submit" value="Send it"><button value="Button value">Go</button>
<section style="background-image:url('/images/bg.jpg')"></section>
<script>var hidden = "script words"</script><template><p>Template words</p></template>
<div hidden>Hidden words stay</div><a href="#top">Up</a>
</body></html>`

const obs = observationsFromHtml(HTML)
const values = (kind) => obs.filter((o) => o.kind === kind).map((o) => o.value)

test('the words of body blocks are read, inline tags joined, nested blocks apart, hidden ones too', () => {
  const text = values('text')
  for (const t of ['Split by inline tags', 'Own words', 'Nested block', 'Hidden words stay', 'Lessons'])
    assert.ok(text.includes(t), t)
  for (const t of ['script words', 'style words', 'Template words'])
    assert.ok(!obs.some((o) => o.value.includes(t)), t)
})

test('head words: title, description, author, keywords, og and twitter, JSON-LD values', () => {
  assert.deepEqual(values('title'), ['Tide Table'])
  assert.deepEqual(values('meta'), [
    'Rowing lessons on the bay',
    'Bay Writer',
    'rowing, bay',
    'Share title',
    'Tweet words'
  ])
  assert.ok(values('jsonld').includes('Ld Name'))
})

test('attributes a visitor or a reader is given: alt, title, aria-label, placeholder, button values', () => {
  const attr = values('attr')
  for (const t of ['Alt words', 'Link title', 'Aria words', 'Your boat', 'Send it', 'Button value'])
    assert.ok(attr.includes(t), t)
  assert.ok(!attr.includes('typed'), 'a text field value is what someone typed, not a label')
})

test('every picture address: img src and srcset, picture source, video, inline background, og and JSON-LD', () => {
  const images = values('image')
  for (const u of [
    '/images/a.jpg',
    '/images/a-2x.jpg',
    '/images/a-3x.jpg',
    '/images/b.webp',
    '/images/poster.jpg',
    '/media/clip.mp4',
    '/images/bg.jpg',
    '/images/share.jpg',
    '/images/ld-logo.png'
  ])
    assert.ok(images.includes(u), u)
})

test('every link, and each place is one the built site check keeps (element, menu, at most 40 characters)', () => {
  assert.deepEqual(values('href'), ['/lessons', '#top'])
  assert.deepEqual(obs.find((o) => o.kind === 'href').place, { element: 'a[href]', menu: true })
  for (const o of obs) {
    assert.ok(Object.keys(o.place).every((k) => ['element', 'menu'].includes(k)))
    assert.ok([...o.place.element].length <= 40)
  }
})

test('a fragment with no html or body is read as a body', () => {
  assert.deepEqual(
    observationsFromHtml('<p>Just a fragment here</p>').map((o) => [o.kind, o.value]),
    [
      ['text', 'Just a fragment here'],
      ['block', 'Just a fragment here']
    ]
  )
})
