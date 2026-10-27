// F12: the visual pass must be able to FAIL. A mock EmDash page (header with a hover-opened mega
// panel, hero, cards, footer; light + dark via data-theme; a "source" render served alongside) is
// clean by default and passes visual-qa on both axes with zero findings; each defect class from
// references/visual-review-method.md is injected one at a time and must surface as its named
// finding. The pure diff and the single-page scanner CLI are covered too.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { after, before, describe, it } from 'node:test'
import { diffSnapshots, siteSnapshotOf, snapshotOf, navigate, scanSeams } from '../tools/visual-lib.mjs'
import { launchBrowser } from '../tools/qa-browser.mjs'
const execFileP = promisify(execFile)
const HERE = new URL('.', import.meta.url).pathname
const TOOLS = path.resolve(HERE, '../tools')
const LOGO = readFileSync(path.resolve(HERE, 'fixtures/mini-html/logo.png'))

// Cases here are independent by construction: each serves its fixture on an ephemeral port
// (`srv.listen(0)`) into a fresh `mkdtempSync` directory, and each run spawns its own process with
// its own browser. Measured 2026-09-17 on the sibling package's visual suite: 660 s at concurrency 1
// against 273 s and 275 s on two runs at 4 -- 2.4x, with the SAME passing set every time and the two
// concurrent runs two seconds apart. The file spends most of its time waiting on a browser, not
// computing, which is why the knob helps at all. Raising it further was not measured; each case
// holds a browser, so the ceiling is memory rather than cores.
const CONCURRENCY = Number(process.env.VQA_TEST_CONCURRENCY ?? 4)

