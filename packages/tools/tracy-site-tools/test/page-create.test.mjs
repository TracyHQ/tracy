import assert from 'node:assert/strict'
import test from 'node:test'

import { describeWhere } from '../../../../apps/tracy-web/src/sites/content-where.js'
import {
  insertAfter,
  PAGE_CREATE_NEXT,
  pageText,
  planPageCreate,
  runPageCreate,
  slugOf
} from '../src/host/page-create.mjs'
import { parseBlocks } from '../src/host/replace-wordpress.mjs'
import { planCall } from '../src/host/site.mjs'
import { blockMarkupProblem } from '../src/host/site-call.mjs'
import { SURFACE_ACTIONS, siteToolDescription } from '../src/host/surface.mjs'
import { tierOf } from '../src/host/tiers.mjs'
import { answer, createEmdashState, fakeSite, runDoor } from './emdash-door-fixture.mjs'
import { component as joomlaSite } from './fixtures/replace/fake-joomla-open.mjs'
import { component as wordpressSite } from './fixtures/replace/fake-wordpress.mjs'

// `tracy_site page.create`: a new page and its menu entry in one call (flow D bench, 05/10/2026:
// "Common questions" with three Q&As after "Services" took 22–26 calls on all three CMS).

/** The case the bench measured, as the customer said it. */
const FAQ = Object.freeze({
  title: 'Common questions',
  body: [
    { title: 'How fast do you reply?', text: 'Within one working day.' },
    { title: 'Do you work weekends?', text: 'No, Monday to Friday only.' },
    { title: 'Can I visit your office?', text: 'Yes, please book a time first.' }
  ],
  menu: { after: 'Services' }
})

/**
 * A describe answer as the relay serves it: the site's languages and the `where` block of its
 * quickstart release, read off the real where-maps (`apps/tracy-web/src/sites/where/`).
 * @param {{ platform: string, quickstart_tag: string, quickstart_version: string } | null} release
 * @param {{ defaultLocale?: string, locales?: string[] }} [site]
 */
const describe = (release, site = {}) => ({
  ok: true,
  schemaVersion: 'tracy-content-describe/v1',
  site: { defaultLocale: site.defaultLocale ?? null, locales: site.locales ?? [] },
  where: release ? describeWhere(release, { profile: null, toolsetOfDoor: () => 'content' }) : null
})

const WP_110 = { platform: 'wordpress', quickstart_tag: 'tracy-business/wp7', quickstart_version: '1.1.0' }
const WP_132 = { platform: 'wordpress', quickstart_tag: 'tracy-business/wp7', quickstart_version: '1.3.2' }
const JO_120 = { platform: 'joomla', quickstart_tag: 'tracy-business/j6', quickstart_version: '1.2.0' }
const EM_151 = { platform: 'emdash', quickstart_tag: 'tracy-business/x', quickstart_version: '1.5.1' }

let minted = 0
const mint = () => `page-test-${(minted += 1)}`

/**
 * The site's own browser as `menuSeen` reads one element: the label is a link of the site's header at
 * every width, except at the widths `hidden` names, where it is hidden for the reason given.
 * @param {Record<string, string>} [hidden] - viewport → why
 */
const browserSees =
  (hidden = {}) =>
  async (/** @type {Record<string, any>} */ req) => ({
    ok: true,
    payload: {
      info: {
        el: '<a.wp-block-navigation-item__content>',
        how: 'exact',
        chrome: true,
        hidden: hidden[req.viewport] ?? false
      },
      loaded: true
    }
  })

// ── The call ────────────────────────────────────────────────────────────────────────────────────

test('page.create is a tracy_site action on WordPress, Joomla and EmDash surfaces, and a write with an undo', () => {
  for (const surface of ['wordpress', 'wordpress-contract', 'joomla', 'joomla-sealed', 'emdash'])
    assert.ok(
      /** @type {readonly string[]} */ (
        SURFACE_ACTIONS[/** @type {keyof typeof SURFACE_ACTIONS} */ (surface)]
      ).includes('page.create'),
      surface
    )
  const planned = planCall({ action: 'page.create', params: FAQ }, { actions: SURFACE_ACTIONS.wordpress })
  assert.equal(planned.ok, true, JSON.stringify(planned))
  assert.equal(/** @type {any} */ (planned).local, true)
  assert.equal(tierOf('page.create', {}), 'mutating')
  assert.match(siteToolDescription('wordpress'), /page\.create/)
  assert.match(siteToolDescription('emdash'), /page\.create/)
})

