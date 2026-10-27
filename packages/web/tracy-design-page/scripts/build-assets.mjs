/**
 * The 152 systems, as static files the public page serves (ADR 0011 §A2). Copies from
 * `vendor/tracy/od-design-system` into `public/` so Vite ships them under `/design-inspiration/`:
 *
 *   public/data/catalog.json              the rows the gallery lists (id · name · category · nav · hero · dark)
 *   public/data/artifact-slots/<type>.json the shared slot map of each sample product
 *   public/systems/<id>/slots.json         that system's slot map, split out of the vendored slots.json
 *   public/systems/<id>/components.html    the fixture, tokens.css, DESIGN.md, system/artifacts/*.html
 *   public/data/manifest.json              { vendorCommit, count, builtAt } — what this build was cut from
 *
 * Runs before every `vite build` / `vite dev`, and `--check` compares instead of writing so a gate
 * can say when the copy drifted from vendor (the same shape as `check-od-slots`).
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { brandFromSystem } from '../../../design/tracy-design-inspiration/src/host/library-brand.mjs'
import { slotsOf } from '../../../../scripts/lib/od-slots-dom.mjs'
import { buildBrandSystem, renderTypography } from '../../../../vendor/tracy/od-brand-engine/dist/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const repo = path.join(root, '..', '..', '..')
const vendor = path.join(repo, 'vendor', 'tracy', 'od-design-system')
const artifactSlotsFile = path.join(
  repo,
  'packages',
  'design',
  'tracy-design-inspiration',
  'src',
  'host',
  'artifact-slots.json'
)
const out = path.join(root, 'public')
const CHECK = process.argv.includes('--check')

/** The files of one system the page serves; anything else stays in vendor. */
const FILES = ['components.html', 'tokens.css', 'DESIGN.md']
const ARTIFACT_DIR = path.join('system', 'artifacts')
/**
 * The seven sample products, built here with the brand engine the way the lane's host builds them
 * (`libraryArtifacts` in the design-inspiration host): upstream ships one 6 KB skeleton per kind,
 * the engine builds the full landing, deck, poster… a customer's own brand gets. Prebuilt once at
 * build time, they are the same bytes on the page and on every lane — and an engine fix is one
 * `build-assets` + one deploy, not a plugin release (tasks/todo-thu-vien-mot-cho.md §7a).
 */
const ARTIFACT_KINDS = ['landing', 'deck', 'poster', 'email', 'newsletter', 'form', 'typography']

/** @param {{ id: string, name: string, category: string, tokensCss: string, designMd: string }} system */
function artifactsOf(system) {
  const brand = brandFromSystem(system)
  const built = buildBrandSystem(brand, { slug: system.id })
  const out = {}
  for (const kind of ARTIFACT_KINDS) {
    if (kind === 'typography') {
      out[kind] = renderTypography(brand, built.themes.default, { designMd: system.designMd })
      continue
    }
    const file = built.files[`artifacts/${kind}.html`]
    if (typeof file === 'string') out[kind] = file
  }
  return out
}

