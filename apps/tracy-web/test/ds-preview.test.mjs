import assert from 'node:assert/strict'
import { test } from 'node:test'
import { locationKeepingTicket, splitDsPreview } from '../src/bar/ds-preview.js'
import {
  DS_PREVIEW_TICKET_S,
  mintDsPreviewTicket,
  readDsPreviewTicket
} from '../src/lib/ds-preview-ticket.js'
import {
  designSystemLivePages,
  frameScriptOf,
  frameSidesOf,
  liveWornHtmlOf
} from '../src/sites/design-system-live-page.js'

const WP_PAGE = `<!doctype html><html><head>
<style id="global-styles-inline-css">:root{--wp--preset--color--bg:#f5f3ee}/* tracy-ds-slot: od:bmw */
:root:root .x{color:#1c69d4}
/*# sourceURL=global-styles-inline-css */
</style>
<link rel='stylesheet' href='https://s.example/wp-content/themes/wp-tracy-business/assets/css/tracy.css?ver=1.1.6' />
</head><body class="home wp-singular wp-theme-wp-tracy-business tracy"><h1>Hi</h1></body></html>`

const JOOMLA_PAGE = `<!doctype html><html><head><link href="/media/templates/site/ja_alpha/css/template.css" rel="stylesheet">
</head><body><div class="t4-header"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><style id="tracy-ds-slot">/* tracy-ds-slot: od:bmw (BMW) */ :root{--x:1}</style></div></body></html>`

test('the preview parameter is taken out of the query, every other pair kept byte for byte', () => {
  assert.deepEqual(splitDsPreview('?tracy_ds_preview=bmw'), { search: '', id: 'bmw' })
  assert.deepEqual(splitDsPreview('?a=%20b&tracy_ds_preview=od%3Astripe&c=d+e'), {
    search: '?a=%20b&c=d+e',
    id: 'od:stripe'
  })
  assert.deepEqual(splitDsPreview('?a=1'), { search: '?a=1', id: null })
  assert.deepEqual(splitDsPreview(''), { search: '', id: null })
})

const SECRET = 'test-secret'
const NOW = Date.parse('2026-10-17T08:00:00Z')
const CLAIMS = { site: 'shop', id: 'refero:0f9e', contract: 'joomla-ja-alpha', template: 'joomla/ja_alpha' }

test('a ticket reads back only for its own site, signed by this secret, in date', () => {
  const t = mintDsPreviewTicket(SECRET, CLAIMS, NOW)
  assert.deepEqual(readDsPreviewTicket(SECRET, t, 'shop', NOW), {
    ...CLAIMS,
    exp: NOW / 1000 + DS_PREVIEW_TICKET_S
  })
  assert.equal(readDsPreviewTicket(SECRET, t, 'other', NOW), null, 'another site')
  assert.equal(readDsPreviewTicket('other-secret', t, 'shop', NOW), null, 'another secret')
  assert.equal(
    readDsPreviewTicket(SECRET, t, 'shop', NOW + (DS_PREVIEW_TICKET_S + 1) * 1000),
    null,
    'expired'
  )
  const [body, sig] = t.split('.')
  const forged = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), i: 'x' })
  )
  assert.equal(
    readDsPreviewTicket(SECRET, `${forged.toString('base64url')}.${sig}`, 'shop', NOW),
    null,
    'forged'
  )
  for (const bad of [undefined, '', 'bmw', 'a.b', `${t}x`, 'x'.repeat(2000)])
    assert.equal(readDsPreviewTicket(SECRET, bad, 'shop', NOW), null, String(bad).slice(0, 20))
  assert.equal(readDsPreviewTicket('', t, 'shop', NOW), null, 'no secret: nothing is believed')
})

const SCRIPT = frameScriptOf('https://tracy.test', 'T.K')

