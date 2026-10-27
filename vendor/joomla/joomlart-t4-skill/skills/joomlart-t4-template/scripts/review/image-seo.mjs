#!/usr/bin/env node
// Is every image on this site described, named and delivered properly?
//
// Usage: node image-seo.mjs <base url> [--pages=…] [--max-kb=400] [--allow-imageless] [--allow-bare-pages]
//
// WHY THIS IS ITS OWN GATE. An image is the one element that can be completely invisible to every
// other check here: it renders, it has the right corner radius, it sits in the right column, and it
// carries no information at all for a search engine, a screen reader, or a reader on a slow
// connection. Nothing in `contrast-audit` or `layout-fit` has an opinion about that.
//
// WHAT IT MEASURES — all of it deterministic, which is why this is separate from `image-relevance`:
// that one asks whether the picture SUITS the article, needs a model to answer, costs money and can
// be wrong. Keeping them apart means this one stays fast enough to run after every change.
//
//   · missing or empty `alt` — except where `alt=""` is paired with `role="presentation"`, which is
//     the correct way to say "this picture carries no information";
//   · `alt` that is just the filename — a description generated from the thing it is describing;
//   · a content image with no caption, where the build says captions are required;
//   · images that 404 — a broken image is worse than no image, and the page still lays out;
//   · filenames with no meaning (`IMG_1234`, `blog-5`, `default`) — the filename is indexed;
//   · no `width`/`height` attributes — the browser cannot reserve the space, so the page jumps;
//   · displayed larger than the file actually is — a blurry image on every screen that matters.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [, , base, ...flags] = process.argv;
const opt = (n, d) => { const h = flags.find((f) => f.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const PAGES = opt('pages', 'scripts/review/pages.txt');
const MAX_KB = Number(opt('max-kb', 400));
const NO_CAPTION = flags.includes('--no-caption-check');
// Two escape hatches, both explicit. A build that deliberately ships no photographs is a decision
// somebody makes out loud; silence is not that decision.
const ALLOW_BARE = flags.includes('--allow-bare-pages');
const ALLOW_IMAGELESS = flags.includes('--allow-imageless');

if (!base) {
  console.error('Usage: node image-seo.mjs <base url> [--pages=…] [--max-kb=400] [--no-caption-check]');
  process.exit(2);
}

const paths = readFileSync(PAGES, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Sizes come from the network, not from the markup — the markup cannot lie about a file it did
// not fetch.
const weights = new Map();
context.on('response', (res) => {
  const type = res.headers()['content-type'] || '';
  if (!type.startsWith('image/')) return;
  const len = Number(res.headers()['content-length'] || 0);
  if (len) weights.set(res.url(), len);
});

const findings = [];
let examined = 0;
// A page that renders no picture at all produces no finding, and no finding reads as a pass. These
// two counters are what turn "nothing to check" into an answer instead of a silence.
const bare = [];
let visited = 0;

for (const p of paths) {
  const res = await page.goto(base + p, { waitUntil: 'load', timeout: 30000 }).catch(() => null);
  if (!res || res.status() !== 200) continue;

  // Give lazy images a chance to load before asking whether they are broken.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForTimeout(200);

  const imgs = await page.evaluate(() => {
    const out = [];
    // Joomla names the view on `body`; carried out with the images so the caller can ask whether
    // THIS page was ever supposed to have one.
    out.view = document.body.className || '';
    for (const img of document.querySelectorAll('img')) {
      const r = img.getBoundingClientRect();
      const style = getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (r.width < 24 && r.height < 24) continue;      // an icon, not a picture

      const fig = img.closest('figure');
      // "Content image" means: inside the article body, big enough to be illustrative, and not a
      // person's avatar or a brand mark.
      const inProse = Boolean(img.closest('.tracy-prose, .article-body, .com-content-article, article'));
      const isAvatar = /avatar|author|default\.(jpg|png)/i.test(img.getAttribute('src') || '')
        || Boolean(img.closest('[class*="author"], [class*="avatar"]'));
      const isBrand = Boolean(img.closest('[class*="logo"], [class*="brand"], [class*="client"]'));

      out.push({
        src: img.getAttribute('src') || '',
        resolved: img.currentSrc || img.src,
        alt: img.getAttribute('alt'),
        presentation: img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true',
        hasDims: Boolean(img.getAttribute('width') && img.getAttribute('height')),
        natural: { w: img.naturalWidth, h: img.naturalHeight },
        shown: { w: Math.round(r.width), h: Math.round(r.height) },
        inFigure: Boolean(fig),
        hasCaption: Boolean(fig && fig.querySelector('figcaption')?.textContent.trim()),
        contentImage: inProse && !isAvatar && !isBrand && r.width >= 200,
      });
    }
    return out;
  }).catch(() => []);

  visited++;
  // ONLY PAGES THAT SHOULD HAVE ONE. The first version flagged every page with no content image and
  // named `/pricing` and `/style-guide` among them — pages that correctly have no article
  // photographs. A gate that cries wolf is a gate that gets skipped, which costs more than the
  // check was worth. An article or a listing of articles is the case where a missing picture is a
  // real absence.
  const wantsImage = /view-(article|featured|category|categories|archive|tag)\b/.test(imgs.view || '');
  if (wantsImage && !imgs.some((i) => i.contentImage)) bare.push(`${p}  [${(imgs.view.match(/view-([a-z]+)/) || [])[1] || '?'}]`);

  for (const img of imgs) {
    examined++;
    const file = (img.src.split('/').pop() || '').split('?')[0];
    const stem = file.replace(/\.[a-z0-9]+$/i, '');
    const add = (kind, detail) => findings.push({ page: p, file, kind, detail });

    if (img.natural.w === 0) {
      add('broken', 'the file does not load — the layout holds, the picture does not');
      continue;
    }
    if ((img.alt === null || img.alt.trim() === '') && !img.presentation) {
      add('no-alt', 'no alt text, and not marked decorative');
    } else if (img.alt && stem && img.alt.trim().toLowerCase().replace(/[-_\s]/g, '')
               === stem.toLowerCase().replace(/[-_\s]/g, '')) {
      add('alt-is-filename', `alt="${img.alt}" repeats the filename`);
    }
    if (/^(img|dsc|photo|image|screenshot)[-_]?\d+$/i.test(stem) || /^(default|placeholder|untitled)$/i.test(stem)
        || /^[a-z]+-\d+$/i.test(stem)) {
      add('vague-filename', `"${file}" — the filename is indexed and says nothing`);
    }
    if (!NO_CAPTION && img.contentImage && !img.hasCaption) {
      add('no-caption', 'a content image with no caption');
    }
    if (!img.hasDims) {
      add('no-dimensions', 'no width/height, so the browser cannot reserve the space');
    }
    if (img.natural.w && img.shown.w > img.natural.w * 1.15) {
      add('upscaled', `shown at ${img.shown.w}px from a ${img.natural.w}px file`);
    }
    const bytes = weights.get(img.resolved);
    if (bytes && bytes > MAX_KB * 1024) {
      add('heavy', `${Math.round(bytes / 1024)} KB (over ${MAX_KB} KB)`);
    }
  }
}

await browser.close();

const byKind = new Map();
for (const f of findings) {
  if (!byKind.has(f.kind)) byKind.set(f.kind, []);
  byKind.get(f.kind).push(f);
}

console.log(`# image-seo  ${base}`);
console.log(`  ${examined} image(s) on ${paths.length} page(s)`);

// NOTHING TO CHECK IS NOT A PASS. This gate used to print the same green line whether the site had
// perfect imagery or none at all: with no images there are no findings, and no findings read as
// success. A build has no image-generation script behind it, so "no pictures were ever added" is
// the likeliest state of a fresh build and exactly the one that slipped through.
// TWO DIFFERENT FAILURES, and the first draft of this gate gave them one message. Measured while
// writing it: the sites happened to be stopped, the gate reported "no images at all on 0 pages" and
// would have sent a reader to look for missing pictures on a site that was simply not running.
// "Nothing was reachable" and "nothing was there" are not the same sentence.
if (!visited) {
  console.log('');
  console.log(`FAIL — not one of the ${paths.length} page(s) answered, so nothing was measured.`);
  console.log(`Is ${base} running? This is not a finding about images.`);
  process.exit(2);
}

if (!examined && !ALLOW_IMAGELESS) {
  console.log('');
  console.log(`FAIL — no images at all on ${visited} page(s), so nothing was measured.`);
  console.log('A site with no pictures passes every image check by having nothing to check. If the');
  console.log('build genuinely ships no imagery, say so with --allow-imageless; otherwise Phase 6b');
  console.log('has not happened yet.');
  process.exit(2);
}

if (bare.length && !ALLOW_BARE) {
  console.log('');
  console.log(`  ✗ ${bare.length} article/listing page(s) render no content image at all:`);
  for (const b of bare.slice(0, 8)) console.log(`      ${b}`);
  if (bare.length > 8) console.log(`      … and ${bare.length - 8} more`);
  findings.push({ page: bare[0], file: '', kind: 'page-with-no-image', detail: '' });
}

if (!findings.length) {
  // Say which green this is. "Every image is fine" and "there were no images and you said that was
  // fine" are different results, and printing the first for the second is how the gate got here.
  console.log(examined
    ? `OK — every image is described, named, sized and delivered (${examined} on ${visited} page(s))`
    : `OK — no images on ${visited} page(s), allowed by --allow-imageless`);
  process.exit(0);
}

console.log('');
const ORDER = ['broken', 'no-alt', 'alt-is-filename', 'no-caption', 'vague-filename', 'upscaled', 'heavy', 'no-dimensions'];
for (const kind of ORDER) {
  const list = byKind.get(kind);
  if (!list) continue;
  console.log(`  ✗ ${kind} — ${list.length} image(s)`);
  for (const f of list.slice(0, 4)) console.log(`      ${f.page}  ${f.file}  ${f.detail}`);
  if (list.length > 4) console.log(`      … and ${list.length - 4} more`);
}
console.log('');
console.log('An image is the one element every other gate here is blind to: it renders correctly and');
console.log('still carries nothing for a search engine, a screen reader, or a slow connection.');
console.log('Whether the picture SUITS the article is a separate question — see image-relevance.');
process.exit(1);
