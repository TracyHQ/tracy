#!/usr/bin/env node
// Is `scss/_variables.scss` still what its design system says it should be?
//
// Usage: node variables-drift.mjs --template=<dir> --system=<id> [--od=<dir>] [--blank=<dir>]
//
// WHY THIS IS ITS OWN GATE. `_variables.scss` is GENERATED — `make-variables.mjs` derives 28 Sass
// variables from the system's tokens and leaves T4's other 1146 lines alone. Generated data drifts
// the moment somebody edits the output instead of the source, and this particular output drifts
// silently in a way nothing else here can see: a Sass variable is resolved at BUILD time, so
// `$headings-color: #1d1d1f` lands in `template.css` as a literal that no custom property, no dark
// remap and no token layer can ever reach.
//
// It drifted exactly that way once, and by the cheapest route there is: the file was COPIED from a
// finished build to the next one. Two sites wearing two different design systems held a
// byte-identical `_variables.scss`, so the airbnb build's `template.css` carried apple's ink 50
// times, apple's blue 32, apple's muted 43 and apple's surface 28. The token layer covered almost
// all of it — only two elements actually rendered wrong — but one of those was the header wordmark,
// which sat at contrast 1.00 in dark mode on both sites until three separate gates reported it.
//
// A latent palette is the hard part: 151 of those 153 declarations were correct-looking CSS that
// simply never won a cascade. They cost nothing until someone adds a selector, and then they cost a
// debugging session that starts in the wrong file.
//
// WHAT IT DOES. Runs the generator into memory and compares. It reports the drifted ASSIGNMENTS,
// not a diff of 1174 lines, because the question is always "which value stopped being derived".
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findOdDir } from '../lib/od-tokens.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const TPL = opt('template');
const SYSTEM = opt('system');
// Both of these are FOUND, not told. The one measured run of these tools spent four of seven shell
// commands locating things; a flag with no default makes every caller repeat that search.
const OD = opt('od', findOdDir());
const BLANK = opt('blank', TPL ? path.join(TPL, '../t4_bs5_blank') : null);

if (!TPL || !SYSTEM || !OD) {
  console.error('Usage: node variables-drift.mjs --template=<dir> --system=<id> [--od=<dir>] [--blank=<dir>]');
  if (!OD) console.error('  --od was not given and no vendor/od-design-system was found above the cwd.');
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const gen = path.join(here, '..', 'make-variables.mjs');
const target = path.join(TPL, 'scss', '_variables.scss');

if (!existsSync(target)) {
  console.log(`# variables-drift  ${TPL}`);
  console.log('FAIL — no scss/_variables.scss; nothing was measured.');
  process.exit(2);
}

// The generator prints what it SET; parsing that is enough to compare, and it means the gate cannot
// disagree with the generator about how a value is derived — there is one implementation.
let report;
try {
  report = execFileSync('node', [
    gen, `--system=${SYSTEM}`, `--od=${OD}`, `--out=${TPL}`,
    ...(BLANK ? [`--blank=${BLANK}`] : []), '--dry-run',
  ], { encoding: 'utf8' });
} catch (e) {
  console.log(`# variables-drift  ${TPL}`);
  console.log('FAIL — the generator could not run, so nothing was compared:');
  console.log((e.stderr || e.message).trim().split('\n').map((l) => `  ${l}`).join('\n'));
  process.exit(2);
}

// The generator prints TWO indented lists: what it derived, and what it left as the blank's because
// no token answers for it. Only the first list is this gate's business — reading both counted 29
// "derived" variables where the generator had said 28, and a gate that miscounts its own evidence
// is a gate whose other numbers nobody should trust either.
const expected = new Map();
let derivedSection = true;
for (const line of report.split('\n')) {
  if (/no token in this system/.test(line)) { derivedSection = false; continue; }
  if (!derivedSection) continue;
  const m = /^\s{4}(\$[a-z0-9-]+)\s+(.+?)\s*$/i.exec(line);
  if (m) expected.set(m[1], m[2]);
}

if (!expected.size) {
  console.log(`# variables-drift  ${TPL}`);
  console.log('FAIL — the generator reported no derived values; the comparison would prove nothing.');
  process.exit(2);
}

const actual = new Map();
for (const line of readFileSync(target, 'utf8').split('\n')) {
  const m = /^(\$[a-z0-9-]+):\s*(.+?);\s*(\/\/.*)?$/i.exec(line);
  if (m) actual.set(m[1], m[2].trim());
}

const drifted = [];
for (const [name, want] of expected) {
  const have = actual.get(name);
  if (have === undefined) drifted.push([name, want, '(absent)']);
  else if (have !== want) drifted.push([name, want, have]);
}

console.log(`# variables-drift  ${TPL}`);
console.log(`  system ${SYSTEM} · ${expected.size} derived variable(s) checked`);

if (!drifted.length) {
  console.log('OK — every derived variable still matches what this design system declares');
  process.exit(0);
}

console.log('');
for (const [name, want, have] of drifted) {
  console.log(`  ✗ ${name}`);
  console.log(`      derives to  ${want}`);
  console.log(`      file has    ${have}`);
}
console.log('');
console.log('A Sass variable is resolved at BUILD time, so a wrong value here becomes a literal in');
console.log('template.css that no token, no dark remap and no later rule can reach. Regenerate:');
console.log(`  node scripts/make-variables.mjs --system=${SYSTEM} --od=${OD} --out=${TPL}`);
console.log('If a value genuinely needs to differ, the design system is where to say so — editing');
console.log('the output is how one build\'s palette ended up on another build\'s site.');
process.exit(1);
