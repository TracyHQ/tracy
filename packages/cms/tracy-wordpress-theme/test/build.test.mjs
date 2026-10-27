// Tests for the generator behind the `tracy` block theme: each vendored design system becomes one
// style variation (styles/<id>.json) whose values are the system's 56 tokens partitioned into
// WordPress's palette / font / size / spacing presets and `custom` — with `var(--x)` references
// rewritten to the WordPress variable that now carries x.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  HEROS,
  isGenerated,
  mergeThemeOverlay,
  NAVS,
  overlayTargets,
  plan,
  retargetTextDomain,
  rootThemeJson,
  stale,
  TARGET_VERSION_SHAPE,
  targetOf,
  THEME_ARTIFACT_FILE,
  THEME_DRIVEN,
  themeDrivenArtifactCss,
  unmappedVarying,
  THEME_OVERLAY_FILE,
  THEME_OVERLAY_KEYS,
  TOKEN_NAMES,
  tokensOf,
  renderUpdate,
  UPDATE_FILE,
  UPDATE_SOURCE_SHA256,
  variationOf,
  writeThemeZip,
  WP_VAR,
  ZIP_DEFAULT_EPOCH,
  ZIP_DIR_MODE,
  ZIP_FILE_MODE,
  zipEpoch
} from '../scripts/build.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(PKG, '..', '..', '..')
const VENDOR = path.join(ROOT, 'vendor', 'tracy', 'od-design-system')
const SRC = path.join(PKG, 'src', 'tracy')
const BUILD = path.join(PKG, 'scripts', 'build.mjs')

/** Fixture directories live under TRACY_WP_TEST_SCRATCH when set (else the OS tmpdir) and go when the file ends. */
const SCRATCH = process.env.TRACY_WP_TEST_SCRATCH || tmpdir()
const scratchDirs = []
function scratch(prefix) {
  mkdirSync(SCRATCH, { recursive: true })
  const dir = mkdtempSync(path.join(SCRATCH, prefix))
  scratchDirs.push(dir)
  return dir
}
after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true })
})

/** A complete token map with one value each, overridable. */
function tokens(overrides = {}) {
  const map = Object.fromEntries(TOKEN_NAMES.map((n) => [n, '1px']))
  return { ...map, ...overrides }
}

/** A tokens.css the way the vendor writes one: header comment, :root, trailing alias notes. */
function tokensCss(map) {
  const lines = Object.entries(map).map(([name, value]) => `  ${name}: ${value}; /* note */`)
  return `/* tokens.css\n * pasted as a \`:root { … }\` block into artifacts */\n:root {\n${lines.join('\n')}\n}\n@media (prefers-reduced-motion: reduce) {\n  :root {\n    --motion-fast: 0ms;\n  }\n}\n`
}

function fixtureVendor(systems) {
  const dir = scratch('od-')
  const catalog = { schemaVersion: 1, count: systems.length, systems: [] }
  const dark = { systems: {} }
  for (const s of systems) {
    mkdirSync(path.join(dir, 'systems', s.id), { recursive: true })
    writeFileSync(path.join(dir, 'systems', s.id, 'tokens.css'), tokensCss(s.tokens ?? tokens()))
    catalog.systems.push({ id: s.id, name: s.name ?? s.id, category: 'Cat', nav: 'overlay', hero: 'cover' })
    dark.systems[s.id] = { safe: s.dark ?? true }
  }
  writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(catalog))
  writeFileSync(path.join(dir, 'dark.json'), JSON.stringify(dark))
  return dir
}

test('tokens.css is read past its comments, and the first declaration of a name wins', () => {
  const map = tokensOf(tokensCss(tokens({ '--motion-fast': '90ms', '--surface-warm': 'var(--surface)' })))
  assert.equal(Object.keys(map).length, TOKEN_NAMES.length)
  assert.equal(map['--motion-fast'], '90ms')
  assert.equal(map['--surface-warm'], 'var(--surface)')
})

test('a variation partitions the contract tokens into palette, fonts, sizes, spacing, layout and custom', () => {
  const v = variationOf(
    tokens({
      '--accent': '#ffef5a',
      '--font-body': 'Arial, Helvetica, sans-serif',
      '--text-2xl': '42px',
      '--space-12': '48px',
      '--section-y-desktop': '88px',
      '--container-max': '1160px',
      '--radius-pill': '9999px'
    }),
    { name: 'Brutalism' }
  )
  assert.equal(v.version, 3)
  assert.equal(v.title, 'Brutalism')
  assert.deepEqual(
    v.settings.color.palette.find((c) => c.slug === 'accent'),
    { slug: 'accent', name: 'Accent', color: '#ffef5a' }
  )
  assert.equal(v.settings.color.palette.length, 16)
  assert.deepEqual(
    v.settings.typography.fontFamilies.find((f) => f.slug === 'body'),
    { slug: 'body', name: 'Body', fontFamily: 'Arial, Helvetica, sans-serif' }
  )
  assert.deepEqual(
    v.settings.typography.fontSizes.find((f) => f.slug === 'xxl'),
    { slug: 'xxl', name: '2XL', size: '42px' }
  )
  assert.equal(v.settings.typography.fontSizes.length, 8)
  assert.deepEqual(
    v.settings.spacing.spacingSizes.find((s) => s.slug === '12'),
    { slug: '12', name: '12', size: '48px' }
  )
  assert.equal(v.settings.layout.contentSize, '1160px')
  assert.equal(v.settings.custom.sectionY.desktop, '88px')
  assert.equal(v.settings.custom.radius.pill, '9999px')
  // No digit-bearing key under custom: WordPress would kebab `space1` into `space-1`... and worse.
  const walk = (o) => Object.entries(o).every(([k, x]) => !/\d/.test(k) && (typeof x !== 'object' || walk(x)))
  assert.ok(walk(v.settings.custom))
})

test('var() references inside values point at the WordPress variable that now carries the token', () => {
  const v = variationOf(
    tokens({
      '--accent-hover': 'color-mix(in oklab, var(--accent), black 8%)',
      '--elev-ring': '0 0 0 1px var(--border)',
      '--focus-ring': '0 0 0 3px var(--accent), 0 0 0 5px var(--surface-warm)',
      '--leading-body': 'var(--leading-tight)'
    }),
    { name: 'X' }
  )
  assert.equal(
    v.settings.color.palette.find((c) => c.slug === 'accent-hover').color,
    'color-mix(in oklab, var(--wp--preset--color--accent), black 8%)'
  )
  assert.equal(v.settings.custom.elev.ring, '0 0 0 1px var(--wp--preset--color--border)')
  assert.equal(
    v.settings.custom.focusRing,
    '0 0 0 3px var(--wp--preset--color--accent), 0 0 0 5px var(--wp--preset--color--surface-warm)'
  )
  assert.equal(v.settings.custom.leading.body, 'var(--wp--custom--leading--tight)')
})

test('a value that references a token outside the contract stops the build', () => {
  assert.throws(
    () => variationOf(tokens({ '--accent-hover': 'var(--tm-accent)' }), { name: 'X' }),
    /--tm-accent/
  )
})

test('one system in: one variation, one catalog row, the version stamped into style.css', () => {
  const vendor = fixtureVendor([{ id: 'alpha', name: 'Alpha', dark: false }])
  const { files, ids } = plan({ vendorDir: vendor, srcDir: SRC, version: '9.9.9' })
  assert.deepEqual(ids, ['alpha'])
  const v = JSON.parse(files.get('styles/alpha.json'))
  assert.equal(v.title, 'Alpha')
  assert.equal(v.settings.color.palette.length, 16)
  assert.deepEqual(JSON.parse(files.get('inspirations.json')).systems.alpha, {
    name: 'Alpha',
    category: 'Cat',
    nav: 'overlay',
    hero: 'cover',
    dark: false
  })
  assert.match(files.get('style.css'), /^Version: 9\.9\.9$/m)
  assert.match(files.get('style.css'), /^Theme Name: Tracy$/m)
})

test('a system missing a contract token stops the build and names the hole', () => {
  const t = tokens()
  delete t['--accent']
  const vendor = fixtureVendor([{ id: 'holey', tokens: t }])
  assert.throws(() => plan({ vendorDir: vendor, srcDir: SRC, version: '0.0.0' }), /holey.*--accent/)
})

test('stale lists planned files that differ from disk, and orphan variations', () => {
  const vendor = fixtureVendor([{ id: 'alpha' }])
  const { files } = plan({ vendorDir: vendor, srcDir: SRC, version: '0.0.0' })
  const out = scratch('wp-')
  mkdirSync(path.join(out, 'styles'), { recursive: true })
  writeFileSync(path.join(out, 'styles', 'alpha.json'), files.get('styles/alpha.json'))
  writeFileSync(path.join(out, 'styles', 'ghost.json'), '{}')
  const report = stale(files, out)
  assert.ok(!report.includes('styles/alpha.json'))
  assert.ok(report.includes('styles/ghost.json'))
  assert.ok(report.includes('inspirations.json'))
  assert.ok(report.includes('style.css'))
})

