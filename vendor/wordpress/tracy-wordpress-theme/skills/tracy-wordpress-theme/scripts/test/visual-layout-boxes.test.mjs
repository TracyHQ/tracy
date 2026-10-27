import test from 'node:test'
import assert from 'node:assert/strict'
import { compareBlocks, formatMarkdown, hooksOf, measureInPage, MEASURE } from '../visual/layout-boxes.mjs'
import { withBrowser } from '../lib/browser.mjs'

const block = (text, { x = 380, w = 680, h = 42, fontSize = '40px', align = 'center', panel = null, paint = 'rgb(255, 255, 255)' } = {}) => ({
  text,
  tag: 'h2',
  heading: { x, y: 0, w, h, fontSize, align },
  panel,
  section: { x: 0, y: 0, w: 1440, h: 600, paint, borderTop: '0px' }
})

test('layout-boxes: a centred source heading drawn left and narrower is named with both numbers', () => {
  const r = compareBlocks([block('a#1')], [block('a#1', { x: 208, w: 586, align: 'start' })])
  assert.equal(r.differing, 1)
  assert.deepEqual(r.rows[0].deltas.map(([k]) => k), ['heading x', 'heading width', 'heading align'])
})

test('layout-boxes: small moves stay inside the tolerance', () => {
  const r = compareBlocks([block('a#1')], [block('a#1', { x: 390, w: 670 })])
  assert.equal(r.differing, 0)
})

test('layout-boxes: section paint and panel presence are compared; unpaired headings are listed', () => {
  const panel = { x: 208, y: 0, w: 1024, h: 400, bg: 'rgb(245, 245, 247)', radius: '18px' }
  const r = compareBlocks(
    [block('band#1', { paint: 'rgb(255, 255, 255)' }), block('carousel#1', { panel }), block('gone#1')],
    [block('band#1', { paint: 'rgb(245, 245, 247)' }), block('carousel#1'), block('extra#1')]
  )
  assert.deepEqual(r.rows.map((x) => x.deltas[0][0]), ['section paint', 'panel'])
  assert.deepEqual(r.onlySource, ['gone#1'])
  assert.deepEqual(r.onlySite, ['extra#1'])
  assert.match(formatMarkdown([{ route: '/', ...r }]), /only in the source: "gone#1"/)
})

test('layout-boxes: a heading repeated on one side only pairs the last occurrences', () => {
  const src = [{ ...block('cta#1', { x: 498, w: 445 }), words: 'cta' }]
  const site = [{ ...block('cta#1', { x: 241, w: 556, align: 'start' }), words: 'cta' }, { ...block('cta#2', { x: 498, w: 445 }), words: 'cta' }]
  const r = compareBlocks(src, site)
  assert.equal(r.differing, 0, 'the final call to action pairs with the source one')
  assert.deepEqual(r.onlySite, ['cta#-2'])
})

test('layout-boxes: the label above a heading is compared by its centre', () => {
  const src = [{ ...block('hero#1', { x: 440, w: 560 }), label: { x: 617, w: 207, center: 720 } }]
  const site = [{ ...block('hero#1', { x: 440, w: 560 }), label: { x: 230, w: 222, center: 341 } }]
  const r = compareBlocks(src, site)
  assert.deepEqual(r.rows[0].deltas, [['label centre', 720, 341]])
  assert.equal(compareBlocks(src, [{ ...site[0], label: { x: 609, w: 222, center: 720 } }]).differing, 0)
})

