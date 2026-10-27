#!/usr/bin/env node
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
/**
 * Bundle the seeder for a lane: one `dist/seed.mjs` (esbuild, node, everything inlined — the plan,
 * the fill rules, the engine, linkedom), `dist/seed-joomla.php`, and `dist/data/` with what a plan
 * needs of the vendored library (the 152 systems' `components.html`, `tokens.css`, `DESIGN.md`,
 * `catalog.json`, `slots.json`) and the section library's fragments with its `regions.json`. `stage-cms-seeder.sh`
 * copies `dist/` into the image next to the theme zips as `/opt/tracy/cms/seeder/`.
 */
import { build } from 'esbuild'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG = path.resolve(HERE, '..')
const ROOT = path.resolve(PKG, '../../..')
const DIST = path.join(PKG, 'dist')
const VENDOR = path.join(ROOT, 'vendor/tracy/od-design-system')

// The Claude Cowork plugin pin records hashes extracted from its verified ZIP. Refuse a seeder/profile drift.
const PROVISION = path.join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/provision')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
// Driven by what the pin DECLARES, not by a constant: a profile directory may grow (the
// multilingual work adds a fourth file), and a fixed three-name list would keep passing while the
// new file shipped unpinned. `scripts/check-design-templates.ts` is what makes `contractFiles` the
// complete manifest of a profile; this loop then checks every name it declares.
const profileHash = (profile, name) =>
  createHash('sha256')
    .update(readFileSync(path.join(CONTRACTS, profile, name)))
    .digest('hex')

// The WordPress contracts are authored beside the Joomla ones and ship the same way; a WordPress
// entry has no Claude Cowork plugin pin (the plugin is installed at provision, never below `coworkMinVersion`),
// so for it the check is that the contract it names exists here at all.
const WP_CONTRACTS = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')

const quickstarts = JSON.parse(readFileSync(path.join(PROVISION, 'quickstarts.json'), 'utf8'))
for (const entry of Object.values(quickstarts)) {
  if (!entry.contract) continue
  if (entry.platform === 'wordpress') {
    for (const name of ['manifest.json', 'content-map.json', 'presentation-lock.json'])
      if (!existsSync(path.join(WP_CONTRACTS, entry.contract, name)))
        throw new Error(`WordPress quickstart contract missing: ${entry.contract}/${name}`)
    // Since Claude Cowork plugin 0.12.1 a WordPress quickstart pins its Claude Cowork plugin too, and the profile the zip
    // carries must be the one shipped here — same rule as Joomla below, same failure otherwise.
    for (const [name, sha] of Object.entries(entry.cowork?.contractFiles ?? {}))
      if (
        sha !==
        createHash('sha256')
          .update(readFileSync(path.join(WP_CONTRACTS, entry.contract, name)))
          .digest('hex')
      )
        throw new Error(`Seeder/cowork contract mismatch: ${entry.contract}/${name}`)
    continue
  }
  const declared = Object.keys(entry.cowork?.contractFiles ?? {})
  if (!declared.length) throw new Error(`Cowork pin names no contract files: ${entry.contract}`)
  for (const name of declared) {
    if (entry.cowork.contractFiles[name] !== profileHash(entry.contract, name))
      throw new Error(`Seeder/cowork contract mismatch: ${entry.contract}/${name}`)
  }
}

// One base archive serves several designs now, and a site built with a second design is bound to a
// SECOND profile — one the check above never looks at, because `quickstarts.json` names only the
// base's own. The seeder reads whichever profile the Claude Cowork plugin reports, so a design whose profile is
// not in this repo is a seeder that plans against bytes nobody reviewed.
const designs = JSON.parse(readFileSync(path.join(PROVISION, 'design-templates.json'), 'utf8'))
for (const [id, design] of Object.entries(designs.designs)) {
  const declared = Object.keys(design.contractFiles ?? {})
  if (!declared.length) throw new Error(`Design names no contract files: ${id}`)
  for (const name of declared) {
    if (design.contractFiles[name] !== profileHash(design.contractProfile, name))
      throw new Error(`Seeder/design contract mismatch: ${id} → ${design.contractProfile}/${name}`)
  }
}

rmSync(DIST, { recursive: true, force: true })
mkdirSync(path.join(DIST, 'data', 'systems'), { recursive: true })

