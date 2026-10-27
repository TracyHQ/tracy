#!/usr/bin/env node
// Who wrote each of this template's overrides — this design, or the blank it was scaffolded from?
//
// Usage: node override-authorship.mjs --template=<dir> [--blank=<dir>]
//
// WHY THIS IS ITS OWN GATE. A T4 template has two entry points (`index.php` for a page,
// `component.php` for every `tmpl=component` URL — a modal, an iframe, a print view) and a tree of
// Joomla overrides under `html/`, one per component or module view. Scaffolding copies the blank's
// tree wholesale, so a file that nobody has opened is not missing — it is the BLANK's markup,
// rendering under this design's CSS, looking deliberate.
//
// WHAT IT FOUND HERE, and why the finding was not the one expected. Measured on this build: 57
// override files, 52 written for this design, 5 byte-identical to `t4_bs5_blank`. Four of those
// were `mod_articles_category/*-layout.php` — and none of them was reachable: all three published
// modules leave `layout` unset, so they rendered Joomla's CORE `default.php`, for which this
// template had NO override at all. The blank's copies were dead weight; the layout actually in use
// was unowned.
//
// The symptom of that gap was a Font Awesome file glyph before every headline, from T4's
// `template.css` (`.category-module li a::before`), neutralised with CSS in two separate rules
// before the cause was measured — **a CSS patch for a markup problem**. The patch works, so nothing
// is red, and the next build inherits the core markup and the patch both.
//
// So the gate reports two different faults with two different repairs:
//   · a file identical to the blank — decide: write it for this design, or delete it, because a
//     copy nobody has read is a design decision nobody made;
//   · an entry point missing or identical — every page rendering through it falls back to the
//     blank.
// It CANNOT tell you which views are reachable; that needs the running site. What it can tell you
// is which files were never opened, which is where reachable gaps hide.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const TPL = opt('template');
const BLANK = opt('blank', TPL ? path.join(TPL, '../t4_bs5_blank') : null);

if (!TPL) {
  console.error('Usage: node override-authorship.mjs --template=<dir> [--blank=<dir>]');
  process.exit(2);
}

const walk = (dir, base = dir, out = []) => {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const full = path.join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) walk(full, base, out);
    else if (name.endsWith('.php')) out.push(path.relative(base, full));
  }
  return out;
};

const htmlDir = path.join(TPL, 'html');
const files = walk(htmlDir).sort();

if (!files.length) {
  console.log(`# override-authorship  ${TPL}`);
  console.log('FAIL — no overrides found under html/; nothing was measured.');
  process.exit(2);
}

const read = (p) => { try { return readFileSync(p); } catch { return null; } };

const identical = [];
const edited = [];
const ownOnly = [];

for (const rel of files) {
  const mine = read(path.join(htmlDir, rel));
  const theirs = read(path.join(BLANK, 'html', rel));
  if (!theirs) { ownOnly.push(rel); continue; }
  if (mine && theirs && mine.equals(theirs)) identical.push(rel);
  else edited.push(rel);
}

// Two entry points, and the second one is the one that gets forgotten: every `tmpl=component`
// URL — a modal, an iframe, a print view — renders through `component.php`, not `index.php`.
const entries = ['index.php', 'component.php', 'error.php', 'offline.php'].map((f) => {
  const mine = read(path.join(TPL, f));
  const theirs = read(path.join(BLANK, f));
  return {
    file: f,
    present: Boolean(mine),
    same: Boolean(mine && theirs && mine.equals(theirs)),
  };
});

console.log(`# override-authorship  ${TPL}`);
console.log(`  ${files.length} override(s) · ${edited.length + ownOnly.length} written for this design · ${identical.length} identical to the blank`);
console.log('');

for (const e of entries) {
  const state = !e.present ? '✗ missing' : e.same ? '✗ identical to the blank' : '  written for this design';
  console.log(`  ${state.padEnd(28)} ${e.file}`);
}

const problems = [];

for (const e of entries) {
  if (!e.present) problems.push(`${e.file} is missing — every page that renders through it falls back to the blank`);
  else if (e.same) problems.push(`${e.file} is byte-identical to the blank`);
}

if (identical.length) {
  console.log('');
  console.log('  still the blank:');
  for (const rel of identical) console.log(`    ✗ html/${rel}`);
  for (const rel of identical) problems.push(`html/${rel} is byte-identical to the blank`);
}

if (!problems.length) {
  console.log('');
  console.log('OK — every entry point and every override was written for this design');
  process.exit(0);
}

console.log('');
console.log('An untouched override is not empty — it is the BLANK\'s markup rendering under this');
console.log('design\'s CSS, and it looks deliberate. Decide per file: write the markup this design');
console.log('wants, or delete it so Joomla\'s core layout shows through. Either is a decision;');
console.log('leaving the blank\'s copy is not.');
console.log('');
console.log('And check the file the running site actually SELECTS: a template can ship four alternate');
console.log('layouts and still leave the default one — the one every module uses — unowned.');
process.exit(1);
