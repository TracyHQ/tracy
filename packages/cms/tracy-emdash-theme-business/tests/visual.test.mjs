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

// Tests here are independent by construction: each serves its fixture on an ephemeral port
// (`srv.listen(0)`) into a fresh `mkdtempSync` directory, and each `visual()` spawns its own
// visual-qa process with its own browser. Measured 2026-09-17: the file spends 28 % of one core --
// it is waiting on browsers, not computing -- while running strictly one case at a time. CONCURRENCY
// is the knob that measurement points at; it is read from the environment so a run can be compared
// against itself without editing the file. Measured 2026-09-17 on this file: 660 s at 1, 273 s and
// 275 s on two runs at 4 -- 2.4x, with the SAME 34 passing cases every time and the two concurrent
// runs two seconds apart, which is what makes 4 a measurement rather than a guess. Raising it
// further was not measured; the cases hold a browser each, so the ceiling is memory, not cores.
const CONCURRENCY = Number(process.env.VQA_TEST_CONCURRENCY ?? 4)

/*
 * The mock mega panel after Escape. It opens on CSS `:hover`, and the pointer still sits on the
 * trigger when the readers press Escape, so only the `closed` class keeps it shut; `mega-hover.mjs`
 * and `qa-browser.mjs` then prove Escape worked with a polled `waitFor({ state: 'hidden' })`.
 *
 * The class goes when the pointer next moves over the item or leaves it — what a real menu does —
 * and never on a timer. A timer made the fixture's correct state last a fixed slice of wall-clock:
 * 50 ms, then 600 ms (1048c659b), and a reader stalled past it saw the panel back under `:hover`
 * and reported `escapeCloses: false`, which reads exactly like a broken menu. The SaaS copy of this
 * mock lost its 600 ms once on a loaded runner (CI of #852, 04/10/2026); with Playwright's `slowMo`
 * at 700 ms it failed 6 runs of 6. Each reader hovers the trigger again right after (a move, so the
 * panel comes back at once).
 */

/**
 * The `unhoverable` notice: a link that hides itself on the first pointer move AFTER the hover scan
 * has tagged it. The case it sets up is "tagged, so the loop reaches it, but by then it is
 * display:none" -- and that needs the order tag -> pointer -> hide.
 *
 * It used to arm on load (`mouseover`, once). But the hover scan is not the first thing on an axis
 * to move the pointer: parity pairs declared `hover: true` hover their elements first
 * (visual-qa.mjs, the `pair.hover` branch), so the notice was already gone when `tagInteractive`
 * ran. Never tagged means never skipped: `scans.hover` equalled the clean page's, the run reported
 * no finding at all and exited 0. Measured 2026-09-18 on the CI box: 3 runs of 3 failed exactly
 * so, and run 35331757501 failed both cases that use this fixture.
 *
 * Arming on the tag itself (`data-vqa` appearing on the notice) pins the order the case is about.
 */
