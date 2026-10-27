import { LEGACY_BOUND_MESSAGE, LEGACY_STRUCTURE_CODE } from '../src/host/legacy-refusal.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createCallMemory } from '../src/host/call-memory.mjs'
import { decodeEntities, foldForMatch } from '../src/host/html-units.mjs'
import { latestCustomerWords } from '../src/host/prompter.mjs'
import { renderedText } from '../src/host/rendered-words.mjs'
import { RECEIPT_MAX_BYTES, REPLACE_NEXT, dialDigits, planReplace } from '../src/host/replace.mjs'
import {
  WP_REPLACE_NEXT,
  WP_THEME_STORES,
  encodeJsonText,
  escapeHtmlText,
  followLink,
  narrowChange,
  pageFactsOf,
  parseBlocks,
  proveRewrite,
  replaceOnWordPress,
  storeUnits,
  wpText
} from '../src/host/replace-wordpress.mjs'
import { blockMarkupProblem, runSiteCall } from '../src/host/site-call.mjs'
import { planCall } from '../src/host/site.mjs'

import {
  component,
  IDENTITY,
  PAGES,
  SITE,
  TOKEN_PAGES,
  tokenSite
} from './fixtures/replace/fake-wordpress.mjs'
import { indexContents, locateElement } from '../../../../apps/tracy-web/src/sites/content-locate.js'

/** A table row's name in a test title: its JSON, cut, whatever the row holds. */
const rowName = (row) => {
  try {
    return String(JSON.stringify(row)).slice(0, 80)
  } catch {
    return String(row).slice(0, 80)
  }
}

const HELD = JSON.parse(readFileSync(new URL('./fixtures/replace/heldout.json', import.meta.url), 'utf8'))
const HEADER = 80
const FOOTER = 81

// ── A fake component ─────────────────────────────────────────────────────────────────────────────

/** @param {Record<string, string>} [pages] */
const pagesOf =
  (pages = PAGES) =>
  async (/** @type {string} */ path) =>
    path in pages
      ? { ok: true, status: 200, html: pages[path] }
      : { ok: false, code: 'READ_FAILED', error: 'no page' }

/**
 * One call of the job, as IX2 runs it: planReplace first, then the engine with the fake door.
 * @param {Record<string, unknown>} params
 * @param {{ site?: ReturnType<typeof component>, pages?: Record<string, string>, removes?: string,
 *   confirmed?: boolean, verify?: boolean, bound?: boolean, contractDoor?: boolean,
 *   pageHtml?: (path: string) => Promise<any>,
 *   write?: (site: ReturnType<typeof component>) => (action: string, params: Record<string, any>) => Promise<any> }} [options]
 */
async function run(params, options = {}) {
  const site = options.site ?? component()
  const plan = planReplace(params)
  assert.equal(plan.ok, true, JSON.stringify(plan))
  let n = 0
  const out = /** @type {any} */ (
    await replaceOnWordPress({
      plan,
      read: site.door,
      write: options.write ? options.write(site) : site.door,
      pageHtml: options.pageHtml ?? pagesOf(options.pages),
      mintApplyId: () => `replace-test-${(n += 1)}`,
      confirmed: options.confirmed,
      removes: options.removes,
      bound: options.bound,
      contractDoor: options.contractDoor,
      verify: options.verify ?? false
    })
  )
  return { out, site }
}

/** @param {any} out */
const placesOf = (out) =>
  (out.changed ?? out.would ?? out.candidates ?? []).map((/** @type {any} */ w) => w.at)
/** Visible words of one stored record, as the engine reads them. @param {'blocks' | 'cf7' | 'plain'} shape @param {string} raw */
const wordsOf = (shape, raw) =>
  storeUnits(shape, raw)
    .map((u) => u.cased)
    .join('\n')

// ── The §8.1 table: where the words live (dryRun, nothing written) ──────────────────────────────

const TABLE = [
  ['/', { find: 'Established 2004' }, 'WRITE', ['post:42#hero.eyebrow']],
  ['/', { find: 'Building the groundwork for next-generation plants' }, 'WRITE', ['post:42#hero.heading']],
  ['/', { find: 'next-generation plants' }, 'WRITE', ['post:42#hero.heading']],
  ['/', { find: 'Talk to our sales team' }, 'WRITE', ['post:42#cta.cta.1']],
  ['/', { find: 'info@northgate-ind.ru' }, 'WRITE', ['part:header#paragraph.2']],
  ['/', { find: 'Industrial infrastructure' }, 'WRITE', ['option:blogdescription']],
  ['/', { find: 'Northgate', where: 'header' }, 'WRITE', ['option:blogname']],
  ['/', { find: 'Vorsino Industrial Park, plot 12, Kaluga Region' }, 'WRITE', ['part:footer#paragraph.3']],
  // U+2011 in the store, "-" typed
  ['/', { find: '500,000 work hours with zero lost-time incidents' }, 'WRITE', ['post:42#news.item.3.title']],
  // en dashes in the store, "-" typed
  ['/', { find: 'Mon-Fri, 9:00-18:00 (MSK)' }, 'WRITE', ['part:footer#paragraph.6']],
  ['/', { find: 'Mon-Fri, 9:00-18:00 (MSK)', where: 'footer' }, 'WRITE', ['part:footer#paragraph.6']],
  [
    '/',
    { find: '© 2026 Northgate Industrial JSC. Template running on WordPress.' },
    'WRITE',
    ['part:footer#paragraph.7']
  ],
  ['/', { find: 'Investors' }, 'WRITE', ['nav:69#navigation-link.2:label']],
  ['/', { find: 'News', where: 'header' }, 'WRITE', ['nav:68#navigation-link.5:label']],
  ['/', { find: 'Book a site survey' }, 'WRITE', ['nav:71#navigation-link:label']],
  ['/', { find: 'Resources' }, 'WRITE', ['part:header#wp-tracy-business/mega-menu:label']],
  ['/', { find: 'Search the site' }, 'WRITE', ['part:header#search.2:placeholder']],
  ['/contact/', { find: 'Ivan Petrov' }, 'WRITE', ['form:25#text*:option']],
  ['/contact/', { find: 'Send request' }, 'WRITE', ['form:25#submit:option']],
  ['/contact/', { find: 'Горячая линия' }, 'WRITE', ['post:39#contact.item.2.title']],
  ['/news/', { find: 'News & engineering notes' }, 'WRITE', ['meta:51.tracy_page_heading']],
  ['/news/', { find: 'Engineering' }, 'WRITE', ['term:category:45']],
  [
    '/news/',
    { find: 'Project updates, corporate disclosures and field notes' },
    'WRITE',
    ['post:51.excerpt']
  ],
  ['/news/', { find: 'Subscribe' }, 'WRITE', ['form:349#submit:option']],
  ['/news/', { find: 'Northgate wins the Zavolzhye 2 infrastructure tender' }, 'WRITE', ['post:521.title']],
  [
    '/',
    { find: 'Design-build main contractor' },
    'AMBIGUOUS',
    ['post:42#hero.intro', 'part:footer#paragraph.2']
  ],
  [
    '/',
    { find: 'M&E engineering' },
    'AMBIGUOUS',
    ['post:42#services.item.3.title', 'part:footer#list-item.3']
  ],
  ['/', { find: 'Contact' }, 'AMBIGUOUS', ['nav:68#navigation-link.6:label', 'part:footer#heading.3']],
  ['/', { find: 'Careers' }, 'AMBIGUOUS', ['nav:69#navigation-link:label', 'nav:70#navigation-link.4:label']],
  [
    '/',
    { find: 'Read more →' },
    'AMBIGUOUS',
    ['post:42#news.item.1.href', 'post:42#news.item.2.href', 'post:42#news.item.3.href']
  ],
  ['/news/', { find: 'Get our industry brief every two weeks' }, 'NOT_EDITABLE', []]
]

{
  for (const [path, params, verdict, places] of TABLE)
    test(`for each ask the verdict and the places it lives in, and a dryRun or a refusal sends no write: ${rowName(path)}`, async () => {
      const label = `${path} ${JSON.stringify(params)}`

      const { out, site } = await run({ replace: 'New words here', dryRun: true, path, ...params })

      assert.equal(out.ok ? 'WRITE' : out.code, verdict, `${label} ${JSON.stringify(out)}`)
      assert.deepEqual(placesOf(out), places, label)
      if (out.ok) assert.equal(out.dryRun, true, label)
      assert.deepEqual(
        site.calls.filter(([a]) => a !== 'content.get' && a !== 'content.list'),
        [],
        `${label}: no write`
      )
    })
}

test('words only in a theme file are NOT_EDITABLE and say why, with nothing to try instead', async () => {
  const { out } = await run({
    find: 'Get our industry brief every two weeks',
    replace: 'x y',
    path: '/news/'
  })
  assert.equal(out.code, 'NOT_EDITABLE')
  assert.match(out.error, /theme's template file/)
  assert.match(out.next, /that is an answer/)
})

test('a linked featured image repeats its post title: the title changes, its alt is not a place left unchanged', async () => {
  const { out } = await run({
    find: 'Northgate wins the Zavolzhye 2 infrastructure tender',
    replace: 'Northgate wins the tender',
    path: '/news/',
    dryRun: true
  })
  assert.deepEqual(placesOf(out), ['post:521.title'])
  assert.equal(out.unchanged, undefined, JSON.stringify(out.unchanged))
})

const HELD_WP = HELD.cases.filter((/** @type {any} */ c) => c.site === 'benchwp01')
/** The page record each oracle page names (`page-id-N` on the fixture pages). */
const ORACLE_PAGE = /** @type {Record<string, number>} */ ({ home: 42, about: 37, contact: 39 })

test('held out: each WordPress call of the bench gets the verdict its page decides, writes where the page shows the words, and leaves no old words in a part', async () => {
  // Every WordPress call of the bench is in the set: a loop over a lost fixture would pass on nothing.
  assert.ok(HELD_WP.length >= 25, `${HELD_WP.length}`)
  for (const c of HELD_WP) {
    const label = `${c.case} ${c.path}: ${c.pageSays.verdict}`
    const site = component()
    const call = { path: c.path, ...c.call }
    let { out } = await run(call, { site, pages: { ...PAGES } })
    // `all` over five places asks for the count first (confirm-count), then writes with it.
    if (out.code === 'VALUE_NOT_ALLOWED' && out.rule === 'confirm-count') {
      assert.deepEqual(site.writes(), [], label)
      ;({ out } = await run({ ...call, expect: out.count }, { site }))
    }
    const verdict = out.ok ? 'WRITE' : out.code
    if (c.refuseOk && !out.ok) {
      assert.deepEqual(site.writes(), [], `${label}: a refusal writes nothing`)
      continue
    }
    assert.equal(verdict, c.pageSays.verdict, `${label} ${JSON.stringify(out)}`)
    if (verdict !== 'WRITE') {
      assert.deepEqual(site.writes(), [], label)
      continue
    }
    // Every place the page alone names is among the places written, region for region.
    const regions = out.changed.map((/** @type {any} */ w) => w.where)
    for (const [where] of c.pageSays.places)
      assert.ok(regions.includes(where), `${label}: ${where} in ${regions}`)
    // A page's own words are written into THAT page's record, not another in the same region.
    const pageKey = Object.keys(c.oracle).find(
      (k) => k in ORACLE_PAGE && ORACLE_PAGE[k] === pageFactsOf(PAGES[c.path]).pageId
    )
    if (pageKey && c.pageSays.places.some((/** @type {string[]} */ [where]) => where === 'main'))
      assert.ok(
        site.writes().some((w) => w.kind === 'post' && w.id === ORACLE_PAGE[pageKey]),
        `${label}: post ${ORACLE_PAGE[pageKey]} written`
      )
    // The records written now read the new words, and the parts no longer read the old.
    const text = foldForMatch(writtenWords(site))
    for (const o of Object.values(c.oracle)) {
      for (const has of o.has ?? []) assert.ok(text.includes(foldForMatch(has)), `${label}: ${has}`)
      for (const gone of o.gone ?? [])
        if (!(o.has ?? []).some((/** @type {string} */ h) => h.includes(gone)))
          for (const w of site.writes().filter((x) => x.kind === 'templatePart'))
            assert.ok(
              !foldForMatch(wordsOf('blocks', w.fields.content)).includes(foldForMatch(gone)),
              `${label}: ${gone}`
            )
    }
  }
})

/**
 * Every visible word of every record the job wrote, each field read in its own shape.
 * @param {ReturnType<typeof component>} site
 */
function writtenWords(site) {
  /** @type {Record<string, 'blocks' | 'plain'>} */
  const shapes = {
    post_content: 'blocks',
    content: 'blocks',
    post_title: 'plain',
    post_excerpt: 'plain',
    name: 'plain'
  }
  return site
    .writes()
    .flatMap((w) =>
      Object.entries(w.fields).map(([field, value]) =>
        wordsOf(
          field === 'value' ? (w.key === '_form' ? 'cf7' : 'plain') : (shapes[field] ?? 'plain'),
          String(value)
        )
      )
    )
    .join('\n')
}

// ── Writes: order, ids, the receipt ─────────────────────────────────────────────────────────────

test('the hotline everywhere: header, footer and the three pages that print it, links following, parts first', async () => {
  const { out, site } = await run({ find: '8 800 550-67-89', replace: '0909 123 456', all: true })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(placesOf(out), [
    'part:header#paragraph',
    'part:footer#paragraph.4',
    'post:39#contact.item.2.text',
    'post:40#html.14',
    'post:49#html.60'
  ])
  // the site's bodies were read to find the pages that are not this one
  assert.ok(
    site.calls.some(([a, p]) => a === 'content.list' && p.include_body === true && p.post_type === undefined)
  )
  // the `site` toolset first (a role without it is refused before anything is written), one apply id
  assert.deepEqual(
    site.writes().map((w) => [w.kind, w.key ?? w.id, w.apply_id]),
    [
      ['templatePart', 'footer', 'replace-test-1'],
      ['templatePart', 'header', 'replace-test-1'],
      ['post', 39, 'replace-test-1'],
      ['post', 40, 'replace-test-1'],
      ['post', 49, 'replace-test-1']
    ]
  )
  // the tel: links dial the new number, in the international form's place
  for (const id of [HEADER, FOOTER]) {
    const body = site.posts.get(id).post_content
    assert.ok(body.includes('<a href="tel:0909123456">0909 123 456</a>'), body.slice(0, 200))
    assert.ok(!body.includes('78005506789'))
  }
  assert.deepEqual(
    out.companions.map((/** @type {any} */ c) => [c.at, c.before, c.after]),
    [
      ['part:header#paragraph', 'tel:+78005506789', 'tel:0909123456'],
      ['part:footer#paragraph.4', 'tel:+78005506789', 'tel:0909123456']
    ]
  )
  assert.deepEqual(out.undo, { action: 'apply.revert', params: { apply_id: 'replace-test-1' } })
  assert.match(out.notReached, /other languages/)
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= RECEIPT_MAX_BYTES)
  // and the receipt's undo puts every record back
  await site.door('apply.revert', out.undo.params)
  for (const p of SITE.posts) assert.equal(site.posts.get(p.ID).post_content, p.post_content, `post ${p.ID}`)
})

