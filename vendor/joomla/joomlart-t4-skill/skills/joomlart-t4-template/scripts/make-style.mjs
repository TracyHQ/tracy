#!/usr/bin/env node
// Build a style for one OpenDesign system: the token layer, the dark remap, and nothing else.
//
// Usage: node scripts/make-style.mjs --system=<id> [--od=<dir>] --out=<template dir>
//
// WHY THIS IS SO SMALL. The expectation was that each design system needs its own component layer —
// the Apple build had one, `_apple.scss`, 485 lines. Measuring it before extracting the shared layer
// showed something else: every value in those 485 lines came from a token, and the only thing
// genuinely Apple in the file was twelve hex literals inside one band variant. Those are the
// system's dark palette, which `build-od-dark-tokens.mjs` now generates for 147 of the 152.
//
// So a style is token VALUES, not CSS. This writes them, and the shared layer in
// `assets/shared-layer/` does the rest. What it cannot write is a component a brand has and others
// do not — Apple's story-chapter, Airbnb's five-photo detail grid — and that is what
// `_signature-<id>.scss` is for, by hand, from DESIGN.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findOdDir, rootBlock, decl } from './lib/od-tokens.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SYSTEM = opt('system', null);
const OD = opt('od', findOdDir());
const OUT = opt('out', null);
if (!SYSTEM || !OD || !OUT) {
  console.error('Usage: node scripts/make-style.mjs --system=<id> --od=<od-design-system dir> --out=<template dir>');
  process.exit(2);
}

const sysDir = path.join(OD, 'systems', SYSTEM);
if (!existsSync(sysDir)) { console.error(`No such system: ${sysDir}`); process.exit(2); }

// `rootBlock` and `decl` moved to scripts/lib/od-tokens.mjs when make-variables.mjs needed them
// too. Both carry a bug that shipped once; a second copy is a copy that loses the comment.
const read = (f) => (existsSync(path.join(sysDir, f)) ? readFileSync(path.join(sysDir, f), 'utf8') : null);

const tokens = read('tokens.css');
if (!tokens) { console.error(`${SYSTEM}: no tokens.css`); process.exit(2); }
const base = rootBlock(tokens);
const gaps = read('tokens.gaps.css');
const gapBlock = gaps ? rootBlock(gaps) : null;
const dark = read('tokens.dark.css');

// The nine template tokens. Each is DERIVED from what the system already declares, so a style is a
// function of the library rather than a set of choices — except `--tracy-ring`, where the design
// prose genuinely differs (Apple: a ring, never a shadow; Airbnb: a 1px hairline) and the elevation
// token is the honest source for both.
const sectionY = decl(base, '--section-y-desktop') ?? '80px';
const derived = {
  '--tracy-band-y': sectionY,
  '--tracy-band-y-tablet': decl(base, '--section-y-tablet') ?? sectionY,
  '--tracy-band-y-phone': decl(base, '--section-y-phone') ?? sectionY,
  '--tracy-body-tracking': decl(base, '--tracking-body') ?? 'normal',
  '--tracy-capsule': decl(base, '--radius-pill') ?? '9999px',
  // The one value with no source in the library: no system states its button padding. This is the
  // schema's own spacing scale, so it is at least the design's own rhythm rather than a guess in
  // pixels — but it is the field a signature partial is most likely to want to override.
  '--tracy-capsule-pad': 'var(--space-3) var(--space-5)',
  '--tracy-ring': decl(base, '--elev-ring') ?? '0 0 0 1px var(--border)',
  // The radius a SHELL uses — the large rounded container a featured block sits in. It was a literal
  // `32px` in the shared layer, which is one system's number written into the layer all 152 load;
  // measured, only ONE system in the library declares `--radius-xl` at all, so that 32 came from the
  // generator's own default rather than from any design. Prefer the system's largest declared step.
  '--tracy-shell-radius': decl(base, '--radius-xl') ?? decl(base, '--radius-lg') ?? '18px',
};