// ---- second target: overlays/<slug> → src/<slug>, the whole tree generated ----

/** The reviewed updater every target's inc/update.php is rendered from. */
const FIXTURE_UPDATE = readFileSync(path.join(SRC, 'inc', 'update.php'), 'utf8')

/** FIXTURE_UPDATE as a target with this updateSlug gets it: exactly its three names of the theme. */
function fixtureUpdateFor(slug) {
  return FIXTURE_UPDATE.replaceAll('wordpress/theme/update.json', `wordpress/theme/${slug}/update.json`)
    .replace("const TRACY_UPDATE_SLUG = 'tracy';", `const TRACY_UPDATE_SLUG = '${slug}';`)
    .replaceAll("'tracy_theme_update'", `'${slug.replace(/-/g, '_')}_theme_update'`)
}

/** A package tree with a two-file source theme and one overlay target, for plan() in isolation. */
function fixturePackage() {
  const pkg = scratch('pkg-')
  const src = path.join(pkg, 'src', 'tracy')
  mkdirSync(path.join(src, 'inc'), { recursive: true })
  writeFileSync(
    path.join(src, 'style.css'),
    '/*\nTheme Name: Tracy\nVersion: 0.0.0\nText Domain: tracy\n*/\n'
  )
  writeFileSync(
    path.join(src, 'theme.json'),
    JSON.stringify({
      version: 3,
      settings: { color: { defaultPalette: false, palette: [] } },
      styles: { spacing: 1 }
    })
  )
  writeFileSync(
    path.join(src, 'functions.php'),
    "<?php\n$a = __( 'Hello', 'tracy' );\nesc_html_e( \"Bye\", 'tracy' );\nregister_block_pattern_category( 'tracy', array() );\n"
  )
  writeFileSync(path.join(src, 'inc', 'keep.php'), '<?php\n// no calls\n')
  writeFileSync(path.join(src, 'inc', 'update.php'), FIXTURE_UPDATE)
  writeFileSync(path.join(src, 'screenshot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]))
  const overlay = path.join(pkg, 'overlays', 'x')
  mkdirSync(path.join(overlay, 'inc'), { recursive: true })
  writeFileSync(
    path.join(overlay, 'theme.config.json'),
    JSON.stringify({
      slug: 'x',
      themeName: 'X',
      textDomain: 'x-dom',
      variations: ['alpha', 'beta'],
      rootVariation: 'beta'
    })
  )
  writeFileSync(
    path.join(overlay, 'style.css'),
    '/*\nTheme Name: X\nVersion: 0.0.0\nText Domain: x-dom\n*/\n'
  )
  writeFileSync(path.join(overlay, 'inc', 'keep.php'), '<?php\n// overlay wins\n')
  writeFileSync(path.join(overlay, 'readme.txt'), '=== X ===\n')
  return pkg
}

test('only the domain argument of a translation call is rewritten; names sharing the word stay', () => {
  const php =
    "__( 'a', 'tracy' ); esc_html_e(\t\"b\",'tracy'); _e( 'c', 'other' ); update_option( 'tracy', 1 ); tracy_x( 'tracy' );"
  assert.equal(
    retargetTextDomain(php, 'tracy-base'),
    "__( 'a', 'tracy-base' ); esc_html_e(\t\"b\",'tracy-base'); _e( 'c', 'other' ); update_option( 'tracy', 1 ); tracy_x( 'tracy' );"
  )
})

test('generated paths are the five the default target writes; theme.json and functions.php are not', () => {
  for (const rel of [
    'style.css',
    'inspirations.json',
    'styles/apple.json',
    'assets/css/fixtures/apple.css',
    'assets/css/artifacts/form/apple.css'
  ])
    assert.ok(isGenerated(rel), rel)
  for (const rel of [
    'theme.json',
    'functions.php',
    'inc/update.php',
    'assets/css/tracy.css',
    'styles/x/y.json'
  ])
    assert.ok(!isGenerated(rel), rel)
})

test('targets are the overlay directories that carry a config, and the default has none', () => {
  assert.deepEqual(overlayTargets(), [
    'tracy-base',
    'wp-ja-diner',
    'wp-ja-essence',
    'wp-ja-fresco',
    'wp-ja-impact',
    'wp-ja-kinetic',
    'wp-ja-morgan',
    'wp-ja-nova',
    'wp-ja-restaurant',
    'wp-ja-vega',
    'wp-tracy-business'
  ])
  const base = targetOf('tracy')
  assert.equal(base.overlayDir, null)
  assert.equal(base.variations, null)
  assert.equal(base.srcDir, SRC)
  assert.throws(() => targetOf('nope'), /no overlays\/nope\/theme\.config\.json/)
})

test('the default target plans exactly what it did before targets existed', () => {
  const vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }])
  const { files, ids } = plan({ vendorDir: vendor, srcDir: SRC, version: '0.0.0', target: targetOf('tracy') })
  // four generated files per variation (a fixture system ships no components.html, the fifth), plus
  // style.css, inspirations.json and the three theme-driven artifact sheets
  assert.equal(files.size, ids.length * 4 + 2 + 3)
  assert.ok([...files.keys()].every((rel) => isGenerated(rel)))
  assert.ok(!files.has('functions.php'))
  assert.ok(!files.has('theme.json'))
  assert.match(files.get('style.css'), /^Theme Name: Tracy$/m)
  assert.match(files.get('style.css'), /^Text Domain: tracy$/m)
})

test('a target copies the source, rewrites the text domain, lets the overlay win, and keeps only its systems', () => {
  const pkg = fixturePackage()
  const vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }])
  const target = targetOf('x', { pkgDir: pkg })
  assert.deepEqual(target.variations, ['alpha', 'beta'])
  assert.equal(target.rootVariation, 'beta')
  const { files, ids } = plan({ vendorDir: vendor, srcDir: target.srcDir, version: '1.2.3', target })
  assert.deepEqual(ids, ['alpha', 'beta'])
  assert.deepEqual([...files.keys()].sort(), [
    'assets/css/artifacts/form/alpha.css',
    'assets/css/artifacts/form/beta.css',
    'assets/css/artifacts/landing/alpha.css',
    'assets/css/artifacts/landing/beta.css',
    'assets/css/artifacts/typography/alpha.css',
    'assets/css/artifacts/typography/beta.css',
    'functions.php',
    'inc/keep.php',
    'inc/update.php',
    'inspirations.json',
    'readme.txt',
    'screenshot.png',
    'style.css',
    'styles/alpha.json',
    'styles/beta.json',
    'theme.json'
  ])
  assert.equal(
    files.get('functions.php'),
    "<?php\n$a = __( 'Hello', 'x-dom' );\nesc_html_e( \"Bye\", 'x-dom' );\nregister_block_pattern_category( 'tracy', array() );\n"
  )
  assert.equal(files.get('inc/keep.php').toString(), '<?php\n// overlay wins\n')
  assert.equal(files.get('style.css'), '/*\nTheme Name: X\nVersion: 1.2.3\nText Domain: x-dom\n*/\n')
  assert.ok(files.get('screenshot.png').equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff])))
  assert.deepEqual(Object.keys(JSON.parse(files.get('inspirations.json')).systems), ['alpha', 'beta'])
  const theme = JSON.parse(files.get('theme.json'))
  assert.equal(theme.settings.custom.tracy.inspiration, 'beta')
  assert.equal(theme.settings.color.defaultPalette, false)
  assert.deepEqual(theme.styles, { spacing: 1 })
  assert.deepEqual(
    theme.settings.color.palette,
    JSON.parse(files.get('styles/beta.json')).settings.color.palette
  )
})

test('a target naming a system the catalog does not have stops the build', () => {
  const pkg = fixturePackage()
  const vendor = fixtureVendor([{ id: 'alpha' }])
  const target = targetOf('x', { pkgDir: pkg })
  assert.throws(
    () => plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }),
    /target x: beta not in catalog/
  )
})

test('a target tree is checked whole: an edited planned file and a file nobody planned are both stale', () => {
  const pkg = fixturePackage()
  const vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }])
  const target = targetOf('x', { pkgDir: pkg })
  const { files } = plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target })
  for (const [rel, content] of files) {
    mkdirSync(path.dirname(path.join(target.srcDir, rel)), { recursive: true })
    writeFileSync(path.join(target.srcDir, rel), content)
  }
  assert.deepEqual(stale(files, target.srcDir, { everything: true }), [])
  writeFileSync(path.join(target.srcDir, 'functions.php'), '<?php // edited by hand\n')
  writeFileSync(path.join(target.srcDir, 'inc', 'extra.php'), '<?php // nobody planned this\n')
  const report = stale(files, target.srcDir, { everything: true })
  assert.deepEqual(report.sort(), ['functions.php', 'inc/extra.php'])
})

