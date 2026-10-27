// Browser integration for #69/#70/#75: two separate origins (a "source" and a "port"), one design
// contract measured on the source and audited against the port through a target map, a source whose
// CSRF token changes on every load captured by the preflight's resource log in a real page, a
// redirect route judged by its own answer, and a looping carousel's clones. Chromium is real; every
// server is on 127.0.0.1; every scratch file lives under $TRACY_TEST_ROOT.
import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { withBrowser } from '../lib/browser.mjs'
import { auditDesign, designHash, designRequest, validateTarget } from '../design-contract.mjs'
import { captureDesign } from '../design-probe.mjs'
import { runFunctional } from '../review/functional.mjs'
import { inPageTextIndex } from '../visual/visual-qa.mjs'
import { fetchHash, LOCK_FILE, LOCK_SCHEMA, lockDigest, resourceLog, stableJson, variedBodies, verifyRun } from '../visual/preflight.mjs'
import { contentPages, measureIntrinsic } from '../visual/intrinsic-mobile.mjs'
import { testDir } from './lib/test-root.mjs'

const servers = []
async function serve(handler) {
  const state = { handler, hits: 0 }
  const srv = createServer((req, res) => {
    state.hits++
    state.handler(req, res, state)
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  servers.push(srv)
  return { state, origin: `http://127.0.0.1:${srv.address().port}`, set: (h) => (state.handler = h) }
}
after(async () => {
  for (const s of servers) await new Promise((r) => s.close(r))
})
const html = (res, body, status = 200, headers = {}) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers })
  res.end(body)
}
const modeOf = (req) => new URL(req.url, 'http://x').searchParams.get('mode') ?? 'light'

// ── one contract, two origins ────────────────────────────────────────────────────────────────────

const sourcePage = (mode, { h1 = '40px' } = {}) =>
  `<!doctype html><html lang="en" data-theme="${mode}"><head><meta charset="utf-8"><style>:root{--space:16px}body{margin:0}.page-header h1{font-size:${h1};font-weight:700}.t3-mainbody{padding-left:16px}.btn{border-radius:12px;display:inline-block}</style></head>` +
  `<body><div class="t3-mainbody"><div class="page-header"><h1>Welcome</h1></div><a class="btn">Go</a></div></body></html>`
const portPage = (mode, { h1 = '40px', heading = true } = {}) =>
  `<!doctype html><html lang="en" data-theme="${mode}"><head><meta charset="utf-8"><style>:root{--space:16px}body{margin:0}main h1{font-size:${h1};font-weight:700}main{padding-left:16px;display:block}.wp-btn{border-radius:12px;display:inline-block}</style></head>` +
  `<body><main>${heading ? '<h1>Welcome</h1>' : '<h2>Welcome</h2>'}<a class="wp-btn">Go</a></main></body></html>`

function contractFor(sourceOrigin) {
  const variants = ['desktop', 'mobile'].flatMap((size) => ['light', 'dark'].map((mode) => ({ id: `${size}-${mode}`, mode, width: size === 'desktop' ? 1440 : 390, height: 800 })))
  const rule = (id, category, selector, props) => ({ id, category, selector, styles: Object.fromEntries(variants.map((v) => [v.id, props])) })
  const rules = [
    rule('heading', 'typography', '.page-header h1', { fontSize: '40px', fontWeight: '700' }),
    rule('colors', 'color', 'body', { marginLeft: '0px' }),
    rule('spacing', 'layout', '.t3-mainbody', { paddingLeft: '16px' }),
    rule('button', 'component', '.btn', { borderRadius: '12px' })
  ]
  return {
    schemaVersion: 1,
    id: 'nova',
    revision: 1,
    source: { reference: sourceOrigin, inspiration: 'nova', version: '1', capturedAt: '2026-01-01T00:00:00Z' },
    theme: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' },
    variants,
    tokens: Object.fromEntries(variants.map((v) => [v.id, { '--space': '16px' }])),
    rules,
    coverage: [{ selector: '.page-header h1', properties: ['fontSize', 'fontWeight'] }],
    pages: [{ id: 'home', url: `${sourceOrigin}/home?mode={mode}`, expectedUrl: `${sourceOrigin}/home?mode={mode}`, identity: '.t3-mainbody', rules: rules.map((r) => r.id), requiredRules: ['heading'] }],
    pilotPages: ['home'],
    exceptions: [],
    pending: []
  }
}
const targetFor = (c, origin) =>
  validateTarget(c, { schemaVersion: 1, contractHash: designHash(c), origin, pages: { home: { identity: 'main' } }, rules: { heading: 'main h1', spacing: 'main', button: '.wp-btn' }, coverage: { '.page-header h1': 'main h1' } })

