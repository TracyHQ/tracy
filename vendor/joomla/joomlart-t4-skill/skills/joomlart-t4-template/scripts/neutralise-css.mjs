#!/usr/bin/env node
// Make a compiled T4 stylesheet design-system-NEUTRAL.
//
// Usage: node neutralise-css.mjs <compiled.css> <tokens.css of the system it was compiled with> [--write]
//
// WHY THIS EXISTS. `template.css` is Bootstrap plus T4's base, compiled through Sass, and Sass
// resolves `$body-color`, `$border-color`, `$primary` into LITERALS at build time. The template is
// shared by every design system, so those literals are one system's palette baked into the artefact
// every other system has to wear. Measured on a two-system build: 350 hex literals of the compiling
// system, and on the second system 65 elements on the home page and 78 on the blog still painted its
// ink and its hairline borders while every token-driven surface was correct.
//
// WHY NOT FIX IT IN SASS. Bootstrap runs `to-rgb($body-color)` while building its colour maps, and
// Sass colour maths cannot take a `var()` — `$body-color: var(--fg)` fails the compile outright
// ("$color: var(--fg) is not a color"). So the substitution has to happen AFTER Sass has finished.
//
// WHAT IT DOES NOT TOUCH. Only exact hex matches for the tokens named below, and only outside a
// url(...) — a colour inside an encoded SVG (`%231d1d1f`) is data, not style, and rewriting it
// produces a broken data URI rather than a themed icon. Colours Bootstrap DERIVED (a hover shade it
// computed to `rgb(24.6%,…)`) are unreachable by construction and are left alone; they are reported
// so the count is honest rather than silently partial.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , cssPath, tokensPath, ...rest] = process.argv;
if (!cssPath || !tokensPath) {
  console.error('Usage: node neutralise-css.mjs <compiled.css> <tokens.css> [--write]');
  process.exit(2);
}
const WRITE = rest.includes('--write');

// The tokens worth substituting: a colour role every design system declares. Deliberately NOT
// white/black — `#fff` is the label on an accent button as often as it is the page ground, and one
// token cannot be right for both.
const ROLES = ['fg', 'fg-2', 'muted', 'meta', 'border', 'border-soft', 'surface', 'surface-warm',
  'accent', 'accent-hover', 'accent-active', 'success', 'warn', 'danger'];

const tokens = readFileSync(tokensPath, 'utf8');
const map = new Map();
for (const role of ROLES) {
  const m = tokens.match(new RegExp(`(?:^|[;{\\s])--${role}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) continue;
  const hex = m[1].toLowerCase();
  // First role to claim a hex wins, so a palette that reuses one value does not produce two
  // substitutions for the same literal — the earlier role in ROLES is the more structural one.
  if (!map.has(hex)) map.set(hex, role);
}

let css = readFileSync(cssPath, 'utf8');
const before = css.length;
const counts = [];
for (const [hex, role] of map) {
  // Not inside url(...): an encoded colour there is part of a data URI.
  const re = new RegExp(`${hex}\\b(?![^(]*\\))|${hex}\\b`, 'gi');
  let n = 0;
  css = css.replace(new RegExp(`(url\\([^)]*\\))|(${hex})\\b`, 'gi'), (all, url, hit) => {
    if (url) return url;
    n++;
    return `var(--${role})`;
  });
  if (n) counts.push({ hex, role, n });
}
counts.sort((a, b) => b.n - a.n);

console.log(`# neutralise-css  ${cssPath}`);
console.log(`  palette read from ${tokensPath} — ${map.size} colour roles`);
for (const c of counts) console.log(`  ${c.hex} → var(--${c.role})   ${c.n}×`);
const total = counts.reduce((s, c) => s + c.n, 0);
console.log(`  ${total} literal(s) replaced`);

// What is left over, and why the count above is not the whole story.
const leftover = [...css.matchAll(/rgb\(\s*[\d.]+%/g)].length;
if (leftover) console.log(`  ${leftover} colour(s) Bootstrap DERIVED (percentage rgb) stay as they are — no token names them`);

if (WRITE) { writeFileSync(cssPath, css); console.log(`  written (${before} → ${css.length} bytes)`); }
else console.log('  dry run — pass --write to apply');
