// F12-style negative fixtures for the visual runner: a two-page mock site and its "rendered source"
// served from a temp dir; each defect must fail by name before the clean pair is trusted to pass.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { run, diffProperty, parityByText, axesFor, consumersFor, examinedTooFew } from '../visual/visual-qa.mjs'
import { buildContract, specHash } from '../visual/contract.mjs'
import { planRun } from '../visual/notes.mjs'
import { deriveShots } from '../visual/fast-gate.mjs'
import { SOURCE_DEPENDENT_CHECKS } from '../visual/applicability.mjs'

test('examined floor compares census populations, so complete controls are not penalized', () => {
  assert.equal(examinedTooFew(3, 3, true), false)
  assert.equal(examinedTooFew(1, 3, true), true)
  assert.equal(examinedTooFew(19, null, false), true)
  assert.equal(examinedTooFew(100, 0, true), false)
})


const CSS = `body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}
html[data-theme=dark] body{background:rgb(16,18,20);color:rgb(236,234,228)}
main{padding:40px}h1{font-size:40px;line-height:44px}p{font-size:16px;line-height:24px}.eyebrow{font-size:12px;line-height:16px;font-weight:600}
a{color:rgb(20,72,58);display:inline-block;padding:4px}a:hover{background:rgb(230,230,230)}
.card{background:rgb(255,255,255);padding:16px}html[data-theme=dark] .card{background:rgb(25,28,31)}
html[data-theme=dark] .leak{background:rgb(255,255,255)}`
// One paragraph runs past 120 characters on purpose: the snapshot used to cut the words there and
// the source index (keyed by the full words) never matched it. The site's lead writes "Design‑build"
// with a non-breaking hyphen (U+2011, what the seeder's copy fixes and typeset write) where the
// source has a plain one: typesetting is not content, so the pair still classifies.
const LONG = 'A heavy machine foundation is not simply a bigger block of concrete. It is a vibrating system with its own natural frequency, and the designer’s job is to keep that frequency well away from the operating range.'
const words = Array.from({ length: 24 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('') + `<p>${LONG}</p>`
const page = ({ dark = true, h1 = 'Building the groundwork', h1Size = 40, leak = false, jumpy = false, img = true }) => `<!doctype html><html lang="en"><head><style>${CSS}${h1Size !== 40 ? `h1{font-size:${h1Size}px}` : ''}${jumpy ? 'a:hover{padding:12px}' : ''}</style>
<script>try{const m=document.cookie.match(/tracy_theme=(dark|light)/);if(m){document.documentElement.setAttribute('data-theme',m[1])}}catch(e){}</script>
</head><body class="tracy-page-page"><header><a href="/">Home</a></header><main>
<p class="eyebrow">Production building</p><h1>${h1}</h1><p class="lead">Design‑build main contractor for industrial parks.</p>
<div class="card${leak && !dark ? ' leak' : ''}">${words}</div>
${img ? '<img src="/pic.png" alt="x" width="40" height="40">' : ''}
<a href="/about/">Read the case study</a> <a href="/ru/">«Норткейт» выиграл конкурс «Заволжье-2»</a>
<div class="row"><div><div>Structural engineer (steel / concrete)</div><div>Moscow / hybrid</div></div><a href="/apply/">Apply →</a></div></main></body></html>`
// The source's breadcrumb row is anonymous divs whose last crumb repeats words of the page (here
// the eyebrow, at 13.5px): a crumb row is chrome and is not indexed, else the site's eyebrow — a
// <p> before any anchor, with no <p> on the source — takes the first place that says its words,
// the crumb. The row is written the way a canvas export writes it: every separator its own span,
// NO whitespace between the crumbs (the flex gap draws the spacing) — read as one string it is
// "Home/News/Production building", and a rule that wants whitespace around the separator sees
// none (full-3 lost the project eyebrow to exactly that, 8 rows).
// A link whose words carry Russian guillemets («…» twice) is NOT a crumb row: the separator must
// stand alone between words (ru-news at fast-16 lost its featured title to this rule). Nor is a
// job row whose slashes sit inside its OWN words two boxes down ("steel / concrete", "Moscow /
// hybrid"): the separators are counted at the row's own level, else the careers table's six
// "Apply →" links left the index (full-4).
const sourcePage = () => `<!doctype html><html lang="en"><head><style>${CSS}</style></head><body><div><div style="font-size:13.5px"><a href="#"><span>Home</span></a><span>/</span><a href="#"><span>News</span></a><span>/</span><span style="font-weight:500"><span>Production building</span></span></div><div class="eyebrow"><span>Production building</span></div><h1>Building the groundwork</h1><p class="lead">Design-build main contractor for industrial parks.</p><div class="card">${words}</div><image-slot src="/pic.png"></image-slot><a href="#">Read the case study</a> <div><a href="#">«Норткейт» выиграл конкурс «Заволжье-2»</a></div><div><div><div><span>Structural engineer (steel / concrete)</span></div><div><span>Moscow / hybrid</span></div></div><a href="#"><span>Apply →</span></a></div></div></body></html>`
// a 1x1 png
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

function serve(dir) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const u = new URL(req.url, 'http://x')
      let p = decodeURIComponent(u.pathname)
      if (p.endsWith('/')) p += 'index.html'
      const file = path.join(dir, p)
      if (!existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end('<html lang="en"><body class="tracy-page-page"><main><h1>Not found</h1></main></body></html>')
        return
      }
      res.writeHead(200, { 'content-type': p.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' })
      res.end(readFileSync(file))
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

function fixture(defects = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'vqa-'))
  const site = path.join(root, 'site')
  const spec = path.join(root, 'spec')
  mkdirSync(path.join(site, 'about'), { recursive: true })
  mkdirSync(path.join(spec, 'reference', 'rendered'), { recursive: true })
  writeFileSync(path.join(site, 'index.html'), page({ ...defects }))
  writeFileSync(path.join(site, 'about', 'index.html'), page({ ...defects }))
  writeFileSync(path.join(site, 'pic.png'), PNG)
  writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), sourcePage())
  writeFileSync(path.join(spec, 'reference', 'pic.png'), PNG)
  const reference = { kind: 'html', pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }
  writeFileSync(path.join(spec, 'reference.json'), JSON.stringify(reference))
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  // The fixture's source carries the same `html[data-theme=dark]` rules the site does, so the
  // page-map declares that hook: the contract passes it on as source.darkHook and a dark axis
  // compares dark against dark. Drop it and dark parity is not measured at all — which is the
  // point of `a dark axis with no dark source is not measured` below.
  const pageMap = {
    locales: ['en'],
    defaultLocale: 'en',
    theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } },
    pages: [{ file: 'About.html', view: 'page', title: 'Building the groundwork', path: '/about/', locale: 'en' }]
  }
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify(pageMap))
  const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page' } }, themeTemplates: new Set(['page']), specHash: specHash(spec), id: 'mock' })
  const contractFile = path.join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  return { root, site, spec, contractFile, contract }
}

