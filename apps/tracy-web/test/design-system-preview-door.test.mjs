/**
 * The Add site form's design system preview door (`src/sites/design-system-preview.js`): the quickstart's
 * live demo wearing a system, over the real emitters and contracts (`lib/ds-slot.js`) and a fake demo.
 *
 *   node --test apps/tracy-web/test/design-system-preview-door.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'

import { MODES_HEADER, mountDesignSystemPreview } from '../src/sites/design-system-preview.js'
import { previewDocOf, slotBytesOf } from '../src/sites/design-system-preview-page.js'
import { PREVIEW_CSP } from '../src/sites/design-system-preview-links.js'
import {
  wearGlobalStyles,
  wordpressFontFacesOf,
  wordpressGlobalCssOf
} from '../src/sites/design-system-preview-wordpress.js'
import { dsLibrary, emitFor, modesOf, quickstartContractOf, referoLibrary } from '../src/lib/ds-slot.js'
import { siteReadOrigin } from '../src/sites/resolver.js'
import { readDsPreviewTicket } from '../src/lib/ds-preview-ticket.js'

const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const JOOMLA_TAG = 'tracy-business/j6'
const EMDASH_TAG = 'tracy-business/emdash-0.x'

/** A Joomla home as the demo's container serves it: links on the container's own name. */
const JOOMLA_HOME = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Demo</title>
<link href="/media/templates/site/tracy/css/template.css" rel="stylesheet">
</head><body><a href="http://tb-demo-web-1/fr/">FR</a><img src="//tb-demo-web-1/images/logo.png"></body></html>`

/** A WordPress home as its container serves it: the global styles block ends with the theme's styles.css. */
const WP_THEME_CSS = ':root{--theme-dark-only:1}'
const WP_HOME = `<!DOCTYPE html><html lang="en"><head><title>Demo</title>
<style id="global-styles-inline-css">:root{--wp--preset--color--bg: #f8f8ff;}body{color: red;}${WP_THEME_CSS}
/*# sourceURL=global-styles-inline-css */
</style>
<link rel='stylesheet' href='http://wp-demo.tracy.site/wp-content/themes/wp-ja-essence/assets/css/tracy.css'>
</head><body><h1>Hi</h1></body></html>`
const WP_THEME_JSON = JSON.stringify({ version: 3, styles: { css: WP_THEME_CSS } })
const WP_TAG = 'quickstart/ja-essence/wp7'
const WP_DEMO = {
  host: 'local',
  label: 'wp-demo',
  platform: 'wordpress',
  address: 'http://wp-demo.tracy.site/',
  quickstart_version: '1.0.17'
}

const EMDASH_HOME = `<!DOCTYPE html><html lang="en"><head><title>Demo</title><style id="tracy-ds-slot" data-ds="old">.old{}</style></head><body><h1>Hi</h1></body></html>`

function mounted({
  signedIn = true,
  demos = {},
  pages = {},
  innerOf = undefined,
  secret = undefined,
  liveServed = undefined
} = {}) {
  /** @type {string[]} */
  const fetched = []
  const app = new Hono()
  mountDesignSystemPreview(app, {
    // `signedIn: 'missing'`: a caller that forgot the sign-in check.
    ...(signedIn === 'missing'
      ? {}
      : {
          signedIn: async (c) =>
            signedIn ? { email: 'a@x.test' } : { error: c.json({ code: 'NOT_SIGNED_IN' }, 401) }
        }),
    demoOf: async (tag) => demos[tag] ?? null,
    ...(liveServed ? { liveServed } : {}),
    innerOf:
      innerOf ??
      ((demo) => new URL(`http://${demo.label}-web-1${demo.platform === 'emdash' ? ':4321' : ''}/`)),
    fetchImpl: /** @type {any} */ (
      async (url, init = {}) => {
        const u = String(url)
        fetched.push(u)
        const entry = pages[u]
        // A page may answer by what the request said (a CMS that redirects unless told its address).
        const page = typeof entry === 'function' ? entry(new Headers(init.headers)) : entry
        if (!page) return new Response('nope', { status: 404 })
        // A name with no certificate: the fetch itself fails, as Node's does on a TLS handshake refusal.
        if (page.throws) throw new TypeError('fetch failed')
        if (page.redirect) return new Response(null, { status: 301, headers: { location: page.redirect } })
        return new Response(page.html ?? page.json, {
          status: 200,
          headers: { 'content-type': page.json ? 'application/json' : 'text/html; charset=utf-8' }
        })
      }
    ),
    ds: { refero: referoLibrary, quickstartContractOf, emitFor, modesOf },
    origin: 'http://tracy.test:51710',
    ...(secret ? { secret } : {})
  })
  return { app, fetched }
}

