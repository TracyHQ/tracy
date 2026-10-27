/**
 * Drafting a Design inspiration card off the demo. The two halves that can be wrong quietly: which
 * pages become layouts, and what they are keyed by — a key names the picture, so a bad one is
 * refused by the store only after the browser has already taken the shot.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DRAFT_MAX_LAYOUTS, judgeCard, layoutKey, layoutsFrom } from '../src/lib/card-draft.js'
import { DESIGN_CATEGORIES } from '../src/lib/design-inspiration.js'

test('a layout is keyed by its path, because a label is written for humans', () => {
  assert.equal(layoutKey('Home', '/', 0), 'home')
  assert.equal(layoutKey('Boutique Stays', '/boutique-stays', 1), 'boutique-stays')
  assert.equal(layoutKey('The Journal', '/pages/blog', 2), 'pages-blog')
  // ⚠ MEASURED WHILE BUILDING THIS. A Vietnamese menu item slugs to a valid key and a meaningless
  // one; its path already said what the page is.
  assert.equal(layoutKey('Về chúng tôi', '/company/about', 3), 'company-about')
  // A Joomla with SEF off addresses pages by query, and the extractor keeps it — same pathname,
  // different page — so the key carries it too rather than six layouts all called `home`.
  assert.equal(layoutKey('Contact', '/?option=com-contact&id=7', 4), 'option-com-contact-id-7')
  // Nothing usable in either: the position. Ugly and always valid, which beats dropping a page.
  assert.equal(layoutKey('«»', '/', 4), 'home')
  assert.equal(layoutKey('«»', '«»', 4), 'page-5')
})

test('the layouts are the demo’s own menu, capped, with nothing listed twice', () => {
  const links = [
    { label: 'Home', path: '/' },
    { label: 'Experiences', path: '/experiences' },
    { label: 'Pricing', path: '/pricing' },
    { label: 'Destinations', path: '/pages/all-categories' },
    { label: 'Boutique Stays', path: '/boutique-stays' },
    { label: 'Travel Guides', path: '/resources/travel-guides' },
    { label: 'The Journal', path: '/pages/blog' },
    { label: 'Careers', path: '/careers' }
  ]
  const layouts = layoutsFrom(links)
  // ⚠ CAPPED FOR A REASON THAT COSTS MINUTES. Every layout is two screenshots taken one at a time;
  // ja-voyara's real menu is 16 items — 32 shots. Six pages is a card.
  assert.equal(layouts.length, DRAFT_MAX_LAYOUTS)
  assert.deepEqual(
    layouts.map((l) => l.key),
    ['home', 'experiences', 'pricing', 'pages-all-categories', 'boutique-stays', 'resources-travel-guides']
  )
  assert.deepEqual(layouts[0], { key: 'home', label: 'Home', path: '/', shots: {} })
})

test('a link that is not a path on this site never becomes a layout', () => {
  const layouts = layoutsFrom([
    { label: 'Home', path: '/' },
    { label: 'Facebook', path: 'https://facebook.com/x' },
    { label: 'Home again', path: '/' },
    { label: 'Nothing', path: null },
    { label: 'About', path: '/about' }
  ])
  assert.deepEqual(
    layouts.map((l) => l.path),
    ['/', '/about'],
    'only same-site paths, and one page is one layout'
  )
})

test('no model is an answer, not a failure — and it says which', async () => {
  const judged = await judgeCard({ outline: { links: [] }, label: 'x', platform: 'joomla', model: null })
  assert.deepEqual([judged.category, judged.blurb], [null, null])
  assert.match(judged.why, /no model/)
})

test('a category the model invented is dropped, never rounded to the nearest', async () => {
  const answering = (content) => async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
  const model = { apiKey: 'k', baseUrl: 'https://model.test', words: 'm' }
  const outline = { links: [{ label: 'Home', path: '/' }], title: 'T', text: 'x' }

  const good = await judgeCard({
    outline,
    label: 'x',
    platform: 'joomla',
    model,
    fetchImpl: answering(JSON.stringify({ category: DESIGN_CATEGORIES[0], blurb: 'A site.' }))
  })
  assert.equal(good.category, DESIGN_CATEGORIES[0])
  assert.equal(good.blurb, 'A site.')

  // 🔒 The list is closed and the filter is built on it. A near-miss that passed through would fail
  // at publish, or worse be corrected to something nobody chose.
  const invented = await judgeCard({
    outline,
    label: 'x',
    platform: 'joomla',
    model,
    fetchImpl: answering(JSON.stringify({ category: 'Travel & Hospitality', blurb: 'A site.' }))
  })
  assert.equal(invented.category, null)
  assert.equal(invented.blurb, 'A site.', 'one bad field does not throw the other away')
  // What it suggested is shown rather than swallowed: a person picking from 22 options is helped
  // by knowing the machine said "Travel & Hospitality", even though that is not one of ours.
  assert.match(invented.why, /Travel & Hospitality/)

  // ⚠ MEASURED 17/09 ON llama-3.1-8b: told to pick from a numbered list it answered
  // `"21. Themed & Unique"` — the number and the text TOGETHER, and disagreeing (21 is not that
  // line). The words are what it meant; the digit indexes an order it cannot see.
  const both = await judgeCard({
    outline,
    label: 'x',
    platform: 'joomla',
    model,
    fetchImpl: answering(JSON.stringify({ category: `21. ${DESIGN_CATEGORIES[0]}`, blurb: 'A site.' }))
  })
  assert.equal(both.category, DESIGN_CATEGORIES[0], 'the text wins over the digit beside it')

  // A bare number is still a choice, and the only reading of it.
  const numbered = await judgeCard({
    outline,
    label: 'x',
    platform: 'joomla',
    model,
    fetchImpl: answering(JSON.stringify({ category: '2', blurb: 'A site.' }))
  })
  assert.equal(numbered.category, DESIGN_CATEGORIES[1])

  const rubbish = await judgeCard({
    outline,
    label: 'x',
    platform: 'joomla',
    model,
    fetchImpl: answering('I think this is a travel site!')
  })
  assert.deepEqual([rubbish.category, rubbish.blurb], [null, null])
  assert.match(rubbish.why, /did not answer with JSON/)
})

test('a menu entry with a dropdown carries the pages it stands for', () => {
  const [product, about] = layoutsFrom([
    { label: 'Product', path: '/product', count: 6 },
    { label: 'About', path: '/about', count: 1 }
  ])
  assert.equal(product.count, 6)
  // "one of 1" is noise on a card, so an entry with only its own page carries no count at all.
  assert.equal('count' in about, false)
})

test('a count the demo did not measure is not invented', () => {
  for (const bad of [undefined, null, 0, 1, -3, 2.5, '6']) {
    const [only] = layoutsFrom([{ label: 'Blog', path: '/blog', count: bad }])
    assert.equal('count' in only, false, `count ${JSON.stringify(bad)} must not reach the card`)
  }
})

test('a layout keeps WHERE it answers beside WHICH page it is, and only when the two differ', () => {
  // The outline strips `/index.php` so two links to one page cannot become two layouts — right for
  // identity, wrong as an address. A Joomla demo running SEF without rewriting serves only the
  // unstripped form, so the draft carries both and neither has to stand in for the other.
  const [home, services] = layoutsFrom([
    { label: 'Home', path: '/', address: '/index.php' },
    { label: 'Our Services', path: '/our-services', address: '/index.php/our-services' }
  ])
  assert.equal(services.path, '/our-services', 'the path still names the page')
  assert.equal(services.address, '/index.php/our-services', 'and the address says where it answers')
  assert.equal(home.key, 'home')
  assert.equal(home.address, '/index.php', 'home differs too — it is only served because / is as well')

  // A site whose pretty paths ARE its addresses writes nothing extra: WordPress, EmDash, and any
  // Joomla with rewriting on read exactly as they did before this field existed.
  const [plain] = layoutsFrom([{ label: 'Blog', path: '/blog' }])
  assert.equal('address' in plain, false)
  const [same] = layoutsFrom([{ label: 'Blog', path: '/blog', address: '/blog' }])
  assert.equal('address' in same, false, 'an address equal to the path is not a second fact')

  // Anything that is not a path is not an address, and the layout is still a layout without one.
  for (const bad of ['https://elsewhere.test/blog', 'blog', '', 7, null, {}]) {
    const [one] = layoutsFrom([{ label: 'Blog', path: '/blog', address: bad }])
    assert.equal('address' in one, false, JSON.stringify(bad))
    assert.equal(one.path, '/blog')
  }
})

test('a model that never answers is given up on, and says so', async (t) => {
  // The fake fetch has no socket to keep Node alive for AbortSignal.timeout's unreferenced timer.
  const pendingSocket = setInterval(() => {}, 1000)
  t.after(() => clearInterval(pendingSocket))
  const started = Date.now()
  const judged = await judgeCard({
    outline: { links: [] },
    label: 'x',
    platform: 'joomla',
    model: { baseUrl: 'https://model.test/v1', apiKey: 'k', words: 'm' },
    timeoutMs: 30,
    // Answers only when its signal gives up, the way a real fetch does.
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      )
  })
  assert.ok(Date.now() - started < 2000)
  assert.deepEqual(judged, { category: null, blurb: null, why: 'the model did not answer in time' })
})