// ── the CLI: the mode it measures, and what its exit code says ──────────────────────────────────
// JA Vega M4 (26/09): the CLI had no theme at all and exited 0 with 129 of 129 blocks differing,
// while the dark stage of visual-qa.md asks for a layout-boxes dark reading. The dark reading was
// taken by a hand-written wrapper around the same functions. A source and a site that agree in
// light and differ only in dark must read clean in light and differ in dark.
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync as readFile, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const lbPage = ({ darkSection = 'rgb(10, 10, 10)', lightSection = 'rgb(255, 255, 255)', undo = false, serverDark = false } = {}) => `<!doctype html><html${serverDark ? ' data-theme="dark"' : ''}><head><style>
body{margin:0;font:16px Arial;background:rgb(255,255,255)} section{background:${lightSection};padding:40px} h2{font-size:32px;text-align:center;margin:0}
html[data-theme=dark] body{background:rgb(0,0,0)} html[data-theme=dark] section{background:${darkSection}}
</style>${undo ? '<script>addEventListener("DOMContentLoaded",()=>document.documentElement.removeAttribute("data-theme"))</script>' : ''}</head>
<body><main><section><h2>Our work</h2><p>Words under the heading.</p></section><section style="max-width:800px;margin:0 auto"><h2>Second block</h2></section></main></body></html>`
// `/cookie-*`: the theme is chosen on the server from the `tt` request cookie (Tracy's tracy_theme);
// `/cookie-ignored*` never reads it. `/gone/` answers 404 with no heading; `/404` answers 404 with the
// error page's heading.
const lbServer = createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname
  const cookieDark = /(^|;\s*)tt=dark/.test(req.headers.cookie ?? '')
  if (p.includes('/gone/')) {
    res.writeHead(404, { 'content-type': 'text/html' })
    return res.end('<!doctype html><html><body><p>Not found</p></body></html>')
  }
  if (p.endsWith('/404')) {
    res.writeHead(404, { 'content-type': 'text/html' })
    return res.end(lbPage().replace('Our work', 'Page not found'))
  }
  const html =
    p.startsWith('/site-dark-differs/') ? lbPage({ darkSection: 'rgb(60, 60, 60)' })
      : p.startsWith('/site-light-differs/') ? lbPage({ lightSection: 'rgb(240, 240, 240)' })
        : p.startsWith('/site-undoes-dark/') ? lbPage({ undo: true })
          : p.startsWith('/cookie-ignored') ? lbPage()
            : p.startsWith('/cookie-site-dark-differs/') ? lbPage({ serverDark: cookieDark, darkSection: 'rgb(60, 60, 60)' })
              : p.startsWith('/cookie-') ? lbPage({ serverDark: cookieDark })
                : lbPage()
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(html)
})
lbServer.listen(0, '127.0.0.1')
await once(lbServer, 'listening')
const lbBase = `http://127.0.0.1:${lbServer.address().port}`
test.after(async () => {
  lbServer.close()
  await once(lbServer, 'close')
})
async function layoutBoxes(args) {
  const child = spawn(process.execPath, [new URL('../visual/layout-boxes.mjs', import.meta.url).pathname, ...args])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  return { code, output }
}

test('layout-boxes CLI: --theme dark measures both sides in dark, names the mode, and exits 1 on a difference only dark shows', async () => {
  const light = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site-dark-differs`, '--routes', '/'])
  assert.equal(light.code, 0, light.output)
  assert.match(light.output, /0\/2 paired blocks differ/)
  const dark = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site-dark-differs`, '--routes', '/', '--theme', 'dark'])
  assert.equal(dark.code, 1, dark.output)
  assert.match(dark.output, /dark/)
  assert.match(dark.output, /panel background rgb\(10, 10, 10\) → rgb\(60, 60, 60\)|section paint rgb\(10, 10, 10\) → rgb\(60, 60, 60\)/)
})

test('layout-boxes CLI: any differing block exits 1; the JSON records the mode', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lb-'))
  const out = path.join(dir, 'lb.json')
  const r = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site-light-differs`, '--routes', '/', '--out', out])
  assert.equal(r.code, 1, r.output)
  const json = JSON.parse(readFile(out, 'utf8'))
  assert.equal(json.theme, 'light')
  assert.ok(json.results[0].differing > 0)
})

test('layout-boxes CLI: a named input that is not there is exit 2, and a side the dark hook did not reach is not measured', async () => {
  const missing = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site`, '--routes', '/nonexistent/page-map.json'])
  assert.equal(missing.code, 2, missing.output)
  assert.match(missing.output, /page-map\.json/)
  const badTheme = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site`, '--routes', '/', '--theme', 'sepia'])
  assert.equal(badTheme.code, 2, badTheme.output)
  const undone = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site-undoes-dark`, '--routes', '/', '--theme', 'dark'])
  assert.equal(undone.code, 2, undone.output)
  assert.match(undone.output, /site.*not in dark|not in dark.*site/)
})

