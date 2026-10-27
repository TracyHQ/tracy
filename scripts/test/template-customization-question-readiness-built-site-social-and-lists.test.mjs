/**
 * Two blind spots of the Template Customization Question Readiness built-site check measured on the g60 builds (11/10/2026):
 * - K6 keeps a social button with its link emptied, and a template may then render it without an
 *   `<a>` (Tracy Business prints `<span>Telegram</span>`): the count must see it;
 * - a BLANK article list whose selection is not stable (ordered by hits, random, or tied dates —
 *   Joomla "Articles - Latest", "Trending") shows other demo articles than the demo did: that is a
 *   selection, not a rewrite, and a social card loses its handle line with its link (K6).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { blockChanges } from '../lib/template-customization-question-readiness-built-site/content.mjs'
import { socialItems } from '../lib/template-customization-question-readiness-built-site/links.mjs'
import { documentOf } from '../lib/template-customization-question-readiness-built-site/text.mjs'

test('social items: chips without a link count, an icon counts once, a list of them is not one item', () => {
  const demo = documentOf(
    '<body><footer><div class="flex"><a href="https://t.me/northgate">Telegram</a><a href="https://vk.com/northgate">VK</a><a href="https://linkedin.com/company/n">LinkedIn</a></div></footer></body>'
  )
  const kept = documentOf(
    '<body><footer><div class="flex"><span class="chip">Telegram</span><span class="chip">VK</span><span class="chip">LinkedIn</span></div></footer></body>'
  )
  const icons = documentOf(
    '<body><ul class="icons"><li><span class="fa fa-facebook"></span></li><li><i class="bi-instagram" aria-hidden="true"></i></li><li><a href="#" aria-label="X"><svg><title>X</title></svg></a></li></ul></body>'
  )
  const prose = documentOf(
    '<body><main><p>Follow us on Telegram and VK for news.</p><h2>Telegram</h2></main></body>'
  )
  assert.equal(socialItems(demo).length, 3)
  assert.equal(socialItems(kept).length, 3, 'a chip whose link was emptied is still a social button')
  assert.equal(socialItems(icons).length, 3, 'icon classes and a labelled link, one each')
  assert.equal(socialItems(prose).length, 0, 'a sentence or a heading naming a network is not a button')
})

test('BLANK: a list showing other demo articles is a selection; a rewritten title is still a change', () => {
  const titles = new Map([
    ['/blog/harmony-in-lines', 'Harmony in Lines: Balancing Elements'],
    ['/blog/whimsical-wonders', 'Whimsical Wonders: Imaginative Creations'],
    ['/blog/fluid-lines', 'Fluid Lines, Infinite Possibilities']
  ])
  // Each item also prints its category, and a tag list links the same article by another route.
  const list = (/** @type {string[]} */ items) =>
    documentOf(
      `<body><main><div class="t4-module"><h3>Trending</h3><ul>${items
        .map((i) => {
          const [href, title, category] = i.split('|')
          return `<li><h4><a href="${href}">${title}</a></h4><a class="category" href="/category/${(category ?? 'design').toLowerCase()}">${category ?? 'Design tpl'}</a><span>June 9, 2023</span></li>`
        })
        .join('')}</ul></div></main></body>`
    )
  const demo = list([
    '/blog/harmony-in-lines|Harmony in Lines: Balancing Elements|Health tpl',
    '/blog/fluid-lines|Fluid Lines, Infinite Possibilities'
  ])
  const reordered = list([
    '/tags/12-whimsical-wonders|Whimsical Wonders: Imaginative Creations|Fashion',
    '/blog/fluid-lines|Fluid Lines, Infinite Possibilities'
  ])
  const rewritten = list([
    '/blog/harmony-in-lines|Sourdough Secrets for Every Morning',
    '/blog/fluid-lines|Fluid Lines, Infinite Possibilities'
  ])
  const names = ['Tamarind Bakery', 'JA Essence']
  assert.deepEqual(blockChanges(reordered, demo, names, 3, { titles }), [])
  assert.match(blockChanges(rewritten, demo, names, 3, { titles }).join('\n'), /sourdough/)
  // BLANK swaps the name inside a title too: the demo's "Northgate wins" is the site's "Tamarind Bakery wins".
  const news = new Map([['/news/wins', 'Tamarind Bakery wins the Zavolzhye-2 tender']])
  const before = list(['/news/wins|Northgate wins the Zavolzhye-2 tender', '/news/other|Other news'])
  const after = list(['/news/wins|Tamarind Bakery wins the Zavolzhye-2 tender', '/news/other|Other news'])
  assert.deepEqual(blockChanges(after, before, ['Tamarind Bakery', 'Northgate'], 3, { titles: news }), [])
})

test('BLANK: the handle line of a social card goes with its link (K6)', () => {
  const demo = documentOf(
    '<body><main><section class="grid"><a href="https://t.me/northgate_ind"><span>Telegram</span><span>@northgate_ind</span><span>Site progress and tender news</span><span>t.me/northgate_ind</span></a><a href="https://linkedin.com/company/northgate-industrial"><span>LinkedIn</span><span>/company/northgate-industrial</span><span>Corporate updates</span></a><a href="https://hh.ru/employer/northgate"><span>HeadHunter</span><span>hh.ru/employer/northgate</span><span>Open roles</span></a></section></main></body>'
  )
  const kept = documentOf(
    '<body><main><section class="grid"><div><span>Telegram</span><span>Site progress and tender news</span></div><div><span>LinkedIn</span><span>Corporate updates</span></div><div><span>HeadHunter</span><span>Open roles</span></div></section></main></body>'
  )
  const rewritten = documentOf(
    '<body><main><section class="grid"><div><span>Telegram</span><span>Fresh loaves every morning</span></div><div><span>LinkedIn</span><span>Corporate updates</span></div><div><span>HeadHunter</span><span>Open roles</span></div></section></main></body>'
  )
  const names = ['Tamarind Bakery', 'Northgate Industrial', 'Northgate']
  assert.deepEqual(blockChanges(kept, demo, names), [])
  // A chip whose label is the address itself is a label, not a handle line: it stays on both sides.
  const chip = (/** @type {string} */ tag) =>
    documentOf(
      `<body><footer><${tag}${tag === 'a' ? ' href="https://hh.ru/employer/1"' : ''}>hh.ru</${tag}><${tag}${tag === 'a' ? ' href="https://vk.com/ng"' : ''}>VK</${tag}><p>Open roles every week</p></footer></body>`
    )
  assert.deepEqual(blockChanges(chip('span'), chip('a'), names, 2), [])
  assert.match(blockChanges(rewritten, demo, names).join('\n'), /fresh loaves/)
})
