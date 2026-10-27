// Regressions for JoomlArt-Products/tracy-wordpress-theme#27 (JA Vega M4d), each written against a
// small generic page before the tool was changed. Nothing here names a JA Vega class as a rule: the
// fixtures use the SHAPES the port measured (an icon link whose words are drawn at 0 px, a button
// label said three times, a textless carousel dot, a header button before a masthead title, a
// sidebar in an <aside> on one side and a <div> on the other, a page given by its path).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const vqa = await import('../visual/visual-qa.mjs')
const { withBrowser, withPage } = await import('../lib/browser.mjs')

const onPage = (html, fn, viewport = { width: 1440, height: 900 }) =>
  withBrowser(async (b) => {
    const p = await b.newPage({ viewport })
    await p.setContent(html)
    return fn(p)
  })

/** Serve `pages` (url → html) and hand the origin to `fn`. */
async function served(pages, fn) {
  const srv = createServer((req, res) => {
    const body = pages[req.url]
    res.writeHead(body ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
    res.end(body ?? '<h1>nope</h1>')
  })
  srv.listen(0, '127.0.0.1')
  await once(srv, 'listening')
  try {
    return await fn(`http://127.0.0.1:${srv.address().port}`)
  } finally {
    srv.close()
  }
}

const filler = '<p>Visible content of the page</p>'.repeat(25)

// ── item 1: words drawn at 0 px or in a transparent ink are not text a reader sees ─────────────────
// An icon link keeps its label for screen readers and the editor (`font-size: 0; color: transparent`,
// the icon painted by the background); the dark theme may give it an opaque colour and leave the size
// at 0. Neither the link nor the paragraph around it is text on the page: not a snapshot element, not
// a source index key, not a contrast row. A child that sets a real size again, and gradient words
// (transparent fill over `background-clip: text`), are still text.
const ICON = `<style>body{background:rgb(16,20,28);color:rgb(230,230,230)}
.play{display:inline-block;padding:24px;background:rgb(59,139,255);font-size:0;color:transparent}
.play--dark{color:rgb(199,204,212)}
.zero{font-size:0}.zero span{font-size:16px;color:rgb(230,230,230)}
.grad{color:transparent;background:linear-gradient(90deg,#f00,#00f);-webkit-background-clip:text;background-clip:text;font-size:32px}
.low{color:rgb(60,64,70)}</style>`
const iconBody = (dark) =>
  `<main><p class="wrap"><a class="play${dark ? ' play--dark' : ''}" href="#">Play the video</a></p>` +
  '<p class="zero">\n  <span>Visible child words</span></p><h2 class="grad">Gradient heading words</h2><p class="low">Genuinely dim words here</p>' +
  `${filler}</main>`

test('#27 item 1: text drawn at 0 px or in a transparent ink is not visible text on either side; a sized child and gradient words are', async () => {
  for (const dark of [false, true]) {
    const html = `${ICON}${iconBody(dark)}`
    const [snap, idx] = await onPage(html, (p) =>
      Promise.all([
        p.evaluate(vqa.inPageSnapshot, { coverageSelectors: 'main a, main p, main h2', properties: ['font-size', 'color'], scope: 'main' }),
        p.evaluate(vqa.inPageTextIndex, { scope: 'body', properties: ['font-size'], slot: null, placeholder: null, siteScope: 'main' })
      ])
    )
    const texts = snap.elements.map((e) => e.text)
    assert.ok(!texts.includes('Play the video'), `${dark ? 'dark' : 'light'}: the 0 px label is no element: ${JSON.stringify(texts.slice(0, 6))}`)
    assert.ok(texts.includes('Visible child words'), 'a child that sets a size again is text')
    assert.ok(texts.includes('Gradient heading words'), 'gradient words (background-clip: text) are text')
    assert.ok(!idx.index['Play the video'], `${dark ? 'dark' : 'light'}: the source index keys no 0 px words`)
    assert.ok(idx.index['Visible child words'] && idx.index['Gradient heading words'])
  }
})

test('#27 item 1: the contrast and dark-text scans skip words drawn at 0 px, and still report dim words', async () => {
  const { scanContrast } = await import('../review/contrast-audit.mjs')
  const { scanLeaks } = await import('../review/leak-scan.mjs')
  const page = `<!doctype html><html data-theme="dark"><head>${ICON}<style>.darkish{color:rgb(20,20,20);font-size:0;padding:8px}</style></head><body>${iconBody(true)}<p class="darkish">Near black words at zero</p></body></html>`
  const r = await served({ '/p/': page }, (at) => withBrowser((b) => withPage(b, {}, async (p) => ({ contrast: await scanContrast(p, `${at}/p/`), dark: await scanLeaks(p, `${at}/p/`, 'darktext') }))))
  const rows = r.contrast.findings.map((f) => `${f.k} "${f.txt}"`)
  assert.ok(!rows.some((l) => /Play the video/.test(l)), rows.join('\n'))
  assert.ok(rows.some((l) => /Genuinely dim words/.test(l)), `real low contrast stays a finding:\n${rows.join('\n')}`)
  assert.ok(!r.dark.findings.some((l) => /Near black words/.test(l)), r.dark.findings.join('\n'))
})

// ── item 2: the dark scans are compared with the source in the same mode ──────────────────────────
// What the source draws itself in dark is set apart (`sourceMatched`), named by the source element,
// and never a class name or a colour used somewhere else. Words said at several places pair by their
// order when both sides say them the same number of times; a textless surface pairs with the source
// element of the same tag and size in the same order, when both sides have as many. Anything short of
// that — other counts, another value, the source in another mode or at another width — stays a finding.
const DARK_HEAD = '<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><style>body{background:rgb(16,18,20);color:rgb(236,234,228)} .card{padding:12px;margin:8px} .dot{display:inline-block;width:9px;height:9px;padding:0;border:0;margin:4px} .hdr{padding:8px} .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)} .spin{display:inline-block;width:32px;height:32px;margin:6px}</style></head><body><main>'
const DARK_TAIL = `${filler}</main></body></html>`
const card = (cls, bg, fg, words = 'Header') => `<div class="card ${cls}" style="background:${bg}"><div class="hdr" style="color:${fg}">${words}</div></div>`
const dots = (cls, n, bg) => Array.from({ length: n }, () => `<button class="${cls}" style="background:${bg}"></button>`).join('')
const spinner = (cls, bg, words) => `<div class="spin ${cls}" style="background:${bg}"><span class="sr">${words}</span></div>`
const pair2 = {
  '/source/':
    DARK_HEAD +
    card('card bg-primary', 'rgb(59,139,255)', 'rgb(199,204,212)') +
    card('card bg-dark', 'rgb(30,34,40)', 'rgb(236,234,228)') +
    dots('owl-dot dot', 5, 'rgb(233,236,239)') +
    spinner('spinner-grow text-light', 'rgb(250,250,250)', 'Loading...') +
    '<div class="card note" style="background:rgb(30,34,40)"><p>A note the site paints white</p></div>' +
    '<p style="color:rgb(236,234,228)">Words the site dims</p>' +
    DARK_TAIL,
  '/site/':
    DARK_HEAD +
    card('wp-card is-primary', 'rgb(59,139,255)', 'rgb(199,204,212)') +
    card('wp-card is-dark', 'rgb(30,34,40)', 'rgb(236,234,228)') +
    dots('tracy-dot dot', 5, 'rgb(233,236,239)') +
    spinner('wp-spinner is-light', 'rgb(250,250,250)', 'Loading…') +
    '<div class="card wp-note" style="background:rgb(255,255,255)"><p style="color:rgb(20,20,20)">A note the site paints white</p></div>' +
    '<p class="wp-dim" style="color:rgb(40,44,50)">Words the site dims</p>' +
    DARK_TAIL,
  // the same site, with one dot more than the source: the order no longer says which is which
  '/site-extra-dot/': DARK_HEAD + dots('tracy-dot dot', 6, 'rgb(233,236,239)') + DARK_TAIL
}

test('#27 item 2: white surfaces and contrast the source draws the same in dark are set apart with the source element; the site\'s own stay findings', async () => {
  const pair = await import('../review/source-pair.mjs')
  const { scanLeaks } = await import('../review/leak-scan.mjs')
  const { scanContrast } = await import('../review/contrast-audit.mjs')
  assert.equal(typeof pair.inPageDarkRecords, 'function')
  const r = await served(pair2, (at) =>
    withBrowser((b) =>
      withPage(b, {}, async (p) => {
        await p.goto(`${at}/source/`)
        const source = { ...(await p.evaluate(pair.inPageDarkRecords, {})), mode: 'dark' }
        return {
          white: await scanLeaks(p, `${at}/site/`, 'white', { source }),
          contrast: await scanContrast(p, `${at}/site/`, '3.0', { source }),
          plain: await scanLeaks(p, `${at}/site/`, 'white'),
          extra: await scanLeaks(p, `${at}/site-extra-dot/`, 'white', { source }),
          light: await scanLeaks(p, `${at}/site/`, 'white', { source: { ...source, mode: 'light' } }),
          narrow: await scanLeaks(p, `${at}/site/`, 'white', { source: { ...source, width: 390 } }),
          noMode: await scanLeaks(p, `${at}/site/`, 'white', { source: { ...source, mode: undefined } }),
          noWidth: await scanContrast(p, `${at}/site/`, '3.0', { source: { ...source, width: undefined } })
        }
      })
    )
  )
  const w = r.white.findings.join('\n')
  assert.ok(!/tracy-dot/.test(w), `five dots of the source's size and colour, in order, are the source's:\n${w}`)
  assert.ok(!/wp-spinner/.test(w), `the spinner's words fold "…" to "..." and pair:\n${w}`)
  assert.ok(/wp-note/.test(w), `a note the source draws dark is the site's own white surface:\n${w}`)
  assert.ok(r.white.sourceMatched.some((l) => /= source BUTTON\.owl-dot/.test(l)), r.white.sourceMatched.join('\n'))
  assert.ok(r.white.sourceMatched.some((l) => /= source DIV\.spin\.spinner-grow/.test(l)), r.white.sourceMatched.join('\n'))
  const c = r.contrast.findings.map((f) => `${f.k} "${f.txt}"`).join('\n')
  assert.ok(!/is-primary|hdr/.test(c), `the header the source draws at the same low contrast is the source's:\n${c}`)
  assert.ok(/wp-dim/.test(c), `words the source draws light are the site's own low contrast:\n${c}`)
  assert.ok(r.contrast.sourceMatched.some((l) => /Header/.test(l) && /= source DIV\.hdr/.test(l)), r.contrast.sourceMatched.join('\n'))
  // without a source, and with a source that is not comparable, nothing is set apart
  assert.ok(/tracy-dot/.test(r.plain.findings.join('\n')))
  assert.equal(r.plain.sourceMatched, undefined)
  assert.ok(/tracy-dot/.test(r.extra.findings.join('\n')), `six dots against five: no order to pair by:\n${r.extra.findings.join('\n')}`)
  assert.ok(/tracy-dot/.test(r.light.findings.join('\n')) && /mode/.test(r.light.sourceRefused ?? ''), `a source read in light is no dark counterpart: ${r.light.sourceRefused}`)
  assert.ok(/tracy-dot/.test(r.narrow.findings.join('\n')) && /width/.test(r.narrow.sourceRefused ?? ''), `a source read at another width is none either: ${r.narrow.sourceRefused}`)
  // a source that does not say its mode or width proves no counterpart: refused whole, nothing set apart
  assert.ok(/tracy-dot/.test(r.noMode.findings.join('\n')) && /mode/.test(r.noMode.sourceRefused ?? ''), `a source without a mode is refused: ${r.noMode.sourceRefused}`)
  assert.deepEqual(r.noMode.sourceMatched, [])
  assert.ok(/is-primary|hdr/.test(r.noWidth.findings.map((f) => `${f.k} "${f.txt}"`).join('\n')) && /width/.test(r.noWidth.sourceRefused ?? ''), `a source without a width is refused: ${r.noWidth.sourceRefused}`)
  assert.deepEqual(r.noWidth.sourceMatched, [])
})

test('#95: scan counterparts within the colour tolerance are source-shared with both measured values', async () => {
  const pair = await import('../review/source-pair.mjs')
  const { scanLeaks } = await import('../review/leak-scan.mjs')
  const { scanContrast } = await import('../review/contrast-audit.mjs')
  const { scanBorders, inPageBorderRecords } = await import('../review/border-scan.mjs')
  const make = (surface, fg, border) => DARK_HEAD +
    `<div class="surface" style="background:rgb(${surface})"><span class="ink" style="color:rgb(${fg})">Shared contrast words</span></div>` +
    `<button class="outline" style="border:2px solid ${border}">Shared border words</button>` + DARK_TAIL
  const pages = {
    '/source/': make('250,250,250', '150,150,150', 'rgba(220,53,69,0.75)'),
    '/site/': make('246,246,246', '154,154,154', 'rgba(224,57,73,0.77)'),
    '/site-different/': make('230,230,230', '170,170,170', 'rgba(240,90,100,0.75)')
  }
  const out = await served(pages, (at) => withBrowser((b) => withPage(b, {}, async (p) => {
    await p.goto(`${at}/source/`)
    const sourceDark = { ...(await p.evaluate(pair.inPageDarkRecords, {})), mode: 'dark' }
    const sourceBorders = { ...(await p.evaluate(inPageBorderRecords, '80')), mode: 'dark' }
    const read = async (route) => ({
      white: await scanLeaks(p, `${at}${route}`, 'white', { source: sourceDark }),
      contrast: await scanContrast(p, `${at}${route}`, '3.0', { source: sourceDark }),
      border: await scanBorders(p, `${at}${route}`, '80', { source: sourceBorders })
    })
    return { near: await read('/site/'), different: await read('/site-different/') }
  })))
  for (const name of ['white', 'contrast', 'border']) {
    const r = out.near[name]
    assert.equal(r.findings.length, 0, `${name} near match: ${JSON.stringify(r.findings)}`)
    assert.ok(r.sourceShared?.length, `${name} sourceShared missing: ${JSON.stringify(r)}`)
    assert.ok(r.sourceShared.every((x) => x.source.value && x.site.value), `${name} must keep both measured values: ${JSON.stringify(r.sourceShared)}`)
    assert.ok(r.sourceShared.some((x) => x.source.value !== x.site.value), `${name} fixture must include a tolerated difference`)
    assert.ok(out.different[name].findings.length, `${name} values outside tolerance remain findings`)
    const within = (a, b) => {
      const rgb = (v) => /^rgb\((\d+),(\d+),(\d+)\)$/.exec(v)?.slice(1).map(Number)
      const x = rgb(a), y = rgb(b)
      return !x || !y || x.every((n, i) => Math.abs(n - y[i]) <= 8)
    }
    assert.ok((out.different[name].sourceShared ?? []).every((x) => within(x.site.value, x.source.value)), `${name} recorded a value outside its source tolerance`)
  }
})

test('#95: rgb and rgba scanner colours share only when RGB and alpha are within tolerance', async () => {
  const { coloursWithinTolerance } = await import('../review/source-pair.mjs')
  assert.equal(coloursWithinTolerance('rgba(220, 53, 69, 0.75)', 'rgba(220, 53, 69, 0.75)'), true)
  assert.equal(coloursWithinTolerance('rgba(220, 53, 69, 0.75)', 'rgba(220, 53, 69, 0.77)'), true, 'alpha delta 0.02 is within 8/255')
  assert.equal(coloursWithinTolerance('rgba(220, 53, 69, 0.75)', 'rgba(220, 53, 69, 0.80)'), false, 'alpha delta 0.05 exceeds 8/255')
  assert.equal(coloursWithinTolerance('rgb(220, 53, 69)', '#dc3545'), true, 'hex and rgb represent the same opaque colour')
  assert.equal(coloursWithinTolerance('rgb(12, 16, 21)|rgb(17, 21, 31)', 'rgb(12, 16, 21)|rgb(17, 21, 31)'), true, 'dark-text scan values compare foreground and background separately')
  assert.equal(coloursWithinTolerance('rgb(12, 16, 21)|rgb(17, 21, 31)', 'rgb(12, 16, 21)|rgb(30, 21, 31)'), false, 'a different dark-text surface remains a finding')
  assert.equal(coloursWithinTolerance('not-a-colour', 'rgba(220, 53, 69, 0.75)'), false, 'unparseable values never match')
})

// The bright-border path that #24 added (sourceCounterpart) left 20 findings a dark tier on JA Vega
// /typography, measured on the live stands 27/09: the outline buttons say "Success" at three places on
// both sides (a solid button, the outline one, a badge) and only two draw the border, so "every place"
// never held; the spinners say "Loading…" on the site (wptexturize) and "Loading..." on the source.
test('#27 item 8 (bright-border): repeated words pair by their order when both sides say them as often; typographic forms fold; other counts stay findings', async () => {
  const { scanBorders, inPageBorderRecords } = await import('../review/border-scan.mjs')
  const head = DARK_HEAD.replace('<main>', '<style>.b{display:inline-block;padding:8px;margin:4px}</style><main>')
  const trio = (outline) => `<button class="b solid" style="background:rgb(25,135,84);border:1px solid rgb(25,135,84)">Success</button><button class="b ${outline}" style="background:transparent;border:1px solid rgb(25,135,84)">Success</button><span class="b badge">Success</span>`
  const spin = (cls, words) => `<div class="spin ${cls}" style="border:4px solid rgb(220,53,69)"><span class="sr">${words}</span></div>`
  const pages = {
    '/source/': head + trio('btn-outline-success') + spin('spinner-border', 'Loading...') + DARK_TAIL,
    '/site/': head + trio('wp-outline') + spin('wp-spinner', 'Loading…') + DARK_TAIL,
    '/site-twice/': head + '<button class="b wp-outline" style="background:transparent;border:1px solid rgb(25,135,84)">Success</button><span class="b badge">Success</span>' + DARK_TAIL
  }
  const r = await served(pages, (at) =>
    withBrowser((b) =>
      withPage(b, {}, async (p) => {
        await p.goto(`${at}/source/`)
        const source = { ...(await p.evaluate(inPageBorderRecords, '80')), mode: 'dark' }
        return { site: await scanBorders(p, `${at}/site/`, '80', { source }), twice: await scanBorders(p, `${at}/site-twice/`, '80', { source }) }
      })
    )
  )
  const f = r.site.findings.join('\n')
  assert.ok(!/wp-outline/.test(f), `the second of three "Success" on both sides is the source's outline button:\n${f}`)
  assert.ok(!/wp-spinner/.test(f), `"Loading…" is the source's "Loading...":\n${f}`)
  assert.ok(r.site.sourceMatched.some((l) => /wp-outline/.test(l) && /= source button\.b\.btn-outline-success/.test(l)), r.site.sourceMatched.join('\n'))
  assert.ok(/wp-outline/.test(r.twice.findings.join('\n')), `two places against three: no order to pair by:\n${r.twice.findings.join('\n')}`)
})

test("#27/#95: VISUAL.md lists source-shared measurements and a source the scans refused", async () => {
  const { visualMarkdown, summarize } = await import('../visual/report.mjs')
  const pages = [{ id: 'en-typography', axes: [{ variant: '1440-dark', findings: [], accepted: [], components: [], scans: { 'white-surface': { examined: 9, findings: 0, sourceShared: [{ component: 'DIV.spinner-grow', siteComponent: 'DIV.wp-spinner', sourceComponent: 'DIV.spinner-grow', by: 'every place', site: { value: 'rgb(246,246,246)' }, source: { value: 'rgb(250,250,250)' } }], sourceMatched: ['bg rgb(250,250,250)  DIV.wp-spinner  = source DIV.spinner-grow "Loading..." (every place)'] }, contrast: { examined: 9, findings: 0, sourceMatched: [], sourceRefused: 'the source was read at width 390, the page at width 1440' } } }] }]
  const summary = summarize(pages, [{ id: 'dark-desktop', status: 'pass' }])
  assert.equal(summary.sourceMatched, 1)
  const md = visualMarkdown({ site: 'x', at: 'now', summary, stageReports: [{ id: 'dark-desktop', status: 'pass', pages: 1, axes: 1, reused: 0, findings: 0 }], pages })
  assert.match(md, /## Set apart as the source's own \[SOURCE\] \(1\)/)
  assert.match(md, /scan:white-surface source-shared DIV\.wp-spinner ↔ DIV\.spinner-grow: site rgb\(246,246,246\), source rgb\(250,250,250\)/)
  assert.match(md, /scan:contrast source not compared: the source was read at width 390/)
})

// ── item 3: an interaction that could not be measured is measured once more; motion state is no label ─
function fakeHoverPage({ hoverFails = 0, restFails = 0 } = {}) {
  const calls = { hover: 0, rest: 0, moves: 0 }
  const rect = { x: 10, y: 10, w: 100, h: 20 }
  return {
    calls,
    mouse: { move: async () => void calls.moves++ },
    waitForTimeout: async () => {},
    evaluate: async (fn, [, , opts]) => {
      if (opts?.scrollIntoView) {
        calls.rest++
        if (calls.rest <= restFails) return { settled: false, reason: 'the box kept moving' }
      }
      return { settled: true, rect, scroll: { x: 0, y: 0 } }
    },
    locator: () => ({
      first: () => ({
        hover: async () => {
          calls.hover++
          if (calls.hover <= hoverFails) throw new Error('Timeout 2000ms exceeded')
        }
      })
    })
  }
}

test('#27 item 3: a hover the pointer could not reach is measured once more from rest; a persistent failure stays a finding with both attempts', async () => {
  assert.equal(typeof vqa.hoverTarget, 'function')
  const t = { i: 0, tag: 'a', cls: 'x', text: 'Services' }
  const once = fakeHoverPage({ hoverFails: 1 })
  const ok = await vqa.hoverTarget(once, t)
  assert.equal(ok.measured, true, JSON.stringify(ok))
  assert.equal(ok.attempts.length, 2)
  assert.match(ok.attempts[0], /pointer could not reach/)
  assert.ok(once.calls.moves >= 2 && once.calls.rest === 2, `the second attempt starts from rest again: ${JSON.stringify(once.calls)}`)
  const stuck = await vqa.hoverTarget(fakeHoverPage({ hoverFails: 5 }), t)
  assert.equal(stuck.measured, false)
  assert.equal(stuck.attempts.length, 2, 'one retry, no more')
  assert.match(stuck.reason, /pointer could not reach it/)
  const rest = await vqa.hoverTarget(fakeHoverPage({ restFails: 1 }), t)
  assert.equal(rest.measured, true, 'a rest read that did not settle is retried too')
})

test('#27 item 3: a mega walk that FAILs is walked once more; a second FAIL, a crash or a timeout keeps the finding with every attempt', async () => {
  assert.equal(typeof vqa.walkMega, 'function')
  const FAIL = { status: 1, stdout: 'FAIL                 Services {"reopens":false}\n\n2 item(s) tested at 1440px — 1 FAIL\n', stderr: '', ms: 5, timedOut: false }
  const PASS = { status: 0, stdout: 'PASS Services\n\n2 item(s) tested at 1440px — 0 FAIL\n', stderr: '', ms: 5, timedOut: false }
  const runner = (seq) => {
    const calls = []
    return { calls, run: async (...a) => (calls.push(a), seq[Math.min(calls.length - 1, seq.length - 1)]) }
  }
  const flaky = runner([FAIL, PASS])
  const a = await vqa.walkMega(flaky.run, ['x'])
  assert.equal(a.ok, true)
  assert.equal(flaky.calls.length, 2)
  assert.equal(a.attempts.length, 2)
  assert.match(a.attempts[0], /reopens/)
  const broken = runner([FAIL, FAIL])
  const b = await vqa.walkMega(broken.run, ['x'])
  assert.equal(b.ok, false)
  assert.equal(broken.calls.length, 2)
  const slow = runner([{ status: null, signal: 'SIGKILL', stdout: '', stderr: '', ms: 5, timedOut: true }])
  const c = await vqa.walkMega(slow.run, ['x'])
  assert.equal(c.ok, false)
  assert.equal(slow.calls.length, 1, 'a walk killed at its timeout is not run a second time')
  const crashed = runner([{ status: 1, stdout: '', stderr: 'page.evaluate: Execution context was destroyed\n', ms: 5, timedOut: false }, PASS])
  const d = await vqa.walkMega(crashed.run, ['x'])
  assert.equal(d.ok, false)
  assert.equal(crashed.calls.length, 1, 'a walk that died before its summary keeps that evidence')
  assert.match(d.tail, /Execution context was destroyed/)
})

test('#27 item 3: a motion state class is no part of an element label; structural classes stay', async () => {
  const html = `<main><p class="wrap"><a class="play__button tracy-motion-pulse tracy-motion-on extra" href="#">Watch the story now</a></p>${filler}</main>`
  const [snap, hov] = await onPage(html, (p) => Promise.all([p.evaluate(vqa.inPageSnapshot, { coverageSelectors: 'main a', properties: ['font-size'], scope: 'main' }), p.evaluate(vqa.inPageHoverJump, 'main a')]))
  const el = snap.elements.find((e) => e.text === 'Watch the story now')
  assert.equal(el.cls, 'play__button.tracy-motion-pulse.extra')
  assert.equal(hov.targets[0].cls, 'play__button.tracy-motion-pulse')
})

test('#27 item 3: a bright border keeps one identity across rounds whether or not a motion state class is on it or its parents', async () => {
  const { scanBorders } = await import('../review/border-scan.mjs')
  const { findingKey } = await import('../visual/rounds.mjs')
  const box = (on) => `<div class="wrap tracy-motion-reveal${on ? ' tracy-motion-in tracy-motion-done' : ''}"><a class="ring tracy-motion-pulse${on ? ' tracy-motion-on' : ''}" style="display:inline-block;padding:8px;border-top:2px solid rgb(240,240,240)">A bright ring</a></div>`
  const pages = { '/rest/': DARK_HEAD + box(false) + DARK_TAIL, '/moving/': DARK_HEAD + box(true) + DARK_TAIL }
  const r = await served(pages, (at) => withBrowser((b) => withPage(b, {}, async (p) => ({ rest: await scanBorders(p, `${at}/rest/`), moving: await scanBorders(p, `${at}/moving/`) }))))
  const ring = (x) => x.findings.filter((l) => /\bring\b/.test(l))
  assert.equal(ring(r.rest).length, 1, r.rest.findings.join('\n'))
  assert.equal(ring(r.moving).length, 1, r.moving.findings.join('\n'))
  assert.ok(!/tracy-motion-(?:on|in|done)\b/.test(ring(r.moving)[0]), ring(r.moving)[0])
  assert.match(ring(r.moving)[0], /tracy-motion-pulse/, 'structural motion classes stay in the label')
  assert.match(ring(r.moving)[0], /tracy-motion-reveal/)
  const key = (what) => findingKey({ axis: '1440-dark', kind: 'scan:bright-border', what })
  assert.equal(key(ring(r.moving)[0]), key(ring(r.rest)[0]), 'the same border is the same finding in both rounds')
})

test('#27 item 2: a source counts as a dark counterpart only when it says dark and the width the page was read at', async () => {
  const { sourceRefusal } = await import('../review/source-pair.mjs')
  assert.equal(sourceRefusal(null, { width: 1440 }), null)
  assert.equal(sourceRefusal({ mode: 'dark', width: 1440 }, { width: 1440 }), null)
  assert.match(sourceRefusal({ width: 1440 }, { width: 1440 }), /mode/)
  assert.match(sourceRefusal({ mode: 'light', width: 1440 }, { width: 1440 }), /light/)
  assert.match(sourceRefusal({ mode: 'dark' }, { width: 1440 }), /width/)
  assert.match(sourceRefusal({ mode: 'dark', width: 1440 }, {}), /width/)
  assert.match(sourceRefusal({ mode: 'dark', width: 390 }, { width: 1440 }), /390/)
})

// ── item 5: a repeated label pairs with the source occurrence in the region the site measured ───────
// The site is measured over `main`; the header button of the same words is chrome on both sides. The
// site's h1 "Contact Us" pairs with the source's masthead h3 (another tag, outside any <main>), not
// with the header button that comes first on the source.
const HEADER = (tag, cls) => `<header><div><${tag} class="${cls}" style="font-size:16px;background:rgb(29,78,216);color:#fff;padding:12px">Contact Us</${tag}></div></header>`
const contactSource = `<style>body{color:rgb(20,20,20)} .mast{font-size:36px;color:rgb(255,255,255);background:rgb(10,20,30)}</style>${HEADER('a', 'btn btn-primary')}<div class="masthead"><h3 class="mast">Contact Us</h3></div><div class="body"><p>Get in touch with the team today.</p>${filler}</div>`
const contactSite = `<style>body{color:rgb(20,20,20)} .mast{font-size:36px;color:rgb(255,255,255);background:rgb(10,20,30)}</style>${HEADER('a', 'wp-block-button__link')}<main><h1 class="mast">Contact Us</h1><p>Get in touch with the team today.</p>${filler}</main>`
const props = ['font-size', 'background-color', 'color']
const pairOf = async (site, source, scope) => {
  const snap = await onPage(site, (p) => p.evaluate(vqa.inPageSnapshot, { coverageSelectors: `${scope} h1, ${scope} a, ${scope} p`, properties: props, scope }))
  const idx = await onPage(source, (p) => p.evaluate(vqa.inPageTextIndex, { scope: 'body', properties: props, slot: null, placeholder: null, siteScope: scope }))
  return vqa.parityByText(snap.elements, idx.index, { properties: props, hexTolerance: 8, pxTolerance: 1 })
}

test('#27 item 5: a site heading in main pairs with the source heading of the same words, not the source header button that says them first', async () => {
  const r = await pairOf(contactSite, contactSource, 'main')
  const h1 = r.components.find((c) => /^h1/.test(c.element))
  assert.equal(h1?.status, 'ok', JSON.stringify(r.findings))
  // chrome measured on purpose (scope body): the site's header button pairs with the source's
  const all = await pairOf(contactSite, contactSource, 'body')
  const rows = all.components.filter((c) => /Contact Us/.test(c.element))
  assert.equal(rows.length, 2)
  assert.ok(rows.every((c) => c.status === 'ok'), JSON.stringify(all.findings))
  // a source whose header is anonymous divs keeps the old pairing — nothing marks it chrome
  const anon = contactSource.replace('<header>', '<div class="top">').replace('</header>', '</div>')
  const a = await pairOf(contactSite, anon, 'main')
  assert.equal(a.classified >= 1, true)
  // the source that drops its masthead: Contact Us remains only in source chrome, so the main h1 is unclassified
  const bare = contactSource.replace(/<div class="masthead">[^]*?<\/div>/, '')
  const b = await pairOf(contactSite, bare, 'main')
  assert.ok(!b.components.some((c) => /^h1/.test(c.element)), 'a site heading does not pair across the chrome boundary')
  assert.ok(b.unclassified.some((element) => /^h1.*Contact Us/.test(element)), JSON.stringify(b.unclassified))
})

// ── item 8: a sidebar in an <aside> and one in a <div> are read alike ───────────────────────────────
test('#27 item 8: http-parity reads sidebar text in an <aside> like the source\'s <div> sidebar; navigation in it stays chrome', async () => {
  const { extractRuns } = await import('../lib/parity-extract.mjs')
  const side = (open, close) => `${open}<h3>Latest News</h3><p>The newest article from the team this week.</p><nav><h3>Menu heading</h3></nav>${close}`
  const source = `<body><header><h3>Site header</h3></header><div class="content"><h1>Featured Articles</h1></div>${side('<div class="t4-col sidebar-r">', '</div>')}<footer><h3>Footer</h3></footer></body>`
  const site = `<body><header><h3>Site header</h3></header><main><h1>Featured Articles</h1></main>${side('<aside class="listing__aside">', '</aside>')}<footer><h3>Footer</h3></footer></body>`
  for (const runs of ['elements', 'leaf']) {
    const a = extractRuns(source, { runs }).runs
    const b = extractRuns(site, { runs }).runs
    for (const want of ['Latest News', 'The newest article from the team this week.']) {
      assert.ok(a.includes(want), `${runs}: source ${JSON.stringify(a)}`)
      assert.ok(b.includes(want), `${runs}: site ${JSON.stringify(b)}`)
    }
    for (const r of [...a, ...b]) assert.ok(!/Menu heading|Site header|Footer/.test(r), `${runs}: chrome stays out: ${r}`)
    // a site that drops the sidebar misses it
    const dropped = extractRuns(site.replace(/<aside[^]*<\/aside>/, ''), { runs })
    assert.ok(!dropped.text.includes('latest news'), `${runs}: a missing sidebar is missing`)
  }
})

// ── item 10: a page given by path, an unknown page, and a run that measured nothing ─────────────────
test('#27 item 10: explicit pages resolve by id or path; unknown, empty or ambiguous selections are refused', async () => {
  const { resolvePageSelection } = await import('../visual/contract.mjs')
  assert.equal(typeof resolvePageSelection, 'function')
  const contract = { pages: [{ id: 'en-error-page', path: '/error-page', pagemapPath: '/error-page' }, { id: 'en-about', path: '/about/' }, { id: 'ru-about', path: '/ru/about/' }] }
  assert.deepEqual(resolvePageSelection(contract, ['/error-page']), ['en-error-page'])
  assert.deepEqual(resolvePageSelection(contract, ['en-about', '/about']), ['en-about'])
  assert.deepEqual(resolvePageSelection(contract, ['/ru/about/', 'en-error-page']), ['ru-about', 'en-error-page'])
  assert.throws(() => resolvePageSelection(contract, ['/nowhere']), /unknown page.*\/nowhere/)
  assert.throws(() => resolvePageSelection(contract, []), /no page/)
  assert.throws(() => resolvePageSelection({ pages: [{ id: 'en-x', path: '/x/' }, { id: 'en-x-2', path: '/x/' }] }, ['/x/']), /ambiguous/)
})

test('#27 item 10: a report that measured none of the pages asked for is a problem, never a converged recheck', async () => {
  const { reportProblems } = await import('../visual/round.mjs')
  const contract = { pages: [{ id: 'en-error-page', path: '/error-page', variants: ['1440-dark'] }] }
  const report = { scope: { kind: 'targeted-debug' }, summary: { findings: 0, unclassified: 0 }, stages: [{ id: 'dark-desktop', status: 'pass' }], pages: [] }
  const unknown = reportProblems({ contract, stage: 'dark-desktop', report, exit: 0, pages: ['/error-page'], full: false })
  assert.ok(unknown.some((p) => /unknown page/.test(p)), unknown.join('; '))
  const none = reportProblems({ contract, stage: 'dark-desktop', report, exit: 0, pages: ['en-error-page'], full: false })
  assert.ok(none.some((p) => /not measured/.test(p)), none.join('; '))
  const empty = reportProblems({ contract, stage: 'dark-desktop', report, exit: 0, pages: [], full: false })
  assert.ok(empty.some((p) => /no page/.test(p)), empty.join('; '))
  // an axis present under a clean summary counts only when this run measured it
  const withAxis = (a) => ({ ...report, pages: [{ id: 'en-error-page', axes: [{ variant: '1440-dark', findings: [], ...a }] }] })
  for (const [label, a] of [['reused', { measured: 'reused', reusedFrom: '/old' }], ['false', { measured: false }], ['silent', {}]]) {
    const got = reportProblems({ contract, stage: 'dark-desktop', report: withAxis(a), exit: 0, pages: ['en-error-page'], full: false })
    assert.ok(got.some((p) => /not measured by this run/.test(p) && /en-error-page 1440-dark/.test(p)), `${label}: ${got.join('; ')}`)
  }
  assert.deepEqual(reportProblems({ contract, stage: 'dark-desktop', report: withAxis({ measured: 'now' }), exit: 0, pages: ['en-error-page'], full: false }), [])
})

// visual-qa itself: `--pages` by path measures the page, now, even when an earlier clean run of the
// same hash is offered with --reuse — the caller named the page to see it measured.
const { buildContract, specHash } = await import('../visual/contract.mjs')
const PAGE = `<!doctype html><html lang="en"><head><style>body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)} main{padding:40px}</style></head><body class="tracy-page-page"><main><h1>Building the groundwork</h1>${Array.from({ length: 24 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('')}</main></body></html>`
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'vqa27-'))
  const site = path.join(root, 'site')
  const spec = path.join(root, 'spec')
  mkdirSync(path.join(site, 'about'), { recursive: true })
  mkdirSync(path.join(spec, 'reference', 'rendered'), { recursive: true })
  writeFileSync(path.join(site, 'about', 'index.html'), PAGE)
  writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), PAGE)
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  const pageMap = { locales: ['en'], defaultLocale: 'en', theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } }, pages: [{ file: 'About.html', view: 'page', title: 'Building the groundwork', path: '/about/', locale: 'en' }] }
  const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }
  const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page' } }, themeTemplates: new Set(['page']), specHash: specHash(spec), id: 'mock' })
  const contractFile = path.join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  return { root, site, spec, contractFile }
}
function serveDir(dir) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      if (p.endsWith('/')) p += 'index.html'
      const file = path.join(dir, p)
      res.writeHead(existsSync(file) ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(existsSync(file) ? readFileSync(file) : '<html><body><main><h1>Not found</h1></main></body></html>')
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

test('#27 item 10: visual-qa --pages takes a path, measures the page fresh despite --reuse, and refuses a page the contract does not have', async () => {
  const fx = fixture()
  const srv = await serveDir(fx.site)
  const go = (name, extra) => vqa.run({ contract: fx.contractFile, site: srv.origin, out: path.join(fx.root, name), spec: fx.spec, concurrency: 1, megaItems: '.none', stage: 'light-desktop', ...extra })
  try {
    const first = await go('a', {})
    assert.equal(first.pages.length, 1)
    // the control: without --pages the unchanged clean page IS taken from the earlier run
    const control = await go('d', { reuse: [path.join(fx.root, 'a')] })
    assert.equal(control.pages[0].axes[0].measured, 'reused')
    const byPath = await go('b', { pages: '/about/', reuse: [path.join(fx.root, 'a')] })
    assert.equal(byPath.pages.length, 1, 'the page named by its path is measured')
    assert.equal(byPath.pages[0].axes[0].measured, 'now', 'a page the caller named is measured now, not reused')
    await assert.rejects(() => go('c', { pages: '/error-page' }), /unknown page.*\/error-page/)
  } finally {
    await srv.close()
  }
})

test('visual-qa --probes-from: a stage takes the intrinsic and interaction records of another run of the same measurement byte for byte; another scope, or a provider that ended without a report, measures its own', async () => {
  const { rmSync } = await import('node:fs')
  const fx = fixture()
  // a page-map the intrinsic probe can read, and the contract bound to it
  const pageMap = { locales: ['en'], defaultLocale: 'en', theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } }, pages: [{ file: 'About.html', view: 'page', title: 'Building the groundwork', path: '/about/', locale: 'en' }] }
  writeFileSync(path.join(fx.spec, 'page-map.json'), JSON.stringify(pageMap))
  const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }
  writeFileSync(fx.contractFile, JSON.stringify(buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page' } }, themeTemplates: new Set(['page']), specHash: specHash(fx.spec), id: 'mock' })))
  const srv = await serveDir(fx.site)
  let own = 0
  const asked = []
  const mine = {
    intrinsic: async (_o, opts) => { own++; asked.push(opts?.only ?? null); return { status: 'not-run', reason: 'measured by this run' } },
    interaction: async () => { own++; return { claim: { status: 'not-run', reason: 'measured by this run', blocking: 1 }, record: null } }
  }
  const go = (name, extra) => vqa.run({ contract: fx.contractFile, site: srv.origin, out: path.join(fx.root, name), spec: fx.spec, concurrency: 1, megaItems: '.none', stage: 'light-desktop', ...extra })
  try {
    const provider = path.join(fx.root, 'p')
    const first = await go('p', {})
    assert.equal(first.summary.interaction?.status, 'run', JSON.stringify(first.summary.interaction))
    // another stage of the same measurement: nothing measured again, the records copied as they are
    const taker = await go('t', { stage: 'light-responsive', probesFrom: provider, ...mine })
    assert.equal(own, 0, 'the probes were not measured again')
    assert.equal(first.summary.intrinsic?.status, 'run', JSON.stringify(first.summary.intrinsic))
    for (const f of ['interaction.json', 'intrinsic.json']) assert.ok(readFileSync(path.join(fx.root, 't', f)).equals(readFileSync(path.join(provider, f))), f)
    assert.deepEqual(taker.summary.interaction, first.summary.interaction)
    assert.deepEqual(taker.summary.intrinsic, first.summary.intrinsic)
    // another build served at the same URL (the bound files unchanged): its own probes
    const about = path.join(fx.site, 'about', 'index.html')
    const served = readFileSync(about)
    writeFileSync(about, served.toString('utf8').replace('Paragraph number 0', 'Paragraph number zero'))
    await go('w', { stage: 'light-responsive', probesFrom: provider, ...mine })
    writeFileSync(about, served)
    assert.equal(own, 2, 'a provider that measured another build is not taken')
    own = 0
    asked.length = 0
    // another scope (--pages) is another measurement: its own probes
    await go('u', { pages: '/about/', probesFrom: provider, ...mine })
    assert.equal(own, 2)
    // a targeted run reads the intrinsic probe on its own pages only; a full run on every route
    assert.deepEqual(asked.at(-1), ['/about/'])
    assert.deepEqual(vqa.intrinsicPages({ spec: fx.spec }, ['/about']).map((p) => p.path), ['/about/'])
    assert.deepEqual(vqa.intrinsicPages({ spec: fx.spec }, ['/team/']), [])
    assert.equal(vqa.intrinsicPages({ spec: fx.spec }).length, 1)
    // a provider whose process ended without a report does not keep the stage waiting
    const gone = path.join(fx.root, 'gone')
    writeFileSync(`${gone}.ended`, '{"exit":1}\n')
    const t0 = Date.now()
    await go('v', { probesFrom: gone, probesWaitMs: 120000, ...mine })
    assert.equal(own, 4)
    assert.equal(asked.at(-1), null, 'a full run reads every page-map route')
    assert.ok(Date.now() - t0 < 60000, 'no wait for a provider that ended')
  } finally {
    await srv.close()
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('visual-qa probesFrom: a provider of another site or source, without route hashes, or whose probed routes hash differently now is not taken', async () => {
  const { rmSync } = await import('node:fs')
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa27-'))
  try {
    const provider = path.join(dir, 'p')
    mkdirSync(provider)
    const identity = { contractHash: 'c', capturedAt: '2026-10-21T00:00:00Z' }
    const scope = { kind: 'full', plan: null }
    writeFileSync(path.join(provider, 'visual.json'), JSON.stringify({ site: 'http://s.test', sourceSite: 'http://src.test', identity, scope, pages: [{ id: 'en-about', hash: 'h1' }] }))
    writeFileSync(path.join(provider, 'interaction.json'), JSON.stringify({ pages: ['/about/', '/team/'] }))
    const o = { probesFrom: provider, out: path.join(dir, 'o'), site: 'http://s.test', sourceSite: 'http://src.test', spec: dir }
    const now = { '/about/': 'h1', '/team/': 't1' }
    const ask = (over, current = now) => vqa.probesFrom({ ...o, ...over }, { identity: { ...identity, capturedAt: 'later' }, scope, hashRoutes: async (routes) => new Map(routes.map((r) => [r, current[r] ?? null])), timeoutMs: 1000 })
    assert.match((await ask({ site: 'http://other.test' })).why, /measured http:\/\/s\.test/)
    assert.match((await ask({ sourceSite: 'http://other-src.test' })).why, /compared with the source/)
    assert.match((await ask({ sourceSite: undefined })).why, /compared with the source/)
    assert.match((await ask({})).why, /recorded no hash of the pages its probes read/)
    writeFileSync(path.join(provider, vqa.PROBES_SERVED_FILE), JSON.stringify({ schema: 1, routes: { '/about/': 'h1' } }))
    assert.match((await ask({})).why, /another build: 1 page.*\/team\//, 'a probed route with no recorded hash')
    writeFileSync(path.join(provider, vqa.PROBES_SERVED_FILE), JSON.stringify({ schema: 1, routes: { '/about/': 'h1', '/team/': 't1' } }))
    assert.match((await ask({}, { ...now, '/team/': 't2' })).why, /another build: 1 page.*\/team\//, 'a probed route the report does not list, changed')
    assert.match((await ask({}, { ...now, '/team/': null })).why, /another build/, 'a route that cannot be hashed now')
    // everything matches: it goes on to read the records (a bare record here, refused as inconsistent)
    assert.doesNotMatch((await ask({})).why ?? '', /another build|compared with the source|measured http|recorded no hash/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('visual-qa --probes-from: a provider whose report lists page A while its probes read A and B is not reused once only B changed', async () => {
  const { rmSync } = await import('node:fs')
  const fx = fixture()
  // two pages, both in the page-map, the contract and the probes
  const team = PAGE.replace('Building the groundwork', 'Meet the team')
  mkdirSync(path.join(fx.site, 'team'), { recursive: true })
  writeFileSync(path.join(fx.site, 'team', 'index.html'), team)
  writeFileSync(path.join(fx.spec, 'reference', 'rendered', 'team--1440-light.html'), team)
  const pageMap = { locales: ['en'], defaultLocale: 'en', theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } }, pages: [{ file: 'About.html', view: 'page', title: 'Building the groundwork', path: '/about/', locale: 'en' }, { file: 'Team.html', view: 'page', title: 'Meet the team', path: '/team/', locale: 'en' }] }
  writeFileSync(path.join(fx.spec, 'page-map.json'), JSON.stringify(pageMap))
  const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }, { page: 'Team.html', path: 'reference/rendered/team--1440-light.html' }] }
  writeFileSync(fx.contractFile, JSON.stringify(buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page', '/team/': 'page' } }, themeTemplates: new Set(['page']), specHash: specHash(fx.spec), id: 'mock' })))
  const srv = await serveDir(fx.site)
  let own = 0
  const mine = {
    intrinsic: async () => { own++; return { status: 'not-run', reason: 'measured by this run' } },
    interaction: async () => { own++; return { claim: { status: 'not-run', reason: 'measured by this run', blocking: 1 }, record: null } }
  }
  const go = (name, extra) => vqa.run({ contract: fx.contractFile, site: srv.origin, out: path.join(fx.root, name), spec: fx.spec, concurrency: 1, megaItems: '.none', stage: 'light-desktop', ...extra })
  try {
    const provider = path.join(fx.root, 'p')
    await go('p', {})
    const record = JSON.parse(readFileSync(path.join(provider, 'interaction.json'), 'utf8'))
    assert.deepEqual([...record.pages].sort(), ['/about/', '/team/'], 'the probes read both pages')
    // the provider's tier measured page A only (B had no axis in its stage): its report lists A alone
    const report = JSON.parse(readFileSync(path.join(provider, 'visual.json'), 'utf8'))
    writeFileSync(path.join(provider, 'visual.json'), JSON.stringify({ ...report, pages: report.pages.filter((p) => p.id === 'en-about') }))
    // a new build changes B only
    writeFileSync(path.join(fx.site, 'team', 'index.html'), team.replace('Paragraph number 0', 'Paragraph number zero'))
    await go('t', { probesFrom: provider, ...mine })
    assert.equal(own, 2, 'the probes of the old build were not reused')
    // the control: the same build served again is reused
    writeFileSync(path.join(fx.site, 'team', 'index.html'), team)
    own = 0
    await go('u', { probesFrom: provider, ...mine })
    assert.equal(own, 0, 'the same build reuses the probes')
  } finally {
    await srv.close()
    rmSync(fx.root, { recursive: true, force: true })
  }
})

test('#27 item 8: http-parity passes a route whose sidebar the target writes as an <aside>, and still fails the target that drops it', async () => {
  const { spawn } = await import('node:child_process')
  const doc = (body) => `<!doctype html><html><body><header><h3>Site header</h3></header>${body}<footer><h3>Footer</h3></footer></body></html>`
  const sidebar = '<h3>Popular Tags</h3><p>Browse every article filed under these tags.</p>'
  const pages = {
    '/source': doc(`<div class="content"><h1>Featured Articles</h1><p>The articles the editors picked for this month.</p></div><div class="t4-col sidebar-r">${sidebar}</div>`),
    '/aside': doc(`<main><h1>Featured Articles</h1><p>The articles the editors picked for this month.</p></main><aside class="listing__aside">${sidebar}</aside>`),
    '/dropped': doc('<main><h1>Featured Articles</h1><p>The articles the editors picked for this month.</p></main>')
  }
  const scratch = mkdtempSync(path.join(tmpdir(), 'parity27-'))
  await served(pages, async (at) => {
    const pairs = path.join(scratch, 'pairs.json')
    writeFileSync(pairs, JSON.stringify({ rules: [{ from: '/source', to: '/aside' }] }))
    const parity = async (to) => {
      writeFileSync(pairs, JSON.stringify({ rules: [{ from: '/source', to }] }))
      const out = path.join(scratch, `report-${to.slice(1)}.json`)
      const child = spawn(process.execPath, [new URL('../http-parity.mjs', import.meta.url).pathname, '--source', at, '--target', at, '--routes', '/source', '--pairs', pairs, '--out', out, '--no-cache'])
      let log = ''
      child.stdout.on('data', (d) => (log += d))
      child.stderr.on('data', (d) => (log += d))
      const [code] = await once(child, 'close')
      return { code, log, route: JSON.parse(readFileSync(out, 'utf8')).routes[0] }
    }
    const kept = await parity('/aside')
    assert.equal(kept.route.ok, true, `${kept.log}\n${JSON.stringify(kept.route.missing)}`)
    const dropped = await parity('/dropped')
    assert.equal(dropped.route.ok, false, dropped.log)
    assert.ok(dropped.route.missing.includes('Popular Tags'), JSON.stringify(dropped.route.missing))
  })
})