test('the call is checked: closed keys, a slug from the title with its accents off, a body string parted at blank lines', () => {
  const unknown = /** @type {any} */ (planPageCreate({ ...FAQ, content: 'x' }))
  assert.equal(unknown.code, 'BAD_PARAMS')
  assert.equal(unknown.param, 'content')
  assert.equal(slugOf('Câu hỏi thường gặp — Đà Nẵng'), 'cau-hoi-thuong-gap-da-nang')
  const plain = /** @type {any} */ (
    planPageCreate({ title: 'Our story', body: 'First part.\n\nSecond part.' })
  )
  assert.equal(plain.ok, true)
  assert.deepEqual(
    plain.items.map((/** @type {any} */ it) => it.text),
    ['First part.', 'Second part.']
  )
  assert.equal(plain.slug, 'our-story')
  assert.equal(plain.menu, null)
  const noLetters = /** @type {any} */ (planPageCreate({ title: '日本語', body: 'x' }))
  assert.equal(noLetters.code, 'BAD_PARAMS')
  assert.equal(noLetters.param, 'slug')
  assert.equal(/** @type {any} */ (planPageCreate({ title: 'X', body: [] })).param, 'body')
})

{
  const worst = {
    param: 'p'.repeat(200),
    allowed: 'title, body, heading, slug, menu, locale',
    want: '1–40 parts: [{title:"<heading>", text:"<words>"}, …]',
    title: 't'.repeat(200),
    after: 'a'.repeat(200),
    n: 99,
    list: 'l'.repeat(400),
    lang: 'zh-Hant-TW',
    locale: 'x'.repeat(200),
    locales: 'en, vi, ru, de, fr',
    why: 'w'.repeat(200),
    widths: 'w'.repeat(200),
    home: '/'.repeat(200),
    path: '/'.repeat(200),
    menu: 'm'.repeat(200),
    place: pageText('menuPlace', { after: 'a'.repeat(200) })
  }
  for (const key of /** @type {(keyof typeof PAGE_CREATE_NEXT)[]} */ (Object.keys(PAGE_CREATE_NEXT)))
    test(`every page.create sentence fits its budget on its worst case: ${key}`, () => {
      const text = pageText(key, worst)
      assert.ok(
        !/\{\w+\}/.test(text.replace(/\{title:|\{after:|\{name:|\{collection:/g, '')),
        `${key} fills every fact`
      )
      assert.ok(text.length <= (key.endsWith('Error') ? 160 : 200), `${key}: ${text.length}`)
    })
}

test('insertAfter: the row goes after the item and its children, every later parentIndex moved by one', () => {
  const items = [
    { label: 'Home', type: 'custom' },
    { label: 'Services', type: 'custom' },
    { label: 'Cleaning', type: 'custom', parentIndex: 1 },
    { label: 'Contact', type: 'custom' },
    { label: 'Form', type: 'custom', parentIndex: 3 }
  ]
  const out = insertAfter(items, 1, { label: 'FAQ', type: 'custom', customUrl: '/faq' })
  assert.deepEqual(
    out.map((it) => [it.label, it.parentIndex]),
    [
      ['Home', undefined],
      ['Services', undefined],
      ['Cleaning', 1],
      ['FAQ', undefined],
      ['Contact', undefined],
      ['Form', 4]
    ]
  )
  assert.equal(insertAfter(items, -1, { label: 'Last', type: 'custom' }).at(-1)?.label, 'Last')
})

// ── WordPress ──────────────────────────────────────────────────────────────────────────────────

/**
 * The fake component behind the relay, with the describe the relay answers in front of it.
 * @param {ReturnType<typeof wordpressSite>} site
 * @param {ReturnType<typeof describe>} described
 */
const wpDoors = (site, described) => ({
  send: async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) =>
    action === 'content.read' && params.describe === true ? described : site.door(action, params),
  siteCall: site.door
})

/**
 * The page as the theme renders it from the fake's rows: the header menu (nav post 68) and the page's
 * own title and body — what `page.text` would read after the writes.
 * @param {ReturnType<typeof wordpressSite>} site
 */
const wpPages = (site) => async (/** @type {string} */ path) => {
  const page = [...site.posts.values()].find((p) => p.post_type === 'page' && `/${p.post_name}/` === path)
  if (!page) return { ok: true, status: 404, html: '<html><body><p>Not found</p></body></html>' }
  const labels = parseBlocks(/** @type {any} */ (site.posts.get(68)).post_content)
    .filter((d) => !d.closer && d.name === 'core/navigation-link')
    .map((d) => `<li><a href="${d.attrs?.url}">${d.attrs?.label}</a></li>`)
    .join('')
  return {
    ok: true,
    status: 200,
    html: `<html><body><header class="wp-block-template-part"><nav class="wp-block-navigation"><ul>${labels}</ul></nav></header><main><h1 class="wp-block-post-title">${page.post_title}</h1><div class="wp-block-post-content">${page.post_content}</div></main></body></html>`
  }
}

test('WordPress: the FAQ page in the theme\'s own section markup and its link after "Services" — one call, one apply id', async () => {
  const site = wordpressSite()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: FAQ,
      platform: 'wordpress',
      ...wpDoors(site, describe(WP_110, { defaultLocale: 'en', locales: ['en', 'ru'] })),
      pageHtml: wpPages(site),
      menuSeen: browserSees(),
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const writes = site.writes()
  assert.equal(writes.length, 2, JSON.stringify(writes))
  const [made, menu] = writes
  assert.equal(made.apply_id, menu.apply_id, 'one apply id: one apply.revert undoes both')
  assert.equal(made.id, undefined, 'a create names no id')
  assert.equal(made.fields.post_type, 'page')
  assert.equal(made.fields.post_status, 'publish')
  assert.equal(made.fields.post_name, 'common-questions')
  const body = made.fields.post_content
  assert.equal(blockMarkupProblem(body), null)
  // The theme's text section (the pattern the map pins), one point per question, in order.
  assert.match(body, /class="wp-block-group wtb-section wtb-text"/)
  assert.match(body, /<h2 class="wp-block-heading wtb-heading">Common questions<\/h2>/)
  const points = [
    ...body.matchAll(/wtb-text__point-title">([^<]*)<\/p>[\s\S]*?wtb-text__point-text">([^<]*)<\/p>/g)
  ]
  assert.deepEqual(
    points.map((m) => [m[1], m[2]]),
    FAQ.body.map((it) => [it.title, it.text])
  )
  assert.doesNotMatch(body, /<question>|<answer>|one more/)
  // The link sits right after Services in the header menu, and nothing else of the menu moved.
  assert.equal(menu.id, 68)
  const labels = parseBlocks(menu.fields.post_content)
    .filter((d) => !d.closer && d.name === 'core/navigation-link')
    .map((d) => d.attrs?.label)
  assert.deepEqual(labels, ['Home', 'About', 'Services', 'Common questions', 'Projects', 'News', 'Contact'])
  assert.match(menu.fields.post_content, /"id":\d+,"url":"\/common-questions\/","kind":"post-type"/)
  assert.ok(out.page.id > 0)
  assert.deepEqual(
    { ...out.page, id: 0 },
    { id: 0, title: 'Common questions', path: '/common-questions/', locale: 'en' }
  )
  assert.deepEqual(out.menu, { menu: 'Header', label: 'Common questions', after: 'Services' })
  assert.deepEqual(out.verified, [
    'shown on /common-questions/',
    'its menu link shows on / at desktop 1440 and phone 390'
  ])
  assert.match(out.next, /live at \/common-questions\/ and in the menu after "Services"/)
  assert.match(out.undo, /apply\.revert \{apply_id:"page-test-\d+"\}/)
  assert.equal(out.notes, undefined, 'the theme markup was used: no plain-blocks note')
  // Reads: the menus, then the menu again before its write — no header read was needed.
  assert.deepEqual(
    site.calls.map(
      ([a, p]) =>
        `${a}${p.post_type ? `:${p.post_type}` : ''}${p.kind && a !== 'content.list' ? `:${p.kind}` : ''}`
    ),
    // the menu is read again right before its own write, after the page exists; then the header part, whose
    // own row of links (none in this theme) would take the link too
    [
      'content.list:wp_navigation',
      'content.update:post',
      'content.get:post',
      'content.update:post',
      'content.get:templatePart'
    ]
  )
})

test('WordPress: a label two menus hold goes into the one the header part renders', async () => {
  const site = wordpressSite()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'News' } },
      platform: 'wordpress',
      ...wpDoors(site, describe(WP_132)),
      pageHtml: wpPages(site),
      mint,
      verify: false
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(site.writes()[1].id, 68, "the header menu (ref 68), not the footer's Company menu")
})

test('WordPress: no map pins page markup → plain blocks, and the answer says so', async () => {
  const site = wordpressSite()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: FAQ,
      platform: 'wordpress',
      ...wpDoors(site, describe(null)),
      pageHtml: wpPages(site),
      mint,
      verify: false
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const body = site.writes()[0].fields.post_content
  assert.match(
    body,
    /<!-- wp:heading \{"level":3\} -->\n<h3 class="wp-block-heading">How fast do you reply\?<\/h3>/
  )
  assert.equal(blockMarkupProblem(body), null)
  assert.deepEqual(out.notes, [PAGE_CREATE_NEXT.plainNote])
})

/** tracy-base's `templates/page.html` as dskeepwp serves it (10/10/2026): no `core/post-title`, its pages' heroes carry the h1. */
const TRACY_BASE_PAGE = [
  '<!-- wp:template-part {"slug":"header","tagName":"header","className":"tracy-header","area":"header"} /-->',
  '<!-- wp:group {"tagName":"main","className":"tracy-main tracy-page-stack","layout":{"type":"default"}} -->',
  '<main class="wp-block-group tracy-main tracy-page-stack">',
  '<!-- wp:post-content {"layout":{"type":"default"}} /-->',
  '</main>',
  '<!-- /wp:group -->',
  '<!-- wp:template-part {"slug":"footer","tagName":"footer","className":"tracy-footer","area":"footer"} /-->'
].join('\n')

// Measured 10/10/2026 on dskeepwp (tracy-base wp7): "Tạo thêm một trang Dịch vụ …" ("Add a Services page …") was written in plain blocks (no map
// pins tracy-base's page markup), its first heading an h3, and the theme's page template prints no title: the page had
// no h1 at all.
test('WordPress: plain blocks open with the page’s h1 when its template prints no title, and only then', async () => {
  const titled = TRACY_BASE_PAGE.replace(
    '<!-- wp:post-content',
    '<!-- wp:post-title {"level":1} /-->\n<!-- wp:post-content'
  )
  for (const [templates, h1, why] of /** @type {[Record<string, string>, boolean, string][]} */ ([
    [{ page: TRACY_BASE_PAGE }, true, 'tracy-base: the page template prints no title'],
    [{ index: TRACY_BASE_PAGE }, true, 'no page or singular template: WordPress renders index'],
    [
      { page: titled, index: TRACY_BASE_PAGE },
      false,
      'the template prints the title: a second one is as wrong as none'
    ],
    [
      { page: '<!-- wp:pattern {"slug":"theme/page"} /-->' },
      false,
      'a body handed to a pattern cannot be seen into'
    ]
  ])) {
    const site = wordpressSite({ themeFiles: { templates } })
    const out = /** @type {any} */ (
      await runPageCreate({
        params: FAQ,
        platform: 'wordpress',
        ...wpDoors(site, describe(null)),
        pageHtml: wpPages(site),
        mint,
        verify: false
      })
    )
    assert.equal(out.ok, true, JSON.stringify(out))
    const body = site.writes()[0].fields.post_content
    assert.equal(blockMarkupProblem(body), null, why)
    assert.equal(
      body.startsWith(
        '<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading">Common questions</h1>\n<!-- /wp:heading -->\n<!-- wp:heading {"level":3} -->'
      ),
      h1,
      why
    )
    assert.equal((body.match(/<h1\b/g) ?? []).length, h1 ? 1 : 0, why)
  }
})

/**
 * A header drawn like tracy-base's (dskeepwp, 10/10/2026): its navigation block (the Header menu, post 68) is the phone's
 * overlay menu only — hidden by the theme's CSS above 781px — and the desktop row is the header part's own paragraphs,
 * one link each, with "Services" drawn as a mega menu. `row: false` leaves the row out; `ref` names the menu the
 * navigation block draws.
 * @param {{ row?: boolean, ref?: number }} [shape]
 */
const tracyBaseHeader = ({ row = true, ref = 68 } = {}) => {
  const link = (/** @type {string} */ href, /** @type {string} */ label) =>
    `<!-- wp:paragraph {"className":"tracy-header__link"} -->\n<p class="tracy-header__link"><a href="${href}">${label}</a></p>\n<!-- /wp:paragraph -->`
  return [
    '<!-- wp:group {"className":"tracy-header__menu","layout":{"type":"flex","flexWrap":"nowrap"}} -->',
    '<div class="wp-block-group tracy-header__menu">',
    `<!-- wp:navigation {"ref":${ref},"className":"tracy-nav","overlayMenu":"always"} /-->`,
    ...(row
      ? [
          '<!-- wp:group {"className":"tracy-header__links","layout":{"type":"flex","flexWrap":"nowrap"}} -->',
          '<div class="wp-block-group tracy-header__links">',
          link('/', 'Home'),
          link('/about/', 'About'),
          '<!-- wp:paragraph -->\n<p><a href="/services/">Explore our services →</a></p>\n<!-- /wp:paragraph -->',
          link('/projects/', 'Projects'),
          link('/news/', 'News'),
          '</div>',
          '<!-- /wp:group -->'
        ]
      : []),
    '</div>',
    '<!-- /wp:group -->'
  ].join('\n')
}

/**
 * The site's own browser over such a header, as `menuSeen` reads it: a desktop visitor sees a label only in the
 * header part's row (the navigation block is `display:none` there), and a phone visitor sees neither until the
 * overlay menu is opened.
 * @param {ReturnType<typeof wordpressSite>} site
 * @param {string} file - the header part as the theme ships it
 */
const tracyBaseBrowser = (site, file) => async (/** @type {Record<string, any>} */ req) => {
  const stored = [...site.posts.values()].find(
    (p) => p.post_type === 'wp_template_part' && p.post_name === 'header' && p.theme === 'tracy-base'
  )
  const part = stored ? stored.post_content : file
  const inRow = part.includes(
    `<p class="tracy-header__link"><a href="/common-questions/">${req.text}</a></p>`
  )
  const hidden =
    req.viewport === 'desktop'
      ? inRow
        ? false
        : 'display:none on <ul.wp-block-navigation__container.is-responsive>'
      : 'display:none on <div.wp-block-navigation__responsive-container>'
  return {
    ok: true,
    payload: { info: { el: '<a.wp-block-navigation-item__content>', how: 'exact', chrome: true, hidden } }
  }
}

// Measured 10/10/2026 on dskeepwp (tracy-base wp7): page.create added "Đối tác" ("Partners") to the `tracy` menu only — the navigation
// block the theme hides on a desktop — while the desktop header is the header part's own row of links (where the agent had
// put "Dịch vụ" by hand the turn before), and the receipt said "its menu link shows on /doi-tac/".
test('WordPress: a header that draws its own row of links gets the new link there too, and the receipt says where it shows', async () => {
  const file = tracyBaseHeader()
  const site = wordpressSite({
    theme: 'tracy-base',
    themeFiles: { parts: { header: { content: file, area: 'header' } } }
  })
  const out = /** @type {any} */ (
    await runPageCreate({
      params: FAQ,
      platform: 'wordpress',
      ...wpDoors(site, describe(null)),
      pageHtml: wpPages(site),
      menuSeen: tracyBaseBrowser(site, file),
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const writes = site.writes()
  assert.deepEqual(
    writes.map((w) => `${w.kind}${w.key ? `:${w.key}` : ''}`),
    ['post', 'post', 'templatePart:header'],
    'the page, the menu, the header row'
  )
  assert.equal(
    new Set(writes.map((w) => w.apply_id)).size,
    1,
    'one apply id: one apply.revert undoes all three'
  )
  const header = writes[2].fields.content
  assert.equal(blockMarkupProblem(header), null)
  const row = [...header.matchAll(/<p class="tracy-header__link"><a href="([^"]*)">([^<]*)<\/a><\/p>/g)].map(
    (m) => `${m[2]} ${m[1]}`
  )
  assert.deepEqual(
    row,
    ['Home /', 'About /about/', 'Common questions /common-questions/', 'Projects /projects/', 'News /news/'],
    'after Services (drawn as a mega menu here), right before the copy of the item that follows it'
  )
  assert.ok(header.indexOf('Explore our services') < header.indexOf('Common questions'))
  assert.deepEqual(out.verified, [
    'shown on /common-questions/',
    'its menu link shows on / at desktop 1440 and phone 390 behind its menu button'
  ])
  assert.match(out.next, /live at \/common-questions\/ and in the menu after "Services"/)
  await site.door('apply.revert', { apply_id: out.apply_id })
  assert.equal(
    [...site.posts.values()].some((p) => p.post_type === 'wp_template_part' && p.theme === 'tracy-base'),
    false,
    'the header part is the theme file again'
  )
})

test('WordPress: a menu link a desktop visitor cannot see is said so, with the widths it shows at, and the receipt does not call it in the menu', async () => {
  const file = tracyBaseHeader({ row: false })
  const site = wordpressSite({
    theme: 'tracy-base',
    themeFiles: { parts: { header: { content: file, area: 'header' } } }
  })
  const out = /** @type {any} */ (
    await runPageCreate({
      params: FAQ,
      platform: 'wordpress',
      ...wpDoors(site, describe(null)),
      pageHtml: wpPages(site),
      menuSeen: tracyBaseBrowser(site, file),
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(site.writes().length, 2, 'no row of its own: the header part is not written')
  assert.deepEqual(out.verified, [
    'shown on /common-questions/',
    pageText('menuDesktopHidden', {
      home: '/',
      why: 'display:none on <ul.wp-block-navigation__container.is-responsive>',
      widths: 'phone 390 behind its menu button'
    })
  ])
  assert.equal(out.next, pageText('receiptMenuHidden', { path: '/common-questions/' }))
  assert.doesNotMatch(out.next, /in the menu after/)
  // A header whose navigation block draws another menu: its row is not this menu's, and is left alone.
  const other = tracyBaseHeader({ ref: 70 })
  const elsewhere = wordpressSite({
    theme: 'tracy-base',
    themeFiles: { parts: { header: { content: other, area: 'header' } } }
  })
  const left = /** @type {any} */ (
    await runPageCreate({
      params: FAQ,
      platform: 'wordpress',
      ...wpDoors(elsewhere, describe(null)),
      pageHtml: wpPages(elsewhere),
      mint,
      verify: false
    })
  )
  assert.equal(left.ok, true, JSON.stringify(left))
  assert.equal(elsewhere.writes().length, 2)
})

test('WordPress: an item no menu holds is refused before anything is written, with the menus listed', async () => {
  const site = wordpressSite()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'Pricing' } },
      platform: 'wordpress',
      ...wpDoors(site, describe(WP_110)),
      pageHtml: wpPages(site),
      mint
    })
  )
  assert.equal(out.code, 'NOT_FOUND', JSON.stringify(out))
  assert.deepEqual(site.writes(), [])
  assert.ok(out.menus.some((/** @type {any} */ m) => m.name === 'Header' && m.labels.includes('Services')))
})

test('WordPress: a menu write refused after the page was made takes the page back — never a page no menu reaches', async () => {
  const site = wordpressSite({
    script: (action, params) =>
      action === 'content.update' && params.id === 68
        ? { ok: false, error: 'write_failed', message: 'locked' }
        : undefined
  })
  const before = site.posts.size
  const out = /** @type {any} */ (
    await runPageCreate({
      params: FAQ,
      platform: 'wordpress',
      ...wpDoors(site, describe(WP_110)),
      pageHtml: wpPages(site),
      mint
    })
  )
  assert.equal(out.code, 'WRITE_FAILED', JSON.stringify(out))
  assert.ok(site.calls.some(([a]) => a === 'apply.revert'))
  assert.equal(site.posts.size, before, 'the page made first is gone again')
})

// ── Joomla ─────────────────────────────────────────────────────────────────────────────────────

/** @param {ReturnType<typeof joomlaSite>} site @param {ReturnType<typeof describe>} described */
const joDoors = (site, described) => ({
  send: async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) =>
    action === 'content.read' && params.describe === true ? described : site.door(action, params),
  siteCall: site.door,
  pageHtml: site.pageHtml,
  menuSeen: browserSees()
})