async function captureAll(browser, c, target = null) {
  const out = []
  for (const v of c.variants) {
    const req = designRequest(c, 'home', v.id, target)
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } })
    try {
      const page = await ctx.newPage()
      await page.goto(req.url, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      out.push(await page.evaluate(captureDesign, req))
    } finally {
      await ctx.close()
    }
  }
  return out
}

let source, port, browserRun
before(async () => {
  source = await serve((req, res) => html(res, sourcePage(modeOf(req))))
  port = await serve((req, res) => html(res, portPage(modeOf(req))))
})

test('a contract measured on the source audits the port through a target map; real defects and stale evidence fail', async () => {
  const c = contractFor(source.origin)
  const t = targetFor(c, port.origin)
  await withBrowser(async (browser) => {
    // the contract holds on its own source: the expectations are the source's
    const onSource = await captureAll(browser, c)
    assert.equal(auditDesign(c, onSource).ok, true, JSON.stringify(auditDesign(c, onSource).findings))
    // the port, addressed and selected through the map
    const onPort = await captureAll(browser, c, t)
    const report = auditDesign(c, onPort, { target: t })
    assert.equal(report.ok, true, JSON.stringify(report.findings))
    assert.equal(report.observedCases, 4)
    assert.ok(onPort.every((o) => o.url.startsWith(port.origin) && o.targetMapHash === report.targetMapHash))
    // evidence captured without the map (the source's selectors on the port) is refused, both ways
    assert.throws(() => auditDesign(c, onPort), /Unexpected final URL/)
    assert.throws(() => auditDesign(c, onSource, { target: t }), /Unexpected final URL/)
    // a real defect on the port: the 40px heading is 30px — a finding against the SOURCE's value
    port.set((req, res) => html(res, portPage(modeOf(req), { h1: '30px' })))
    const wrong = auditDesign(c, await captureAll(browser, c, t), { target: t })
    assert.equal(wrong.ok, false)
    assert.ok(wrong.findings.some((f) => f.property === 'fontSize' && f.expected === '40px' && f.actual === '30px'))
    // the required heading is gone: nothing matches the mapped selector, so there is no coverage to
    // classify and the audit refuses the evidence (never a pass)
    port.set((req, res) => html(res, portPage(modeOf(req), { heading: false })))
    const goneObs = await captureAll(browser, c, t)
    assert.throws(() => auditDesign(c, goneObs, { target: t }), /classification coverage/)
    // a map written for an older contract cannot audit a newer one
    const newer = { ...c, revision: 2, exceptions: [] }
    newer.rules = c.rules.map((r) => ({ ...r }))
    newer.tokens = { ...c.tokens, 'desktop-light': { '--space': '8px' } }
    assert.throws(() => auditDesign(newer, onPort, { target: t }), /stale/)
    port.set((req, res) => html(res, portPage(modeOf(req))))
  })
})

test('a source token is read from its port name and root through the map; the source value stays the expectation', async () => {
  const c = contractFor(source.origin)
  const base = { schemaVersion: 1, contractHash: designHash(c), origin: port.origin, pages: { home: { identity: 'main' } }, rules: { heading: 'main h1', spacing: 'main', button: '.wp-btn' }, coverage: { '.page-header h1': 'main h1' } }
  const t = validateTarget(c, { ...base, tokens: { '--space': '--wp--preset--spacing--space' }, tokenRoot: 'main' })
  const tokenPort = (mode, v) => `<!doctype html><html lang="en" data-theme="${mode}"><head><meta charset="utf-8"><style>body{margin:0}main{--wp--preset--spacing--space:${v};padding-left:16px;display:block}main h1{font-size:40px;font-weight:700}.wp-btn{border-radius:12px;display:inline-block}</style></head><body><main><h1>Welcome</h1><a class="wp-btn">Go</a></main></body></html>`
  const tp = await serve((req, res) => html(res, tokenPort(modeOf(req), '16px')))
  const t2 = validateTarget(c, { ...base, origin: tp.origin, tokens: t.tokens, tokenRoot: 'main' })
  await withBrowser(async (browser) => {
    const ok = await captureAll(browser, c, t2)
    assert.equal(auditDesign(c, ok, { target: t2 }).ok, true)
    assert.equal(ok[0].tokens['--space'], '16px')
    tp.set((req, res) => html(res, tokenPort(modeOf(req), '8px')))
    const wrong = auditDesign(c, await captureAll(browser, c, t2), { target: t2 })
    assert.ok(wrong.findings.some((f) => f.expected === '16px' && f.actual === '8px'), 'the source value is still the expectation')
    // the source name on the port (no such token there) reads empty and fails
    const unmapped = validateTarget(c, { ...base, origin: tp.origin })
    assert.equal(auditDesign(c, await captureAll(browser, c, unmapped), { target: unmapped }).ok, false)
    // a root that is not there reads nothing
    const noRoot = validateTarget(c, { ...base, origin: tp.origin, tokens: t.tokens, tokenRoot: '.nowhere' })
    assert.equal(auditDesign(c, await captureAll(browser, c, noRoot), { target: noRoot }).ok, false)
  })
})

