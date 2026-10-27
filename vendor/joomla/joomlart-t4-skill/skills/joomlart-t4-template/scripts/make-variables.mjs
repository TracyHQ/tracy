#!/usr/bin/env node
// Derive a template's SASS variables from its design system.
//
// Usage: node scripts/make-variables.mjs --system=<id> [--od=<od-design-system>] --out=<template dir>
//                                        [--blank=<blank template dir>] [--dry-run]
//
// WHY THIS EXISTS. `make-style.mjs` writes the token LAYER — custom properties, read at runtime,
// swappable. But T4 compiles Bootstrap through `scss/_variables.scss`, and a Sass variable is
// resolved at BUILD time: `$headings-color: #1d1d1f` becomes the literal `#1d1d1f` in
// `template.css`, where no custom property can ever reach it. That file was hand-edited once, for
// one design system, and then COPIED to the next build.
//
// Measured: the airbnb site's `_variables.scss` was byte-identical to the apple site's, so its
// compiled `template.css` carried apple's ink 50 times, apple's blue 32, apple's muted 43 and
// apple's surface 28. The token layer overrode almost all of it — only TWO elements actually
// rendered in apple's colours — but one of those two was the header wordmark, which then sat at
// contrast 1.00 in dark mode on both sites. A latent palette, waiting for any selector the token
// layer does not happen to cover.
//
// WHAT IT DOES. Starts from the BLANK's `_variables.scss` — T4's own, unedited — and rewrites only
// the assignments a design system can answer for. The delta measured on the apple build was 30
// lines out of 1173; this writes those 30 from tokens and leaves the other 1143 as T4 shipped them.
//
// WHAT IT WILL NOT DO. A value with no token source keeps the blank's and is REPORTED as such.
// Inventing a number here would be indistinguishable, in the output file, from a derived one — and
// the whole point is that a reader can tell where every value came from.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findOdDir, readSystem, token } from './lib/od-tokens.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SYSTEM = opt('system');
const OD = opt('od', findOdDir());
const OUT = opt('out');
const DRY = argv.includes('--dry-run');
const BLANK = opt('blank', OUT ? path.join(OUT, '../t4_bs5_blank') : null);

if (!SYSTEM || !OD || !OUT) {
  console.error('Usage: node make-variables.mjs --system=<id> --od=<dir> --out=<template dir> [--blank=<dir>] [--dry-run]');
  process.exit(2);
}

const sys = readSystem(OD, SYSTEM);
if (!sys) { console.error(`No such system, or no tokens.css: ${SYSTEM}`); process.exit(2); }

const basePath = path.join(BLANK, 'scss', '_variables.scss');
if (!existsSync(basePath)) {
  console.error(`No blank variables to start from: ${basePath}`);
  console.error('Starting from the CURRENT file instead would inherit whatever the last design left in it,');
  console.error('which is the thing this script exists to stop. Point --blank at the blank template.');
  process.exit(2);
}

