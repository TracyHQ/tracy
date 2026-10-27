#!/usr/bin/env node
// Verify the dark-mode toggle BEHAVES — not just that the page looks dark.
// Drives the real button: default = light, click → dark (data-theme flips + body bg
// changes + choice persisted), reload → choice persists, click back → light restored.
//
// Then the `?theme=dark|light` contract (darkmode-gotchas #54): Tracy's Design inspiration preview
// frames the demo from another origin and asks for a theme on the address. It cannot reach the
// site's cookie, and an iframe's color-scheme does not change the framed page's
// prefers-color-scheme, so the page itself must honour the parameter. Per asked theme, in a fresh
// browser whose OS preference is the OPPOSITE:
//   - first paint already carries it (read when <body> first exists, before any deferred script),
//     on all three T4 hooks at once: data-theme, data-bs-theme, html.t4-dark;
//   - it is still there after load and after the OS preference flips mid-page;
//   - nothing was saved (no cookie or localStorage value "dark"/"light" appeared);
//   - it beats a saved choice: after the toggle saved the other theme, `?theme=` still wins, the
//     saved choice is untouched, and the next plain load goes back to it.
// Any miss is a FAIL (exit 1).
//
// Usage: node dark-toggle.mjs <url> [width] [buttonSelector] [storageKey] [--config <file>]
// Examples:
//   node dark-toggle.mjs http://site.ddev.site:33000/                       # T4 vega-standard defaults
//   node dark-toggle.mjs http://site.ddev.site:33000/ 390                   # mobile width
//   node dark-toggle.mjs http://site.ddev.site:33000/ 1366 ".theme-toggle" "ja-morgan-theme"   # T3
//
// Defaults assume the vega standard: selector ".t4-theme-toggle", localStorage "t4-theme",
// dark hook html[data-theme="dark"]. Pass args for templates that differ.
//
// Requires playwright resolvable from where you run it (the skill's scripts dir resolves it
// via the user's node_modules; otherwise `npm i playwright` in a scratch dir and run there).
//
// Run at BOTH a desktop and a mobile width — split headers ship two button copies and only one
// must be visible per breakpoint. A PASS at one width is not a PASS overall.
import { chromium } from 'playwright';
import { config, launchOptions, readTheme, persisted, report } from './runtime.mjs';

const url = process.argv[2];
const W   = parseInt(process.argv[3] || '1366', 10);
// 🔒 THE HOOK, THE TOGGLE AND THE PERSISTENCE COME FROM THE SHARED CONFIG. This file used to read
// `data-theme` and localStorage no matter what the template did, while runtime.mjs's own default is
// the CLASS `t4-dark` with cookie persistence — so a perfectly working class-based toggle failed
// every check here, and the verdict could not be trusted in either direction. An explicit argument
// still wins, for driving one odd template by hand.
const SEL = process.argv[4] || config.toggle;
const KEY = process.argv[5] || config.persistence.key;
if (!url) { console.error('Usage: node dark-toggle.mjs <url> [width] [buttonSelector] [storageKey]'); process.exit(1); }

const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: 'light', viewport: { width: W, height: 900 } });
const page = await ctx.newPage();
const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
// Read through the shared readers: they know a class hook from an attribute hook, and a cookie
// from localStorage. Reading the raw attribute here is what made this file disagree with every
// other scanner about what "dark" even means.
const theme = () => readTheme(page);
const ls = () => persisted(page).catch(() => 'ERR');

