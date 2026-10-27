#!/usr/bin/env node
// Capture one visual baseline of a build: every page × viewport × mode, as a PNG plus a numeric
// signature the diff can compare without an image library.
//
// Usage:
//   node shot.mjs --base=<url> --out=<dir> [--viewports=1440,768,390] [--modes=light,dark]
//                 [--mask=<selector>] <path> [<path> ...]
//
// WHY A SIGNATURE AND NOT JUST PNGs. This skill depends on `playwright` and `jsdom` and nothing
// else; adding an image-diff library to a vendored product is not a decision a build should make on
// its own. So each capture also stores a downsampled grid of average luminance — computed by
// drawing the PNG onto a canvas inside the browser that already exists — and the diff compares
// grids. The PNGs stay for a human to look at when a cell moves.
//
// WHAT THIS ANSWERS, AND WHAT IT DOES NOT. It answers "did anything move since the last capture",
// which no other gate here answers: the nine scanners each check a class of defect they know about,
// and none of them sees a block pushed down the page, an order swapped, or whitespace eating half a
// screen. It does NOT answer "does this match the design" — most pages have no reference to match
// against (measured on a real build: 4 of 32), and the design system's fixture is a token showcase
// rather than a page library. Comparing pages to it would be inventing a verdict.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BASE = (opt('base', 'http://127.0.0.1:8080')).replace(/\/$/, '');
const OUT = opt('out', null);
const VIEWPORTS = opt('viewports', '1440,768,390').split(',').map(Number);
const MODES = opt('modes', 'light,dark').split(',');
const PAGES = argv.filter((a) => !a.startsWith('--'));

// Anything whose CONTENT is allowed to change between runs. Left unmasked, these turn every capture
// red and the gate becomes one nobody reads — the exact failure `band-rhythm` had at 31 of 32 pages.
const MASK = opt(
  'mask',
  'img, picture, svg, video, iframe, time, .tracyapple-meta, [class*="date"], [class*="__meta"]',
);

if (!OUT || PAGES.length === 0) {
  console.error('Usage: node shot.mjs --base=<url> --out=<dir> [--viewports=…] [--modes=…] <path> …');
  process.exit(2);
}

// The grid is coarse on purpose: fine enough to locate a change to a band, coarse enough that
// anti-aliasing and font hinting do not register as movement.
// Measured on a real build: at 32x80 a page-wide change registers 1.54% of cells but a single
// component changing its corner radius registers 0.000% — the coarse grid averages it away
// entirely. 96x20 catches the same button at 0.044%. Fine enough to see one component, coarse
// enough that a glyph edge is not a cell.
const COLS = Number(opt('cols', 96));
const ROW_PX = Number(opt('row-px', 20));
// Capture every shot twice and record how much the SAME page moves against itself. That number is
// this machine's noise floor, and the diff sizes its limit from it — which beats a constant chosen
// on the machine that wrote the tool. Measured here: 0.00% at every grid and tolerance tried, which
// is exactly why a 2% limit guessed up front swallowed a real change.
// How many shots to measure the noise on. Noise is a property of this MACHINE and this renderer,
// not of a page: the first full run measured it on all 192 captures and got 0.0000% on every one,
// having paid for 384 page loads instead of 192 to learn one number. A sample answers the same
// question; `--calibrate=all` is there for the day a machine disagrees with that.
const calArg = argv.find((a) => a === '--calibrate' || a.startsWith('--calibrate='));
const CALIBRATE = Boolean(calArg);
const CAL_N = !calArg ? 0 : calArg === '--calibrate' ? 6 : calArg.slice(12) === 'all' ? Infinity : Number(calArg.slice(12));

const slug = (p) => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-'));

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });
const manifest = { base: BASE, capturedAt: new Date().toISOString(), grid: { cols: COLS, rowPx: ROW_PX }, shots: {} };

// One reusable page for turning a PNG buffer into a grid — the browser is already here, and this
// avoids decoding PNG in node.
const gridder = await (await browser.newContext()).newPage();
await gridder.goto('about:blank');

const signature = async (png, width) =>
  gridder.evaluate(
    async ({ dataUrl, cols, rowPx }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
      const rows = Math.max(1, Math.round(img.height / rowPx));
      const c = document.createElement('canvas');
      c.width = cols;
      c.height = rows;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      // Drawing straight to the small canvas makes the browser do the box-filter downsample for us.
      ctx.drawImage(img, 0, 0, cols, rows);
      const d = ctx.getImageData(0, 0, cols, rows).data;
      const out = [];
      for (let i = 0; i < d.length; i += 4) {
        out.push(Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]));
      }
      return { cols, rows, height: img.height, cells: out };
    },
    { dataUrl: `data:image/png;base64,${png.toString('base64')}`, cols: COLS, rowPx: ROW_PX },
  );

let captured = 0;
for (const p of PAGES) {
  for (const width of VIEWPORTS) {
    for (const mode of MODES) {
      const ctx = await browser.newContext({ colorScheme: mode, viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      // Forcing the dark hook and letting transitions settle has to happen identically on the
      // capture and on the calibration re-shoot; two copies of it is two chances for the noise
      // measurement to describe a state the capture never had.
      const settle = async () => {
        if (mode === 'dark') {
          await page.evaluate(() => {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.documentElement.setAttribute('data-bs-theme', 'dark');
            document.documentElement.classList.add('t4-dark');
          });
        }
        // A flip-and-shoot catches a half-finished transition and reports it as a change next run.
        await page.waitForTimeout(400);
      };
      const shoot = async () =>
        page.screenshot({
          fullPage: true,
          animations: 'disabled',
          mask: await page.locator(MASK).all(),
          maskColor: '#ff00ff',
        });

      const res = await page.goto(BASE + p, { waitUntil: 'load' });
      await settle();

      const key = `${slug(p)}__${width}__${mode}`;
      const png = await shoot();
      writeFileSync(path.join(OUT, `${key}.png`), png);
      const sig = await signature(png, width);
      let noise;
      if (CALIBRATE && captured < CAL_N) {
        await page.reload({ waitUntil: 'load' });
        await settle();
        const again = await signature(await shoot(), width);
        noise = again.cells.length === sig.cells.length
          ? sig.cells.reduce((n, v, i) => n + (Math.abs(v - again.cells[i]) > 10 ? 1 : 0), 0) / sig.cells.length
          : 1;
      }
      // The grid goes to its own file as RAW BYTES. Written into the manifest as a JSON array of
      // integers it came to 19 MB for 192 captures — 43% of the whole store, to hold numbers that
      // are one byte each. The manifest stays small enough to read.
      writeFileSync(path.join(OUT, `${key}.grid`), Buffer.from(sig.cells));
      manifest.shots[key] = {
        path: p, width, mode, status: res.status(), bytes: png.length,
        ...(noise === undefined ? {} : { noise }),
        cols: sig.cols, rows: sig.rows, height: sig.height,
      };
      captured++;
      process.stderr.write('.');
      await ctx.close();
    }
  }
}
await browser.close();

writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.error('');
console.log(`shot: ${captured} captures (${PAGES.length} pages × ${VIEWPORTS.length} viewports × ${MODES.length} modes) → ${OUT}`);
