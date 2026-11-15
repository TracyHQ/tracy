// Website text is read with its character references decoded once, where it enters (#609: a price row of a real run
// reached the plan card as "...&rsquo;s Shirt"). Every later step (the reading, the needs profile, the plan) sees
// real characters; a reference written as text stays text; decoded markup is text, never a tag. Invented pages only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-website-text-entities.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeEntities, extractPage } from '../domain/website-crawler.mjs'
import { renderedPagesResult } from '../domain/website-browser.mjs'

const PAGE = `<!doctype html><html><head><title>Ottermere&rsquo;s Rowing Club</title>
<meta name="description" content="Rowing on the lake &middot; since 1990."></head>
<body><main><h2>Membership</h2><p>One month membership, Ottermere&rsquo;s Shirt, &ldquo;Lake&rdquo; caps &hellip;</p>
<p>Write &amp;rsquo; to type an apostrophe. Our &lt;b&gt;bold&lt;/b&gt; offer.</p></main></body></html>`

test('every HTML5 name is read in the page text, its title and its attributes', () => {
  const page = extractPage(PAGE, 'https://ottermere.example.test/')
  assert.equal(page.title, 'Ottermere’s Rowing Club')
  assert.match(page.text, /Ottermere’s Shirt, “Lake” caps …/)
  assert.equal(page.description, 'Rowing on the lake · since 1990.')
  const read = `${page.title} ${page.text.split('Write')[0]} ${page.description}`
  assert.doesNotMatch(read, /&(rsquo|ldquo|rdquo|hellip|middot);/)
})

test('decoded once: a reference written as text stays text, and decoded markup is text, not a tag', () => {
  const page = extractPage(PAGE, 'https://ottermere.example.test/')
  assert.match(page.text, /Write &rsquo; to type an apostrophe\./)
  assert.match(page.text, /Our <b>bold<\/b> offer\./)
  assert.equal(decodeEntities('&amp;amp;'), '&amp;')
  assert.equal(decodeEntities('&nbsp;'), ' ')
  assert.equal(decodeEntities('&notaname; &#x2019;'), '&notaname; ’')
})

test('a page a browser rendered reaches the research decoded too', () => {
  const base = { pages: [], socials: {}, menus: [], media: [], profile: {} }
  const result = renderedPagesResult([{ url: 'https://ottermere.example.test/', html: PAGE }], base)
  assert.match(result.pages[0].text, /Ottermere’s Shirt/)
  assert.equal(result.profile.name, 'Ottermere’s Rowing Club')
})
