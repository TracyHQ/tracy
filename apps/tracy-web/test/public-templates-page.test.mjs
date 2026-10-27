// The public template page (`/templates/<id>/`, issue #1762 ticket 1): what a visitor or a crawler
// gets back from the address, driven through the whole tracy-web app with the published-template
// source replaced by a fixed list.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { industryOf } from '../src/public/templates-industry.js'
import { buildUrl } from '../../../packages/web/tracy-design-page/src/templates.mjs'

// The production origin: the only one whose Templates pages may be indexed (`templates-indexing.js`).
const ORIGIN = 'https://cowork.tracy.ai'
const DEV_ORIGIN = 'https://cowork.tracy.site'
const shots = (id, key) => ({
  desktop: `${ORIGIN}/api/templates/${id}/shots/${id}-${key}-1440.png?v=1`,
  mobile: `${ORIGIN}/api/templates/${id}/shots/${id}-${key}-390.png?v=1`
})
const card = (
  id,
  label,
  { category = 'Professional & Corporate', platforms = ['wordpress', 'joomla'], ...rest } = {}
) => ({
  id,
  label,
  card: {
    blurb: `${label} blurb for a restaurant with a menu & reservations.`,
    category,
    provider: 'JoomlArt',
    image: shots(id, 'home').desktop,
    layouts: [
      { key: 'home', label: 'Home', path: '/', shots: shots(id, 'home') },
      { key: 'menu', label: 'Menu', path: '/menu', address: '/index.php/menu', shots: shots(id, 'menu') }
    ],
    // As `GET /api/templates` writes it: the demo and the `demo-frame` probe asked before framing it.
    demo: { url: `https://${id}-wordpress.tracy.ai/`, probe: `${ORIGIN}/api/templates/${id}/demo-frame` },
    ...rest
  },
  platforms: platforms.map((platform) => ({ platform, tag: `quickstart/${id}/${platform}` }))
})

const FRESCO = card('ja-fresco', 'JA Fresco')
const BOXING = {
  ...card('ja-boxing', 'JA Boxing', { category: 'Bold & Expressive', platforms: ['joomla'] }),
  card: {
    blurb: 'A boxing studio website.',
    category: 'Bold & Expressive',
    image: null,
    layouts: [{ key: 'home', label: 'Home', shots: { desktop: null, mobile: null } }]
  }
}

function app(list, origin = ORIGIN, extra = {}) {
  return buildApp({
    config: {
      sessionSecret: 's'.repeat(32),
      origin,
      secure: false,
      siteDomain: 'tracy.test',
      siteDomainAliases: [],
      sessionDomain: null,
      ...extra
    },
    fetchImpl: async () => {
      throw new Error('a test must never reach the network')
    },
    mail: { send: async () => {} },
    publicTemplates: async () => list
  })
}

/** Only the page's own inline scripts: the theme boot, the chrome toggles and JSON-LD. Nothing is fetched. */
const assertNoExternalScript = (html) =>
  assert.doesNotMatch(html, /<script[^>]*\ssrc=/, 'no script is fetched from anywhere')

const get = (a, path) => a.request(`${ORIGIN}${path}`, { redirect: 'manual' })

test('a template page carries its name, blurb, CMS, every layout, the demo and a canonical link', async () => {
  const res = await get(app([FRESCO, BOXING]), '/templates/ja-fresco/')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/html/)
  const html = await res.text()
  assert.match(html, /<h1>JA Fresco<\/h1>/)
  assert.match(html, /JA Fresco blurb for a restaurant with a menu &amp; reservations\./)
  assert.match(html, /<title>JA Fresco template for WordPress and Joomla \| Tracy<\/title>/)
  assert.match(html, /<meta name="description" content="JA Fresco blurb/)
  const head = html.match(/<div class="info">[\s\S]*?<aside/)?.[0] ?? ''
  assert.ok(!head.includes('class="badge"'), 'no CMS badge pills in the detail head')
  assert.ok(html.includes('href="https://ja-fresco-wordpress.tracy.ai/"'))
  assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/templates/ja-fresco/">`))
  assert.ok(html.includes(`<meta property="og:image" content="${FRESCO.card.image}&amp;w=960">`))
  assert.match(html, /"@type":"BreadcrumbList"/)
  assertNoExternalScript(html)
})

test('the detail breadcrumb is Templates > template name, with no platform crumb even for a multi-CMS template', async () => {
  const html = await (await get(app([FRESCO, BOXING]), '/templates/ja-fresco/')).text()
  const nav = html.match(/<nav class="crumbs"[\s\S]*?<\/nav>/)?.[0] ?? ''
  assert.equal(
    nav
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
    'Templates &rsaquo; JA Fresco',
    'two crumbs: Templates, then the template'
  )
  assert.match(nav, /<a href="\/templates\/">Templates<\/a>/)
  assert.doesNotMatch(nav, /WordPress|Joomla/, 'the platform is not a crumb')
  const ld = JSON.parse(
    html.match(/<script type="application\/ld\+json">([\s\S]*?BreadcrumbList[\s\S]*?)<\/script>/)?.[1] ??
      'null'
  )
  assert.equal(ld?.itemListElement?.length, 2, 'BreadcrumbList has two items')
  const cmsLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((n) => n['@type'] === 'CreativeWork')
  assert.match(cmsLd?.keywords, /^WordPress, Joomla(,|$)/, 'the JSON-LD still states the CMS it runs on')
  assert.deepEqual(
    ld.itemListElement.map((i) => [i.position, i.name, i.item]),
    [
      [1, 'Templates', `${ORIGIN}/templates/`],
      [2, 'JA Fresco', `${ORIGIN}/templates/ja-fresco/`]
    ]
  )
})

test('one build link per platform, carrying inspiration, platform and the visit campaign', async () => {
  const res = await get(app([FRESCO]), '/templates/ja-fresco/?utm_source=news&utm_medium=mail&other=x')
  const html = await res.text()
  const links = [...html.matchAll(/href="https:\/\/cowork\.tracy\.ai(\/new\/\?[^"]+)"/g)].map((m) =>
    m[1].replaceAll('&amp;', '&')
  )
  assert.deepEqual(links, [
    '/new/?inspiration=ja-fresco&platform=wordpress&utm_source=news&utm_medium=mail',
    '/new/?inspiration=ja-fresco&platform=joomla&utm_source=news&utm_medium=mail'
  ])
})

test('each build link is exactly the one the Design inspiration page builds for the same card', async () => {
  const search = '?utm_source=news&utm_medium=mail&utm_campaign=fall&utm_content=hero&other=x'
  const html = await (await get(app([FRESCO]), `/templates/ja-fresco/${search}`)).text()
  const links = [...html.matchAll(/href="https:\/\/cowork\.tracy\.ai(\/new\/\?[^"]+)"/g)].map((m) =>
    m[1].replaceAll('&amp;', '&')
  )
  // The Design inspiration page passes the card row, which carries `template` for a finished template.
  const row = { id: 'ja-fresco', template: {} }
  assert.deepEqual(
    links,
    ['wordpress', 'joomla'].map((platform) => buildUrl('example.com', row, platform, search))
  )
})

test('signed out, a build link leads to sign-in that comes back to the same build link', async () => {
  // A site book that knows no host: enough for the workspace door to answer a signed-out visitor.
  const signedOutApp = buildApp({
    config: {
      sessionSecret: 's'.repeat(32),
      origin: ORIGIN,
      secure: false,
      siteDomain: 'tracy.test',
      siteDomainAliases: [],
      sessionDomain: null
    },
    fetchImpl: async () => {
      throw new Error('a test must never reach the network')
    },
    mail: { send: async () => {} },
    sites: { hostOf: async () => null, dshOf: () => null },
    publicTemplates: async () => [FRESCO]
  })
  const html = await (await get(signedOutApp, '/templates/ja-fresco/?utm_source=news')).text()
  const links = [...html.matchAll(/href="https:\/\/cowork\.tracy\.ai(\/new\/\?[^"]+)"/g)].map((m) =>
    m[1].replaceAll('&amp;', '&')
  )
  assert.equal(links.length, 2)
  for (const link of links) {
    const press = await get(signedOutApp, link)
    assert.equal(press.status, 302, link)
    const login = new URL(press.headers.get('location'), ORIGIN)
    assert.equal(login.pathname, '/login')
    assert.equal(login.searchParams.get('next'), link, 'the template and platform survive the sign-in')
    const page = await get(signedOutApp, `${login.pathname}${login.search}`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /<form/, 'a working sign-in form')
  }
})

