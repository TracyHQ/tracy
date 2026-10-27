#!/usr/bin/env node
// Phase 8 snapshot — one getComputedStyle pass, emitted in the shape verify-render.mjs diffs.
//
// Usage: node snapshot.mjs <url> <light|dark> <map.json> <side> > out.json
//   map.json: { "<logical>": { "J": "<joomla selector>", "H": "<fixture selector>" }, ... }
//   side:     J | H — which selector of each pair to read on this page.
//
// Reads the first VISIBLE match (verify-recipes: skip hidden carousel clones), normalises colours
// to hex so the tolerance compare is channel-wise, and forces the dark hook the same three ways
// index.php does so both sides are measured in the same state.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [, , url, scheme, mapFile, side, width = '1440'] = process.argv;
const map = JSON.parse(readFileSync(mapFile, 'utf8'));

const browser = await chromium.launch();
const page = await (await browser.newContext({
  colorScheme: scheme === 'dark' ? 'dark' : 'light',
  viewport: { width: Number(width), height: 900 },
})).newPage();
await page.goto(url, { waitUntil: 'load' });
if (scheme === 'dark') {
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-bs-theme', 'dark');
    document.documentElement.classList.add('t4-dark');
  });
  await page.waitForTimeout(300);
}

const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'fontFamily', 'fontSize', 'fontWeight',
  'lineHeight', 'letterSpacing', 'borderTopLeftRadius', 'paddingTop', 'paddingLeft', 'boxShadow'];

const out = await page.evaluate(({ map, side, PROPS }) => {
  const toHex = (v) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(v);
    if (!m) return v;
    if (m[4] !== undefined && Number(m[4]) === 0) return 'transparent';
    return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const res = {};
  for (const [logical, sel] of Object.entries(map)) {
    const q = sel[side];
    if (!q) continue;
    const el = [...document.querySelectorAll(q)].find(visible);
    if (!el) { res[logical] = { missing: q }; continue; }
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of PROPS) {
      let v = cs[p];
      // a border colour with no border is noise: it only reports currentColor vs a global rule
      if (p === 'borderTopColor' && cs.borderTopWidth === '0px') { o[p] = 'none'; continue; }
      if (/color/i.test(p)) v = toHex(v);
      if (p === 'fontFamily') v = v.split(',')[0].replace(/["']/g, '').trim();
      if (p === 'boxShadow') v = v.replace(/rgba?\([^)]*\)/g, toHex);
      o[p] = v;
    }
    res[logical] = o;
  }
  return res;
}, { map, side, PROPS });

console.log(JSON.stringify(out, null, 2));
await browser.close();
