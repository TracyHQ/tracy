// Scan a page in DARK mode for visible borders that are too BRIGHT relative to
// the dark page (light mode's borders are subtle #e5e5e5-on-white ≈ 1.2:1).
// Usage: node border-scan.mjs <url> [minLuma=80]
// Reports unique (selector-ish, side, color) tuples with the element chain.
import { chromium } from 'playwright';
import { launchOptions, setTheme as applyTheme, navigate, report } from './runtime.mjs';

const [, , url, minLuma = '80'] = process.argv;
const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, colorScheme: 'dark', viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
try {
  await navigate(page, url);
  await applyTheme(page, 'dark');
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); } window.scrollTo(0, 0); });
  await page.waitForTimeout(400);
  const _r = await page.evaluate((MIN) => {
    const parse = c => { const m = c.match(/rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/);
      return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
    const luma = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114;
    const out = [], seen = new Set(); let measured = 0;
    const visible = e => { const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (!e.offsetParent && cs.position !== 'fixed') return false;
      const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
    for (const e of document.body.querySelectorAll('*')) {
      if (!visible(e)) continue;
      // Counted where the filters have already run: this is the number of elements this scan
      // actually LOOKED AT, which is what the report signs for. It used to be
      // `document.body.querySelectorAll('*').length` — the page's node count — and because
      // runtime.mjs only fails on `examined === 0`, any rendered page cleared the coverage floor
      // however little was measured.
      measured++;
      const cs = getComputedStyle(e);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        const w = parseFloat(cs['border' + side + 'Width']);
        if (!w) continue;
        const c = parse(cs['border' + side + 'Color']);
        if (!c || c[3] < 0.5) continue;
        const lum = luma(c);
        if (lum < +MIN) continue;
        // skip pills the design keeps white-on-photo & brand red
        const cls = (e.className || '').toString();
        if (c[0] > 180 && c[1] < 60 && c[2] < 60) continue; // brand red family
        const key = e.tagName + '.' + cls.trim().replace(/\s+/g, '.').slice(0, 40) + '|' + side + '|' + cs['border' + side + 'Color'];
        if (seen.has(key)) continue; seen.add(key);
        let chain = [], n = e;
        for (let i = 0; i < 4 && n; i++) { chain.push((n.className || n.tagName).toString().trim().slice(0, 35)); n = n.parentElement; }
        out.push(`${cs['border' + side + 'Color']}  ${side[0]} ${w}px  ${chain.join(' << ')}`);
        if (out.length > 40) return { out, measured };
      }
    }
    return { out, measured };
  }, minLuma);
  const res = _r.out, _measured = _r.measured;
  const _examined = await page.evaluate(() => document.body ? document.body.querySelectorAll('*').length : 0);
  if (_examined < 20) {
    console.error(`ERR coverage — only ${_examined} element(s) in scope on ${url}; the page did not render. A clean result here proves nothing.`);
    process.exitCode = 1;
  } else if (!res.length) console.log(`OK — no bright borders on ${url}  [${_examined} elements examined]`);
  else { console.log(`# bright borders (luma>${minLuma})  ${url}`); for (const r of res) console.log('  ' + r); }
  report(page, _measured, res, _examined < 20);
} catch (e) {
  // Fail LOUDLY. A scanner that prints ERR and exits 0 is indistinguishable from a clean page —
  // exactly the false-confidence trap review.md warns about.
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally { await browser.close(); }