test('the details table holds every fact once: style, provider and Supported CMS, with no page count and no demo link', async () => {
  const html = await (await get(app([FRESCO, BOXING]), '/templates/ja-fresco/')).text()
  const panel = html.match(/<aside class="dside"[\s\S]*?<\/aside>/)?.[0] ?? ''
  for (const [label, value] of [
    ['Style', 'Professional &amp; Corporate'],
    ['Provider', 'JoomlArt'],
    ['Supported CMS', 'WordPress, Joomla']
  ])
    assert.ok(panel.includes(`<li><b>${label}</b><span>${value}</span></li>`), label)
  assert.doesNotMatch(panel, /<b>Pages<\/b>/, 'no page count row')
  assert.doesNotMatch(panel, /<b>Runs on<\/b>/, 'the label is Supported CMS')
  assert.doesNotMatch(panel, /<b>Category<\/b>/)
  assert.doesNotMatch(panel, /href=/, 'the preview toolbar has the demo link, the panel has none')
  assert.doesNotMatch(html, /View live demo/)
  assert.match(html, /href="\/templates\/">See all 2 templates<\/a>/)
})

test('the page is two columns: the information first, the demo beside it, CMS and related below', async () => {
  const html = await (await get(app([FRESCO, BOXING]), '/templates/ja-fresco/')).text()
  const at = (re) => html.search(re)
  const info = html.match(/<div class="info">[\s\S]*?<div class="stage-col">/)?.[0] ?? ''
  for (const part of ['class="crumbs"', '<h1>', 'Use this template on', 'View demo site', 'class="dside"'])
    assert.ok(info.includes(part), `the left column holds ${part}`)
  assert.ok(!info.includes('id="pv"'), 'the demo is not in the information column')
  assert.ok(
    at(/class="stage-col"><section class="pv" id="pv"/) > 0,
    'the live preview fills the right column'
  )
  assert.ok(at(/class="stage-col"/) < at(/More Restaurant|More templates/), 'related templates come last')
  assert.doesNotMatch(html, /Which CMS does/, 'no CMS section: the table says Supported CMS')
  assert.match(html, /@media \(max-width:1024px\)\{\.split\{grid-template-columns:1fr/, 'stacks below 1025px')
  assert.doesNotMatch(
    html,
    /\{position:sticky;top:(72|80)px\}/,
    'both columns are top aligned, nothing sticky'
  )
  assert.doesNotMatch(html, /100vh/, 'the desktop frame height does not follow the viewport')
  assert.match(html, /\.pv-view\{position:relative;aspect-ratio:16\/10/, 'the desktop frame is 16:10')
})

test('a template with no demo shows its picture, or the placeholder, in the right column', async () => {
  const html = await (await get(app([FRESCO, BOXING]), '/templates/ja-boxing/')).text()
  assert.match(html, /<div class="stage-col"><div class="hero-shot">/)
  assert.doesNotMatch(html, /id="pv"/)
})

const relatedIds = (html) =>
  [...html.matchAll(/class="tcard" href="\/templates\/([^/]+)\/"/g)].map((m) => m[1])
const NEUTRAL = 'A multipurpose business site.'

test('with no other template of the same industry, related falls back to category then platform, at most four', async () => {
  const others = [
    card('ja-a', 'JA A', { category: 'Bold & Expressive', blurb: NEUTRAL }),
    card('ja-b', 'JA B', { blurb: NEUTRAL }),
    card('ja-c', 'JA C', { platforms: ['emdash'], blurb: NEUTRAL }),
    card('ja-d', 'JA D', { blurb: NEUTRAL }),
    card('ja-e', 'JA E', { category: 'Bold & Expressive', blurb: NEUTRAL }),
    card('ja-f', 'JA F', { category: 'Bold & Expressive', blurb: NEUTRAL }),
    card('ja-g', 'JA G', { blurb: NEUTRAL })
  ]
  const html = await (await get(app([FRESCO, ...others]), '/templates/ja-fresco/')).text()
  assert.deepEqual(relatedIds(html), ['ja-b', 'ja-d', 'ja-g', 'ja-c'])
  assert.match(html, /<h2>More templates<\/h2>/, 'no same-industry template: the plain heading')
})

test('related lists the same industry first (sharing a platform first), then category, then platform', async () => {
  const restaurant = (id, o = {}) => card(id, id, { blurb: 'A restaurant with a menu.', ...o })
  const list = [
    FRESCO,
    card('ja-biz', 'JA Biz', { blurb: NEUTRAL }), // same category, other industry
    restaurant('ja-r-emdash', { platforms: ['emdash'], category: 'Themed & Unique' }),
    restaurant('ja-r-wp', { platforms: ['wordpress'], category: 'Themed & Unique' }),
    card('ja-bold', 'JA Bold', { category: 'Bold & Expressive', blurb: NEUTRAL })
  ]
  const html = await (await get(app(list), '/templates/ja-fresco/')).text()
  assert.deepEqual(relatedIds(html), ['ja-r-wp', 'ja-r-emdash', 'ja-biz', 'ja-bold'])
  assert.match(html, /<h2>More Restaurant &amp; Food templates<\/h2>/)
})

test('the details panel names the industry above the category', async () => {
  const html = await (await get(app([FRESCO]), '/templates/ja-fresco/')).text()
  assert.match(html, /<li><b>Industry<\/b><span>Restaurant &amp; Food<\/span><\/li>\s*<li><b>Style<\/b>/)
})

test('the industry is read from the template words, first match wins, Business when nothing matches', () => {
  const of = (label, blurb) => industryOf({ label, card: { blurb } })
  assert.equal(of('X', 'A restaurant website featuring a food menu.'), 'Restaurant & Food')
  assert.equal(of('X', 'A travel agency site template with tour listings.'), 'Travel & Hospitality')
  assert.equal(of('X', 'A business site for hospitals and clinics.'), 'Health & Medical')
  assert.equal(of('X', 'A portfolio site for a design studio.'), 'Portfolio & Agency')
  assert.equal(of('X', 'A business site for an IT services company.'), 'Technology')
  assert.equal(of('X', 'A band website with tour dates.'), 'Music & Media')
  assert.equal(of('X', 'A blog and magazine with travel posts.'), 'Blog & Magazine')
  assert.equal(of('Gymnast', 'A site for a company.'), 'Business', 'whole words only')
  assert.equal(of('X', 'Industrial infrastructure company website'), 'Business')
  assert.equal(industryOf({}), 'Business')
})

test('the address without its trailing slash moves permanently to the slash form', async () => {
  const res = await get(app([FRESCO]), '/templates/ja-fresco?utm_source=x')
  assert.equal(res.status, 301)
  assert.equal(
    new URL(res.headers.get('location'), ORIGIN).pathname +
      new URL(res.headers.get('location'), ORIGIN).search,
    '/templates/ja-fresco/?utm_source=x'
  )
})

test('an unknown or unpublished id answers 404 with a way back to all templates', async () => {
  const res = await get(app([FRESCO]), '/templates/ja-civica/')
  assert.equal(res.status, 404)
  const html = await res.text()
  assert.match(html, /Template not found/)
  assert.match(html, /href="\/templates\/"/)
  assert.match(html, /<meta name="robots" content="noindex">/)
})

test('a template or layout with no shot shows the placeholder, never a broken image', async () => {
  const html = await (await get(app([BOXING]), '/templates/ja-boxing/')).text()
  assert.match(html, /Preview not available yet/)
  assert.doesNotMatch(html, /<img[^>]+src="(?:null|undefined)?"/)
  assert.doesNotMatch(html, /og:image/)
})

test('a template added to the source appears on the next request, with no restart', async () => {
  const list = [FRESCO]
  const a = app(list)
  assert.equal((await get(a, '/templates/ja-boxing/')).status, 404)
  list.push(BOXING)
  assert.equal((await get(a, '/templates/ja-boxing/')).status, 200)
  list.splice(1, 1)
  assert.equal((await get(a, '/templates/ja-boxing/')).status, 404)
})

test('a platform name is never read as a template id, and its old address moves to the gallery', async () => {
  const a = app([card('wordpress', 'Not a template')])
  for (const path of ['/templates/wordpress/', '/templates/joomla/', '/templates/emdash/']) {
    const res = await get(a, path)
    assert.equal(res.status, 301, path)
    assert.equal(new URL(res.headers.get('location'), ORIGIN).pathname, '/templates/')
  }
  assert.equal((await get(a, '/templates/wordpress')).status, 301)
})

test('when no layout has any shot, only the main placeholder shows', async () => {
  const html = await (await get(app([BOXING]), '/templates/ja-boxing/')).text()
  assert.equal((html.match(/Preview not available yet/g) ?? []).length, 1)
  assert.doesNotMatch(html, /<h2>Layouts<\/h2>/)
  assert.doesNotMatch(html, /<h2>On mobile<\/h2>/)
})

test('with no demo, when only some shots are missing, those layouts keep a placeholder', async () => {
  const partial = card('ja-part', 'JA Part', { demo: null })
  partial.card.layouts = [
    partial.card.layouts[0],
    { key: 'menu', label: 'Menu', shots: { desktop: null, mobile: null } }
  ]
  const html = await (await get(app([partial]), '/templates/ja-part/')).text()
  assert.match(html, /<h2>Layouts<\/h2>/)
  assert.equal(
    (html.match(/Preview not available yet/g) ?? []).length,
    1,
    'the missing layout, once: there is no phone grid'
  )
})

const EMDASH = card('tracy-base', 'Tracy Base', { platforms: ['wordpress', 'emdash', 'joomla'] })
const LIST = [FRESCO, BOXING, EMDASH]
const cardLinks = (html) =>
  [...html.matchAll(/class="tcard" href="\/templates\/([^/]+)\/"/g)].map((m) => m[1])
const chips = (html) =>
  [
    ...html.matchAll(
      /<button class="tab(?: on)?" type="button" data-cms="([^"]+)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]+) <b>(\d+)<\/b>/g
    )
  ].map((m) => [m[1], m[2], m[3]])