const runOn = async (fx, origin, extra = {}) => {
  const out = path.join(fx.root, `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  let report = null
  let error = null
  try {
    report = await run({ contract: fx.contractFile, site: origin, out, spec: fx.spec, sourceSite: null, concurrency: 1, megaItems: '.none', ...extra })
  } catch (e) {
    error = e
  }
  return { report, error, out }
}
const kinds = (report) => report.pages.flatMap((p) => p.findings.map((f) => f.kind))

test('visual-qa: diffProperty tolerates ±8 colour and ±1 px, first font family, keywords', () => {
  assert.equal(diffProperty('color', 'rgb(20, 23, 26)', 'rgb(24, 20, 30)'), null)
  assert.ok(diffProperty('color', 'rgb(20, 23, 26)', 'rgb(40, 23, 26)'))
  assert.equal(diffProperty('font-size', '40px', '40.5px'), null)
  assert.ok(diffProperty('font-size', '40px', '44px'))
  assert.equal(diffProperty('font-family', 'Archivo, sans-serif', '"Archivo", system-ui'), null)
  assert.equal(diffProperty('line-height', 'normal', '22px'), null)
})

test('visual-qa: parity by words — same words measured, different values are findings, words absent on the source are unclassified', () => {
  const site = [
    { tag: 'h1', cls: 'x', text: 'Hello world', styles: { color: 'rgb(0, 0, 0)', 'font-size': '40px' } },
    { tag: 'p', cls: '', text: 'Only here', styles: { color: 'rgb(0, 0, 0)', 'font-size': '16px' } }
  ]
  const src = { 'Hello world': [{ tag: 'div', styles: { color: 'rgb(0, 0, 0)', 'font-size': '40px' } }, { tag: 'h1', styles: { color: 'rgb(0, 0, 0)', 'font-size': '50px' } }] }
  const r = parityByText(site, src, { properties: ['color', 'font-size'] })
  assert.equal(r.components.length, 1)
  assert.deepEqual(r.findings[0].deltas, [{ property: 'font-size', expected: '50px', observed: '40px' }])
  assert.deepEqual(r.unclassified, ['p "Only here"'])
})

test('visual-qa: parity findings retain structured subject and differing property names', () => {
  const site = [{ tag: 'h1', cls: 'x', text: 'Hello world', styles: { color: 'black', 'font-size': '40px' } }]
  const source = { 'Hello world': [{ tag: 'h1', styles: { color: 'black', 'font-size': '50px' } }] }
  const { findings } = parityByText(site, source, { properties: ['color', 'font-size'] })
  assert.deepEqual(findings[0].subject, { selector: 'h1.x', text: 'Hello world' })
  assert.deepEqual(findings[0].properties, ['font-size'])
})

// Gotcha 12: an archetype class painted the hero words in the page background colour — white on
// white in light, dark on dark in dark. Parity compares each word's colour with the source's on every
// axis that reads a source, light and dark alike, so the hero is a finding in either mode.
test('parity: hero words in the page background colour are a colour finding against the source, light and dark', () => {
  const hero = (color) => [{ tag: 'h1', cls: 'hero__title', text: 'Build faster together', styles: { color } }]
  const src = (color) => ({ 'Build faster together': [{ tag: 'h1', styles: { color } }] })
  const light = parityByText(hero('rgb(255, 255, 255)'), src('rgb(20, 23, 26)'), { properties: ['color'] })
  assert.deepEqual(light.findings[0].deltas, [{ property: 'color', expected: 'rgb(20, 23, 26)', observed: 'rgb(255, 255, 255)' }])
  const dark = parityByText(hero('rgb(18, 18, 18)'), src('rgb(241, 243, 246)'), { properties: ['color'] })
  assert.deepEqual(dark.findings[0].deltas, [{ property: 'color', expected: 'rgb(241, 243, 246)', observed: 'rgb(18, 18, 18)' }])
  assert.deepEqual(parityByText(hero('rgb(20, 23, 26)'), src('rgb(20, 23, 26)'), { properties: ['color'] }).findings, [])
})

test('visual-qa: axes order desktop→mobile, light→dark; shot consumers follow the layout representative', async () => {
  const fx = fixture()
  const c = fx.contract
  assert.deepEqual(axesFor(c, c.pages[0]).map((v) => v.id), ['1440-light', '1440-dark', '390-light', '390-dark'])
  assert.deepEqual(consumersFor(c, c.pages[0], { id: '1440-light' }, 'site'), ['layout', 'typography', 'color', 'images', 'interaction'])
  // The fixture's source has a dark of its own (page-map theme hook): the dark stage shoots it for its lenses (#19 item 6).
  assert.deepEqual(consumersFor(c, c.pages[0], { id: '1440-dark' }, 'source'), ['color', 'layout'])
  const { deriveShots } = await import('../visual/fast-gate.mjs')
  const noDark = { ...c, source: { ...c.source, darkHook: null } }
  noDark.visual = { ...c.visual, shots: deriveShots(noDark) }
  assert.deepEqual(consumersFor(noDark, noDark.pages[0], { id: '1440-dark' }, 'source'), null, 'no source picture on a dark stage when the source has no dark')
  // a page picked for its own findings is pictured for the sampled lenses in a locale no shot lists
  const other = { ...c.pages[0], id: 'xx-other', locale: 'xx' }
  assert.equal(consumersFor(c, other, { id: '1440-light' }, 'site'), null, 'not a representative')
  assert.deepEqual(consumersFor(c, other, { id: '1440-light' }, 'site', { sampled: true }), ['layout', 'color'])
})

let clean
let cleanFx
before(async () => {
  cleanFx = fixture()
  clean = await serve(cleanFx.site)
})
after(async () => {
  await clean?.close()
})

test('visual-qa: a clean page passes light-desktop with components measured and 0 unclassified; the dark stage then runs its scanners', async () => {
  const { report, error, out } = await runOn(cleanFx, clean.origin, { stage: 'light-desktop,dark-desktop', allStages: true })
  assert.equal(error, null, error?.message)
  const light = report.pages[0].axes.find((a) => a.variant === '1440-light')
  assert.ok(light.components.length >= 3, JSON.stringify(light.findings).slice(0, 500))
  assert.deepEqual(light.findings, [])
  assert.equal(light.coverage.unclassified.length, 0)
  // the >120-character paragraph is one of the classified components (see LONG)
  assert.ok(light.components.some((c) => c.element.includes('A heavy machine foundation')), 'the long paragraph is classified')
  assert.ok(existsSync(path.join(out, light.screenshot)) && existsSync(path.join(out, light.sourceScreenshot)), 'site and source pictures exist')
  const dark = report.pages[0].axes.find((a) => a.variant === '1440-dark')
  assert.ok(dark.scans['white-surface'] && dark.scans.contrast, 'dark axis ran the scanners')
  assert.equal(report.summary.stages['light-desktop'], 'pass')
})

test('visual-qa: reference.kind=none records source checks N/A and keeps target overflow, broken image and dark checks', async () => {
  const fx = fixture()
  const target = path.join(fx.site, 'about', 'index.html')
  const html = readFileSync(target, 'utf8').replace('</head>', '<style>html[data-theme=dark] .leak{background:white}main{width:2000px}</style></head>').replace('</main>', '<div style="width:2000px;height:2px">wide target</div><img src="/missing-target.png"><div class="leak">light surface in dark mode</div></main>')
  writeFileSync(target, html)
  writeFileSync(path.join(fx.spec, 'reference.json'), JSON.stringify({ kind: 'none', pages: [] }))
  const currentSpecHash = specHash(fx.spec)
  const contract = { ...fx.contract, pages: fx.contract.pages.map((p) => ({ ...p, referenceKind: 'none', sourceRendered: null })) }
  contract.source = { ...contract.source, hash: currentSpecHash }
  contract.bindings = { ...contract.bindings, specHash: currentSpecHash }
  contract.visual = { ...contract.visual, shots: deriveShots(contract) }
  writeFileSync(fx.contractFile, JSON.stringify(contract))
  const srv = await serve(fx.site)
  let report
  try {
    const result = await runOn(fx, srv.origin, { stage: 'light-desktop,dark-desktop' })
    report = result.report
    assert.equal(result.error, null, result.error?.message)
  } finally { await srv.close() }
  const light = report.pages[0].axes.find((a) => a.variant === '1440-light')
  const dark = report.pages[0].axes.find((a) => a.variant === '1440-dark')
  assert.deepEqual(new Set(light.notApplicable.map((x) => x.check)), new Set(SOURCE_DEPENDENT_CHECKS))
  assert.ok(light.findings.some((f) => f.kind === 'horizontal-overflow'), JSON.stringify(light.findings))
  assert.ok(light.findings.some((f) => f.kind === 'image-broken'), JSON.stringify(light.findings))
  assert.ok(dark.findings.some((f) => f.kind.startsWith('scan:')), JSON.stringify(dark.findings))
  assert.equal(report.summary.notApplicable['content-parity'], 2)
  assert.ok(!report.summary.menus.unmeasuredAxes.some((x) => x.includes('no source')))
})

test('visual-qa: a none page still fails when its target container selector is not measured', async () => {
  const fx = fixture()
  writeFileSync(path.join(fx.spec, 'reference.json'), JSON.stringify({ kind: 'none', pages: [] }))
  const currentSpecHash = specHash(fx.spec)
  const contract = {
    ...fx.contract,
    pages: fx.contract.pages.map((page) => ({ ...page, referenceKind: 'none', sourceRendered: null, sourceRoute: null })),
    source: { ...fx.contract.source, hash: currentSpecHash },
    bindings: { ...fx.contract.bindings, specHash: currentSpecHash },
    design: { ...fx.contract.design, containers: { breakpoints: [390], themes: ['light'], tolerance: 1, height: 900, evidence: 'fixture breakpoint', items: [{ id: 'main', source: 'main', site: '.missing-container', pages: ['en-about'], layouts: ['page'] }] } }
  }
  contract.visual = { ...contract.visual, shots: deriveShots(contract) }
  writeFileSync(fx.contractFile, JSON.stringify(contract))
  const srv = await serve(fx.site)
  try {
    const result = await runOn(fx, srv.origin, { stage: 'light-responsive' })
    assert.equal(result.error, null, result.error?.message)
    const axis = result.report.pages[0].axes.find((a) => a.variant === '390-light')
    assert.ok(axis.findings.some((f) => f.kind === 'container-not-measured' && f.side === 'site'), JSON.stringify(axis.findings))
    assert.equal(axis.containers.rows[0].status, 'not-measured')
  } finally { await srv.close() }
})

test('visual-qa carries sourceShared scan measurements through visual.json into VISUAL.md', async () => {
  const fx = fixture()
  const siteFile = path.join(fx.site, 'about', 'index.html')
  const sourceFile = path.join(fx.spec, 'reference', 'rendered', 'about--1440-light.html')
  const inject = (file, color, cls) => writeFileSync(file, readFileSync(file, 'utf8').replace('</body>', `<div class="${cls}" style="background:rgb(${color})"><span>Shared scan surface words</span></div></body>`))
  inject(siteFile, '246,246,246', 'site-shared-surface')
  inject(sourceFile, '250,250,250', 'source-shared-surface')
  const srv = await serve(fx.site)
  try {
    const { report, error, out } = await runOn(fx, srv.origin, { stage: 'dark-desktop', allStages: true })
    assert.equal(error, null, error?.message)
    const axis = report.pages[0].axes.find((a) => a.variant === '1440-dark')
    const probe = axis.scans['white-surface'].sourceShared.find((row) => row.siteComponent === 'DIV.site-shared-surface')
    assert.deepEqual(probe.site, { value: 'rgb(246,246,246)' })
    assert.deepEqual(probe.source, { value: 'rgb(250,250,250)' })
    const evidence = JSON.parse(readFileSync(path.join(out, 'visual.json'), 'utf8'))
    assert.deepEqual(evidence.pages[0].axes.find((a) => a.variant === '1440-dark').scans['white-surface'].sourceShared, axis.scans['white-surface'].sourceShared)
    const md = readFileSync(path.join(out, 'VISUAL.md'), 'utf8')
    assert.match(md, /source-shared DIV\.site-shared-surface ↔ DIV\.source-shared-surface: site rgb\(246,246,246\), source rgb\(250,250,250\)/)
  } finally {
    await srv.close()
  }
})

test('visual-qa: defects fail by name — size off the source, hover jump, missing picture, dark stuck light', async () => {
  for (const [defects, kind, stage] of [
    [{ h1Size: 52 }, 'parity-mismatch', 'light-desktop'],
    [{ jumpy: true }, 'scan:hover-jump', 'light-desktop'],
    [{ img: false }, 'image-missing', 'light-desktop'],
    [{ leak: true, dark: false }, 'scan:white-surface', 'dark-desktop']
  ]) {
    const fx = fixture(defects)
    const srv = await serve(fx.site)
    try {
      const { report, error } = await runOn(fx, srv.origin, { stage, allStages: true })
      assert.equal(error, null, error?.message)
      assert.ok(kinds(report).includes(kind), `${JSON.stringify(defects)} → expected ${kind}, got ${JSON.stringify(kinds(report))}`)
    } finally {
      await srv.close()
    }
  }
})

test('visual-qa: a failing light stage leaves dark not-run; --reuse takes an unchanged CLEAN page from the earlier run and measures a failing one again', async () => {
  const bad = fixture({ h1Size: 52 })
  const srv = await serve(bad.site)
  try {
    const first = await runOn(bad, srv.origin)
    assert.equal(first.report.summary.stages['light-desktop'], 'fail')
    assert.equal(first.report.summary.stages['dark-desktop'], 'not-run')
    // the page is unchanged and still failing: its verdict may be the tool's, so it is measured again
    const second = await runOn(bad, srv.origin, { reuse: [first.out], stage: 'light-desktop' })
    assert.equal(second.report.summary.reused, 0)
    assert.equal(second.report.pages[0].axes[0].measured, 'now')
    // the same out dir is never reused for a new run
    const again = await run({ contract: bad.contractFile, site: srv.origin, out: second.out, spec: bad.spec, concurrency: 1 }).catch((e) => e)
    assert.match(String(again.message), /never overwrites/)
  } finally {
    await srv.close()
  }
  const good = fixture()
  const srv2 = await serve(good.site)
  try {
    const first = await runOn(good, srv2.origin, { stage: 'light-desktop' })
    assert.equal(first.report.summary.stages['light-desktop'], 'pass')
    const second = await runOn(good, srv2.origin, { reuse: [first.out], stage: 'light-desktop' })
    assert.equal(second.report.summary.reused, 1)
    assert.equal(second.report.pages[0].axes[0].measured, 'reused')
    const index = JSON.parse(readFileSync(path.join(second.out, 'index.json'), 'utf8'))
    assert.ok(index.shots.every((s) => s.file.startsWith(first.out)), 'reused pictures point at the earlier run')
    assert.ok(existsSync(path.join(second.out, 'notes', 'machine.json')))
  } finally {
    await srv2.close()
  }
})

test('visual-qa: an exception with a cited decision moves a finding to accepted; a page that renders almost nothing fails', async () => {
  const fx = fixture({ h1Size: 52 })
  const c = JSON.parse(readFileSync(fx.contractFile, 'utf8'))
  c.design.exceptions.push({ kind: 'parity-mismatch', match: 'Building the groundwork', key: 'Building the groundwork', routes: ['/about/'], selector: 'h1', reason: 'display size is a design decision', decision: 'D-14' })
  writeFileSync(fx.contractFile, JSON.stringify(c))
  // the exception cites a decision that exists and is about it (lib/parity-acceptance.mjs)
  writeFileSync(path.join(path.dirname(fx.contractFile), 'DECISIONS.md'), '| D-14 | The h1 "Building the groundwork" display size is a design decision | OPEN |\n')
  const srv = await serve(fx.site)
  try {
    const { report } = await runOn(fx, srv.origin, { stage: 'light-desktop' })
    assert.equal(report.summary.accepted, 1)
    assert.ok(!kinds(report).includes('parity-mismatch'))
  } finally {
    await srv.close()
  }
  const tiny = fixture()
  writeFileSync(path.join(tiny.site, 'about', 'index.html'), '<html lang="en"><body class="tracy-page-page"><main><h1>Building the groundwork</h1></main></body></html>')
  const srv2 = await serve(tiny.site)
  try {
    const { report } = await runOn(tiny, srv2.origin, { stage: 'light-desktop' })
    assert.ok(kinds(report).includes('examined-too-few'))
  } finally {
    await srv2.close()
  }
})

test('visual-qa: the run reads the run-root canonical only — a sibling contract stops it, a stale contract stops it, and the report names the canonical path and hash', async () => {
  const fx = fixture()
  const runRoot = fx.root
  const canonical = path.join(runRoot, 'visual.contract.json')
  const srv = await serve(fx.site)
  try {
    // a second contract beside the canonical: refused, never picked
    writeFileSync(path.join(runRoot, 'visual.contract-pilot.json'), readFileSync(canonical, 'utf8'))
    const r1 = await runOn(fx, srv.origin, { contract: null, runRoot, stage: 'light-desktop' })
    assert.match(String(r1.error?.message), /more than one visual contract beside the canonical/)
    const { unlinkSync } = await import('node:fs')
    unlinkSync(path.join(runRoot, 'visual.contract-pilot.json'))
    // the canonical, by run-root: the report points at it
    const r2 = await runOn(fx, srv.origin, { contract: null, runRoot, stage: 'light-desktop' })
    assert.equal(r2.error, null, r2.error?.message)
    assert.equal(r2.report.identity.contractPath, canonical)
    assert.equal(r2.report.identity.canonical, true)
    assert.ok(r2.report.identity.contractHash.startsWith('sha256:') && r2.report.identity.sourceHash && r2.report.identity.capturedAt)
    assert.match(readFileSync(path.join(r2.out, 'VISUAL.md'), 'utf8'), /Contract: `.*visual\.contract\.json` \(canonical\)/)
    // the spec-pack moved on: the canonical is stale and the run refuses it
    writeFileSync(path.join(fx.spec, 'content.json'), '{"changed":1}')
    const r3 = await runOn(fx, srv.origin, { contract: null, runRoot, stage: 'light-desktop' })
    assert.match(String(r3.error?.message), /stale/)
    const r4 = await runOn(fx, srv.origin, { contract: null, runRoot, stage: 'light-desktop', allowStale: true })
    assert.ok(r4.report?.summary.stale?.length, '--allow-stale runs but the report says stale')
  } finally {
    await srv.close()
  }
})

test('visual-qa: fontFallbacks flags a requested family the renderer did not draw; generic families and allowed fallbacks pass', async () => {
  const { fontFallbacks } = await import('../visual/visual-qa.mjs')
  const bad = fontFallbacks([
    { selector: 'h1', requested: 'Newsreader, serif', used: 'Times' },
    { selector: 'p', requested: 'system-ui, sans-serif', used: 'Helvetica Neue' },
    { selector: 'a', requested: 'Archivo, sans-serif', used: 'Archivo' },
    { selector: 'code', requested: '"SF Mono", Menlo', used: 'SF Mono' }
  ])
  assert.deepEqual(bad.map((b) => b.requested), ['newsreader'])
  assert.deepEqual(fontFallbacks([{ selector: 'h1', requested: 'Newsreader, serif', used: 'Times' }], ['Times']), [])
})

test('visual-qa: a page whose CSS asks for a font that is not shipped gets font-not-loaded on the light desktop axis', async () => {
  const fx = fixture()
  writeFileSync(path.join(fx.site, 'about', 'index.html'), page({}).replace('font-family:Arial', 'font-family:"Nope Sans Xyz",Arial'))
  const srv = await serve(fx.site)
  try {
    const { report } = await runOn(fx, srv.origin, { stage: 'light-desktop' })
    assert.ok(kinds(report).includes('font-not-loaded'), JSON.stringify(kinds(report)))
  } finally {
    await srv.close()
  }
})

test('visual-qa: every consumed picture is cut into tiles a reader can see (index.json `tiles`, --tile-height); reused pictures point at the earlier run\'s tiles; the summary counts distinct findings beside the raw sum', async () => {
  const fx = fixture({})
  const srv = await serve(fx.site)
  try {
    const first = await runOn(fx, srv.origin, { stage: 'light-desktop', tileHeight: 300 })
    assert.equal(first.error, null, first.error?.message)
    const index = JSON.parse(readFileSync(path.join(first.out, 'index.json'), 'utf8'))
    const site = index.shots.find((s) => s.side === 'site')
    const source = index.shots.find((s) => s.side === 'source')
    assert.ok(site.tiles.length >= 2 && site.tiles.every((t) => t.startsWith(path.join(first.out, 'shots', 'en-about--1440-light')) && existsSync(t)), JSON.stringify(site))
    assert.ok(source.tiles.length >= 2 && source.tiles.every(existsSync), 'the rendered source is tiled too')
    const second = await runOn(fx, srv.origin, { stage: 'light-desktop', tileHeight: 300, reuse: [first.out] })
    const index2 = JSON.parse(readFileSync(path.join(second.out, 'index.json'), 'utf8'))
    assert.ok(index2.shots.every((s) => s.tiles.length >= 2 && s.tiles.every((t) => t.startsWith(first.out) && existsSync(t))), 'tiles referenced, not copied')
    assert.equal(first.report.summary.distinct, 0)
  } finally {
    await srv.close()
  }
  const bad = fixture({ h1Size: 52 })
  const srv2 = await serve(bad.site)
  try {
    const r = await runOn(bad, srv2.origin, { stage: 'light-desktop,dark-desktop', allStages: true })
    assert.ok(r.report.summary.findings >= 2, 'the same h1 mismatch on light and dark')
    assert.ok(r.report.summary.distinct >= 1 && r.report.summary.distinct < r.report.summary.findings, `distinct ${r.report.summary.distinct} < findings ${r.report.summary.findings}`)
  } finally {
    await srv2.close()
  }
})

test('visual-qa: a page of the layout with a finding its representative does not have is shot for the layout and colour lenses only, and the lens plan reads it; a page failing like its representative is not shot', async () => {
  const fx = fixture({})
  // two more pages on the representative's layout: /team/ fails on its own (h1 52 px), /jobs/ is clean
  for (const [slug, defects] of [['team', { h1Size: 52 }], ['jobs', {}]]) {
    mkdirSync(path.join(fx.site, slug), { recursive: true })
    writeFileSync(path.join(fx.site, slug, 'index.html'), page(defects))
    writeFileSync(path.join(fx.spec, 'reference', 'rendered', `${slug}--1440-light.html`), sourcePage())
  }
  const pageMap = {
    locales: ['en'],
    defaultLocale: 'en',
    theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } },
    pages: ['about', 'team', 'jobs'].map((slug) => ({ file: `${slug}.html`, view: 'page', title: 'Building the groundwork', path: `/${slug}/`, locale: 'en' }))
  }
  const reference = { pages: ['about', 'team', 'jobs'].map((slug) => ({ page: `${slug}.html`, path: `reference/rendered/${slug}--1440-light.html` })) }
  const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page', '/team/': 'page', '/jobs/': 'page' } }, themeTemplates: new Set(['page']), specHash: specHash(fx.spec), id: 'mock' })
  assert.equal(contract.layouts.length, 1)
  assert.equal(contract.layouts[0].representative, 'en-about')
  writeFileSync(fx.contractFile, JSON.stringify(contract))
  const srv = await serve(fx.site)
  try {
    const r = await runOn({ ...fx, contract }, srv.origin, { stage: 'light-desktop', tileHeight: 400 })
    assert.equal(r.error, null, r.error?.message)
    const index = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
    const team = index.shots.filter((s) => s.page === 'en-team')
    assert.deepEqual(team.map((s) => s.side).sort(), ['site', 'source'], JSON.stringify(index.shots.map((s) => [s.page, s.side])))
    assert.deepEqual(team.find((s) => s.side === 'site').consumers.sort(), ['color', 'layout'], 'the other lenses keep the representative')
    assert.ok(team.every((s) => s.tiles.length >= 1 && s.tiles.every(existsSync)))
    assert.ok(!index.shots.some((s) => s.page === 'en-jobs'), 'a clean page of the layout is not shot')
    assert.equal(r.report.pages.find((p) => p.id === 'en-team').axes[0].lensShot.representative, 'en-about')
    const m = planRun(r.out, { stage: 'light-desktop', lens: 'layout', chunks: 2 })
    assert.deepEqual(m.groups.map((g) => [g.page, g.reason]), [['en-about', 'representative'], ['en-team', 'finding']])
  } finally {
    await srv.close()
  }
})

// The expectation a scanner navigates with is PER PAGE. It used to live on the shared runtime
// config, and `run()` scans pages concurrently: a 200 page overwrote the 404 page's expectation
// mid-flight, and /404 failed with `HTTP 404 expected 200` — the harness accusing the site.
test('runtime.expectStatus: two pages in flight keep their own expected status', async () => {
  const runtime = await import('../review/runtime.mjs')
  const a = {}
  const b = {}
  runtime.expectStatus(a, 404)
  runtime.expectStatus(b, 200)
  const seen = []
  const fakePage = (marker, status) => ({
    goto: async () => {
      // yield, so the other page's expectStatus lands between goto and the check — the race
      await new Promise((r) => setImmediate(r))
      return { status: () => status }
    },
    url: () => 'http://127.0.0.1/x',
    locator: () => ({ first: () => ({ isVisible: async () => true }) }),
    evaluate: async () => undefined,
    marker
  })
  const pa = Object.assign(fakePage('a', 404), {})
  const pb = Object.assign(fakePage('b', 200), {})
  runtime.expectStatus(pa, 404)
  runtime.expectStatus(pb, 200)
  await Promise.all([
    runtime.navigate(pa, 'http://127.0.0.1/404').then(
      () => seen.push('404 ok'),
      (e) => seen.push(`404 threw ${e.message}`)
    ),
    runtime.navigate(pb, 'http://127.0.0.1/').then(
      () => seen.push('200 ok'),
      (e) => seen.push(`200 threw ${e.message}`)
    )
  ])
  assert.deepEqual(seen.sort(), ['200 ok', '404 ok'])
})

// A dark axis compares against the source IN DARK. The rendered snapshot is the export's light
// DOM; it goes dark through the export's own hook, and when the export has none there is nothing
// to compare with — the axis says so instead of reporting every colour as a mismatch.
test('a dark axis with no dark source is not measured, not failed', async () => {
  const fx = fixture({})
  // the runner reads the contract from the file, so the export's hook is dropped there
  const noDark = JSON.parse(readFileSync(fx.contractFile, 'utf8'))
  noDark.source = { ...noDark.source, darkHook: null }
  const noDarkFile = path.join(fx.root, 'no-dark.contract.json')
  writeFileSync(noDarkFile, JSON.stringify(noDark, null, 2))
  const srv = await serve(fx.site)
  try {
    const r = await runOn({ ...fx, contractFile: noDarkFile }, srv.origin, { stage: 'dark-desktop', allStages: true })
    const dark = r.report.pages.flatMap((p) => p.axes).filter((a) => a.variant.endsWith('-dark'))
    assert.ok(dark.length, 'a dark axis ran')
    for (const a of dark) {
      assert.equal(a.parity?.measured, false, JSON.stringify(a.parity))
      assert.match(a.parity.reason, /no dark of its own/)
      assert.deepEqual((a.findings ?? []).filter((f) => f.kind === 'parity-mismatch'), [])
    }
  } finally {
    await srv.close()
  }
})

// A paragraph longer than 120 characters is still one element with one set of words: the snapshot
// used to cut its text there, the source index is keyed by the full words, and every body paragraph
// of an article came back unclassified (216 rows on wp-tracy-business, 15/09).
test('parity: a long paragraph is classified by its full words, not a 120-character prefix', () => {
  const long = 'A heavy machine foundation is not simply a bigger block of concrete. It is a vibrating system with its own natural frequency, and the designer’s job is to keep that frequency well away from the operating range.'
  assert.ok(long.length > 120)
  const site = [{ tag: 'p', cls: '', text: long, styles: { color: 'rgb(20, 23, 26)' } }]
  const index = { [long]: [{ tag: 'p', styles: { color: 'rgb(20, 23, 26)' } }] }
  const r = parityByText(site, index, { properties: ['color'], hexTolerance: 8, pxTolerance: 1 })
  assert.deepEqual(r.unclassified, [])
  assert.equal(r.classified, 1)
})

// Repeated words on the source are resolved by where the page is, not by tag alone: the closing
// call's "Request a quote" met the header button, the ink call's "Services" the nav link, the
// stat label "Open roles" the section title of the same words (full-2, 15/09: 68 rows).
test('parity: a repeat pairs with the first source place after the last anchor, same tag first; a place already taken goes to the next; an index without positions keeps the old rule', () => {
  const st = (o) => ({ color: 'rgb(0, 0, 0)', 'font-size': '16px', ...o })
  const index = {
    'Request a quote': [
      { tag: 'a', styles: st({ 'background-color': 'rgb(20, 72, 58)' }), order: 5, place: 1 },
      { tag: 'span', styles: st({ 'background-color': 'rgba(0, 0, 0, 0)' }), order: 6, place: 1 },
      { tag: 'a', styles: st({ 'background-color': 'rgb(218, 90, 42)' }), order: 90, place: 9 },
      { tag: 'span', styles: st({ 'background-color': 'rgba(0, 0, 0, 0)' }), order: 91, place: 9 }
    ],
    'Open roles': [
      { tag: 'div', styles: st({ 'font-size': '13px' }), order: 40, place: 4 },
      { tag: 'span', styles: st({ 'font-size': '13px' }), order: 41, place: 4 },
      { tag: 'h2', styles: st({ 'font-size': '36px' }), order: 60, place: 6 },
      { tag: 'span', styles: st({ 'font-size': '36px' }), order: 61, place: 6 }
    ],
    'Apply →': [
      { tag: 'div', styles: st({ 'font-size': '16px' }), order: 62, place: 7 },
      { tag: 'a', styles: st({ 'font-size': '14px' }), order: 65, place: 8 },
      { tag: 'a', styles: st({ 'font-size': '14px' }), order: 70, place: 10 }
    ],
    '19': [{ tag: 'div', styles: st({ 'font-size': '34px' }), order: 38, place: 3 }],
    'Planning?': [{ tag: 'h2', styles: st({ 'font-size': '32px' }), order: 85, place: 8 }]
  }
  const site = [
    { tag: 'p', cls: 'n', text: '19', styles: st({ 'font-size': '34px' }) },
    { tag: 'p', cls: 'label', text: 'Open roles', styles: st({ 'font-size': '13px' }) },
    { tag: 'h2', cls: '', text: 'Open roles', styles: st({ 'font-size': '36px' }) },
    { tag: 'a', cls: '', text: 'Apply →', styles: st({ 'font-size': '14px' }) },
    { tag: 'a', cls: '', text: 'Apply →', styles: st({ 'font-size': '14px' }) },
    { tag: 'h2', cls: '', text: 'Planning?', styles: st({ 'font-size': '32px' }) },
    { tag: 'a', cls: 'btn', text: 'Request a quote', styles: st({ 'background-color': 'rgb(218, 90, 42)' }) }
  ]
  const r = parityByText(site, index, { properties: ['color', 'font-size', 'background-color'], hexTolerance: 8, pxTolerance: 1 })
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings))
  assert.equal(r.classified, 7)
  // Without positions: the same tag, else the last hit — the old rule.
  const flat = { 'Request a quote': index['Request a quote'].map(({ tag, styles }) => ({ tag, styles })) }
  const old = parityByText([site[6]], flat, { properties: ['background-color'], hexTolerance: 8, pxTolerance: 1 })
  assert.equal(old.findings.length, 1)
})

// A dropped section is counted PER OCCURRENCE. The source draws "Reviews" over two blocks; the
// site keeping one of them and dropping the other is a dropped section just as much as dropping
// the only one — and the earlier rule ("is ANY occurrence claimed?") went silent on exactly that.
test('parity: a heading the source draws twice and the site draws once is reported, with the count', () => {
  const st = { color: 'rgb(0, 0, 0)', 'font-size': '30px' }
  const twice = {
    Reviews: [
      { tag: 'h2', styles: st, order: 10, place: 1, inSiteScope: true },
      { tag: 'h2', styles: st, order: 50, place: 5, inSiteScope: true }
    ]
  }
  const opts = { properties: ['color', 'font-size'], hexTolerance: 8, pxTolerance: 1 }
  const one = parityByText([{ tag: 'h2', cls: '', text: 'Reviews', styles: st }], twice, opts)
  const dropped = one.findings.filter((f) => f.kind === 'parity-not-measured')
  assert.equal(dropped.length, 1, JSON.stringify(one.findings))
  assert.match(dropped[0].element, /1 of 2 occurrences/)

  // Control: the site draws both — nothing is missing, so nothing is reported.
  const both = parityByText(
    [{ tag: 'h2', cls: '', text: 'Reviews', styles: st }, { tag: 'h2', cls: '', text: 'Reviews', styles: st }],
    twice,
    opts
  )
  assert.deepEqual(both.findings.filter((f) => f.kind === 'parity-not-measured'), [], JSON.stringify(both.findings))

  // Control: one occurrence dropped outright is still reported, and without a count nobody needs.
  const only = { Reviews: [{ tag: 'h2', styles: st, order: 10, place: 1, inSiteScope: true }] }
  const none = parityByText([], only, opts).findings.filter((f) => f.kind === 'parity-not-measured')
  assert.equal(none.length, 1)
  assert.equal(none[0].element, 'h2 "Reviews"')
})

test('visual-qa: a browser that dies mid-run is restarted and the axes it took down are measured again in the same run, marked as retried', async () => {
  const { chromium } = await import('playwright')
  let launches = 0
  // The first browser dies once the axis has opened its context — the shape of a Chromium crash
  // mid-run, which used to turn every axis still queued into axis-error until the run ended.
  const launch = async () => {
    launches++
    const b = await chromium.launch({ headless: true })
    if (launches === 1) {
      const newContext = b.newContext.bind(b)
      b.newContext = async (o) => {
        const ctx = await newContext(o)
        await b.close()
        return ctx
      }
    }
    return b
  }
  const { report, error, out } = await runOn(cleanFx, clean.origin, { stage: 'light-desktop', launch })
  assert.equal(error, null, error?.message)
  const light = report.pages[0].axes.find((a) => a.variant === '1440-light')
  assert.deepEqual(light.findings, [], 'the retried axis carries the clean result, not the axis-error')
  assert.ok(light.retry && light.retry.recovered, JSON.stringify(light.retry))
  assert.ok(light.retry.errors.length >= 1, 'the first error is kept')
  assert.ok(launches >= 2, `browser relaunched (${launches} launches)`)
  assert.equal(report.summary.retried, 1)
  assert.equal(report.summary.retryRecovered, 1)
  assert.match(readFileSync(path.join(out, 'VISUAL.md'), 'utf8'), /Retried in this run after axis-error: 1 axis\(es\), 1 recovered/)
  const saved = JSON.parse(readFileSync(path.join(out, 'visual.json'), 'utf8'))
  assert.equal(saved.summary.retried, 1)
})

test('visual-qa: --axis-retries 0 keeps the axis-error of a dead browser, and a clean run reports no retries', async () => {
  const { chromium } = await import('playwright')
  const dying = async () => {
    const b = await chromium.launch({ headless: true })
    await b.close()
    return b
  }
  const { report, error } = await runOn(cleanFx, clean.origin, { stage: 'light-desktop', launch: dying, axisRetries: 0 })
  assert.equal(error, null, error?.message)
  assert.ok(kinds(report).includes('axis-error'))
  assert.equal(report.summary.retried, 0)
  const ok = await runOn(cleanFx, clean.origin, { stage: 'light-desktop' })
  assert.equal(ok.report.summary.retried, 0)
  assert.deepEqual(ok.report.summary.retriedAxes, [])
})

// ── JA Vega M4 (26/09): what a reader sees, which element draws it, what a pointer can reach ────
// In-page functions run on a page set from a string; the pure ones run bare. New exports are read
// through the namespace so a missing one fails its own test, not the file.
const vqa = await import('../visual/visual-qa.mjs')
const { withBrowser, withTimeout } = await import('../lib/browser.mjs')
const onPage = (html, fn, viewport = { width: 1440, height: 900 }) =>
  withBrowser(async (b) => {
    const p = await b.newPage({ viewport })
    await p.setContent(html)
    return fn(p)
  })
const SR = '.screen-reader-text{border:0;clip:rect(1px,1px,1px,1px);clip-path:inset(50%);height:1px;margin:-1px;overflow:hidden;padding:0;position:absolute;width:1px;word-wrap:normal!important}'

test('visual census: excludes carousel clones, clipped screen-reader text, and closed-panel copies while counting unlabeled controls', async () => {
  const fx = fixture()
  writeFileSync(path.join(fx.site, 'index.html'), `<!doctype html><html><head><style>${SR}</style></head><body>
    <main>
      <div class="owl-item cloned"><p>Carousel clone words</p></div>
      <p class="screen-reader-text">Screen reader only words</p>
      <p style="position:absolute;width:100px;height:100px;clip-path:inset(100%)">Fully inset words</p>
      <p style="position:absolute;width:100px;height:100px;clip-path:inset(50%)">Half inset words</p>
      <p style="position:absolute;width:100px;height:100px;clip-path:inset(0 50%)">Horizontally inset words</p>
      <p style="position:absolute;width:100px;height:100px;clip-path:inset(calc(50% + 1px))">Calculated inset words</p>
      <p style="position:absolute;width:100px;height:100px;clip:rect(1px,1px,1px,1px)">Tiny clipped rect words</p>
      <section aria-hidden="true"><p>Closed panel copy</p></section>
      <p>Visible content words</p>
      <button type="button"></button>
      <input type="text">
    </main>
  </body></html>`)
  const srv = await serve(fx.site)
  const { chromium } = await import('playwright')
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(srv.origin)
    assert.equal(await page.evaluate(vqa.inPageExaminedCensus), 3)
  } finally {
    await browser?.close()
    await srv.close()
  }
})

// core/read-more prints `Learn more<span class="screen-reader-text">: Database Security</span>`;
// the words a reader sees are "Learn more", and the source says exactly that (18 unclassified on ld-0).
test('visual text: words only a screen reader gets are not part of the text, on the site and in the source index', async () => {
  const html = `<style>${SR}</style><main><p><a class="wp-block-read-more" href="#">Learn more<span class="screen-reader-text">: Database Security</span></a></p><p>Visible <span>suffix</span> stays</p><h2>Plain heading here</h2></main>`
  const [snap, idx] = await onPage(html, (p) =>
    Promise.all([
      p.evaluate(vqa.inPageSnapshot, { coverageSelectors: 'main a, main p, main h2', properties: ['font-size'], scope: 'main' }),
      p.evaluate(vqa.inPageTextIndex, { scope: 'body', properties: ['font-size'], slot: null, placeholder: null, siteScope: 'main' })
    ])
  )
  const texts = snap.elements.map((e) => e.text)
  assert.ok(texts.includes('Learn more'), JSON.stringify(texts))
  assert.ok(texts.includes('Visible suffix stays'), 'a visible inline child is still part of the words')
  assert.ok(!texts.some((t) => /Database Security/.test(t)), JSON.stringify(texts))
  assert.ok(idx.index['Learn more'], Object.keys(idx.index).join(' | '))
  assert.ok(!Object.keys(idx.index).some((t) => /Database Security/.test(t)))
})

// The source draws "What we do" as a 12 px pill span inside a 32 px h3; the theme draws the pill as
// the h3 itself. Pairing by tag compared the 32 px h3 with the 12 px pill (16 findings a run).
test('parity: the text styles come from the element that draws the words, the fill from the one that paints it — on both sides', async () => {
  const props = ['font-size', 'background-color', 'color']
  const pill = { 'font-size': '12px', 'background-color': 'rgb(230, 240, 255)', color: 'rgb(20, 60, 200)' }
  const index = {
    'What we do': [
      { tag: 'h3', order: 10, place: 3, styles: { 'font-size': '32px', 'background-color': 'rgba(0, 0, 0, 0)', color: 'rgb(20, 23, 26)' } },
      { tag: 'span', order: 11, place: 3, styles: pill }
    ],
    'Apply now': [
      { tag: 'a', order: 20, place: 4, styles: { 'font-size': '16px', 'background-color': 'rgb(0, 128, 0)', color: 'rgb(255, 255, 255)' } },
      { tag: 'span', order: 21, place: 4, styles: { 'font-size': '16px', 'background-color': 'rgba(0, 0, 0, 0)', color: 'rgb(255, 255, 255)' } }
    ]
  }
  const same = parityByText([{ tag: 'h3', cls: 'jv-pill', text: 'What we do', styles: pill }, { tag: 'a', cls: 'btn', text: 'Apply now', styles: { 'font-size': '16px', 'background-color': 'rgb(0, 128, 0)', color: 'rgb(255, 255, 255)' } }], index, { properties: props })
  assert.deepEqual(same.findings, [], JSON.stringify(same.findings))
  const off = parityByText([{ tag: 'h3', cls: 'jv-pill', text: 'What we do', styles: { ...pill, 'font-size': '14px' } }], index, { properties: props })
  assert.deepEqual(off.findings[0]?.deltas, [{ property: 'font-size', expected: '12px', observed: '14px' }], 'a real size difference is still one')
  // the site side: a heading whose words are drawn by one inner span is measured at the span
  const snap = await onPage('<main><h3 style="font-size:32px"><span style="font-size:12px;background:rgb(230,240,255)">What we do</span></h3><a href="#" style="display:inline-block;padding:8px;background:rgb(0,128,0)"><span>Apply now</span></a></main>', (p) =>
    p.evaluate(vqa.inPageSnapshot, { coverageSelectors: 'main h3, main a', properties: props, scope: 'main' })
  )
  const h3 = snap.elements.find((e) => e.tag === 'h3')
  assert.equal(h3.styles['font-size'], '12px')
  assert.equal(h3.styles['background-color'], 'rgb(230, 240, 255)')
  assert.equal(snap.elements.find((e) => e.tag === 'a').styles['background-color'], 'rgb(0, 128, 0)', 'the button keeps the fill it paints')
})

// ld-* at 1440: the links of a closed mega panel (visibility:hidden, translateY(8px)) were hovered
// with force and "jumped" 8 px when the panel opened; at 390 the links of the closed drawer were
// 217 `scan:hover-not-measured` a stage. What the page does not show at rest is not hovered, and
// how many were left out is said.
test('hover scan: links the page does not show at rest are not hovered, and are counted apart', async () => {
  const html = `<style>body{margin:0} header{height:80px} .panel{position:absolute;top:80px;left:0;width:400px;visibility:hidden;transform:translateY(8px)} .fade{opacity:0} .drawer{position:fixed;top:0;right:0;width:300px;height:100%;transform:translateX(100%)} .clip{height:0;overflow:hidden}</style>
  <header><a href="/" id="home">Home</a><div class="panel"><a href="/x">Mobile Apps</a></div><div class="fade"><a href="/y">Faded</a></div><nav class="drawer"><a href="/z">Drawer link</a></nav><div class="clip"><a href="/w">Clipped away</a></div></header>
  <main><a href="/c" style="position:relative">Covered but shown</a><div style="position:absolute;top:80px;left:0;width:300px;height:40px;background:#fff"></div></main>`
  const r = await onPage(html, (p) => p.evaluate(vqa.inPageHoverJump, 'main a, header a'))
  assert.deepEqual(r.targets.map((t) => t.text).sort(), ['Covered but shown', 'Home'])
  assert.equal(r.hidden, 4)
  assert.equal(r.total, 6)
})

test('mega walk: NO ITEMS is not owed only where the source shows no header and neither side has a menu, as measured (ja-restaurant S-31)', async () => {
  const contract = { source: { framework: 'T3', darkHook: null, darkDerived: true }, design: {} }
  const page = { id: 'en-404', path: '/404', status: 404 }
  const light = { id: '1440-light', theme: 'light', width: 1440, height: 900 }
  const dark = { id: '1440-dark', theme: 'dark', width: 1440, height: 900 }
  const spec = { sourceDarkHook: null, sourceDarkRequestHook: null, sourceLightHook: null, sourceDarkDerived: true }
  const census0 = { headers: 0, triggers: 0, openAtRest: 0, overCap: 0, labels: [], drawers: 0, kinds: [] }
  const base = { browser: null, contract, page, url: 'http://site/404', sourceUrl: 'http://src/404', darkHook: 'attr:data-theme=dark', spec }
  const axisWith = (site, source) => ({ menus: { measured: true, site, source } })
  // the open-state census of this axis: neither side has a header menu
  const ok = await vqa.megaNotOwed({ ...base, variant: light, axis: axisWith(census0, census0) })
  assert.match(ok.reason, /source page shows no header/)
  assert.deepEqual(ok.evidence, { site: { headers: 0, triggers: 0 }, source: { headers: 0, triggers: 0 } })
  // the source has a header, or a menu, or the port has one: the walk's finding stands
  assert.equal(await vqa.megaNotOwed({ ...base, variant: light, axis: axisWith(census0, { ...census0, headers: 1 }) }), null)
  assert.equal(await vqa.megaNotOwed({ ...base, variant: light, axis: axisWith(census0, { ...census0, headers: 1, triggers: 3 }) }), null)
  assert.equal(await vqa.megaNotOwed({ ...base, variant: light, axis: axisWith({ ...census0, headers: 1, triggers: 2 }, census0) }), null)
  // a page the contract declares at 200 owes its header whatever a census reads: never closed (review of S-31)
  for (const status of [200, undefined]) assert.equal(await vqa.megaNotOwed({ ...base, page: { ...page, status }, variant: light, axis: axisWith(census0, census0) }), null, String(status))
  // an undeclared framework (T4 assumed) may read a header as none; no source, nothing to compare
  assert.equal(await vqa.megaNotOwed({ ...base, contract: { source: {}, design: {} }, variant: light, axis: axisWith(census0, census0) }), null)
  assert.equal(await vqa.megaNotOwed({ ...base, sourceUrl: null, variant: light, axis: axisWith(census0, census0) }), null)
  // a dark axis of a source with no dark of its own: the site read in this axis, the source in light
  const asked = []
  const census = async (_b, o) => (asked.push([o.url, o.opts.theme, o.status]), { headers: 0, triggers: 0, status: 404 })
  const d = await vqa.megaNotOwed({ ...base, variant: dark, axis: { menus: { measured: false, reason: 'the source export has no dark of its own (contract.source.darkHook is null)' } }, census })
  assert.match(d.reason, /source in light/)
  assert.deepEqual(asked, [['http://site/404', 'dark', 404], ['http://src/404', 'light', 404]])
  // without the declaration, or a census that cannot be read: not decided, the finding stands
  // run() takes the declaration only fresh for --spec (spec.sourceDarkDerived): a contract that merely says so closes nothing
  assert.equal(await vqa.megaNotOwed({ ...base, spec: { ...spec, sourceDarkDerived: false }, variant: dark, axis: { menus: { measured: false } }, census }), null)
  assert.equal(await vqa.megaNotOwed({ ...base, variant: dark, axis: { menus: { measured: false } }, census: async () => { throw new Error('answered 200, expected 404') } }), null)
})

test('mega scan: a walk that died keeps its exit status and its stderr in the finding', () => {
  assert.equal(typeof vqa.megaScanOf, 'function')
  const crashed = vqa.megaScanOf({ status: 1, signal: null, stdout: '', stderr: 'file:///x/mega-hover.mjs:189\npage.evaluate: Execution context was destroyed, most likely because of a navigation\n', ms: 900, timedOut: false })
  assert.equal(crashed.ok, false)
  assert.match(crashed.tail, /exit 1/)
  assert.match(crashed.tail, /Execution context was destroyed/)
  const failed = vqa.megaScanOf({ status: 1, stdout: 'FAIL                 Resources {"opens":false}\n\n1 item(s) tested at 1440px — 1 FAIL\n', stderr: '', ms: 5, timedOut: false })
  assert.match(failed.tail, /^FAIL\s+Resources/)
  assert.match(failed.tail, /exit 1$/)
  assert.equal(vqa.megaScanOf({ status: 0, stdout: 'PASS x\n\n1 item(s) tested at 1440px — 0 FAIL\n', stderr: '', ms: 5, timedOut: false }).ok, true)
  // a summary does not hide a non-zero exit: "0 FAIL" then exit 1 keeps the status and stderr
  const lied = vqa.megaScanOf({ status: 1, stdout: 'PASS x\n\n1 item(s) tested at 1440px — 0 FAIL\n', stderr: 'Error: browser closed\n', ms: 5, timedOut: false })
  assert.equal(lied.ok, false)
  assert.match(lied.tail, /0 FAIL \| exit 1: Error: browser closed/)
  // many FAIL rows do not push the exit status and stderr out of the bounded tail
  const rows = Array.from({ length: 40 }, (_, i) => `FAIL                 Item ${i} {"opens":false,"reachable":false}`).join('\n')
  const long = vqa.megaScanOf({ status: 1, stdout: `${rows}\n\n40 item(s) tested at 1440px — 40 FAIL\n`, stderr: 'TypeError: x is null\n', ms: 5, timedOut: false })
  assert.ok(long.tail.length <= 900, long.tail.length)
  assert.match(long.tail, /^FAIL\s+Item 0/)
  assert.match(long.tail, /exit 1: TypeError: x is null$/)
  // the error line survives a long stack under it: the cause is the first line, not the last six
  const stack = Array.from({ length: 12 }, (_, i) => `    at frame${i} (file:///x/mega-hover.mjs:${100 + i}:5)`).join('\n')
  const deep = vqa.megaScanOf({ status: 1, stdout: '', stderr: `page.evaluate: Execution context was destroyed, most likely because of a navigation\n${stack}\n`, ms: 5, timedOut: false })
  assert.match(deep.tail, /exit 1: page\.evaluate: Execution context was destroyed/)
  assert.match(deep.tail, /frame11/)
  assert.ok(deep.tail.length <= 900, deep.tail.length)
  // a killed child keeps its stderr too
  assert.match(vqa.megaScanOf({ status: null, signal: 'SIGKILL', stdout: '', stderr: 'walking Item 3\n', ms: 5, timedOut: true }).tail, /killed after \d+ ms: walking Item 3/)
})

test('mega selectors: the runner walks what the contract names; a different --mega-items is refused, not silently preferred', () => {
  assert.equal(typeof vqa.megaSelectorsOf, 'function')
  const contract = { interactions: { mega: { items: '.jv-mega', trigger: '.jv-mega__trigger', panel: '.jv-mega__panel', link: '.jv-mega__panel a', open: 'hover' } } }
  assert.deepEqual(vqa.megaSelectorsOf(contract, null), { items: '.jv-mega', trigger: '.jv-mega__trigger', panel: '.jv-mega__panel' })
  assert.deepEqual(vqa.megaSelectorsOf(contract, '.jv-mega'), { items: '.jv-mega', trigger: '.jv-mega__trigger', panel: '.jv-mega__panel' })
  assert.throws(() => vqa.megaSelectorsOf(contract, '.tracy-mega'), /contract.*\.jv-mega/)
  // an older contract without items: the flag, else the Tracy default
  const older = { interactions: { mega: { trigger: '.tracy-mega__trigger', panel: '.tracy-mega__panel' } } }
  assert.equal(vqa.megaSelectorsOf(older, null).items, '.tracy-mega')
  assert.equal(vqa.megaSelectorsOf(older, '.x-mega').items, '.x-mega')
})

// ── JA Vega M4b (26/09): "Learn more" paired by tag across sections ──────────────────────────────
// The source's feature cards end in `div.feature-link "Learn more"` (blue words, no fill); three
// sections further down, `a.btn "Learn more"` is a white-on-blue button. The site's cards end in a
// link — `p.jv-card__link > a`, both in coverage. The link took the next source place holding an
// `a`: the button, 6 `parity-mismatch` on the home page every run. A repeat pairs with the source
// place between the anchor before it and the anchor after it before the tag is consulted, and the
// link inside the card's paragraph is the paragraph's place on the site, not a second one.
const learnMore = () => {
  const link = { color: 'rgb(29, 78, 216)', 'background-color': 'rgba(0, 0, 0, 0)', 'font-size': '16px' }
  const button = { color: 'rgb(255, 255, 255)', 'background-color': 'rgb(29, 78, 216)', 'font-size': '16px' }
  const index = { 'Learn more': [] }
  const site = []
  for (let i = 0; i < 3; i++) {
    const o = 100 + i * 10
    index[`Card ${i}`] = [{ tag: 'h4', order: o, place: o, styles: link }]
    index['Learn more'].push({ tag: 'div', order: o + 2, place: o + 2, styles: link })
  }
  index['Our solutions'] = [{ tag: 'h3', order: 300, place: 300, styles: link }]
  index['Learn more'].push({ tag: 'div', order: 302, place: 302, styles: button }, { tag: 'a', order: 303, place: 302, styles: button })
  return { index, link, button, site }
}
test('parity: a repeat pairs inside its own section before its tag — a card link does not take the button of another section', () => {
  const { index, link, button } = learnMore()
  const opts = { properties: ['color', 'background-color', 'font-size'], hexTolerance: 8, pxTolerance: 1 }
  // the site's card link alone (no wrapper in coverage)
  const bare = [0, 1, 2].flatMap((i) => [{ tag: 'h4', cls: '', text: `Card ${i}`, styles: link }, { tag: 'a', cls: '', text: 'Learn more', styles: link }])
  bare.push({ tag: 'h3', cls: '', text: 'Our solutions', styles: link }, { tag: 'a', cls: 'wp-block-button__link', text: 'Learn more', styles: button })
  const r = parityByText(bare, index, opts)
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings))
  assert.equal(r.classified, 8)
  // the card's paragraph and the link inside it are one place on the site: both pair with the card's words
  const wrapped = [0, 1, 2].flatMap((i) => [
    { tag: 'h4', cls: '', text: `Card ${i}`, styles: link, place: 10 * i + 1 },
    { tag: 'p', cls: 'jv-card__link', text: 'Learn more', styles: link, place: 10 * i + 2 },
    { tag: 'a', cls: '', text: 'Learn more', styles: link, place: 10 * i + 2 }
  ])
  wrapped.push({ tag: 'h3', cls: '', text: 'Our solutions', styles: link, place: 90 }, { tag: 'a', cls: 'wp-block-button__link', text: 'Learn more', styles: button, place: 91 })
  const w = parityByText(wrapped, index, opts)
  assert.deepEqual(w.findings, [], JSON.stringify(w.findings))
  // a card link drawn in the button's colours is still a finding
  const off = bare.map((e, i) => (i === 1 ? { ...e, styles: button } : e))
  const o = parityByText(off, index, opts)
  assert.equal(o.findings.length, 1, JSON.stringify(o.findings))
  assert.equal(o.findings[0].element, 'a "Learn more"')
})

