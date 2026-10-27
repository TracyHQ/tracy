// 🔒 A STYLESHEET THE AGENT WRITES IS CHECKED ON THE PAGE BEFORE ANYONE CALLS IT DONE (follow-up to
// TracyHQ/tch#1710 / PR #1713, dev wp-tracy-ai, 25/10/2026): asked for one rule "at the end of the
// active theme's style.css", the agent appended it to `wp-content/themes/tracy/style.css` and answered
// "done" — the home page links no style.css at all, only the theme's `assets/css/*.css` and WooCommerce's.
//
//   node --test packages/tools/tracy-site-tools/test/css-file-loaded.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CSS_FILE_NOT_LOADED,
  cssFileAnswer,
  cssFilesLoaded,
  cssImports,
  cssRules,
  holdsRule,
  pageSheets,
  samePath,
  servedCss,
  writtenRules
} from '../src/host/css-file-loaded.mjs'

const RULE = '.tracy-r7-2255 { outline: 0; }'

test('servedCss: where a written stylesheet is served, on each platform; anything else is not a look file', () => {
  const at = { workdir: '/site/wp1', label: 'wp1' }
  // WordPress: relative to the command's directory, through the site folder's webroot or the container's own
  assert.deepEqual(servedCss('.webroot/wp-content/themes/tracy/style.css', at), {
    file: 'wp-content/themes/tracy/style.css',
    url: '/wp-content/themes/tracy/style.css',
    built: false
  })
  assert.deepEqual(
    servedCss('/var/www/html/wp-content/themes/tracy/style.css', at)?.url,
    '/wp-content/themes/tracy/style.css'
  )
  assert.deepEqual(
    servedCss('style.css', { workdir: '/site/wp1/.webroot/wp-content/themes/tracy', label: 'wp1' })?.url,
    '/wp-content/themes/tracy/style.css'
  )
  // Joomla: a T4 template's local css, and Joomla 4+'s media folder of a site template
  assert.equal(
    servedCss('/site/jo1/.webroot/templates/t4_corp/local/css/custom.css', {
      workdir: '/site/jo1',
      label: 'jo1'
    })?.url,
    '/templates/t4_corp/local/css/custom.css'
  )
  assert.equal(
    servedCss('/var/www/html/media/templates/site/cassiopeia/css/user.css', at)?.url,
    '/media/templates/site/cassiopeia/css/user.css'
  )
  // EmDash: a source the build compiles, a public file the build copies — both served only after it
  assert.deepEqual(servedCss('/app/src/styles/global.css', at), {
    file: '/app/src/styles/global.css',
    url: null,
    built: true
  })
  assert.deepEqual(servedCss('/app/public/extra.css', at), {
    file: '/app/public/extra.css',
    url: '/extra.css',
    built: true
  })
  // not a served stylesheet
  assert.equal(servedCss('.webroot/templates/t4_corp/scss/_x.scss', at), null, 'a source a compiler reads')
  assert.equal(servedCss('notes.css', at), null, 'the site folder, outside the webroot')
  assert.equal(servedCss('/app/dist/client/_astro/a.css', at), null, 'a build output')
  assert.equal(servedCss('/tmp/x.css', at), null)
})

test('writtenRules: what the write added or changed, whole; a new file all of it; nothing new is nothing', () => {
  const before = '.a { color: red }\n.b{margin:0}'
  assert.deepEqual(writtenRules(before, `${before}\n${RULE}\n`), [
    { selector: '.tracy-r7-2255', props: ['outline'] }
  ])
  assert.deepEqual(writtenRules(before, '.a { color: blue }\n.b{margin:0}'), [
    { selector: '.a', props: ['color'] }
  ])
  assert.deepEqual(writtenRules(null, '@media (max-width:767.98px){ header > .x { display:none } }'), [
    { selector: 'header>.x', props: ['display'] }
  ])
  assert.deepEqual(writtenRules(before, before), [])
  assert.deepEqual(writtenRules(before, '.a{color:red}'), [], 'a removal shows nothing new')
  assert.equal(writtenRules(before, null), null, 'not read: nothing to look for')
  // not rules: a face, keyframe steps, an import
  assert.deepEqual(
    cssRules(
      '@import url(x.css);@font-face{font-family:A}@keyframes k{from{opacity:0}to{opacity:1}}.c,.d{top:0}'
    ).map((r) => r.selectors),
    [['.c', '.d']]
  )
})