test('the gallery lists every published template, with a filter button and count per existing platform', async () => {
  const res = await get(app(LIST), '/templates/')
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.deepEqual(cardLinks(html), ['ja-fresco', 'ja-boxing', 'tracy-base'])
  assert.deepEqual(chips(html), [
    ['all', 'All', '3'],
    ['wordpress', 'WordPress', '2'],
    ['joomla', 'Joomla', '3'],
    ['emdash', 'EmDash', '1']
  ])
  assert.ok(!/<a class="tab/.test(html), 'chips are buttons, not links to other addresses')
  assert.match(html, /id="cmsfilter"[^>]*hidden/, 'hidden until the script turns the filter on')
  assert.deepEqual(
    [...html.matchAll(/class="tcard" href="[^"]+" data-platforms="([^"]*)"/g)].map((m) => m[1]),
    ['wordpress|joomla', 'joomla', 'wordpress|emdash|joomla']
  )
  assert.match(html, /<h1>Website templates<\/h1>/)
  assert.match(html, /<title>Website templates \| Tracy<\/title>/)
  assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/templates/">`))
  assert.match(html, /"@type":"ItemList","numberOfItems":3/)
  assert.match(html, /Preview not available yet/)
  assertNoExternalScript(html)
})

test('the CMS filter chips carry the CMS logo, the All chip none', async () => {
  const html = await (await get(app(LIST), '/templates/')).text()
  const bar = html.match(/id="cmsfilter"[\s\S]*?<\/div>/)[0]
  const buttons = bar.match(/<button[\s\S]*?<\/button>/g)
  assert.equal(buttons.length, 4)
  assert.ok(!buttons[0].includes('<svg'), 'All has no icon')
  for (const b of buttons.slice(1)) assert.match(b, /<svg class="ico"[^>]*aria-hidden="true"/)
})

test('cards carry their industry; the industry select lists All industries and only industries with templates', async () => {
  const html = await (await get(app(LIST), '/templates/')).text()
  const inds = [...html.matchAll(/class="tcard"[^>]*data-industry="([^"]*)"/g)].map((m) => m[1])
  assert.equal(inds.length, 3)
  const select = html.match(/<select id="industry">[\s\S]*?<\/select>/)[0]
  const options = [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map((m) => [
    m[1],
    m[2]
  ])
  assert.deepEqual(options[0], ['all', 'All industries (3)'])
  assert.deepEqual(
    options
      .slice(1)
      .map(([v]) => v)
      .sort(),
    [...new Set(inds)].sort(),
    'one option per industry that has a template'
  )
  assert.match(html, /id="nomatch"[^>]*hidden/)
  assert.match(html, /id="resetfilter"/)
})

test('the gallery has no breadcrumb, no BreadcrumbList and no per-platform page', async () => {
  const html = await (await get(app(LIST), '/templates/')).text()
  assert.doesNotMatch(html, /class="crumbs"/)
  assert.doesNotMatch(html, /BreadcrumbList/)
  assert.doesNotMatch(html, /\/templates\/(wordpress|joomla|emdash)\//)
})

test('a platform with no published template has no filter button', async () => {
  const html = await (await get(app([FRESCO]), '/templates/')).text()
  assert.ok(!chips(html).some(([cms]) => cms === 'emdash'))
})

test('the gallery without the slash moves permanently to the slash form', async () => {
  const res = await get(app(LIST), '/templates')
  assert.equal(res.status, 301)
  assert.equal(new URL(res.headers.get('location'), ORIGIN).pathname, '/templates/')
})

test('gallery cards link to their template page; the first screen loads eagerly, the rest lazily', async () => {
  const many = Array.from({ length: 5 }, (_, i) => card(`ja-n${i}`, `JA N${i}`))
  const html = await (await get(app(many), '/templates/')).text()
  const imgs = [...html.matchAll(/<img [^>]*>/g)]
    .map((m) => m[0])
    .filter((i) => !i.includes('/assets/logo.png'))
  assert.equal(imgs.length, 5)
  assert.deepEqual(
    imgs.map((i) => i.includes('loading="lazy"')),
    [false, false, false, true, true]
  )
  assert.ok(imgs.every((i) => /alt="JA N\d template preview"/.test(i)))
})

test('a template published after the first request shows in the gallery with no restart', async () => {
  const list = [FRESCO]
  const a = app(list)
  assert.deepEqual(cardLinks(await (await get(a, '/templates/')).text()), ['ja-fresco'])
  list.push(EMDASH)
  assert.deepEqual(cardLinks(await (await get(a, '/templates/')).text()), ['ja-fresco', 'tracy-base'])
})

// Ticket 3: the old Design inspiration page addresses move to the Templates pages.
const moved = async (a, path) => {
  const res = await get(a, path)
  return { status: res.status, to: res.headers.get('location') }
}

test('/design-inspiration, with or without the slash, moves permanently to /templates/', async () => {
  const a = app([FRESCO])
  for (const path of ['/design-inspiration', '/design-inspiration/'])
    assert.deepEqual(await moved(a, path), { status: 301, to: '/templates/' })
})

test('?open=<id> moves to that template when it is published, else to the gallery; utm keys ride along', async () => {
  const a = app([FRESCO, BOXING])
  assert.deepEqual(await moved(a, '/design-inspiration?open=ja-fresco'), {
    status: 301,
    to: '/templates/ja-fresco/'
  })
  assert.deepEqual(
    await moved(a, '/design-inspiration/?open=ja-boxing&provider=JoomlArt&utm_source=badge&utm_medium=site'),
    {
      status: 301,
      to: '/templates/ja-boxing/?utm_source=badge&utm_medium=site'
    }
  )
  assert.deepEqual(await moved(a, '/design-inspiration?open=ja-gone&utm_campaign=x'), {
    status: 301,
    to: '/templates/?utm_campaign=x'
  })
  assert.deepEqual(await moved(a, '/design-inspiration?open=../evil'), { status: 301, to: '/templates/' })
})

test('/design-inspiration/<id> deep links follow the same rule', async () => {
  const a = app([FRESCO])
  assert.deepEqual(await moved(a, '/design-inspiration/ja-fresco'), {
    status: 301,
    to: '/templates/ja-fresco/'
  })
  assert.deepEqual(await moved(a, '/design-inspiration/ja-fresco/?utm_source=x'), {
    status: 301,
    to: '/templates/ja-fresco/?utm_source=x'
  })
  assert.deepEqual(await moved(a, '/design-inspiration/ja-gone'), { status: 301, to: '/templates/' })
  assert.deepEqual(await moved(a, '/design-inspiration/some/deeper/path'), { status: 301, to: '/templates/' })
})

test('the doors under /design-inspiration/api/ and the page files are not redirected', async () => {
  const a = app([FRESCO])
  const door = await get(a, '/design-inspiration/api/none/choose')
  assert.equal(door.status, 404)
  assert.equal(door.headers.get('location'), null)
  assert.deepEqual(await door.json(), { code: 'NO_SUCH_DOOR' })
  const read = await get(a, '/design-inspiration/api/read?url=https://example.com')
  assert.notEqual(read.status, 301)
  assert.equal(read.headers.get('location'), null)
  // A file path answers as before (404 here: nothing is built into this test), never a redirect.
  const file = await get(a, '/design-inspiration/assets/index.js?open=ja-fresco')
  assert.equal(file.status, 404)
  assert.equal(file.headers.get('location'), null)
})

// Ticket 4: sitemap and robots.
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])

test('the sitemap lists the gallery and every template page, and no platform address', async () => {
  const res = await get(app([FRESCO, BOXING, EMDASH]), '/sitemap.xml')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /xml/)
  assert.deepEqual(locs(await res.text()), [
    `${ORIGIN}/templates/`,
    `${ORIGIN}/templates/ja-fresco/`,
    `${ORIGIN}/templates/ja-boxing/`,
    `${ORIGIN}/templates/tracy-base/`
  ])
})

test('the sitemap follows the source without a restart', async () => {
  const list = [BOXING]
  const a = app(list)
  assert.deepEqual(locs(await (await get(a, '/sitemap.xml')).text()), [
    `${ORIGIN}/templates/`,
    `${ORIGIN}/templates/ja-boxing/`
  ])
  list.push(FRESCO)
  const after = locs(await (await get(a, '/sitemap.xml')).text())
  assert.ok(after.includes(`${ORIGIN}/templates/ja-fresco/`))
  assert.ok(!after.some((u) => /\/templates\/(wordpress|joomla|emdash)\//.test(u)))
  list.splice(0, list.length)
  assert.deepEqual(locs(await (await get(a, '/sitemap.xml')).text()), [`${ORIGIN}/templates/`])
})

test('robots.txt allows /templates/ and names the sitemap, and opens no signed-in area', async () => {
  const res = await get(app([FRESCO]), '/robots.txt')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /text\/plain/)
  const body = await res.text()
  assert.match(body, /^Allow: \/templates\/$/m)
  assert.ok(body.includes(`Sitemap: ${ORIGIN}/templates/sitemap.xml`))
  assert.doesNotMatch(body, /Allow: \/(?!templates\/)/)
})

// Off production: dev and laptops must not duplicate production in search results.
const devGet = (list, path) => app(list, DEV_ORIGIN).request(`${DEV_ORIGIN}${path}`, { redirect: 'manual' })

test('production Templates pages and sitemap carry no noindex signal', async () => {
  for (const path of ['/templates/', '/templates/ja-fresco/', '/sitemap.xml']) {
    const res = await get(app([FRESCO]), path)
    assert.equal(res.status, 200, path)
    assert.equal(res.headers.get('x-robots-tag'), null, path)
    if (path !== '/sitemap.xml') assert.doesNotMatch(await res.text(), /name="robots"/, path)
  }
})

test('off production robots.txt disallows everything and names no sitemap', async () => {
  const res = await devGet([FRESCO], '/robots.txt')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'User-agent: *\nDisallow: /\n')
})

test('off production every Templates page and the sitemap say noindex in header and meta', async () => {
  for (const path of ['/templates/', '/templates/ja-fresco/', '/templates/ja-nope/']) {
    const res = await devGet([FRESCO], path)
    assert.equal(res.headers.get('x-robots-tag'), 'noindex', path)
    const html = await res.text()
    assert.equal((html.match(/<meta name="robots" content="noindex">/g) ?? []).length, 1, path)
  }
  const redirect = await devGet([FRESCO], '/templates')
  assert.equal(redirect.status, 301)
  assert.equal(redirect.headers.get('x-robots-tag'), 'noindex')
  const sitemap = await devGet([FRESCO], '/sitemap.xml')
  assert.equal(sitemap.status, 200)
  assert.equal(sitemap.headers.get('x-robots-tag'), 'noindex')
})

test('only the exact production origin is indexable', async () => {
  for (const origin of [
    'http://cowork.tracy.ai',
    'https://cowork.tracy.ai.evil.test',
    'http://localhost:51795'
  ]) {
    const res = await app([FRESCO], origin).request(`${origin}/robots.txt`)
    assert.equal(await res.text(), 'User-agent: *\nDisallow: /\n', origin)
  }
})

// Thumbnails: a landscape frame always shows a desktop first screen, through the thumbnail door.
const PHONE = {
  ...card('ja-vital', 'JA Vital'),
  card: {
    ...card('ja-vital', 'JA Vital').card,
    image: shots('ja-vital', 'home').mobile
  }
}
const NO_DESKTOP = {
  ...card('ja-trip', 'JA Trip'),
  card: {
    blurb: 'A trip site.',
    category: 'Travel',
    image: shots('ja-trip', 'home').mobile,
    layouts: [
      { key: 'home', label: 'Home', shots: { desktop: null, mobile: shots('ja-trip', 'home').mobile } }
    ]
  }
}

test('a phone card image with a desktop home layout shows the desktop thumb with w= and ?v= kept', async () => {
  const a = app([PHONE, FRESCO])
  const gallery = await (await get(a, '/templates/')).text()
  const desk = 'https://cowork.tracy.ai/api/templates/ja-vital/shots/ja-vital-home-1440.png'
  assert.ok(gallery.includes(`src="${desk}?v=1&amp;w=720"`))
  assert.ok(gallery.includes(`${desk}?v=1&amp;w=360 360w`))
  assert.ok(gallery.includes('sizes='))
  assert.ok(!gallery.includes('ja-vital-home-390'))
  const page = await (await get(a, '/templates/ja-vital/')).text()
  assert.ok(page.includes(`<meta property="og:image" content="${desk}?v=1&amp;w=960">`))
  assert.ok(page.includes(`${desk}?v=1&amp;w=960`))
  assert.ok(!page.includes('ja-vital-home-390'), 'no phone shot is loaded on the page')
})

test('no desktop shot anywhere: the placeholder, never the phone shot', async () => {
  const html = await (await get(app([NO_DESKTOP]), '/templates/')).text()
  assert.ok(html.includes('class="noshot"'))
  assert.ok(!/class="tshot"><img/.test(html))
  const page = await (await get(app([NO_DESKTOP]), '/templates/ja-trip/')).text()
  assert.doesNotMatch(page, /og:image/)
  assert.doesNotMatch(page, /<div class="hero-shot"><img/)
})

test('the header is the tracy.ai bar with the new menu: Free Templates, Help Center and Get Started', async () => {
  for (const path of ['/templates/', '/templates/ja-fresco/']) {
    const html = await (await get(app([FRESCO, BOXING]), path)).text()
    const nav = html.match(/<nav class="top"[\s\S]*?<\/nav>/)[0].replace(/<svg[\s\S]*?<\/svg>/g, '')
    const links = [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => [m[1], m[2]])
    assert.deepEqual(
      links.filter(([, text]) => text),
      [
        ['/templates/', 'Free Templates'],
        ['https://tracy.ai/help/', 'Help Center'],
        [`${ORIGIN}/`, 'Get Started'],
        [`${ORIGIN}/`, 'Get Started']
      ],
      'menu, then the call to action in the phone panel and in the bar'
    )
    assert.doesNotMatch(nav, /Start free|Download|nav-dl/)
    assert.match(nav, /<a class="here" href="\/templates\/">Free Templates<\/a>/)
    assert.ok(
      nav.includes('<a class="brand" href="https://tracy.ai/"><img src="https://tracy.ai/assets/logo.png"')
    )
    assert.ok(nav.includes('id="navtoggle"'), 'the phone menu button')
    assert.doesNotMatch(nav, /What&#39;s new|What's new|whats-new/)
  }
})

test('the footer carries the tracy.ai columns; library links stay here, the rest go to tracy.ai', async () => {
  const html = await (await get(app([FRESCO]), '/templates/')).text()
  const foot = html.match(/<footer>[\s\S]*<\/footer>/)[0]
  const hrefs = [...foot.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(hrefs, [
    'https://tracy.ai/',
    '/templates/',
    'https://tracy.ai/download/',
    'https://cowork.tracy.ai/',
    'https://tracy.ai/help/',
    'https://github.com/TracyHQ/tracy',
    'https://discord.gg/BM9TMRcEBb',
    'https://www.youtube.com/@tracydotai',
    'https://x.com/tracydotai',
    'https://tracy.ai/privacy/',
    'https://tracy.ai/terms/'
  ])
  for (const heading of ['Product', 'Community', 'Legal']) assert.ok(foot.includes(`<h3>${heading}</h3>`))
  assert.match(foot, /Free Templates<\/a>/)
  assert.match(foot, /Claude Design, but for CMS\./)
  assert.match(foot, /© \d{4} Tracy/)
  assert.doesNotMatch(
    foot,
    /foot-socials|how-it-works|why-tracy|Resources/,
    'no social icon row, no retired pages'
  )
  assert.equal(
    [...foot.matchAll(/target="_blank" rel="noopener"/g)].length,
    4,
    'community links open a new tab'
  )
  const brand = foot.match(/<div class="foot-brand">[\s\S]*?<\/div>/)[0]
  assert.doesNotMatch(brand, /themetoggle|langpick/, 'toggle and picker moved to the bottom row')
  const bottom = foot.match(/<div class="wrap foot-bottom">[\s\S]*<\/footer>/)[0]
  assert.ok(bottom.includes('id="themetoggle"') && bottom.includes('id="langpick"'))
  assert.ok(
    bottom.indexOf('Tracy</span>') < bottom.indexOf('id="themetoggle"'),
    'copyright left, tools right'
  )
})

test('Help, Privacy and Terms follow the page language where the landing site has pages for it', async () => {
  const a = app([FRESCO])
  for (const lang of ['de', 'fr', 'es', 'it', 'nl']) {
    const html = await (await getAs(a, '/templates/', { cookie: `tracy_lang=${lang}` })).text()
    const nav = html.match(/<nav class="top"[\s\S]*?<\/nav>/)[0]
    const foot = html.match(/<footer>[\s\S]*<\/footer>/)[0]
    assert.ok(nav.includes(`href="https://tracy.ai/${lang}/help/"`), `${lang} nav help`)
    for (const page of ['help', 'privacy', 'terms'])
      assert.ok(foot.includes(`href="https://tracy.ai/${lang}/${page}/"`), `${lang} footer ${page}`)
    assert.doesNotMatch(foot, /href="https:\/\/tracy\.ai\/(help|privacy|terms)\/"/)
  }
  for (const lang of ['vi', 'zh']) {
    const html = await (await getAs(a, '/templates/', { cookie: `tracy_lang=${lang}` })).text()
    for (const page of ['help', 'privacy', 'terms'])
      assert.ok(html.includes(`href="https://tracy.ai/${page}/"`), `${lang} uses the English ${page}`)
  }
})

test('the footer theme toggle is present, wired to data-theme and tracy-theme, with a no-flash boot', async () => {
  const html = await (await get(app([FRESCO]), '/templates/')).text()
  assert.match(
    html,
    /<button class="themetoggle" type="button" id="themetoggle" aria-pressed="false" aria-label="Switch to the dark theme"/
  )
  const boot = html.indexOf('localStorage.getItem("tracy-theme")')
  assert.ok(boot > 0 && boot < html.indexOf('<style>'), 'the saved theme is read before the styles paint')
  assert.ok(
    html.includes('root.setAttribute("data-theme",next)') &&
      html.includes('localStorage.setItem("tracy-theme",next)')
  )
  assert.match(html, /try\{localStorage\.setItem/)
  assert.ok(html.includes(':root[data-theme="dark"]{'), 'dark tokens follow data-theme')
  assert.ok(
    html.includes('@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){'),
    'and the system setting'
  )
})

test('the page paints the tracy.ai background layers and stops the drift for reduced motion', async () => {
  const html = await (await get(app([FRESCO]), '/templates/')).text()
  assert.ok(
    html.includes('https://tracy.ai/assets/bg.jpg') && html.includes('https://tracy.ai/assets/bg-dark.jpg')
  )
  for (const part of [
    'body::before{',
    'html::before{',
    'body::after{',
    '@keyframes bgdrift',
    '@keyframes glowdrift'
  ])
    assert.ok(html.includes(part), part)
  assert.match(html, /@media \(prefers-reduced-motion:reduce\)\{body::before,html::before\{animation:none\}/)
})

test('no visible Templates page copy holds an em or an en dash', async () => {
  for (const path of ['/templates/', '/templates/ja-fresco/', '/templates/nope/']) {
    const html = await (await get(app([FRESCO]), path)).text()
    const visible = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ')
    assert.doesNotMatch(visible, /[\u2013\u2014]/, path)
  }
})

test('the policy lets only the page inline scripts run, by hash, and the hashes match the page', async () => {
  const res = await get(app([FRESCO]), '/templates/')
  const html = await res.text()
  const policy = res.headers.get('content-security-policy')
  const allowed = policy.match(/script-src ([^;]+)/)[1].split(' ')
  assert.equal(allowed.length, 3, 'theme boot, chrome, gallery filter')
  const { createHash } = await import('node:crypto')
  const bodies = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.equal(bodies.length, 3)
  for (const body of bodies)
    assert.ok(allowed.includes(`'sha256-${createHash('sha256').update(body).digest('base64')}'`))
})

// The live preview (Akemi, 26/10/2026: "like the Open preview in Tracy Cowork, where you can
// interact"): the demo framed with a chip per page, in place of the screenshot walls.
const previewOf = (html) => html.match(/<section class="pv"[\s\S]*?<\/section>/)?.[0] ?? ''

test('a template with a demo shows one live preview: a device switch, no page chips and no new tab link', async () => {
  const html = await (await get(app([FRESCO]), '/templates/ja-fresco/')).text()
  const pv = previewOf(html)
  assert.ok(pv, 'the preview block is there')
  assert.ok(
    pv.includes(`data-probe="${ORIGIN}/api/templates/ja-fresco/demo-frame"`),
    'it asks the probe first'
  )
  assert.match(
    pv,
    /data-sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"/
  )
  assert.doesNotMatch(pv, /pv-tab|pv-tabs/, 'no page chips')
  assert.match(pv, /data-device="desktop"/)
  assert.match(pv, /data-device="phone"/)
  assert.doesNotMatch(html, /Open in new tab|pv-open/, 'no new tab link in the toolbar')
  assert.doesNotMatch(html, /Then ask Tracy in Chat/, 'the how-it-works line under the CTA is gone')
  assert.equal((html.match(/class="pv"/g) ?? []).length, 1, 'one preview, not one per layout')
})

test('before any script the preview is the desktop home shot through the thumbnail door, with a link to the demo', async () => {
  const pv = previewOf(await (await get(app([FRESCO]), '/templates/ja-fresco/')).text())
  const desk = `${ORIGIN}/api/templates/ja-fresco/shots/ja-fresco-home-1440.png`
  assert.match(
    pv,
    new RegExp(`<div class="pv-poster"><img src="${desk.replace(/[.?/]/g, '\\$&')}\\?v=1&amp;w=960"`)
  )
  assert.match(pv, /alt="JA Fresco home page on desktop"/)
  assert.doesNotMatch(pv, /<iframe/, 'no frame is in the answer: the script mounts it after the probe')
  assert.match(
    pv,
    /class="pv-start btn btn-primary" href="https:\/\/ja-fresco-wordpress\.tracy\.ai\/" target="_blank"/
  )
})

test('the screenshot walls are gone: no Layouts grid, no On mobile grid, no phone shot', async () => {
  const html = await (await get(app([FRESCO]), '/templates/ja-fresco/')).text()
  assert.doesNotMatch(html, /<h2>Layouts<\/h2>/)
  assert.doesNotMatch(html, /On mobile/)
  assert.doesNotMatch(html, /-390\.png/)
  assert.doesNotMatch(html, /class="hero-shot"/, 'the preview takes the hero picture place')
})

test('the template page policy may frame only its own demo and ask only its probe, and runs the preview script by hash', async () => {
  const res = await get(app([FRESCO]), '/templates/ja-fresco/')
  const html = await res.text()
  const policy = res.headers.get('content-security-policy')
  assert.match(policy, /(?:^|; )frame-src https:\/\/ja-fresco-wordpress\.tracy\.ai(?:;|$)/)
  assert.match(policy, /(?:^|; )connect-src https:\/\/cowork\.tracy\.ai(?:;|$)/)
  assert.match(policy, /default-src 'none'/)
  assert.match(policy, /frame-ancestors 'none'/)
  const allowed = policy.match(/script-src ([^;]+)/)[1].split(' ')
  const { createHash } = await import('node:crypto')
  const bodies = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.equal(bodies.length, 3, 'theme boot, chrome toggles and the preview')
  assert.equal(allowed.length, 3)
  for (const body of bodies)
    assert.ok(allowed.includes(`'sha256-${createHash('sha256').update(body).digest('base64')}'`))
})

test('a template with no demo, or a demo with no probe, shows its picture and no preview controls', async () => {
  const noProbe = card('ja-noprobe', 'JA No Probe', {
    demo: { url: 'https://ja-noprobe-wordpress.tracy.ai/' }
  })
  for (const [t, path] of [
    [BOXING, '/templates/ja-boxing/'],
    [card('ja-nodemo', 'JA No Demo', { demo: null }), '/templates/ja-nodemo/'],
    [noProbe, '/templates/ja-noprobe/']
  ]) {
    const res = await get(app([t]), path)
    const html = await res.text()
    assert.doesNotMatch(html, /class="pv[ "-]/, `${path}: no preview block`)
    assert.doesNotMatch(html, /data-device=/, `${path}: no device switch`)
    assert.match(html, /class="hero-shot"/, `${path}: the static picture or placeholder`)
    const policy = res.headers.get('content-security-policy')
    assert.doesNotMatch(policy, /frame-src|connect-src/, `${path}: nothing to frame, nothing to ask`)
    assert.equal(policy.match(/script-src ([^;]+)/)[1].split(' ').length, 2, `${path}: no preview script`)
  }
})

test('a demo or probe that is not an http(s) address is never framed', async () => {
  const bad = card('ja-bad', 'JA Bad', {
    demo: { url: 'javascript:alert(1)', probe: `${ORIGIN}/api/templates/ja-bad/demo-frame` }
  })
  const res = await get(app([bad]), '/templates/ja-bad/')
  const html = await res.text()
  assert.doesNotMatch(html, /class="pv"/)
  assert.doesNotMatch(html, /javascript:/)
  assert.doesNotMatch(res.headers.get('content-security-policy'), /frame-src/)
})

test('the call to action: a label and one equal button per CMS, or one plain button for a single CMS', async () => {
  const two = await (await get(app([FRESCO, BOXING]), '/templates/ja-fresco/')).text()
  const row = two.match(/<div class="cta-row">([\s\S]*?)<\/div>/)?.[1] ?? ''
  assert.match(two, /<p class="cta-label">Use this template on<\/p>/)
  assert.equal(
    [...row.matchAll(/<a class="btn btn-primary"[^>]*><svg class="ico"[^>]*aria-hidden="true"/g)].length,
    2,
    'each CMS button has an svg'
  )
  const links = [
    ...row.matchAll(/<a class="btn btn-primary" href="([^"]+)">(?:<svg[\s\S]*?<\/svg>)?([^<]+)<\/a>/g)
  ].map((m) => [m[2], m[1]])
  assert.deepEqual(
    links.map((l) => l[0]),
    ['WordPress', 'Joomla']
  )
  for (const [cms, href] of links) {
    const u = new URL(href.replaceAll('&amp;', '&'), ORIGIN)
    assert.equal(u.pathname, '/new/')
    assert.equal(u.searchParams.get('inspiration'), 'ja-fresco')
    assert.equal(u.searchParams.get('platform'), cms.toLowerCase())
  }
  const one = await (await get(app([FRESCO, BOXING]), '/templates/ja-boxing/')).text()
  assert.match(
    one,
    /<div class="cta"><a class="btn btn-primary" href="[^"]+">(?:<svg[\s\S]*?<\/svg>)?Use this template<\/a><\/div>/
  )
  assert.match(
    one,
    /<a class="btn btn-primary"[^>]*><svg class="ico"[^>]*aria-hidden="true"/,
    'single CMS button has its logo'
  )
  assert.doesNotMatch(one, /<p class="cta-label"/)
})

// The demo's Light | Dark switch (Akemi, 26/10/2026): only for a template with a dark side, it
// drives the demo alone and starts on the template's own default theme.
test('the demo theme switch is present only when the card has a dark side, and starts on its default', async () => {
  const cases = [
    [card('ja-diner', 'JA Diner', { dark: true, defaultTheme: 'dark' }), 'dark'],
    [card('ja-lite', 'JA Lite', { dark: true, defaultTheme: 'light' }), 'light'],
    [card('ja-bare', 'JA Bare', { dark: true }), 'light']
  ]
  for (const [t, start] of cases) {
    const pv = previewOf(await (await get(app([t]), `/templates/${t.id}/`)).text())
    assert.match(pv, /class="pv-dev pv-theme"/, `${t.id}: switch present`)
    assert.match(pv, /data-dark="true"/)
    assert.ok(pv.includes(`data-theme="${start}" aria-pressed="true"`), `${t.id}: starts on ${start}`)
  }
  for (const t of [FRESCO, card('ja-nodark', 'JA No Dark', { dark: false, defaultTheme: 'dark' })]) {
    const pv = previewOf(await (await get(app([t]), `/templates/${t.id}/`)).text())
    assert.ok(pv, `${t.id}: preview is there`)
    assert.doesNotMatch(pv, /pv-theme/, `${t.id}: no switch`)
    assert.match(pv, /data-dark="false"/)
  }
})

test('"View demo site" sits under the CTA with the demo home address, and there is none without a demo', async () => {
  const html = await (await get(app([FRESCO]), '/templates/ja-fresco/')).text()
  const cta =
    html.match(/<div class="cta">[\s\S]*?<\/div>\s*<\/div>|<div class="cta">[\s\S]*?<\/a><\/div>/)?.[0] ?? ''
  assert.match(
    cta,
    /<a class="btn btn-ghost" id="pv-demo" href="https:\/\/ja-fresco-wordpress\.tracy\.ai\/" data-base="[^"]+" target="_blank" rel="noopener"><svg class="ico"[^>]*aria-hidden="true"[\s\S]*?<\/svg>View demo site<svg/
  )
  assert.ok(cta.indexOf('Use this template') < cta.indexOf('View demo site'), 'under the CTA')
  const dark = await (
    await get(
      app([card('ja-diner', 'JA Diner', { dark: true, defaultTheme: 'dark' })]),
      '/templates/ja-diner/'
    )
  ).text()
  assert.match(dark, /id="pv-demo" href="https:\/\/ja-diner-wordpress\.tracy\.ai\/\?theme=dark"/)
  for (const t of [BOXING, card('ja-nodemo', 'JA No Demo', { demo: null })]) {
    const page = await (await get(app([t]), `/templates/${t.id}/`)).text()
    assert.doesNotMatch(page, /View demo site|pv-demo/, `${t.id}: no demo, no button`)
  }
})

test('the platform tags on the cards are icon only, named by title and aria-label', async () => {
  const page = await (await get(app([FRESCO, BOXING]), '/templates/')).text()
  const tags = [...page.matchAll(/<span class="badge"([^>]*)>([\s\S]*?)<\/span>/g)]
  assert.ok(tags.length > 0)
  for (const [, attrs, inner] of tags) {
    assert.match(inner, /^<svg class="ico"[^>]*aria-hidden="true"[\s\S]*<\/svg>$/, 'each tag has its svg')
    const name = attrs.match(/aria-label="([^"]+)"/)?.[1]
    assert.ok(name, 'each tag has an accessible name')
    assert.ok(attrs.includes(`title="${name}"`), 'the name also shows on hover')
    assert.ok(
      !/(WordPress|Joomla|EmDash)/.test(inner.replace(/<svg[\s\S]*?<\/svg>/g, '')),
      'no visible platform word'
    )
  }
})