{
  const cases = [
    [
      { find: 'Investors', replace: 'Investor relations' },
      { kind: 'post', id: 69 }
    ],
    [
      { find: 'Ivan Petrov', replace: 'Nguyen Van A', path: '/contact/' },
      { kind: 'postmeta', id: 25, key: '_form' }
    ],
    [
      { find: 'News & engineering notes', replace: 'Insights', path: '/news/' },
      { kind: 'postmeta', id: 51, key: 'tracy_page_heading' }
    ],
    [
      { find: 'Engineering', replace: 'Engineering notes', path: '/news/' },
      { kind: 'term', key: 'category', id: 45 }
    ],
    [
      { find: 'Industrial infrastructure', replace: 'Trusted since 2004' },
      { kind: 'option', key: 'blogdescription' }
    ],
    [
      { find: 'Mon-Fri, 9:00-18:00 (MSK)', replace: 'Mon-Sat, 8:00-17:00' },
      { kind: 'templatePart', key: 'footer' }
    ]
  ]
  for (const [params, address] of cases)
    test(`every write names its record: id on posts, forms, meta and terms; the part by slug with its title: ${rowName(params)}`, async () => {
      const { out, site } = await run(params)
      assert.equal(out.ok, true, JSON.stringify(out))
      const [w] = site.writes()
      for (const [k, v] of Object.entries(address)) assert.equal(w[k], v, `${JSON.stringify(params)} ${k}`)
      if (w.kind === 'templatePart') {
        assert.equal(w.id, undefined, 'a part is written by its slug alone, as the body guard remembers it')
        assert.equal(
          w.fields.title,
          'Footer',
          'the title is kept: without it the part is renamed to its slug'
        )
      }
      if (w.kind === 'term') assert.deepEqual(w.fields, { name: 'Engineering notes' })
      // read immediately before it is written, with the same address
      const at = site.calls.findIndex(([a]) => a === 'content.update')
      const [action, before] = site.calls[at - 1]
      assert.equal(action, 'content.get')
      for (const k of ['kind', 'id', 'key'])
        assert.equal(before[k], w[k] ?? undefined, `${JSON.stringify(params)} ${k}`)
    })
}

test('a contact form: only `_form` is read or written, and [ ] in new words is refused', async () => {
  const { out, site } = await run({ find: 'Send request', replace: 'Send', path: '/contact/' })
  assert.equal(out.ok, true)
  assert.ok(site.meta[25]._form.includes('[submit "Send"]'))
  assert.ok(!site.calls.some(([, p]) => /_messages|_mail/.test(String(p.key))))
  const bracket = await run({ find: 'Ivan Petrov', replace: 'Ivan [Petrov]', path: '/contact/' })
  assert.equal(bracket.out.code, 'VALUE_NOT_ALLOWED')
  assert.equal(bracket.out.rule, 'cf7-bracket')
  assert.deepEqual(bracket.site.writes(), [])
  // a double quote inside an option would end it: it is written as a typographic one
  const quote = await run({ find: 'Ivan Petrov', replace: 'e.g. "Ivan"', path: '/contact/' })
  assert.ok(quote.site.meta[25]._form.includes('placeholder "e.g. ”Ivan”"'))
})

test('an e-mail changes with its mailto: link, and the theme toggle keeps its twins', async () => {
  const mail = await run({ find: 'info@northgate-ind.ru', replace: 'hello@example.vn' })
  assert.ok(
    mail.site.posts
      .get(HEADER)
      .post_content.includes('<a href="mailto:hello@example.vn">hello@example.vn</a>')
  )
  assert.deepEqual(mail.out.companions, [
    {
      at: 'part:header#paragraph.2',
      before: 'mailto:info@northgate-ind.ru',
      after: 'mailto:hello@example.vn',
      why: WP_REPLACE_NEXT.linkEmail
    }
  ])
  const dark = await run({ find: 'Dark', replace: 'Night' })
  assert.ok(
    dark.site.posts
      .get(HEADER)
      .post_content.includes('data-text-dark="Night" data-text-light="Light">Night</span>')
  )
})

test('a hotline whose last digits change: each tel: link dials the new number, one companion per link', async () => {
  const dash = await run({ find: '8 800 550-67-89', replace: '8 800 550‑67‑89', all: true })
  assert.equal(dash.out.ok, true, JSON.stringify(dash.out))
  assert.equal(dash.out.companions, undefined)
  assert.match(dash.site.posts.get(HEADER).post_content, /<a href="tel:\+78005506789">8\s800 550‑67‑89<\/a>/)
})

{
  for (const [params, linked] of /** @type {[Record<string, unknown>, number[]][]} */ ([
    [{ find: '8 800 550-67-89', replace: '8 800 550-67-00', all: true }, [HEADER, FOOTER]],
    [{ find: 'Hotline: 8 800 550-67-89', replace: 'Hotline: 8 800 550-67-00' }, [HEADER]],
    [{ find: '550-67-89', replace: '550-67-00', all: true }, [HEADER, FOOTER]]
  ]))
    test(`a hotline whose last digits change: each tel: link dials the new number, one companion per link: ${rowName(params)}`, async () => {
      const { out, site } = await run(params)
      assert.equal(out.ok, true, JSON.stringify(out))
      for (const id of [HEADER, FOOTER]) {
        const body = site.posts.get(id).post_content
        // (the stored number keeps its own no-break space: "8\u00a0800", only the changed words move)
        if (linked.includes(id)) {
          // the link keeps its international form: the new number is written the way the old one was
          assert.match(
            body,
            /<a href="tel:\+78005506700">8\s800 550-67-00<\/a>/,
            `${id} ${JSON.stringify(params)}`
          )
          assert.ok(!body.includes('tel:+78005506789'), `${id} still dials the old number`)
        } else assert.match(body, /<a href="tel:\+78005506789">8\s800 550-67-89<\/a>/)
      }
      assert.deepEqual(
        out.companions.map((/** @type {any} */ c) => [c.at, c.before, c.after, c.why]),
        linked.map((id) => [
          id === HEADER ? 'part:header#paragraph' : 'part:footer#paragraph.4',
          'tel:+78005506789',
          'tel:+78005506700',
          WP_REPLACE_NEXT.linkPhone
        ]),
        JSON.stringify(params)
      )
    })
}

{
  // the footer stores en dashes; the customer's hyphens fold to the same view the matcher reads
  for (const dryRun of [false, true])
    test(`a change of typography alone: the receipt shows the stored characters, not a view that reads the same twice: ${rowName(dryRun)}`, async () => {
      const { out } = await run({
        find: 'Mon–Fri, 9:00–18:00 (MSK)',
        replace: 'Mon-Fri, 9:00-18:00 (MSK)',
        dryRun
      })
      assert.equal(out.ok, true, JSON.stringify(out))
      const [row] = out.changed ?? out.would
      assert.equal(row.at, 'part:footer#paragraph.6')
      assert.deepEqual([row.before, row.after], ['Mon–Fri, 9:00–18:00 (MSK)', 'Mon-Fri, 9:00-18:00 (MSK)'])
    })
}

{
  const toggle = (/** @type {string} */ html, /** @type {string} */ dark, /** @type {string} */ light) =>
    html.replace(
      'data-text-dark="Dark" data-text-light="Light">Dark</span>',
      `data-text-dark="${dark}" data-text-light="${light}">${dark}</span>`
    )
  const header = SITE.posts.find((/** @type {any} */ p) => p.ID === HEADER)
  const pages = { '/': toggle(PAGES['/'], 'Dark mode', 'Light mode') }
  for (const [replace, want] of [
    ['Night mode', 'Night mode'],
    // narrowed to "theme" (the first word is kept): the twin still gets the whole label
    ['Dark theme', 'Dark theme']
  ])
    test(`a toggle label of several words keeps its twins: they hold the whole new label, however narrowed: ${rowName(replace)}`, async () => {
      const site = component({
        posts: [{ ...header, post_content: toggle(header.post_content, 'Dark mode', 'Light mode') }]
      })
      const { out } = await run({ find: 'Dark mode', replace }, { site, pages })
      assert.equal(out.ok, true, JSON.stringify(out))
      assert.ok(
        site.posts
          .get(HEADER)
          .post_content.includes(`data-text-dark="${want}" data-text-light="Light mode">${want}</span>`),
        replace
      )
      assert.deepEqual(
        out.companions.map((/** @type {any} */ c) => [c.at, c.before, c.after]),
        [['part:header#html@data-text-dark', 'Dark mode', want]]
      )
    })
}

test('followLink: the international and the local form of one number are one number; two area codes never', () => {
  assert.equal(followLink('tel:+78005506789', '8 800 550-67-89', '0909 123 456'), 'tel:0909123456')
  assert.equal(followLink('tel:+84909123456', '0909 123 456', '+84 28 5555 0134'), 'tel:+842855550134')
  assert.equal(followLink('tel:88005506789', '8 800 550-67-89', '8 800 111-22-33'), 'tel:88001112233')
  assert.equal(followLink('tel:+74951234567', '8 812 123-45-67', '0909 123 456'), null)
  assert.equal(followLink('tel:+78005506789', '550-67-89', '0909 123 456'), null)
  // written the way the old one was, the new number keeps the link's international form
  assert.equal(followLink('tel:+78005506789', '8 800 550-67-89', '8 800 550-67-00'), 'tel:+78005506700')
  assert.equal(followLink('https://example.com', '8 800 550-67-89', '0909 123 456'), null)
})