function pageHtml(d = {}, { source = false } = {}) {
  const h1 = source && d.parityMismatch ? '#0000ff' : '#111111'
  const picture = source
    ? // `data-filled` is what the real picture component writes onto itself once it is showing the
      // author `src`; the runner reads it to tell a finished source render from one still painting
      // placeholder rings, so the stand-in has to carry it too or every source page looks unfinished.
      '<image-slot id="lead" src="/logo.png" data-filled=""></image-slot>'
    : d.missingImage
      ? '<span class="photo-placeholder">Lead photo · 16:9</span>'
      : '<img src="/logo.png" alt="lead" width="40" height="40">'
  return `<!doctype html><html lang="de"${source && d.twoSignalSource ? ' data-theme="dark" data-bs-theme="dark"' : ''}><head><meta charset="utf-8"><title>Mock</title>
<script>try{if(localStorage.getItem('mini-theme')==='dark'${d.stuckTheme ? '&&false' : ''})document.documentElement.setAttribute('data-theme','dark')}catch(e){}</script>
<style>
body{margin:0;font-family:serif;background:#fff;color:#111}
html[data-theme=dark] body{background:#141821;color:#e8e8e8}
header{position:relative;display:flex;align-items:stretch;gap:24px;padding:0 24px;background:#f4f4f4}
button{background:#ddd;border:1px solid #888;color:#111}html[data-theme=dark] button{background:#333a4c;border-color:#444;color:#e8e8e8}
html[data-theme=dark] header{background:#1c2130}
nav ul{list-style:none;margin:0;padding:0;display:flex;gap:16px}
nav li{position:static}
nav a{color:#111;text-decoration:none;padding:20px 8px;display:inline-block}
header > strong{padding:20px 0}
html[data-theme=dark] nav a{color:#e8e8e8}
nav a:hover{background:#ddd${d.hoverJump ? ';padding-left:20px' : ''}}
#panel{display:none;position:absolute;left:0;top:100%;width:100%;background:#eee;padding:16px 0;${d.megaGap ? 'margin-top:30px;' : ''}}
html[data-theme=dark] #panel{background:#262c3b}
li.has-panel:not(.closed):hover > #panel,#panel.open{display:block}
#panel .inner{max-width:640px;margin:0 auto;display:flex;gap:16px}
#panel a{color:#111}html[data-theme=dark] #panel a{color:#e8e8e8}
main{padding:24px}
h1{color:${h1};font-size:32px;line-height:40px;margin:0 0 12px}
html[data-theme=dark] h1{color:#ffffff}
.cards{display:flex;gap:16px}.card{flex:1;padding:16px;border:1px solid #ddd;background:#fafafa}
html[data-theme=dark] .card{background:${d.whiteLeak ? '#ffffff' : '#1c2130'};border-color:${d.brightBorder ? '#eeeeee' : '#333a4c'}}
.card p{margin:0}.meta{color:${d.lowContrast ? '#9a9a9a' : '#444'};font-size:13px}html[data-theme=dark] .meta{color:${d.lowContrast ? '#4a4f5c' : '#b7bcc9'}}
html[data-theme=dark] .byline{color:${d.darkText ? '#111111' : '#e8e8e8'}}
.seam-a{height:0;border-bottom:1px solid #888}.seam-b{border-top:1px solid #888;${d.doubledSeam ? 'margin-top:1px' : 'border-top:0'}}
html[data-theme=dark] .seam-a{border-color:#444}html[data-theme=dark] .seam-b{border-color:#444}
footer{padding:16px 24px;background:#f4f4f4;color:#111}html[data-theme=dark] footer{background:#1c2130;color:#e8e8e8}
main a,footer a{color:#111}html[data-theme=dark] main a,html[data-theme=dark] footer a{color:#e8e8e8}
${source && d.twoSignalSource ? 'html[data-bs-theme=dark] main a.btn{color:#e8e8e8}' : ''}
</style></head><body>
<script>customElements.define('image-slot',class extends HTMLElement{connectedCallback(){const r=this.attachShadow({mode:'open'});const i=document.createElement('img');i.src=this.getAttribute('src');i.width=40;i.height=40;r.appendChild(i)}})</script>
<header><strong>Mock</strong><nav><ul>
<li class="has-panel"><a href="#" id="trigger" aria-expanded="false">Resources</a>
<div id="panel"><div class="inner"><a href="/about">About</a><a href="/kontakt">Kontakt</a><a href="/news">News</a></div></div></li>
<li><a href="/about">About</a></li><li><a href="/kontakt">Kontakt</a></li></ul></nav></header>
<main><div class="lead" style="height:60px">${picture}</div><h1>Willkommen</h1><p class="lede">Handgefertigte Möbel aus dem Norden.</p>
<div class="cards"><div class="card"><p>Card one</p><p class="meta">Meta one</p></div><div class="card"><p>Card two</p><p class="meta">Meta two</p></div><div class="card"><p>Card three</p><p class="byline">By someone</p></div></div>
${d.slotRace || d.slotNeverFills ? `<picture-slot src="/logo.png"${d.slotFilled ? ' data-filled=""' : ''}></picture-slot>` : ''}
${d.lazySource ? `<div style="height:12000px"></div><img class="deep" loading="lazy" src="/logo.png" alt="deep" width="40" height="40">` : ''}
<div class="seam-a"></div><div class="seam-b"><p>Below the cards.</p>${d.siteLostCta && !source ? '' : '<a class="btn" href="/kontakt">Contact us</a>'}<button>Click</button></div>
<ul><li>one</li><li>two</li><li>three</li><li>four</li></ul></main>
<footer><a href="/about">About</a> · <a href="/kontakt">Kontakt</a> · <span>© Mock</span></footer>
<script>
const t=document.getElementById('trigger'),p=document.getElementById('panel'),li=t.parentElement;
li.addEventListener('mouseleave',()=>{p.classList.remove('open');t.setAttribute('aria-expanded','false')});
li.addEventListener('mouseenter',()=>{p.classList.add('open');t.setAttribute('aria-expanded','true')});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){p.classList.remove('open');li.classList.add('closed');t.focus();setTimeout(()=>li.classList.remove('closed'),50)}});
document.addEventListener('click',(e)=>{if(!li.contains(e.target))p.classList.remove('open')});
</script></body></html>`
}
function serve(defects = {}) {
  return new Promise((res) => {
    let sourceHits = 0
    const srv = http.createServer((req, r) => {
      const p = new URL(req.url, 'http://x').pathname
      if (p !== '/logo.png')
        r.writeHead(p === '/missing' ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' })
      if (p.startsWith('/source/')) {
        sourceHits++
        // `slotRace`: the real export's picture component settles filled or unfilled per LOAD and
        // latches; the mock reproduces the shape by filling only from the second request on.
        const filled = defects.slotNeverFills ? false : defects.slotRace ? sourceHits >= 2 : true
        return r.end(pageHtml({ ...defects, slotFilled: filled }, { source: true }))
      }
      if (p === '/logo.png') {
        r.writeHead(200, { 'content-type': 'image/png' })
        return r.end(LOGO)
      }
      if (p === '/tiny') return r.end('<!doctype html><html lang="de"><body><p>x</p></body></html>')
      r.end(pageHtml(defects))
    })
    srv.listen(0, '127.0.0.1', () =>
      res({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) })
    )
  })
}
const CONFIG = {
  qa: {
    theme: {
      selector: 'html',
      attribute: 'data-theme',
      values: { light: null, dark: 'dark' },
      storageKey: 'mini-theme'
    }
  }
}
function contract() {
  return {
    variants: [
      { id: 'desktop-light', width: 1280, height: 800, theme: 'light', reducedMotion: 'reduce' },
      { id: 'desktop-dark', width: 1280, height: 800, theme: 'dark', reducedMotion: 'reduce' }
    ],
    design: {
      theme: CONFIG.qa.theme,
      rules: [
        {
          id: 'h1',
          selector: 'main h1',
          styles: {
            'desktop-light': { color: 'rgb(17, 17, 17)', 'font-size': '32px', 'line-height': '40px' },
            'desktop-dark': { color: 'rgb(255, 255, 255)', 'font-size': '32px', 'line-height': '40px' }
          }
        },
        {
          id: 'lede',
          selector: 'main p.lede',
          styles: {
            'desktop-light': { 'font-family': 'serif', color: 'rgb(17, 17, 17)' },
            'desktop-dark': { 'font-family': 'serif', color: 'rgb(232, 232, 232)' }
          }
        }
      ],
      coverage: [{ selector: 'main h1, main p.lede', properties: ['color'] }],
      images: { scope: 'main', sourceSlot: 'image-slot[src]', placeholder: '.photo-placeholder' },
      parity: {
        selectors: {
          h1: { content: 'title' },
          lede: 'main p.lede',
          cta: { site: 'main a.btn', source: 'main a.btn' }
        },
        properties: ['color', 'font-size', 'line-height', 'font-family']
      }
    },
    interactions: {
      mega: {
        trigger: '#trigger',
        panel: '#panel',
        link: '#panel a',
        open: 'hover',
        fullWidth: true,
        inner: '#panel .inner',
        maxInnerWidth: 640
      }
    },
    pages: [
      {
        id: 'home',
        path: '/',
        locale: 'de',
        status: 200,
        identity: 'main h1',
        source: ['source/home.html'],
        variants: ['desktop-light', 'desktop-dark'],
        states: ['default', 'mega'],
        rules: ['h1', 'lede'],
        content: [
          {
            id: 'title',
            selector: 'main h1',
            source: 'source/home.html',
            owner: 'field',
            binding: 'x',
            attribute: 'text',
            expected: 'Willkommen'
          }
        ]
      }
    ]
  }
}
async function run(tool, args, cwd) {
  try {
    const r = await execFileP(process.execPath, [path.join(TOOLS, tool), ...args], {
      cwd,
      maxBuffer: 64 * 1024 * 1024
    })
    return { code: 0, out: r.stdout + r.stderr }
  } catch (e) {
    return { code: e.code, out: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}
async function visual(site, c = contract(), extra = []) {
  const root = mkdtempSync(path.join(tmpdir(), 'vqa-'))
  writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
  writeFileSync(path.join(root, 'qa.contract.json'), JSON.stringify(c))
  const out = path.join(root, 'run')
  const r = await run(
    'visual-qa.mjs',
    [
      '--contract',
      'qa.contract.json',
      '--site',
      site.origin,
      '--out',
      out,
      '--source-site',
      site.origin,
      ...extra
    ],
    root
  )
  const report = existsSync(path.join(out, 'visual.json'))
    ? JSON.parse(readFileSync(path.join(out, 'visual.json'), 'utf8'))
    : null
  return {
    ...r,
    log: r.out,
    report,
    kinds: report ? report.pages.flatMap((p) => p.findings.map((f) => f.kind)) : [],
    root,
    out
  }
}
const has = (r, kind) =>
  assert.ok(
    r.kinds.some((k) => k === kind || k.startsWith(kind)),
    `expected ${kind}\n${r.out.slice(-1500)}\n${JSON.stringify(r.kinds)}`
  )

describe('F12 — diffSnapshots (pure)', () => {
  it('tolerates antialiasing-level colour and sub-pixel deltas, ignores Astro font hashes, flags real deltas and missing sides', () => {
    const a = {
      h1: {
        color: 'rgb(17, 17, 17)',
        'font-size': '32px',
        'font-family': 'Archivo-abcdef123456, sans-serif'
      },
      p: { color: '#444' }
    }
    const b = {
      h1: { color: 'rgb(20, 17, 17)', 'font-size': '32.05px', 'font-family': 'Archivo, sans-serif' },
      p: { color: 'rgb(68, 68, 68)' }
    }
    assert.deepEqual(diffSnapshots(a, b).mismatches, [])
    const c = { h1: { color: 'rgb(60, 17, 17)', 'font-size': '33px', 'font-family': 'Georgia' } }
    const m = diffSnapshots(a, c).mismatches
    assert.deepEqual(m.map((x) => `${x.selector}.${x.property}`).sort(), [
      'h1.color',
      'h1.font-family',
      'h1.font-size',
      'p.color'
    ])
    assert.throws(() => diffSnapshots({}, a), /must contain selectors/)
    assert.throws(
      () => diffSnapshots(a, b, { required: { h1: ['padding-top'] } }),
      /required measurement missing/
    )
  })
})

describe('F12 — visual-qa on a mock site', { concurrency: CONCURRENCY }, () => {
  let clean
  before(async () => {
    clean = await serve()
  })
  after(async () => {
    await clean.close()
  })
  it('clean page: both axes pass, components measured, coverage classified, mega travel PASS, parity 0 mismatches', {
    timeout: 120000
  }, async () => {
    const r = await visual(clean)
    assert.equal(
      r.code,
      0,
      JSON.stringify(r.report?.pages.flatMap((p) => p.findings) ?? r.out.slice(-3000)).slice(0, 3000)
    )
    assert.equal(r.report.summary.axes, 2)
    assert.ok(r.report.summary.components >= 4)
    assert.equal(r.report.summary.unclassified, 0)
    const dark = r.report.pages[0].axes.find((a) => a.theme === 'dark')
    assert.equal(dark.theme_observed, 'dark')
    assert.ok(dark.mega?.every((m) => m.verdict === 'PASS') ?? true, JSON.stringify(dark.mega))
    assert.ok(existsSync(path.join(r.out, dark.screenshot)))
    assert.ok(
      r.report.pages[0].axes[0].parity.checked >= 12,
      JSON.stringify(r.report.pages[0].axes[0].parity)
    )
    assert.equal(r.report.pages[0].axes[0].parity.pairs, 3)
    // The component table prints EXCEPTIONS, not the corpus: a clean `h1` is counted, not listed.
    // What a reader is handed first is the triage table; the row itself stays in visual.json,
    // which is where --reuse and any run-to-run comparison read it from.
    const visualMd = readFileSync(path.join(r.out, 'VISUAL.md'), 'utf8')
    assert.doesNotMatch(visualMd, /\| home \| desktop-light \| h1 ·/)
    assert.match(visualMd, /## Triage/)
    assert.match(visualMd, /[1-9]\d* further component\(s\) matched with no delta/)
    assert.ok(
      r.report.pages[0].axes[0].components.some((c) => c.rule === 'h1' && c.status === 'PASS'),
      'the clean row is still in visual.json'
    )
    // every picture is also cut into tiles a reader can actually see (index.json lists them)
    const idx = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
    assert.ok(
      idx.shots.length >= 2 &&
        idx.shots.every((s) => s.tiles.length >= 1 && s.tiles.every((t) => existsSync(t))),
      JSON.stringify(idx.shots)
    )
    assert.ok(
      idx.shots.some((s) => s.side === 'source' && s.tiles.length >= 1),
      'the source render is tiled too'
    )
    // Every row says whether its strips carry the whole picture. They are clamped to the viewport
    // (cutPng takes Math.min(width, rows.width)), so on a page with horizontal overflow the
    // full-page file holds pixels no strip does — and a consumer told "the strips are the same
    // pixels" would miss exactly what `horizontal-overflow` is about.
    assert.ok(
      idx.shots.every((s) => typeof s.tilesCoverPicture === 'boolean'),
      JSON.stringify(idx.shots.map((s) => [s.side, s.tilesCoverPicture]))
    )
    assert.ok(
      idx.shots.every((s) => s.tilesCoverPicture),
      'no fixture overflows horizontally, so the strips cover every picture'
    )
    assert.deepEqual(
      r.report.pages[0].axes.map((a) => a.variant),
      ['desktop-light', 'desktop-dark'],
      'light before dark'
    )
  })
  for (const [defect, kind, only] of [
    ['whiteLeak', 'scan:white-surface', 'dark'],
    ['darkText', 'scan:dark-on-dark', 'dark'],
    ['lowContrast', 'scan:contrast'],
    ['brightBorder', 'scan:bright-border', 'dark'],
    ['doubledSeam', 'scan:doubled-seam'],
    ['hoverJump', 'scan:hover-jump'],
    ['megaGap', 'mega-menu'],
    ['parityMismatch', 'parity-mismatch'],
    ['stuckTheme', 'theme-not-applied'],
    ['missingImage', 'image-missing']
  ]) {
    it(`${defect} → ${kind}`, { timeout: 120000 }, async () => {
      const site = await serve({ [defect]: true })
      try {
        const r = await visual(site)
        assert.equal(r.code, 1, `expected exit 1\n${r.out.slice(-800)}`)
        has(r, kind)
        // Triage collapses SIGHTINGS into problems: the same defect seen on both axes is one row,
        // and its Sightings column says how many times it was seen. Measured 18/09 on a real run
        // of the sibling base template, 1,302 findings were 17 problems.
        {
          const md = readFileSync(path.join(r.out, 'VISUAL.md'), 'utf8')
          const triage = md.slice(md.indexOf('## Triage'), md.indexOf('| Page | Axis | Component'))
          const rows = triage.split('\n').filter((l) => l.startsWith(`| ${kind} |`))
          assert.equal(rows.length >= 1, true, `no triage row for ${kind}:\n${triage}`)
          const seen = r.report.pages.flatMap((p) => p.findings).filter((f) => f.kind === kind).length
          const counted = rows.reduce((n, l) => n + Number(l.split('|')[4].trim() || 0), 0)  // | kind | where | what | N |
          assert.equal(counted, seen, `triage counted ${counted} sighting(s), the run found ${seen}\n${triage}`)
        }
        if (only === 'dark')
          assert.ok(
            r.report.pages[0].findings
              .filter((f) => f.kind.startsWith(kind))
              .every((f) => f.axis === 'desktop-dark'),
            'dark-only scanner ran on the dark axis'
          )
      } finally {
        await site.close()
      }
    })
  }
  it(
    'design.parity.sourceTheme: a source keyed off TWO signals needs both declared, or the flip leaves a hybrid',
    async () => {
      // The source boots dark, colours its text from `data-theme` and its CTA from `data-bs-theme`
      // (Bootstrap-style) — the shape JA Kinetic uses for section surfaces. Flipping one signal
      // produces a render that exists nowhere: light text beside a still-dark element, which then
      // scores as a defect of the SITE and gets written into a design decision. Declare every signal.
      const site = await serve({ twoSignalSource: true })
      try {
        const one = contract()
        one.design.parity.sourceTheme = {
          selector: 'html',
          attribute: 'data-theme',
          values: { light: null, dark: 'dark' }
        }
        const partial = await visual(site, one)
        assert.equal(partial.code, 1, `one signal must not pass\n${partial.out.slice(-800)}`)
        has(partial, 'parity-mismatch')

        const both = contract()
        both.design.parity.sourceTheme = [
          { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' } },
          { selector: 'html', attribute: 'data-bs-theme', values: { light: null, dark: 'dark' } }
        ]
        const full = await visual(site, both)
        assert.equal(full.code, 0, `both signals must pass\n${full.out.slice(-800)}`)
      } finally {
        await site.close()
      }
    },
    { timeout: 180000 }
  )
  it("pages[].images: 'placeholders' — a derived page's count is data, a placeholder is still a defect", {
    timeout: 120000
  }, async () => {
    const site = await serve({ missingImage: true })
    try {
      const c = contract()
      c.pages[0].images = 'placeholders'
      const r = await visual(site, c)
      assert.equal(r.code, 1, r.out.slice(-800))
      has(r, 'image-placeholder')
      assert.ok(
        !r.report.pages[0].findings.some((f) => f.kind === 'image-missing'),
        'count parity is not enforced on a derived page'
      )
    } finally {
      await site.close()
    }
  })
  it('stages: light runs first; a failing light stage leaves dark not-run; --reuse copies unchanged pages', {
    timeout: 240000
  }, async () => {
    // lowContrast fails on the light axis; whiteLeak would fail dark — dark must not even run.
    const bad = await serve({ lowContrast: true, whiteLeak: true })
    try {
      const c = contract()
      c.visual = {
        stages: [
          { id: 'light', variants: ['desktop-light'] },
          { id: 'dark', variants: ['desktop-dark'] }
        ]
      }
      const r = await visual(bad, c)
      assert.equal(r.code, 1)
      const st = Object.fromEntries(r.report.stages.map((s) => [s.id, s.status]))
      assert.equal(st.light, 'fail')
      assert.equal(st.dark, 'not-run', JSON.stringify(r.report.stages))
      assert.ok(
        r.report.pages[0].axes.every((a) => a.variant === 'desktop-light'),
        'no dark axis measured'
      )
      // index.json lists the light pictures only; machine notes carry the light finding as a todo
      const idx = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
      assert.ok(idx.shots.length > 0 && idx.shots.every((s) => s.variant === 'desktop-light'))
      const machine = JSON.parse(readFileSync(path.join(r.out, 'notes', 'machine.json'), 'utf8'))
      assert.ok(machine.some((m) => m.lens === 'machine:scan:contrast' && m.status === 'open'))
    } finally {
      await bad.close()
    }
    const good = await serve()
    try {
      const c = contract()
      c.visual = {
        stages: [
          { id: 'light', variants: ['desktop-light'] },
          { id: 'dark', variants: ['desktop-dark'] }
        ]
      }
      const first = await visual(good, c)
      assert.equal(first.code, 0, first.out.slice(-800))
      assert.deepEqual(
        first.report.stages.map((s) => s.status),
        ['pass', 'pass']
      )
      assert.ok(first.report.pages[0].hash.startsWith('sha256:'))
      assert.ok(
        existsSync(path.join(first.out, first.report.pages[0].axes[0].sourceScreenshot)),
        'source shot'
      )
      const again = await visual(good, c, ['--reuse', first.out])
      assert.equal(again.code, 0)
      assert.equal(again.report.summary.reused, again.report.summary.axes, 'every axis reused')
      assert.ok(again.report.pages[0].axes.every((a) => a.measured === 'reused'))
      // referenced, not copied: index.json points at the first run's file
      const idx2 = JSON.parse(readFileSync(path.join(again.out, 'index.json'), 'utf8'))
      assert.ok(idx2.shots.every((s) => s.file.startsWith(path.resolve(first.out)) && existsSync(s.file)))
      assert.ok(!existsSync(path.join(again.out, again.report.pages[0].axes[0].screenshot)), 'no second copy')
      // A changed page hash (the contract's criteria changed) means measuring again.
      const c2 = structuredClone(c)
      c2.design.rules[0].styles['desktop-light']['font-weight'] = '700'
      const third = await visual(good, c2, ['--reuse', first.out])
      assert.equal(third.report.summary.reused, 0, 'criteria changed → nothing reused')
    } finally {
      await good.close()
    }
  })
  it('designSystem: a colour outside the palette is off-system; one row per distinct value', {
    timeout: 120000
  }, async () => {
    const site = await serve()
    try {
      const c = contract()
      c.designSystem = {
        colors: { light: ['rgb(255, 255, 255)'], dark: ['rgb(0, 0, 0)'] },
        colorsAlways: ['rgba(0, 0, 0, 0)'],
        fonts: c.fonts?.allowed ?? {},
        type: { sizes: ['13px', '16px', '32px'], tolerance: 0.5 },
        radius: ['0px', 'full'],
        check: { colors: ['color'], type: ['font-size'], radius: [], scope: 'main' }
      }
      const r = await visual(site, c)
      assert.equal(r.code, 1)
      has(r, 'scan:off-system')
      const rows = r.report.pages[0].findings.filter((f) => f.kind === 'scan:off-system')
      const keys = rows.map((f) => `${f.property}|${f.value}`)
      assert.equal(new Set(keys).size, keys.length, 'one row per (property, value)')
      assert.ok(rows.every((f) => f.count >= 1 && f.element))
    } finally {
      await site.close()
    }
  })
  it('an element covered by no rule is reported as unclassified (the author forgot a component)', {
    timeout: 120000
  }, async () => {
    const c = contract()
    c.design.coverage = [{ selector: 'main h1, main p.lede, .card p', properties: ['color'] }]
    const r = await visual(clean, c)
    assert.equal(r.code, 1)
    has(r, 'unclassified-element')
    assert.ok(r.report.summary.unclassified >= 2)
  })
  it('a contract exception with a cited decision moves the finding to accepted; without a decision it stays a finding', {
    timeout: 120000
  }, async () => {
    const site = await serve({ lowContrast: true })
    try {
      const c = contract()
      c.design.exceptions = [
        {
          kind: 'scan:contrast',
          match: '^p\\.meta',
          reason: 'muted meta label is the source design',
          decision: 'visual-contract.md §meta'
        },
        {
          kind: 'scan:dark-on-dark',
          match: '^p\\.meta',
          reason: 'same muted label in dark',
          decision: 'visual-contract.md §meta'
        }
      ]
      let r = await visual(site, c)
      assert.equal(r.code, 0, JSON.stringify(r.kinds))
      assert.ok(r.report.summary.accepted >= 1)
      assert.match(
        readFileSync(path.join(r.out, 'VISUAL.md'), 'utf8'),
        /Accepted exceptions[\s\S]*visual-contract\.md/
      )
      c.design.exceptions[0].decision = ''
      r = await visual(site, c)
      assert.equal(r.code, 1)
      has(r, 'scan:contrast')
    } finally {
      await site.close()
    }
  })
  it('a page that examined almost nothing fails instead of passing quietly', {
    timeout: 120000
  }, async () => {
    const c = contract()
    c.pages[0].path = '/tiny'
    c.pages[0].identity = 'p'
    c.pages[0].rules = []
    c.pages[0].states = ['default']
    c.pages[0].source = []
    const r = await visual(clean, c, ['--scans', 'contrast'])
    assert.equal(r.code, 1)
    has(r, 'page-did-not-render')
  })
})

/** The mock as a two-layout site with stages: the shape the fast gate needs (a root page, a 404 page). */
function staged() {
  const c = contract()
  c.locales = ['de']
  c.defaultLocale = 'de'
  c.visual = {
    stages: [
      { id: 'light', variants: ['desktop-light'] },
      { id: 'dark', variants: ['desktop-dark'] }
    ],
    shots: [{ stages: ['light', 'dark'], side: 'site', locales: ['de'], consumers: ['layout'] }]
  }
  c.pages.push({
    ...structuredClone(c.pages[0]),
    id: 'missing',
    path: '/missing',
    status: 404,
    states: ['default'],
    content: []
  })
  c.pages.push({
    ...structuredClone(c.pages[0]),
    id: 'about',
    path: '/about',
    states: ['default'],
    content: []
  })
  c.layouts = [
    {
      id: 'Home',
      view: 'src/views/Home.astro',
      representative: 'home',
      pages: ['home'],
      states: ['default', 'mega']
    },
    {
      id: 'About',
      view: 'src/views/About.astro',
      representative: 'about',
      pages: ['about'],
      states: ['default']
    },
    {
      id: 'NotFound',
      view: 'src/views/NotFound.astro',
      representative: 'missing',
      pages: ['missing'],
      states: ['default']
    }
  ]
  for (const p of c.pages) p.layout = c.layouts.find((l) => l.pages.includes(p.id)).id
  return c
}
describe('F15 — scopes: fast-gate, targeted-debug, full', () => {
  let clean
  before(async () => {
    clean = await serve()
  })
  after(async () => {
    await clean.close()
  })
  it("--scope fast-gate measures the resolver's cases on every stage, says so in visual.json/index.json, and writes the plan; --pages is targeted-debug; a full run needs a current, passing fast gate when one is named", {
    timeout: 300000
  }, async () => {
    const c = staged()
    const fast = await visual(clean, c, ['--scope', 'fast-gate'])
    assert.equal(fast.code, 0, fast.log.slice(-1500))
    assert.equal(fast.report.scope.kind, 'fast-gate')
    assert.deepEqual(
      fast.report.scope.plan.cases.map((x) => x.page).sort(),
      ['home', 'missing'],
      'root + 404; About covers nothing shared'
    )
    assert.deepEqual(fast.report.pages.map((p) => p.id).sort(), ['home', 'missing'])
    assert.deepEqual(
      fast.report.stages.map((s) => s.status),
      ['pass', 'pass'],
      'every stage, in order'
    )
    assert.ok(fast.report.contractHash?.startsWith('sha256:'))
    assert.ok(existsSync(path.join(fast.out, 'FAST-GATE-PLAN.md')))
    const idx = JSON.parse(readFileSync(path.join(fast.out, 'index.json'), 'utf8'))
    assert.equal(idx.scope, 'fast-gate')
    assert.ok(idx.shots.every((s) => ['home', 'missing'].includes(s.page)))
    // targeted debugging is its own scope, never a gate
    const dbg = await visual(clean, c, ['--pages', 'home'])
    assert.equal(dbg.report.scope.kind, 'targeted-debug')
    const both = await visual(clean, c, ['--pages', 'home', '--scope', 'fast-gate'])
    assert.equal(both.code, 2, 'a fast gate is resolved, not hand-picked')
    // a full run may cite a fast gate: it must have passed its verdict on this contract and this tree
    let full = await visual(clean, c, ['--fast-gate', fast.out])
    assert.equal(full.code, 2, full.log.slice(-600))
    assert.match(full.log, /fast gate .* has no verdict/)
    writeFileSync(
      path.join(fast.out, 'FAST-GATE.json'),
      JSON.stringify({
        status: 'pass',
        contractHash: fast.report.contractHash,
        pageHashes: Object.fromEntries(fast.report.pages.map((p) => [p.id, p.hash]))
      })
    )
    full = await visual(clean, c, ['--fast-gate', fast.out])
    assert.equal(full.code, 0, full.log.slice(-1500))
    assert.equal(full.report.scope.kind, 'full')
    assert.equal(full.report.fastGate.run, path.resolve(fast.out))
    assert.equal(full.report.pages.length, 3, 'full measures every page')
    const c2 = staged()
    c2.design.rules[0].styles['desktop-light']['font-weight'] = '700'
    full = await visual(clean, c2, ['--fast-gate', fast.out])
    assert.equal(full.code, 2)
    assert.match(full.log, /stale/)
  })
})

describe('F15 — tiles: a full-page picture is cut so a lens can read it', () => {
  it("--tile-height cuts site, source and frame pictures into ≤ N px tiles under shots/<page>--<variant>/; reused pictures point at the earlier run's tiles", {
    timeout: 240000
  }, async () => {
    const site = await serve()
    try {
      const c = contract()
      c.visual = {
        stages: [
          { id: 'light', variants: ['desktop-light'] },
          { id: 'dark', variants: ['desktop-dark'] }
        ]
      }
      const first = await visual(site, c, ['--tile-height', '300'])
      assert.equal(first.code, 0, `${JSON.stringify(first.kinds)}\n${first.log.slice(-800)}`)
      const idx = JSON.parse(readFileSync(path.join(first.out, 'index.json'), 'utf8'))
      const home = idx.shots.find((s) => s.side === 'site' && s.variant === 'desktop-light')
      assert.ok(
        home.tiles.length >= 2,
        `a ${'>'} 300 px page yields several tiles: ${JSON.stringify(home.tiles)}`
      )
      assert.ok(
        home.tiles.every(
          (t) => t.startsWith(path.join(first.out, 'shots', 'home--desktop-light')) && existsSync(t)
        )
      )
      const src = idx.shots.find((s) => s.side === 'source' && s.variant === 'desktop-light')
      assert.ok(src.tiles.length >= 2 && src.tiles.every(existsSync))
      const again = await visual(site, c, ['--tile-height', '300', '--reuse', first.out])
      const idx2 = JSON.parse(readFileSync(path.join(again.out, 'index.json'), 'utf8'))
      assert.ok(
        idx2.shots.every(
          (s) =>
            s.tiles.length >= 1 &&
            s.tiles.every((t) => t.startsWith(path.resolve(first.out)) && existsSync(t))
        ),
        'tiles referenced from the first run, not copied'
      )
      // a frame reference is tiled as well
      const frames = mkdtempSync(path.join(tmpdir(), 'frames-'))
      mkdirSync(path.join(frames, 'frames'))
      // the first run's own full-page picture stands in for an exported frame (the logo fixture is 2 px)
      writeFileSync(path.join(frames, 'frames/home.png'), readFileSync(home.file))
      const cf = contract()
      cf.source = {
        reference: 'x',
        kind: 'frames',
        parity: 'declared',
        files: [{ path: 'frames/home.png', sha256: 'sha256:' + 'a'.repeat(64), disposition: 'reference' }]
      }
      delete cf.design.parity
      cf.pages[0].source = ['frames/home.png']
      const fr = await visual(site, cf, ['--source-dir', frames, '--tile-height', '300'])
      assert.equal(fr.code, 0, fr.log.slice(-800))
      const idx3 = JSON.parse(readFileSync(path.join(fr.out, 'index.json'), 'utf8'))
      const frame = idx3.shots.find((s) => s.side === 'source')
      assert.ok(frame.tiles.length >= 2 && frame.tiles.every(existsSync), JSON.stringify(frame))
    } finally {
      await site.close()
    }
  })
})

describe('F15 — frame references (source.kind frames): a picture and declared numbers, no DOM to read', () => {
  it('a page whose source is an exported frame gets that frame as its source picture (referenced, not copied), parity basis `declared`, and is still measured on every axis; a missing frame is a finding', {
    timeout: 120000
  }, async () => {
    const site = await serve()
    try {
      const c = contract()
      c.source = {
        reference: 'design export',
        kind: 'frames',
        parity: 'declared',
        files: [
          { path: 'frames/home-1280.png', sha256: 'sha256:' + 'a'.repeat(64), disposition: 'reference' }
        ]
      }
      delete c.design.parity
      c.pages[0].source = ['frames/home-1280.png']
      const frames = mkdtempSync(path.join(tmpdir(), 'frames-'))
      mkdirSync(path.join(frames, 'frames'))
      writeFileSync(path.join(frames, 'frames/home-1280.png'), LOGO)
      let r = await visual(site, c, ['--source-dir', frames])
      assert.equal(r.code, 0, r.log.slice(-1500))
      const light = r.report.pages[0].axes[0]
      assert.equal(light.parity.basis, 'declared')
      assert.equal(light.sourceScreenshot, path.join(frames, 'frames/home-1280.png'))
      assert.ok(r.report.summary.components >= 4, 'rules still measured against the declared numbers')
      assert.equal(r.report.summary.axes, 2, 'dark still measured although the export has no dark frame')
      const idx = JSON.parse(readFileSync(path.join(r.out, 'index.json'), 'utf8'))
      assert.ok(
        idx.shots.some((s) => s.side === 'source' && s.file === path.join(frames, 'frames/home-1280.png'))
      )
      c.pages[0].source = ['frames/nope.png']
      r = await visual(site, c, ['--source-dir', frames])
      assert.equal(r.code, 1)
      has(r, 'reference-missing')
    } finally {
      await site.close()
    }
  })
})

describe('F12 — visual-scan and mega-hover CLIs', { concurrency: CONCURRENCY }, () => {
  it('visual-scan white on a dark page with a leak → needs-review (3); clean → pass (0); tiny page → fail (1)', {
    timeout: 120000
  }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vscan-'))
    writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
    const leaky = await serve({ whiteLeak: true }),
      clean = await serve()
    try {
      let r = await run('visual-scan.mjs', ['white', `${leaky.origin}/`, '--theme', 'dark'], root)
      assert.equal(r.code, 3, r.out)
      assert.match(r.out, /"kind":"white-surface"/)
      r = await run('visual-scan.mjs', ['white', `${clean.origin}/`, '--theme', 'dark'], root)
      assert.equal(r.code, 0, r.out)
      r = await run('visual-scan.mjs', ['white', `${clean.origin}/tiny`, '--theme', 'dark'], root)
      assert.equal(r.code, 1, r.out)
    } finally {
      await leaky.close()
      await clean.close()
    }
  })
  it('mega-hover with explicit selectors: clean PASS with gapPx 0; a 30px strip closes the panel on the way down → FAIL with closedAtY', {
    timeout: 120000
  }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'mega-'))
    writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
    const good = await serve(),
      gap = await serve({ megaGap: true })
    try {
      let r = await run(
        'mega-hover.mjs',
        [
          `${good.origin}/`,
          '--trigger',
          '#trigger',
          '--panel',
          '#panel',
          '--link',
          '#panel a',
          '--open',
          'hover'
        ],
        root
      )
      assert.equal(r.code, 0, r.out)
      assert.match(r.out, /"gapPx":0/)
      r = await run(
        'mega-hover.mjs',
        [
          `${gap.origin}/`,
          '--trigger',
          '#trigger',
          '--panel',
          '#panel',
          '--link',
          '#panel a',
          '--open',
          'hover'
        ],
        root
      )
      assert.equal(r.code, 1, r.out)
      assert.match(r.out, /"gapPx":30/)
      assert.match(r.out, /closedAtY/)
    } finally {
      await good.close()
      await gap.close()
    }
  })
  it('every tool picks its browser through qa-browser.mjs, so no run silently uses the machine Chrome', {
    timeout: 180000
  }, () => {
    // #78 pinned the renderer for the QA tools; seven others kept `channel: 'chrome'` with a quiet
    // fallback. Measured 16/09: the machine's Chrome was 152.0.7977.84 against the lockfile's
    // 153.0.8010.12, Chrome updates itself, and none of the seven wrote the renderer into its
    // output — so a difference between two runs could not be attributed to the site.
    const offenders = readdirSync(TOOLS)
      .filter((f) => f.endsWith('.mjs') || f.endsWith('.cjs'))
      .filter((f) => /channel:\s*'chrome'|from 'playwright'/.test(readFileSync(path.join(TOOLS, f), 'utf8')))
      .filter((f) => f !== 'qa-browser.mjs')
    assert.deepEqual(offenders, [], `these launch a browser of their own: ${offenders.join(', ')}`)
  })
  it('a parity pair the site does not have is still reported, and a second page citing the same source file measures it once', async () => {
    // Two changes, both about work that produced nothing -- measured on a 288-axis matrix of a
    // contract built from this kit, 2026-09-16: 204 site-side lookups for selectors simply not on
    // the page, each waiting the locator's full 3000 ms timeout (612 s, 26.2 % of a 39-minute
    // run), and 14 of every 48 axes re-opening a source file the run had already measured
    // (3.6 min). The base template this kit generates shares 6 of its 31 pages' source files, so
    // the second applies to a generated contract too. Neither may cost a finding, which is what this pins:
    //   · the site side is read in ONE in-page pass now, so an absent pair resolves at once --
    //     and `parity-not-measured` must still fire when the source HAS what the site lacks;
    //   · a source reading is reused only for an axis wanting no source picture and no
    //     content-keyed pair, and the reused numbers must equal the ones first measured.
    const site = await serve({ siteLostCta: true })
    try {
      const c = contract()
      c.pages.push({
        ...structuredClone(c.pages[0]),
        id: 'about',
        path: '/about',
        states: ['default'],
        parity: ['cta'],
        content: []
      })
      // `consumersFor` answers `['reviewer']` for EVERY side when a contract declares no
      // `visual.shots`, so without these two the second page would be told it needs a source
      // picture and would open the file again -- the fixture, not the cache, failing the test.
      c.layouts = [
        {
          id: 'Home',
          view: 'src/views/Home.astro',
          representative: 'home',
          pages: ['home'],
          states: ['default', 'mega']
        },
        {
          id: 'About',
          view: 'src/views/About.astro',
          representative: 'about',
          pages: ['about'],
          states: ['default']
        }
      ]
      for (const pg of c.pages) pg.layout = c.layouts.find((l) => l.pages.includes(pg.id))?.id
      c.visual = {
        stages: [{ id: 'all', variants: ['desktop-light', 'desktop-dark'] }],
        shots: [{ stages: ['all'], side: 'site', locales: ['de'], consumers: ['layout'] }]
      }
      const r = await visual(site, c)
      const axisOf = (id) =>
        r.report.pages.find((p) => p.id === id).axes.find((a) => a.variant === 'desktop-light')
      const home = r.report.pages.find((p) => p.id === 'home')

      assert.ok(
        !axisOf('home').parity.site.cta,
        `the site side records the pair as absent: ${JSON.stringify(axisOf('home').parity.site)}`
      )
      assert.ok(axisOf('home').parity.source.cta, 'the source side still has it')
      assert.ok(
        home.findings.some((f) => f.kind === 'parity-not-measured' && f.selector === 'cta'),
        `an absent pair is still a finding, not a silent skip\n${JSON.stringify(r.kinds)}`
      )

      assert.ok(axisOf('about').sourceReused, 'the second page cites a source already measured')
      assert.ok(!axisOf('home').sourceReused, 'the first page measures it')
      assert.deepEqual(
        axisOf('about').parity.source.cta,
        axisOf('home').parity.source.cta,
        'a reused reading is the reading that was taken, not a fresh approximation'
      )
    } finally {
      await site.close()
    }
  })
  it('a page whose parity finds the source by its own text is never served a cached source', {
    timeout: 180000
  }, async () => {
    // `h1` locates the source element by THIS page's `expected` text, so its reading belongs to
    // the page, not to the file. Two pages citing one file must each measure it.
    const site = await serve()
    try {
      const c = contract()
      c.pages.push({
        ...structuredClone(c.pages[0]),
        id: 'about',
        path: '/about',
        states: ['default'],
        content: [
          { ...structuredClone(c.pages[0].content[0]), expected: 'Handgefertigte Möbel aus dem Norden.' }
        ]
      })
      c.layouts = [
        {
          id: 'Home',
          view: 'src/views/Home.astro',
          representative: 'home',
          pages: ['home'],
          states: ['default', 'mega']
        },
        {
          id: 'About',
          view: 'src/views/About.astro',
          representative: 'about',
          pages: ['about'],
          states: ['default']
        }
      ]
      for (const pg of c.pages) pg.layout = c.layouts.find((l) => l.pages.includes(pg.id))?.id
      c.visual = {
        stages: [{ id: 'all', variants: ['desktop-light', 'desktop-dark'] }],
        shots: [{ stages: ['all'], side: 'site', locales: ['de'], consumers: ['layout'] }]
      }
      const r = await visual(site, c)
      const about = r.report.pages.find((p) => p.id === 'about')
      const home = r.report.pages.find((p) => p.id === 'home')
      assert.ok(!about.axes.some((a) => a.sourceReused), 'a content-keyed page measures its own source')
      // …and pin the mechanism, not just the outcome. This used to assert only the line above,
      // which passed for a reason the test did not name: the donor never puts a content-keyed key
      // in its entry, so `covers` rejects the recipient before anything about content is asked.
      // The two halves below are what actually hold, and either one breaking must fail here.
      const homeSrc = home.axes.find((a) => a.variant === 'desktop-light').parity.source
      const aboutSrc = about.axes.find((a) => a.variant === 'desktop-light').parity.source
      assert.ok(homeSrc.h1, 'the donor DID measure the content-keyed pair for itself')
      assert.ok(aboutSrc.h1, 'and the recipient measured its own, by its own expected text')
      assert.notDeepEqual(
        aboutSrc.h1,
        homeSrc.h1,
        'the two pages name different source elements, so a shared reading would be the wrong one'
      )
    } finally {
      await site.close()
    }
  })
  it('a parity selector this reader cannot resolve is a finding, not a silent "not on the page"', {
    timeout: 300000
  }, async () => {
    // Absence is an ANSWER in this tool: a pair missing on both sides is a role the page does not
    // have. So a selector the in-page reader cannot resolve -- Playwright syntax it does not
    // speak, or CSS the browser rejects -- must never be folded into that answer. The site side
    // accepts one CSS selector plus at most one non-negative `nth=`; everything else is reported.
    // One contract, one run, five shapes. Each `visual()` call is a whole visual-qa pass over a mock
    // site -- a browser, a server, the full stage matrix -- and looping the shapes made this the
    // slowest case in the suite: 81 s of the file's 10:11, measured 2026-09-17. The shapes are
    // independent selectors, so they fit in one contract as five pairs and prove exactly the same
    // thing: each must be REPORTED, and none may masquerade as a one-sided absence.
    const BAD = {
      negativeNth: 'main a >> nth=-1',
      chained: 'main >> a',
      engineText: 'text=Willkommen',
      hasText: 'main a:has-text("x")',
      invalidCss: 'main a[['
    }
    const site = await serve()
    try {
      const c = contract()
      for (const [k, bad] of Object.entries(BAD))
        c.design.parity.selectors[k] = { site: bad, source: 'main a.btn' }
      const r = await visual(site, c)
      const findings = r.report.pages[0].findings
      for (const [k, bad] of Object.entries(BAD)) {
        assert.ok(
          findings.some((x) => x.kind === 'parity-selector-unsupported' && x.selector === k),
          `\`${bad}\` must be reported, not read as an absent element\n${JSON.stringify(r.kinds)}`
        )
        assert.ok(
          !findings.some((x) => x.kind === 'parity-not-measured' && x.selector === k),
          `\`${bad}\` must not masquerade as a one-sided absence`
        )
      }
    } finally {
      await site.close()
    }
  })
  it('a source page whose pictures are below the fold is scrolled before it is measured', {
    timeout: 300000
  }, async () => {
    // A design source is often plain HTML whose pictures carry `loading="lazy"` -- 23 of the 183 in
    // the base template this kit generates.
    // A full-page screenshot does not scroll, so at the point the runner shoots them they have
    // never been requested. Measured 2026-09-17 on the base template's `about.html` at exactly that
    // point -- `networkidle`, `fonts.ready`, 200 ms -- three loads gave 5, 6 and 6 of 11 images
    // undecoded; one scroll pass through the document gave 0 of 11 every time. Reloading cannot
    // fix it, because lazy stays lazy. Two harms, and this pins both: the saved picture shows
    // empty frames where the design has photos, and `imageCensus` counts only decoded images, so
    // the SOURCE side under-reports what the page promises and `image-missing` cannot fire for a
    // picture the site is really missing.
    const site = await serve({ lazySource: true })
    try {
      const r = await visual(site, contract())
      assert.ok(
        !r.kinds.includes('source-not-rendered'),
        `scrolling is what a lazy picture needs, so nothing is left pending\n${JSON.stringify(r.kinds)}`
      )
      const axis = r.report.pages[0].axes[0]
      assert.equal(axis.sourceLoads, 1, 'and it takes one load, not a retry')
      assert.equal(
        axis.sourceSlots,
        1,
        `both source pictures were examined, the one above the fold and the one far below it: ${JSON.stringify(axis)}`
      )
      assert.ok(
        axis.images.source >= 2,
        `and the census counts the deep one, which decides what the site is asked for: ${JSON.stringify(axis.images)}`
      )
    } finally {
      await site.close()
    }
  })
  it('a source render still showing placeholders is loaded again, and reported when loading again does not help', {
    timeout: 300000
  }, async () => {
    // The design export's picture component settles filled or unfilled PER LOAD and latches --
    // measured 2026-09-16 on a contract built from this kit's About page: six loads gave 0/7 · 7/7 ·
    // 0/7 · 7/7 · 7/7 · 0/7 slots carrying `data-filled`, and polling to 5 s never changed one of
    // them. The
    // unfilled state is not cosmetic: CSS draws a dashed placeholder ring over every picture, so
    // the saved artifact tells a reviewer the design has no photo where it has one. Proven to be
    // the entire pixel difference: forcing the attribute on a 0/7 load reproduced a naturally-7/7
    // screenshot byte for byte, three times of three. Waiting cannot fix a latched state, so the
    // runner loads again -- and when that does not help it must say so rather than save the lie.
    const cfg = (c) => {
      c.design.source = { rendered: { selector: 'picture-slot[src]', attribute: 'data-filled' } }
      return c
    }
    const racing = await serve({ slotRace: true })
    try {
      const r = await visual(racing, cfg(contract()))
      assert.ok(
        !r.kinds.includes('source-not-rendered'),
        `a second load settles it, so nothing to report\n${JSON.stringify(r.kinds)}`
      )
      assert.ok(
        r.report.pages[0].axes.some((a) => a.sourceLoads > 1),
        `the runner loaded the source again\n${JSON.stringify(r.report.pages[0].axes.map((a) => a.sourceLoads))}`
      )
    } finally {
      await racing.close()
    }
    const stuck = await serve({ slotNeverFills: true })
    try {
      const r = await visual(stuck, cfg(contract()))
      const f = r.report.pages[0].findings.find((x) => x.kind === 'source-not-rendered')
      assert.ok(f, `a source that never renders is a finding\n${JSON.stringify(r.kinds)}`)
      assert.equal(f.pending, 1)
      assert.equal(f.loads, 3, 'and it tried a bounded number of times before saying so')
      assert.equal(r.code, 1, 'a run holding such a picture does not pass')
    } finally {
      await stuck.close()
    }
  })
})

