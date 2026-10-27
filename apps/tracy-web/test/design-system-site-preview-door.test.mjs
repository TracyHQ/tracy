/**
 * The running site's design system preview door (`GET /api/sites/:key/design-system/preview`,
 * `src/sites/design-system.js`): the site's own home page wearing a system, nothing written. Real
 * emitters and contracts (`lib/ds-slot.js`); a fake site container and a fake host.
 *
 *   node --test apps/tracy-web/test/design-system-site-preview-door.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'

import { mountDesignSystem } from '../src/sites/design-system.js'
import { previewShelf } from '../src/sites/design-system-preview.js'
import { slotBytesOf } from '../src/sites/design-system-preview-page.js'
import { PREVIEW_CSP } from '../src/sites/design-system-preview-links.js'
import { wordpressGlobalCssOf } from '../src/sites/design-system-preview-wordpress.js'
import { readDsPreviewTicket } from '../src/lib/ds-preview-ticket.js'
import {
  contractFor,
  emitFor,
  maxVersionOf,
  minVersionOf,
  rawTemplatesOf,
  referoLibrary,
  templateKeyOf,
  versionKeyOf
} from '../src/lib/ds-slot.js'

const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const NOTION = 'refero:2bf4c61f-de10-4614-ba1b-20c0453bd2a9'

const SITES = {
  emdash: {
    quickstart_tag: 'tracy-business/emdash-0.x',
    quickstart_version: '1.7.7',
    inner: 'http://shop-web-1:4321/'
  },
  joomla: { quickstart_tag: 'tracy-base/j6', quickstart_version: '1.0.2', inner: 'http://shop-web-1/' },
  wordpress: { quickstart_tag: 'tracy-base/wp7', quickstart_version: '1.1.2', inner: 'http://shop-web-1/' }
}

/** The home page as the site's container serves it: a worn slot, links on the container's own name. */
const HOME = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Shop</title>
<style id="tracy-ds-slot" data-ds="old">.worn-before{}</style></head>
<body><a href="INNER/about/">About</a><h1>Fresh bread daily</h1></body></html>`

/** A WordPress home (the `tracy` theme): its global styles block ends with a system the site wears. */
const WP_HOME = `<!DOCTYPE html><html lang="en"><head><title>Shop</title>
<style id="global-styles-inline-css">:root{--wp--preset--color--bg: #fff;}/* tracy-ds-slot: refero:old */.worn-before{}</style>
<link rel='stylesheet' href='INNER/wp-content/themes/tracy/assets/css/tracy.css'></head>
<body><h1>Fresh bread daily</h1></body></html>`

function mounted({
  platform = 'emdash',
  role = 'viewer',
  template = 'tracy_base',
  /** WordPress: the theme version the container's read reports (the contract's judge for this platform). */
  themeVersion = '1.1.5',
  page = HOME,
  insist = false,
  paths = /** @type {Record<string, any>} */ ({}),
  /** The slot the container's read says the site wears. */
  worn = /** @type {any} */ (null)
} = {}) {
  /** @type {string[]} */
  const fetched = []
  /** @type {any[]} */
  const jobs = []
  let slot = worn
  let n = 0
  const rows = []
  const site = {
    site_key: 'shop.localhost',
    label: 'shop',
    host: 'local',
    platform,
    address: null,
    ...SITES[platform]
  }
  const app = new Hono()
  mountDesignSystem(app, {
    requireGrant: async () => ({ kind: 'session', email: 'v@x.test', grant: { role } }),
    siteByKey: async () => site,
    toolsetRefusal: async (auth) =>
      auth.grant.role === 'viewer' ? { toolset: 'code', role: 'viewer' } : null,
    // The host plays `site-ds-slot`: every run says the template; apply and undo change the slot.
    runJob: async (_s, input) => {
      jobs.push(input)
      // The read says the template: Joomla its template name, WordPress its theme (`stylesheet`) and version.
      const runs =
        platform === 'joomla'
          ? { template }
          : platform === 'wordpress'
            ? { stylesheet: template === 'tracy_base' ? 'tracy-base' : template, themeVersion }
            : {}
      if (input.mode === 'read') return { ok: true, output: JSON.stringify({ ok: true, slot, ...runs }) }
      if (input.mode === 'apply') {
        slot = { id: input.payload.system, name: null }
        const undoId = String(++n).padStart(12, '0')
        return { ok: true, output: JSON.stringify({ ok: true, undoId, slot, previous: null, ...runs }) }
      }
      slot = null
      return { ok: true, output: JSON.stringify({ ok: true, slot, ...runs }) }
    },
    lease: { take: async () => ({ ok: true, fresh: true }), release: async () => {} },
    record: async () => {},
    store: {
      insert: async (r) => {
        rows.push({
          undo_id: r.undoId,
          system_id: r.systemId,
          system_name: r.systemName,
          applied_at: new Date(),
          undone_at: null
        })
      },
      latest: async () => rows.at(-1) ?? null,
      markUndone: async (_k, id) => {
        const r = rows.find((x) => x.undo_id === id)
        if (r) r.undone_at = new Date()
      }
    },
    ds: {
      refero: referoLibrary,
      templateKeyOf,
      contractFor,
      rawTemplatesOf,
      versionKeyOf,
      minVersionOf,
      maxVersionOf,
      emitFor
    },
    preview: {
      innerOf: () => new URL(SITES[platform].inner),
      publicOf: () => 'http://shop.tracy.test:51710/',
      origin: 'http://tracy.test:51710',
      secret: 'door-secret',
      fetchImpl: /** @type {any} */ (
        async (url, init = {}) => {
          fetched.push(String(url))
          // `paths`: what one path of the site answers (a page, a redirect, a file, nothing).
          const own = paths[`${new URL(String(url)).pathname}${new URL(String(url)).search}`]
          if (own)
            return own.redirect
              ? new Response(null, { status: 302, headers: { location: own.redirect } })
              : new Response(own.body ?? '', {
                  status: own.status ?? 200,
                  headers: { 'content-type': own.type ?? 'text/html; charset=utf-8' }
                })
          if (page === null) return new Response('down', { status: 503 })
          // `insist`: a site that redirects to its public root unless told it (WordPress with Polylang).
          const h = new Headers(init.headers)
          if (
            insist &&
            (h.get('x-forwarded-host') !== 'shop.tracy.test:51710' || h.get('x-forwarded-proto') !== 'http')
          )
            return new Response(null, { status: 301, headers: { location: 'http://shop.tracy.test:51710/' } })
          if (String(url).endsWith('/theme.json'))
            return new Response(JSON.stringify({ styles: { css: '.theme-own{}' } }), {
              status: 200,
              headers: { 'content-type': 'application/json' }
            })
          return new Response(page.replace('INNER/', SITES[platform].inner), {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' }
          })
        }
      )
    }
  })
  return { app, fetched, jobs, rows }
}

const preview = (app, q) =>
  app.request(`/api/sites/shop.localhost/design-system/preview?${new URLSearchParams(q).toString()}`)
/** A same-site link as a served page carries it: this door, the same query, plus `path`, in attribute form. */
const doorTo = (/** @type {Record<string, string>} */ q, /** @type {string} */ path) =>
  `http://tracy.test:51710/api/sites/shop.localhost/design-system/preview?${new URLSearchParams({ ...q, path }).toString()}`.replace(
    /&/g,
    '&amp;'
  )
