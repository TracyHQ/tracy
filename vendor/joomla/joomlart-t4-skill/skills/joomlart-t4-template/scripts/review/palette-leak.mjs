#!/usr/bin/env node
// Leak scanner for a page in DARK mode.
// Usage: node palette-leak.mjs <url> <white|darktext>
//   white    — VISIBLE elements with a near-WHITE background on the dark page
//              (un-themed cards/panels/badges/map widgets, AND pseudo-bars via --body-bg-color).
//   darktext — VISIBLE text that is near-BLACK sitting on a DARK surface
//              (hardcoded #111/#212529 metas, mega headings, off-canvas links, <strong> bylines).
//
// Both report the element + its computed colour so you can probe the source rule and fix.
// Note: a near-white panel may be CORRECT if it's a frosted glass over a photo with dark text —
// verify before repainting (gotchas §13). And owl-carousel CLONES are filtered out (visible only).

import { chromium } from 'playwright';
import { report } from './runtime.mjs';

const [, , url, mode = 'white'] = process.argv;
if (!url) { console.error('Usage: node palette-leak.mjs <url> <white|darktext>'); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: 'dark', viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { const s = document.createElement('style');
  s.textContent = '[data-aos]{opacity:1!important;transform:none!important}';
  document.documentElement.appendChild(s); });
try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  // The light-mode backgrounds, keyed by position in the tree, so the dark pass can ask of each
  // element whether its colour MOVED. Same page, same layout — only the hook changes.
  const PATH_OF = `(e) => { let p = '', n = e;
    while (n && n !== document.body) { p = [...n.parentNode.children].indexOf(n) + '.' + p; n = n.parentElement; }
    return p; }`;
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => { const r = document.documentElement;
    r.classList.remove('t4-dark'); r.setAttribute('data-theme', 'light'); });
  await page.waitForTimeout(250);
  const LIGHT_BG = await page.evaluate((pathSrc) => {
    const pathOf = eval(pathSrc); const out = {};
    for (const e of document.body.querySelectorAll('*')) {
      const m = getComputedStyle(e).backgroundColor.match(/rgb\((\d+), (\d+), (\d+)/);
      if (m) out[pathOf(e)] = `${m[1]},${m[2]},${m[3]}`;
    }
    return out;
  }, PATH_OF);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { const r = document.documentElement;
    r.classList.add('t4-dark'); r.setAttribute('data-theme', 'dark'); });
  await page.waitForTimeout(250);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(400);
  const _r = await page.evaluate(({ MODE, LIGHT_BG, pathSrc }) => {
    const pathOf = eval(pathSrc);
    // Any CSS colour, not just `rgb()`. A computed style resolves to `oklab()`, `lab()`, `color()`
    // or `color-mix()` on a modern sheet, and a regex written for `rgb(` reads those as transparent
    // — which makes a walk up the tree stop at the wrong ancestor. Same defect, same fix, as
    // contrast-audit.
    const _cv = document.createElement('canvas'); _cv.width = _cv.height = 1;
    const _cx = _cv.getContext('2d', { willReadFrequently: true });
    const parse = (c) => {
      if (!c || c === 'transparent' || c === 'none') return null;
      _cx.fillStyle = '#000'; _cx.fillStyle = c;
      _cx.globalCompositeOperation = 'copy';
      _cx.fillRect(0, 0, 1, 1);
      const d = _cx.getImageData(0, 0, 1, 1).data;
      // Alpha comes back too. The ancestor walk below needs it: a layer at `rgba(255,255,255,0.97)`
      // IS the effective background, and one at 0.02 is not — a distinction `includes('rgb(')` could
      // not make, being false for every `rgba(` string regardless of how opaque it was.
      return d[3] === 0 ? null : [d[0], d[1], d[2], d[3] / 255];
    };
    const visible = e => { if (e.hidden) return false; const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.4) return false;
      if (!e.offsetParent && cs.position !== 'fixed') return false;
      const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    const out = [], seen = new Set(); let measured = 0;
    if (MODE === 'white') {
      for (const e of document.body.querySelectorAll('*')) {
        if (!visible(e)) continue;
        // Counted before the colour is read: an element with no opaque background of its own was
        // still inspected and cleared. A page painting its background on `body` alone otherwise
        // reported `measured: 0`, which runtime.mjs turns into `fail` — a clean page called broken.
        measured++;
        const c = parse(getComputedStyle(e).backgroundColor);
        if (!c || c[3] <= 0.5) continue;
        const [r, g, b] = c;
        if (r > 225 && g > 222 && b > 216) {
          // A near-white background on the dark page is only a LEAK if it is the SAME background
          // the light page had. A surface painted in `currentColor` — the theme toggle's half-lit
          // disc, an inverted chip, a rule drawn from the text colour — is near-white in dark
          // BECAUSE it followed the theme, which is the opposite of the defect. Measured before
          // this test existed: one 14px icon turned every page of both sites red, 64 rows for a
          // detail that was working. The size floor is not the answer — a large surface can be
          // drawn in currentColor too — so ask whether the colour MOVED.
          if (LIGHT_BG[pathOf(e)] === `${r},${g},${b}`) {
            const k = (e.className && e.className.toString ? e.className.toString() : e.tagName).slice(0, 44);
            if (seen.has(k)) continue; seen.add(k);
            out.push(`bg rgb(${r},${g},${b})  ${e.tagName}.${k}`); if (out.length > 20) break; }
        }
      }
    } else { // darktext
      for (const e of document.body.querySelectorAll('*')) {
        const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
        if (!txt || txt.length < 2 || !visible(e)) continue;
        // Past the filters: an element this scan looked at, not a node on the page.
        measured++;
        const fg = parse(getComputedStyle(e).color); if (!fg) continue;
        const lum = fg[0] * 0.299 + fg[1] * 0.587 + fg[2] * 0.114; if (lum > 80) continue;
        // effective bg must also be dark (dark-on-LIGHT, e.g. a badge, is fine)
        let n = e, bg = [17, 21, 31]; while (n) { const bc = parse(getComputedStyle(n).backgroundColor);
          if (bc && bc[3] > 0.5) { bg = bc; break; } n = n.parentElement; }
        if (bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114 > 110) continue;
        const k = e.tagName + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 26);
        if (seen.has(k)) continue; seen.add(k);
        out.push(`text rgb(${fg}) on rgb(${bg})  ${k}  "${txt.slice(0, 20)}"`); if (out.length > 20) break;
      }
    }
    return { out, measured };
  }, { MODE: mode, LIGHT_BG, pathSrc: PATH_OF });
  const res = _r.out, _measured = _r.measured;
  const _examined = await page.evaluate(() => document.body ? document.body.querySelectorAll('*').length : 0);
  if (_examined < 20) {
    console.error(`ERR coverage — only ${_examined} element(s) in scope on ${url}; the page did not render. A clean result here proves nothing.`);
    process.exitCode = 1;
  } else if (!res.length) console.log(`OK — no ${mode} leaks on ${url}  [${_measured} element(s) measured]`);
  else { console.log(`# ${mode} leaks  ${url}`); for (const r of res) console.log('  ' + r); }
  // Findings have to reach the exit code; this file printed them and exited 0.
  report(page, _measured, res, _examined < 20);
} catch (e) {
  // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
  // exactly the false-confidence trap review.md warns about.
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