const JOOMLA_DEMO = {
  host: 'local',
  label: 'tb-demo',
  platform: 'joomla',
  address: 'https://tb-demo.tracy.site/',
  quickstart_version: '1.2.1'
}

const ask = (app, q) => app.request(`/api/design-system/preview?${new URLSearchParams(q).toString()}`)
/** A same-site link as a served page carries it: this door, its own query, plus `path`, in attribute form. */
const doorTo = (/** @type {Record<string, string>} */ q, /** @type {string} */ path) =>
  `http://tracy.test:51710/api/design-system/preview?${new URLSearchParams({ ...q, path }).toString()}`.replace(
    /&/g,
    '&amp;'
  )

test('joomla: the demo home with the apply bytes, a base at its public address, its own links made public', async () => {
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: {
      // Joomla sends its root to the language home, on its public address: read back on the container.
      'http://tb-demo-web-1/': { redirect: 'https://tb-demo.tracy.site/en/' },
      'http://tb-demo-web-1/en/': { html: JOOMLA_HOME }
    }
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
  assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
  const html = await res.text()
  const expected = await emitFor({ platform: 'joomla', contract: 'joomla-tracy-business', id: MOXIE })
  assert.equal(expected.ok, true)
  // Exactly the bytes an apply writes, last in the head; the base first.
  assert.ok(html.includes(`${expected.html}</head>`), 'the apply bytes close the head')
  assert.match(html, /<head><base href="https:\/\/tb-demo\.tracy\.site\/en\/"><meta/)
  assert.ok(!html.includes('tb-demo-web-1'), 'no address the browser cannot reach')
  assert.ok(
    html.includes(
      `href="${doorTo({ quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE }, '/fr/')}" target="_self"`
    ),
    'its own links point back at this door'
  )
  assert.ok(html.includes('src="https://tb-demo.tracy.site/images/logo.png"'))
  assert.deepEqual(fetched, ['http://tb-demo-web-1/', 'http://tb-demo-web-1/en/'])
})

test('emdash: the slot as its layout inlines it, an old slot taken off, the html says it wears one', async () => {
  const { app } = mounted({
    demos: {
      [EMDASH_TAG]: {
        host: 'local',
        label: 'tb-em',
        platform: 'emdash',
        address: 'https://tb-em.tracy.site/',
        quickstart_version: '1.7.7'
      }
    },
    pages: { 'http://tb-em-web-1:4321/': { html: EMDASH_HOME } }
  })
  const res = await ask(app, { quickstart: EMDASH_TAG, platform: 'emdash', id: MOXIE })
  assert.equal(res.status, 200)
  const html = await res.text()
  const out = await emitFor({ platform: 'emdash', contract: 'emdash-tracy-business', id: MOXIE })
  assert.equal(out.ok, true)
  assert.ok(html.includes(slotBytesOf(out) ?? '∅'))
  assert.ok(!html.includes('.old{}'), 'one system at a time')
  assert.match(html, /<html data-ds-worn="" lang="en">/)
  assert.equal((html.match(/id="tracy-ds-slot"/g) ?? []).length, 1)
})

test('wordpress: the global styles block as WordPress prints it with the variation, the theme read on the container', async () => {
  const { app, fetched } = mounted({
    demos: { [WP_TAG]: WP_DEMO },
    pages: {
      'http://wp-demo-web-1/': { html: WP_HOME },
      'http://wp-demo-web-1/wp-content/themes/wp-ja-essence/theme.json': { json: WP_THEME_JSON }
    }
  })
  const res = await ask(app, { quickstart: WP_TAG, platform: 'wordpress', id: MOXIE })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
  const html = await res.text()
  const out = await emitFor({ platform: 'wordpress', contract: 'wordpress-ja-essence', id: MOXIE })
  assert.equal(out.ok, true)
  const block = /<style id="global-styles-inline-css">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
  // The theme's own styles.css goes (the variation's replaces it); the variation closes the block.
  assert.ok(!block.includes(WP_THEME_CSS), 'the theme styles.css is replaced')
  assert.ok(
    block.startsWith(':root{--wp--preset--color--bg: #f8f8ff;}body{color: red;}'),
    'the rest stays first'
  )
  assert.ok(block.endsWith(`${wordpressGlobalCssOf(out.variation)}\n`), 'the variation closes the block')
  assert.match(html, /<head><base href="http:\/\/wp-demo\.tracy\.site\/">/)
  assert.deepEqual(fetched, [
    'http://wp-demo-web-1/',
    'http://wp-demo-web-1/wp-content/themes/wp-ja-essence/theme.json'
  ])
})

