// Every link that comes from DATA goes through the link gate (PAGE-4): a slide, a button, a card, a category, a Portable Text
// link. The rich-text half (`src/lib/data-links.ts`) runs here; the components are held at the SOURCE, since no Astro
// renderer runs in this package's node tests (the rendered pages are walked in the end-to-end run on a built site, DECISIONS D60).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  dataHref,
  gateBlocks,
  isScriptUrl,
  linkHrefs,
  sameSitePath,
  schemeOf
} from '../src/lib/data-links.ts'
import { cleanHtml } from '../src/lib/html.ts'
import { linkChecker } from '../src/lib/page-records.ts'
import { withParents } from '../src/lib/parent-gate.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8')
const astroFiles = (dir) =>
  readdirSync(path.join(ROOT, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`
    return statSync(path.join(ROOT, rel)).isDirectory()
      ? astroFiles(rel)
      : rel.endsWith('.astro')
        ? [rel]
        : []
  })

const link = (key, href) => ({ _key: key, _type: 'link', href })
const para = (...spans) => ({
  _type: 'block',
  markDefs: spans.flatMap((s) => (s.def ? [s.def] : [])),
  children: spans.map((s) => ({ _type: 'span', text: s.text, marks: s.def ? [s.def._key] : [] }))
})

test('a Portable Text link to an unticked page loses its mark, the words stay; the others are untouched', () => {
  const value = [
    para(
      { text: 'Book on the ' },
      { text: 'menu page', def: link('a', '/menu') },
      { text: ' or ' },
      { text: 'Google', def: link('b', 'https://example.com/menu') }
    ),
    para({ text: 'Nested', def: link('c', '/menu/simple-menu') }),
    { _type: 'quote', paragraphs: [para({ text: 'quoted', def: link('d', '/menu') })] }
  ]
  assert.deepEqual(linkHrefs(value), ['/menu', 'https://example.com/menu', '/menu/simple-menu', '/menu'])
  const live = (u) => !u.startsWith('/menu')
  const out = gateBlocks(value, live)
  assert.deepEqual(
    linkHrefs(out),
    ['https://example.com/menu'],
    'only the external link is left, nested quote included'
  )
  assert.equal(out[0].children.map((c) => c.text).join(''), 'Book on the menu page or Google')
  assert.deepEqual(out[0].children[1].marks, [])
  assert.deepEqual(out[0].children[3].marks, ['b'])
  assert.deepEqual(out[2].paragraphs[0].children[0].marks, [])
  assert.deepEqual(
    gateBlocks(value, () => true),
    value,
    'nothing dead: the same blocks'
  )
})

// every component that draws a link from data, and what it must do with a dead one
const GATED = {
  'src/components/site/Header.astro': [/pruneMenu\(chrome\.primary, live\)/],
  'src/components/sections/Slideshow.astro': [/s\.slide_link && live\(s\.slide_link\)/],
  'src/components/sections/HappyHours.astro': [/entry\.hp_link_text && live\(entry\.hp_link\)/],
  'src/components/sections/Stats.astro': [/entry\.button_title && live\(entry\.button_link\)/],
  'src/components/sections/FeaturesCollage.astro': [/it\.btn_value && live\(it\.btn_link\)/],
  'src/components/sections/FeaturesIntro.astro': [/liveBlocks\(/, /button && link && live\(link\.href\)/],
  'src/components/sections/Reservation.astro': [
    /liveBlocks\(/,
    /b\.button_label && live\(b\.button_link\)/,
    /r\.online_button && live\(r\.online_link\)/
  ],
  'src/components/sections/Contact.astro': [/liveBlocks\(/],
  'src/components/site/Footer.astro': [
    /site\.footer_map_url && live\(site\.footer_map_url\)/,
    /c\.href && live\(c\.href\)/
  ],
  'src/components/sections/GalleryStrip.astro': [/albums\.length > 0 && live\('\/gallery'\)/],
  'src/components/site/PostCard.astro': [/liveLinks\(Astro\.request, locale, \[postPath\(p\)\]\)/],
  'src/components/sections/Categories.astro': [/live\(`\/\$\{c\.slug\}`\) \?/],
  'src/components/sections/Sidebar.astro': [
    /categories\.filter\(\(c\) => live\(/,
    /banner\.button_label && live\(banner\.button_link\)/
  ],
  'src/views/Home.astro': [/liveBlocks\(Astro\.request, locale, stampBlocks\(\$hero/, /livePosts\(/],
  'src/views/Post.astro': [/liveBlocks\(Astro\.request, locale, stampBlocks\(\$post/, /livePosts\(/],
  'src/views/Page.astro': [/liveBlocks\(Astro\.request, locale, stampBlocks\(\$page/],
  'src/views/BlogList.astro': [/livePosts\(/],
  'src/views/Search.astro': [/livePosts\(/]
}
// files whose hrefs the gate does not need to ask about: each is built BY CODE from a route that is itself gated or always
// live, never from a field. A reason that rests on what data "usually" holds is not accepted here.
const UNGATED = {
  'src/components/site/Pager.astro':
    'built from the path of the page being drawn (?page=n), which is served only while it is live',
  'src/views/Gallery.astro':
    'built from /gallery and /gallery/<slug>, drawn only on those routes, which answer 404 when Gallery is off',
  'src/views/NotFound.astro': 'the literal front page, always live',
  'src/layouts/Base.astro': 'the literal in-page link #main'
}

test('every component that draws a link from data goes through the gate', () => {
  for (const [file, patterns] of Object.entries(GATED)) {
    const text = read(file)
    assert.match(text, /@\/lib\/(link-gate|menu-gate)/, `${file} imports the gate`)
    for (const re of patterns) assert.match(text, re, `${file}: ${re}`)
  }
})

test('a new component with an href is either gated or named, with the reason, as not needing the gate', () => {
  const unknown = astroFiles('src')
    .filter((f) => /\bhref=\{/.test(read(f)))
    .filter((f) => !(f in GATED) && !(f in UNGATED))
  assert.deepEqual(unknown, [], 'gate it (link-gate.ts) or add it to UNGATED with the reason')
  for (const file of Object.keys(UNGATED)) assert.ok(read(file).length > 0, file)
})

// ── what the gate passes and what it gates (the footer's links are free text) ───────────────────────────────────────────────
test('the gate gates a same-site path and passes external, tel:, mailto: and # links unchanged', async () => {
  const origins = ['https://site.test']
  assert.equal(sameSitePath('/menu', origins), '/menu')
  assert.equal(
    sameSitePath('https://site.test/menu?x=1#top', origins),
    '/menu?x=1#top',
    'our own origin is a path'
  )
  for (const external of [
    'https://example.com/menu',
    'http://cdn.test/menu',
    '//cdn.test/menu',
    'tel:+1 212 555 0110',
    'mailto:a@b.test',
    '#top',
    '',
    'javascript:void(0)'
  ])
    assert.equal(sameSitePath(external, origins), null, external)
  const table = { menu: { collection: 'pages', slug: 'menu' } }
  const check = withParents(
    linkChecker(async ({ slug }) => slug !== 'menu', table, ['en']),
    table,
    ['en']
  )
  const asPath = (u) => sameSitePath(u, origins) ?? u
  const urls = [
    '/menu',
    '/menu/simple-menu',
    'https://site.test/menu',
    'https://example.com/menu',
    'tel:+12125550110',
    'mailto:a@b.test',
    '#top',
    '/'
  ]
  const live = await check(urls.map(asPath))
  const answers = urls.map((u) => live(asPath(u)))
  assert.deepEqual(answers, [false, false, false, true, true, true, true, true])
})

test('the footer map and contact links are gated: a map link of /menu with Menu unticked is dropped', () => {
  // the formatter may wrap the call over several lines
  const footer = read('src/components/site/Footer.astro')
    .replace(/\s+/g, ' ')
    .replace(/\[ /g, '[')
    .replace(/ \]/g, ']')
  assert.match(
    footer,
    /liveLinks\(Astro\.request, chrome\.locale, \[site\.footer_map_url, \.\.\.contact\.map\(\(c\) => c\.href\)\]\)/
  )
  assert.match(
    footer,
    /site\.footer_map_url && live\(site\.footer_map_url\) && <a href=\{site\.footer_map_url\}/
  )
  assert.match(
    footer,
    /c\.href && live\(c\.href\) \? <a href=\{c\.href\}/,
    'a dead contact link keeps its words as a span'
  )
  assert.match(read('src/lib/link-gate.ts'), /sameSitePath\(url, origins\) \?\? url/)
})

// ── a data href never renders a script URL ──────────────────────────────────────────────────────────────────────────────────
const SCRIPT_URLS = [
  'javascript:alert(1)',
  ' JaVaScript:alert(1)',
  '\tjavascript:alert(1)',
  '\n\u0001 javascript:alert(1)',
  'java\tscript:alert(1)',
  'jav\nascript:alert(1)',
  'VBScript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  ' DATA:text/html;base64,PHNjcmlwdD4='
]

test('javascript:, vbscript: and data: are script URLs however a browser would read them', () => {
  for (const url of SCRIPT_URLS) assert.equal(isScriptUrl(url), true, JSON.stringify(url))
  for (const fine of [
    '/menu',
    'https://example.com/javascript:x',
    'tel:+1 212 555 0110',
    'mailto:a@b.test',
    '#top',
    'javascripts:x',
    '',
    null,
    undefined
  ])
    assert.equal(isScriptUrl(fine), false, String(fine))
  assert.equal(schemeOf(' JaVaScript:alert(1)'), 'javascript')
  assert.equal(sameSitePath('javascript:alert(1)', ['https://site.test']), null)
})

test('a Portable Text link with a script URL loses its mark whatever the pages say', () => {
  const value = [
    para(
      { text: 'click ' },
      { text: 'here', def: link('a', ' JaVaScript:alert(1)') },
      { text: ' or ' },
      { text: 'there', def: link('b', 'https://example.com/x') }
    )
  ]
  const out = gateBlocks(value, (u) => !isScriptUrl(u))
  assert.deepEqual(linkHrefs(out), ['https://example.com/x'])
  assert.equal(out[0].children.map((c) => c.text).join(''), 'click here or there', 'the words stay')
})

test('link-gate.ts never answers live for a script URL, so every gated place drops it', () => {
  const gate = read('src/lib/link-gate.ts')
  assert.match(gate, /!isScriptUrl\(url\) && live\(asPath\(url\)\)/)
})

test('cleanHtml drops a script URL from href however it is spelled, and from an image src', () => {
  for (const url of [
    'javascript:alert(1)',
    ' JaVaScript:alert(1)',
    'java&#9;script:alert(1)',
    '&#106;avascript&colon;alert(1)',
    'vbscript:x',
    'data:text/html,x',
    '&#x6A;avascript:alert(1)'
  ]) {
    const out = cleanHtml(`<a href="${url}" title="t">x</a>`)
    assert.doesNotMatch(out, /href=/, url)
    assert.match(out, /<a title="t">x<\/a>/, 'the words and the other attributes stay')
  }
  assert.match(cleanHtml('<a href="/menu">x</a>'), /href="\/menu"/)
  assert.match(cleanHtml('<a href="https://example.com">x</a>'), /href="https:\/\/example\.com"/)
  assert.doesNotMatch(cleanHtml('<img src="javascript:alert(1)" alt="a">'), /src=/)
  assert.match(cleanHtml('<img src="/brand/logo.png" alt="a">'), /src="\/brand\/logo\.png"/)
})

// ── own-host URLs are same-site paths, whatever the scheme (sameSitePath) ───────────────────────────────────────────────
test('an absolute or protocol-relative URL on the own host is a same-site path; another host is not', async () => {
  const origins = ['https://site.test', 'http://127.0.0.1:4321']
  for (const own of [
    '//site.test/menu',
    'https://site.test/menu',
    'http://site.test/menu',
    'HTTPS://SITE.TEST/menu'
  ])
    assert.equal(sameSitePath(own, origins), '/menu', own)
  assert.equal(sameSitePath('//site.test/menu/simple-menu?x=1#y', origins), '/menu/simple-menu?x=1#y')
  assert.equal(sameSitePath('http://127.0.0.1:4321/menu', origins), '/menu')
  for (const other of [
    '//cdn.test/menu',
    'https://site.test.evil.test/menu',
    'http://site.test:8080/menu',
    '//site.test.evil.test/menu'
  ])
    assert.equal(sameSitePath(other, origins), null, other)
  // and the gate then asks about the path: a protocol-relative link to the own Menu goes with Menu
  const table = { menu: { collection: 'pages', slug: 'menu' } }
  const check = withParents(
    linkChecker(async ({ slug }) => slug !== 'menu', table, ['en']),
    table,
    ['en']
  )
  const asPath = (u) => sameSitePath(u, origins) ?? u
  const urls = ['//site.test/menu', 'http://site.test/menu/simple-menu', '//cdn.test/menu']
  const live = await check(urls.map(asPath))
  assert.deepEqual(
    urls.map((u) => live(asPath(u))),
    [false, false, true]
  )
})

// ── what is printed: only a same-site path takes the locale prefix (dataHref) ───────────────────────────────────────────────
test('only a same-site path takes the locale prefix; every other kind of link is printed as written', () => {
  const vi = (p) => `/vi${p === '/' ? '' : p}`
  assert.equal(dataHref('/menu', vi), '/vi/menu')
  assert.equal(dataHref('/', vi), '/vi')
  assert.equal(dataHref('menu', vi), vi('menu'), 'a bare path is handed to the prefix function as it is')
  for (const asWritten of [
    'https://example.com/a',
    'http://example.com',
    '//cdn.test/a',
    '#about',
    'tel:+1 212 555 0110',
    'mailto:a@b.test',
    'sms:123',
    'ftp://h/x'
  ])
    assert.equal(dataHref(asWritten, vi), asWritten, asWritten)
  assert.equal(dataHref('  https://example.com/a ', vi), 'https://example.com/a', 'trimmed')
  for (const none of ['javascript:alert(1)', ' JaVaScript:x', 'data:text/html,x', '', '   ', null, undefined])
    assert.equal(dataHref(none, vi), null, String(none))
})

test('every data href is printed through dataHref, so no external or fragment link is prefixed', () => {
  for (const file of [
    'src/components/sections/Slideshow.astro',
    'src/components/sections/Stats.astro',
    'src/components/sections/HappyHours.astro',
    'src/components/sections/FeaturesCollage.astro',
    'src/components/sections/FeaturesIntro.astro',
    'src/components/sections/Reservation.astro',
    'src/components/sections/Sidebar.astro',
    'src/components/site/Header.astro'
  ])
    assert.match(read(file), /dataHref\(/, file)
  // what is left of `href(locale, …)` is built by code from a route (a post, a category, the gallery), never from a field
  const left = astroFiles('src').flatMap((f) =>
    [...read(f).matchAll(/href=\{href\(locale, ([^)]*\)?)\)\}/g)].map((m) => `${f}: ${m[1]}`)
  )
  const fromField = left.filter((l) =>
    /\b(s|it|b|r|entry|banner|c|item|child|leaf|home)\.(\w*(link|url)\w*)/.test(l)
  )
  assert.deepEqual(fromField, [])
})

// ── candidates are resolved against the request origin, the way a browser resolves them ──────────────────────────────────────
test('a link is read against the request origin: scheme, default ports and case do not hide the own host', () => {
  const http = ['http://site.test']
  const https = ['https://site.test']
  // protocol-relative takes the page's own scheme, so its default port is the default
  assert.equal(sameSitePath('//site.test:80/menu', http), '/menu')
  assert.equal(sameSitePath('//site.test:443/menu', https), '/menu')
  assert.equal(sameSitePath('//SITE.TEST/menu', http), '/menu')
  assert.equal(sameSitePath('HTTP://SITE.TEST/menu', http), '/menu')
  assert.equal(sameSitePath('HTTP://SITE.TEST:80/menu', http), '/menu')
  assert.equal(sameSitePath('https://SITE.TEST:443/menu', https), '/menu')
  // a site behind a proxy is reached as both
  assert.equal(sameSitePath('https://site.test/menu', http), '/menu')
  assert.equal(sameSitePath('http://site.test/menu', https), '/menu')
  // the parser normalises the path too, and a backslash is a slash to it
  assert.equal(sameSitePath('//site.test/a/../menu', http), '/menu')
  assert.equal(sameSitePath('/\\site.test/menu', http), '/menu')
  assert.equal(sameSitePath('/\\evil.test/menu', http), null, '/\\host is another host, not a path')
  assert.equal(sameSitePath('/menu', http), '/menu')
  // the configured public origin counts too
  assert.equal(sameSitePath('//cdn.test/menu', ['http://site.test', 'https://cdn.test']), '/menu')
  // lookalikes stay external
  for (const other of [
    '//site.test.evil.test/menu',
    'https://site.test.evil.test/menu',
    'http://site.test:8080/menu',
    '//site.test:8080/menu',
    '//evil.test/site.test/menu',
    '//site.test@evil.test/menu',
    'https://site.test:80/menu',
    'ftp://site.test/menu'
  ])
    assert.equal(sameSitePath(other, http), null, other)
  assert.equal(
    sameSitePath('//site.test:8080/menu', ['http://site.test:8080']),
    '/menu',
    'a non-default port is part of the host'
  )
})