test('rootThemeJson swaps the presets and custom of a theme.json and touches nothing else', () => {
  const base = {
    $schema: 's',
    version: 3,
    settings: {
      appearanceTools: true,
      layout: { contentSize: '1px', wideSize: '1px' },
      color: { defaultPalette: false, palette: [1] },
      typography: { fluid: true, fontFamilies: [1], fontSizes: [1] },
      spacing: { units: ['px'], spacingSizes: [1] },
      custom: { old: 1 }
    },
    styles: { a: 1 },
    customTemplates: [1],
    templateParts: [1]
  }
  const v = variationOf(tokens({ '--container-max': '999px' }), { id: 'apple', name: 'Apple' })
  const out = rootThemeJson(base, v)
  assert.deepEqual(Object.keys(out), [
    '$schema',
    'version',
    'settings',
    'styles',
    'customTemplates',
    'templateParts'
  ])
  assert.equal(out.settings.appearanceTools, true)
  assert.equal(out.settings.color.defaultPalette, false)
  assert.equal(out.settings.typography.fluid, true)
  assert.deepEqual(out.settings.spacing.units, ['px'])
  assert.deepEqual(out.settings.layout, { contentSize: '999px', wideSize: '999px' })
  assert.deepEqual(out.settings.color.palette, v.settings.color.palette)
  assert.deepEqual(out.settings.custom, v.settings.custom)
  assert.deepEqual(out.styles, { a: 1 })
  assert.equal(base.settings.custom.old, 1)
})

// ---- theme.overlay.json: what a target may add to its generated theme.json ----

test('the overlay may carry styles, templates, parts, patterns and settings.custom.tracy — nothing else', () => {
  assert.deepEqual(
    THEME_OVERLAY_KEYS.map((k) => k.join('.')),
    ['styles', 'customTemplates', 'templateParts', 'patterns', 'settings.custom.tracy']
  )
  const base = {
    version: 3,
    settings: { color: { palette: [1] }, custom: { radius: { sm: '1px' } } },
    styles: {}
  }
  for (const [overlay, key] of [
    [{ version: 2 }, 'version'],
    [{ settings: { color: { palette: [] } } }, 'settings.color'],
    [{ settings: { custom: { radius: { sm: '9px' } } } }, 'settings.custom.radius'],
    [{ settings: { custom: { tracy: { dark: true } }, layout: {} } }, 'settings.layout'],
    [{ anything: 1 }, 'anything']
  ]) {
    assert.throws(
      () => mergeThemeOverlay(base, overlay, 'x'),
      new RegExp(`^Error: x: key ${key.replace(/\./g, '\\.')} is not allowed`),
      key
    )
  }
  assert.throws(() => mergeThemeOverlay(base, [], 'x'), /x: must be a JSON object/)
  assert.throws(() => mergeThemeOverlay(base, 'css', 'x'), /x: must be a JSON object/)
})

test('the overlay deep-merges: objects by key, named lists by name, everything else replaced', () => {
  const base = {
    $schema: 's',
    version: 3,
    settings: {
      color: { palette: [{ slug: 'bg', color: '#fff' }] },
      custom: { radius: { sm: '1px' }, tracy: { inspiration: 'apple' } }
    },
    styles: { color: { text: 'a' }, elements: { link: { color: { text: 'b' } } } },
    customTemplates: [
      { name: 'landing', title: 'Landing', postTypes: ['page'] },
      { name: 'pricing', title: 'Pricing', postTypes: ['page'] }
    ],
    templateParts: [{ name: 'header', title: 'Header', area: 'header' }]
  }
  const out = mergeThemeOverlay(base, {
    styles: {
      css: 'html{color-scheme:light dark}',
      elements: { link: { ':hover': { color: { text: 'c' } } } }
    },
    customTemplates: [
      { name: 'landing', title: 'Landing (sections)', postTypes: ['page'] },
      { name: 'page-onepage', title: 'One page', postTypes: ['page'] }
    ],
    templateParts: [{ name: 'footer', title: 'Footer', area: 'footer' }],
    patterns: ['a-pattern'],
    settings: { custom: { tracy: { dark: 'cookie' } } }
  })
  // the tokens are untouched: the palette and every custom key but tracy's
  assert.deepEqual(out.settings.color, base.settings.color)
  assert.deepEqual(out.settings.custom, {
    radius: { sm: '1px' },
    tracy: { inspiration: 'apple', dark: 'cookie' }
  })
  // styles: the new css lands beside the existing keys, a nested object merges
  assert.equal(out.styles.css, 'html{color-scheme:light dark}')
  assert.deepEqual(out.styles.color, { text: 'a' })
  assert.deepEqual(out.styles.elements.link, { color: { text: 'b' }, ':hover': { color: { text: 'c' } } })
  // named lists: one retitled in place, one appended, the rest kept in order
  assert.deepEqual(
    out.customTemplates.map((t) => `${t.name}=${t.title}`),
    ['landing=Landing (sections)', 'pricing=Pricing', 'page-onepage=One page']
  )
  assert.deepEqual(
    out.templateParts.map((p) => p.name),
    ['header', 'footer']
  )
  assert.deepEqual(out.patterns, ['a-pattern'])
  assert.equal(out.$schema, 's')
  // the base is not mutated
  assert.equal(base.customTemplates[0].title, 'Landing')
  assert.equal(base.styles.css, undefined)
})

test('a target applies theme.overlay.json after the root variation and never copies the file', () => {
  const pkg = fixturePackage()
  const overlay = path.join(pkg, 'overlays', 'x')
  writeFileSync(
    path.join(overlay, THEME_OVERLAY_FILE),
    JSON.stringify({
      styles: { css: 'html[data-theme="dark"]{--wp--preset--color--bg:#000}' },
      customTemplates: [{ name: 'page-onepage', title: 'One page', postTypes: ['page'] }]
    })
  )
  const vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }])
  const target = targetOf('x', { pkgDir: pkg })
  const { files } = plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target })
  assert.ok(!files.has(THEME_OVERLAY_FILE))
  const theme = JSON.parse(files.get('theme.json'))
  assert.equal(theme.settings.custom.tracy.inspiration, 'beta')
  assert.deepEqual(
    theme.settings.color.palette,
    JSON.parse(files.get('styles/beta.json')).settings.color.palette
  )
  assert.deepEqual(theme.styles, { spacing: 1, css: 'html[data-theme="dark"]{--wp--preset--color--bg:#000}' })
  assert.deepEqual(theme.customTemplates, [{ name: 'page-onepage', title: 'One page', postTypes: ['page'] }])
  // a forbidden key stops the build and names the file
  writeFileSync(
    path.join(overlay, THEME_OVERLAY_FILE),
    JSON.stringify({ settings: { color: { palette: [] } } })
  )
  assert.throws(
    () => plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }),
    /target x: overlays\/x\/theme\.overlay\.json: key settings\.color is not allowed/
  )
  writeFileSync(path.join(overlay, THEME_OVERLAY_FILE), '{ not json')
  assert.throws(
    () => plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }),
    /target x: overlays\/x\/theme\.overlay\.json: /
  )
})