// ── The quiet tone that is still READABLE on this system's surface ────────────
// Small type — an eyebrow, a unit label, a meta line — wants the muted tone. Measured across the
// library: `--muted` on `--surface` falls under WCAG's 4.5 for small text in **17 of 126 systems**,
// and `--fg-2` on `--surface` clears it in **all 126**. So neither token is the answer on its own:
// hard-coding `--fg-2` would darken the eyebrow on the 109 systems that were already fine, and
// keeping `--muted` leaves 13% of the library with text at contrast 2.9.
//
// Deciding it PER SYSTEM at generation time gives each build the quietest tone it can actually
// read. A system whose muted tone is strong enough keeps it, and only the ones that fail step up.
const rgb = (v) => { const m = String(v).trim().match(/^#([0-9a-f]{6})$/i);
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const relLum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a, b) => { if (!a || !b) return null;
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// Against the HARDEST of the light grounds, not just `--surface`. Airbnb declares `--surface` as
// `#ffffff` and puts its cards on `--surface-warm` `#f7f7f7`, so measuring one ground said the muted
// tone was fine while the page measured 2.90 — the pair that actually meets is the one the component
// uses, and a generator cannot know which. Taking the worst of the three is the honest floor.
// `--meta`, not `--muted`. Small type in this template reaches for the quietest tier, and that is
// where the failures were: airbnb's `--muted` is `#6a6a6a` and clears 5.2, while its `--meta` is
// `#929292` and reads 2.90 on `--surface-warm`. Measuring the wrong token said every system was fine.
const metaRGB = rgb(decl(base, '--meta'));
const grounds = ['--bg', '--surface', '--surface-warm'].map((n) => rgb(decl(base, n))).filter(Boolean);
const worst = grounds.length && metaRGB ? Math.min(...grounds.map((g) => contrast(metaRGB, g) ?? Infinity)) : null;
// One step up the same ladder — `--muted` before `--fg-2` — so a system gives up as little of its
// quiet as it has to.
const mutedRGB2 = rgb(decl(base, '--muted'));
const mutedWorst = grounds.length && mutedRGB2 ? Math.min(...grounds.map((g) => contrast(mutedRGB2, g) ?? Infinity)) : null;
derived['--tracy-quiet'] = (worst === null || worst >= 4.5) ? 'var(--meta)'
  : (mutedWorst !== null && mutedWorst >= 4.5) ? 'var(--muted)'
  : 'var(--fg-2)';
// A scene band is the design's own dark palette applied to one band. A system with no dark palette
// declares none, and the shared layer's `var(--tracy-scene-bg, …)` fallback keeps the band legible
// rather than inventing a black the design never asked for.
if (dark) {
  const bg = dark.match(/--bg:\s*([^;]+);/)?.[1]?.trim();
  const fg = dark.match(/--fg:\s*([^;]+);/)?.[1]?.trim();
  if (bg) derived['--tracy-scene-bg'] = bg;
  if (fg) derived['--tracy-scene-fg'] = fg;
}

for (const d of [['css','styles'],['etc','site'],['etc','theme']]) mkdirSync(path.join(OUT, ...d), { recursive: true });

// `/* */`, not `//`. This writes a .CSS file, and `//` is SCSS: a browser meets it, cannot parse
// it, and skips forward to recover — taking the whole `:root` block with it. The page then still
// looked correct, because T4's runtime sheet supplies the same colours from `etc/theme/<name>.json`
// and it was written correctly. Every token read back as "" while the site rendered its two design
// systems apparently perfectly. A header comment is not a place to inherit a habit from.
const head = (what) => `/*
 * ${SYSTEM} — ${what}
 * GENERATED by scripts/make-style.mjs from vendor/od-design-system/systems/${SYSTEM}/.
 * Do not edit: rerun the script. A brand-specific COMPONENT goes in scss/_signature-${SYSTEM}.scss.
 */`;



// T4's twenty runtime variables, remapped under the same hook. `etc/theme/*.json` gives the
// framework LITERAL colours and its generated sheet loads after template.css, so those literals do
// not flip — the token layer can say `--bg: #000000` under the dark hook and the page still paints
// white, which is exactly what happened here. The Apple build carried this block written by hand;
// nothing generated it, so every later style would have shipped a dark mode that does not go dark.
const RUNTIME = [
  ['--body-bg-color', '--bg'], ['--body-text-color', '--fg'],
  ['--body-link-color', '--accent'], ['--body-link-hover-color', '--accent-hover'],
  ['--color-primary', '--accent'], ['--color-secondary', '--surface'],
  ['--color-success', '--success'], ['--color-info', '--accent'],
  ['--color-warning', '--warn'], ['--color-danger', '--danger'],
  ['--color-light', '--surface'], ['--color-dark', '--fg'],
  ['--mainnav-text-color', '--fg'], ['--mainnav-link-color', '--fg'],
  ['--mainnav-link-hover-color', '--accent'], ['--mainnav-link-active-color', '--accent'],
  ['--footer-bg-color', '--surface'], ['--footer-text-color', '--meta'],
  ['--footer-link-color', '--muted'], ['--footer-link-hover-color', '--fg'],
];
const runtimeBlock = [
  '',
  '/* T4 reads these at runtime from etc/theme/*.json as LITERALS, in a sheet that loads after',
  '   template.css. A literal does not flip, so the dark hook has to restate them in terms of the',
  '   tokens it just remapped — otherwise --bg is black and the page is white. */',
  'html[data-theme="dark"],',
  'html.t4-dark,',
  '[data-bs-theme="dark"] {',
  ...RUNTIME.map(([k, v]) => `  ${k}: var(${v});`),
  '}',
  '',
].join('\n');

// ── T4's OWN Bootstrap variables, the fourth artefact outside the token layer ───────────────────
// `template.css` is T4's Bootstrap build, and it was compiled with ONE design system's palette
// baked into `:root` as literals: `--t4-body-color: #1d1d1f`, `--t4-border-color: #d2d2d7`,
// `--t4-link-color: #0071e3`. Every rule Bootstrap ships reads those, not the 56 token names, so a
// second design system dressed the shared layer correctly and left every Bootstrap-derived surface
// wearing the first one's ink. Measured on the airbnb build before this block existed: 65 elements
// on the home page and 78 on the blog still painted Apple's `#1d1d1f` and `#d2d2d7`, while the
// accent — which the shared layer owns — was correctly `#ff385c` everywhere.
//
// The generic Bootstrap swatches (cyan, orange, purple, teal, the form validation pair, the code
// and highlight colours) are deliberately NOT here: they belong to no design system, and mapping
// them onto a token would invent a decision the library never made.
const BOOTSTRAP = [
  ['--t4-body-bg', '--bg'], ['--t4-white', '--bg'],
  ['--t4-body-color', '--fg'], ['--t4-heading-color', '--fg'],
  ['--t4-emphasis-color', '--fg'], ['--t4-dark', '--fg'],
  ['--t4-secondary', '--muted'], ['--t4-gray', '--muted'],
  // The TEXT-tier variables, which Bootstrap 5.3 declares twice — once in `:root` and once inside
  // `[data-bs-theme=dark]`. A page that never gets that attribute keeps the LIGHT values, and
  // `.text-muted` carries `!important`, so the author line on a `tmpl=component` page rendered
  // rgba(33,37,41,.75) on black: contrast 1.09. Routing them through tokens makes the value follow
  // the token layer's own dark remap, so it no longer depends on an attribute JavaScript sets.
  ['--t4-secondary-color', '--muted'], ['--t4-tertiary-color', '--meta'],
  ['--t4-body-color', '--fg'], ['--t4-highlight-color', '--fg'],
  ['--t4-border-color', '--border'],
  ['--t4-gray-100', '--surface-warm'], ['--t4-gray-200', '--surface'],
  ['--t4-gray-300', '--border-soft'], ['--t4-gray-400', '--border'],
  ['--t4-gray-500', '--meta'], ['--t4-gray-600', '--muted'],
  ['--t4-gray-700', '--fg-2'], ['--t4-gray-800', '--fg'], ['--t4-gray-900', '--fg'],
  ['--t4-gray-dark', '--fg'],
  ['--t4-light', '--surface-warm'], ['--t4-secondary-bg', '--surface'],
  ['--t4-tertiary-bg', '--surface-warm'],
  ['--t4-blue', '--accent'], ['--t4-primary', '--accent'],
  ['--t4-link-color', '--accent'], ['--t4-link-hover-color', '--accent-hover'],
  // T4's own theme layer reads `--link-hover-color` in four rules and declares it nowhere:
  // measured at runtime, the property resolves to the empty string, so all four `color`
  // declarations are dropped and those links do not change on hover at all.
  ['--link-hover-color', '--accent-hover'],
  ['--t4-success', '--success'], ['--t4-green', '--success'],
  ['--t4-warning', '--warn'], ['--t4-yellow', '--warn'],
  ['--t4-danger', '--danger'], ['--t4-red', '--danger'],
];

// ── The COMPONENT variables, and why mapping the base names is not enough ───────────────────────
// Bootstrap 5.3 gives every component its own variable block, and those blocks read a second tier
// of names — `--t4-primary-bg-subtle`, `--t4-*-text-emphasis`, `--t4-card-bg`, `--t4-table-color`.
// T4 compiled that tier to literals too, and NONE of it was mapped: measured on a finished build,
// **106 `--t4-*` colour variables still carrying Bootstrap's own palette**, read 250+ times by the
// sheet. It stays invisible until a page uses one of those components — Lee found it on a service
// page whose article contains an accordion: the open panel painted `#cfe2ff` on `#052c65` with a
// `rgba(13, 110, 253, .25)` ring, three colours from a design system that is not this one, in the
// middle of an article.
//
// The accordion itself needed no rule. It reads `--t4-primary-bg-subtle` and
// `--t4-primary-text-emphasis`; mapping THOSE fixes the accordion, the alerts, the list group and
// everything else built on the same tier. Component blocks declare their variables ON the component
// (`.accordion { --t4-accordion-bg: … }`), which beats an inherited `:root` value — so the only
// place a `:root` declaration can win is the tier the component blocks read FROM.
//
// The `-subtle` and `-emphasis` values are DERIVED, not chosen: Bootstrap builds them by mixing a
// semantic colour with the page ground. `color-mix()` reproduces the relationship against this
// system's own tokens instead of freezing one system's arithmetic.
const SUBTLE = (t) => `color-mix(in srgb, var(${t}) 16%, var(--bg))`;
const SUBTLE_BORDER = (t) => `color-mix(in srgb, var(${t}) 34%, var(--bg))`;
// 78% of the semantic colour measured 4.02 against its own subtle ground on airbnb — recognisably
// the brand and just under the 4.5 a 18px/400 label needs. Pulling the page's ink up to a third
// keeps the hue and clears the floor on both systems.
const EMPHASIS = (t) => `color-mix(in srgb, var(${t}) 62%, var(--fg))`;

const BOOTSTRAP_EXPR = [
  // The semantic tier, six families in three variants each.
  ...[['primary', '--accent'], ['secondary', '--muted'], ['success', '--success'],
      ['info', '--accent'], ['warning', '--warn'], ['danger', '--danger']].flatMap(([n, t]) => [
    [`--t4-${n}-bg-subtle`, SUBTLE(t)],
    [`--t4-${n}-border-subtle`, SUBTLE_BORDER(t)],
    [`--t4-${n}-text-emphasis`, EMPHASIS(t)],
  ]),
  // `light` and `dark` are page furniture, not semantics.
  ['--t4-light-bg-subtle', 'var(--surface-warm)'], ['--t4-light-border-subtle', 'var(--border-soft)'],
  ['--t4-light-text-emphasis', 'var(--fg-2)'],
  ['--t4-dark-bg-subtle', 'var(--surface)'], ['--t4-dark-border-subtle', 'var(--border)'],
  ['--t4-dark-text-emphasis', 'var(--fg)'],
  // Surfaces that are simply the page, or the page one step in.
  ['--t4-card-bg', 'var(--bg)'], ['--t4-card-border-color', 'var(--border-soft)'],
  ['--t4-card-cap-bg', 'var(--surface)'],
  ['--t4-dropdown-bg', 'var(--bg)'], ['--t4-dropdown-border-color', 'var(--border-soft)'],
  ['--t4-dropdown-divider-bg', 'var(--border-soft)'],
  ['--t4-dropdown-link-hover-bg', 'var(--surface)'], ['--t4-dropdown-link-hover-color', 'var(--fg)'],
  ['--t4-dropdown-link-active-bg', 'var(--accent)'], ['--t4-dropdown-link-active-color', 'var(--accent-on)'],
  ['--t4-list-group-bg', 'var(--bg)'], ['--t4-list-group-border-color', 'var(--border-soft)'],
  ['--t4-list-group-disabled-bg', 'var(--surface)'],
  ['--t4-list-group-active-bg', 'var(--accent)'], ['--t4-list-group-active-color', 'var(--accent-on)'],
  ['--t4-list-group-active-border-color', 'var(--accent)'],
  ['--t4-modal-bg', 'var(--bg)'], ['--t4-modal-border-color', 'var(--border)'],
  ['--t4-popover-bg', 'var(--bg)'], ['--t4-popover-border-color', 'var(--border-soft)'],
  ['--t4-popover-header-bg', 'var(--surface)'],
  ['--t4-toast-bg', 'var(--bg)'], ['--t4-toast-header-bg', 'var(--surface)'],
  ['--t4-tooltip-bg', 'var(--fg)'], ['--t4-tooltip-color', 'var(--bg)'],
  ['--t4-table-color', 'var(--fg)'], ['--t4-table-bg', 'transparent'],
  ['--t4-table-border-color', 'var(--border-soft)'],
  ['--t4-table-striped-color', 'var(--fg)'], ['--t4-table-striped-bg', 'var(--surface-warm)'],
  ['--t4-table-hover-color', 'var(--fg)'], ['--t4-table-hover-bg', 'var(--surface)'],
  ['--t4-table-active-color', 'var(--fg)'], ['--t4-table-active-bg', 'var(--surface)'],
  ['--t4-table-accent-bg', 'var(--surface-warm)'],
  ['--t4-nav-tabs-link-active-bg', 'var(--bg)'],
  ['--t4-nav-pills-link-active-bg', 'var(--accent)'], ['--t4-nav-pills-link-active-color', 'var(--accent-on)'],
  ['--t4-navbar-color', 'var(--fg-2)'], ['--t4-navbar-hover-color', 'var(--fg)'],
  ['--t4-navbar-active-color', 'var(--fg)'], ['--t4-navbar-disabled-color', 'var(--meta)'],
  ['--t4-navbar-brand-color', 'var(--fg)'], ['--t4-navbar-brand-hover-color', 'var(--fg)'],
  ['--t4-navbar-toggler-border-color', 'var(--border)'],
  ['--t4-pagination-bg', 'var(--bg)'],
  ['--t4-pagination-active-bg', 'var(--accent)'], ['--t4-pagination-active-color', 'var(--accent-on)'],
  ['--t4-pagination-active-border-color', 'var(--accent)'],
  ['--t4-pagination-disabled-bg', 'var(--bg)'],
  ['--t4-progress-bar-bg', 'var(--accent)'], ['--t4-progress-bar-color', 'var(--accent-on)'],
  ['--t4-badge-color', 'var(--accent-on)'],
  ['--t4-btn-close-color', 'var(--fg)'],
  ['--t4-backdrop-bg', 'var(--fg)'],
  ['--t4-border-color-translucent', 'var(--border-soft)'],
  // The focus ring is the ONE piece of chrome every keyboard user sees on every control.
  ['--t4-focus-ring-color', 'color-mix(in srgb, var(--accent) 40%, transparent)'],
  ['--t4-code-color', 'var(--fg-2)'], ['--t4-highlight-bg', 'var(--surface-warm)'],
  // Form validation keeps its semantics; only the palette changes.
  ['--t4-form-valid-color', 'var(--success)'], ['--t4-form-valid-border-color', 'var(--success)'],
  ['--t4-form-invalid-color', 'var(--danger)'], ['--t4-form-invalid-border-color', 'var(--danger)'],
];
const bootstrapBlock = [
  '',
  '/* T4 compiled ONE design system into Bootstrap\'s own variables. This sheet loads after',
  '   template.css, and every value here is a var(), so it follows the dark remap above for free. */',
  ':root {',
  ...BOOTSTRAP.map(([k, v]) => `  ${k}: var(${v});`),
  ...BOOTSTRAP_EXPR.map(([k, v]) => `  ${k}: ${v};`),
  `  --t4-box-shadow: 0 0 0 1px var(--border);`,
  `  --t4-box-shadow-sm: 0 0 0 1px var(--border-soft);`,
  '}',
  '',
].join('\n');

// A design system is a PROFILE TRIO, in T4's own vocabulary: the two JSON profiles below plus this
// one stylesheet. `template.css` declares none of the 56 names it is written against — the same
// arrangement `tpl_tracy` uses so that one template can wear any of the 152.
const indent = (b) => b.trim().split('\n').map((l) => (l.trim() ? `  ${l.trim()}` : '')).join('\n');

writeFileSync(
  path.join(OUT, 'css', 'styles', `${SYSTEM}.css`),
  [
    head('token layer and dark remap'),
    ':root {',
    indent(base),
    gapBlock ? `\n  /* from tokens.gaps.css — declared in DESIGN.md, absent from tokens.css */\n${indent(gapBlock)}` : '',
    '',
    '  /* the nine the shared layer reads and never declares — see assets/shared-layer/STYLE-CONTRACT.md */',
    ...Object.entries(derived).map(([k, v]) => `  ${k}: ${v};`),
    '}',
    dark ? `\n${dark.slice(dark.indexOf('html['))}` : '\n/* no dark palette generated for this system — build-od-dark-tokens.mjs could not derive one */',
    runtimeBlock,
    bootstrapBlock,
  ].join('\n'),
);
// ── T4's site params, which outrank the token layer ─────────────────────────────────────────────
// The token layer declaring `--font-body` is not enough and never was. T4 generates
// `media/t4/css/<styleid>.css` from `etc/site/*.json` and loads it AFTER template.css, so whatever
// font sits in that JSON wins. Proven by switching a finished template from one design system to
// another: `--font-body` read "Airbnb Cereal VF" while the page rendered in SF Pro Text, because
// etc/site still carried the previous system's stack. That is gotcha #57 and #80 arriving by a new
// route — not a missing fallback this time, but the WRONG design system's font, which no font-fidelity
// looking for a browser substitution can see.
const siteDir = path.join(OUT, 'etc', 'site');
if (existsSync(siteDir)) {
  {
    // The profile is NAMED for the design system. T4 resolves `etc/site/<name>.json` from the
    // style's `typelist-site` param, so naming it `default` would mean one template can wear one
    // design system — which is how the first attempt ended up as two templates instead of two
    // styles. `default.json` stays as the seed to copy the untouched keys from.
    const seed = path.join(siteDir, 'default.json');
    const file = path.join(siteDir, `${SYSTEM}.json`);
    const json = JSON.parse(readFileSync(existsSync(file) ? file : seed, 'utf8'));
    const body = decl(base, '--font-body');
    const display = decl(base, '--font-display');
    // The substitute stack tokens.gaps.css recovered from DESIGN.md, when the system named one:
    // a family nobody has plus no fallback is how a page ends up in Times.
    const fallback = gapBlock ? decl(gapBlock, '--font-substitute-stack') : null;
    const stack = (primary) => [primary, fallback].filter(Boolean).join(', ');
    if (body) json.body_font_family = stack(body);
    if (display) json.heading_font_family = stack(display);
    const lh = decl(base, '--leading-body');
    if (lh) json.body_line_height = lh;
    for (const [key, token] of [['h1_font_size', '--text-3xl'], ['h2_font_size', '--text-2xl'], ['h3_font_size', '--text-xl'], ['h4_font_size', '--text-lg'], ['h5_font_size', '--text-base'], ['h6_font_size', '--text-sm'], ['body_font_size', '--text-base']]) {
      const v = decl(base, token);
      if (v) json[key] = v;
    }
    writeFileSync(file, JSON.stringify(json));
    console.log(`make-style: ${path.relative(OUT, file)} — fonts and type scale rewritten from the tokens`);
  }
}

// ── T4's THEME params, which paint the body, the nav and the footer ─────────────────────────────
// The third artefact outside the token layer, and the one that gives the whole game away. T4
// generates `media/t4/css/<styleid>.css` from `etc/theme/*.json` and loads it after template.css,
// so a template rebuilt for another design system paints its body, links, nav and footer from
// whatever palette that JSON still holds. Measured on the airbnb build: `--bg` resolved to #000000
// under the dark hook and the page stayed white, because `body_bg_color` in etc/theme was still
// Apple's #ffffff and `color_primary` was still Apple's #0071e3 — 22 values of the previous system,
// none of them visible from the CSS.
const themeDir = path.join(OUT, 'etc', 'theme');
if (existsSync(themeDir)) {
  const t = (name, fallback) => decl(base, name) ?? fallback;
  const map = {
    color_primary: t('--accent'), color_secondary: t('--surface'),
    color_success: t('--success'), color_info: t('--accent'),
    color_warning: t('--warn'), color_danger: t('--danger'),
    color_light: t('--surface'), color_dark: t('--fg'),
    body_bg_color: t('--bg'), body_text_color: t('--fg'),
    body_link_color: t('--accent'), body_link_hover_color: t('--accent-hover', t('--accent')),
    mainnav_text_color: t('--fg'), mainnav_link_color: t('--fg'),
    mainnav_link_hover_color: t('--accent'), mainnav_link_active_color: t('--accent'),
    footer_bg_color: t('--surface'), footer_text_color: t('--meta', t('--muted')),
    footer_link_color: t('--muted'), footer_link_hover_color: t('--fg'),
  };
  {
    // The profile is NAMED for the design system. T4 resolves `etc/theme/<name>.json` from the
    // style's `typelist-theme` param, so naming it `default` would mean one template can wear one
    // design system — which is how the first attempt ended up as two templates instead of two
    // styles. `default.json` stays as the seed to copy the untouched keys from.
    const seed = path.join(themeDir, 'default.json');
    const file = path.join(themeDir, `${SYSTEM}.json`);
    const json = JSON.parse(readFileSync(existsSync(file) ? file : seed, 'utf8'));
    let n = 0;
    for (const [k, v] of Object.entries(map)) if (v && json[k] !== undefined) { json[k] = v; n++; }
    writeFileSync(file, JSON.stringify(json));
    console.log(`make-style: ${path.relative(OUT, file)} — ${n} palette values rewritten from the tokens`);
  }
}

console.log(
  `make-style: ${SYSTEM} → css/styles/${SYSTEM}.css (${Object.keys(derived).length} template tokens` +
    `${dark ? ' + dark remap' : ', NO dark palette — this system has none generated'}) ` +
    `· etc/site/${SYSTEM}.json · etc/theme/${SYSTEM}.json`,
);
