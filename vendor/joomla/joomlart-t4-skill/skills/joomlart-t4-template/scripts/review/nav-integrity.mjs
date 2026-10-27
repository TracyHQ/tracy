#!/usr/bin/env node
// Does the page actually carry the site's navigation?
//
// Usage: node nav-integrity.mjs <url> [--expect=<n>] [--allow-minimal] [--allow-panel-box]
//
// WHY THIS IS ITS OWN GATE. Nine scanners ran over 32 pages of two builds and every one of them was
// green on a page whose entire desktop navigation was missing. None of them is wrong: contrast,
// rhythm, borders, fonts and layout all measure what IS on the page, and a menu that renders nothing
// leaves nothing to measure. The absence is invisible to a gate that only looks at what it finds.
//
// TWO WAYS IT GOES MISSING, AND THEY LOOK IDENTICAL IN A SCREENSHOT.
//   1. A NAME THAT MATCHES NOTHING. T4's megamenu element resolves the menu by the `menu_type` in
//      `etc/navigation/<profile>.json`, and the site stores the real name in `#__menu_types`. A
//      rename on one side and not the other renders an empty bar with no error (gotchas §93).
//   2. A LAYOUT THAT DOES NOT ASK FOR IT. A landing layout may use a header block with no megamenu
//      element at all — a deliberate decision, and one this scan must not report as a defect.
//
// So the verdict needs to know which of the two it is looking at, and it cannot guess: it asks the
// PAGE. A header that carries `--minimal` (the shared layer's name for chrome without navigation)
// is allowed to have no menu when `--allow-minimal` is passed; without the flag it is still
// reported, because "every page has a menu" is the right expectation for most builds and the flag
// is how a build says otherwise.
//
// The off-canvas copy is EXCLUDED from the count on purpose. It comes from a `mod_menu` module
// rather than the megamenu element, so it survives exactly the failure this gate exists to catch —
// and it measures `visibility: hidden`, 0x0 while the drawer is closed, which reads like a CSS bug
// and sends the next person looking in the wrong place.
import { chromium } from 'playwright';

const [, , url, ...rest] = process.argv;
const opt = (n) => { const h = rest.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : null; };
const EXPECT = opt('expect') ? Number(opt('expect')) : null;
const ALLOW_MINIMAL = rest.includes('--allow-minimal');
const ALLOW_PANEL_BOX = rest.includes('--allow-panel-box');
if (!url) { console.error('Usage: node nav-integrity.mjs <url> [--expect=<n>] [--allow-minimal] [--allow-panel-box]'); process.exit(2); }

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });

const seen = await page.evaluate(() => {
  const header = document.querySelector('.header-block, #t4-header, header');
  const offcanvas = (el) => Boolean(el.closest('.t4-offcanvas, .offcanvas'));
  const lists = [...document.querySelectorAll('.navbar-nav, .t4-megamenu .nav, .mod-menu')].filter((el) => !offcanvas(el));
  const top = lists.flatMap((ul) => [...ul.children].filter((li) => li.tagName === 'LI'));
  const visible = top.filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  return {
    header: Boolean(header),
    minimal: Boolean(header && /--minimal/.test(header.className)),
    lists: lists.length,
    items: top.length,
    visibleItems: visible.length,
    labels: visible.slice(0, 12).map((li) => (li.textContent || '').trim().split('\n')[0].slice(0, 20)),
    offcanvasItems: [...document.querySelectorAll('.t4-offcanvas .navbar-nav > li, .offcanvas .navbar-nav > li')].length,
  };
});

