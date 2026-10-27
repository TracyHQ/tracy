#!/usr/bin/env node
// Does every layout this template ships actually appear on a page?
//
// Usage: node layout-coverage.mjs <base url> --template=<dir> [--pages=scripts/review/pages.txt] [--min=1]
//
// WHY THIS IS ITS OWN GATE. A layout profile is a file. Nothing checks that a menu item ever
// selects it, so a template can ship five layouts and demonstrate three — and the two that never
// render are the two that break first, because nobody has looked at them since they were written.
//
// Measured on this build: `etc/layout/` held five profiles and the site used four. The fifth
// (`default`, the one with the sidebar column) WAS selected by four menu items, and still never
// showed its sidebar, because the module in that position pointed at an empty category. Which is
// why this gate reads what the PAGE renders — `body.layout-<name>` — rather than what the database
// intends: a layout that is configured and invisible has not been demonstrated.
//
// `--min` raises the bar: with `--min=2` a single demo page is not enough, which is the standard a
// template for sale should hold itself to — one page proves it renders, two prove it is not an
// accident of that page's content.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [, , base, ...flags] = process.argv;
const opt = (n, d) => { const h = flags.find((f) => f.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const TPL = opt('template');
const PAGES = opt('pages', 'scripts/review/pages.txt');
const MIN = Number(opt('min', 1));

if (!base || !TPL) {
  console.error('Usage: node layout-coverage.mjs <base url> --template=<dir> [--pages=…] [--min=1]');
  process.exit(2);
}

const profiles = readdirSync(path.join(TPL, 'etc/layout'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const pages = readFileSync(PAGES, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const used = new Map();   // profile → [paths]

for (const p of pages) {
  const res = await page.goto(base + p, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
  if (!res || res.status() !== 200) continue;

  // T4 stamps the active layout profile on `body` as `layout-<name>`.
  const name = await page.evaluate(() => {
    const m = (document.body.className || '').match(/(?:^|\s)layout-([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }).catch(() => null);

  if (!name) continue;
  if (!used.has(name)) used.set(name, []);
  used.get(name).push(p);
}

await browser.close();

console.log(`# layout-coverage  ${base}`);
console.log(`  ${profiles.length} profile(s) in etc/layout · ${pages.length} page(s) visited · threshold ${MIN} page(s) each`);
console.log('');

for (const name of profiles.sort()) {
  const hits = used.get(name) || [];
  const mark = hits.length >= MIN ? ' ' : '✗';
  console.log(`  ${mark} ${name.padEnd(14)} ${hits.length} page(s)${hits.length ? '  ' + hits.slice(0, 3).join(', ') : ''}`);
}

// A layout rendering that the files do not declare means someone edited a style by hand.
const stray = [...used.keys()].filter((n) => !profiles.includes(n));
for (const n of stray) console.log(`  ? ${n.padEnd(14)} rendered by ${used.get(n).length} page(s) but there is no etc/layout/${n}.json`);

const short = profiles.filter((n) => (used.get(n) || []).length < MIN);

if (!short.length && !stray.length) {
  console.log('');
  console.log('OK — every layout profile is demonstrated by a page that renders it');
  process.exit(0);
}

console.log('');
for (const n of short) {
  console.log(`  ✗ \`${n}\` ships in etc/layout and no page in ${PAGES} renders it`);
}
for (const n of stray) {
  console.log(`  ✗ pages render \`layout-${n}\` but no profile file declares it`);
}
console.log('');
console.log('A layout nobody can reach is a layout nobody has checked. Point a menu item at it, or');
console.log('delete the profile — and remember the profile is only half the job: a sidebar column');
console.log('with no module, or a module with no content, renders as no column at all.');
process.exit(1);
