#!/usr/bin/env node
/**
 * Generate the per-design-system half of the `tracy` block theme and zip it.
 *
 * `src/tracy/` is ONE WordPress block theme. Which of the 152 OpenDesign design systems it wears
 * is a style variation — WordPress's own mechanism: `styles/<id>.json` files the Site Editor lists
 * and `tracy_apply_inspiration()` writes into the site's global styles. Each variation is the
 * system's 56 tokens partitioned into what WordPress has a preset for (colour, font family, font
 * size, spacing, layout width) and `settings.custom` for the rest, with `var(--x)` references in
 * values rewritten to the WordPress variable that now carries x. Same generated + gated shape as
 * `scripts/build-od-slots.mjs`: one script writes, `--check` compares and refuses a stale tree.
 *
 * Outputs (relative to src/tracy):
 *   styles/<id>.json        one variation per system (from its tokens.css)
 *   inspirations.json       id -> { name, category, nav, hero, dark } for functions.php
 *   style.css               the committed file with its Version line stamped from package.json
 *   dist/tracy-<version>.zip  (+ dist/tracy.zip, stable name for dev/verify.sh)
 *
 * A second TARGET is a standalone theme derived from the same source: `overlays/<slug>/` holds a
 * `theme.config.json` (slug, names, text domain, the subset of design systems it ships) plus any
 * file that overrides or adds to `src/tracy/`. Its output tree `src/<slug>/` is generated whole —
 * every non-generated file of `src/tracy/` copied byte for byte (PHP files with the `'tracy'` text
 * domain of their translation calls rewritten to the target's), overlay files on top, and the
 * generated files for ONLY the listed systems — and committed under the same convention. With a
 * `rootVariation`, its `theme.json` is generated too: the source theme.json with its presets and
 * `custom` replaced by that system's variation, so the default look needs no hand-authored token;
 * an optional `theme.overlay.json` is then deep-merged on top, restricted to what a target may
 * add (styles, templates, parts, patterns, `settings.custom.tracy` — see THEME_OVERLAY_KEYS).
 * One generator, one gate: the default target keeps its shape exactly.
 *
 * Every target's `inc/update.php` names the theme it updates: `updateSlug` from theme.config.json
 * (default: the slug) is written into its TRACY_UPDATE_SLUG, manifest path and transient key by
 * `renderUpdate()` from the one reviewed `src/tracy/inc/update.php` (pinned by UPDATE_SOURCE_SHA256);
 * an overlay copy is accepted only when it is exactly such a rendering, and anything else stops the
 * build (see UPDATE_FILE).
 *
 * A target may declare its own `version` in theme.config.json (x.y.z, optionally -pre): its
 * style.css and zip carry it instead of package.json's, so one theme can ship a release without
 * moving every other target to a new version. Omitted means package.json's version.
 *
 * The zip does not carry the modes of the working tree: a worktree created under umask 077 holds
 * 0600 files and 0700 directories, and a theme zipped from it is unreadable to the web server once
 * extracted as another user (JA Vega 1.1.1, TracyHQ/tch#511). writeThemeZip() stages the tree with
 * every file 0644 and every directory 0755 and zips the staging copy.
 *
 * The zip is byte-deterministic: every staged file and directory gets ONE fixed timestamp
 * (`SOURCE_DATE_EPOCH` when set, else ZIP_DEFAULT_EPOCH) and `zip` runs with TZ=UTC, so two builds of
 * the same tree give the same sha256 whatever the clock, the timezone or the source mtimes.
 *
 * A third shape of target wears a MEASURED look instead of a vendored one: `rootTokens` names a
 * tokens.css inside the overlay (the same 56-name schema every vendored system declares, written
 * by the skill's `theme-tokens.mjs` from a design contract), read by the same `tokensOf()` and
 * turned into the root theme.json by the same `variationOf()`. It ships as `styles/<slug>.json`
 * and a row of inspirations.json too, so `tracy_apply_inspiration(<slug>)`, `?style=<slug>` and
 * `tracy_site_inspiration()` keep working; its `variations` may be empty, and then no vendored
 * fixture or artifact stylesheet ships. The tokens.css itself is an overlay SOURCE: never copied
 * into the theme, never generated, and a token missing or unknown against TOKEN_NAMES stops the
 * build by name.
 *
 * Usage:  node scripts/build.mjs            # writes the files above and the zip
 *         node scripts/build.mjs --check    # exits 1 when any generated file is stale; writes nothing
 *         node scripts/build.mjs --target tracy-base [--check]   # the same for overlays/tracy-base
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ARTIFACT_KINDS,
  ARTIFACT_WRAPPER,
  buildArtifactDocs
} from '../../tracy-cms-sections/lib/artifacts.mjs'
import { fixtureParts, scopeFixtureCss } from '../../tracy-cms-sections/lib/fixture.mjs'

// The 56-token contract and the variation maker live in lib/variation.mjs (shared with the
// WordPress Build plugin, ADR 0023); re-exported here so the tests and the gate keep one import.
import { rewriteVars, TOKEN_NAMES, tokensOf, variationOf, WP_VAR } from '../lib/variation.mjs'
import { roleReadsOf, withRoleReads } from '../lib/role-reads.mjs'

export { rewriteVars, TOKEN_NAMES, tokensOf, variationOf, WP_VAR }

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(PKG, '..', '..', '..')
const VENDOR = path.join(ROOT, 'vendor', 'tracy', 'od-design-system')
const DIST = path.join(PKG, 'dist')
const OVERLAYS = path.join(PKG, 'overlays')
const GENERATED_NOTE =
  'Generated by scripts/build.mjs from vendor/tracy/od-design-system — do not edit; rerun the build.'

/**
 * The artifact sheet a look WITHOUT its own sheet wears: a brand made at build time
 * (`uploads/tracy/styles/<id>.json`, ADR 0023) has no `assets/css/artifacts/<kind>/<id>.css`, and an
 * artifact page dequeues every other sheet, so its home page rendered unstyled (measured 30/09,
 * `dfbrandwp1`: Times New Roman, `shot` 49/100). The name is not a design-system id
 * (`^[a-z0-9-]+$`), so no system can shadow it and functions.php can tell the two apart.
 */
export const THEME_ARTIFACT_FILE = '_theme.css'

const wp = (slug) => `var(--wp--preset--color--${slug})`
const mix = (slug, pct, toward) => `color-mix(in srgb, ${wp(slug)} ${String(pct)}%, ${toward})`

