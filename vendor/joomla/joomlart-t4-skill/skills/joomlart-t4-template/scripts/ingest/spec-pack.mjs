#!/usr/bin/env node
// spec-pack.mjs — the Phase 1 → Phase 2 gate.
//
// Every input adapter (.pen, Figma, URL, HTML bundle, brief) emits the SAME artifacts:
//   page-map.json · design-spec.md · content-contract.json · reference/ · reference.json · provenance.json
// Nothing downstream may read a spec-pack that has not passed --validate.
//
// The checks are deliberately blunt — missing field, dangling reference path, unresolved TODO,
// page count under the coverage floor. Those are exactly the failures that stay invisible until
// Phase 9 and then cost a rebuild.
//
// Usage:
//   node scripts/ingest/spec-pack.mjs --validate <spec-pack-dir>
//   node scripts/ingest/spec-pack.mjs --init <spec-pack-dir> --page-map <file> [--kind html|url|image|none]
//
// Dependency-free (node: builtins only).

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContract, contractHash } from '../content-contract.mjs';
import { validateDesign } from '../design-contract.mjs';

// ── contract constants ────────────────────────────────────────────────────────

export const PAGE_FLOOR = 12;              // realistic target is 18–24 (page-coverage-matrix tier F)
export const REQUIRED_VIEWS = [
  'com_content.featured',
  'com_content.category.blog',
  'com_content.article',
  'error',
  'offline',
];
export const PALETTE_SLOTS = ['primary', 'secondary', 'body_bg', 'text'];
export const REFERENCE_KINDS = ['html', 'url', 'image', 'none'];
const NAME_RE = /^[a-z][a-z0-9_-]*$/;
const MOBILE_MAX = 430;
const DESKTOP_MIN = 1280;

// The design-spec slot marker. make-design-spec.mjs emits `TODO` inside backticks for every
// unresolved slot; its own instructional header mentions the word TODO in prose, which must NOT
// count — otherwise the generator produces a file that can never pass this gate.
const TODO_SLOT_RE = /`TODO`/;

// Colours we can actually parse. Bare keywords are allowed (a design legitimately says `white`),
// but only real CSS named colours — an unrecognised word is a typo or a placeholder, not a colour.
const COLOR_FUNC_RE = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]+\))$/i;
const CSS_NAMED_COLORS = new Set([
  'transparent', 'currentcolor', 'inherit', 'aliceblue', 'antiquewhite', 'aqua', 'aquamarine',
  'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown',
  'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk',
  'crimson', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey',
  'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey',
  'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue',
  'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold',
  'goldenrod', 'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred',
  'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon',
  'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen',
  'lightgrey', 'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
  'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
  'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab',
  'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple',
  'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown',
  'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey',
  'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet',
  'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
]);

// ── helpers ───────────────────────────────────────────────────────────────────

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function isColor(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return COLOR_FUNC_RE.test(s) || CSS_NAMED_COLORS.has(s.toLowerCase());
}

/**
 * True when `rel` stays inside `root` once resolved.
 * A reference path that escapes the pack is worse than a missing one: Phase 8 would compare
 * against a file nobody packaged, and the pack would not survive being moved or shared.
 */
function isContained(root, rel) {
  const base = resolve(root);
  const target = resolve(base, rel);
  return target === base || target.startsWith(base + sep);
}

/**
 * Validate a spec-pack directory.
 * @param {string} dir
 * @returns {{ ok: boolean, problems: string[], stats: object }}
 */
