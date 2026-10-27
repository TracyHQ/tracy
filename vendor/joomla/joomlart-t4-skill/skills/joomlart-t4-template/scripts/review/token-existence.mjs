#!/usr/bin/env node
// Does every `var(--name)` in this template name something that exists?
//
// Usage: node token-existence.mjs --template=<template dir> [--system=<id>]
//
// WHY THIS IS ITS OWN GATE. A custom property that was never declared and carries no fallback makes
// the whole declaration INVALID AT COMPUTED-VALUE TIME: the browser throws that one property away
// and keeps going. No console warning, no visual error — the element simply lays out as if the line
// had not been written. It is the quietest failure in CSS.
//
// Measured on this template: `--space-10` does not exist. The scale is 1, 2, 3, 4, 5, 6, 8, 12 —
// there is no 10. Six declarations across the shared layer and three new blocks read it anyway, and
// every one of them silently did nothing:
//   · the megamenu panel's `padding-block` — the panel had been rendering with no vertical padding
//     at all since the day it was written, and it looked plausible because the ACM inside brings
//     its own;
//   · the sidebar's `.moduletable + .moduletable` gap — two modules in a column sat flush;
//   · a timeline's column gutter — the marker column and the text column touched, which is what
//     sent me looking.
//
// Not one of the other gates can see this. `contrast-audit` measures colour, `layout-fit` measures
// width, `band-rhythm` measures the gaps that ARE there. A gap that was never applied looks exactly
// like a gap nobody asked for.
//
// WHAT COUNTS AS DECLARED. Anything declared anywhere in the template's own CSS — `:root`, a dark
// block, a component block, an ACM block's own sheet — plus the runtime variables Joomla and
// Bootstrap set on elements from PHP (`--bs-*`, `--t4-*`), which are legitimately absent from the
// stylesheets. A `var(--x, fallback)` is never reported: a fallback is the author saying "this may
// not exist", which is a decision rather than a mistake.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const TPL = opt('template');
// T4 writes a per-style sheet under `media/t4/css/<styleId>.css` from the theme JSON, and it
// declares tokens the template's own CSS then reads. That file is generated, lives outside the
// template, and is absolutely part of the page — so it counts as a declaration site.
const ALSO = opt('also', TPL ? path.join(TPL, '../../media/t4/css') : null);

if (!TPL) {
  console.error('Usage: node token-existence.mjs --template=<template dir> [--system=<id>]');
  process.exit(2);
}

// Bootstrap and T4 set these on elements at runtime; they are declared in PHP, not in CSS.
const RUNTIME = /^--(bs|t4)-/;

const cssFiles = [];

const walk = (dir) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = path.join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {
      // `less/` is source for the compiled `css/`, and `node_modules` is nobody's business here.
      if (name === 'node_modules' || name === 'less' || name === 'scss') continue;
      walk(full);
    } else if (name.endsWith('.css') && !name.endsWith('.min.css')) {
      cssFiles.push(full);
    }
  }
};

walk(TPL);

const declaredElsewhere = new Set();

if (ALSO) {
  const extra = [];
  const walkExtra = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const full = path.join(dir, name);
      let s;
      try { s = statSync(full); } catch { continue; }
      if (s.isDirectory()) walkExtra(full);
      else if (name.endsWith('.css')) extra.push(full);
    }
  };
  walkExtra(ALSO);
  for (const file of extra) {
    for (const m of readFileSync(file, 'utf8').matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) declaredElsewhere.add(m[1]);
  }
}

if (!cssFiles.length) {
  console.log(`FAIL — no CSS found under ${TPL}; nothing was measured.`);
  process.exit(2);
}

const declared = new Set();
const read = new Map(); // name → [{ file, line }]

for (const file of cssFiles) {
  const text = readFileSync(file, 'utf8');

  for (const m of text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) declared.add(m[1]);

  // Only `var(--x)` with NO comma — a fallback means the author already handled absence.
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)) {
      const name = m[1];
      if (!read.has(name)) read.set(name, []);
      read.get(name).push({ file: path.relative(TPL, file), line: i + 1 });
    }
  });
}

const missing = [...read.entries()]
  .filter(([name]) => !declared.has(name) && !declaredElsewhere.has(name) && !RUNTIME.test(name))
  .sort((a, b) => b[1].length - a[1].length);

console.log(`# token-existence  ${TPL}`);
console.log(`  ${cssFiles.length} stylesheet(s) · ${declared.size} declared here · ${declaredElsewhere.size} declared by T4's generated sheet · ${read.size} read without a fallback`);

if (!missing.length) {
  console.log('OK — every `var(--name)` without a fallback names a property this template declares');
  process.exit(0);
}

console.log('');
for (const [name, sites] of missing) {
  console.log(`  ✗ ${name} is read ${sites.length}× and never declared — every one of those declarations is dropped`);
  for (const s of sites.slice(0, 4)) console.log(`      ${s.file}:${s.line}`);
  if (sites.length > 4) console.log(`      … and ${sites.length - 4} more`);
}
console.log('');
console.log('An undeclared custom property with no fallback invalidates its whole declaration at');
console.log('computed-value time: the browser drops that one property and reports nothing. Either');
console.log('declare the token, use one that exists, or give the `var()` a fallback to say the');
console.log('absence is intentional.');
process.exit(1);
