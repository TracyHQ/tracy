#!/usr/bin/env node
// Measure the page in a state a reader actually spends time in — with the drawer OPEN.
//
// Usage: node drawer-state.mjs <url> [--open=<selector>] [--modes=light,dark]
//
// WHY THIS EXISTS. Every other scanner loads a page and measures it at rest. A closed drawer is
// `visibility: hidden`, so the white-surface check skips it and the contrast audit skips it, and
// both report a clean page. Measured on a finished build, in the state the reader is in when they
// tap the menu:
//   · the drawer kept `background: #fff` in DARK while its links had flipped to #f8f8f8 —
//     contrast ~1.0, the entire mobile menu unreadable, close button invisible with it;
//   · T4's `left,push` modifier shoved the content wrapper 300px sideways, putting 83 elements
//     past the right edge at 800px and 135 at 390px, where at rest there were none.
// Neither defect exists on a page at rest. Neither was catchable by any gate that only visits one.
//
// It checks three things in each mode: the panel's ground actually flipped, its text can be read
// against that ground, and opening it did not push the page off the screen.
import { chromium } from 'playwright';

const [, , url, ...rest] = process.argv;
const opt = (n, d) => { const h = rest.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
if (!url) { console.error('Usage: node drawer-state.mjs <url> [--open=<selector>] [--modes=light,dark]'); process.exit(2); }
const OPEN = opt('open', '#triggerButton, .t4-offcanvas-toggle, .navbar-toggler, [data-bs-toggle="offcanvas"]');
const MODES = opt('modes', 'light,dark').split(',');
const VW = Number(opt('viewport', 800));

const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const browser = await chromium.launch();
const problems = [];
let opened = 0;
let minimalHeader = null;

for (const mode of MODES) {
  const ctx = await browser.newContext({ colorScheme: mode, viewport: { width: VW, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  if (mode === 'dark') {
    await page.evaluate(() => { const r = document.documentElement;
      r.classList.add('t4-dark'); r.setAttribute('data-theme', 'dark'); });
  }
  await page.waitForTimeout(250);

  if (minimalHeader === null) {
    minimalHeader = await page.evaluate(() => {
      const h = document.querySelector('.header-block, #t4-header, header');
      return Boolean(h && /--minimal/.test(h.className));
    });
  }

  const before = await page.evaluate((vw) => [...document.querySelectorAll('*')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; }).length, VW);

  const clicked = await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    if (!btn) return false;
    btn.click();
    return true;
  }, OPEN);
  if (!clicked) { await ctx.close(); continue; }
  await page.waitForTimeout(700);

  const seen = await page.evaluate((vw) => {
    // The PANEL, not the wrapper it slides over. `[class*="offcanvas"]` also matches
    // `.c-offcanvas-content-wrap`, which is the whole page — and the scan then reported a badge in
    // the page body as a drawer defect. Name the panel classes; do not pattern-match the word.
    const panel = document.querySelector('.t4-offcanvas, .offcanvas:not(.offcanvas-backdrop)');
    if (!panel) return null;
    const cs = getComputedStyle(panel);
    if (cs.visibility === 'hidden') return { notOpen: true };
    const parse = (c) => { const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillStyle = c;
      cx.globalCompositeOperation = 'copy'; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data; return d[3] === 0 ? null : [d[0], d[1], d[2]]; };
    // The ground the panel actually paints — walk up until something is opaque.
    let ground = null;
    for (let n = panel; n && !ground; n = n.parentElement) ground = parse(getComputedStyle(n).backgroundColor);
    // Against the ground THIS element sits on, not the panel's. A primary button inside the drawer
    // carries the accent as its own background, and scoring its label against the panel returned
    // 1.00 for a button that is perfectly legible. And only elements holding their OWN text — an
    // `li` wrapping an `<a>` reports the anchor's words while taking no colour of its own.
    const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c) return c; } return null; };
    const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    const texts = [...panel.querySelectorAll('a, button, span, li, p')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && ownText(e); })
      .slice(0, 40)
      .map((e) => ({ fg: parse(getComputedStyle(e).color), bg: bgOf(e), label: (e.textContent || '').trim().slice(0, 18),
                     name: `${e.tagName}.${(e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 24)}` }))
      .filter((t) => t.fg && t.bg);
    const wrap = document.querySelector('.t4-wrapper, .c-offcanvas-content-wrap');
    const over = [...document.querySelectorAll('*')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; }).length;
    const pageBg = parse(getComputedStyle(document.body).backgroundColor);
    return { ground, texts, over, pushed: wrap ? Math.round(wrap.getBoundingClientRect().x) : 0, pageBg };
  }, VW);

  await ctx.close();
  if (!seen || seen.notOpen) continue;
  opened++;

  // 1. The panel's ground must be the page's ground, not a literal left over from the framework.
  if (seen.ground && seen.pageBg && ratio(seen.ground, seen.pageBg) > 1.6) {
    problems.push(`[${mode}] the panel's ground is rgb(${seen.ground}) while the page is rgb(${seen.pageBg}) — it did not follow the theme`);
  }
  // 2. Its own text must be readable on it.
  for (const t of seen.texts) {
    const cr = ratio(t.fg, t.bg);
    if (cr < 3) {
      problems.push(`[${mode}] ${t.name} "${t.label}" reads at ${cr.toFixed(2)} on rgb(${t.bg})`);
      break;
    }
  }
  // 3. Opening it must not push the page out of the viewport.
  if (seen.over > before + 2) {
    problems.push(`[${mode}] opening it pushed ${seen.over - before} element(s) past the right edge (wrapper offset ${seen.pushed}px)`);
  }
}
await browser.close();

console.log(`# drawer-state  ${url}  @${VW}px`);
console.log(`  states measured: ${opened} of ${MODES.length}`);
if (!opened) {
  // A layout with no navigation has no drawer to open, and that is a decision — the landing header
  // carries only a logo and one module (gotcha #115). Failing there reported 2 of 64 pages as broken
  // for having exactly the chrome they were designed with. `nav-integrity` already had this exemption;
  // this gate needs the same one, and for the same reason.
  if (minimalHeader) {
    console.log('OK — skipped: this layout declares a minimal header, so there is no drawer to open');
    process.exit(0);
  }
  console.log(`FAIL — nothing opened with \`${OPEN}\`; a clean result here proves nothing.`);
  process.exit(2);
}
if (!problems.length) {
  console.log('OK — the panel follows the theme, its text reads on it, and the page stays put');
  process.exit(0);
}
console.log('');
for (const p of problems) console.log(`  ✗ ${p}`);
console.log('');
console.log('A closed drawer is `visibility: hidden`, so every other scanner skips it. These defects');
console.log('exist only while it is open, which is the state the reader is in when they tap the menu.');
process.exit(1);