test('pageSheets: the stylesheets a page links (query kept for the read, host dropped), preloads that swap in, and its <style>s', () => {
  const html =
    `<link rel='stylesheet' id='a-css' href='https://wp1.example.com/wp-content/themes/tracy/assets/css/app-pair.css?ver=1.2' media='all' />` +
    '<link rel="preload" as="style" href="/wp-content/cache/min/x.css" onload="this.rel=\'stylesheet\'">' +
    '<link rel="preload" as="font" href="/f.woff2"><link rel="icon" href="/i.css">' +
    '<link href="sub/b.css" rel="stylesheet"><style>@import "/c.css";</style>'
  const { links, styles } = pageSheets(html, '/shop/')
  assert.deepEqual(
    links.map((l) => [l.href, l.path, l.own]),
    [
      [
        '/wp-content/themes/tracy/assets/css/app-pair.css?ver=1.2',
        '/wp-content/themes/tracy/assets/css/app-pair.css',
        false
      ],
      ['/wp-content/cache/min/x.css', '/wp-content/cache/min/x.css', true],
      ['/shop/sub/b.css', '/shop/sub/b.css', true]
    ]
  )
  assert.deepEqual(styles, ['@import "/c.css";'])
  assert.deepEqual(
    cssImports(
      '@import url("../parent/style.css");@import \'x.css\' screen;',
      '/wp-content/themes/child/style.css'
    ),
    ['/wp-content/themes/parent/style.css', '/wp-content/themes/child/x.css']
  )
  assert.equal(
    samePath('/blog/wp-content/themes/t/style.css', '/wp-content/themes/t/style.css'),
    true,
    'a site in a folder'
  )
  assert.equal(samePath('/foo/extra.css', '/extra.css'), false, 'a short tail is not the same file')
})

test('holdsRule: a combined sheet holds the rule — the selector among a merged list, every property it sets; values not compared', () => {
  const rules = [{ selector: '.x .y', props: ['color', 'padding'] }]
  assert.equal(holdsRule('.a{top:0}.z,.x .y{padding:0;color:#f00}', rules), true)
  assert.equal(holdsRule('.x .y{color:red}', rules), false, 'a stale copy without the new property')
  assert.equal(holdsRule('.x .yy{color:red;padding:0}', rules), false)
})

/** A site whose pages and sheets answer from a table; every path asked is kept. */
function site(
  /** @type {Record<string, string | { status?: number, type?: string, body: string } | null>} */ table
) {
  /** @type {string[]} */
  const asked = []
  const read = async (/** @type {string} */ p) => {
    asked.push(p)
    const got = table[p]
    if (got === undefined)
      return { ok: true, status: 404, contentType: 'text/html', html: '<h1>Not found</h1>' }
    if (got === null) return { ok: false, why: 'slow' }
    if (typeof got === 'string')
      return { ok: true, status: 200, contentType: /\.css/.test(p) ? 'text/css' : 'text/html', html: got }
    return { ok: true, status: got.status ?? 200, contentType: got.type ?? 'text/css', html: got.body }
  }
  return { asked, read }
}

/** The home page of `wp-tracy-ai` as dev served it on 25/10: the theme's two sheets and WooCommerce's, no style.css. */
const TRACY_HOME =
  '<!doctype html><html><head>' +
  "<link rel='stylesheet' id='woocommerce-layout-css' href='/wp-content/plugins/woocommerce/assets/css/woocommerce-layout.css?ver=10.2' media='all' />" +
  "<link rel='stylesheet' id='woocommerce-general-css' href='/wp-content/plugins/woocommerce/assets/css/woocommerce.css?ver=10.2' media='all' />" +
  "<link rel='stylesheet' id='tracy-app-pair-css' href='/wp-content/themes/tracy/assets/css/app-pair.css?ver=1.4.2' media='all' />" +
  "<link rel='stylesheet' id='tracy-marketing-css' href='/wp-content/themes/tracy/assets/css/marketing.css?ver=1.4.2' media='all' />" +
  '</head><body><p>.tracy-r7-2255 { outline: 0; } quoted in the text</p></body></html>'

const styleCss = (/** @type {WrittenCssRules} */ rules) => ({
  served: /** @type {any} */ (
    servedCss('.webroot/wp-content/themes/tracy/style.css', { workdir: '/site/wp1', label: 'wp1' })
  ),
  rules
})
/** @typedef {{ selector: string, props: string[] }[] | null} WrittenCssRules */

