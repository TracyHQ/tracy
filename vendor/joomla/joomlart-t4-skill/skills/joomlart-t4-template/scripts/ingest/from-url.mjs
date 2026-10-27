#!/usr/bin/env node
// from-url.mjs — crawl a live site → spec-pack skeleton (kind: "url").
//
// This script does the MECHANICAL half: breadth-first same-origin crawl, page inventory,
// Joomla-view inference, and the reference.json/provenance.json scaffolding.
//
// It deliberately does NOT extract the palette. Colours must come from getComputedStyle in a
// real browser (Playwright MCP) — a site's declared CSS is routinely not what renders, once
// cascading custom properties, media queries and color-scheme are involved. from-url.md §2
// walks through that step; this script leaves the palette slots null so the omission is loud
// rather than a plausible-looking wrong hex.
//
// Usage:
//   node scripts/ingest/from-url.mjs <start-url> --out <spec-pack-dir> [--max-pages 30] [--allow-cross-origin] [--force]
//
// See references/inputs/from-url.md — including the rights note before you crawl anything.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inferView } from '../lib/html-bundle.mjs';
import { initSpecPack } from './spec-pack.mjs';
import { buildSiteModel } from './site-model.mjs';

const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1]; };
const out = flag('--out');
const maxPagesRaw = flag('--max-pages', '30');
const maxPages = Number(maxPagesRaw);
if (!Number.isInteger(maxPages) || maxPages < 1) {
  console.error(`--max-pages must be a positive integer; got ${JSON.stringify(maxPagesRaw)}`);
  process.exit(2);
}
const sameOrigin = !args.includes('--allow-cross-origin');
const start = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--out' && args[i - 1] !== '--max-pages');

if (!start || !out) {
  console.error('usage: from-url.mjs <start-url> --out <spec-pack-dir> [--max-pages 30] [--allow-cross-origin] [--force]');
  process.exit(2);
}

let startUrl;
try { startUrl = new URL(start); } catch { console.error(`not a valid URL: ${start}`); process.exit(2); }

// ── crawl ─────────────────────────────────────────────────────────────────────

const SKIP_EXT = /\.(pdf|zip|jpe?g|png|gif|svg|webp|avif|mp4|webm|mp3|css|js|xml|json|ico|woff2?|ttf|otf)$/i;

/** Normalise a URL for dedupe: drop hash, drop trailing slash, drop common tracking params. */
function normalize(u) {
  const url = new URL(u);
  url.hash = '';
  for (const k of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) url.searchParams.delete(k);
  }
  let s = url.toString();
  if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1);
  return s;
}

/** Derive a spec-pack page filename from a URL path: "/about-us/" → "about-us.html". */
function pageFilename(url) {
  const path = new URL(url).pathname.replace(/\/+$/, '');
  if (!path || path === '') return 'index.html';
  const last = path.split('/').filter(Boolean).pop();
  const base = last.replace(/\.(html?|php)$/i, '').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  return `${base || 'index'}.html`;
}

function extractLinks(html, base) {
  const links = new Set();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const abs = new URL(href, base);
      if (!/^https?:$/.test(abs.protocol)) continue;
      if (SKIP_EXT.test(abs.pathname)) continue;
      links.add(normalize(abs.toString()));
    } catch { /* skip unparseable href */ }
  }
  return [...links];
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

/** Section-level outline: the class/id of top-level <section>/<div> blocks inside <main>/<body>. */
function outline(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const scope = main ? main[1] : html;
  const out = [];
  const re = /<section\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(scope)) !== null && out.length < 40) {
    const attrs = m[1];
    const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1] || null;
    const cls = (attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i) || [])[1] || null;
    out.push({ id, class: cls });
  }
  return out;
}

const queue = [normalize(startUrl.toString())];
const seen = new Set(queue);
const found = [];
const failures = [];