test('visual text: an element inside another of the same words is the same place on the site', async () => {
  const snap = await onPage('<main><h4>Card</h4><p class="more"><a href="#">Learn more</a></p><p>Other words here</p><a href="#">Learn more</a></main>', (p) =>
    p.evaluate(vqa.inPageSnapshot, { coverageSelectors: 'main h4, main p, main a', properties: ['color'], scope: 'main' })
  )
  const lm = snap.elements.filter((e) => e.text === 'Learn more')
  assert.equal(lm.length, 3)
  assert.equal(lm[0].place, lm[1].place, 'p and its link')
  assert.notEqual(lm[1].place, lm[2].place, 'a link elsewhere is its own place')
})

// ld-0 (26/09): the testimonial avatars were blank in the home page's site tile 2. settle() scrolls
// the page, switches every picture to eager and waits for it to decode; a picture that arrives
// late (below the fold, `loading="lazy"`, WordPress's `sizes="auto"` srcset, a slow answer) must
// be in the pixels of the full-page shot the tiles are cut from.
test('settle: lazy pictures below the fold, slow to answer, are in the full-page shot', async () => {
  const { PNG: Png } = await import('pngjs')
  const red = new Png({ width: 60, height: 60 })
  for (let i = 0; i < red.data.length; i += 4) red.data.set([220, 20, 20, 255], i)
  const redPng = Png.sync.write(red)
  const srv = createServer((req, res) => {
    if (req.url.startsWith('/slow')) return setTimeout(() => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(redPng) }, 700)
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><body style="margin:0"><div style="height:3200px">top</div>
      <img id="a" loading="lazy" decoding="async" width="60" height="60" src="/slow-a.png" alt="">
      <div style="height:1800px"></div>
      <img id="b" loading="lazy" decoding="async" width="600" height="600" style="width:60px;height:auto" src="/slow-b.png" srcset="/slow-b.png 600w, /slow-b2.png 150w" sizes="auto, (max-width: 600px) 100vw, 600px" alt="">
      <div style="height:400px"></div></body></html>`)
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  try {
    const shot = await withBrowser(async (b) => {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
      await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' })
      await vqa.settle(p)
      const boxes = await p.evaluate(() => ['a', 'b'].map((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { id, nw: e.naturalWidth, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height } }))
      return { boxes, png: await p.screenshot({ fullPage: true }) }
    })
    const img = Png.sync.read(shot.png)
    for (const bx of shot.boxes) {
      assert.ok(bx.nw > 0, `${bx.id} decoded: ${JSON.stringify(bx)}`)
      const at = (Math.round(bx.y + bx.h / 2) * img.width + Math.round(bx.x + bx.w / 2)) * 4
      assert.deepEqual([...img.data.slice(at, at + 3)], [220, 20, 20], `${bx.id} is drawn in the shot`)
    }
  } finally {
    await new Promise((r) => srv.close(r))
  }
})

// JA Vega M4c (#19 item 3): the listing's card pictures were drawn in one run and blank in the next,
// light and dark alike, while every one of them read `complete` and decoded. The pictures are
// WordPress's `loading="lazy"` + `sizes="auto, …"` srcset. The scroll pass had already loaded the
// candidate `auto` picks for the rendered width; switching them to `eager` afterwards made `auto`
// invalid, and the viewport change of the full-page screenshot then chose again by the fallback
// sizes — a second request, `currentSrc` empty while it ran, and another file (another pixel)
// once it landed. The page settle() hands over must stay the page the shots are cut from.
test('settle: a lazy sizes="auto" picture already loaded by the scroll keeps its source through the full-page shots', async () => {
  const { PNG: Png } = await import('pngjs')
  const fill = (rgb) => {
    const p = new Png({ width: 900, height: 506 })
    for (let i = 0; i < p.data.length; i += 4) p.data.set([...rgb, 255], i)
    return Png.sync.write(p)
  }
  const files = { big: fill([220, 20, 20]), mid: fill([20, 160, 20]), small: fill([20, 20, 220]) }
  const srv = createServer((req, res) => {
    const f = /img-(big|mid|small)/.exec(req.url)?.[1]
    if (f) return setTimeout(() => { res.writeHead(200, { 'content-type': 'image/png' }); res.end(files[f]) }, 700)
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html class="tracy-motion"><head><style>body{margin:0}
      html.tracy-motion .tracy-motion-reveal{opacity:0}.tracy-motion-reveal.tracy-motion-in{animation:rise .7s 200ms both}
      @keyframes rise{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}</style></head>
      <body><div style="height:1400px">top</div>
      <div class="tracy-motion-reveal"><figure style="margin:0;width:358px"><img id="a" loading="lazy" decoding="async" width="900" height="506"
        src="/img-big.png" srcset="/img-big.png 900w, /img-mid.png 400w, /img-small.png 300w" sizes="auto, (max-width: 900px) 100vw, 900px"
        style="aspect-ratio:4/3;width:100%;object-fit:cover" alt=""></figure></div>
      <div style="height:2400px"></div>
      <script>const io=new IntersectionObserver((es)=>es.forEach((e)=>{if(e.isIntersecting){e.target.classList.add('tracy-motion-in');io.unobserve(e.target)}}));document.querySelectorAll('.tracy-motion-reveal').forEach((e)=>io.observe(e))</script>
      </body></html>`)
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  try {
    for (const colorScheme of ['light', 'dark']) {
      const seen = await withBrowser(async (b) => {
        const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme })
        const p = await ctx.newPage()
        await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'networkidle' })
        await vqa.settle(p)
        const state = () => p.evaluate(() => { const e = document.getElementById('a'); const r = e.getBoundingClientRect(); return { src: e.currentSrc.split('/').pop(), complete: e.complete, x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height } })
        const pixel = (png, bx) => { const img = Png.sync.read(png); const at = (Math.round(bx.y + bx.h / 2) * img.width + Math.round(bx.x + bx.w / 2)) * 4; return [...img.data.slice(at, at + 3)] }
        const before = await state()
        const first = pixel(await p.screenshot({ fullPage: true }), before)
        // a reselection the first shot started has landed by now
        await p.waitForTimeout(1500)
        const after = await state()
        const second = pixel(await p.screenshot({ fullPage: true }), after)
        await ctx.close()
        return { before, after, first, second }
      })
      assert.equal(seen.before.complete, true, `${colorScheme}: settled with the picture loaded ${JSON.stringify(seen)}`)
      assert.equal(seen.after.src, seen.before.src, `${colorScheme}: the shot did not send the picture for another source ${JSON.stringify(seen)}`)
      assert.notDeepEqual(seen.first, [255, 255, 255], `${colorScheme}: the picture is drawn`)
      assert.deepEqual(seen.second, seen.first, `${colorScheme}: two shots of the settled page draw the same picture ${JSON.stringify(seen)}`)
    }
  } finally {
    await new Promise((r) => srv.close(r))
  }
})

