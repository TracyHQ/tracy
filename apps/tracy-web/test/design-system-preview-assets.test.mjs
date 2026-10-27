import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import {
  assetKindOf,
  assetLinkOf,
  cssForPreview,
  mountDesignSystemPreviewAssets,
  stylesheetsToAssets
} from '../src/sites/design-system-preview-assets.js'

const TAG = 'quickstart/ja-morgan/wp7'
const assetOf = assetLinkOf(
  `https://cowork.test/api/design-system/preview?quickstart=${encodeURIComponent(TAG)}&id=x`
)

test('assetKindOf: stylesheets and font files only', () => {
  assert.equal(assetKindOf('/a/b.css?ver=1'), 'css')
  assert.equal(assetKindOf('/fonts/fa-solid-900.woff2'), 'woff2')
  assert.equal(assetKindOf('/fonts/ionicons.ttf?v=2'), 'ttf')
  assert.equal(assetKindOf('/images/hero.jpg'), null)
  assert.equal(assetKindOf('/index.php'), null)
})

test('stylesheetsToAssets: a stylesheet of the demo loads through the door, others stay', () => {
  const html =
    '<head><link rel="stylesheet" href="/media/templates/site/ja_morgan/css/template.css?v=3">' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">' +
    '<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="https://other.test/x.css"></head>'
  const out = stylesheetsToAssets(html, { base: 'https://ja-morgan-wp.tracy.site/', assetOf })
  assert.ok(
    out.includes(
      `href="${assetOf('/media/templates/site/ja_morgan/css/template.css?v=3').replace(/&/g, '&amp;')}"`
    ),
    out
  )
  assert.ok(out.includes('https://fonts.googleapis.com/css2?family=Inter'))
  assert.ok(out.includes('href="/favicon.ico"'))
  assert.ok(out.includes('https://other.test/x.css'))
})

test('cssForPreview: fonts of the demo through the door, other relative addresses absolute at the demo', () => {
  const css = [
    "@font-face{font-family:'FontAwesome';src:url('../fonts/fontawesome-webfont.woff2?v=4.7.0') format('woff2'),url(../fonts/fontawesome-webfont.ttf) format('truetype')}",
    '.hero{background:url("../images/bg.jpg") no-repeat}',
    '.x{background:url(data:image/png;base64,AAAA)}',
    "@import url('https://fonts.googleapis.com/css2?family=Inter');",
    '@import "./more.css";'
  ].join('\n')
  const out = cssForPreview(css, {
    cssUrl: 'https://ja-morgan-wp.tracy.site/wp-content/themes/m/css/style.css',
    assetOf
  })
  assert.ok(
    out.includes(`url("${assetOf('/wp-content/themes/m/fonts/fontawesome-webfont.woff2?v=4.7.0')}")`),
    out
  )
  assert.ok(out.includes(`url("${assetOf('/wp-content/themes/m/fonts/fontawesome-webfont.ttf')}")`))
  assert.ok(out.includes('url("https://ja-morgan-wp.tracy.site/wp-content/themes/m/images/bg.jpg")'))
  assert.ok(out.includes('url(data:image/png;base64,AAAA)'))
  assert.ok(out.includes("url('https://fonts.googleapis.com/css2?family=Inter')"))
  assert.ok(out.includes(`@import "${assetOf('/wp-content/themes/m/css/more.css')}"`))
})

/** A mounted door over one demo whose container answers from `files`. */
function mounted({ files, signed = true }) {
  const app = new Hono()
  const fetched = []
  mountDesignSystemPreviewAssets(app, {
    signedIn: async (c) =>
      signed ? { email: 'a@b.test' } : { error: c.json({ code: 'NOT_SIGNED_IN' }, 401) },
    demoOf: async (tag) =>
      tag === TAG
        ? {
            address: 'https://ja-morgan-wp.tracy.site/',
            host: 'fleet01',
            label: 'ja-morgan-wp',
            platform: 'wordpress'
          }
        : null,
    innerOf: () => new URL('http://ja-morgan-wp-web-1/'),
    fetchImpl: async (url) => {
      fetched.push(String(url))
      const f = files[new URL(url).pathname]
      return f ? new Response(f, { status: 200 }) : new Response('no', { status: 404 })
    }
  })
  return { app, fetched }
}

