// generate-docs.mjs — the shipped-documentation gate, on a fixture theme. Files only, no WordPress.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOC_NAMES,
  MARKER,
  buildInventory,
  checkDocs,
  parseArgs,
  parseHeader,
  referencesIn,
  UsageError
} from '../generate-docs.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(here, '..', 'generate-docs.mjs')
const FIXTURE = path.join(here, 'fixtures', 'package-docs', 'theme-min')
const SKELETON = path.join(here, '..', '..', 'assets', 'package-docs')

const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

/** A throwaway copy of the fixture theme with the skeleton docs (markers and all) on top. */
function stand() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gen-docs-'))
  cpSync(FIXTURE, dir, { recursive: true })
  cpSync(SKELETON, dir, { recursive: true })
  return dir
}

/** Replace every marker paragraph with a sentence, the way an author would. */
function fill(dir) {
  for (const rel of ['AGENTS.md', ...DOC_NAMES.map((n) => `docs/${n}.md`)]) {
    const p = path.join(dir, rel)
    writeFileSync(
      p,
      readFileSync(p, 'utf8').replace(/DOCS_REQUIRED:[^\n]*(\n[^\n]+)*/g, 'Filled for the fixture.')
    )
  }
}

test('the skeleton ships one marker per authored file, and the gate refuses it', () => {
  for (const rel of ['AGENTS.md', ...DOC_NAMES.map((n) => `docs/${n}.md`)]) {
    const body = readFileSync(path.join(SKELETON, rel), 'utf8')
    assert.equal(body.split(MARKER).length - 1, 1, `${rel} carries exactly one ${MARKER}`)
  }
  const dir = stand()
  try {
    assert.equal(run(['--theme', dir]).status, 0, 'generating never fails on markers')
    const r = run(['--theme', dir, '--check'])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /unfinished authored document: AGENTS\.md \(1 DOCS_REQUIRED: marker left\)/)
    assert.match(r.stderr, /unfinished authored document: docs\/content-model\.md/)
    assert.doesNotMatch(r.stderr, /missing generated file/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('filled docs + fresh inventory pass; a deleted doc, a changed theme file or a missing inventory fail', () => {
  const dir = stand()
  try {
    fill(dir)
    assert.equal(run(['--theme', dir, '--check']).status, 1, 'no inventory yet')
    const gen = run(['--theme', dir])
    assert.equal(gen.status, 0, gen.stderr)
    assert.match(gen.stdout, /1 templates, 0 parts, 1 patterns, 0 variations, 0 blocks, 0 enqueued assets/)
    assert.ok(existsSync(path.join(dir, 'docs', 'generated', 'inventory.json')))
    const ok = run(['--theme', dir, '--check'])
    assert.equal(ok.status, 0, ok.stderr)
    assert.equal(run(['--theme', dir]).stdout, gen.stdout, 'a rerun is byte-identical (no timestamps)')
    assert.equal(run(['--theme', dir, '--check']).status, 0)

    // The theme changed under the inventory.
    writeFileSync(
      path.join(dir, 'patterns', 'section-hero.php'),
      readFileSync(path.join(dir, 'patterns', 'section-hero.php'), 'utf8').replace('Lead', 'Lede')
    )
    const stale = run(['--theme', dir, '--check'])
    assert.equal(stale.status, 1)
    assert.match(stale.stderr, /stale generated file: docs\/generated\/inventory\.json/)
    run(['--theme', dir])
    assert.equal(run(['--theme', dir, '--check']).status, 0)

    // An authored document is gone.
    rmSync(path.join(dir, 'docs', 'install.md'))
    const missing = run(['--theme', dir, '--check'])
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /missing authored document: docs\/install\.md/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('inventory reads the fixture: header, presets, pattern content blocks, template references', () => {
  const inv = buildInventory({ theme: FIXTURE })
  assert.equal(inv.theme.header['Theme Name'], 'Fixture Min')
  assert.equal(inv.theme.header['Requires PHP'], '8.1')
  assert.equal(inv.theme.presets.palette.length, 2)
  assert.deepEqual(inv.theme.presets.fontSizes, ['base'])
  assert.equal(inv.theme.templates[0].name, 'index')
  assert.deepEqual(inv.theme.templates[0].parts, ['header'])
  assert.deepEqual(inv.theme.templates[0].patterns, ['fixture-min/section-hero'])
  const hero = inv.theme.patterns[0]
  assert.equal(hero.slug, 'fixture-min/section-hero')
  assert.equal(hero.contentBlocks, 2)
  assert.equal(hero.namedBlocks, 3)
  assert.deepEqual(hero.categories, ['fixture-min'])
  assert.equal(inv.theme.overlay, null)
  assert.equal(inv.spec, null)
  assert.equal(inv.seed, null)
  assert.ok(inv.theme.fingerprints['style.css'].startsWith('sha256:'))
  assert.equal(inv.theme.fingerprints['docs/architecture.md'], undefined, 'docs are not fingerprinted')
})

test('spec-pack and seed report are folded in and labelled as seed time', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gen-docs-spec-'))
  try {
    const spec = path.join(dir, 'spec')
    mkdirSync(spec)
    writeFileSync(
      path.join(spec, 'page-map.json'),
      JSON.stringify({
        pages: [
          { path: '/', view: 'front-page', title: 'Home' },
          { path: '/about', view: 'page', title: 'About' }
        ],
        gaps: [{}]
      })
    )
    writeFileSync(
      path.join(spec, 'menus.json'),
      JSON.stringify({
        menus: [{ menutype: 'main', title: 'Main', items: [{ children: [{ children: [] }] }] }]
      })
    )
    writeFileSync(path.join(spec, 'redirects.json'), JSON.stringify({ rules: [{ from: '/a', to: '/b' }] }))
    const report = path.join(dir, 'report.json')
    writeFileSync(
      report,
      JSON.stringify({
        startedAt: '2026-01-01T00:00:00.000Z',
        counts: {
          pages: { created: 2, updated: 0, skipped: 0 },
          navigation: { created: 1, updated: 0, skipped: 0 }
        },
        navigation: { main: 9 },
        templateParts: { header: 10 },
        redirects: [{}],
        sections: [
          { page: '/', kind: 'library', pattern: 'x/section-hero' },
          { page: '/', kind: 'html' }
        ],
        routes: [{ ok: true }, { ok: false }],
        media: { files: 3, imported: 3 },
        notes: [{ note: 'one note' }]
      })
    )
    const inv = buildInventory({ theme: FIXTURE, spec, seedReport: report })
    assert.equal(inv.spec.routes.length, 2)
    assert.deepEqual(inv.spec.routesByView, { 'front-page': 1, page: 1 })
    assert.deepEqual(inv.spec.menus, [{ slug: 'main', title: 'Main', items: 2 }])
    assert.equal(inv.spec.redirects, 1)
    assert.equal(inv.seed.label, 'at seed time, not live')
    assert.deepEqual(inv.seed.counts.pages, { total: 2, created: 2, updated: 0, skipped: 0 })
    assert.deepEqual(inv.seed.navigation, ['main'])
    assert.deepEqual(inv.seed.sections, {
      total: 2,
      byKind: { html: 1, library: 1 },
      byPattern: { 'x/section-hero': 1 },
      pages: 1
    })
    assert.deepEqual(inv.seed.routes, { checked: 2, ok: 1 })
    assert.deepEqual(inv.seed.notes, ['one note'])
    assert.equal(Object.keys(inv.seed).includes('navigationIds'), false, 'live ids are not copied')
    assert.equal(JSON.stringify(inv).includes('"main":9'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('arguments and helpers', () => {
  assert.throws(() => parseArgs([]), UsageError)
  assert.throws(() => parseArgs(['--theme']), UsageError)
  assert.throws(() => parseArgs(['--theme', 'x', '--bogus']), UsageError)
  assert.deepEqual(parseArgs(['--theme', 'x', '--check']), {
    theme: 'x',
    spec: null,
    seedReport: null,
    out: null,
    check: true
  })
  assert.throws(() => checkDocs({ theme: path.join(tmpdir(), 'no-such-theme-dir') }), UsageError)
  assert.deepEqual(parseHeader(' * Title: Hero\n * Slug: a/b\n', ['Title', 'Slug', 'Categories']), {
    Title: 'Hero',
    Slug: 'a/b'
  })
  const refs = referencesIn(
    '<!-- wp:template-part {"slug":"footer"} /-->\n<!-- wp:navigation {"ref":3} /-->\n<!-- wp:acme/thing {"a":1} -->\n<!-- wp:pattern {"slug":"x/y"} /-->'
  )
  assert.deepEqual(refs, {
    parts: ['footer'],
    patterns: ['x/y'],
    navigationBlocks: 1,
    customBlocks: ['acme/thing']
  })
})

/** A filled, generated theme in a directory named `slug`; `edit(dir)` changes it before the inventory is written. */
function standNamed(slug, edit) {
  const parent = mkdtempSync(path.join(tmpdir(), 'gen-docs-name-'))
  const dir = path.join(parent, slug)
  mkdirSync(dir)
  cpSync(FIXTURE, dir, { recursive: true })
  cpSync(SKELETON, dir, { recursive: true })
  fill(dir)
  const css = path.join(dir, 'style.css')
  writeFileSync(css, readFileSync(css, 'utf8').replace('Fixture Min', 'WP Impact'))
  writeFileSync(path.join(dir, 'readme.txt'), '=== WP Impact ===\nStable tag: 0.0.1\n')
  mkdirSync(path.join(dir, 'inc'))
  writeFileSync(
    path.join(dir, 'inc', 'patterns.php'),
    "<?php\nadd_action( 'init', function () {\n\t// JA Impact is the source template.\n\tregister_block_pattern_category( 'wp-ja-impact', array( 'label' => __( 'WP Impact', 'wp-ja-impact' ) ) );\n} );\n"
  )
  edit?.(dir)
  assert.equal(run(['--theme', dir]).status, 0)
  return { dir, parent }
}
const sub = (dir, rel, from, to) => {
  const p = path.join(dir, rel)
  writeFileSync(p, readFileSync(p, 'utf8').replace(from, to))
}

test('wp-ja theme naming: a WP name passes; JA copy in comments and content is ignored', () => {
  const { dir, parent } = standNamed('wp-ja-impact')
  try {
    const r = run(['--theme', dir, '--check'])
    assert.equal(r.status, 0, r.stderr)
    assert.match(readFileSync(path.join(dir, 'docs', 'generated', 'inventory.md'), 'utf8'), /WP Impact/)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

for (const [label, rel, from, to, expected] of [
  ['Theme Name', 'style.css', 'WP Impact', 'JA Impact', /style\.css Theme Name is "JA Impact".*"WP "/],
  ['readme title', 'readme.txt', '=== WP Impact ===', '=== JA Impact ===', /readme\.txt title is "=== JA Impact ===", expected "=== WP Impact ==="/],
  ['category label', 'inc/patterns.php', "'WP Impact', 'wp-ja", "'JA Impact', 'wp-ja", /inc\/patterns\.php pattern category label is "JA Impact", expected "WP Impact"/]
]) {
  test(`wp-ja theme naming: a JA ${label} fails the check`, () => {
    const { dir, parent } = standNamed('wp-ja-impact', (d) => sub(d, rel, from, to))
    try {
      const r = run(['--theme', dir, '--check'])
      assert.equal(r.status, 1)
      assert.match(r.stderr, expected)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })
}

test('wp-ja theme naming: a non-wp-ja slug is not touched', () => {
  const { dir, parent } = standNamed('other-theme', (d) => {
    sub(d, 'style.css', 'WP Impact', 'JA Impact')
    sub(d, 'readme.txt', 'WP Impact', 'JA Impact')
    sub(d, 'inc/patterns.php', "'WP Impact', 'wp-ja", "'JA Impact', 'wp-ja")
  })
  try {
    const r = run(['--theme', dir, '--check'])
    assert.equal(r.status, 0, r.stderr)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('wp-ja theme naming: missing readme, dynamic or unparsable label fail and nothing is written', () => {
  const cases = [
    ['readme.txt', (d) => rmSync(path.join(d, 'readme.txt')), /readme\.txt is missing/],
    ['dynamic', (d) => sub(d, 'inc/patterns.php', "__( 'WP Impact', 'wp-ja-impact' )", '$label'), /not a static string/],
    ['broken', (d) => writeFileSync(path.join(d, 'inc', 'patterns.php'), '<?php register_block_pattern_category( ;'), /cannot be parsed/]
  ]
  for (const [, edit, expected] of cases) {
    const { dir, parent } = standNamed('wp-ja-impact')
    try {
      edit(dir)
      const before = readFileSync(path.join(dir, 'docs', 'generated', 'inventory.json'), 'utf8')
      const r = run(['--theme', dir, '--check'])
      assert.equal(r.status, 1)
      assert.match(r.stderr, expected)
      assert.equal(readFileSync(path.join(dir, 'docs', 'generated', 'inventory.json'), 'utf8'), before)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  }
})

test('wp-ja theme naming: a JA category label is found in any PHP file and under any spelling of the call', () => {
  const reg = (call) => `<?php\n${call}( 'wp-ja-impact', array( 'label' => 'JA Impact' ) );\n`
  const cases = [
    ['includes/', (d) => { mkdirSync(path.join(d, 'includes'), { recursive: true }); writeFileSync(path.join(d, 'includes', 'categories.php'), reg('register_block_pattern_category')) }, /includes\/categories\.php pattern category label is "JA Impact", expected "WP Impact"/],
    ['patterns/', (d) => { mkdirSync(path.join(d, 'patterns'), { recursive: true }); writeFileSync(path.join(d, 'patterns', 'x.php'), reg('register_block_pattern_category')) }, /patterns\/x\.php pattern category label is "JA Impact"/],
    ['qualified', (d) => writeFileSync(path.join(d, 'inc', 'patterns.php'), reg('\\register_block_pattern_category')), /inc\/patterns\.php pattern category label is "JA Impact"/],
    ['upper case', (d) => writeFileSync(path.join(d, 'inc', 'patterns.php'), reg('REGISTER_BLOCK_PATTERN_CATEGORY')), /inc\/patterns\.php pattern category label is "JA Impact"/],
    ['function name as string', (d) => writeFileSync(path.join(d, 'inc', 'patterns.php'), "<?php\ncall_user_func( 'register_block_pattern_category', 'wp-ja-impact', array( 'label' => 'JA Impact' ) );\n"), /inc\/patterns\.php registers a pattern category whose label is not a static string/]
  ]
  for (const [, edit, expected] of cases) {
    const { dir, parent } = standNamed('wp-ja-impact', edit)
    try {
      const r = run(['--theme', dir, '--check'])
      assert.equal(r.status, 1, r.stderr)
      assert.match(r.stderr, expected)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  }
})

test('wp-ja theme naming: a link in place of inc/ or any directory of the theme is refused', () => {
  const { dir, parent } = standNamed('wp-ja-impact')
  try {
    renameSync(path.join(dir, 'inc'), path.join(parent, 'real-inc'))
    symlinkSync(path.join(parent, 'real-inc'), path.join(dir, 'inc'))
    const r = spawnSync(process.execPath, [SCRIPT, '--theme', dir, '--check'], { encoding: 'utf8', timeout: 20000 })
    assert.equal(r.status, 1, `${r.error ?? ''}${r.stderr}`)
    assert.match(r.stderr, /inc is a link or special file/)
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})

test('wp-ja theme naming: links and FIFOs are refused before they are read', () => {
  const cases = [
    ['style.css FIFO', (d) => { rmSync(path.join(d, 'style.css')); execFileSync('mkfifo', [path.join(d, 'style.css')]) }, /style\.css is not a regular file/],
    ['style.css link', (d) => { rmSync(path.join(d, 'style.css')); symlinkSync(path.join(d, 'readme.txt'), path.join(d, 'style.css')) }, /style\.css is not a regular file/],
    ['readme.txt FIFO', (d) => { rmSync(path.join(d, 'readme.txt')); execFileSync('mkfifo', [path.join(d, 'readme.txt')]) }, /readme\.txt is not a regular file/],
    ['inc php link', (d) => symlinkSync(path.join(d, 'inc', 'patterns.php'), path.join(d, 'inc', 'more.php')), /inc\/more\.php is a link or special file/]
  ]
  for (const [, edit, expected] of cases) {
    const { dir, parent } = standNamed('wp-ja-impact')
    try {
      edit(dir)
      const r = spawnSync(process.execPath, [SCRIPT, '--theme', dir, '--check'], { encoding: 'utf8', timeout: 20000 })
      assert.equal(r.status, 1, `${r.error ?? ''}${r.stderr}`)
      assert.match(r.stderr, expected)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  }
})