// JA Vega M4c (#19 item 6): `dd-0`/`dr-0` listed site pictures alone on 1440-dark and 390-dark. A
// source with a dark of its own is shot on each dark stage for that stage's lenses — once it has
// been read back dark — and a hook the source's own script undoes is a finding, with the picture
// listed as missing and why, never the light picture standing in for it.
test('visual-qa: a dark stage shoots the source in dark, read back dark first; a source that undoes its hook is named and its picture listed missing', async () => {
  const { PNG: Png } = await import('pngjs')
  const fx = fixture({})
  const srv = await serve(fx.site)
  try {
    const r = await runOn(fx, srv.origin, { stage: 'dark-desktop,dark-responsive', allStages: true })
    assert.equal(r.error, null, r.error?.message)
    const index = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
    for (const [variant, lenses] of [['1440-dark', ['color', 'layout']], ['390-dark', ['layout', 'color']]]) {
      const shot = index.shots.find((s) => s.side === 'source' && s.variant === variant)
      assert.ok(shot, `${variant}: a source picture ${JSON.stringify(index.shots.map((s) => [s.side, s.variant]))}`)
      assert.deepEqual(shot.consumers, lenses)
      assert.ok(shot.tiles.length && shot.tiles.every(existsSync), JSON.stringify(shot))
      // the source's dark surface, rgb(16,18,20), where the page has nothing but its background
      const img = Png.sync.read(readFileSync(shot.file))
      const at = ((img.height - 2) * img.width + 2) * 4
      assert.deepEqual([...img.data.slice(at, at + 3)], [16, 18, 20], `${variant}: the source picture is dark`)
    }
    assert.deepEqual(index.missing, [])
    const axes = r.report.pages.flatMap((p) => p.axes).filter((a) => a.theme === 'dark')
    assert.ok(axes.length === 2 && axes.every((a) => a.sourceTheme?.holds === true), JSON.stringify(axes.map((a) => a.sourceTheme)))
    assert.ok(axes.every((a) => Array.isArray(a.scans['bright-border'].sourceMatched)), 'the bright-border scan read the dark source')
  } finally {
    await srv.close()
  }
  const undone = fixture({})
  const file = path.join(undone.spec, 'reference', 'rendered', 'about--1440-light.html')
  writeFileSync(file, readFileSync(file, 'utf8').replace('</body>', "<script>document.documentElement.removeAttribute('data-theme')</script></body>"))
  const srv2 = await serve(undone.site)
  try {
    const r = await runOn(undone, srv2.origin, { stage: 'dark-desktop', allStages: true })
    const axis = r.report.pages.flatMap((p) => p.axes).find((a) => a.variant === '1440-dark')
    assert.ok(axis.findings.some((f) => f.kind === 'source-theme-not-applied' && f.hook === 'attr:data-theme=dark'), JSON.stringify(axis.findings))
    assert.equal(axis.parity?.measured, false)
    assert.deepEqual(axis.findings.filter((f) => f.kind === 'parity-mismatch'), [], 'the light source is not compared as the dark one')
    const index = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
    assert.ok(!index.shots.some((s) => s.side === 'source' && s.variant === '1440-dark'), 'no source picture on the dark axis')
    assert.match(index.missing.find((m) => m.variant === '1440-dark')?.reason ?? '', /did not stay dark/)
  } finally {
    await srv2.close()
  }
  // Sol review: a source that KEEPS `data-theme="dark"` but whose CSS never reads it is no dark
  // source — the mark is there, the paint is light. Read back by what the page paints.
  const inert = fixture({})
  const inertFile = path.join(inert.spec, 'reference', 'rendered', 'about--1440-light.html')
  writeFileSync(inertFile, readFileSync(inertFile, 'utf8').replaceAll('html[data-theme=dark]', 'html[data-theme=never]'))
  const srv3 = await serve(inert.site)
  try {
    const r = await runOn(inert, srv3.origin, { stage: 'dark-desktop', allStages: true })
    const axis = r.report.pages.flatMap((p) => p.axes).find((a) => a.variant === '1440-dark')
    const f = axis.findings.find((x) => x.kind === 'source-theme-not-applied')
    assert.ok(f, `a dark mark the CSS ignores is not a dark source: ${JSON.stringify(axis.sourceTheme)}`)
    assert.ok(f.observed.some((c) => c.part === 'attr:data-theme=dark' && c.holds) && f.observed.some((c) => c.part === 'paint' && !c.holds), JSON.stringify(f.observed))
    assert.equal(axis.parity?.measured, false)
    const index = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
    assert.ok(!index.shots.some((s) => s.side === 'source' && s.variant === '1440-dark'), 'no light picture stands in for the dark source')
  } finally {
    await srv3.close()
  }
})