// A hook flag with no value was dropped: `--light-hook` at the end of the line measured the page in
// whatever mode it opened in, and a page that opens light passed.
test('layout-boxes CLI: a declared hook or option with no value is exit 2', async () => {
  const base = ['--source', `${lbBase}/src`, '--site', `${lbBase}/site`, '--routes', '/']
  const bare = await layoutBoxes([...base, '--light-hook'])
  assert.equal(bare.code, 2, bare.output)
  assert.match(bare.output, /--light-hook needs a value/)
  const swallowed = await layoutBoxes([...base, '--source-light-hook', '--width', '1440'])
  assert.equal(swallowed.code, 2, swallowed.output)
  assert.match(swallowed.output, /--source-light-hook needs a value/)
  const dark = await layoutBoxes([...base, '--theme', 'dark', '--source-dark-hook'])
  assert.equal(dark.code, 2, dark.output)
  assert.match(dark.output, /--source-dark-hook needs a value/)
})

// A theme picked on the server from a cookie (Tracy's `tracy_theme`) reads the cookie on the document
// request: an init-script cookie arrives after the page was answered, the page came back light, and
// with no mark to read it was measured and written down as dark. The cookie is a request cookie, and
// the mode is checked by the mark the page carries in dark (`--dark-check`), not assumed.
test('layout-boxes CLI: a cookie dark hook reaches a server-chosen theme before the document request, and is checked', async () => {
  const cookie = ['--routes', '/', '--theme', 'dark', '--dark-hook', 'cookie:tt=dark']
  const dark = await layoutBoxes(['--source', `${lbBase}/cookie-src`, '--site', `${lbBase}/cookie-site-dark-differs`, ...cookie, '--dark-check', 'attr:data-theme=dark'])
  assert.equal(dark.code, 1, dark.output)
  assert.match(dark.output, /rgb\(10, 10, 10\) → rgb\(60, 60, 60\)/)
  // a server that ignores the cookie is not in dark: not measured
  const ignored = await layoutBoxes(['--source', `${lbBase}/cookie-src`, '--site', `${lbBase}/cookie-ignored`, ...cookie, '--dark-check', 'attr:data-theme=dark'])
  assert.equal(ignored.code, 2, ignored.output)
  assert.match(ignored.output, /site .*cookie-ignored.* is not in dark/)
  // a cookie hook with no mark to check is refused before anything is measured
  const unchecked = await layoutBoxes(['--source', `${lbBase}/cookie-src`, '--site', `${lbBase}/cookie-site-dark-differs`, ...cookie])
  assert.equal(unchecked.code, 2, unchecked.output)
  assert.match(unchecked.output, /cannot be read in the page.*--dark-check/)
})

// An error page has no heading to differ: a route that did not load read "0/0 paired blocks differ"
// at exit 0. A route either side does not answer with 2xx (or the status the page-map declares) is
// not measured.
test('layout-boxes CLI: a route that answers 404 on either side is exit 2, not 0 blocks differing', async () => {
  const site404 = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/gone`, '--routes', '/'])
  assert.equal(site404.code, 2, site404.output)
  assert.match(site404.output, /site .*\/gone\/ answered 404/)
  const source404 = await layoutBoxes(['--source', `${lbBase}/gone`, '--site', `${lbBase}/site`, '--routes', '/'])
  assert.equal(source404.code, 2, source404.output)
  assert.match(source404.output, /source .* answered 404/)
})

// A page-map that is there but not JSON, and a side that does not answer at all, threw out of the
// top-level await at exit 1 — the code of a differing block. Neither was measured: exit 2.
test('layout-boxes CLI: a page-map that is not JSON, or a side that does not answer, is exit 2', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lb-bad-'))
  const map = path.join(dir, 'page-map.json')
  writeFileSync(map, '{ "pages": [')
  const badMap = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site`, '--routes', map])
  assert.equal(badMap.code, 2, badMap.output)
  assert.match(badMap.output, /page-map\.json: not a readable page-map/)
  const down = createServer()
  down.listen(0, '127.0.0.1')
  await once(down, 'listening')
  const downBase = `http://127.0.0.1:${down.address().port}`
  down.close()
  await once(down, 'close')
  const noSite = await layoutBoxes(['--source', `${lbBase}/src`, '--site', downBase, '--routes', '/'])
  assert.equal(noSite.code, 2, noSite.output)
  assert.match(noSite.output, /not measured — site .* did not load/)
  const noSource = await layoutBoxes(['--source', downBase, '--site', `${lbBase}/site`, '--routes', '/'])
  assert.equal(noSource.code, 2, noSource.output)
  assert.match(noSource.output, /not measured — source .* did not load/)
})