const post = (app, path, body) =>
  app
    .request(`/api/sites/shop.localhost/design-system${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then((r) => r.json())

test('emdash, a viewer: the site home on its container, the apply bytes in, the worn slot out, sandboxed', async () => {
  const { app, fetched, jobs } = mounted({ platform: 'emdash', role: 'viewer' })
  // An address in the query is never read: the door reads only the site's own container.
  const res = await preview(app, { id: MOXIE, url: 'http://evil.test/' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/)
  const html = await res.text()
  const out = await emitFor({ platform: 'emdash', contract: 'emdash-tracy-business', id: MOXIE })
  assert.ok(
    html.includes(`${slotBytesOf(out)}</head>`),
    'exactly the bytes an apply writes, last in the head'
  )
  assert.ok(!html.includes('.worn-before{}'), 'the slot the site wears is taken off')
  assert.ok(html.includes('<base href="http://shop.tracy.test:51710/">'))
  assert.ok(
    html.includes(`href="${doorTo({ id: MOXIE }, '/about/')}" target="_self"`),
    'container links made public, then pointed at this door with their path'
  )
  assert.deepEqual(fetched, ['http://shop-web-1:4321/'])
  assert.deepEqual(jobs, [], 'EmDash: no run in the container, nothing written')
})

test('joomla with the template the panel read: its contract, no run; without it: one read, never a write', async () => {
  const { app, jobs } = mounted({ platform: 'joomla' })
  const hint = templateKeyOf({ platform: 'joomla', template: 'tracy_base' })
  const res = await preview(app, { id: MOXIE, template: String(hint) })
  assert.equal(res.status, 200)
  const out = await emitFor({ platform: 'joomla', contract: 'joomla-tracy-base', id: MOXIE })
  assert.ok((await res.text()).includes(`${out.html}</head>`))
  assert.deepEqual(jobs, [])
  const again = await preview(app, { id: NOTION })
  assert.equal(again.status, 200)
  assert.deepEqual(
    jobs.map((j) => j.mode),
    ['read']
  )
})

test('wordpress: the site home with its global styles block as the variation makes it, nothing written', async () => {
  const { app, fetched, jobs } = mounted({ platform: 'wordpress', page: WP_HOME })
  const res = await preview(app, { id: MOXIE, template: 'wordpress/tracy-base' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
  const html = await res.text()
  const out = await emitFor({ platform: 'wordpress', contract: 'wordpress-tracy-base', id: MOXIE })
  assert.equal(out.ok, true)
  const block = /<style id="global-styles-inline-css">([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
  assert.ok(!block.includes('.worn-before{}'), 'the system the site wears is taken off')
  assert.equal(block, `:root{--wp--preset--color--bg: #fff;}${wordpressGlobalCssOf(out.variation)}\n`)
  // The theme's stylesheet loads through the site asset door (same origin as the frame, 34df1669e8),
  // never at the container's name.
  const sheet = `http://tracy.test:51710/api/sites/shop.localhost/design-system/preview-asset?${new URLSearchParams({ path: '/wp-content/themes/tracy/assets/css/tracy.css' })}`
  assert.ok(html.includes(`href='${sheet}'`), 'the theme stylesheet goes through the site asset door')
  assert.ok(!html.includes('INNER/') && !html.includes('shop-web-1'), 'no container link left in the page')
  assert.deepEqual(fetched, ['http://shop-web-1/', 'http://shop-web-1/wp-content/themes/tracy/theme.json'])
  // WordPress: the hint is not trusted on its own (the theme version is the container's to tell), so one read;
  // a second page of the same site inside the minute reuses it.
  assert.deepEqual(
    jobs.map((j) => j.mode),
    ['read']
  )
  const again = await preview(app, { id: NOTION, template: 'wordpress/tracy-base' })
  assert.equal(again.status, 200)
  assert.deepEqual(
    jobs.map((j) => j.mode),
    ['read'],
    'the survey is kept'
  )
})