// Sol review of #19 item 6 (round 6): the sampled pictures went by the export's hook alone, so a
// source put into dark by a request cookie gave a sampled page no dark source picture; and they
// were written without reading the dark back, so a source that went light on that load was filed
// as the dark one. The sampled source follows the measured one: either hook, read back first.
test('visual-qa: a page sampled for its findings gets a dark source picture through the request cookie, read back dark; a source light on that load is listed missing, never pictured', async () => {
  const { PNG: Png } = await import('pngjs')
  const sampled = () => {
    const fx = fixture({})
    // the source goes dark only by the cookie; /team/ fails on its own (h1 52 px), /jobs/ is clean
    const cookieDark = "<script>if(document.cookie.includes('src_theme=dark'))document.documentElement.setAttribute('data-theme','dark')</script></head>"
    const source = sourcePage().replace('</head>', cookieDark)
    for (const [slug, defects] of [['team', { h1Size: 52 }], ['jobs', {}]]) {
      mkdirSync(path.join(fx.site, slug), { recursive: true })
      writeFileSync(path.join(fx.site, slug, 'index.html'), page(defects))
    }
    for (const slug of ['about', 'team', 'jobs']) writeFileSync(path.join(fx.spec, 'reference', 'rendered', `${slug}--1440-light.html`), source)
    const pageMap = {
      locales: ['en'],
      defaultLocale: 'en',
      pages: ['about', 'team', 'jobs'].map((slug) => ({ file: `${slug}.html`, view: 'page', title: 'Building the groundwork', path: `/${slug}/`, locale: 'en' }))
    }
    const reference = { pages: ['about', 'team', 'jobs'].map((slug) => ({ page: `${slug}.html`, path: `reference/rendered/${slug}--1440-light.html` })) }
    const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page', '/team/': 'page', '/jobs/': 'page' } }, themeTemplates: new Set(['page']), specHash: specHash(fx.spec), id: 'mock', sourceDarkRequestHook: 'cookie:src_theme=dark' })
    assert.equal(contract.source.darkHook, null, 'the export has no hook of its own')
    assert.equal(contract.source.darkRequestHook, 'cookie:src_theme=dark')
    assert.ok(contract.visual.shots.some((r) => r.side === 'source' && r.stages.includes('dark-desktop')), 'the rules owe a dark source picture')
    writeFileSync(fx.contractFile, JSON.stringify(contract))
    return { ...fx, contract }
  }
  // The source over HTTP (a cookie needs an origin). `lightAfter` serves /team/'s source dark on its
  // first load — the measured pass — and light on every later one.
  const serveSource = (dir, { lightAfter = false } = {}) => {
    const loads = new Map()
    return new Promise((resolve) => {
      const srv = createServer((req, res) => {
        const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
        const file = path.join(dir, p)
        if (!existsSync(file)) return res.writeHead(404).end()
        loads.set(p, (loads.get(p) ?? 0) + 1)
        let body = readFileSync(file, 'utf8')
        if (lightAfter && p.includes('team--') && loads.get(p) > 1) body = body.replace('</body>', "<script>document.documentElement.removeAttribute('data-theme')</script></body>")
        res.writeHead(200, { 'content-type': p.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8' }).end(p.endsWith('.png') ? readFileSync(file) : body)
      })
      srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, loads, close: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r) }) }))
    })
  }
  for (const lightAfter of [false, true]) {
    const fx = sampled()
    const site = await serve(fx.site)
    const source = await serveSource(path.join(fx.spec, 'reference'), { lightAfter })
    try {
      const r = await runOn(fx, site.origin, { stage: 'dark-desktop', allStages: true, sourceSite: source.origin, tileHeight: 400 })
      assert.equal(r.error, null, r.error?.message)
      const team = r.report.pages.find((p) => p.id === 'en-team').axes.find((a) => a.variant === '1440-dark')
      assert.equal(team.lensShot?.representative, 'en-about', 'the page is sampled for its own findings')
      assert.equal(team.sourceTheme?.holds, true, 'the measured pass read the source dark')
      const index = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
      const shot = index.shots.find((s) => s.page === 'en-team' && s.side === 'source' && s.variant === '1440-dark')
      if (!lightAfter) {
        assert.ok(shot, `a dark source picture for the sampled page ${JSON.stringify(index.shots.map((s) => [s.page, s.side]))} ${JSON.stringify(index.missing)}`)
        assert.ok(shot.tiles.length && shot.tiles.every(existsSync), JSON.stringify(shot))
        assert.equal(team.sampledSourceTheme?.holds, true)
        const img = Png.sync.read(readFileSync(shot.file))
        const at = ((img.height - 2) * img.width + 2) * 4
        assert.deepEqual([...img.data.slice(at, at + 3)], [16, 18, 20], 'the sampled source picture is dark')
        assert.ok(!index.missing.some((m) => m.page === 'en-team'), JSON.stringify(index.missing))
      } else {
        assert.ok(source.loads.get('/rendered/team--1440-light.html') > 1, 'the sampled pass loaded the source again')
        assert.equal(shot, undefined, 'a light load is not filed as the dark source picture')
        assert.equal(team.sampledSourceTheme?.holds, false)
        assert.match(index.missing.find((m) => m.page === 'en-team' && m.variant === '1440-dark')?.reason ?? '', /did not stay dark .* sampled/)
        assert.throws(() => planRun(r.out, { stage: 'dark-desktop', lens: 'layout', chunks: 1 }), /en-team 1440-dark: no source picture/)
      }
    } finally {
      await site.close()
      await source.close()
    }
  }
})