// ── the source's CSRF token, captured by the real resource log, verified against the lock ───────

const T = (n) => n.toString(16).padStart(32, '0')
const joomla = (n, { text = 'Contact' } = {}) =>
  `<!doctype html><html><head><meta charset="utf-8"><script type="application/json" class="joomla-script-options new">{"csrf.token":"${T(n)}","system.paths":{"root":""}}</script></head>` +
  `<body><main><h1>${text}</h1><form method="post"><input type="text" name="q"><input type="hidden" name="${T(n)}" value="1"></form></main></body></html>`

test('preflight capture in Chromium: a page that changes only its token is one identity; a real change is not; the lock verifies', async () => {
  let n = 0
  let text = 'Contact'
  const src = await serve((req, res) => html(res, joomla((n += 1), { text })))
  const dir = testDir('visual-fixes-lock')
  await withBrowser(async (browser) => {
    const load = async (log) => {
      const ctx = await browser.newContext({ extraHTTPHeaders: { 'accept-encoding': 'identity' } })
      try {
        const page = await ctx.newPage()
        const settle = log.attach(page, 'source')
        await page.goto(`${src.origin}/`, { waitUntil: 'load' })
        await settle()
      } finally {
        await ctx.close()
      }
    }
    const log = resourceLog()
    await load(log)
    await load(log)
    await load(log)
    const key = `source document ${src.origin}/`
    const e = log.entries.get(key)
    assert.equal(e.sha256s.length, 3, 'three loads, three token values, three raw digests')
    assert.equal(e.identities.length, 1, JSON.stringify(e.identities))
    assert.equal(e.identities[0].policy, 'joomla-csrf-v1')
    assert.deepEqual(variedBodies([...log.entries.values()]), [], 'the run has no "different bodies" problem left')
    assert.deepEqual(log.unresolved, [])
    // the lock as the run writes it, verified against the source as it serves now (another token)
    const out = path.join(dir, 'run')
    mkdirSync(out, { recursive: true })
    const { side: _s, type: _t, ...doc } = e
    const lock = { schema: LOCK_SCHEMA, complete: true, epoch: { fingerprint: 'fp', sequence: 1 }, artifacts: {}, unresolved: [], source: { documents: [doc], stylesheets: [] } }
    lock.digest = lockDigest(lock)
    writeFileSync(path.join(out, LOCK_FILE), stableJson(lock))
    const reasons = async () => verifyRun(out, { fingerprint: 'fp', sourceNow: { [`${src.origin}/`]: await fetchHash(`${src.origin}/`) } }).reasons.filter((r) => r.startsWith('source '))
    assert.deepEqual(await reasons(), [])
    // injected real defects: visible text changed; the token printed as content; a status change
    text = 'Contact us'
    assert.match((await reasons()).join(), /serves other bytes/)
    const changed = resourceLog()
    await load(changed)
    text = 'Contact'
    await load(changed)
    assert.equal(changed.entries.get(key).identities.length, 2, 'a real content change between loads is two identities')
    assert.match(variedBodies([...changed.entries.values()]).join(), /2 different bodies/)
    src.set((req, res) => html(res, joomla(7), 503))
    assert.match((await reasons()).join(), /answers 503 now/)
  })
})

// ── S-47 (functional) and S-18 (image census) in a real page ─────────────────────────────────────