test('Joomla: the article joins the category of the page it follows, its menu item lands after it — one call', async () => {
  const site = joomlaSite()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'About us' } },
      platform: 'joomla',
      ...joDoors(site, describe(null)),
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const writes = site.writes()
  assert.equal(writes.length, 3, JSON.stringify(writes))
  const [article, item, move] = writes
  assert.deepEqual(
    [article.kind, article.id, item.kind, item.id, move.kind],
    ['article', 0, 'menuItem', 0, 'menuItem']
  )
  assert.ok(move.id > 0, 'the move names the item just made')
  assert.equal(new Set(writes.map((w) => w.apply_id)).size, 1, 'one apply id for the three writes')
  assert.equal(article.fields.catid, 2, 'the category of "About us"\'s own article')
  assert.equal(article.fields.language, 'en-GB')
  assert.equal(article.fields.introtext, '', 'the row is inserted whole')
  assert.equal(
    article.fields.fulltext,
    '<h3>How fast do you reply?</h3><p>Within one working day.</p><h3>Do you work weekends?</h3><p>No, Monday to Friday only.</p><h3>Can I visit your office?</h3><p>Yes, please book a time first.</p>'
  )
  assert.equal(item.fields.menutype, 'mainmenu-en')
  assert.match(item.fields.link, /^index\.php\?option=com_content&view=article&id=\d+$/)
  assert.deepEqual(move.fields, { move_after: 102 })
  assert.equal(out.page.path, '/en/common-questions')
  assert.deepEqual(out.menu, { menu: 'mainmenu-en', label: 'Common questions', after: 'About us' })
  assert.deepEqual(out.verified, [
    'shown on /en/common-questions',
    'its menu link shows on /en/ at desktop 1440 and phone 390'
  ])
  // The menu as a visitor reads it: right after "About us".
  const nav = [
    .../** @type {string} */ ((await site.pageHtml('/en/')).html).matchAll(
      /<li class="nav-item[^"]*"><a [^>]*>([^<]*)<\/a>/g
    )
  ].map((m) => m[1])
  assert.deepEqual(nav, ['Home', 'About us', 'Common questions', 'Contact', 'News'])
})

