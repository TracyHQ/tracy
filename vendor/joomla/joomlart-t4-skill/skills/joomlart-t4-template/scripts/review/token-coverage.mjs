#!/usr/bin/env node
// How much of this template is actually the DESIGN SYSTEM, and how much is still the blank?
//
// Usage: node token-coverage.mjs --template=<dir> [--blank=<dir>] [--max-untouched=0]
//
// WHY. Phase 6 tokenizes the CSS, and `css-tokenizing.md` Path A describes that as editing
// `_variables.scss` and CREATING a partial for the ported design. What it never says is that the
// blank's own partials stay in the cascade underneath, carrying the blank's literals and the
// framework's runtime variables — so the design's identity reaches exactly as far as the new
// partials reach, and stops.
//
// Measured on a finished, nine-gates-green build: **17 of 28 partials were byte-identical to
// t4_bs5_blank**, 4614 lines of someone else's CSS inside a template that claims a design system.
// One of them was `_megamenu.scss`, and that is why the mega panel came out a floating white card
// with a Material-ish shadow — `background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.1);
// border-radius: 0` — while the design it was built from uses a full-bleed band, no border and no
// shadow at all. Nothing was broken. Nothing was measured either.
//
// This does not judge taste. It reports two numbers per partial — how many literal values it
// carries, and whether it is still byte-for-byte the blank's — and lets a threshold decide.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const TPL = opt('template', null);
const BLANK = opt('blank', null);
const MAX_UNTOUCHED = Number(opt('max-untouched', 0));

if (!TPL) {
  console.error('Usage: node token-coverage.mjs --template=<dir> [--blank=<dir>] [--max-untouched=0]');
  process.exit(2);
}
const dir = path.join(TPL, 'scss');
if (!existsSync(dir)) {
  console.error(`token-coverage: no scss/ in ${TPL} — nothing to measure.`);
  process.exit(2);
}

const hash = (f) => createHash('sha1').update(readFileSync(f)).digest('hex');

// A literal is a value a design system should have named: a colour, or a size that is not 0/1px.
// `1px` borders and `0` are left alone — naming them buys nothing and would drown the signal.
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)|(?<![\w.-])(?!0|1px)\d{2,}px\b/g;

const rows = [];
for (const name of readdirSync(dir).filter((f) => f.endsWith('.scss')).sort()) {
  const file = path.join(dir, name);
  const src = readFileSync(file, 'utf8');
  // Comments explain values; they are not values. Counting them reports prose as debt.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const blankFile = BLANK ? path.join(BLANK, 'scss', name) : null;
  rows.push({
    name,
    lines: src.split('\n').length,
    tokens: (code.match(/var\(--/g) ?? []).length,
    literals: (code.match(LITERAL) ?? []).length,
    untouched: Boolean(blankFile && existsSync(blankFile) && hash(blankFile) === hash(file)),
    fromBlank: Boolean(blankFile && existsSync(blankFile)),
  });
}

const untouched = rows.filter((r) => r.untouched);
const authored = rows.filter((r) => !r.fromBlank);
const edited = rows.filter((r) => r.fromBlank && !r.untouched);

console.log(`# token-coverage  ${TPL}`);
console.log(`  ${rows.length} partials · ${authored.length} authored here · ${edited.length} edited from the blank · ${untouched.length} still byte-identical to the blank`);
console.log('');
console.log(`  ${'partial'.padEnd(26)} ${'lines'.padStart(6)} ${'var(--)'.padStart(8)} ${'literals'.padStart(9)}  origin`);
for (const r of rows) {
  const origin = r.untouched ? 'BLANK, untouched' : r.fromBlank ? 'blank, edited' : 'authored';
  console.log(`  ${r.name.padEnd(26)} ${String(r.lines).padStart(6)} ${String(r.tokens).padStart(8)} ${String(r.literals).padStart(9)}  ${origin}`);
}

if (!BLANK) {
  console.log('');
  console.log('No --blank given, so "untouched" could not be decided — pass the scaffold source to get that column.');
  process.exit(0);
}

const blankLines = untouched.reduce((n, r) => n + r.lines, 0);
console.log('');
console.log(`  ${blankLines} lines of the blank ship unchanged inside this template.`);

if (untouched.length <= MAX_UNTOUCHED) {
  console.log(`OK — at or under the ${MAX_UNTOUCHED} allowed`);
  process.exit(0);
}

console.log('');
for (const r of untouched) {
  console.log(`  ✗ ${r.name} — ${r.lines} lines, ${r.literals} literal values, unchanged from the blank`);
}
console.log('');
console.log('Each of these is still in the cascade. A partial nobody read is a partial nobody tokenized,');
console.log('and the design system reaches exactly as far as the partials that were.');
console.log('Decide per file: port it onto tokens, or record it as deliberately inherited.');
process.exit(1);