// ── colour helpers ──────────────────────────────────────────────────────────────────────────────
const hex = (c) => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((c || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((d) => d + d).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return A && B ? toHex(A.map((v, i) => v + (B[i] - v) * t)) : null;
};

const T = (name) => { const v = token(sys, name); return v === null ? null : v.replace(/\s+/g, ' ').trim(); };

// THE GREY RAMP IS DERIVED WHOLE, not assembled from semantic tokens.
//
// The obvious version maps the steps a system already names — `$gray-200` ← `--surface`,
// `$gray-400` ← `--border`, `$gray-600` ← `--muted` — and it produced `$gray-200: #ffffff` on
// airbnb, whose `--surface` IS its `--bg`. A ramp with two identical steps is not a ramp, and
// Bootstrap uses `$gray-200` for exactly the subtle fill that then disappears.
//
// So all nine steps come from one place: this system's own background→foreground line. The
// fractions are measured off a hand-made ramp (apple, #ffffff → #1d1d1f), which is why the method
// reproduces that ramp almost exactly when run on apple — the check that it is derivation and not
// invention. Semantic values keep their semantic tokens further down; they are a different question.
const RAMP = {
  '$gray-100': 0.018, '$gray-200': 0.044, '$gray-300': 0.102,
  '$gray-400': 0.199, '$gray-500': 0.535, '$gray-600': 0.641,
  '$gray-700': 0.836, '$gray-800': 0.934,
};

const bg = T('--bg');
const fg = T('--fg');

// `--elev-ring` is `0 0 0 1px var(--border)` in every system that declares it. Sass cannot hand a
// custom property to `tint()`/`shade()`, and Bootstrap does exactly that with `$box-shadow`, so the
// var is resolved to the literal it points at.
const ring = (borderToken) => {
  const shape = T('--elev-ring');
  const colour = T(borderToken);
  if (!shape || !colour) return null;
  return shape.replace(/var\(--border(-soft)?\)/, colour);
};

// px → rem against Bootstrap's own 16px root, so the file keeps the unit its neighbours use.
const rem = (px) => {
  const m = /^([\d.]+)px$/.exec((px || '').trim());
  return m ? `${+(Number(m[1]) / 16).toFixed(4)}rem` : null;
};

const MAP = {
  $white: bg,
  $black: '#000000',
  $gray_900: fg,
  $blue: T('--accent'),
  $red: T('--danger'),
  $green: T('--success'),
  $yellow: T('--warning'),
  '$link-hover-color': T('--accent-hover'),
  '$border-color': T('--border'),
  '$headings-color': fg,
  '$border-radius': T('--radius-md'),
  '$border-radius-sm': T('--radius-sm'),
  '$border-radius-lg': T('--radius-lg'),
  '$border-radius-pill': T('--radius-pill'),
  $box_shadow: ring('--border'),
  '$box-shadow-sm': ring('--border-soft'),
  '$box-shadow-lg': T('--elev-raised'),
  '$font-size-base': rem(T('--text-base')),
  '$line-height-base': T('--leading-body'),
  '$headings-line-height': T('--leading-tight'),
  // NOT derivable, and the blank's value is worse than no value. Zero of the 152 systems declare a
  // weight token, and T4's blank ships `$headings-font-weight: var(--heading-font-weight)` against a
  // property NOTHING declares — an undeclared custom property with no fallback is invalid at
  // computed-value time, so the whole declaration is dropped and headings fall back to the browser's
  // bold. The hand-edited file replaced it with a literal `600`, which fixed the bug and lost the
  // hook. This keeps both: the fallback renders today, and a system that ever declares the token
  // takes over without anyone editing this file.
  '$headings-font-weight': 'var(--heading-font-weight, 600)',
};
for (const [name, t] of Object.entries(RAMP)) MAP[name] = bg && fg ? mix(bg, fg, t) : null;

// The keys above cannot all be written literally — `$gray-200` is not a valid identifier in an
// object literal without quotes, and quoting some but not others reads as a distinction that is not
// there. Normalise once, here, instead.
const VALUES = Object.fromEntries(Object.entries(MAP).map(([k, v]) => [k.replace(/_/g, '-'), v]));

// ── rewrite ─────────────────────────────────────────────────────────────────────────────────────
// CRLF: the blank ships Windows line endings and the compiled output does not care, but a file that
// mixes them makes every later diff unreadable. Normalise on the way in.
const lines = readFileSync(basePath, 'utf8').replace(/\r\n/g, '\n').split('\n');

const pkg = (() => {
  const details = path.join(OUT, 'templateDetails.xml');
  const m = existsSync(details) ? /<name>(.*)<\/name>/.exec(readFileSync(details, 'utf8')) : null;
  return m ? m[1] : path.basename(OUT);
})();

const set = [];
const kept = [];

const out = lines.map((line) => {
  const m = /^(\$[a-z0-9-]+):(\s*)(.+?)(\s*\/\/.*)?$/i.exec(line);
  if (m) {
    const [, name, gap, current, trailing] = m;
    if (!(name in VALUES)) return line;
    const value = VALUES[name];
    if (value === null || value === undefined) {
      kept.push([name, current.replace(/;$/, '')]);
      return line;
    }
    set.push([name, value]);
    return `${name}:${gap}${value};${trailing || ''}`;
  }
  // The header names the template this file belongs to, and a copied file names the previous one.
  return line.replace(/(@package\s+)\S+/, `$1${pkg}`);
});

const text = out.join('\n');

console.log(`# make-variables  ${SYSTEM} → ${OUT}`);
console.log(`  ${set.length} derived from tokens · ${kept.length} left as the blank's · ${lines.length} lines total`);
console.log('');
for (const [k, v] of set) console.log(`    ${k.padEnd(24)} ${v}`);
if (kept.length) {
  console.log('');
  console.log('  no token in this system — the blank\'s value stands, and this is the honest answer:');
  for (const [k, v] of kept) console.log(`    ${k.padEnd(24)} ${v}`);
}

if (DRY) {
  console.log('');
  console.log('(dry run — nothing written)');
  process.exit(0);
}

const target = path.join(OUT, 'scss', '_variables.scss');
writeFileSync(target, text);
console.log('');
console.log(`written: ${target}`);
console.log('Recompile before measuring — the T4 bundle serves the PREVIOUS build until it is cleared:');
console.log(`  bash scripts/compile-scss.sh --template ${OUT} && bash scripts/clear-cache.sh --root <joomla root>`);