test('S-47: a route declared 303 is judged by its own answer; a wrong declaration still fails', async () => {
  const site = await serve((req, res) => {
    const p = new URL(req.url, 'http://x').pathname
    if (p === '/user-profile') return res.writeHead(303, { location: '/login/' }), res.end()
    if (p === '/moved') return res.writeHead(301, { location: '/login/' }), res.end()
    if (p === '/login/' || p === '/') return html(res, '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><main><h1>Login</h1><img src="data:,"><form><input name="u"></form></main></body></html>')
    res.writeHead(404, { 'content-type': 'text/html' })
    res.end('<!doctype html><html lang="en"><head><link rel="icon" href="data:,"></head><body><main><h1>x</h1></main></body></html>')
  })
  await withBrowser(async (browser) => {
    const run = (routes) => runFunctional(browser, { site: site.origin, routes, concurrency: 1, searchWord: 'zzz' })
    const kinds = (r, route) => r.routes.find((x) => x.route === route).findings.filter((f) => f.kind === 'page-status')
    const ok = await run([{ path: '/user-profile', status: 303 }, '/'])
    assert.deepEqual(kinds(ok, '/user-profile'), [], 'both stands answer 303')
    assert.equal(ok.routes.find((x) => x.route === '/user-profile').status, 303)
    assert.equal(ok.routes.find((x) => x.route === '/user-profile').expectedStatus, 303)
    // the destination's own defects (image without alt, unlabelled field) are not the redirect route's
    const redirected = ok.routes.find((x) => x.route === '/user-profile')
    assert.deepEqual(redirected.findings, [])
    assert.equal(redirected.redirect, true)
    assert.deepEqual(ok.routes.find((x) => x.route === '/').findings.map((f) => f.kind).filter((k) => /img-alt|form-/.test(k)).sort(), ['form-label', 'form-submit', 'img-alt'], 'the destination is audited under its own route')
    // declared 200 on a route that answers 303: the route's own answer is 303, not the login page's 200
    assert.deepEqual(kinds(await run([{ path: '/user-profile', status: 200 }]), '/user-profile').map((f) => [f.status, f.expected]), [[303, 200]])
    // declared 303 but the route answers 301: a real difference
    const wrong = await run([{ path: '/moved', status: 303 }])
    assert.deepEqual(kinds(wrong, '/moved').map((f) => [f.status, f.expected]), [[301, 303]])
    // declared 303 on a route that answers 200 directly: the finding names 200
    assert.deepEqual(kinds(await run([{ path: '/', status: 303 }]), '/').map((f) => [f.status, f.expected]), [[200, 303]])
    // undeclared redirect to a 404 still fails on the page it lands on (the final status is what a visitor gets)
    const land = await run(['/gone'])
    assert.equal(kinds(land, '/gone').length, 1)
  })
})

test('a declared redirect listed first feeds neither the search word nor the default drawer route', async () => {
  const page = (h1) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><main><h1>${h1}</h1></main></body></html>`
  const site = await serve((req, res) => {
    const p = new URL(req.url, 'http://x').pathname
    if (p === '/user-profile') return res.writeHead(303, { location: '/login/' }), res.end()
    if (p === '/login/') return html(res, page('Dashboard'))
    if (p === '/') return html(res, page('Catalogue'))
    res.writeHead(404, { 'content-type': 'text/html' }).end(page('x'))
  })
  await withBrowser(async (browser) => {
    const r = await runFunctional(browser, { site: site.origin, routes: [{ path: '/user-profile', status: 303 }, '/'], concurrency: 1 })
    assert.equal(r.search.word, 'catalogue', 'the word comes from a real page, not from the redirect destination')
    assert.deepEqual([...new Set(r.drawer.passes.map((p) => p.route))], ['/'], 'the drawer is looked for on the first real page')
  })
})

test('S-18: the image census leaves out the clones of a looping carousel', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  const img = `<img src="${png}" width="20" height="20">`
  const src = await serve((req, res) =>
    html(
      res,
      `<!doctype html><html><body><main><p>Words here to read</p><div class="owl-carousel owl-loaded">` +
        `<div class="owl-item cloned">${img}</div><div class="owl-item active">${img}</div><div class="owl-item active">${img}</div><div class="owl-item cloned">${img}</div>` +
        `</div><div class="slick-slider"><div class="slick-cloned">${img}</div><div>${img}</div></div><div class="swiper-slide-duplicate">${img}</div>${img}</main></body></html>`
    )
  )
  await withBrowser(async (browser) => {
    const page = await browser.newPage()
    await page.goto(`${src.origin}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => [...document.images].every((i) => i.complete))
    const r = await page.evaluate(inPageTextIndex, { scope: 'body', properties: ['color'], slot: null, placeholder: null, siteScope: 'main' })
    assert.equal(r.images, 4, '2 active slides + 1 slick slide + 1 loose image; 4 clones/duplicates left out')
    await page.close()
  })
})

// ── #65: intrinsic mobile defects, both sides, classed ─────────────────────────────────────────────