// Responsive parity must measure the same visible roles on both sides.
it('hidden responsive nav and CTA are absent on both sides, but a visible source role still differs', async () => {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await page.setContent(
      '<nav style="display:none"><a id="nav">Product</a></nav><a id="cta" style="display:none">Contact</a><a id="visible">Visible</a>'
    )
    const selectors = { nav: '#nav', cta: '#cta', visible: '#visible' }
    const properties = ['color']
    const site = await page.evaluate(siteSnapshotOf, { selectors, properties })
    const source = await page.evaluate(snapshotOf, { selectors, properties })
    assert.ok(!site.nav && !source.nav, 'an ancestor-hidden nav is absent on both sides')
    assert.ok(!site.cta && !source.cta, 'a display-none CTA is absent on both sides')
    assert.ok(site.visible && source.visible, 'visible roles are still measured')
    await page.locator('#cta').evaluate((e) => (e.style.display = 'inline-block'))
    const visibleSource = await page.evaluate(snapshotOf, { selectors, properties })
    assert.ok(visibleSource.cta && !site.cta, 'a real visibility disagreement remains observable')
    assert.ok(
      diffSnapshots(site, visibleSource).mismatches.some((m) => m.selector === 'cta'),
      'visibility disagreement must remain a finding'
    )
  } finally {
    await browser.close()
  }
})