test('tracy-base: two variations, its own header and text domain, update slug, theme.json wearing apple', () => {
  const target = targetOf('tracy-base')
  const { files, ids } = plan({ vendorDir: VENDOR, srcDir: target.srcDir, version: '0.0.0', target })
  assert.deepEqual(ids, ['airbnb', 'apple'])
  assert.deepEqual([...files.keys()].filter((f) => f.startsWith('styles/')).sort(), [
    'styles/airbnb.json',
    'styles/apple.json'
  ])
  assert.deepEqual(Object.keys(JSON.parse(files.get('inspirations.json')).systems).sort(), [
    'airbnb',
    'apple'
  ])
  assert.match(files.get('style.css'), /^Theme Name: Tracy Base$/m)
  assert.match(files.get('style.css'), /^Text Domain: tracy-base$/m)
  assert.match(files.get('style.css'), /^Version: 0\.0\.0$/m)
  const functions = files.get('functions.php')
  assert.match(functions, /'tracy-base'\s*\)/)
  assert.doesNotMatch(functions, /,\s*'tracy'\s*\)/)
  assert.match(files.get('inc/update.php').toString(), /^const TRACY_UPDATE_SLUG = 'tracy-base';$/m)
  assert.match(files.get('inc/update.php').toString(), /wordpress\/theme\/tracy-base\/update\.json/)
  assert.match(files.get('readme.txt').toString(), /^=== Tracy Base ===/)
  assert.ok(files.get('screenshot.png').equals(readFileSync(path.join(SRC, 'screenshot.png'))))
  const theme = JSON.parse(files.get('theme.json'))
  const apple = JSON.parse(files.get('styles/apple.json'))
  assert.equal(theme.settings.custom.tracy.inspiration, 'apple')
  assert.deepEqual(theme.settings.color.palette, apple.settings.color.palette)
  assert.deepEqual(theme.settings.custom, apple.settings.custom)
  const common = JSON.parse(readFileSync(path.join(SRC, 'theme.json'), 'utf8'))
  for (const key of ['$schema', 'version']) assert.deepEqual(theme[key], common[key], key)
  // the common parts, plus the one-page home's own header (its anchor menu, as the Joomla source)
  assert.deepEqual(theme.templateParts, [
    ...common.templateParts,
    { name: 'header-onepage', title: 'Header (one page)', area: 'header' }
  ])
  // its theme.overlay.json on top: the dark set in styles.css (each value read through its role),
  // headings and the link hover read their roles, the five page-* templates added to the common
  // list, everything else of styles as the common theme wrote it
  assert.match(
    theme.styles.css,
    /html\[data-theme="dark"\]\s*\{[^}]*--wp--preset--color--bg: var\(--ds-c-bg, #000000\);/
  )
  assert.match(theme.styles.css, /@media \(prefers-color-scheme: dark\)/)
  const { heading, link, ...elements } = theme.styles.elements
  assert.equal(heading.color.text, 'var(--ds-c-heading, var(--wp--preset--color--fg))')
  assert.equal(link[':hover'].color.text, 'var(--ds-c-accent-text, var(--wp--preset--color--accent))')
  const { heading: h0, link: l0, ...commonElements } = common.styles.elements
  assert.deepEqual(elements, commonElements)
  assert.deepEqual({ ...heading, color: undefined }, { ...h0, color: undefined })
  assert.deepEqual({ ...link, ':hover': undefined }, { ...l0, ':hover': undefined })
  assert.deepEqual(
    { ...theme.styles, css: undefined, elements: undefined },
    { ...common.styles, css: undefined, elements: undefined }
  )
  const names = theme.customTemplates.map((t) => t.name)
  for (const t of common.customTemplates) assert.ok(names.includes(t.name), t.name)
  assert.deepEqual(
    theme.customTemplates.filter((t) => t.name.startsWith('page-')).map((t) => `${t.name}=${t.title}`),
    [
      'page-landing=Landing',
      'page-onepage=One page',
      'page-no-sidebar=No sidebar',
      'page-sidebar-left=Sidebar left',
      'page-titled=Page with title'
    ]
  )
  for (const t of theme.customTemplates)
    assert.ok(files.has(`templates/${t.name}.html`), `templates/${t.name}.html`)
  assert.ok(!files.has(THEME_OVERLAY_FILE))
  assert.ok(files.has('inc/extra.php'))
  assert.match(functions, /require \$tracy_extra;/)
  // Every file the source theme hand-writes is in the plan; nothing of src/tracy-base is unplanned.
  assert.deepEqual(
    stale(files, target.srcDir, { everything: true }).filter((f) => f !== 'style.css'),
    []
  )
})

// ---- third shape of target: rootTokens, a measured tokens.css instead of a vendored system ----

/** fixturePackage() with its overlay switched to a measured look: no vendored system at all. */
function fixtureMeasuredPackage(map = tokens({ '--accent': '#c8102e', '--container-max': '1200px' })) {
  const pkg = fixturePackage()
  const overlay = path.join(pkg, 'overlays', 'x')
  writeFileSync(
    path.join(overlay, 'theme.config.json'),
    JSON.stringify({
      slug: 'x',
      themeName: 'X',
      textDomain: 'x-dom',
      rootTokens: 'tokens.css',
      nav: 'overlay',
      hero: 'cover',
      variations: []
    })
  )
  writeFileSync(path.join(overlay, 'tokens.css'), tokensCss(map))
  return pkg
}

test('nav and hero lists are the ones functions.php knows, first of each the default', () => {
  assert.deepEqual([...NAVS], ['top-left', 'top-centered', 'brand-centered', 'sidebar', 'overlay'])
  assert.deepEqual([...HEROS], ['split', 'centered', 'cover', 'stack'])
  assert.equal(targetOf('tracy').nav, 'top-left')
  assert.equal(targetOf('tracy').hero, 'split')
})

test('rootTokens lets variations be empty, excludes rootVariation, and must name a file that exists', () => {
  const pkg = fixtureMeasuredPackage()
  const target = targetOf('x', { pkgDir: pkg })
  assert.deepEqual(target.variations, [])
  assert.equal(target.rootVariation, null)
  assert.equal(target.rootTokens, 'tokens.css')
  assert.equal(target.nav, 'overlay')
  assert.equal(target.hero, 'cover')
  const config = path.join(pkg, 'overlays', 'x', 'theme.config.json')
  const write = (patch) =>
    writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), ...patch }))
  write({ rootVariation: 'alpha', variations: ['alpha'] })
  assert.throws(
    () => targetOf('x', { pkgDir: pkg }),
    /target x: rootVariation and rootTokens are mutually exclusive/
  )
  write({ rootVariation: undefined, variations: [], rootTokens: 'missing.css' })
  assert.throws(
    () => targetOf('x', { pkgDir: pkg }),
    /target x: rootTokens overlays\/x\/missing\.css is missing/
  )
  write({ rootTokens: '../escape.css' })
  assert.throws(
    () => targetOf('x', { pkgDir: pkg }),
    /target x: rootTokens must name a file inside overlays\/x\//
  )
  write({ rootTokens: undefined })
  assert.throws(() => targetOf('x', { pkgDir: pkg }), /target x: theme\.config\.json lists no variations/)
  write({ rootTokens: 'tokens.css', nav: 'floating' })
  assert.throws(() => targetOf('x', { pkgDir: pkg }), /target x: nav floating is not one of top-left, /)
  write({ nav: undefined, hero: 'banner' })
  assert.throws(() => targetOf('x', { pkgDir: pkg }), /target x: hero banner is not one of split, /)
  write({ hero: undefined })
  assert.equal(targetOf('x', { pkgDir: pkg }).nav, 'top-left')
  assert.equal(targetOf('x', { pkgDir: pkg }).hero, 'split')
})

test('a measured target: its tokens become styles/<slug>.json, a catalogue row and the root theme.json; nothing vendored ships', () => {
  const pkg = fixtureMeasuredPackage()
  const vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }])
  const target = targetOf('x', { pkgDir: pkg })
  const { files, ids } = plan({ vendorDir: vendor, srcDir: target.srcDir, version: '1.2.3', target })
  assert.deepEqual(ids, ['x'])
  assert.deepEqual([...files.keys()].sort(), [
    'functions.php',
    'inc/keep.php',
    'inc/update.php',
    'inspirations.json',
    'readme.txt',
    'screenshot.png',
    'style.css',
    'styles/x.json',
    'theme.json'
  ])
  assert.ok(!files.has('tokens.css'), 'the measured tokens are a source, not a theme file')
  const variation = JSON.parse(files.get('styles/x.json'))
  assert.equal(variation.title, 'X')
  assert.equal(variation.settings.custom.tracy.inspiration, 'x')
  assert.equal(variation.settings.color.palette.find((c) => c.slug === 'accent').color, '#c8102e')
  assert.deepEqual(JSON.parse(files.get('inspirations.json')).systems, {
    x: { name: 'X', category: 'Measured', nav: 'overlay', hero: 'cover', dark: false }
  })
  const theme = JSON.parse(files.get('theme.json'))
  assert.equal(theme.settings.custom.tracy.inspiration, 'x')
  assert.deepEqual(theme.settings.color.palette, variation.settings.color.palette)
  assert.deepEqual(theme.settings.layout, { contentSize: '1200px', wideSize: '1200px' })
  assert.equal(theme.settings.color.defaultPalette, false)
  assert.deepEqual(theme.styles, { spacing: 1 })
  // the overlay may not carry a theme.json here either
  writeFileSync(path.join(pkg, 'overlays', 'x', 'theme.json'), '{}')
  assert.throws(
    () => plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }),
    /target x: theme\.json is generated from rootTokens/
  )
})

test('a measured target may still ship vendored systems beside its own look', () => {
  const pkg = fixtureMeasuredPackage()
  const config = path.join(pkg, 'overlays', 'x', 'theme.config.json')
  writeFileSync(
    config,
    JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), variations: ['alpha'] })
  )
  const vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }])
  const target = targetOf('x', { pkgDir: pkg })
  const { files, ids } = plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target })
  assert.deepEqual(ids, ['alpha', 'x'])
  assert.ok(files.has('styles/alpha.json'))
  assert.ok(files.has('assets/css/artifacts/form/alpha.css'))
  assert.ok(!files.has('assets/css/fixtures/x.css'))
  assert.equal(JSON.parse(files.get('theme.json')).settings.custom.tracy.inspiration, 'x')
})

test('a measured tokens.css missing a contract token, or declaring one outside it, stops the build by name', () => {
  const vendor = fixtureVendor([{ id: 'alpha' }])
  const holey = tokens()
  delete holey['--accent']
  delete holey['--space-12']
  let pkg = fixtureMeasuredPackage(holey)
  let target = targetOf('x', { pkgDir: pkg })
  assert.throws(
    () => plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }),
    /target x: overlays\/x\/tokens\.css: missing --accent, --space-12/
  )
  pkg = fixtureMeasuredPackage(tokens({ '--brand-red': '#c8102e' }))
  target = targetOf('x', { pkgDir: pkg })
  assert.throws(
    () => plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }),
    /target x: overlays\/x\/tokens\.css: --brand-red not among the 56 contract tokens/
  )
  // a slug that is also a shipped vendored system would give functions.php two rows under one id
  pkg = fixtureMeasuredPackage()
  const config = path.join(pkg, 'overlays', 'x', 'theme.config.json')
  writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), variations: ['x'] }))
  target = targetOf('x', { pkgDir: pkg })
  assert.throws(
    () => plan({ vendorDir: fixtureVendor([{ id: 'x' }]), srcDir: target.srcDir, version: '0.0.0', target }),
    /target x: overlays\/x\/tokens\.css: x is also a vendored system/
  )
})