test('#65 intrinsic probe: a wrapping CTA is site-only when the port is worse, shared when the source has it too; overflow is reported; a clean control is not', async () => {
  const page = (cta, extra = '') =>
    `<!doctype html><style>body{margin:0;font:16px/24px serif}.cta{display:inline-block;padding:15px 24px;white-space:normal;box-sizing:border-box;background:#333;color:#fff;${cta}}${extra}</style>
     <header><a class="cta" href="/x">Contact Us</a> <a class="ok" href="/y" style="white-space:nowrap">Home</a></header><main><p>text</p></main>`
  const source = await serve((req, res) => html(res, page('width:110px', req.url === '/wide' ? '.w{width:900px;height:10px}' : '') + (req.url === '/wide' ? '<div class="w"></div>' : '')))
  const site = await serve((req, res) => html(res, page('width:60px;overflow-wrap:anywhere') + (req.url === '/wide' ? '<div style="width:900px;height:10px"></div>' : '')))
  const shared = await serve((_, res) => html(res, page('width:110px')))
  const pages = contentPages({ pages: [{ path: '/' }, { path: '/wide' }, { path: '/user-profile', status: 303 }] })
  assert.deepEqual(pages.map((p) => p.path), ['/', '/wide'], 'a declared redirect route is not a page to measure')
  assert.deepEqual(contentPages({ pages: [{ path: '/' }, { path: '/missing', status: 404 }] }).map((p) => p.path), ['/', '/missing'], 'a declared error page is a page, and is measured')
  await withBrowser(async (browser) => {
    const worse = await measureIntrinsic({ browser, pages: [pages[0]], siteOrigin: site.origin, sourceOrigin: source.origin, widths: [320, 414] })
    const cta = worse.findings.filter((f) => f.kind === 'control-wrap')
    assert.equal(cta.length, 2, JSON.stringify(worse.findings))
    assert.ok(cta.every((f) => f.class === 'site-only' && f.label === 'Contact Us' && f.lines > f.source.lines), JSON.stringify(cta))
    assert.ok(!worse.findings.some((f) => f.label === 'Home'), 'a control that does not wrap is not a finding')
    const same = await measureIntrinsic({ browser, pages: [pages[0]], siteOrigin: shared.origin, sourceOrigin: source.origin, widths: [320] })
    assert.deepEqual(same.findings.map((f) => f.class), ['shared-source-defect'], 'the defect both sides share is reported, as the source\'s')
    assert.equal(same.summary.siteOnly, 0)
    const wide = await measureIntrinsic({ browser, pages: [pages[1]], siteOrigin: site.origin, sourceOrigin: shared.origin, widths: [360] })
    assert.ok(wide.findings.some((f) => f.kind === 'page-overflow' && f.class === 'site-only'), JSON.stringify(wide.findings))
    const gone = await measureIntrinsic({ browser, pages: [pages[0]], siteOrigin: 'http://127.0.0.1:1', sourceOrigin: source.origin, widths: [320] })
    assert.equal(gone.summary.errors, 1, 'an unreachable side is an error row, not a clean route')
  })
})

test('intrinsic probe: a content control wrapping on both sides is shared even when only the port has <main>', async () => {
  const cta = 'display:inline-block;padding:15px 24px;white-space:normal;box-sizing:border-box;width:60px'
  const body = `<a href="/c" style="${cta}">Contact Us</a>`
  // the Joomla source wraps its content in a plain div; the WordPress port puts the same control in <main>
  const source = await serve((_, res) => html(res, `<!doctype html><style>body{margin:0;font:16px/24px serif}</style><header>h</header><div class="t4-content">${body}</div><footer>f</footer>`))
  const site = await serve((_, res) => html(res, `<!doctype html><style>body{margin:0;font:16px/24px serif}</style><header>h</header><main>${body}</main><footer>f</footer>`))
  await withBrowser(async (browser) => {
    const r = await measureIntrinsic({ browser, pages: [{ path: '/' }], siteOrigin: site.origin, sourceOrigin: source.origin, widths: [320] })
    const wraps = r.findings.filter((f) => f.kind === 'control-wrap')
    assert.equal(wraps.length, 1, JSON.stringify(r.findings))
    assert.equal(wraps[0].class, 'shared-source-defect', JSON.stringify(wraps[0]))
    assert.equal(r.summary.siteOnly, 0)
  })
})

test('intrinsic probe: a sidebar control wrapping on both sides is shared even when only the port uses <aside>', async () => {
  const cta = 'display:inline-block;padding:15px 24px;white-space:normal;box-sizing:border-box;width:60px'
  const body = `<a href="/c" style="${cta}">Subscribe Now</a>`
  const source = await serve((_, res) => html(res, `<!doctype html><style>body{margin:0;font:16px/24px serif}</style><header>h</header><div class="t4-content"><div class="sidebar-r">${body}</div></div><footer>f</footer>`))
  const site = await serve((_, res) => html(res, `<!doctype html><style>body{margin:0;font:16px/24px serif}</style><header>h</header><main><aside>${body}</aside></main><footer>f</footer>`))
  await withBrowser(async (browser) => {
    const r = await measureIntrinsic({ browser, pages: [{ path: '/' }], siteOrigin: site.origin, sourceOrigin: source.origin, widths: [320] })
    const wraps = r.findings.filter((f) => f.kind === 'control-wrap')
    assert.equal(wraps.length, 1, JSON.stringify(r.findings))
    assert.equal(wraps[0].class, 'shared-source-defect', JSON.stringify(wraps[0]))
    assert.equal(r.summary.siteOnly, 0)
  })
})