test('wordpress: a page that does not load the theme of the template is not dressed', async () => {
  const { app, fetched } = mounted({
    demos: { [WP_TAG]: WP_DEMO },
    pages: { 'http://wp-demo-web-1/': { html: WP_HOME.replace('wp-ja-essence', 'twentytwentyfive') } }
  })
  const res = await ask(app, { quickstart: WP_TAG, platform: 'wordpress', id: MOXIE })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'DEMO_UNREADABLE' })
  assert.deepEqual(fetched, ['http://wp-demo-web-1/'])
})

test('wordpress: the variation in WordPress 7.1 selectors, its fonts as wp_print_font_faces prints them', async () => {
  const out = await emitFor({ platform: 'wordpress', contract: 'wordpress-ja-essence', id: MOXIE })
  assert.equal(out.ok, true)
  const css = wordpressGlobalCssOf(out.variation) ?? ''
  // Each string below is how WordPress 7.1.3 printed the same variation (read-only wp eval, 12/10/2026).
  for (const piece of [
    '--wp--preset--color--bg: #000000;',
    'body{font-weight: 400;}',
    'h1, h2, h3, h4, h5, h6{font-weight: 300;}',
    ':root :where(.wp-element-button, .wp-block-button__link){border-radius: 1000px;font-weight: 500;padding-top: 7px;'
  ])
    assert.ok(css.includes(piece), piece)
  assert.ok(css.endsWith(out.variation.styles.css), 'its styles.css last')
  // the layout metrics stay the theme's (Akemi, 15/10/2026, LAYOUT-3): no content size, no gutters
  assert.ok(!css.includes('--wp--style--global--content-size'), 'no content size')
  assert.ok(!css.includes('--wp--custom--container--'), 'no container gutters')
  assert.ok(!css.includes('--wp--custom--section-y--'), 'no section rhythm')
  // where a variation does carry them, they print as WordPress 7.1.3 printed them
  const laid = wordpressGlobalCssOf({
    settings: {
      layout: { contentSize: '1200px', wideSize: '1200px' },
      custom: { container: { gutterDesktop: '18px' }, sectionY: { desktop: '100px' } }
    },
    styles: {}
  })
  for (const piece of [
    '--wp--custom--container--gutter-desktop: 18px;',
    '--wp--custom--section-y--desktop: 100px;',
    ':root { --wp--style--global--content-size: 1200px;--wp--style--global--wide-size: 1200px; }'
  ])
    assert.ok(laid?.includes(piece), piece)
  const face = {
    fontFamily: 'IBM Plex Serif',
    fontStyle: 'normal',
    fontWeight: '300',
    fontDisplay: 'swap',
    src: ['https://fonts.gstatic.com/s/ibmplexserif/v20/a.woff2'],
    unicodeRange: 'U+0000-00FF'
  }
  const fonts = wordpressFontFacesOf({
    settings: {
      typography: {
        fontFamilies: [
          {
            slug: 'display',
            fontFamily: '"IBM Plex Serif", serif',
            fontFace: [face, { ...face, src: ['https://evil.test/x.woff2'] }]
          }
        ]
      }
    }
  })
  assert.equal(
    fonts,
    `<style class="wp-fonts-local">\n@font-face{font-family:"IBM Plex Serif";font-style:normal;font-weight:300;font-display:swap;src:url('https://fonts.gstatic.com/s/ibmplexserif/v20/a.woff2') format('woff2');unicode-range:U+0000-00FF;}\n</style>`
  )
  assert.equal(slotBytesOf({ platform: 'wordpress', variation: { settings: {} } }), '')
  assert.equal(
    slotBytesOf({ platform: 'wordpress', variation: { styles: { css: '</style><script>' } } }),
    null
  )
})

