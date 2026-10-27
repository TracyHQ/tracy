#!/usr/bin/env node
// Does every listing in the menu have enough content to look finished?
//
// Usage: node content-depth.mjs <base url> [--pages=…] [--min=9]
//
// WHY THIS IS ITS OWN GATE. A listing with three items is not broken — it renders, it aligns, it
// passes every measurement here. It just looks like a site nobody finished. The buyer reads a
// half-empty grid as "this template cannot fill a page", which is the opposite of what a demo is
// for, and no gate that measures pixels can see it.
//
// Nine is the floor because three-across is the common grid: nine fills three rows, six fills two
// and looks deliberate, three fills one and looks like a placeholder. It is a content decision,
// so it is a flag rather than a constant.
//
// It counts what the page RENDERS, using `<article>` where Joomla emits it and item titles where
// it does not (archive, tags). A listing that PAGINATES passes regardless of its first-page count:
// pagination is proof there is more behind it, and the page size is a setting rather than a
// content problem.
//
// Two exclusions, both learned by getting a wrong answer first: a page whose body is ACM blocks is
// a COMPOSED page that happens to use a listing view — the home page is `view-featured` and has no
// listing on it — and counting the whole document rather than the component region picked up the
// menu, the footer and the drawer, which reported nine as two.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [, , base, ...flags] = process.argv;
const opt = (n, d) => { const h = flags.find((f) => f.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const PAGES = opt('pages', 'scripts/review/pages.txt');
const MIN = Number(opt('min', 9));

if (!base) {
  console.error('Usage: node content-depth.mjs <base url> [--pages=…] [--min=9]');
  process.exit(2);
}

const paths = readFileSync(PAGES, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const listings = [];

for (const p of paths) {
  const res = await page.goto(base + p, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
  if (!res || res.status() !== 200) continue;

  const found = await page.evaluate(() => {
    const body = document.body.className || '';
    // Joomla names the view on `body`; only listing views are asked this question.
    const isListing = /view-(category|categories|featured|archive|tag|tags|author|newsfeeds)\b/.test(body);
    if (!isListing) return null;

    // A page whose body is ACM blocks is a COMPOSED page that happens to use a listing view —
    // the home page is `view-featured` and has no listing on it at all. Asking it for nine
    // articles reports the front page of every build as unfinished.
    const region = document.querySelector(
      '.com-content-category-blog, .com-content-category, .com-content-archive, '
      + '.com-tags-tag, .com-tags, .com-content-categories, .com-newsfeeds-categories, .com-content-author',
    );
    if (!region || region.querySelector('[class*="acm-"]')) return null;

    // `<article>` is the unit Joomla emits per item; where a view does not use it (archive, tags)
    // the item titles are the next honest count.
    let rendered = region.querySelectorAll('article').length;
    if (!rendered) {
      rendered = region.querySelectorAll('.item-title a, h2 a, h3 a, li > a').length;
    }

    // A listing with pagination holds more than it shows, so the first page is a floor, not a total.
    const paginated = Boolean(document.querySelector('.pagination a, .pagination__item a, .pagenav a'));

    return {
      view: (body.match(/view-([a-z]+)/) || [])[1] || '?',
      rendered,
      paginated,
      heading: (document.querySelector('.page-header h1, .page-header h2, h1')?.textContent || '')
        .replace(/\s+/g, ' ').trim().slice(0, 30),
    };
  }).catch(() => null);

  if (found) listings.push({ path: p, ...found });
}

await browser.close();

console.log(`# content-depth  ${base}`);
console.log(`  ${listings.length} listing page(s) · floor ${MIN} item(s)`);
console.log('');

const thin = [];
for (const l of listings) {
  const count = l.rendered;
  const enough = count >= MIN || l.paginated;
  const mark = enough ? ' ' : '✗';
  console.log(`  ${mark} ${l.path.padEnd(30)} ${String(count).padStart(3)} item(s)${l.paginated ? ' + trang sau' : ''}  ${l.view}  "${l.heading}"`);
  if (!enough) thin.push({ ...l, count });
}

if (!thin.length) {
  console.log('');
  console.log(`OK — every listing carries at least ${MIN} items`);
  process.exit(0);
}

console.log('');
for (const t of thin) {
  console.log(`  ✗ ${t.path} shows ${t.count} item(s) — a listing under ${MIN} reads as unfinished, not as sparse`);
}
console.log('');
console.log('Three across is the common grid: nine fills three rows, six fills two and looks');
console.log('deliberate, three fills one and looks like a placeholder. Add articles to the category,');
console.log('or point the menu item at a category that has them.');
process.exit(1);
