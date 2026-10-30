/**
 * A build's words in small structured tasks (`demo-copy.js`, plan "10/10" §7 S5): the pages and the shared words, the
 * checks every block passes before it is kept, the packs, and the run with a model that answers JSON.
 *
 *   node --test apps/tracy-web/test/wo-demo-copy.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  askJson,
  checkBlock,
  copyPagesOf,
  createDemoCopy,
  PAGE_SYSTEM,
  packOf,
  unsourcedFacts
} from '../src/opportunities-build/demo-copy.js'

const blocks = (path, ...texts) => [path, texts.map(([text, kind = 'text']) => ({ text, kind }))]
const pageBlocks = Object.fromEntries([
  blocks(
    '/',
    ['Welcome to Levain', 'heading'],
    ['Bar & Restaurant'],
    ['Book a Table', 'button'],
    ['Call (084) 555-0110'],
    ['© Restaurant 2021']
  ),
  blocks(
    '/about-us/',
    ['Our History', 'heading'],
    ['Founded in 1982 by chef Mario'],
    ['Call (084) 555-0110'],
    ['© Restaurant 2021']
  ),
  blocks(
    '/menu/',
    ['Our Menu', 'heading'],
    ['Baked Squid $56'],
    ['Call (084) 555-0110'],
    ['© Restaurant 2021']
  )
])
const sourced =
  'Levain Bakery 167 West 74th Street New York 917.464.3769 chocolate chip walnut cookie $5.00 8 AM'

test('words on most pages are shared (header, footer); the rest belong to their page', () => {
  const { shared, pages } = copyPagesOf(pageBlocks)
  assert.deepEqual(
    shared.map((b) => b.text),
    ['Call (084) 555-0110', '© Restaurant 2021']
  )
  assert.deepEqual(
    pages.map((p) => [p.path, p.blocks.map((b) => b.text)]),
    [
      ['/', ['Welcome to Levain', 'Bar & Restaurant', 'Book a Table']],
      ['/about-us/', ['Our History', 'Founded in 1982 by chef Mario']],
      ['/menu/', ['Our Menu', 'Baked Squid $56']]
    ]
  )
  // one page alone shares nothing
  assert.equal(copyPagesOf({ '/': [{ text: 'A', kind: 'text' }] }).shared.length, 0)
})

test('a phone, an e-mail, a price or an hour the research does not hold is caught; one it holds passes', () => {
  assert.deepEqual(unsourcedFacts('Call 917.464.3769, open 8 AM', sourced), [])
  assert.deepEqual(unsourcedFacts('Call (084) 555-0110 or mario@example.com, $56', sourced), [
    '(084) 555-0110',
    'mario@example.com',
    '$56'
  ])
  assert.deepEqual(unsourcedFacts('Cookies $5.00 each', sourced), [])
})

test('a block is kept only when it is new words of its size, grounded, and no sample; interface words may stay', () => {
  const heading = { text: 'Welcome to Levain', kind: 'heading' }
  assert.deepEqual(checkBlock(heading, { text: 'Fresh cookies every morning' }, sourced), {
    ok: true,
    text: 'Fresh cookies every morning',
    kept: false
  })
  assert.equal(checkBlock(heading, { text: 'Welcome to Levain' }, sourced).ok, false)
  assert.deepEqual(checkBlock({ text: 'Read more', kind: 'button' }, { text: 'Read more' }, sourced), {
    ok: true,
    text: 'Read more',
    kept: true
  })
  assert.match(checkBlock(heading, { text: 'x'.repeat(200) }, sourced).why, /too long/)
  assert.match(checkBlock(heading, { text: 'Sample heading for the owner' }, sourced).why, /sample/)
  assert.match(
    checkBlock({ text: 'Call us', kind: 'text' }, { text: 'Call (212) 000-1111' }, sourced).why,
    /not in the research/
  )
  assert.equal(checkBlock(heading, { text: '' }, sourced).ok, false)
})

test('an answer becomes a pack of find/replace pairs; what it skipped or failed is an issue with why', () => {
  const page = [
    { n: 0, text: 'Our History', kind: 'heading' },
    { n: 1, text: 'Founded in 1982 by chef Mario', kind: 'text' },
    { n: 2, text: 'Read more', kind: 'button' },
    { n: 3, text: 'Meet the team', kind: 'heading' }
  ]
  const pack = packOf(
    page,
    {
      blocks: [
        { n: 0, text: 'Our story', sourceIds: ['profile'] },
        { n: 1, text: 'Two friends, one six-ounce cookie, since 1995', sourceIds: ['profile'] },
        { n: 2, text: 'Read more' }
      ],
      issues: [{ n: 3, why: 'the research names no team' }]
    },
    sourced
  )
  assert.deepEqual(pack.changes, [
    { find: 'Our History', replace: 'Our story' },
    { find: 'Founded in 1982 by chef Mario', replace: 'Two friends, one six-ounce cookie, since 1995' }
  ])
  assert.equal(pack.kept, 1)
  assert.deepEqual(pack.issues, [{ find: 'Meet the team', why: 'the research names no team' }])
})

test('a run asks a brief, then every page and the shared words in parallel, and a page that fails twice is an issue', async () => {
  const asked = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    const user = JSON.parse(body.messages[1].content)
    asked.push(user.page ?? 'brief')
    const answer = !user.blocks
      ? { voice: 'warm', keyMessages: ['cookies'], pages: [{ path: '/', purpose: 'welcome' }] }
      : user.page === '/menu/'
        ? null
        : {
            blocks: user.blocks.map((b) => ({ n: b.n, text: `New words for ${b.n}`, sourceIds: ['profile'] }))
          }
    if (answer === null) return new Response('busy', { status: 503 })
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(answer) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 }
      })
    )
  }
  const write = createDemoCopy({
    doorFor: async () => ({ apiKey: 'k', baseUrl: 'https://model.test/v1', words: 'deepseek-chat' }),
    fetchImpl
  })
  const copy = await write({ pageBlocks, digest: { business: { name: 'Levain' } }, sourced })
  assert.equal(copy.ok, true)
  assert.equal(asked[0], 'brief')
  assert.deepEqual(Object.keys(copy.pages).sort(), ['*shared*', '/', '/about-us/', '/menu/'])
  assert.equal(copy.pages['/'].changes.length, 3)
  assert.equal(copy.pages['/menu/'].changes.length, 0)
  assert.match(copy.pages['/menu/'].issues[0].why, /not written/)
  assert.equal(asked.filter((p) => p === '/menu/').length, 2, 'a failed page is asked once more')
  assert.ok(copy.usage.calls >= 4)
  // no model, no words, no failure
  const none = createDemoCopy({ doorFor: async () => null })
  assert.deepEqual(await none({ pageBlocks, digest: {}, sourced }), {
    version: 'demo-copy/1',
    ok: false,
    code: 'COPY_MODEL_UNAVAILABLE',
    pages: {}
  })
})

// Local round 35 (26/10/2026): b. patisserie's "$5.25" against the research's `"price": "5.25"` was set aside as
// unsourced; a price the research does not hold still is.
test('a price is held by its amount, whatever currency the research wrote around it', () => {
  const research =
    '{"name": "Kouign Amann Nature", "price": "5.25"}, {"name": "Pain Suisse", "price": "5,75"}'
  assert.deepEqual(unsourcedFacts('Kouign amann $5.25, pain suisse $5.75, croissant $3.95.', research), [
    '$3.95'
  ])
})

// Local round 35: a Joomla bar's menu page of 80-odd blocks came back as JSON cut off, twice; a long page goes in parts.
test('a page longer than one call takes is written in parts and kept as one pack', async () => {
  const sizes = []
  const fetchImpl = async (_url, init) => {
    const user = JSON.parse(JSON.parse(init.body).messages[1].content)
    if (user.blocks) sizes.push([user.page, user.blocks.length])
    const answer = user.blocks
      ? {
          blocks: user.blocks.map((b) => ({
            n: b.n,
            text: `Cocktail number ${b.n} of the house`,
            sourceIds: ['menu']
          }))
        }
      : { voice: 'dark', keyMessages: [], pages: [] }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: {} })
    )
  }
  const write = createDemoCopy({
    doorFor: async () => ({ apiKey: 'k', baseUrl: 'https://model.test/v1', words: 'deepseek-chat' }),
    fetchImpl
  })
  const long = {
    '/menu': Array.from({ length: 85 }, (_, i) => ({
      text: `Template drink ${i} with its notes`,
      kind: 'text'
    }))
  }
  const copy = await write({ pageBlocks: long, digest: {}, sourced: '' })
  assert.deepEqual(
    sizes.sort((a, b) => b[1] - a[1]),
    [
      ['/menu', 40],
      ['/menu', 40],
      ['/menu', 5]
    ]
  )
  assert.equal(copy.pages['/menu'].changes.length, 85)
  assert.deepEqual(
    new Set(copy.pages['/menu'].changes.map((c) => c.find)).size,
    85,
    'every block once, each part numbered as the page is'
  )
})

// Local round 36 (26/10/2026): an EmDash home's buttons to the template's /investors page were written "Order a cake".
test('a button keeps where it goes into the page tasks, shared or not, and the prompt says booking words need it', () => {
  const { shared, pages } = copyPagesOf({
    '/': [
      { text: 'Investor relations', kind: 'button', to: '/investors' },
      { text: 'Call us', kind: 'button', to: 'phone' }
    ],
    '/about/': [
      { text: 'Call us', kind: 'button', to: 'phone' },
      { text: 'Our story', kind: 'heading' }
    ]
  })
  assert.deepEqual(shared, [{ n: 0, text: 'Call us', kind: 'button', to: 'phone', pages: 2 }])
  assert.deepEqual(pages[0].blocks, [{ n: 0, text: 'Investor relations', kind: 'button', to: '/investors' }])
  assert.match(
    PAGE_SYSTEM,
    /booking, reserving or ordering only on a button to the contact page, a phone or an email/
  )
})

// Local round 36 (26/10/2026): deepseek-flash reasons by default and its reasoning ate the budget of a Joomla menu's
// JSON. Every call asks the provider not to reason; one that refuses the field is asked again without it.
test("a copy call switches the model's thinking off, and asks again without the field when a provider refuses it", async () => {
  const bodies = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    bodies.push(body)
    if (body.reasoning) return new Response('unknown field', { status: 400 })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: {} }))
  }
  const deepseek = await askJson({
    door: { apiKey: 'k', baseUrl: 'https://api.deepseek.com', words: 'deepseek-flash' },
    system: 's',
    user: {},
    fetchImpl
  })
  assert.deepEqual(deepseek.value, { ok: true })
  assert.deepEqual(bodies[0].thinking, { type: 'disabled' })
  bodies.length = 0
  await askJson({
    door: { apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1', words: 'x' },
    system: 's',
    user: {},
    fetchImpl
  })
  assert.deepEqual(
    bodies.map((b) => b.reasoning ?? null),
    [{ enabled: false }, null]
  )
})

test('copy packs leave article routes, bodies, titles and list excerpts to the native editorial writer', () => {
  const blocks = {
    '/': [
      { text: 'Our latest baking story', kind: 'heading' },
      { text: 'The original article paragraph', kind: 'text' },
      { text: 'Welcome to the bakery', kind: 'heading' }
    ],
    '/story/': [
      { text: 'Our latest baking story', kind: 'heading' },
      { text: 'The original article paragraph', kind: 'text' }
    ],
    '/news/': [
      { text: 'Our latest baking story', kind: 'heading' },
      { text: 'The original article paragraph', kind: 'text' }
    ]
  }
  const editorialRecords = [
    {
      identity: { kind: 'post' },
      data: {
        post_type: 'post',
        post_title: 'Our latest baking story',
        post_content: '<p>The original article paragraph, with more text.</p>'
      },
      routes: ['/story/']
    }
  ]
  const out = copyPagesOf(blocks, { editorialRecords })
  assert.deepEqual(out.shared, [])
  assert.deepEqual(out.pages, [
    { path: '/', blocks: [{ n: 0, text: 'Welcome to the bakery', kind: 'heading' }] }
  ])
})

test('a repeated line on one page is counted once when identifying shared header and footer words', () => {
  const out = copyPagesOf({
    '/': Array.from({ length: 5 }, () => ({ text: 'One page only', kind: 'text' })),
    '/about': [{ text: 'Another page', kind: 'text' }]
  })
  assert.deepEqual(out.shared, [])
})

// Local measure 28/10/2026: Death & Co's home showed the same cocktails under Zero Proof, Cocktails and Desserts.
test('a menu item is placed once a page: a block citing one already used becomes an issue', () => {
  const page = [
    { n: 0, text: 'Template drink one', kind: 'text' },
    { n: 1, text: 'Template drink two', kind: 'text' },
    { n: 2, text: 'Template dessert', kind: 'text' },
    { n: 3, text: 'Our story in one line', kind: 'text' }
  ]
  const pack = packOf(
    page,
    {
      blocks: [
        { n: 0, text: 'Hinoki Woods, a gin cocktail', sourceIds: ['menu:3'] },
        { n: 1, text: 'Loud Silence, a mezcal cocktail', sourceIds: ['menu:4'] },
        { n: 2, text: 'Hinoki Woods again, as a dessert', sourceIds: ['menu:3'] },
        { n: 3, text: 'A cocktail bar since 2006', sourceIds: ['profile', 'review:1'] }
      ]
    },
    ''
  )
  assert.deepEqual(
    pack.changes.map((c) => c.find),
    ['Template drink one', 'Template drink two', 'Our story in one line']
  )
  assert.deepEqual(pack.issues, [
    { find: 'Template dessert', why: 'this menu item is already shown on this page' }
  ])
  assert.match(PAGE_SYSTEM, /at most once on the page/)
})

test("a page's parts are written one after another, each told the menu items used before it", async () => {
  const asked = []
  let open = 0
  let most = 0
  const fetchImpl = async (_url, init) => {
    const user = JSON.parse(JSON.parse(init.body).messages[1].content)
    if (user.blocks) {
      asked.push({ page: user.page, first: user.blocks[0].n, alreadyShown: user.alreadyShown ?? [] })
      open++
      most = Math.max(most, open)
      await new Promise((r) => setTimeout(r, 10))
      open--
    }
    // Every part answers with the same three menu items, then lines of no item.
    const answer = user.blocks
      ? {
          blocks: user.blocks.map((b, i) => ({
            n: b.n,
            text: `House line ${b.n}`,
            sourceIds: i < 3 ? [`menu:${i}`] : []
          }))
        }
      : { voice: 'dark', keyMessages: [], pages: [] }
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: {} })
    )
  }
  const write = createDemoCopy({
    doorFor: async () => ({ apiKey: 'k', baseUrl: 'https://model.test/v1', words: 'deepseek-chat' }),
    fetchImpl
  })
  const long = {
    '/': Array.from({ length: 85 }, (_, i) => ({ text: `Template line ${i} of the home`, kind: 'text' }))
  }
  const copy = await write({ pageBlocks: long, digest: {}, sourced: '' })
  const parts = asked.filter((a) => a.page === '/')
  assert.equal(most, 1, 'one page, one part at a time')
  assert.deepEqual(
    parts.map((p) => [p.first, p.alreadyShown]),
    [
      [0, []],
      [40, ['menu:0', 'menu:1', 'menu:2']],
      [80, ['menu:0', 'menu:1', 'menu:2']]
    ]
  )
  // The later parts' repeats are issues, never placed twice.
  assert.equal(copy.pages['/'].changes.length, 85 - 6)
  assert.equal(copy.pages['/'].issues.filter((i) => /already shown/.test(i.why)).length, 6)
})