test('#65 intrinsic probe: two controls with one label are two rows; clipped text in a descendant is found; a slide outside the box is not', async () => {
  const cta = (w) => `display:inline-block;padding:15px 24px;white-space:normal;box-sizing:border-box;width:${w}px`
  // the header CTA wraps on the source only; the footer one wraps on the site only — same label, different places
  const page = (headW, footW) => `<!doctype html><style>body{margin:0;font:16px/24px serif}</style>
    <header><a href="/x" style="${cta(headW)}">Contact Us</a></header>
    <main><div style="overflow:hidden;width:100px"><p><span style="white-space:nowrap">A long clipped headline here</span></p></div>
    <div style="overflow:hidden;width:100px;white-space:nowrap"><span style="display:inline-block;width:100px">one</span><span style="display:inline-block;width:100px">off screen</span></div></main>
    <footer><a href="/y" style="${cta(footW)}">Contact Us</a></footer>`
  const source = await serve((_, res) => html(res, page(60, 200)))
  const site = await serve((_, res) => html(res, page(200, 60)))
  await withBrowser(async (browser) => {
    const r = await measureIntrinsic({ browser, pages: [{ path: '/' }], siteOrigin: site.origin, sourceOrigin: source.origin, widths: [414] })
    const wraps = r.findings.filter((f) => f.kind === 'control-wrap')
    assert.equal(wraps.length, 1, JSON.stringify(r.findings))
    assert.equal(wraps[0].class, 'site-only', 'the footer CTA wraps on the site only')
    assert.match(wraps[0].key, /\|footer\|/)
    assert.ok(r.summary.sourceFixed >= 1, 'the header CTA the port fixed is its own row, not paired with the footer one')
    const clipped = r.findings.filter((f) => f.kind === 'text-clipped')
    assert.equal(clipped.length, 1, JSON.stringify(clipped))
    assert.equal(clipped[0].class, 'shared-source-defect')
    assert.match(clipped[0].label, /long clipped headline/)
    assert.ok(!clipped.some((f) => /off screen/.test(f.label)), 'a slide that starts outside the box is hidden by design')
  })
})

test('#65 intrinsic probe: the n-th control of a label is the n-th on both sides whichever wraps; vertically clipped text is found; a line clamp is not', async () => {
  const cta = (w) => `display:inline-block;padding:15px 24px;white-space:normal;box-sizing:border-box;width:${w}px`
  // one landmark, two "Contact Us": the first wraps on the source only, the second on the site only
  const page = (a, b) => `<!doctype html><style>body{margin:0;font:16px/24px serif}</style>
    <main><a href="/x" style="${cta(a)}">Contact Us</a><br><a href="/y" style="${cta(b)}">Contact Us</a>
    <div style="height:30px;overflow:hidden;width:300px"><p style="margin:0">first line here<br>second line clipped away<br>third</p></div>
    <div style="height:30px;overflow:hidden;width:300px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical"><p style="margin:0">a clamped paragraph<br>on two lines</p></div></main>`
  const source = await serve((_, res) => html(res, page(60, 200)))
  const site = await serve((_, res) => html(res, page(200, 60)))
  await withBrowser(async (browser) => {
    const r = await measureIntrinsic({ browser, pages: [{ path: '/' }], siteOrigin: site.origin, sourceOrigin: source.origin, widths: [414] })
    const wraps = r.findings.filter((f) => f.kind === 'control-wrap')
    assert.equal(wraps.length, 1, JSON.stringify(r.findings))
    assert.equal(wraps[0].class, 'site-only', 'not a shared defect: the source wraps the first control, the site the second')
    assert.match(wraps[0].key, /\|2$/)
    assert.equal(r.summary.sourceFixed, 1)
    const clipped = r.findings.filter((f) => f.kind === 'text-clipped')
    assert.equal(clipped.length, 1, JSON.stringify(clipped))
    assert.match(clipped[0].label, /second line clipped away|first line here/)
    assert.equal(clipped[0].class, 'shared-source-defect')
    assert.ok(r.readings.length === 1 && r.readings[0].width === 414, 'one reading per route × width')
  })
})