test('wordpress whose page has no global styles block (another theme under the name of ours) is NO_SLOT, not a failure', async () => {
  const bare = WP_HOME.replace(/<style id="global-styles-inline-css">[\s\S]*?<\/style>/, '')
  assert.ok(!bare.includes('global-styles-inline-css'))
  const { app } = mounted({ platform: 'wordpress', page: bare })
  const res = await preview(app, { id: MOXIE, template: 'wordpress/tracy-base' })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_SLOT' })
})

test('an obfuscated address in the page is put back for the frame (Cloudflare email protection)', async () => {
  // Encoded the way Cloudflare does: a key byte, then every byte XOR the key.
  const hex = [0x5a, ...new TextEncoder().encode('hello@shop.example')]
    .map((b, i) => (i === 0 ? b : b ^ 0x5a).toString(16).padStart(2, '0'))
    .join('')
  const page = WP_HOME.replace(
    '<body>',
    `<body><a href="/cdn-cgi/l/email-protection#${hex}"><span class="__cf_email__" data-cfemail="${hex}">[email&#160;protected]</span></a>`
  )
  const { app } = mounted({ platform: 'wordpress', page })
  const res = await preview(app, { id: MOXIE, template: 'wordpress/tracy-base' })
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(!html.includes('data-cfemail'), 'the obfuscated span is gone')
  assert.ok(html.includes('mailto:'), html.slice(0, 400))
})

