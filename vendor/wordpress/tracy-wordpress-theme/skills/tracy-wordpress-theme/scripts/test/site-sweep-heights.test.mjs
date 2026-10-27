// The `heights` check of site-sweep: the pure rules on synthetic readings, and one real-browser fixture per cause kind on small local pages,
// each with the non-defect beside it (same height by different markup, a masonry that settles late, one offset every route shares, a font
// that loads late).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseDecisions } from '../lib/parity-acceptance.mjs'
import { lazyBrowser } from '../lib/browser.mjs'
import { dossierPlan, runSweep, formatSummary, baselineMismatch, ALL_CHECKS, fixChecks } from '../visual/site-sweep.mjs'
import { validateFixMeasure } from '../lib/fix-measure.mjs'
import { heightsWidths, heightsInPage } from '../visual/site-sweep-heights.mjs'
import { alignSeq, pairBands, diffNode, judgeHeights, settleHeightCells, unpairedAt, bandOnlyHere, HEIGHT_TOLERANCE_PX } from '../visual/site-sweep-heights-judge.mjs'
import { groupDefects, causeOf } from '../visual/site-sweep-judge.mjs'
import { settleVerdict, acceptContextOf } from '../visual/site-sweep-verdict.mjs'
import { explainRow, parseExplain, linesIn, linesOf, armDeadline, readDossierJson, runExplain } from '../visual/site-sweep-explain.mjs'

const browser = lazyBrowser()
const servers = []
after(async () => {
  await browser.close()
  for (const s of servers) s.close()
})

// ---- pure parts -----------------------------------------------------------------------------------------------------

const node = (o = {}) => withTx({ t: 'div', sig: 'div', key: '', head: '', x: 0, y: 0, w: 1000, h: 100, d: 'block', cols: 1, pt: 0, pb: 0, bw: 0, mt: 0, mb: 0, rg: 0, fs: 16, lh: 24, img: null, k: [], words: 1, ...o })
function withTx(n) {
  n.tx ??= String(n.key).toLowerCase().replace(/[^a-z0-9]/g, '')
  // (synthetic readings: a leaf is taken to give its band its own height unless a test says otherwise)
  n.fx ??= n.h
  return n
}
const band = (head, h, o = {}) => ({ kind: o.kind ?? 'band', y: o.y ?? 0, h, tree: node({ sig: o.sig ?? 'section.x', head, h, ...o.tree }) })
const read = (bands, doc, o = {}) => ({ doc, title: 'T', finalPath: '/a', lands: { header: true, main: true, footer: true }, bands, bare: false, quiet: { settled: true }, fonts: { body: 'Arial', loaded: [] }, ...o })

test('alignSeq: equal keys anchor; equal counts between anchors pair; a key the other side lacks is missing/extra; the rest is unsure', () => {
  const key = (x) => x
  const a = alignSeq(['a', 'b', 'c'], ['a', 'b', 'c'], key)
  assert.deepEqual(a.pairs, [[0, 0], [1, 1], [2, 2]])
  const miss = alignSeq(['a', 'b', 'c'], ['a', 'c'], key)
  assert.deepEqual([miss.missing, miss.extra, miss.pairs], [[1], [], [[0, 0], [2, 1]]])
  const extra = alignSeq(['a', 'c'], ['a', 'x', 'c'], key)
  assert.deepEqual(extra.extra, [1])
  // equal counts with another word in the middle: paired by order (the content differs, the band is the same)
  assert.deepEqual(alignSeq(['a', 'b', 'c'], ['a', 'z', 'c'], key).pairs, [[0, 0], [1, 1], [2, 2]])
  // untitled bands: unequal counts between anchors cannot be paired
  const unsure = alignSeq(['a', null, null, 'c'], ['a', null, 'c'], key)
  assert.equal(unsure.unsure.length, 1)
  assert.equal(unsure.missing.length + unsure.extra.length, 0)
})

test('diffNode: each kind is told from the first child that differs', () => {
  const T = HEIGHT_TOLERANCE_PX
  const cards = (n, cols, h) => node({ sig: 'div.grid', cols, h: Math.ceil(n / cols) * h, k: Array.from({ length: n }, (_, i) => node({ sig: 'div.card', key: `card ${i}`, h })) })
  assert.equal(diffNode(cards(8, 4, 100), cards(8, 2, 100), T).kind, 'column-count')
  assert.match(diffNode(cards(8, 4, 100), cards(8, 2, 100), T).detail, /4 columns on the source, 2 columns on the port/)
  const section = (kids, o = {}) => node({ sig: 'section.s', h: 300, k: kids, ...o })
  assert.equal(diffNode(section([], { pt: 80, pb: 80 }), section([], { pt: 40, pb: 40, h: 220 }), T).kind, 'padding-step')
  assert.equal(diffNode(node({ img: { w: 400, h: 225 }, sig: 'img.p' }), node({ img: { w: 400, h: 400 }, sig: 'img.p' }), T).kind, 'image-ratio')
  assert.equal(diffNode(section([node({ fs: 40, lh: 48, h: 48, words: 1 })]), section([node({ fs: 24, lh: 29, h: 29 })], { h: 281 }), T).kind, 'font-size-step')
  assert.equal(diffNode(section([node({ lh: 28, h: 28, w: 600 })]), section([node({ lh: 20, h: 20, w: 600 })], { h: 292 }), T).kind, 'line-height-step')
  assert.equal(diffNode(node({ h: 96, w: 600, lh: 24 }), node({ h: 168, w: 400, lh: 24 }), T).kind, 'width-step')
  assert.equal(diffNode(node({ h: 96, lh: 24 }), node({ h: 168, lh: 24 }), T).kind, 'text-wrap')
  const miss = diffNode(section([node({ sig: 'p.one', key: 'one', h: 40 }), node({ sig: 'p.two', key: 'two', h: 40 })]), section([node({ sig: 'p.one', key: 'one', h: 40 })], { h: 260 }), T)
  assert.deepEqual([miss.kind, miss.sig], ['element-missing', 'p.two'])
  assert.equal(diffNode(section([node({ sig: 'p.one', key: 'one', h: 40 })]), section([node({ sig: 'p.one', key: 'one', h: 40 }), node({ sig: 'p.two', key: 'two', h: 40 })], { h: 340 }), T).kind, 'element-extra')
  // a deeper difference is reported at the deepest first child, not at the band
  const deep = diffNode(section([node({ sig: 'div.wrap', h: 200, k: [cards(8, 4, 100)] })]), section([node({ sig: 'div.wrap', h: 400, k: [cards(8, 2, 100)] })], { h: 500 }), T)
  assert.equal(deep.kind, 'column-count')
  assert.match(deep.culprit, /section\.s > div\.grid/)
})

test('diffNode: words set at another size are named when the two sides box them differently; the fallback says so when nothing names the box', () => {
  const section = (kids, o = {}) => node({ sig: 'section.s', h: 300, k: kids, ...o })
  const words = { key: '4401689486108', tx: '4401689486108', ot: '4401689486108' }
  const sized = diffNode(section([node({ sig: 'div.c', h: 30, lh: 30, fs: 20, tfs: 20, ...words })]), section([node({ sig: 'div.c', h: 24, lh: 24, fs: 16, ...words, k: [node({ sig: 'span', d: 'inline', h: 24, fs: 16, tfs: 16, ...words })] }), node({ sig: 'div.d', h: 0, words: 0, key: '' })], { h: 294 }), HEIGHT_TOLERANCE_PX)
  assert.equal(sized.kind, 'font-size-step')
  assert.match(sized.detail, /20px on the source, 16px on the port/)
  const none = diffNode(section([node({ sig: 'div.a', key: '', h: 100, words: 0 })]), section([node({ sig: 'div.b', key: '', h: 40, words: 0 }), node({ sig: 'div.c', key: '', h: 40, words: 0 })], { h: 260 }), HEIGHT_TOLERANCE_PX)
  assert.equal(none.kind, 'element-count')
  assert.match(none.detail, /box/)
})

test('diffNode: a link that wraps on one side is a text-wrap even when the boxes around it carry different padding; the same lines with another padding is a padding-step', () => {
  const link = (o) => node({ sig: 'a', key: 'Integrations', lh: 21.7, fs: 14, ...o })
  const wrapped = diffNode(link({ h: 40, pt: 4, pb: 4 }), link({ h: 61.4, pt: 9, pb: 9 }), HEIGHT_TOLERANCE_PX)
  assert.equal(wrapped.kind, 'text-wrap')
  assert.match(wrapped.detail, /1 line on the source, 2 lines on the port/)
  const padded = diffNode(link({ h: 30, pt: 4, pb: 4 }), link({ h: 40, pt: 9, pb: 9 }), 2)
  assert.equal(padded.kind, 'padding-step')
})

test('judgeHeights: tolerance edge, missing / extra / doubled bands, one cause across routes, not-comparable pages and a layout that never went quiet', () => {
  const s = (hs) => hs.map(([head, h], i) => band(head, h, { y: hs.slice(0, i).reduce((n, x) => n + x[1], 0), kind: head === 'HEAD' ? 'header' : head === 'FOOT' ? 'footer' : 'band', sig: head === 'HEAD' || head === 'FOOT' ? 'x' : 'section.' + head }))
  const rowOf = (route, width, S, P, docS, docP, o = {}) => ({ route, width, sourceUrl: `http://s.test${route}`, source: read(s(S), docS), port: read(s(P), docP), ...o })
  const same = [['HEAD', 100], ['one', 300], ['two', 300], ['FOOT', 100]]
  assert.equal(judgeHeights([rowOf('/a', 1024, same, same, 800, 800)]).defects.length, 0)
  const edge = (d) => judgeHeights([rowOf('/a', 1024, same, [['HEAD', 100], ['one', 300 + d], ['two', 300], ['FOOT', 100]], 800, 800 + d)])
  assert.equal(edge(8).defects.length, 0, 'exactly 8 px is within')
  assert.equal(edge(9).defects.length, 1, '9 px is beyond')
  // missing, extra, doubled
  const miss = judgeHeights([rowOf('/a', 1024, same, [['HEAD', 100], ['one', 300], ['FOOT', 100]], 800, 500)])
  assert.deepEqual(miss.defects.map((d) => [d.kind, d.cause, d.delta]), [['band-missing', 'heights|band:section.two|band-missing', -300]])
  const extra = judgeHeights([rowOf('/a', 1024, same, [['HEAD', 100], ['one', 300], ['two', 300], ['three', 150], ['FOOT', 100]], 800, 950)])
  assert.equal(extra.defects[0].kind, 'band-extra')
  const doubled = judgeHeights([rowOf('/a', 1024, same, [['HEAD', 100], ['one', 300], ['one', 300], ['two', 300], ['FOOT', 100]], 800, 1100)])
  assert.equal(doubled.defects[0].kind, 'band-doubled')
  // one cause across routes and widths is one group
  const rows = ['/a', '/b', '/c'].flatMap((r) => [390, 1024].map((w) => rowOf(r, w, same, [['HEAD', 100], ['one', 300], ['two', 300], ['FOOT', 100]], 800, 800)))
  assert.equal(groupDefects(judgeHeights(rows).defects).length, 0)
  const bare = judgeHeights([rowOf('/a', 1024, same, same, 800, 800, { source: { ...read(s(same), 800), bare: true, title: '404' } })])
  assert.deepEqual([bare.cases, bare.notDefects[0].what], [0, 'bare-source-page'])
  const home = judgeHeights([rowOf('/', 1024, same, same, 800, 800, { source: read(s(same), 800, { title: 'Home' }), port: read(s(same), 800, { title: 'Home' }) }), rowOf('/about', 1024, same, same, 800, 800, { source: read(s(same), 800, { title: 'Home' }), port: read(s(same), 800, { title: 'About' }) })])
  assert.deepEqual(home.notDefects.map((n) => [n.route, n.what]), [['/about', 'source-not-counterpart']])
  const redirected = judgeHeights([rowOf('/about', 1024, same, same, 800, 800, { source: read(s(same), 800, { finalPath: '/' }) })])
  assert.equal(redirected.notDefects[0].what, 'source-not-counterpart')
  const unquiet = judgeHeights([rowOf('/a', 1024, same, [['HEAD', 100], ['one', 500], ['two', 300], ['FOOT', 100]], 800, 1000, { port: read(s([['HEAD', 100], ['one', 500], ['two', 300], ['FOOT', 100]]), 1000, { quiet: { settled: false } }) })])
  assert.deepEqual([unquiet.defects.length, unquiet.notMeasured[0].cause], [0, 'layout-not-quiet'])
  // small steps that add up, with every band within the tolerance
  const small = judgeHeights([rowOf('/a', 1024, same, [['HEAD', 106], ['one', 306], ['two', 306], ['FOOT', 106]], 800, 824)])
  assert.equal(small.defects[0].kind, 'accumulated')
  // bands that cannot be paired are not measured, never guessed
  const u = judgeHeights([rowOf('/a', 1024, [['HEAD', 100], [null, 100], [null, 100], ['FOOT', 100]], [['HEAD', 100], [null, 100], ['FOOT', 100]], 400, 300)])
  assert.equal(u.notMeasured[0].cause, 'bands-unpairable')
})

test('settleHeightCells: an accepted cause is taken out of the cell before it is judged; the constant offset leaves the rest standing', () => {
  const j = { tolerance: 8, cells: [{ route: '/a', width: 1024, delta: -21 }, { route: '/b', width: 1024, delta: -61 }, { route: '/c', width: 1024, delta: 3 }], defects: [{ route: '/b', width: 1024 }], notMeasured: [], notDefects: [{ route: '/a', width: 1024, delta: -21, accepted: true }, { route: '/b', width: 1024, delta: -21, accepted: true }] }
  settleHeightCells(j)
  assert.deepEqual(j.cells.map((c) => [c.net, c.status]), [[0, 'accepted'], [-40, 'defect'], [3, 'ok']])
})

test('widths and the baseline: 576 and 992 are added to the default widths only; a ten-check baseline is refused with the fix named', () => {
  assert.deepEqual(heightsWidths([320, 390, 768, 1024, 1180, 1440]), [320, 390, 576, 768, 992, 1024, 1180, 1440])
  assert.deepEqual(heightsWidths([390, 1440], true), [390, 1440])
  assert.equal(ALL_CHECKS.length, 11)
  const ten = ALL_CHECKS.filter((c) => c !== 'heights')
  const m = baselineMismatch(ten, [...ALL_CHECKS])
  assert.match(m, /ran 10 check\(s\)/)
  assert.match(m, /this run 11/)
  assert.match(m, /from before the heights check existed/)
  assert.match(m, /--only overflow,scheme,background,header,chips,fixed-widgets,icons,forms,text,first-interaction/)
  assert.match(m, /fix-measure\.mjs merge .* --new heights=/)
})

// ---- a real browser on small local pages -----------------------------------------------------------------------------

const serve = (routes) =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const r = routes[req.url.split('?')[0]]
      if (!r) {
        res.writeHead(404, { 'content-type': 'text/html' })
        return res.end('<!doctype html><title>404</title><body>not found')
      }
      const send = () => {
        res.writeHead(r.status ?? 200, { 'content-type': r.type ?? 'text/html' })
        res.end(r.body)
      }
      if (r.delay) setTimeout(send, r.delay)
      else send()
    })
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })
    })
  })

const contract = (pages) => ({
  design: { theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' }, storage: { type: 'cookie', key: 'tracy_theme' } } },
  source: { kind: 'live', darkHook: 'attr:data-theme=dark', lightHook: 'attr:data-theme=light' },
  pages: pages.map((r) => ({ id: r, path: r, status: 200, sourceRoute: r }))
})

const doc = (body, css = '', script = '') => ({ body: `<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title><style>*{box-sizing:border-box}body{margin:0;font:16px/24px Arial;background:#fff}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>` })
const HEADER = '<header class="site-header"><h1 style="margin:0;padding:28px 20px">Site</h1></header>'
const FOOTER = (extra = '') => `<footer class="site-footer" style="padding:20px"><p style="margin:0">Copyright</p>${extra}</footer>`
const sec = (cls, head, inner, style = '') => `<section class="${cls}" style="${style}"><h2 style="margin:0 0 8px">${head}</h2>${inner}</section>`
const cards = (n) => Array.from({ length: n }, (_, i) => `<div class="card" style="height:90px;background:#eee"><span>Card ${i}</span></div>`).join('')

async function heights({ port, source, widths = [390, 1180], accept, settle, routes }) {
  const [p, s] = await Promise.all([serve(port), serve(source)])
  const list = routes ?? Object.keys(port)
  const plan = dossierPlan({ contract: contract(list) })
  const pairs = plan.pages.map((pg) => ({ ...pg, sourceUrl: new URL(pg.sourceRoute, s.origin).href }))
  const b = await browser.get()
  return runSweep({ browser: b, site: p.origin, source: s.origin, plan, pairs, widths, heightsWidths: widths, schemes: ['light'], only: ['heights'], concurrency: 3, settleMs: 50, heightsQuiet: settle, accept, confirm: false })
}
const causes = (report) => groupDefects(report.defects.heights).map((g) => g.cause)
const check = (report) => report.checks.find((c) => c.id === 'heights')

const PAGE = (header, bands, footer) => `${header}<main>${bands}</main>${footer}`
const gridCss = (cols1180, cols1440) => `.grid{display:grid;grid-template-columns:repeat(1,1fr);gap:10px;padding:0 20px}@media (min-width:1000px){.grid{grid-template-columns:repeat(${cols1180},1fr)}}@media (min-width:1300px){.grid{grid-template-columns:repeat(${cols1440},1fr)}}`

test('heights (browser): a column count that steps at another width is one cause naming the band, with the widths it occurs at', async () => {
  const bands = (extra = '') => sec('team', 'Our team', `<div class="grid">${cards(8)}</div>`, 'padding:30px 0') + sec('intro', 'Welcome', '<p>Hello</p>', 'padding:30px 20px') + extra
  const css = (c1180) => gridCss(c1180, 4)
  const port = { '/a': doc(PAGE(HEADER, bands(), FOOTER()), css(2)), '/b': doc(PAGE(HEADER, bands(), FOOTER()), css(2)) }
  const source = { '/a': doc(PAGE(HEADER, bands(), FOOTER()), css(4)), '/b': doc(PAGE(HEADER, bands(), FOOTER()), css(4)) }
  const r = await heights({ port, source, widths: [390, 1180, 1440] })
  assert.deepEqual(causes(r), ['heights|band:section.team|column-count'])
  const g = r.groups.heights[0]
  assert.deepEqual([g.widths, g.routes.sort()], [[1180], ['/a', '/b']])
  assert.match(g.example.detail, /4 columns on the source, 2 columns on the port/)
  assert.equal(check(r).pass, false)
  assert.equal(r.heights.cells.filter((c) => c.status === 'defect').length, 2)
  assert.match(formatSummary(r), /heights\|band:section\.team\|column-count/)
})

test('heights (browser): a padding step, a picture ratio, a font step; and different markup with the same heights is no defect', async () => {
  const mk = (padding, ratio, fs, markup = 'a') => {
    const intro = markup === 'a' ? `<div class="row"><div class="col"><p style="margin:0">Same text here</p></div></div>` : `<article><p style="margin:0">Same text here</p></article>`
    return doc(PAGE(HEADER, sec('promo', 'Promo', `<img class="pic" alt="" src="${PIC}" style="display:block;width:400px;aspect-ratio:${ratio};object-fit:cover">`, `padding:${padding}px 20px`) + sec('words', 'Words', `<p style="margin:0;font-size:${fs}px;line-height:1.2">One line</p>`, 'padding:20px') + sec('plain', 'Plain', intro, 'padding:20px'), FOOTER()))
  }
  const port = { '/pad': mk(20, '16/9', 16), '/ratio': mk(40, '1/1', 16), '/font': mk(40, '16/9', 40), '/same': mk(40, '16/9', 16, 'b') }
  const source = { '/pad': mk(60, '16/9', 16), '/ratio': mk(40, '16/9', 16), '/font': mk(40, '16/9', 16), '/same': mk(40, '16/9', 16, 'a') }
  const r = await heights({ port, source, widths: [1180] })
  const byRoute = Object.fromEntries(r.defects.heights.map((d) => [d.route, d.kind]))
  assert.deepEqual(byRoute, { '/pad': 'padding-step', '/ratio': 'image-ratio', '/font': 'font-size-step' })
  assert.equal(r.heights.cells.find((c) => c.route === '/same').status, 'ok')
})

test('heights (browser): a band only the source has, a band only the port has, a band printed twice', async () => {
  const one = sec('one', 'First', '<p>a</p>', 'padding:30px 20px')
  const two = sec('two', 'Second', '<p>b</p>', 'padding:30px 20px')
  const three = sec('news', 'Newsletter', '<p>c</p>', 'padding:30px 20px')
  const p = (b) => doc(PAGE(HEADER, b, FOOTER()))
  const port = { '/miss': p(one + two), '/extra': p(one + two + three), '/twice': p(one + two + two) }
  const source = { '/miss': p(one + two + three), '/extra': p(one + two), '/twice': p(one + two) }
  const r = await heights({ port, source, widths: [1180] })
  assert.deepEqual(Object.fromEntries(r.defects.heights.map((d) => [d.route, d.kind])), { '/miss': 'band-missing', '/extra': 'band-extra', '/twice': 'band-doubled' })
  assert.equal(r.defects.heights.find((d) => d.route === '/miss').cause, 'heights|band:section.news|band-missing')
})

test('heights (browser): one offset every route shares is ONE group; accepted, it is taken out and the rest of the cell is still judged', async () => {
  const body = (footerExtra, team) => doc(PAGE(HEADER, sec('intro', 'Welcome', '<p>Hello</p>', 'padding:30px 20px') + (team ? sec('team', 'Team', `<div class="grid">${cards(8)}</div>`, 'padding:10px 0') : ''), FOOTER(footerExtra)), gridCss(4, 4))
  const line = '<p class="legal" style="margin:0 0 0">Second legal line</p>'
  const port = { '/a': body('', false), '/b': body('', false), '/c': body('', true) }
  const source = { '/a': body(line, false), '/b': body(line, false), '/c': body(line, false) }
  const dir = mkdtempSync(path.join(tmpdir(), 'heights-'))
  const r = await heights({ port, source, widths: [1180] })
  const names = causes(r)
  assert.ok(names.includes('heights|footer|element-missing|p.legal'))
  assert.equal(r.groups.heights.find((g) => g.cause === 'heights|footer|element-missing|p.legal').routes.length, 3)
  assert.equal(r.groups.heights.find((g) => g.cause === 'heights|footer|element-missing|p.legal').example.delta, -24)
  assert.ok(names.includes('heights|band:section.team|band-extra'))
  // accepted by the dossier: the cells of /a and /b become clean, /c keeps its other cause
  const evidence = path.join(dir, 'e.txt')
  const decisions = '# Decisions\n\n## D-02 second legal line dropped\nThe second footer line is dropped by decision.\n'
  const { writeFileSync } = await import('node:fs')
  writeFileSync(evidence, 'measured')
  writeFileSync(path.join(dir, 'DECISIONS.md'), decisions)
  const { parseDecisions } = await import('../lib/parity-acceptance.mjs')
  const row = { check: 'heights', cause: 'heights|footer|element-missing|p.legal', routes: ['/a', '/b', '/c'], decision: 'D-02', kind: 'decided', evidence }
  const r2 = await heights({ port, source, widths: [1180], accept: { rows: [row], decisions: parseDecisions(decisions), runRoot: dir } })
  assert.deepEqual(r2.acceptErrors, [])
  assert.deepEqual(r2.heights.cells.map((c) => [c.route, c.status]), [['/a', 'accepted'], ['/b', 'accepted'], ['/c', 'defect']])
  assert.ok(r2.heights.cells.find((c) => c.route === '/c').net > 50)
  assert.equal(causes(r2).length, 1)
})

test('heights (browser): a masonry that settles late is waited for, a layout that never goes quiet is not-measured, a late font is waited for', async () => {
  const grow = (ms, to) => `setTimeout(function(){document.querySelector('.mas').style.height='${to}px'}, ${ms})`
  const page = (script, extraCss = '') => doc(PAGE(HEADER, sec('mas-s', 'Gallery', '<div class="mas" style="height:200px;background:#ddd"></div>', 'padding:20px') + sec('after', 'After', '<p>x</p>', 'padding:20px'), FOOTER()), extraCss, script)
  // the port's gallery grows 0.9 s after the load, the source's is there at once: a reading at 0.5 s would say -200
  const late = await heights({ port: { '/m': page(grow(900, 400)) }, source: { '/m': page(grow(0, 400)) }, widths: [1180] })
  assert.equal(check(late).defects, 0, JSON.stringify(late.defects.heights))
  assert.equal(late.heights.cells[0].status, 'ok')
  // never quiet: keeps growing
  const never = page("var h=200;setInterval(function(){h+=20;document.querySelector('.mas').style.height=h+'px'},100)")
  const nq = await heights({ port: { '/m': never }, source: { '/m': page(grow(0, 400)) }, widths: [1180], settle: { ceilingMs: 1800 } })
  assert.equal(check(nq).defects, 0)
  assert.equal(nq.notMeasured.heights[0].cause, 'layout-not-quiet')
  assert.equal(check(nq).pass, false)
  // a font that loads late: the port's file answers after 1.5 s, the source's at once; both draw the same page once it is there
  const ttf = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'node_modules', 'playwright-core', 'lib', 'vite', 'traceViewer', 'codicon.DCmgc-ay.ttf')
  if (existsSync(ttf)) {
    const bytes = readFileSync(ttf)
    const fontPage = doc(PAGE(HEADER, sec('txt', 'Words', `<p style="margin:0;font-family:Late,Arial;width:300px;word-break:break-all">${''.repeat(120)}</p>`, 'padding:20px'), FOOTER()), "@font-face{font-family:Late;src:url(/late.ttf);font-display:swap}")
    const f = await heights({ port: { '/f': fontPage, '/late.ttf': { type: 'font/ttf', body: bytes, delay: 1500 } }, source: { '/f': fontPage, '/late.ttf': { type: 'font/ttf', body: bytes } }, widths: [1180], routes: ['/f'] })
    assert.equal(check(f).defects, 0, JSON.stringify(f.defects.heights))
  }
})

test('heights: fix-measure.json carries the check; the check is part of the default run of eleven', async () => {
  const same = doc(PAGE(HEADER, sec('one', 'One', '<p>a</p>', 'padding:20px'), FOOTER()))
  const r = await heights({ port: { '/a': same }, source: { '/a': same }, widths: [390, 1180] })
  assert.equal(check(r).pass, true)
  assert.equal(check(r).cases, 2)
  const fm = {
    schema: 'tracy-fix-measure/v1',
    tool: 'site-sweep.mjs',
    ranAt: new Date().toISOString(),
    site: 'http://127.0.0.1:1',
    source: 'http://127.0.0.1:2',
    artifact: { themeZipSha256: 'a'.repeat(64) },
    checks: fixChecks(r.checks),
    passed: 1,
    total: 1,
    baseline: null,
    notDefects: []
  }
  assert.deepEqual(validateFixMeasure(fm), [])
})

test('judgeHeights: a region one side cuts into two bands and the other holds in one, with the same height together, is no defect', () => {
  const mk = (list) => list.map(([head, h, kind], i) => band(head, h, { y: list.slice(0, i).reduce((n, x) => n + x[1], 0), kind: kind ?? 'band', sig: kind ? 'x' : `section.${head}` }))
  const S = [['HEAD', 100, 'header'], ['project', 1000], ['FOOT', 100, 'footer']]
  const P = [['HEAD', 100, 'header'], ['project', 300], ['main', 700], ['FOOT', 100, 'footer']]
  const r = judgeHeights([{ route: '/p', width: 1024, sourceUrl: 'http://s.test/p', source: read(mk(S), 1200), port: read(mk(P), 1200) }])
  assert.equal(r.defects.length, 0, JSON.stringify(r.defects))
  assert.match(r.cells[0].notes[0], /cuts a region into 2 bands/)
  // margins between the two bands count in what they cover together
  const mkGap = (list) => list.map(([head, h, kind, y]) => band(head, h, { y, kind: kind ?? 'band', sig: kind ? 'x' : `section.${head}` }))
  const P3 = mkGap([['HEAD', 100, 'header', 0], ['project', 300, undefined, 100], ['main', 664, undefined, 436], ['FOOT', 100, 'footer', 1100]])
  assert.equal(judgeHeights([{ route: '/p', width: 1024, sourceUrl: 'http://s.test/p', source: read(mk(S), 1200), port: read(P3, 1200) }]).defects.length, 0)
  // but not when the two bands together are still another height
  const P2 = [['HEAD', 100, 'header'], ['project', 300], ['main', 900], ['FOOT', 100, 'footer']]
  assert.ok(judgeHeights([{ route: '/p', width: 1024, sourceUrl: 'http://s.test/p', source: read(mk(S), 1200), port: read(mk(P2), 1400) }]).defects.length > 0)
})

test('judgeHeights: two neighbouring bands that differ in opposite directions and cover the same extent together share an edge that stands elsewhere; one that grows alone is a defect', () => {
  const mk = (list) => list.map(([head, h, kind], i) => band(head, h, { y: list.slice(0, i).reduce((n, x) => n + x[1], 0), kind: kind ?? 'band', sig: kind ? 'x' : `section.${head}` }))
  const S = [['HEAD', 100, 'header'], ['features', 500], ['support', 600], ['FOOT', 100, 'footer']]
  const shifted = [['HEAD', 100, 'header'], ['features', 532], ['support', 568], ['FOOT', 100, 'footer']]
  const r = judgeHeights([{ route: '/', width: 1180, sourceUrl: 'http://s.test/', source: read(mk(S), 1300), port: read(mk(shifted), 1300) }])
  assert.equal(r.defects.length, 0, JSON.stringify(r.defects))
  assert.match(r.cells[0].notes[0], /opposite directions/)
  const grown = [['HEAD', 100, 'header'], ['features', 532], ['support', 600], ['FOOT', 100, 'footer']]
  assert.ok(judgeHeights([{ route: '/', width: 1180, sourceUrl: 'http://s.test/', source: read(mk(S), 1300), port: read(mk(grown), 1332) }]).defects.length > 0)
})

test('heights (browser): the cause is named where the words are — a padding that only looks different, a clipped box, an inline size, form words, deep wrappers, an overlay header', async () => {
  const row = (t) => `<p class="row" style="margin:0;height:44px">${t}</p>`
  const bodyOf = (main, header = HEADER) => doc(PAGE(header, main, FOOTER()), '.w{width:300px}')
  const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega alpha beta gamma delta epsilon zeta eta theta iota kappa lambda'
  const nest = (n, inner) => (n ? `<div class="w${n}">${nest(n - 1, inner)}</div>` : inner)
  const port = {
    // the padding is 96 on the port but its content is pulled up and down by 32: the space around the words is the same as on the source, one row is missing
    '/inset': bodyOf(sec('rel', 'Related', '<p style="margin:-32px 0 -32px">Body text</p>', 'padding:96px 20px')),
    '/cut': bodyOf(sec('rel', 'Related', `<div class="w"><p style="margin:0">${text}</p></div>`, 'padding:20px')),
    '/size': bodyOf(sec('ct', 'Contact', '<p style="margin:0"><span>4401689486108</span></p>', 'padding:20px')),
    '/words': bodyOf(sec('fm', 'Write', '<form><input placeholder="Your name" style="display:block;height:40px"></form>', 'padding:20px')),
    '/deep': bodyOf(sec('dp', 'Deep', nest(7, '<p style="margin:0;line-height:36px">Seven wrappers down</p>'), 'padding:20px')),
    '/overlay': bodyOf(sec('in', 'Intro', '<p style="margin:0">Hello</p>', 'padding:20px'), '<header class="site-header" style="position:absolute;top:0;left:0;right:0;height:140px;background:#ddd"><h1 style="margin:0">Site</h1></header>')
  }
  const source = {
    '/inset': bodyOf(sec('rel', 'Related', `<p style="margin:0">Body text</p>${row('Share:')}`, 'padding:64px 20px')),
    '/cut': bodyOf(sec('rel', 'Related', `<div class="w" style="height:72px;overflow:hidden"><p style="margin:0">${text}</p></div>`, 'padding:20px')),
    '/size': bodyOf(sec('ct', 'Contact', '<p style="margin:0"><span style="font-size:28px;line-height:40px">4401689486108</span></p>', 'padding:20px')),
    '/words': bodyOf(sec('fm', 'Write', '<form><input placeholder="Your name" style="display:block;height:40px"><input type="submit" value="Send message" style="display:block;height:40px"></form>', 'padding:20px')),
    '/deep': bodyOf(sec('dp', 'Deep', nest(7, '<p style="margin:0;line-height:24px">Seven wrappers down</p>'), 'padding:20px')),
    '/overlay': bodyOf(sec('in', 'Intro', '<p style="margin:0">Hello</p>', 'padding:20px'), '<header class="site-header" style="position:absolute;top:0;left:0;right:0;height:100px;background:#ddd"><h1 style="margin:0">Site</h1></header>')
  }
  const r = await heights({ port, source, widths: [1180] })
  const d = Object.fromEntries(r.defects.heights.map((x) => [x.route, x]))
  assert.equal(d['/inset'].kind, 'element-missing')
  assert.match(d['/inset'].detail, /share:/i)
  // (the words of the cut box show less than the whole text: that is its own finding beside the cut)
  assert.ok(r.defects.heights.some((x) => x.route === '/cut' && x.kind === 'text-cut'))
  assert.equal(d['/size'].kind, 'font-size-step')
  assert.match(d['/size'].detail, /28px on the source, 16px on the port/)
  assert.equal(d['/words'].kind, 'element-missing')
  assert.equal(d['/words'].sig ?? d['/words'].cause.split('|').pop(), 'input')
  assert.equal(d['/deep'].kind, 'line-height-step')
  assert.ok(r.defects.heights.some((x) => x.route === '/overlay' && /^heights\|header\|/.test(x.cause)))
})

