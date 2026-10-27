#!/usr/bin/env node
// Probe computed styles of selectors on a page in light or dark.
// Usage: node probe.mjs <url> <light|dark> '<selector>' ['<selector2>' ...]
// Requires: `npm i playwright` + `npx playwright install chromium` in a scratch dir.
//
// Forces the dark hook for BOTH frameworks (adds html.t4-dark AND html[data-theme=dark]),
// so it works whatever the template uses. Prints, per VISIBLE selector, the computed
// color / background / background-image / border + ::before/::after hints. Never guess
// colors/selectors — read them here, then write a <DARK>-scoped override that matches
// the source rule's specificity.

import { chromium } from 'playwright';
import { launchOptions, setTheme as applyTheme, navigate, report } from './runtime.mjs';

const [, , url, scheme = 'dark', ...selectors] = process.argv;
if (!url || selectors.length === 0) {
  console.error("Usage: node probe.mjs <url> <light|dark> '<selector>' [...]");
  process.exit(1);
}

const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: scheme === 'dark' ? 'dark' : 'light',
  viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
// neutralise scroll-in (AOS) animations so nothing is invisibly opacity:0
await page.addInitScript(() => { const s = document.createElement('style');
  s.textContent = '[data-aos]{opacity:1!important;transform:none!important}';
  document.documentElement.appendChild(s); });
try {
  await navigate(page, url);
  await applyTheme(page, scheme);
  // scroll the page so lazy/clone elements render, then return to top
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(400);
  const out = await page.evaluate((sels) => {
    const read = (s) => {
      // prefer the first VISIBLE match (skip hidden carousel clones)
      const els = [...document.querySelectorAll(s)].filter(e => {
        const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
        return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'; });
      const e = els[0];
      if (!e) return { selector: s, missing: true };
      const cs = getComputedStyle(e);
      const bf = getComputedStyle(e, '::before'), af = getComputedStyle(e, '::after');
      return { selector: s, color: cs.color, background: cs.backgroundColor,
        bgImage: cs.backgroundImage === 'none' ? 'none' : cs.backgroundImage.slice(0, 50),
        border: `${cs.borderTopWidth} ${cs.borderTopColor}` +
          (cs.borderLeftColor !== cs.borderTopColor ? ` (L ${cs.borderLeftColor})` : ''),
        marginTop: cs.marginTop, boxShadow: cs.boxShadow.slice(0, 40),
        before: bf.content !== 'none' ? `bg ${bf.backgroundColor} bt ${bf.borderTopColor}` : '(n/a)',
        after: af.content !== 'none' ? `bg ${af.backgroundColor} bt ${af.borderTopColor}` : '(n/a)' };
    };
    return { hook: document.documentElement.className, results: sels.map(read) };
  }, selectors);
  console.log(`# ${scheme}  (html.class="${out.hook}")  ${url}`);
  for (const r of out.results) {
    if (r.missing) { console.log(`  ${r.selector}  →  (no visible match)`); continue; }
    console.log(`  ${r.selector}`);
    console.log(`      color:      ${r.color}`);
    console.log(`      background: ${r.background}`);
    console.log(`      bgImage:    ${r.bgImage}`);
    console.log(`      border:     ${r.border}`);
    console.log(`      marginTop:  ${r.marginTop}`);
    console.log(`      boxShadow:  ${r.boxShadow}`);
    console.log(`      ::before:   ${r.before}`);
    console.log(`      ::after:    ${r.after}`);
  }
  report(page, out.results.filter(r => !r.missing).length, out.results.filter(r => r.missing), out.results.some(r => r.missing));
} catch (e) {
  // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
  // exactly the false-confidence trap review.md warns about.
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
