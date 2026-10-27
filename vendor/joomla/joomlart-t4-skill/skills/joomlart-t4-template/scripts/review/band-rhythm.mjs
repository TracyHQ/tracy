#!/usr/bin/env node
// Do the page's bands actually alternate, or is the whole page one flat colour?
//
// Usage: node band-rhythm.mjs <url> [--min-spread=40] [--section=<selector>]
//
// Vertical rhythm on a long page is carried by BAND CONTRAST: a section of content sits on the
// canvas, the next sits on a tinted field, and the eye gets a place to rest. Lose that and the
// page still validates, still passes contrast (text-vs-ground is untouched), still has no leaks
// and no seams — it just reads as an undifferentiated scroll. On a real build nine consecutive
// bands came out with a luminance spread of 10 out of 255 — under 4% — and every existing scanner
// stayed green, because each band was individually fine. Only the SEQUENCE was wrong.
//
// The measurement: resolve each band's effective background (walking up through `transparent`),
// convert to relative luminance, and report the spread across the page. A design that alternates
// #ffffff / #f5f5f7 / #000000 has a spread near 255; one that alternates nothing has a spread
// near 0. `--min-spread` is the threshold in 0-255 luminance units; 40 is a deliberately low bar,
// chosen so it fails only on a page that has genuinely lost the distinction rather than on one
// whose palette is simply quiet.
import { chromium } from 'playwright';

const [, , url, ...flags] = process.argv;
if (!url) {
  console.error('Usage: node band-rhythm.mjs <url> [--min-spread=40] [--section=<selector>]');
  process.exit(1);
}
const arg = (name, fallback) => {
  const hit = flags.find((f) => f.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const minSpread = Number(arg('min-spread', 40));
const sectionSel = arg('section', '.t4-section, section, [class*="-band"], .com-content-article, main > div');
// The footer cluster is the same on every page, so it is not part of a page's rhythm — and counting
// it is what made this gate fire on 31 of 32 pages of a real build. A login page has one content
// band above the footer; "do the bands alternate" is not a question it can answer.
const footerSel = arg('footer', '.t4-footer, .t4-footnav, footer, [class*="footnav"], [class*="-footer"]');

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'load' });

const bands = await page.evaluate(({ sectionSel: sel, footerSel: foot }) => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };

  // A band painted `transparent` shows whatever is behind it; the colour that MATTERS is the
  // first opaque one up the chain, which is what the eye sees.
  const effectiveBg = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.9) return { ...c, from: n === el ? 'self' : n.tagName.toLowerCase() };
    }
    return { r: 255, g: 255, b: 255, a: 1, from: 'default' };
  };

  const lum = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    // A band is full-bleed and tall enough to read as its own region. Anything narrower is a
    // card or a column, and those are not what carries page rhythm.
    if (r.width < window.innerWidth * 0.9 || r.height < 120) continue;
    // Nested wrappers around the same region would each count as a band and inflate the spread.
    if ([...seen].some((p) => p.contains(el) || el.contains(p))) continue;
    seen.add(el);
    const bg = effectiveBg(el);
    out.push({
      isFooter: Boolean(el.closest(foot) || el.matches(foot)),
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().split(/\s+/).slice(0, 2).join('.') || '—',
      top: Math.round(r.top + window.scrollY),
      height: Math.round(r.height),
      rgb: `#${[bg.r, bg.g, bg.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
      painted: bg.from,
      lum: Math.round(lum(bg) * 10) / 10,
    });
  }
  return out.sort((a, b) => a.top - b.top);
}, { sectionSel, footerSel });

await browser.close();

console.log(`# band-rhythm  ${url}`);

if (bands.length === 0) {
  // Measuring nothing and printing OK is the one outcome a gate must never produce.
  console.log(`FAIL — no band matched \`${sectionSel}\`; nothing was measured.`);
  console.log('Pass --section=<selector> naming this template\'s band wrapper.');
  process.exit(2);
}

for (const b of bands) {
  console.log(`  ${String(b.top).padStart(6)}px  h=${String(b.height).padStart(5)}  ${b.rgb}  lum ${String(b.lum).padStart(6)}  ${b.tag}.${b.cls}${b.isFooter ? '  [footer]' : ''}${b.painted === 'self' ? '' : `  (painted by <${b.painted}>)`}`);
}

// Rhythm is a property of the CONTENT bands. Two is the fewest that can alternate; with one there
// is nothing to alternate WITH, and failing such a page says the design is flat when the page
// simply has no ladder to climb.
const content = bands.filter((b) => !b.isFooter);
if (content.length < 2) {
  console.log('');
  console.log(`  ${bands.length} bands, ${content.length} of them content — not a rhythm page, nothing to judge.`);
  console.log('OK — skipped');
  process.exit(0);
}

const lums = content.map((b) => b.lum);
const spread = Math.round((Math.max(...lums) - Math.min(...lums)) * 10) / 10;
const distinct = new Set(content.map((b) => b.rgb)).size;
console.log('');
console.log(`  ${content.length} content bands (+${bands.length - content.length} footer) · ${distinct} distinct grounds · luminance spread ${spread} / 255 (${(spread / 2.55).toFixed(1)}%)`);

if (spread >= minSpread) {
  console.log(`OK — the page alternates  [threshold ${minSpread}]`);
  process.exit(0);
}

console.log('');
console.log(`✗ spread ${spread} is under the ${minSpread} threshold — every band sits on effectively the same ground,`);
console.log('  so the page reads as one undifferentiated scroll no matter how good each band is on its own.');
console.log('  Fix: give the band ladder real rungs. A design system that names both a canvas and a tinted');
console.log('  field expects them USED alternately, and usually names a full-flip scene band as well.');
process.exit(1);