test('heights (browser): the probe reads a picture set inline in a block box as a picture, the same as one set as a block', async () => {
  const svg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='red'/%3E%3C/svg%3E`
  const pictures = async (markup) => {
    const page = await (await browser.get()).newPage({ viewport: { width: 1180, height: 800 } })
    try {
      await page.setContent(doc(PAGE(HEADER, sec('promo', 'Promo', markup), '<footer>f</footer>')).body)
      const read = await page.evaluate(heightsInPage, { selectors: {} })
      const count = (n) => (n.img ? 1 : 0) + n.k.reduce((s, k) => s + count(k), 0)
      return read.bands.reduce((s, b) => s + count(b.tree), 0)
    } finally {
      await page.close()
    }
  }
  const inline = `<div><img alt="" src="${svg}" style="width:300px;height:120px"></div>`
  const block = `<figure style="margin:0"><img alt="" src="${svg}" style="display:block;width:300px;height:120px"></figure>`
  assert.equal(await pictures(block), 1)
  assert.equal(await pictures(inline), 1)
})

// ---- --explain ------------------------------------------------------------------------------------------------------

const sp = (hs) => hs.map(([head, h, lines, o = {}], i) => ({ kind: head === 'HEAD' ? 'header' : head === 'FOOT' ? 'footer' : 'band', y: o.y ?? hs.slice(0, i).reduce((n, x) => n + x[1], 0), h, tree: node({ sig: head === 'HEAD' || head === 'FOOT' ? 'x' : 'section.' + head, head: head === 'HEAD' || head === 'FOOT' ? '' : head, h, k: lines ? [node({ sig: 'p', h: lines * 24, lh: 24, words: 1 })] : [] }) }))
const explained = (S, P, docS = 800, docP = 800) => explainRow({ route: '/a', width: 1180, sourceUrl: 'http://s.test/a', source: read(sp(S), docS), port: read(sp(P), docP) })
const SRC = [['HEAD', 100, 1], ['one', 300, 2], ['two', 300, 3], ['FOOT', 100, 1]]

test('explain: the walk lists both sides block by block with selector, height, lines and the running offset, and marks the first block beyond the tolerance', () => {
  assert.equal(linesIn(sp(SRC)[1]), 2)
  const r = explained(SRC, [['HEAD', 100, 1], ['one', 348, 4], ['two', 300, 3], ['FOOT', 100, 1]], 800, 848)
  assert.equal(r.exit, 1)
  assert.equal(r.first.index, 2)
  assert.equal(r.lines.length, 4 + 3)
  assert.match(r.lines[0], /source 800px, port 848px, delta \+48px \(tolerance ±8px\) — the page totals differ/)
  assert.match(r.lines[3], /^ 2 {2}source section\.one "one" \[y 100 h 300 2 line\(s\)\] {2}port section\.one "one" \[y 100 h 348 4 line\(s\)\] {2}offset 0 → \+48 {3}<== first block beyond the tolerance$/)
  assert.match(r.lines[4], /^ 3 .*offset \+48 → \+48$/)
  assert.match(r.lines.at(-1), /^first difference: block 2 — the port is lower than the source by 48px at the bottom of this block/)
  const same = explained(SRC, SRC)
  assert.deepEqual([same.exit, same.first], [0, null])
  assert.match(same.lines.at(-1), /no block is beyond the tolerance/)
  assert.deepEqual(parseExplain('/about@1180'), { route: '/about', width: 1180 })
  for (const bad of ['', 'about@1180', '/a', '/a@12', '/a@abc', '/a@99999', '/a@1180@2', '/a@199']) assert.ok(parseExplain(bad).error, bad)
})

test('explain: the mark follows the running offset — steps that cancel are not marked, small steps that add up are named without a block', () => {
  // +4, -8, +4: the totals agree, every band is within the tolerance, the offset stays within 8px on every block
  const cancel = explained(SRC, [['HEAD', 104, 1], ['one', 292, 2], ['two', 304, 3], ['FOOT', 100, 1]])
  assert.equal(cancel.exit, 0)
  assert.equal(cancel.first, null)
  assert.ok(!cancel.lines.some((l) => /<==/.test(l)))
  // three steps of +5: no block is 8px taller; the offset passes 8px at the bottom of the second
  const add = explained([['HEAD', 100, 1], ['a', 100, 1], ['b', 100, 1], ['c', 100, 1], ['FOOT', 100, 1]], [['HEAD', 105, 1], ['a', 105, 1], ['b', 105, 1], ['c', 100, 1], ['FOOT', 100, 1]], 500, 515)
  assert.equal(add.exit, 1)
  // the judge reports them as a finding that names no block, so none is marked
  assert.equal(add.first, null)
  assert.match(add.lines.at(-1), /^the judge reports a difference that names no block: .*add up to 15px; the largest raw offset is \+15px at row 3$/)
  // a gap between blocks counts in the offset of the block after it
  const gap = explained([['HEAD', 100, 1], ['a', 100, 1], ['FOOT', 100, 1]], [['HEAD', 100, 1], ['a', 100, 1, { y: 130 }], ['FOOT', 100, 1]], 300, 330)
  assert.equal(gap.first.index, 2)
  assert.match(gap.lines[3], /offset \+30 → \+30/)
})

test('explain: a block only one side has is marked by its own height, a small one is not; extra port blocks keep the port\'s order; an unsure pairing is listed and not marked', () => {
  const miss = explained(SRC, [['HEAD', 100, 1], ['two', 300, 3], ['FOOT', 100, 1]], 800, 500)
  assert.equal(miss.first.index, 2)
  assert.match(miss.first.why, /source has a block the port does not/)
  const extra = explained(SRC, [['HEAD', 100, 1], ['one', 300, 2], ['new1', 20, 1], ['new2', 30, 1], ['two', 300, 3], ['FOOT', 100, 1]], 800, 850)
  assert.ok(extra.lines.findIndex((l) => /new1/.test(l)) < extra.lines.findIndex((l) => /new2/.test(l)))
  assert.equal(extra.first.index, 3)
  const small = explained(SRC, [['HEAD', 100, 1], ['one', 300, 2], ['new', 5, 1], ['two', 295, 3], ['FOOT', 100, 1]], 800, 800)
  assert.equal(small.first, null)
  // untitled bands the counts of which differ cannot be paired: listed, never marked
  const untitled = (hs) => hs.map((h, i) => ({ kind: 'band', y: i * 100, h, tree: node({ sig: 'div.u', head: '', h }) }))
  const un = explainRow({ route: '/a', width: 1180, source: read([...sp([['HEAD', 100, 1]]), ...untitled([100, 100]).map((b) => ({ ...b, y: b.y + 100 }))], 300), port: read([...sp([['HEAD', 100, 1]]), { ...untitled([150])[0], y: 100 }], 250) })
  assert.ok(un.lines.some((l) => /pairing not sure/.test(l)))
  assert.equal(un.first, null)
})

test('explain: the space before a block only one side has counts in the offset before that block; the marker is where the judge reports the block', () => {
  const S2 = [['HEAD', 100, 1], ['a', 100, 1]]
  // a block above the tolerance: the judge reports it, the walk marks it, and its offset starts at the gap before it
  const extra = explained(S2, [['HEAD', 100, 1], ['extra', 20, 1, { y: 130 }], ['a', 100, 1, { y: 150 }]], 200, 250)
  assert.equal(extra.first.index, 2)
  assert.match(extra.lines.find((l) => /extra/.test(l)), /offset \+30 → \+50 {3}<== first block/)
  const gone = explained([['HEAD', 100, 1], ['x', 20, 1, { y: 130 }], ['a', 100, 1, { y: 150 }]], S2, 250, 200)
  assert.equal(gone.first.index, 2)
  assert.match(gone.lines.find((l) => /section\.x/.test(l)), /offset -30 → -50 {3}<== first block/)
  // a block no higher than the tolerance: the judge cannot place the difference, so no block is marked; the raw offsets and the judge's reason are printed
  const small = explained(S2, [['HEAD', 100, 1], ['extra', 5, 1, { y: 130 }], ['a', 100, 1, { y: 135 }]], 200, 235)
  assert.equal(small.first, null)
  assert.match(small.lines.find((l) => /extra/.test(l)), /offset \+30 → \+35 {2}\(not judged: a band of 5px/)
  assert.match(small.lines.at(-1), /^the judge could not decide this cell \(bands-unpairable: .*\); no block is marked; the largest raw offset is \+35px at row 2$/)
})

test('explain: a region one side holds as one band and the other cuts into several of the same height together is one row with its parts under it', () => {
  const one = [['HEAD', 100, 1], ['one', 300, 2], ['FOOT', 100, 1]]
  const five = (each) => [['HEAD', 100, 1], ['one', each, 1], ['p2', each, 1], ['p3', each, 1], ['p4', each, 1], ['p5', each, 1], ['FOOT', 100, 1]]
  const quiet = explained(one, five(60), 500, 500)
  assert.deepEqual([quiet.exit, quiet.first], [0, null])
  assert.ok(!quiet.lines.some((l) => /<==|first difference/.test(l)))
  assert.equal(quiet.lines.filter((l) => /^ *\d+ {2}source/.test(l)).length, 3)
  assert.equal(quiet.lines.filter((l) => /part \d of 5 \(port\)/.test(l)).length, 5)
  // the same, the source cutting
  const rev = explained(five(60), one, 500, 500)
  assert.deepEqual([rev.exit, rev.first], [0, null])
  assert.equal(rev.lines.filter((l) => /part \d of 5 \(source\)/.test(l)).length, 5)
  // within the tolerance together, not exactly
  const near = explained(one, five(61), 505, 505)
  assert.equal(near.first, null)
  // 40px taller together: still one row of five parts, the offset taken at its edges (0 at the top, +40 at the bottom), and the group is the first difference
  const tall = explained(one, five(68), 500, 540)
  assert.equal(tall.exit, 1)
  assert.equal(tall.first.index, 2)
  assert.match(tall.lines.find((l) => /<==/.test(l)), /^ 2 .*section\.one/)
  assert.match(tall.lines.at(-1), /^first difference: block 2/)
  assert.equal(tall.lines.filter((l) => /^ *\d+ {2}source/.test(l)).length, 3)
  assert.equal(tall.lines.filter((l) => /part \d of 5 \(port\)/.test(l)).length, 5)
  assert.match(tall.lines.find((l) => /<==/.test(l)), /offset 0 → \+40/)
  const tallRev = explained(five(68), one, 540, 500)
  assert.equal(tallRev.lines.filter((l) => /part \d of 5 \(source\)/.test(l)).length, 5)
  assert.match(tallRev.lines.find((l) => /<==/.test(l)), /offset 0 → -40/)
})

test('explain: the printed text of the quiet fixtures — raw offsets on every row, a label on each skipped or grouped band, the verdict of the judge on the marker and the closing line, in both directions', () => {
  const S = [['HEAD', 100, 1], ['one', 100, 1], ['FOOT', 100, 1]]
  const P = [['HEAD', 100, 1], ['x1', 5, 0, { y: 100 }], ['x2', 5, 0, { y: 105 }], ['one', 100, 1, { y: 108 }], ['FOOT', 100, 1, { y: 208 }]]
  const row = (a, b, da, db) => ({ route: '/a', width: 1180, sourceUrl: 'http://s.test/a', source: read(sp(a), da), port: read(sp(b), db) })
  const one = [['HEAD', 100, 1], ['one', 300, 2], ['FOOT', 100, 1]]
  const five = (each) => [['HEAD', 100, 1], ['one', each, 1], ['p2', each, 1], ['p3', each, 1], ['p4', each, 1], ['p5', each, 1], ['FOOT', 100, 1]]
  const cases = [
    // small bands, port has them
    [S, P, 300, 308, 0, [
      "explain /a @1180: page height source 300px, port 308px, delta +8px (tolerance ±8px) — the page totals agree",
      "source http://s.test/a",
      " 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0",
      " 2  source — [none]  port section.x1 \"x1\" [y 100 h 5 1 line(s)]  offset 0 → +5  (not judged: a band of 5px with no partner on the source, and no content the judge can tell the other side lacks)",
      " 3  source — [none]  port section.x2 \"x2\" [y 105 h 5 1 line(s)]  offset +5 → +10  (not judged: a band of 5px with no partner on the source, and no content the judge can tell the other side lacks)",
      " 4  source section.one \"one\" [y 100 h 100 1 line(s)]  port section.one \"one\" [y 108 h 100 1 line(s)]  offset +8 → +8",
      " 5  source footer x [y 200 h 100 1 line(s)]  port footer x [y 208 h 100 1 line(s)]  offset +8 → +8",
      "the cell is quiet for the judge; the largest raw offset is +10px at row 3, beyond the tolerance of ±8px"
    ]],
    // small bands, source has them
    [P, S, 308, 300, 0, [
      "explain /a @1180: page height source 308px, port 300px, delta -8px (tolerance ±8px) — the page totals agree",
      "source http://s.test/a",
      " 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0",
      " 2  source section.x1 \"x1\" [y 100 h 5 1 line(s)]  port — [none]  offset 0 → -5  (not judged: a band of 5px with no partner on the port, and no content the judge can tell the other side lacks)",
      " 3  source section.x2 \"x2\" [y 105 h 5 1 line(s)]  port — [none]  offset -5 → -10  (not judged: a band of 5px with no partner on the port, and no content the judge can tell the other side lacks)",
      " 4  source section.one \"one\" [y 108 h 100 1 line(s)]  port section.one \"one\" [y 100 h 100 1 line(s)]  offset -8 → -8",
      " 5  source footer x [y 208 h 100 1 line(s)]  port footer x [y 200 h 100 1 line(s)]  offset -8 → -8",
      "the cell is quiet for the judge; the largest raw offset is -10px at row 3, beyond the tolerance of ±8px"
    ]],
    // one against five at 0, port cuts
    [one, five(60), 500, 500, 0, [
      "explain /a @1180: page height source 500px, port 500px, delta 0px (tolerance ±8px) — the page totals agree",
      "source http://s.test/a",
      " 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0",
      " 2  source section.one \"one\" [y 100 h 300 2 line(s)]  port section.one \"one\" [y 100 h 300 5 line(s)]  offset 0 → 0  (split-band group: the port cuts one region into 5 bands of the same height together; the judge compares them as one region)",
      "      part 1 of 5 (port) section.one \"one\" [y 100 h 60 1 line(s)]",
      "      part 2 of 5 (port) section.p2 \"p2\" [y 160 h 60 1 line(s)]",
      "      part 3 of 5 (port) section.p3 \"p3\" [y 220 h 60 1 line(s)]",
      "      part 4 of 5 (port) section.p4 \"p4\" [y 280 h 60 1 line(s)]",
      "      part 5 of 5 (port) section.p5 \"p5\" [y 340 h 60 1 line(s)]",
      " 3  source footer x [y 400 h 100 1 line(s)]  port footer x [y 400 h 100 1 line(s)]  offset 0 → 0",
      "no block is beyond the tolerance"
    ]],
    // one against five at 0, source cuts
    [five(60), one, 500, 500, 0, [
      "explain /a @1180: page height source 500px, port 500px, delta 0px (tolerance ±8px) — the page totals agree",
      "source http://s.test/a",
      " 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0",
      " 2  source section.one \"one\" [y 100 h 300 5 line(s)]  port section.one \"one\" [y 100 h 300 2 line(s)]  offset 0 → 0  (split-band group: the source cuts one region into 5 bands of the same height together; the judge compares them as one region)",
      "      part 1 of 5 (source) section.one \"one\" [y 100 h 60 1 line(s)]",
      "      part 2 of 5 (source) section.p2 \"p2\" [y 160 h 60 1 line(s)]",
      "      part 3 of 5 (source) section.p3 \"p3\" [y 220 h 60 1 line(s)]",
      "      part 4 of 5 (source) section.p4 \"p4\" [y 280 h 60 1 line(s)]",
      "      part 5 of 5 (source) section.p5 \"p5\" [y 340 h 60 1 line(s)]",
      " 3  source footer x [y 400 h 100 1 line(s)]  port footer x [y 400 h 100 1 line(s)]  offset 0 → 0",
      "no block is beyond the tolerance"
    ]],
    // one against five at +40, port taller
    [one, five(68), 500, 540, 1, [
      "explain /a @1180: page height source 500px, port 540px, delta +40px (tolerance ±8px) — the page totals differ",
      "source http://s.test/a",
      " 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0",
      " 2  source section.one \"one\" [y 100 h 300 2 line(s)]  port section.one \"one\" [y 100 h 340 5 line(s)]  offset 0 → +40  (split-band group by nearest fit: the port cuts one region into 5 bands; the judge does not group them)   <== first block beyond the tolerance",
      "      part 1 of 5 (port) section.one \"one\" [y 100 h 68 1 line(s)]",
      "      part 2 of 5 (port) section.p2 \"p2\" [y 168 h 68 1 line(s)]",
      "      part 3 of 5 (port) section.p3 \"p3\" [y 236 h 68 1 line(s)]",
      "      part 4 of 5 (port) section.p4 \"p4\" [y 304 h 68 1 line(s)]",
      "      part 5 of 5 (port) section.p5 \"p5\" [y 372 h 68 1 line(s)]",
      " 3  source footer x [y 400 h 100 1 line(s)]  port footer x [y 440 h 100 1 line(s)]  offset +40 → +40",
      "first difference: block 2 — the port is lower than the source by 40px at the bottom of this block (its own height differs)"
    ]],
    // one against five at +40, source taller
    [five(68), one, 540, 500, 1, [
      "explain /a @1180: page height source 540px, port 500px, delta -40px (tolerance ±8px) — the page totals differ",
      "source http://s.test/a",
      " 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0",
      " 2  source section.one \"one\" [y 100 h 340 5 line(s)]  port section.one \"one\" [y 100 h 300 2 line(s)]  offset 0 → -40  (split-band group by nearest fit: the source cuts one region into 5 bands; the judge does not group them)   <== first block beyond the tolerance",
      "      part 1 of 5 (source) section.one \"one\" [y 100 h 68 1 line(s)]",
      "      part 2 of 5 (source) section.p2 \"p2\" [y 168 h 68 1 line(s)]",
      "      part 3 of 5 (source) section.p3 \"p3\" [y 236 h 68 1 line(s)]",
      "      part 4 of 5 (source) section.p4 \"p4\" [y 304 h 68 1 line(s)]",
      "      part 5 of 5 (source) section.p5 \"p5\" [y 372 h 68 1 line(s)]",
      " 3  source footer x [y 440 h 100 1 line(s)]  port footer x [y 400 h 100 1 line(s)]  offset -40 → -40",
      "first difference: block 2 — the port is higher than the source by 40px at the bottom of this block (its own height differs)"
    ]],
  ]
  for (const [a, b, da, db, exit, text] of cases) {
    const r = explainRow(row(a, b, da, db))
    assert.equal(r.exit, exit)
    assert.deepEqual(r.lines, text)
  }
  // the judge is the same function the sweep runs: the quiet fixtures have no defect there
  for (const [a, b, da, db] of cases.slice(0, 4)) assert.equal(judgeHeights([row(a, b, da, db)]).defects.length, 0)
})

test('explain: the marker is the row the judge located the finding at — an overlay header with the same box as the band that changed is not marked; a finding that names no block marks none and the closing line says so; neighbours that cancel carry a label', () => {
  const row = (a, b, da, db) => ({ route: '/a', width: 1180, sourceUrl: 'http://s.test/a', source: read(sp(a), da), port: read(sp(b), db) })
  const text = (a, b, da, db) => explainRow(row(a, b, da, db)).lines
  const marked = (lines) => lines.filter((l) => l.includes('<== first block'))
  // overlay: the header and the band share y 0 h 100; only the band grows
  const over = (h) => [['HEAD', 100, 1, { y: 0 }], ['one', h, 1, { y: 0 }], ['FOOT', 100, 1, { y: h }]]
  assert.deepEqual(text(over(100), over(160), 200, 260), [
    'explain /a @1180: page height source 200px, port 260px, delta +60px (tolerance ±8px) — the page totals differ',
    'source http://s.test/a',
    ' 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0',
    ' 2  source section.one "one" [y 0 h 100 1 line(s)]  port section.one "one" [y 0 h 160 1 line(s)]  offset 0 → +60   <== first block beyond the tolerance',
    ' 3  source footer x [y 100 h 100 1 line(s)]  port footer x [y 160 h 100 1 line(s)]  offset +60 → +60',
    'first difference: block 2 — the port is lower than the source by 60px at the bottom of this block (its own height differs)'
  ])
  assert.equal(marked(text(over(160), over(100), 260, 200)).length, 1)
  assert.match(marked(text(over(160), over(100), 260, 200))[0], /^ 2 /)
  // small steps that add up: the judge names no block, none is marked
  const steps = (d) => [['HEAD', 100, 1], ['one', 100 + d, 1], ['two', 100 + d, 1], ['FOOT', 100, 1]]
  for (const [a, b, da, db] of [[steps(0), steps(6), 400, 412], [steps(6), steps(0), 412, 400]]) {
    const lines = text(a, b, da, db)
    assert.deepEqual(marked(lines), [])
    assert.match(lines.at(-1), /^the judge reports a difference that names no block: no band or gap differs by more than 8px, but the small steps add up to -?12px; the largest raw offset is [+-]12px at row 3$/)
  }
  // neighbours that differ in opposite directions: both rows say why the judge sets them aside, in both directions
  const S = [['HEAD', 100, 1], ['features', 500, 1], ['support', 600, 1], ['FOOT', 100, 1]]
  const P = [['HEAD', 100, 1], ['features', 532, 1], ['support', 568, 1], ['FOOT', 100, 1]]
  const why = '(this band and its neighbour differ in opposite directions and cover the same extent together; the judge compares the two as one region)'
  assert.deepEqual(text(S, P, 1300, 1300), [
    'explain /a @1180: page height source 1300px, port 1300px, delta 0px (tolerance ±8px) — the page totals agree',
    'source http://s.test/a',
    ' 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0',
    ` 2  source section.features "features" [y 100 h 500 1 line(s)]  port section.features "features" [y 100 h 532 1 line(s)]  offset 0 → +32  ${why}`,
    ` 3  source section.support "support" [y 600 h 600 1 line(s)]  port section.support "support" [y 632 h 568 1 line(s)]  offset +32 → 0  ${why}`,
    ' 4  source footer x [y 1200 h 100 1 line(s)]  port footer x [y 1200 h 100 1 line(s)]  offset 0 → 0',
    'the cell is quiet for the judge; the largest raw offset is +32px at row 2, beyond the tolerance of ±8px'
  ])
  assert.deepEqual(text(P, S, 1300, 1300), [
    'explain /a @1180: page height source 1300px, port 1300px, delta 0px (tolerance ±8px) — the page totals agree',
    'source http://s.test/a',
    ' 1  source header x [y 0 h 100 1 line(s)]  port header x [y 0 h 100 1 line(s)]  offset 0 → 0',
    ` 2  source section.features "features" [y 100 h 532 1 line(s)]  port section.features "features" [y 100 h 500 1 line(s)]  offset 0 → -32  ${why}`,
    ` 3  source section.support "support" [y 632 h 568 1 line(s)]  port section.support "support" [y 600 h 600 1 line(s)]  offset -32 → 0  ${why}`,
    ' 4  source footer x [y 1200 h 100 1 line(s)]  port footer x [y 1200 h 100 1 line(s)]  offset 0 → 0',
    'the cell is quiet for the judge; the largest raw offset is -32px at row 2, beyond the tolerance of ±8px'
  ])
})

test('explain: lines of text do not count padding or border as lines', () => {
  assert.equal(linesOf({ h: 48, lh: 24 }), 2)
  assert.equal(linesOf({ h: 48 + 32 + 2, lh: 24, pt: 16, pb: 16, bw: 2 }), 2)
  assert.equal(linesOf({ h: 10, lh: 24, pt: 16, pb: 16 }), 1)
  const b = { tree: node({ h: 80, k: [node({ h: 80, lh: 24, pt: 16, pb: 16, words: 1 }), node({ h: 24, lh: 24, words: 0 })] }) }
  assert.equal(linesIn(b), 2)
})

const timers = () => {
  const t = { set: [], cleared: [], fire: () => t.set.at(-1).fn() }
  t.setTimer = (fn, ms) => (t.set.push({ fn, ms }), t.set.length)
  t.clearTimer = (id) => t.cleared.push(id)
  return t
}
const never = () => new Promise(() => {})
const okMeasure = async () => ({ rows: [{ route: '/a', width: 1180, sourceUrl: 'http://s.test/a', source: read(sp(SRC), 800), port: read(sp(SRC), 800) }], owed: [] })

test('explain: one deadline, armed once; when it passes one line is printed and the process exits non-zero, whichever step hangs', async () => {
  const pair = { path: '/a', sourceUrl: 'http://s.test/a' }
  const steps = {
    resolve: { resolve: never, withBrowser: (f) => f({}), measure: okMeasure },
    launch: { resolve: async () => pair, withBrowser: never, measure: okMeasure },
    measure: { resolve: async () => pair, withBrowser: (f) => f({}), measure: never },
    close: { resolve: async () => pair, withBrowser: async (f) => (await f({}), never()), measure: okMeasure }
  }
  for (const [step, deps] of Object.entries(steps)) {
    const t = timers()
    const out = []
    const exits = []
    const disarm = armDeadline({ ms: 5000, label: '/a @1180', setTimer: t.setTimer, clearTimer: t.clearTimer, print: (l) => out.push(l), exit: (c) => exits.push(c) })
    let settled = false
    runExplain({ route: '/a', width: 1180, print: (l) => out.push(l), ...deps }).then(() => (settled = true))
    await new Promise((r) => setImmediate(r))
    assert.equal(t.set.length, 1, `${step}: one timer`)
    assert.equal(t.set[0].ms, 5000)
    t.fire()
    assert.deepEqual(exits, [3], step)
    assert.equal(out.filter((l) => /deadline/.test(l)).length, 1, step)
    assert.match(out.at(-1), /^explain \/a @1180: not measured — the deadline of 5s/)
    assert.equal(t.set.length, 1, `${step}: not re-armed`)
    disarm()
    assert.equal(t.cleared.length, 1)
    if (step === 'close') assert.ok(!settled)
  }
})

test('explain: the verdict follows the page totals; a cell that cannot be measured or compared is 3, and a thrown step is 3 with its reason', async () => {
  const run = (over, route = '/a') => {
    const out = []
    return runExplain({ route, width: 1180, resolve: async () => ({ path: '/a', sourceUrl: 'http://s.test/a' }), withBrowser: (f) => f({}), measure: okMeasure, print: (l) => out.push(l), ...over }).then((code) => ({ code, out }))
  }
  assert.equal((await run({})).code, 0)
  const tall = async () => ({ rows: [{ route: '/a', width: 1180, sourceUrl: 'http://s.test/a', source: read(sp(SRC), 800), port: read(sp([...SRC.slice(0, 3), ['FOOT', 150, 1]]), 850) }], owed: [] })
  assert.equal((await run({ measure: tall })).code, 1)
  const owed = await run({ measure: async () => ({ rows: [], owed: [{ reason: 'the page did not load' }] }) })
  assert.equal(owed.code, 3)
  assert.match(owed.out[0], /not measured — the page did not load/)
  assert.equal((await run({ resolve: async () => ({ path: '/a', sourceUrl: null, owedReason: 'cannot be resolved' }) })).code, 3)
  const boom = await run({ withBrowser: async () => { throw new Error('launch failed\nstack') } })
  assert.deepEqual([boom.code, boom.out], [3, ['explain /a @1180: not measured — launch failed']])
  const bare = async () => ({ rows: [{ route: '/a', width: 1180, sourceUrl: 'http://s.test/a', source: read(sp(SRC), 800, { bare: true }), port: read(sp(SRC), 800) }], owed: [] })
  assert.equal((await run({ measure: bare })).code, 3)
})

test('explain: a difference that starts in the last block, or at the end of a run of extra blocks, is marked there; blocks of neither side are no walk', async () => {
  const foot = explained(SRC, [...SRC.slice(0, 3), ['FOOT', 150, 1]], 800, 850)
  assert.equal(foot.exit, 1)
  assert.equal(foot.first.index, 4)
  assert.match(foot.first.why, /bottom of this block/)
  // a run of blocks of 5px each, which the judge does not count: it cannot place the difference, so no block is marked and the raw offsets stay
  const run = explained(SRC, [...SRC.slice(0, 2), ['n1', 5, 1], ['n2', 5, 1], ['n3', 5, 1], ...SRC.slice(2)], 800, 815)
  assert.equal(run.first, null)
  assert.match(run.lines.at(-1), /^the judge could not decide this cell/)
  assert.equal(run.lines.filter((l) => /not judged: a band of 5px/.test(l)).length, 3)
  assert.match(run.lines.find((l) => /section\.n3/.test(l)), /offset \+10 → \+15 /)
  // the same run with blocks above the tolerance: the last one of them closes the offset, the first one is marked
  const big = explained(SRC, [...SRC.slice(0, 2), ['n1', 20, 1], ['n2', 20, 1], ['n3', 20, 1], ...SRC.slice(2)], 800, 860)
  assert.equal(big.first.index, 3)
  const none = async () => ({ rows: [{ route: '/a', width: 1180, sourceUrl: 'http://s.test/a', source: read([], 800), port: read([], 800) }], owed: [] })
  const out = []
  const code = await runExplain({ route: '/a', width: 1180, resolve: async () => ({ path: '/a', sourceUrl: 'http://s.test/a' }), withBrowser: (f) => f({}), measure: none, print: (l) => out.push(l) })
  assert.equal(code, 3)
  assert.match(out[0], /not measured — the source has no blocks read/)
})

test('judgeHeights: bands that differ by more than the tolerance and give it back (+7, -14, +7) are judged as on the base, never listed as cancelling', () => {
  const S = [['HEAD', 100], ['a', 100], ['b', 100], ['c', 100], ['FOOT', 100]]
  const s = (hs) => hs.map(([head, h], i) => band(head, h, { y: hs.slice(0, i).reduce((n, x) => n + x[1], 0), kind: head === 'HEAD' ? 'header' : head === 'FOOT' ? 'footer' : 'band', sig: head === 'HEAD' || head === 'FOOT' ? 'x' : 'section.' + head }))
  const j = judgeHeights([{ route: '/a', width: 1024, sourceUrl: 'http://s.test/a', source: read(s(S), 500), port: read(s([['HEAD', 100], ['a', 107], ['b', 86], ['c', 107], ['FOOT', 100]]), 500) }])
  assert.equal(j.listed.length, 0)
})

test('explain: a dossier file is read only when it is a small regular file — a FIFO, a link, a directory, an empty or large file is refused before a read, an absent one is null', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'explain-json-'))
  try {
    const f = (n) => path.join(dir, n)
    writeFileSync(f('ok.json'), '{"a":1}')
    assert.deepEqual(readDossierJson(f('ok.json'), 'x'), { a: 1 })
    assert.equal(readDossierJson(f('absent.json'), 'x'), null)
    execFileSync('mkfifo', [f('fifo.json')])
    symlinkSync(f('ok.json'), f('link.json'))
    mkdirSync(f('dir.json'))
    writeFileSync(f('empty.json'), '')
    writeFileSync(f('big.json'), Buffer.alloc(2 * 1024 * 1024 + 1, 32))
    writeFileSync(f('bad.json'), '{')
    for (const [n, why] of [['fifo.json', /not a regular file/], ['link.json', /symbolic link/], ['dir.json', /not a regular file/], ['empty.json', /empty/], ['big.json', /larger than/], ['bad.json', /not valid JSON/]]) {
      assert.throws(() => readDossierJson(f(n), 'x'), why, n)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('judgeHeights: a cell with a band that has no partner (extra overlay, missing band) is judged as it is, even when the paired bands cancel within the page total', () => {
  const s = (hs) => hs.map(([head, h, y], i) => band(head, h, { y: y ?? hs.slice(0, i).reduce((n, x) => n + x[1], 0), kind: head === 'HEAD' ? 'header' : head === 'FOOT' ? 'footer' : 'band', sig: head === 'HEAD' || head === 'FOOT' ? 'x' : 'section.' + head }))
  const S = [['HEAD', 100], ['one', 300], ['two', 300], ['FOOT', 100]]
  const row = (port, doc = 800) => judgeHeights([{ route: '/a', width: 1024, sourceUrl: 'http://s.test/a', source: read(s(S), 800), port: read(port, doc) }])
  // header +20, footer -20 (the paired bands cancel); an extra band of 50 lies over the content after the header
  const extra = row(s([['HEAD', 120], ['over', 50, 100], ['one', 300, 120], ['two', 300, 420], ['FOOT', 80, 720]]))
  assert.ok(extra.defects.some((d) => d.what === 'height-band-extra'), JSON.stringify(extra.defects))
  // a band of the source the port lacks, the paired ones cancel
  const miss = row(s([['HEAD', 120], ['one', 300], ['FOOT', 80, 420]]), 500)
  assert.ok(miss.defects.some((d) => d.what === 'height-band-missing'), JSON.stringify(miss.defects))
})

test('explain: the line of a block only one side has shows the offset at its top and at its bottom; a negative gap that the block\'s own height gives back is marked by the top edge', () => {
  const H = [['HEAD', 100, 1], ['a', 100, 1]]
  // the extra block starts 10px above the end of the header: the offset is -10 at its top, 0 at its bottom
  const up = explained(H, [['HEAD', 100, 1], ['extra', 10, 1, { y: 90 }], ['a', 100, 1, { y: 100 }]], 200, 200)
  assert.equal(up.first.index, 2)
  assert.match(up.lines.find((l) => /extra/.test(l)), /offset -10 → 0 {3}<== first block/)
  assert.match(up.first.why, /lower|higher/)
  assert.match(up.first.why, /higher than the source by 10px at the top/)
  // a block only the source has: the same, the other way
  const gone = explained([['HEAD', 100, 1], ['x', 10, 1, { y: 90 }], ['a', 100, 1, { y: 100 }]], H, 200, 200)
  assert.equal(gone.first.index, 2)
  assert.match(gone.lines.find((l) => /section\.x/.test(l)), /offset \+10 → 0 {3}<== first block/)
})

// ---- a cell whose bands and page agree: the accepted amount, a strip band, the exit of --explain -----------------------------

const cellRow = (S, P, docS, docP) => ({ route: '/a', width: 1024, sourceUrl: 'http://s.test/a', source: read(S, docS), port: read(P, docP) })
const mkBands = (list) => list.map(([head, h, kind, y, tree]) => ({ kind: kind ?? 'band', y, h, tree: node({ sig: kind ? 'x' : `section.${head ?? 'strip'}`, head: head ?? '', h, y, ...tree }) }))
const lf = (key, y, h) => node({ sig: 'p', key, y, h, w: 600 })

test('settleHeightCells: an accepted amount offsets a difference that is there; a cell within the tolerance is never made a defect by it', () => {
  const cells = [[1, 330], [-8, -441], [8, 330], [0, -330], [9, 330], [40, 40], [-9, -330], [2, 330], [3, 330]]
  const j = {
    tolerance: 8,
    cells: cells.map(([delta], i) => ({ route: `/r${i}`, width: 576, delta })),
    defects: [{ route: '/r7', width: 576 }],
    notMeasured: [{ route: '/r8', width: 576 }],
    notDefects: cells.map(([, accepted], i) => ({ route: `/r${i}`, width: 576, delta: accepted, accepted: true }))
  }
  settleHeightCells(j)
  assert.deepEqual(j.cells.map((c) => [c.net, c.status]), [[1, 'ok'], [-8, 'ok'], [8, 'ok'], [0, 'ok'], [-321, 'defect'], [0, 'accepted'], [321, 'defect'], [2, 'defect'], [3, 'not-measured']])
  // what was accepted stays on the cell for the trace
  assert.deepEqual(j.cells.slice(0, 2).map((c) => c.accepted), [330, -441])
})

test('judgeHeights (synthetic readings): a strip band before a pair is the same region as the other side\'s one band when its content stands there; lost, it is a finding; of another extent, band-missing', () => {
  const H = ['HEAD', 100, 'header', 0]
  const F = (y) => ['FOOT', 100, 'footer', y]
  const strip = [null, 40, undefined, 100, { k: [lf('strip', 100, 40)] }]
  const main = ['main', 63, undefined, 140, { k: [lf('main', 140, 63)] }]
  const kinds = (S, P, doc = 303) => judgeHeights([cellRow(mkBands(S), mkBands(P), doc, doc)]).defects.map((d) => d.kind)
  // the content of the strip stands in the other side's band: one region, quiet
  const one = ['main', 103, undefined, 100, { k: [lf('strip', 100, 40), lf('main', 140, 63)] }]
  assert.deepEqual(kinds([H, strip, main, F(203)], [H, one, F(203)]), [])
  // the other side's band has the room of the strip and none of its words: found
  const lost = ['main', 103, undefined, 100, { k: [lf('main', 140, 63)] }]
  assert.ok(kinds([H, strip, main, F(203)], [H, lost, F(203)]).includes('element-missing'))
  // the strip stands elsewhere in the band (moved down by 40 px, the extent the same)
  const moved = ['main', 103, undefined, 100, { k: [lf('main', 100, 63), lf('strip', 163, 40)] }]
  assert.ok(kinds([H, strip, main, F(203)], [H, moved, F(203)]).length > 0)
  // the other side's band is not the extent of the two: the strip is a band of its own
  const shorter = ['main', 63, undefined, 140, { k: [lf('main', 140, 63)] }]
  assert.ok(kinds([H, strip, main, F(203)], [H, shorter, F(203)], 303).includes('band-missing'))
})

test('judgeHeights (synthetic readings): a strip outside the source header, inside the port header, is the same region; its words missing on the port are a finding; the logo pair is still judged', () => {
  const head = (y, h, tree) => ['HEAD', h, 'header', y, tree]
  const strip = [null, 40, 'pre', 0, { k: [node({ sig: 'li', key: 'call us', tx: 'callus', x: 120, y: 5, w: 200, h: 30, fx: 0 }), node({ sig: 'a', key: 'home', tx: 'home', x: 700, y: 10, w: 60, h: 20, fx: 0 })] }]
  const srcHead = head(40, 63, { k: [lf('menu', 60, 20)] })
  const both = head(0, 103, { k: [node({ sig: 'li', key: 'call us', tx: 'callus', x: 120, y: 5, w: 200, h: 30, fx: 0 }), node({ sig: 'a', key: 'home', tx: 'home', x: 700, y: 10, w: 60, h: 20, fx: 0 }), lf('menu', 60, 20)] })
  const noStrip = head(0, 103, { k: [node({ sig: 'a', key: 'home', tx: 'home', x: 700, y: 10, w: 60, h: 20, fx: 0 }), lf('menu', 60, 20)] })
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  const kinds = (S, P) => judgeHeights([cellRow(mkBands(S), mkBands(P), 203, 203)]).defects.map((d) => `${d.kind}:${d.culprit}`)
  assert.deepEqual(kinds([strip, srcHead, foot(103)], [both, foot(103)]), [])
  assert.deepEqual(kinds([strip, srcHead, foot(103)], [noStrip, foot(103)]).map((k) => k.split(':')[0]), ['element-missing'])
})

test('judgeHeights: what stays reported when the page totals agree — a block missing in one band and one extra in another, a few px of footer line', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = (kids, h = 100) => ['FOOT', h, 'footer', 500, { k: kids }]
  const rows = (S, P, docS = 600, docP = 600) => judgeHeights([cellRow(mkBands(S), mkBands(P), docS, docP)])
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  // 60 px gone from one band, 60 px extra in another that is not its neighbour: the page is as high as the source
  const swap = rows(
    [head, sec('one', 100, 250, [lf('alpha', 100, 60), lf('common', 160, 190)]), sec('mid', 350, 100, [lf('mid', 350, 100)]), sec('two', 450, 150, [lf('tail', 450, 150)]), foot([lf('end', 600, 100)], 100)],
    [head, sec('one', 100, 190, [lf('common', 100, 190)]), sec('mid', 290, 100, [lf('mid', 290, 100)]), sec('two', 390, 210, [lf('tail', 390, 150), lf('beta', 540, 60)]), foot([lf('end', 600, 100)], 100)],
    700, 700
  )
  // (what the block above it left makes the leaf below it stand 60 px higher: told too, as the bottom of a band is no measured line that carries it)
  const swapKinds = swap.defects.map((d) => d.kind)
  assert.ok(swapKinds.includes('element-extra') && swapKinds.includes('element-missing'), JSON.stringify(swapKinds))
  // a line of words only the source has in the footer, 10 px tall
  const line = rows([head, sec('one', 100, 400, [lf('c', 100, 400)]), foot([lf('copyright', 500, 100), lf('office', 600, 10)], 110)], [head, sec('one', 100, 400, [lf('c', 100, 400)]), foot([lf('copyright', 500, 100)])], 610, 600)
  assert.deepEqual(line.defects.map((d) => [d.kind, d.band]), [['element-missing', 'footer']])
  // with the footer in both, the cell stays quiet
  const quiet = rows([head, sec('one', 100, 400, [lf('c', 100, 400)]), foot([lf('copyright', 500, 100)])], [head, sec('one', 100, 400, [lf('c', 100, 400)]), foot([lf('copyright', 500, 100)])])
  assert.equal(quiet.defects.length, 0)
})

test('explain: the exit is the verdict of the judge — a defect with equal totals is 1, a quiet cell 0, a cell it cannot decide 3; the marker and the closing line agree', async () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 500, { k: [lf('end', 500, 100)] }]
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  const S = mkBands([head, sec('one', 100, 250, [lf('alpha', 100, 60), lf('common', 160, 190)]), sec('mid', 350, 100, [lf('mid', 350, 100)]), sec('two', 450, 150, [lf('tail', 450, 150)]), foot])
  const P = mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), sec('mid', 290, 100, [lf('mid', 290, 100)]), sec('two', 390, 210, [lf('tail', 390, 150), lf('beta', 540, 60)]), foot])
  const r = explainRow(cellRow(S, P, 700, 700))
  assert.equal(r.exit, 1)
  assert.ok(r.lines.some((l) => /<== first block beyond the tolerance/.test(l)))
  assert.match(r.lines.at(-1), /^first difference: block/)
  const quiet = explainRow(cellRow(S, S, 700, 700))
  assert.deepEqual([quiet.exit, quiet.first], [0, null])
  const U = mkBands([head, [null, 100, undefined, 100], [null, 100, undefined, 200], foot])
  const V = mkBands([head, [null, 200, undefined, 100], foot])
  const unsure = explainRow(cellRow(U, V, 600, 500))
  assert.equal(unsure.exit, 3)
  assert.match(unsure.lines.at(-1), /the judge could not decide this cell/)
  // through the command
  const out = []
  const code = await runExplain({ route: '/a', width: 1024, resolve: async () => ({ path: '/a', sourceUrl: 'http://s.test/a' }), withBrowser: (f) => f({}), measure: async () => ({ rows: [cellRow(S, P, 700, 700)], owed: [] }), print: (l) => out.push(l) })
  assert.equal(code, 1)
  assert.ok(out.some((l) => /first block beyond the tolerance/.test(l)))
})

test('explain: a cell with a defect and a band that cannot be paired is a defect (1) through explainRow and runExplain; no defect and an unpairable band is 3', async () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 500, { k: [lf('end', 500, 100)] }]
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  const blank = (y, h) => [null, h, undefined, y]
  // the first band lost a 60 px line; the two bands after it are one band on the other side, with no heading to say which is which
  const S = mkBands([head, sec('one', 100, 250, [lf('alpha', 100, 60), lf('common', 160, 190)]), blank(350, 75), blank(425, 75), foot])
  const P = mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), blank(290, 150), foot])
  const row = cellRow(S, P, 600, 540)
  const j = judgeHeights([row])
  assert.ok(j.defects.length > 0 && j.notMeasured.some((n) => n.cause === 'bands-unpairable'), JSON.stringify([j.defects, j.notMeasured]))
  assert.equal(explainRow(row).exit, 1)
  const out = []
  const code = await runExplain({ route: '/a', width: 1024, resolve: async () => ({ path: '/a', sourceUrl: 'http://s.test/a' }), withBrowser: (f) => f({}), measure: async () => ({ rows: [row], owed: [] }), print: (l) => out.push(l) })
  assert.equal(code, 1)
  assert.ok(out.some((l) => /first block beyond the tolerance|could not decide/.test(l)))
  // without the defect, the same unpairable bands are 3 through both
  const S2 = mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), blank(290, 75), blank(365, 75), foot])
  const quietRow = cellRow(S2, P, 540, 540)
  assert.equal(explainRow(quietRow).exit, 3)
  const code2 = await runExplain({ route: '/a', width: 1024, resolve: async () => ({ path: '/a', sourceUrl: 'http://s.test/a' }), withBrowser: (f) => f({}), measure: async () => ({ rows: [quietRow], owed: [] }), print: () => {} })
  assert.equal(code2, 3)
})

test('explain: a cell whose only finding is covered by an accept row is quiet (0) in the sweep and in explain; without the row it is a defect (1)', async () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 500, { k: [lf('end', 500, 100)] }]
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  const S = mkBands([head, sec('one', 100, 250, [lf('alpha', 100, 60), lf('common', 160, 190)]), sec('mid', 350, 100, [lf('mid', 350, 100)]), sec('two', 450, 150, [lf('tail', 450, 150)]), foot])
  const P = mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), sec('mid', 290, 100, [lf('mid', 290, 100)]), sec('two', 390, 210, [lf('tail', 390, 150), lf('beta', 540, 60)]), foot])
  const row = cellRow(S, P, 700, 700)
  const found = judgeHeights([row]).defects
  assert.ok(found.length > 0)
  const dir = mkdtempSync(path.join(tmpdir(), 'explain-accept-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'shot.png'), 'x')
  const decisions = parseDecisions('- **D-1** · the port keeps it.\n')
  const rows = [...new Set(found.map(causeOf))].map((cause) => ({ check: 'heights', cause, routes: ['/a'], widths: [1024], kind: 'decided', decision: 'D-1', evidence: 'shot.png' }))
  const accept = { rows, decisions, runRoot: dir }
  // the sweep's function on the same reading
  const sweepJudged = { heights: judgeHeights([row]) }
  const swept = settleVerdict(sweepJudged, accept, { routes: ['/a'], widths: [1024] })
  assert.deepEqual(swept.errors, [])
  assert.ok(['ok', 'accepted'].includes(sweepJudged.heights.cells[0].status), sweepJudged.heights.cells[0].status)
  const quiet = explainRow(row, { accept })
  assert.equal(quiet.exit, 0)
  assert.ok(['ok', 'accepted'].includes(quiet.cell.status))
  assert.doesNotMatch(quiet.lines.join('\n'), /<== first block/)
  assert.match(quiet.lines[0], /quiet only because of sweep\.accept: /)
  assert.ok(rows.every((r) => quiet.lines[0].includes(r.cause) && quiet.lines.at(-1).includes(r.cause)))
  // the same cell without the rows
  const open = explainRow(row)
  assert.deepEqual([open.exit, open.cell.status], [1, 'defect'])
  // a row of another route covers nothing here (and, out of the measured scope, is no stale row)
  assert.equal(explainRow(row, { accept: { ...accept, rows: rows.map((r) => ({ ...r, routes: ['/other'] })) } }).exit, 1)
  const run = (a) => runExplain({ route: '/a', width: 1024, resolve: async () => ({ path: '/a', sourceUrl: 'http://s.test/a' }), withBrowser: (f) => f({}), measure: async () => ({ rows: [row], owed: [] }), accept: a, print: () => {} })
  assert.equal(await run(accept), 0)
  assert.equal(await run(null), 1)
  // a row that is invalid is refused, not turned into a measurement failure
  await assert.rejects(run({ ...accept, rows: rows.map((r) => ({ ...r, decision: 'D-99' })) }), /D-99/)
})

test('settleHeightCells: an open defect wins over a band that cannot be paired in the same cell; the unpaired band alone is not-measured', () => {
  const j = { tolerance: 8, defects: [{ route: '/a', width: 1024 }], notDefects: [], notMeasured: [{ route: '/a', width: 1024 }, { route: '/b', width: 1024 }], cells: [{ route: '/a', width: 1024, delta: 60 }, { route: '/b', width: 1024, delta: 0 }] }
  settleHeightCells(j)
  assert.deepEqual(j.cells.map((c) => c.status), ['defect', 'not-measured'])
})

test('explain: a row that names the measured route and width and no longer matches is an error, as in the sweep (1, never 0); a row that covers more than this cell is applied by its own part and never judged by it (0); a declaration that is not a list is refused', async () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 500, { k: [lf('end', 500, 100)] }]
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  const S = mkBands([head, sec('one', 100, 250, [lf('alpha', 100, 60), lf('common', 160, 190)]), sec('mid', 350, 100, [lf('mid', 350, 100)]), sec('two', 450, 150, [lf('tail', 450, 150)]), foot])
  const P = mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), sec('mid', 290, 100, [lf('mid', 290, 100)]), sec('two', 390, 210, [lf('tail', 390, 150), lf('beta', 540, 60)]), foot])
  const row = cellRow(S, P, 700, 700)
  const dir = mkdtempSync(path.join(tmpdir(), 'explain-stale-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'shot.png'), 'x')
  const decisions = parseDecisions('- **D-1** · the port keeps it.\n- **D-2** · another.\n')
  const mk = (cause, extra = {}) => ({ check: 'heights', cause, routes: ['/a'], widths: [1024], kind: 'decided', decision: 'D-1', evidence: 'shot.png', ...extra })
  const good = [...new Set(judgeHeights([row]).defects.map(causeOf))].map((c) => mk(c))
  const stale = mk('heights|band:section.gone|band-missing', { decision: 'D-2' })
  const withStale = explainRow(row, { accept: { rows: [...good, stale], decisions, runRoot: dir } })
  assert.equal(withStale.exit, 1)
  assert.match(withStale.lines.at(-1), /stale exception/)
  // the same row for another width is not measured here: skipped, the cell stays quiet
  const other = explainRow(row, { accept: { rows: [...good, { ...stale, widths: [1440] }], decisions, runRoot: dir } })
  assert.equal(other.exit, 0)
  // a row whose scope is more than this cell (no widths, several routes or widths) is true or stale at cells one reading does not show: that is a whole-run question,
  // so it neither decides this cell nor is printed in its explanation; the sweep over every cell is what judges the row (here, on this reading alone, it calls the row stale)
  const { widths: _w, ...noWidths } = stale
  const wide = [noWidths, { ...stale, routes: ['/a', '/b'] }, { ...stale, widths: [1024, 1440] }]
  const run = (rows) => runExplain({ route: '/a', width: 1024, resolve: async () => ({ path: '/a', sourceUrl: 'http://s.test/a' }), withBrowser: (f) => f({}), measure: async () => ({ rows: [row], owed: [] }), accept: { rows, decisions, runRoot: dir }, print: () => {} })
  for (const w of wide) {
    const r = explainRow(row, { accept: { rows: [...good, w], decisions, runRoot: dir } })
    assert.equal(r.exit, 0)
    assert.deepEqual(r.undecided, [])
    assert.doesNotMatch(r.lines.join('\n'), /\/b|1440|not decided/)
    assert.equal(await run([...good, w]), 0)
    const full = { heights: judgeHeights([row]) }
    assert.equal(settleVerdict(full, { rows: [...good, w], decisions, runRoot: dir }, { routes: ['/a'], widths: [1024] }).errors.length, 1)
  }
  // a defect that is still open stays 1 whatever a wide row leaves undecided
  assert.equal((await run([noWidths])), 1)
  assert.equal(explainRow(row, { accept: { rows: [...good, stale, noWidths], decisions, runRoot: dir } }).exit, 1)
  // a row of another route or width does not cover the cell
  // the stale row whose whole scope is this cell is an error through runExplain as through explainRow
  assert.equal(await run([...good, stale]), 1)
  assert.equal(await run(good), 0)
  // a declaration that is not a list is refused (usage), whatever it holds
  for (const bad of [{}, { rows: [] }, 'x', 5]) {
    assert.throws(() => acceptContextOf(bad, dir), /not a list/)
    assert.throws(() => settleVerdict({ heights: judgeHeights([row]) }, { rows: bad }, { routes: ['/a'], widths: [1024] }), /not a list/)
  }
  assert.equal(acceptContextOf([], dir), null)
  assert.equal(acceptContextOf(undefined, dir), null)
})

test('explain: a cell that is quiet only because a not-measurable row closed its unpairable band names that row, in the header and the closing line', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 500, { k: [lf('end', 500, 100)] }]
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  const blank = (y, h) => [null, h, undefined, y]
  const S = mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), blank(290, 75), blank(365, 75), foot])
  const P = mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), blank(290, 150), foot])
  const row = cellRow(S, P, 540, 540)
  assert.equal(explainRow(row).exit, 3)
  const dir = mkdtempSync(path.join(tmpdir(), 'explain-nm-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'shot.png'), 'x')
  const accept = { rows: [{ check: 'heights', cause: 'bands-unpairable', kind: 'not-measurable', cases: 5, reason: 'no heading names the bands', measurement: 'measured by hand: equal', evidence: 'shot.png' }], decisions: null, runRoot: dir }
  // the row covers the cause across the run; the case of this cell it closes is the cell's part of it, and the run's count is not asked here
  const r = explainRow(row, { accept })
  assert.equal(r.exit, 0)
  assert.match(r.lines[0], /quiet only because of sweep\.accept: bands-unpairable \(not-measurable, measured by hand: measured by hand: equal\)/)
  assert.match(r.lines.at(-1), /only because of sweep\.accept: bands-unpairable/)
})

// a row that matched the measured cell but declares more than was measured stands by its own part (0), printing none of the rest; measured over its whole scope, explain reports the sweep's rejection
const broadFixture = () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 500, { k: [lf('end', 500, 100)] }]
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  const S = mkBands([head, sec('one', 100, 250, [lf('alpha', 100, 60), lf('common', 160, 190)]), sec('mid', 350, 100, [lf('mid', 350, 100)]), sec('two', 450, 150, [lf('tail', 450, 150)]), foot])
  const P = mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), sec('mid', 290, 100, [lf('mid', 290, 100)]), sec('two', 390, 210, [lf('tail', 390, 150), lf('beta', 540, 60)]), foot])
  const dir = mkdtempSync(path.join(tmpdir(), 'explain-broad-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'shot.png'), 'x')
  const decisions = parseDecisions('- **D-1** · the port keeps it.\n')
  const at = (route, width) => ({ ...cellRow(S, P, 700, 700), route, width })
  const causes = [...new Set(judgeHeights([at('/a', 1024)]).defects.map(causeOf))]
  const mk = (cause, extra = {}) => ({ check: 'heights', cause, routes: ['/a'], widths: [1024], kind: 'decided', decision: 'D-1', evidence: 'shot.png', ...extra })
  return { at, causes, mk, decisions, dir, S, P }
}
const runOne = (rows, accept, route = '/a', width = 1024) => runExplain({ route, width, resolve: async () => ({ path: route, sourceUrl: 'http://s.test' + route }), withBrowser: (f) => f({}), measure: async () => ({ rows, owed: [] }), accept, print: () => {} })

test('explain: an accept row that matched this cell and also names a route or width not measured stands by its own part (0), printing none of the rest; measured in full, the sweep\'s own rejection is reported', async () => {
  const { at, causes, mk, decisions, dir } = broadFixture()
  const cell = at('/a', 1024)
  for (const [extra, sweepWords] of [[{ routes: ['/a', '/b'] }, /names route \/b/], [{ widths: [1024, 1440] }, /names width 1440/]]) {
    const rows = causes.map((c) => mk(c, extra))
    const accept = { rows, decisions, runRoot: dir }
    const r = explainRow(cell, { accept })
    assert.equal(r.exit, 0)
    assert.deepEqual(r.undecided, [])
    assert.doesNotMatch(r.lines.join('\n'), /\/b|1440|not measured/)
    assert.equal(await runOne([cell], accept), 0)
    // the sweep over the full scope refuses the same row
    const clean = (x) => ({ ...x, port: cell.source })
    const full = { heights: judgeHeights([cell, clean(at('/a', 1440)), clean(at('/b', 1024))]) }
    const swept = settleVerdict(full, accept, { routes: ['/a', '/b'], widths: [1024, 1440] })
    assert.match(swept.errors.map((e) => e.message).join('\n'), sweepWords)
  }
  // a row that does not limit widths is likewise applied by its part in this cell
  const { widths: _w, ...noWidths } = mk(causes[0])
  assert.equal(explainRow(cell, { accept: { rows: [noWidths, ...causes.slice(1).map((c) => mk(c))], decisions, runRoot: dir } }).exit, 0)
  // the full scope measured (the routes and widths the row names are in the measurement): the sweep's rejection, non-zero
  for (const [extra, sweepWords] of [[{ routes: ['/a', '/b'] }, /names route \/b/], [{ widths: [1024, 1440] }, /names width 1440/]]) {
    const rows = causes.map((c) => mk(c, extra))
    const accept = { rows, decisions, runRoot: dir }
    const all = [cell, at('/a', 1440), at('/b', 1024), at('/b', 1440)].map((x) => ({ ...x, source: cell.source, port: x.route === '/a' && x.width === 1024 ? cell.port : cell.source }))
    const r = explainRow(cell, { accept, rows: all })
    assert.equal(r.exit, 1)
    assert.match(r.accept.errors.map((e) => e.message).join('\n'), sweepWords)
    assert.equal(await runOne(all, accept), 1)
  }
  // a singleton row still stands (0); a row of another route does not make a clean cell undecided
  const single = causes.map((c) => mk(c))
  assert.equal(explainRow(cell, { accept: { rows: single, decisions, runRoot: dir } }).exit, 0)
  assert.equal(explainRow(at('/z', 1024), { accept: { rows: single, decisions, runRoot: dir } }).exit, 1)
})

test('explain: a row is held to every route × width pair it names, and the verdict is the requested cell\'s alone — another cell\'s defect, rows or missing reading change nothing', async () => {
  const { at, causes, mk, decisions, dir } = broadFixture()
  const clean = (x) => ({ ...x, port: x.source })
  const a1 = at('/a', 1024)
  const b2 = at('/b', 1440)
  const accept = { rows: causes.map((c) => mk(c, { routes: ['/a', '/b'], widths: [1024, 1440] })), decisions, runRoot: dir }
  // /a@1024 and /b@1440 carry the cause; /a@1440 and /b@1024 were not measured: a question for a run that measures them, not for this cell
  const r = explainRow(a1, { accept, rows: [a1, b2] })
  assert.equal(r.exit, 0)
  assert.doesNotMatch(r.lines.join('\n'), /\/b|1440/)
  assert.equal(await runOne([a1, b2], accept), 0)
  // every pair judged, the group on /a only: the row names /b where the group does not occur — over-broad, as in the sweep (1) ...
  const aOnly = [a1, at('/a', 1440), clean(at('/b', 1024)), clean(at('/b', 1440))]
  const overBroad = explainRow(a1, { accept, rows: aOnly })
  assert.equal(overBroad.exit, 1)
  const swept = settleVerdict({ heights: judgeHeights(aOnly) }, accept, { routes: ['/a', '/b'], widths: [1024, 1440] })
  assert.equal(overBroad.accept.errors[0].message, swept.errors[0].message)
  // ... but a reading the judge sets aside is not measured: that pair is missing and the row is not judged over its whole scope
  const noSource = { ...at('/b', 1024), source: null }
  assert.equal(explainRow(a1, { accept, rows: [a1, at('/a', 1440), noSource, clean(at('/b', 1440))] }).exit, 0)
  // every pair judged and the group on all of them: the row stands (0), as in the sweep
  const all = [a1, at('/a', 1440), at('/b', 1024), b2]
  const full = explainRow(a1, { accept, rows: all })
  assert.equal(full.exit, 0)
  const sw = { heights: judgeHeights(all) }
  assert.deepEqual(settleVerdict(sw, accept, { routes: ['/a', '/b'], widths: [1024, 1440] }).errors, [])
  // a defect of another cell is not this cell's: a clean cell stays quiet beside it
  const quietCell = clean(at('/c', 1024))
  const beside = explainRow(quietCell, { accept: null, rows: [quietCell, a1] })
  assert.equal(beside.exit, 0)
  assert.equal(await runOne([quietCell, a1], null, '/c', 1024), 0)
  assert.equal(await runOne([quietCell, a1], null, '/a', 1024), 1)
  // a row that concerns only another cell does not make this one undecided or an error
  const other = { rows: causes.map((c) => mk(c, { routes: ['/z', '/y'], widths: [1024, 1440] })), decisions, runRoot: dir }
  assert.equal(explainRow(quietCell, { accept: other, rows: [quietCell, a1] }).exit, 0)
  // no reading for the requested cell: not measured (3), never another cell's verdict
  assert.equal(await runOne([a1], accept, '/zz', 1024), 3)
})

test('explain: in a run of several routes × widths whose accept rows each span many of them (and a not-measurable row spans the run), every cell the sweep marks ok exits 0 without naming other routes or widths, and a defect cell still exits 1', async () => {
  const { at, causes, mk, decisions, dir } = broadFixture()
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 500, { k: [lf('end', 500, 100)] }]
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  const blank = (y, h) => [null, h, undefined, y]
  const unpairable = (route, width) => ({ ...cellRow(mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), blank(290, 75), blank(365, 75), foot]), mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), blank(290, 150), foot]), 540, 540), route, width })
  const clean = (x) => ({ ...x, port: x.source })
  // /a and /b carry the findings at both widths (the rows cover exactly those); /c is clean; /d has a finding no row covers; /e holds an unpairable band at both widths
  const readings = [at('/a', 1024), at('/a', 1440), at('/b', 1024), at('/b', 1440), clean(at('/c', 1024)), clean(at('/c', 1440)), unpairable('/e', 1024), unpairable('/e', 1440), at('/d', 1024)]
  const rows = [...causes.map((c) => mk(c, { routes: ['/a', '/b'], widths: [1024, 1440], decision: 'D-1' })), { check: 'heights', cause: 'bands-unpairable', kind: 'not-measurable', cases: 9, reason: 'no heading names the bands', measurement: 'equal by hand', evidence: 'shot.png' }]
  // the rows above also have to cover /d: they do not, so the sweep leaves it a defect
  const accept = { rows, decisions, runRoot: dir }
  const sweep = { heights: judgeHeights(readings) }
  const settled = settleVerdict(sweep, accept, { routes: ['/a', '/b', '/c', '/d', '/e'], widths: [1024, 1440] })
  assert.deepEqual(settled.errors, [])
  const status = (r, w) => sweep.heights.cells.find((c) => c.route === r && c.width === w).status
  for (const [r, w] of [['/a', 1024], ['/a', 1440], ['/b', 1024], ['/b', 1440], ['/c', 1024], ['/c', 1440], ['/e', 1024], ['/e', 1440]]) assert.ok(['ok', 'accepted'].includes(status(r, w)), `${r}@${w} ${status(r, w)}`)
  assert.equal(status('/d', 1024), 'defect')
  for (const [r, w] of [['/a', 1024], ['/b', 1440], ['/c', 1024], ['/c', 1440], ['/e', 1024], ['/e', 1440]]) {
    // each cell on its own, as the command line measures it
    const one = readings.find((x) => x.route === r && x.width === w)
    const ex = explainRow(one, { accept })
    assert.equal(ex.exit, 0, `${r}@${w}: ${ex.lines.at(-1)}`)
    assert.deepEqual(ex.undecided, [])
    const text = ex.lines.join('\n')
    for (const other of ['/a', '/b', '/c', '/d', '/e'].filter((x) => x !== r)) assert.ok(!text.includes(other + ' ') && !text.includes(other + '@'), `${r}@${w} names ${other}`)
    assert.equal(await runOne([one], accept, r, w), 0)
  }
  const d = readings.find((x) => x.route === '/d')
  assert.equal(explainRow(d, { accept }).exit, 1)
  assert.equal(await runOne([d], accept, '/d', 1024), 1)
})

test('explain: a not-measurable row with cases: 1 against two cases is rejected like the sweep when both are in the cell; one case in the cell is closed by the row (0)', async () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 500, { k: [lf('end', 500, 100)] }]
  const sec = (name, y, h, kids) => [name, h, undefined, y, { k: kids }]
  const blank = (y, h) => [null, h, undefined, y]
  const two = cellRow(mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), blank(290, 75), blank(365, 75), foot]), mkBands([head, sec('one', 100, 190, [lf('common', 100, 190)]), blank(290, 150), foot]), 540, 540)
  const dir = mkdtempSync(path.join(tmpdir(), 'explain-nm-count-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'shot.png'), 'x')
  const nm = (cases) => ({ rows: [{ check: 'heights', cause: 'bands-unpairable', kind: 'not-measurable', cases, reason: 'no heading names the bands', measurement: 'equal', evidence: 'shot.png' }], decisions: null, runRoot: dir })
  const count = judgeHeights([two]).notMeasured.filter((n) => n.cause === 'bands-unpairable').length
  assert.ok(count >= 1)
  // the sweep on the same reading
  const swept = settleVerdict({ heights: judgeHeights([two]) }, nm(count - 1 || 1), { routes: ['/a'], widths: [1024] })
  if (count > 1) {
    const r = explainRow(two, { accept: nm(count - 1) })
    assert.equal(r.exit, 1)
    assert.match(r.accept.errors[0].message, /case\(s\) of this cause are not measured, the row records/)
    assert.equal(r.accept.errors[0].message, swept.errors[0].message)
    assert.equal(await runOne([two], nm(count - 1)), 1)
  }
  // a row recording exactly what the cell holds closes it for the cell; the run's count is a whole-run question, not asked here
  const ok = explainRow(two, { accept: nm(count) })
  assert.equal(ok.exit, 0)
  assert.equal(await runOne([two], nm(count)), 0)
  // two cells with a case each, measured together, exceed cases: 1 as the sweep sees it
  const other = { ...two, route: '/b' }
  const both = [two, other]
  const sw2 = settleVerdict({ heights: judgeHeights(both) }, nm(count), { routes: ['/a', '/b'], widths: [1024] })
  assert.match(sw2.errors[0]?.message ?? '', /case\(s\) of this cause are not measured, the row records/)
  const r2 = explainRow(two, { accept: nm(count), rows: both })
  assert.equal(r2.exit, 1)
  assert.equal(r2.accept.errors[0].message, sw2.errors[0].message)
  assert.equal(await runOne(both, nm(count)), 1)
  // the count error of the run belongs to the cells that hold the cause: a clean cell beside them is neither an error nor undecided
  const quiet = { ...two, route: '/q', port: two.source }
  const rq = explainRow(quiet, { accept: nm(count), rows: [two, other, quiet] })
  assert.equal(rq.exit, 0)
  assert.equal(await runOne([two, other, quiet], nm(count), '/q', 1024), 0)
})

test('sweep.accept: a heights row that names only the widths heights reads on its own (576, 992) is applied, not skipped (ja-restaurant footer logo at 576)', async () => {
  const { applyAccept } = await import('../visual/site-sweep-accept.mjs')
  const cause = 'heights|footer|element-missing|a.t3-logo.t3-logo-light.t3-logo-small'
  const judged = () => ({ heights: { defects: [{ route: '/', width: 576, what: 'height-element-missing', cause }, { route: '/blog', width: 576, what: 'height-element-missing', cause }], notDefects: [] } })
  const row = { check: 'heights', cause, routes: ['/', '/blog'], widths: [576], decision: 'D-06', evidence: 'e.md', kind: 'decided' }
  const sweepWidths = [320, 390, 768, 1024, 1180, 1440]
  const j = judged()
  const r = applyAccept(j, [row], { routes: ['/', '/blog'], widths: sweepWidths, heightsWidths: [320, 390, 576, 768, 992, 1024, 1180, 1440] })
  assert.deepEqual(r.skipped, [])
  assert.deepEqual(r.errors, [])
  assert.equal(r.accepted.length, 1)
  assert.equal(j.heights.defects.length, 0)
  // a width heights did not read either is still out of this run
  const k = judged()
  const s = applyAccept(k, [{ ...row, widths: [576] }], { routes: ['/', '/blog'], widths: sweepWidths, heightsWidths: [1440] })
  assert.equal(s.accepted.length, 0)
  assert.equal(s.skipped.length, 1)
})

// ---- slice A: what is seen -------------------------------------------------------------------------------------------------

// painted pictures (a red square, a blue one) and an empty one that draws nothing
const PIC = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='red'/%3E%3C/svg%3E`
const PIC2 = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='blue'/%3E%3C/svg%3E`
const EMPTY_PIC = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E`
async function probe(body, css = '', width = 1180) {
  const page = await (await browser.get()).newPage({ viewport: { width, height: 800 } })
  try {
    await page.setContent(doc(body, css).body)
    return await page.evaluate(heightsInPage, { selectors: {} })
  } finally {
    await page.close()
  }
}
const leavesIn = (n) => (n.k.length ? n.k.flatMap(leavesIn) : [n])
const everyNode = (n) => [n, ...n.k.flatMap(everyNode)]
const defectKinds = (r) => r.defects.heights.map((d) => `${d.kind}:${d.band}`)

test('heights (browser): headings, keys, words and fonts come from what is seen — hidden, transparent, clipped and off-page text is none of them; a 2 px line of text is', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      `<section class="a"><h2 style="display:none">Ghost heading</h2><div style="opacity:0"><h2>Faded heading</h2></div><h2 style="color:transparent">Clear heading</h2><h2 style="clip:rect(0,0,0,0);position:absolute">Clipped heading</h2><h2>Real heading</h2>` +
        `<p class="t1" style="margin:0"><span style="color:transparent;font-size:40px">invisible words</span></p>` +
        `<p class="t2" style="margin:0;font-size:2px;line-height:2px">fine print</p>` +
        `<p class="t3" style="margin:0;text-indent:-9999px">offpage words</p>` +
        `<p class="t4" style="margin:0;height:0;overflow:hidden">cut away words</p>` +
        `<div class="t5" style="visibility:hidden"><span style="visibility:visible">shown inside</span></div></section>`,
      '<footer>f</footer>'
    )
  )
  const sec = r.bands.find((b) => b.kind === 'band')
  assert.equal(sec.tree.head, 'real heading')
  assert.ok(!/ghost|faded|clear|clipped|invisible|offpage|cut/.test(sec.tree.key + sec.tree.all), sec.tree.all)
  const by = (cls) => everyNode(sec.tree).find((n) => n.sig.includes(cls))
  assert.equal(by('t1')?.words ?? 0, 0)
  assert.equal(by('t2').words, 1)
  assert.equal(by('t2').tx, 'fineprint')
  assert.equal(by('t3')?.words ?? 0, 0)
  assert.equal(by('t5').tx, 'shownin' + 'side')
  // the font of a box is the font of the words that show: the transparent 40 px run sets nothing
  assert.ok(by('t1')?.tfs == null)
})