/**
 * The custom properties that differ between the 152 systems' artifact sheets (everything else in a
 * sheet is the same bytes for every system), each re-expressed through the theme.json variables a
 * variation defines (`WP_VAR` of lib/variation.mjs): the contract token itself where the engine
 * copies one, a `color-mix` of it where the engine derives a shade. The shades approximate the
 * engine's palette; the tokens themselves are exact. A single `var()` keeps the source value as its
 * fallback. `unmappedVarying` keeps this table complete against the committed sheets.
 */
export const THEME_DRIVEN = Object.freeze({
  '--brand-color-primary': wp('accent'),
  '--brand-color-primary-bg': mix('accent', 10, wp('bg')),
  '--brand-color-primary-bg-hover': mix('accent', 20, wp('bg')),
  '--brand-color-primary-border': mix('accent', 35, wp('bg')),
  '--brand-color-primary-border-hover': mix('accent', 55, wp('bg')),
  '--brand-color-primary-hover': wp('accent-hover'),
  '--brand-color-primary-active': wp('accent-active'),
  '--brand-color-primary-text': mix('accent', 70, wp('fg')),
  '--brand-color-primary-contrast': wp('accent-on'),
  '--brand-color-primary-ink': wp('accent'),
  '--brand-color-info': wp('accent'),
  '--brand-color-info-bg': mix('accent', 10, wp('bg')),
  '--brand-color-info-border': mix('accent', 35, wp('bg')),
  '--brand-color-link': wp('accent'),
  '--brand-color-link-hover': wp('accent-hover'),
  '--brand-color-link-active': wp('accent-active'),
  '--brand-color-success': wp('success'),
  '--brand-color-success-bg': mix('success', 10, wp('bg')),
  '--brand-color-success-border': mix('success', 35, wp('bg')),
  '--brand-color-success-hover': mix('success', 80, wp('bg')),
  '--brand-color-success-active': mix('success', 80, wp('fg')),
  '--brand-color-warning': wp('warn'),
  '--brand-color-warning-bg': mix('warn', 10, wp('bg')),
  '--brand-color-warning-border': mix('warn', 35, wp('bg')),
  '--brand-color-warning-hover': mix('warn', 80, wp('bg')),
  '--brand-color-warning-active': mix('warn', 80, wp('fg')),
  '--brand-color-error': wp('danger'),
  '--brand-color-error-bg': mix('danger', 10, wp('bg')),
  '--brand-color-error-border': mix('danger', 35, wp('bg')),
  '--brand-color-error-hover': mix('danger', 80, wp('bg')),
  '--brand-color-error-active': mix('danger', 80, wp('fg')),
  '--brand-color-text': wp('fg'),
  '--brand-color-text-secondary': wp('fg-2'),
  '--brand-color-text-tertiary': wp('muted'),
  '--brand-color-text-quaternary': wp('meta'),
  '--brand-color-fill': mix('fg', 15, wp('bg')),
  '--brand-color-fill-secondary': mix('fg', 6, wp('bg')),
  '--brand-color-fill-tertiary': mix('fg', 4, wp('bg')),
  '--brand-color-fill-quaternary': mix('fg', 2, wp('bg')),
  '--brand-color-bg-layout': wp('surface'),
  '--brand-color-bg-container': wp('bg'),
  '--brand-color-bg-elevated': wp('surface'),
  '--brand-color-border': wp('border'),
  '--brand-color-border-secondary': wp('border-soft'),
  '--brand-font-family': 'var(--wp--preset--font-family--body)',
  '--display-family': 'var(--wp--preset--font-family--display), var(--brand-font-family)',
  '--brand-border-radius-xs': 'calc(var(--wp--custom--radius--sm) / 2)',
  '--brand-border-radius-sm': 'var(--wp--custom--radius--sm)',
  '--brand-border-radius': 'var(--wp--custom--radius--md)',
  '--brand-border-radius-lg': 'var(--wp--custom--radius--lg)',
  '--brand-primary-palette-1': mix('accent', 10, wp('bg')),
  '--brand-primary-palette-2': mix('accent', 20, wp('bg')),
  '--brand-primary-palette-3': mix('accent', 35, wp('bg')),
  '--brand-primary-palette-4': mix('accent', 55, wp('bg')),
  '--brand-primary-palette-5': mix('accent', 78, wp('bg')),
  '--brand-primary-palette-6': wp('accent'),
  '--brand-primary-palette-7': mix('accent', 85, '#000'),
  '--brand-primary-palette-8': mix('accent', 70, '#000'),
  '--brand-primary-palette-9': mix('accent', 55, '#000'),
  '--brand-primary-palette-10': mix('accent', 40, '#000')
})

