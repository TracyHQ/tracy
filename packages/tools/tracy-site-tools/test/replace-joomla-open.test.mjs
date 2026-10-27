/**
 * The replace job on an OPEN Joomla site (no bound contract, `replace-joomla-open.mjs`): a two-language
 * Cassiopeia site driven through a fake component that answers like claude-cowork `joomla/cowork`
 * (`fixtures/replace/fake-joomla-open.mjs`: summary lists, whole rows, whitelisted writes, an undo log
 * per apply_id) and whose pages are rendered from its own rows. Nothing here touches a site.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { RECEIPT_MAX_BYTES, REPLACE_NEXT, planReplace } from '../src/host/replace.mjs'
import {
  JOOMLA_OPEN_NEXT,
  JOOMLA_OPEN_WHY,
  JOOMLA_WORD_PARAMS,
  joText,
  menuItemIdOf,
  moduleIdOf,
  pageFactsOf,
  positionRegion,
  replaceOnJoomlaOpen,
  routeOf
} from '../src/host/replace-joomla-open.mjs'

import { ACM_HERO, SITE, WRITABLE, component } from './fixtures/replace/fake-joomla-open.mjs'

/**
 * One call of the job, as IX2 runs it: planReplace first, then the engine with the fake door.
 * @param {Record<string, unknown>} params
 * @param {{ site?: ReturnType<typeof component>, confirmed?: boolean, verify?: boolean,
 *   pageHtml?: (path: string) => Promise<any>,
 *   write?: (site: ReturnType<typeof component>) => (action: string, params: Record<string, any>) => Promise<any> }} [options]
 */
async function run(params, options = {}) {
  const site = options.site ?? component()
  const plan = planReplace(params)
  assert.equal(plan.ok, true, JSON.stringify(plan))
  let n = 0
  const out = /** @type {any} */ (
    await replaceOnJoomlaOpen({
      plan,
      read: site.door,
      write: options.write ? options.write(site) : site.door,
      pageHtml: options.pageHtml ?? site.pageHtml,
      mintApplyId: () => `replace-test-${(n += 1)}`,
      confirmed: options.confirmed,
      verify: options.verify ?? false
    })
  )
  return { out, site }
}

/** @param {any} out */
const placesOf = (out) =>
  (out.changed ?? out.would ?? out.candidates ?? []).map((/** @type {any} */ w) => w.at)
/** @param {ReturnType<typeof component>} site */
const writesOf = (site) => site.writes().map((w) => `${w.kind}:${w.id}`)
/** The row a kind holds now. @param {ReturnType<typeof component>} site @param {string} kind @param {number} id */
const rowOf = (site, kind, id) => /** @type {Record<string, any>} */ (site.db[kind].get(id))
/** The row the site started with. @param {string} kind @param {number} id */
const seeded = (kind, id) =>
  /** @type {Record<string, any>[]} */ (/** @type {any} */ (SITE)[kind]).find(
    (r) => Number(r[kind === 'language' ? 'lang_id' : 'id']) === id
  )

// ── Where the words live (dryRun, nothing written) ───────────────────────────────────────────────

/** [path, params, verdict, places] — every kind of place an open Cassiopeia site has. */
const TABLE = [
  // an article's own words, its title on a listing, a heading on two lines
  [
    '/en/',
    { find: 'We clean factories, warehouses and offices across the region.' },
    'WRITE',
    ['article:1.introtext#p']
  ],
  ['/en/news', { find: 'Spring cleaning offer' }, 'WRITE', ['article:5.title']],
  ['/en/about', { find: 'Our team and our values' }, 'WRITE', ['article:2.introtext#h2']],
  // a custom module (by its `mod-custom<id>`), its title printed by the card chrome (no id)
  ['/en/', { find: '© 2026 Acme Works. All rights reserved.' }, 'WRITE', ['module:90.content#p.2']],
  ['/en/', { find: 'Opening hours' }, 'WRITE', ['module:91.title']],
  // a menu label (`item-<id>`), the page's own heading and the breadcrumb's home text (params)
  ['/en/', { find: 'News' }, 'WRITE', ['menuItem:104.title']],
  ['/en/about', { find: 'Who we are' }, 'WRITE', ['menuItem:102.params:page_heading']],
  ['/en/about', { find: 'Start' }, 'WRITE', ['module:95.params:homeText']],
  // the brand Cassiopeia prints from its template style, a category's description
  ['/en/', { find: 'Acme Works', where: 'header' }, 'WRITE', ['templateStyle:11.params:siteTitle']],
  [
    '/en/',
    { find: 'Industrial cleaning since 1998 - Hanoi' },
    'WRITE',
    ['templateStyle:11.params:siteDescription']
  ],
  ['/en/news', { find: 'What we are up to this season.' }, 'WRITE', ['category:8.description#p']],
  // the page's language only: the French menu item, never the English one of the same title
  ['/fr/contact', { find: 'Contact', where: 'header' }, 'WRITE', ['menuItem:203.title']],
  // two places on the page, and the two of one title (the menu label, the article heading)
  ['/en/', { find: '0909 123 456' }, 'AMBIGUOUS', ['article:1.introtext#p.2', 'module:90.content#p']],
  ['/en/about', { find: 'About us' }, 'AMBIGUOUS', ['menuItem:102.title', 'article:2.title']],
  ['/fr/contact', { find: 'Contact' }, 'AMBIGUOUS', ['menuItem:203.title', 'article:13.title']],
  // words Joomla prints: a phrase, the switcher, a date
  ['/en/about', { find: 'You are here:' }, 'NOT_EDITABLE', []],
  ['/en/', { find: 'English (United Kingdom)' }, 'NOT_EDITABLE', []],
  ['/en/', { find: 'Published: 01 March 2026' }, 'NOT_EDITABLE', []],
  ['/en/news', { find: 'Read more …' }, 'NOT_EDITABLE', []],
  ['/en/', { find: 'Words that are nowhere on this site' }, 'NOT_FOUND', []]
]

