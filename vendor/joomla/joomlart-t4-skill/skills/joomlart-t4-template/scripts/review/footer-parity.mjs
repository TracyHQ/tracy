#!/usr/bin/env node
// Does the footer describe the same site the header does?
//
// Usage: node footer-parity.mjs <url> [--ignore=Legal,Colophon]
//
// WHY THIS IS ITS OWN GATE. A footer nav is usually a `mod_custom` — hand-written HTML naming the
// sections the menu had ON THE DAY IT WAS WRITTEN. Rebuilding the menu does not touch it, and
// nothing complains: the links still resolve, because Joomla routes `index.php?Itemid=…` whatever
// the item is called or wherever it sits. So the site keeps advertising a structure it no longer
// has, and `link-integrity` stays green because every one of those links works.
//
// Measured on this build: the header read Product · Service · Pricing · Resources · Company while
// the footer read **Design · Pages · Account** — the three sections the previous menu had. Twelve
// working links describing a site that did not exist.
//
// WHAT IT CHECKS. Two directions, because a footer can be wrong in both:
//   1. every footer column heading names a top-level menu item;
//   2. every top-level menu item (except Home) is represented in the footer — as a heading, or by
//      at least one of its children appearing as a link.
// Anything with no links inside it (a colophon, a legal line) is not a nav column and is skipped.
import { chromium } from 'playwright';

const [, , url, ...flags] = process.argv;
const IGNORE = (flags.find((f) => f.startsWith('--ignore=')) || '--ignore=').slice(9)
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

if (!url) {
  console.error('Usage: node footer-parity.mjs <url> [--ignore=Legal,Colophon]');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });

const found = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const top = [...document.querySelectorAll('#t4-header .navbar-nav > li, .t4-header .navbar-nav > li')]
    .map((li) => clean(li.querySelector(':scope > a')?.textContent))
    .filter(Boolean);

  // Every menu item the header can reach, including the ones inside a megamenu panel — a footer
  // link naming one of those is representing its section perfectly well.
  const everyMenuLabel = [...document.querySelectorAll('#t4-header a, .t4-header a')]
    .map((a) => clean(a.textContent))
    .filter(Boolean);

  const footer = document.querySelector('.t4-footnav, [class*="footnav"], footer, .t4-footer');
  if (!footer) return { top, everyMenuLabel, columns: null };

  // A column is a heading with a list of links under it. A block with no links is a colophon.
  const columns = [...footer.querySelectorAll('h2, h3, h4, .module-title, [class*="__title"]')]
    .map((h) => {
      const scope = h.closest('div, section, li') || h.parentElement;
      const links = [...(scope ? scope.querySelectorAll('a') : [])].map((a) => clean(a.textContent)).filter(Boolean);
      return { heading: clean(h.textContent), links };
    })
    .filter((c) => c.heading);

  return { top, everyMenuLabel, columns };
});

await browser.close();

console.log(`# footer-parity  ${url}`);

if (!found.columns) {
  console.log('FAIL — no footer found; nothing was measured.');
  process.exit(2);
}

const navColumns = found.columns.filter((c) => c.links.length && !IGNORE.includes(c.heading.toLowerCase()));
const topLower = found.top.map((t) => t.toLowerCase());
const menuLower = found.everyMenuLabel.map((t) => t.toLowerCase());

console.log(`  header: ${found.top.join(' · ')}`);
console.log(`  footer: ${navColumns.map((c) => `${c.heading} (${c.links.length})`).join(' · ') || '(no nav columns)'}`);

const problems = [];

for (const col of navColumns) {
  if (!topLower.includes(col.heading.toLowerCase())) {
    problems.push(
      `footer column "${col.heading}" names no top-level menu item — the header offers `
      + `${found.top.join(', ')}`,
    );
  }
  for (const link of col.links) {
    if (!menuLower.includes(link.toLowerCase())) {
      problems.push(`footer link "${link}" (under ${col.heading}) appears nowhere in the menu`);
    }
  }
}

// The other direction: a section the header has and the footer never mentions.
const footerText = navColumns.flatMap((c) => [c.heading.toLowerCase(), ...c.links.map((l) => l.toLowerCase())]);
for (const item of found.top) {
  if (item.toLowerCase() === 'home') continue;
  if (!footerText.includes(item.toLowerCase())) {
    problems.push(`"${item}" is a top-level section and the footer never mentions it`);
  }
}

if (!problems.length) {
  console.log('OK — the footer and the header describe the same site');
  process.exit(0);
}

console.log('');
for (const p of problems) console.log(`  ✗ ${p}`);
console.log('');
console.log('A footer nav written as static HTML does not follow a menu rebuild, and every link in');
console.log('it keeps working — Joomla routes by Itemid — so no other gate can see the drift. Build');
console.log('the footer columns FROM the published menu rather than writing them a second time.');
process.exit(1);