it('same-document fragment navigation verifies the real HTTP status, including a 404 document', async () => {
  const site = await serve()
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    await navigate(page, `${site.origin}/tiny#drawer`)
    assert.equal(
      await navigate(page, `${site.origin}/tiny#drawer`),
      200,
      'same fragment remains a verified 200'
    )
    assert.equal(
      await navigate(page, `${site.origin}/tiny#other`),
      200,
      'a changed fragment also verifies the document'
    )
    await assert.rejects(
      navigate(page, `${site.origin}/missing#drawer`),
      /HTTP 404/,
      'a real 404 is rejected'
    )
    await assert.rejects(
      navigate(page, `${site.origin}/missing#drawer`),
      /HTTP 404/,
      'same-fragment 404 cannot become a pass'
    )
    assert.equal(
      await navigate(page, `${site.origin}/missing#drawer`, { expectedStatus: 404 }),
      404,
      'an explicitly expected 404 is measured'
    )
    assert.equal(
      await navigate(page, `${site.origin}/tiny#drawer`),
      200,
      'a different document still takes the ordinary navigation path'
    )
  } finally {
    await browser.close()
    await site.close()
  }
})

it('seam scanning ignores a proven sticky occlusion but preserves visible, offscreen and nested seams', async () => {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
    await page.setContent('<style>body{margin:0;height:2500px}header{position:sticky;top:0;z-index:40;height:79px;border-bottom:1px solid #888;background:rgba(255,255,255,.8)}.spacer{height:420px}input{display:block;box-sizing:border-box;width:600px;height:80px;border:1px solid #888}</style><header>Header</header><div class="spacer"></div><input>')
    await page.evaluate(() => scrollTo(0, 500))
    assert.equal((await page.evaluate(scanSeams)).length, 0, 'an opaque sticky border hides the coincident input border over a translucent surface')
    await page.setContent('<style>body{margin:0;height:2500px}.a{height:40px;border-bottom:1px solid #888}.b{margin-top:1px;height:40px;border-top:1px solid #888}</style><div class="a">First</div><div class="b">Second</div>')
    await page.evaluate(() => scrollTo(0, 0))
    assert.ok((await page.evaluate(scanSeams)).length > 0, 'adjacent visible borders remain a seam')
    await page.locator('.a').evaluate((e) => (e.style.marginTop = '1600px'))
    assert.ok((await page.evaluate(scanSeams)).length > 0, 'offscreen full-page coverage is preserved')
    await page.setContent('<style>body{margin:0}.hero{position:relative;height:120px;width:600px;border-bottom:1px solid #888}.inner{position:absolute;bottom:1px;left:0;width:600px;height:60px;border-bottom:1px solid #888}</style><div class="hero"><div class="inner">Nested preview</div></div>')
    await page.evaluate(() => scrollTo(0, 0))
    assert.ok((await page.evaluate(scanSeams)).length > 0, 'a real nested hero border seam remains a finding')
  } finally {
    await browser.close()
  }
})