test('#65 intrinsic probe: a label cut exactly at a line boundary is found; a text that starts below the box is not', async () => {
  // box 24px high = one line: the first line ends at the bottom edge, the next starts on it
  const page = `<!doctype html><style>body{margin:0;font:16px/24px serif}</style><main>
    <div style="height:24px;overflow:hidden;width:90px"><p style="margin:0">Alpha beta gamma delta epsilon</p></div>
    <div style="height:24px;overflow:hidden;width:300px"><div style="height:24px">visible</div><p style="margin:0">below the box by design</p></div></main>`
  const origin = (await serve((_, res) => html(res, page))).origin
  await withBrowser(async (browser) => {
    const r = await measureIntrinsic({ browser, pages: [{ path: '/' }], siteOrigin: origin, widths: [414] })
    const clipped = r.findings.filter((f) => f.kind === 'text-clipped')
    assert.equal(clipped.length, 1, JSON.stringify(clipped))
    assert.match(clipped[0].label, /Alpha beta/)
  })
})

test('#65 intrinsic probe: a nested clipping box is found under an outer one that clips nothing; the route must answer as declared, without a redirect; a site-only run needs no source', async () => {
  const cta = 'display:inline-block;padding:15px 24px;width:60px;box-sizing:border-box;white-space:normal'
  const good = `<!doctype html><style>body{margin:0;font:16px/24px serif}</style><main>
    <div style="overflow:hidden;width:400px"><div style="overflow:hidden;width:100px;white-space:nowrap"><span>a long clipped label here</span></div></div>
    <a href="/x" style="${cta}">Contact Us</a></main>`
  const other = await serve((_, res) => html(res, good))
  let backs = 0
  const site = await serve((req, res) => {
    const p = new URL(req.url, 'http://x').pathname
    if (p === '/login') return html(res, '<!doctype html><p>log in</p>')
    if (p === '/private') return html(res, '', 303, { location: '/login' })
    if (p === '/boom') return html(res, '<!doctype html><p>error</p>', 500)
    if (p === '/gone') return html(res, good, 404)
    if (p === '/out') return html(res, '', 302, { location: `${other.origin}/out` })
    if (p === '/bounce') return html(res, '', 302, { location: '/away' })
    if (p === '/away') return html(res, '', 302, { location: '/bounce' })
    if (p === '/back') return backs++ % 2 ? html(res, good) : html(res, '', 302, { location: '/hop' })
    if (p === '/hop') return html(res, '', 302, { location: '/back' })
    return html(res, good)
  })
  await withBrowser(async (browser) => {
    const r = await measureIntrinsic({ browser, pages: [{ path: '/' }], siteOrigin: site.origin, widths: [414] })
    assert.equal(r.sourceRead, false)
    const clipped = r.findings.filter((f) => f.kind === 'text-clipped')
    assert.equal(clipped.length, 1, JSON.stringify(r.findings))
    assert.equal(clipped[0].class, 'site-only', 'no source read: every defect is the site\'s')
    assert.ok(r.findings.some((f) => f.kind === 'control-wrap'))
    const wrong = await measureIntrinsic({ browser, pages: [{ path: '/private' }, { path: '/boom' }, { path: '/gone' }, { path: '/gone', status: 404 }], siteOrigin: site.origin, widths: [414] })
    const errs = wrong.readings.map((x) => x.error ?? null)
    assert.match(errs[0], /ended on \/login/)
    assert.match(errs[1], /answered 500/)
    assert.match(errs[2], /answered 404, expected 2xx/)
    assert.equal(errs[3], null, 'a declared error page is a page')
    assert.equal(wrong.summary.errors, 3)
    // another origin at the same path, and a chain that leaves the route and returns to it, are not the route's own document
    const chain = await measureIntrinsic({ browser, pages: [{ path: '/out' }, { path: '/back' }], siteOrigin: site.origin, widths: [414], concurrency: 1 })
    assert.match(chain.readings[0].error, /ended on http:\/\/127\.0\.0\.1:\d+\/out — another document/)
    assert.match(chain.readings[1].error, /another document/)
  })
})