test('wearGlobalStyles: a variation the page already wears goes instead of the theme css; no block, nothing', () => {
  const worn = `<head><style id="global-styles-inline-css">:root{--a: 1;}/* tracy-ds-slot: refero:old */.old{}</style></head>`
  assert.equal(
    wearGlobalStyles(worn, { globalCss: '.new{}', themeCss: '.theme{}' }),
    `<head><style id="global-styles-inline-css">:root{--a: 1;}.new{}\n</style></head>`
  )
  assert.equal(wearGlobalStyles('<head></head>', { globalCss: '.new{}', themeCss: '' }), null)
})

test('no live demo for the quickstart: not available, never a stand-in page', async () => {
  const { app, fetched } = mounted()
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_DEMO' })
  assert.deepEqual(fetched, [])
})

test('only the demo the server resolved is read: a client address is ignored, a redirect elsewhere is not followed', async () => {
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: { 'http://tb-demo-web-1/': { redirect: 'http://169.254.169.254/latest/meta-data/' } }
  })
  const res = await ask(app, {
    quickstart: JOOMLA_TAG,
    platform: 'joomla',
    id: MOXIE,
    url: 'http://169.254.169.254/',
    address: 'http://evil.test/'
  })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'DEMO_UNREADABLE' })
  assert.deepEqual(fetched, ['http://tb-demo-web-1/'])
})

test('a CMS that redirects to its own address unless told it (WordPress with Polylang): read with the public host', async () => {
  // Measured 12/10 on test-tb-wp: the container answers 301 to its public address on every hop
  // unless `x-forwarded-host` names that address (its Apache puts it back as Host).
  const told = (/** @type {Headers} */ h) =>
    h.get('x-forwarded-host') === 'tb-demo.tracy.site' && h.get('x-forwarded-proto') === 'https'
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: {
      'http://tb-demo-web-1/': (h) =>
        told(h)
          ? { redirect: 'https://tb-demo.tracy.site/en/?lang=en' }
          : { redirect: 'https://tb-demo.tracy.site/' },
      'http://tb-demo-web-1/en/?lang=en': (h) =>
        told(h) ? { html: JOOMLA_HOME } : { redirect: 'https://tb-demo.tracy.site/en/?lang=en' }
    }
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 200)
  // The redirect's whole path and query is read back on the container, and its base is that page.
  assert.match(await res.text(), /<base href="https:\/\/tb-demo\.tracy\.site\/en\/\?lang=en">/)
  assert.deepEqual(fetched, ['http://tb-demo-web-1/', 'http://tb-demo-web-1/en/?lang=en'])
})

test('a redirect back to the page just read is a circle: not read again and again', async () => {
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: { 'http://tb-demo-web-1/': { redirect: 'https://tb-demo.tracy.site/' } }
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'DEMO_UNREADABLE' })
  assert.deepEqual(fetched, ['http://tb-demo-web-1/'])
})

test('kept per template and system: a second ask reads nothing, another system reads again', async () => {
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: { 'http://tb-demo-web-1/': { html: JOOMLA_HOME } }
  })
  const first = await (await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })).text()
  const second = await (await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })).text()
  assert.equal(second, first)
  assert.equal(fetched.length, 1)
  const other = (await referoLibrary()).find((s) => s.ok && s.id !== MOXIE)
  assert.ok(other)
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: other.id })
  assert.equal(res.status, 200)
  assert.equal(fetched.length, 2)
})

test('signed-in seats only; unknown, OpenDesign and gate-refused systems are unknown', async () => {
  assert.equal(
    (await ask(mounted({ signedIn: false }).app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE }))
      .status,
    401
  )
  const { app } = mounted({ demos: { [JOOMLA_TAG]: JOOMLA_DEMO } })
  const unknown = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: 'refero:nope' })
  assert.equal(unknown.status, 400)
  assert.equal((await unknown.json()).code, 'DS_UNKNOWN')
  // OpenDesign is no longer offered (Akemi, 12/10/2026), even a system its gate passes; nor is a
  // Refero system the gate refuses (Paper: text 2.76:1 on its background).
  const od = (await dsLibrary()).find((s) => s.ok)
  assert.ok(od)
  for (const id of [`od:${od.id}`, od.id, 'refero:057d7c66-76b7-4272-849c-4058543e6799']) {
    const r = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id })
    assert.equal(r.status, 400, id)
    assert.equal((await r.json()).code, 'DS_UNKNOWN', id)
  }
  assert.equal((await ask(app, { quickstart: JOOMLA_TAG, platform: 'shopify', id: MOXIE })).status, 400)
})