test('heights (browser): a form control with transparent text, or no room, reads no words; a painted one does', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      sec(
        'f',
        'Form',
        `<form><input class="i1" type="submit" value="Hidden send" style="color:transparent;display:block;height:30px"><input class="i2" type="submit" value="Shown send" style="display:block;height:30px">` +
          `<select class="i3" style="color:transparent;display:block;height:30px"><option>Secret option</option></select><input class="i4" placeholder="Shown hint" style="display:block;height:30px"><input class="i5" placeholder="Faint hint" style="display:block;height:30px" id="faint">` +
          `<input class="i6" type="submit" value="Tiny send" style="display:block;height:2px;padding:0;border:0"></form>`
      ),
      '<footer>f</footer>'
    ),
    '#faint::placeholder{color:transparent}'
  )
  const form = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const tx = (cls) => form.find((n) => n.sig.includes(cls))?.tx ?? ''
  assert.equal(tx('i1'), '')
  assert.equal(tx('i2'), 'shownsend')
  assert.equal(tx('i3'), '')
  assert.equal(tx('i4'), 'shownhint')
  assert.equal(tx('i5'), '')
  assert.equal(tx('i6'), 'tinysend')
})

test('heights (browser): a subtree the depth or the budget folds into one leaf keeps the same filter, the same heading and the same sizes', async () => {
  const nest = (n, inner) => (n ? `<div>${nest(n - 1, inner)}</div>` : inner)
  const many = Array.from({ length: 640 }, (_, i) => `<div class="m"><span>w${i}</span></div>`).join('')
  const r = await probe(
    PAGE(HEADER, `<section class="deep"><h2>Deep</h2>${nest(14, '<p class="x" style="margin:0"><span style="font-size:30px">Big words</span> <span style="display:none">ghost</span><span style="color:transparent">clear</span></p><h3 style="display:none">Ghost h3</h3>')}</section><section class="wide"><h2>Wide</h2>${many}<div class="late"><h3 style="display:none">Hidden</h3><h3>Shown late</h3><p style="margin:0">late <span style="opacity:0">ghost</span></p></div></section>`, '<footer>f</footer>')
  )
  const deep = r.bands.find((b) => b.tree.head === 'deep')
  const folded = leavesIn(deep.tree).find((n) => n.tx.includes('big'))
  assert.equal(folded.tx, 'bigwords')
  assert.equal(folded.tfs, 30)
  const wide = r.bands.find((b) => b.tree.head === 'wide')
  const late = everyNode(wide.tree).find((n) => n.sig === 'div.late')
  assert.ok(late, 'the late box is in the tree')
  assert.equal(late.fold, 1, 'folded by the budget')
  assert.equal(late.head, 'shown late')
  // a folded box keeps every leaf it holds, flat, each read by the same rule (the hidden heading is none of them, nor the faded word)
  assert.deepEqual(late.k.map((k) => k.tx), ['shownlate', 'late'])
})

