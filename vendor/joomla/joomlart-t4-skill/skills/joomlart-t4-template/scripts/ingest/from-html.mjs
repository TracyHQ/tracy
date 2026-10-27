#!/usr/bin/env node
// from-html.mjs — HTML bundle (or raw HTML folder) → spec-pack.
//
// Wraps the validated parser in ../lib/html-bundle.mjs and lays out the five spec-pack artifacts.
// Emits kind: "html" references — both sides are real DOM, so Phase 8 can diff computed styles
// numerically instead of eyeballing screenshots.
//
// Usage:
//   node scripts/ingest/from-html.mjs <bundle-or-folder> --out <spec-pack-dir> [--single] [--force]
//
// See references/inputs/from-html.md. The parser is deliberately conservative: it will NOT
// invent a dark palette or decompose pages into ACM sections — those are yours to complete
// before the pack validates.

import { cp, mkdir, readdir, stat, copyFile } from 'node:fs/promises';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep, dirname, extname } from 'node:path';
import { parseBundle } from '../lib/html-bundle.mjs';
import { initSpecPack } from './spec-pack.mjs';
import { buildSiteModel } from './site-model.mjs';

const args = process.argv.slice(2);
const single = args.includes('--single');
const outIdx = args.indexOf('--out');
const out = outIdx === -1 ? null : args[outIdx + 1];
const src = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--out');

if (!src || !out) {
  console.error('usage: from-html.mjs <bundle-or-folder> --out <spec-pack-dir> [--single] [--force]');
  process.exit(2);
}
if (!existsSync(src)) {
  console.error(`source not found: ${src}`);
  process.exit(2);
}

if (!statSync(src).isDirectory()) {
  console.error(`source must be a directory, not a file: ${src}`);
  process.exit(2);
}

const hasManifest = !single && existsSync(join(src, 'manifest.json'));
const shape = hasManifest ? 'A (manifest bundle)' : 'B (raw folder)';

// ── parse ─────────────────────────────────────────────────────────────────────
let pageMap;
try {
  pageMap = await parseBundle(src, { single });
} catch (e) {
  console.error(`could not parse ${shape} at ${src}: ${e.message}`);
  if (e instanceof SyntaxError) console.error('  manifest.json is not valid JSON — fix it, or pass --single to ignore it');
  process.exit(2);
}

// ── copy the reference pages ──────────────────────────────────────────────────
// Shape A keeps pages under pages/ and assets under assets/; shape B is flat.
await mkdir(join(out, 'reference'), { recursive: true });
await mkdir(join(out, 'assets'), { recursive: true });

const pagesDir = hasManifest ? join(src, 'pages') : src;
const refDir = resolve(out, 'reference');
const copied = [];

/**
 * `page.file` comes from an untrusted manifest. Without this, a crafted `"../../../x.html"`
 * writes outside --out, silently overwriting whatever is there.
 * Returns the resolved absolute path, or null if it escapes `root`.
 */
function contained(root, rel) {
  const base = resolve(root);
  const target = resolve(base, rel);
  return (target === base || target.startsWith(base + sep)) ? target : null;
}

for (const page of pageMap.pages ?? []) {
  const from = contained(pagesDir, page.file);
  const to = contained(refDir, page.file);
  if (!from || !to) {
    console.error(`ERROR: page "${page.file}" resolves outside the bundle or the spec-pack — refusing to copy it`);
    continue;
  }
  if (!existsSync(from)) {
    console.error(`WARNING: page-map lists "${page.file}" but it is not on disk — Phase 8 will have nothing to diff it against`);
    continue;
  }
  await mkdir(dirname(to), { recursive: true });   // nested page names (blog/post.html) are legal
  await copyFile(from, to);
  copied.push(page.file);
}

// Assets: shape A has an assets/ tree; shape B has loose css/js/images beside the html.
if (existsSync(join(src, 'assets'))) {
  await cp(join(src, 'assets'), join(out, 'assets'), { recursive: true });
} else {
  // copy sibling css/js/image files so the reference pages still render standalone
  const KEEP = new Set(['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif',
                        '.woff', '.woff2', '.ttf', '.otf', '.ico']);
  for (const entry of await readdir(src)) {
    const abs = join(src, entry);
    const info = await stat(abs).catch(() => null);
    if (!info) continue;
    if (info.isDirectory() && ['css', 'js', 'images', 'img', 'fonts', 'assets'].includes(entry.toLowerCase())) {
      await cp(abs, join(out, 'assets', entry), { recursive: true });
    } else if (info.isFile() && KEEP.has(extname(entry).toLowerCase())) {
      // keep it next to the reference pages so relative hrefs still resolve
      await copyFile(abs, join(out, 'reference', entry));
    }
  }
}

// ── lay out the pack ──────────────────────────────────────────────────────────
try {
  initSpecPack(out, {
    pageMap,
    kind: 'html',
    adapter: 'from-html',
    source: { kind: hasManifest ? 'html-bundle' : 'html-folder', path: src, shape },
    pages: copied.map(file => ({ page: file, path: `reference/${file}` })),
    force: args.includes('--force'),
  });
  // The neutral source contract (ADR 0016 of TCH), written beside the pack. Nothing downstream
  // reads it in this skill yet; the other two do, and an extra file breaks nobody.
  writeFileSync(
    join(out, 'site-model.json'),
    JSON.stringify(buildSiteModel(pageMap, { kind: 'html', origin: src }), null, 2) + '\n'
  );
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

// ── report honestly ───────────────────────────────────────────────────────────
const pal = pageMap.theme?.palette ?? {};
const gaps = [];
if (!pal.dark) gaps.push('theme.palette.dark is null — extract it, or set page-map.theme.darkDerived = true to declare it is derived in Phase 6');
if (!(pageMap.pages ?? []).some(p => Array.isArray(p.sections) && p.sections.length))
  gaps.push('no page has sections[] — decompose the home/landing stacks into ACM blocks (conversion-contract.md §4.4)');
if ((pageMap.pages ?? []).length < 12)
  gaps.push(`only ${(pageMap.pages ?? []).length} pages — extend to the 18–24 baseline (page-coverage-matrix.md tier F)`);

console.error(`from-html: shape ${shape}; ${copied.length} reference page(s) copied to ${out}/reference/`);
if (gaps.length) {
  console.error('\nThe parser cannot fill these — complete them before validating:');
  for (const g of gaps) console.error(`  - ${g}`);
}
console.error('\nnext:');
console.error(`  node scripts/make-design-spec.mjs ${join(out, 'page-map.json')} --out ${join(out, 'design-spec.md')}`);
console.error('  # resolve every `TODO` slot in design-spec.md, then:');
console.error(`  node scripts/ingest/spec-pack.mjs --validate ${out}`);