export function validateSpecPack(dir) {
  const problems = [];
  const stats = {};
  const p = (msg) => problems.push(msg);

  // ── required files ──────────────────────────────────────────────────────────
  const required = ['page-map.json', 'design-spec.md', 'reference.json', 'provenance.json', 'content-contract.json', 'design-contract.json'];
  for (const f of required) {
    if (!existsSync(join(dir, f))) p(`missing required file: ${f}`);
  }
  if (problems.length) return { ok: false, problems, stats };

  // ── page-map.json ───────────────────────────────────────────────────────────
  let map;
  try {
    map = readJson(join(dir, 'page-map.json'));
  } catch (e) {
    return { ok: false, problems: [`page-map.json is not valid JSON: ${e.message}`], stats };
  }

  const tpl = map.template || {};
  if (!tpl.name) p('page-map.template.name is missing');
  else if (!NAME_RE.test(tpl.name)) p(`page-map.template.name "${tpl.name}" must match ${NAME_RE}`);
  if (!tpl.title || !String(tpl.title).trim()) p('page-map.template.title is missing or empty');

  const theme = map.theme || {};
  const palette = theme.palette || {};

  if (!palette.light) {
    p('page-map.theme.palette.light is missing (light is always required)');
  } else {
    for (const slot of PALETTE_SLOTS) {
      const v = palette.light[slot];
      if (v == null || v === '') p(`page-map.theme.palette.light.${slot} is missing`);
      else if (!isColor(v)) p(`page-map.theme.palette.light.${slot} "${v}" is not a parseable CSS colour`);
    }
  }

  // dark may be null ONLY when the pack declares it explicitly.
  //
  // This used to be a prose regex over design-spec.md, which meant a sentence *denying* derivation
  // ("we do NOT derive dark") satisfied it — and it silently disabled the modes check too. Intent
  // now has to be stated as data, in one place, where it cannot be triggered by accident.
  let specText = '';
  try { specText = readFileSync(join(dir, 'design-spec.md'), 'utf8'); } catch { /* reported above */ }
  const darkDerived = theme.darkDerived === true;

  if (palette.dark == null) {
    if (!darkDerived) {
      p('page-map.theme.palette.dark is null; set page-map.theme.darkDerived = true to declare that dark is derived in Phase 6 (dark-light-mode-standard.md)');
    }
  } else if (darkDerived) {
    p('page-map.theme.darkDerived is true but theme.palette.dark is also set — say which one is authoritative');
  } else {
    for (const slot of PALETTE_SLOTS) {
      const v = palette.dark[slot];
      if (v == null || v === '') p(`page-map.theme.palette.dark.${slot} is missing`);
      else if (!isColor(v)) p(`page-map.theme.palette.dark.${slot} "${v}" is not a parseable CSS colour`);
    }
  }

  const fonts = theme.fonts || {};
  if (!fonts.body || !String(fonts.body).trim()) p('page-map.theme.fonts.body is missing');

  const pages = Array.isArray(map.pages) ? map.pages : [];
  stats.pageCount = pages.length;
  const mode = map.scope?.mode ?? 'template';
  stats.mode = mode;
  if (!['website', 'template', 'edit'].includes(mode)) p('scope.mode must be website, template or edit');
  if (mode !== 'template') {
    if (!map.scope?.reason?.trim()) p('scope.reason must record the requested scope');
    const requested = map.scope?.pages;
    if (!Array.isArray(requested) || !requested.length || requested.some(x => typeof x !== 'string' || !x.trim()))
      p('scope.pages must list the requested pages');
    else if (requested.length !== new Set(requested).size || requested.length !== pages.length || requested.some(x => !pages.some(page => page?.file === x)))
      p('scope.pages must exactly match page-map.pages');
  }
  if (pages.length < (mode === 'template' ? PAGE_FLOOR : 1)) {
    p(`page-map.pages has ${pages.length} entries; the coverage floor is ${PAGE_FLOOR} (target 18–24 — see page-coverage-matrix.md tier F)`);
  }
  const views = new Set(pages.map(x => x && x.view).filter(Boolean));
  for (const v of mode === 'template' ? REQUIRED_VIEWS : []) {
    if (!views.has(v)) p(`no page maps to the required view "${v}"`);
  }
  // Duplicate filenames would otherwise let N copies of one page satisfy the coverage floor.
  const seenFiles = new Set();
  for (const [i, page] of pages.entries()) {
    if (!page || !page.file) { p(`page-map.pages[${i}].file is missing`); continue; }
    if (seenFiles.has(page.file)) p(`page-map.pages[${i}].file "${page.file}" is a duplicate; each page must be distinct`);
    seenFiles.add(page.file);
  }

  // Site facts are separate from the visual reference, including edit/resume workflows.
  try {
    const content = validateContract(readJson(join(dir, 'content-contract.json')));
    for (const page of pages) {
      if (!content.surfaces.some(surface => surface.id === page.file))
        p(`content-contract.json has no surface for ${page.file}`);
    }
    stats.contentContractHash = contractHash(content);
  } catch (error) { p(`content-contract.json: ${error.message}`); }

  try {
    const design = validateDesign(readJson(join(dir, 'design-contract.json')));
    for (const page of pages) if (!design.pages.some(p => p.id === page.file))
      p(`design-contract.json has no page for ${page.file}`);
    stats.designContractHash = contractHash(design);
  } catch (error) { p(`design-contract.json: ${error.message}`); }

  // ── design-spec.md ──────────────────────────────────────────────────────────
  // A spec with an open slot is not ready: execute subagents read this INSTEAD of
  // conversation context (build-subagents.md §C), so an unresolved slot makes them diverge.
  //
  // Match the SLOT marker (`TODO` in backticks, as make-design-spec.mjs emits it), not the bare
  // word — the generator's own instructional header talks *about* TODOs in prose, and matching
  // that made its output impossible to pass.
  if (!specText.trim()) {
    p('design-spec.md is empty — generate it with scripts/make-design-spec.mjs and complete every slot');
  }
  const todoLines = specText
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => TODO_SLOT_RE.test(line));
  stats.todoCount = todoLines.length;
  if (todoLines.length) {
    const shown = todoLines.slice(0, 5).map(([n]) => n).join(', ');
    const more = todoLines.length > 5 ? ` (+${todoLines.length - 5} more)` : '';
    p(`design-spec.md still has ${todoLines.length} unresolved \`TODO\` slot(s) on line(s): ${shown}${more}`);
  }

  // ── reference.json ──────────────────────────────────────────────────────────
  let ref;
  try {
    ref = readJson(join(dir, 'reference.json'));
  } catch (e) {
    p(`reference.json is not valid JSON: ${e.message}`);
    return { ok: problems.length === 0, problems, stats };
  }

  const topKind = ref.kind;
  if (!REFERENCE_KINDS.includes(topKind)) {
    p(`reference.json.kind "${topKind}" must be one of ${REFERENCE_KINDS.join(' | ')}`);
  }
  stats.kind = topKind;

  const viewports = Array.isArray(ref.viewports) ? ref.viewports : [];
  const badViewports = viewports.filter(v => !Number.isFinite(Number(v)) || Number(v) <= 0);
  if (badViewports.length) {
    p(`reference.json.viewports must be positive numbers; got [${viewports.map(v => JSON.stringify(v)).join(', ')}]`);
  }
  const numericViewports = viewports.map(Number).filter(Number.isFinite);
  if (!numericViewports.some(v => v <= MOBILE_MAX)) {
    p(`reference.json.viewports must include a mobile width (<= ${MOBILE_MAX}); got [${viewports.join(', ')}]`);
  }
  if (!numericViewports.some(v => v >= DESKTOP_MIN)) {
    p(`reference.json.viewports must include a desktop width (>= ${DESKTOP_MIN}); got [${viewports.join(', ')}]`);
  }

  const modes = Array.isArray(ref.modes) ? ref.modes : [];
  if (!(modes.includes('light') && modes.includes('dark'))) {
    if (!darkDerived) {
      p(`reference.json.modes must contain both "light" and "dark" unless page-map.theme.darkDerived is true; got [${modes.join(', ')}]`);
    }
  }

  const refPages = Array.isArray(ref.pages) ? ref.pages : [];
  const refByPage = new Map(refPages.map(r => [r && r.page, r]));

  // every page-map page needs a reference entry (kind "none" excepted)
  if (topKind !== 'none') {
    for (const page of pages) {
      if (page && page.file && !refByPage.has(page.file)) {
        p(`page "${page.file}" has no entry in reference.json`);
      }
    }
  }

  // dangling paths — a reference that does not exist on disk is worse than none,
  // because Phase 8 would skip it silently and report a pass.
  let checkedTargets = 0;
  for (const entry of refPages) {
    if (!entry || !entry.page) { p('reference.json.pages[] entry is missing "page"'); continue; }
    const kind = entry.kind || topKind;
    if (!REFERENCE_KINDS.includes(kind)) {
      p(`reference.json page "${entry.page}" has invalid kind "${kind}"`);
      continue;
    }
    // A page cannot opt OUT of having a reference while the pack claims to have one — that is how
    // a pack ends up validating with zero targets actually checked.
    if (kind === 'none') {
      if (topKind !== 'none') {
        p(`reference.json page "${entry.page}" declares kind "none" but the pack kind is "${topKind}" — a page cannot opt out of verification`);
      }
      continue;
    }

    if (kind === 'url') {
      if (!entry.url) p(`reference.json page "${entry.page}" (kind=url) is missing "url"`);
      else if (!/^https?:\/\//i.test(entry.url)) p(`reference.json page "${entry.page}" url "${entry.url}" is not http(s)`);
      else checkedTargets++;
      continue;
    }

    if (kind === 'html') {
      if (!entry.path) { p(`reference.json page "${entry.page}" (kind=html) is missing "path"`); continue; }
      if (!isContained(dir, entry.path)) {
        p(`reference.json page "${entry.page}" path escapes the spec-pack: ${entry.path}`);
        continue;
      }
      const abs = join(dir, entry.path);
      if (!existsSync(abs)) p(`reference.json page "${entry.page}" points at a missing file: ${entry.path}`);
      else if (statSync(abs).size === 0) p(`reference.json page "${entry.page}" reference file is empty: ${entry.path}`);
      else checkedTargets++;
      continue;
    }

    if (kind === 'image') {
      const shots = entry.shots || {};
      const keys = Object.keys(shots);
      if (!keys.length) { p(`reference.json page "${entry.page}" (kind=image) has no "shots"`); continue; }
      for (const k of keys) {
        if (!isContained(dir, shots[k])) {
          p(`reference.json page "${entry.page}" shot "${k}" escapes the spec-pack: ${shots[k]}`);
          continue;
        }
        const abs = join(dir, shots[k]);
        if (!existsSync(abs)) p(`reference.json page "${entry.page}" shot "${k}" points at a missing file: ${shots[k]}`);
        else if (statSync(abs).size === 0) p(`reference.json page "${entry.page}" shot "${k}" is empty: ${shots[k]}`);
        else checkedTargets++;
      }
    }
  }
  stats.checkedTargets = checkedTargets;

  // ── provenance.json ─────────────────────────────────────────────────────────
  try {
    const prov = readJson(join(dir, 'provenance.json'));
    if (!prov.adapter) p('provenance.json.adapter is missing');
    if (!prov.source) p('provenance.json.source is missing');
    if (!prov.generatedAt) p('provenance.json.generatedAt is missing');
    stats.adapter = prov.adapter;
  } catch (e) {
    p(`provenance.json is not valid JSON: ${e.message}`);
  }

  return { ok: problems.length === 0, problems, stats };
}

