#!/usr/bin/env node
// Mega-menu reachability audit — the behaviour half of the mega-menu contract
// (blocks-and-elements.md §5d). Forcing `.show` on the panel (verify-recipes) proves the
// panel STYLES; it says nothing about whether a person can get INTO it. T4's megamenu.js
// opens a panel on `mouseenter` of the top-level <li> and closes it on `mouseleave`, so any
// strip of non-<li> pixels between the trigger and the panel (a full-width panel hung from
// the header's bottom edge, a panel pushed down by margin, a wrapped nav row) closes the
// panel while the pointer crosses it — the design "works" in a forced-open screenshot and is
// unusable with a mouse. Found live on Northgate (26px gap, gotchas #80).
//
// For every top-level item that owns a dropdown/mega panel this drives a REAL pointer:
//   hover trigger → walk straight down into the panel in 4px steps → walk sideways to the
//   first link → assert still open → click → assert navigation. Then Escape and outside-click
//   must close. Reports per item; exits 1 on any FAIL so it can gate a build.
//
// Usage: node mega-hover.mjs <url> [--viewport 1440] [--items '.t4-megamenu .navbar-nav.level0 > li.dropdown']
import { chromium } from 'playwright';
import { launchOptions } from './runtime.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const viewport = Number(opt('--viewport', 1440));
const ITEMS = opt('--items', '.t4-megamenu .navbar-nav.level0 > li.dropdown');
const url = argv[0];
if (!url) { console.error('Usage: node mega-hover.mjs <url> [--viewport 1440] [--items <selector>]'); process.exit(1); }

const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: viewport, height: 900 } });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

// indices of visible top-level items that own a panel (T4 emits several navbar copies; the
// hidden ones have zero width)
const indices = await page.$$eval(ITEMS, els => els.map((el, i) => el.querySelector(':scope > .dropdown-menu') && el.getBoundingClientRect().width > 0 ? i : -1).filter(i => i >= 0));
if (!indices.length) { console.log(`NO ITEMS — selector "${ITEMS}" matched no visible top-level item with a panel; nothing was tested`); process.exit(1); }

const rows = []; let failed = 0;
for (const idx of indices) {
  await page.goto(url, { waitUntil: 'networkidle' });
  const li = (await page.$$(ITEMS))[idx];
  const trigger = await li.$(':scope > a, :scope > .nav-link');
  const label = (await trigger.textContent()).trim().replace(/\s+/g, ' ').slice(0, 24);
  const tb = await trigger.boundingBox();
  const row = { item: label, steps: {} };
  const isOpen = () => li.evaluate(el => el.classList.contains('show') && el.querySelector(':scope > .dropdown-menu')?.classList.contains('show'));

  // 1. real hover opens it (T4 default) — click is the fallback for click-effect profiles
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.waitForTimeout(300);
  if (!(await isOpen())) { await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.waitForTimeout(300); row.steps.openedBy = 'click'; } else { row.steps.openedBy = 'hover'; }
  row.steps.opens = await isOpen();
  if (!row.steps.opens) { row.verdict = 'FAIL (never opened)'; rows.push(row); failed++; continue; }

  // 2. geometry: strip between the <li> box and the panel box
  const panel = await li.$(':scope > .dropdown-menu');
  const geo = await page.evaluate(([l, p]) => { const a = l.getBoundingClientRect(), b = p.getBoundingClientRect(); return { liBottom: a.bottom, panelTop: b.top, gap: b.top - a.bottom }; }, [li, panel]);
  row.steps.gapPx = Math.round(geo.gap * 10) / 10;

  // 3. walk straight down through the strip; the panel must survive every step
  let closedAtY = null;
  for (let y = tb.y + tb.height - 2; y <= geo.panelTop + 12; y += 4) {
    await page.mouse.move(tb.x + tb.width / 2, y); await page.waitForTimeout(40);
    if (!(await isOpen())) { closedAtY = Math.round(y); break; }
  }
  row.steps.survivesDrop = closedAtY === null; if (closedAtY !== null) row.steps.closedAtY = closedAtY;

  // 4. sideways inside the panel to the first link, then click it
  const link = await panel.$('a[href]:not([href^="#"]):not([href^="javascript"])');
  if (link && closedAtY === null) {
    const lb = await link.boundingBox();
    await page.mouse.move(lb.x + 4, geo.panelTop + 12, { steps: 10 }); await page.mouse.move(lb.x + 4, lb.y + lb.height / 2, { steps: 6 }); await page.waitForTimeout(100);
    row.steps.reachesLink = await isOpen();
    const href = await link.getAttribute('href'); const before = page.url();
    try {
      await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 8000 }), page.mouse.click(lb.x + 4, lb.y + lb.height / 2)]);
      row.steps.clickNavigates = page.url() !== before; row.steps.landed = page.url();
    } catch { row.steps.clickNavigates = false; row.steps.href = href; }
  } else { row.steps.reachesLink = false; row.steps.clickNavigates = false; }

  // 5. Escape and outside click close it
  await page.goto(url, { waitUntil: 'networkidle' });
  const li2 = (await page.$$(ITEMS))[idx]; const t2 = await li2.$(':scope > a, :scope > .nav-link'); const b2 = await t2.boundingBox();
  const open2 = () => li2.evaluate(el => el.classList.contains('show') || !!el.querySelector(':scope > .dropdown-menu.show'));
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.waitForTimeout(300);
  if (!(await open2())) await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); row.steps.escapeCloses = !(await open2());
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.waitForTimeout(300);
  if (!(await open2())) await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.click(viewport / 2, 850); await page.waitForTimeout(150); row.steps.outsideClickCloses = !(await open2());

  const s = row.steps;
  row.verdict = s.opens && s.survivesDrop && s.reachesLink && s.clickNavigates && s.escapeCloses && s.outsideClickCloses ? 'PASS' : 'FAIL';
  if (row.verdict === 'FAIL') failed++;
  rows.push(row);
}
await browser.close();

for (const r of rows) console.log(`${r.verdict.padEnd(20)} ${r.item.padEnd(24)} ${JSON.stringify(r.steps)}`);
console.log(`\n${rows.length} item(s) tested at ${viewport}px — ${failed} FAIL`);
process.exit(failed ? 1 : 0);