test('Joomla: the reported page path follows an absolute same-site menu href when labels repeat and SEF rewriting is off', async () => {
  const site = joomlaSite()
  const paths = []
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'About us' } },
      platform: 'joomla',
      siteOrigin: 'https://example.com',
      ...joDoors(site, describe(null)),
      pageHtml: async (path) => {
        paths.push(path)
        if (path === '/en/') {
          const created = [...site.db.menuItem.values()].find((item) => item.title === 'Common questions')
          return {
            ok: true,
            status: 200,
            html: `<html><body><nav><ul><li class="item-399"><a href="/en/old-questions">Common questions</a></li><li class="item-${created.id}"><a href="https://example.com/index.php/common-questions">Common questions</a></li></ul></nav></body></html>`
          }
        }
        return {
          ok: true,
          status: 200,
          html: '<html><body><main><h1>Common questions</h1><p>Within one working day.</p></main></body></html>'
        }
      },
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.page.path, '/index.php/common-questions')
  assert.equal(out.verified[0], 'shown on /index.php/common-questions')
  assert.deepEqual(paths, ['/en/', '/index.php/common-questions'])
})

test('Joomla: a missing new menu item in the home read does not discard its created path', async () => {
  const site = joomlaSite()
  const paths = []
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'About us' } },
      platform: 'joomla',
      ...joDoors(site, describe(null)),
      pageHtml: async (path) => {
        paths.push(path)
        if (path === '/en/')
          return {
            ok: true,
            status: 200,
            html: '<html><body><nav><a href="/en/about">About us</a></nav></body></html>'
          }
        return {
          ok: true,
          status: 200,
          html: '<html><body><main><h1>Common questions</h1><p>Within one working day.</p></main></body></html>'
        }
      },
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.page.path, '/en/common-questions')
  assert.equal(out.verified[0], 'shown on /en/common-questions')
  assert.deepEqual(paths, ['/en/', '/en/common-questions'])
})