test('🔒 WordPress, a theme whose style.css the page does not load: CSS_FILE_NOT_LOADED, the theme’s own sheets named first, never "done"', async () => {
  const { asked, read } = site({
    '/': TRACY_HOME,
    '/wp-content/themes/tracy/assets/css/app-pair.css?ver=1.4.2': '.app{color:red}',
    '/wp-content/themes/tracy/assets/css/marketing.css?ver=1.4.2': '.hero{padding:0}',
    '/wp-content/plugins/woocommerce/assets/css/woocommerce-layout.css?ver=10.2':
      '.woocommerce{display:block}',
    '/wp-content/plugins/woocommerce/assets/css/woocommerce.css?ver=10.2': '.price{color:green}'
  })
  const files = [styleCss(writtenRules('/* Theme Name: Tracy */', `/* Theme Name: Tracy */\n${RULE}`))]
  const found = await cssFilesLoaded({ files, page: '/', read })
  assert.deepEqual(found.verdicts, [{ file: 'wp-content/themes/tracy/style.css', state: 'not loaded' }])
  assert.equal(asked[0], '/', 'the page first')
  assert.equal(asked.length, 5, 'then each of its sheets once')
  const out = /** @type {any} */ (cssFileAnswer(found, { page: '/', files }))
  assert.equal(out.cssFile, 'not loaded')
  assert.equal(out.warnings[0].code, CSS_FILE_NOT_LOADED)
  assert.equal(out.warnings[0].file, 'wp-content/themes/tracy/style.css')
  assert.match(out.warnings[0].message, /^\/ does not load wp-content\/themes\/tracy\/style\.css/)
  assert.deepEqual(
    out.loads.slice(0, 2),
    ['/wp-content/themes/tracy/assets/css/app-pair.css', '/wp-content/themes/tracy/assets/css/marketing.css'],
    "the written file's own theme first"
  )
  assert.match(out.next, /^Do not tell the customer it is done\./)
  assert.match(
    out.next,
    /ask whether to put the rule in a stylesheet this page does load \(\/wp-content\/themes\/tracy\/assets\/css\/app-pair\.css/
  )
  assert.match(out.next, /page\.look/)
})

test('WordPress, a classic theme that enqueues style.css (?ver ignored), and a site installed in a folder: loaded by its link, no sheet read', async () => {
  for (const href of [
    '/wp-content/themes/tracy/style.css?ver=6.8',
    '/blog/wp-content/themes/tracy/style.css'
  ]) {
    const { asked, read } = site({ '/': `<link rel="stylesheet" href="${href}">` })
    const files = [styleCss([{ selector: '.tracy-r7-2255', props: ['outline'] }])]
    const found = await cssFilesLoaded({ files, page: '/', read })
    assert.deepEqual(found.verdicts, [
      { file: 'wp-content/themes/tracy/style.css', state: 'loaded', by: 'link', sheet: href.split('?')[0] }
    ])
    assert.deepEqual(asked, ['/'])
    const out = /** @type {any} */ (cssFileAnswer(found, { page: '/', files }))
    assert.equal(out.cssFile, 'loaded')
    assert.deepEqual(out.loaded, ['wp-content/themes/tracy/style.css (linked)'])
    assert.equal(out.next, undefined)
    assert.equal(out.warnings, undefined)
  }
})

test('WordPress, a child theme: the parent style.css is loaded through the child’s @import (one level)', async () => {
  const { read } = site({
    '/': '<link rel="stylesheet" href="/wp-content/themes/child/style.css?ver=1">',
    '/wp-content/themes/child/style.css?ver=1': '@import url("../parent/style.css");\n.c{top:0}'
  })
  const files = [
    {
      served: /** @type {any} */ (
        servedCss('/var/www/html/wp-content/themes/parent/style.css', { workdir: '/', label: 'wp1' })
      ),
      rules: [{ selector: '.p', props: ['color'] }]
    }
  ]
  const found = await cssFilesLoaded({ files, page: '/', read })
  assert.deepEqual(found.verdicts, [
    {
      file: 'wp-content/themes/parent/style.css',
      state: 'loaded',
      by: 'import',
      sheet: '/wp-content/themes/child/style.css'
    }
  ])
})

test('🔒 Joomla T4: a file T4 combines into media/t4/optimize is loaded when the combined sheet holds the rule written; a stale one is not', async () => {
  const at = { workdir: '/site/jo1', label: 'jo1' }
  const written = {
    served: /** @type {any} */ (servedCss('.webroot/templates/t4_corp/local/css/custom.css', at)),
    rules: writtenRules('', '.t4-header .navbar-brand {\n  color: #1d4ed8;\n  padding: 0 12px;\n}\n')
  }
  const home = '<link href="/media/t4/optimize/css/8f2a1c.css?3e1b" rel="stylesheet">'
  const fresh = site({
    '/': home,
    '/media/t4/optimize/css/8f2a1c.css?3e1b':
      '.t4-header{top:0}.t4-header .navbar-brand{padding:0 12px;color:#1d4ed8}'
  })
  const found = await cssFilesLoaded({ files: [written], page: '/', read: fresh.read })
  assert.deepEqual(found.verdicts, [
    {
      file: 'templates/t4_corp/local/css/custom.css',
      state: 'loaded',
      by: 'rule',
      sheet: '/media/t4/optimize/css/8f2a1c.css'
    }
  ])
  assert.match(
    String(/** @type {any} */ (cssFileAnswer(found, { page: '/', files: [written] })).loaded[0]),
    /its rule is in \/media\/t4\/optimize/
  )
  const stale = site({ '/': home, '/media/t4/optimize/css/8f2a1c.css?3e1b': '.t4-header{top:0}' })
  const missed = await cssFilesLoaded({ files: [written], page: '/', read: stale.read })
  assert.equal(missed.verdicts[0].state, 'not loaded')
  const out = /** @type {any} */ (cssFileAnswer(missed, { page: '/', files: [written] }))
  assert.deepEqual(out.loads, ['/media/t4/optimize/css/8f2a1c.css'])
})

test('Joomla 4+: a site template’s media css, linked with the asset hash as its query', async () => {
  const at = { workdir: '/site/jo2', label: 'jo2' }
  const written = {
    served: /** @type {any} */ (servedCss('.webroot/media/templates/site/cassiopeia/css/user.css', at)),
    rules: null
  }
  const { read } = site({
    '/about': '<link href="/media/templates/site/cassiopeia/css/user.css?4a5b6c" rel="stylesheet">'
  })
  const found = await cssFilesLoaded({ files: [written], page: '/about', read })
  assert.equal(found.verdicts[0].state, 'loaded', 'a link needs no rule to look for')
})

test('EmDash, after site.rebuild: a source rule Astro inlined or bundled is loaded; a new file nothing imports is not', async () => {
  const at = { workdir: '/app', label: 'em1' }
  const global = {
    served: /** @type {any} */ (servedCss('src/styles/global.css', at)),
    rules: writtenRules('.h-1{font-size:2rem}', '.h-1{font-size:2rem}.btn-x{border-radius:9999px}')
  }
  const extra = {
    served: /** @type {any} */ (servedCss('src/styles/extra.css', at)),
    rules: writtenRules(null, '.promo{color:#f0f}')
  }
  const inlined = site({ '/': '<style>.h-1{font-size:2rem}.btn-x{border-radius:9999px}</style>' })
  const a = await cssFilesLoaded({ files: [global, extra], page: '/', read: inlined.read })
  assert.deepEqual(a.verdicts, [
    { file: '/app/src/styles/global.css', state: 'loaded', by: 'rule', sheet: '<style> of /' },
    { file: '/app/src/styles/extra.css', state: 'not loaded' }
  ])
  const out = /** @type {any} */ (cssFileAnswer(a, { page: '/', files: [global, extra] }))
  assert.equal(out.cssFile, 'not loaded')
  assert.equal(out.warnings.length, 1)
  assert.match(out.next, /the place this page takes its look from/, 'no sheet to name')
  const bundled = site({
    '/': '<link rel="stylesheet" href="/_astro/Base.Bx1.css">',
    '/_astro/Base.Bx1.css': '.btn-x{border-radius:9999px}'
  })
  const b = await cssFilesLoaded({ files: [global], page: '/', read: bundled.read })
  assert.deepEqual(b.verdicts, [
    { file: '/app/src/styles/global.css', state: 'loaded', by: 'rule', sheet: '/_astro/Base.Bx1.css' }
  ])
})

test('not settled is "unchecked", never "loaded" or "not loaded": the page not read, a sheet not read, the file not read, past the budget', async () => {
  const files = [styleCss([{ selector: '.tracy-r7-2255', props: ['outline'] }])]
  const noPage = await cssFilesLoaded({ files, page: '/', read: site({ '/': null }).read })
  assert.equal(noPage.verdicts[0].state, 'unchecked')
  const out = /** @type {any} */ (cssFileAnswer(noPage, { page: '/', files }))
  assert.equal(out.cssFile, 'unchecked')
  assert.match(out.next, /page\.look \{path:"\/", style:\{selector/)
  assert.match(out.next, /Say it is done only when it does/)
  const sheetSlow = site({ '/': '<link rel="stylesheet" href="/a.css">', '/a.css': null })
  assert.equal(
    (await cssFilesLoaded({ files, page: '/', read: sheetSlow.read })).verdicts[0].state,
    'unchecked'
  )
  const unread = site({ '/': '<link rel="stylesheet" href="/a.css">', '/a.css': '.a{top:0}' })
  assert.equal(
    (await cssFilesLoaded({ files: [styleCss(null)], page: '/', read: unread.read })).verdicts[0].state,
    'unchecked'
  )
  const never = await cssFilesLoaded({ files, page: '/', read: () => new Promise(() => {}), budgetMs: 20 })
  assert.equal(never.verdicts[0].state, 'unchecked')
  const thrown = await cssFilesLoaded({
    files,
    page: '/',
    read: async () => {
      throw new Error('docker')
    }
  })
  assert.equal(thrown.verdicts[0].state, 'unchecked')
  assert.equal(cssFileAnswer({ verdicts: [], loads: [] }, { page: '/', files: [] }), null)
})
