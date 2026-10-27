import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentHtml, homeContent, rewriteLinks } from '../src/t4-content.mjs'

test('T4 content omits the unshipped section placeholder and keeps customer images', () => {
  const html = contentHtml(
    '<section><h2>Our coffee</h2><img src="/wp-content/themes/tracy/assets/img/hero-placeholder.svg" alt=""><img src="/images/coffee.jpg" alt="Coffee"><img src="https://example.com/cafe.jpg" alt="Café"></section>'
  )
  assert(!html.includes('hero-placeholder'))
  assert(html.includes('<h2>Our coffee</h2>'))
  assert(html.includes('src="/images/coffee.jpg"'))
  assert(html.includes('src="https://example.com/cafe.jpg"'))
})

test('home mapping retains all customer sections, images, links and extra hero copy in order', () => {
  const home = homeContent(
    '<header><nav>Preview navigation</nav></header><main><section id="hero"><h1>Harbor Coffee</h1><p>Fresh every morning</p><a href="/contact/">Visit us</a><p>Roasted here since 2018.</p></section><section id="menu"><h2>Our menu</h2><div class="cards"><article><h3>Espresso</h3><p>Rich and smooth</p></article><article><h3>Pastry</h3><p>Baked daily</p></article></div></section><section id="visit"><h2>Visit the harbor</h2><img src="https://example.com/cafe.jpg" alt="Our café"><a href="/index.php/contact">Directions</a></section></main><footer>Preview footer</footer>'
  )
  assert.equal(home.title, 'Harbor Coffee')
  assert.equal(home.lead, 'Fresh every morning')
  assert.deepEqual(home.action, { text: 'Visit us', href: '/contact/' })
  assert.deepEqual(
    home.sections.map((s) => s.key),
    ['hero', 'menu', 'visit']
  )
  const html = home.sections.map((s) => s.html).join('')
  for (const text of [
    'Roasted here since 2018.',
    'Our menu',
    'Espresso',
    'Baked daily',
    'Visit the harbor',
    'Our café'
  ])
    assert(html.includes(text))
  assert(!html.includes('Preview'))
  assert(!html.includes('<h1>'))
  assert(html.includes('tracy-seeded-grid'))
})
test('content removes executable behavior and resolves links to the edition menu', () => {
  const html = contentHtml(
    '<section onclick="evil()"><script>bad()</script><a href="javascript:evil()">Unsafe</a><a href="/index.php/contact#map">Contact</a><a href="/pricing/">Pricing</a><a href="https://example.com">External</a><img src="/images/cafe.jpg" onerror="evil()"></section>'
  )
  const result = rewriteLinks(html, { 'contact:fr': 305 }, 'fr')
  assert(result.includes('href="index.php?Itemid=305#map"'))
  assert(result.includes('href="https://example.com"'))
  assert(!result.includes('href="/pricing/"'))
  assert(!/onclick|onerror|javascript:|<script/.test(result))
})