// AI readers: everything a visitor sees is also plain text and structured data in the raw HTML.
const textOf = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const ldOf = async (path, type) => {
  const html = await (await get(app([FRESCO, BOXING]), path)).text()
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .find((v) => v['@type'] === type)
}

test('the detail page does not show the demo pages as a visible line', async () => {
  const html = await (await get(app([FRESCO]), '/templates/ja-fresco/')).text()
  assert.doesNotMatch(textOf(html), /Demo pages:/)
  assert.ok(!html.includes('class="dpages"'))
})

test('each gallery card carries its industry as visible text', async () => {
  const html = await (await get(app([FRESCO, BOXING]), '/templates/')).text()
  const cards = [...html.matchAll(/<a class="tcard"[\s\S]*?<\/a>/g)].map((m) => m[0])
  assert.equal(cards.length, 2)
  for (const c of cards) {
    const industry = c.match(/data-industry="([^"]*)"/)[1]
    assert.ok(industry)
    assert.match(c, new RegExp(`<span class="tind">${industry}</span>`))
  }
})

test('the detail JSON-LD describes the template for machines', async () => {
  const ld = await ldOf('/templates/ja-fresco/', 'CreativeWork')
  assert.equal(ld.url, `${ORIGIN}/templates/ja-fresco/`)
  assert.equal(ld.description, FRESCO.card.blurb)
  assert.match(ld.image, /ja-fresco-home-1440\.png/)
  assert.equal(ld.genre, industryOf(FRESCO))
  assert.equal(ld.keywords, `WordPress, Joomla, ${industryOf(FRESCO)}`)
  assert.equal(ld.provider.name, 'JoomlArt')
  assert.equal(ld.creator.name, 'JoomlArt')
  assert.equal(ld.workExample.url, 'https://ja-fresco-wordpress.tracy.ai/')
  assert.deepEqual(
    ld.hasPart.map((p) => [p.name, p.url]),
    [
      ['Home', 'https://ja-fresco-wordpress.tracy.ai/'],
      ['Menu', 'https://ja-fresco-wordpress.tracy.ai/index.php/menu']
    ]
  )
})