test('wordpress that insists on its own address: the page and its theme.json are read told the public host', async () => {
  const { app, fetched } = mounted({ platform: 'wordpress', page: WP_HOME, insist: true })
  const res = await preview(app, { id: MOXIE, template: 'wordpress/tracy-base' })
  assert.equal(res.status, 200)
  assert.match(await res.text(), /<base href="http:\/\/shop\.tracy\.test:51710\/">/)
  assert.deepEqual(fetched, ['http://shop-web-1/', 'http://shop-web-1/wp-content/themes/tracy/theme.json'])
})

test('a template that cannot wear a system: NO_SLOT; a page that does not answer: DS_PREVIEW_FAILED', async () => {
  const cannot = mounted({ platform: 'joomla', template: 'cassiopeia' })
  const r1 = await preview(cannot.app, { id: MOXIE })
  assert.equal(r1.status, 409)
  assert.deepEqual(await r1.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_SLOT' })
  assert.deepEqual(cannot.fetched, [])
  const down = mounted({ platform: 'emdash', page: null })
  const r2 = await preview(down.app, { id: MOXIE })
  assert.equal(r2.status, 502)
  assert.equal((await r2.json()).code, 'DS_PREVIEW_FAILED')
})

test('template-default: the page with the worn slot taken off and nothing laid in; a worn WordPress page is NO_BARE', async () => {
  for (const platform of ['emdash', 'joomla']) {
    const { app } = mounted({ platform })
    const res = await preview(app, { id: 'template-default' })
    assert.equal(res.status, 200, platform)
    assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
    const html = await res.text()
    assert.ok(!html.includes('.worn-before{}'), `${platform}: the slot the site wears is taken off`)
    assert.ok(!html.includes('tracy-ds-slot'), `${platform}: no system is laid in`)
    assert.ok(html.includes('<h1>Fresh bread daily</h1>'), `${platform}: the site's own page`)
  }
  const worn = mounted({ platform: 'wordpress', page: WP_HOME })
  const r1 = await preview(worn.app, { id: 'template-default', template: 'wordpress/tracy-base' })
  assert.equal(r1.status, 409)
  assert.deepEqual(await r1.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_BARE' })
  const plain = mounted({
    platform: 'wordpress',
    page: WP_HOME.replace('/* tracy-ds-slot: refero:old */.worn-before{}', '')
  })
  const r2 = await preview(plain.app, { id: 'template-default', template: 'wordpress/tracy-base' })
  assert.equal(r2.status, 200, 'a WordPress site wearing nothing: its page as served')
  assert.ok((await r2.text()).includes(':root{--wp--preset--color--bg: #fff;}</style>'))
})

test('an unknown or OpenDesign id is refused before anything is read', async () => {
  const { app, fetched } = mounted()
  for (const id of ['od:stripe', 'refero:00000000-0000-0000-0000-000000000000', '']) {
    const res = await preview(app, { id })
    assert.equal(res.status, 400, id)
  }
  assert.deepEqual(fetched, [])
})

test('kept per site and system; an apply and an undo of the site forget it', async () => {
  const { app, fetched, rows } = mounted({ platform: 'emdash', role: 'owner' })
  assert.equal((await preview(app, { id: MOXIE })).status, 200)
  assert.equal((await preview(app, { id: MOXIE })).status, 200)
  assert.equal(fetched.length, 1, 'the second open reads nothing')
  const applied = await post(app, '', { id: NOTION })
  assert.equal(applied.ok, true)
  assert.equal((await preview(app, { id: MOXIE })).status, 200)
  assert.equal(fetched.length, 2, 'after an apply the page is read again')
  assert.equal((await preview(app, { id: MOXIE })).status, 200)
  assert.equal(fetched.length, 2)
  const undone = await post(app, '/undo', { applyId: rows.at(-1).undo_id })
  assert.equal(undone.ok, true)
  assert.equal((await preview(app, { id: MOXIE })).status, 200)
  assert.equal(fetched.length, 3, 'after an undo the page is read again')
})

test('the shelf: kept while fresh, forgotten by site, and a build under way when forgotten is never kept', async () => {
  let t = 0
  let builds = 0
  const shelf = previewShelf({ keepMs: 1000, max: 2, now: () => t })
  const build = async () => ({ html: `page ${++builds}` })
  assert.deepEqual(await shelf.take('a\n1', build), { html: 'page 1' })
  assert.deepEqual(await shelf.take('a\n1', build), { html: 'page 1' })
  shelf.forget('a\n')
  assert.deepEqual(await shelf.take('a\n1', build), { html: 'page 2' })
  /** @type {(v: any) => void} */
  let finish = () => {}
  const slow = shelf.take('b\n1', () => new Promise((r) => (finish = r)))
  shelf.forget('b\n')
  finish({ html: 'stale' })
  assert.deepEqual(await slow, { html: 'stale' }, 'its waiters still get it')
  assert.deepEqual(await shelf.take('b\n1', build), { html: 'page 3' }, 'but it was not kept')
  t = 2000
  assert.deepEqual(await shelf.take('a\n1', build), { html: 'page 4' }, 'past keepMs it is built again')
})

test('path: another page of the site, read on its container, wearing the system, its links browsable too', async () => {
  const { app, fetched } = mounted({
    platform: 'emdash',
    paths: {
      '/about/': {
        body: `<!DOCTYPE html><html><head><title>About</title></head><body><a href="/">Home</a>
<a href="/services/#price">Services</a><a href="https://instagram.com/shop">IG</a><a href="#team">Team</a></body></html>`
      }
    }
  })
  const q = { id: MOXIE, path: '/about/' }
  const res = await preview(app, q)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
  const html = await res.text()
  const out = await emitFor({ platform: 'emdash', contract: 'emdash-tracy-business', id: MOXIE })
  assert.ok(html.includes(`${slotBytesOf(out)}</head>`), 'the same bytes on this page')
  assert.ok(
    html.includes('<base href="http://shop.tracy.test:51710/about/">'),
    'its assets still load from the site'
  )
  const base = { id: MOXIE }
  assert.ok(html.includes(`<a href="${doorTo(base, '/')}" target="_self">Home</a>`), html)
  assert.ok(html.includes(`<a href="${doorTo(base, '/services/')}#price" target="_self">Services</a>`))
  assert.ok(
    html.includes('<a href="https://instagram.com/shop" target="_blank" rel="noopener noreferrer">IG</a>')
  )
  assert.ok(html.includes(`<a href="${doorTo(base, '/about/')}#team" target="_self">Team</a>`))
  assert.deepEqual(fetched, ['http://shop-web-1:4321/about/'])
})

test('path: only a same-site path; anything else is a small page in the frame, nothing read', async () => {
  const { app, fetched } = mounted({ platform: 'emdash' })
  for (const path of [
    '//evil.test/',
    'http://evil.test/',
    'https:evil.test',
    'evil.test',
    '/\\evil.test',
    '/a/../../etc/passwd',
    '/%2e%2e/admin',
    '/%2f%2fevil.test',
    '/a%00',
    `/${'x'.repeat(600)}`,
    ''
  ]) {
    const res = await preview(app, { id: MOXIE, path })
    assert.equal(res.status, 400, path)
    assert.match(res.headers.get('content-type') ?? '', /^text\/html/, path)
    assert.equal(res.headers.get('content-security-policy'), PREVIEW_CSP)
    assert.match(await res.text(), /can.t be previewed/i)
  }
  assert.deepEqual(fetched, [])
})

test('path: a redirect is followed only on the same site; elsewhere, a page not found or a file is a small page', async () => {
  const { app, fetched } = mounted({
    platform: 'emdash',
    paths: {
      '/old': { redirect: 'http://shop.tracy.test:51710/new' },
      '/new': { body: '<html><head></head><body>New</body></html>' },
      '/away': { redirect: 'https://evil.test/' },
      '/gone': { status: 404, body: 'nope' },
      '/menu.pdf': { body: '%PDF', type: 'application/pdf' }
    }
  })
  const moved = await preview(app, { id: MOXIE, path: '/old' })
  assert.equal(moved.status, 200)
  assert.match(await moved.text(), /<base href="http:\/\/shop\.tracy\.test:51710\/new">/)
  const away = await preview(app, { id: MOXIE, path: '/away' })
  assert.equal(away.status, 409)
  assert.match(away.headers.get('content-type') ?? '', /^text\/html/)
  assert.match(await away.text(), /leaves the site/)
  const gone = await preview(app, { id: MOXIE, path: '/gone' })
  assert.equal(gone.status, 404)
  const goneHtml = await gone.text()
  assert.match(goneHtml, /not found/i)
  assert.ok(goneHtml.includes(`href="${doorTo({ id: MOXIE }, '/')}" target="_self"`), 'a way back home')
  const pdf = await preview(app, { id: MOXIE, path: '/menu.pdf' })
  assert.equal(pdf.status, 409)
  assert.match(await pdf.text(), /not a page/i)
  assert.ok(!fetched.some((u) => u.includes('evil.test')), 'never read off the site')
})

test('path: kept per page; the home page with and without path=/ is one page', async () => {
  const { app, fetched } = mounted({
    platform: 'emdash',
    paths: { '/about/': { body: '<html><head></head><body>About</body></html>' } }
  })
  assert.equal((await preview(app, { id: MOXIE })).status, 200)
  assert.equal((await preview(app, { id: MOXIE, path: '/' })).status, 200)
  assert.equal((await preview(app, { id: MOXIE, path: '/about/' })).status, 200)
  assert.equal((await preview(app, { id: MOXIE, path: '/about/' })).status, 200)
  assert.deepEqual(fetched, ['http://shop-web-1:4321/', 'http://shop-web-1:4321/about/'])
})

test('wordpress: a theme that merely shares a name with ours, at a version the contract never saw, is NO_SLOT and reads no page', async () => {
  // Measured 13/10/2026 on dev: the marketing site tracy.ai runs a theme named "tracy" at 0.1.0; the panel said
  // TEMPLATE_NEEDS_UPDATE, but the preview door trusted the panel's template hint and answered 502.
  const { app, fetched } = mounted({
    platform: 'wordpress',
    template: 'tracy',
    themeVersion: '0.1.0',
    page: WP_HOME
  })
  const res = await preview(app, { id: MOXIE, template: 'wordpress/tracy-base' })
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { code: 'DS_PREVIEW_UNAVAILABLE', reason: 'NO_SLOT' })
  assert.deepEqual(fetched, [], 'the page is never read when the template does not qualify')
})

// Akemi 17/10/2026 (JA Vital "LEARN MORE →"): the popup's frame is Tracy's origin and the site sends no
// CORS header, so the icon fonts its stylesheets name were refused and every icon drew an empty square.
const JOOMLA_FA_HOME = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Shop</title>
<link href="/plugins/system/t4/themes/base/vendors/font-awesome6/css/all.min.css?v=1" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"></head>
<body><a class="btn" href="/about">Learn more <i class="fas fa-arrow-right"></i></a></body></html>`
const FA_CSS =
  '@font-face{font-family:"Font Awesome 6 Free";src:url(../webfonts/fa-solid-900.woff2) format("woff2")}'
const FA_PATH = '/plugins/system/t4/themes/base/vendors/font-awesome6/css/all.min.css?v=1'
const FONT_PATH = '/plugins/system/t4/themes/base/vendors/font-awesome6/webfonts/fa-solid-900.woff2'

test('the site preview loads the site stylesheets and their fonts through the site asset door (same origin as the frame)', async () => {
  const { app, fetched } = mounted({
    platform: 'joomla',
    page: JOOMLA_FA_HOME,
    paths: {
      [FA_PATH]: { body: FA_CSS, type: 'text/css' },
      [FONT_PATH]: { body: 'wOF2fake', type: 'font/woff2' }
    }
  })
  const res = await preview(app, { id: MOXIE, template: 'joomla/tracy-base' })
  assert.equal(res.status, 200)
  const html = await res.text()
  const door = `http://tracy.test:51710/api/sites/shop.localhost/design-system/preview-asset?${new URLSearchParams({ path: FA_PATH })}`
  assert.ok(html.includes(`href="${door.replace(/&/g, '&amp;')}"`), html.slice(0, 900))
  // Another host's stylesheet is left as it is (it loads cross-origin without CORS; its fonts carry their own).
  assert.ok(html.includes('https://fonts.googleapis.com/css2?family=Inter'))

  const css = await app.request(new URL(door).pathname + new URL(door).search)
  assert.equal(css.status, 200)
  assert.match(css.headers.get('content-type') ?? '', /^text\/css/)
  const body = await css.text()
  const fontDoor = `http://tracy.test:51710/api/sites/shop.localhost/design-system/preview-asset?${new URLSearchParams({ path: FONT_PATH })}`
  assert.ok(body.includes(`url("${fontDoor}")`), body)

  const font = await app.request(new URL(fontDoor).pathname + new URL(fontDoor).search)
  assert.equal(font.status, 200)
  assert.equal(font.headers.get('content-type'), 'font/woff2')
  assert.equal(await font.text(), 'wOF2fake')
  // Read on the site's own container only.
  assert.ok(fetched.includes(`http://shop-web-1${FONT_PATH}`), fetched.join('\n'))
})

