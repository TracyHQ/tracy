#!/usr/bin/env node
// Does every link the site PRINTS actually lead somewhere?
//
// Usage: node link-integrity.mjs <base url> [--max=90]
//
// WHY THIS IS ITS OWN GATE. Every other scanner here opens a page it was told to open and measures
// what is on it. None of them follows a link. So a site can print a link in its own navigation,
// 404 on it, and stay green across eleven gates and a thirty-two page sweep — which is exactly what
// happened: rebuilding the menu left ten items whose PARENT had been unpublished, and Joomla does
// two unhelpful things with those.
//
//   1. The menu module keeps rendering them. They lose their branch and reattach to whichever
//      top-level item is nearest, so ten unrelated pages appeared under "Company".
//   2. The ROUTER refuses to resolve their SEF path, because the path runs through an unpublished
//      item.
//
// The site therefore printed ten links and 404'd on all ten. Nobody had typed a wrong URL; the
// pages existed, were published, and had working content. Only following a link finds this.
//
// It crawls the rendered DOM rather than the sitemap: what matters is what a reader can click.
import { chromium } from 'playwright';

const [, , base, ...flags] = process.argv;
const MAX = Number((flags.find((f) => f.startsWith('--max=')) || '--max=90').slice(6));

if (!base) {
  console.error('Usage: node link-integrity.mjs <base url> [--max=90]');
  process.exit(2);
}

const origin = new URL(base).origin;

const normalise = (href) => {
  try {
    const u = new URL(href, base);
    if (u.origin !== origin) return null;
    // Assets answer on their own terms; a stylesheet is not a destination.
    if (/\.(png|jpe?g|svg|css|js|ico|webp|gif|avif|woff2?|pdf|zip)$/i.test(u.pathname)) return null;
    // A fragment is the same document.
    return u.pathname + u.search;
  } catch {
    return null;
  }
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

const seen = new Set();
const queue = ['/'];
const results = new Map();
const linkedFrom = new Map();

while (queue.length && seen.size < MAX) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);

  const res = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => null);
  const status = res ? res.status() : 0;

  // Joomla answers some errors with a 200 and an error LAYOUT, so the status alone is not enough.
  const looksBroken = await page.evaluate(() => {
    const cls = document.body ? document.body.className : '';
    return /(^|\s)(tracy-)?error(\s|$)/.test(cls) || /\b404\b|not found/i.test(document.title || '');
  }).catch(() => false);

  results.set(path, { status, looksBroken });

  // Only harvest links from pages that rendered — a broken page's links are noise.
  if (status === 200 && !looksBroken) {
    const hrefs = await page.evaluate(
      () => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
    ).catch(() => []);
    for (const href of hrefs) {
      const next = normalise(href);
      if (!next) continue;
      if (!linkedFrom.has(next)) linkedFrom.set(next, path);
      if (!seen.has(next) && !queue.includes(next)) queue.push(next);
    }
  }
}

await browser.close();

const broken = [...results.entries()].filter(([, v]) => v.status !== 200 || v.looksBroken);

console.log(`# link-integrity  ${base}`);
console.log(`  ${results.size} link(s) followed${queue.length ? `, ${queue.length} not reached (--max=${MAX})` : ''}`);

if (!broken.length) {
  console.log('OK — every link the site prints leads to a page that renders');
  process.exit(0);
}

console.log('');
for (const [path, v] of broken) {
  const from = linkedFrom.get(path);
  console.log(`  ✗ ${String(v.status || 'no response').padEnd(3)}${v.looksBroken ? ' + error layout' : ''}  ${path}`);
  if (from) console.log(`      linked from ${from}`);
}
console.log('');
console.log('In Joomla the usual cause is a menu item whose PARENT is unpublished: the module still');
console.log('renders the child — reattached to the nearest top-level item — while the router refuses');
console.log('its path. Publish the parent, or move the item to a menutype no module renders, which');
console.log('keeps the route and takes it out of the navigation.');
process.exit(1);