test('Joomla: with the quickstart map the body is its recipe, and the apply undoes all three writes', async () => {
  const site = joomlaSite()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'Contact' } },
      platform: 'joomla',
      ...joDoors(site, describe(JO_120, { defaultLocale: 'en-GB', locales: ['en-GB', 'fr-FR'] })),
      mint,
      verify: false
    })
  )
  // "Contact" is in both language menus: the map's language (en-GB) decides, never a guess.
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.equal(out.notes, undefined)
  assert.equal(site.writes()[1].fields.menutype, 'mainmenu-en')
  const articles = site.db.article.size
  const items = site.db.menuItem.size
  await site.door('apply.revert', { apply_id: out.apply_id })
  assert.equal(site.db.article.size, articles - 1)
  assert.equal(site.db.menuItem.size, items - 1)
})

// Measured 10/10/2026 on dskeepjo (tracy-base j6, T4): a Vietnamese request
// ("Add a Services page … and add it to the main menu") made menu item 347 with `template_style_id` 0, so Joomla dressed it in the DEFAULT style, "Tracy — base ·
// Home" (110), whose layout prints no article: /dich-vu answered 200 with `layout-home` and none of its words, and the
// call said "shown on /dich-vu" because the new menu link carries the title on every page.
test('Joomla: the menu item wears the style the site’s article pages wear, never a default home layout that prints no article', async () => {
  const site = joomlaSite({ homeLayout: true })
  const out = /** @type {any} */ (
    await runPageCreate({
      // after Home: the page it follows is the home page, whose style is no article page's
      params: { ...FAQ, menu: { after: 'Home' } },
      platform: 'joomla',
      ...joDoors(site, describe(null)),
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const item = site.writes().find((w) => w.kind === 'menuItem' && w.id === 0)
  assert.equal(item?.fields.template_style_id, 14, 'the Inner style About us and Contact wear')
  const page = /** @type {string} */ ((await site.pageHtml(out.page.path)).html)
  assert.match(page, /itemprop="articleBody"[\s\S]*Within one working day\./, 'a visitor reads the page')
  assert.deepEqual(out.verified, [
    'shown on /en/common-questions',
    'its menu link shows on /en/ at desktop 1440 and phone 390'
  ])
  assert.match(out.next, /live at \/en\/common-questions/)
})

test('Joomla: a page whose words do not show is never "shown" on its menu link, and the receipt does not call it live', async () => {
  // Every article page wears the default (a home layout here), so nothing tells a better style: the page is made, and
  // the read of it says what a visitor sees — the menu link, not the page.
  const site = joomlaSite({ homeLayout: true })
  for (const id of [102, 103]) /** @type {any} */ (site.db.menuItem.get(id)).template_style_id = '0'
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'About us' } },
      platform: 'joomla',
      ...joDoors(site, describe(null)),
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const item = site.writes().find((w) => w.kind === 'menuItem' && w.id === 0)
  assert.equal(item?.fields.template_style_id, undefined, 'the default is all the site says')
  assert.deepEqual(out.verified, [
    pageText('bodyHidden', { path: '/en/common-questions' }),
    'its menu link shows on /en/ at desktop 1440 and phone 390'
  ])
  assert.doesNotMatch(out.next, /live/)
  assert.equal(
    out.next,
    pageText('receiptHidden', {
      path: '/en/common-questions',
      place: pageText('menuPlace', { after: 'About us' })
    })
  )
})

test('Joomla: a page that follows a category list and no map to name a category is refused, nothing written', async () => {
  const site = joomlaSite()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'News' } },
      platform: 'joomla',
      ...joDoors(site, describe(null)),
      mint
    })
  )
  assert.equal(out.code, 'NOT_FOUND', JSON.stringify(out))
  assert.deepEqual(site.writes(), [])
})