test('the gallery ItemList items carry description, CMS and industry', async () => {
  const list = await ldOf('/templates/', 'ItemList')
  const item = list.itemListElement[0]
  assert.equal(item.description, FRESCO.card.blurb)
  assert.equal(item.keywords, `WordPress, Joomla, ${industryOf(FRESCO)}`)
  assert.ok(item.url && item.name && item.image)
})

test('/llms.txt is plain text, needs no sign-in and lists every template', async () => {
  const res = await get(app([FRESCO, BOXING]), '/llms.txt')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /^text\/plain; charset=utf-8/)
  assert.equal(res.headers.get('x-robots-tag'), null)
  const body = await res.text()
  assert.match(body, /^# Tracy Templates\n/)
  assert.ok(body.includes(`- [JA Fresco](${ORIGIN}/templates/ja-fresco/): `))
  assert.ok(body.includes(`CMS: WordPress, Joomla. Industry: ${industryOf(FRESCO)}.`))
  assert.ok(
    body.includes(
      `- [JA Boxing](${ORIGIN}/templates/ja-boxing/): A boxing studio website. CMS: Joomla. Industry: Sports & Fitness.`
    )
  )
  const off = await devGet([FRESCO], '/llms.txt')
  assert.equal(off.status, 200)
  assert.equal(off.headers.get('x-robots-tag'), 'noindex')
})

