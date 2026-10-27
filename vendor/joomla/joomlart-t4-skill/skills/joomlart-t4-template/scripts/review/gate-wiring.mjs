#!/usr/bin/env node
// Is every gate in this directory actually RUN by something?
//
// Usage: node gate-wiring.mjs [--dir=scripts/review] [--skill=SKILL.md]
//
// WHY THIS IS ITS OWN GATE. Writing a gate does not enrol it. `run-all.sh` names the gates it
// drives one line at a time, and a gate that never gets its line is a file: it passes review, it
// gets committed, it is described in a commit message, and it never measures anything.
//
// This has now happened twice in the same toolkit. Nine gates written in one week turned out to be
// files nobody ran — found by accident, while renaming them for something else. Then `dark-toggle`
// and `identity-leak` sat unwired for long enough that a whole class of stale-name defect went
// unmeasured, which is precisely what `identity-leak` was written to catch.
//
// The failure is silent in the worst way: a sweep that runs 28 gates and a sweep that runs 30 print
// the same kind of output, and the two missing rows look like rows nobody thought to ask for.
//
// STANDING DOWN IS ALLOWED — SAYING NOTHING IS NOT. A gate can be deliberately outside the sweep;
// `image-relevance` is, because it calls a model and costs money per image. The rule is that the
// reason has to be written down, in the file itself, as a line matching `NOT IN THE SWEEP: <why>`.
// Then the exception is reviewable, and a gate that is merely forgotten cannot pass as one that was
// deliberately excluded.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = opt('dir', here);
const SKILL = opt('skill', path.join(here, '..', '..', 'SKILL.md'));
const DOC = opt('doc', path.join(here, '..', '..', 'references', 'review.md'));

// Not gates: they are instruments the gates and the phases use. `runtime.mjs` belongs here and was
// missing — it is the shared library every scanner imports (config, setTheme, navigate, report), so
// it was reported as both "nothing runs it" and "review.md does not say what it catches", and this
// check was red on a clean tree every single run. A gate that is always red is a gate readers learn
// to skip, which is exactly the failure this file exists to prevent.
const NOT_A_GATE = new Set(['probe.mjs', 'shot.mjs', 'shot-diff.mjs', 'snapshot.mjs', 'gate-wiring.mjs', 'runtime.mjs']);

const runner = readFileSync(path.join(DIR, 'run-all.sh'), 'utf8');
const skill = (() => { try { return readFileSync(SKILL, 'utf8'); } catch { return ''; } })();
const doc = (() => { try { return readFileSync(DOC, 'utf8'); } catch { return ''; } })();

const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !NOT_A_GATE.has(f)).sort();

const wired = [];
const excused = [];
const orphaned = [];
// Being RUN and being FINDABLE are two different failures, and the second one is the quieter. The
// catalogue in review.md is where a reader goes to learn what a gate catches; measured once, it
// described ten gates while twenty-seven existed, so seventeen were running and reporting into a
// sweep nobody could read the meaning of.
const undocumented = [];
// A gate named in the catalogue but without its calling line is only half documented, and the
// measured cost of the missing half was an agent reading 60 lines of source to guess a flag.
const noUsage = [];

for (const f of files) {
  if (runner.includes(f)) { wired.push(f); continue; }

  const src = readFileSync(path.join(DIR, f), 'utf8');
  const m = /NOT IN THE SWEEP:\s*(.+)/.exec(src);
  if (m) { excused.push([f, m[1].trim()]); continue; }

  // A gate the sweep does not drive is still enrolled if a PHASE calls it by name — `token-coverage`
  // runs at Phase 6, before the sweep exists to run it.
  if (skill.includes(f)) { wired.push(f); continue; }

  orphaned.push(f);
}

for (const f of files) {
  const name = f.replace(/\.mjs$/, '');
  if (!doc.includes(name)) { undocumented.push(f); continue; }
  // The usage line belongs to the gate; the catalogue only carries it. Compare against the file so
  // the two cannot drift — a flag renamed in the code and not here is the same defect as no line.
  const src = readFileSync(path.join(DIR, f), 'utf8');
  const m = /^\/\/ Usage:\s*(.+)$/m.exec(src) || /^\/\/ Usage:\s*\n\/\/\s+(.+)$/m.exec(src);
  if (m && !doc.includes(m[1].trim())) noUsage.push([f, m[1].trim()]);
}

console.log('# gate-wiring');
console.log(`  ${files.length} gate(s) · ${wired.length} run · ${excused.length} deliberately outside · ${orphaned.length} run by nothing · ${undocumented.length} not in the catalogue · ${noUsage.length} with no calling line`);

if (excused.length) {
  console.log('');
  for (const [f, why] of excused) console.log(`    outside the sweep  ${f.padEnd(26)} ${why}`);
}

if (!orphaned.length && !undocumented.length && !noUsage.length) {
  console.log('');
  console.log('OK — every gate is run, catalogued, and carries its calling line');
  process.exit(0);
}

console.log('');
for (const f of orphaned) console.log(`  ✗ ${f} — nothing runs it`);
for (const f of undocumented) console.log(`  ✗ ${f} — runs, but ${path.basename(DOC)} does not say what it catches`);
for (const [f, u] of noUsage) console.log(`  ✗ ${f} — catalogued, but its calling line is missing or stale:\n      ${u}`);
console.log('');
console.log('To enrol a gate: give it a line in run-all.sh, name it in a SKILL.md phase, or write the');
console.log('reason it stands outside as `NOT IN THE SWEEP: <why>` in the file itself.');
console.log('To document one: add a row to the catalogue in references/review.md saying what it catches.');
console.log('A gate nobody runs measures nothing. A gate nobody can look up produces a verdict nobody');
console.log('can act on — and both report the same colour as a gate that passed.');
process.exit(1);