test('the frame script talks only to Tracy and keeps the ticket on same-site links', () => {
  assert.match(SCRIPT, /data-parent-origin="https:\/\/tracy\.test"/)
  assert.match(SCRIPT, /data-ticket="T\.K"/)
  assert.match(SCRIPT, /"tracy_ds_preview"/)
  assert.match(SCRIPT, /e\.origin!==o/, 'a message from another origin is ignored')
  assert.match(SCRIPT, /parent\.postMessage\(\{type:'tracy-ds-at',href:location\.href,theme:last\},o\)/)
  assert.match(
    SCRIPT,
    /parent\.postMessage\(\{type:'tracy-ds-side',theme:m\},o\)/,
    'a change of side is told'
  )
  assert.match(SCRIPT, /data-sides="\{&quot;dark&quot;:&quot;\[data-theme=\\&quot;dark\\&quot;\]&quot;/)
  assert.doesNotMatch(SCRIPT, /<\/script>[\s\S]*<\/script>/, 'one script element')
  assert.match(
    frameScriptOf('https://t"x', 'a<b'),
    /data-parent-origin="https:\/\/t&quot;x" data-ticket="a&lt;b"/
  )
})

test("frameSidesOf: the contract's hook read and set by the frame script; a hook it cannot parse is Tracy's data-theme", () => {
  assert.deepEqual(frameSidesOf(), { dark: '[data-theme="dark"]', auto: true, set: null })
  assert.deepEqual(frameSidesOf({ hook: '', auto: false }), {
    dark: '[data-theme="dark"]',
    auto: false,
    set: null
  })
  assert.deepEqual(frameSidesOf({ hook: ':has(> body.dark-active)', auto: false }), {
    dark: ':has(> body.dark-active)',
    auto: false,
    set: { on: 'body', cls: ['dark-active'], attr: [] }
  })
  assert.deepEqual(frameSidesOf({ hook: '[data-mode="night"]' }), {
    dark: '[data-mode="night"]',
    auto: false,
    set: { on: 'root', cls: [], attr: [['data-mode', 'night']] }
  })
  // two marks the root carries together (JA Kinetic WordPress): a press sets or clears both
  assert.deepEqual(frameSidesOf({ hook: '[data-theme="dark"].t4-dark' }), {
    dark: '[data-theme="dark"].t4-dark',
    auto: false,
    set: { on: 'root', cls: ['t4-dark'], attr: [['data-theme', 'dark']] }
  })
  assert.deepEqual(frameSidesOf({ hook: 'body{}' }).set, null, 'not a hook: the default')
})

test('the frame script tells the side the page shows, follows its changes, and sets the hook a press asks', async () => {
  const { parseHTML } = await import('linkedom')
  const run = (sides, rootAttrs = '') => {
    const { window } = parseHTML(`<!doctype html><html ${rootAttrs}><head></head><body></body></html>`)
    const doc = window.document
    const told = []
    const listeners = {}
    const script = doc.createElement('script')
    const src = frameScriptOf('https://tracy.test', 'T.K', sides)
    for (const [, k, v] of src.matchAll(/ ([\w-]+)="([^"]*)"/g))
      script.setAttribute(
        k,
        v
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
      )
    Object.defineProperty(doc, 'currentScript', { value: script, configurable: true })
    Object.defineProperty(doc, 'readyState', { value: 'complete', configurable: true })
    const observers = []
    const g = {
      document: doc,
      location: { href: 'https://shop.tracy.test/', origin: 'https://shop.tracy.test' },
      parent: { postMessage: (data, origin) => told.push({ data, origin }) },
      addEventListener: (type, fn) => {
        listeners[type] = fn
      },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      MutationObserver: class {
        constructor(fn) {
          observers.push(fn)
        }
        observe() {}
      },
      URL
    }
    const body = src.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    new Function(...Object.keys(g), body)(...Object.values(g))
    const press = (theme, origin = 'https://tracy.test') =>
      listeners.message({ origin, data: { type: 'tracy-ds-theme', theme } })
    const mutate = () => observers.forEach((fn) => fn())
    return { doc, told, press, mutate }
  }
  // Tracy's hook: the page opened light whatever the system declares, and says so
  const a = run(frameSidesOf({ hook: '', auto: false }), 'data-theme="light"')
  assert.deepEqual(a.told, [
    {
      data: { type: 'tracy-ds-at', href: 'https://shop.tracy.test/', theme: 'light' },
      origin: 'https://tracy.test'
    }
  ])
  a.doc.documentElement.setAttribute('data-theme', 'dark')
  a.mutate()
  assert.deepEqual(a.told.at(-1).data, { type: 'tracy-ds-side', theme: 'dark' }, "the page's own switch")
  a.mutate()
  assert.equal(a.told.length, 2, 'told once per change')
  a.press('light')
  assert.equal(a.doc.documentElement.getAttribute('data-theme'), 'light')
  assert.deepEqual(a.told.at(-1).data, { type: 'tracy-ds-side', theme: 'light' })
  a.press('dark', 'https://evil.test')
  assert.equal(a.doc.documentElement.getAttribute('data-theme'), 'light', 'another origin is not obeyed')
  // a JA body class hook: read and set on the body
  const b = run(frameSidesOf({ hook: ':has(> body.dark-active)', auto: false }))
  assert.equal(b.told[0].data.theme, 'light')
  b.press('dark')
  assert.equal(b.doc.body.classList.contains('dark-active'), true)
  b.press('light')
  assert.equal(b.doc.body.classList.contains('dark-active'), false)
})

test('Joomla and EmDash: the worn slot out (wherever the module printed it), the bytes last in the head, the script before </body>', () => {
  const bytes = '<style id="tracy-ds-slot">/* tracy-ds-slot: refero:0f9e */ :root{--y:2}</style>'
  const out = liveWornHtmlOf(JOOMLA_PAGE, { platform: 'joomla', bytes, script: SCRIPT })
  assert.ok(out)
  assert.doesNotMatch(out, /od:bmw|family=Inter/, 'the worn slot and its fonts link are gone')
  assert.ok(out.indexOf(bytes) < out.indexOf('</head>') && out.indexOf(bytes) > out.indexOf('template.css'))
  assert.ok(out.indexOf(SCRIPT) < out.indexOf('</body>') && out.indexOf(SCRIPT) > out.indexOf('t4-header'))
  const em = liveWornHtmlOf('<html lang="en"><head></head><body></body></html>', {
    platform: 'emdash',
    bytes,
    script: SCRIPT
  })
  assert.match(String(em), /<html data-ds-worn="" lang="en">/)
  const bare = liveWornHtmlOf(JOOMLA_PAGE, { platform: 'joomla', bytes: '', bare: true, script: SCRIPT })
  assert.doesNotMatch(String(bare), /tracy-ds-slot/, 'template default: nothing worn')
  assert.equal(liveWornHtmlOf('<p>no head</p>', { platform: 'joomla', bytes, script: SCRIPT }), null)
})

test('WordPress: the global styles block as the merge prints it; a worn page asked bare, or a page without the block, is none', () => {
  const out = liveWornHtmlOf(WP_PAGE, {
    platform: 'wordpress',
    bytes: '<style class="wp-fonts-local">@font-face{}</style>',
    globalCss: ':root{--wp--preset--color--bg:#000}',
    themeCss: '',
    script: SCRIPT
  })
  assert.ok(out)
  assert.doesNotMatch(out, /od:bmw|#1c69d4/, 'the worn variation is taken out of the block')
  assert.match(out, /--wp--preset--color--bg:#000\}\n<\/style>/)
  assert.match(out, /wp-fonts-local[\s\S]*<\/head>/)
  assert.equal(
    liveWornHtmlOf(WP_PAGE, { platform: 'wordpress', bytes: '', bare: true, script: SCRIPT }),
    null
  )
  assert.equal(
    liveWornHtmlOf('<html><head></head><body></body></html>', {
      platform: 'wordpress',
      bytes: '',
      globalCss: 'x',
      themeCss: '',
      script: SCRIPT
    }),
    null
  )
})

test("pageOf: the door emitter through the ticket's contract, kept per system; template default lays nothing; a refusal is the page as it is", async () => {
  const asked = []
  const pages = designSystemLivePages({
    emitFor: async (q) => {
      asked.push(q)
      return q.id === 'refused'
        ? { ok: false, code: 'DS_REFUSED' }
        : {
            ok: true,
            platform: 'joomla',
            html: `<style id="tracy-ds-slot">/* tracy-ds-slot: ${q.id} */</style>`
          }
    },
    fontFaces: async () => [],
    now: () => NOW
  })
  const q = {
    html: JOOMLA_PAGE,
    claims: { ...CLAIMS, exp: 0 },
    ticket: 'T.K',
    site: { platform: 'joomla' },
    inner: new URL('http://shop-web'),
    pub: new URL('https://shop.tracy.test'),
    parentOrigin: 'https://tracy.test',
    fetchImpl: async () => {
      throw new Error('nothing is read for Joomla')
    }
  }
  const one = await pages.pageOf(q)
  assert.match(String(one), /tracy-ds-slot: refero:0f9e/)
  await pages.pageOf(q)
  assert.equal(asked.length, 1, 'emitted once')
  assert.equal(asked[0].contract, 'joomla-ja-alpha')
  const bare = await pages.pageOf({ ...q, claims: { ...q.claims, id: 'template-default', contract: '' } })
  assert.doesNotMatch(String(bare), /tracy-ds-slot/)
  assert.match(String(bare), /data-tracy-ds-preview/)
  assert.equal(await pages.pageOf({ ...q, claims: { ...q.claims, id: 'refused' } }), null)
  assert.equal(await pages.pageOf({ ...q, site: { platform: 'shopify' } }), null)
})

test("pageOf on WordPress: the judged theme's theme.json is read on the container, told the public host", async () => {
  const reads = []
  const pages = designSystemLivePages({
    emitFor: async () => ({
      ok: true,
      platform: 'wordpress',
      variation: { settings: {}, styles: { css: '.z{}' } }
    }),
    fontFaces: async () => [],
    now: () => NOW
  })
  const q = {
    html: WP_PAGE,
    claims: {
      site: 'shop',
      id: 'refero:0f9e',
      contract: 'wp-c',
      template: 'wordpress/wp-tracy-business',
      exp: 0
    },
    ticket: 'T.K',
    site: { platform: 'wordpress' },
    inner: new URL('http://shop-web'),
    pub: new URL('https://shop.tracy.test'),
    parentOrigin: 'https://tracy.test',
    fetchImpl: async (url, init) => {
      reads.push({ url: String(url), host: new Headers(init.headers).get('x-forwarded-host') })
      return new Response(JSON.stringify({ styles: { css: '' } }), { status: 200 })
    }
  }
  const out = await pages.pageOf(q)
  assert.deepEqual(reads, [
    { url: 'http://shop-web/wp-content/themes/wp-tracy-business/theme.json', host: 'shop.tracy.test' }
  ])
  assert.match(String(out), /data-tracy-ds-preview/)
  const other = await pages.pageOf({ ...q, claims: { ...q.claims, template: 'wordpress/another' } })
  assert.equal(other, null, 'a page another theme serves wears nothing')
})

test('a same-site redirect inside the live frame keeps the ticket; another site, or no address, is left alone', () => {
  const asked = 'http://vital.tracy.test:51710/index.php/your-profile'
  assert.equal(
    locationKeepingTicket('http://vital.tracy.test:51710/index.php/login-form', { asked, ticket: 't.k' }),
    'http://vital.tracy.test:51710/index.php/login-form?tracy_ds_preview=t.k'
  )
  assert.equal(
    locationKeepingTicket('/en/?a=1&tracy_ds_preview=old', { asked, ticket: 't.k' }),
    'http://vital.tracy.test:51710/en/?a=1&tracy_ds_preview=t.k'
  )
  assert.equal(locationKeepingTicket('https://accounts.example/login', { asked, ticket: 't.k' }), null)
  assert.equal(locationKeepingTicket(null, { asked, ticket: 't.k' }), null)
  assert.equal(locationKeepingTicket('http://[bad', { asked, ticket: 't.k' }), null)
})