test('followLink: a trunk prefix in brackets after the country code is never dialled', () => {
  // Measured 02/10/2026 on an imported Joomla copy (Australia): the page printed "+61 (0)7 5550 6697",
  // the link dialled tel:+61755506697, and the link stayed on the old number after the change.
  for (const [href, find, replace, want] of /** @type {const} */ ([
    ['tel:+61755506697', '+61 (0)7 5550 6697', '+61 (0)7 5550 7000', 'tel:+61755507000'],
    ['tel:+442079460018', '+44 (0)20 7946 0018', '+44 (0)20 7946 0019', 'tel:+442079460019'],
    ['tel:+493012345678', '+49 (0)30 1234 5678', '+49 (0) 30 1234 9999', 'tel:+493012349999'],
    ['tel:+61755506697', '+61 (0)7 5550 6697', '07 5550 7000', 'tel:0755507000'],
    ['tel:+61755506697', '+61 (0)7 5550 1111', '+61 (0)7 5550 7000', null]
  ]))
    assert.equal(followLink(href, find, replace), want, `${find} → ${replace}`)
  assert.equal(dialDigits('+61 (0)7 5550 6697'), '61755506697')
  assert.equal(dialDigits('tel:+61755506697'), '61755506697')
  // only after a country code: a local number in brackets keeps every digit
  assert.equal(dialDigits('(07) 5550 6697'), '0755506697')
})

// ── The block grammar: what WordPress's own parser reads back ───────────────────────────────────

/** `WP_Block_Parser::next_token`'s delimiter pattern (wp-includes/class-wp-block-parser.php, WordPress */
const WP_TOKEN =
  /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+(\{(?:(?:[^}]+|\}+(?=\})|(?!\}\s+\/?-->)[\s\S])*)?\}\s+)?(\/)?-->/g

/** @param {string} body */
function wpBlocks(body) {
  const out = []
  for (const m of body.matchAll(WP_TOKEN))
    out.push({ at: m.index, name: `${m[2] ?? 'core/'}${m[3]}`, attrs: m[4] ? JSON.parse(m[4]) : null })
  return out
}

test('the block grammar round-trips the three values the structure map proved through WP_Block_Parser', async () => {
  assert.equal(
    encodeJsonText('Investors & <press> "quoted" -- x'),
    'Investors \\u0026amp; \\u0026lt;press\\u0026gt; \\u0022quoted\\u0022 \\u002d\\u002d x'
  )
})

{
  const cases = [
    // nav label: & < > " -- in a JSON attribute
    [
      { find: 'Investors', replace: 'Investors & <press> "quoted" -- x' },
      69,
      'core/navigation-link',
      'label'
    ],
    // the header mega-menu label
    [{ find: 'Resources', replace: 'R&D "hub"' }, HEADER, 'wp-tracy-business/mega-menu', 'label'],
    // the hero H1: HTML text
    [{ find: 'Building the groundwork for next-generation plants', replace: 'A & B <c>' }, 42, null, null]
  ]
  for (const [params, id, block, attr] of cases)
    test(`the block grammar round-trips the three values the structure map proved through WP_Block_Parser: ${rowName(params)}`, async () => {
      const { out, site } = await run(params)
      assert.equal(out.ok, true, JSON.stringify(out))
      const before = SITE.posts.find((/** @type {any} */ p) => p.ID === id).post_content
      const after = site.posts.get(id).post_content
      const was = wpBlocks(before)
      const now = wpBlocks(after)
      assert.equal(now.length, was.length, 'as many blocks as before')
      assert.equal(now.length, (after.match(/<!--\s+\/?wp:/g) ?? []).length, 'every block comment parses')
      assert.equal(blockMarkupProblem(after), null)
      if (block) {
        const d = now.find(
          (x) => x.name === block && decodeEntities(x.attrs?.[attr] ?? '') === params.replace
        )
        assert.ok(d, `${block} ${attr} reads ${params.replace}`)
        // the attribute holds HTML-escaped rich text, JSON-encoded the WordPress way
        assert.equal(d.attrs[attr], escapeHtmlText(params.replace))
        assert.ok(
          !/--|[<>&]|\\"/.test(
            after.slice(
              after.indexOf(encodeJsonText(params.replace)) - 1,
              after.indexOf(encodeJsonText(params.replace)) + encodeJsonText(params.replace).length
            )
          )
        )
      } else {
        assert.ok(after.includes('>A &amp; B <br><em>&lt;c&gt;</em></h1>'), 'HTML text escapes & < >')
        assert.ok(wordsOf('blocks', after).includes('A & B <c>'))
      }
    })
}

test('parseBlocks reads delimiters as WordPress does: namespace, void, attributes, a broken object flagged', () => {
  const raw =
    '<!-- wp:paragraph {"className":"a"} --><p>x</p><!-- /wp:paragraph --><!-- wp:tracy/hero /--><!-- wp:heading {"level":2 -->'
  const d = parseBlocks(raw)
  assert.deepEqual(
    d.map((x) => [x.name, x.closer, x.isVoid, x.attrsOk]),
    [
      ['core/paragraph', false, false, true],
      ['core/paragraph', true, false, true],
      ['tracy/hero', false, true, true]
    ]
  )
})

test('proveRewrite: bytes outside the edits, the block count, a comment WordPress cannot read, words not readable', () => {
  const raw = '<!-- wp:paragraph -->\n<p>Old words here</p>\n<!-- /wp:paragraph -->'
  const store = { shape: /** @type {const} */ ('blocks'), raw }
  const at = raw.indexOf('Old')
  const edits = [{ s: at, e: at + 3, text: 'New' }]
  const good = raw.replace('Old', 'New')
  assert.equal(proveRewrite(store, good, ['new words here'], edits), null)
  assert.deepEqual(proveRewrite(store, good.replace('here', 'HERE'), ['new words'], edits), {
    found: 'bytes outside the change'
  })
  assert.equal(proveRewrite(store, good.replace('<!-- /wp:paragraph -->', ''), [])?.found, 'block count')
  assert.equal(
    proveRewrite(store, good.replace('/wp:paragraph -->', '/wp:paragraph ->'), [])?.found,
    'block count'
  )
  assert.equal(proveRewrite(store, raw.replace('Old', '<b>New'), ['new words here'])?.found, undefined)
  assert.equal(
    proveRewrite(store, raw.replace('Old words here', ''), ['new words'])?.found,
    'new words not readable'
  )
})

test('narrowChange keeps the words both texts share, so a link around the number stays', () => {
  assert.deepEqual(narrowChange('Hotline: 8 800 550-67-89', 'Hotline: 0909 123 456'), {
    p: 9,
    q: 0,
    mid: '0909 123 456'
  })
  assert.deepEqual(narrowChange('Established 2004', 'Founded 2004'), { p: 0, q: 5, mid: 'Founded' })
  assert.deepEqual(narrowChange('Mon-Fri, 9:00-18:00 (MSK)', 'Mon–Sat, 8:00–17:00'), {
    p: 0,
    q: 0,
    mid: 'Mon–Sat, 8:00–17:00'
  })
})

// ── Refusals, the self-revert and the re-plan ───────────────────────────────────────────────────

test('SITE_BUSY after the first record: this call undoes its own apply and answers the code unchanged', async () => {
  const site = component({
    script: (action, params) =>
      action === 'content.update' && params.kind === 'post'
        ? { ok: false, code: 'SITE_BUSY', error: 'someone else is editing this site' }
        : undefined
  })
  const { out } = await run({ find: '8 800 550-67-89', replace: '0909 123 456', all: true }, { site })
  assert.equal(out.code, 'SITE_BUSY')
  assert.equal(out.reverted, true)
  assert.equal(out.written, 2)
  const reverts = site.calls.filter(([a]) => a === 'apply.revert')
  assert.deepEqual(reverts, [['apply.revert', { apply_id: 'replace-test-1' }]])
  assert.equal(
    site.posts.get(HEADER).post_content,
    SITE.posts.find((/** @type {any} */ p) => p.ID === HEADER).post_content
  )
})

test('an undo that fails in part is PARTIAL: what stands, and the one call that undoes the rest', async () => {
  const site = component({
    script: (action, params) => {
      if (action === 'content.update' && params.kind === 'post')
        return { ok: false, code: 'SITE_BUSY', error: 'busy' }
      if (action === 'apply.revert')
        return { ok: true, reverted: 1, failed: [{ op: 'content', error: 'row locked' }] }
      return undefined
    }
  })
  const { out } = await run({ find: '8 800 550-67-89', replace: '0909 123 456', all: true }, { site })
  assert.equal(out.code, 'PARTIAL')
  assert.equal(out.apply_id, 'replace-test-1')
  assert.equal(out.reverted, false)
  assert.match(out.error, /row locked/)
  assert.match(out.next, /apply\.revert \{apply_id:"replace-test-1"\}/)
})

test('a record changed between plan and write: one fresh plan, then the write', async () => {
  let reads = 0
  const site = component({
    script: (action, params) => {
      if (action !== 'content.get' || params.kind !== 'templatePart' || params.key !== 'footer')
        return undefined
      reads += 1
      // the pre-write read of the first plan sees an admin's edit
      if (reads === 2) {
        const p = SITE.posts.find((/** @type {any} */ x) => x.ID === FOOTER)
        return {
          ok: true,
          kind: 'templatePart',
          id: 0,
          key: 'footer',
          item: {
            id: FOOTER,
            title: 'Footer',
            content: `${p.post_content}\n<!-- wp:paragraph -->\n<p>Admin edit</p>\n<!-- /wp:paragraph -->`,
            area: 'footer'
          }
        }
      }
      return undefined
    }
  })
  const { out } = await run({ find: 'Mon-Fri, 9:00-18:00 (MSK)', replace: 'Mon-Sat, 8:00-17:00' }, { site })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(site.calls.filter(([a, p]) => a === 'content.get' && p.key === 'footer').length, 4)
  assert.equal(site.writes().length, 1)
})

test('changed after this call wrote a record: its own apply is undone and it says so', async () => {
  let headerReads = 0
  const site = component({
    script: (action, params) => {
      if (action !== 'content.get' || params.key !== 'header') return undefined
      headerReads += 1
      return headerReads >= 2
        ? {
            ok: true,
            kind: 'templatePart',
            id: 0,
            key: 'header',
            item: {
              id: HEADER,
              title: 'Header',
              content: `${site.partOf('header').post_content} `,
              area: 'header'
            }
          }
        : undefined
    }
  })
  const { out } = await run(
    { find: '8 800 550-67-89', replace: '0909 123 456', all: true, expect: 5 },
    { site }
  )
  assert.equal(out.code, 'STORE_CHANGED')
  assert.equal(out.reverted, true)
  assert.match(out.error, /the 1 records written first were undone/)
  assert.deepEqual(
    site.calls.filter(([a]) => a === 'apply.revert'),
    [['apply.revert', { apply_id: 'replace-test-1' }]]
  )
})

test('a write whose answer was lost is never undone: how many records may stand, and the dryRun that shows them', async () => {
  const call = { find: '8 800 550-67-89', replace: '0909 123 456', all: true }
  /** @type {[string, number, (params: Record<string, any>) => unknown][]} */
  // the lock miss proves nothing ran: an ordinary refusal, this call's first write undone by nobody
  const lock = component({
    script: (action) =>
      action === 'content.update'
        ? { ok: false, error: 'writer_busy', message: 'another writer is changing this site' }
        : undefined
  })
  const busy = await run(call, { site: lock })
  assert.equal(busy.out.error, 'writer_busy')
  assert.equal(busy.out.reverted, undefined)
  // a removal whose answer was lost: its dryRun finds the old words, and NOT_FOUND says it landed
  const removal = component({
    posts: [SMALL_POST],
    script: (action) =>
      action === 'content.update'
        ? { ok: false, code: 'OUTCOME_UNKNOWN', action: 'content.update', lost: 'COWORK_WEB_UNREACHABLE' }
        : undefined
  })
  const gone = await run(
    { find: 'Keep this short line.', replace: '', path: '/small/' },
    { site: removal, pages: { '/small/': SMALL_PAGE } }
  )
  assert.equal(gone.out.code, 'OUTCOME_UNKNOWN', JSON.stringify(gone.out))
  assert.equal(
    gone.out.next,
    'tracy_site content.replace {find:"Keep this short line.", replace:"", dryRun:true} in about 30 s answers NOT_FOUND if the removal landed; do not repeat the call'
  )
})