const bundled = await build({
  entryPoints: [path.join(PKG, 'bin/seed.mjs')],
  outfile: path.join(DIST, 'seed.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
  },
  logLevel: 'warning',
  // Asked for by `dsh-image-inputs.test.mjs`, which proves every file this bundle reads is an input
  // the dsh image fingerprint declares. Off otherwise: the metafile is not shipped.
  metafile: Boolean(process.env.TRACY_SEEDER_BUNDLE_INPUTS)
})
if (process.env.TRACY_SEEDER_BUNDLE_INPUTS) {
  writeFileSync(
    process.env.TRACY_SEEDER_BUNDLE_INPUTS,
    JSON.stringify(Object.keys(bundled.metafile.inputs).map((p) => path.resolve(p)))
  )
}

copyFileSync(path.join(PKG, 'php/seed-joomla.php'), path.join(DIST, 'seed-joomla.php'))
cpSync(
  path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts'),
  path.join(DIST, 'data', 'quickstart-contracts'),
  { recursive: true }
)
// Merged into the same tree: `<design>/wp7/<version>` beside `<design>/j6/<version>`.
// `inventory.json` (the capture the generators read, ~900 KB per profile) and `navigation-source.json`
// (the raw navigation markup the showcase map is computed from) stay out of the image: nothing at
// seed time reads them.
const GENERATOR_INPUTS = new Set(['inventory.json', 'navigation-source.json'])
cpSync(WP_CONTRACTS, path.join(DIST, 'data', 'quickstart-contracts'), {
  recursive: true,
  filter: (src) => !GENERATOR_INPUTS.has(path.basename(src))
})

// The translations a quickstart ships for its OWN demo copy. `--add-language` reuses them for any
// slot the customer has not rewritten, so a five-language site costs five model calls for the
// handful of strings they did write rather than 778 for strings the package already translated.
// A quickstart without this directory simply has none, and the seeder falls back to the model.
const JOOMLA_TRANSLATIONS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/translations')
if (existsSync(JOOMLA_TRANSLATIONS))
  cpSync(JOOMLA_TRANSLATIONS, path.join(DIST, 'data', 'quickstart-translations'), { recursive: true })

let systems = 0
for (const id of readdirSync(path.join(VENDOR, 'systems'))) {
  const dir = path.join(VENDOR, 'systems', id)
  if (!existsSync(path.join(dir, 'components.html'))) continue
  const out = path.join(DIST, 'data', 'systems', id)
  mkdirSync(out, { recursive: true })
  for (const f of ['components.html', 'tokens.css', 'DESIGN.md']) {
    if (existsSync(path.join(dir, f))) copyFileSync(path.join(dir, f), path.join(out, f))
  }
  systems++
}
for (const f of ['catalog.json', 'slots.json']) copyFileSync(path.join(VENDOR, f), path.join(DIST, 'data', f))
// The fragments the seeder pours words into, WITHOUT the `<!-- tracy:section {…} -->` marker each
// source carries on line 2 (it describes the section for the build and the README; a customer's
// page must not carry it). `regions.json` rides beside them: the library's own manifest — order,
// kind, class, what each holds — generated by the sections build, so a reader here needs no copy.
const SECTIONS = path.join(ROOT, 'packages/cms/tracy-cms-sections')
mkdirSync(path.join(DIST, 'data', 'sections'), { recursive: true })
for (const f of readdirSync(path.join(SECTIONS, 'sections'))) {
  if (!f.endsWith('.html')) continue
  const lines = readFileSync(path.join(SECTIONS, 'sections', f), 'utf8').split('\n')
  if (/^<!-- tracy:section \{.*\} -->$/.test(lines[1] ?? '')) lines.splice(1, 1)
  writeFileSync(path.join(DIST, 'data', 'sections', f), lines.join('\n'))
}
copyFileSync(path.join(SECTIONS, 'regions.json'), path.join(DIST, 'data', 'sections', 'regions.json'))

for (const platform of ['wordpress', 'joomla']) {
  const file = path.join(DIST, `seed-${platform}`)
  writeFileSync(
    file,
    // `$0` is followed to its real file before its directory is taken. The image installs these
    // wrappers under /opt/tracy/cms as SYMLINKS into the seeder directory, and `dirname "$0"` on a
    // symlink answers where the LINK sits — /opt/tracy/cms — where there is no seed.mjs. The Joomla
    // build measured 08/09 died there with `Cannot find module /opt/tracy/cms/seed.mjs` while the
    // WordPress one ran, because somebody had already hand-patched that one wrapper on one lane.
    `#!/bin/sh\n# tracy-site-build's seed door for ${platform}: the bundled seeder, with the data beside it.\nhere=$(CDPATH= cd -- "$(dirname -- "$(readlink -f -- "$0" 2>/dev/null || echo "$0")")" && pwd)\nexec node "$here/seed.mjs" --platform ${platform} "$@"\n`,
    { mode: 0o755 }
  )
}

console.log(`build: seed.mjs, seed-joomla.php, ${systems} systems and the sections under dist/`)