function json(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** `dark.json` says whether the dark override is enough for a fixture; absent = true (older vendor). */
function darkOf(dark, id) {
  const entry = dark?.systems?.[id]
  return entry && typeof entry === 'object' && 'safe' in entry ? Boolean(entry.safe) : true
}

function plan() {
  const catalog = json(path.join(vendor, 'catalog.json'))
  const slots = json(path.join(vendor, 'slots.json'))
  const darkFile = path.join(vendor, 'dark.json')
  const dark = existsSync(darkFile) ? json(darkFile) : null
  const rows = []
  const files = new Map()
  for (const s of catalog.systems ?? []) {
    if (!s || typeof s.id !== 'string') continue
    const dir = path.join(vendor, 'systems', s.id)
    if (!existsSync(path.join(dir, 'components.html')))
      throw new Error(`${s.id}: catalog names it but components.html is missing`)
    rows.push({
      id: s.id,
      name: s.name,
      category: s.category,
      nav: s.nav ?? 'top-left',
      hero: s.hero ?? 'split',
      dark: darkOf(dark, s.id)
    })
    for (const f of FILES) {
      const src = path.join(dir, f)
      if (existsSync(src)) files.set(path.join('systems', s.id, f), { copy: src })
    }
    const read = (f) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), 'utf8') : '')
    const artifacts = artifactsOf({
      id: s.id,
      name: s.name,
      category: s.category,
      tokensCss: read('tokens.css'),
      designMd: read('DESIGN.md')
    })
    for (const [kind, html] of Object.entries(artifacts)) {
      files.set(path.join('systems', s.id, ARTIFACT_DIR, `${kind}.html`), { text: html })
      // The slot map of THIS artifact, measured on the built document — the lane's host used to
      // measure it at serve time; one measurement at build time is the same numbers everywhere.
      files.set(path.join('systems', s.id, 'artifact-slots', `${kind}.json`), {
        text: `${JSON.stringify({ slots: slotsOf(html, []) })}\n`
      })
    }
    files.set(path.join('systems', s.id, 'slots.json'), {
      text: `${JSON.stringify({ slots: slots.systems?.[s.id]?.slots ?? [] })}\n`
    })
  }
  const artifactSlots = json(artifactSlotsFile)
  for (const [type, value] of Object.entries(artifactSlots.artifacts ?? {})) {
    files.set(path.join('data', 'artifact-slots', `${type}.json`), {
      text: `${JSON.stringify({ slots: value })}\n`
    })
  }
  // The commit the library was cut from: the design systems, the engine that built the artifacts,
  // and the builder itself — any of the three moving is a new library.
  //
  // 🔒 `%H` CUT TO A FIXED LENGTH, NOT `%h` — 15/09/2026. `%h` abbreviates to however many characters
  // THIS clone needs to be unambiguous, which depends on how many objects the clone holds. Two CI
  // runners gave `1d7f861f9` and `1d7f861f` for the same commit, the built `dist/` differed, and the
  // web image rebuilt and restarted on a push that changed nothing it contains (the app workflow
  // keys the image on the built bytes). Same trap, same fix as `--short=8` in both image workflows.
  let vendorCommit = 'unknown'
  try {
    vendorCommit = execFileSync(
      'git',
      [
        '-C',
        repo,
        'log',
        '-1',
        '--format=%H',
        '--',
        'vendor/tracy/od-design-system',
        'vendor/tracy/od-brand-engine',
        'packages/web/tracy-design-page/scripts/build-assets.mjs',
        'packages/design/tracy-design-inspiration/src/host/library-brand.mjs'
      ],
      { encoding: 'utf8' }
    )
      .trim()
      .slice(0, 12)
  } catch {
    // not a git checkout (the CI runner's _work, a tarball)
  }
  // `library` names where the files are and which commit they are: the same field the lane's
  // host adds to its catalog, so the shared client reads both the same way. Relative on purpose —
  // the page's own address, wherever the page is served.
  files.set(path.join('data', 'catalog.json'), {
    text: `${JSON.stringify({ count: rows.length, systems: rows, library: { url: '/design-inspiration', commit: vendorCommit } })}\n`
  })
  return { rows, files, vendorCommit }
}

function contentOf(entry) {
  return entry.copy !== undefined ? readFileSync(entry.copy) : Buffer.from(entry.text, 'utf8')
}

const { rows, files, vendorCommit } = plan()

if (CHECK) {
  const drifted = []
  for (const [rel, entry] of files) {
    const target = path.join(out, rel)
    if (!existsSync(target) || !contentOf(entry).equals(readFileSync(target))) drifted.push(rel)
  }
  if (drifted.length > 0) {
    console.error(
      `build-assets --check: ${drifted.length} file(s) differ from vendor — run \`pnpm --filter @tracy/design-page build:assets\`:`
    )
    for (const rel of drifted.slice(0, 12)) console.error(`  ${rel}`)
    process.exit(1)
  }
  console.log(`build-assets --check: ${files.size} files match vendor (${rows.length} systems)`)
  process.exit(0)
}

rmSync(path.join(out, 'systems'), { recursive: true, force: true })
rmSync(path.join(out, 'data'), { recursive: true, force: true })
let bytes = 0
for (const [rel, entry] of files) {
  const target = path.join(out, rel)
  mkdirSync(path.dirname(target), { recursive: true })
  if (entry.copy !== undefined) cpSync(entry.copy, target)
  else writeFileSync(target, entry.text)
  bytes += statSync(target).size
}
mkdirSync(path.join(out, 'data'), { recursive: true })
writeFileSync(
  path.join(out, 'data', 'manifest.json'),
  `${JSON.stringify({ vendorCommit, count: rows.length, builtAt: new Date().toISOString() }, null, 2)}\n`
)
console.log(
  `build-assets: ${rows.length} systems, ${files.size} files, ${(bytes / 1024 / 1024).toFixed(1)} MB → public/`
)