// Sol review of #19 item 6: a source picture the rules owe and the run cannot write was listed in
// index.json `missing` only — no finding, so the stage passed. It is a finding now, on the axis.
test('visual-qa: a source picture the shot rules owe and cannot be written is a finding, and the stage fails', async () => {
  // The rules owe the dark stage a source picture (written while the source had a dark hook); the
  // run has no dark source to shoot. A missing rendered file is refused earlier, by the contract.
  const fx = fixture({})
  const c = JSON.parse(readFileSync(fx.contractFile, 'utf8'))
  assert.ok(c.visual.shots.some((r) => r.side === 'source' && r.stages.includes('dark-desktop')), 'the rules owe a dark source picture')
  c.source.darkHook = null
  writeFileSync(fx.contractFile, JSON.stringify(c))
  const srv = await serve(fx.site)
  try {
    const r = await runOn(fx, srv.origin, { stage: 'dark-desktop', allStages: true })
    assert.equal(r.error, null, r.error?.message)
    const axis = r.report.pages.flatMap((p) => p.axes).find((a) => a.variant === '1440-dark')
    assert.ok(axis.findings.some((f) => f.kind === 'source-shot-missing' && /no dark of its own/.test(f.reason)), JSON.stringify(axis.findings.map((f) => f.kind)))
    const index = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
    assert.match(index.missing.find((m) => m.variant === '1440-dark')?.reason ?? '', /no dark of its own/)
    const visual = JSON.parse(readFileSync(path.join(r.out, 'visual.json'), 'utf8'))
    assert.equal(visual.stages.find((s) => s.id === 'dark-desktop')?.status, 'fail', JSON.stringify(visual.stages))
  } finally {
    await srv.close()
  }
})