test('an edited measured tokens.css makes the tree stale: theme.json and styles/<slug>.json both', () => {
  const pkg = fixtureMeasuredPackage()
  const vendor = fixtureVendor([{ id: 'alpha' }])
  const target = targetOf('x', { pkgDir: pkg })
  const { files } = plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target })
  for (const [rel, content] of files) {
    mkdirSync(path.dirname(path.join(target.srcDir, rel)), { recursive: true })
    writeFileSync(path.join(target.srcDir, rel), content)
  }
  assert.deepEqual(stale(files, target.srcDir, { everything: true }), [])
  writeFileSync(path.join(pkg, 'overlays', 'x', 'tokens.css'), tokensCss(tokens({ '--accent': '#000000' })))
  const next = plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }).files
  assert.deepEqual(stale(next, target.srcDir, { everything: true }).sort(), ['styles/x.json', 'theme.json'])
})

test('wp-tracy-business: one measured look, no vendored system, header and text domain its own', () => {
  const target = targetOf('wp-tracy-business')
  assert.equal(target.rootTokens, 'tokens.css')
  assert.deepEqual(target.variations, [])
  const { files, ids } = plan({ vendorDir: VENDOR, srcDir: target.srcDir, version: '0.0.0', target })
  assert.deepEqual(ids, ['wp-tracy-business'])
  assert.deepEqual(
    [...files.keys()].filter((f) => f.startsWith('styles/')),
    ['styles/wp-tracy-business.json']
  )
  assert.equal([...files.keys()].filter((f) => f.startsWith('assets/css/fixtures/')).length, 0)
  assert.equal([...files.keys()].filter((f) => f.startsWith('assets/css/artifacts/')).length, 0)
  assert.ok(!files.has('tokens.css'))
  assert.match(files.get('style.css'), /^Theme Name: Tracy Business$/m)
  assert.match(files.get('style.css'), /^Text Domain: wp-tracy-business$/m)
  const functions = files.get('functions.php')
  assert.match(functions, /'wp-tracy-business'\s*\)/)
  assert.doesNotMatch(functions, /,\s*'tracy'\s*\)/)
  assert.match(files.get('inc/update.php').toString(), /^const TRACY_UPDATE_SLUG = 'wp-tracy-business';$/m)
  assert.match(files.get('inc/update.php').toString(), /wordpress\/theme\/wp-tracy-business\/update\.json/)
  assert.match(files.get('readme.txt').toString(), /^=== Tracy Business ===/)
  const theme = JSON.parse(files.get('theme.json'))
  assert.equal(theme.settings.custom.tracy.inspiration, 'wp-tracy-business')
  assert.deepEqual(JSON.parse(files.get('inspirations.json')).systems['wp-tracy-business'], {
    name: 'Tracy Business',
    category: 'Measured',
    nav: 'top-left',
    hero: 'split',
    dark: false
  })
  // the theme.json carries exactly what overlays/wp-tracy-business/tokens.css declares
  const measured = tokensOf(
    readFileSync(path.join(PKG, 'overlays', 'wp-tracy-business', 'tokens.css'), 'utf8')
  )
  assert.equal(Object.keys(measured).length, TOKEN_NAMES.length)
  // …each colour read through the role theme.config.json roleReads names, its own value the fallback
  assert.equal(
    theme.settings.color.palette.find((c) => c.slug === 'accent').color,
    `var(${target.roleReads['--accent']}, ${measured['--accent']})`
  )
  assert.equal(
    theme.settings.typography.fontSizes.find((f) => f.slug === 'base').size,
    measured['--text-base']
  )
  assert.deepEqual(
    stale(files, target.srcDir, { everything: true }).filter((f) => f !== 'style.css'),
    []
  )
})

// ---- the updater names the target: updateSlug into inc/update.php (#471) ----

/** Rewrite fixturePackage()'s overlay config with `extra` merged in. */
function withConfig(pkg, extra) {
  const file = path.join(pkg, 'overlays', 'x', 'theme.config.json')
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), ...extra }))
}

function planX(pkg, vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }])) {
  const target = targetOf('x', { pkgDir: pkg })
  return plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }).files
}

for (const slug of ['tracy', ...overlayTargets()]) {
  test(`${slug}: the generated updater carries its declared updateSlug and equals the committed file`, () => {
    const target = targetOf(slug)
    const declared = target.overlayDir
      ? JSON.parse(readFileSync(path.join(target.overlayDir, 'theme.config.json'), 'utf8')).updateSlug
      : undefined
    assert.equal(target.updateSlug, declared ?? slug)
    const { files } = plan({ vendorDir: VENDOR, srcDir: target.srcDir, version: '0.0.0', target })
    // the default target does not write its updater; plan() verified it in place
    const php = target.overlayDir
      ? files.get(UPDATE_FILE)
      : readFileSync(path.join(target.srcDir, UPDATE_FILE), 'utf8')
    const u = target.updateSlug
    assert.match(php, new RegExp(`^const TRACY_UPDATE_SLUG = '${u}';$`, 'm'))
    const manifest = u === 'tracy' ? 'wordpress/theme/update.json' : `wordpress/theme/${u}/update.json`
    const paths = [...php.matchAll(/wordpress\/theme\/(?:[a-z0-9-]+\/)?update\.json/g)].map((m) => m[0])
    assert.deepEqual(paths, [manifest, manifest], 'manifest in the comment and the constant')
    const keys = new Set([...php.matchAll(/'([a-z0-9_]+_theme_update)'/g)].map((m) => m[1]))
    assert.deepEqual([...keys], [`${u.replace(/-/g, '_')}_theme_update`])
    assert.equal(readFileSync(path.join(target.srcDir, UPDATE_FILE), 'utf8'), php)
  })
}

test('a target without its own update.php gets its updateSlug, not tracy (the #471 case)', () => {
  const pkg = fixturePackage()
  withConfig(pkg, { updateSlug: 'x' })
  const php = planX(pkg).get(UPDATE_FILE)
  assert.equal(php, fixtureUpdateFor('x'))
  assert.doesNotMatch(php, /= 'tracy';|tracy_theme_update|theme\/update\.json/)
})

test('updateSlug omitted means the slug; declared different from the slug, the declared value', () => {
  const pkg = fixturePackage()
  assert.equal(targetOf('x', { pkgDir: pkg }).updateSlug, 'x')
  assert.equal(planX(pkg).get(UPDATE_FILE), fixtureUpdateFor('x'))
  withConfig(pkg, { updateSlug: 'other-theme' })
  assert.equal(targetOf('x', { pkgDir: pkg }).updateSlug, 'other-theme')
  assert.equal(planX(pkg).get(UPDATE_FILE), fixtureUpdateFor('other-theme'))
})

test('an overlay update.php stands only as a rendering of the one source, and never replaces it', () => {
  const pkg = fixturePackage()
  withConfig(pkg, { updateSlug: 'x-y' })
  const own = path.join(pkg, 'overlays', 'x', 'inc', 'update.php')
  // a copy out of another generated tree is accepted, and the target still gets its own slug
  for (const copy of [fixtureUpdateFor('someone-else'), fixtureUpdateFor('x-y'), FIXTURE_UPDATE]) {
    writeFileSync(own, copy)
    assert.equal(planX(pkg).get(UPDATE_FILE), fixtureUpdateFor('x-y'))
  }
  // anything else is a second updater: refused, whatever it adds
  for (const copy of [
    `${fixtureUpdateFor('x-y')}// overlay only\n`,
    fixtureUpdateFor('x-y').replaceAll('\n', '\r\n'),
    fixtureUpdateFor('x-y').replace('wordpress/theme/x-y/update.json', 'wordpress/theme/update.json')
  ]) {
    writeFileSync(own, copy)
    assert.throws(
      () => planX(pkg),
      /^Error: target x: overlays\/x\/inc\/update\.php: is not src\/tracy\/inc\/update\.php rendered for any updateSlug/
    )
  }
})

