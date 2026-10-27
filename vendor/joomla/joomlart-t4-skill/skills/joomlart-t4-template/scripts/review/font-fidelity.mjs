#!/usr/bin/env node
// Is the page actually rendering in the faces the design system named?
//
// Usage: node font-fidelity.mjs <url> [--expect-serif]
//
// A font stack is a WISH. The browser grants it silently or not at all: name a family nobody has
// and every paragraph falls back to the UA default, with no console warning, no failed request,
// and no visual cue except that the page is suddenly set in Times. Six scanners — contrast, leak,
// seam, border, hover, toggle — all stayed green through exactly that on a real build, because
// serif text on a white ground has perfect contrast, no leaks and no seams. It is only wrong.
//
// The measurement: render a probe string at 100px in the family under test, and in `serif` and
// `sans-serif`. Widths are a fingerprint. If the computed family measures to the pixel like the
// generic the design did NOT ask for, the stack resolved to nothing and the browser picked for you.
//
// Pass --expect-serif for a design whose body face really is a serif; the check then inverts.
import { chromium } from 'playwright';

const [, , url, ...flags] = process.argv;
if (!url) {
  console.error('Usage: node font-fidelity.mjs <url> [--expect-serif]');
  process.exit(1);
}
const expectSerif = flags.includes('--expect-serif');

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(url, { waitUntil: 'load' });

const result = await page.evaluate(() => {
  const probe = 'Handgloves 0123 — ILlj1 mmiii';
  const width = (family) => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '100px ' + family;
    return Math.round(ctx.measureText(probe).width * 10) / 10;
  };

  // Elements worth asking about: the ones carrying the design's voice.
  const targets = [
    ['body', 'body'],
    ['heading', 'h1, h2, .t4-page-title, [class*="__title"]'],
    ['nav', '.t4-megamenu .nav > li > a, .navbar-brand'],
    ['button', '.btn, button'],
    ['code', 'code, pre, kbd'],
  ];

  // The CHROME is not the voice of the page. A footer column head and a nav label are deliberately
  // set in the body face by most design systems, so a heading picked from there answers a different
  // question than the one this gate asks. Measured before this filter existed: nine pages went red —
  // exactly the nine with no h1 or h2 in their content — because the picker fell through to
  // `.tracy-footlinks__title`, whose own rule reads `font-family: var(--font-body)` on purpose.
  // The `nav` role is exempt: chrome is precisely what it is asking about.
  const inChrome = (e) => Boolean(e.closest('footer, .t4-footer, [class*="footlinks"], .t4-offcanvas, header, .header-block'));

  const seen = [];
  for (const [role, selector] of targets) {
    const el = [...document.querySelectorAll(selector)]
      .find((e) => {
        const r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        return role === 'nav' || role === 'body' ? true : !inChrome(e);
      });
    if (!el) continue;
    const family = getComputedStyle(el).fontFamily;
    seen.push({
      role,
      selector,
      family,
      asked: family.split(',')[0].replace(/["']/g, '').trim(),
      measured: width(family),
    });
  }

  // What the DESIGN SYSTEM asked for. A page can render in a face that exists and is still the
  // wrong one: T4 generates its runtime sheet from `etc/site/*.json` and loads it after
  // template.css, so a template switched from one design system to another keeps the previous
  // system's font while `--font-body` says otherwise. Measured on exactly that switch —
  // `--font-body` read "Airbnb Cereal VF" and the page rendered in SF Pro Text. Nothing above sees
  // it, because SF Pro Text is installed and the substitution check passes.
  const root = getComputedStyle(document.documentElement);
  const asked = {
    body: root.getPropertyValue('--font-body').trim(),
    display: root.getPropertyValue('--font-display').trim(),
  };

  return {
    asked,
    generic: { serif: width('serif'), sans: width('sans-serif'), mono: width('monospace') },
    seen,
    // How many distinct families the page ends up rendering in — a design system with two faces
    // that resolves to one has quietly lost a distinction it declared.
    distinct: [...new Set(seen.map((s) => s.measured))].length,
  };
});

await browser.close();

const { generic, seen, asked } = result;
const first = (stack) => (stack || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
const near = (a, b) => Math.abs(a - b) < 0.5;
const problems = [];

// The design system's own choice, checked before the substitution question — a page in the wrong
// design system's font is wrong even when that font is installed and rendering perfectly.
for (const [role, token] of [['body', asked.body], ['heading', asked.display || asked.body]]) {
  const el = seen.find((x) => x.role === role);
  if (!el || !token) continue;
  if (first(el.family) === first(token)) continue;
  problems.push({
    ...el,
    why: `renders in "${el.asked}" but the design system declares "${first(token)}" — the token layer and the `
      + 'page disagree, which on T4 means `etc/site/*.json` still carries another system\'s stack and '
      + 'its generated sheet outranks the tokens (gotcha #57)',
  });
}

for (const s of seen) {
  const isSerif = near(s.measured, generic.serif);
  const isSans = near(s.measured, generic.sans);
  const isMono = near(s.measured, generic.mono);

  // A stack that ENDS in a generic is allowed to land on it — that is what a fallback is for.
  // What this catches is a stack whose FIRST name was supposed to win and did not.
  const stackEndsGeneric = /(?:^|,\s*)(serif|sans-serif|monospace|system-ui|ui-\w+)\s*$/.test(s.family);
  const genericName = isSerif ? 'serif' : isSans ? 'sans-serif' : isMono ? 'monospace' : null;

  if (s.role === 'code' && isMono) continue;

  if (problems.some((p) => p.role === s.role)) continue;
  if (expectSerif ? isSans : isSerif) {
    problems.push({
      ...s,
      why: `renders identically to \`${genericName}\` — the family "${s.asked}" is not installed and the stack `
        + (stackEndsGeneric ? 'fell through to its generic' : 'has NO fallback, so the UA chose'),
    });
  }
}

console.log(`# font-fidelity  ${url}`);
console.log(`  probe widths @100px:  serif ${generic.serif}  ·  sans-serif ${generic.sans}  ·  monospace ${generic.mono}`);
for (const s of seen) {
  const flag = problems.some((p) => p.role === s.role) ? '✗' : ' ';
  console.log(`  ${flag} ${s.role.padEnd(8)} ${String(s.measured).padStart(7)}  ${s.asked}`);
}

if (problems.length === 0) {
  console.log(`OK — every role renders in a real face  [${seen.length} roles measured]`);
  process.exit(0);
}

console.log('');
for (const p of problems) console.log(`  ✗ ${p.role} (${p.selector}) — ${p.why}`);
console.log('');
console.log('Fix: give the family a full stack in the template\'s type settings, and self-host or link the face.');
console.log('A bare family name in T4\'s `body_font_family` is emitted verbatim and outranks the token layer.');
process.exit(1);
