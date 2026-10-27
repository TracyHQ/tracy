#!/usr/bin/env node
// Does every block this template ships appear on a page — and every style of it?
//
// Usage: node block-coverage.mjs <base url> --template=<dir> [--pages=…] [--styles]
//
// WHY THIS IS ITS OWN GATE. A block is a directory. Writing one does not put it on a page, and a
// template with ten blocks that demonstrates seven is selling three it has never rendered in
// anger. The cost lands on the buyer: the first time that block appears is on their site.
//
// With `--styles` it goes one level finer. Blocks here can ship several layouts (`style-1.php`,
// `style-2.php`), and a second style is the cheapest new presentation a template can offer — the
// same content, arranged differently. Measured on this build: ten blocks, twelve style files, and
// only two blocks had a second style at all. A style file nobody selects is a feature nobody has
// seen.
//
// It reads what the PAGES render (`.acm-<name>`, `.style-N`), not what the modules table intends:
// a module can be published, assigned to no page, and count for nothing.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const [, , base, ...flags] = process.argv;
const opt = (n, d) => { const h = flags.find((f) => f.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const TPL = opt('template');
const PAGES = opt('pages', 'scripts/review/pages.txt');
const CHECK_STYLES = flags.includes('--styles');

if (!base || !TPL) {
  console.error('Usage: node block-coverage.mjs <base url> --template=<dir> [--pages=…] [--styles]');
  process.exit(2);
}

const acmDir = path.join(TPL, 'acm');
const blocks = readdirSync(acmDir)
  .filter((name) => {
    try { return statSync(path.join(acmDir, name)).isDirectory(); } catch { return false; }
  })
  .map((name) => {
    let styles = [];
    try {
      styles = readdirSync(path.join(acmDir, name, 'tmpl'))
        .filter((f) => /^style-\d+\.php$/.test(f))
        .map((f) => f.replace('.php', ''));
    } catch { /* a block with no tmpl is not renderable */ }
    return { name, styles };
  })
  .filter((b) => b.styles.length);

const pages = readFileSync(PAGES, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const seen = new Map();        // block → Set(paths)
const seenStyles = new Map();  // block → Set(style-N)

for (const p of pages) {
  const res = await page.goto(base + p, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
  if (!res || res.status() !== 200) continue;

  const hits = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[class*="acm-"]')) {
      const cls = (el.className || '').toString();
      const block = (cls.match(/\bacm-([a-z0-9-]+)/) || [])[1];
      const style = (cls.match(/\bstyle-(\d+)\b/) || [])[0];
      if (block) out.push({ block, style: style || null });
    }
    return out;
  }).catch(() => []);

  for (const { block, style } of hits) {
    if (!seen.has(block)) seen.set(block, new Set());
    seen.get(block).add(p);
    if (style) {
      if (!seenStyles.has(block)) seenStyles.set(block, new Set());
      seenStyles.get(block).add(style);
    }
  }
}

await browser.close();

console.log(`# block-coverage  ${base}`);
console.log(`  ${blocks.length} block(s) in acm/ · ${pages.length} page(s) visited`);
console.log('');

const unusedBlocks = [];
const unusedStyles = [];

for (const { name, styles } of blocks.sort((a, b) => a.name.localeCompare(b.name))) {
  const where = seen.get(name);
  const count = where ? where.size : 0;
  const gotStyles = seenStyles.get(name) || new Set();
  const styleNote = CHECK_STYLES ? `  styles ${gotStyles.size}/${styles.length}` : '';
  console.log(`  ${count ? ' ' : '✗'} ${name.padEnd(16)} ${count} page(s)${styleNote}`);
  if (!count) unusedBlocks.push(name);
  if (CHECK_STYLES && count) {
    for (const s of styles) if (!gotStyles.has(s)) unusedStyles.push(`${name}/${s}`);
  }
}

if (!unusedBlocks.length && !unusedStyles.length) {
  console.log('');
  console.log(`OK — every block ships${CHECK_STYLES ? ' every style' : ''} and appears on a page`);
  process.exit(0);
}

console.log('');
for (const b of unusedBlocks) console.log(`  ✗ \`${b}\` ships in acm/ and renders on no page in ${PAGES}`);
for (const s of unusedStyles) console.log(`  ✗ \`${s}\` is a style file no page selects`);
console.log('');
console.log('A block nobody has rendered is a block nobody has reviewed, and the first person to see');
console.log('it will be the buyer. Put it on a page, or take it out of the template.');
process.exit(1);