test('renderUpdate changes exactly the three names of the theme in the pinned source', () => {
  assert.equal(
    createHash('sha256').update(FIXTURE_UPDATE).digest('hex'),
    UPDATE_SOURCE_SHA256,
    'src/tracy/inc/update.php is the file the digest pins'
  )
  assert.equal(renderUpdate(FIXTURE_UPDATE, 'tracy'), FIXTURE_UPDATE)
  const out = renderUpdate(FIXTURE_UPDATE, 'wp-demo')
  assert.equal(out, fixtureUpdateFor('wp-demo'))
  assert.equal([...out.matchAll(/^const TRACY_UPDATE_SLUG = 'wp-demo';$/gm)].length, 1)
  assert.equal([...out.matchAll(/wordpress\/theme\/wp-demo\/update\.json/g)].length, 2)
  assert.equal([...out.matchAll(/'wp_demo_theme_update'/g)].length, 3)
  // the theme is otherwise named only through the constant: no 'tracy' literal, no tracy key
  assert.doesNotMatch(out, /'tracy'|"tracy"|tracy_theme_update|wordpress\/theme\/update\.json/)
  // the lines that answer and compare the stylesheet read the constant
  assert.match(out, /^\t\t'theme' {8}=> TRACY_UPDATE_SLUG,$/m)
  assert.match(out, /^\tif \( TRACY_UPDATE_SLUG !== \$theme_stylesheet \) \{$/m)
  for (const bad of ['', 'Tracy', "x'y", '../x', 'x_y', null])
    assert.throws(() => renderUpdate(FIXTURE_UPDATE, bad), /is not a theme directory name/, String(bad))
})

test('a declared updateSlug that is not a theme directory name stops the build by target', () => {
  for (const bad of [null, 7, {}, [], '', ' ', 'Tracy', "x'y", 'x\ny', '../x', 'x/y', 'x--y', '-x', 'x_y']) {
    const pkg = fixturePackage()
    withConfig(pkg, { updateSlug: bad })
    assert.throws(
      () => targetOf('x', { pkgDir: pkg }),
      /target x: overlays\/x\/theme\.config\.json: updateSlug .* is not a theme directory name/,
      JSON.stringify(bad)
    )
  }
})

test('a theme.config.json that is empty, not JSON, not an object or not a file stops the build by name', () => {
  for (const body of ['', '{ nope', 'null', '[]', '"x"']) {
    const pkg = fixturePackage()
    writeFileSync(path.join(pkg, 'overlays', 'x', 'theme.config.json'), body)
    assert.throws(() => targetOf('x', { pkgDir: pkg }), /target x: overlays\/x\/theme\.config\.json: /, body)
  }
  const pkg = fixturePackage()
  const config = path.join(pkg, 'overlays', 'x', 'theme.config.json')
  const real = path.join(pkg, 'elsewhere.json')
  writeFileSync(real, readFileSync(config))
  rmSync(config)
  symlinkSync(real, config)
  assert.throws(() => targetOf('x', { pkgDir: pkg }), /theme\.config\.json: not a regular file/)
  rmSync(config)
  mkdirSync(config)
  assert.throws(() => targetOf('x', { pkgDir: pkg }), /theme\.config\.json: not a regular file/)
})

test('an updater that is not the reviewed one stops the build, naming the target and the file', () => {
  const edits = [
    // the offer names the old theme by literal while the constant moves (review round 3)
    FIXTURE_UPDATE.replace("'theme'        => TRACY_UPDATE_SLUG,", "'theme'        => 'tracy',"),
    FIXTURE_UPDATE.replace(
      'if ( TRACY_UPDATE_SLUG !== $theme_stylesheet )',
      "if ( 'tracy' !== $theme_stylesheet )"
    ),
    // a lone CR ends a PHP line comment: the return after it runs
    FIXTURE_UPDATE.replace(
      "\t\t'theme'        => TRACY_UPDATE_SLUG,",
      "\t\t// note\rreturn array( 'theme' => 'tracy' );\n\t\t'theme'        => TRACY_UPDATE_SLUG,"
    ),
    // earlier rounds: a declaration hidden in a comment, a double-quoted key, a heredoc
    FIXTURE_UPDATE.replace(
      "const TRACY_UPDATE_SLUG = 'tracy';",
      '/*\nconst TRACY_UPDATE_SLUG = \'tracy\';\n*/\nconst TRACY_UPDATE_SLUG = "tracy";'
    ),
    FIXTURE_UPDATE.replace(
      "get_site_transient( 'tracy_theme_update' )",
      'get_site_transient( "tracy_theme_update" )'
    ),
    `${FIXTURE_UPDATE}$x = <<<EOT\nget_site_transient( 'other_theme_update' )\nEOT;\n`,
    FIXTURE_UPDATE.replaceAll('\n', '\r\n'),
    fixtureUpdateFor('x'),
    ''
  ]
  for (const php of edits) {
    assert.notEqual(php, FIXTURE_UPDATE)
    // as the source theme's updater: its digest is not the reviewed one
    const fromSource = fixturePackage()
    writeFileSync(path.join(fromSource, 'src', 'tracy', 'inc', 'update.php'), php)
    assert.throws(
      () => planX(fromSource),
      (e) =>
        e.message.startsWith('target x: src/tracy/inc/update.php: is not the reviewed updater (sha256 ') &&
        e.message.includes(`expected ${UPDATE_SOURCE_SHA256}`)
    )
    // as an overlay copy: not a rendering of the source
    const fromOverlay = fixturePackage()
    writeFileSync(path.join(fromOverlay, 'overlays', 'x', 'inc', 'update.php'), php)
    const rendered = php === fixtureUpdateFor('x')
    if (rendered) assert.equal(planX(fromOverlay).get(UPDATE_FILE), fixtureUpdateFor('x'))
    else
      assert.throws(
        () => planX(fromOverlay),
        (e) =>
          e.message.startsWith(
            'target x: overlays/x/inc/update.php: is not src/tracy/inc/update.php rendered'
          )
      )
  }
  const missing = fixturePackage()
  rmSync(path.join(missing, 'src', 'tracy', 'inc', 'update.php'))
  assert.throws(() => planX(missing), /^Error: target x: src\/tracy\/inc\/update\.php: ENOENT/)
})

test('an updater that is a symlink, or a FIFO, is refused before it is read', { timeout: 10_000 }, () => {
  const linked = fixturePackage()
  const real = path.join(linked, 'real-update.php')
  writeFileSync(real, FIXTURE_UPDATE)
  symlinkSync(real, path.join(linked, 'overlays', 'x', 'inc', 'update.php'))
  assert.throws(() => planX(linked), /target x: overlays\/x\/inc\/update\.php: not a regular file/)
  const fifo = fixturePackage()
  const at = path.join(fifo, 'src', 'tracy', 'inc', 'update.php')
  rmSync(at)
  const made = spawnSync('mkfifo', [at])
  assert.equal(made.status, 0, made.stderr?.toString())
  assert.throws(() => planX(fifo), /target x: src\/tracy\/inc\/update\.php: not a regular file/)
})

test('an overlay updater path that is a directory, empty or not, or sits under a symlinked inc/, is refused', () => {
  const empty = fixturePackage()
  mkdirSync(path.join(empty, 'overlays', 'x', 'inc', 'update.php'))
  assert.throws(() => planX(empty), /target x: overlays\/x\/inc\/update\.php: not a regular file/)
  const full = fixturePackage()
  mkdirSync(path.join(full, 'overlays', 'x', 'inc', 'update.php'))
  writeFileSync(path.join(full, 'overlays', 'x', 'inc', 'update.php', 'inner.php'), FIXTURE_UPDATE)
  assert.throws(() => planX(full), /target x: overlays\/x\/inc\/update\.php: not a regular file/)
  const linked = fixturePackage()
  const elsewhere = path.join(linked, 'elsewhere')
  mkdirSync(elsewhere)
  writeFileSync(path.join(elsewhere, 'update.php'), FIXTURE_UPDATE)
  rmSync(path.join(linked, 'overlays', 'x', 'inc'), { recursive: true })
  symlinkSync(elsewhere, path.join(linked, 'overlays', 'x', 'inc'))
  assert.throws(() => planX(linked), /target x: overlays\/x\/inc/)
})

/**
 * planX in a child process with a hard time limit: a blocking read of a FIFO cannot be interrupted
 * by the test runner's timeout, so a regression must fail by the clock, not hang the suite.
 * @param {string} pkg
 */
function planXBounded(pkg) {
  const vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }])
  const code = `import { plan, targetOf } from ${JSON.stringify(BUILD)}
const target = targetOf('x', { pkgDir: ${JSON.stringify(pkg)} })
try { plan({ vendorDir: ${JSON.stringify(vendor)}, srcDir: target.srcDir, version: '0.0.0', target }) }
catch (error) { console.error(error.message); process.exit(3) }`
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8',
    timeout: 10_000
  })
}

test('a directory holding a FIFO at either updater path is refused before anything under it is read', () => {
  for (const [where, message] of [
    [['overlays', 'x'], /target x: overlays\/x\/inc\/update\.php: not a regular file/],
    [['src', 'tracy'], /target x: src\/tracy\/inc\/update\.php: not a regular file/]
  ]) {
    const pkg = fixturePackage()
    const at = path.join(pkg, ...where, 'inc', 'update.php')
    rmSync(at, { force: true })
    mkdirSync(at, { recursive: true })
    const made = spawnSync('mkfifo', [path.join(at, 'pipe.php')])
    assert.equal(made.status, 0, made.stderr?.toString())
    const run = planXBounded(pkg)
    assert.equal(run.error, undefined, `${where.join('/')}: ${run.error?.message}`)
    assert.equal(run.status, 3, `${where.join('/')}: ${run.stderr}`)
    assert.match(run.stderr, message)
  }
})