{
  const call = { find: '8 800 550-67-89', replace: '0909 123 456', all: true }
  const shapes = [
    // the first write: the relay threw after sending it
    [
      'thrown',
      1,
      () => {
        throw new Error('socket hang up')
      }
    ],
    // the second write: the relay's own OUTCOME_UNKNOWN (`outcomeUnknownAnswer`)
    [
      'relayed',
      2,
      (params) => ({
        ok: false,
        code: 'OUTCOME_UNKNOWN',
        action: 'content.update',
        lost: 'COWORK_WEB_UNREACHABLE',
        apply_id: params.apply_id,
        error: 'content.update was sent and its answer was lost (COWORK_WEB_UNREACHABLE): it may have landed.'
      })
    ],
    // a gateway status, and `writer_busy` that is not the lock miss (the component wrapping an error)
    [
      'gateway',
      2,
      () => ({ ok: false, code: 'COMPONENT_BAD_RESPONSE', httpStatus: 504, error: 'Gateway Timeout' })
    ],
    [
      'wrapped',
      1,
      () => ({ ok: false, error: 'writer_busy', message: 'Call to a member function get_row() on null' })
    ],
    // no object at all
    ['empty', 2, () => null]
  ]
  for (const [name, at, answer] of shapes)
    test(`a write whose answer was lost is never undone: how many records may stand, and the dryRun that shows them: ${rowName(name)}`, async () => {
      let n = 0
      const site = component({
        script: (action, params) =>
          action === 'content.update' && (n += 1) === at ? answer(params) : undefined
      })
      const { out } = await run(call, { site })
      assert.equal(out.code, 'OUTCOME_UNKNOWN', `${name}: ${JSON.stringify(out)}`)
      assert.equal(out.apply_id, 'replace-test-1', name)
      assert.equal(out.written, at - 1, name)
      assert.equal(out.reverted, false, name)
      assert.equal(out.planned.length, 5, name)
      assert.match(
        out.error,
        new RegExp(`: ${at - 1} or ${at} of 5 records may now hold the new words$`),
        name
      )
      assert.equal(
        out.next,
        'tracy_site content.replace {find:"0909 123 456", replace:"8 800 550-67-89", dryRun:true} in about 30 s shows where the new words stand; do not repeat the call',
        name
      )
      assert.ok(!site.calls.some(([a]) => a === 'apply.revert'), `${name}: nothing is reverted`)
      assert.equal(site.writes().length, at, `${name}: nothing is sent after the lost write`)
      // what landed before it stands, and the answer says so
      if (at === 2) assert.ok(site.partOf('footer').post_content.includes('0909 123 456'), name)
    })
}

// ── Template parts: the active theme's, by slug, never a list row ───────────────────────────────

/** Template parts an earlier theme left in the table (`wp_theme` = twentytwentyfive). */
const OLD_THEME_PARTS = [
  {
    ID: 90,
    post_name: 'header',
    post_title: 'Header',
    area: 'header',
    content: '<p>Hotline: 8 800 550-67-89 · Old theme banner</p>'
  },
  {
    ID: 91,
    post_name: 'sidebar-old',
    post_title: 'Sidebar',
    area: 'uncategorized',
    content: '<p>Old theme banner</p>'
  }
].map(({ content, ...p }) => ({
  ...p,
  post_type: 'wp_template_part',
  post_status: 'publish',
  post_excerpt: '',
  theme: 'twentytwentyfive',
  post_content: `<!-- wp:paragraph -->\n${content}\n<!-- /wp:paragraph -->`
}))

test("a second theme's header row is never a source, and a part the active theme lacks is skipped", async () => {
  const site = component({ posts: OLD_THEME_PARTS })
  const { out } = await run({ find: '8 800 550-67-89', replace: '0909 123 456', all: true }, { site })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.ok(site.posts.get(90).post_content.includes('550-67-89'), 'the old theme row is untouched')
  assert.ok(site.writes().every((w) => w.id !== 90 && w.id !== 91))
  // the part index is read without bodies, and each part only as content.get {kind:"templatePart", key}
  assert.ok(
    site.calls.some(([a, p]) => a === 'content.list' && p.post_type === 'wp_template_part' && !p.include_body)
  )
  assert.ok(
    site.calls.some(([a, p]) => a === 'content.get' && p.kind === 'templatePart' && p.key === 'sidebar-old')
  )
  assert.ok(
    !site.calls.some(([a, p]) => a === 'content.get' && p.kind === 'post' && [80, 81, 90, 91].includes(p.id))
  )
  const words = await run(
    { find: 'Old theme banner', replace: 'x y z' },
    { site: component({ posts: OLD_THEME_PARTS }) }
  )
  assert.equal(words.out.code, 'NOT_FOUND')
  assert.deepEqual(words.site.writes(), [])
})

test('a part whose id changes under the call (the theme switched) is never written', async () => {
  const site = component({
    script: (action, params, n) =>
      action === 'content.get' && params.kind === 'templatePart' && params.key === 'footer'
        ? {
            ok: true,
            kind: 'templatePart',
            id: 0,
            key: 'footer',
            item: {
              id: 1000 + n,
              title: 'Footer',
              content: site.partOf('footer').post_content,
              area: 'footer'
            }
          }
        : undefined
  })
  const { out } = await run({ find: 'Mon-Fri, 9:00-18:00 (MSK)', replace: 'Mon-Sat, 8:00-17:00' }, { site })
  assert.equal(out.code, 'STORE_CHANGED')
  assert.deepEqual(site.writes(), [])
})

// ── Menus with no ref of their own, and synced patterns ────────────────────────────────────────

/** A page of Tracy's own `tracy` theme (`packages/cms/tracy-wordpress-theme/src/tracy/parts/header.html`) */
const TRACY_PAGE =
  '<!DOCTYPE html><html lang="en-US"><head><title>Small</title><link rel="stylesheet" href="http://x.test/wp-content/themes/tracy/style.css?ver=1.0.0"></head><body class="page-template-default page page-id-900 wp-theme-tracy"><header class="wp-block-template-part"><div class="wp-block-group tracy-header__inner"><p class="tracy-header__note">Open every weekday</p><nav class="tracy-nav is-responsive wp-block-navigation is-layout-flex" aria-label="Main"><ul class="wp-block-navigation__container tracy-nav"><li class="wp-block-navigation-item wp-block-navigation-link"><a class="wp-block-navigation-item__content" href="/about/"><span class="wp-block-navigation-item__label">About us</span></a></li><li class="wp-block-navigation-item wp-block-navigation-link"><a class="wp-block-navigation-item__content" href="/careers/"><span class="wp-block-navigation-item__label">Careers</span></a></li></ul></nav></div></header><main class="wp-block-group"><div class="entry-content wp-block-post-content"><p>Keep this short line.</p></div></main></body></html>'

/** @param {number} id @param {string} created @param {string[]} labels */
const navPost = (id, created, labels) => ({
  ID: id,
  post_type: 'wp_navigation',
  post_status: 'publish',
  post_name: `main-${id}`,
  post_title: 'Main',
  post_excerpt: '',
  post_date_gmt: created,
  post_content: labels
    .map(
      (label) =>
        `<!-- wp:navigation-link {"label":"${label}","type":"page","id":37,"url":"/about/","kind":"post-type"} /-->`
    )
    .join('')
})

/** The `tracy` theme's header stored as a part (an admin saved it in the Site Editor). @param {string} content */
const tracyHeader = (content) => ({
  ID: 950,
  post_type: 'wp_template_part',
  post_status: 'publish',
  post_name: 'header',
  post_title: 'Header',
  post_excerpt: '',
  theme: 'tracy',
  area: 'header',
  post_content: content
})

/** The seeder's "Main" menu, published after the ja-business menus 68–71. */
const MAIN_NAV = navPost(500, '2026-09-24 09:00:00', ['About us', 'Contact'])

test('a navigation with no menu of its own prints the fallback menu: its labels are written there', async () => {
  // the part stored with the theme's own block — no ref, no inner blocks
  const stored = component({
    theme: 'tracy',
    posts: [
      SMALL_POST,
      MAIN_NAV,
      tracyHeader('<!-- wp:navigation {"className":"tracy-nav","overlayMenu":"mobile"} /-->')
    ]
  })
  const a = await run(
    { find: 'About us', replace: 'Who we are', path: '/small/' },
    { site: stored, pages: { '/small/': TRACY_PAGE } }
  )
  assert.equal(a.out.ok, true, JSON.stringify(a.out))
  assert.deepEqual(placesOf(a.out), ['nav:500#navigation-link:label'])
  assert.deepEqual(
    stored.writes().map((w) => [w.kind, w.id]),
    [['post', 500]]
  )
  assert.ok(stored.posts.get(500).post_content.includes('"label":"Who we are"'))
})