const UNHOVERABLE_SCRIPT =
  "(()=>{const n=document.querySelector('.notice-dismiss');" +
  "const arm=()=>document.addEventListener('mouseover',()=>{n.hidden=true},{once:true});" +
  "if(n.hasAttribute('data-vqa'))return arm();" +
  "new MutationObserver((m,o)=>{if(n.hasAttribute('data-vqa')){o.disconnect();arm()}})" +
  ".observe(n,{attributes:true,attributeFilter:['data-vqa']})})();"

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
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Mock</title>
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
.btn.lift{display:inline-block;transition:transform 400ms ease-in}.btn.lift:hover{transform:translateY(-4px)}
.btn.drift{display:inline-block}
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
</style></head><body>
<script>customElements.define('image-slot',class extends HTMLElement{connectedCallback(){const r=this.attachShadow({mode:'open'});const i=document.createElement('img');i.src=this.getAttribute('src');i.width=40;i.height=40;r.appendChild(i)}})</script>
<header><strong>Mock</strong><nav><ul>
<li class="has-panel"><a href="#" id="trigger" aria-expanded="false">Resources</a>
<div id="panel"><div class="inner"><a href="/about">About</a><a href="/kontakt">Kontakt</a><a href="/news">News</a></div></div></li>
<li><a href="/about">About</a></li><li><a href="/kontakt">Kontakt</a></li></ul></nav></header>
<main><div class="lead" style="height:60px">${picture}</div><h1>Willkommen</h1><p class="lede">Handgefertigte Möbel aus dem Norden.</p>
<div class="cards"><div class="card"><p>Card one</p><p class="meta">Meta one</p></div><div class="card"><p>Card two</p><p class="meta">Meta two</p></div><div class="card"><p>Card three</p><p class="byline">By someone</p></div></div>
${d.slotRace || d.slotNeverFills ? `<picture-slot src="/logo.png"${d.slotFilled ? ' data-filled=""' : ''}></picture-slot>` : ''}
<div class="seam-a"></div><div class="seam-b"><p>Below the cards.</p>${d.siteLostCta && !source ? '' : '<a class="btn" href="/kontakt">Contact us</a>'}<button>Click</button>${d.hoverLift ? '<a class="btn lift" href="/news">Lift</a>' : ''}${d.jsMotion ? '<a class="btn drift" href="/news">Drift</a>' : ''}${d.unhoverable ? '<a class="notice-dismiss" href="/kontakt">Dismiss</a>' : ''}</div>
<ul><li>one</li><li>two</li><li>three</li><li>four</li></ul></main>
<footer><a href="/about">About</a> · <a href="/kontakt">Kontakt</a> · <span>© Mock</span></footer>
<script>
const t=document.getElementById('trigger'),p=document.getElementById('panel'),li=t.parentElement;
li.addEventListener('mouseleave',()=>{p.classList.remove('open');li.classList.remove('closed');t.setAttribute('aria-expanded','false')});
li.addEventListener('mouseenter',()=>{p.classList.add('open');t.setAttribute('aria-expanded','true')});
li.addEventListener('mousemove',()=>li.classList.remove('closed'));
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){p.classList.remove('open');li.classList.add('closed');t.focus()}});
document.addEventListener('click',(e)=>{if(!li.contains(e.target))p.classList.remove('open')});
${d.unhoverable ? UNHOVERABLE_SCRIPT : ''}
${d.jsMotion ? "(function(){const e=document.querySelector('.btn.drift');const step=(t)=>{e.style.transform='translateX('+((t/10)%40)+'px)';requestAnimationFrame(step)};requestAnimationFrame(step)})();" : ''}
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
  it('tolerates antialiasing-level colour and sub-pixel deltas, ignores Astro font hashes, flags real deltas and missing sides', {
    timeout: 120000
  }, () => {
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
  it('clean page: both axes pass, components measured, coverage classified, mega travel PASS, parity 0 mismatches', async () => {
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
    // pixels" would miss exactly what `horizontal-overflow` is about. These fixtures do not
    // overflow, so every row must say so; the flag existing at all is what makes the skip safe.
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
        // and its Sightings column says how many times it was seen. A reader who has to do that
        // collapsing by hand is doing work before they can decide anything — measured 18/09 on a
        // real run, 1,302 findings were 17 problems.
        {
          const md = readFileSync(path.join(r.out, 'VISUAL.md'), 'utf8')
          const triage = md.slice(md.indexOf('## Triage'), md.indexOf('| Page | Axis | Component'))
          const rows = triage.split('\n').filter((l) => l.startsWith(`| ${kind} |`))
          assert.equal(rows.length >= 1, true, `no triage row for ${kind}:\n${triage}`)
          const seen = r.report.pages.flatMap((p) => p.findings).filter((f) => f.kind === kind).length
          const counted = rows.reduce((n, l) => n + Number(l.split('|')[4].trim() || 0), 0) // | kind | where | what | N |
          assert.equal(
            counted,
            seen,
            `triage counted ${counted} sighting(s), the run found ${seen}\n${triage}`
          )
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
  it('hoverLift → scan:hover-jump: a box that moves behind a 400 ms transition is a hover jump too, not only an instant one', {
    timeout: 120000
  }, async () => {
    // The `hoverJump` case above jumps instantly. This one moves the same 4 px behind
    // `transition: transform 400ms ease-in` — the shape shadcn/Tailwind buttons ship
    // (`transition-all`, 150 ms, cubic-bezier(0.4,0,0.2,1)). Measured 15/09 in Chrome via
    // Playwright: the context's `reducedMotion: 'reduce'` only flips the media query, it does
    // NOT stop CSS transitions (translateY(-4px) over 300 ms ease reads -0.88 px at 60 ms and
    // -4 px at 300 ms under `reduce`); neither Tailwind 4's preflight nor the template's
    // stylesheets carry a `prefers-reduced-motion` rule, so the real template's transitions
    // survive it the same way. A sample taken 60 ms after the pointer arrives is under the
    // tool's 1 px threshold and calls the page clean.
    const site = await serve({ hoverLift: true })
    try {
      const r = await visual(site)
      assert.equal(r.code, 1, `expected exit 1\n${r.out.slice(-800)}`)
      const jumps = r.report.pages[0].findings.filter((f) => f.kind === 'scan:hover-jump')
      assert.ok(
        jumps.some((f) => f.text === 'Lift' && f.moved?.y),
        `the lifted button must be reported as a hover jump on y\n${JSON.stringify(jumps)}`
      )
    } finally {
      await site.close()
    }
  })
  it('unhoverable → an interactive element the pointer never reached is not counted as examined, and the skip is a finding', {
    timeout: 180000
  }, async () => {
    // `scans.hover` is what a reviewer reads as "N interactive elements were hovered". The
    // fixture adds a notice link that hides itself on the first pointer move (a
    // dismiss-on-interaction bar): it is tagged, so the loop reaches it, but by then it is
    // display:none — it has no box to scroll to, and the loop `continue`s. The count
    // must say how many were MEASURED, and the one that was not must be visible in the report
    // as `scan:hover-not-measured` (that kind name is the contract a fix must meet), the way
    // `parity-not-measured` reports a pair one side lacks. Measured 15/09: a force-hover on
    // an element behind an overlay does NOT throw (force skips the receives-events check); a
    // display:none one used to make scrollIntoViewIfNeeded time out after 1.5 s, and is now
    // reported from the rest read itself (`not-in-view`) without the wait.
    const cleanRun = await visual(clean)
    // If the clean control fails here (as CI #161 line 401 did for real), say WHY: the axes'
    // scan tallies and any findings from the run's own report, not just the output directory —
    // so a real clean-page failure is diagnosable from the log instead of hidden behind a path.
    assert.equal(
      cleanRun.code,
      0,
      cleanRun.report
        ? JSON.stringify({
            axes: cleanRun.report.pages.flatMap((p) =>
              p.axes.map((a) => ({ variant: a.variant, scans: a.scans }))
            ),
            findings: cleanRun.report.pages.flatMap((p) => p.findings)
          })
        : cleanRun.out.slice(-800)
    )
    const cleanHover = cleanRun.report.pages[0].axes.find((a) => a.variant === 'desktop-light').scans.hover
    assert.ok(cleanHover >= 3, `the clean page hovers a few elements: ${cleanHover}`)
    const site = await serve({ unhoverable: true })
    try {
      const r = await visual(site)
      const light = r.report.pages[0].axes.find((a) => a.variant === 'desktop-light')
      assert.equal(
        light.scans.hover,
        cleanHover,
        `scans.hover counts measured elements only (clean page ${cleanHover}); ${JSON.stringify(light.scans)}`
      )
      const skipped = r.report.pages[0].findings.filter((f) => f.kind === 'scan:hover-not-measured')
      assert.ok(
        skipped.some((f) => f.text === 'Dismiss'),
        `the skipped element is surfaced as a finding\n${JSON.stringify(r.kinds)}`
      )
      assert.equal(r.code, 1, 'an element the scan could not examine is not a pass')
    } finally {
      await site.close()
    }
  })
  it('jsMotion → a box moving frame by frame with nothing in getAnimations() is reported unsettled, not as a hover jump', {
    timeout: 180000
  }, async () => {
    // The rest read no longer goes through Playwright's `scrollIntoViewIfNeeded`, whose
    // two-frame stability wait was the one thing standing between script-driven motion (a
    // `requestAnimationFrame` loop writing `transform`: no CSS transition, no CSS animation, so
    // `getAnimations()` is empty on the whole chain) and a rest rect read mid-motion. Without a
    // replacement, this fixture would come back as `scan:hover-jump` with two numbers that are
    // just two instants of the same drift. The loop must instead re-read the box across two
    // frames when rest and hovered differ, see it still moving, and report the element as not
    // measured with reason `unsettled` -- the outcome the old wait produced, minus its 1.5 s.
    const site = await serve({ jsMotion: true })
    try {
      const r = await visual(site)
      assert.equal(r.code, 1, `expected exit 1\n${r.out.slice(-800)}`)
      const findings = r.report.pages[0].findings
      const drift = findings.filter((f) => f.text === 'Drift')
      assert.ok(
        drift.length > 0 &&
          drift.every((f) => f.kind === 'scan:hover-not-measured' && f.reason === 'unsettled'),
        `the drifting button is not measured, and says why\n${JSON.stringify(drift)}`
      )
      assert.ok(
        !findings.some((f) => f.kind === 'scan:hover-jump'),
        `a box that was moving anyway is not a hover jump\n${JSON.stringify(findings.filter((f) => f.kind === 'scan:hover-jump'))}`
      )
    } finally {
      await site.close()
    }
  })
  it('--reuse must notice a changed designSystem: stricter off-system criteria mean the page is measured again and fails, not reused as a pass', {
    timeout: 240000
  }, async () => {
    // pageHash (visual-lib) folds in contract.design, interactions, variants, visual/layouts
    // and the page spec — the stages test above proves a changed design.rule is measured
    // again. It does NOT fold in contract.designSystem, which scanOffSystem reads: tightening
    // the type scale between two runs leaves the hash unchanged, and a --reuse run copies the
    // earlier pass for a page that now violates the system. (contractHash in qa-contract.mjs
    // hashes the whole contract, but only the --fast-gate verdict path checks it.)
    const site = await serve()
    try {
      const c = contract()
      c.designSystem = {
        colors: { light: [], dark: [] },
        colorsAlways: [],
        fonts: {},
        type: { sizes: ['13px', '16px', '32px'], tolerance: 1 },
        radius: [],
        check: { colors: [], type: ['font-size'], radius: [], scope: 'main' }
      }
      const first = await visual(site, c)
      assert.equal(first.code, 0, first.out.slice(-800))
      const c2 = structuredClone(c)
      c2.designSystem.type.sizes = ['32px']
      const fresh = await visual(site, c2)
      assert.equal(fresh.code, 1, 'the stricter system fails when measured')
      has(fresh, 'scan:off-system')
      const again = await visual(site, c2, ['--reuse', first.out])
      assert.equal(again.report.summary.reused, 0, 'criteria changed → nothing reused')
      assert.equal(
        again.code,
        1,
        `a changed designSystem must be measured, not reused\n${again.out.slice(-600)}`
      )
      has(again, 'scan:off-system')
    } finally {
      await site.close()
    }
  })
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
      assert.equal(
        r.code,
        0,
        JSON.stringify({
          findings: r.report?.pages.flatMap((p) => p.findings) ?? [],
          accepted: r.report?.pages.flatMap((p) => p.axes.flatMap((a) => a.accepted ?? [])) ?? [],
          mega:
            r.report?.pages.flatMap((p) =>
              p.axes.flatMap((a) =>
                (a.mega ?? []).map((m) => ({
                  axis: a.variant,
                  state: m.state,
                  verdict: m.verdict,
                  steps: m.steps
                }))
              )
            ) ?? [],
          kinds: r.kinds
        })
      )
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

/** Decode `shot.file` and each of `shot.tiles` in a browser canvas; each tile's pixels must equal the strip at its offset. */
async function assertTilesAreStrips(shot) {
  const { launchBrowser } = await import('../tools/qa-browser.mjs')
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    const dataUrl = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64')
    // Both pictures are decoded and compared inside the page: the byte arrays never cross the wire.
    const compare = (tile, y) =>
      page.evaluate(
        async ([tileUrl, fullUrl, y]) => {
          const draw = async (url) => {
            const img = new Image()
            img.src = url
            await img.decode()
            const c = document.createElement('canvas')
            c.width = img.naturalWidth
            c.height = img.naturalHeight
            const ctx = c.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(img, 0, 0)
            return { ctx, w: c.width, h: c.height }
          }
          const t = await draw(tileUrl),
            f = await draw(fullUrl)
          const a = t.ctx.getImageData(0, 0, t.w, t.h).data,
            b = f.ctx.getImageData(0, y, t.w, t.h).data
          let differing = 0
          for (let i = 0; i < a.length; i += 4)
            if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3])
              differing++
          return { w: t.w, h: t.h, fullW: f.w, fullH: f.h, differing }
        },
        [dataUrl(tile), dataUrl(shot.file), y]
      )
    let y = 0,
      fullH = 0
    for (const tile of shot.tiles) {
      const r = await compare(tile, y)
      assert.equal(r.w, r.fullW, `${tile} is ${r.w} px wide, the picture ${r.fullW}`)
      assert.equal(
        r.differing,
        0,
        `${tile} (${r.w}×${r.h}): ${r.differing} pixels ≠ strip of ${shot.file} at y=${y}`
      )
      y += r.h
      fullH = r.fullH
    }
    assert.equal(y, fullH, `tiles of ${shot.file} cover ${y} of ${fullH} px`)
  } finally {
    await browser.close()
  }
}
describe('F15 — tiles: a full-page picture is cut so a lens can read it', () => {
  it("--tile-height cuts site, source and frame pictures into ≤ N px tiles under shots/<page>--<variant>/; reused pictures point at the earlier run's tiles", {
    timeout: 240000
  }, async () => {
    const site = await serve()
    try {
      const c = contract()
      // Tiles are this test's whole subject. The mock contract also declares a hover mega-menu,
      // and a timing-sensitive mega-hover finding on the mock site once failed this test on a
      // loaded CI runner (29/09/2026) for a reason that has nothing to do with tiles. The
      // interaction has its own tests (F12), so it is left out here.
      delete c.interactions
      c.visual = {
        stages: [
          { id: 'light', variants: ['desktop-light'] },
          { id: 'dark', variants: ['desktop-dark'] }
        ]
      }
      const first = await visual(site, c, ['--tile-height', '300'])
      assert.equal(first.code, 0, first.log.slice(-800))
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
      // Every tile is the strip of the full-page picture at its offset — pixel for pixel, judged by
      // Chromium's own PNG decoder, not by the zlib codec that cut it (visual-lib pngRows/cutPng).
      // Until 15/09 each tile was a separate clip render and this held only by assumption.
      await assertTilesAreStrips(home)
      await assertTilesAreStrips(src)
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
      delete cf.interactions
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
  it('visual-scan hover: a 400 ms lift is measured settled and repeatably, and an element it could not reach is a finding, not a silent skip', {
    timeout: 180000
  }, async () => {
    // The scanner carried the two defects visual-qa was fixed for (#113). Measured 16/09 on a
    // page with one `translateY(-40px)` behind `transition: transform 400ms ease-in`: the fixed
    // 80 ms sample reported the travel as `24 → 21.3` (2.7 px of 40) and the finding appeared in
    // ONE of three consecutive runs of the same page — the other two printed `pass` with no
    // findings at all. `examined` came from the page before the loop and was never decremented,
    // so a run where every hover failed still cleared minExamined and called the page clean.
    const root = mkdtempSync(path.join(tmpdir(), 'vscan-hover-'))
    writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
    const site = await serve({ hoverLift: true, unhoverable: true })
    try {
      const seen = []
      for (let i = 0; i < 2; i++) {
        const r = await run('visual-scan.mjs', ['hover', `${site.origin}/`, '--theme', 'light'], root)
        const out = JSON.parse(r.out.trim().split('\n').pop())
        const lift = out.findings.find((f) => f.kind === 'hover-jump' && f.text === 'Lift')
        assert.ok(lift, `the lifted link is a hover jump\n${r.out}`)
        seen.push(lift.moved.y)
        assert.ok(
          out.findings.some((f) => f.kind === 'hover-not-measured' && f.text === 'Dismiss'),
          `the element that hid itself is reported, not skipped in silence\n${r.out}`
        )
        assert.ok(
          out.examined <= out.interactive,
          `examined counts what the loop measured (${out.examined} of ${out.interactive})`
        )
      }
      assert.equal(seen[0], seen[1], `the settled box is the same on two runs of one page: ${seen}`)
      const [from, to] = seen[0].split(' → ').map(Number)
      const travel = Math.abs(to - from)
      // The fixture lifts 4 px behind a 400 ms ease-in. Settled, that reads 4.0 px on every run
      // (measured 16/09, three runs: `24 → 20`); the old 80 ms sample read under 1 px, which does
      // not even clear the 1 px threshold that makes it a finding — which is why the same page
      // printed `pass` two runs out of three.
      assert.ok(travel >= 3.5, `the full travel is measured, not a mid-transition sample: ${seen[0]}`)
    } finally {
      await site.close()
    }
  })
  it('mega-hover records the theme it rendered, and refuses a config that cannot seed one', {
    timeout: 120000
  }, async () => {
    // Two runs differing only by `--theme` used to write byte-identical files (measured 16/09:
    // same sha256), so an artifact could not be attributed to the axis that produced it. And
    // `seedTheme` sat in a bare `catch {}`, so a config without `qa.theme` rendered the default
    // theme and still printed PASS for the axis it was asked to test.
    const root = mkdtempSync(path.join(tmpdir(), 'mega-theme-'))
    writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
    writeFileSync(path.join(root, 'no-theme.json'), JSON.stringify({ qa: {} }))
    const site = await serve()
    const args = (theme, out) => [
      `${site.origin}/`,
      '--trigger',
      '#trigger',
      '--panel',
      '#panel',
      '--link',
      '#panel a',
      '--open',
      'hover',
      '--theme',
      theme,
      '--json',
      path.join(root, out)
    ]
    try {
      await run('mega-hover.mjs', args('light', 'light.json'), root)
      await run('mega-hover.mjs', args('dark', 'dark.json'), root)
      const light = JSON.parse(readFileSync(path.join(root, 'light.json'), 'utf8'))
      const dark = JSON.parse(readFileSync(path.join(root, 'dark.json'), 'utf8'))
      assert.equal(light.theme, 'light')
      assert.equal(dark.theme, 'dark')
      assert.notEqual(
        readFileSync(path.join(root, 'light.json'), 'utf8'),
        readFileSync(path.join(root, 'dark.json'), 'utf8'),
        'two axes must not write the same bytes'
      )
      const bad = await run(
        'mega-hover.mjs',
        [...args('dark', 'bad.json'), '--config', 'no-theme.json'],
        root
      )
      assert.notEqual(bad.code, 0, `a theme that cannot be seeded fails the run\n${bad.out}`)
      assert.match(bad.out, /qa\.theme/)
      assert.ok(!existsSync(path.join(root, 'bad.json')), 'and writes no artifact for it')
    } finally {
      await site.close()
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
    // Two changes measured on the full 288-axis matrix of the real contract, 2026-09-16, both
    // about work that produced nothing: 204 site-side lookups for selectors simply not on the
    // page, each waiting the locator's full 3000 ms timeout (612 s, 26.2 % of a 39-minute run),
    // and 14 of every 48 axes re-opening a source file the run had already measured (3.6 min).
    // Neither may cost a finding, which is what this pins:
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
  it('a source render still showing placeholders is loaded again, and reported when loading again does not help', {
    timeout: 300000
  }, async () => {
    // The design export's picture component settles filled or unfilled PER LOAD and latches --
    // measured 2026-09-16 on this contract's About page: six loads gave 0/7 · 7/7 · 0/7 · 7/7 ·
    // 7/7 · 0/7 slots carrying `data-filled`, and polling to 5 s never changed one of them. The
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
    await page.setContent(
      '<style>body{margin:0;height:2500px}header{position:sticky;top:0;z-index:40;height:79px;border-bottom:1px solid #888;background:rgba(255,255,255,.8)}.spacer{height:420px}input{display:block;box-sizing:border-box;width:600px;height:80px;border:1px solid #888}</style><header>Header</header><div class="spacer"></div><input>'
    )
    await page.evaluate(() => scrollTo(0, 500))
    assert.equal(
      (await page.evaluate(scanSeams)).length,
      0,
      'an opaque sticky border hides the coincident input border over a translucent surface'
    )
    await page.setContent(
      '<style>body{margin:0;height:2500px}.a{height:40px;border-bottom:1px solid #888}.b{margin-top:1px;height:40px;border-top:1px solid #888}</style><div class="a">First</div><div class="b">Second</div>'
    )
    await page.evaluate(() => scrollTo(0, 0))
    assert.ok((await page.evaluate(scanSeams)).length > 0, 'adjacent visible borders remain a seam')
    await page.locator('.a').evaluate((e) => (e.style.marginTop = '1600px'))
    assert.ok((await page.evaluate(scanSeams)).length > 0, 'offscreen full-page coverage is preserved')
    await page.setContent(
      '<style>body{margin:0}.hero{position:relative;height:120px;width:600px;border-bottom:1px solid #888}.inner{position:absolute;bottom:1px;left:0;width:600px;height:60px;border-bottom:1px solid #888}</style><div class="hero"><div class="inner">Nested preview</div></div>'
    )
    await page.evaluate(() => scrollTo(0, 0))
    assert.ok((await page.evaluate(scanSeams)).length > 0, 'a real nested hero border seam remains a finding')
  } finally {
    await browser.close()
  }
})