try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const t0 = await theme(), bg0 = await bg();
  const total = await page.locator(SEL).count();
  const btn = page.locator(SEL + ':visible').first();
  const btnVisible = await btn.isVisible().catch(() => false);
  console.log(`@${W}px initial: data-theme=${t0}  body-bg=${bg0}  toggles=${total} visibleToggle=${btnVisible}`);
  // 🔒 `FAIL` AND `exit 0` CANNOT BOTH BE TRUE. This printed the word and left with a success
  // code, which is the same trap the catch below names: a caller keyed on status reads a template
  // with no working toggle as a template that passed.
  if (!btnVisible) { console.log('FAIL: no visible toggle button at this width'); process.exit(1); }

  await btn.click(); await page.waitForTimeout(250);
  const t1 = await theme(), bg1 = await bg(), p1 = await ls();
  console.log(`after click: data-theme=${t1}  body-bg=${bg1}  localStorage=${p1}`);

  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(250);
  const t2 = await theme(), bg2 = await bg();
  console.log(`after reload: data-theme=${t2}  body-bg=${bg2}`);

  await page.locator(SEL + ':visible').first().click(); await page.waitForTimeout(250);
  const t3 = await theme(), bg3 = await bg(), p3 = await ls();
  console.log(`click back: data-theme=${t3}  body-bg=${bg3}  localStorage=${p3}`);

  const toggleOk = t0 === 'light' && t1 === 'dark' && p1 === 'dark' && t2 === 'dark' && t3 === 'light' && p3 === 'light' && bg0 !== bg1 && bg3 === bg0;
  // Now that the reads above go through the shared hook, the verdict is safe to state as one.
  // `CHECK` was neither `OK|FAIL|ERR` nor `✗`, so run-all.sh's verdict() dropped the line and a
  // dead toggle produced a BLANK CELL in the sweep. The promotion was withdrawn once on 2026-09-18
  // because this file was still reading `data-theme` while the default hook is a class — saying
  // FAIL louder about a measurement taken the wrong way only moves the lie.
  console.log(toggleOk ? 'toggle: flips, persists, light restores' : 'toggle ✗ did not flip, persist or restore — values above');

  const misses = await themeParam(browser);
  for (const m of misses) console.log(`?theme ✗ ${m}`);
  if (!misses.length) console.log('?theme: wins at first paint on all three hooks, survives an OS change and a saved choice, never saved');

  const ok = toggleOk && misses.length === 0;
  console.log(ok ? 'PASS toggle flips, persists, light restores; ?theme=dark|light wins for one load, never saved'
    : `FAIL ${toggleOk ? '' : 'toggle did not flip, persist or restore; '}${misses.length ? misses.length + ' ?theme miss(es)' : ''} — lines above`);
  if (!ok) process.exitCode = 1;
} catch (e) {
  // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
  // exactly the false-confidence trap review.md warns about.
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally { await browser.close(); }

// The three T4 hooks, read together: a component may key off any one of them.
function hooksOf() {
  const h = document.documentElement;
  return h ? { dataTheme: h.getAttribute('data-theme'), bsTheme: h.getAttribute('data-bs-theme'), t4Dark: h.classList.contains('t4-dark') } : null;
}
// Function declarations, not consts: the top-level try above calls them before this line runs.
function wears(h, mode) { return Boolean(h) && h.dataTheme === mode && h.bsTheme === mode && h.t4Dark === (mode === 'dark'); }
function show(h) { return h ? `data-theme=${h.dataTheme} data-bs-theme=${h.bsTheme} t4-dark=${h.t4Dark}` : 'no <html>'; }

function withTheme(mode) {
  const u = new URL(url);
  u.searchParams.set('theme', mode);
  return u.href;
}

// Every "dark"/"light" value the browser now holds, cookie or localStorage — a stored theme.
async function savedThemes(ctx, page) {
  const cookies = (await ctx.cookies()).filter((c) => c.value === 'dark' || c.value === 'light').map((c) => `cookie ${c.name}=${c.value}`);
  const local = await page.evaluate(() => {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k); if (v === 'dark' || v === 'light') out.push(`localStorage ${k}=${v}`); } } catch (_) { /* storage blocked */ }
    return out;
  });
  return [...cookies, ...local];
}

