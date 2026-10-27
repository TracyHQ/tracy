#!/usr/bin/env node
// Does the menu read like a website, or like a template demo?
//
// Usage: node naming-voice.mjs <url> [--allow=Wrapper,Style guide]
//
// WHY THIS IS ITS OWN GATE. A build assembled from a demo grows demo names, and they are invisible
// to the person who wrote them: `List layout`, `Single contact`, `Home 2`, `Style 1` all describe
// the TEMPLATE FEATURE the page exists to show. A visitor reads them as a site that was never
// finished. Nothing else here can see it — the pages render, the links work, the contrast is fine.
//
// Measured on this build before the naming pass: eleven of twenty-one menu items named a feature
// rather than a destination. "List layout" is a rendering mode. "All categories" is a CMS concept.
// "Single tag" is the name of a Joomla view.
//
// The vocabulary below is deliberately short and about STRUCTURE, not about industry: every word
// in it is something a template says and a business does not. A name that is genuinely right for a
// site — a design studio really may have a page called `Style guide` — is passed with `--allow`,
// which makes the exception a decision someone wrote down rather than a hole in the check.
import { chromium } from 'playwright';

const [, , url, ...flags] = process.argv;
const ALLOW = (flags.find((f) => f.startsWith('--allow=')) || '--allow=').slice(8)
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

if (!url) {
  console.error('Usage: node naming-voice.mjs <url> [--allow=Wrapper,Style guide]');
  process.exit(2);
}

// Each entry: the pattern, and what a site would say instead. The suggestion is half the value —
// a gate that only says "wrong" leaves the next person guessing.
const SMELLS = [
  [/\blayouts?\b/i, 'a rendering mode, not a destination — say what the page holds'],
  [/\bsingle\b/i, 'the name of a Joomla view — say who or what it is'],
  [/\bhome\s*\d\b/i, 'a number tells a visitor nothing — name the variant'],
  [/\bpages?\b$/i, '"Pages" is where a template keeps its demos'],
  [/\bstyles?\s*\d\b/i, 'a style number is internal'],
  [/\bdemo\b/i, 'says outright that this is not a real site'],
  [/\bsample\b|\bexample\b/i, 'placeholder language'],
  [/\bcategor(y|ies)\b/i, 'a CMS concept — readers have topics, not categories'],
  [/\bmodule\b|\bposition\b/i, 'template vocabulary'],
  [/\bwrapper\b|\biframe\b/i, 'a technique, not a page'],
  [/\buntitled\b|\blorem\b/i, 'unwritten'],
  [/\btest\b/i, 'left over from building'],
  [/\bmega\s*menu\b/i, 'a navigation feature named as if it were a section'],
  [/^\s*(new|copy of)\b/i, 'a duplicate nobody renamed'],
];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });

const items = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const seen = new Map();
  // Every menu label the header renders, including inside megamenu panels and the drawer copy.
  for (const a of document.querySelectorAll('#t4-header a, .t4-header a, .t4-offcanvas a')) {
    const label = clean(a.querySelector('.menu-item-title')?.textContent || a.textContent);
    if (!label || label.length > 60) continue;
    const li = a.closest('li');
    const level = li ? (li.closest('.dropdown-menu') ? 2 : 1) : 0;
    if (!seen.has(label)) seen.set(label, level);
  }
  return [...seen.entries()].map(([label, level]) => ({ label, level }));
});

await browser.close();

console.log(`# naming-voice  ${url}`);
console.log(`  ${items.length} menu label(s) read`);

const hits = [];
for (const { label, level } of items) {
  if (ALLOW.includes(label.toLowerCase())) continue;
  for (const [pattern, why] of SMELLS) {
    if (pattern.test(label)) {
      hits.push({ label, level, why });
      break;
    }
  }
}

if (!hits.length) {
  console.log('OK — no menu label names a template feature');
  process.exit(0);
}

console.log('');
for (const h of hits) console.log(`  ✗ "${h.label}"${h.level === 1 ? ' (top level)' : ''} — ${h.why}`);
console.log('');
console.log('Read the menu aloud. If a line names something the TEMPLATE does rather than something');
console.log('the reader wants, rename it. Pass --allow="…" for a name that is genuinely right for');
console.log('this site, so the exception is recorded rather than assumed.');
process.exit(1);