test('heights (browser): words and pictures that are not seen change no verdict; the same page with them seen does', async () => {
  const page = (inner, extraBand = '') => doc(PAGE(HEADER, sec('intro', 'Welcome', inner, 'padding:20px') + extraBand, FOOTER()))
  const ghosts = '<h2 style="display:none">Ghost</h2><img alt="" src="' + PIC + '" style="width:30px;height:30px;visibility:hidden;position:absolute"><p style="margin:0;height:0;overflow:hidden">cut away</p>'
  const r = await heights({ port: { '/a': page('<p style="margin:0">Hello there</p>') }, source: { '/a': page(`<p style="margin:0">Hello there<span style="color:transparent"> invisible words</span></p>${ghosts}`) }, widths: [1180] })
  assert.deepEqual(r.defects.heights, [])
  // the same words seen are a difference
  const r2 = await heights({ port: { '/a': page('<p style="margin:0">Hello there</p>') }, source: { '/a': page('<p style="margin:0">Hello there</p><p style="margin:0;height:0;overflow:visible">cut away</p>') }, widths: [1180] })
  assert.ok(r2.defects.heights.some((d) => d.kind === 'element-missing'), JSON.stringify(defectKinds(r2)))
})

// ---- slice A: what only one side has ---------------------------------------------------------------------------------------

const smallImg = `<img alt="" src="${PIC}" style="display:block;width:12px;height:12px">`
const thinLine = '<p class="fine" style="margin:0;font-size:2px;line-height:2px;height:2px;overflow:visible">fine print</p>'

test('heights (browser): a 12 px picture or a 2 px line of text only one side has is found in an equal band, an unequal band, a wrapper and a footer', async () => {
  const fixed = (inner) => doc(PAGE(HEADER, sec('intro', 'Welcome', `<div style="height:60px"><p style="margin:0">Hello there</p>${inner}</div>`, 'padding:20px'), FOOTER()))
  const free = (inner) => doc(PAGE(HEADER, sec('intro', 'Welcome', `<p style="margin:0">Hello there</p>${inner}`, 'padding:20px'), FOOTER()))
  const wrapped = (inner) => doc(PAGE(HEADER, sec('intro', 'Welcome', `<div class="w1"><div class="w2"><p style="margin:0">Hello there</p>${inner}</div></div>`, 'padding:20px'), FOOTER()))
  const foot = (inner) => doc(PAGE(HEADER, sec('intro', 'Welcome', '<p style="margin:0">Hello there</p>', 'padding:20px'), FOOTER(inner)))
  const cases = {
    '/equal-img': [fixed(smallImg), fixed('')],
    '/equal-line': [fixed(thinLine), fixed('')],
    '/unequal-img': [free(smallImg), free('')],
    '/unequal-line': [free('<p class="fine2" style="margin:0;font-size:2px;line-height:14px">fine print</p>'), free('')],
    '/wrapper-img': [wrapped(smallImg), wrapped('')],
    '/foot-line': [foot('<p class="fine3" style="margin:0;font-size:3px;line-height:4px;height:4px">fine print</p>'), foot('')],
    '/extra-img': [fixed(''), fixed(smallImg)],
    // a painted pixel and a rule clipped to one pixel high are ink; no size exempts them
    '/pixel-img': [fixed(`<img alt="" src="${PIC}" style="display:block;width:1px;height:1px">`), fixed('')],
    '/rule-1px': [fixed(`<div style="height:1px;overflow:hidden"><img alt="" src="${PIC}" style="display:block;width:60px;height:20px"></div>`), fixed('')],
    '/svg-icon': [fixed('<svg width="12" height="12" style="display:block"><rect width="12" height="12" fill="red"/></svg>'), fixed('')]
  }
  const source = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, v[0]]))
  const port = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, v[1]]))
  const r = await heights({ port, source, widths: [1180] })
  const kinds = (route) => r.defects.heights.filter((d) => d.route === route).map((d) => d.kind)
  for (const route of ['/equal-img', '/equal-line', '/unequal-img', '/unequal-line', '/wrapper-img', '/foot-line', '/pixel-img', '/rule-1px', '/svg-icon']) assert.ok(kinds(route).includes('element-missing'), `${route}: ${kinds(route)}`)
  assert.deepEqual(kinds('/extra-img'), ['element-extra'])
  assert.equal(r.heights.cells.find((c) => c.route === '/equal-img').status, 'defect')
  assert.equal(r.heights.cells.find((c) => c.route === '/foot-line').status, 'defect')
})

test('heights (browser): content that is clipped, transparent, hidden or empty is no presence; an empty spacer is quiet', async () => {
  const page = (inner) => doc(PAGE(HEADER, sec('intro', 'Welcome', `<div style="height:60px"><p style="margin:0">Hello there</p>${inner}</div>`, 'padding:20px'), FOOTER()))
  const ghosts = {
    '/clipped': `<div style="height:0;overflow:hidden">${smallImg}<p style="margin:0">cut away line</p></div>`,
    '/transparent': '<p style="margin:0;color:transparent">invisible line</p>',
    '/hidden': `<div style="visibility:hidden">${smallImg}<p style="margin:0">hidden line</p></div>`,
    '/faded': `<div style="opacity:0">${smallImg}</div>`,
    '/spacer': '<div style="height:5px"></div>',
    '/pixel': `<img alt="" src="${EMPTY_PIC}" style="display:block;width:1px;height:1px">`,
    '/empty-img': `<img alt="" src="${EMPTY_PIC}" style="display:block;width:12px;height:12px">`,
    '/empty-svg': '<svg width="12" height="12" style="display:block"><rect width="12" height="12" fill="none"/></svg>'
  }
  const source = Object.fromEntries(Object.entries(ghosts).map(([k, v]) => [k, page(v)]))
  const port = Object.fromEntries(Object.keys(ghosts).map((k) => [k, page('')]))
  const r = await heights({ port, source, widths: [1180] })
  assert.deepEqual(defectKinds(r), [])
})

test('heights (browser): a region one side cuts into two bands is still compared — the picture the cutting side lacks is found; with it, the cell is quiet', async () => {
  const one = (inner) => doc(PAGE(HEADER, sec('region', 'Region', `<p style="margin:0;height:200px">Body text of the region</p>${inner}<p style="margin:0;height:100px">Closing text</p>`), FOOTER()))
  const cut = (inner) => doc(PAGE(HEADER, sec('region', 'Region', `<p style="margin:0;height:200px">Body text of the region</p>${inner}`) + '<section class="tail"><p style="margin:0;height:100px">Closing text</p></section>', FOOTER()))
  const r = await heights({ port: { '/a': cut(''), '/b': cut('') }, source: { '/a': one(smallImg.replace('display:block', 'display:block;margin-bottom:-12px')), '/b': one('') }, widths: [1180] })
  const a = r.defects.heights.filter((d) => d.route === '/a')
  assert.ok(a.some((d) => d.kind === 'element-missing'), JSON.stringify(a.map((d) => d.kind)))
  assert.ok(r.heights.cells.find((c) => c.route === '/b').notes.some((n) => /cuts a region into/.test(n)))
  assert.deepEqual(r.defects.heights.filter((d) => d.route === '/b'), [])
})

test('heights (browser): a band of a few px with content and no partner is found; an empty one is not', async () => {
  const withRule = doc(PAGE(HEADER, sec('intro', 'Welcome', '<p style="margin:0">Hello there</p>') + `<div class="rule" style="height:4px;overflow:hidden"><img alt="" src="${PIC}" style="display:block;width:60px;height:4px"></div>`, FOOTER()))
  const withLine = doc(PAGE(HEADER, sec('intro', 'Welcome', '<p style="margin:0">Hello there</p>') + '<div class="thin" style="font-size:3px;line-height:3px;height:3px">tiny footnote text</div>', FOOTER()))
  const empty = doc(PAGE(HEADER, sec('intro', 'Welcome', '<p style="margin:0">Hello there</p>') + '<div class="spacer" style="height:5px"></div>', FOOTER()))
  const bare = doc(PAGE(HEADER, sec('intro', 'Welcome', '<p style="margin:0">Hello there</p>'), FOOTER()))
  const r = await heights({ port: { '/rule': bare, '/line': bare, '/space': bare, '/rule2': withRule }, source: { '/rule': withRule, '/line': withLine, '/space': empty, '/rule2': bare }, widths: [1180] })
  const kinds = (route) => r.defects.heights.filter((d) => d.route === route).map((d) => d.kind)
  assert.deepEqual(kinds('/rule'), ['band-missing'])
  assert.deepEqual(kinds('/line'), ['band-missing'])
  assert.deepEqual(kinds('/space'), [])
  assert.deepEqual(kinds('/rule2'), ['band-extra'])
})

test('judgeHeights / explain (synthetic readings): a small picture or thin line only one side has is a finding with equal totals, and --explain exits as the judge does', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 400, { k: [lf('end', 400, 100)] }]
  const pic = (y, w = 12, h = 12) => node({ sig: 'img', t: 'img', y, h, w, img: { w, h }, words: 0, tx: '', as: 'img:x', fx: 0 })
  const S = mkBands([head, ['one', 300, undefined, 100, { k: [lf('alpha beta', 100, 288), pic(388)] }], foot])
  const P = mkBands([head, ['one', 300, undefined, 100, { k: [lf('alpha beta', 100, 288)] }], foot])
  const row = cellRow(S, P, 500, 500)
  const j = judgeHeights([row])
  assert.deepEqual(j.defects.map((d) => d.kind), ['element-missing'])
  const e = explainRow(row)
  assert.equal(e.exit, 1)
  assert.ok(e.lines.some((l) => /<== first block/.test(l)))
  assert.equal(explainRow(cellRow(S, S, 500, 500)).exit, 0)
  // an icon one side draws as a glyph is the same icon
  const glyph = node({ sig: 'i', t: 'i', y: 388, h: 12, w: 12, words: 1, tx: '' })
  const G = mkBands([head, ['one', 300, undefined, 100, { k: [lf('alpha beta', 100, 288), glyph] }], foot])
  assert.deepEqual(judgeHeights([cellRow(S, G, 500, 500)]).defects, [])
  // a thin text line (2 px) on one side
  const T = mkBands([head, ['one', 300, undefined, 100, { k: [lf('alpha beta', 100, 288), node({ sig: 'p.fine', key: 'fine print', y: 388, h: 2, w: 600, fx: 0 })] }], foot])
  assert.deepEqual(judgeHeights([cellRow(T, P, 500, 500)]).defects.map((d) => d.kind), ['element-missing'])
})

test('heights (browser): an accepted padding step explains its own height only — a small picture the port lacks stays open', async () => {
  const page = (pad, inner) => doc(PAGE(HEADER, sec('intro', 'Welcome', `<p style="margin:0">Hello there</p>${inner}`, `padding:${pad}px 20px`), FOOTER()))
  const port = { '/a': page(60, '') }
  const source = { '/a': page(30, smallImg) }
  const dir = mkdtempSync(path.join(tmpdir(), 'heights-ink-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  const r = await heights({ port, source, widths: [1180] })
  const names = causes(r)
  assert.ok(names.some((n) => /\|element-missing\|img/.test(n)), names.join())
  const pad = names.find((n) => /padding-step/.test(n))
  const decisions = '# Decisions\n\n## D-03 padding of the intro\nThe intro is padded more by decision.\n'
  writeFileSync(path.join(dir, 'e.txt'), 'measured')
  writeFileSync(path.join(dir, 'DECISIONS.md'), decisions)
  assert.ok(pad, names.join())
  {
    const r2 = await heights({ port, source, widths: [1180], accept: { rows: [{ check: 'heights', cause: pad, routes: ['/a'], decision: 'D-03', kind: 'decided', evidence: path.join(dir, 'e.txt') }], decisions: parseDecisions(decisions), runRoot: dir } })
    assert.ok(causes(r2).some((n) => /\|element-missing\|img/.test(n)), causes(r2).join())
    assert.equal(r2.heights.cells[0].status, 'defect')
  }
})

// ---- slice A: the logo ------------------------------------------------------------------------------------------------------

test('heights (browser): a logo drawn as a picture on one side and as text on the other, in the same place, is one logo; the probe names it by role and place', async () => {
  const imgHeader = `<header class="site-header" style="height:80px;padding:20px"><a class="site-logo" href="/"><img alt="Acme" src="${PIC}" style="display:block;width:120px;height:40px"></a></header>`
  const textHeader = '<header class="site-header" style="height:80px;padding:20px"><p class="logo logo-text" style="margin:0;height:40px;line-height:40px"><a href="/">Acme wordmark</a></p></header>'
  const page = (h) => doc(PAGE(h, sec('intro', 'Welcome', '<p style="margin:0">Hello there</p>'), FOOTER()))
  const a = await probe(PAGE(imgHeader, '', '<footer>f</footer>'))
  const b = await probe(PAGE(textHeader, '', '<footer>f</footer>'))
  const la = a.bands.find((x) => x.kind === 'header').logo.cands[0]
  const lb = b.bands.find((x) => x.kind === 'header').logo.cands[0]
  assert.deepEqual([la.kind, lb.kind], ['media', 'text'])
  assert.ok(Math.abs(la.x - lb.x) <= 2 && Math.abs(la.y + la.h / 2 - (lb.y + lb.h / 2)) <= 4, JSON.stringify([la, lb]))
  const r = await heights({ port: { '/a': page(textHeader), '/b': page(imgHeader) }, source: { '/a': page(imgHeader), '/b': page(textHeader) }, widths: [1180] })
  assert.deepEqual(defectKinds(r), [])
})

test('heights (browser): two text logos that read differently are their own finding; a logo box that is not at the same place, or two logo boxes in one header, are not paired', async () => {
  const hd = (inner) => `<header class="site-header" style="height:80px;padding:20px;position:relative">${inner}</header>`
  const text = (t, style = '') => `<p class="site-title" style="margin:0;height:40px;line-height:40px;${style}"><a href="/">${t}</a></p>`
  const page = (h) => doc(PAGE(h, sec('intro', 'Welcome', '<p style="margin:0">Hello there</p>'), FOOTER()))
  const img = `<a class="site-logo" href="/"><img alt="" src="${PIC}" style="display:block;width:120px;height:40px"></a>`
  const r = await heights({
    port: { '/words': page(hd(text('Acme'))), '/moved': page(hd(text('Acme', 'margin-left:600px!important'))), '/two': page(hd(img + text('Acme', 'position:absolute;left:600px;top:20px'))), '/same': page(hd(text('Acme'))) },
    source: { '/words': page(hd(text('Beta'))), '/moved': page(hd(img)), '/two': page(hd(img)), '/same': page(hd(text('Acme'))) },
    widths: [1180]
  })
  const kinds = (route) => r.defects.heights.filter((d) => d.route === route).map((d) => d.kind)
  assert.deepEqual(kinds('/words'), ['logo-text'])
  assert.deepEqual(kinds('/same'), [])
  assert.ok(kinds('/moved').some((k) => /element-/.test(k)), kinds('/moved').join())
  // the title the port draws as a second, absolutely placed logo box is not in the flow of its header and is still found
  assert.ok(kinds('/two').includes('element-extra'), kinds('/two').join())
})

test('judgeHeights (synthetic readings): a logo pair never reads as extra + missing; a geometry difference of the logo stays', () => {
  const logoLeaf = (o) => node({ sig: 'p.logo', y: 10, h: 40, w: 200, lg: 1, ...o })
  const header = (leaf, logo, h = 100) => [['HEAD', h, 'header', 0, { k: [leaf] }], logo && { cands: [logo] }]
  const mk = ([hd, logo]) => {
    const bands = mkBands([hd, ['one', 100, undefined, hd[1], { k: [lf('body text', hd[1], 100)] }], ['FOOT', 50, 'footer', hd[1] + 100, { k: [lf('end', hd[1] + 100, 50)] }]])
    bands[0].logo = logo
    return bands
  }
  const img = node({ sig: 'a.site-logo', t: 'img', y: 10, h: 40, w: 120, lg: 1, img: { w: 120, h: 40 }, words: 0, tx: '', as: 'img:logo' })
  const S = mk(header(img, { x: 20, y: 10, w: 120, h: 40, kind: 'media', tx: '' }))
  const P = mk(header(logoLeaf({ key: 'Acme', tx: 'acme' }), { x: 22, y: 12, w: 100, h: 36, kind: 'text', tx: 'acme' }))
  assert.deepEqual(judgeHeights([cellRow(S, P, 250, 250)]).defects, [])
  // not the same place: no pairing, the leaves are judged as before
  const far = mk(header(logoLeaf({ key: 'Acme', tx: 'acme' }), { x: 600, y: 12, w: 100, h: 36, kind: 'text', tx: 'acme' }))
  assert.ok(judgeHeights([cellRow(S, far, 250, 250)]).defects.length > 0)
  // two roles on one side: ambiguous, not paired
  const amb = mk([['HEAD', 100, 'header', 0, { k: [logoLeaf({ key: 'Acme', tx: 'acme' })] }], { cands: [{ x: 22, y: 12, w: 100, h: 36, kind: 'text', tx: 'acme' }, { x: 400, y: 12, w: 80, h: 36, kind: 'text', tx: 'shop' }] }])
  assert.ok(judgeHeights([cellRow(S, amb, 250, 250)]).defects.some((d) => d.kind === 'element-extra' && d.cause.endsWith('|logo')))
  // the same kind of logo at another size is its own finding even though the headers are as high as each other
  const small = mk(header(img, { x: 20, y: 10, w: 60, h: 20, kind: 'media', tx: '' }))
  assert.deepEqual(judgeHeights([cellRow(S, small, 250, 250)]).defects.map((d) => d.kind), ['logo-box'])
  // text against text with other words
  const T = mk(header(logoLeaf({ key: 'Beta', tx: 'beta' }), { x: 22, y: 12, w: 100, h: 36, kind: 'text', tx: 'beta' }))
  const d = judgeHeights([cellRow(P, T, 250, 250)]).defects
  assert.deepEqual(d.map((x) => x.kind), ['logo-text'])
  assert.match(d[0].detail, /"acme" on the source, "beta" on the port/)
})

// ---- slice A: clones -------------------------------------------------------------------------------------------------------

test('heights (browser): the probe marks a copy only inside a carousel-like component, names the component, and reads the picture shown (a poster before a video plays)', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      `<section class="s"><h2>Slides</h2><div class="slick-slider"><div class="slick-track"><div class="slide a"><img alt="" src="${PIC}" style="width:50px;height:20px"></div><div class="slide slick-cloned"><img alt="" src="${PIC}" style="width:50px;height:20px"></div></div></div>` +
        `<div class="plain"><div class="slide cloned"><p style="margin:0">loose</p></div></div>` +
        `<video class="v1" poster="${PIC}" src="/same.mp4" style="width:100px;height:50px"></video><video class="v2" poster="${PIC2}" src="/same.mp4" style="width:100px;height:50px"></video></section>`,
      '<footer>f</footer>'
    )
  )
  const all = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const cloned = all.find((n) => n.sig.includes('slick-cloned'))
  assert.equal(cloned.cl, 1)
  assert.ok(cloned.comp > 0)
  assert.equal(all.find((n) => n.sig.includes('plain'))?.comp, undefined)
  assert.equal(all.find((n) => n.sig.includes('cloned') && !n.sig.includes('slick'))?.cl, undefined)
  const as = (c) => all.find((n) => n.sig.includes(c)).as
  assert.match(as('v1'), /^poster:data:image/)
  assert.notEqual(as('v1'), as('v2'))
})

test('judgeHeights (synthetic readings): a copy is removed only against an original of its own component; other components, hidden descendants and posters are kept apart', () => {
  const slide = (o) => node({ sig: 'div.slide', t: 'div', y: 100, h: 60, w: 300, words: 0, tx: '', k: [node({ sig: 'img', t: 'img', y: 100, h: 60, w: 300, img: { w: 300, h: 60 }, words: 0, tx: '', as: 'img:a' })], ...o })
  const track = (kids, o = {}) => node({ sig: 'div.track', t: 'div', y: 100, h: 60, w: 1000, comp: 1, words: 0, tx: '', k: kids, ...o })
  const band = (kids) => ['one', 60, undefined, 100, { k: kids }]
  const rows = (S, P) => judgeHeights([cellRow(mkBands([['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }], S, ['FOOT', 50, 'footer', 160, { k: [lf('end', 160, 50)] }]]), mkBands([['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }], P, ['FOOT', 50, 'footer', 160, { k: [lf('end', 160, 50)] }]]), 210, 210)])
  const one = band([track([slide({ comp: 1 })])])
  // the same component prints the slide twice (a copy for the loop): quiet
  assert.deepEqual(rows(one, band([track([slide({ comp: 1 }), slide({ comp: 1, cl: 1 })])])).defects, [])
  // the copy is a direct child of the component, the original stands deeper
  const nested = band([track([node({ sig: 'div.wrap', t: 'div', y: 100, h: 60, w: 300, comp: 1, words: 0, tx: '', k: [slide({ comp: 1 })] }), slide({ comp: 1, cl: 1 })])])
  assert.deepEqual(rows(one, nested).defects.filter((d) => /element/.test(d.kind)), [])
  // a marked box of ANOTHER component that looks the same is not a copy of this one
  const other = band([node({ sig: 'div.a', t: 'div', y: 100, h: 60, w: 1000, comp: 1, words: 0, tx: '', k: [slide({ comp: 1 })] }), slide({ comp: 2, cl: 1 })])
  assert.ok(rows(one, other).defects.some((d) => d.kind === 'element-extra'), 'a copy without an original of its component stays')
  // a marker alone, with no component, proves nothing
  assert.ok(rows(one, band([track([slide({ comp: 1 }), slide({ cl: 1 })])])).defects.some((d) => d.kind === 'element-extra'))
  // the identity is the visible tree: a hidden (no words, no picture) descendant changes nothing
  const ghost = node({ sig: 'span', t: 'span', y: 100, h: 5, w: 5, words: 0, tx: '' })
  assert.deepEqual(rows(one, band([track([slide({ comp: 1 }), slide({ comp: 1, cl: 1, k: [...slide().k, ghost] })])])).defects, [])
  // two videos that share a source and show other posters are two pictures
  const vid = (as, o = {}) => slide({ k: [node({ sig: 'video', t: 'video', y: 100, h: 60, w: 300, img: { w: 300, h: 60 }, words: 0, tx: '', as })], ...o })
  assert.ok(rows(band([track([vid('poster:a')])]), band([track([vid('poster:a', { comp: 1 }), vid('poster:b', { comp: 1, cl: 1 })])])).defects.some((d) => d.kind === 'element-extra'))
  assert.deepEqual(rows(band([track([vid('poster:a', { comp: 1 })])]), band([track([vid('poster:a', { comp: 1 }), vid('poster:a', { comp: 1, cl: 1 })])])).defects, [])
})

// ---- slice A, round 3: visible portions, painted ink, located matching, logo boxes, component identity, one share of a height ----------

test('heights (browser): text cut at the edge of a clip reads only the part that shows, in headings, keys, leaves and fonts; a visible placeholder stays when the value colour is transparent', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      `<section class="a"><div class="h" style="width:90px;overflow:hidden;white-space:nowrap"><h2 style="margin:0;font-size:16px">Shown Hidden</h2></div><h2>Real heading</h2>` +
        `<div class="cut" style="width:70px;overflow:hidden;white-space:nowrap"><p class="p1" style="margin:0">alpha beta gamma delta epsilon</p></div>` +
        `<div class="clipbox" style="position:relative;width:60px;height:20px;overflow:hidden"><p class="p2" style="margin:0"><span style="display:inline-block;width:100px;margin-left:-100px;font-size:30px">gone</span> kept</p></div>` +
        `<form><div style="width:60px;overflow:hidden"><input class="f1" value="Visible tail words here" style="width:300px;display:block;height:30px;border:0;padding:0"></div>` +
        `<input class="f2" value="gone value" placeholder="Shown hint" style="display:block;height:30px;color:transparent"><input class="f3" value="" placeholder="x" style="display:block;height:30px;color:transparent"></form></section>`,
      '<footer>f</footer>'
    ),
    'input.f3::placeholder{color:#555}'
  )
  const sec = r.bands.find((b) => b.kind === 'band')
  const all = everyNode(sec.tree)
  const by = (c) => all.find((n) => n.sig.includes(c))
  // the first heading is cut to its visible letters, not dropped whole nor kept whole
  assert.ok(sec.tree.head.length < 'shown hidden'.length || sec.tree.head === 'real heading', sec.tree.head)
  const p1 = by('p1').tx
  assert.ok(p1.startsWith('alpha') && !p1.includes('epsilon'), p1)
  assert.ok(!sec.tree.all.includes('epsilon') && !sec.tree.all.includes('gone'), sec.tree.all)
  assert.ok(sec.tree.all.includes('kept'), sec.tree.all)
  const f1 = by('f1').tx
  assert.ok(f1.startsWith('visible') && f1.length < 'visibletailwordshere'.length, f1)
  assert.equal(by('f2').tx, '')
  assert.equal(by('f3').tx, 'x')
})

test('judgeHeights (synthetic readings): a missing picture is not made up for by a line of words; a reworded line is its own finding; an icon is a glyph only at its own place', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 400, { k: [lf('end', 400, 100)] }]
  const pic = (x, y, as = 'img:a') => node({ sig: 'img', t: 'img', x, y, h: 12, w: 12, img: { w: 12, h: 12 }, words: 0, tx: '', as, fx: 0 })
  const txt = (key, y, x = 0) => node({ sig: 'p', key, x, y, h: 24, w: 400, fx: 0 })
  const band = (kids) => ['one', 300, undefined, 100, { k: kids }]
  const rows = (S, P) => judgeHeights([cellRow(mkBands([head, band(S), foot]), mkBands([head, band(P), foot]), 500, 500)]).defects.map((d) => d.kind).sort()
  const body = txt('common words', 100)
  // the source has a picture at the top; the port has an unrelated line at the bottom
  assert.deepEqual(rows([body, pic(10, 150)], [body, txt('another line entirely', 340)]), ['element-extra', 'element-missing'])
  // the same line reworded where it stood is one place read two ways: its own finding, not a missing and an extra
  assert.deepEqual(rows([body, txt('first wording', 150)], [body, txt('second wording', 152)]), ['text-changed'])
  // a swapped picture at the same place and size is still a picture there
  assert.deepEqual(rows([body, pic(10, 150, 'img:a')], [body, pic(12, 152, 'img:b')]), [])
  // a glyph far from the picture's place does not stand for it; one at its place does
  const glyph = (x, y) => node({ sig: 'i', t: 'i', x, y, h: 12, w: 12, words: 1, tx: '' })
  assert.deepEqual(rows([body, pic(10, 150)], [body, glyph(10, 340)]), ['element-extra'.replace('extra', 'missing')])
  assert.deepEqual(rows([body, pic(10, 150)], [body, glyph(12, 152)]), [])
})

test('heights (browser): a logo placed out of flow is still the logo; the same kind of logo at another size is its own finding; picture and text, same place, stay one', async () => {
  const hd = (inner) => `<header class="site-header" style="height:100px;position:relative">${inner}</header>`
  const page = (h) => doc(PAGE(h, sec('intro', 'Welcome', '<p style="margin:0">Hello there</p>'), FOOTER()))
  const img = (w, h) => `<a class="site-logo" href="/" style="display:block;padding:20px"><img alt="" src="${PIC}" style="display:block;width:${w}px;height:${h}px"></a>`
  const absText = '<p class="logo" style="margin:0;position:absolute;left:20px;top:20px;height:40px;line-height:40px"><a href="/">Acme</a></p>'
  const absImg = `<a class="site-logo" href="/" style="position:absolute;left:20px;top:20px"><img alt="" src="${PIC}" style="display:block;width:120px;height:40px"></a>`
  const r = await heights({
    port: { '/abs': page(hd(absText)), '/size': page(hd(img(40, 20))), '/same': page(hd(absImg)) },
    source: { '/abs': page(hd(img(120, 40))), '/size': page(hd(img(120, 40))), '/same': page(hd(img(120, 40))) },
    widths: [1180]
  })
  const kinds = (route) => r.defects.heights.filter((d) => d.route === route).map((d) => d.kind)
  assert.deepEqual(kinds('/abs'), [], JSON.stringify(r.defects.heights.filter((d) => d.route === '/abs').map((d) => [d.kind, d.detail])))
  assert.deepEqual(kinds('/size'), ['logo-box'])
  assert.deepEqual(kinds('/same'), [])
})

test('heights (browser): the component of a box is the nearest carousel around it; direct words, backgrounds and the look of an svg are part of what a box shows', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      `<section class="s"><h2>Slides</h2><div class="swiper"><div class="swiper-wrapper"><div class="swiper-slide o1"><p style="margin:0">orig</p></div><div class="swiper-slide swiper-slide-duplicate d1"><p style="margin:0">orig</p></div></div></div>` +
        `<div class="carousel"><div class="carousel-inner"><div class="carousel-item inner1"><div class="swiper"><div class="swiper-wrapper"><div class="swiper-slide n1"><p style="margin:0">deep</p></div></div></div></div></div></div>` +
        `<div class="card c1" style="background:#fe0000">direct words<p style="margin:0">child</p></div><div class="card c2" style="background:#0000fe">other words<p style="margin:0">child</p></div>` +
        `<svg class="g1" width="20" height="20"><path d="M0 0h20v20z" class="pa"/></svg><svg class="g2" width="20" height="20"><path d="M0 0h20v20z" class="pb"/></svg></section>`,
      '<footer>f</footer>'
    ),
    '.pa{fill:#f00}.pb{fill:#00f}'
  )
  const all = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const by = (c) => all.find((n) => n.sig.includes(c))
  assert.equal(by('o1').comp, by('d1').comp)
  assert.equal(by('d1').cl, 1)
  assert.notEqual(by('n1').comp, by('o1').comp, 'a carousel inside another carousel is its own component')
  assert.notEqual(by('c1').dtx, by('c2').dtx)
  assert.ok(by('c1').dtx.startsWith('directwords'))
  assert.notEqual(by('c1').bgp, by('c2').bgp)
  const [g1, g2] = all.filter((n) => n.t === 'svg')
  assert.ok(g1.as && g2.as && g1.as !== g2.as, 'two svgs with the same markup and other paint are two pictures')
})

test('judgeHeights (synthetic readings): a marked slide that shows other words or another background than its original is not a copy of it', () => {
  const slide = (o = {}) => node({ sig: 'div.slide', t: 'div', y: 100, h: 60, w: 300, comp: 1, words: 0, tx: '', k: [node({ sig: 'img', t: 'img', y: 100, h: 60, w: 300, img: { w: 300, h: 60 }, words: 0, tx: '', as: 'img:a' })], ...o })
  const track = (kids) => node({ sig: 'div.track', t: 'div', y: 100, h: 60, w: 1000, comp: 1, words: 0, tx: '', k: kids })
  const band = (kids) => ['one', 60, undefined, 100, { k: kids }]
  const rows = (S, P) => judgeHeights([cellRow(mkBands([['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }], S, ['FOOT', 50, 'footer', 160, { k: [lf('end', 160, 50)] }]]), mkBands([['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }], P, ['FOOT', 50, 'footer', 160, { k: [lf('end', 160, 50)] }]]), 210, 210)]).defects
  const one = band([track([slide({ dtx: 'same', bgp: '|red' })])])
  assert.deepEqual(rows(one, band([track([slide({ dtx: 'same', bgp: '|red' }), slide({ cl: 1, dtx: 'same', bgp: '|red' })])])), [])
  assert.ok(rows(one, band([track([slide({ dtx: 'same', bgp: '|red' }), slide({ cl: 1, dtx: 'other', bgp: '|red' })])])).some((d) => d.kind === 'element-extra'))
  assert.ok(rows(one, band([track([slide({ dtx: 'same', bgp: '|red' }), slide({ cl: 1, dtx: 'same', bgp: '|blue' })])])).some((d) => d.kind === 'element-extra'))
})