async function freshPage(os) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: os, viewport: { width: W, height: 900 } });
  // Record the hooks the moment <body> first exists: the head's inline resolver has run by then and
  // no deferred script has, so this is what the first paint wears. A template that only applies
  // `?theme` from darkmode.js (deferred, or on DOMContentLoaded) flashes the other theme first.
  await ctx.addInitScript(`(${function () {
    const read = () => { const h = document.documentElement; return h ? { dataTheme: h.getAttribute('data-theme'), bsTheme: h.getAttribute('data-bs-theme'), t4Dark: h.classList.contains('t4-dark') } : null; };
    const take = () => { if (document.body && !window.__firstPaintTheme) { window.__firstPaintTheme = read(); return true; } return false; };
    if (!take()) { const o = new MutationObserver(() => { if (take()) o.disconnect(); }); o.observe(document, { childList: true, subtree: true }); }
  }})()`);
  return { ctx, page: await ctx.newPage() };
}

async function themeParam(browser) {
  const misses = [];
  for (const mode of ['dark', 'light']) {
    const os = mode === 'dark' ? 'light' : 'dark';
    const { ctx, page } = await freshPage(os);
    try {
      await page.goto(withTheme(mode), { waitUntil: 'load', timeout: 60000 });
      const first = await page.evaluate(() => window.__firstPaintTheme || null);
      if (!wears(first, mode)) misses.push(`?theme=${mode} (OS ${os}): first paint wore ${show(first)}`);
      await page.waitForTimeout(250);
      const loaded = await page.evaluate(hooksOf);
      if (!wears(loaded, mode)) misses.push(`?theme=${mode} (OS ${os}): after load ${show(loaded)}`);
      // The OS flips while the page is open: an OS-follow listener must not take the asked theme back.
      await page.emulateMedia({ colorScheme: mode }); await page.waitForTimeout(150);
      await page.emulateMedia({ colorScheme: os }); await page.waitForTimeout(250);
      const afterOs = await page.evaluate(hooksOf);
      if (!wears(afterOs, mode)) misses.push(`?theme=${mode}: an OS change took it back — ${show(afterOs)}`);
      const saved = await savedThemes(ctx, page);
      if (saved.length) misses.push(`?theme=${mode} was saved: ${saved.join(', ')}`);
    } catch (e) { misses.push(`?theme=${mode}: ERR ${e.message}`); }
    finally { await ctx.close(); }
  }

  // A visitor who saved "dark" with the real toggle, then a `?theme=light` load: the address wins,
  // the saved choice is left alone, and the next plain load is dark again.
  const { ctx, page } = await freshPage('light');
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const btn = page.locator(SEL + ':visible').first();
    if (await readTheme(page) !== 'dark') { await btn.click(); await page.waitForTimeout(250); }
    const before = await persisted(page).catch(() => null);
    if (before !== 'dark') {
      misses.push(`saved choice: the toggle did not save "dark" (read ${before}), so ?theme over a saved choice was not measured`);
    } else {
      await page.goto(withTheme('light'), { waitUntil: 'load', timeout: 60000 });
      const first = await page.evaluate(() => window.__firstPaintTheme || null);
      await page.waitForTimeout(250);
      const loaded = await page.evaluate(hooksOf);
      if (!wears(first, 'light') || !wears(loaded, 'light')) misses.push(`?theme=light over a saved "dark": first paint ${show(first)}; after load ${show(loaded)}`);
      const after = await persisted(page).catch(() => null);
      if (after !== 'dark') misses.push(`?theme=light overwrote the saved choice: "dark" → ${after}`);
      await page.goto(url, { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(250);
      const plain = await page.evaluate(hooksOf);
      if (!wears(plain, 'dark')) misses.push(`the plain load after ?theme=light did not return to the saved "dark": ${show(plain)}`);
    }
  } catch (e) { misses.push(`saved choice: ERR ${e.message}`); }
  finally { await ctx.close(); }
  return misses;
}