for (const [path, params, verdict, places] of TABLE)
  test(`open Joomla ${path} ${JSON.stringify(params)} → ${verdict} ${/** @type {string[]} */ (places).join(' ')}`, async () => {
    const { out, site } = await run({ replace: 'New words here', dryRun: true, path, ...params })
    assert.equal(out.ok ? 'WRITE' : out.code, verdict, JSON.stringify(out))
    assert.deepEqual(placesOf(out), places)
    if (out.ok) assert.equal(out.dryRun, true)
    assert.deepEqual(
      site.calls.filter(([a]) => a !== 'content.get' && a !== 'content.list'),
      [],
      'a dryRun or a refusal sends no write'
    )
  })

test('NOT_EDITABLE names the road that does reach the words, never "that is an answer" but for a date', async () => {
  /** @type {[string, string, RegExp, RegExp][]} */
  const cases = [
    ['/en/about', 'You are here:', /language file/, /content\.find .*override\.ini/],
    ['/en/', 'English (United Kingdom)', /language switcher/, /content\.update \{kind:"language"/],
    ['/en/news', 'Read more …', /language file/, /content\.find/]
  ]
  for (const [path, find, why, next] of cases) {
    const { out } = await run({ find, replace: 'x y', path })
    assert.equal(out.code, 'NOT_EDITABLE', find)
    assert.match(out.error, why, find)
    assert.match(out.next, next, find)
    assert.doesNotMatch(out.next, /that is an answer/, find)
    assert.ok(out.error.length <= 160 && out.next.length <= 200, find)
  }
  const date = await run({ find: 'Published: 01 March 2026', replace: 'x y', path: '/en/' })
  assert.match(date.out.error, /a date Joomla prints/)
  assert.match(date.out.next, /that is an answer/)
})

// ── One place, written ───────────────────────────────────────────────────────────────────────────

test('one place: one content.update of that record under the minted apply id, only the words spliced', async () => {
  const { out, site } = await run({
    find: 'We clean factories, warehouses and offices across the region.',
    replace: 'We clean factories and offices, day and night.',
    path: '/en/'
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(placesOf(out), ['article:1.introtext#p'])
  assert.deepEqual(site.writes(), [
    {
      kind: 'article',
      id: 1,
      fields: {
        introtext:
          '<p>We clean factories and offices, day and night.</p>\r\n<p>Call our hotline: <a href="tel:+84909123456">0909 123 456</a></p>'
      },
      apply_id: 'replace-test-1'
    }
  ])
  assert.deepEqual(out.undo, { action: 'apply.revert', params: { apply_id: 'replace-test-1' } })
  assert.equal(out.apply_id, 'replace-test-1')
  assert.equal(Object.keys(out).at(-1), 'next')
  // the record was read again right before it was written (the component takes no revision)
  const k = site.calls.findIndex(([a]) => a === 'content.update')
  assert.deepEqual(site.calls[k - 1], ['content.get', { kind: 'article', id: 1 }])
})

test('the undo in the receipt puts every byte back: HTML entities, a params JSON with its escapes', async () => {
  const site = component()
  const { out } = await run(
    { find: 'Industrial cleaning since 1998 - Hanoi', replace: 'Cleaning since 1999', path: '/en/' },
    { site }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const params = rowOf(site, 'templateStyle', 11).params
  // only the value changed: its `–` went with the words, every other byte is the one read
  assert.equal(
    params,
    seeded('templateStyle', 11).params.replace(
      'Industrial cleaning since 1998 \\u2013 Hanoi',
      'Cleaning since 1999'
    )
  )
  assert.deepEqual(JSON.parse(params).siteTitle, 'Acme Works')
  await site.door('apply.revert', out.undo.params)
  assert.equal(rowOf(site, 'templateStyle', 11).params, seeded('templateStyle', 11).params)

  const hours = component()
  const done = await run(
    { find: 'Mon-Fri, 8:00-17:00', replace: 'Mon-Sat, 8:00-18:00', path: '/en/' },
    { site: hours }
  )
  assert.deepEqual(placesOf(done.out), ['module:91.content#p'])
  assert.equal(rowOf(hours, 'module', 91).content, '<p>Mon-Sat, 8:00-18:00</p>')
  await hours.door('apply.revert', done.out.undo.params)
  assert.equal(rowOf(hours, 'module', 91).content, '<p>Mon&ndash;Fri, 8:00&ndash;17:00</p>')
})

test('a menu label, the breadcrumb home text and a page heading: each in its own record and field', async () => {
  /** @type {[Record<string, unknown>, Record<string, unknown>][]} */
  const cases = [
    [
      { find: 'News', replace: 'Latest news', path: '/en/' },
      { kind: 'menuItem', id: 104, fields: { title: 'Latest news' }, apply_id: 'replace-test-1' }
    ],
    [
      { find: 'Start', replace: 'Home page', path: '/en/about' },
      {
        kind: 'module',
        id: 95,
        fields: {
          params: seeded('module', 95).params.replace('"homeText":"Start"', '"homeText":"Home page"')
        },
        apply_id: 'replace-test-1'
      }
    ],
    [
      { find: 'Who we are', replace: 'Meet the "team"', path: '/en/about' },
      {
        kind: 'menuItem',
        id: 102,
        fields: {
          params: seeded('menuItem', 102).params.replace(
            '"page_heading":"Who we are"',
            '"page_heading":"Meet the \\"team\\""'
          )
        },
        apply_id: 'replace-test-1'
      }
    ]
  ]
  for (const [call, write] of cases) {
    const { out, site } = await run(call)
    assert.equal(out.ok, true, JSON.stringify(out))
    assert.deepEqual(site.writes(), [write])
  }
})

test('a heading on two lines replaced whole keeps its two lines', async () => {
  const { out, site } = await run({
    find: 'Our team and our values',
    replace: 'Our people, our promise',
    path: '/en/about'
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.ok(rowOf(site, 'article', 2).introtext.includes('<h2>Our people,<br><em>our promise</em></h2>'))
  assert.ok(out.notes.some((/** @type {string} */ n) => /two lines/.test(n)))
})

test('words taken out say a space left where they stood is harmless; words put in keep the plain receipt', async () => {
  // Round 7: after a removal the model read `after` with a space at the join, tried to trim it, and was
  // refused "replace equals find" — one wasted call. The removal's receipt says the space is harmless.
  const removed = await run({ find: 'We answer within one working day.', replace: '', path: '/en/about' })
  assert.equal(removed.out.ok, true, JSON.stringify(removed.out))
  assert.equal(removed.out.next, REPLACE_NEXT.receiptRemoved)
  const changed = await run({
    find: 'We answer within one working day.',
    replace: 'We reply within a day.',
    path: '/en/about'
  })
  assert.equal(changed.out.ok, true, JSON.stringify(changed.out))
  assert.equal(changed.out.next, REPLACE_NEXT.receipt)
})

test('the words the site already holds are not written, and the answer says so', async () => {
  const { out, site } = await run({
    find: 'Mon-Fri, 8:00-17:00',
    replace: 'Mon–Fri, 8:00–17:00',
    path: '/en/'
  })
  assert.equal(out.code, 'BAD_PARAMS')
  assert.equal(out.rule, 'unchanged')
  assert.deepEqual(site.writes(), [])
})

// ── Every place, every language ──────────────────────────────────────────────────────────────────

test('a fact everywhere: all:true over five places asks for the count, then reaches every language', async () => {
  const call = { find: '0909 123 456', replace: '0911 555 033', path: '/en/', all: true }
  const site = component()
  const first = await run(call, { site })
  assert.equal(first.out.code, 'VALUE_NOT_ALLOWED')
  assert.equal(first.out.rule, 'confirm-count')
  assert.equal(first.out.count, 6)
  assert.deepEqual(site.writes(), [])
  const { out } = await run({ ...call, expect: 6 }, { site })
  assert.equal(out.ok, true, JSON.stringify(out))
  // both footers and the four articles, in English and in French; the draft no visitor sees, never
  assert.deepEqual(writesOf(site), [
    'module:90',
    'module:92',
    'article:1',
    'article:3',
    'article:11',
    'article:13'
  ])
  assert.ok(rowOf(site, 'article', 20).introtext.includes('0909 123 456'), 'the unpublished draft kept')
  // the tel: links dial the new number
  for (const [kind, id, field] of /** @type {const} */ ([
    ['module', 90, 'content'],
    ['module', 92, 'content'],
    ['article', 1, 'introtext'],
    ['article', 11, 'introtext']
  ])) {
    const v = rowOf(site, kind, id)[field]
    assert.ok(v.includes('<a href="tel:+84911555033">0911 555 033</a>'), `${kind} ${id}: ${v}`)
    assert.ok(!v.includes('0909'), `${kind} ${id}`)
  }
  assert.equal(new Set(site.writes().map((w) => w.apply_id)).size, 1)
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= RECEIPT_MAX_BYTES)
  // and the one undo puts every record back
  await site.door('apply.revert', out.undo.params)
  for (const row of SITE.article)
    assert.equal(rowOf(site, 'article', Number(row.id)).introtext, row.introtext)
  for (const row of SITE.module) assert.equal(rowOf(site, 'module', Number(row.id)).content, row.content)
})

// The company's contact record holds the facts the footer repeats. Measured 02/10/2026 on an imported
// Joomla 5 copy: "change our phone number everywhere" wrote the footer module, never read contact 1,
// and the contact page went on showing the old number while the agent reported every place changed.
test('a fact the contact record shares: all:true reaches its own column with the footers and articles', async () => {
  const site = component({ contact: { telephone: '0909 123 456' } })
  const call = { find: '0909 123 456', replace: '0911 555 033', path: '/en/', all: true }
  const dry = await run({ ...call, dryRun: true }, { site })
  assert.equal(dry.out.ok, true, JSON.stringify(dry.out))
  assert.ok(
    placesOf(dry.out).some((/** @type {string} */ at) => at.startsWith('contact:1.telephone')),
    JSON.stringify(placesOf(dry.out))
  )
  assert.equal(dry.out.count, 7)
  const { out } = await run({ ...call, expect: 7 }, { site })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.ok(writesOf(site).includes('contact:1'), JSON.stringify(writesOf(site)))
  assert.equal(rowOf(site, 'contact', 1).telephone, '0911 555 033')
  // the contact's page shows the new number
  const page = await site.pageHtml('/en/our-office')
  assert.ok(page.html.includes('0911 555 033') && !page.html.includes('0909 123 456'))
  await site.door('apply.revert', out.undo.params)
  assert.equal(rowOf(site, 'contact', 1).telephone, '0909 123 456', 'the one undo puts the contact back')
})

test('a number written with its trunk in brackets: the footer words, their tel: link and the contact follow', async () => {
  const site = component({ contact: { telephone: '+61 (0)7 5550 6697' } })
  rowOf(site, 'module', 90).content = '<p>Ph: <a href="tel:+61755506697">+61 (0)7 5550 6697</a></p>'
  const call = { find: '+61 (0)7 5550 6697', replace: '+61 (0)7 5550 7000', path: '/en/', all: true }
  const dry = await run({ ...call, dryRun: true }, { site })
  assert.equal(dry.out.ok, true, JSON.stringify(dry.out))
  const { out } = await run({ ...call, expect: dry.out.count }, { site })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(
    rowOf(site, 'module', 90).content,
    '<p>Ph: <a href="tel:+61755507000">+61 (0)7 5550 7000</a></p>'
  )
  assert.equal(rowOf(site, 'contact', 1).telephone, '+61 (0)7 5550 7000')
})

// 🔒 02/10/2026, JoomlArt's T4 on an imported copy: the topbar module's words answered "words Joomla or the
// template print from a language file" (wrong) because no id names the module and its body was never read.
test('a custom module in a region of its own is read, and its words go to it though no id names it', async () => {
  const site = component()
  const dry = await run(
    {
      find: 'Free shipping on every order over 50 USD.',
      replace: 'Free delivery on every order.',
      path: '/en/',
      dryRun: true
    },
    { site }
  )
  assert.equal(dry.out.ok, true, JSON.stringify(dry.out))
  assert.deepEqual(
    placesOf(dry.out).map((/** @type {string} */ at) => at.split('#')[0]),
    ['module:98.content']
  )
  const { out } = await run(
    {
      find: 'Free shipping on every order over 50 USD.',
      replace: 'Free delivery on every order.',
      path: '/en/'
    },
    { site }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(writesOf(site), ['module:98'])
  assert.equal(rowOf(site, 'module', 98).content, '<p>Free delivery on every order.</p>')
  await site.door('apply.revert', out.undo.params)
  assert.equal(rowOf(site, 'module', 98).content, '<p>Free shipping on every order over 50 USD.</p>')
})

test('a bare custom module in the default region is not claimed: its words keep the refusal that names the road', async () => {
  const site = component()
  const { out } = await run(
    { find: 'Words of a bare sidebar module nobody can place.', replace: 'x y', path: '/en/' },
    { site }
  )
  assert.equal(out.ok, false, JSON.stringify(out))
  assert.equal(out.code, 'NOT_EDITABLE')
  assert.deepEqual(site.writes(), [])
})

// Review of 02/10/2026: the custom modules of the regions (topbar, header, footer) the engine now reads whole shared
// the allowance of the modules whose words are params, so eight published footer modules left a breadcrumb's
// `homeText` unread: "Start" answered NOT_EDITABLE, with a wrong reason, on a site where it was editable before.
/**
 * Published custom modules that print nothing on the pages asked about (assigned to other menu items).
 * @param {ReturnType<typeof component>} site @param {number} count @param {(i: number) => string} position
 */
const addCustomModules = (site, count, position) => {
  for (let i = 0; i < count; i += 1)
    site.db.module.set(40 + i, {
      id: String(40 + i),
      title: `Extra block ${i}`,
      note: '',
      position: position(i),
      module: 'mod_custom',
      published: '1',
      language: '*',
      client_id: '0',
      showtitle: '0',
      access: '1',
      ordering: '1',
      params: '{}',
      content: `<p>Extra block ${i}</p>`
    })
}

for (const count of [8, 9, 20])
  test(`a breadcrumb's words are not starved by ${count} custom modules in the footer, and none of them is read`, async () => {
    const site = component()
    addCustomModules(site, count, (i) => `footer-${(i % 4) + 1}`)
    const { out } = await run({ find: 'Start', replace: 'Begin', path: '/en/about', dryRun: true }, { site })
    assert.equal(out.ok, true, JSON.stringify(out))
    assert.deepEqual(placesOf(out), ['module:95.params:homeText'])
    assert.deepEqual(
      site.calls.filter(
        ([a, p]) => a === 'content.get' && p.kind === 'module' && Number(p.id) >= 40 && Number(p.id) < 70
      ),
      [],
      'words that stand in no region those modules print in read none of them'
    )
  })

test('a topbar custom module is still found among a dozen others in the same region', async () => {
  const site = component()
  addCustomModules(site, 12, () => 'topbar')
  const { out } = await run(
    {
      find: 'Free shipping on every order over 50 USD.',
      replace: 'Free delivery on every order.',
      path: '/en/',
      dryRun: true
    },
    { site }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    placesOf(out).map((/** @type {string} */ at) => at.split('#')[0]),
    ['module:98.content']
  )
})

test('on a contact page its own columns are the place: the address, the e-mail and its link', async () => {
  const site = component()
  const street = await run(
    { find: '12 Harbour Road', replace: '48 Bach Dang Street', path: '/en/our-office', dryRun: true },
    { site }
  )
  assert.equal(street.out.ok, true, JSON.stringify(street.out))
  assert.deepEqual(
    placesOf(street.out).map((/** @type {string} */ at) => at.split('#')[0]),
    ['contact:1.address']
  )
  const { out } = await run(
    { find: 'office@acme.test', replace: 'visit@acme.test', path: '/en/our-office' },
    { site }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(rowOf(site, 'contact', 1).email_to, 'visit@acme.test')
})

// Review of 02/10/2026: `contact` was missing from the write order, so it sorted BEFORE the code records. A seat
// without the code toolset then had its contact written, its module refused, and the contact undone, instead of
// being refused before anything was written (a failed undo would leave the call PARTIAL).
test('a seat without the code toolset is refused before the contact is written, not after', async () => {
  const site = component({ contact: { telephone: '0777 123 456' } })
  rowOf(site, 'module', 90).content = rowOf(site, 'module', 90).content.replace(
    '0909 123 456',
    '0777 123 456'
  )
  /** @type {string[]} */
  const order = []
  const { out } = await run(
    { find: '0777 123 456', replace: '0777 000 000', all: true, path: '/en/' },
    {
      site,
      write: (s) => async (action, params) => {
        order.push(`${action}${params.kind ? `:${params.kind}` : ''}`)
        if (action === 'content.update' && (params.kind === 'module' || params.kind === 'templateStyle'))
          return { ok: false, code: 'FORBIDDEN', error: 'your role has no code toolset' }
        return s.door(action, params)
      }
    }
  )
  assert.equal(out.ok, false, JSON.stringify(out))
  assert.equal(out.code, 'FORBIDDEN', JSON.stringify(out))
  assert.deepEqual(
    order,
    ['content.update:module'],
    'the code record is tried first and nothing else was written'
  )
  assert.equal(rowOf(site, 'contact', 1).telephone, '0777 123 456')
})

test('an unpublished contact is never a place a visitor sees', async () => {
  const site = component({ contact: { telephone: '0909 123 456', published: '0' } })
  const dry = await run(
    { find: '0909 123 456', replace: '0911 555 033', path: '/en/', all: true, dryRun: true },
    { site }
  )
  assert.equal(dry.out.ok, true, JSON.stringify(dry.out))
  assert.ok(
    !placesOf(dry.out).some((/** @type {string} */ at) => at.startsWith('contact:')),
    JSON.stringify(placesOf(dry.out))
  )
})

test('a dryRun of the same all:true call confirms it: the next call writes without expect', async () => {
  const call = { find: '0909 123 456', replace: '0911 555 033', path: '/en/', all: true }
  const dry = await run({ ...call, dryRun: true })
  assert.equal(dry.out.dryRun, true)
  assert.equal(dry.out.count, 6)
  assert.match(dry.out.next, /with expect:6/)
  assert.deepEqual(dry.site.writes(), [])
  assert.ok(Buffer.byteLength(JSON.stringify(dry.out)) <= RECEIPT_MAX_BYTES)
  const { out, site } = await run(call, { confirmed: true })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(site.writes().length, 6)
})

test('words change in the page language only; all:true reaches the other language too', async () => {
  // not on the French home page: searched site-wide, in French only — the English article is not it
  const fr = await run({
    find: 'Acme Works was founded in 1998 by two engineers.',
    replace: 'x y',
    path: '/fr/',
    dryRun: true
  })
  assert.equal(fr.out.code, 'NOT_FOUND', JSON.stringify(fr.out))
  const en = await run({
    find: 'Acme Works was founded in 1998 by two engineers.',
    replace: 'x y',
    path: '/en/',
    dryRun: true
  })
  assert.deepEqual(placesOf(en.out), ['article:2.introtext#p'])
  assert.equal(en.out.would[0].onPage, false)
  // a menu label on the French contact page, everywhere: both editions' items and article titles
  const all = await run({ find: 'Contact', replace: 'Kontakt', path: '/fr/contact', all: true, dryRun: true })
  assert.deepEqual(placesOf(all.out).sort(), [
    'article:13.title',
    'article:3.title',
    'menuItem:103.title',
    'menuItem:203.title'
  ])
})

test('an e-mail everywhere: its mailto: links follow, one companion per link', async () => {
  const { out, site } = await run({
    find: 'hello@acme.test',
    replace: 'team@acme.test',
    path: '/en/',
    all: true
  })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(writesOf(site), ['module:90', 'module:92', 'article:3', 'article:13'])
  assert.ok(rowOf(site, 'module', 90).content.includes('<a href="mailto:team@acme.test">team@acme.test</a>'))
  assert.ok(rowOf(site, 'module', 92).content.includes('· team@acme.test</p>'))
})

test('AMBIGUOUS then at: the place the customer meant, and nothing else', async () => {
  const site = component()
  const first = await run({ find: '0909 123 456', replace: '0911 555 033', path: '/en/' }, { site })
  assert.equal(first.out.code, 'AMBIGUOUS')
  assert.deepEqual(site.writes(), [])
  const { out } = await run(
    { find: '0909 123 456', replace: '0911 555 033', path: '/en/', at: [first.out.candidates[1].at] },
    { site }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(writesOf(site), ['module:90'])
  // at a place not on this page: that record is read by its id
  const off = await run({
    find: '0909 123 456',
    replace: '0911 555 033',
    path: '/en/',
    at: ['article:13.introtext#p']
  })
  assert.equal(off.out.ok, true, JSON.stringify(off.out))
  assert.deepEqual(writesOf(off.site), ['article:13'])
})

test('the module the words sit in is read first, however many modules the page names before it', async () => {
  const site = component()
  const home = (await site.pageHtml('/en/')).html
  const crowd = Array.from(
    { length: 20 },
    (_, k) => `<div id="mod-custom${500 + k}" class="mod-custom custom"><p>Filler ${k}</p></div>`
  ).join('')
  const html = home.replace('<main>', `<main>${crowd}`)
  const { out } = await run(
    {
      find: '© 2026 Acme Works. All rights reserved.',
      replace: '© 2026 Acme Cleaning.',
      path: '/en/',
      dryRun: true
    },
    { site, pageHtml: async () => ({ ok: true, status: 200, html }) }
  )
  assert.deepEqual(placesOf(out), ['module:90.content#p.2'], JSON.stringify(out))
  assert.ok(
    site.calls.filter(([a, p]) => a === 'content.get' && p.kind === 'module').length <= 16 + 8,
    'the reads stay bounded'
  )
})

test('an administrator module is never a place, whatever its title', async () => {
  const { out } = await run({
    find: 'Opening hours',
    replace: 'When we are open',
    path: '/en/',
    all: true,
    dryRun: true
  })
  assert.deepEqual(placesOf(out), ['module:91.title'])
})

// ── Refusals, the self-revert and the re-plan ───────────────────────────────────────────────────

const PHONE_ALL = { find: '0909 123 456', replace: '0911 555 033', path: '/en/', all: true, expect: 6 }

test("a write refused midway: the records written first are undone by this call's own apply id", async () => {
  const site = component({
    script: (action, params) =>
      action === 'content.update' && params.kind === 'article'
        ? {
            ok: false,
            error: 'write_failed',
            message: 'Save failed with the following error: row is checked out'
          }
        : undefined
  })
  const { out } = await run(PHONE_ALL, { site })
  assert.equal(out.ok, false)
  assert.equal(out.error, 'write_failed')
  assert.equal(out.written, 2)
  assert.equal(out.reverted, true)
  assert.equal(out.planned.length, 6)
  assert.match(String(out.next), /\S/)
  assert.deepEqual(
    site.calls.filter(([a]) => a === 'apply.revert'),
    [['apply.revert', { apply_id: 'replace-test-1' }]]
  )
  for (const id of [90, 92]) assert.equal(rowOf(site, 'module', id).content, seeded('module', id).content)
})

test('a first write refused: nothing was written, nothing reverted, the door code passes through', async () => {
  const site = component({
    script: (action) =>
      action === 'content.update'
        ? { ok: false, code: 'TOOLSET_NOT_GRANTED', error: 'this role may not change the code toolset' }
        : undefined
  })
  const { out } = await run(PHONE_ALL, { site })
  assert.equal(out.code, 'TOOLSET_NOT_GRANTED')
  assert.equal(out.reverted, undefined)
  assert.equal(site.writes().length, 1)
  assert.ok(!site.calls.some(([a]) => a === 'apply.revert'))
})

test('SITE_BUSY after a record, and the undo busy too: what stands, and the one call that undoes it', async () => {
  const site = component({
    script: (action, params) => {
      if (action === 'content.update' && params.kind === 'article')
        return { ok: false, code: 'SITE_BUSY', error: 'Another change is being applied.' }
      if (action === 'apply.revert')
        return { ok: false, code: 'SITE_BUSY', error: 'Another change is being applied.' }
      return undefined
    }
  })
  const { out } = await run(PHONE_ALL, { site })
  assert.equal(out.code, 'SITE_BUSY')
  assert.equal(out.partial, true)
  assert.equal(out.written, 2)
  assert.match(out.next, /apply\.revert \{apply_id:"replace-test-1"\}/)
})

test('an undo that fails in part is PARTIAL: what stands, and the one call that undoes the rest', async () => {
  const site = component({
    script: (action, params) => {
      if (action === 'content.update' && params.kind === 'article')
        return { ok: false, error: 'write_failed', message: 'x' }
      if (action === 'apply.revert')
        return { ok: true, reverted: 1, failed: [{ op: 'content', error: 'row locked' }] }
      return undefined
    }
  })
  const { out } = await run(PHONE_ALL, { site })
  assert.equal(out.code, 'PARTIAL')
  assert.equal(out.apply_id, 'replace-test-1')
  assert.equal(out.reverted, false)
  assert.match(out.error, /row locked/)
  assert.match(out.next, /apply\.revert \{apply_id:"replace-test-1"\}/)
})

test('a write whose answer was lost is never undone: how many records may stand, and the dryRun that shows them', async () => {
  let n = 0
  const site = component({
    script: (action) =>
      action === 'content.update' && (n += 1) === 3
        ? { ok: false, code: 'OUTCOME_UNKNOWN', lost: 'COWORK_WEB_UNREACHABLE' }
        : undefined
  })
  const { out } = await run(PHONE_ALL, { site })
  assert.equal(out.code, 'OUTCOME_UNKNOWN', JSON.stringify(out))
  assert.equal(out.written, 2)
  assert.equal(out.reverted, false)
  assert.match(out.error, /: 2 or 3 of 6 records may now hold the new words$/)
  assert.equal(
    out.next,
    'tracy_site content.replace {find:"0911 555 033", replace:"0909 123 456", dryRun:true} in about 30 s shows where the new words stand; do not repeat the call'
  )
  assert.ok(!site.calls.some(([a]) => a === 'apply.revert'))
  assert.equal(site.writes().length, 3, 'nothing is sent after the lost write')
  // a thrown write reads the same: it may have landed
  const thrown = await run(PHONE_ALL, {
    write: (s) => async (action, params) => {
      if (action === 'content.update') throw new Error('socket hang up')
      return s.door(action, params)
    }
  })
  assert.equal(thrown.out.code, 'OUTCOME_UNKNOWN')
  assert.equal(thrown.out.written, 0)
})

test('a record changed between plan and write: one fresh plan, then the write; changed twice: STORE_CHANGED', async () => {
  let reads = 0
  const once = component({
    script: (action, params) => {
      if (action !== 'content.get' || params.kind !== 'module' || params.id !== 91) return undefined
      reads += 1
      // the pre-write read of the first plan sees an editor's change
      return reads === 2
        ? {
            ok: true,
            kind: 'module',
            id: 91,
            item: {
              ...seeded('module', 91),
              content: '<p>Mon&ndash;Fri, 8:00&ndash;17:00</p><p>Closed on holidays</p>'
            }
          }
        : undefined
    }
  })
  const call = { find: 'Mon-Fri, 8:00-17:00', replace: 'Mon-Sat, 8:00-18:00', path: '/en/' }
  const { out } = await run(call, { site: once })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(once.writes().length, 1)
  const twice = component({
    script: (action, params, k) =>
      action === 'content.get' && params.kind === 'module' && params.id === 91
        ? {
            ok: true,
            kind: 'module',
            id: 91,
            item: { ...seeded('module', 91), content: `<p>Mon&ndash;Fri, 8:00&ndash;17:00</p><!-- ${k} -->` }
          }
        : undefined
  })
  const again = await run(call, { site: twice })
  assert.equal(again.out.code, 'STORE_CHANGED')
  assert.deepEqual(twice.writes(), [])
})

test('restore is the EmDash undo: on Joomla it names apply.revert instead', async () => {
  const plan = planReplace({ restore: [{ at: 'article:1.title', value: 'x' }] })
  const out = /** @type {any} */ (
    await replaceOnJoomlaOpen({
      plan: /** @type {any} */ (plan),
      read: component().door,
      write: component().door,
      pageHtml: component().pageHtml
    })
  )
  assert.equal(out.code, 'BAD_PARAMS')
  assert.match(out.next, /apply\.revert/)
})

test('a door refusal while reading ends the call before anything is written, with its next', async () => {
  const site = component({
    script: (action) =>
      action === 'content.list'
        ? { ok: false, code: 'NOT_SIGNED_IN', error: 'Sign in to Tracy first.' }
        : undefined
  })
  const { out } = await run({ find: 'News', replace: 'Latest', path: '/en/' }, { site })
  assert.equal(out.code, 'NOT_SIGNED_IN')
  assert.equal(typeof out.next, 'string')
  assert.deepEqual(site.writes(), [])
})

// ── What the model reads ────────────────────────────────────────────────────────────────────────

test('the page cannot be read: places come from the stored content alone, and the answer says so', async () => {
  const { out } = await run(
    { find: 'Twenty percent off every deep clean booked before May.', replace: 'x y', dryRun: true },
    { pageHtml: async () => ({ ok: false, code: 'READ_FAILED' }) }
  )
  assert.deepEqual(placesOf(out), ['article:5.introtext#p'])
  assert.ok(out.notes.some((/** @type {string} */ n) => /could not be read/.test(n)))
})

test('verified: the page read again shows the new words', async () => {
  const { out } = await run({ find: 'News', replace: 'Latest news', path: '/en/' }, { verify: true })
  assert.equal(out.verified, 'shown on /en/')
})

test('a site that serves several languages: its receipts say what the other editions keep', async () => {
  const words = await run({ find: 'Spring cleaning offer', replace: 'Spring offer', path: '/en/news' })
  assert.match(words.out.notReached, /other language versions are separate records/)
  const fact = await run({ find: 'Mon-Fri, 8:00-17:00', replace: 'Mon-Sat, 8:00-18:00', path: '/en/' })
  assert.match(fact.out.notReached, /all:true changes them too/)
  const shared = await run({ find: 'Start', replace: 'Home page', path: '/en/about' })
  assert.ok(shared.out.notes.some((/** @type {string} */ n) => /every language/.test(n)))
})

// ── A template that numbers nothing (Tracy's own tpl_tracy) ──────────────────────────────────────

/** `/en/about` as tpl_tracy prints it: no item ids, no module ids, the brand from the site name. */
const TRACY_ABOUT = `<!DOCTYPE html>
<html lang="en-gb" dir="ltr"><head><title>About us</title>
<link href="/media/templates/site/tpl_tracy/css/tracy.css?1" rel="stylesheet"></head>
<body class="tracy tracy-page-article" data-page="article">
<header class="tracy-header"><div class="tracy-header__inner tracy-container">
<a class="tracy-brand" href="/">Acme Works Ltd</a>
<nav id="tracy-nav" class="tracy-nav" aria-label="Menu"><ul class="tracy-menu">
<li class="tracy-menu__item"><a href="/en/">Home</a></li>
<li class="tracy-menu__item is-current is-active"><a href="/en/about">About us</a></li>
<li class="tracy-menu__item"><a href="/en/contact">Contact</a></li>
</ul></nav></div></header>
<main id="tracy-main" class="tracy-main"><article class="tracy-article tracy-container">
<header class="tracy-article__head"><h1 class="tracy-article__title">About us</h1></header>
<div class="tracy-article__body tracy-prose">
${seeded('article', 2).introtext}</div></article></main>
<footer class="tracy-footer"><div class="tracy-footer__modules tracy-container">
<div class="tracy-card tracy-module"><div id="mod-custom90" class="mod-custom custom">
${seeded('module', 90).content}</div></div></div>
<div class="tracy-footer__inner tracy-container"><a class="tracy-footer__brand" href="/">Acme Works Ltd</a></div></footer>
</body></html>`

const tracyPages = async (/** @type {string} */ path) =>
  path === '/en/about' ? { ok: true, status: 200, html: TRACY_ABOUT } : { ok: false, code: 'READ_FAILED' }

test('tpl_tracy: a menu label is its menu item by the link it sits in, in the page language only', async () => {
  const { out } = await run(
    { find: 'Contact', replace: 'Get in touch', path: '/en/about', dryRun: true },
    { pageHtml: tracyPages }
  )
  assert.deepEqual(placesOf(out), ['menuItem:103.title'], JSON.stringify(out))
  // the page's own item is found by its route, and its article by its link: the heading is AMBIGUOUS
  // with the label only where both print the same words
  const about = await run(
    { find: 'About us', replace: 'About Acme', path: '/en/about', dryRun: true },
    { pageHtml: tracyPages }
  )
  assert.equal(about.out.code, 'AMBIGUOUS', JSON.stringify(about.out))
  assert.deepEqual(placesOf(about.out).sort(), ['article:2.title', 'menuItem:102.title'])
})

test("tpl_tracy: the brand is the site name, which names its road — Joomla's configuration", async () => {
  const { out } = await run(
    { find: 'Acme Works Ltd', replace: 'Acme Cleaning', path: '/en/about' },
    { pageHtml: tracyPages }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.match(out.error, /site name/)
  // 🔒 The recorded door, never the shell (ladder DL14/DL15, 14/10/2026): a `config:set` in the shell kept
  // no receipt, so the customer's undo in the next conversation could not find the change.
  assert.match(out.next, /site\.identity \{operation:"set", fields:\{sitename:"<the new name>"\}\}/)
  assert.doesNotMatch(out.next, /config:set|shell/)
})

// ── The pieces ──────────────────────────────────────────────────────────────────────────────────

test('pageFactsOf: the menu item, the view, the template, the modules and the alternates a page names', async () => {
  const site = component()
  const page = pageFactsOf((await site.pageHtml('/en/about')).html)
  assert.equal(page.itemId, 102)
  assert.equal(page.view, 'article')
  assert.equal(page.template, 'cassiopeia')
  assert.deepEqual(page.modules.sort(), [90, 91])
  assert.equal(page.alternates, 2)
  assert.equal(page.lang, 'en-gb')
  // T4's markers: `item-N` on the body, `Mod<id>` on every module, `data-id` on the mega menu
  const t4 = pageFactsOf(
    '<html><body class="view-article item-600"><div class="t4-module module" id="Mod431"><ul><li class="nav-item" data-id="599"><a href="/">Home</a></li></ul></div></body></html>'
  )
  assert.equal(t4.itemId, 600)
  assert.deepEqual(t4.modules, [431])
})

test('the markers and routes: module and menu item ids, a link as a route, a position as a region', () => {
  const el = (/** @type {Partial<import('../src/host/html-units.mjs').UnitElement>} */ e) =>
    /** @type {import('../src/host/html-units.mjs').UnitElement} */ ({
      tag: 'div',
      id: '',
      cls: '',
      data: '',
      role: '',
      inline: false,
      hide: false,
      open: false,
      href: null,
      ...e
    })
  assert.equal(moduleIdOf(el({ id: 'Mod431' })), 431)
  assert.equal(moduleIdOf(el({ id: 'mod-custom90' })), 90)
  assert.equal(moduleIdOf(el({ id: 'mod-12' })), 12)
  assert.equal(moduleIdOf(el({ id: 'mod-languages' })), 0)
  assert.equal(menuItemIdOf(el({ tag: 'li', cls: 'nav-item item-101 current' })), 101)
  assert.equal(menuItemIdOf(el({ tag: 'li', data: '599' })), 599)
  assert.equal(menuItemIdOf(el({ tag: 'div', cls: 'item-5' })), 0)
  assert.equal(routeOf('http://acme.test/index.php/en/about/?x=1'), 'en/about')
  assert.equal(routeOf('/'), '')
  assert.equal(routeOf('tel:+84909123456'), null)
  assert.equal(routeOf('#top'), null)
  assert.equal(positionRegion('sidebar-right'), 'main')
  assert.equal(positionRegion('below-top'), 'header')
  assert.equal(positionRegion('footer'), 'footer')
  assert.equal(positionRegion('breadcrumbs'), 'title')
  // every param the table names is one the component writes (it is part of a whitelisted column)
  assert.ok(WRITABLE.templateStyle.includes('params') && WRITABLE.module.includes('params'))
  assert.ok(WRITABLE.menuItem.includes('params'))
  assert.deepEqual(Object.keys(JOOMLA_WORD_PARAMS).sort(), ['menuItem', 'module', 'templateStyle'])
})

test('every sentence fits its budget on its worst case (T10: error ≤ 160, next ≤ 200)', () => {
  const worst = {
    what: 'x'.repeat(200),
    find: 'f'.repeat(200),
    replace: 'y'.repeat(200),
    failed: 'z'.repeat(200),
    new: 'n'.repeat(200),
    old: 'o'.repeat(200),
    n: 1000,
    n1: 1001,
    m: 1000,
    id: 4_294_967_295,
    applyId: 'replace-mfz3k2x9-abcdef',
    path: `/${'p'.repeat(200)}`
  }
  for (const key of /** @type {(keyof typeof JOOMLA_OPEN_NEXT)[]} */ (Object.keys(JOOMLA_OPEN_NEXT))) {
    const text = joText(key, worst)
    assert.ok(!/\{\w+\}/.test(text), `${key} fills every fact`)
    assert.ok(text.length <= (key.endsWith('Error') ? 160 : 200), `${key}: ${text.length}`)
  }
  // A reason is quoted after `"<find, 60 characters>" is`: 73 keeps the core's error in its 160.
  for (const [key, why] of Object.entries(JOOMLA_OPEN_WHY)) {
    const text = typeof why === 'function' ? why(worst.id) : why
    assert.ok(text.length <= 73, `${key}: ${text.length}`)
  }
})

// 03/10/2026, leemood module 93: the road said `fields:{params:"<all of them>"}`, the agent re-typed the
// module's whole nested `jatools-config` to change one heading, and the hero printed nothing.
test("a module's NOT_EDITABLE road sends the one key as a patch object, never the params re-typed", () => {
  const next = joText('moduleNext', { id: 93 })
  assert.match(next, /content\.get \{kind:"module", id:93\}/)
  assert.match(next, /fields:\{params:\{patch:\{"<key>":/)
  assert.match(next, /JSON text/)
  assert.doesNotMatch(next, /all of them/)
})

// 03/10/2026, leemood module 93: the hero of every JoomlArt quickstart is a `mod_ja_acm` module whose words
// live in `params` → `jatools-config` (JSON text inside the JSON). content.replace could not reach them, so
// the agent re-typed the config through content.update and blanked the hero.
test('the words of a JoomlArt ACM hero are changed inside its nested jatools-config, every other byte kept', async () => {
  const site = component({ acm: true })
  const heading = 'Bật hết cỡ. Chia sẻ khắp nơi. Làm chủ cộng đồng Mood.'
  const before = (await site.pageHtml('/en/')).html
  assert.match(
    before,
    /<h1 class="hero-heading">Play loud\. Share everywhere\. Take over the Mood community\.<\/h1>/
  )

  const { out } = await run(
    { find: 'Play loud. Share everywhere. Take over the Mood community.', replace: heading, path: '/en/' },
    { site }
  )

  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(placesOf(out), ['module:154.params:jatools-config.hero.hero-style[hero-heading][0]'])
  assert.deepEqual(writesOf(site), ['module:154'])
  const params = JSON.parse(rowOf(site, 'module', 154).params)
  const config = JSON.parse(params['jatools-config'])
  assert.equal(config[':type'], 'ja_mood:hero')
  assert.deepEqual(config.hero['hero-style[hero-heading]'], [heading])
  const was = JSON.parse(JSON.parse(ACM_HERO.params)['jatools-config'])
  was.hero['hero-style[hero-heading]'] = [heading]
  assert.deepEqual(config, was, 'every other key and value of the config is as it was')
  assert.equal(params.moduleclass_sfx, ' mod-nopadding mod-nobg')
  assert.ok((await site.pageHtml('/en/')).html.includes(`<h1 class="hero-heading">${heading}</h1>`))
})

test("an ACM hero's intro and button text are words too; its link, icon and style are not", async () => {
  const intro = await run(
    { find: 'Nulla ligula facilisi.', replace: 'Nulla ligula.', path: '/en/', dryRun: true },
    { site: component({ acm: true }) }
  )
  assert.deepEqual(placesOf(intro.out), ['module:154.params:jatools-config.hero.hero-style[hero-intro][0]'])
  const button = await run(
    { find: 'Watch overview', replace: 'Watch now', path: '/en/', dryRun: true },
    { site: component({ acm: true }) }
  )
  assert.deepEqual(placesOf(button.out), ['module:154.params:jatools-config.hero.hero-style[hero-text][0]'])
  const style = await run(
    { find: 'style-dark', replace: 'style-light', path: '/en/', dryRun: true },
    { site: component({ acm: true }) }
  )
  assert.notEqual(style.out.ok, true, 'a class name is not words on the page')
})

test('words with a quote and a backslash go into the nested config escaped twice and read back whole', async () => {
  const site = component({ acm: true })
  const heading = 'Say "play" \\ share — Mood'

  const { out } = await run({ find: 'Watch overview', replace: heading, path: '/en/' }, { site })

  assert.equal(out.ok, true, JSON.stringify(out))
  const config = JSON.parse(JSON.parse(rowOf(site, 'module', 154).params)['jatools-config'])
  assert.deepEqual(config.hero['hero-style[hero-text]'], [heading])
  assert.equal(config[':type'], 'ja_mood:hero')
})

test('a word param that only starts like JSON stays one plain param', async () => {
  const site = component()
  const style = /** @type {Record<string, any>} */ (site.db.templateStyle.get(11))
  style.params = style.params.replace('"siteTitle":"Acme Works"', '"siteTitle":"{Acme} Works"')

  const { out } = await run(
    { find: '{Acme} Works', replace: 'Acme Group', where: 'header', path: '/en/', dryRun: true },
    { site }
  )

  assert.deepEqual(placesOf(out), ['templateStyle:11.params:siteTitle'])
})