const DECLARATION = /(^|[{;\s])(--[a-z0-9-]+):\s*([^;{}]+?)\s*;/g

/**
 * One system's artifact sheet with its varying properties read from the worn variation instead.
 * @param {string} css a fenced artifact sheet
 */
export function themeDrivenArtifactCss(css) {
  return css.replace(DECLARATION, (whole, lead, name, value) => {
    const driven = THEME_DRIVEN[name]
    if (driven === undefined) return whole
    const single = /^var\((--[a-z0-9-]+)\)$/.exec(driven)
    return `${lead}${name}: ${single && name !== '--display-family' ? `var(${single[1]}, ${value})` : driven};`
  })
}

/**
 * The custom properties whose value differs between the given sheets and that `THEME_DRIVEN` does
 * not map — each one would reach a brand as some other system's value, silently.
 * @param {string[]} sheets
 */
export function unmappedVarying(sheets) {
  /** @type {Map<string, Set<string>>} */
  const seen = new Map()
  for (const css of sheets)
    for (const [, , name, value] of css.matchAll(DECLARATION)) {
      if (!seen.has(name)) seen.set(name, new Set())
      seen.get(name)?.add(value)
    }
  return [...seen]
    .filter(([name, values]) => values.size > 1 && !(name in THEME_DRIVEN))
    .map(([name]) => name)
    .sort()
}

/** The theme every other target derives from: its `src/tracy/` is hand-written plus generated. */
export const DEFAULT_TARGET = 'tracy'
/** The text domain the source theme's translation calls carry; a target rewrites it to its own. */
const SOURCE_TEXT_DOMAIN = 'tracy'
/**
 * The navigation and hero layouts functions.php knows (TRACY_NAVS / TRACY_HEROS); the first of
 * each is its default. A measured target names its own in theme.config.json, a vendored system
 * carries them in catalog.json.
 */
export const NAVS = Object.freeze(['top-left', 'top-centered', 'brand-centered', 'sidebar', 'overlay'])
export const HEROS = Object.freeze(['split', 'centered', 'cover', 'stack'])
/**
 * The theme's self-updater. It names the theme three ways — the slug WordPress passes as the
 * update's stylesheet, the manifest path in the distribution repository, and the transient key
 * of its cache — and all three are derived from the target's `updateSlug` by renderUpdate().
 */
export const UPDATE_FILE = 'inc/update.php'
/** A release version a target may declare: x.y.z without leading zeros, optionally -prerelease. */
export const TARGET_VERSION_SHAPE =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/
/** The modes every zip member is written with, whatever the working tree holds. */
export const ZIP_FILE_MODE = 0o644
export const ZIP_DIR_MODE = 0o755
/** A theme directory name: lowercase words joined by single dashes. */
const UPDATE_SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** The declaration renderUpdate() sets, as the reviewed source writes it for 'tracy'. */
const UPDATE_SLUG_LINE = "const TRACY_UPDATE_SLUG = 'tracy';"
/**
 * sha256 of the reviewed src/tracy/inc/update.php. Every target's updater is rendered from exactly
 * this file (renderUpdate), so changing the file means reviewing it and changing this digest.
 */
export const UPDATE_SOURCE_SHA256 = '24d2e746640ae4217f4bf4c7dfea623f6d0babdd66c899bbd3d1345f12d5c418'
/** The catalogue category a measured look is filed under in inspirations.json. */
const MEASURED_CATEGORY = 'Measured'
/**
 * A WordPress translation call whose domain argument is the source theme's. Only the domain is
 * replaced — never a class, option, hook or function name, which are shared by design (one theme
 * is active at a time, and the text domain is the one string WordPress keys per theme).
 */
export const TEXT_DOMAIN_CALL =
  /\b(__|_e|_x|_n|esc_html__|esc_html_e|esc_html_x|esc_attr__|esc_attr_e|esc_attr_x)\(\s*((?:'[^']*'|"[^"]*"))\s*,\s*'tracy'\s*\)/g

/**
 * Whether a path under a theme tree is written by this generator (as opposed to hand-written and,
 * for a second target, copied from the source theme).
 * @param {string} rel - posix-relative path inside the theme
 */
export function isGenerated(rel) {
  return (
    rel === 'style.css' ||
    rel === 'inspirations.json' ||
    /^styles\/[^/]+\.json$/.test(rel) ||
    /^assets\/css\/fixtures\/[^/]+$/.test(rel) ||
    /^assets\/css\/artifacts\/[^/]+\/[^/]+$/.test(rel)
  )
}

/**
 * Every file under a directory, posix-relative and sorted; Finder droppings skipped (the zip
 * excludes them too).
 * @param {string} dir
 * @returns {string[]}
 */
export function walk(dir) {
  const out = []
  const visit = (rel) => {
    for (const entry of readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue
      const next = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(next)
      else out.push(next)
    }
  }
  visit('')
  return out.sort()
}

/**
 * The slugs that have an overlay: one `overlays/<slug>/theme.config.json` each. No list to keep
 * in step — adding a directory is adding a target.
 * @param {string} [overlaysDir]
 */
export function overlayTargets(overlaysDir = OVERLAYS) {
  if (!existsSync(overlaysDir)) return []
  return readdirSync(overlaysDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(overlaysDir, e.name, 'theme.config.json')))
    .map((e) => e.name)
    .sort()
}

/**
 * Where a target reads from and writes to. The default target has no overlay and no `only` list;
 * any other must have `overlays/<slug>/theme.config.json` naming at least one design system in
 * `variations` — or a `rootTokens` file, with which `variations` may be empty.
 * @param {string} slug
 * @param {{ pkgDir?: string }} [opts]
 * @returns {{ slug: string, srcDir: string, overlayDir: string | null, baseDir: string,
 *   variations: string[] | null, rootVariation: string | null, rootTokens: string | null,
 *   roleReads: Record<string, string | { keep: string } | { colour: string }> | null,
 *   nav: string, hero: string, textDomain: string, themeName: string, updateSlug: string,
 *   version: string | null }}
 */
export function targetOf(slug, { pkgDir = PKG } = {}) {
  const srcDir = path.join(pkgDir, 'src', slug)
  const baseDir = path.join(pkgDir, 'src', DEFAULT_TARGET)
  if (slug === DEFAULT_TARGET) {
    return {
      slug,
      srcDir,
      overlayDir: null,
      baseDir,
      variations: null,
      rootVariation: null,
      rootTokens: null,
      roleReads: null,
      nav: NAVS[0],
      hero: HEROS[0],
      textDomain: SOURCE_TEXT_DOMAIN,
      themeName: 'Tracy',
      updateSlug: slug,
      version: null
    }
  }
  const overlayDir = path.join(pkgDir, 'overlays', slug)
  const configPath = path.join(overlayDir, 'theme.config.json')
  if (!existsSync(configPath)) throw new Error(`target ${slug}: no overlays/${slug}/theme.config.json`)
  const configLabel = `target ${slug}: overlays/${slug}/theme.config.json`
  let config
  try {
    config = JSON.parse(readRegularFile(configPath, configLabel).toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${configLabel}: ${error.message}`)
    throw error
  }
  if (!isRecord(config)) throw new Error(`${configLabel}: must be a JSON object`)
  if (config.slug !== slug)
    throw new Error(`target ${slug}: theme.config.json says slug ${String(config.slug)}`)
  const rootTokens = config.rootTokens ?? null
  if (rootTokens !== null && (typeof rootTokens !== 'string' || !/^[A-Za-z0-9._-]+$/.test(rootTokens)))
    throw new Error(`target ${slug}: rootTokens must name a file inside overlays/${slug}/`)
  if (rootTokens !== null && !existsSync(path.join(overlayDir, rootTokens)))
    throw new Error(`target ${slug}: rootTokens overlays/${slug}/${rootTokens} is missing`)
  if (!Array.isArray(config.variations) || (config.variations.length === 0 && rootTokens === null))
    throw new Error(`target ${slug}: theme.config.json lists no variations`)
  for (const key of ['themeName', 'textDomain']) {
    if (typeof config[key] !== 'string' || config[key] === '')
      throw new Error(`target ${slug}: theme.config.json has no ${key}`)
  }
  const rootVariation = config.rootVariation ?? null
  if (rootVariation !== null && rootTokens !== null)
    throw new Error(`target ${slug}: rootVariation and rootTokens are mutually exclusive`)
  if (rootVariation !== null && !config.variations.includes(rootVariation))
    throw new Error(`target ${slug}: rootVariation ${String(rootVariation)} is not one of its variations`)
  const nav = config.nav ?? NAVS[0]
  if (!NAVS.includes(nav))
    throw new Error(`target ${slug}: nav ${String(nav)} is not one of ${NAVS.join(', ')}`)
  const hero = config.hero ?? HEROS[0]
  if (!HEROS.includes(hero))
    throw new Error(`target ${slug}: hero ${String(hero)} is not one of ${HEROS.join(', ')}`)
  // Omitted means the slug; declared means exactly that value, or the build stops — never 'tracy'.
  const updateSlug = 'updateSlug' in config ? config.updateSlug : slug
  if (typeof updateSlug !== 'string' || !UPDATE_SLUG_SHAPE.test(updateSlug))
    throw new Error(
      `${configLabel}: updateSlug ${JSON.stringify(updateSlug) ?? String(updateSlug)} is not a theme directory name (lowercase words joined by dashes)`
    )
  // Omitted means package.json's version; declared means exactly that shape, or the build stops.
  const version = 'version' in config ? config.version : null
  if ('version' in config && (typeof version !== 'string' || !TARGET_VERSION_SHAPE.test(version)))
    throw new Error(
      `${configLabel}: version ${JSON.stringify(version) ?? String(version)} is not a release version (x.y.z or x.y.z-pre)`
    )
  // Contract tokens of the root look read through a design-system role variable (lib/role-reads.mjs).
  const roleReads = roleReadsOf(config.roleReads, configLabel)
  if (roleReads && rootVariation === null && rootTokens === null)
    throw new Error(`${configLabel}: roleReads needs a root look (rootVariation or rootTokens)`)
  return {
    slug,
    srcDir,
    overlayDir,
    baseDir,
    variations: [...config.variations],
    rootVariation,
    rootTokens,
    roleReads,
    nav,
    hero,
    textDomain: config.textDomain,
    themeName: config.themeName,
    updateSlug,
    version
  }
}

/**
 * Whether anything stands at `rel` under `root`, asked of the path itself rather than of a file
 * listing: a listing names only files, so a directory (even an empty one) standing where a build
 * input belongs would read as "absent" and be skipped. Every ancestor below `root` must be a real
 * directory (a symlinked `inc/` would smuggle in a file from elsewhere); whatever stands at the
 * path is then the caller's to refuse or read, e.g. through readRegularFile.
 * @param {string} root
 * @param {string} rel - POSIX path relative to root
 * @param {string} label - for the error message
 */
function entryAt(root, rel, label) {
  const parts = rel.split('/')
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('/')
    let stat
    try {
      stat = lstatSync(path.join(root, sub))
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return false
      throw new Error(`${label}/${sub}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (i < parts.length && !stat.isDirectory()) throw new Error(`${label}/${sub}: not a directory`)
  }
  return true
}

/**
 * The bytes of a build input that must be a regular file: a directory, symlink or FIFO is refused
 * by name before anything reads it (a FIFO would hang the build; a symlink would ship whatever it
 * points at).
 * @param {string} abs
 * @param {string} label - for the error message
 */
function readRegularFile(abs, label) {
  let stat
  try {
    stat = lstatSync(abs)
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!stat.isFile()) throw new Error(`${label}: not a regular file`)
  return readFileSync(abs)
}

/**
 * The updater a target ships: `src/tracy/inc/update.php` with its three names of the theme set to
 * `updateSlug` — the TRACY_UPDATE_SLUG declaration, the manifest path (`wordpress/theme/update.json`
 * for `tracy`, `wordpress/theme/<slug>/update.json` for any other, in the constant and the comment
 * naming it) and the site-transient key (`<slug with underscores>_theme_update`).
 *
 * No PHP is parsed. The source must be byte for byte the reviewed file UPDATE_SOURCE_SHA256 pins,
 * so every other line of it — each `theme` answer, each stylesheet comparison, each call — is code
 * a person read, and the substitutions below are exact strings of that file. Editing the updater
 * means reviewing that the three names are still the only places it names the theme, then setting
 * the new digest; until then the build stops.
 * @param {string} source - src/tracy/inc/update.php as read
 * @param {string} updateSlug
 * @param {string} [label] - for the error message
 */
export function renderUpdate(source, updateSlug, label = UPDATE_FILE) {
  if (typeof updateSlug !== 'string' || !UPDATE_SLUG_SHAPE.test(updateSlug))
    throw new Error(`${label}: updateSlug ${JSON.stringify(updateSlug)} is not a theme directory name`)
  const digest = createHash('sha256').update(source).digest('hex')
  if (digest !== UPDATE_SOURCE_SHA256)
    throw new Error(
      `${label}: is not the reviewed updater (sha256 ${digest}, expected ${UPDATE_SOURCE_SHA256}); review that TRACY_UPDATE_SLUG, the manifest path and the transient key are still the only places it names the theme, then set UPDATE_SOURCE_SHA256 in scripts/build.mjs`
    )
  const manifest =
    updateSlug === DEFAULT_TARGET
      ? 'wordpress/theme/update.json'
      : `wordpress/theme/${updateSlug}/update.json`
  return source
    .replace(UPDATE_SLUG_LINE, `const TRACY_UPDATE_SLUG = '${updateSlug}';`)
    .replaceAll('wordpress/theme/update.json', manifest)
    .replaceAll("'tracy_theme_update'", `'${updateSlug.replace(/-/g, '_')}_theme_update'`)
}

/**
 * Which updateSlug an overlay's own `inc/update.php` was rendered for: it must be exactly
 * renderUpdate(source, <slug>) for the slug its TRACY_UPDATE_SLUG line names — an overlay copy of a
 * generated tree, never a second updater. Anything else throws; the updater has one source.
 * @param {string} php - the overlay file
 * @param {string} source - src/tracy/inc/update.php
 * @param {(php: string) => string} finish - what the build does to the rendered file after (text domain)
 * @param {string} label
 */
function renderedSlugOf(php, source, finish, label) {
  for (const [, slug] of php.matchAll(/^const TRACY_UPDATE_SLUG = '([a-z0-9-]+)';$/gm))
    if (UPDATE_SLUG_SHAPE.test(slug) && finish(renderUpdate(source, slug, label)) === php) return slug
  throw new Error(
    `${label}: is not src/${DEFAULT_TARGET}/${UPDATE_FILE} rendered for any updateSlug; the updater has one source — edit that one, or delete this copy`
  )
}

/**
 * Rewrite the text domain of every translation call in a PHP source.
 * @param {string} php
 * @param {string} domain
 */
export function retargetTextDomain(php, domain) {
  return php.replace(TEXT_DOMAIN_CALL, (call) => call.replace(/'tracy'(\s*\)$)/, `'${domain}'$1`))
}

/**
 * The source theme.json wearing one variation as its default look: the palette, font families,
 * font sizes, spacing sizes, layout sizes and `custom` come from the variation; every other key
 * (schema, version, styles, templates, the `default*` switches) stays as written.
 * @param {Record<string, any>} base - parsed src/tracy/theme.json
 * @param {ReturnType<typeof variationOf>} variation
 */
export function rootThemeJson(base, variation) {
  const s = base.settings ?? {}
  const v = variation.settings
  return {
    ...base,
    settings: {
      ...s,
      layout: { ...s.layout, contentSize: v.layout.contentSize, wideSize: v.layout.wideSize },
      color: { ...s.color, palette: v.color.palette },
      typography: {
        ...s.typography,
        fontFamilies: v.typography.fontFamilies,
        fontSizes: v.typography.fontSizes
      },
      spacing: { ...s.spacing, spacingSizes: v.spacing.spacingSizes },
      custom: v.custom
    }
  }
}

/** The file an overlay uses to add to its generated theme.json; never copied into the theme. */
export const THEME_OVERLAY_FILE = 'theme.overlay.json'
export const OVERLAY_META_FILES = new Set(['theme.config.json', THEME_OVERLAY_FILE, 'patterns.map.json'])

/**
 * What `theme.overlay.json` may carry, as paths. Everything a target legitimately adds on top of
 * the common theme.json — its own styles (including `styles.css`), page templates, template parts,
 * pattern registrations, and its own keys under `settings.custom.tracy`. The tokens (palette,
 * fonts, sizes, spacing, layout) are the root variation's and stay out of reach: an overlay that
 * could set `settings.color.palette` would silently undo `rootVariation`, so any other key is a
 * build error rather than a merge.
 */
export const THEME_OVERLAY_KEYS = Object.freeze([
  ['styles'],
  ['customTemplates'],
  ['templateParts'],
  ['patterns'],
  ['settings', 'custom', 'tracy']
])

/** Whether `keyPath` sits under one of the allowed paths (or is a prefix of one, like `settings`). */
function overlayKeyAllowed(keyPath) {
  return THEME_OVERLAY_KEYS.some((allowed) => {
    const n = Math.min(allowed.length, keyPath.length)
    for (let i = 0; i < n; i += 1) if (allowed[i] !== keyPath[i]) return false
    return true
  })
}

/** Plain object, not an array. */
const isRecord = (x) => typeof x === 'object' && x !== null && !Array.isArray(x)

/**
 * Deep-merge an overlay's theme.json fragment onto a generated theme.json. Objects merge key by
 * key; an array whose entries carry a `name` (customTemplates, templateParts, patterns are all
 * lists of named entries) merges BY NAME — an overlay entry replaces the base entry of the same
 * name and a new name is appended, so a target can retitle one template without restating the
 * list; any other array or scalar (a `styles.css` string, say) is replaced by the overlay's.
 * A key outside THEME_OVERLAY_KEYS throws, naming its path.
 * @param {Record<string, any>} base - the generated theme.json
 * @param {Record<string, any>} overlay - parsed theme.overlay.json
 * @param {string} [label] - for the error message
 */
export function mergeThemeOverlay(base, overlay, label = THEME_OVERLAY_FILE) {
  if (!isRecord(overlay)) throw new Error(`${label}: must be a JSON object`)
  const merge = (into, from, keyPath) => {
    const out = { ...into }
    for (const [key, value] of Object.entries(from)) {
      const here = [...keyPath, key]
      if (!overlayKeyAllowed(here)) {
        throw new Error(
          `${label}: key ${here.join('.')} is not allowed (only ${THEME_OVERLAY_KEYS.map((k) => k.join('.')).join(', ')})`
        )
      }
      const current = out[key]
      if (isRecord(value) && isRecord(current)) out[key] = merge(current, value, here)
      else if (
        Array.isArray(value) &&
        Array.isArray(current) &&
        value.every((e) => isRecord(e) && typeof e.name === 'string')
      ) {
        const merged = [...current]
        for (const entry of value) {
          const at = merged.findIndex((e) => isRecord(e) && e.name === entry.name)
          if (at === -1) merged.push(entry)
          else merged[at] = entry
        }
        out[key] = merged
      } else out[key] = value
    }
    return out
  }
  return merge(base, overlay, [])
}

/**
 * Everything the build would write, in memory. Without `target` (or with the default one) this is
 * the generated half of `src/tracy/`; with another target it is that theme's WHOLE tree: copied
 * source files (Buffers, byte for byte), overlay files, and the generated files for its systems.
 * @param {{ vendorDir: string, srcDir: string, version: string, target?: ReturnType<typeof targetOf> }} opts
 * @returns {{ files: Map<string, string | Buffer>, ids: string[] }}
 */
export function plan({ vendorDir, srcDir, version, target }) {
  const catalog = JSON.parse(readFileSync(path.join(vendorDir, 'catalog.json'), 'utf8'))
  if (!Array.isArray(catalog.systems)) throw new Error('catalog.json has no systems[]')
  if (catalog.count !== catalog.systems.length) {
    throw new Error(
      `catalog.json count ${String(catalog.count)} disagrees with its ${String(catalog.systems.length)} rows`
    )
  }
  const darkPath = path.join(vendorDir, 'dark.json')
  const dark = existsSync(darkPath) ? (JSON.parse(readFileSync(darkPath, 'utf8')).systems ?? {}) : {}

  const files = new Map()
  const systems = {}
  const variations = {}
  let rows = [...catalog.systems].sort((a, b) => (a.id < b.id ? -1 : 1))
  const only = target?.variations ?? null
  if (only) {
    const known = new Set(rows.map((r) => r.id))
    const unknown = only.filter((id) => !known.has(id))
    if (unknown.length > 0)
      throw new Error(`target ${target.slug}: ${unknown.join(', ')} not in catalog.json`)
    rows = rows.filter((r) => only.includes(r.id))
  }
  /** @type {Record<string, string> | null} the first system's artifact sheets (default target only) */
  let firstArtifacts = null
  for (const row of rows) {
    // tokens.css, not design-tokens.json: the JSON twin is missing from some systems, the CSS is in all 152.
    const tokensPath = path.join(vendorDir, 'systems', row.id, 'tokens.css')
    if (!existsSync(tokensPath))
      throw new Error(`${row.id}: catalog names it but systems/${row.id}/tokens.css is missing`)
    const own = tokensOf(readFileSync(tokensPath, 'utf8'))
    // Every look a target ships (its root and its listed style variations) reads its mapped tokens
    // through their role variables, its own values as the fallbacks.
    const tokens = target?.roleReads
      ? withRoleReads(own, target.roleReads, `target ${target.slug} ${row.id}`)
      : own
    let variation
    try {
      variation = variationOf(tokens, { id: row.id, name: row.name })
    } catch (error) {
      throw new Error(`${row.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
    variations[row.id] = variation
    files.set(`styles/${row.id}.json`, `${JSON.stringify(variation, null, 2)}\n`)
    // The system's own fixture stylesheet, fenced under .tracy-fixture and carrying its own
    // custom properties on the wrapper, so it needs no rewrite to WordPress variables.
    const fixturePath = path.join(vendorDir, 'systems', row.id, 'components.html')
    if (existsSync(fixturePath)) {
      const parts = fixtureParts(readFileSync(fixturePath, 'utf8'))
      files.set(
        `assets/css/fixtures/${row.id}.css`,
        `/* ${row.id} — components.html of OpenDesign, fenced. ${GENERATED_NOTE} */\n${scopeFixtureCss(parts.css)}`
      )
    }
    // The engine's page artifacts (landing, form, typography), same engine version as the preview
    // host, each fenced under .tracy-artifact: the page kind `artifact`.
    const designPath = path.join(vendorDir, 'systems', row.id, 'DESIGN.md')
    const docs = buildArtifactDocs({
      id: row.id,
      name: row.name,
      category: row.category,
      tokensCss: readFileSync(tokensPath, 'utf8'),
      designMd: existsSync(designPath) ? readFileSync(designPath, 'utf8') : ''
    })
    for (const kind of ARTIFACT_KINDS) {
      files.set(
        `assets/css/artifacts/${kind}/${row.id}.css`,
        `/* ${row.id} — ${kind} artifact of the brand engine, fenced. ${GENERATED_NOTE} */\n${scopeFixtureCss(fixtureParts(docs[kind]).css, ARTIFACT_WRAPPER)}`
      )
    }
    if (!target?.overlayDir && firstArtifacts === null)
      firstArtifacts = Object.fromEntries(
        ARTIFACT_KINDS.map((k) => [k, files.get(`assets/css/artifacts/${k}/${row.id}.css`)])
      )
    systems[row.id] = {
      name: row.name,
      category: row.category,
      nav: row.nav,
      hero: row.hero,
      dark: dark[row.id]?.safe === true
    }
  }
  // A measured look: the overlay's tokens.css becomes the target's own variation, listed under
  // its slug so functions.php can name it (apply it, preview it, read it back from the merged
  // global styles). No fixture or artifact stylesheet: those are a vendored system's.
  if (target?.rootTokens) {
    const label = `target ${target.slug}: overlays/${target.slug}/${target.rootTokens}`
    const tokens = tokensOf(readFileSync(path.join(target.overlayDir, target.rootTokens), 'utf8'))
    const missing = TOKEN_NAMES.filter((n) => typeof tokens[n] !== 'string')
    if (missing.length > 0) throw new Error(`${label}: missing ${missing.join(', ')}`)
    const unknown = Object.keys(tokens).filter((n) => !TOKEN_NAMES.includes(n))
    if (unknown.length > 0)
      throw new Error(
        `${label}: ${unknown.join(', ')} not among the ${String(TOKEN_NAMES.length)} contract tokens`
      )
    if (target.slug in systems) throw new Error(`${label}: ${target.slug} is also a vendored system`)
    let variation
    try {
      variation = variationOf(withRoleReads(tokens, target.roleReads, label), {
        id: target.slug,
        name: target.themeName
      })
    } catch (error) {
      throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
    variations[target.slug] = variation
    files.set(`styles/${target.slug}.json`, `${JSON.stringify(variation, null, 2)}\n`)
    systems[target.slug] = {
      name: target.themeName,
      category: MEASURED_CATEGORY,
      nav: target.nav,
      hero: target.hero,
      dark: false
    }
  }
  // The sheet a look without its own wears (a brand, `THEME_ARTIFACT_FILE`): the first system's,
  // its varying properties reading the worn variation. The default theme only — a quickstart
  // target ships its own looks, each with its sheet.
  if (firstArtifacts !== null)
    for (const kind of ARTIFACT_KINDS) {
      const unmapped = unmappedVarying(
        [...files]
          .filter(([rel]) => rel.startsWith(`assets/css/artifacts/${kind}/`))
          .map(([, css]) => String(css))
      )
      if (unmapped.length > 0)
        throw new Error(
          `${kind} artifacts: ${unmapped.join(', ')} differ between systems and have no theme mapping (THEME_DRIVEN)`
        )
      files.set(
        `assets/css/artifacts/${kind}/${THEME_ARTIFACT_FILE}`,
        `/* theme-driven ${kind} artifact: the sheet of a look with none of its own (a brand), its varying properties read from the worn variation. ${GENERATED_NOTE} */\n${themeDrivenArtifactCss(String(firstArtifacts[kind]).replace(/^\/\*.*?\*\/\n/, ''))}`
      )
    }
  files.set(
    'inspirations.json',
    `${JSON.stringify({ schemaVersion: 'tracy-wp-inspirations/v1', note: GENERATED_NOTE, systems }, null, 2)}\n`
  )
  const overlayDir = target?.overlayDir ?? null
  // The default target does not write its hand-written updater, so it is checked in place.
  if (target && !overlayDir) {
    const label = `target ${target.slug}: src/${target.slug}/${UPDATE_FILE}`
    const php = readRegularFile(path.join(target.srcDir, UPDATE_FILE), label).toString('utf8')
    if (renderUpdate(php, target.updateSlug, label) !== php)
      throw new Error(`${label}: does not name updateSlug ${target.updateSlug}`)
  }
  if (overlayDir) {
    // The updater is settled before either tree is listed (#471): walk() descends into whatever
    // stands at a path, so a directory at inc/update.php would have its entries read — a FIFO
    // among them hangs the build. Both paths must be a regular file (the overlay's may be absent)
    // before anything under them is opened.
    const sourceLabel = `target ${target.slug}: src/${DEFAULT_TARGET}/${UPDATE_FILE}`
    entryAt(target.baseDir, UPDATE_FILE, `target ${target.slug}: src/${DEFAULT_TARGET}`)
    const source = readRegularFile(path.join(target.baseDir, UPDATE_FILE), sourceLabel).toString('utf8')
    const overlayLabel = `target ${target.slug}: overlays/${target.slug}/${UPDATE_FILE}`
    const own = entryAt(overlayDir, UPDATE_FILE, `target ${target.slug}: overlays/${target.slug}`)
      ? readRegularFile(path.join(overlayDir, UPDATE_FILE), overlayLabel).toString('utf8')
      : null
    // (a) the source theme, minus what this build generates; PHP gets the target's text domain.
    const rootId = target.rootVariation ?? (target.rootTokens ? target.slug : null)
    for (const rel of walk(target.baseDir)) {
      // The updater is rendered below, never copied.
      if (isGenerated(rel) || (rootId && rel === 'theme.json') || rel === UPDATE_FILE) continue
      const bytes = readFileSync(path.join(target.baseDir, rel))
      files.set(
        rel,
        rel.endsWith('.php') ? retargetTextDomain(bytes.toString('utf8'), target.textDomain) : bytes
      )
    }
    // (b) the overlay: same path wins, a new path is added. Its style.css is the header stamped below.
    for (const rel of walk(overlayDir)) {
      // Overlay metadata drives the build and never ships: the target config, the theme.json
      // overlay, and the seeder's field map (patterns.map.json documents the patterns; the theme
      // itself does not read it).
      if (OVERLAY_META_FILES.has(rel) || rel === UPDATE_FILE) continue
      // The measured tokens are a source too: theme.json and styles/<slug>.json carry them.
      if (rel === target.rootTokens) continue
      if (isGenerated(rel) && rel !== 'style.css')
        throw new Error(`target ${target.slug}: overlays/${target.slug}/${rel} is a generated path`)
      if (rootId && rel === 'theme.json')
        throw new Error(
          `target ${target.slug}: theme.json is generated from ${target.rootTokens ? 'rootTokens' : 'rootVariation'}, the overlay may not carry one`
        )
      files.set(rel, readFileSync(path.join(overlayDir, rel)))
    }
    // The updater names THIS theme (#471): rendered from the one reviewed source for updateSlug. An
    // overlay copy may stand only if it is such a rendering already; it never replaces the source.
    const finish = (php) => retargetTextDomain(php, target.textDomain)
    files.set(UPDATE_FILE, finish(renderUpdate(source, target.updateSlug, sourceLabel)))
    if (own !== null) renderedSlugOf(own, source, finish, overlayLabel)
    if (!files.has('style.css'))
      throw new Error(`target ${target.slug}: overlays/${target.slug}/style.css is missing`)
    // (c) theme.json wearing the root look — a vendored variation or the measured tokens — when
    // the target names one.
    if (rootId) {
      const base = JSON.parse(readFileSync(path.join(target.baseDir, 'theme.json'), 'utf8'))
      files.set('theme.json', `${JSON.stringify(rootThemeJson(base, variations[rootId]), null, 2)}\n`)
    }
    // (d) the overlay's theme.overlay.json, merged onto whatever theme.json now stands — after the
    // root variation, so the target's own styles, templates, parts and patterns land on top of
    // the generated tokens and never under them. Restricted keys: see THEME_OVERLAY_KEYS.
    const overlayJsonPath = path.join(overlayDir, THEME_OVERLAY_FILE)
    if (existsSync(overlayJsonPath)) {
      const label = `target ${target.slug}: overlays/${target.slug}/${THEME_OVERLAY_FILE}`
      let fragment
      try {
        fragment = JSON.parse(readFileSync(overlayJsonPath, 'utf8'))
      } catch (error) {
        throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      }
      const current = JSON.parse(files.get('theme.json').toString('utf8'))
      files.set('theme.json', `${JSON.stringify(mergeThemeOverlay(current, fragment, label), null, 2)}\n`)
    }
  }
  // (d) the header with its Version line stamped: the committed src/tracy/style.css, or the overlay's.
  const styleCss = overlayDir
    ? files.get('style.css').toString('utf8')
    : readFileSync(path.join(srcDir, 'style.css'), 'utf8')
  if (!/^Version: .*$/m.test(styleCss)) throw new Error('style.css has no Version line')
  files.set('style.css', styleCss.replace(/^Version: .*$/m, `Version: ${version}`))
  return { files, ids: Object.keys(systems) }
}

/**
 * Planned files that differ from disk, plus orphans: variations (and fixtures, artifacts) on disk
 * that no system produced — or, when `everything` is set, ANY file on disk the plan did not
 * write, because a second target's tree is generated whole and owns no hand-written file.
 * @param {Map<string, string | Buffer>} files
 * @param {string} srcDir
 * @param {{ everything?: boolean }} [opts]
 */
export function stale(files, srcDir, { everything = false } = {}) {
  const report = []
  for (const [rel, content] of files) {
    const abs = path.join(srcDir, rel)
    if (!existsSync(abs) || !readFileSync(abs).equals(Buffer.from(content))) report.push(rel)
  }
  if (everything) {
    if (existsSync(srcDir)) for (const rel of walk(srcDir)) if (!files.has(rel)) report.push(rel)
    return report
  }
  for (const [dirRel, ext] of [
    ['styles', '.json'],
    ['assets/css/fixtures', '.css'],
    ...ARTIFACT_KINDS.map((k) => [`assets/css/artifacts/${k}`, '.css'])
  ]) {
    const dir = path.join(srcDir, dirRel)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      const rel = `${dirRel}/${name}`
      if (name.endsWith(ext) && !files.has(rel)) report.push(rel)
    }
  }
  return report
}

/** 1980-01-02 00:00:00 UTC: the earliest a ZIP can hold is 1980-01-01, a day of slack covers any zone. */
export const ZIP_DEFAULT_EPOCH = 315619200
const ZIP_MIN_EPOCH = 315532800
const ZIP_MAX_EPOCH = 4354819198

/**
 * The one timestamp every zip member carries: `env.SOURCE_DATE_EPOCH` (integer seconds) when set,
 * else ZIP_DEFAULT_EPOCH; floored to an even second (ZIP stores two-second resolution). A value that
 * is not an integer or lies outside what a ZIP can represent stops the build — never a fallback.
 * @param {Record<string, string | undefined>} [env]
 * @returns {number}
 */
export function zipEpoch(env = process.env) {
  const raw = env.SOURCE_DATE_EPOCH
  if (raw === undefined || raw === '') return ZIP_DEFAULT_EPOCH
  if (!/^\d{1,12}$/.test(raw))
    throw new Error(`zip: SOURCE_DATE_EPOCH=${raw} is not an integer number of seconds`)
  const n = Number(raw)
  if (n < ZIP_MIN_EPOCH || n > ZIP_MAX_EPOCH)
    throw new Error(
      `zip: SOURCE_DATE_EPOCH=${raw} is outside what a ZIP can hold (${String(ZIP_MIN_EPOCH)}..${String(ZIP_MAX_EPOCH)})`
    )
  return n - (n % 2)
}

/**
 * Zip the theme tree `<srcRoot>/<slug>` into `zipPath` with one top-level folder named after the
 * slug, every file 0644 and every directory 0755 whatever the tree's own modes (Finder droppings
 * skipped). The tree is staged in a fresh directory first (explicit chmod, so the process umask
 * cannot narrow a mode) and only regular files and directories are taken: anything else under the
 * tree stops the zip by name. Every staged entry carries `zipEpoch()` (directories stamped after
 * their children). Returns the staged member list, `dir/` entries included.
 * @param {{ srcRoot: string, slug: string, zipPath: string, scratch?: string, epoch?: number }} opts
 * @returns {string[]}
 */
export function writeThemeZip({
  srcRoot,
  slug,
  zipPath,
  scratch = process.env.TRACY_WP_TEST_SCRATCH || tmpdir(),
  epoch = zipEpoch()
}) {
  const tree = path.join(srcRoot, slug)
  if (!existsSync(tree) || !lstatSync(tree).isDirectory()) throw new Error(`zip: ${tree} is not a directory`)
  // A zip left from an earlier build never survives a failed one.
  if (existsSync(zipPath)) rmSync(zipPath)
  const stage = mkdtempSync(path.join(scratch, 'tracy-theme-zip-'))
  const members = []
  try {
    const copy = (from, to, rel) => {
      mkdirSync(to)
      chmodSync(to, ZIP_DIR_MODE)
      members.push(`${rel}/`)
      for (const e of readdirSync(from, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        if (e.name === '.DS_Store') continue
        const src = path.join(from, e.name)
        const dst = path.join(to, e.name)
        const st = lstatSync(src)
        if (st.isDirectory()) copy(src, dst, `${rel}/${e.name}`)
        else if (st.isFile()) {
          writeFileSync(dst, readFileSync(src))
          chmodSync(dst, ZIP_FILE_MODE)
          utimesSync(dst, epoch, epoch)
          members.push(`${rel}/${e.name}`)
        } else throw new Error(`zip: ${rel}/${e.name} is neither a regular file nor a directory`)
      }
      utimesSync(to, epoch, epoch)
    }
    copy(tree, path.join(stage, slug), slug)
    execFileSync('zip', ['-qrX', zipPath, slug], { cwd: stage, env: { ...process.env, TZ: 'UTC' } })
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
  return members
}

function main() {
  const check = process.argv.includes('--check')
  const flag = process.argv.indexOf('--target')
  const slug = flag === -1 ? DEFAULT_TARGET : (process.argv[flag + 1] ?? '')
  if (slug === '' || slug.startsWith('--')) throw new Error('--target needs a slug')
  const target = targetOf(slug)
  const version = target.version ?? JSON.parse(readFileSync(path.join(PKG, 'package.json'), 'utf8')).version
  const { files, ids } = plan({ vendorDir: VENDOR, srcDir: target.srcDir, version, target })
  const rel = (p) => path.relative(ROOT, p)
  const buildCmd =
    slug === DEFAULT_TARGET
      ? 'pnpm --filter @tracy/wordpress-theme build'
      : `pnpm --filter @tracy/wordpress-theme build -- --target ${slug}`

  if (check) {
    const report = stale(files, target.srcDir, { everything: target.overlayDir !== null })
    if (report.length > 0) {
      for (const file of report) console.error(`build: ${rel(target.srcDir)}/${file} is stale`)
      console.error(`build: run \`${buildCmd}\`.`)
      process.exit(1)
    }
    console.log(
      `build: ${slug}: ${String(ids.length)} design systems, generated files match the vendor library.`
    )
    return
  }

  for (const [file, content] of files) {
    const abs = path.join(target.srcDir, file)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  mkdirSync(DIST, { recursive: true })
  const zipPath = path.join(DIST, `${slug}-${version}.zip`)
  // One top-level folder named after the theme slug, as WordPress expects; modes normalised.
  writeThemeZip({ srcRoot: path.join(PKG, 'src'), slug, zipPath })
  const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' })
  const entries = listing.split('\n').map((line) => line.trim().split(/\s+/).pop() ?? '')
  for (const must of ['style.css', 'theme.json', 'templates/index.html', 'functions.php']) {
    if (!entries.includes(`${slug}/${must}`)) throw new Error(`zip: ${slug}/${must} is missing`)
  }
  // The zip holds as many variations, fixtures and artifacts as the plan wrote — 152 of each
  // kind ×3 for the default target, and none of the last two for a target with no vendored system.
  const inside = (re) =>
    entries.filter((e) => e.startsWith(`${slug}/`) && re.test(e.slice(slug.length + 1))).length
  const planned = (re) => [...files.keys()].filter((f) => re.test(f)).length
  for (const [what, re] of [
    ['variations', /^styles\/[^/]+\.json$/],
    ['fixture files', /^assets\/css\/fixtures\/[^/]+\.css$/],
    ['artifact files', /^assets\/css\/artifacts\/[^/]+\/[^/]+\.css$/]
  ]) {
    if (inside(re) !== planned(re))
      throw new Error(`zip: ${String(inside(re))} ${what}, expected ${String(planned(re))}`)
  }
  if (ids.length === 0) throw new Error('zip: no design system at all')
  copyFileSync(zipPath, path.join(DIST, `${slug}.zip`))
  const bytes = readFileSync(zipPath).length
  console.log(
    `build: ${slug}: ${String(ids.length)} design systems → ${rel(zipPath)} (${String(Math.round(bytes / 1024))} KB)`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