test('a mount without the sign-in check fails closed: every ask is 401, nothing is read', async () => {
  const { app, fetched } = mounted({
    signedIn: 'missing',
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: { 'http://tb-demo-web-1/': { html: JOOMLA_HOME } }
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'NOT_SIGNED_IN')
  assert.deepEqual(fetched, [])
})

test('the platform is the demo’s own: a wrong or missing hint still gets the Joomla preview', async () => {
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: { 'http://tb-demo-web-1/': { html: JOOMLA_HOME } }
  })
  const expected = await emitFor({ platform: 'joomla', contract: 'joomla-tracy-business', id: MOXIE })
  assert.equal(expected.ok, true)
  for (const q of [
    { quickstart: JOOMLA_TAG, platform: 'wordpress', id: MOXIE },
    { quickstart: JOOMLA_TAG, platform: 'emdash', id: MOXIE },
    { quickstart: JOOMLA_TAG, id: MOXIE }
  ]) {
    const res = await ask(app, q)
    assert.equal(res.status, 200, JSON.stringify(q))
    assert.ok((await res.text()).includes(`${expected.html}</head>`), JSON.stringify(q))
  }
  // Read on the Joomla container, once: the hint never makes another page or another read path.
  assert.deepEqual(fetched, ['http://tb-demo-web-1/'])
})

test('a demo whose platform is not known cannot be previewed: unavailable, never dressed by the hint', async () => {
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: { ...JOOMLA_DEMO, platform: null } },
    pages: { 'http://tb-demo-web-1/': { html: JOOMLA_HOME } }
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_SLOT' })
  assert.deepEqual(fetched, [])
})

test("the demo's own stylesheets load through the asset door, so the fonts they name are same-origin", async () => {
  const { app } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: { 'http://tb-demo-web-1/': { html: JOOMLA_HOME } }
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 200)
  const html = await res.text()
  const link = /<link href="([^"]+)" rel="stylesheet">/.exec(html)
  assert.ok(link, html)
  const href = new URL(link[1].replace(/&amp;/g, '&'))
  assert.equal(href.pathname, '/api/design-system/preview-asset')
  assert.equal(href.searchParams.get('quickstart'), JOOMLA_TAG)
  assert.equal(href.searchParams.get('path'), '/media/templates/site/tracy/css/template.css')
})

test('previewDocOf: a page with no head gives nothing to show', () => {
  assert.equal(
    previewDocOf('<p>hi</p>', {
      platform: 'joomla',
      bytes: '<style></style>',
      base: 'https://a.test/',
      inner: 'http://a-web-1/'
    }),
    null
  )
})

test('previewDocOf: a second document the demo printed after its page (Joomla error page) is cut off', () => {
  // ja-impact-joomla.tracy.site, 14/10/2026: after </html> Joomla printed a whole "Whoops" error page whose
  // own stylesheet (.container{height:100vh;display:flex}) made every container of the preview a screen tall
  const page =
    '<!DOCTYPE html><html><head><title>JA Impact</title></head><body><div class="container">ok</div></body></html>'
  const tail =
    '\n<!DOCTYPE html><html lang="en-GB"><head><style>.container{height:100vh;display:flex}</style></head><body><h1>Whoops, looks like something went wrong.</h1></body></html>'
  const out = previewDocOf(page + tail, {
    platform: 'joomla',
    bytes: '<style id="tracy-ds-slot"></style>',
    base: 'https://ja-impact-joomla.tracy.site/',
    inner: 'http://ja-impact-web-1/'
  })
  assert.ok(out)
  assert.equal(out.match(/<\/html>/gi)?.length, 1)
  assert.ok(!out.includes('Whoops'))
  assert.ok(!out.includes('height:100vh'))
  assert.ok(out.includes('<div class="container">ok</div>'))
})

test('path: another page of the demo wearing the system, read on its container; the redirect stays on the demo', async () => {
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: {
      'http://tb-demo-web-1/about': { redirect: 'https://tb-demo.tracy.site/en/about' },
      'http://tb-demo-web-1/en/about': {
        html: '<html><head><title>About</title></head><body><a href="/en/">Home</a></body></html>'
      }
    }
  })
  const q = { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE }
  const res = await ask(app, { ...q, path: '/about' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
  const html = await res.text()
  const expected = await emitFor({ platform: 'joomla', contract: 'joomla-tracy-business', id: MOXIE })
  assert.ok(html.includes(`${expected.html}</head>`))
  assert.match(html, /<base href="https:\/\/tb-demo\.tracy\.site\/en\/about">/)
  assert.ok(html.includes(`<a href="${doorTo(q, '/en/')}" target="_self">Home</a>`), html)
  assert.deepEqual(fetched, ['http://tb-demo-web-1/about', 'http://tb-demo-web-1/en/about'])
})