// ── EmDash ─────────────────────────────────────────────────────────────────────────────────────

test('EmDash: a published entry of the pages collection in the map\'s Markdown, and its menu row after "Services"', async () => {
  const site = fakeSite({
    on: {
      content_create: (/** @type {any} */ args) =>
        answer({
          item: {
            id: '01PAGECREATE000000000000AA',
            type: args.collection,
            slug: args.slug,
            status: 'published',
            locale: 'en',
            data: args.data,
            liveRevisionId: 'r1',
            draftRevisionId: null,
            version: 1,
            updatedAt: '2026-10-05T10:00:00.000Z'
          },
          _rev: 'MTpyZXY='
        })
    }
  })
  const state = createEmdashState()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: FAQ,
      platform: 'emdash',
      send: async (action, params) =>
        action === 'content.read' && params.describe === true
          ? describe(EM_151, { defaultLocale: 'en', locales: ['en'] })
          : { ok: false, code: 'EMDASH_SITE' },
      siteCall: async () => assert.fail('an EmDash page is written through its own road'),
      emdash: (tool, args) => runDoor(site, { tool, arguments: args }, { state, hostStep: true }),
      pageHtml: async () => ({ ok: false }),
      mint
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out))
  const made = site.calls.find((c) => 'name' in c && c.name === 'content_create')
  assert.ok(made && 'arguments' in made)
  assert.equal(made.arguments.collection, 'pages')
  assert.equal(made.arguments.status, 'published')
  assert.equal(made.arguments.slug, 'common-questions')
  assert.equal(
    made.arguments.data.content,
    '## How fast do you reply?\n\nWithin one working day.\n\n## Do you work weekends?\n\nNo, Monday to Friday only.\n\n## Can I visit your office?\n\nYes, please book a time first.'
  )
  const set = site.calls.find((c) => 'name' in c && c.name === 'menu_set_items')
  assert.ok(set && 'arguments' in set)
  assert.equal(set.arguments.name, 'primary')
  const labels = set.arguments.items.map((/** @type {any} */ it) => it.label)
  assert.equal(labels[labels.indexOf('Services') + 1], 'Common questions')
  assert.deepEqual(set.arguments.items[labels.indexOf('Common questions')], {
    label: 'Common questions',
    type: 'custom',
    customUrl: '/common-questions'
  })
  assert.equal(out.page.path, '/common-questions')
  assert.deepEqual(out.menu, { menu: 'primary', label: 'Common questions', after: 'Services' })
  assert.deepEqual(out.verified, [PAGE_CREATE_NEXT.notChecked])
  // the menu was read before the entry was made: a call that cannot place its row writes nothing
  const order = site.calls.filter((c) => 'name' in c).map((c) => /** @type {any} */ (c).name)
  assert.ok(order.indexOf('menu_get') < order.indexOf('content_create'), order.join(', '))
})

test('EmDash: an item the menu does not hold is refused before the entry is made', async () => {
  const site = fakeSite()
  const out = /** @type {any} */ (
    await runPageCreate({
      params: { ...FAQ, menu: { after: 'Pricing' } },
      platform: 'emdash',
      send: async () => describe(EM_151),
      siteCall: async () => assert.fail('never'),
      emdash: (tool, args) => runDoor(site, { tool, arguments: args }, { hostStep: true }),
      pageHtml: async () => ({ ok: false }),
      mint
    })
  )
  assert.equal(out.code, 'NOT_FOUND', JSON.stringify(out))
  assert.ok(!site.calls.some((c) => 'name' in c && c.name === 'content_create'))
})