test("the default target's own updater is verified in place against its updateSlug", () => {
  const pkg = fixturePackage()
  const vendor = fixtureVendor([{ id: 'alpha' }])
  const target = targetOf('tracy', { pkgDir: pkg })
  assert.doesNotThrow(() => plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }))
  writeFileSync(path.join(target.srcDir, 'inc', 'update.php'), fixtureUpdateFor('x'))
  assert.throws(
    () => plan({ vendorDir: vendor, srcDir: target.srcDir, version: '0.0.0', target }),
    /target tracy: src\/tracy\/inc\/update\.php: is not the reviewed updater/
  )
})

test('the CLI refuses a missing or malformed --target', () => {
  for (const args of [['--target'], ['--target', '--check'], ['--check', '--target', '']]) {
    const run = spawnSync(process.execPath, [BUILD, ...args], { encoding: 'utf8' })
    assert.notEqual(run.status, 0, args.join(' '))
    assert.match(run.stderr, /--target needs a slug/, args.join(' '))
  }
})

test("a target may declare its own release version; omitted, it takes package.json's", () => {
  const pkg = fixtureMeasuredPackage()
  const config = path.join(pkg, 'overlays', 'x', 'theme.config.json')
  const write = (patch) =>
    writeFileSync(config, JSON.stringify({ ...JSON.parse(readFileSync(config, 'utf8')), ...patch }))
  assert.equal(targetOf('x', { pkgDir: pkg }).version, null)
  assert.equal(targetOf('tracy').version, null)
  for (const good of ['1.1.2', '0.0.1', '10.20.30', '1.2.3-rc.1', '1.1.1-r1']) {
    write({ version: good })
    assert.equal(targetOf('x', { pkgDir: pkg }).version, good)
  }
  for (const bad of ['', '1.2', '01.2.3', '1.2.3 ', 'v1.2.3', '1.2.3-', '1.2.3-a..b', 3, null, ['1.2.3']]) {
    write({ version: bad })
    assert.throws(
      () => targetOf('x', { pkgDir: pkg }),
      /target x: overlays\/x\/theme\.config\.json: version .* is not a release version/,
      JSON.stringify(bad)
    )
  }
  write({ version: '2.0.1' })
  const target = targetOf('x', { pkgDir: pkg })
  const { files } = plan({
    vendorDir: fixtureVendor([{ id: 'alpha' }]),
    srcDir: target.srcDir,
    version: target.version,
    target
  })
  assert.match(files.get('style.css'), /^Version: 2\.0\.1$/m)
})

test("the committed targets: the version the build uses is the one the target's own theme.config.json declares, else package.json's", () => {
  const pkgVersion = JSON.parse(readFileSync(path.join(PKG, 'package.json'), 'utf8')).version
  assert.ok(TARGET_VERSION_SHAPE.test(pkgVersion), 'package.json version')
  const declaring = []
  const configDeclaring = []
  for (const slug of ['tracy', ...overlayTargets()]) {
    const target = targetOf(slug)
    // Read the config independently of targetOf, so a lost declaration cannot hide itself.
    const config =
      slug === 'tracy'
        ? {}
        : JSON.parse(readFileSync(path.join(PKG, 'overlays', slug, 'theme.config.json'), 'utf8'))
    const declares = Object.hasOwn(config, 'version')
    if (target.version !== null) declaring.push(slug)
    if (declares) configDeclaring.push(slug)
    if (declares) assert.equal(target.version, config.version, `${slug}: targetOf version`)
    else assert.equal(target.version, null, `${slug}: undeclared target must not carry a version`)
    const expected = declares ? config.version : pkgVersion
    const effective = target.version ?? pkgVersion
    assert.equal(typeof effective, 'string', slug)
    assert.equal(effective, expected, slug)
    assert.ok(TARGET_VERSION_SHAPE.test(effective), `${slug}: version shape`)
    const styleCss = readFileSync(path.join(target.srcDir, 'style.css'), 'utf8')
    const lines = styleCss.split('\n').filter((line) => line.startsWith('Version: '))
    assert.deepEqual(lines, [`Version: ${expected}`], `${slug}: style.css Version line`)
  }
  assert.deepEqual(declaring.sort(), configDeclaring.sort(), 'targets that declare a version')
})

/**
 * Every member of a zip as `{ name, perm }`, read from its central directory (the unix mode in the
 * high half of each entry's external attributes; no zip tool involved), perm like `ls -l`.
 */
function zipMembers(zipPath) {
  const buf = readFileSync(zipPath)
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  assert.ok(eocd >= 0, 'no end of central directory')
  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, 'central directory entry')
    assert.equal(buf.readUInt8(at + 5), 3, 'made on unix')
    const mode = buf.readUInt32LE(at + 38) >>> 16
    const nameLen = buf.readUInt16LE(at + 28)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)
    const kind = (mode & 0o170000) === 0o040000 ? 'd' : (mode & 0o170000) === 0o100000 ? '-' : '?'
    const bits = 'rwxrwxrwx'
      .split('')
      .map((c, j) => (mode & (0o400 >> j) ? c : '-'))
      .join('')
    out.push({ name, perm: kind + bits, special: mode & 0o7000 })
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32)
  }
  return out
}

test('the theme zip carries 0644 files and 0755 directories even from a 0600/0700 tree under umask 077', () => {
  assert.equal(ZIP_FILE_MODE, 0o644)
  assert.equal(ZIP_DIR_MODE, 0o755)
  const previous = process.umask(0o077)
  try {
    const root = scratch('zip-modes-')
    const tree = path.join(root, 'src', 'demo')
    mkdirSync(path.join(tree, 'inc', 'deep'), { recursive: true })
    writeFileSync(path.join(tree, 'style.css'), 'Theme Name: Demo\n')
    writeFileSync(path.join(tree, 'inc', 'a.php'), '<?php\n')
    writeFileSync(path.join(tree, 'inc', 'deep', 'b.json'), '{}\n')
    writeFileSync(path.join(tree, '.DS_Store'), 'x')
    for (const f of ['style.css', 'inc/a.php', 'inc/deep/b.json']) chmodSync(path.join(tree, f), 0o600)
    for (const d of ['', 'inc', 'inc/deep']) chmodSync(path.join(tree, d), 0o700)
    const zipPath = path.join(root, 'demo-1.0.0.zip')
    const stage = scratch('zip-stage-')
    const members = writeThemeZip({ srcRoot: path.join(root, 'src'), slug: 'demo', zipPath, scratch: stage })
    const listed = zipMembers(zipPath)
    assert.deepEqual(listed.map((m) => m.name).sort(), [
      'demo/',
      'demo/inc/',
      'demo/inc/a.php',
      'demo/inc/deep/',
      'demo/inc/deep/b.json',
      'demo/style.css'
    ])
    assert.deepEqual(listed.map((m) => m.name).sort(), [...members].sort())
    for (const m of listed) {
      assert.equal(m.perm, m.name.endsWith('/') ? 'drwxr-xr-x' : '-rw-r--r--', m.name)
      assert.equal(m.special, 0, m.name)
    }
    // The staging copy is gone; the tree itself was only read.
    assert.deepEqual(readdirNames(stage), [])
    assert.equal(statMode(path.join(tree, 'style.css')), 0o600)
    // Rebuilt after the zip was deleted, and over a stale zip: the same members, the same modes.
    rmSync(zipPath)
    writeThemeZip({ srcRoot: path.join(root, 'src'), slug: 'demo', zipPath, scratch: stage })
    assert.deepEqual(zipMembers(zipPath), listed)
    writeThemeZip({ srcRoot: path.join(root, 'src'), slug: 'demo', zipPath, scratch: stage })
    assert.deepEqual(zipMembers(zipPath), listed)
  } finally {
    process.umask(previous)
  }
})

test('the theme zip refuses anything but regular files and directories, and a missing tree', () => {
  const root = scratch('zip-kinds-')
  const tree = path.join(root, 'src', 'demo')
  mkdirSync(tree, { recursive: true })
  writeFileSync(path.join(tree, 'style.css'), 'x')
  symlinkSync('/etc/hosts', path.join(tree, 'link.txt'))
  const zipPath = path.join(root, 'demo.zip')
  writeFileSync(zipPath, 'an earlier build')
  const stage = scratch('zip-stage-')
  assert.throws(
    () => writeThemeZip({ srcRoot: path.join(root, 'src'), slug: 'demo', zipPath, scratch: stage }),
    /zip: demo\/link\.txt is neither a regular file nor a directory/
  )
  assert.equal(existsSync(zipPath), false)
  assert.deepEqual(readdirNames(stage), [])
  assert.throws(
    () => writeThemeZip({ srcRoot: path.join(root, 'src'), slug: 'nope', zipPath, scratch: stage }),
    /zip: .*nope is not a directory/
  )
})