test('path: a path that is not the demo’s own is a small page in the frame, nothing read; so is a missing page', async () => {
  const { app, fetched } = mounted({ demos: { [JOOMLA_TAG]: JOOMLA_DEMO } })
  const q = { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE }
  for (const path of ['//evil.test/x', 'http://evil.test/', '/%2e%2e/x', '/a\\b']) {
    const res = await ask(app, { ...q, path })
    assert.equal(res.status, 400, path)
    assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
  }
  assert.deepEqual(fetched, [])
  const missing = await ask(app, { ...q, path: '/nowhere' })
  assert.equal(missing.status, 404)
  assert.match(await missing.text(), /not found/i)
  assert.deepEqual(fetched, ['http://tb-demo-web-1/nowhere'])
})

test('path: signed out inside the frame is a small 401 page, never the JSON', async () => {
  const { app, fetched } = mounted({ signedIn: false, demos: { [JOOMLA_TAG]: JOOMLA_DEMO } })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE, path: '/about' })
  assert.equal(res.status, 401)
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
  assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
  assert.deepEqual(fetched, [])
})

test('the demo home with Cloudflare-obfuscated addresses: the door puts them back, and tells Cloudflare not to obfuscate them again on the way out', async () => {
  // Measured 13/10/2026 on cowork.tracy.site: the decoded page left through the same Cloudflare zone, whose Email
  // Address Obfuscation re-wrote every address (two `data-cfemail` spans and the decode script came back), and the
  // sandboxed frame runs no script. `Cache-Control: no-transform` is what Cloudflare documents for leaving a response alone.
  const li =
    '<li><a href="/cdn-cgi/l/email-protection#2152404d4452614f4e535549464055440c484f450f5354">' +
    '<span class="__cf_email__" data-cfemail="a2d1c3cec7d1e2cccdd0d6cac5c3d6c78fcbccc68cd0d7">[email&#160;protected]</span></a></li>'
  const home =
    `<!DOCTYPE html><html lang="en"><head><title>Demo</title></head><body><ul>${li}${li}</ul>` +
    '<script data-cfasync="false" src="https://tb-demo.tracy.site/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script></body></html>'
  const { app } = mounted({
    demos: { [JOOMLA_TAG]: JOOMLA_DEMO },
    pages: { 'http://tb-demo-web-1/': { html: home } }
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.doesNotMatch(html, /data-cfemail/)
  assert.doesNotMatch(html, /email-protection/)
  assert.doesNotMatch(html, /email-decode/)
  assert.equal((html.match(/mailto:sales@northgate-ind\.ru/g) ?? []).length, 2)
  assert.match(
    res.headers.get('cache-control') ?? '',
    /\bno-transform\b/,
    'Cloudflare must not rewrite the answer'
  )
})

// Measured 14/10/2026 on cowork.tracy.site: every demo on host `fleet01` answered 409 DEMO_UNREADABLE, since
// `siteTarget` names a site on another host `<label>.<host>-sites.<domain>`, a two-level name the edge certificate
// does not cover, while the demo's own public address answered 200.
const DEV = { hostName: 'dev', siteDomain: 'tracy.site' }
const VEGA_TAG = 'quickstart/ja-vega/j6'

test('a demo on another host is read at its public address, never at the -sites name', async () => {
  const demo = {
    ...JOOMLA_DEMO,
    host: 'fleet01',
    label: 'ja-vega-joomla',
    address: 'https://ja-vega-joomla.tracy.site/',
    quickstart_version: '1.0.5'
  }
  const { app, fetched } = mounted({
    demos: { [VEGA_TAG]: demo },
    innerOf: (d) => siteReadOrigin(d, DEV),
    pages: {
      'https://ja-vega-joomla.fleet01-sites.tracy.site/': { throws: true },
      'https://ja-vega-joomla.tracy.site/': { html: JOOMLA_HOME }
    }
  })
  const res = await ask(app, { quickstart: VEGA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
  assert.deepEqual(fetched, ['https://ja-vega-joomla.tracy.site/'])
  // JA Vega wears both sides of a system since its 1.0.7 contract (MODE-3): Light | Dark.
  assert.equal(res.headers.get(MODES_HEADER), 'both')
})

test('a demo on this host is still read on its own container', async () => {
  const demo = { ...JOOMLA_DEMO, host: 'dev', label: 'tb-demo' }
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: demo },
    innerOf: (d) => siteReadOrigin(d, DEV),
    pages: {
      'https://tb-demo.tracy.site/': { throws: true },
      'http://tb-demo-web-1/': { html: JOOMLA_HOME }
    }
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE })
  assert.equal(res.status, 200)
  assert.deepEqual(fetched, ['http://tb-demo-web-1/'])
})

// Measured 14/10/2026 on cowork.tracy.site (#1352): the running site's popup offered Light | Dark from the read's
// `modes`, but the Add site popup had nothing to learn it from, so EmDash and WordPress Tracy Business showed
// Desktop | Mobile only. The page of a two-mode template now says so in a header.
test("a two-mode template's page says so in its header; a one-look template's does not", async () => {
  const { app } = mounted({
    demos: {
      [EMDASH_TAG]: {
        host: 'local',
        label: 'tb-em',
        platform: 'emdash',
        address: 'https://tb-em.tracy.site/',
        quickstart_version: '1.7.19'
      }
    },
    pages: { 'http://tb-em-web-1:4321/': { html: EMDASH_HOME } }
  })
  const two = await ask(app, { quickstart: EMDASH_TAG, platform: 'emdash', id: MOXIE })
  assert.equal(two.status, 200)
  assert.equal(two.headers.get(MODES_HEADER), 'both')
  // Kept pages keep it: the second ask is answered from the shelf.
  const again = await ask(app, { quickstart: EMDASH_TAG, platform: 'emdash', id: MOXIE })
  assert.equal(again.headers.get(MODES_HEADER), 'both')
})

test('the preview shows content a template reveals on scroll with a script', async () => {
  const { previewDocOf, REVEALED } = await import('../src/sites/design-system-preview-page.js')
  const doc = previewDocOf('<html><head></head><body><div data-aos="fade-up">x</div></body></html>', {
    platform: 'joomla',
    bytes: '<style id="tracy-ds-slot"></style>',
    base: 'https://a.tracy.site/',
    inner: 'http://a-web/'
  })
  assert.ok(doc.includes(REVEALED), doc)
})

test('the preview drops the notices a page prints for a visitor without JavaScript, never fallback content', async () => {
  const { previewDocOf, isNoscriptNotice, withoutNoscriptNotices } = await import(
    '../src/sites/design-system-preview-page.js'
  )
  // AcyMailing's notice in JA Kinetic's footer form (WordPress, then Joomla), between field and button
  const acy =
    '<p class="acysubbuttons"><noscript>Please enable the javascript to submit this form</noscript><button>Subscribe</button></p>'
  const acyJoomla = '<noscript>\n        Please enable the javascript to submit this form\t</noscript>'
  assert.ok(isNoscriptNotice('Please enable the javascript to submit this form'))
  assert.ok(isNoscriptNotice('<div class="alert"><p>This site needs <strong>JavaScript</strong>.</p></div>'))
  // fallback content a visitor without scripts (and the preview) needs stays
  const kept = [
    '<noscript><img src="/hero.jpg" alt="Hero"></noscript>',
    '<noscript><link rel="stylesheet" href="/no-js.css"></noscript>',
    '<noscript><iframe src="https://www.googletagmanager.com/ns.html"></iframe></noscript>',
    '<noscript><p>Our studio builds websites for small teams.</p></noscript>'
  ]
  for (const k of kept) assert.equal(withoutNoscriptNotices(k), k, k)
  const doc = previewDocOf(
    `<html><head></head><body><form>${acy}</form>${acyJoomla}${kept.join('')}</body></html>`,
    {
      platform: 'wordpress',
      bytes: '',
      base: 'https://a.tracy.site/',
      inner: 'http://a-web/'
    }
  )
  assert.ok(doc && !/enable the javascript/i.test(doc), 'both notices gone')
  assert.match(doc, /<button>Subscribe<\/button>/)
  for (const k of kept) assert.ok(doc.includes(k), k)
})

test('live=1: the demo itself at its own address with a ticket signed for its row and what the door judged; nothing is read', async () => {
  const demo = { ...JOOMLA_DEMO, site_key: 'tb-demo.localhost' }
  const { app, fetched } = mounted({ demos: { [JOOMLA_TAG]: demo }, secret: 'door-secret' })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE, live: '1' })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /json/)
  assert.match(res.headers.get('cache-control') ?? '', /no-store/)
  const body = await res.json()
  assert.equal(body.live, true)
  assert.equal(typeof body.modes, 'boolean')
  assert.ok(body.mode === null || body.mode === 'light' || body.mode === 'dark')
  const src = new URL(body.src)
  assert.equal(src.origin, 'https://tb-demo.tracy.site')
  assert.equal(src.pathname, '/')
  const ticket = src.searchParams.get('tracy_ds_preview')
  const claims = readDsPreviewTicket('door-secret', ticket, 'tb-demo.localhost')
  assert.ok(claims, 'signed for the demo row')
  assert.equal(claims.id, MOXIE)
  assert.equal(claims.contract, 'joomla-tracy-business')
  assert.equal(readDsPreviewTicket('door-secret', ticket, 'other.localhost'), null, 'no other site')
  assert.equal(readDsPreviewTicket('another-secret', ticket, 'tb-demo.localhost'), null, 'not forgeable')
  assert.deepEqual(fetched, [], 'the page is not read here: the site proxy serves it')
})