// The 404 page of a page-map is `synthetic` (no source route names it: Joomla serves its error page
// for any unknown path), and every synthetic page was dropped before the 404 branch could see it, so
// the error page was never measured. The 404 view is kept, at its declared status; a post standing
// in for the single view stays out.
test('layout-boxes CLI: the synthetic 404 page of a page-map is measured at 404', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lb-404-'))
  const map = path.join(dir, 'page-map.json')
  writeFileSync(map, JSON.stringify({ pages: [
    { path: '/', view: 'home' },
    { path: '/404', view: '404', synthetic: true },
    { path: '/stand-in', view: 'single', synthetic: true }
  ] }))
  const out = path.join(dir, 'lb.json')
  const r = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site`, '--routes', map, '--out', out])
  assert.equal(r.code, 0, r.output)
  const json = JSON.parse(readFile(out, 'utf8'))
  assert.deepEqual(json.results.map((x) => x.route), ['/', '/404'])
  const e404 = json.results.find((x) => x.route === '/404')
  assert.deepEqual(e404.status, [404, 404])
  assert.equal(e404.paired, 2, JSON.stringify(e404))
  assert.doesNotMatch(readFile(out.replace(/\.json$/, '.md'), 'utf8'), /stand-in/)
})

// ── JA Vega M4b (26/09): which headings are measured, and which element's type is compared ──────
// measureInPage runs on a page set from a string.
const measure = (html) =>
  withBrowser(async (b) => {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
    await p.setContent(html)
    return p.evaluate(measureInPage, MEASURE)
  })

// A T4 page draws its section titles as h3 in `.t4-section` and the page title in `.t4-masthead`,
// outside `main` and `#t4-main-body`: the home page paired one heading of ten ("only on the site"
// nine times), every utility page none. T4's footer and mega menu are `.t4-section`s too, and stay
// chrome; a heading the page does not show stays out.
test('layout-boxes: the headings of T4 sections and the masthead are measured once; T4 chrome and hidden headings are not', async () => {
  const blocks = await measure(`<body><div class="t4-wrapper"><div class="t4-content"><div class="t4-content-inner">
    <div id="t4-header" class="t4-section t4-header"><h3>Header title</h3></div>
    <div id="t4-masthead" class="t4-section t4-masthead"><div class="container"><h3>Login Form</h3></div></div>
    <div id="t4-section-2" class="t4-section t4-section-2"><div class="section-title-wrap"><h3>What we do</h3></div>
      <div class="dropdown-menu mega-dropdown-menu"><h3>Services menu</h3></div></div>
    <div id="t4-main-body" class="t4-section t4-main-body"><h3>Body heading</h3><h2>Body h2</h2></div>
    <div class="t4-section"><h3 style="display:none">Collapsed</h3><h3 style="visibility:hidden">Invisible</h3></div>
    <div id="t4-footer" class="t4-section t4-footer"><h3>Company</h3></div>
  </div></div></div></body>`)
  assert.deepEqual(blocks.map((b) => b.words), ['login form', 'what we do', 'body heading', 'body h2'])
  // called bare (the older call) it reads the same lists
  assert.ok(measureInPage.toString().includes(`'${MEASURE.headings}'`) && measureInPage.toString().includes(`'${MEASURE.chrome}'`), 'the in-page defaults are MEASURE')
})

// The source's accordion is `h2.accordion-header` (48 px, unstyled) around the 20 px button that
// holds the words: "heading font-size 48px → 20px" on six service pages × four questions. The size
// compared is the size of the element that draws the words — the rule visual-qa's parity uses —
// while the boxes stay the heading's.
test('layout-boxes: the font size is read on the element that draws the words; the box stays the heading', async () => {
  const blocks = await measure(`<main>
    <h2 class="accordion-header" style="font-size:48px;margin:0"><button type="button" style="font-size:20px;width:100%;text-align:left">Where should I incorporate my business?</button></h2>
    <h3 style="font-size:32px"><span style="font-size:12px">What we do</span></h3>
    <h2 style="font-size:30px">Plain <em style="font-size:10px">mixed</em> words</h2>
  </main>`)
  const size = Object.fromEntries(blocks.map((b) => [b.words, b.heading.fontSize]))
  assert.deepEqual(size, { 'where should i incorporate my business?': '20px', 'what we do': '12px', 'plain mixed words': '30px' })
  const acc = blocks.find((b) => b.words.startsWith('where'))
  assert.equal(acc.tag, 'h2')
  assert.equal(acc.heading.w, 1440 - 16, 'the heading box, not the button')
  // a real size difference of the words is still one
  const r = compareBlocks([{ ...block('q#1', { fontSize: '20px' }) }], [{ ...block('q#1', { fontSize: '24px' }) }])
  assert.deepEqual(r.rows[0].deltas, [['heading font-size', '20px', '24px']])
})

// The dark hook was typed by hand on every dark run (`--dark-hook cookie:tracy_theme=dark`) while
// the contract and review.config.json already name it; the default `attr:` hook was taken off by
// the theme's own script and the run stopped at exit 2. The switch and the mark that proves the
// mode are read from the file; a flag still wins; a file that is not there or says nothing is
// exit 2, not the default.
test('layout-boxes CLI: the dark switch and its mark come from review.config.json or the contract; a flag wins; a bad file is exit 2', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lb-config-'))
  const config = path.join(dir, 'review.config.json')
  writeFileSync(config, JSON.stringify({ hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tt' } }))
  const out = path.join(dir, 'lb.json')
  const dark = await layoutBoxes(['--source', `${lbBase}/cookie-src`, '--site', `${lbBase}/cookie-site-dark-differs`, '--routes', '/', '--theme', 'dark', '--config', config, '--out', out])
  assert.equal(dark.code, 1, dark.output)
  assert.match(dark.output, /rgb\(10, 10, 10\) → rgb\(60, 60, 60\)/)
  const json = JSON.parse(readFile(out, 'utf8'))
  assert.deepEqual(json.hooks.site, { dark: 'cookie:tt=dark' })
  assert.deepEqual(json.checks, { site: 'attr:data-theme=dark', source: 'attr:data-theme=dark' })
  assert.deepEqual(json.hookFrom, { site: 'config', source: 'config' })
  // the same from a contract (design.theme + source)
  const contract = path.join(dir, 'visual.contract.json')
  writeFileSync(contract, JSON.stringify({ design: { theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' }, storage: { type: 'cookie', key: 'tt' } } }, source: { darkHook: 'attr:data-theme=dark', darkRequestHook: 'cookie:tt=dark' } }))
  const fromContract = await layoutBoxes(['--source', `${lbBase}/cookie-src`, '--site', `${lbBase}/cookie-site-dark-differs`, '--routes', '/', '--theme', 'dark', '--contract', contract])
  assert.equal(fromContract.code, 1, fromContract.output)
  // a script that takes the attribute off is still caught: the config names the attribute, no cookie
  const attrOnly = path.join(dir, 'attr.config.json')
  writeFileSync(attrOnly, JSON.stringify({ hook: { type: 'attribute', name: 'data-theme' } }))
  const undone = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site-undoes-dark`, '--routes', '/', '--theme', 'dark', '--config', attrOnly])
  assert.equal(undone.code, 2, undone.output)
  assert.match(undone.output, /site .* is not in dark/)
  // a flag wins over the file: the cookie-reading server ignores an attribute set by script
  const override = await layoutBoxes(['--source', `${lbBase}/cookie-src`, '--site', `${lbBase}/cookie-site-dark-differs`, '--routes', '/', '--theme', 'dark', '--config', config, '--dark-hook', 'attr:data-theme=dark', '--out', out])
  assert.equal(override.code, 1, override.output)
  assert.deepEqual(JSON.parse(readFile(out, 'utf8')).hookFrom.site, 'flag')
  // named and not there, not JSON, or naming no theme: exit 2
  const missing = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site`, '--routes', '/', '--config', path.join(dir, 'nope.json')])
  assert.equal(missing.code, 2, missing.output)
  assert.match(missing.output, /nope\.json/)
  const broken = path.join(dir, 'broken.json')
  writeFileSync(broken, '{ "hook": ')
  const notJson = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site`, '--routes', '/', '--config', broken])
  assert.equal(notJson.code, 2, notJson.output)
  const empty = path.join(dir, 'empty.json')
  writeFileSync(empty, '{}')
  const says = await layoutBoxes(['--source', `${lbBase}/src`, '--site', `${lbBase}/site`, '--routes', '/', '--theme', 'dark', '--contract', empty])
  assert.equal(says.code, 2, says.output)
  assert.match(says.output, /design\.theme/)
  // a hook or persistence type the tools do not know is exit 2, never the default attribute switch
  const typo = path.join(dir, 'typo.config.json')
  writeFileSync(typo, JSON.stringify({ hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookies', key: 'tt' } }))
  const typoRun = await layoutBoxes(['--source', `${lbBase}/cookie-src`, '--site', `${lbBase}/cookie-site-dark-differs`, '--routes', '/', '--theme', 'dark', '--config', typo])
  assert.equal(typoRun.code, 2, typoRun.output)
  assert.match(typoRun.output, /persistence\.type "cookies"/)
})

test('layout-boxes: hooksOf refuses a hook or persistence the tools do not know instead of falling back to the attribute', () => {
  const hook = { type: 'attribute', name: 'data-theme' }
  const bad = [
    [{ hook: { type: 'atribute', name: 'data-theme' } }, /hook\.type "atribute"/],
    [{ hook: { name: 'data-theme' } }, /hook\.type undefined/],
    [{ hook, persistence: { type: 'session', key: 'tt' } }, /persistence\.type "session"/],
    [{ hook, persistence: { type: 'cookie' } }, /persistence\.key is empty/],
    [{ hook, persistence: { type: 'cookie', name: 'tt' } }, /unknown key\(s\) name/],
    [{ hook, persistence: 'cookie:tt' }, /persistence must be/],
    [{ hook, defaultTheme: 'night' }, /defaultTheme "night"/]
  ]
  for (const [config, why] of bad) assert.throws(() => hooksOf({ theme: 'dark', config }), why, JSON.stringify(config))
  const contract = { design: { theme: { attribute: 'data-theme', values: { dark: 'dark' }, storage: { type: 'sessionStorage', key: 'tt' } } }, source: { darkHook: 'attr:data-theme=dark' } }
  assert.throws(() => hooksOf({ theme: 'dark', contract }), /design\.theme\.storage\.type "sessionStorage"/)
  // the supported ones resolve: cookie, localStorage, class hook, no persistence
  assert.equal(hooksOf({ theme: 'dark', config: { hook, persistence: { type: 'cookie', key: 'tt' } } }).hooks.site.dark, 'cookie:tt=dark')
  assert.equal(hooksOf({ theme: 'dark', config: { hook, persistence: { type: 'localStorage', key: 'tt' } } }).hooks.site.dark, 'ls:tt=dark')
  assert.equal(hooksOf({ theme: 'dark', config: { hook: { type: 'class', name: 'is-dark' } } }).checks.site, 'class:is-dark')
  assert.equal(hooksOf({ theme: 'dark', config: { hook } }).hooks.site.dark, 'attr:data-theme=dark')
})