/**
 * Write the spec-pack skeleton (page-map + reference.json + provenance.json) into `dir`.
 * design-spec.md is produced separately by make-design-spec.mjs.
 *
 * REFUSES to overwrite an existing pack unless `force` is set. Every `from-*.md` tells the
 * operator to hand-fill the palette, `sections[]` and the per-page shots — a re-run of the adapter
 * (a retried crawl, a second pass) would otherwise silently delete exactly that work.
 *
 * @throws {Error} when the target already holds a pack and `force` is false.
 */
export function initSpecPack(dir, { pageMap, kind = 'html', adapter = 'unknown', source = {}, viewports, modes, pages, force = false } = {}) {
  const existing = ['page-map.json', 'reference.json', 'provenance.json']
    .filter(f => existsSync(join(dir, f)));
  if (existing.length && !force) {
    throw new Error(
      `spec-pack already exists at ${dir} (${existing.join(', ')}). ` +
      `Re-running would discard any hand-completed palette, sections[] or shots. ` +
      `Pass --force to overwrite, or point --out at a new directory.`,
    );
  }

  mkdirSync(join(dir, 'reference'), { recursive: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });

  // pageMap's own `reference`/`provenance` keys are not authoritative — this function owns them.
  const map = { ...pageMap, reference: 'reference.json', provenance: 'provenance.json' };
  writeFileSync(join(dir, 'page-map.json'), JSON.stringify(map, null, 2) + '\n');

  const reference = {
    kind,
    viewports: viewports ?? [1440, 768, 390],
    modes: modes ?? ['light', 'dark'],
    pages: pages ?? (pageMap.pages ?? []).map(p => ({ page: p.file })),
  };
  writeFileSync(join(dir, 'reference.json'), JSON.stringify(reference, null, 2) + '\n');

  // Preserve established site facts even when an input adapter is rerun with --force.
  if (!existsSync(join(dir, 'content-contract.json'))) {
    writeFileSync(join(dir, 'content-contract.json'), JSON.stringify({
      schemaVersion: 1, id: pageMap.template?.name || 'site', revision: 1,
      mode: null, language: null, identity: {}, voice: [], sources: {}, facts: {},
      surfaces: (pageMap.pages || []).map(page => ({ id: page.file, purpose: '', requiredFacts: [] })),
      pending: ['Establish the site facts and demo/customer mode before authoring content'],
    }, null, 2) + '\n');
  }

  if (!existsSync(join(dir, 'design-contract.json'))) {
    writeFileSync(join(dir, 'design-contract.json'), JSON.stringify({
      schemaVersion: 1, id: pageMap.template?.name || 'site', revision: 1,
      source: {}, theme: {}, variants: [], tokens: {}, rules: [], coverage: [],
      pages: [], pilotPages: [], exceptions: [], pending: ['Measure the authoritative style guide and map the page matrix'],
    }, null, 2) + '\n');
  }

  const provenance = {
    adapter,
    adapterVersion: '1.0',
    source,
    generatedAt: new Date().toISOString(),
    tools: { node: process.version },
    notes: [],
  };
  writeFileSync(join(dir, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');

  return { dir, reference, provenance };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function usage() {
  console.error('usage:');
  console.error('  spec-pack.mjs --validate <spec-pack-dir>');
  console.error('  spec-pack.mjs --init <spec-pack-dir> --page-map <file> [--kind html|url|image|none] [--adapter <name>]');
  process.exit(2);
}

// Detecting "was I run directly?" is deceptively easy to get wrong, and getting it wrong here is
// catastrophic rather than cosmetic: the CLI block silently does not run, `--validate` exits 0
// printing nothing, and the one gate the whole pipeline depends on is indistinguishable from a
// pass. Two independent traps, both hit in practice:
//   1. `new URL(import.meta.url).pathname` stays percent-encoded — any path containing a space,
//      '#' or a non-ASCII character never matches argv[1].
//   2. ESM resolves import.meta.url through symlinks; argv[1] is left as typed. On macOS /tmp is a
//      symlink to /private/tmp, and — worse — INSTALL.md's recommended install symlinks the skill
//      into ~/.claude/skills, so the documented setup was itself broken.
// Comparing realpaths defeats both.
function isMainModule() {
  if (!process.argv[1]) return false;
  const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
  return real(process.argv[1]) === real(fileURLToPath(import.meta.url));
}
const isMain = isMainModule();
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };

  if (args.includes('--validate')) {
    const dir = flag('--validate');
    if (!dir) usage();
    if (!existsSync(dir)) { console.error(`spec-pack dir not found: ${dir}`); process.exit(2); }

    const { ok, problems, stats } = validateSpecPack(dir);
    if (ok) {
      console.log(`spec-pack OK — ${stats.pageCount} pages, kind=${stats.kind}, ${stats.checkedTargets} reference target(s) checked, adapter=${stats.adapter}`);
      process.exit(0);
    }
    console.error(`spec-pack INVALID — ${problems.length} problem(s):`);
    for (const m of problems) console.error(`  - ${m}`);
    process.exit(1);
  }

  if (args.includes('--init')) {
    const dir = flag('--init');
    const pmPath = flag('--page-map');
    if (!dir || !pmPath) usage();
    let res;
    try {
      res = initSpecPack(dir, {
        pageMap: readJson(pmPath),
        kind: flag('--kind') || 'html',
        adapter: flag('--adapter') || 'unknown',
        source: { path: pmPath },
        force: args.includes('--force'),
      });
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    console.error(`initialised spec-pack at ${res.dir} (kind=${res.reference.kind})`);
    console.error('next: node scripts/make-design-spec.mjs page-map.json --out design-spec.md, resolve every `TODO` slot, then --validate');
    process.exit(0);
  }

  usage();
}