// Sol review of #19 item 3: settle()'s bound covered the wait for `load` only; `decode()` of a
// picture whose answer never comes waits as long, so one hung picture timed the whole
// `page.evaluate` out (an axis-error, the page unmeasured). Load and decode share one deadline,
// and what is still loading reads undecoded for the census to name. Every picture leaves settle()
// with `decoding="sync"`: a shot paints the bitmap in the frame it draws (the blank frame itself was
// measured on a live page only — no fixture reproduces it).
test('settle: a picture that never answers holds settle() to its deadline and reads undecoded; every picture leaves settle() decoding sync', async () => {
  const srv = createServer((req, res) => {
    if (req.url.startsWith('/hang')) return // never answers
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><body style="margin:0"><div style="height:1400px">top</div>
      <img id="h" loading="lazy" decoding="async" width="60" height="60" src="/hang.png" alt=""><div style="height:400px"></div></body></html>`)
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  try {
    const seen = await withBrowser(async (b) => {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
      await p.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'domcontentloaded' })
      const t0 = Date.now()
      const settled = await withTimeout(vqa.settle(p, { boundMs: 1500 }), 8000, 'settle').then(() => 'settled', (e) => e.message)
      const ms = Date.now() - t0
      const img = await p.evaluate(() => { const e = document.getElementById('h'); return { nw: e.naturalWidth, complete: e.complete, decoding: e.decoding } })
      return { settled, ms, img }
    })
    assert.equal(seen.settled, 'settled', JSON.stringify(seen))
    assert.ok(seen.ms < 6000, `settle held to its deadline: ${seen.ms} ms`)
    assert.equal(seen.img.nw, 0, 'the hung picture reads undecoded')
    assert.equal(seen.img.decoding, 'sync')
  } finally {
    srv.closeAllConnections?.()
    await new Promise((r) => srv.close(r))
  }
})

// Sol review of #19 item 6 (round 2): the paint read-back took ANY computed-colour change under the
// mark as dark, so a light page whose one card border turns grey passed as a dark source. The dark
// is read by the share of the page it paints: surfaces and words, never a border alone.
// Round 3: a light page that only whitens its words under the mark is not dark either — the dark is
// the area PAINTED dark (a surface turning dark, or words changing over a dark surface), never the
// boxes of words that changed colour over a light one.
test('inPageDarkHolds: one border, words whitened over a light page, or a see-through grey that shows light is not a dark page; dark cards, and words over a dark surface, are', async () => {
  const words = Array.from({ length: 30 }, (_, i) => `<p>Paragraph ${i} of the light page</p>`).join('')
  const doc = (css) => `<!doctype html><html data-theme="dark"><head><style>body{margin:0;background:rgb(245,243,238);color:rgb(20,23,26)} .card{padding:16px;border:1px solid rgb(220,220,220)} .badge{display:inline-block;width:8px;height:8px}${css}</style></head>
    <body><header><span class="badge"></span> Site</header><main><div class="card">${words}</div></main></body></html>`
  const cases = {
    border: 'html[data-theme=dark] .card{border-color:rgb(60,60,60)}',
    badge: 'html[data-theme=dark] .card{border-color:rgb(60,60,60)} html[data-theme=dark] .badge{background:rgb(10,10,10)}',
    cards: 'html[data-theme=dark] .card{background:rgb(25,28,31);color:rgb(236,234,228)}',
    words: 'html[data-theme=dark] body{color:rgb(236,234,228)}',
    lighter: 'html[data-theme=dark] .card{background:rgb(255,255,255)}',
    overDark: 'main{background:rgb(20,22,24)} .card{color:rgb(90,90,90)} html[data-theme=dark] .card p{color:rgb(236,234,228)}',
    // A half-transparent grey over the light page shows about rgb(173,173,173): light, whatever its RGB.
    glass: 'html[data-theme=dark] .card{background:rgba(100,100,100,.5)}',
    glassWords: 'main{background:rgba(100,100,100,.5)} html[data-theme=dark] .card p{color:rgb(236,234,228)}',
    veil: 'html[data-theme=dark] .card{background:rgba(0,0,0,.9);color:rgb(236,234,228)}',
    // Round 6: a dark card that is not drawn — hidden, or under a transparent ancestor — is no dark.
    hidden: 'html[data-theme=dark] .card{background:rgb(25,28,31);color:rgb(236,234,228);visibility:hidden}',
    faded: 'main{opacity:0} html[data-theme=dark] .card{background:rgb(25,28,31);color:rgb(236,234,228)}',
    // Round 7: colours are read after opacity. A black card at opacity .01 shows almost white; a black
    // card in a black section at opacity .3 shows about rgb(170,168,165) — both measured in Chromium.
    nearlyClear: 'html[data-theme=dark] .card{background:rgb(0,0,0);color:rgb(236,234,228);opacity:.01}',
    nestedFade: 'main{opacity:.3} html[data-theme=dark] main{background:rgb(0,0,0)} html[data-theme=dark] .card{background:rgb(0,0,0);color:rgb(236,234,228)}'
  }
  const seen = await withBrowser(async (b) => {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
    const out = {}
    for (const [name, css] of Object.entries(cases)) {
      await p.setContent(doc(css))
      out[name] = await p.evaluate(vqa.inPageDarkHolds, 'attr:data-theme=dark')
    }
    // A request-cookie hook leaves no mark: only the page fill, as it shows over the canvas, decides.
    await p.setContent(doc('body{background:rgba(0,0,0,.3)}'))
    out.fillGlass = await p.evaluate(vqa.inPageDarkHolds, 'cookie:tracy_theme=dark')
    // The fill as Chromium draws it: `html` opacity fades the page to the white canvas; a `body` box
    // over a white `html` is faded by its own opacity; with a transparent `html` the black `body`
    // background is the canvas and `body` opacity leaves it black.
    const fills = {
      fillHtmlFaded: 'html{opacity:0} body{background:rgb(0,0,0)}',
      fillBodyBoxFaded: 'html{background:rgb(255,255,255)} body{background:rgb(0,0,0);opacity:0}',
      fillPropagated: 'body{background:rgb(0,0,0);opacity:0}',
      fillDark: 'body{background:rgb(0,0,0);color:rgb(236,234,228)}'
    }
    for (const [name, css] of Object.entries(fills)) {
      await p.setContent(doc(css))
      out[name] = await p.evaluate(vqa.inPageDarkHolds, 'cookie:tracy_theme=dark')
    }
    return out
  })
  for (const name of ['border', 'badge']) {
    assert.equal(seen[name].holds, false, `${name}: a light page is not a dark source ${JSON.stringify(seen[name].checks)}`)
    assert.ok(seen[name].checks.some((c) => c.part === 'paint' && !c.holds && /1 borders change/.test(c.observed)), JSON.stringify(seen[name].checks))
  }
  for (const name of ['words', 'lighter', 'glass', 'glassWords', 'fillGlass', 'hidden', 'faded', 'nearlyClear', 'nestedFade', 'fillHtmlFaded', 'fillBodyBoxFaded']) assert.equal(seen[name].holds, false, `${name}: a light page is not a dark source ${JSON.stringify(seen[name].checks)}`)
  for (const name of ['cards', 'overDark', 'veil', 'fillPropagated', 'fillDark']) assert.equal(seen[name].holds, true, `${name}: the dark is painted over the page ${JSON.stringify(seen[name].checks)}`)
})
