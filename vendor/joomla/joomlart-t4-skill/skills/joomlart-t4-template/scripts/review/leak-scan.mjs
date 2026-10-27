#!/usr/bin/env node
// Leak scanner for a page in DARK mode.
// Usage: node leak-scan.mjs <url> <white|darktext>
//   white    — VISIBLE elements with a near-WHITE background on the dark page
//              (un-themed cards/panels/badges/map widgets, AND pseudo-bars via --body-bg-color).
//   darktext — VISIBLE text that is near-BLACK sitting on a DARK surface
//              (hardcoded #111/#212529 metas, mega headings, off-canvas links, <strong> bylines).
//
// Both report the element + its computed colour so you can probe the source rule and fix.
// Note: a near-white panel may be CORRECT if it's a frosted glass over a photo with dark text —
// verify before repainting (gotchas §13). And owl-carousel CLONES are filtered out (visible only).

import { chromium } from 'playwright';
import { launchOptions, setTheme as applyTheme, navigate, report } from './runtime.mjs';

const [, , url, mode = 'white'] = process.argv;
if (!url) { console.error('Usage: node leak-scan.mjs <url> <white|darktext>'); process.exit(1); }

const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: 'dark', viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => { const s = document.createElement('style');
  s.textContent = '[data-aos]{opacity:1!important;transform:none!important}';
  document.documentElement.appendChild(s); });
try {
  await navigate(page, url);
  await applyTheme(page, 'dark');
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(400);
  const _r = await page.evaluate((MODE) => {
    // 🔒 `rgba(` DOES NOT CONTAIN `rgb(`. The old pattern was /rgb\((\d+), (\d+), (\d+)/, which
    // matches `rgb(255, 255, 255)` and nothing else — so a panel at `rgba(255,255,255,0.97)`, the
    // ordinary way a light card is written, parsed to null and was skipped. Both directions broke:
    // `white` mode never saw the leak, and `darktext` mode stepped OVER that panel while walking up
    // for an effective background and blamed the text below it for being dark-on-dark. The alpha is
    // returned so the caller can decide; a nearly transparent layer is not an effective background.
    const parse = c => { const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const visible = e => { if (e.hidden) return false; const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.4) return false;
      if (!e.offsetParent && cs.position !== 'fixed') return false;
      const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    const out = [], seen = new Set(); let measured = 0;
    if (MODE === 'white') {
      for (const e of document.body.querySelectorAll('*')) {
        if (!visible(e)) continue;
        // 🔒 COUNTED HERE, BEFORE THE COLOUR IS READ. An element with no opaque background of its
        // own is still an element this scan INSPECTED and cleared — and a page that paints its
        // background on `body` and leaves every descendant transparent is ordinary, not broken.
        // Counting only the ones with something to judge made that page report `measured: 0`, which
        // runtime.mjs turns into `fail`: a clean page called a rendering failure. Coverage is what
        // the scan looked at; the findings are what it found.
        measured++;
        const c = parse(getComputedStyle(e).backgroundColor);
        if (!c || c[3] <= 0.5) continue; const [r, g, b] = c;
        if (r > 225 && g > 222 && b > 216) {
          const k = (e.className && e.className.toString ? e.className.toString() : e.tagName).slice(0, 44);
          if (seen.has(k)) continue; seen.add(k);
          out.push(`bg rgb(${r},${g},${b})  ${e.tagName}.${k}`); if (out.length > 20) break; }
      }
    } else { // darktext
      for (const e of document.body.querySelectorAll('*')) {
        const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
        if (!txt || txt.length < 2 || !visible(e)) continue;
        // Past the filters: an element this scan actually looked at, not a node on the page.
        measured++;
        const fg = parse(getComputedStyle(e).color); if (!fg) continue;
        const lum = fg[0] * 0.299 + fg[1] * 0.587 + fg[2] * 0.114; if (lum > 80) continue;
        // effective bg must also be dark (dark-on-LIGHT, e.g. a badge, is fine)
        // An ancestor counts as the effective background when it actually paints one: parsed, and
        // opaque enough to hide what is behind it. `includes('rgb(')` used to stand in for that and
        // was false for every `rgba(` layer.
        let n = e, bg = [17, 21, 31]; while (n) { const bc = parse(getComputedStyle(n).backgroundColor);
          if (bc && bc[3] > 0.5) { bg = bc; break; } n = n.parentElement; }
        if (bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114 > 110) continue;
        const k = e.tagName + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 26);
        if (seen.has(k)) continue; seen.add(k);
        out.push(`text rgb(${fg}) on rgb(${bg})  ${k}  "${txt.slice(0, 20)}"`); if (out.length > 20) break;
      }
    }
    return { out, measured };
  }, mode);
  const res = _r.out, _measured = _r.measured;
  const _examined = await page.evaluate(() => document.body ? document.body.querySelectorAll('*').length : 0);
  if (_examined < 20) {
    console.error(`ERR coverage — only ${_examined} element(s) in scope on ${url}; the page did not render. A clean result here proves nothing.`);
    process.exitCode = 1;
  } else if (!res.length) console.log(`OK — no ${mode} leaks on ${url}  [${_examined} elements examined]`);
  else { console.log(`# ${mode} leaks  ${url}`); for (const r of res) console.log('  ' + r); }
  report(page, _measured, res, _examined < 20);
} catch (e) {
  // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
  // exactly the false-confidence trap review.md warns about.
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