// WHERE THE OPEN PANEL SITS. A megamenu that renders its items is only half the job: the panel it
// drops has to belong to the page. Measured on a build that passed every other gate, `Design`
// opened a 420px box at x=654 and `Pages` a 720px box at x=700, both painted `--surface` — grey
// cards hanging under one menu item while the reference (apple.com) runs the panel the full width
// of the viewport and lines its columns up with the logo.
//
// The test is the TEXT EDGE, not the panel edge, because both correct shapes agree on it: a
// full-bleed panel puts its content in the page container, and a panel drawn AS the container
// starts there too. Only a box floating under its own menu item disagrees, and it disagrees by
// however far that item happens to sit — so no threshold is possible or needed.
//
// `--allow-panel-box` is how a build says the floating box is the decision. Some systems do want a
// small anchored card; this gate should report the shape, not overrule the designer.
const panels = [];
const tops = page.locator('#t4-header .navbar-nav > li.dropdown > a, .t4-megamenu .navbar-nav > li.dropdown > a');
const nTops = Math.min(await tops.count(), 8);
const headerEdge = await page.evaluate(() => {
  const h = document.querySelector('#t4-header .container, .header-block .container');
  if (!h) return null;
  const r = h.getBoundingClientRect();
  return Math.round(r.x + parseFloat(getComputedStyle(h).paddingLeft));
});
for (let i = 0; i < nTops && headerEdge !== null; i++) {
  try { await tops.nth(i).hover({ timeout: 3000, force: true }); } catch (e) { continue; }
  await page.waitForTimeout(280);
  const hit = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.mega-dropdown-menu')].find((e) => {
      const r = e.getBoundingClientRect();
      return e.classList.contains('show') && r.width > 40 && r.height > 40;
    });
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const t = m.querySelector('.nav-header, .mega-nav > li > a, a');
    return {
      label: (m.closest('li')?.querySelector(':scope > a')?.textContent || '').trim().slice(0, 18),
      x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width),
      text: t ? Math.round(t.getBoundingClientRect().x) : null,
      bg: getComputedStyle(m).backgroundColor,
    };
  });
  if (hit && hit.text !== null) panels.push(hit);
}

const viewportW = page.viewportSize().width;

// DOES THE BAR STAY, AND IS IT ONE PIECE? Two properties of a header that no other gate looks at,
// both measured rather than read off the stylesheet.
//
//   STICKY. T4 ships `position: sticky` and a `t4-sticky` class and NO `top`, so the declaration
//   computes to `auto` and does nothing — every ingredient present, the one line that activates
//   them missing. Measured before the fix: scrolled to 1200px, the header's own top was -1200. A
//   header that declares itself sticky and then scrolls away is the definition of a silent defect.
//
//   ONE PIECE. `#t4-header` has a min-height and centres its children, so its header block is a
//   flex item at its own content height. Below the navbar breakpoint the menu collapses into the
//   toggle and the block shrank to 49px inside an 80px bar — bare page above and below it, and the
//   hairline drawn across the middle of the bar instead of under it. It only appears where the menu
//   is hidden, so a scan at 1440px cannot see it: this one re-measures at 900px.
const sticky = await page.evaluate(async () => {
  const h = document.querySelector('#t4-header, .t4-header');
  if (!h) return null;
  const declares = /t4-sticky/.test(h.className) || getComputedStyle(h).position === 'sticky';
  const before = document.documentElement.scrollHeight;
  if (before < window.innerHeight + 400) return { declares, tooShort: true };
  window.scrollTo(0, 1200);
  await new Promise((r) => setTimeout(r, 350));
  const top = Math.round(h.getBoundingClientRect().top);
  window.scrollTo(0, 0);
  return { declares, top, tooShort: false };
});

await page.setViewportSize({ width: 900, height: 800 });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(250);
const bar = await page.evaluate(() => {
  const h = document.querySelector('#t4-header, .t4-header');
  const blocks = [...document.querySelectorAll('.header-block')];
  if (!h || !blocks.length) return null;
  const hr = h.getBoundingClientRect();
  return blocks.map((b) => {
    const br = b.getBoundingClientRect();
    return { name: (b.className || '').toString().split(/\s+/).slice(0, 2).join('.'),
             bar: Math.round(hr.height), block: Math.round(br.height),
             top: Math.round(br.y - hr.y), bottom: Math.round(hr.bottom - br.bottom) };
  }).filter((b) => b.block > 0);
});

await browser.close();

console.log(`# nav-integrity  ${url}`);
console.log(`  header: ${seen.header ? (seen.minimal ? 'present, declared minimal' : 'present') : 'MISSING'}`);
console.log(`  desktop menu: ${seen.lists} list(s), ${seen.items} top-level item(s), ${seen.visibleItems} visible`);
if (seen.visibleItems) console.log(`  items: ${seen.labels.join(' | ')}`);
console.log(`  off-canvas copy: ${seen.offcanvasItems} item(s)   (not counted — see the header of this file)`);