test('live=1 keeps every gate: an unknown system, no demo, signed out', async () => {
  const demo = { ...JOOMLA_DEMO, site_key: 'tb-demo.localhost' }
  const { app } = mounted({ demos: { [JOOMLA_TAG]: demo }, secret: 'door-secret' })
  const unknown = await ask(app, {
    quickstart: JOOMLA_TAG,
    platform: 'joomla',
    id: 'refero:00000000-0000-0000-0000-000000000000',
    live: '1'
  })
  assert.equal(unknown.status, 400)
  const none = await ask(app, { quickstart: 'nope/j6', platform: 'joomla', id: MOXIE, live: '1' })
  assert.equal(none.status, 409)
  assert.equal((await none.json()).code, 'DS_PREVIEW_UNAVAILABLE')
  const out = mounted({ signedIn: false, demos: { [JOOMLA_TAG]: demo }, secret: 'door-secret' })
  assert.equal(
    (await ask(out.app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE, live: '1' })).status,
    401
  )
})

test('live=1 on a door with no secret, or a demo row without its key: the static page, as before', async () => {
  const pages = {
    'http://tb-demo-web-1/': { redirect: 'https://tb-demo.tracy.site/en/' },
    'http://tb-demo-web-1/en/': { html: JOOMLA_HOME }
  }
  for (const m of [
    mounted({ demos: { [JOOMLA_TAG]: { ...JOOMLA_DEMO, site_key: 'tb-demo.localhost' } }, pages }),
    mounted({ demos: { [JOOMLA_TAG]: JOOMLA_DEMO }, pages, secret: 'door-secret' })
  ]) {
    const res = await ask(m.app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE, live: '1' })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
  }
})