test('heights (browser): accepting both the padding step and the missing picture of one unequal band offsets the band once', async () => {
  const page = (pad, inner) => doc(PAGE(HEADER, sec('intro', 'Welcome', `<p style="margin:0">Hello there</p>${inner}`, `padding:${pad}px 20px`), FOOTER()))
  const port = { '/a': page(60, '') }
  const source = { '/a': page(30, smallImg) }
  const dir = mkdtempSync(path.join(tmpdir(), 'heights-both-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  const first = await heights({ port, source, widths: [1180] })
  const names = causes(first)
  assert.equal(names.length, 2, names.join())
  const decisions = '# Decisions\n\n## D-04 both\nBoth differences are by decision.\n'
  writeFileSync(path.join(dir, 'e.txt'), 'measured')
  writeFileSync(path.join(dir, 'DECISIONS.md'), decisions)
  const rowsOf = names.map((cause) => ({ check: 'heights', cause, routes: ['/a'], decision: 'D-04', kind: 'decided', evidence: path.join(dir, 'e.txt') }))
  const both = await heights({ port, source, widths: [1180], accept: { rows: rowsOf, decisions: parseDecisions(decisions), runRoot: dir } })
  assert.deepEqual(both.acceptErrors, [])
  const cell = both.heights.cells[0]
  assert.equal(cell.accepted, cell.delta, `accepted ${cell.accepted} of ${cell.delta}`)
  assert.equal(cell.status, 'accepted')
})

// ---- slice A, round 4 -------------------------------------------------------------------------------------------------------------

test('heights (browser): a textarea clipped by its box reads the lines that show; a filled password field shows no placeholder; a logo is bounded by the text that shows', async () => {
  const lines = Array.from({ length: 12 }, (_, i) => `line${i}`).join('\\n')
  const r = await probe(
    PAGE(
      `<header class="site-header" style="height:80px"><p class="logo" style="margin:0;width:70px;overflow:hidden;white-space:nowrap;font-size:20px">Visible wordmark that runs on</p></header>`,
      sec('f', 'Form', `<form><div style="height:48px;overflow:hidden"><textarea class="t1" rows="12" style="display:block;width:200px;height:260px;border:0;padding:0;line-height:24px;resize:none">${lines.replace(/\\n/g, '&#10;')}</textarea></div>` +
        `<input class="pw" type="password" value="secret" placeholder="Hidden hint" style="display:block;height:30px"><input class="pw2" type="password" placeholder="Shown hint" style="display:block;height:30px"></form>`),
      '<footer>f</footer>'
    )
  )
  const all = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const by = (c) => all.find((n) => n.sig.includes(c))
  const t1 = by('t1').tx
  assert.ok(t1.includes('line0') && t1.includes('line1') && !t1.includes('line5'), t1)
  assert.equal(by('pw').tx, '')
  assert.equal(by('pw2').tx, 'shownhint')
  const logo = r.bands.find((b) => b.kind === 'header').logo.cands[0]
  assert.ok(logo.w <= 72, `the logo is bounded by the 70 px window, not by the whole text: ${logo.w}`)
})

test('heights (browser): ink of a picture is read at the size it has on the page and only where it shows; sparse pixels count, a clipped-away drawing and an empty picture wrapper do not', async () => {
  const sparse = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cline x1='0' y1='200' x2='400' y2='200' stroke='red' stroke-width='1'/%3E%3C/svg%3E`
  const left = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='40'%3E%3Crect width='20' height='40' fill='red'/%3E%3C/svg%3E`
  const r = await probe(
    PAGE(
      HEADER,
      sec(
        'p',
        'Pictures',
        `<img class="sp" alt="" src="${sparse}" style="display:block;width:400px;height:400px">` +
          `<div style="width:60px;overflow:hidden"><div style="margin-left:-100px"><img class="gone" alt="" src="${left}" style="display:block;width:200px;height:40px"></div></div>` +
          `<div style="width:60px;overflow:hidden"><img class="here" alt="" src="${left}" style="display:block;width:200px;height:40px"></div>` +
          `<picture class="wrap"></picture>`
      ),
      '<footer>f</footer>'
    )
  )
  const all = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const by = (c) => all.find((n) => n.sig.includes(c))
  assert.ok(by('sp').img, 'a one pixel line in a large picture is ink')
  assert.equal(by('gone')?.img ?? null, null, 'the drawing is clipped away')
  assert.ok(by('here').img)
  assert.equal(all.find((n) => n.t === 'picture')?.img ?? null, null)
})

test('judgeHeights (synthetic readings): a picture or words stand for another by complete wording and order; one or two letters count too', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 400, { k: [lf('end', 400, 100)] }]
  const pic = (x, y, as = 'img:a') => node({ sig: 'img', t: 'img', x, y, h: 12, w: 12, img: { w: 12, h: 12 }, words: 0, tx: '', as, fx: 0 })
  const txt = (key, y, x = 0) => node({ sig: 'p', key, x, y, h: 24, w: 400, fx: 0 })
  const band = (kids) => ['one', 300, undefined, 100, { k: kids }]
  const rows = (S, P) => judgeHeights([cellRow(mkBands([head, band(S), foot]), mkBands([head, band(P), foot]), 500, 500)]).defects.map((d) => d.kind).sort()
  const body = txt('common words', 100)
  // bands as high as each other: a picture the other side has too, but 230 px lower, is not at the same place — the cell is not quiet
  assert.deepEqual(rows([body, pic(10, 150, 'img:a')], [body, pic(10, 380, 'img:a')]), ['element-extra', 'element-missing'])
  assert.deepEqual(rows([body, pic(10, 150, 'img:a')], [pic(10, 380, 'img:a'), body]), ['element-extra', 'element-missing'], 'a picture that moved past the words')
  assert.deepEqual(rows([body, pic(10, 150, 'img:a')], [body, pic(12, 152, 'img:a')]), [])
  // a short word only the source has is a finding; at its place on both sides it is not
  assert.deepEqual(rows([body, txt('ok', 200)], [body]), ['element-missing'])
  assert.deepEqual(rows([body, txt('ok', 200)], [body, txt('ok', 202)]), [])
  // two lines that change places are not the same lines in the same order
  assert.deepEqual(rows([txt('first line of words', 100), txt('second line of words', 200)], [txt('second line of words', 100), txt('first line of words', 200)]).length > 0, true)
  // the end of a line changed: the line is not the one the other side has
  assert.deepEqual(rows([body, txt('a long line of words that ends one way', 200)], [body, txt('a long line of words that ends another', 200)]), ['text-changed'])
  // a short band with no partner that holds two letters of words is judged
  const S = mkBands([head, band([body]), ['tiny', 6, undefined, 400, { k: [txt('no', 400)] }], ['FOOT', 100, 'footer', 406, { k: [lf('end', 406, 100)] }]])
  const P = mkBands([head, band([body]), foot])
  const j = judgeHeights([cellRow(S, P, 506, 500)])
  assert.deepEqual(j.defects.map((d) => d.kind), ['band-missing'])
})

test('judgeHeights (synthetic readings): a text logo much smaller than the picture it replaces is a finding; clones differing only beyond the first 40 letters are not copies', () => {
  const head = (logo, leaf) => [['HEAD', 100, 'header', 0, { k: [leaf] }], { cands: [logo] }]
  const mk = ([hd, logo], extra = []) => {
    const bands = mkBands([hd, ['one', 100, undefined, 100, { k: [lf('body text', 100, 100), ...extra] }], ['FOOT', 50, 'footer', 200, { k: [lf('end', 200, 50)] }]])
    bands[0].logo = logo
    return bands
  }
  const img = node({ sig: 'a.site-logo', t: 'img', y: 10, h: 60, w: 160, lg: 1, img: { w: 160, h: 60 }, words: 0, tx: '', as: 'img:logo' })
  const txt = node({ sig: 'p.logo', y: 30, h: 10, w: 40, lg: 1, key: 'Acme', tx: 'acme' })
  const S = mk(head({ x: 20, y: 10, w: 160, h: 60, kind: 'media', tx: '' }, img))
  const P = mk(head({ x: 22, y: 30, w: 40, h: 10, kind: 'text', tx: 'acme' }, txt))
  assert.deepEqual(judgeHeights([cellRow(S, P, 250, 250)]).defects.map((d) => d.kind), ['logo-box'])
  const near = node({ sig: 'p.logo', y: 20, h: 36, w: 80, lg: 1, key: 'Acme', tx: 'acme' })
  assert.deepEqual(judgeHeights([cellRow(S, mk(head({ x: 22, y: 20, w: 80, h: 36, kind: 'text', tx: 'acme' }, near)), 250, 250)]).defects, [])
  // clones: the 40-letter prefix is the same, the full words are not
  const slide = (dh) => node({ sig: 'div.slide', t: 'div', y: 100, h: 60, w: 300, comp: 1, words: 0, tx: '', dtx: 'sameprefix', dh, k: [node({ sig: 'img', t: 'img', y: 100, h: 60, w: 300, img: { w: 300, h: 60 }, words: 0, tx: '', as: 'img:a' })] })
  const track = (kids) => node({ sig: 'div.track', t: 'div', y: 100, h: 60, w: 1000, comp: 1, words: 0, tx: '', k: kids })
  const band = (kids) => ['one', 60, undefined, 100, { k: kids }]
  const rows = (S2, P2) => judgeHeights([cellRow(mkBands([['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }], S2, ['FOOT', 50, 'footer', 160, { k: [lf('end', 160, 50)] }]]), mkBands([['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }], P2, ['FOOT', 50, 'footer', 160, { k: [lf('end', 160, 50)] }]]), 210, 210)]).defects
  const base = band([track([slide('40:aaa')])])
  assert.deepEqual(rows(base, band([track([slide('40:aaa'), slide('40:aaa')].map((n, i) => (i ? { ...n, cl: 1 } : n)))])).filter((d) => /element/.test(d.kind)), [])
  assert.ok(rows(base, band([track([slide('40:aaa'), { ...slide('90:bbb'), cl: 1 }])])).some((d) => /element|count/.test(d.kind)))
})

test('heights (browser): one carousel is one component whatever its track and wrapper boxes; a copy needs the displayed look — a filter on a picture or an svg is part of it', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      `<section class="s"><h2>Slides</h2><div class="swiper"><div class="swiper-wrapper w1"><div class="swiper-slide a1"><p style="margin:0">one</p></div></div><div class="swiper-wrapper w2"><div class="swiper-slide swiper-slide-duplicate a2"><p style="margin:0">one</p></div></div></div>` +
        `<img class="i1" alt="" src="${PIC}" style="width:30px;height:30px"><img class="i2" alt="" src="${PIC}" style="width:30px;height:30px;filter:grayscale(1)">` +
        `<svg class="s1" width="20" height="20"><path d="M0 0h20v20z" fill="red"/></svg><svg class="s2" width="20" height="20" style="filter:blur(2px)"><path d="M0 0h20v20z" fill="red"/></svg></section>`,
      '<footer>f</footer>'
    )
  )
  const all = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const by = (c) => all.find((n) => n.sig.includes(c))
  assert.equal(by('a1').comp, by('a2').comp)
  assert.notEqual(by('i1').as, by('i2').as)
  const [s1, s2] = all.filter((n) => n.t === 'svg')
  assert.notEqual(s1.as, s2.as)
})


test('judgeHeights (synthetic readings): a content finding takes the height the probe measured for its leaf, the cause that is not about content keeps the rest, nothing is counted twice', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  const pic = (fx) => node({ sig: 'img', t: 'img', x: 0, y: 140, h: 40, w: 40, img: { w: 40, h: 40 }, words: 0, tx: '', as: 'img:a', fx })
  // the source band is padded 50 and holds a 40 px picture that gave it 40 px; the port band is padded 100 without the picture (port − source = +60)
  const S = (fx) => mkBands([head, ['one', 240, undefined, 100, { pt: 50, pb: 50, k: [lf('common words', 150, 100), pic(fx)] }], foot(340)])
  const P = mkBands([head, ['one', 300, undefined, 100, { pt: 100, pb: 100, k: [lf('common words', 200, 100)] }], foot(400)])
  const byKind = (j) => Object.fromEntries(j.defects.map((d) => [d.kind, d.delta]))
  const measured = byKind(judgeHeights([cellRow(S(40), P, 440, 500)]))
  assert.equal(measured['element-missing'], -40)
  assert.equal(Object.entries(measured).filter(([k]) => k !== 'element-missing').reduce((n, [, v]) => n + v, 0), 100, 'the rest of the 60 px, 100 px of padding, is the cause\'s')
  assert.equal(Object.values(measured).reduce((n, v) => n + v, 0), 60)
  // the picture gave the band nothing (a box of fixed height, overlaid): it claims none and the band's height is not made up
  const overlaid = byKind(judgeHeights([cellRow(S(0), P, 440, 500)]))
  assert.equal(overlaid['element-missing'], 0)
  assert.equal(Object.values(overlaid).reduce((n, v) => n + v, 0), 60)
})

test('judgeHeights (synthetic readings): when the first cause is content and the leaf did not give the height, the height left is its own finding; steps that add up are told when content findings carry no height', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  // the port is 50 px taller by a min-height; its extra 40 px picture is overlaid in a grid (it gave no height)
  const pic = node({ sig: 'img', t: 'img', x: 0, y: 150, h: 40, w: 40, img: { w: 40, h: 40 }, words: 0, tx: '', as: 'img:a', fx: 0 })
  const S = mkBands([head, ['one', 200, undefined, 100, { k: [lf('common words', 100, 200)] }], foot(300)])
  const P = mkBands([head, ['one', 250, undefined, 100, { k: [lf('common words', 100, 200), pic] }], foot(350)])
  const j = judgeHeights([cellRow(S, P, 400, 450)])
  const extra = j.defects.find((d) => d.kind === 'element-extra')
  assert.equal(extra.delta, 0)
  const rest = j.defects.filter((d) => d !== extra)
  assert.equal(rest.length, 1, JSON.stringify(j.defects.map((d) => [d.kind, d.delta])))
  assert.equal(rest[0].delta, 50)
  // bands each within the tolerance and a picture that gave no height: the cell's own height still has a cause
  const seg = (h, y, kids = []) => ['b' + y, h, undefined, y, { k: [lf('t' + y, y, h), ...kids] }]
  const S2 = mkBands([head, seg(100, 100), seg(100, 200), seg(100, 300), foot(400)])
  const P2 = mkBands([head, seg(105, 100), seg(105, 205, [pic]), seg(105, 310), foot(415)])
  const k = judgeHeights([cellRow(S2, P2, 500, 515)])
  assert.ok(k.defects.some((d) => d.kind === 'accumulated'), JSON.stringify(k.defects.map((d) => [d.kind, d.delta])))
})

test('heights (browser): the probe measures the height a leaf gives its band; a picture in a box of fixed height gives none; a textarea with wrap off reads only the columns that show', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      sec('p', 'Pictures', `<img class="flow" alt="" src="${PIC}" style="display:block;width:30px;height:30px"><div style="height:20px;overflow:hidden"><img class="fixed" alt="" src="${PIC}" style="display:block;width:30px;height:30px"></div>` +
        `<form><textarea class="nowrap" wrap="off" rows="1" cols="12" style="display:block;width:90px;height:30px;border:0;padding:0;font:16px/24px monospace;resize:none">visible wordsbeyond the edge</textarea></form>`),
      '<footer>f</footer>'
    )
  )
  const all = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const by = (c) => all.find((n) => n.sig.includes(c))
  assert.equal(by('flow').fx, 30)
  assert.equal(by('fixed').fx, 0)
  const t = by('nowrap').tx
  assert.ok(t.startsWith('visible') && !t.includes('beyond') && !t.includes('edge'), t)
})

test('judgeHeights (synthetic readings): the same words twice on the source and once on the port, the same picture elsewhere, and a short band whose words stand in a band that has its own partner are all findings', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = ['FOOT', 100, 'footer', 400, { k: [lf('end', 400, 100)] }]
  const txt = (key, y) => node({ sig: 'p', key, x: 0, y, h: 24, w: 400, fx: 0 })
  const band = (kids) => ['one', 300, undefined, 100, { k: kids }]
  const rows = (S, P) => judgeHeights([cellRow(mkBands([head, band(S), foot]), mkBands([head, band(P), foot]), 500, 500)]).defects.map((d) => d.kind).sort()
  assert.deepEqual(rows([txt('repeated line of words', 100), txt('repeated line of words', 200)], [txt('repeated line of words', 100)]), ['element-missing'])
  assert.deepEqual(rows([txt('repeated line of words', 100), txt('repeated line of words', 200)], [txt('repeated line of words', 100), txt('repeated line of words', 202)]), [])
  // a short unpaired band whose words stand in a paired band of the other side
  const tiny = ['tiny', 6, undefined, 400, { k: [txt('standing words', 400)] }]
  const S = mkBands([head, band([txt('standing words', 100)]), tiny, ['FOOT', 100, 'footer', 406, { k: [lf('end', 406, 100)] }]])
  const P = mkBands([head, band([txt('standing words', 100)]), foot])
  assert.deepEqual(judgeHeights([cellRow(S, P, 506, 500)]).defects.map((d) => d.kind), ['band-missing'])
})

test('judgeHeights (synthetic readings): a text logo shifted, much smaller, or reading differently only after the first 40 letters is not the same logo', () => {
  const mk = (cand, leaf) => {
    const bands = mkBands([['HEAD', 100, 'header', 0, { k: [leaf] }], ['one', 100, undefined, 100, { k: [lf('body text', 100, 100)] }], ['FOOT', 50, 'footer', 200, { k: [lf('end', 200, 50)] }]])
    bands[0].logo = { cands: [cand] }
    return bands
  }
  const img = node({ sig: 'a.site-logo', t: 'img', y: 10, h: 60, w: 160, lg: 1, img: { w: 160, h: 60 }, words: 0, tx: '', as: 'img:logo' })
  const S = mk({ x: 20, y: 10, w: 160, h: 60, kind: 'media', tx: '' }, img)
  const text = (c) => mk({ kind: 'text', tx: 'acme', th: '4:a', ...c }, node({ sig: 'p.logo', y: c.y, h: c.h, w: c.w, lg: 1, key: 'Acme', tx: 'acme' }))
  const kinds = (P) => judgeHeights([cellRow(S, P, 250, 250)]).defects.map((d) => d.kind)
  assert.deepEqual(kinds(text({ x: 22, y: 20, w: 90, h: 36 })), [])
  assert.deepEqual(kinds(text({ x: 120, y: 80, w: 60, h: 20 })), ['element-missing', 'element-extra'], 'shifted off the picture: not the same place, so not the same logo')
  assert.deepEqual(kinds(text({ x: 22, y: 20, w: 20, h: 10 })), ['logo-box'], 'a text far smaller than the picture')
  const a = text({ x: 22, y: 20, w: 90, h: 36, th: '60:aaa', tx: 'same prefix of forty letters' })
  const b = text({ x: 22, y: 20, w: 90, h: 36, th: '60:bbb', tx: 'same prefix of forty letters' })
  assert.deepEqual(judgeHeights([cellRow(a, b, 250, 250)]).defects.map((d) => d.kind), ['logo-text'])
})

test('heights (browser): pictures that cannot be read are never taken for each other; an image shown with another crop, a canvas and an svg with another transform are other pictures', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      `<section class="s"><h2>Media</h2><img class="c1" alt="" src="${PIC}" style="width:60px;height:30px;object-fit:cover;object-position:left"><img class="c2" alt="" src="${PIC}" style="width:60px;height:30px;object-fit:cover;object-position:right">` +
        `<canvas class="k1" width="20" height="20"></canvas><canvas class="k2" width="20" height="20"></canvas>` +
        `<svg class="v1" width="20" height="20"><path d="M0 0h20v20z" fill="red"/></svg><svg class="v2" width="20" height="20"><path d="M0 0h20v20z" fill="red" transform="translate(2 0)"/></svg></section>`,
      '<footer>f</footer>'
    )
  )
  const all = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const by = (c) => all.find((n) => n.sig.includes(c))
  assert.notEqual(by('c1').as, by('c2').as)
  const [s1, s2] = all.filter((n) => n.t === 'svg')
  assert.notEqual(s1.as, s2.as)
  const ks = all.filter((n) => n.t === 'canvas')
  // (an empty canvas draws nothing: no leaf; a painted one is told by its pixels)
  assert.ok(ks.every((k) => k.as == null || /^canvas:/.test(k.as)))
})

test('heights (browser): an svg whose shape is faded out or lies outside the part that shows draws nothing', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      sec('v', 'Vectors', `<svg class="fade" width="20" height="20"><g opacity="0"><rect width="20" height="20" fill="red"/></g></svg><svg class="out" width="20" height="20"><rect x="100" width="20" height="20" fill="red"/></svg>` +
        '<svg class="ok" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>'),
      '<footer>f</footer>'
    )
  )
  const all = everyNode(r.bands.find((b) => b.kind === 'band').tree)
  const svgs = all.filter((n) => n.t === 'svg')
  assert.deepEqual(svgs.map((n) => Boolean(n.img)), [false, false, true])
})

test('heights (browser): words a wrap-off textarea runs past its edge are not read — the cell is quiet against a port that holds only the words that show', async () => {
  const page = (value) => doc(PAGE(HEADER, sec('f', 'Form', `<form><textarea wrap="off" rows="1" style="display:block;width:90px;height:30px;border:0;padding:0;font:16px/24px monospace;resize:none">${value}</textarea></form>`), FOOTER()))
  const r = await heights({ port: { '/a': page('visible wo') }, source: { '/a': page('visible wordsbeyond the edge of the box') }, widths: [1180] })
  assert.deepEqual(r.defects.heights.map((d) => [d.kind, d.detail]), [])
})

// ---- slice A, round 7 -------------------------------------------------------------------------------------------------------------

test('heights (browser): complete wording in reading order — a line moved past another, or whose end changed, is a finding in a band as high as the other side\'s; the same lines in a different layout are not', async () => {
  const p = (t) => `<p style="margin:0;height:30px">${t}</p>`
  const page = (inner) => doc(PAGE(HEADER, sec('t', 'Text', inner, 'padding:10px 0'), FOOTER()))
  const first = 'The first line of words stands here and ends this way'
  const second = 'The second line of words stands here and ends that way'
  const r = await heights({
    port: { '/moved': page(p(second) + p(first)), '/suffix': page(p(first) + p(second.replace('that way', 'another way'))), '/same': page(p(first) + p(second)) },
    source: { '/moved': page(p(first) + p(second)), '/suffix': page(p(first) + p(second)), '/same': page(p(first) + p(second)) },
    widths: [1180]
  })
  const kinds = (route) => r.defects.heights.filter((d) => d.route === route).map((d) => d.kind)
  assert.ok(kinds('/moved').length > 0, 'a line moved past another')
  assert.ok(kinds('/suffix').includes('text-changed'), kinds('/suffix').join())
  assert.deepEqual(kinds('/same'), [])
})

test('heights (browser): a shape clipped away by its own clip draws nothing; two svgs that differ only in what they do not draw are the same picture', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      sec('v', 'Vectors', `<svg class="clipped" width="20" height="20"><rect width="20" height="20" fill="red" style="clip-path:inset(100%)"/></svg>` +
        '<svg class="plain" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>' +
        '<svg class="more" width="20" height="20"><rect width="20" height="20" fill="red"/><rect width="9" height="9" fill="blue" display="none"/><g opacity="0"><circle r="5" cx="5" cy="5" fill="green"/></g><text x="1" y="1" style="visibility:hidden">hidden words</text></svg>'),
      '<footer>f</footer>'
    )
  )
  const svgs = everyNode(r.bands.find((b) => b.kind === 'band').tree).filter((n) => n.t === 'svg')
  assert.deepEqual(svgs.map((n) => Boolean(n.img)), [false, true, true])
  assert.equal(svgs[1].as, svgs[2].as)
})

test('heights (browser): a slide whose copy differs from it only in hidden svg parts is a copy — the cell is quiet', async () => {
  const slide = (extra, cls = '') => `<div class="swiper-slide ${cls}"><svg width="30" height="30"><rect width="30" height="30" fill="red"/>${extra}</svg></div>`
  const page = (slides) => doc(PAGE(HEADER, sec('s', 'Slides', `<div class="swiper"><div class="swiper-wrapper" style="display:flex">${slides}</div></div>`), FOOTER()))
  const r = await heights({
    port: { '/a': page(slide('') + slide('<rect width="5" height="5" display="none"/><text style="visibility:hidden">x</text>', 'swiper-slide-duplicate')) },
    source: { '/a': page(slide('')) },
    widths: [1180]
  })
  assert.deepEqual(r.defects.heights.map((d) => [d.kind, d.detail]), [])
})

test('judgeHeights (synthetic readings): a text wordmark moved across the picture it replaces is a logo finding though the boxes still overlap', () => {
  const mk = (cand, leaf) => {
    const bands = mkBands([['HEAD', 100, 'header', 0, { k: [leaf] }], ['one', 100, undefined, 100, { k: [lf('body text', 100, 100)] }], ['FOOT', 50, 'footer', 200, { k: [lf('end', 200, 50)] }]])
    bands[0].logo = { cands: [cand] }
    return bands
  }
  const img = node({ sig: 'a.site-logo', t: 'img', y: 10, h: 60, w: 160, lg: 1, img: { w: 160, h: 60 }, words: 0, tx: '', as: 'img:logo' })
  const S = mk({ x: 20, y: 10, w: 160, h: 60, kind: 'media', tx: '' }, img)
  const text = (x) => mk({ x, y: 25, w: 90, h: 30, kind: 'text', tx: 'acme' }, node({ sig: 'p.logo', y: 25, h: 30, w: 90, lg: 1, key: 'Acme', tx: 'acme' }))
  const kinds = (P) => judgeHeights([cellRow(S, P, 250, 250)]).defects.map((d) => d.kind)
  assert.deepEqual(kinds(text(22)), [])
  assert.deepEqual(kinds(text(75)), ['logo-box'], 'moved 55 px across')
})

test('judgeHeights / settleHeightCells (synthetic readings): a leaf measured to give a band its height is told with the height that makes up for it in an equal-height band; accepting it alone leaves the page open, accepting all of them closes it', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  const pic = node({ sig: 'img', t: 'img', x: 0, y: 140, h: 12, w: 12, img: { w: 12, h: 12 }, words: 0, tx: '', as: 'img:a', fx: 12 })
  // band one is as high on both sides (the picture's 12 px are made up by 12 px of padding); band two is 12 px taller on the port
  const S = mkBands([head, ['one', 112, undefined, 100, { pt: 0, pb: 0, k: [lf('common words', 100, 100), pic] }], ['two', 100, undefined, 212, { k: [lf('second words', 212, 100)] }], foot(312)])
  const P = mkBands([head, ['one', 112, undefined, 100, { pt: 0, pb: 12, k: [lf('common words', 100, 100)] }], ['two', 112, undefined, 212, { pt: 0, pb: 12, k: [lf('second words', 212, 100)] }], foot(324)])
  const j = judgeHeights([cellRow(S, P, 412, 424)])
  const byKind = Object.fromEntries(j.defects.map((d) => [d.kind, d.delta]))
  assert.equal(byKind['element-missing'], -12)
  assert.equal(byKind.compensated, 12)
  assert.equal(j.defects.reduce((n, d) => n + d.delta, 0), 12, 'the findings explain the page, once')
  const settled = (causes) => {
    const jj = judgeHeights([cellRow(S, P, 412, 424)])
    jj.notDefects = jj.defects.filter((d) => causes.includes(d.kind)).map((d) => ({ route: d.route, width: d.width, delta: d.delta, accepted: true }))
    jj.defects = jj.defects.filter((d) => !causes.includes(d.kind))
    settleHeightCells(jj)
    return jj.cells[0]
  }
  assert.equal(settled(['element-missing']).status, 'defect')
  assert.equal(settled(j.defects.map((d) => d.kind)).status, 'accepted')
})

test('judgeHeights (synthetic readings): what the findings do not explain of the page is told even when a finding carries height', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  const pic = node({ sig: 'img', t: 'img', x: 0, y: 140, h: 10, w: 10, img: { w: 10, h: 10 }, words: 0, tx: '', as: 'img:a', fx: 10 })
  const seg = (n, h, y, kids = []) => ['b' + n, h, undefined, y, { k: [lf('t' + n, y, h), ...kids] }]
  const S = mkBands([head, seg(1, 100, 100), seg(2, 100, 200), seg(3, 100, 300), seg(4, 100, 400), foot(500)])
  const P = mkBands([head, seg(1, 105, 100), seg(2, 105, 205), seg(3, 105, 310), seg(4, 110, 415, [pic]), foot(525)])
  const j = judgeHeights([cellRow(S, P, 600, 625)])
  assert.ok(j.defects.some((d) => d.kind === 'element-extra' && d.delta === 10), JSON.stringify(j.defects.map((d) => [d.kind, d.delta])))
  const acc = j.defects.find((d) => d.kind === 'accumulated')
  assert.ok(acc && Math.abs(acc.delta - 15) <= 0.1, JSON.stringify(j.defects.map((d) => [d.kind, d.delta])))
})

// ---- slice A, round 8 -------------------------------------------------------------------------------------------------------------

test('heights (browser): a lone picture that sits elsewhere in a band as high as the other side\'s is a finding; the same layout is not', async () => {
  const page = (top) => doc(PAGE(HEADER, sec('p', 'Picture', `<div style="position:relative;height:200px"><img alt="" src="${PIC}" style="position:relative;top:${top}px;display:block;width:12px;height:12px"></div>`), FOOTER()))
  const r = await heights({ port: { '/moved': page(150), '/same': page(2) }, source: { '/moved': page(2), '/same': page(2) }, widths: [1180] })
  const kinds = (route) => r.defects.heights.filter((d) => d.route === route).map((d) => d.kind).sort()
  assert.deepEqual(kinds('/moved'), ['element-extra', 'element-missing'])
  assert.deepEqual(kinds('/same'), [])
})

test('judgeHeights (synthetic readings): a short band with no partner is the other side\'s only when a band that has no partner there holds the same leaves; words it shares with another band are not enough', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  const txt = (key, y) => node({ sig: 'p', key, x: 0, y, h: 4, w: 400, fx: 0 })
  const tiny = (y, ...keys) => ['t' + y, 4, undefined, y, { k: keys.map((k, i) => txt(k, y + i)) }]
  const S = mkBands([head, tiny(100, 'standing words'), foot(104)])
  const same = mkBands([head, ['x', 4, undefined, 100, { k: [txt('standing words', 100)] }], foot(104)])
  const other = mkBands([head, ['x', 4, undefined, 100, { k: [txt('standing words', 100), txt('and other words', 101)] }], foot(104)])
  const none = mkBands([head, foot(100)])
  const kinds = (P, dP) => judgeHeights([cellRow(S, P, 204, dP)]).defects.map((d) => d.kind)
  assert.deepEqual(kinds(none, 200), ['band-missing'])
  assert.deepEqual(kinds(other, 204).includes('band-missing') || kinds(other, 204).length > 0, true)
  assert.deepEqual(judgeHeights([cellRow(S, same, 204, 204)]).defects, [])
})

test('heights (browser): a shape clipped away by a clip-path url(...) draws nothing, one it only trims does; the answer is the browser\'s', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      sec('v', 'Vectors', `<svg width="0" height="0"><clipPath id="away"><rect x="100" y="100" width="1" height="1"/></clipPath><clipPath id="part"><rect width="10" height="10"/></clipPath></svg>` +
        `<svg class="away" width="20" height="20"><rect width="20" height="20" fill="red" clip-path="url(#away)"/></svg>` +
        `<svg class="part" width="20" height="20"><rect width="20" height="20" fill="red" clip-path="url(#part)"/></svg>`),
      '<footer>f</footer>'
    )
  )
  const svgs = everyNode(r.bands.find((b) => b.kind === 'band').tree).filter((n) => n.t === 'svg')
  assert.deepEqual(svgs.map((n) => Boolean(n.img)), [false, true])
})

test('heights (browser): the identity of an svg is what is drawn — words a text hides, a group transform and a filter around a shape are part of it', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      sec('v', 'Vectors', `<svg width="60" height="30"><text x="1" y="20">shown<tspan style="display:none">hidden one</tspan></text></svg>` +
        `<svg width="60" height="30"><text x="1" y="20">shown<tspan style="display:none">hidden two</tspan></text></svg>` +
        `<svg width="60" height="30"><g><rect width="20" height="20" fill="red"/></g></svg>` +
        `<svg width="60" height="30"><g style="transform:translate(10px,0)"><rect width="20" height="20" fill="red"/></g></svg>` +
        `<svg width="60" height="30"><g style="filter:blur(2px)"><rect width="20" height="20" fill="red"/></g></svg>`),
      '<footer>f</footer>'
    )
  )
  const svgs = everyNode(r.bands.find((b) => b.kind === 'band').tree).filter((n) => n.t === 'svg')
  assert.equal(svgs.length, 5)
  assert.equal(svgs[0].as, svgs[1].as, 'hidden words are not part of it')
  assert.equal(new Set([svgs[2].as, svgs[3].as, svgs[4].as]).size, 3, 'a transform and a filter on a group are')
})

test('heights (browser): the identity of an svg text is each painted run with its own paint — equal words in another fill or stroke of a tspan are another picture', async () => {
  const wm = (inner) => `<svg width="120" height="30"><text x="1" y="20" fill="black">${inner}</text></svg>`
  const r = await probe(
    PAGE(
      HEADER,
      sec('v', 'Vectors', wm('word<tspan fill="red">mark</tspan>') + wm('word<tspan fill="blue">mark</tspan>') + wm('word<tspan fill="red">mark</tspan>') + wm('word<tspan fill="none" stroke="red">mark</tspan>') + wm('word<tspan fill="red" style="opacity:.4">mark</tspan>')),
      '<footer>f</footer>'
    )
  )
  const svgs = everyNode(r.bands.find((b) => b.kind === 'band').tree).filter((n) => n.t === 'svg')
  assert.equal(svgs.length, 5)
  assert.equal(svgs[0].as, svgs[2].as, 'the same words in the same paint are one picture')
  assert.equal(new Set([svgs[0].as, svgs[1].as, svgs[3].as, svgs[4].as]).size, 4, 'another fill, stroke or opacity of a run is another picture')
})

test('heights (browser): a clip narrower than a CSS pixel still paints — the svg is not taken for empty; one that clips everything away is', async () => {
  const r = await probe(
    PAGE(
      HEADER,
      sec('v', 'Vectors', `<svg width="0" height="0"><clipPath id="sliver"><rect x="5.1" width="0.3" height="20"/></clipPath><clipPath id="none"><rect x="100" y="100" width="1" height="1"/></clipPath></svg>` +
        `<svg class="sliver" width="20" height="20"><rect width="20" height="20" fill="red" clip-path="url(#sliver)"/></svg>` +
        `<svg class="none" width="20" height="20"><rect width="20" height="20" fill="red" clip-path="url(#none)"/></svg>`),
      '<footer>f</footer>'
    )
  )
  const svgs = everyNode(r.bands.find((b) => b.kind === 'band').tree).filter((n) => n.t === 'svg')
  assert.equal(svgs.length, 2, 'the sliver is a picture (painted or unresolved), the clipped-away svg is none')
  assert.ok(svgs[0].img || svgs[0].unk)
})

test('judgeHeights (synthetic readings): small steps that add up are told on a page that also holds a split region of equal height', () => {
  const head = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
  const sec = (name, y, h) => [name, h, undefined, y, { k: [lf(name + ' words', y, h)] }]
  const S = mkBands([head, sec('one', 100, 100), sec('two', 200, 100), ['region', 300, undefined, 300, { k: [lf('region words', 300, 300)] }], ['FOOT', 100, 'footer', 600, { k: [lf('end', 600, 100)] }]])
  // the port cuts the region into two bands (same height together); the two bands before it each grow 5 px
  const P = mkBands([head, sec('one', 100, 105), sec('two', 205, 105), ['region', 150, undefined, 310, { k: [lf('region words', 310, 150)] }], [null, 150, undefined, 460, { k: [lf('', 460, 150)] }], ['FOOT', 100, 'footer', 610, { k: [lf('end', 610, 100)] }]])
  const j = judgeHeights([cellRow(S, P, 700, 710)])
  assert.ok(j.cells[0].notes.some((n) => /cuts a region into/.test(n)), j.cells[0].notes.join())
  const acc = j.defects.find((d) => d.kind === 'accumulated')
  assert.ok(acc && acc.delta === 10, JSON.stringify(j.defects.map((d) => [d.kind, d.delta])))
})

// ---- slices A + B: a match needs evidence — position, not words and a size alone --------------------------------------------
// (every reading below is SYNTHETIC: built by hand from the shape of a measured reading, with no site, template or CMS named)