const ask = (app, path, tag = TAG) =>
  app.request(
    `http://cowork.test/api/design-system/preview-asset?quickstart=${encodeURIComponent(tag)}&path=${encodeURIComponent(path)}`
  )

test('door: a font of the demo, read on its container, same-origin for the frame', async () => {
  const { app, fetched } = mounted({ files: { '/fonts/a.woff2': new Uint8Array([1, 2, 3]) } })
  const res = await ask(app, '/fonts/a.woff2')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'font/woff2')
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3])
  assert.deepEqual(fetched, ['http://ja-morgan-wp-web-1/fonts/a.woff2'])
})

test('door: a stylesheet comes back with its fonts pointed at the door', async () => {
  const { app } = mounted({ files: { '/css/s.css': '@font-face{src:url(../fonts/a.woff2)}' } })
  const res = await ask(app, '/css/s.css')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /^text\/css/)
  const body = await res.text()
  assert.ok(body.includes('/api/design-system/preview-asset?quickstart='), body)
  assert.ok(body.includes(encodeURIComponent('/fonts/a.woff2')))
})

test('door: never a picture, a page, an escape or an unknown demo; signed in only', async () => {
  const { app, fetched } = mounted({ files: { '/x.jpg': 'x', '/index.php': 'x' } })
  assert.equal((await ask(app, '/x.jpg')).status, 400)
  assert.equal((await ask(app, '/index.php')).status, 400)
  assert.equal((await ask(app, '/../etc/passwd.css')).status, 400)
  assert.equal((await ask(app, '//evil.test/a.css')).status, 400)
  assert.equal((await ask(app, '/a.css', 'quickstart/other/j6')).status, 404)
  assert.deepEqual(fetched, [])
  const out = mounted({ files: { '/a.css': 'x' }, signed: false })
  assert.equal((await ask(out.app, '/a.css')).status, 401)
})

// Measured 14/10/2026 on cowork.tracy.site after PR #1356: every stylesheet of every demo on host `fleet01` answered
// 502 DEMO_UNREADABLE, since the door read such a demo at `siteTarget`'s `<label>.<host>-sites.<domain>`, a two-level
// name the edge certificate does not cover, while the same file at the demo's public address answered 200. The door
// must read it the way the preview door does (`siteReadOrigin`), which needs the demo's address.
test('door: a demo on another host is read at its public address, never at the -sites name', async () => {
  const { siteReadOrigin } = await import('../src/sites/resolver.js')
  const app = new Hono()
  const fetched = []
  mountDesignSystemPreviewAssets(app, {
    signedIn: async () => ({ email: 'a@b.test' }),
    demoOf: async () => ({
      address: 'https://ja-directory-joomla.tracy.site/',
      host: 'fleet01',
      label: 'ja-directory-joomla',
      platform: 'joomla'
    }),
    innerOf: (demo) => siteReadOrigin(demo, { hostName: 'dev', siteDomain: 'tracy.site' }),
    fetchImpl: async (url) => {
      fetched.push(String(url))
      // A name with no certificate: the fetch itself fails, as Node's does on a TLS handshake refusal.
      if (new URL(url).hostname.includes('-sites.')) throw new TypeError('fetch failed')
      return new Response('body{color:red}', { status: 200 })
    }
  })
  const res = await ask(app, '/templates/ja_directory/css/template.css')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'body{color:red}')
  assert.deepEqual(fetched, [
    'https://ja-directory-joomla.tracy.site/templates/ja_directory/css/template.css'
  ])
})