while (queue.length && found.length < maxPages) {
  const url = queue.shift();
  let res, html;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'joomlart-t4-ingest/1.0' } });
    if (!res.ok) { failures.push({ url, status: res.status }); continue; }
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html/i.test(ct)) continue;
    html = await res.text();
  } catch (e) {
    failures.push({ url, error: e.message });
    continue;
  }

  const finalUrl = normalize(res.url || url);
  // The origin guard at enqueue time cannot see through a redirect. Without this re-check a
  // 302 to another host silently enters the crawl — and provenance.json would still claim
  // sameOrigin: true, which is the record the licence/rights note relies on.
  if (sameOrigin && new URL(finalUrl).origin !== startUrl.origin) {
    failures.push({ url, redirectedTo: finalUrl, reason: 'redirected off-origin' });
    continue;
  }
  const file = pageFilename(finalUrl);
  found.push({
    page: file,
    url: finalUrl,
    title: extractTitle(html),
    view: inferView(file, html),
    sections: outline(html),
    bytes: html.length,
  });

  for (const link of extractLinks(html, finalUrl)) {
    if (seen.has(link)) continue;
    if (sameOrigin && new URL(link).origin !== startUrl.origin) continue;
    seen.add(link);
    queue.push(link);
  }
}

if (!found.length) {
  console.error(`crawl found no HTML pages at ${start}`);
  if (failures.length) for (const f of failures.slice(0, 5)) console.error(`  ${f.url} → ${f.status ?? f.error}`);
  process.exit(1);
}

// dedupe page filenames (two URLs can collapse to the same basename)
const usedNames = new Map();
for (const p of found) {
  const n = (usedNames.get(p.page) ?? 0) + 1;
  usedNames.set(p.page, n);
  if (n > 1) p.page = p.page.replace(/\.html$/, `-${n}.html`);
}

// the largest page is almost always the home/featured view
found.sort((a, b) => b.bytes - a.bytes);
if (found[0]) found[0].view = 'com_content.featured';
found.sort((a, b) => a.page.localeCompare(b.page));

// ── emit ──────────────────────────────────────────────────────────────────────

const slug = startUrl.hostname.replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9-]/gi, '').toLowerCase();

const pageMap = {
  template: { name: `ja_${slug || 'site'}`, title: (slug || 'Site').replace(/^./, c => c.toUpperCase()), bootstrap: 'bs5' },
  theme: {
    // left null ON PURPOSE — read these from getComputedStyle in the browser (from-url.md §2)
    palette: { light: { primary: null, secondary: null, body_bg: null, text: null }, dark: null },
    fonts: { body: null, heading: null },
  },
  positions: ['menu', 'masthead', 'section-1', 'section-2', 'footer'],
  acm: [],
  extends: [],
  pages: found.map(p => ({ file: p.page, view: p.view })),
};

await mkdir(join(out, 'reference'), { recursive: true });
try {
  initSpecPack(out, {
    pageMap,
    kind: 'url',
    adapter: 'from-url',
    source: { kind: 'url', start: startUrl.toString(), origin: startUrl.origin, crawled: found.length, sameOrigin },
    pages: found.map(p => ({ page: p.page, url: p.url })),
    force: args.includes('--force'),
  });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// The neutral source contract (ADR 0016 of TCH). A crawl is `parity: measured` — the live site
// can be rendered and diffed two-sided, exactly like an HTML bundle.
await writeFile(
  join(out, 'site-model.json'),
  JSON.stringify(buildSiteModel(pageMap, { kind: 'url', origin: startUrl.toString() }), null, 2) + '\n'
);

await writeFile(join(out, 'reference', 'crawl.json'),
  JSON.stringify({ start: startUrl.toString(), crawledAt: new Date().toISOString(), pages: found, failures }, null, 2) + '\n');

// ── report ────────────────────────────────────────────────────────────────────

console.error(`from-url: crawled ${found.length} page(s) from ${startUrl.origin}${failures.length ? ` (${failures.length} failed)` : ''}`);
console.error(`  inventory → ${join(out, 'reference', 'crawl.json')}`);
console.error('\nStill required before this pack can validate:');
console.error('  - palette + fonts: probe getComputedStyle in the browser, light AND dark (from-url.md §2)');
console.error('  - confirm the page→view mapping with the user (conversion-contract.md §4.5)');
console.error('  - sections[]: classify each page\'s section stack into ACM blocks (§4.4)');
console.error('  - a probe snapshot per page, so a live source change mid-build cannot move the goalposts (§4)');
console.error('  - asset licensing: scraped images/fonts are placeholders, not deliverables (§5)');
console.error(`\nthen: node scripts/ingest/spec-pack.mjs --validate ${out}`);