test('the site asset door: only stylesheets and fonts of a same-site path; a page or an escape is refused, nothing read', async () => {
  const { app, fetched } = mounted({ platform: 'joomla', page: JOOMLA_FA_HOME })
  const ask = (path) =>
    app.request(`/api/sites/shop.localhost/design-system/preview-asset?${new URLSearchParams({ path })}`)
  const before = fetched.length
  assert.equal((await ask('/index.php')).status, 400)
  assert.equal((await ask('//evil.test/x.css')).status, 400)
  assert.equal((await ask('/../etc/x.css')).status, 400)
  assert.equal(fetched.length, before)
})

test('live=1: the site itself at its own address with a signed ticket for what the door judged; nothing is read or written', async () => {
  const { app, fetched, jobs } = mounted({ platform: 'emdash' })
  const res = await preview(app, { id: MOXIE, live: '1' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.live, true)
  const src = new URL(body.src)
  assert.equal(src.origin, 'http://shop.tracy.test:51710')
  assert.equal(src.pathname, '/')
  const claims = readDsPreviewTicket(
    'door-secret',
    src.searchParams.get('tracy_ds_preview'),
    'shop.localhost'
  )
  assert.ok(claims)
  assert.equal(claims.id, MOXIE)
  assert.equal(claims.contract, 'emdash-tracy-business')
  assert.ok(body.mode === null || body.mode === 'light' || body.mode === 'dark')
  assert.deepEqual(fetched, [], 'the page is not read: the proxy serves it')
  assert.deepEqual(jobs, [])
  // the same gates as the page: an unknown system is refused, no ticket
  const unknown = await preview(app, { id: 'refero:00000000-0000-0000-0000-000000000000', live: '1' })
  assert.equal(unknown.status, 400)
})

test('live=1, template default: Joomla gets a ticket with no contract; a WordPress site wearing a system is NO_BARE', async () => {
  const j = mounted({ platform: 'joomla' })
  const res = await preview(j.app, { id: 'template-default', live: '1', template: 'joomla/tracy_base' })
  assert.equal(res.status, 200)
  const src = new URL((await res.json()).src)
  const claims = readDsPreviewTicket(
    'door-secret',
    src.searchParams.get('tracy_ds_preview'),
    'shop.localhost'
  )
  assert.equal(claims?.id, 'template-default')
  assert.equal(claims?.contract, '')
  const w = mounted({ platform: 'wordpress', page: WP_HOME, worn: { id: 'refero:old', name: null } })
  const worn = await preview(w.app, { id: 'template-default', live: '1' })
  assert.equal(worn.status, 409)
  assert.equal((await worn.json()).reason, 'NO_BARE')
})