function zipSha(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function demoTree(root) {
  const tree = path.join(root, 'src', 'demo')
  mkdirSync(path.join(tree, 'inc', 'deep'), { recursive: true })
  mkdirSync(path.join(tree, 'empty'), { recursive: true })
  writeFileSync(path.join(tree, 'style.css'), 'Theme Name: Demo\n')
  writeFileSync(path.join(tree, 'inc', 'a.php'), '<?php\n')
  writeFileSync(path.join(tree, 'inc', 'deep', 'b.json'), '{}\n')
  return tree
}

test('the theme zip is byte-identical for the same tree across paths, clocks and source metadata; one byte changes it', () => {
  const one = scratch('zip-det-a-')
  const two = scratch('zip-det-b-')
  const stage = scratch('zip-stage-')
  const treeOne = demoTree(one)
  const zipOne = path.join(one, 'demo.zip')
  writeThemeZip({ srcRoot: path.join(one, 'src'), slug: 'demo', zipPath: zipOne, scratch: stage })
  // Two seconds and more later (ZIP resolution), other source mtimes and modes, another path.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2200)
  const treeTwo = demoTree(two)
  for (const f of ['style.css', 'inc/a.php', 'inc/deep/b.json', 'inc', 'empty', '']) {
    utimesSync(path.join(treeTwo, f), 1_600_000_000, 1_600_000_000)
  }
  chmodSync(path.join(treeTwo, 'style.css'), 0o600)
  chmodSync(path.join(treeTwo, 'empty'), 0o700)
  const zipTwo = path.join(two, 'other-name.zip')
  writeThemeZip({ srcRoot: path.join(two, 'src'), slug: 'demo', zipPath: zipTwo, scratch: stage })
  assert.equal(zipSha(zipOne), zipSha(zipTwo))
  assert.deepEqual(
    zipMembers(zipOne)
      .map((m) => m.name)
      .sort(),
    [
      'demo/',
      'demo/empty/',
      'demo/inc/',
      'demo/inc/a.php',
      'demo/inc/deep/',
      'demo/inc/deep/b.json',
      'demo/style.css'
    ]
  )
  assert.deepEqual(readdirNames(stage), [])
  // One changed byte changes the archive.
  writeFileSync(path.join(treeOne, 'inc', 'a.php'), '<?php \n')
  const zipThree = path.join(one, 'changed.zip')
  writeThemeZip({ srcRoot: path.join(one, 'src'), slug: 'demo', zipPath: zipThree, scratch: stage })
  assert.notEqual(zipSha(zipOne), zipSha(zipThree))
  // A different explicit epoch changes it as well, and the default one is the documented constant.
  const zipFour = path.join(one, 'epoch.zip')
  writeThemeZip({
    srcRoot: path.join(one, 'src'),
    slug: 'demo',
    zipPath: zipFour,
    scratch: stage,
    epoch: 1_700_000_000
  })
  assert.notEqual(zipSha(zipThree), zipSha(zipFour))
  assert.equal(zipEpoch({}), ZIP_DEFAULT_EPOCH)
})

test('SOURCE_DATE_EPOCH is read strictly: integers inside the ZIP range only, even-second floor', () => {
  assert.equal(zipEpoch({ SOURCE_DATE_EPOCH: '1700000001' }), 1_700_000_000)
  assert.equal(zipEpoch({ SOURCE_DATE_EPOCH: '' }), ZIP_DEFAULT_EPOCH)
  for (const bad of [
    'abc',
    '1.5',
    '-1',
    '0',
    '315532799',
    '4354819199',
    '1e9',
    ' 1700000000',
    '99999999999999'
  ])
    assert.throws(() => zipEpoch({ SOURCE_DATE_EPOCH: bad }), /SOURCE_DATE_EPOCH/, bad)
})

function readdirNames(dir) {
  return readdirSync(dir)
}

function statMode(file) {
  return statSync(file).mode & 0o777
}

// Measured 30/09 on the stand `dsgnm` (site `dfbrandwp1`, brand basecamp.com): the home page is the
// `landing` artifact, the theme loads `assets/css/artifacts/landing/<id>.css`, a brand made at
// build time has no such file, and every other sheet is dequeued on an artifact page — so the home
// page rendered in Times New Roman (`shot` 49/100). Across the 152 sheets of one kind only the
// brand-derived custom properties differ; the rules are the same bytes. So the build writes one more
// sheet per kind whose varying properties read the theme.json variables of the look being worn.
test('a theme-driven artifact sheet reads the worn variation: mapped properties become theme variables, rules stay', () => {
  const css = `.tracy-artifact {
& {
      --brand-color-primary: #0071e3;
      --brand-color-primary-bg: #e6f6ff;
      --brand-font-family: 'SF Pro Text', ui-sans-serif;
      --brand-border-radius: 12px;
      --brand-presets-red-1: #fff1f0;
}
& { --display-family: 'SF Pro Display', ui-sans-serif, var(--brand-font-family); }
& .hero { color: var(--brand-color-primary); }
}`
  const out = themeDrivenArtifactCss(css)
  assert.match(out, /--brand-color-primary: var\(--wp--preset--color--accent, #0071e3\);/)
  assert.match(
    out,
    /--brand-color-primary-bg: color-mix\(in srgb, var\(--wp--preset--color--accent\) 10%, var\(--wp--preset--color--bg\)\);/
  )
  assert.match(
    out,
    /--brand-font-family: var\(--wp--preset--font-family--body, 'SF Pro Text', ui-sans-serif\);/
  )
  assert.match(out, /--brand-border-radius: var\(--wp--custom--radius--md, 12px\);/)
  assert.match(
    out,
    /--display-family: var\(--wp--preset--font-family--display\), var\(--brand-font-family\);/
  )
  // What no system varies keeps its value, and the rules are untouched.
  assert.match(out, /--brand-presets-red-1: #fff1f0;/)
  assert.match(out, /& \.hero \{ color: var\(--brand-color-primary\); \}/)
  // Every variable a mapping reads is one a variation defines (lib/variation.mjs → WP_VAR, or custom radius).
  const known = new Set([
    ...Object.values(WP_VAR),
    '--wp--custom--radius--sm',
    '--wp--custom--radius--md',
    '--wp--custom--radius--lg'
  ])
  for (const value of Object.values(THEME_DRIVEN))
    for (const [, name] of value.matchAll(/var\((--wp--[a-z0-9-]+)/g)) assert.ok(known.has(name), name)
})

test('the default target writes one theme-driven sheet per artifact kind; a quickstart target writes none', () => {
  const vendor = fixtureVendor([{ id: 'alpha' }, { id: 'beta' }])
  const { files } = plan({ vendorDir: vendor, srcDir: SRC, version: '0.0.0', target: targetOf('tracy') })
  for (const kind of ['landing', 'form', 'typography']) {
    const sheet = files.get(`assets/css/artifacts/${kind}/${THEME_ARTIFACT_FILE}`)
    assert.ok(sheet, kind)
    assert.match(sheet, /var\(--wp--preset--color--accent/)
    assert.ok(isGenerated(`assets/css/artifacts/${kind}/${THEME_ARTIFACT_FILE}`))
  }
  // Not a design-system id: functions.php only loads `<id>.css` for ids of `^[a-z0-9-]+$`.
  assert.doesNotMatch(THEME_ARTIFACT_FILE.replace(/\.css$/, ''), /^[a-z0-9-]+$/)
  const base = plan({
    vendorDir: VENDOR,
    srcDir: targetOf('tracy-base').srcDir,
    version: '0.0.0',
    target: targetOf('tracy-base')
  })
  assert.ok(![...base.files.keys()].some((rel) => rel.endsWith(THEME_ARTIFACT_FILE)))
})

test('a custom property that differs between systems but has no theme mapping stops the build by name', () => {
  const a = '& {\n  --brand-color-primary: #111111;\n  --brand-new-thing: 1px;\n  --same: 2px;\n}'
  const b = '& {\n  --brand-color-primary: #222222;\n  --brand-new-thing: 3px;\n  --same: 2px;\n}'
  assert.deepEqual(unmappedVarying([a, b]), ['--brand-new-thing'])
  assert.deepEqual(unmappedVarying([a, a]), [])
})

test('the committed sheets: every property that differs across the 152 systems has a theme mapping', () => {
  for (const kind of ['landing', 'form', 'typography']) {
    const dir = path.join(SRC, 'assets', 'css', 'artifacts', kind)
    const sheets = readdirSync(dir)
      .filter((f) => /^[a-z0-9-]+\.css$/.test(f))
      .map((f) => readFileSync(path.join(dir, f), 'utf8'))
    assert.ok(sheets.length > 100, kind)
    assert.deepEqual(unmappedVarying(sheets), [], kind)
  }
})

test('functions.php loads the theme-driven sheet by the name the build writes it under', () => {
  const php = readFileSync(path.join(SRC, 'functions.php'), 'utf8')
  assert.ok(php.includes(`assets/css/artifacts/$artifact/${THEME_ARTIFACT_FILE}`))
  assert.ok(php.includes("wp_get_global_stylesheet( array( 'variables' ) )"))
})