test('live=1 for a demo this server does not answer at its address (another host): the static page wearing the system', async () => {
  // Measured 18/10/2026 on dev: the demos on fleet01 are served straight by their host's tunnel, so a live frame
  // at their address never meets the site proxy that lays the system in, and the popup showed the template's own
  // colours. Such a demo gets the static page (the system laid in here) instead of a frame that cannot wear it.
  const demo = { ...JOOMLA_DEMO, host: 'fleet01', site_key: 'tb-demo.localhost' }
  const { app, fetched } = mounted({
    demos: { [JOOMLA_TAG]: demo },
    pages: {
      'https://tb-demo.tracy.site/': { redirect: 'https://tb-demo.tracy.site/en/' },
      'https://tb-demo.tracy.site/en/': { html: JOOMLA_HOME }
    },
    innerOf: (d) => new URL(d.address),
    secret: 'door-secret',
    liveServed: (d) => d.host === 'local'
  })
  const res = await ask(app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE, live: '1' })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
  const html = await res.text()
  assert.match(html, /tracy-ds-slot/, 'the page wears the system')
  assert.ok(fetched.length > 0, 'read here, at the public address')
  const local = mounted({
    demos: { [JOOMLA_TAG]: { ...demo, host: 'local' } },
    secret: 'door-secret',
    liveServed: (d) => d.host === 'local'
  })
  const live = await ask(local.app, { quickstart: JOOMLA_TAG, platform: 'joomla', id: MOXIE, live: '1' })
  assert.match(live.headers.get('content-type') ?? '', /json/, 'a demo this server answers stays live')
})