test('the header has no Changelog item until the Changelog page exists', async () => {
  const html = await (await get(app([FRESCO]), '/templates/')).text()
  assert.doesNotMatch(html, /changelog/i)
})

// Served under https://tracy.ai by its Cloudflare Worker: the pages state tracy.ai, the app's links stay
// on cowork. The Worker's subrequest carries `CF-Worker: tracy.ai`; `viaWorker` asks the way it does.
const PUBLIC = 'https://tracy.ai'
const proxied = (list, extra = {}) =>
  app(list, extra.origin ?? ORIGIN, { templatesPublicOrigin: PUBLIC, ...extra })
const viaWorker = (a, path, headers = {}) =>
  a.request(`${ORIGIN}${path}`, { redirect: 'manual', headers: { 'cf-worker': 'tracy.ai', ...headers } })

test('with TEMPLATES_PUBLIC_ORIGIN the canonical, JSON-LD, sitemap, robots and llms.txt use it', async () => {
  const a = proxied([FRESCO, BOXING])
  const html = await (await viaWorker(a, '/templates/ja-fresco/')).text()
  assert.ok(html.includes(`<link rel="canonical" href="${PUBLIC}/templates/ja-fresco/">`))
  assert.ok(html.includes(`<meta property="og:url" content="${PUBLIC}/templates/ja-fresco/">`))
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]
  )
  assert.ok(lds.length > 0 && lds.every((t) => !t.includes('cowork.tracy.ai/templates')))
  assert.ok(lds.join('').includes(`${PUBLIC}/templates/ja-fresco/`))
  const gallery = await (await viaWorker(a, '/templates/')).text()
  assert.ok(gallery.includes(`<link rel="canonical" href="${PUBLIC}/templates/">`))
  assert.ok(gallery.includes(`"url":"${PUBLIC}/templates/ja-fresco/"`))
  assert.deepEqual(locs(await (await viaWorker(a, '/sitemap.xml')).text()), [
    `${PUBLIC}/templates/`,
    `${PUBLIC}/templates/ja-fresco/`,
    `${PUBLIC}/templates/ja-boxing/`
  ])
  assert.ok(
    (await (await viaWorker(a, '/robots.txt')).text()).includes(`Sitemap: ${PUBLIC}/templates/sitemap.xml`)
  )
  const llms = await (await viaWorker(a, '/llms.txt')).text()
  assert.ok(llms.includes(`(${PUBLIC}/templates/ja-fresco/)`) && !llms.includes('cowork.tracy.ai/templates'))
})