const HD = ['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }]
const FT = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
const word = (key, y, o = {}) => node({ sig: 'p', key, x: 0, y, w: 400, h: 24, fx: 0, ...o })
const pic = (y, o = {}) => node({ sig: 'img', key: '', words: 0, tx: '', x: 0, y, w: 100, h: 100, img: { w: 100, h: 100 }, as: 'img:a', fx: 0, ...o })
const one = (h, kids, y = 100) => ['one', h, undefined, y, { k: kids }]
const kindsOf = (S, P, docS, docP) => judgeHeights([cellRow(mkBands(S), mkBands(P), docS, docP)]).defects.map((d) => d.kind).sort()

test('judgeHeights (synthetic readings): in a band that differs in height a leaf matches at the place the difference allows — words or a picture moved further are a finding; an accepted height cause does not hide them', () => {
  const mk = (ys, h) => [HD, one(h, ys.map((y, i) => word(`line number ${i}`, y)), 100), FT(100 + h)]
  // the port band is 40 px taller: its last line is 38 px lower, or 100 px lower. Nothing measured carries it (the bottom of a band is no measured line, a leaf that
  // moved with its neighbours' drift is another case): the same line moved, a finding either way
  const near = kindsOf(mk([110, 200, 300], 300), mk([110, 200, 338], 340), 500, 540)
  assert.ok(near.some((k) => /^element-/.test(k)), near.join())
  const far = kindsOf(mk([110, 200, 300], 300), mk([110, 200, 400], 340), 500, 540)
  assert.ok(far.some((k) => /^element-/.test(k)), far.join())
  // a picture of the same size moved by what the two boxes' own top padding differs by is the same picture; moved by as much with no padding to say so, it is not
  const padded = (h, pt, kids) => ['one', h, undefined, 100, { pt, k: kids }]
  const picNear = kindsOf([HD, padded(300, 0, [pic(110)]), FT(400)], [HD, padded(340, 30, [pic(140)]), FT(440)], 500, 540)
  assert.ok(!picNear.some((k) => /^element-/.test(k)), picNear.join())
  const picBare = kindsOf([HD, padded(300, 0, [pic(110)]), FT(400)], [HD, padded(340, 0, [pic(140)]), FT(440)], 500, 540)
  assert.deepEqual(picBare.filter((k) => /^element-/.test(k)), ['element-extra', 'element-missing'])
  const picFar = kindsOf([HD, one(300, [pic(110)]), FT(400)], [HD, one(340, [pic(300)]), FT(440)], 500, 540)
  assert.deepEqual(picFar.filter((k) => /^element-/.test(k)), ['element-extra', 'element-missing'])
  // accepted, the height cause explains its own height: the moved line stays open
  const j = judgeHeights([cellRow(mkBands(mk([110, 200, 300], 300)), mkBands(mk([110, 200, 400], 340)), 500, 540)])
  for (const d of j.defects.filter((x) => x.kind === 'padding-step')) j.notDefects.push({ route: d.route, width: d.width, delta: d.delta, accepted: true })
  settleHeightCells(j)
  assert.ok(j.defects.some((d) => /^element-/.test(d.kind)))
  assert.equal(j.cells[0].status, 'defect')
})

test('judgeHeights (synthetic readings): in a band as high as the other side\'s the edges and the height of a leaf must agree within the tolerance; one to one, as many leaves as can be matched are', () => {
  const mk = (kids) => [HD, one(300, kids), FT(400)]
  const w = (y, o) => word('line of words here', y, o)
  const kinds = (S, P) => kindsOf(mk(S), mk(P), 500, 500)
  assert.deepEqual(kinds([w(110)], [w(110, { x: 6 })]), [])
  assert.ok(kinds([w(110)], [w(110, { x: 10 })]).length > 0, 'moved across by 10 px')
  assert.deepEqual(kinds([w(110)], [w(116)]), [])
  assert.ok(kinds([w(110)], [w(120)]).length > 0, 'moved down by 10 px')
  assert.ok(kinds([w(110)], [w(110, { h: 48 })]).length > 0, 'the same words on another number of lines')
  assert.deepEqual(kinds([w(110)], [w(110, { h: 30 })]), [])
  // two leaves with the same words; each of the two on the source can stand for the one nearest it only if the matching is not greedy
  assert.deepEqual(kinds([w(108), w(100)], [w(108), w(116)]), [])
  // the same words twice on the source and once on the port: one is missing
  assert.deepEqual(kinds([w(110), w(200)], [w(110)]), ['element-missing'])
})

test('judgeHeights (synthetic readings): a columns step moves leaves along the reading order; the same words left of nothing in the order are still a finding', () => {
  const box = (key, x, y) => node({ sig: 'div.cell', x, y, w: 300, h: 100, fx: 0, k: [word(key, y, { x, w: 300, h: 100 })], words: 0 })
  const row = (cols, boxes, h) => {
    // (synthetic: the structure the probe reads around each leaf — the box that holds the cells, laid in `cols` columns)
    boxes.forEach((b) => b.k.forEach((l) => (l.ab = [{ x: 0, y: 100, w: 1000, h: Math.max(h, 300), row: cols > 1, cols }])))
    return node({ sig: 'div.row', cols, x: 0, y: 100, w: 1000, h, k: boxes, words: 0 })
  }
  const three = row(3, [box('first box', 0, 100), box('second box', 340, 100), box('third box', 680, 100)], 100)
  const stacked = row(1, [box('first box', 0, 100), box('second box', 0, 210), box('third box', 0, 320)], 320)
  const j = judgeHeights([cellRow(mkBands([HD, ['one', 100, undefined, 100, { k: [three] }], FT(200)]), mkBands([HD, ['one', 320, undefined, 100, { k: [stacked] }], FT(420)]), 300, 520)])
  assert.deepEqual(j.defects.map((d) => d.kind), ['column-count'])
  // the third box gone: found next to the columns step, which does not explain it
  const lost = row(1, [box('first box', 0, 100), box('second box', 0, 210)], 210)
  const k = judgeHeights([cellRow(mkBands([HD, ['one', 100, undefined, 100, { k: [three] }], FT(200)]), mkBands([HD, ['one', 210, undefined, 100, { k: [lost] }], FT(310)]), 300, 410)]).defects.map((d) => d.kind)
  assert.ok(k.includes('element-missing'), k.join())
})

test('judgeHeights (synthetic readings): a short band with no partner is the other side\'s only when a band at the same place of the page holds the same leaves', () => {
  const txt = (key, y) => word(key, y, { h: 4 })
  const tiny = (y) => [null, 4, undefined, y, { k: [txt('standing words', y)] }]
  const sec = (name, y) => [name, 100, undefined, y, { k: [word(`${name} words`, y)] }]
  // the source's short band stands between 'a' and 'b'; the port's twin of it between 'c' and the footer: a different place
  const S = [HD, sec('a', 100), tiny(200), sec('b', 204), sec('c', 304), FT(404)]
  const P = [HD, sec('a', 100), sec('b', 200), sec('c', 300), tiny(400), FT(404)]
  const far = kindsOf(S, P, 504, 504)
  assert.ok(far.includes('band-missing') && far.includes('band-extra'), far.join())
  // at the same place it is the same band
  const P2 = [HD, sec('a', 100), tiny(200), sec('b', 204), sec('c', 304), FT(404)]
  assert.deepEqual(kindsOf(S, P2, 504, 504), [])
})

test('judgeHeights (synthetic readings): two neighbours that differ in opposite directions are compared as one region — a block lost in it is a finding, the same content with the edge elsewhere is quiet', () => {
  const mk = (a, b, ha, hb) => [HD, ['features', ha, undefined, 100, { k: a }], ['support', hb, undefined, 100 + ha, { k: b }], FT(100 + ha + hb)]
  const f1 = word('feature one', 100, { h: 200 })
  const f2 = word('feature two', 320, { h: 200 })
  const s1 = word('support one', 632, { h: 200 })
  const S = mk([f1, f2], [word('support one', 632, { h: 200 })], 500, 600)
  assert.deepEqual(kindsOf(S, mk([f1, f2], [s1], 532, 568), 1300, 1300), [])
  const lost = kindsOf(S, mk([f1], [s1], 532, 568), 1300, 1300)
  assert.ok(lost.includes('element-missing'), lost.join())
  // a block that is still there but 32 px lower is not the same place
  const moved = kindsOf(S, mk([f1, f2], [word('support one', 664, { h: 200 })], 532, 568), 1300, 1300)
  assert.ok(moved.length > 0, 'moved')
})

test('judgeHeights (synthetic readings): a thin line of words or a rule below the tolerance only one side has is a finding in the footer; with it on both sides the cell is quiet', () => {
  const foot = (kids, h = 100) => ['FOOT', h, 'footer', 400, { k: kids }]
  const base = [lf('copyright', 400, 100)]
  const line = word('office hours', 500, { h: 3 })
  const rule = pic(503, { h: 2, w: 600, img: { w: 600, h: 2 }, as: 'rule:2px' })
  for (const extra of [line, rule]) {
    assert.deepEqual(kindsOf([HD, one(300, [lf('c', 100, 300)]), foot([...base, extra], 105)], [HD, one(300, [lf('c', 100, 300)]), foot(base)], 505, 500), ['element-missing'])
    assert.deepEqual(kindsOf([HD, one(300, [lf('c', 100, 300)]), foot(base)], [HD, one(300, [lf('c', 100, 300)]), foot([...base, extra], 105)], 500, 505), ['element-extra'])
  }
  assert.deepEqual(kindsOf([HD, one(300, [lf('c', 100, 300)]), foot([...base, line], 105)], [HD, one(300, [lf('c', 100, 300)]), foot([...base, line], 105)], 505, 505), [])
})

test('judgeHeights (synthetic readings): a cause that is not about content leaves the content findings standing — a missing thin rule next to a column, wrap or font step is its own finding', () => {
  const thin = pic(110, { h: 2, w: 600, img: { w: 600, h: 2 }, as: 'rule:2px' })
  const text = (lines, fs, lh) => node({ sig: 'p', key: 'one paragraph of words', x: 0, y: 110, w: 400, h: lines * lh, fs, lh, fx: 0 })
  const wrap = kindsOf([HD, one(100, [text(2, 16, 24), thin]), FT(200)], [HD, one(148, [text(4, 16, 24)]), FT(248)], 300, 348)
  assert.ok(wrap.includes('element-missing') && wrap.includes('text-wrap'), wrap.join())
  const font = kindsOf([HD, one(100, [text(2, 16, 24), thin]), FT(200)], [HD, one(128, [text(2, 20, 30)]), FT(228)], 300, 328)
  assert.ok(font.includes('element-missing') && font.some((k) => /step|wrap/.test(k)), font.join())
})

test('settleHeightCells (measured cells, reduced and renamed): a page within the tolerance is never made a defect by what was accepted; an open finding stays one', () => {
  // from the dossier of a measured sweep (tasks/small-delta-cells.json): a page 3 px shorter with 443.9 px accepted, a page of equal height with 40 px accepted and an open finding
  const cells = [
    { route: '/page-a', width: 768, delta: -3 },
    { route: '/page-b', width: 576, delta: 0 }
  ]
  const accepted = [
    { route: '/page-a', width: 768, delta: -443.9, accepted: true },
    { route: '/page-b', width: 576, delta: -40, accepted: true }
  ]
  const open = (list) => list.map((c) => ({ route: c.route, width: c.width }))
  const judged = (defects) => ({ tolerance: 8, cells: cells.map((c) => ({ ...c })), defects, notMeasured: [], notDefects: accepted.map((a) => ({ ...a })) })
  const quiet = settleHeightCells(judged([]))
  assert.deepEqual(quiet.map((c) => [c.net, c.status]), [[-3, 'ok'], [0, 'ok']])
  assert.deepEqual(quiet.map((c) => c.accepted), [-443.9, -40])
  const withOpen = settleHeightCells(judged(open(cells)))
  assert.deepEqual(withOpen.map((c) => [c.net, c.status]), [[-3, 'defect'], [0, 'defect']])
})

// ---- slices A + B, through the probe: the same page in other markup is the same page --------------------------------------

const spacers = (n) => Array.from({ length: n }, () => '<i style="display:block;height:2px"></i>').join('')
const FORMCSS = 'input,textarea,button{display:block;margin:0;border:1px solid #888;font:14px Arial}'
const contact = `<form style="margin:0"><input type="text" placeholder="Your name" style="height:36px;width:300px"><textarea placeholder="Your message" style="height:80px;width:300px"></textarea><button type="button" style="height:40px;width:120px">Send message</button></form>`
const quote = (who, role) => `<div class="q" style="height:48px"><h5 style="margin:0;height:24px">${who}</h5><p style="margin:0;height:24px">${role}</p></div>`
const readMore = '<a href="#more" style="display:block;height:24px">Read more</a>'
const panel = '<p class="panel-text" style="margin:0;height:48px">Panel body words stand here</p>'

test('heights (browser): equal-height content a side holds in one big band and the other cuts into several, in other markup, is quiet — controls, repeated words and testimonials included; a control lost is a finding', async () => {
  const content = (form) => `${quote('Jane Doe', 'Manager')}${readMore}${readMore}${panel}${form}${quote('John Roe', 'Director')}`
  // the source: one band of 700 boxes and then the content (the tree folds what is past its budget); the port: the same content in four bands, other wrappers
  const sourcePage = (form) => doc(PAGE(HEADER, `<section class="all"><h2 style="margin:0;height:30px">Intro</h2>${spacers(700)}<div class="deep"><div class="deeper">${content(form)}</div></div></section>`, FOOTER()), FORMCSS)
  const portPage = (form) => {
    const parts = [spacers(350), spacers(350), `${quote('Jane Doe', 'Manager')}${readMore}${readMore}`, `${panel}${form}${quote('John Roe', 'Director')}`]
    return doc(PAGE(HEADER, `<section class="p1"><h2 style="margin:0;height:30px">Intro</h2>${parts[0]}</section><section class="p2">${parts[1]}</section><article class="p3"><div>${parts[2]}</div></article><div class="p4"><section>${parts[3]}</section></div>`, FOOTER()), FORMCSS)
  }
  const r = await heights({ port: { '/a': portPage(contact), '/b': portPage(contact.replace(/<textarea.*?<\/textarea>/, '')) }, source: { '/a': sourcePage(contact), '/b': sourcePage(contact) }, widths: [1180], routes: ['/a', '/b'] })
  const at = (route) => r.defects.heights.filter((d) => d.route === route).map((d) => `${d.kind}:${d.culprit}`)
  assert.deepEqual(at('/a'), [], at('/a').join())
  assert.ok(at('/b').some((k) => /^element-missing:.*textarea/.test(k)), at('/b').join())
})

test('heights (browser): a link box padded on one side only, a closed <details>, a picture placed by absolute positioning and a background picture are the same page as their plain counterparts; shown, or lost, they are a difference', async () => {
  const css = 'summary{list-style:none}.ph{display:block;position:relative;height:60px;width:200px}.ph img{position:absolute;left:50px;top:10px;width:40px;height:40px}.bgbox{height:40px;width:40px;margin:10px 0 10px 50px;background:url("' + PIC + '") 0 0/40px 40px no-repeat}'
  const pageOf = ({ nav, faq, ph }) => doc(PAGE(HEADER, sec('mix', 'Mix', `<nav style="height:30px;overflow:visible">${nav}</nav>${faq}${ph}`, 'padding:10px 20px'), FOOTER()), css)
  const navPlain = '<a href="#h" style="display:block;line-height:24px;height:24px">Home page</a>'
  const navPadded = '<div style="height:24px"><a href="#h" style="display:block;position:relative;top:-15px;line-height:24px;height:54px;padding:15px 0">Home page</a></div>'
  const closed = '<details><summary style="height:24px">Question</summary><p style="margin:0;height:50px">Answer words</p></details>'
  const shown = '<details open><summary style="height:24px">Question</summary><p style="margin:0;height:50px">Answer words</p></details>'
  const hidden = '<div><p style="height:24px;margin:0">Question</p></div>'
  const absImg = `<div class="ph"><img alt="" src="${PIC}"></div>`
  const bgImg = '<div class="bgbox"></div>'
  const same = await heights({ port: { '/a': pageOf({ nav: navPadded, faq: closed, ph: absImg }) }, source: { '/a': pageOf({ nav: navPlain, faq: hidden, ph: bgImg }) }, widths: [1180] })
  assert.deepEqual(same.defects.heights, [], JSON.stringify(same.defects.heights.map((d) => d.detail)))
  // the details opened on the port: its answer is on the page
  const open = await heights({ port: { '/a': pageOf({ nav: navPlain, faq: shown, ph: absImg }) }, source: { '/a': pageOf({ nav: navPlain, faq: hidden, ph: absImg }) }, widths: [1180] })
  assert.ok(open.defects.heights.some((d) => d.kind === 'element-extra'), JSON.stringify(open.defects.heights.map((d) => d.kind)))
  // the picture lost on the port
  const lost = await heights({ port: { '/a': pageOf({ nav: navPlain, faq: closed, ph: '<div class="ph"></div>' }) }, source: { '/a': pageOf({ nav: navPlain, faq: closed, ph: absImg }) }, widths: [1180] })
  assert.ok(lost.defects.heights.some((d) => d.kind === 'element-missing'), JSON.stringify(lost.defects.heights.map((d) => d.kind)))
})

test('heights (browser): the slides a carousel is at are candidates, never a match — other words in the same slots, slides at another place and a slot only one side shows are said as not measured (slide-pair-unproven), through the probe', async () => {
  const slide = (t, pos) => `<div class="s" style="position:absolute;top:0;left:${pos}px;width:280px;height:60px;border:1px solid #888"><p style="margin:0;text-align:center;line-height:24px">${t}</p></div>`
  const strip = (cls, texts, off = 0) => `<div class="${cls}" style="position:relative;overflow:hidden;width:900px;height:62px;margin:0 20px">${texts.map((t, i) => slide(t, off + i * 300)).join('')}</div>`
  const page = (cls, texts, off) => doc(PAGE(HEADER, sec('slides', 'Clients', strip(cls, texts, off), 'padding:10px 0'), FOOTER()))
  const unproven = (r) => r.notMeasured.heights?.some((n) => n.cause === 'slide-pair-unproven')
  // the source's carousel is at its first slides, the port's (other markup, no carousel class) at the next ones
  const advanced = await heights({ port: { '/a': page('track', ['Beta words', 'Gamma words', 'Delta words', 'Epsilon words']) }, source: { '/a': page('owl-carousel', ['Alpha words', 'Beta words', 'Gamma words', 'Delta words']) }, widths: [1180] })
  assert.ok(unproven(advanced), 'the advance is a candidate, said as not measured')
  assert.deepEqual(advanced.defects.heights.filter((d) => /^element-|text-changed/.test(d.kind)), [], JSON.stringify(advanced.defects.heights.map((d) => d.detail)))
  // the port shows two slots where the source shows three: never quiet
  const fewer = await heights({ port: { '/a': page('track', ['Delta words', 'Epsilon words']) }, source: { '/a': page('owl-carousel', ['Alpha words', 'Beta words', 'Gamma words']) }, widths: [1180] })
  assert.ok(unproven(fewer) || fewer.defects.heights.some((d) => d.kind === 'element-missing'), JSON.stringify([fewer.notMeasured, fewer.defects.heights.map((d) => d.kind)]))
  // the same slides at the same place: quiet
  const same = await heights({ port: { '/a': page('track', ['Alpha words', 'Beta words', 'Gamma words']) }, source: { '/a': page('owl-carousel', ['Alpha words', 'Beta words', 'Gamma words']) }, widths: [1180] })
  assert.deepEqual([same.defects.heights, same.notMeasured.heights ?? []], [[], []])
})

test('heights (browser): the words of an svg are those it paints — a tspan with no fill, a title and a stylesheet are none; a clip that leaves a stripe of one pixel is ink; a clip that leaves nothing, no ink', async () => {
  const svg = (inner, extra = '') => `<svg width="200" height="60" style="display:block" ${extra}>${inner}</svg>`
  const painted = svg('<text x="10" y="30" fill="#000" font-size="20">Hello<tspan fill="none"> secret</tspan></text>')
  const plain = svg('<text x="10" y="30" fill="#000" font-size="20">Hello</text>')
  const noise = svg('<title>Logo title</title><style>.a{fill:red}</style><text x="10" y="30" fill="#000" font-size="20">Hello</text>')
  const r = await probe(PAGE(HEADER, sec('svgs', 'Svgs', `${painted}${plain}${noise}`), FOOTER()))
  const assets = leavesIn(r.bands.find((b) => b.tree.head === 'svgs').tree).filter((l) => l.img).map((l) => l.as)
  assert.equal(assets.length, 3)
  assert.equal(new Set(assets).size, 1, 'the invisible words are not part of what is drawn: ' + assets.join(' | '))
  // ink: one pixel of a 120 px shape that a clip-path url(#…) leaves
  const clipped = (h, y) => `<svg width="120" height="120" style="display:block"><clipPath id="c${y}"><rect x="0" y="${y}" width="120" height="${h}"/></clipPath><rect width="120" height="120" fill="red" clip-path="url(#c${y})"/></svg>`
  const p = await probe(PAGE(HEADER, sec('clips', 'Clips', `<div class="stripe">${clipped(1, 59.5)}</div><div class="none">${clipped(0, 59)}</div>`), FOOTER()))
  const stripe = leavesIn(p.bands.find((b) => b.tree.head === 'clips').tree).filter((l) => l.img)
  assert.equal(stripe.length, 1, 'only the stripe is a picture')
  assert.equal(stripe[0].y < 400, true)
  // letters a clip-path cuts away are not words: two svgs whose text differs only past the clip are the same drawing
  const cutText = (tail) => `<svg width="200" height="60" style="display:block"><clipPath id="k${tail}"><rect x="0" y="0" width="60" height="60"/></clipPath><text x="10" y="40" font-size="20" clip-path="url(#k${tail})">Hi<tspan dx="110">${tail}</tspan></text></svg>`
  const cutA = await probe(PAGE(HEADER, sec('cuta', 'Cuta', cutText('AAAA')), FOOTER()))
  const cutB = await probe(PAGE(HEADER, sec('cutb', 'Cutb', cutText('BBBB')), FOOTER()))
  const idOf = (r, head) => leavesIn(r.bands.find((b) => b.tree.head === head).tree).filter((l) => l.img).map((l) => l.as.replace(/k(AAAA|BBBB)/g, 'k'))
  assert.deepEqual(idOf(cutA, 'cuta'), idOf(cutB, 'cutb'), 'the letters past the clip are not part of what is drawn')
  // a drawing the browser cannot be asked about (it takes no pointer) is a picture of unknown ink: never equal to another, never a copy, and the cell is not-measured
  const blind = `<svg width="120" height="120" style="display:block;pointer-events:none"><clipPath id="b"><circle cx="60" cy="60" r="20"/></clipPath><rect width="120" height="120" fill="red" clip-path="url(#b)"/></svg>`
  const q = await probe(PAGE(HEADER, sec('blind', 'Blind', blind), FOOTER()))
  const bl = leavesIn(q.bands.find((b) => b.tree.head === 'blind').tree).filter((l) => l.img)
  assert.equal(bl.length, 1)
  assert.equal(bl[0].unk, 1)
  assert.match(bl[0].as, /^unproven:/)
  const j = await heights({ port: { '/a': doc(PAGE(HEADER, sec('blind', 'Blind', blind), FOOTER())) }, source: { '/a': doc(PAGE(HEADER, sec('blind', 'Blind', blind), FOOTER())) }, widths: [1180] })
  assert.ok(j.notMeasured.heights.some((n) => n.cause === 'ink-not-established'), JSON.stringify(j.notMeasured))
})

test('heights (browser): a band with more leaves than the probe reads is not compared for content — it is said, not taken for nothing', async () => {
  const many = Array.from({ length: 3700 }, (_, i) => `<span style="display:block;height:1px;font-size:1px;line-height:1px">w${i}</span>`).join('')
  const big = doc(PAGE(HEADER, sec('big', 'Big', `<div><div>${many}</div></div>`), FOOTER()))
  const r = await probe(PAGE(HEADER, sec('big', 'Big', `<div><div>${many}</div></div>`), FOOTER()))
  assert.equal(r.bands.find((b) => b.tree.head === 'big').capped, true)
  const j = await heights({ port: { '/a': big }, source: { '/a': big }, widths: [1180] })
  assert.ok(j.notMeasured.heights.some((n) => n.cause === 'content-not-read'), JSON.stringify(j.notMeasured))
})

test('judgeHeights (synthetic readings): leaves moved across together by the same amount are the same leaves moved — a menu pushed 15 px is the finding element-moved; one leaf moved on its own, or by another amount, is a finding; centred text is the same text', () => {
  const mk = (kids, h = 100) => [HD, one(h, kids), FT(100 + h)]
  // (one leaf to a row: a row of leaves has its own rule)
  const item = (key, x, o = {}) => word(key, 110 + 30 * (['home', 'about us', 'services', 'news'].indexOf(key)), { x, w: 60, ...o })
  const row = (dx, ...more) => [item('home', 100 + dx), item('about us', 200 + dx), item('services', 300 + dx), item('news', 400 + dx), ...more]
  const kinds = (S, P) => kindsOf(mk(S), mk(P), 200, 200)
  assert.deepEqual(kinds(row(0), row(0)), [])
  // (leaves that moved alike with no pair matched at its own place to say so are candidates: no finding, and not quiet — `shift-position-unproven`)
  const unproven = (S, P) => judgeHeights([cellRow(mkBands(mk(S)), mkBands(mk(P)), 200, 200)]).notMeasured.map((n) => n.cause)
  // (words that stand once on each side, within what a box carries across, are the same leaves moved: matched, and the move is the finding `element-moved` — not silent, not missing)
  for (const dx of [15, 40]) {
    assert.deepEqual(kinds(row(0), row(dx)), ['element-moved'], `moved ${dx}`)
    assert.deepEqual(unproven(row(0), row(dx)), [], `moved ${dx}`)
  }
  // one of them moved on its own
  const alone = [item('home', 100), item('about us', 200), item('services', 300), item('news', 440)]
  assert.ok(kinds(row(0), alone).length > 0, 'one leaf moved 40 px on its own')
  // the shift is not the same
  assert.ok(kinds(row(0), [item('home', 115), item('about us', 260), item('services', 330), item('news', 380)]).length > 0)
  // too far for two leaves (more than a fifth of the width, and than 64 px); four moved together are a rigid move
  assert.ok(kinds(row(0).slice(0, 2), row(300).slice(0, 2)).length > 0, 'two leaves moved 300 px')
  assert.deepEqual(kinds(row(0), row(300)), [])
  assert.ok(unproven(row(0), row(300)).includes('shift-position-unproven'), 'four moved 300 px together are candidates, not a match')
  // text centred in the same box: another ink width, the same centre
  const centred = (w) => word('a centred line', 110, { x: 500 - w / 2, w, ink: { x: 500 - w / 2, y: 110, w, h: 24 } })
  assert.deepEqual(kinds([centred(300)], [centred(380)]), [])
})

test('judgeHeights (synthetic readings): a background picture is matched by where it is painted — the same place as an image is one picture, a small image inside its box is not; where it could not be told is not-measured', () => {
  const region = { x: 0, y: 100, w: 1000, h: 140 }
  const bg = (o = {}) => node({ sig: 'div.cover', t: '#bg', key: '', words: 0, tx: '', x: 0, y: 100, w: 1000, h: 140, img: { w: 1000, h: 140 }, ink: region, as: 'bg:url(a)', ov: 1, fx: 0, ...o })
  const sec = (kids, dl) => ['one', 300, undefined, 100, { k: kids, dl }]
  const text = word('some words on top', 250)
  const S = [HD, sec([text], [bg()]), FT(400)]
  const img = (o = {}) => pic(100, { w: 1000, h: 140, img: { w: 1000, h: 140 }, ov: 1, ...o })
  const full = (list) => judgeHeights([cellRow(mkBands(S), mkBands([HD, sec([text], list), FT(400)]), 500, 500)])
  // the picture painted where the image lies, the size of the image
  assert.deepEqual(full([img()]).defects, [])
  // a small image somewhere inside the box is not what the background paints
  assert.ok(full([img({ w: 60, h: 60, img: { w: 60, h: 60 }, y: 150 })]).defects.some((d) => /^element-/.test(d.kind)))
  assert.ok(full([]).defects.some((d) => d.kind === 'element-missing'))
  // where the background is painted could not be told: the box is not the place — said, not quiet and not a finding
  const unplaced = judgeHeights([cellRow(mkBands([HD, sec([text], [bg({ ink: undefined, bgu: 1, h: 300, img: { w: 1000, h: 300 } })]), FT(400)]), mkBands([HD, sec([text], [img({ y: 150, h: 100, img: { w: 1000, h: 100 } })]), FT(400)]), 500, 500)])
  assert.deepEqual(unplaced.defects, [])
  assert.ok(unplaced.notMeasured.some((n) => n.cause === 'background-picture-not-placed'), JSON.stringify(unplaced.notMeasured))
})

test('judgeHeights (synthetic readings): the words a box holds itself and the boxes out of flow are leaves of the box — one side without them is a finding', () => {
  const own = (key, y) => ({ t: '#text', sig: 'div', key, head: '', x: 0, y, w: 300, h: 24, d: 'inline', cols: 1, pt: 0, pb: 0, bw: 0, mt: 0, mb: 0, rg: 0, fs: 16, lh: 24, img: null, k: [], words: 1, tx: key.replace(/ /g, ''), dw: 1 })
  const sec = (dl) => ['one', 300, undefined, 100, { k: [word('boxed words', 100)], dl }]
  const S = [HD, sec([own('words held by the box itself', 160), pic(220, { ov: 1 })]), FT(400)]
  assert.deepEqual(kindsOf(S, [HD, sec([own('words held by the box itself', 160), pic(220, { ov: 1 })]), FT(400)], 500, 500), [])
  assert.ok(kindsOf(S, [HD, sec([pic(220, { ov: 1 })]), FT(400)], 500, 500).includes('element-missing'))
  assert.ok(kindsOf(S, [HD, sec([own('words held by the box itself', 160)]), FT(400)], 500, 500).includes('element-missing'))
})

test('judgeHeights (synthetic readings): the space between bands is told between the units the two sides share — a strip grouped with its header is one unit — and is no "small steps that add up"', () => {
  const lines = (...ys) => ys.map((y, i) => word(`line ${i} of words`, y, { h: 24 }))
  const strip = [null, 40, 'pre', 0, { k: [word('top bar words', 5, { h: 24 })] }]
  const headS = ['HEAD', 90, 'header', 40, { k: [word('menu words', 60, { h: 24 })] }]
  const headP = ['HEAD', 130, 'header', 0, { k: [word('top bar words', 5, { h: 24 }), word('menu words', 60, { h: 24 })] }]
  const mid = (y) => ['mid', 300, undefined, y, { k: lines(y + 5, y + 60) }]
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  // the source leaves 75 px above and below its middle band; the port none
  const j = judgeHeights([cellRow(mkBands([strip, headS, mid(205), foot(580)]), mkBands([headP, mid(130), foot(430)]), 680, 530)])
  assert.deepEqual(j.defects.map((d) => d.kind).sort(), ['gap', 'gap'], JSON.stringify(j.defects.map((d) => d.kind + d.delta)))
  assert.deepEqual(j.defects.map((d) => d.delta).sort((a, b) => a - b), [-75, -75])
  assert.deepEqual(j.notMeasured, [])
})

test('explain (synthetic readings): a strip before a pair is one row with its parts under it, judged as the judge does — quiet with its words on the other side, a defect (1) without them', () => {
  const strip = [null, 40, 'pre', 0, { k: [word('top bar words', 5, { h: 24 })] }]
  const headS = ['HEAD', 90, 'header', 40, { k: [word('menu words', 60, { h: 24 })] }]
  const headP = (kids) => ['HEAD', 130, 'header', 0, { k: kids }]
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  const S = mkBands([strip, headS, foot(130)])
  const both = explainRow(cellRow(S, mkBands([headP([word('top bar words', 5, { h: 24 }), word('menu words', 60, { h: 24 })]), foot(130)]), 230, 230))
  assert.deepEqual([both.exit, both.first], [0, null])
  assert.ok(both.lines.some((l) => /split-band group: the source cuts one region into 2 bands/.test(l)), both.lines.join('\n'))
  assert.equal(both.lines.filter((l) => /part \d of 2 \(source\)/.test(l)).length, 2)
  assert.equal(both.lines.filter((l) => /^ *\d+ {2}source/.test(l)).length, 2)
  const lost = explainRow(cellRow(S, mkBands([headP([word('menu words', 60, { h: 24 })]), foot(130)]), 230, 230))
  assert.equal(lost.exit, 1)
  assert.ok(lost.first, lost.lines.join('\n'))
  assert.match(lost.lines.at(-1), /^first difference: block 1/)
  // the same verdict as the judge's
  const j = judgeHeights([cellRow(S, mkBands([headP([word('menu words', 60, { h: 24 })]), foot(130)]), 230, 230)])
  assert.ok(j.defects.some((d) => d.kind === 'element-missing'))
})

test('judgeHeights (synthetic readings): a long band drifts — each leaf stands lower by about what the leaves around it do — and is quiet; a leaf that moved past its neighbours or further than they did is a finding', () => {
  const mk = (ys, h) => [HD, one(h, ys.map((y, i) => word(`paragraph number ${i} of the page`, y)), 100), FT(100 + h)]
  const S = mk([110, 300, 500], 500)
  const kinds = (P, hP) => kindsOf(S, mk(P, hP), 600, 600 + hP - 500).filter((k) => /^element-|^text-changed/.test(k))
  // every leaf lower than the one before it by a few px more (7 each, within the tolerance of its neighbour): the drift of a band whose paragraphs wrap to more lines
  assert.deepEqual(kinds([110, 307, 514], 514), [])
  // the third paragraph moved down by 30 px beyond the second, which moved by 7: further than its neighbour did
  assert.ok(kinds([110, 307, 544], 544).length > 0, 'moved further than the leaves around it')
  // a drift that the neighbours do not carry (40 px at once, from the top): nothing measured says it, the bottom of the band is no line that does — a finding
  assert.ok(kinds([110, 340, 540], 540).length > 0, 'no neighbour carries 40 px')
  // two paragraphs changed places: out of the reading order
  assert.ok(kinds([110, 500, 300], 500).length > 0, 'moved past a neighbour')
})

test('judgeHeights (synthetic readings): a picture whose ink could not be established is never a copy of another and never the same picture as one', () => {
  const slide = (o = {}, kid = {}) => node({ sig: 'div.slide', t: 'div', y: 100, h: 60, w: 300, words: 0, tx: '', k: [node({ sig: 'svg', t: 'svg', y: 100, h: 60, w: 300, img: { w: 300, h: 60 }, words: 0, tx: '', as: 'svg:a', ...kid })], ...o })
  const track = (kids) => node({ sig: 'div.track', t: 'div', y: 100, h: 60, w: 1000, comp: 1, words: 0, tx: '', k: kids })
  const band = (kids) => ['one', 60, undefined, 100, { k: kids }]
  const rows = (S, P) => judgeHeights([cellRow(mkBands([['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }], S, ['FOOT', 50, 'footer', 160, { k: [lf('end', 160, 50)] }]]), mkBands([['HEAD', 100, 'header', 0, { k: [lf('top', 0, 100)] }], P, ['FOOT', 50, 'footer', 160, { k: [lf('end', 160, 50)] }]]), 210, 210)])
  const known = band([track([slide({ comp: 1 })])])
  // the copy is the same picture, read in full: removed
  assert.deepEqual(rows(known, band([track([slide({ comp: 1 }), slide({ comp: 1, cl: 1 })])])).defects, [])
  // the same, but the browser could not say what the drawing paints: it is not the original's copy, so it stays
  const unk = (o = {}) => slide(o, { unk: 1, as: 'unproven:1' })
  const j = rows(band([track([unk({ comp: 1 })])]), band([track([unk({ comp: 1 }), unk({ comp: 1, cl: 1 })])]))
  assert.ok(j.defects.some((d) => d.kind === 'element-extra') || j.notMeasured.some((n) => n.cause === 'ink-not-established'), JSON.stringify([j.defects, j.notMeasured]))
  assert.ok(j.notMeasured.some((n) => n.cause === 'ink-not-established'), 'said, not taken for nothing')
  // and it matches no picture of the other side: one side holding it, the other a known picture, is a finding
  const k = rows(band([track([unk({ comp: 1 })])]), known)
  assert.ok(k.notMeasured.some((n) => n.cause === 'ink-not-established'))
})

// ---- repair round 2: one reading of each painted run, bounded reach, proven slides, unread bands, thin strips, overlay copies ----

test('heights (browser): a painted run of words is one leaf — in a box with in-flow children, with none, in a folded subtree, beside an out-of-flow box', async () => {
  const nest = (n, inner) => (n ? `<div>${nest(n - 1, inner)}</div>` : inner)
  const many = Array.from({ length: 640 }, () => '<i style="display:block;height:2px"></i>').join('')
  const abs = (t) => `<span style="position:absolute;left:300px;top:10px;width:200px">${t}</span>`
  const body = `<div class="plain" style="position:relative;height:60px"><p style="margin:0">In flow words</p>Own words ${abs('Overlay one')}</div>` +
    `<div class="alone" style="position:relative;height:60px">Parent only words ${abs('Overlay two')}</div>` +
    `<div class="wrapped" style="position:relative;height:60px"><b>Bold</b> inline words <span>${abs('Overlay three')}</span></div>`
  const r = await probe(PAGE(HEADER, `<section class="runs"><h2 style="margin:0">Runs</h2>${body}</section><section class="deep"><h2 style="margin:0">Deep</h2>${many}${nest(2, `<div style="position:relative;height:60px">Folded own words ${abs('Folded overlay')}<p style="margin:0">Folded child</p></div>`)}</section>`, FOOTER()))
  const every = (n) => [...(n.k.length ? n.k.flatMap(every) : n.words || n.img ? [n] : []), ...(n.dl ?? []).flatMap(every)]
  const words = (head) => every(r.bands.find((b) => b.tree.head === head).tree).filter((l) => l.words).map((l) => l.tx)
  const runs = words('runs')
  for (const w of ['inflowwords', 'ownwords', 'overlayone', 'parentonlywords', 'overlaytwo', 'boldinlinewords', 'overlaythree']) assert.equal(runs.filter((t) => t.includes(w)).length, 1, `${w} in ${runs.join(' | ')}`)
  // (no leaf holds another leaf's words: the parent's text stops at the box that is out of flow)
  assert.ok(!runs.some((t) => /overlay/.test(t) && /own|parent|bold/.test(t)), runs.join(' | '))
  const deep = words('deep')
  for (const w of ['foldedownwords', 'foldedoverlay', 'foldedchild']) assert.equal(deep.filter((t) => t.includes(w)).length, 1, `${w} in ${deep.join(' | ')}`)
  assert.ok(!deep.some((t) => t.includes('foldedoverlay') && t.includes('foldedown')), deep.join(' | '))
})

test('judgeHeights (synthetic readings): the reach of a match is measured — the difference of two boxes\' heights gives none; a leaf that sits between matched neighbours has it; keeping its distance from the bottom of the band does not', () => {
  const mk = (ys, h) => [HD, one(h, ys.map((y, i) => word(`line number ${i} of text`, y)), 100), FT(100 + h)]
  const kinds = (S, P, hS, hP) => kindsOf(mk(S, hS), mk(P, hP), 100 + hS + 100, 100 + hP + 100).filter((k) => /^element-/.test(k))
  // a lone leaf 20 px lower in a band 40 px taller, nothing measured around it: not supported (40 px, the band's whole difference, is not a reach it is given)
  // (in the reflow cases below the leaf after the run stays where it was — its own measured place — and bounds the run)
  assert.deepEqual(kinds([110], [130], 300, 340), ['element-extra', 'element-missing'])
  // the same leaf at the same distance from the bottom: the bottom of a band is no measured line — not even when the band after it is paired by its own words (a footer's
  // landmark says nothing of the gap to it or of what it shows) — so the leaf is not matched by it: a finding (it stands 40 px lower)
  assert.ok(kinds([110, 290], [110, 330], 300, 340).length > 0)
  // the order of the reading with another number of columns reflows leaves only between the leaves already matched around them
  const box = (key, x, y) => node({ sig: 'div.cell', x, y, w: 300, h: 40, fx: 0, k: [word(key, y, { x, w: 300, h: 40 })], words: 0 })
  const row = (cols, boxes, h) => {
    // (synthetic: the structure the probe reads around each leaf — the box that holds the cells, laid in `cols` columns)
    boxes.forEach((b) => b.k.forEach((l) => (l.ab = [{ x: 0, y: 100, w: 1000, h: Math.max(h, 300), row: cols > 1, cols }])))
    return node({ sig: 'div.row', cols, x: 0, y: 100, w: 1000, h, k: boxes, words: 0 })
  }
  const lead = word('first line stays', 100, { h: 40 })
  const S = [HD, ['one', 400, undefined, 100, { k: [lead, row(3, [box('alpha cell', 0, 200), box('beta cell', 340, 200), box('gamma cell', 680, 200)], 40), word('last line stays', 440, { h: 40 })] }], FT(500)]
  const P = (gammaY) => [HD, ['one', 440, undefined, 100, { k: [lead, row(1, [box('alpha cell', 0, 200), box('beta cell', 0, 250), box('gamma cell', 0, gammaY)], 140), word('last line stays', 440, { h: 40 })] }], FT(540)]
  assert.deepEqual(judgeHeights([cellRow(mkBands(S), mkBands(P(300)), 600, 640)]).defects.filter((d) => /^element-(missing|extra)$/.test(d.kind)), [])
  // carried past the last matched leaf of the band: not between them
  assert.ok(judgeHeights([cellRow(mkBands(S), mkBands(P(600)), 600, 640)]).defects.some((d) => /^element-(missing|extra)$/.test(d.kind)))
})

test('judgeHeights (synthetic readings): short unpaired bands of one slot stand for each other only at the same place — measured from the band before them, with the tolerance applied once', () => {
  const band = (y, h, kids) => ({ kind: 'band', y, h, tree: node({ y, h, k: kids }) })
  const tiny = (y, dy = 0) => band(y, 4, [word('standing words', y + dy, { h: 4 })])
  const here = tiny(204)
  const cand = (y, dy) => ({ ...tiny(y, dy), frame: 100 })
  // measured from the same frame, the leaf is within the tolerance once, not once for the band and once more for the leaf
  assert.equal(bandOnlyHere(here, [cand(204)], 8, 100), false)
  assert.equal(bandOnlyHere(here, [cand(206, 0)], 8, 100), false, 'one allowance for the whole')
  assert.equal(bandOnlyHere(here, [cand(210, 10)], 8, 100), true, 'band 6 px lower and leaf 10 px lower again: not one allowance')
  assert.equal(bandOnlyHere(here, [cand(500)], 8, 100), true, 'the same words 300 px lower')
  // the slot itself still groups by the paired bands around it
  const sb = [band(0, 100), here, band(600, 100)]
  const pb = [band(0, 100), tiny(500), band(600, 100)]
  const al = { pairs: [[0, 0], [2, 2]], missing: [1], extra: [1] }
  assert.deepEqual(unpairedAt(al, sb, pb, 'source', 1).map((c) => [c.y, c.frame]), [[500, 100]])
})

test('judgeHeights (synthetic readings): a carousel phase is a whole slide of a paired container — a caption beside the slides, or one missing from a slide that is paired, is a finding', () => {
  // (synthetic: `sl` / `sc` are the structure the probe reads — the box that is one of several of one size in a row, and the box that holds them)
  const slide = (t, x, comp, cap) => [
    node({ sig: 'div.slide', key: t, x, y: 100, w: 280, h: 60, fx: 0, sl: `s${t}`, sc: 1, sr: { x, y: 100, w: 280, h: 100 }, ...(comp ? { comp: 1 } : {}) }),
    ...(cap ? [node({ sig: 'p.cap', key: `${t} caption`, x, y: 170, w: 280, h: 20, fx: 0, sl: `s${t}`, sc: 1, sr: { x, y: 100, w: 280, h: 100 }, ...(comp ? { comp: 1 } : {}) })] : [])
  ]
  const caption = word('photo credit line', 110, { x: 20, w: 120, h: 20 })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const P = (cap) => [HD, band([...slide('beta', 0, false, cap), ...slide('gamma', 300, false, cap), ...slide('delta', 600, false, cap)]), FT(200)]
  const S = (extra, cap) => [HD, band([...slide('alpha', 0, true, cap), ...slide('beta', 300, true, cap), ...slide('gamma', 600, true, cap), ...extra]), FT(200)]
  const k = (x, y) => kindsOf(x, y, 300, 300).filter((q) => /^element-|^text-changed/.test(q))
  assert.deepEqual(k(S([], false), P(false)), [], 'the slides that left and entered are the phase')
  assert.ok(k(S([caption], false), P(false)).includes('element-missing'), 'a caption beside the slides is not a slide')
  // with their own captions, the slides that left and entered take theirs along; a caption missing from a slide that is paired does not
  assert.deepEqual(k(S([], true), P(true)), [])
  const lost = [HD, band([...slide('beta', 0, false, false), ...slide('gamma', 300, false, true), ...slide('delta', 600, false, true)]), FT(200)]
  // (the slides stand elsewhere: no leaf of them is matched at a place of its own, so the caption is a finding or said as not measured — never quiet)
  const j = judgeHeights([cellRow(mkBands(S([], true)), mkBands(lost), 300, 300)])
  assert.ok(j.defects.some((d) => d.kind === 'element-missing') || j.notMeasured.some((n) => n.cause === 'slide-pair-unproven'), 'the caption of a slide')
})

test('judgeHeights (synthetic readings): content the probe did not read in a band with no partner is said, and a short band is not set aside on it', () => {
  const tinyBand = [null, 4, undefined, 200, { k: [word('hidden past the cap', 200, { h: 4 })] }]
  const S = mkBands([HD, tinyBand, FT(204)])
  S[1].capped = true
  const j = judgeHeights([cellRow(S, mkBands([HD, FT(200)]), 304, 300)])
  assert.ok(j.notMeasured.some((n) => n.cause === 'content-not-read'), JSON.stringify(j.notMeasured))
  assert.ok(j.defects.some((d) => d.kind === 'band-missing'), JSON.stringify(j.defects.map((d) => d.kind)))
})

test('judgeHeights (synthetic readings): a strip of a few px outside one header is the same region when the pair agrees within the tolerance — its words must stand in the other header', () => {
  const strip = [null, 4, 'pre', 0, { k: [word('thin strip words', 0, { h: 4 })] }]
  const headS = ['HEAD', 100, 'header', 4, { k: [word('menu words', 40, { h: 24 })] }]
  const headP = (kids) => ['HEAD', 104, 'header', 0, { k: kids }]
  const foot = (y) => ['FOOT', 100, 'footer', y, { k: [lf('end', y, 100)] }]
  const both = kindsOf([strip, headS, foot(104)], [headP([word('thin strip words', 0, { h: 4 }), word('menu words', 40, { h: 24 })]), foot(104)], 204, 204)
  assert.deepEqual(both, [])
  const lost = kindsOf([strip, headS, foot(104)], [headP([word('menu words', 40, { h: 24 })]), foot(104)], 204, 204)
  assert.ok(lost.includes('element-missing'), lost.join())
})

test('judgeHeights (synthetic readings): a copy placed out of flow (a box in `dl`) is removed against an original of its own component like any other copy', () => {
  const slide = (o = {}) => node({ sig: 'div.slide', t: 'div', x: 0, y: 100, w: 300, h: 60, comp: 1, words: 1, key: 'slide words', fx: 0, ov: 1, ...o })
  const track = (dl) => node({ sig: 'div.track', t: 'div', y: 100, h: 60, w: 1000, comp: 1, words: 0, tx: '', k: [], dl })
  const band = (dl) => ['one', 60, undefined, 100, { k: [track(dl)] }]
  const rows = (P) => judgeHeights([cellRow(mkBands([HD, band([slide()]), FT(160)]), mkBands([HD, band(P), FT(160)]), 260, 260)]).defects
  assert.deepEqual(rows([slide(), slide({ cl: 1 })]), [])
  assert.ok(rows([slide(), slide({ cl: 1, comp: 2 })]).length > 0, 'a copy of another component stays')
})

test('heights (browser): a background picture is read where it is painted — cover fills the box, a length places it, auto is the size of the picture itself', async () => {
  const bgBox = (css) => `<div class="b" style="height:100px;width:300px;background:url(&quot;${PIC}&quot;) ${css}"></div>`
  const body = `<img alt="" src="${PIC}" style="width:10px;height:10px">${bgBox('0 0/cover no-repeat')}${bgBox('50px 20px/40px 40px no-repeat')}${bgBox('0 0/auto no-repeat')}`
  const r = await probe(PAGE(HEADER, sec('bgs', 'Bgs', body), FOOTER()))
  const bgs = leavesIn(r.bands.find((b) => b.tree.head === 'bgs').tree).filter((l) => l.img && l.as.startsWith('bg:'))
  assert.equal(bgs.length, 3)
  const [cover, placed, natural] = bgs
  assert.deepEqual([cover.ink.w, cover.ink.h], [300, 100])
  assert.deepEqual([placed.ink.w, placed.ink.h, Math.round(placed.ink.x - placed.x)], [40, 40, 50])
  assert.deepEqual([natural.ink.w, natural.ink.h], [10, 10], 'auto is the size of the picture itself')
  assert.ok(bgs.every((l) => !l.bgu))
})

test('judgeHeights (synthetic readings): a columns step reflows a run of leaves — a single leaf is never reflowed, a run with a member out of place or reworded is not', () => {
  const box = (key, x, y) => node({ sig: 'div.cell', x, y, w: 300, h: 40, fx: 0, k: [word(key, y, { x, w: 300, h: 40 })], words: 0 })
  const row = (cols, boxes, h) => {
    // (synthetic: the structure the probe reads around each leaf — the box that holds the cells, laid in `cols` columns)
    boxes.forEach((b) => b.k.forEach((l) => (l.ab = [{ x: 0, y: 100, w: 1000, h: Math.max(h, 300), row: cols > 1, cols }])))
    return node({ sig: 'div.row', cols, x: 0, y: 100, w: 1000, h, k: boxes, words: 0 })
  }
  const lead = word('first line stays', 100, { h: 40 })
  const last = (y) => word('last line stays', y, { h: 40 })
  const S = (boxes) => [HD, ['one', 400, undefined, 100, { k: [lead, row(3, boxes, 40), last(440)] }], FT(500)]
  const P = (boxes) => [HD, ['one', 440, undefined, 100, { k: [lead, row(1, boxes, 140), last(440)] }], FT(540)]
  const three = [box('alpha cell', 0, 200), box('beta cell', 340, 200), box('gamma cell', 680, 200)]
  const miss = (s, p) => judgeHeights([cellRow(mkBands(s), mkBands(p), 600, 640)]).defects.filter((d) => /^element-(missing|extra)$|^text-changed$/.test(d.kind)).length
  assert.equal(miss(S(three), P([box('alpha cell', 0, 200), box('beta cell', 0, 250), box('gamma cell', 0, 300)])), 0)
  // one of three reworded: the run does not correspond
  assert.ok(miss(S(three), P([box('alpha cell', 0, 200), box('beta cell', 0, 250), box('delta cell', 0, 300)])) > 0)
  // a single leaf, whatever the columns do
  assert.ok(miss(S([box('alpha cell', 0, 200)]), P([box('alpha cell', 0, 330)])) > 0)
})

test('judgeHeights (synthetic readings): slides pair as a slot only through the structure — a leaf outside a row of slides does not, whatever its size; a slot only one side shows is a finding', () => {
  const slide = (t, x, comp) => node({ sig: 'div.slide', key: t, x, y: 100, w: 280, h: 60, fx: 0, ...(comp ? { comp: 1 } : {}), sl: `s${t}`, sc: 1, sr: { x, y: 100, w: 280, h: 100 } })
  const credit = (comp) => node({ sig: 'p.credit', key: 'photo credit line', x: 0, y: 100, w: 280, h: 60, fx: 0, ...(comp ? { comp: 1 } : {}) })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const k = (S, P) => kindsOf(S, P, 300, 300).filter((q) => /^element-|^text-changed/.test(q))
  assert.deepEqual(k([HD, band([slide('alpha', 0, true), slide('beta', 300, true)]), FT(200)], [HD, band([slide('gamma', 0), slide('delta', 300)]), FT(200)]), [])
  // a third slide the other side does not show may be a phase it is not at: said as not measured, never matched and never quiet
  const three = judgeHeights([cellRow(mkBands([HD, band([slide('alpha', 0, true), slide('beta', 300, true), slide('gamma', 600, true)]), FT(200)]), mkBands([HD, band([slide('delta', 0), slide('epsilon', 300)]), FT(200)]), 300, 300)])
  assert.ok(three.defects.some((d) => d.kind === 'element-missing') || three.notMeasured.some((n) => n.cause === 'slide-pair-unproven'))
  assert.ok(k([HD, band([slide('alpha', 0, true), credit(true)]), FT(200)], [HD, band([slide('beta', 0), slide('gamma', 300)]), FT(200)]).length > 0)
})

test('judgeHeights (synthetic readings): a background whose place is not resolved matches nothing — not a same-sized image, not a copy — and is said; one proven to paint nothing is no picture', () => {
  const bgu = (o = {}) => node({ sig: 'div.cover', t: '#bg', key: '', words: 0, tx: '', x: 0, y: 100, w: 1000, h: 140, img: { w: 1000, h: 140 }, as: 'bg:url(a)', bgu: 1, ov: 1, fx: 0, ...o })
  const img = pic(100, { w: 1000, h: 140, img: { w: 1000, h: 140 }, ov: 1 })
  const sec = (dl) => ['one', 300, undefined, 100, { k: [word('some words on top', 250)], dl }]
  const j = judgeHeights([cellRow(mkBands([HD, sec([bgu()]), FT(400)]), mkBands([HD, sec([img]), FT(400)]), 500, 500)])
  assert.deepEqual(j.defects, [])
  assert.ok(j.notMeasured.some((n) => n.cause === 'background-picture-not-placed'))
  // alone on one side: a picture only that side has
  assert.ok(judgeHeights([cellRow(mkBands([HD, sec([bgu()]), FT(400)]), mkBands([HD, sec([]), FT(400)]), 500, 500)]).defects.some((d) => d.kind === 'element-missing'))
  // it is no original: a marked copy of an unresolved background stays
  const track = (kids) => node({ sig: 'div.track', t: 'div', y: 100, h: 60, w: 1000, comp: 1, words: 0, tx: '', k: kids })
  const slide = (o) => node({ sig: 'div.slide', t: 'div', y: 100, h: 60, w: 300, comp: 1, words: 0, tx: '', k: [bgu({ comp: 1, ...o })] })
  const band = (kids) => ['one', 60, undefined, 100, { k: [track(kids)] }]
  const rows = (P) => judgeHeights([cellRow(mkBands([HD, band([slide({})]), FT(160)]), mkBands([HD, band(P), FT(160)]), 260, 260)])
  const c = rows([slide({}), slide({ cl: 1 })])
  assert.ok(c.defects.some((d) => d.kind === 'element-extra') || c.notMeasured.length, JSON.stringify(c.defects.map((d) => d.kind)))
})

test('heights (browser): a background picture that lies wholly outside its box paints nothing and is no picture', async () => {
  const body = `<img alt="" src="${PIC}" style="width:10px;height:10px"><div style="height:100px;width:300px;background:url(&quot;${PIC}&quot;) -500px 0/40px 40px no-repeat"></div>`
  const r = await probe(PAGE(HEADER, sec('out', 'Out', body), FOOTER()))
  const bgs = leavesIn(r.bands.find((b) => b.tree.head === 'out').tree).filter((l) => l.img && l.as.startsWith('bg:'))
  assert.equal(bgs.length, 0)
})

test('judgeHeights (synthetic readings): a row of leaves widened on one side stands for itself — same words, same order, same height; a lone leaf, another order or other words does not; three leaves moved rigidly together are a mapping, two moved far are not', () => {
  const mk = (kids, h = 100) => [HD, one(h, kids), FT(100 + h)]
  // (synthetic: the box around each leaf as the probe reads it — one box that lays its children in a row, at the same place on both sides)
  const f = (key, x, o = {}) => word(key, 110, { x, w: 200, h: 36, ab: [{ x: 0, y: 100, w: 1000, h: 100, row: true, cols: 2 }], ...o })
  const kinds = (S, P) => kindsOf(mk(S), mk(P), 200, 200).filter((k) => /^element-(missing|extra)$|^text-changed$/.test(k))
  assert.deepEqual(kinds([f('name', 0), f('email', 300), f('subject', 0, { y: 170 })], [f('name', 0, { w: 350 }), f('email', 450, { w: 350 }), f('subject', 0, { y: 170, w: 700 })]), [])
  // the first field unchanged and the second moved across with no width or gap measured to say why
  assert.ok(kinds([f('name', 0), f('email', 300)], [f('name', 0), f('email', 700)]).length > 0, 'moved with nothing measured')
  // the second field alone in its row on the port, moved across
  assert.ok(kinds([f('name', 0), f('email', 300)], [f('name', 0, { y: 170 }), f('email', 400)]).length > 0)
  // the row in another order, or with other words
  assert.ok(kinds([f('name', 0), f('email', 300)], [f('email', 0), f('name', 400)]).length > 0)
  assert.ok(kinds([f('name', 0), f('email', 300)], [f('name', 0), f('phone', 400)]).length > 0)
  // a menu pushed right by 237 px and up by 20: five leaves moved together are a rigid move; two are not
  const menu = (n, dx, dy) => ['one', 'about us', 'services', 'news', 'contact'].slice(0, n).map((k, i) => word(k, 120 + dy, { x: 30 + i * 100 + dx, w: 60, h: 21, y: 120 + dy + i * 0 }))
  assert.deepEqual(kinds(menu(5, 0, 0), menu(5, 237, -20)), [])
  assert.ok(kinds(menu(2, 0, 0), menu(2, 237, -20)).length > 0, 'two leaves moved far: not independently supported')
})

test('judgeHeights (synthetic readings): a row or a reflowed run counts only in a box the two sides share — no box read, or boxes at another left edge, is no evidence', () => {
  const mk = (kids) => [HD, one(100, kids), FT(200)]
  const f = (key, x, w, ab) => word(key, 110, { x, w, h: 36, ...(ab ? { ab: [ab] } : {}) })
  const box = (o = {}) => ({ x: 0, y: 100, w: 1000, h: 100, row: true, cols: 2, ...o })
  const miss = (S, P) => kindsOf(mk(S), mk(P), 300, 300).filter((k) => /^element-(missing|extra)$|^text-changed$/.test(k)).length
  const A = [f('name', 0, 200, box()), f('email', 300, 200, box())]
  const wide = (ab) => [f('name', 0, 350, ab), f('email', 450, 350, ab)]
  assert.equal(miss(A, wide(box())), 0)
  assert.ok(miss(A, wide(undefined)) > 0, 'no box read around the leaves')
  assert.ok(miss(A, wide(box({ x: 200 }))) > 0, 'a box at another left edge')
  // (a row is the leaves at one height, in boxes that start at the same left edge: the boxes' own tops may differ)
  assert.equal(miss(A, wide(box({ y: 80 }))), 0)
})

test('heights (browser): the fields of one row, wider on the port, are the same fields — through the probe; one dropped to its own row is not', async () => {
  const field = (w, name) => `<input type="text" placeholder="${name}" style="display:block;height:36px;width:${w}px;margin:0;border:1px solid #888">`
  const form = (w, wrap) => `<form style="margin:0"><div style="display:flex;${wrap ? 'flex-wrap:wrap;' : ''}gap:16px;width:760px">${field(w, 'Your name')}${field(w, 'Your email')}</div></form>`
  const page = (inner) => doc(PAGE(HEADER, sec('contact', 'Contact', inner, 'padding:10px 20px'), FOOTER()))
  const same = await heights({ port: { '/a': page(form(360)) }, source: { '/a': page(form(240)) }, widths: [1180] })
  assert.deepEqual(same.defects.heights.filter((d) => /^element-|text-changed/.test(d.kind)), [], JSON.stringify(same.defects.heights.map((d) => d.detail)))
  const dropped = await heights({ port: { '/a': page(form(500, true)) }, source: { '/a': page(form(240)) }, widths: [1180] })
  assert.ok(dropped.defects.heights.length > 0, 'the second field on its own row is a difference')
})

test('judgeHeights (synthetic readings): the letters a window cuts of a slide are a piece of what the paired, shifted slide says in full; confined to slides of paired containers', () => {
  // (synthetic: `sl` / `sc` / `sr` are the structure the probe reads around each leaf)
  const role = (t, x, sl, o = {}) => node({ sig: 'p.role', key: t, sq: t.replace(/[^a-z]/g, ''), x, y: 160, w: 280, h: 20, fx: 0, sl, sc: 1, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const slide = (t, x, sl, o = {}) => node({ sig: 'div.slide', key: t, x, y: 100, w: 280, h: 60, fx: 0, sl, sc: 1, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const k = (S, P) => kindsOf(S, P, 300, 300).filter((q) => /^element-|^text-changed/.test(q))
  const S = [HD, band([slide('alpha slide', 0, 's1', { comp: 1 }), role('role one', 0, 's1', { comp: 1 }), slide('beta slide', 300, 's2', { comp: 1 }), role('role two', 300, 's2', { comp: 1 }), slide('gamma slide', 600, 's3', { comp: 1 }), role('role thr', 600, 's3', { comp: 1, ink: { x: 600, y: 160, w: 60, h: 20, part: true } })]), FT(200)]
  const P = [HD, band([slide('beta slide', 0, 'p1'), role('role two', 0, 'p1'), slide('gamma slide', 300, 'p2'), role('role three', 300, 'p2'), slide('delta slide', 600, 'p3'), role('role four', 600, 'p3')]), FT(200)]
  assert.deepEqual(k(S, P), [])
  // the same cut leaf of a slide that no container pairs with is not matched
  const Q = [HD, band([slide('beta slide', 0, 'p1'), slide('gamma slide', 300, 'p2'), role('role three', 300, 'p9'), slide('delta slide', 600, 'p3')]), FT(200)]
  const jq = judgeHeights([cellRow(mkBands(S), mkBands(Q), 300, 300)])
  assert.ok(jq.defects.length > 0 || jq.notMeasured.length > 0, 'not quiet')
  // and the shifted slides themselves are only candidates in the first place
  assert.ok(judgeHeights([cellRow(mkBands(S), mkBands(P), 300, 300)]).notMeasured.length > 0)
})

test('heights (browser): every emitted visible leaf carries the structure around it — direct words, a background picture and the leaves of a folded subtree too', async () => {
  const many = Array.from({ length: 640 }, () => '<i style="display:block;height:2px"></i>').join('')
  const bg = `background:url(&quot;${PIC}&quot;) 0 0/10px 10px no-repeat`
  const body = `<img alt="" src="${PIC}" style="width:10px;height:10px"><div class="direct" style="height:60px">Direct own words<p style="margin:0">Child words</p></div><div class="covered" style="height:80px;width:300px;${bg}"><p style="margin:0">Over the cover</p></div>`
  const r = await probe(PAGE(HEADER, `<section class="plain"><h2 style="margin:0">Plain</h2>${body}</section><section class="folded"><h2 style="margin:0">Folded</h2>${many}<div><div class="direct" style="height:60px">Folded direct words<p style="margin:0">Folded child</p></div><div class="covered" style="height:80px;width:300px;${bg}"><p style="margin:0">Folded over cover</p></div></div></section>`, FOOTER()))
  const every = (n) => [...(n.k.length ? n.k.flatMap(every) : n.words || n.img ? [n] : []), ...(n.dl ?? []).flatMap(every)]
  for (const head of ['plain', 'folded']) {
    const leaves = every(r.bands.find((b) => b.tree.head === head).tree).filter((l) => l.words || l.img)
    const direct = leaves.filter((l) => l.dw)
    const covers = leaves.filter((l) => l.t === '#bg')
    assert.ok(direct.length >= 1 && covers.length >= 1, `${head}: direct ${direct.length}, covers ${covers.length}`)
    for (const l of leaves.filter((x) => x.dw || x.t === '#bg' || x.words)) assert.ok(Array.isArray(l.ab) && l.ab.length > 0, `${head}: ${l.sig} ${l.tx} has no ancestry`)
  }
})

test('judgeHeights (synthetic readings): slides are paired whole — a slide whose title is paired is the same slide, so a caption that changed is a finding; two slides with no leaf paired are the carousel state', () => {
  // (synthetic: `sl` / `sc` / `sr` are the structure the probe reads around each leaf)
  const part = (key, x, y, sl, o = {}) => node({ sig: 'p.part', key, x, y, w: 280, h: 30, fx: 0, sl, sc: 1, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const k = (S, P) => kindsOf(S, P, 300, 300).filter((q) => /^element-|^text-changed/.test(q))
  const S = (cap) => [HD, band([part('title one', 0, 100, 's1', { comp: 1 }), part(cap, 0, 150, 's1', { comp: 1 })]), FT(200)]
  const P = (title, cap) => [HD, band([part(title, 0, 100, 'p1'), part(cap, 0, 150, 'p1')]), FT(200)]
  assert.ok(k(S('old caption words'), P('title one', 'new caption words')).length > 0, 'the title is paired: the caption is compared')
  assert.deepEqual(k(S('old caption words'), P('title two', 'new caption words')), [], 'no leaf paired: another slide in the same slot')
})

test('judgeHeights (synthetic readings): a whole row moved across inside its box, with no change of the box or of the cells before it, is a finding', () => {
  const mk = (kids) => [HD, one(100, kids), FT(200)]
  const f = (key, x, w) => word(key, 110, { x, w, h: 36, ab: [{ x: 0, y: 100, w: 1000, h: 100, row: true, cols: 2 }] })
  const miss = (S, P) => kindsOf(mk(S), mk(P), 300, 300).filter((k) => /^element-(missing|extra)$|^text-changed$/.test(k)).length
  const A = [f('name', 0, 200), f('email', 300, 200)]
  assert.equal(miss(A, [f('name', 0, 350), f('email', 450, 350)]), 0)
  assert.ok(miss(A, [f('name', 250, 350), f('email', 700, 350)]) > 0, 'the whole row 250 px to the right')
})

test('judgeHeights (synthetic readings): a reflowed run needs cells that fit the holder\'s column count and keep the leaf in its cell; a carousel slide that stands elsewhere is paired by its own words, so its changed caption is a finding', () => {
  const mk = (kids, h = 200) => [HD, one(h, kids), FT(100 + h)]
  const miss = (S, P) => kindsOf(mk(S), mk(P), 300, 300).filter((k) => /^element-(missing|extra)$|^text-changed$/.test(k)).length
  const f = (key, x, y, cols, o = {}) => word(key, y, { x, y, w: 200, h: 36, ab: [{ x: 0, y: 100, w: 1000, h: 200, row: true, cols }], ...o })
  const w = { w: 150 }
  const A = [f('one', 0, 110, 5, w), f('two', 190, 110, 5, w), f('three', 380, 110, 5, w), f('four', 570, 110, 5, w), f('five', 760, 110, 5, w)]
  // synthetic: five cells wrapped at two columns on the port
  assert.equal(miss(A, [f('one', 0, 110, 2, w), f('two', 190, 110, 2, w), f('three', 0, 170, 2, w), f('four', 190, 170, 2, w), f('five', 0, 230, 2, w)]), 0)
  // the port says two columns but lays three in one row: the column count does not explain it
  assert.ok(miss(A, [f('one', 0, 110, 2, w), f('two', 190, 110, 2, w), f('three', 0, 170, 2, w), f('four', 190, 170, 2, w), f('five', 330, 170, 2, w)]) > 0)
  // (synthetic: `sl` / `sc` / `sr` are the structure the probe reads around each leaf)
  const part = (key, x, y, sl, o = {}) => node({ sig: 'p.part', key, x, y, w: 280, h: 30, fx: 0, sl, sc: 1, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const k = (S, P) => kindsOf(S, P, 300, 300).filter((q) => /^element-|^text-changed/.test(q))
  const S = (cap) => [HD, band([part('title a', 0, 100, 's1', { comp: 1 }), part('cap a', 0, 150, 's1', { comp: 1 }), part('title b', 300, 100, 's2', { comp: 1 }), part(cap, 300, 150, 's2', { comp: 1 })]), FT(200)]
  const P = (cap, y = 150) => [HD, band([part('title b', 0, 100, 'p1'), part(cap, 0, y, 'p1'), part('title c', 300, 100, 'p2'), part('cap c', 300, 150, 'p2')]), FT(200)]
  assert.deepEqual(k(S('cap b'), P('cap b')), [], 'the carousel advanced one slide')
  // (the slide that moved is a candidate pair only: its caption that changed is not matched, and is said as not measured — never quiet)
  const nm = (S, P) => judgeHeights([cellRow(mkBands(S), mkBands(P), 300, 300)]).notMeasured.map((n) => n.cause)
  assert.ok(nm(S('cap b'), P('cap b changed', 165)).includes('slide-pair-unproven'), 'the caption of the slide that moved changed')
  assert.ok(nm(S('cap b'), P('cap b')).includes('slide-pair-unproven'), 'the advance itself is a candidate, said as not measured')
})

// ---- reflow and carousel correspondence is never concluded: candidates are said as not measured --------------------------------

/** The verdict of one synthetic cell the three ways the tool states it: the judge, the settled cell and `--explain` (exit and closing line). */
const stated = async (S, P, docS, docP) => {
  const row = cellRow(mkBands(S), mkBands(P), docS, docP)
  const j = judgeHeights([row])
  const cell = settleHeightCells(j)[0]
  const out = []
  const exit = await runExplain({ route: '/a', width: 1024, resolve: async () => ({ path: '/a', sourceUrl: 'http://s.test/a' }), withBrowser: (f) => f({}), measure: async () => ({ rows: [row], owed: [] }), print: (l) => out.push(l) })
  return { j, status: cell.status, exit, causes: j.notMeasured.map((n) => n.cause), kinds: j.defects.map((d) => d.kind), out }
}
const quietNot = (r) => assert.ok(r.status !== 'ok' && r.exit !== 0 && (r.j.defects.length || r.j.notMeasured.length), `quiet: ${JSON.stringify({ s: r.status, e: r.exit })}`)

test('judgeHeights (synthetic readings): a reflowed run is a candidate, not a match — not measured as reflow-position-unproven, in the cell, the settled status and --explain (3); shifted across it is the same', async () => {
  const mk = (kids) => [HD, one(200, kids), FT(300)]
  const f = (key, x, y, cols) => word(key, y, { x, y, w: 150, h: 36, ab: [{ x: 0, y: 100, w: 1000, h: 200, row: true, cols }] })
  const A = [f('one', 0, 110, 5), f('two', 190, 110, 5), f('three', 380, 110, 5), f('four', 570, 110, 5), f('five', 760, 110, 5)]
  const wrapped = (dx) => [f('one', dx, 110, 2), f('two', 190 + dx, 110, 2), f('three', dx, 170, 2), f('four', 190 + dx, 170, 2), f('five', dx, 230, 2)]
  const r = await stated(mk(A), mk(wrapped(0)), 400, 400)
  assert.ok(r.causes.includes('reflow-position-unproven'), JSON.stringify(r.j.notMeasured))
  assert.deepEqual(r.kinds.filter((k) => /^element-|text-changed/.test(k)), [])
  assert.deepEqual([r.status, r.exit], ['not-measured', 3])
  assert.match(r.out.join('\n'), /reflow-position-unproven/)
  // the whole run shifted 300 px across inside its holder: neither matched nor quiet
  quietNot(await stated(mk(A), mk(wrapped(300)), 400, 400))
  // the same content at the same place: quiet
  const same = await stated(mk(A), mk(A), 400, 400)
  assert.deepEqual([same.status, same.exit, same.causes], ['ok', 0, []])
})

test('judgeHeights (synthetic readings): a carousel is never concluded to correspond — a slot, equal words in another phase or in another container are candidates (slide-pair-unproven); a slide with no counterpart is a finding', async () => {
  // (synthetic: `sl` / `sc` / `sr` are the structure the probe reads around each leaf)
  const part = (key, x, y, sl, sc, o = {}) => node({ sig: 'p.part', key, x, y, w: 280, h: 30, fx: 0, sl, sc, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const mk = (kids) => [HD, band(kids), FT(200)]
  const S = (...kids) => mk(kids)
  // all the words of the slide in the same cell replaced: the slot is a candidate only
  const replaced = await stated(S(part('alpha title', 0, 100, 's1', 1, { comp: 1 }), part('alpha caption', 0, 150, 's1', 1, { comp: 1 })), mk([part('zeta title', 0, 100, 'p1', 1), part('zeta caption', 0, 150, 'p1', 1)]), 300, 300)
  assert.ok(replaced.causes.includes('slide-pair-unproven'), JSON.stringify(replaced.j.notMeasured))
  assert.deepEqual([replaced.status, replaced.exit, replaced.kinds.filter((k) => /^element-/.test(k))], ['not-measured', 3, []])
  // the source shows A and B, the port only A, displaced: B has no counterpart
  const two = S(part('alpha title', 0, 100, 's1', 1, { comp: 1 }), part('beta title', 300, 100, 's2', 1, { comp: 1 }))
  const shiftedA = await stated(two, mk([part('alpha title', 300, 100, 'p1', 1)]), 300, 300)
  quietNot(shiftedA)
  assert.ok(shiftedA.kinds.includes('element-missing') || shiftedA.causes.includes('slide-pair-unproven'), JSON.stringify([shiftedA.kinds, shiftedA.causes]))
  // a caption moved inside a slide whose title stands in the same cell
  const moved = await stated(S(part('alpha title', 0, 100, 's1', 1, { comp: 1 }), part('alpha caption', 0, 150, 's1', 1, { comp: 1 })), mk([part('alpha title', 0, 100, 'p1', 1), part('alpha caption', 0, 180, 'p1', 1)]), 300, 300)
  quietNot(moved)
  // the same words in carousels of different containers, at other places: neither matched nor quiet
  const other = await stated(S(part('alpha title', 0, 100, 's1', 1, { comp: 1 })), mk([part('alpha title', 400, 100, 'p1', 9)]), 300, 300)
  quietNot(other)
  assert.ok(!other.kinds.includes('text-changed'))
  // the same carousel at the same place and words: quiet
  const same = await stated(S(part('alpha title', 0, 100, 's1', 1, { comp: 1 })), mk([part('alpha title', 0, 100, 'p1', 1)]), 300, 300)
  assert.deepEqual([same.status, same.exit], ['ok', 0])
})

test('judgeHeights (synthetic readings): a cut leaf is matched only inside the slide pair that a measured place pairs; a slide shifted by its container is not that pair', async () => {
  const role = (t, x, sl, sc, o = {}) => node({ sig: 'p.role', key: t, sq: t.replace(/[^a-z]/g, ''), x, y: 160, w: 280, h: 20, fx: 0, sl, sc, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const slide = (t, x, sl, sc, o = {}) => node({ sig: 'div.slide', key: t, x, y: 100, w: 280, h: 60, fx: 0, sl, sc, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const cut = role('role thr', 600, 's3', 1, { comp: 1, ink: { x: 600, y: 160, w: 60, h: 20, part: true } })
  const S = [HD, band([slide('alpha slide', 0, 's1', 1, { comp: 1 }), slide('gamma slide', 600, 's3', 1, { comp: 1 }), cut]), FT(200)]
  // the leaf that says the cut one in full stands in the slide of another title: the wrong slide pair
  const P = [HD, band([slide('gamma slide', 0, 'p1', 1), slide('delta slide', 300, 'p2', 1), role('role three', 300, 'p2', 1)]), FT(200)]
  const r = await stated(S, P, 300, 300)
  quietNot(r)
  assert.ok(r.j.defects.length > 0 || r.j.notMeasured.some((n) => /role ?thr/i.test(n.detail)), 'the cut leaf is not matched against another slide: it is a finding or said as not measured')
})

test('judgeHeights (synthetic readings): a cell that is uncertain and has a content or logo defect is a defect — the uncertainty stays beside it, in the judge, the settled cell and --explain (1)', async () => {
  const part = (key, x, y, sl, sc, o = {}) => node({ sig: 'p.part', key, x, y, w: 280, h: 30, fx: 0, sl, sc, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const note = word('delivery note words', 250, { h: 24 })
  const band = (kids) => ['one', 200, undefined, 100, { k: kids }]
  const S = [HD, band([part('alpha title', 0, 100, 's1', 1, { comp: 1 }), part('alpha caption', 0, 150, 's1', 1, { comp: 1 }), note]), FT(300)]
  const P = [HD, band([part('zeta title', 0, 100, 'p1', 1), part('zeta caption', 0, 150, 'p1', 1)]), FT(300)]
  const r = await stated(S, P, 400, 400)
  assert.ok(r.causes.includes('slide-pair-unproven'), JSON.stringify(r.j.notMeasured))
  assert.ok(r.kinds.includes('element-missing'), 'the note is a finding of the same band')
  assert.deepEqual([r.status, r.exit], ['defect', 1])
  assert.doesNotMatch(r.out[r.out.length - 1], /could not decide/)
})

test('judgeHeights (synthetic readings): a displacement pairs leaves only through an anchored container — one element holding the same leaves on each side, alone in its kind, as large on both sides; an anonymous box or leaves that moved together are not an anchor', async () => {
  // (synthetic: `ab` is the chain of boxes the probe reads around each leaf, nearest first, with the element of each)
  const mk = (kids, y = 100) => [HD, one(100, kids, y), FT(y + 100)]
  const box = (o = {}) => ({ tag: 'ul', x: 100, y: 100, w: 500, h: 40, ...o })
  const row = (dx, o = {}) => {
    const b = box({ x: 100 + dx, ...(o.box ?? {}) })
    const at = (t, x, w = 80) => word(t, 110, { x: x + dx + (o.inner ?? 0), y: o.y ?? 110, w, h: 24, ab: [b, { tag: 'div', x: 0, y: 100, w: 700, h: 100 }], ...(o.leaf ?? {}) })
    return [at('first item', 100), at('second item', 200), at(o.third ?? 'third item', 300)]
  }
  const state = async (S, P, ys = [100, 100]) => {
    const r = await stated(mk(S, ys[0]), mk(P, ys[1]), 300, 300)
    return [r.status, r.exit, r.causes.join(','), r.kinds.join(',')].join('|')
  }
  assert.equal(await state(row(0), row(0)), 'ok|0||')
  // a list pushed 13 px across by its neighbour: the one box holds the same leaves, as large, and the leaves keep their places in it
  assert.equal(await state(row(0), row(13)), 'ok|0||')
  // too far across for a box to carry (more than a fifth of the width, and than 64 px)
  assert.notEqual(await state(row(0), row(300)), 'ok|0||')
  // the box is an anonymous one: no element says what it is
  const anon = (dx, n = 3) => row(dx).slice(0, n).map((l) => ({ ...l, ab: [{ ...l.ab[0], tag: 'div' }, l.ab[1]] }))
  // (two leaves: no landmark and too few leaves to be told by their content; they are the same words moved, which is a finding)
  assert.notEqual(await state(anon(0, 2), anon(13, 2)), 'ok|0||')
  // three leaves of one box are told by their content whatever the element: the same box, as large, carries them
  assert.equal(await state(anon(0), anon(13)), 'ok|0||')
  // the leaves did not keep their places in the box
  assert.notEqual(await state(row(0), row(13, { inner: 40 })), 'ok|0||')
  // the box is not as large on both sides
  assert.notEqual(await state(row(0), row(13, { box: { w: 560 } })), 'ok|0||')
  // the box holds other leaves on the port: it is not the same element
  assert.notEqual(await state(row(0), row(13, { third: 'third things' })), 'ok|0||')
  // two boxes of that kind with the same leaves on one side: which is which is not proven
  const twice = [...row(0), ...row(0).map((l) => ({ ...l, y: 140, ab: [{ ...l.ab[0], y: 140 }, l.ab[1]] }))]
  assert.notEqual(await state(twice, [...row(13), ...row(13).map((l) => ({ ...l, y: 140, ab: [{ ...l.ab[0], y: 140 }, l.ab[1]] }))]), 'ok|0||')
  // the box moved down by neither the page's own place nor the band's: not carried
  assert.notEqual(await state(row(0), row(0, { y: 150, box: { y: 150 } })), 'ok|0||')
  // a carousel's slides are never matched through a box
  const slide = (dx) => row(dx).map((l) => ({ ...l, sl: 's', sc: 1, comp: 1, sr: { x: 100 + dx, y: 100, w: 500, h: 40 } }))
  assert.notEqual(await state(slide(0), slide(13)), 'ok|0||')
})

test('judgeHeights (synthetic readings): a band that starts higher on one side, its form at the same page coordinates, is matched through the form; an anonymous box or a form of another size is not', async () => {
  const form = (o = {}) => {
    const b = { tag: 'form', x: 100, y: 200, w: 300, h: 120, ...o }
    return ['user name', 'secret word', 'send now'].map((t, i) => word(t, 200 + 40 * i, { x: 100, w: 300, h: 24, ab: [b, { tag: 'div', x: 100, y: 200, w: 300, h: 120 }] }))
  }
  // the bands start 25 px apart (the one above the band differs); the leaves stand at the same page coordinates
  const S = (kids) => [HD, one(300, kids, 100), FT(400)]
  const P = (kids) => [HD, one(325, kids, 75), FT(400)]
  const missing = (r) => r.j.defects.filter((d) => /^element-(missing|extra)$/.test(d.kind))
  const r = await stated(S(form()), P(form()), 500, 500)
  assert.equal(missing(r).length, 0, JSON.stringify(r.j.defects.map((d) => [d.kind, d.detail])))
  assert.ok(!r.causes.includes('shift-position-unproven'), r.causes.join())
  const anon = (o) => form(o).map((l) => ({ ...l, ab: [{ ...l.ab[0], tag: 'div' }, l.ab[1]] }))
  const a = await stated(S(anon()), P(anon()), 500, 500)
  quietNot(a)
  const small = await stated(S(form()), P(form({ h: 150 })), 500, 500)
  quietNot(small)
})

test('heights (browser): the structure around a leaf names its element — and a list pushed across by its neighbour is matched through the list, which a row of plain boxes is not', async () => {
  const menu = (tag, pad) => `<${tag === 'ul' ? 'ul' : 'div'} class="items" style="display:flex;list-style:none;margin:0;padding:0">${['alpha page', 'beta page', 'gamma page'].slice(0, tag === 'ul' ? 3 : 2).map((t) => `<${tag === 'ul' ? 'li' : 'div'} style="padding:0 12px">${t}</${tag === 'ul' ? 'li' : 'div'}>`).join('')}</${tag === 'ul' ? 'ul' : 'div'}>`
  const band = (tag, pad) => sec('top', 'Menu', `<div style="display:flex"><div style="width:${pad}px;flex:none"><i style="display:block;height:24px"></i></div>${menu(tag)}</div>`)
  const page = (tag, pad) => doc(PAGE(HEADER, band(tag, pad), FOOTER()))
  const r = await probe(PAGE(HEADER, band('ul', 80), FOOTER()))
  const top = r.bands.find((b) => everyNode(b.tree).some((n) => /alpha page/.test(n.key ?? '')))
  const alpha = everyNode(top.tree).find((n) => n.tx === 'alphapage')
  assert.ok(alpha?.ab?.some((q) => q.tag === 'ul'), JSON.stringify(alpha?.ab))
  const same = await heights({ port: { '/a': page('ul', 80) }, source: { '/a': page('ul', 80) }, widths: [1180] })
  assert.deepEqual(defectKinds(same), [])
  const moved = await heights({ port: { '/a': page('ul', 96) }, source: { '/a': page('ul', 80) }, widths: [1180] })
  assert.ok(!moved.defects.heights.some((d) => /^element-/.test(d.kind)), defectKinds(moved).join())
  assert.equal((moved.notMeasured?.heights ?? []).length, 0, JSON.stringify(moved.notMeasured?.heights))
  // two plain boxes: nothing says they are the same element, so the move is not carried (the words that moved are a finding)
  const plain = await heights({ port: { '/a': page('div', 96) }, source: { '/a': page('div', 80) }, widths: [1180] })
  assert.ok(plain.defects.heights.length > 0 || (plain.notMeasured?.heights ?? []).length > 0, 'a row of plain boxes pushed across is not quiet')
})

test('judgeHeights (synthetic readings): a leaf matched through its box and found elsewhere is the finding element-moved — in the judge, the settled cell and --explain (1); equal words that more leaves have stay not measured (3)', async () => {
  const box = (dx = 0, o = {}) => ({ tag: 'ul', x: 100 + dx, y: 100, w: 500, h: 40, ...o })
  const item = (t, x, b, o = {}) => word(t, 110, { x, w: 80, h: 24, ab: [b, { tag: 'div', x: 0, y: 100, w: 700, h: 100 }], ...o })
  const mk = (kids) => [HD, one(100, kids), FT(200)]
  const list = (dx) => [item('first item', 100 + dx, box(dx)), item('second item', 200 + dx, box(dx)), item('third item', 300 + dx, box(dx))]
  // the whole list stands 300 px across: the same element on both sides, so its leaves are the same leaves and the move is told
  const far = await stated(mk(list(0)), mk(list(300)), 300, 300)
  assert.deepEqual([far.status, far.exit], ['defect', 1])
  assert.ok(far.kinds.includes('element-moved') && !far.kinds.includes('element-missing'), far.kinds.join())
  // a box of zero height around them is no box: the list is still told by the box that holds it
  const flat = (dx) => list(dx).map((l) => ({ ...l, ab: [l.ab[0], { tag: 'div', x: 0, y: 100, w: 992, h: 0 }, l.ab[1]] }))
  assert.equal(((await stated(mk(flat(0)), mk(flat(13)), 300, 300)).status), 'ok')
  // the same words on three leaves of each side, one moved: nothing says which is which — not measured, never quiet
  const twin = (x1, x2, x3) => [item('same words', x1, null), item('same words', x2, null), item('same words', x3, null)].map((l) => ({ ...l, ab: undefined }))
  const t = await stated(mk(twin(100, 250, 400)), mk(twin(100, 250, 450)), 300, 300)
  assert.notEqual(t.status, 'ok')
  assert.notDeepEqual(t.kinds.filter((k) => k === 'element-moved'), ['element-moved'])
})

test('heights (browser): an svg clipped to a stripe narrower than a CSS pixel is not taken for empty — it is a picture, or its ink is said as not established; a clip of nothing is none', async () => {
  const clipped = (h, y, id) => `<svg width="120" height="120" style="display:block"><clipPath id="${id}"><rect x="0" y="${y}" width="120" height="${h}"/></clipPath><rect width="120" height="120" fill="red" clip-path="url(#${id})"/></svg>`
  for (const [h, y] of [[0.3, 59.55], [0.1, 59.95], [0.04, 60.48]]) {
    const r = await probe(PAGE(HEADER, sec('thin', 'Thin', `<div>${clipped(h, y, 't')}</div>`), FOOTER()))
    const pics = leavesIn(r.bands.find((b) => b.tree.head === 'thin').tree).filter((l) => l.img)
    assert.equal(pics.length, 1, `a ${h}px stripe at ${y} is read as a picture or as unproven ink`)
  }
  const none = await probe(PAGE(HEADER, sec('thin', 'Thin', `<div>${clipped(0, 59, 'z')}</div>`), FOOTER()))
  assert.equal(leavesIn(none.bands.find((b) => b.tree.head === 'thin').tree).filter((l) => l.img).length, 0)
})

test('judgeHeights (synthetic readings): a matched leaf outside a carousel witnesses nothing for a slide — its shifted leaf stays slide-pair-unproven, and the slide pair is not proven by it', async () => {
  const part = (key, x, sl, sc, o = {}) => node({ sig: 'p.part', key, x, y: 150, w: 200, h: 30, fx: 0, sl, sc, sr: { x, y: 100, w: 280, h: 100 }, ...o })
  const plain = (dx) => word('plain words here', 110, { x: dx, w: 150, h: 24 })
  const band = (kids) => ['one', 200, undefined, 100, { k: kids }]
  const S = [HD, band([plain(0), part('slide words', 0, 's1', 1, { comp: 1 })]), FT(300)]
  const P = [HD, band([plain(0), part('slide words', 280, 'p1', 1)]), FT(300)]
  const r = await stated(S, P, 400, 400)
  assert.ok(r.causes.includes('slide-pair-unproven'), JSON.stringify(r.j.notMeasured))
  quietNot(r)
  const same = await stated(S, [HD, band([plain(0), part('slide words', 0, 'p1', 1)]), FT(300)], 400, 400)
  assert.deepEqual([same.status, same.exit], ['ok', 0])
})

test('heights (browser): a copy of a carousel slide is judged on everything it shows — direct words and a backdrop beside its children count; a copy with other words stays, an identical one goes', async () => {
  // (a slide nested deeper than the probe reads: it folds the subtree, and the words beside the children of a folded box stand in its `dl`)
  const deep = (inner) => '<div>'.repeat(14) + inner + '</div>'.repeat(14)
  const slide = (cls, words, kid) => `<div class="slide ${cls}" style="width:300px;flex:none">${deep(`<div class="inner">${words}<p style="margin:0">${kid}</p></div>`)}</div>`
  const page = (copy) => doc(PAGE(HEADER, sec('s', 'Slides', `<div class="slick-slider"><div class="slick-track" style="display:flex">${slide('a', 'Alpha direct words', 'shared child')}${copy}</div></div>`), FOOTER()))
  const source = page('')
  const same = await heights({ port: { '/a': page(slide('slick-cloned', 'Alpha direct words', 'shared child')) }, source: { '/a': source }, widths: [1180] })
  assert.deepEqual(same.defects.heights.filter((d) => /^element-|text-changed/.test(d.kind)), [], 'an identical copy is removed')
  const other = await heights({ port: { '/a': page(slide('slick-cloned', 'Beta other words', 'shared child')) }, source: { '/a': source }, widths: [1180] })
  assert.ok(other.defects.heights.some((d) => /^element-extra$/.test(d.kind)), JSON.stringify(other.defects.heights.map((d) => d.kind)))
})

test('heights (browser): a speck of a clip that no sampling grid reaches is unproven ink, never empty — alone, and beside a shape that is plainly painted; a clip with no area is none', async () => {
  const clip = (id, x, y, w, h) => `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`
  const speck = (id) => `${clip(id, 37.6, 41.35, 0.05, 0.05)}<rect width="120" height="120" fill="red" clip-path="url(#${id})"/>`
  const svg = (inner) => `<svg width="120" height="120" style="display:block">${inner}</svg>`
  const r = await probe(PAGE(HEADER, sec('speck', 'Speck', `<div>${svg(speck('s1'))}</div><div class="both">${svg(`<rect width="20" height="20" fill="blue"/>${speck('s2')}`)}</div><div class="empty">${svg(`${clip('e', 10, 10, 0, 0)}<rect width="120" height="120" fill="red" clip-path="url(#e)"/>`)}</div>`), FOOTER()))
  const pics = leavesIn(r.bands.find((b) => b.tree.head === 'speck').tree).filter((l) => l.img)
  assert.equal(pics.length, 2, 'the speck alone and the drawing beside a plain shape are pictures; the empty clip is none: ' + JSON.stringify(pics.map((l) => [l.sig, l.y, l.unk, l.as])))
  assert.ok(pics.every((l) => l.unk === 1 && /^unproven:/.test(l.as)), JSON.stringify(pics.map((l) => [l.unk, l.as])))
  const j = await heights({ port: { '/a': doc(PAGE(HEADER, sec('speck', 'Speck', svg(speck('s1'))), FOOTER())) }, source: { '/a': doc(PAGE(HEADER, sec('speck', 'Speck', svg(speck('s1'))), FOOTER())) }, widths: [1180] })
  assert.ok(j.notMeasured.heights.some((n) => n.cause === 'ink-not-established'), JSON.stringify(j.notMeasured))
})

test('judgeHeights (synthetic readings): pictures and repeated words are the same leaf moved only when the other is the clear nearest — at least a third nearer than any other; two equally near are not measured, never quiet', async () => {
  const mk = (kids) => [HD, one(400, kids), FT(500)]
  const p = (x, y, s = 100) => pic(y, { x, y, w: s, h: s, img: { w: s, h: s } })
  // two pictures, each moved by 30 px and 400 px apart: each is the nearest of the other's side by far
  const clear = await stated(mk([p(0, 110), p(500, 110)]), mk([p(30, 110), p(530, 110)]), 600, 600)
  assert.ok(clear.kinds.includes('element-moved') && !clear.kinds.includes('element-missing'), clear.kinds.join())
  assert.deepEqual([clear.status, clear.exit], ['defect', 1])
  // two pictures on the source, one on the port between them: equally near
  const between = await stated(mk([p(0, 110), p(120, 110)]), mk([p(60, 110)]), 600, 600)
  assert.ok(!between.kinds.includes('element-moved'), between.kinds.join())
  assert.notEqual(between.status, 'ok')
})

test('heights (browser): a clip moved by a CSS transform into the shape is not proven empty — the svg stays a picture or unproven ink; the same clip left where it is, wholly beside the shape, is none', async () => {
  const svg = (style) => `<svg width="120" height="120" style="display:block"><clipPath id="m"><rect x="200" y="200" width="30" height="30" style="${style}"/></clipPath><rect width="120" height="120" fill="red" clip-path="url(#m)"/></svg>`
  const r = await probe(PAGE(HEADER, sec('moved', 'Moved', `<div>${svg('transform:translate(-170px,-170px)')}</div>`), FOOTER()))
  assert.equal(leavesIn(r.bands.find((b) => b.tree.head === 'moved').tree).filter((l) => l.img).length, 1, 'the clip lands on the shape: it is not empty')
  const away = await probe(PAGE(HEADER, sec('moved', 'Moved', `<div>${svg('')}</div>`), FOOTER()))
  assert.equal(leavesIn(away.bands.find((b) => b.tree.head === 'moved').tree).filter((l) => l.img).length, 0)
})

test('judgeHeights (synthetic readings): containers and slides pair one to one — leaves matched at their own place from two containers of the other side pair neither, so a cut leaf is not matched through them', async () => {
  const part = (t, x, sl, sc, o = {}) => node({ sig: 'p.part', key: t, sq: t.replace(/[^a-z]/g, ''), x, y: 160, w: 280, h: 20, fx: 0, sl, sc, sr: { x, y: 100, w: 280, h: 100 }, comp: 1, ...o })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const cut = part('role thr', 600, 's3', 1, { ink: { x: 600, y: 160, w: 60, h: 20, part: true } })
  // the source holds three slides of one container; the port's leaves at the same places belong to two other containers
  const S = [HD, band([part('alpha slide', 0, 's1', 1), part('beta slide', 300, 's2', 1), cut]), FT(200)]
  const P = [HD, band([part('alpha slide', 0, 'p1', 7), part('beta slide', 300, 'p2', 8), part('role three', 600, 'p3', 8)]), FT(200)]
  const r = await stated(S, P, 300, 300)
  quietNot(r)
  assert.ok(r.j.defects.length > 0 || r.j.notMeasured.some((n) => /role ?thr/i.test(n.detail)), 'the cut leaf is not matched through containers that are not paired one to one')
  // the same leaves of ONE container on each side pair it, and the cut leaf is the paired slide's
  const P1 = [HD, band([part('alpha slide', 0, 'p1', 7), part('beta slide', 300, 'p2', 7), part('role three', 600, 'p3', 7)]), FT(200)]
  const ok = await stated(S, P1, 300, 300)
  assert.ok(!ok.kinds.some((k) => /^element-(missing|extra)$/.test(k)), ok.kinds.join())
})

test('heights (browser): a clip is placed in the space of the element that carries it — a CSS translate on its part, a transform on a box between the shape and the carrier or on the clipPath never prove it empty', async () => {
  const wrap = (inner) => `<svg width="120" height="120" style="display:block">${inner}</svg>`
  const count = async (inner) => {
    const r = await probe(PAGE(HEADER, sec('placed', 'Placed', `<div>${wrap(inner)}</div>`), FOOTER()))
    return leavesIn(r.bands.find((b) => b.tree.head === 'placed').tree).filter((l) => l.img).length
  }
  const part = (style = '') => `<rect x="100" y="100" width="20" height="20" style="${style}"/>`
  // (the individual CSS properties, which the computed `transform` does not carry)
  assert.equal(await count(`<clipPath id="c">${part('translate:-90px -90px')}</clipPath><rect width="120" height="120" fill="red" clip-path="url(#c)"/>`), 1, 'translate on the part')
  // (the shape sits in a box that moves it into the clip, the clip is on the box around)
  assert.equal(await count(`<clipPath id="c">${part()}</clipPath><g clip-path="url(#c)"><g style="transform:translate(100px,100px)"><rect width="20" height="20" fill="red"/></g></g>`), 1, 'transform on a box between')
  assert.equal(await count(`<clipPath id="c">${part()}</clipPath><g clip-path="url(#c)"><g transform="translate(100 100)"><rect width="20" height="20" fill="red"/></g></g>`), 1, 'transform attribute on a box between')
  // (the clipPath itself moved)
  assert.equal(await count(`<clipPath id="c" style="transform:translate(-90px,-90px)">${part()}</clipPath><rect width="120" height="120" fill="red" clip-path="url(#c)"/>`), 1, 'transform on the clipPath')
  // controls: the same clip left in place, wholly beside the shape, is none — also with a box between that carries no transform
  // (a transformed shape inside a group of the clip: the group's box does not say where it ends up)
  assert.equal(await count(`<clipPath id="c"><g><rect x="0" y="0" width="20" height="20" style="transform:translate(100px,100px)"/></g></clipPath><rect width="120" height="120" fill="red" clip-path="url(#c)"/>`), 1, 'transform on a shape nested in the clip part')
  assert.equal(await count(`<clipPath id="c"><g><rect x="200" y="200" width="20" height="20"/></g></clipPath><rect width="20" height="20" fill="red" clip-path="url(#c)"/>`), 0, 'untransformed nested part, disjoint')
  assert.equal(await count(`<clipPath id="c">${part()}</clipPath><g clip-path="url(#c)"><g><rect width="20" height="20" fill="red"/></g></g>`), 0, 'untransformed disjoint')
  assert.equal(await count(`<clipPath id="c"><rect x="10" y="10" width="0" height="0"/></clipPath><rect width="120" height="120" fill="red" clip-path="url(#c)"/>`), 0, 'a clip with no area')
})

test('judgeHeights (synthetic readings): a following band never proves the bottom of the band before it — equal landmark keys, equal headings and equal bottom offsets leave a displaced leaf a finding', async () => {
  const lead = word('first line stays', 110)
  const moved = (y) => word('displaced line words', y)
  const foot = (y, words) => ['FOOT', 100, 'footer', y, { k: [lf(words, y, 100)] }]
  const mk = (y, h, next) => [HD, one(h, [lead, moved(y)]), next]
  const run = async (S, P, ds, dp) => {
    const r = await stated(S, P, ds, dp)
    return { r, own: r.kinds.filter((k) => /^element-/.test(k)) }
  }
  // the same footer landmark and words, the leaf 40 px lower in a band 40 px taller: stays a finding
  const same = await run(mk(290, 300, foot(300, 'end')), mk(330, 340, foot(340, 'end')), 400, 440)
  assert.ok(same.own.length > 0, same.r.kinds.join())
  // the footer's landmark is equal but it shows other words: no edge either
  const other = await run(mk(290, 300, foot(300, 'end')), mk(330, 340, foot(340, 'another closing line')), 400, 440)
  assert.ok(other.own.length > 0, other.r.kinds.join())
  assert.notEqual(other.r.status, 'ok')
  // a band after with the same heading and other body words, and another gap to it
  const S = [HD, one(300, [lead, moved(290)]), ['two', 100, undefined, 300, { k: [word('shared heading', 300), word('body one words', 340)] }], FT(400)]
  const P = [HD, one(340, [lead, moved(330)]), ['two', 100, undefined, 340, { k: [word('shared heading', 340), word('body two words', 380)] }], FT(440)]
  const heading = await run(S, P, 500, 540)
  assert.ok(heading.own.length > 0 || heading.r.causes.length > 0, heading.r.kinds.join())
  assert.notEqual(heading.r.status, 'ok')
})

test('judgeHeights (synthetic readings): a leaf matched at its place names its container and slide only where the boxes agree — a slide of another width is not the pair a cut leaf is matched through', async () => {
  const cutFor = (sr) => node({ sig: 'p.role', key: 'role thr', sq: 'rolethr', x: 0, y: 160, w: 280, h: 20, fx: 0, sl: 's1', sc: 1, sr, comp: 1, ink: { x: 0, y: 160, w: 60, h: 20, part: true } })
  const title = (x, sl, sc, sr, o = {}) => node({ sig: 'p.title', key: 'alpha title', x, y: 100, w: 280, h: 30, fx: 0, sl, sc, sr, ...o })
  const full = (x, sl, sc, sr) => node({ sig: 'p.role', key: 'role three', sq: 'rolethree', x, y: 160, w: 280, h: 20, fx: 0, sl, sc, sr })
  const band = (kids) => ['one', 100, undefined, 100, { k: kids }]
  const box = { x: 0, y: 100, w: 280, h: 100 }
  const S = [HD, band([title(0, 's1', 1, box, { comp: 1 }), cutFor(box)]), FT(200)]
  // the port's title stands at the same place in a slide twice as wide, and the leaf that says the cut one in full stands in that wide slide, displaced
  const wide = { x: 0, y: 100, w: 560, h: 100 }
  const P = [HD, band([title(0, 'p1', 9, wide), full(300, 'p1', 9, wide)]), FT(200)]
  const r = await stated(S, P, 300, 300)
  quietNot(r)
  assert.ok(r.j.defects.length > 0 || r.j.notMeasured.some((n) => /role ?thr/i.test(n.detail)), JSON.stringify([r.kinds, r.j.notMeasured.map((n) => n.detail)]))
  assert.notEqual(r.status, 'ok')
  // control: the same slides with equal boxes are the pair, and the cut leaf is that slide's
  const P1 = [HD, band([title(0, 'p1', 9, box), full(0, 'p1', 9, box)]), FT(200)]
  const ok = await stated(S, P1, 300, 300)
  assert.ok(!ok.kinds.some((k) => /^element-(missing|extra)$/.test(k)), ok.kinds.join())
})

test('judgeHeights (synthetic readings): adjacent carousels that repeat the same title — a cut caption is matched only in the container and slide that stand at its own place; a caption in the neighbour, a displaced carousel or layered boxes pair none', async () => {
  // (synthetic: `sl` / `sc` / `sr` are the structure the probe reads; both carousels of each side say the same title)
  const sr = (y) => ({ x: 0, y, w: 280, h: 100 })
  const title = (y, sl, sc) => node({ sig: 'p.title', key: 'shared title words', x: 0, y, w: 280, h: 20, fx: 0, sl, sc, sr: sr(y), comp: 1 })
  const cap = (key, y, sl, sc, o = {}) => node({ sig: 'p.cap', key, sq: key.replace(/[^a-z]/g, ''), x: 0, y: y + 50, w: 280, h: 20, fx: 0, sl, sc, sr: sr(y), comp: 1, ...o })
  const cut = (y, sl, sc) => cap('role thr', y, sl, sc, { ink: { x: 0, y: y + 50, w: 60, h: 20, part: true } })
  const mk = (kids, h = 220) => [HD, ['one', h, undefined, 100, { k: kids }], FT(100 + h)]
  const mentions = (r) => r.j.defects.some((d) => /role ?thr/i.test(JSON.stringify(d))) || r.j.notMeasured.some((n) => /role ?thr/i.test(n.detail ?? ''))
  // two stacked carousels; the source's upper slide holds the cut caption
  const S = mk([title(100, 'a1', 1), cut(100, 'a1', 1), title(210, 'b1', 2)])
  // the caption in full stands in the slide of the same container and place: it is the cut leaf — quiet
  const right = await stated(S, mk([title(100, 'x1', 7), cap('role three', 100, 'x1', 7), title(210, 'y1', 8)]), 400, 400)
  assert.deepEqual([right.status, right.exit], ['ok', 0], JSON.stringify([right.kinds, right.causes]))
  // the caption in full stands in the OTHER carousel, whose title is the same words: not the cut leaf's — a finding or not measured, by name
  const wrong = await stated(S, mk([title(100, 'x1', 7), title(210, 'y1', 8), cap('role three', 210, 'y1', 8)]), 400, 400)
  quietNot(wrong)
  assert.ok(mentions(wrong), JSON.stringify([wrong.kinds, wrong.j.notMeasured.map((n) => n.detail)]))
  // the port's carousels stand 60 px lower (the same words, drift between): they are not the same containers by a leaf carried there — the cut caption stays unmatched
  const lower = await stated(S, mk([title(160, 'x1', 7), cap('role three', 160, 'x1', 7), title(270, 'y1', 8)], 280), 400, 460)
  quietNot(lower)
  assert.ok(mentions(lower), JSON.stringify([lower.kinds, lower.j.notMeasured.map((n) => n.detail)]))
  // layered carousels on the port, their slides in the same box with the same title each: the source's slide fits both containers — no pair
  const layered = await stated(mk([title(100, 'a1', 1), cut(100, 'a1', 1)]), mk([title(100, 'x1', 7), cap('role three', 100, 'x1', 7), title(100, 'z1', 9), cap('role three', 100, 'z1', 9)]), 400, 400)
  quietNot(layered)
  assert.ok(mentions(layered), JSON.stringify([layered.kinds, layered.j.notMeasured.map((n) => n.detail)]))
})

test('judgeHeights (synthetic readings): the same words on as many leaves of each side are matched in the order of the reading and told as element-moved when each is within reach; with other numbers, or one out of reach, nothing is matched by order', async () => {
  const mk = (kids) => [HD, one(400, kids), FT(500)]
  const card = (y) => word('card words repeated', y, { x: 20, w: 300 })
  const list = (ys) => ys.map(card)
  // three cards each lower by 50 px, then more: no single nearest (the one in the next place is 60 away), the order says which is which
  const moved = await stated(mk(list([110, 200, 290])), mk(list([160, 250, 340])), 600, 600)
  assert.ok(moved.kinds.includes('element-moved') && !moved.kinds.includes('element-missing'), moved.kinds.join())
  assert.deepEqual([moved.status, moved.exit], ['defect', 1])
  // one more card on the port: the numbers differ, the order says nothing — a finding or not measured, never quiet and never moved by order
  const more = await stated(mk(list([110, 200, 290])), mk(list([160, 250, 340, 380])), 600, 600)
  assert.ok(!more.kinds.includes('element-moved'), more.kinds.join())
  assert.notEqual(more.status, 'ok')
})
