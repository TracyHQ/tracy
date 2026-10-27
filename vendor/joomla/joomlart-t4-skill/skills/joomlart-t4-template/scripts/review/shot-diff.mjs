#!/usr/bin/env node
// Compare a capture against a baseline and say what moved, and where.
//
// Usage: node shot-diff.mjs --baseline=<dir> --current=<dir> [--tolerance=12] [--limit=0.02]
//
// `tolerance` is per-cell luminance (0-255): below it a cell counts as unchanged, which absorbs
// anti-aliasing and font hinting. `limit` is the fraction of a page's cells allowed to move before
// the page is reported — a single re-flowed paragraph is not a regression, a re-laid-out band is.
//
// It compares the numeric grids `shot.mjs` stored, not the PNGs, so it needs no image library.
// The PNGs are there for the person who has to decide whether the change was wanted.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const BASELINE = opt('baseline', null);
const CURRENT = opt('current', null);
const TOL = Number(opt('tolerance', 10));
// A guessed limit is how a real change gets filed as noise: the first version of this tool used 2%,
// three orders of magnitude above the real floor, and it swallowed every heading on the page
// jumping to the right edge (1.54%).
//
// This default is near zero but NOT zero, and the difference is load-bearing. A calibrated baseline
// contributes its own measured floor, but on a real build the sample came back 0.0000% while a full
// 192-against-192 run with nothing changed still found one cell moving on four captures — the edge
// of a MASK rectangle rounding differently between runs, not page content. The calibrated floor
// would have reported those; this one absorbs them. The larger of the two wins.
const LIMIT = Number(opt('limit', 0.0002));

if (!BASELINE || !CURRENT) {
  console.error('Usage: node shot-diff.mjs --baseline=<dir> --current=<dir> [--tolerance=12] [--limit=0.02]');
  process.exit(2);
}
const load = (dir) => {
  const f = path.join(dir, 'manifest.json');
  if (!existsSync(f)) {
    console.error(`shot-diff: no manifest in ${dir} — run shot.mjs there first.`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(f, 'utf8'));
};
const a = load(BASELINE);
const b = load(CURRENT);
// Grids live beside the manifest as raw bytes — see the note in shot.mjs.
const grid = (dir, key) => {
  const f = path.join(dir, `${key}.grid`);
  if (!existsSync(f)) {
    console.error(`shot-diff: ${key}.grid is missing from ${dir} — the store was written by an older shot.mjs.`);
    process.exit(2);
  }
  return readFileSync(f);
};

// Noise is a property of the MACHINE and its renderer, not of a page, so the shots the baseline
// sampled stand for the ones it did not. `shot.mjs --calibrate` measures six by default.
const measured = Object.values(a.shots).map((s) => s.noise).filter((n) => n !== undefined);
const calibrated = measured.length > 0;
const sampledFloor = calibrated ? Math.max(...measured) : null;

const rows = [];
const onlyIn = { baseline: [], current: [] };
for (const key of Object.keys(a.shots)) if (!b.shots[key]) onlyIn.baseline.push(key);
for (const key of Object.keys(b.shots)) if (!a.shots[key]) onlyIn.current.push(key);

for (const [key, cur] of Object.entries(b.shots)) {
  const base = a.shots[key];
  if (!base) continue;

  // A page that changed HEIGHT changed layout, and the grids no longer line up row for row.
  // Saying "94% of cells moved" would be true and useless; the height is the finding.
  if (base.rows !== cur.rows) {
    rows.push({ key, kind: 'height', from: base.height, to: cur.height, moved: 1 });
    continue;
  }
  const gb = grid(BASELINE, key);
  const gc = grid(CURRENT, key);
  let moved = 0;
  const bands = new Map();
  for (let i = 0; i < gc.length; i++) {
    if (Math.abs(gc[i] - gb[i]) <= TOL) continue;
    moved++;
    const row = Math.floor(i / cur.cols);
    bands.set(row, (bands.get(row) ?? 0) + 1);
  }
  const fraction = moved / gc.length;
  if (fraction === 0) continue;
  // Three times the measured self-noise, when the baseline recorded one: enough headroom that a
  // machine which is not perfectly deterministic does not cry, without inventing a number.
  const own = base.noise ?? sampledFloor;
  const floor = own === null || own === undefined ? LIMIT : Math.max(LIMIT, own * 3);
  // Report the vertical span that actually moved, in page pixels, so a reader can go and look.
  // Group the touched rows into RUNS. Reporting only first-to-last spans the whole page whenever a
  // component repeats at top and bottom — true, and no use to someone trying to find it.
  const touched = [...bands.keys()].sort((x, y) => x - y);
  const runs = [];
  for (const r of touched) {
    const last = runs[runs.length - 1];
    if (last && r - last.end <= 2) last.end = r;
    else runs.push({ start: r, end: r });
  }
  rows.push({
    key,
    kind: 'pixels',
    moved: fraction,
    cells: moved,
    total: gc.length,
    runs: runs.map((r) => [r.start * b.grid.rowPx, (r.end + 1) * b.grid.rowPx]),
    floor,
  });
}

console.log(`# shot-diff  baseline ${a.capturedAt}  →  current ${b.capturedAt}`);
console.log(`  ${Object.keys(b.shots).length} captures compared · tolerance ${TOL}/255 per cell · limit ${(LIMIT * 100).toFixed(3)}%${calibrated ? ', or 3x each shot\'s measured noise' : ' (baseline not calibrated — run shot.mjs --calibrate)'}`);

for (const k of onlyIn.baseline) console.log(`  · gone from this run: ${k}`);
for (const k of onlyIn.current) console.log(`  · new in this run:    ${k}`);

const over = rows.filter((r) => r.kind === 'height' || r.moved > (r.floor ?? LIMIT));
const under = rows.filter((r) => r.kind !== 'height' && r.moved > 0 && r.moved <= (r.floor ?? LIMIT));

if (under.length) {
  console.log(`  ${under.length} capture(s) moved below the limit (noise, not reported):`);
  for (const r of under.slice(0, 5)) console.log(`      ${r.key}  ${r.cells}/${r.total} cells (${(r.moved * 100).toFixed(3)}%)`);
}

if (over.length === 0 && onlyIn.baseline.length === 0 && onlyIn.current.length === 0) {
  console.log('OK — nothing moved');
  process.exit(0);
}

console.log('');
for (const r of over) {
  if (r.kind === 'height') console.log(`  ✗ ${r.key} — page height ${r.from}px → ${r.to}px`);
  else {
    const where = r.runs.length <= 4
      ? r.runs.map(([f, t]) => `y ${f}-${t}`).join(', ')
      : `${r.runs.length} places, first ${r.runs.slice(0, 3).map(([f, t]) => `y ${f}-${t}`).join(', ')}`;
    console.log(`  ✗ ${r.key} — ${r.cells}/${r.total} cells moved (${(r.moved * 100).toFixed(3)}%) at ${where}`);
  }
}
console.log('');
console.log(`Look at ${CURRENT}/<key>.png beside ${BASELINE}/<key>.png before changing anything.`);
console.log('A change here is not automatically a defect — it is a change nobody has approved yet.');
process.exit(over.length ? 1 : 0);