test('a header that is still the theme file: its menu is the fallback menu, and only words no record holds are the file', async () => {
  // no part stored at all (the seeder writes none): the rendered <nav> alone says a menu is there
  const site = component({ theme: 'tracy', posts: [SMALL_POST, MAIN_NAV] })
  const a = await run(
    { find: 'About us', replace: 'Who we are', path: '/small/' },
    { site, pages: { '/small/': TRACY_PAGE } }
  )
  assert.equal(a.out.ok, true, JSON.stringify(a.out))
  assert.deepEqual(placesOf(a.out), ['nav:500#navigation-link:label'])
  assert.deepEqual(
    site.writes().map((w) => [w.kind, w.id]),
    [['post', 500]]
  )
  // a label the fallback menu does not hold, and words beside the menu: the theme's own file
  for (const find of ['Careers', 'Open every weekday']) {
    const b = await run(
      { find, replace: 'x y', path: '/small/' },
      { site: component({ theme: 'tracy', posts: [SMALL_POST, MAIN_NAV] }), pages: { '/small/': TRACY_PAGE } }
    )
    assert.equal(b.out.code, 'NOT_EDITABLE', JSON.stringify(b.out))
    assert.match(b.out.error, /theme's template file/, find)
    assert.deepEqual(b.site.writes(), [])
  }
  // two menus published in the same second, both holding the label: AMBIGUOUS, never a guess
  const twins = component({
    theme: 'tracy',
    posts: [SMALL_POST, MAIN_NAV, navPost(501, '2026-09-24 09:00:00', ['About us'])]
  })
  const c = await run(
    { find: 'About us', replace: 'Who we are', path: '/small/' },
    { site: twins, pages: { '/small/': TRACY_PAGE } }
  )
  assert.equal(c.out.code, 'AMBIGUOUS', JSON.stringify(c.out))
  assert.deepEqual(placesOf(c.out).sort(), ['nav:500#navigation-link:label', 'nav:501#navigation-link:label'])
  assert.deepEqual(twins.writes(), [])
})

test('a navigation holding its own links: the label is written in the part, and no menu is read', async () => {
  const site = component({
    theme: 'tracy',
    posts: [
      SMALL_POST,
      MAIN_NAV,
      tracyHeader(
        '<!-- wp:navigation {"className":"tracy-nav"} --><!-- wp:navigation-link {"label":"About us","type":"page","id":37,"url":"/about/","kind":"post-type"} /--><!-- wp:navigation-link {"label":"Careers","type":"page","id":38,"url":"/careers/","kind":"post-type"} /--><!-- /wp:navigation -->'
      )
    ]
  })
  const { out } = await run(
    { find: 'About us', replace: 'Who we are', path: '/small/' },
    { site, pages: { '/small/': TRACY_PAGE } }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(placesOf(out), ['part:header#navigation-link:label'])
  assert.deepEqual(
    site.writes().map((w) => [w.kind, w.key]),
    [['templatePart', 'header']]
  )
  assert.ok(site.partOf('header').post_content.includes('"label":"Who we are"'))
  assert.ok(!site.calls.some(([a, p]) => a === 'content.list' && p.post_type === 'wp_navigation'))
})

test('words inside a synced pattern are written in its wp_block post, wherever the page names it', async () => {
  const page = {
    ...SMALL_POST,
    ID: 901,
    post_name: 'synced',
    post_content:
      '<!-- wp:block {"ref":600} /-->\n<!-- wp:paragraph -->\n<p>Keep this short line.</p>\n<!-- /wp:paragraph -->'
  }
  const pattern = {
    ID: 600,
    post_type: 'wp_block',
    post_status: 'publish',
    post_name: 'hero',
    post_title: 'Hero',
    post_excerpt: '',
    post_content:
      '<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading">Precision steel for every plant</h1>\n<!-- /wp:heading -->'
  }
  const html = PAGES['/']
    .replace(/page-id-42/g, 'page-id-901')
    .replace(
      /<main\b[\s\S]*<\/main>/,
      '<main class="wp-block-group"><div class="entry-content wp-block-post-content"><h1 class="wp-block-heading">Precision steel for every plant</h1><p>Keep this short line.</p></div></main>'
    )
  assert.equal(pageFactsOf(html).pageId, 901)
  const site = component({ posts: [page, pattern] })
  const { out } = await run(
    { find: 'Precision steel for every plant', replace: 'Steel built to last', path: '/synced/' },
    { site, pages: { '/synced/': html } }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(placesOf(out), ['block:600#heading'])
  assert.deepEqual(
    site.writes().map((w) => [w.kind, w.id]),
    [['post', 600]]
  )
  assert.ok(site.posts.get(600).post_content.includes('>Steel built to last</h1>'))
  assert.equal(site.posts.get(901).post_content, page.post_content, 'the page that names it is untouched')
  // 20/10/2026: the receipt says the other pages that use it change too, on a one-language site as well.
  assert.ok(
    (out.notes ?? []).includes(WP_REPLACE_NEXT.blockShared.replace('{what}', 'the synced pattern "Hero"')),
    JSON.stringify(out.notes)
  )
})

// ── Words a block theme holds: patterns, theme-file parts, templates ────────────────────────────

const PRICING_PATTERN =
  '<header class="page-hero wrap">\n  <h1>One month free with JoomlArt</h1>\n  <p class="lead">During the beta, JoomlArt subscribers get one month of Tracy free.</p>\n</header>\n'
/** The home page's shell with `main` replaced, as page `id` renders it. @param {number} id @param {string} main */
const shellWith = (id, main) =>
  PAGES['/'].replace(/page-id-42/g, `page-id-${id}`).replace(/<main\b[\s\S]*<\/main>/, main)

test('words of a theme pattern the page inserts are written by expanding it into the page, as the editor does', async () => {
  // Measured 30/09/2026 on the Tracy stand: /pricing/ was one `wp:pattern` line, and every word of
  // it answered "words the theme prints".
  const page = {
    ...SMALL_POST,
    ID: 902,
    post_name: 'pricing',
    post_content:
      '<!-- wp:pattern {"slug":"tracy/page-pricing"} /-->\n<!-- wp:paragraph -->\n<p>Keep this short line.</p>\n<!-- /wp:paragraph -->'
  }
  const html = shellWith(
    902,
    `<main class="wp-block-group"><div class="entry-content wp-block-post-content">${PRICING_PATTERN}<p>Keep this short line.</p></div></main>`
  )
  const site = component({
    posts: [page],
    patterns: { 'tracy/page-pricing': { title: 'Pricing', content: PRICING_PATTERN } }
  })
  const dry = await run(
    {
      find: 'One month free with JoomlArt',
      replace: 'Two months free with JoomlArt',
      path: '/pricing/',
      dryRun: true
    },
    { site, pages: { '/pricing/': html } }
  )
  assert.equal(dry.out.ok, true, JSON.stringify(dry.out))
  assert.equal(dry.out.would.length, 1, 'a dryRun names the place in the pattern it would change')
  assert.deepEqual(site.writes(), [])
  const { out } = await run(
    { find: 'One month free with JoomlArt', replace: 'Two months free with JoomlArt', path: '/pricing/' },
    { site, pages: { '/pricing/': html } }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.ok(
    placesOf(out).every((/** @type {string} */ at) => at.startsWith('pattern:tracy/page-pricing')),
    placesOf(out).join()
  )
  assert.deepEqual(
    site.writes().map((w) => [w.kind, w.id]),
    [['post', 902]],
    'the page is written; the pattern is not'
  )
  const body = site.posts.get(902).post_content
  assert.ok(!body.includes('wp:pattern'), 'the reference is replaced by the pattern it rendered')
  assert.ok(body.includes('<h1>Two months free with JoomlArt</h1>'))
  assert.ok(
    body.includes('During the beta, JoomlArt subscribers get one month of Tracy free.'),
    'the rest of the pattern stays'
  )
  assert.ok(body.endsWith('<!-- wp:paragraph -->\n<p>Keep this short line.</p>\n<!-- /wp:paragraph -->'))
  assert.ok(
    (out.notes ?? []).some((/** @type {string} */ n) => /goes into this page as its own words/.test(n)),
    JSON.stringify(out.notes)
  )
  // its undo puts the one-line reference back
  await site.door('apply.revert', out.undo.params)
  assert.equal(site.posts.get(902).post_content, page.post_content)
})

test('an older component that cannot read patterns keeps its answer: nothing is guessed, nothing written', async () => {
  const page = {
    ...SMALL_POST,
    ID: 903,
    post_name: 'old',
    post_content: '<!-- wp:pattern {"slug":"tracy/page-pricing"} /-->'
  }
  const html = shellWith(
    903,
    `<main class="wp-block-group"><div class="entry-content wp-block-post-content">${PRICING_PATTERN}</div></main>`
  )
  const site = component({ posts: [page] })
  const { out } = await run(
    { find: 'One month free with JoomlArt', replace: 'Two months free', path: '/old/' },
    { site, pages: { '/old/': html } }
  )
  assert.equal(out.code, 'NOT_EDITABLE')
  assert.deepEqual(site.writes(), [])
})

test('a part the site never stored is written as the override the Site Editor would make; undo hands it back to the file', async () => {
  const footer = SITE.posts.find((/** @type {any} */ p) => p.ID === FOOTER)
  const site = component({
    themeFiles: { parts: { footer: { content: footer.post_content, area: 'footer' } } }
  })
  site.posts.delete(FOOTER)
  assert.equal(site.partOf('footer'), undefined)
  const { out } = await run(
    { find: 'Mon–Fri, 9:00–18:00 (MSK)', replace: 'Mon–Sat, 9:00–18:00 (MSK)', path: '/' },
    { site }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    site.writes().map((w) => [w.kind, w.key]),
    [['templatePart', 'footer']]
  )
  const row = site.partOf('footer')
  assert.ok(row?.post_content.includes('Mon–Sat, 9:00–18:00 (MSK)'))
  assert.ok(
    (out.notes ?? []).some((/** @type {string} */ n) => /theme file/.test(n)),
    JSON.stringify(out.notes)
  )
  await site.door('apply.revert', out.undo.params)
  assert.equal(site.partOf('footer'), undefined, 'undo deletes the override: the file is in charge again')
})

test('a part rendered in a div wrapper is found by the landmark inside it', async () => {
  // Measured 30/09/2026 on the Tracy stand clone: `wp:template-part {"tagName":"div","area":"footer"}`
  // renders `<div class="wp-block-template-part"><footer>…`, and "© 2026 Tracy" answered "the
  // theme's template file" because the part's own tag is a div.
  const part =
    '<!-- wp:html -->\n<footer>\n  <div class="wrap foot"><span class="muted">© 2026 Tracy</span></div>\n</footer>\n<!-- /wp:html -->'
  const page = { ...SMALL_POST, ID: 905, post_name: 'wrapped' }
  const html = shellWith(
    905,
    '<main class="wp-block-group"><div class="entry-content wp-block-post-content"><p>Keep this short line.</p></div></main>'
  ).replace(
    /<footer\b[\s\S]*<\/footer>/,
    '<div class="wp-block-template-part"><footer>\n  <div class="wrap foot"><span class="muted">© 2026 Tracy</span></div>\n</footer></div>'
  )
  const site = component({
    posts: [page],
    themeFiles: { parts: { 'footer-marketing': { content: part, area: 'footer' } } }
  })
  const { out } = await run(
    { find: '© 2026 Tracy', replace: '© 2026 Tracy AI', path: '/wrapped/', dryRun: true },
    {
      site,
      pages: { '/wrapped/': html }
    }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(placesOf(out), ['part:footer-marketing#html'])
})

// A part whose wrapper names no landmark: `wp:template-part {"tagName":"div"}` around a `<nav>` or a
// plain `<div>`. Measured 02/10/2026 on an imported block-theme copy: the header part was read, yet
// every menu label answered "the theme's template file", because the area came from the wrapper
// alone. The region the page reader gives the words decides then, and failing that every part read.
const WRAPPED_PARTS = [
  {
    name: 'a nav in a div wrapper above the main, in the header part',
    top: '<div class="wp-block-template-part"><nav class="site-nav"><a href="/help/">Help center</a></nav></div>',
    bottom: '',
    parts: {
      'header-marketing': {
        area: 'header',
        words: '<nav class="site-nav"><a href="/help/">Help center</a></nav>'
      }
    },
    find: 'Help center',
    replace: 'Support',
    part: 'header-marketing'
  },
  {
    name: 'a plain div in a div wrapper above the main, in the header part',
    top: '<div class="wp-block-template-part"><div class="topline"><p>Open every weekday</p></div></div>',
    bottom: '',
    parts: { topline: { area: 'header', words: '<div class="topline"><p>Open every weekday</p></div>' } },
    find: 'Open every weekday',
    replace: 'Open Monday to Saturday',
    part: 'topline'
  },
  {
    name: 'a plain div in a div wrapper below the main, in the footer part',
    top: '',
    bottom:
      '<div class="wp-block-template-part"><div class="foot"><span>© 2026 Acme Travel</span></div></div>',
    parts: {
      'footer-site': { area: 'footer', words: '<div class="foot"><span>© 2026 Acme Travel</span></div>' }
    },
    find: '© 2026 Acme Travel',
    replace: '© 2026 Acme Holidays',
    part: 'footer-site'
  },
  {
    name: 'a header part the theme never filed under an area',
    top: '<div class="wp-block-template-part"><nav class="site-nav"><a href="/tours/">Our tours</a></nav></div>',
    bottom: '',
    parts: {
      masthead: { area: undefined, words: '<nav class="site-nav"><a href="/tours/">Our tours</a></nav>' }
    },
    find: 'Our tours',
    replace: 'All tours',
    part: 'masthead'
  }
]

/** @param {(typeof WRAPPED_PARTS)[number]} row */
const wrappedSite = (row) => {
  const page = { ...SMALL_POST, ID: 906, post_name: 'wrapped-part' }
  const html = shellWith(
    906,
    '<main class="wp-block-group"><div class="entry-content wp-block-post-content"><p>Keep this short line.</p></div></main>'
  )
    .replace(/<header\b[\s\S]*<\/header>/, row.top)
    .replace(/<footer\b[\s\S]*<\/footer>/, row.bottom)
  const parts = Object.fromEntries(
    Object.entries(row.parts).map(([slug, p]) => [
      slug,
      { content: `<!-- wp:html -->\n${p.words}\n<!-- /wp:html -->`, ...(p.area ? { area: p.area } : {}) }
    ])
  )
  return { page, html, site: component({ posts: [page], themeFiles: { parts } }) }
}

for (const row of WRAPPED_PARTS)
  test(`a part with no landmark of its own is found by where its words stand: ${row.name}`, async () => {
    const { html, site } = wrappedSite(row)
    const { out } = await run(
      { find: row.find, replace: row.replace, path: '/wrapped-part/', dryRun: true },
      { site, pages: { '/wrapped-part/': html } }
    )
    assert.equal(out.ok, true, JSON.stringify(out))
    assert.deepEqual(
      placesOf(out).map((/** @type {string} */ at) => at.split('#')[0]),
      [`part:${row.part}`]
    )
  })

test('a wrapped theme part is written as the site’s own copy, and undo hands it back to the file', async () => {
  const row = WRAPPED_PARTS[0]
  const { html, site } = wrappedSite(row)
  const { out } = await run(
    { find: row.find, replace: row.replace, path: '/wrapped-part/' },
    { site, pages: { '/wrapped-part/': html } }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    site.writes().map((w) => [w.kind, w.key]),
    [['templatePart', 'header-marketing']]
  )
  assert.ok(site.partOf('header-marketing')?.post_content.includes('>Support</a>'))
  assert.ok(
    (out.notes ?? []).some((/** @type {string} */ n) => /theme/.test(n)),
    JSON.stringify(out.notes)
  )
  await site.door('apply.revert', out.undo.params)
  assert.equal(
    site.partOf('header-marketing'),
    undefined,
    'undo deletes the copy: the file is in charge again'
  )
})

test('words above the main that no part holds are still the theme file’s, with nothing to try instead', async () => {
  const row = {
    ...WRAPPED_PARTS[0],
    top: '<div class="wp-block-template-part"><nav class="site-nav"><a href="/help/">Help center</a><span>Printed by PHP</span></nav></div>'
  }
  const { html, site } = wrappedSite(row)
  const { out } = await run(
    { find: 'Printed by PHP', replace: 'x', path: '/wrapped-part/' },
    { site, pages: { '/wrapped-part/': html } }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(site.writes().length, 0)
})

// Review of 02/10/2026: the area a part's landmark names, or the region its words stand in, with no part of that
// area read (an older component lists only the parts the site stored, so the header is a theme file), is the
// theme file's. The footer part that prints the same hotline is no stand-in for it: the receipt would say the
// topbar changed while the header kept the old number, and the honest "template file" note would be gone.
test('words in a header the component did not list are not claimed by the footer part that prints them too', async () => {
  const site = component()
  site.posts.delete(HEADER)
  const { out } = await run({ find: '8 800 550-67-89', replace: '8 800 000-00-00', path: '/' }, { site })
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    out.changed.map((/** @type {any} */ c) => [c.at.split('#')[0] + '#' + c.at.split('#')[1], c.where]),
    [['part:footer#paragraph.4', 'footer']]
  )
  assert.ok(
    (out.unchanged ?? []).some((/** @type {any} */ u) => u.where === 'topbar' && /template file/.test(u.why)),
    JSON.stringify(out.unchanged)
  )
  assert.deepEqual(
    site.writes().map((w) => w.key),
    ['footer']
  )
})

test('a call that names an unlisted header as the place is refused, and writes nothing to the footer', async () => {
  const site = component()
  site.posts.delete(HEADER)
  const { out } = await run(
    { find: '8 800 550-67-89', replace: '8 800 000-00-00', path: '/', where: 'topbar' },
    { site }
  )
  assert.equal(out.ok, false, JSON.stringify(out))
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.equal(site.writes().length, 0)
})

test('words a template prints are found in a second, wider read and written as its override', async () => {
  const template =
    '<!-- wp:template-part {"slug":"header"} /-->\n<!-- wp:group {"tagName":"main"} -->\n<main class="wp-block-group"><!-- wp:post-content /-->\n<!-- wp:paragraph -->\n<p>Built with Tracy on WordPress</p>\n<!-- /wp:paragraph --></main>\n<!-- /wp:group -->'
  const page = { ...SMALL_POST, ID: 904, post_name: 'plain' }
  const html = shellWith(
    904,
    '<main class="wp-block-group"><div class="entry-content wp-block-post-content"><p>Keep this short line.</p></div><p>Built with Tracy on WordPress</p></main>'
  )
  const site = component({
    posts: [page],
    themeFiles: { templates: { page: template, index: '<!-- wp:post-content /-->' } }
  })
  const { out } = await run(
    { find: 'Built with Tracy on WordPress', replace: 'Made with Tracy', path: '/plain/' },
    { site, pages: { '/plain/': html } }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.deepEqual(
    site.writes().map((w) => [w.kind, w.key]),
    [['template', 'page']]
  )
  assert.ok(site.templateOf('page')?.post_content.includes('<p>Made with Tracy</p>'))
  assert.ok(
    (out.notes ?? []).some((/** @type {string} */ n) => /every page/.test(n)),
    JSON.stringify(out.notes)
  )
  // words the site keeps nowhere are still the theme's, after the wider read too
  const none = await run(
    { find: 'Keep this short line and more', replace: 'x', path: '/plain/' },
    {
      site: component({ posts: [page], themeFiles: { templates: { page: template } } }),
      pages: { '/plain/': html }
    }
  )
  assert.notEqual(none.out.ok, true)
})

// ── Languages and the site's size ───────────────────────────────────────────────────────────────

test('Polylang notes only when the page names its language versions', async () => {
  const many = await run({ find: 'Mon-Fri, 9:00-18:00 (MSK)', replace: 'Mon-Sat, 8:00-17:00' })
  assert.deepEqual(many.out.notes, [WP_REPLACE_NEXT.partShared])
  const post = await run({ find: 'Talk to our sales team', replace: 'Call us' })
  assert.equal(post.out.notReached, WP_REPLACE_NEXT.pageLanguages)
  const one = /** @type {Record<string, string>} */ ({
    '/': PAGES['/'].replace(/<link[^>]*hreflang[^>]*>/g, '')
  })
  assert.equal(pageFactsOf(one['/']).alternates, 0)
  const single = await run(
    { find: 'Mon-Fri, 9:00-18:00 (MSK)', replace: 'Mon-Sat, 8:00-17:00' },
    { pages: one }
  )
  // One language: no language note, but the header and footer still show on every page (20/10/2026).
  assert.deepEqual(single.out.notes, [WP_REPLACE_NEXT.partEveryPage])
  assert.equal(single.out.notReached, undefined)
  const singlePost = await run({ find: 'Talk to our sales team', replace: 'Call us' }, { pages: one })
  assert.equal(singlePost.out.notReached, undefined)
})

test('a NOT_FOUND names the other-language page that holds the words, and writes nothing', async () => {
  const ru = PAGES['/'].replace('Selected projects', 'Избранные проекты')
  const pages = { ...PAGES, '/ru/': ru }
  const { out, site } = await run(
    { find: 'Избранные проекты', replace: 'Наши проекты', path: '/' },
    { pages }
  )
  assert.equal(out.code, 'NOT_FOUND')
  assert.deepEqual(out.pages, ['/ru/'])
  assert.match(out.next, /path:"\/ru\/"/)
  assert.equal(site.writes().length, 0)
  // words held nowhere: the plain NOT_FOUND
  const none = await run({ find: 'Слова нигде', replace: 'x', path: '/' }, { pages })
  assert.equal(none.out.code, 'NOT_FOUND')
  assert.equal(none.out.pages, undefined)
})

test('pageFactsOf: the page record, the theme and its version, forms, categories, the default language', () => {
  const home = pageFactsOf(PAGES['/'])
  assert.equal(home.pageId, 42)
  assert.equal(home.theme, 'wp-tracy-business')
  assert.equal(home.themeVersion, '1.1.0')
  assert.equal(home.defaultLang, 'en')
  assert.ok(home.alternates > 20)
  const news = pageFactsOf(PAGES['/news/'])
  assert.equal(news.blog, true)
  assert.equal(news.pageId, null)
  assert.deepEqual(news.forms, [349])
  assert.ok(news.cats.includes(45))
  assert.ok(news.posts.includes(521))
  assert.deepEqual(pageFactsOf(PAGES['/contact/']).forms, [25])
  assert.ok(pageFactsOf(PAGES['/contact/']).buttons.some((b) => b.cased === 'Send request'))
  assert.ok('wp-tracy-business@1.1.0' in WP_THEME_STORES)
})

test('an unknown theme version reads no theme table: the posts page heading is then left unchanged', async () => {
  const other = {
    '/news/': PAGES['/news/'].replace(/(themes\/wp-tracy-business\/[^"'?\s]*\?ver=)1\.1\.0/g, '$19.9.9')
  }
  assert.equal(pageFactsOf(other['/news/']).themeVersion, '9.9.9')
  const { out, site } = await run(
    { find: 'News & engineering notes', replace: 'Insights', path: '/news/' },
    { pages: other }
  )
  assert.equal(out.code, 'NOT_EDITABLE', JSON.stringify(out))
  assert.ok(!site.calls.some(([, p]) => p.key === 'tracy_page_heading'), 'the heading meta is not read')
  assert.deepEqual(site.writes(), [])
  assert.match(out.error, /no record this call reads for theme wp-tracy-business@9\.9\.9/)
  // The posts page has no record of its own here, the gate the rendered-words road stops at.
  assert.equal(out.next, renderedText('noRecordNext', { path: '/news/' }))
  assert.doesNotMatch(out.next, /that is an answer/)
})

/** @param {number} n */
const manyPages = (n) =>
  Array.from({ length: n }, (_, k) => ({
    ID: 1000 + k,
    post_type: 'page',
    post_status: 'publish',
    post_name: `p${k}`,
    post_title: `Page ${k}`,
    post_excerpt: '',
    post_content: `<!-- wp:paragraph -->\n<p>Filler page number ${k} of the archive.${k === 5 ? ' Early marker words.' : ''}${k === 100 ? ' Late marker words.' : ''}</p>\n<!-- /wp:paragraph -->`
  }))

test('a site larger than the search reaches says how far it searched, and only then', async () => {
  const site = component({ posts: manyPages(110) })
  const early = await run({ find: 'Early marker words', replace: 'First marker words' }, { site })
  assert.equal(early.out.ok, true, JSON.stringify(early.out))
  assert.equal(early.out.scanned, 100)
  assert.match(early.out.notReached, /searched the first 100 posts and pages/)
  const late = await run(
    { find: 'Late marker words', replace: 'Last marker words' },
    { site: component({ posts: manyPages(110) }) }
  )
  assert.equal(late.out.code, 'NOT_FOUND')
  assert.equal(late.out.scanned, 100)
  // a search that reached every page says nothing about it
  const whole = await run({ find: 'Talk to our sales team', replace: 'Call us', all: true })
  assert.equal(whole.out.scanned, undefined)
})

const SMALL_PAGE =
  '<!DOCTYPE html><html lang="en-US"><head><title>Small</title></head><body class="page page-id-900 wp-theme-wp-tracy-business"><main class="wp-block-group"><div class="entry-content wp-block-post-content"><p>Keep this short line.</p><p>This long paragraph the customer wants gone holds enough words that removing it takes the body well under four fifths of what it was.</p></div></main></body></html>'
const SMALL_POST = {
  ID: 900,
  post_type: 'page',
  post_status: 'publish',
  post_name: 'small',
  post_title: 'Small',
  post_excerpt: '',
  post_content:
    '<!-- wp:paragraph -->\n<p>Keep this short line.</p>\n<!-- /wp:paragraph -->\n<!-- wp:paragraph -->\n<p>This long paragraph the customer wants gone holds enough words that removing it takes the body well under four fifths of what it was.</p>\n<!-- /wp:paragraph -->'
}

test('a change that would leave a body under four fifths of itself is refused before anything is sent', async () => {
  const params = { find: SMALL_POST.post_content.match(/This long[^<]*/)[0], replace: '', path: '/small/' }
  const cut = await run(params, {
    site: component({ posts: [SMALL_POST] }),
    pages: { '/small/': SMALL_PAGE }
  })
  assert.equal(cut.out.code, 'VALUE_NOT_ALLOWED')
  assert.equal(cut.out.rule, 'body-shrink')
  assert.equal(cut.out.next, WP_REPLACE_NEXT.shrinkNext)
  assert.deepEqual(cut.site.writes(), [])
  // the customer's own request to remove it opens the way, and travels with the write
  const removes = 'please remove the long paragraph'
  const ok = await run(params, {
    site: component({ posts: [SMALL_POST] }),
    pages: { '/small/': SMALL_PAGE },
    removes
  })
  assert.equal(ok.out.ok, true, JSON.stringify(ok.out))
  assert.equal(ok.site.writes()[0].removes, removes)
  // words taken out: the receipt says the space left where they stood is harmless (round 7)
  assert.equal(ok.out.next, REPLACE_NEXT.receiptRemoved)
})

/**
 * The door as IX2 wires the job: the list of bodies straight to the component (its arrival budget
 * would cut it), every record read and every write through `runSiteCall` — the body guard, the
 * in-tool check and the conversation's memory of what it read — as a model's calls go.
 * @param {ReturnType<typeof component>} site
 * @param {{ events?: any[], memory?: ReturnType<typeof createCallMemory> }} [options]
 */
function relayed(site, { events = [], memory = createCallMemory({ now: () => 1_000 }) } = {}) {
  const ctx = {
    memory,
    sessionId: 'session-w',
    label: 'benchwp01',
    actorKey: 'ana@example.com',
    facts: { platform: 'wordpress', sealed: true },
    sleep: async () => {},
    events,
    bodiesWhole: true
  }
  /** @type {[string, any][]} */
  const answers = []
  const door = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    if (action === 'content.list') return site.door(action, params)
    const plan = planCall({ action, params })
    assert.equal(plan.ok, true, JSON.stringify(plan))
    const got = await runSiteCall({ ...ctx, plan, send: site.door })
    answers.push([action, got])
    return got
  }
  return { door, answers }
}

{
  for (const params of [
    { find: '8 800 550-67-89', replace: '0909 123 456', all: true },
    { find: 'Building the groundwork for next-generation plants', replace: 'Built for the way you work' },
    { find: 'Investors', replace: 'Investors & press' },
    { find: 'Resources', replace: 'Insights' }
  ])
    test(`through the relay's own body guard and in-tool check, every write of the job passes: ${rowName(params)}`, async () => {
      const { door, answers } = relayed(component())
      const out = /** @type {any} */ (
        await replaceOnWordPress({
          plan: /** @type {any} */ (planReplace(params)),
          read: door,
          write: door,
          pageHtml: pagesOf(),
          mintApplyId: () => 'replace-guard-1',
          verify: false
        })
      )
      assert.equal(out.ok, true, JSON.stringify(out))
      const writes = answers.filter(([a]) => a === 'content.update').map(([, got]) => got)
      assert.ok(writes.length > 0)
      for (const got of writes) {
        assert.equal(got.ok, true, JSON.stringify(got))
        assert.notEqual(got.code, 'BODY_SHRINK')
        if (got.verified !== undefined) assert.equal(typeof got.verified, 'object', JSON.stringify(got))
      }
    })
}

test('a removal the customer confirms in words of their own: the engine and the relay guard read the same message', async () => {
  const say = (/** @type {string} */ content) => ({
    type: 'user/message',
    data: { source: { kind: 'user' }, content }
  })
  const params = { find: SMALL_POST.post_content.match(/This long[^<]*/)[0], replace: '', path: '/small/' }
  const site = component({ posts: [SMALL_POST] })
  const events = [say('The long paragraph on the small page is too much, cut it down')]
  const { door, answers } = relayed(site, { events })
  let n = 0
  const call = async () =>
    /** @type {any} */ (
      await replaceOnWordPress({
        plan: /** @type {any} */ (planReplace(params)),
        read: door,
        write: door,
        pageHtml: pagesOf({ '/small/': SMALL_PAGE }),
        mintApplyId: () => `replace-rm-${(n += 1)}`,
        removes: latestCustomerWords(events),
        verify: false
      })
    )
  // the guard reads the same message: a `removes` it does not hold is refused there, nothing written
  const forged = /** @type {any} */ (
    await replaceOnWordPress({
      plan: /** @type {any} */ (planReplace(params)),
      read: door,
      write: door,
      pageHtml: pagesOf({ '/small/': SMALL_PAGE }),
      mintApplyId: () => 'replace-rm-0',
      removes: 'yes, remove it',
      verify: false
    })
  )
  assert.equal(forged.code, 'BODY_SHRINK', JSON.stringify(forged))
  assert.equal(site.posts.get(900).post_content, SMALL_POST.post_content)
  answers.length = 0
  // "cut it down" names no removal: refused before anything is sent, with the road that asks
  const first = await call()
  assert.equal(first.rule, 'body-shrink', JSON.stringify(first))
  assert.equal(first.next, WP_REPLACE_NEXT.shrinkNext)
  assert.doesNotMatch(first.next, /that is an answer/)
  assert.deepEqual(site.writes(), [])
  // the customer's reply is now the latest message: the same call goes through the engine AND the guard
  events.push(say('yes, remove it'))
  const second = await call()
  assert.equal(second.ok, true, JSON.stringify(second))
  const writes = answers.filter(([a]) => a === 'content.update').map(([, got]) => got)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].ok, true, JSON.stringify(writes[0]))
  assert.equal(typeof writes[0].verified, 'object', 'the in-tool check found it whole')
  assert.equal(site.writes()[0].removes, undefined, 'removes is read by Tracy, never relayed')
  assert.ok(!site.posts.get(900).post_content.includes('This long paragraph'))
})

test('an in-tool check that did not find the body whole undoes the change, and says which of three things it found', async () => {
  const footer = SITE.posts.find((/** @type {any} */ p) => p.ID === FOOTER).post_content
  const call = { find: 'Mon-Fri, 9:00-18:00 (MSK)', replace: 'Mon-Sat, 8:00-17:00' }
  /** The write lands; then the in-tool check answers `check`. @param {Record<string, unknown>} check */
  const checked =
    (check) =>
    (/** @type {ReturnType<typeof component>} */ site) =>
    async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
      const got = await site.door(action, params)
      return action === 'content.update' && got.ok === true ? { ...got, verified: false, ...check } : got
    }
  // the record could not be READ BACK: it may be whole — the same call once, never "cannot be made"
  const unread = await run(call, {
    write: checked({
      next: 'content.get {kind:"templatePart", key:"footer"} once, then tell the customer what the page holds.'
    })
  })
  assert.equal(unread.out.code, 'READ_FAILED', JSON.stringify(unread.out))
  assert.equal(unread.out.rule, 'not-checked')
  assert.equal(unread.out.error, wpText('uncheckedError', { what: 'the Footer part' }))
  assert.equal(unread.out.next, WP_REPLACE_NEXT.uncheckedNext)
  assert.equal(unread.out.reverted, true)
  assert.equal(unread.site.partOf('footer').post_content, footer, 'undone, as the error says')
  // WordPress kept a share of what was sent
  const cut = await run(call, {
    write: checked({ chars: { chars_before: 6390, chars_sent: 6390, chars_stored: 120 } })
  })
  assert.equal(cut.out.code, 'VALUE_NOT_ALLOWED')
  assert.equal(cut.out.rule, 'not-kept')
  assert.equal(cut.out.error, wpText('keptError', { stored: 120, sent: 6390, what: 'the Footer part' }))
  assert.equal(cut.out.next, WP_REPLACE_NEXT.keptNext)
  assert.equal(cut.out.markup, undefined)
  assert.equal(cut.out.reverted, true)
  assert.equal(cut.site.partOf('footer').post_content, footer)
  // kept whole, but its block comments no longer parse
  const markup = await run(call, {
    write: checked({ chars: { chars_before: 6390, chars_sent: 6390, chars_stored: 6390 } })
  })
  assert.equal(markup.out.code, 'VALUE_NOT_ALLOWED')
  assert.equal(markup.out.error, wpText('keptMarkupError', { what: 'the Footer part' }))
  assert.equal(markup.out.markup, true)
  assert.equal(markup.out.reverted, true)
  // and the first of the three as the relay's own check answers it: its read-back refused once
  let wrote = false
  let failed = false
  const site = component({
    script: (action, params) => {
      if (action === 'content.update') wrote = true
      else if (wrote && !failed && action === 'content.get' && params.key === 'footer') {
        failed = true
        return { ok: false, error: 'db_error', message: 'MySQL server has gone away' }
      }
      return undefined
    }
  })
  const { door } = relayed(site)
  const out = /** @type {any} */ (
    await replaceOnWordPress({
      plan: /** @type {any} */ (planReplace(call)),
      read: door,
      write: door,
      pageHtml: pagesOf(),
      mintApplyId: () => 'replace-check-1',
      verify: false
    })
  )
  assert.equal(out.code, 'READ_FAILED', JSON.stringify(out))
  assert.equal(out.reverted, true)
  assert.equal(site.partOf('footer').post_content, footer)
})

test('a site bound to its quickstart contract: NOT_SUPPORTED_HERE before any read, or at its first write, nothing undone', async () => {
  const early = await run({ find: 'Talk to our sales team', replace: 'Call us' }, { bound: true })
  assert.equal(early.out.code, 'NOT_SUPPORTED_HERE')
  assert.equal(early.out.error, WP_REPLACE_NEXT.boundError)
  assert.deepEqual(early.site.calls, [], 'nothing read, nothing written')
  // not known up front: the component's own refusal of the first write gets the same answer
  const site = component({
    script: (action) =>
      action === 'content.update'
        ? {
            ok: false,
            error: LEGACY_STRUCTURE_CODE,
            message: LEGACY_BOUND_MESSAGE
          }
        : undefined
  })
  const late = await run({ find: 'Talk to our sales team', replace: 'Call us' }, { site })
  assert.equal(late.out.code, 'NOT_SUPPORTED_HERE', JSON.stringify(late.out))
  assert.equal(late.out.planned.length, 1)
  assert.ok(!site.calls.some(([a]) => a === 'apply.revert'))
})

// ── Shape of what the model reads ───────────────────────────────────────────────────────────────

test('a dryRun writes nothing, fits the receipt budget and names what a write would do', async () => {
  const { out, site } = await run({
    find: '8 800 550-67-89',
    replace: '0909 123 456',
    all: true,
    dryRun: true
  })
  assert.equal(out.dryRun, true)
  assert.equal(out.count, 5)
  assert.equal(out.companions.length, 2)
  assert.deepEqual(site.writes(), [])
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= RECEIPT_MAX_BYTES)
  assert.equal(Object.keys(out).at(-1), 'next')
})

test('the page cannot be read: places come from the stored content alone, and the answer says so', async () => {
  const { out } = await run(
    { find: 'Talk to our sales team', replace: 'Call us', dryRun: true },
    { pageHtml: async () => ({ ok: false, code: 'READ_FAILED' }) }
  )
  assert.deepEqual(placesOf(out), ['post:42#cta.cta.1'])
  assert.ok(out.notes.some((/** @type {string} */ n) => /could not be read/.test(n)))
})

test('verified: the page read again shows the new words, or the answer says it does not yet', async () => {
  const shown = await run(
    { find: 'Talk to our sales team', replace: 'Call us' },
    {
      verify: true,
      pageHtml: async (path) => ({
        ok: true,
        status: 200,
        html: PAGES[path].replace('Talk to our sales team', 'Call us')
      })
    }
  )
  assert.equal(shown.out.verified, 'shown on /')
  const stale = await run({ find: 'Talk to our sales team', replace: 'Call us' }, { verify: true })
  assert.match(stale.out.verified, /^not shown on \/ yet/)
  let n = 0
  const gone = await run(
    { find: 'Talk to our sales team', replace: 'Call us' },
    {
      verify: true,
      pageHtml: async (path) =>
        (n += 1) === 1 ? { ok: true, status: 200, html: PAGES[path] } : { ok: false, code: 'READ_FAILED' }
    }
  )
  assert.equal(gone.out.verified, WP_REPLACE_NEXT.notChecked)
})

test('restore is the EmDash undo: on WordPress it names apply.revert instead', async () => {
  const plan = planReplace({ restore: [{ at: 'post:42#hero.heading', value: 'x' }] })
  const out = /** @type {any} */ (
    await replaceOnWordPress({ plan: /** @type {any} */ (plan), read: component().door, pageHtml: pagesOf() })
  )
  assert.equal(out.code, 'BAD_PARAMS')
  assert.match(out.next, /apply\.revert/)
})

// ── Identity tokens: words the theme prints from the site identity (tracy-business 1.2.0+) ──────

test('a footer line printing the legal name through a token: written in one call, and the receipt says it no longer follows the identity', async () => {
  const site = tokenSite()
  const { out } = await run(
    { find: '© Golden Crust Bakery', replace: '© 2027 All rights reserved.' },
    { site, pages: TOKEN_PAGES, contractDoor: true }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const footer = site.partOf('footer').post_content
  assert.match(
    footer,
    /<p class="tracy-footer__note" data-tracy-identity="site\.legalName">©&nbsp;2027 All rights reserved\.<\/p>/
  )
  // the other line that prints the legal name keeps its token
  assert.match(footer, /<span data-tracy-identity="site\.legalName">\{site\.legalName\}\. <\/span>/)
  assert.equal(site.writes().length, 1)
  // 🔒 never silently: the place that dropped its token says so
  assert.ok(
    (out.notes ?? []).some((n) => /site identity's legal name/.test(n) && /no longer follows it/.test(n)),
    JSON.stringify(out.notes)
  )
  assert.equal(site.options.tracy_site_identity.legalName, 'Golden Crust Bakery', 'the identity is untouched')
})

test('a word beside a token is changed and the token stays: the line still follows the identity', async () => {
  const site = tokenSite()
  const { out } = await run(
    { find: '© Golden Crust Bakery', replace: 'Copyright Golden Crust Bakery' },
    { site, pages: TOKEN_PAGES, contractDoor: true }
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.match(
    site.partOf('footer').post_content,
    /data-tracy-identity="site\.legalName">Copyright&nbsp;\{site\.legalName\}<\/p>/
  )
  assert.ok(!(out.notes ?? []).some((n) => /no longer follows/.test(n)), JSON.stringify(out.notes))
})

test('words that are the legal name itself: answered with the one call that sets the identity, nothing written', async () => {
  const site = tokenSite()
  const { out } = await run(
    { find: 'Golden Crust Bakery', replace: 'Golden Crust Ltd' },
    { site, pages: TOKEN_PAGES, contractDoor: true }
  )
  assert.equal(out.code, 'SITE_IDENTITY', JSON.stringify(out))
  assert.equal(out.ok, false)
  assert.deepEqual(site.writes(), [])
  assert.equal(out.token, 'site.legalName')
  assert.equal(out.value, 'Golden Crust Bakery')
  assert.ok(
    out.next.includes(
      'content.contract {operation:"apply", changes:{"identity.legalName":"Golden Crust Ltd"}}'
    ),
    out.next
  )
  assert.doesNotMatch(out.next, /that is an answer/)
  assert.ok(out.error.length <= 160 && out.next.length <= 200)
})

test('on a site without the contract door the identity answer names the option write and carries the identity', async () => {
  const site = tokenSite()
  const { out } = await run(
    { find: 'Golden Crust Bakery', replace: 'Golden Crust Ltd' },
    { site, pages: TOKEN_PAGES }
  )
  assert.equal(out.code, 'SITE_IDENTITY', JSON.stringify(out))
  assert.deepEqual(site.writes(), [])
  assert.match(out.next, /content\.update \{kind:"option", key:"tracy_site_identity"/)
  assert.match(out.next, /legalName:"Golden Crust Ltd"/)
  assert.deepEqual(out.identity, IDENTITY)
})

test('a phone a header line prints through a token: the identity field, never a number typed into the line', async () => {
  const site = tokenSite()
  const whole = await run(
    { find: 'Hotline: 0912 345 678', replace: 'Hotline: 0909 111 222' },
    { site, pages: TOKEN_PAGES, contractDoor: true }
  )
  assert.equal(whole.out.code, 'SITE_IDENTITY', JSON.stringify(whole.out))
  assert.ok(whole.out.next.includes('"identity.contact.phone":"0909 111 222"'), whole.out.next)
  const bare = await run(
    { find: '0912 345 678', replace: '0909 111 222' },
    { site, pages: TOKEN_PAGES, contractDoor: true }
  )
  assert.equal(bare.out.code, 'SITE_IDENTITY', JSON.stringify(bare.out))
  assert.ok(bare.out.next.includes('"identity.contact.phone":"0909 111 222"'), bare.out.next)
  assert.deepEqual(site.writes(), [])
  assert.match(site.partOf('header').post_content, /\{contact\.phone\}/)
})

test('no identity option: token lines are read as stored, as before', async () => {
  const site = tokenSite({ option: false })
  const { out } = await run(
    { find: '© Golden Crust Bakery', replace: '© 2027 All rights reserved.' },
    { site, pages: TOKEN_PAGES }
  )
  assert.notEqual(out.ok, true, JSON.stringify(out))
  assert.notEqual(out.code, 'SITE_IDENTITY')
  assert.deepEqual(site.writes(), [])
})

{
  // every fact any sentence quotes, each longer than its width (`wpText` cuts a quote to it)
  const worst = {
    what: 'x'.repeat(200),
    find: 'f'.repeat(200),
    replace: 'y'.repeat(200),
    failed: 'z'.repeat(200),
    tags: 'a b c d e f g h i j k l m n o p q r s t u v w x y z',
    a: 'a'.repeat(200),
    b: 'b'.repeat(200),
    new: 'n'.repeat(200),
    old: 'o'.repeat(200),
    theme: 't'.repeat(200),
    n: 1000,
    n1: 1001,
    m: 1000,
    after: '999,999',
    before: '999,999',
    stored: 999_999,
    sent: 999_999,
    applyId: 'replace-mfz3k2x9-abcdef',
    path: '/a-very-long-path/that-a-customer-named/for-this-page/',
    field: 'Instagram link',
    slot: 'identity.social.instagram',
    key: 'social.instagram',
    value: 'v'.repeat(200)
  }
  for (const key of /** @type {(keyof typeof WP_REPLACE_NEXT)[]} */ (Object.keys(WP_REPLACE_NEXT)))
    test(`every sentence fits its budget on its worst case: ${rowName(key)}`, () => {
      const text = wpText(key, worst)
      assert.ok(!/\{\w+\}/.test(text), `${key} fills every fact`)
      assert.ok(text.length <= (key.endsWith('Error') ? 160 : 200), `${key}: ${text.length}`)
    })
}

/**
 * The Content API page the WordPress Claude Cowork plugin projects for one post (claude-cowork
 * `BlockProjection`, with `native` since 0.14.2): `bodyHtml` the static HTML of every block, and each
 * named block that is one element holding only text a field keyed by its `metadata.name`
 * (`fieldsOf`/`textField`) — grouped here in one block, which is all the resolver reads of a section.
 * @param {Record<string, any>} post
 */
function contentOf(post) {
  const raw = String(post.post_content)
  const fields = []
  for (const d of parseBlocks(raw)) {
    const name = d.attrs?.metadata?.name
    if (d.closer || d.isVoid || typeof name !== 'string') continue
    const close = raw.indexOf(`<!-- /wp:${d.name.replace(/^core\//, '')} -->`, d.end)
    const inner = close === -1 ? '' : raw.slice(d.end, close)
    const one = /^\s*<([a-z0-9]+)\b[^>]*>([\s\S]*?)<\/\1>\s*$/.exec(inner)
    if (!one || /<[a-zA-Z!/]/.test(one[2])) continue
    fields.push({ key: name, type: 'text', value: decodeEntities(one[2]), slotKey: null, semanticKey: null })
  }
  return {
    id: `c-${post.ID}`,
    type: post.post_type === 'page' ? 'page' : 'article',
    title: post.post_title,
    slug: post.post_name,
    url: `https://w.test/${post.post_name === 'home' ? '' : `${post.post_name}/`}`,
    revision: `r-${post.ID}`,
    native: [{ kind: 'post', id: post.ID }],
    bodyHtml: raw.replace(/<!--[\s\S]*?-->/g, ''),
    fields: [],
    blocks: [{ id: 'b-named', key: 'named', fields, items: [] }]
  }
}

test('content.locate: a picked service title is post:42#<name> — one place, where its words alone are AMBIGUOUS', async () => {
  const home = /** @type {Record<string, any>} */ (SITE.posts.find((p) => p.ID === 42))
  const index = indexContents([contentOf(home)], { siteUrl: 'https://w.test' })
  const answer = locateElement(
    index,
    {
      url: 'https://w.test/',
      text: 'Industrial park infrastructure',
      marks: ['post:42:home block:core/heading', 'post:42:home block:core/group']
    },
    { platform: 'wordpress', mayWrite: () => true }
  )
  assert.equal(answer.status, 'resolved')
  const [field] = answer.levels
  assert.equal(field.kind, 'field', 'the body copy of the words is the named block itself')
  assert.equal(field.at, 'post:42#services.item.1.title')
  // The footer's list prints the same words: quoted alone, two places…
  const bare = await run({
    find: 'Industrial park infrastructure',
    replace: 'Park infrastructure',
    path: '/',
    dryRun: true
  })
  assert.equal(bare.out.code, 'AMBIGUOUS')
  assert.ok(placesOf(bare.out).includes(field.at), 'the engine names the field by the same address')
  // …with the picked field's at, one: the call the turn's write line names.
  const pinned = await run({
    find: 'Industrial park infrastructure',
    replace: 'Park infrastructure',
    path: '/',
    at: field.next.at,
    dryRun: true
  })
  assert.equal(pinned.out.ok, true, JSON.stringify(pinned.out))
  assert.deepEqual(placesOf(pinned.out), ['post:42#services.item.1.title'])
})

test('content.locate: every named text field of the home page has the address the engine gives its words', async () => {
  const home = /** @type {Record<string, any>} */ (SITE.posts.find((p) => p.ID === 42))
  const content = contentOf(home)
  const index = indexContents([content], { siteUrl: 'https://w.test' })
  let checked = 0
  for (const field of content.blocks[0].fields) {
    if (field.value.trim().length < 12) continue
    const answer = locateElement(
      index,
      { url: 'https://w.test/', text: field.value, marks: ['post:42:home block:core/paragraph'] },
      { platform: 'wordpress', mayWrite: () => true }
    )
    const at = answer.levels[0]?.at
    if (at === undefined) continue
    const { out } = await run({
      find: field.value,
      replace: `${field.value} now`,
      path: '/',
      at: [at],
      dryRun: true
    })
    assert.equal(out.ok, true, `${at}: ${JSON.stringify(out).slice(0, 300)}`)
    assert.deepEqual(placesOf(out), [at])
    checked += 1
  }
  assert.ok(checked >= 10, `${checked} fields checked`)
})

// The Willow Nook (lrsweep rig, 25/10/2026): the sweep's replaces of a template post's lorem paragraphs were all
// refused BODY_SHRINK, and the post kept its lorem. The template's lorem may go shorter; a customer's words may not.
test("a replace of the template's lorem may leave the body shorter, through the engine and the relay guard", async () => {
  const LOREM_LINE =
    'Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim. Aliquam lorem ante, dapibus in, viverra quis, feugiat a, tellus. Phasellus viverra nulla ut metus varius laoreet. Quisque rutrum.'
  const post = {
    ...SMALL_POST,
    post_content: SMALL_POST.post_content.replace(/This long[^<]*/, LOREM_LINE)
  }
  const page = SMALL_PAGE.replace(/This long[^<]*/, LOREM_LINE)
  const site = component({ posts: [post] })
  const { door, answers } = relayed(site)
  const out = /** @type {any} */ (
    await replaceOnWordPress({
      plan: /** @type {any} */ (
        planReplace({ find: LOREM_LINE, replace: 'Cocktails from five.', path: '/small/' })
      ),
      read: door,
      write: door,
      pageHtml: pagesOf({ '/small/': page }),
      mintApplyId: () => 'replace-lorem-1',
      verify: false
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const writes = answers.filter(([a]) => a === 'content.update').map(([, got]) => got)
  assert.equal(writes.length, 1)
  assert.equal(writes[0].ok, true, JSON.stringify(writes[0]))
  assert.ok(site.posts.get(900).post_content.includes('Cocktails from five.'))
  // the same cut of the customer's own paragraph keeps the guard
  const own = await run(
    { find: SMALL_POST.post_content.match(/This long[^<]*/)[0], replace: 'Short.', path: '/small/' },
    { site: component({ posts: [SMALL_POST] }), pages: { '/small/': SMALL_PAGE } }
  )
  assert.equal(own.out.rule, 'body-shrink')
})

// The Willow Nook (lrsweep rig, build 12, 25/10/2026): the agent replaced a template post's lorem paragraphs one
// find at a time. Each write alone cut less than a fifth of the body, so it went out without the lorem scope and
// left the read baseline as it was; the third was judged against the conversation's first read (1,673 chars) and
// refused BODY_SHRINK, and the agent stopped the build. A write whose every cut is the template's lorem passes
// and resets that baseline, however small its own cut.
test('lorem replaced one find at a time never piles up into a BODY_SHRINK against the first read', async () => {
  const lines = [
    'Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac, enim. Aliquam lorem ante, dapibus in, viverra quis, feugiat a, tellus.',
    'In enim justo, rhoncus ut, imperdiet a, venenatis vitae, justo. Nullam dictum felis eu pede mollis pretium. Integer tincidunt.',
    'Donec quam felis, ultricies nec, pellentesque eu, pretium quis, sem. Nulla consequat massa quis enim. Donec pede justo, fringilla.',
    'Convallis nulla mauris, eget aucibus elit interdum quis. Proin a est ac nisl porta hendrerit vel itae odio uisque egestas neque.',
    'Phasellus viverra nulla ut metus varius laoreet. Quisque rutrum. Aenean imperdiet. Etiam ultricies nisi vel augue. Curabitur.',
    'Maecenas tempus, tellus eget condimentum rhoncus, sem quam semper libero, sit amet adipiscing sem neque sed ipsum. Nam quam nunc.',
    'Vivamus elementum semper nisi. Aenean vulputate eleifend tellus. Aenean leo ligula, porttitor eu, consequat vitae, eleifend ac.'
  ]
  const block = (/** @type {string} */ text) =>
    `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`
  const post = {
    ...SMALL_POST,
    post_content: [block('Keep this short line.'), ...lines.map(block)].join('\n')
  }
  const page = SMALL_PAGE.replace(
    /<p>Keep this short line\.<\/p>.*<\/div><\/main>/,
    `<p>Keep this short line.</p>${lines.map((l) => `<p>${l}</p>`).join('')}</div></main>`
  )
  const site = component({ posts: [post] })
  const { door, answers } = relayed(site)
  for (const [i, line] of lines.slice(0, 4).entries()) {
    const out = /** @type {any} */ (
      await replaceOnWordPress({
        plan: /** @type {any} */ (planReplace({ find: line, replace: 'Menu item.', path: '/small/' })),
        read: door,
        write: door,
        pageHtml: pagesOf({ '/small/': page }),
        mintApplyId: () => `replace-lorem-step-${i}`,
        verify: false
      })
    )
    assert.equal(out.ok, true, `step ${i}: ${JSON.stringify(out).slice(0, 400)}`)
  }
  const writes = answers.filter(([a]) => a === 'content.update').map(([, got]) => got)
  assert.equal(writes.length, 4)
  assert.ok(writes.every((w) => w.ok === true))
})
