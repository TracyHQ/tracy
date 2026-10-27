#!/usr/bin/env node
// WCAG contrast audit of a page in DARK mode.
// Usage: node contrast-audit.mjs <url> [minRatio=3.0]
// Flags every visible text node whose contrast against its EFFECTIVE (nearest opaque)
// background is below minRatio. This catches dark-on-dark and light-on-light leaks that a
// screenshot pass misses.
//
// IMPORTANT — filter the by-design set yourself before acting (see gotchas §31):
//   brand-accent buttons/links, blue tour prices, Bootstrap colored badges/cards.
// They are CORRECT (identical in light); a low ratio there is not a bug.

import { chromium } from 'playwright';
import { launchOptions, setTheme as applyTheme, navigate, report } from './runtime.mjs';

const [, , url, minRatio = '3.0'] = process.argv;
if (!url) { console.error('Usage: node contrast-audit.mjs <url> [minRatio]'); process.exit(1); }

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
  const _r = await page.evaluate((MIN) => {
    const parse = c => { const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/);
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a, b) => { const l1 = L(a), l2 = L(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    // nearest ancestor with an opaque-enough background; null if a bg-IMAGE intervenes (can't judge)
    // 🔒 A BACKGROUND THIS PARSER CANNOT READ IS NOT A DARK BACKGROUND. The walk used to fall back
    // to `[17,21,31]` — the page's presumed dark — when it reached the top without finding one, and
    // `parse` reads rgb()/rgba() only. So a theme in `oklch()` had white-on-white measured against a
    // fabricated near-black: contrast 1.15 reported for black-on-white, and no finding at all for
    // white-on-white. The fallback now distinguishes "nothing painted a background" (the page's own
    // dark is the right assumption) from "something painted one this parser could not read", which
    // is reported rather than guessed at.
    const UNREADABLE = Symbol('unreadable-bg')
    const effBg = e => { let n = e; while (n) { const cs = getComputedStyle(n);
      const raw = cs.backgroundColor;
      const c = parse(raw); if (c && c[3] >= 0.55) return c;
      if (!c && raw && raw !== 'transparent' && raw !== 'rgba(0, 0, 0, 0)') return UNREADABLE;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; n = n.parentElement; }
      return [17, 21, 31, 1]; };
    const out = [], seen = new Set(); let measured = 0, unreadable = 0;
    for (const e of document.body.querySelectorAll('*')) {
      const txt = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('').trim();
      if (!txt || txt.length < 2) continue;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.4 || !e.offsetParent) continue;
      const rc = e.getBoundingClientRect(); if (rc.width < 4 || rc.height < 6) continue;
      // `parse` reads rgb()/rgba() only, and Chromium serialises `oklch()`, `lab()` and
      // `color(srgb …)` verbatim. Such an element used to hit `continue` here and be reported as
      // text that passed — a theme written in modern colour syntax had its contrast checked on
      // nothing at all. It is counted and named instead of skipped in silence.
      const fg = parse(cs.color)
      if (!fg) { unreadable++; if (unreadable <= 6) out.push({ cr: '—', need: +MIN, k: e.tagName + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 40), txt: txt.slice(0, 24), note: `colour not rgb(): ${cs.color}` }); continue; }
      if (fg[3] < 0.4) continue;
      const bg = effBg(e)
      if (bg === UNREADABLE) { unreadable++; if (unreadable <= 6) out.push({ cr: '—', need: +MIN, k: e.tagName + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 40), txt: txt.slice(0, 24), note: `background colour not rgb(): ${getComputedStyle(e).backgroundColor}` }); continue; }
      if (!bg) continue;            // skip text over a background-image
      // Past every filter: this element's contrast is about to be judged, so it is measured.
      measured++;
      const cr = ratio(fg, bg);
      const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 600);
      if (cr < parseFloat(MIN)) {
        const k = e.tagName + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.').slice(0, 30);
        if (seen.has(k)) continue; seen.add(k);
        out.push({ cr: cr.toFixed(2), need: large ? 3.0 : 4.5, k, txt: txt.slice(0, 24),
          fg: `rgb(${fg.slice(0, 3)})`, bg: `rgb(${bg.slice(0, 3)})` });
      }
    }
    return { out: out.sort((a, b) => a.cr - b.cr).slice(0, 30), measured, unreadable };
  }, minRatio);
  const res = _r.out, _measured = _r.measured;
  const _examined = await page.evaluate(() => document.body ? document.body.querySelectorAll('*').length : 0);
  if (_examined < 20) {
    console.error(`ERR coverage — only ${_examined} element(s) in scope on ${url}; the page did not render. A clean result here proves nothing.`);
    process.exitCode = 1;
  } else if (!res.length) console.log(`OK — no text below contrast ${minRatio} on ${url}  [${_examined} elements examined]`);
  else { console.log(`# contrast < ${minRatio}  ${url}  (filter the by-design set!)`);
    // A row this scan could not read has no ratio and no two colours to show; it carries `note`
    // instead, and printing the missing fields as `undefined` reads like a bug in the scanner
    // rather than a colour syntax it cannot parse.
    for (const r of res)
      console.log(
        r.note
          ? `  cr=?  ${r.k}  "${r.txt}"  ${r.note}`
          : `  cr=${r.cr} (AA ${r.need})  ${r.k}  "${r.txt}"  fg=${r.fg} bg=${r.bg}`
      ); }
  report(page, _measured, res, _examined < 20);
} catch (e) {
  // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
  // exactly the false-confidence trap review.md warns about.
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
