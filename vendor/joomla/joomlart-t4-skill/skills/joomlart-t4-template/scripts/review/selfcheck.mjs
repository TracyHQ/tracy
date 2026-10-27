// Phase 8 §0c self-consistency gate, run over every `kind: none` page — the pages with no fixture
// to diff against, where nothing external can say whether the build is right.
//
// Usage:
//   node selfcheck.mjs --base=http://127.0.0.1:8080 --tokens=<path/to/_tokens-*.scss> \
//                      [--prefix=TPL_MYTPL] [--viewports=1440,768,390] <path> [<path> ...]
//
// Per page × viewport × mode it asks five questions a fixture cannot: does every declared token
// RESOLVE (a typo'd name silently inherits and looks fine) · does the dark palette actually paint
// the body · does anything run past the right edge · does a light surface survive into dark ·
// does the page leak a PHP notice or an untranslated language key. It reads the token NAMES from
// the template's own tokens partial, so it checks what this build declares rather than a list
// baked into the tool.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BASE = opt('base', 'http://127.0.0.1:8080').replace(/\/$/, '');
const TOKENS_FILE = opt('tokens', null);
const PREFIX = opt('prefix', null);
const VIEWPORTS = opt('viewports', '1440,768,390').split(',').map(Number);
const PAGES = argv.filter((a) => !a.startsWith('--'));

if (!TOKENS_FILE || PAGES.length === 0) {
  console.error('Usage: node selfcheck.mjs --base=<url> --tokens=<_tokens-*.scss> [--prefix=TPL_X] <path> [<path> ...]');
  process.exit(2);
}

const TOKENS = [...readFileSync(TOKENS_FILE, 'utf8')
  .matchAll(/^\s{2}--([a-z0-9-]+):/gm)].map(m => '--' + m[1]);
if (TOKENS.length === 0) {
  console.error(`No tokens matched in ${TOKENS_FILE} — a run that checks zero tokens would report OK for the wrong reason.`);
  process.exit(2);
}

// A raw language key on the page means a string was never translated. The generic Joomla prefixes
// are always worth catching; the TEMPLATE's own prefix has to be supplied, since it is per-build.
//
// `T4_` and `TPL_` are NOT per-build and were missing. They belong to the framework and to Joomla's
// own template convention, so every template built on T4 can leak them — and one did: a build whose
// language file was still named for the template it was renamed FROM printed `T4_BACK_TO_TOP` as
// text at the foot of every page. Joomla loads `en-GB.tpl_<template>.ini` by the template's name,
// finds nothing, and renders the key. This gate ran over that page and reported no raw keys, which
// is how a leak survives a green gate: the prefix that mattered was the one nobody had listed.
const rawKeyRe = new RegExp(
  ['JGLOBAL_[A-Z_]+', 'COM_[A-Z]+_[A-Z_]+', 'MOD_[A-Z]+_[A-Z_]+', 'T4_[A-Z][A-Z_]+', 'TPL_[A-Z][A-Z_]+']
    .concat(PREFIX ? [`${PREFIX}_[A-Z_]+`] : [])
    .join('|'),
  'g',
);

const browser = await chromium.launch();
const rows = [];

for (const path of PAGES) {
  const url = BASE + path;
  for (const width of VIEWPORTS) {
    for (const mode of ['light', 'dark']) {
      const ctx = await browser.newContext({ colorScheme: mode, viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      const res = await page.goto(url, { waitUntil: 'load' });
      if (mode === 'dark') {
        await page.evaluate(() => { document.documentElement.setAttribute('data-theme','dark');
          document.documentElement.setAttribute('data-bs-theme','dark');
          document.documentElement.classList.add('t4-dark'); });
        await page.waitForTimeout(200);
      }
      const html = await page.content();
      const r = await page.evaluate((TOKENS) => {
        const cs = getComputedStyle(document.documentElement);
        const unresolved = TOKENS.filter(t => !cs.getPropertyValue(t).trim());
        const body = getComputedStyle(document.body);
        // widest element sticking past the viewport
        let widest = null, over = document.documentElement.scrollWidth - window.innerWidth;
        if (over > 1) {
          for (const el of document.querySelectorAll('*')) {
            const rect = el.getBoundingClientRect();
            if (rect.right > window.innerWidth + 1 && rect.width > 0) {
              widest = el.tagName + '.' + String(el.className || '').trim().split(/\s+/).slice(0,2).join('.');
              break;
            }
          }
        }
        const lum = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); if (!m) return null;
          const f = n => { n = Number(n)/255; return n <= .03928 ? n/12.92 : ((n+.055)/1.055)**2.4; };
          return .2126*f(m[1]) + .7152*f(m[2]) + .0722*f(m[3]); };
        let lightSurfaces = [];
        if (lum(body.backgroundColor) !== null && lum(body.backgroundColor) < 0.2) {
          for (const el of document.querySelectorAll('*')) {
            const c = getComputedStyle(el), rect = el.getBoundingClientRect();
            if (rect.width < 24 || rect.height < 24 || c.visibility === 'hidden') continue;
            const L = lum(c.backgroundColor);
            if (L !== null && L > 0.85 && !/rgba\(.*,\s*0\)/.test(c.backgroundColor)) {
              lightSurfaces.push(el.tagName + '.' + String(el.className||'').trim().split(/\s+/)[0]);
              if (lightSurfaces.length > 4) break;
            }
          }
        }
        return { unresolved, bodyBg: body.backgroundColor, bodyFg: body.color, over, widest,
                 lightSurfaces: [...new Set(lightSurfaces)] };
      }, TOKENS);
      const scripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
      rows.push({ path, width, mode, status: res.status(),
        tokens: r.unresolved.length ? r.unresolved.join(',') : `all ${TOKENS.length}`,
        bodyBg: r.bodyBg, overflow: r.over > 1 ? `${r.over}px @ ${r.widest}` : 'none',
        lightOnDark: r.lightSurfaces.join(',') || 'none',
        php: (scripts.match(/Warning<\/b>|Fatal error|Notice<\/b>|Deprecated<\/b>/g) || []).length,
        rawKeys: [...new Set(scripts.match(rawKeyRe) || [])].join(',') || 'none' });
      await ctx.close();
    }
  }
}
await browser.close();
const bad = rows.filter(r => r.tokens !== `all ${TOKENS.length}` || r.overflow !== 'none' || r.lightOnDark !== 'none' || r.php > 0 || r.rawKeys !== 'none' || (r.status !== 200 && r.status !== 404));
console.log(`pages=${PAGES.length} viewports=${VIEWPORTS.length} tokens=${TOKENS.length} runs=${rows.length}  FAILING RUNS=${bad.length}`);
for (const r of bad) console.log(' ', r.path, r.width, r.mode, '| status', r.status, '| tokens', r.tokens, '| overflow', r.overflow, '| lightOnDark', r.lightOnDark, '| php', r.php, '| rawKeys', r.rawKeys);
const dark = rows.filter(r => r.mode === 'dark' && r.width === VIEWPORTS[0]);
console.log(`\ndark @${VIEWPORTS[0]} body backgrounds:`, [...new Set(dark.map(r => r.bodyBg))].join(' | '));
process.exit(bad.length ? 1 : 0);