test('#65 intrinsic report: emitted browser reports keep the viewport width, retain source-fixed rows and pass the one validator through the verdict', async () => {
  const { validateIntrinsicReport, intrinsicClaimOf, summaryClaimOf, INTRINSIC_WIDTHS } = await import('../visual/intrinsic-report.mjs')
  const { assessFastGate } = await import('../visual/fast-gate.mjs')
  const { writeRun } = await import('../visual/report.mjs')
  const page = (cta) => `<!doctype html><style>body{margin:0;font:16px/24px serif}.cta{display:inline-block;padding:15px 24px;white-space:normal;box-sizing:border-box;background:#333;color:#fff;${cta}}</style><header><a class="cta" href="/x">Contact Us</a></header><main><p>text</p></main>`
  const wraps = await serve((_, res) => html(res, page('width:110px')))
  const fine = await serve((_, res) => html(res, page('width:auto;white-space:nowrap')))
  const worse = await serve((_, res) => html(res, page('width:60px;overflow-wrap:anywhere')))
  const pages = contentPages({ pages: [{ path: '/' }] })
  const owed = pages.map((p) => p.path)
  await withBrowser(async (browser) => {
    const measure = (siteOrigin, sourceOrigin) => measureIntrinsic({ browser, pages, siteOrigin, sourceOrigin, widths: INTRINSIC_WIDTHS })
    const cases = {
      clean: await measure(fine.origin, fine.origin),
      shared: await measure(wraps.origin, wraps.origin),
      fixed: await measure(fine.origin, wraps.origin),
      siteOnly: await measure(worse.origin, wraps.origin),
      siteOnlyNoSource: await measure(wraps.origin, null),
      failedRead: await measure('http://127.0.0.1:1', wraps.origin)
    }
    const expect = { clean: [0, 0, 0, 0], shared: [0, 5, 0, 0], fixed: [0, 0, 5, 0], siteOnly: [5, 0, 0, 0], siteOnlyNoSource: [5, 0, 0, 0], failedRead: [0, 0, 0, 5] }
    for (const [name, rep] of Object.entries(cases)) {
      assert.deepEqual([rep.summary.siteOnly, rep.summary.shared, rep.summary.sourceFixed, rep.summary.errors], expect[name], name)
      const claim = intrinsicClaimOf(rep)
      const claims = { intrinsic: claim, summary: summaryClaimOf(claim) }
      assert.deepEqual(validateIntrinsicReport(rep, { claims, owedRoutes: owed, allowFailedReadings: true }), [], `${name}: the producer's own report validates`)
      assert.ok(rep.findings.every((f) => INTRINSIC_WIDTHS.includes(f.width)), `${name}: finding.width is the viewport`)
      const out = testDir('intrinsic-browser')
      writeFileSync(path.join(out, 'intrinsic.json'), JSON.stringify(rep))
      writeRun({ out, site: 'http://x', contractFile: 'c.json', identity: { contractHash: 'sha256:c', capturedAt: '2026-09-30T00:00:00.000Z' }, stageReports: [{ id: 'light-desktop', variants: [], pages: 0, axes: 0, findings: 0, reused: 0, status: 'pass' }], pages: [], stageOf: () => 'light-desktop', method: 'test', intrinsic: { ...claim, rows: rep.findings.filter((f) => f.class === 'site-only'), errorRows: rep.errors } })
      const reasons = assessFastGate(out, { expectedRoutes: owed }).reasons.filter((r) => /intrinsic/.test(r)).join(' | ')
      if (expect[name][0]) assert.match(reasons, /site-only defect/, name)
      else if (expect[name][3]) assert.match(reasons, /failed reading/, name)
      else assert.equal(reasons, '', name)
    }
    const at320 = cases.shared.findings.find((f) => f.width === 320)
    assert.equal(at320.boxWidth, 110, 'the control is 110px wide in a 320px viewport: both are kept apart')
    assert.equal(cases.fixed.readings.find((x) => x.width === 320).rows.filter((r) => r.class === 'source-fixed').length, 1, 'source-fixed rows are retained')
    assert.deepEqual(cases.siteOnlyNoSource.findings.filter((f) => f.source !== undefined), [], 'no source read, no source measurement')
  })
})

test('#65 intrinsic probe: a page the seed moved is read at its seeded route and reported under its page-map route', async () => {
  const seen = []
  const site = await serve((req, res) => {
    const p = new URL(req.url, 'http://x').pathname
    seen.push(p)
    return p === '/our-team/' ? html(res, '<!doctype html><main><p>team</p></main>') : html(res, '<!doctype html><p>no</p>', 404)
  })
  await withBrowser(async (browser) => {
    const r = await measureIntrinsic({ browser, pages: [{ path: '/team', siteRoute: '/our-team/' }], siteOrigin: site.origin, widths: [414] })
    assert.equal(r.summary.errors, 0, JSON.stringify(r.errors))
    assert.deepEqual(r.routes, ['/team'], 'the report keeps the page-map route')
    assert.ok(seen.includes('/our-team/') && !seen.includes('/team'), `requested ${seen}`)
  })
})