test('under another public origin the app links stay absolute on the app origin and page links stay relative', async () => {
  const a = proxied([FRESCO, BOXING])
  for (const path of ['/templates/ja-fresco/', '/templates/']) {
    const html = await (await viaWorker(a, path)).text()
    assert.ok(html.includes(`href="${ORIGIN}/"`), 'Get Started')
    assert.doesNotMatch(html, /href="\/new\//, 'no relative build link')
    assert.doesNotMatch(html, new RegExp(`<a [^>]*href="${PUBLIC}/templates`), 'no absolute page link')
    assert.match(html, /<a class="tcard" href="\/templates\/ja-/)
  }
  const detail = await (await viaWorker(a, '/templates/ja-fresco/')).text()
  assert.ok(detail.includes(`href="${ORIGIN}/new/?inspiration=ja-fresco&amp;platform=wordpress"`))
  assert.ok(detail.includes(`data-probe="${ORIGIN}/api/templates/ja-fresco/demo-frame"`))
  assert.match(detail, /<img src="https:\/\/cowork\.tracy\.ai\/api\/templates\//)
  const lost = await (await viaWorker(a, '/templates/nope/')).text()
  assert.ok(lost.includes(`href="${ORIGIN}/"`))
})

test('indexing needs the production deployment and a cowork.tracy.ai or tracy.ai public origin', async () => {
  const noindex = async (a, worker = 'tracy.ai') =>
    (await viaWorker(a, '/templates/', { 'cf-worker': worker })).headers.get('x-robots-tag')
  assert.equal(await noindex(proxied([FRESCO])), null, 'production with the tracy.ai public origin')
  assert.equal(await noindex(app([FRESCO])), null, 'production by default')
  assert.equal(
    await noindex(proxied([FRESCO], { templatesPublicOrigin: ORIGIN })),
    null,
    'production, public origin cowork'
  )
  assert.equal(
    await noindex(proxied([FRESCO], { templatesPublicOrigin: 'https://example.com' }), 'example.com'),
    'noindex'
  )
  assert.equal(
    await noindex(proxied([FRESCO], { origin: DEV_ORIGIN })),
    'noindex',
    'dev stays noindex even with the tracy.ai public origin'
  )
  const dev = await (
    await viaWorker(proxied([FRESCO], { origin: DEV_ORIGIN }), '/templates/ja-fresco/')
  ).text()
  assert.match(dev, /<meta name="robots" content="noindex">/)
})

// Production serves the Templates pages at https://tracy.ai through the landing site's Worker.
const { readConfig } = await import('../src/config.js')
const ENV = {
  SITE_DOMAIN: 'tracy.ai',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://127.0.0.1:8090',
  HOST_local_DSH_ORIGIN: 'http://127.0.0.1:51790',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const publicOriginFor = (env) => readConfig({ ...ENV, ...env }).templatesPublicOrigin

test('the production deployment states https://tracy.ai by default; an explicit setting wins; dev keeps its own', () => {
  assert.equal(publicOriginFor({ TRACY_ORIGIN: ORIGIN }), PUBLIC)
  assert.equal(publicOriginFor({ TRACY_ORIGIN: `${ORIGIN}/` }), PUBLIC)
  assert.equal(publicOriginFor({ TRACY_ORIGIN: ORIGIN, TEMPLATES_PUBLIC_ORIGIN: ORIGIN }), ORIGIN)
  assert.equal(publicOriginFor({ TRACY_ORIGIN: DEV_ORIGIN, SITE_DOMAIN: 'tracy.site' }), DEV_ORIGIN)
  assert.equal(publicOriginFor({ TRACY_ORIGIN: 'http://localhost:8080' }), 'http://localhost:8080')
})

test('production by default: canonical, JSON-LD, sitemap, robots and llms.txt state tracy.ai and stay indexable', async () => {
  const a = app([FRESCO, BOXING], ORIGIN, {
    templatesPublicOrigin: publicOriginFor({ TRACY_ORIGIN: ORIGIN })
  })
  const page = await viaWorker(a, '/templates/ja-fresco/')
  assert.equal(page.status, 200)
  assert.equal(page.headers.get('x-robots-tag'), null)
  assert.match(page.headers.get('vary'), /CF-Worker/)
  const html = await page.text()
  assert.equal(canonicalOf(html), `${PUBLIC}/templates/ja-fresco/`)
  assert.ok(allLd(html).join('').includes(`${PUBLIC}/templates/ja-fresco/`))
  assert.doesNotMatch(html, /<meta name="robots"/)
  const robots = await (await get(a, '/robots.txt')).text()
  assert.match(robots, /^Allow: \/templates\/$/m)
  assert.ok(robots.includes(`Sitemap: ${PUBLIC}/templates/sitemap.xml`))
  assert.equal(locs(await (await get(a, '/sitemap.xml')).text())[0], `${PUBLIC}/templates/`)
  assert.ok((await (await get(a, '/llms.txt')).text()).includes(`(${PUBLIC}/templates/ja-fresco/)`))
})

test('production: a direct visit to a Templates address answers 301 to the same path and query on tracy.ai', async () => {
  const a = proxied([FRESCO])
  for (const [path, to] of [
    ['/templates/', `${PUBLIC}/templates/`],
    ['/templates', `${PUBLIC}/templates`],
    ['/templates/ja-fresco/?utm_source=x&a=1', `${PUBLIC}/templates/ja-fresco/?utm_source=x&a=1`],
    ['/templates/nope/', `${PUBLIC}/templates/nope/`],
    ['/templates/sitemap.xml', `${PUBLIC}/templates/sitemap.xml`],
    ['/templates/llms.txt', `${PUBLIC}/templates/llms.txt`]
  ]) {
    const res = await get(a, path)
    assert.equal(res.status, 301, path)
    assert.equal(res.headers.get('location'), to, path)
    assert.equal(res.headers.get('cache-control'), 'no-store', 'a cached 301 must never reach the Worker')
    assert.match(res.headers.get('vary'), /CF-Worker/)
  }
  const head = await a.request(`${ORIGIN}/templates/ja-fresco/`, { method: 'HEAD', redirect: 'manual' })
  assert.equal(head.status, 301)
  // Another Worker, or none, is a direct visit; the root discovery files stay on cowork.
  assert.equal((await viaWorker(a, '/templates/', { 'cf-worker': 'evil.example' })).status, 301)
  for (const path of ['/sitemap.xml', '/llms.txt', '/robots.txt'])
    assert.equal((await get(a, path)).status, 200, path)
})

test('production: the tracy.ai Worker subrequest gets the page itself, any letter case', async () => {
  const a = proxied([FRESCO])
  for (const worker of ['tracy.ai', 'Tracy.AI']) {
    const res = await viaWorker(a, '/templates/ja-fresco/', { 'cf-worker': worker })
    assert.equal(res.status, 200)
    assert.match(await res.text(), /JA Fresco/)
  }
  // The slash rule still answers, relative, so the Worker's own redirect stays on tracy.ai.
  const bare = await viaWorker(a, '/templates/ja-fresco')
  assert.equal(bare.status, 301)
  assert.equal(bare.headers.get('location'), '/templates/ja-fresco/')
})

test('the old Design inspiration addresses land on tracy.ai in one hop; its doors and files stay here', async () => {
  const a = proxied([FRESCO])
  const one = await get(a, '/design-inspiration?open=ja-fresco&utm_source=x')
  assert.equal(one.status, 301)
  assert.equal(one.headers.get('location'), `${PUBLIC}/templates/ja-fresco/?utm_source=x`)
  assert.equal((await get(a, '/design-inspiration/')).headers.get('location'), `${PUBLIC}/templates/`)
  const door = await get(a, '/design-inspiration/api/none/choose')
  assert.equal(door.status, 404)
  assert.equal((await door.json()).code, 'NO_SUCH_DOOR')
  // Off production nothing moves to another host.
  const dev = await app([FRESCO], DEV_ORIGIN).request(`${DEV_ORIGIN}/design-inspiration?open=ja-fresco`, {
    redirect: 'manual'
  })
  assert.equal(dev.headers.get('location'), '/templates/ja-fresco/')
})

test('dev is unaffected: no redirect, its own canonical, sitemap and llms.txt under /templates/', async () => {
  const a = app([FRESCO, BOXING], DEV_ORIGIN, {
    templatesPublicOrigin: publicOriginFor({ TRACY_ORIGIN: DEV_ORIGIN, SITE_DOMAIN: 'tracy.site' })
  })
  const at = (path) => a.request(`${DEV_ORIGIN}${path}`, { redirect: 'manual' })
  const page = await at('/templates/')
  assert.equal(page.status, 200)
  assert.equal(canonicalOf(await page.text()), `${DEV_ORIGIN}/templates/`)
  const sitemap = await at('/templates/sitemap.xml')
  assert.equal(sitemap.status, 200)
  assert.match(sitemap.headers.get('content-type'), /application\/xml/)
  assert.equal(locs(await sitemap.text())[1], `${DEV_ORIGIN}/templates/ja-fresco/`)
  const llms = await at('/templates/llms.txt')
  assert.equal(llms.status, 200)
  assert.match(llms.headers.get('content-type'), /text\/plain/)
  assert.ok((await llms.text()).includes(`(${DEV_ORIGIN}/templates/ja-fresco/)`))
})

test('production: /templates/sitemap.xml and /templates/llms.txt through the Worker list tracy.ai addresses', async () => {
  const a = proxied([FRESCO, BOXING])
  const sitemap = await viaWorker(a, '/templates/sitemap.xml')
  assert.equal(sitemap.status, 200)
  assert.deepEqual(locs(await sitemap.text()), [
    `${PUBLIC}/templates/`,
    `${PUBLIC}/templates/ja-fresco/`,
    `${PUBLIC}/templates/ja-boxing/`
  ])
  const llms = await viaWorker(a, '/templates/llms.txt')
  assert.equal(llms.status, 200)
  assert.ok((await llms.text()).includes(`Gallery: ${PUBLIC}/templates/`))
})

// Interface language: the words follow `tracy_lang`, then Accept-Language; the SEO surface stays English.
const getAs = (a, path, headers = {}) => a.request(`${ORIGIN}${path}`, { redirect: 'manual', headers })
const canonicalOf = (html) => html.match(/<link rel="canonical" href="([^"]+)"/)[1]
const allLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => m[1])

test('cookie tracy_lang=vi gives Vietnamese words on the gallery and the detail page, no cookie gives English', async () => {
  const a = app([FRESCO, BOXING])
  const en = await (await get(a, '/templates/')).text()
  assert.match(en, /<html lang="en">/)
  assert.match(en, /<h1>Website templates<\/h1>/)
  const vi = await getAs(a, '/templates/', { cookie: 'tracy_lang=vi' })
  const viHtml = await vi.text()
  assert.match(viHtml, /<html lang="vi">/)
  assert.match(viHtml, /<h1>Template website<\/h1>/)
  assert.match(viHtml, /Tất cả ngành/)
  assert.match(viHtml, /Tạo site|Bắt đầu/)
  assert.doesNotMatch(viHtml, /Website templates/)
  assert.match(vi.headers.get('vary') ?? '', /Cookie/i)
  const detail = await (await getAs(a, '/templates/ja-fresco/', { cookie: 'tracy_lang=vi' })).text()
  assert.match(detail, /Dùng template này trên/)
  assert.match(detail, /Xem site demo/)
  assert.match(detail, /<title>Template JA Fresco cho WordPress và Joomla \| Tracy<\/title>/)
  assert.match(detail, /ảnh|Trang chủ JA Fresco/i)
  assert.match(detail, /<b>Ngành<\/b>/)
  const detailEn = await (await get(a, '/templates/ja-fresco/')).text()
  assert.match(detailEn, /Use this template on/)
  assert.match(detailEn, /<title>JA Fresco template for WordPress and Joomla \| Tracy<\/title>/)
})

test('Accept-Language picks the language when there is no cookie, the cookie wins, English stays English', async () => {
  const a = app([FRESCO])
  const de = await (await getAs(a, '/templates/', { 'accept-language': 'de-DE,de;q=0.9' })).text()
  assert.match(de, /<html lang="de">/)
  assert.match(de, /<h1>Website-Templates<\/h1>/)
  const cookieWins = await (
    await getAs(a, '/templates/', { cookie: 'tracy_lang=fr', 'accept-language': 'de' })
  ).text()
  assert.match(cookieWins, /<html lang="fr">/)
  const en = await (await getAs(a, '/templates/', { 'accept-language': 'en-US,en;q=0.9' })).text()
  assert.match(en, /<h1>Website templates<\/h1>/)
  const unknown = await (await getAs(a, '/templates/', { 'accept-language': 'ja' })).text()
  assert.match(unknown, /<h1>Website templates<\/h1>/)
})

test('the language never changes canonical, JSON-LD, template names or industries', async () => {
  const a = app([FRESCO, BOXING])
  for (const path of ['/templates/', '/templates/ja-fresco/']) {
    const en = await (await get(a, path)).text()
    for (const lang of ['vi', 'de', 'zh']) {
      const html = await (await getAs(a, path, { cookie: `tracy_lang=${lang}` })).text()
      assert.equal(canonicalOf(html), canonicalOf(en))
      assert.deepEqual(allLd(html), allLd(en))
      assert.ok(html.includes(`<span class="tind">${industryOf(BOXING).replace('&', '&amp;')}</span>`))
      assert.match(html, /JA Fresco/)
    }
  }
})

test('the footer has a language switcher listing the eight languages, the current one selected', async () => {
  const a = app([FRESCO])
  const html = await (await getAs(a, '/templates/', { cookie: 'tracy_lang=de' })).text()
  const select = html.match(/<select id="langpick"[^>]*>(.*?)<\/select>/s)[1]
  assert.equal([...select.matchAll(/<option /g)].length, 8)
  assert.match(select, /<option value="de" selected>Deutsch<\/option>/)
  assert.match(select, /<option value="en">English<\/option>/)
})

test('the not-found page and the unreadable-source answer speak the visitor language', async () => {
  const a = app([FRESCO])
  const lost = await getAs(a, '/templates/nope/', { cookie: 'tracy_lang=vi' })
  assert.equal(lost.status, 404)
  assert.match(await lost.text(), /Không tìm thấy template/)
  const broken = buildApp({
    config: {
      sessionSecret: 's'.repeat(32),
      origin: ORIGIN,
      secure: false,
      siteDomain: 'tracy.test',
      siteDomainAliases: [],
      sessionDomain: null
    },
    fetchImpl: async () => {
      throw new Error('no network')
    },
    mail: { send: async () => {} },
    publicTemplates: async () => {
      throw new Error('down')
    }
  })
  const res = await getAs(broken, '/templates/', { cookie: 'tracy_lang=vi' })
  assert.equal(res.status, 503)
  assert.match(await res.text(), /Hiện chưa đọc được/)
})

test('no translated Templates word holds an em or an en dash, and every language has the tpl words', async () => {
  const { readFileSync } = await import('node:fs')
  for (const id of ['vi', 'de', 'it', 'fr', 'nl', 'zh', 'es']) {
    const dict = JSON.parse(
      readFileSync(new URL(`../src/lib/i18n/locales/${id}.json`, import.meta.url), 'utf8')
    )
    for (const [k, v] of Object.entries(dict))
      if (k.startsWith('tpl.')) assert.doesNotMatch(v, /[—–]/, `${id} ${k}`)
    assert.ok(Object.keys(dict).filter((k) => k.startsWith('tpl.')).length > 70)
    if (id === 'vi')
      for (const [k, v] of Object.entries(dict))
        if (k.startsWith('tpl.')) assert.doesNotMatch(v, /\b(chị|anh)\b/i, k)
  }
})