if (!seen.header) { console.log('FAIL — the page renders no header at all.'); process.exit(1); }

if (seen.visibleItems === 0) {
  if (seen.minimal && ALLOW_MINIMAL) {
    console.log('OK — no navigation, and the header declares itself minimal (--allow-minimal given)');
    process.exit(0);
  }
  console.log(
    seen.minimal
      ? '  ✗ no navigation. The header declares itself minimal, so this MAY be the layout\'s intent —'
      : '  ✗ no navigation, and nothing on the page says that was intended.',
  );
  if (seen.minimal) console.log('    pass --allow-minimal if a landing layout without a menu is the decision.');
  console.log('');
  console.log(`Off-canvas holds ${seen.offcanvasItems} item(s), so the MENU EXISTS — what is missing is the`);
  console.log('desktop rendering of it. Check, in this order: the layout\'s header block actually includes');
  console.log('`<jdoc:include type="element" name="megamenu" />`; and `menu_type` in etc/navigation/<profile>.json');
  console.log('matches a real `menutype` in #__menu_types (gotchas §93).');
  process.exit(1);
}

if (panels.length) {
  const bleed = (p) => p.x === 0 && Math.abs(p.right - viewportW) <= 1;
  console.log(`  megamenu panels: ${panels.length} opened  (header text edge ${headerEdge}px)`);
  for (const p of panels) {
    console.log(`    "${p.label}" ${bleed(p) ? 'full-bleed' : `${p.x}..${p.right}`} , text at ${p.text}px , ${p.bg}`);
  }
  const strays = panels.filter((p) => p.text !== headerEdge);
  if (strays.length && !ALLOW_PANEL_BOX) {
    for (const p of strays) {
      console.log(
        `  ✗ the "${p.label}" panel starts its text at ${p.text}px while the header starts at `
        + `${headerEdge}px — it is a ${p.w}px box hanging under its own menu item, not part of the page`,
      );
    }
    console.log('');
    console.log('The panel is a child of its `li`, so it can only be as wide as that item allows. Handing the');
    console.log('absolute positioning up to the header (make the `li` and the wrappers between them `static`)');
    console.log('is what lets `inset-inline: 0` mean full-bleed; the panel\'s CONTENT then goes in the page');
    console.log('container. Pass --allow-panel-box if an anchored card is the decision.');
    process.exit(1);
  }
}

if (sticky && sticky.declares && !sticky.tooShort) {
  console.log(`  sticky: scrolled 1200px, the bar's top is at ${sticky.top}px`);
  if (sticky.top !== 0) {
    console.log(`  ✗ the header declares itself sticky and then scrolls away — at 1200px down its top`);
    console.log(`    is ${sticky.top}, not 0. T4 ships \`position: sticky\` with no \`top\`, which computes to`);
    console.log('    `auto` and does nothing. One line activates it: `inset-block-start: 0`.');
    process.exit(1);
  }
}

if (bar) {
  for (const b of bar) {
    const gap = b.top !== 0 || b.bottom !== 0;
    console.log(`  header block @900px: \`${b.name}\` ${b.block}px in a ${b.bar}px bar${gap ? ` — ${b.top}px above, ${b.bottom}px below` : ' , flush'}`);
    if (gap) {
      console.log(`  ✗ the header block does not fill the bar: bare page shows ${b.top}px above it and`);
      console.log(`    ${b.bottom}px below, and the chrome hairline is drawn across the middle of the bar`);
      console.log('    rather than under it. The bar centres its children, so a block that lost its menu');
      console.log('    keeps its own height — `align-self: stretch` on the block is what makes it the bar.');
      process.exit(1);
    }
  }
}

if (EXPECT !== null && seen.visibleItems !== EXPECT) {
  console.log(`  ✗ ${seen.visibleItems} visible item(s) against ${EXPECT} expected`);
  process.exit(1);
}
console.log(`OK — the navigation renders ${seen.visibleItems} item(s)`);
