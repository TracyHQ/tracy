// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/test/spec-pack.test.mjs — WordPress changes: the fixture uses WordPress template names and a theme slug; new cases cover the 404/search requirement, the slug rule, the view vocabulary, --page-floor and the default dark hook in the design-contract skeleton.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { machine, testBase, withHome } from './lib/test-root.mjs'
import { addPassingDomBrowserFixture } from './dom-source-font-fixtures.mjs'
import {
  validateSpecPack,
  initSpecPack,
  PAGE_FLOOR,
  REQUIRED_VIEWS,
  DEFAULT_THEME_HOOK
} from '../ingest/spec-pack.mjs'

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── fixture builder ───────────────────────────────────────────────────────────
// Builds a spec-pack that PASSES, so each test can break exactly one thing and
// assert that the validator notices. If the baseline ever stops passing, every
// negative test below becomes vacuous — so test 1 pins it.

function makePages(n) {
  // start with one page per required view, pad to n with single posts
  const pages = REQUIRED_VIEWS.map((view, i) => ({ file: `req-${i}.html`, view }))
  while (pages.length < n) {
    pages.push({ file: `page-${pages.length}.html`, view: 'single' })
  }
  return pages
}

const packTops = []
function buildPack(overrides = {}) {
  // The pack sits two levels down in its own scratch directory: the cases whose reference escapes the pack (`../../OUT-…`)
  // then write inside that directory, which is removed after the run, not beside the scratch root.
  const top = mkdtempSync(join(testBase(), 'specpack-'))
  packTops.push(top)
  const dir = join(top, 'nest', 'pack')
  mkdirSync(join(dir, 'reference'), { recursive: true })

  const pages = overrides.pages ?? makePages(PAGE_FLOOR)

  const pageMap = {
    template: { name: 'acme', title: 'Acme' },
    theme: {
      palette: {
        light: { primary: '#2f6bff', secondary: '#1b2a4a', body_bg: '#ffffff', text: '#1a1a1a' },
        dark: { primary: '#5b8cff', secondary: '#9db4e6', body_bg: '#0e1116', text: '#e6e8eb' }
      },
      fonts: { body: 'Inter', heading: 'Poppins' }
    },
    templateParts: ['header', 'footer'],
    pages,
    ...overrides.pageMap
  }
  writeFileSync(join(dir, 'page-map.json'), JSON.stringify(pageMap, null, 2))

  writeFileSync(join(dir, 'content.json'), JSON.stringify({
    site: { name: 'Acme' }, categories: [], pages: [], posts: [], archives: []
  }))
  writeFileSync(join(dir, 'sections.json'), JSON.stringify({ acm: [], custom: [], other: [] }))
  writeFileSync(join(dir, 'menus.json'), JSON.stringify({ menus: [] }))
  writeFileSync(join(dir, 'redirects.json'), JSON.stringify({ rules: [] }))

  // a design-spec with NO "TODO" anywhere
  writeFileSync(
    join(dir, 'design-spec.md'),
    overrides.designSpec ?? '# Design Spec — Acme\n\nPalette, type and spacing all resolved.\n'
  )

  const refPages = overrides.refPages ?? pages.map((p) => ({ page: p.file, path: `reference/${p.file}` }))
  for (const rp of refPages) {
    if (rp.path) writeFileSync(join(dir, rp.path), '<!doctype html><title>x</title><body>x</body>')
    if (rp.shots) for (const k of Object.keys(rp.shots)) writeFileSync(join(dir, rp.shots[k]), 'PNGDATA')
  }

  writeFileSync(
    join(dir, 'reference.json'),
    JSON.stringify(
      {
        kind: overrides.kind ?? 'html',
        viewports: overrides.viewports ?? [1440, 768, 390],
        modes: overrides.modes ?? ['light', 'dark'],
        pages: refPages
      },
      null,
      2
    )
  )

  writeFileSync(
    join(dir, 'provenance.json'),
    JSON.stringify(
      {
        adapter: 'from-html',
        source: { kind: 'html-bundle', path: '/tmp/bundle' },
        generatedAt: new Date().toISOString()
      },
      null,
      2
    )
  )

  writeFileSync(join(dir, 'source-fonts.json'), JSON.stringify({
    schema: 'tracy.source-fonts/1', siteUrl: 'https://source.invalid',
    static: { schema: 'tracy.source-fonts-dom-static/1', complete: true, gaps: [], fingerprint: 'fixture', pages: pages.flatMap((p) => [1440, 390].map((width) => ({ route: p.path ?? `/${p.file}`, file: p.file, width, htmlSha256: 'fixture-html-hash' }))), roles: {}, fontFaces: [], loaders: [], sheets: [], fonts: [] },
    browser: null, findings: []
  }, null, 2))
  addPassingDomBrowserFixture(dir)

  writeFileSync(
    join(dir, 'content-contract.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'acme',
      revision: 1,
      mode: 'demo',
      language: 'en',
      identity: { name: 'company.name', summary: 'company.summary', disclosure: 'demo.disclosure' },
      voice: ['Plain English'],
      pending: [],
      sources: { fixture: { kind: 'demo', reference: 'test fixture', note: 'Fictional test company' } },
      facts: Object.fromEntries(
        Object.entries({
          'company.name': 'Acme',
          'company.summary': 'Example studio',
          'demo.disclosure': 'Illustrative demo'
        }).map(([key, value]) => [key, { value, status: 'demo', source: 'fixture' }])
      ),
      surfaces: pageMap.pages.map((page) => ({ id: page.file, purpose: 'Test view', requiredFacts: [] }))
    })
  )

  const design = JSON.parse(readFileSync(join(SKILL_DIR, 'examples/design-contract.json'), 'utf8'))
  design.pages = pageMap.pages.map((page) => ({
    ...design.pages[0],
    id: page.file,
    url: 'https://example.test/' + page.file,
    expectedUrl: 'https://example.test/' + page.file
  }))
  design.pilotPages = [pageMap.pages[0].file]
  writeFileSync(join(dir, 'design-contract.json'), JSON.stringify(design))

  return dir
}

const packs = []
function pack(overrides) {
  const d = buildPack(overrides)
  packs.push(d)
  return d
}
test.after(() => {
  for (const d of [...packs, ...packTops]) rmSync(d, { recursive: true, force: true })
})

/** assert the validator failed, and that some problem mentions `needle` */
function assertFails(dir, needle) {
  const { ok, problems } = validateSpecPack(dir)
  assert.equal(ok, false, `expected validation to FAIL but it passed`)
  assert.ok(
    problems.some((p) => p.includes(needle)),
    `expected a problem mentioning "${needle}", got:\n  ${problems.join('\n  ')}`
  )
}

// ── 1. the baseline must pass ─────────────────────────────────────────────────

test('a complete spec-pack validates', () => {
  const { ok, problems, stats } = validateSpecPack(pack())
  assert.equal(ok, true, `expected pass, got problems:\n  ${problems.join('\n  ')}`)
  assert.equal(stats.pageCount, PAGE_FLOOR)
  assert.equal(stats.kind, 'html')
  assert.equal(stats.checkedTargets, PAGE_FLOOR)
})

// ── 2. each failure class, one at a time ──────────────────────────────────────

test('rejects a missing required file', () => {
  const dir = pack()
  rmSync(join(dir, 'reference.json'))
  assertFails(dir, 'missing required file: reference.json')
})

for (const file of ['content.json', 'sections.json', 'menus.json', 'redirects.json']) {
  test(`rejects a missing seeder payload: ${file}`, () => {
    const dir = pack()
    rmSync(join(dir, file))
    assertFails(dir, `missing seed payload: ${file}`)
  })

  test(`rejects an unparseable seeder payload: ${file}`, () => {
    const dir = pack()
    writeFileSync(join(dir, file), '{')
    assertFails(dir, `${file} is not valid JSON`)
  })
}

test('rejects seed payloads with an invalid top-level shape', () => {
  const dir = pack()
  writeFileSync(join(dir, 'menus.json'), JSON.stringify({ menus: {} }))
  assertFails(dir, 'menus.json key "menus" must be an array')
})

test('sections.json may omit optional custom and other lists', () => {
  const dir = pack()
  writeFileSync(join(dir, 'sections.json'), JSON.stringify({ acm: [] }))
  const { ok, problems } = validateSpecPack(dir)
  assert.equal(ok, true, `expected pass, got:\n  ${problems.join('\n  ')}`)
})

test('rejects a missing section list read without a default', () => {
  const dir = pack()
  writeFileSync(join(dir, 'sections.json'), JSON.stringify({ custom: [], other: [] }))
  assertFails(dir, 'sections.json is missing required key "acm"')
})

test('rejects an optional section list with the wrong type', () => {
  const dir = pack()
  writeFileSync(join(dir, 'sections.json'), JSON.stringify({ acm: [], custom: {} }))
  assertFails(dir, 'sections.json optional key "custom" must be an array when present')
})

test('rejects unsafe template names', () => {
  assertFails(pack({ pageMap: { template: { name: '../acme', title: 'Acme' } } }), 'must match')
})

test('rejects an empty template title', () => {
  assertFails(pack({ pageMap: { template: { name: 'acme', title: '   ' } } }), 'title is missing or empty')
})

test('rejects a missing light palette slot', () => {
  const dir = pack({
    pageMap: {
      theme: {
        palette: { light: { primary: '#fff', secondary: '#000', body_bg: '#fff' }, dark: null },
        fonts: { body: 'Inter' }
      }
    }
  })
  assertFails(dir, 'palette.light.text is missing')
})

test('rejects an unparseable colour', () => {
  const dir = pack({
    pageMap: {
      theme: {
        palette: {
          light: { primary: 'not a colour!!', secondary: '#000', body_bg: '#fff', text: '#111' },
          dark: null
        },
        fonts: { body: 'Inter' }
      }
    }
  })
  assertFails(dir, 'is not a parseable CSS colour')
})

const LIGHT_ONLY = {
  palette: {
    light: { primary: '#2f6bff', secondary: '#1b2a4a', body_bg: '#ffffff', text: '#1a1a1a' },
    dark: null
  },
  fonts: { body: 'Inter' }
}

test('rejects a null dark palette when the pack does not declare it derived', () => {
  assertFails(pack({ pageMap: { theme: LIGHT_ONLY } }), 'set page-map.theme.darkDerived = true')
})

test('ACCEPTS a null dark palette when theme.darkDerived is true', () => {
  const dir = pack({
    pageMap: { theme: { ...LIGHT_ONLY, darkDerived: true } },
    modes: ['light']
  })
  const { ok, problems } = validateSpecPack(dir)
  assert.equal(ok, true, `expected pass, got:\n  ${problems.join('\n  ')}`)
})

test('prose in design-spec.md CANNOT unlock a null dark palette', () => {
  // This is the whole point of moving the declaration into data: a sentence that *denies*
  // derivation used to satisfy the old regex and silently disabled the modes check too.
  for (const prose of [
    'We do NOT derive dark; it is authored by hand.',
    'Never derive the dark palette from light.',
    'dark is derived — but only in a later project, not here'
  ]) {
    assertFails(
      pack({ pageMap: { theme: LIGHT_ONLY }, designSpec: `# Spec\n\n${prose}\n` }),
      'set page-map.theme.darkDerived = true'
    )
  }
})

test('rejects darkDerived alongside an explicit dark palette', () => {
  assertFails(
    pack({
      pageMap: {
        theme: {
          ...LIGHT_ONLY,
          darkDerived: true,
          palette: {
            light: LIGHT_ONLY.palette.light,
            dark: { primary: '#5b8cff', secondary: '#9db4e6', body_bg: '#0e1116', text: '#e6e8eb' }
          }
        }
      }
    }),
    'say which one is authoritative'
  )
})

test('rejects a page count under the coverage floor', () => {
  assertFails(
    pack({ pages: makePages(PAGE_FLOOR).slice(0, PAGE_FLOOR - 1) }),
    `the coverage floor is ${PAGE_FLOOR}`
  )
})

test('rejects a missing required view', () => {
  // 404 and search are the two a static bundle most often lacks — nobody exports an error page.
  for (const required of ['404', 'search', 'front-page', 'category']) {
    const pages = makePages(PAGE_FLOOR).map((p) => (p.view === required ? { ...p, view: 'single' } : p))
    assertFails(pack({ pages }), `required view "${required}"`)
  }
})

test('rejects a view outside the WordPress template vocabulary', () => {
  const pages = makePages(PAGE_FLOOR)
  pages[PAGE_FLOOR - 1] = { ...pages[PAGE_FLOOR - 1], view: 'com_content.article' }
  assertFails(pack({ pages }), '"com_content.article" is not a WordPress template name')
})

test('accepts page-<name> templates and header/footer parts as views', () => {
  const pages = makePages(PAGE_FLOOR)
  pages[PAGE_FLOOR - 3] = { ...pages[PAGE_FLOOR - 3], view: 'page-contact' }
  pages[PAGE_FLOOR - 2] = { ...pages[PAGE_FLOOR - 2], view: 'header' }
  pages[PAGE_FLOOR - 1] = { ...pages[PAGE_FLOOR - 1], view: 'footer' }
  const { ok, problems } = validateSpecPack(pack({ pages }))
  assert.equal(ok, true, `expected pass, got:\n  ${problems.join('\n  ')}`)
})

test('rejects an unresolved `TODO` slot in design-spec.md', () => {
  assertFails(
    pack({ designSpec: '# Design Spec\n\n- Dark hook: `TODO` — pin in Phase 0\n' }),
    'unresolved `TODO` slot'
  )
})

test('the word TODO in prose is NOT a slot', () => {
  // make-design-spec.mjs writes an instructional header that talks about slots. Matching the bare
  // word made the generator emit a file that could never pass its own gate.
  const dir = pack({
    designSpec: '# Design Spec\n\n> Resolve every slot before dispatching. This is not a TODO list.\n'
  })
  const { ok, problems } = validateSpecPack(dir)
  assert.equal(ok, true, `expected pass, got:\n  ${problems.join('\n  ')}`)
})

test('the generator output can actually reach a passing state', async () => {
  // Regression guard for the circular workflow: generate → resolve slots → must validate.
  const { execFileSync } = await import('node:child_process')
  const { readFileSync: rf } = await import('node:fs')
  const dir = pack()
  execFileSync('node', [
    join(SKILL_DIR, 'scripts/make-design-spec.mjs'),
    join(dir, 'page-map.json'),
    '--out',
    join(dir, 'design-spec.md')
  ])
  // sanity: the generator really did leave slots to resolve
  assert.ok(/`TODO`/.test(rf(join(dir, 'design-spec.md'), 'utf8')), 'generator emitted no slots')
  assertFails(dir, 'unresolved `TODO` slot')

  // resolve them all, exactly as the operator would
  const resolved = rf(join(dir, 'design-spec.md'), 'utf8').replace(/`TODO`/g, '`resolved`')
  writeFileSync(join(dir, 'design-spec.md'), resolved)
  const { ok, problems } = validateSpecPack(dir)
  assert.equal(
    ok,
    true,
    `generator output could not be completed into a valid pack:\n  ${problems.join('\n  ')}`
  )
})

test('rejects an empty design-spec.md', () => {
  assertFails(pack({ designSpec: '   \n' }), 'design-spec.md is empty')
})

test('rejects a dangling reference path', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p) => ({ page: p.file, path: `reference/${p.file}` }))
  const dir = pack({ pages, refPages })
  rmSync(join(dir, refPages[0].path)) // the file the pack claims to compare against
  assertFails(dir, 'points at a missing file')
})

test('rejects an empty reference file', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p) => ({ page: p.file, path: `reference/${p.file}` }))
  const dir = pack({ pages, refPages })
  writeFileSync(join(dir, refPages[0].path), '')
  assertFails(dir, 'reference file is empty')
})

test('rejects a page with no reference entry', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.slice(1).map((p) => ({ page: p.file, path: `reference/${p.file}` }))
  assertFails(pack({ pages, refPages }), 'has no entry in reference.json')
})

test('rejects an invalid reference kind', () => {
  assertFails(pack({ kind: 'screenshot' }), 'must be one of')
})

test('rejects viewports with no mobile width', () => {
  assertFails(pack({ viewports: [1440, 1280] }), 'must include a mobile width')
})

test('rejects viewports with no desktop width', () => {
  assertFails(pack({ viewports: [390, 768] }), 'must include a desktop width')
})

test('rejects modes missing dark when dark is not declared derived', () => {
  assertFails(pack({ modes: ['light'] }), 'must contain both')
})

test('rejects a url-kind page with no url', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p, i) =>
    i === 0 ? { page: p.file } : { page: p.file, url: 'https://example.com/x' }
  )
  assertFails(pack({ kind: 'url', pages, refPages }), 'is missing "url"')
})

test('rejects a url-kind page with a non-http url', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p) => ({ page: p.file, url: 'ftp://example.com/x' }))
  assertFails(pack({ kind: 'url', pages, refPages }), 'is not http(s)')
})

test('rejects an image-kind page with no shots', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p) => ({ page: p.file }))
  assertFails(pack({ kind: 'image', pages, refPages }), 'has no "shots"')
})

test('rejects an image-kind page whose shot file is missing', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p) => ({
    page: p.file,
    shots: { light: `reference/${p.file}.light.png`, dark: `reference/${p.file}.dark.png` }
  }))
  const dir = pack({ kind: 'image', pages, refPages })
  rmSync(join(dir, refPages[0].shots.dark))
  assertFails(dir, 'points at a missing file')
})

test('kind "none" needs no reference targets but still enforces the rest', () => {
  const pages = makePages(PAGE_FLOOR)
  const dir = pack({ kind: 'none', pages, refPages: pages.map((p) => ({ page: p.file })) })
  const { ok, problems, stats } = validateSpecPack(dir)
  assert.equal(ok, true, `expected pass, got:\n  ${problems.join('\n  ')}`)
  assert.equal(stats.checkedTargets, 0)

  // ...but the page floor still applies
  const thin = pack({
    kind: 'none',
    pages: pages.slice(0, 3),
    refPages: pages.slice(0, 3).map((p) => ({ page: p.file }))
  })
  assertFails(thin, 'coverage floor')
})

test('rejects provenance with no adapter', () => {
  const dir = pack()
  writeFileSync(join(dir, 'provenance.json'), JSON.stringify({ source: {}, generatedAt: 'x' }))
  assertFails(dir, 'provenance.json.adapter is missing')
})

test('reports malformed JSON rather than throwing', () => {
  const dir = pack()
  writeFileSync(join(dir, 'page-map.json'), '{ not json')
  const { ok, problems } = validateSpecPack(dir)
  assert.equal(ok, false)
  assert.ok(problems[0].includes('not valid JSON'))
})

// ── 3. bypasses that used to slip through ─────────────────────────────────────

test('rejects a made-up colour word', () => {
  const dir = pack({
    pageMap: {
      theme: {
        palette: {
          light: { primary: 'banana', secondary: '#000', body_bg: '#fff', text: '#111' },
          dark: null
        },
        fonts: { body: 'Inter' },
        darkDerived: true
      }
    },
    modes: ['light']
  })
  assertFails(dir, '"banana" is not a parseable CSS colour')
})

test('accepts real CSS colour forms', () => {
  for (const c of [
    '#fff',
    '#ffffff',
    '#ffffffff',
    'rgb(1,2,3)',
    'rgba(1,2,3,.5)',
    'hsl(1 2% 3%)',
    'oklch(0.7 0.1 200)',
    'white',
    'rebeccapurple',
    'transparent'
  ]) {
    const dir = pack({
      pageMap: {
        theme: {
          palette: {
            light: { primary: c, secondary: '#000', body_bg: '#fff', text: '#111' },
            dark: null
          },
          fonts: { body: 'Inter' },
          darkDerived: true
        }
      },
      modes: ['light']
    })
    const { ok, problems } = validateSpecPack(dir)
    assert.equal(ok, true, `"${c}" should be a valid colour, got:\n  ${problems.join('\n  ')}`)
  }
})

test('duplicate page filenames cannot satisfy the coverage floor', () => {
  // 12 copies of one page is not 12 pages.
  const one = { file: 'req-0.html', view: 'front-page' }
  const pages = Array.from({ length: PAGE_FLOOR }, () => ({ ...one }))
  assertFails(
    pack({ pages, refPages: [{ page: 'req-0.html', path: 'reference/req-0.html' }] }),
    'is a duplicate'
  )
})

test('rejects a reference path that escapes the pack', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p) => ({ page: p.file, path: `../../OUTSIDE-${p.file}` }))
  assertFails(pack({ pages, refPages }), 'escapes the spec-pack')
})

test('rejects an image shot that escapes the pack', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p) => ({ page: p.file, shots: { light: `../../OUT-${p.file}.png` } }))
  assertFails(pack({ kind: 'image', pages, refPages }), 'escapes the spec-pack')
})

test('a page cannot opt out of verification with kind "none"', () => {
  const pages = makePages(PAGE_FLOOR)
  const refPages = pages.map((p) => ({ page: p.file, kind: 'none' }))
  assertFails(pack({ kind: 'html', pages, refPages }), 'cannot opt out of verification')
})

test('rejects non-numeric viewports', () => {
  assertFails(pack({ viewports: ['tiny', 390, 1440, {}] }), 'must be positive numbers')
})

test('rejects a page entry with no file', () => {
  const pages = makePages(PAGE_FLOOR)
  pages[3] = { view: 'single' } // no `file`
  assertFails(pack({ pages }), 'pages[3].file is missing')
})

test('rejects a missing light palette entirely', () => {
  assertFails(
    pack({ pageMap: { theme: { palette: { dark: null }, fonts: { body: 'Inter' }, darkDerived: true } } }),
    'palette.light is missing'
  )
})

test('rejects a bad colour in the DARK palette too', () => {
  assertFails(
    pack({
      pageMap: {
        theme: {
          palette: {
            light: { primary: '#2f6bff', secondary: '#1b2a4a', body_bg: '#ffffff', text: '#1a1a1a' },
            dark: { primary: 'nope-not-a-colour', secondary: '#9db4e6', body_bg: '#0e1116', text: '#e6e8eb' }
          },
          fonts: { body: 'Inter' }
        }
      }
    }),
    'palette.dark.primary "nope-not-a-colour" is not a parseable CSS colour'
  )
})

test('rejects a missing body font', () => {
  assertFails(
    pack({
      pageMap: {
        theme: {
          palette: {
            light: { primary: '#2f6bff', secondary: '#1b2a4a', body_bg: '#ffffff', text: '#1a1a1a' },
            dark: null
          },
          fonts: { heading: 'Poppins' },
          darkDerived: true
        }
      },
      modes: ['light']
    }),
    'fonts.body is missing'
  )
})

test('rejects provenance with no source or no timestamp', () => {
  for (const [missing, needle] of [
    ['source', 'provenance.json.source is missing'],
    ['generatedAt', 'provenance.json.generatedAt is missing']
  ]) {
    const dir = pack()
    const prov = { adapter: 'from-html', source: { kind: 'x' }, generatedAt: 'now' }
    delete prov[missing]
    writeFileSync(join(dir, 'provenance.json'), JSON.stringify(prov))
    assertFails(dir, needle)
  }
})

// ── 4. initSpecPack ───────────────────────────────────────────────────────────

test('initSpecPack refuses to overwrite an existing pack', () => {
  const dir = pack()
  assert.throws(
    () => initSpecPack(dir, { pageMap: { pages: [] } }),
    /already exists/,
    'a second adapter run must not silently discard hand-completed work'
  )
})

test('initSpecPack overwrites only with force', () => {
  const dir = pack()
  const res = initSpecPack(dir, { pageMap: { pages: [{ file: 'a.html' }] }, force: true })
  assert.equal(res.reference.pages.length, 1)
})

test('initSpecPack writes sane defaults and owns the sidecar keys', () => {
  const dir = mkdtempSync(join(testBase(), 'init-'))
  packs.push(dir)
  const res = initSpecPack(dir, {
    // a caller must not be able to redirect these two
    pageMap: { pages: [{ file: 'a.html' }], reference: 'evil.json', provenance: 'evil.json' },
    adapter: 'from-test'
  })
  const map = JSON.parse(readFileSync(join(dir, 'page-map.json'), 'utf8'))
  assert.equal(map.reference, 'reference.json')
  assert.equal(map.provenance, 'provenance.json')
  // defaults must satisfy the validator's own viewport/mode rules
  assert.ok(
    res.reference.viewports.some((v) => v <= 430),
    'default viewports need a mobile width'
  )
  assert.ok(
    res.reference.viewports.some((v) => v >= 1280),
    'default viewports need a desktop width'
  )
  assert.deepEqual(res.reference.modes, ['light', 'dark'])
  assert.equal(res.provenance.adapter, 'from-test')
  assert.ok(res.provenance.generatedAt, 'provenance must be timestamped')
})

// ── 5. the CLI layer (previously untested — this is where the silent-pass bug lived) ──

test('the CLI reports invalid packs with exit 1, through symlinked and awkward paths', async () => {
  const { execFileSync } = await import('node:child_process')
  const { symlinkSync, cpSync } = await import('node:fs')

  const empty = mkdtempSync(join(testBase(), 'emptypack-'))
  packs.push(empty)
  const good = pack()

  // The recommended install symlinks the skill into ~/.claude/skills, and macOS /tmp is itself a
  // symlink — both used to make the CLI block silently not run, exiting 0 with no output.
  const linkRoot = mkdtempSync(join(testBase(), 'symroot-'))
  packs.push(linkRoot)
  symlinkSync(SKILL_DIR, join(linkRoot, 'skill'))

  const spaced = mkdtempSync(join(testBase(), 'sp ace-'))
  packs.push(spaced)
  cpSync(join(SKILL_DIR, 'scripts'), join(spaced, 'scripts'), { recursive: true })

  const entries = [
    ['direct', join(SKILL_DIR, 'scripts/ingest/spec-pack.mjs')],
    ['symlinked install', join(linkRoot, 'skill/scripts/ingest/spec-pack.mjs')],
    ['path with a space', join(spaced, 'scripts/ingest/spec-pack.mjs')]
  ]

  for (const [label, script] of entries) {
    // invalid pack → exit 1 AND a message
    let code = 0,
      stderr = ''
    try {
      execFileSync('node', [script, '--validate', empty], { stdio: 'pipe' })
    } catch (e) {
      code = e.status
      stderr = String(e.stderr)
    }
    assert.equal(code, 1, `${label}: expected exit 1 on an invalid pack, got ${code}`)
    assert.match(stderr, /INVALID/, `${label}: expected a printed reason`)

    // valid pack → exit 0 AND a message (silence is not a pass)
    const stdout = execFileSync('node', [script, '--validate', good], { encoding: 'utf8' })
    assert.match(stdout, /spec-pack OK/, `${label}: a passing run must SAY it passed`)
  }
})

test('the CLI exits 2 on a missing pack dir and 2 with no args', async () => {
  const { execFileSync } = await import('node:child_process')
  const script = join(SKILL_DIR, 'scripts/ingest/spec-pack.mjs')
  for (const args of [['--validate', join(testBase(), 'does-not-exist-xyz')], []]) {
    let code = 0
    try {
      execFileSync('node', [script, ...args], { stdio: 'pipe' })
    } catch (e) {
      code = e.status
    }
    assert.equal(code, 2, `expected usage//not-found exit 2 for args ${JSON.stringify(args)}`)
  }
})

for (const mode of ['website', 'edit']) {
  test(`${mode} validates the agreed small page set without template distribution floor`, () => {
    const pages = [{ file: 'home.html', view: 'front-page' }]
    const d = pack({
      pages,
      pageMap: { scope: { mode, reason: 'One requested landing page', pages: ['home.html'] } }
    })
    assert.equal(validateSpecPack(d).ok, true)
    const m = JSON.parse(readFileSync(join(d, 'page-map.json')))
    m.scope.pages.push('missing.html')
    writeFileSync(join(d, 'page-map.json'), JSON.stringify(m))
    assertFails(d, 'exactly match')
  })
}
test('accepts WordPress theme slugs', () => {
  for (const name of ['acme', 'tracy-apple', 'acme2', 'a'])
    assert.equal(validateSpecPack(pack({ pageMap: { template: { name, title: 'Acme' } } })).ok, true, name)
})

test('rejects a theme name that is not a slug', () => {
  // A theme directory that is not a slug breaks the text domain, the style.css header and every
  // `wp theme activate <slug>` in the quickstart — and WordPress reports none of it.
  for (const name of ['ja_acme', 'tracy_apple', 'Acme', '1acme', '-acme', 'acme theme', 'acme.theme'])
    assertFails(pack({ pageMap: { template: { name, title: 'Acme' } } }), 'must match')
})

test('--page-floor lowers the coverage floor without touching the required views', async () => {
  const { execFileSync } = await import('node:child_process')
  const script = join(SKILL_DIR, 'scripts/ingest/spec-pack.mjs')
  const dir = pack({ pages: makePages(REQUIRED_VIEWS.length) }) // 6 pages: one per required view
  assertFails(dir, `the coverage floor is ${PAGE_FLOOR}`)
  const { ok, problems } = validateSpecPack(dir, { pageFloor: REQUIRED_VIEWS.length })
  assert.equal(ok, true, `expected pass at the lower floor, got:\n  ${problems.join('\n  ')}`)
  assert.throws(() => validateSpecPack(dir, { pageFloor: 0 }), /positive integer/)

  const stdout = execFileSync(
    'node',
    [script, '--validate', dir, '--page-floor', String(REQUIRED_VIEWS.length)],
    { encoding: 'utf8' }
  )
  assert.match(stdout, /spec-pack OK/)
  for (const bad of ['0', 'twelve']) {
    let code = 0,
      stderr = ''
    try {
      execFileSync('node', [script, '--validate', dir, '--page-floor', bad], { stdio: 'pipe' })
    } catch (e) {
      code = e.status
      stderr = String(e.stderr)
    }
    assert.equal(code, 2, `--page-floor ${bad} must be a usage error`)
    assert.match(stderr, /positive integer/)
  }
  // a lower floor still cannot excuse a missing required view
  const thin = pack({
    pages: makePages(REQUIRED_VIEWS.length).map((p) => (p.view === '404' ? { ...p, view: 'single' } : p))
  })
  const res = validateSpecPack(thin, { pageFloor: REQUIRED_VIEWS.length })
  assert.equal(res.ok, false)
  assert.ok(res.problems.some((p) => p.includes('required view "404"')))
})

test('content contract is required even for existing packs', () => {
  const dir = pack()
  rmSync(join(dir, 'content-contract.json'))
  assertFails(dir, 'content-contract.json')
})
test('spec gate rejects a content contract that omits a mapped page', () => {
  const dir = pack()
  const file = join(dir, 'content-contract.json')
  const contract = JSON.parse(readFileSync(file))
  contract.surfaces.pop()
  writeFileSync(file, JSON.stringify(contract))
  assertFails(dir, 'has no surface')
})
test('adapter initializes a blocked contract and preserves authored facts on force', () => {
  const dir = mkdtempSync(join(testBase(), 'content-init-'))
  packs.push(dir)
  const map = { template: { name: 'example' }, pages: [{ file: 'home.html' }] }
  initSpecPack(dir, { pageMap: map })
  const file = join(dir, 'content-contract.json')
  const contract = JSON.parse(readFileSync(file))
  assert.equal(contract.pending.length, 1)
  assert.equal(contract.mode, null)
  // the design-contract skeleton starts from the WordPress dark hook, not an empty theme
  const design = JSON.parse(readFileSync(join(dir, 'design-contract.json')))
  assert.deepEqual(design.theme, DEFAULT_THEME_HOOK)
  assert.deepEqual(DEFAULT_THEME_HOOK, {
    selector: 'html',
    attribute: 'data-theme',
    lightValue: 'light',
    darkValue: 'dark'
  })
  contract.facts = { 'company.name': { value: 'Keep this customer name' } }
  writeFileSync(file, JSON.stringify(contract))
  initSpecPack(dir, { pageMap: map, force: true })
  assert.deepEqual(JSON.parse(readFileSync(file)), contract)
})

test('design contract cannot be omitted or leave page coverage incomplete', () => {
  const dir = pack(),
    file = join(dir, 'design-contract.json')
  const design = JSON.parse(readFileSync(file))
  design.pages.pop()
  writeFileSync(file, JSON.stringify(design))
  assertFails(dir, 'design-contract.json has no page')
  rmSync(file)
  assertFails(dir, 'missing required file: design-contract.json')
})
test('adapter force preserves the measured design contract', () => {
  const dir = pack(),
    file = join(dir, 'design-contract.json'),
    before = readFileSync(file, 'utf8')
  initSpecPack(dir, { pageMap: JSON.parse(readFileSync(join(dir, 'page-map.json'))), force: true })
  assert.equal(readFileSync(file, 'utf8'), before)
})

// ── the Phase 2 source-font gate of a Joomla pack ─────────────────────────────
// A pack whose provenance says from-joomla must carry source-fonts.json and pass the gate on its own: an
// omitted report cannot bypass `--validate`, and a decision is read from DECISIONS.md at validation time.
import { spawnSync } from 'node:child_process'
import { buildPack as buildJoomlaPack } from './source-font-fixtures.mjs'

const JOOMLA_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'joomla-min')
const joomlaScratch = []
test.after(() => {
  for (const d of joomlaScratch) rmSync(d, { recursive: true, force: true })
})
function joomlaPack() {
  const scratch = mkdtempSync(join(process.env.TRACY_TEST_SCRATCH || testBase(), 'sf-pack-'))
  joomlaScratch.push(scratch)
  const out = join(scratch, 'pack')
  const r = buildJoomlaPack({ j6Dir: JOOMLA_FIXTURE, out, pageFloor: 4 })
  assert.equal(r.validation.ok, true, r.validation.problems.join('\n'))
  return out
}
const validateCli = (dir, ...extra) => spawnSync(process.execPath, [join(SKILL_DIR, 'scripts/ingest/spec-pack.mjs'), '--validate', dir, '--page-floor', '4', ...extra], { encoding: 'utf8' })
const editReport = (dir, fn) => {
  const f = join(dir, 'source-fonts.json')
  const r = JSON.parse(readFileSync(f, 'utf8'))
  fn(r)
  writeFileSync(f, JSON.stringify(r))
}

test('source-font gate: a Joomla pack that carries its measured fonts validates, and records them', () => {
  const dir = joomlaPack()
  const r = JSON.parse(readFileSync(join(dir, 'source-fonts.json'), 'utf8'))
  assert.equal(r.schema, 'tracy.source-fonts/1')
  assert.equal(r.static.complete, true)
  assert.ok(r.browser.pages.length >= 4)
  assert.match(readFileSync(join(dir, 'design-spec.md'), 'utf8'), /## Source fonts \(Phase 2\)/)
  assert.equal(JSON.parse(readFileSync(join(dir, 'provenance.json'), 'utf8')).sourceFonts.file, 'source-fonts.json')
  assert.equal(JSON.parse(readFileSync(join(dir, 'page-map.json'), 'utf8')).theme.fonts.body, 'SF Pro Text', 'the declared family, never a measured fallback')
  assert.equal(validateCli(dir).status, 0)
})

test('source-font gate: removing source-fonts.json cannot bypass the gate', () => {
  const dir = joomlaPack()
  rmSync(join(dir, 'source-fonts.json'))
  const r = validateCli(dir)
  assert.equal(r.status, 1)
  assert.match(r.stderr, /source-fonts\.json is missing/)
  assert.equal(validateSpecPack(dir, { pageFloor: 4 }).ok, false)
})

test('source-font gate: dropping the browser reading, or one width, or the static report is refused', () => {
  const dir = joomlaPack()
  editReport(dir, (r) => (r.browser = null))
  assert.match(validateCli(dir).stderr, /browser evidence incomplete/)
  const dir2 = joomlaPack()
  editReport(dir2, (r) => (r.browser.pages = r.browser.pages.filter((p) => p.width === 1440)))
  assert.match(validateCli(dir2).stderr, /no page was measured at 390px/)
  const dir3 = joomlaPack()
  editReport(dir3, (r) => (r.static = null))
  assert.match(validateCli(dir3).stderr, /static source-font report is missing/)
})

test('source-font gate: a source-font finding fails validation naming the SOURCE; a decision that names it passes — read at validation, not from a flag in the report', () => {
  const dir = joomlaPack()
  editReport(dir, (r) => r.browser.pages.forEach((p) => (p.roles.body = { requested: 'Muli, sans-serif', drawn: [{ name: 'Arial', custom: false, glyphs: 90 }], size: '16px', chars: 120, text: 'x' })))
  const bad = validateCli(dir)
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /fault of the SOURCE template/)
  const key = /(source-font:browser:\S+?:1440:body:web-family-not-drawn)/.exec(bad.stderr)?.[1]
  assert.ok(key, bad.stderr)
  // a report that claims the finding is accepted does not make it so
  editReport(dir, (r) => (r.accepted = true))
  assert.equal(validateCli(dir).status, 1)
  // a decision for one key does not cover the others
  const dec = join(dirname(dir), 'DECISIONS.md')
  writeFileSync(dec, `- D-1 ${key} — accepted.\n`)
  assert.equal(validateCli(dir, '--decisions', dec).status, 1)
  const keys = [...new Set([...bad.stderr.matchAll(/(source-font:browser:\S+?:(?:1440|390):body:web-family-not-drawn)/g)].map((m) => m[1]))]
  writeFileSync(dec, keys.map((k, i) => `- D-${i + 1} ${k} — accepted with the owner.`).join('\n') + '\n')
  const ok = validateCli(dir, '--decisions', dec)
  assert.equal(ok.status, 0, ok.stderr)
  // withdrawing the decision file brings the failure back
  assert.equal(validateCli(dir).status, 1)
})

test('source-font gate: renaming the adapter does not exempt a pack that carries the report; a pack of another adapter keeps its contract', () => {
  const dir = joomlaPack()
  editReport(dir, (r) => (r.static = null))
  const prov = join(dir, 'provenance.json')
  const p = JSON.parse(readFileSync(prov, 'utf8'))
  assert.equal(p.adapter, 'from-joomla')
  writeFileSync(prov, JSON.stringify({ ...p, adapter: 'from-something-else' }))
  assert.equal(validateSpecPack(dir, { pageFloor: 4 }).ok, false)
  assert.equal(validateSpecPack(pack()).ok, true, 'a pack of another adapter is validated as before')
})

test('source-font gate: a source with no body family keeps it undeclared in the page-map, fails the gate once as a source fault, and a decision that names it passes the whole pack', () => {
  const root = mkdtempSync(join(process.env.TRACY_TEST_SCRATCH || testBase(), 'sf-pack-'))
  joomlaScratch.push(root)
  const src = join(root, 'src')
  cpSync(JOOMLA_FIXTURE, src, { recursive: true })
  const siteFile = join(src, 'capture/templates/tracy/etc/site/default.json')
  const site = JSON.parse(readFileSync(siteFile, 'utf8'))
  for (const k of Object.keys(site)) if (/_font_family$/.test(k)) delete site[k]
  writeFileSync(siteFile, JSON.stringify(site))
  const out = join(root, 'pack')
  const r = buildJoomlaPack({ j6Dir: src, out, pageFloor: 4 })
  assert.equal(JSON.parse(readFileSync(join(out, 'page-map.json'), 'utf8')).theme.fonts.body, null, 'undeclared stays undeclared, never borrowed from other CSS or LESS')
  assert.equal(r.validation.ok, false)
  assert.deepEqual(r.validation.problems.filter((x) => !/source-font/.test(x)), [], r.validation.problems.join('\n'))
  const key = /(source-font:static:tracy:style-\d+:body:font-family-unset)/.exec(r.validation.problems.join('\n'))?.[1]
  assert.ok(key)
  assert.match(r.validation.problems.join('\n'), /fault of the SOURCE template/)
  const keys = [...new Set([...r.validation.problems.join('\n').matchAll(/(source-font:static:tracy:style-\d+:body:font-family-unset)/g)].map((m) => m[1]))]
  const decisions = keys.map((k, i) => `- D-${i + 1} ${k} — the source ships no body font; recorded.`).join('\n') + '\n'
  assert.equal(validateSpecPack(out, { pageFloor: 4, decisionsText: decisions }).ok, true, validateSpecPack(out, { pageFloor: 4, decisionsText: decisions }).problems.join('\n'))
  const dec = join(root, 'DECISIONS.md')
  writeFileSync(dec, decisions)
  assert.equal(validateCli(out, '--decisions', dec).status, 0)
  assert.equal(validateCli(out).status, 1)
})

test('initSpecPack records where the source was read from without the machine\'s layout: repository-relative, else under ~', () => {
  const m = machine()
  const dir = join(m.dossier, 'spec')
  const design = join(m.data, 'design export')
  withHome(m.home, () => {
    initSpecPack(dir, {
      pageMap: { pages: [{ file: 'a.html' }], source: { kind: 'folder', path: design } },
      adapter: 'from-test',
      source: { kind: 'folder', path: design, pages: 1, serve: { dir: join(m.repo, 'tasks', 'site', 'pages'), origin: 'http://127.0.0.1:8080' }, note: `read from ${design}/index.html` }
    })
  })
  const prov = JSON.parse(readFileSync(join(dir, 'provenance.json'), 'utf8'))
  assert.deepEqual(prov.source, { kind: 'folder', path: '~/data/site/design export', pages: 1, serve: { dir: 'tasks/site/pages', origin: 'http://127.0.0.1:8080' }, note: 'read from ~/data/site/design export/index.html' })
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'page-map.json'), 'utf8')).source, { kind: 'folder', path: '~/data/site/design export' })
  for (const f of ['provenance.json', 'page-map.json', 'reference.json']) assert.ok(!readFileSync(join(dir, f), 'utf8').includes(m.home), `${f} names the home directory`)
})

test('spec-pack --init: a page map named by a relative path is recorded from the repository root, not from the working directory', async () => {
  const { execFileSync } = await import('node:child_process')
  const m = machine()
  mkdirSync(join(m.dossier, 'draft'), { recursive: true })
  writeFileSync(join(m.dossier, 'draft', 'page-map.json'), JSON.stringify({ pages: [{ file: 'a.html' }] }))
  const script = join(SKILL_DIR, 'scripts', 'ingest', 'spec-pack.mjs')
  // started in the dossier: `draft/page-map.json` is tasks/site/draft/page-map.json of the repository
  execFileSync('node', [script, '--init', 'spec', '--page-map', join('draft', 'page-map.json')], { cwd: m.dossier, env: { ...process.env, HOME: m.home }, stdio: 'pipe' })
  assert.deepEqual(JSON.parse(readFileSync(join(m.dossier, 'spec', 'provenance.json'), 'utf8')).source, { path: 'tasks/site/draft/page-map.json' })
  // a page map outside the repository, named from a directory outside it
  writeFileSync(join(m.data, 'page-map.json'), JSON.stringify({ pages: [{ file: 'a.html' }] }))
  execFileSync('node', [script, '--init', join(m.dossier, 'spec2'), '--page-map', 'page-map.json'], { cwd: m.data, env: { ...process.env, HOME: m.home }, stdio: 'pipe' })
  assert.deepEqual(JSON.parse(readFileSync(join(m.dossier, 'spec2', 'provenance.json'), 'utf8')).source, { path: '~/data/site/page-map.json' })
})

test('from-html: a design folder named by a relative path is recorded from the repository root, not from the working directory', async () => {
  // (with the spec-pack tests: it is the pack's record of its source that is checked, and this suite is the one a path change runs)
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)
  const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
  const SKILL = SKILL_DIR
  const FIXTURES = join(SKILL_DIR, 'scripts', 'test', 'fixtures')
  const m = machine()
  const design = join(m.repo, 'design')
  cpSync(join(FIXTURES, 'bundle-min'), join(design, 'bundle'), { recursive: true })
  const out = join(m.dossier, 'spec')
  // started in design/: the source is `bundle`, the pack `../tasks/site/spec`
  await run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'), 'bundle', '--out', join('..', 'tasks', 'site', 'spec')], { cwd: design, env: { ...process.env, HOME: m.home } })
  assert.equal(readJson(join(out, 'page-map.json')).source.path, 'design/bundle')
  assert.equal(readJson(join(out, 'provenance.json')).source.path, 'design/bundle')
  assert.equal(readJson(join(out, 'content-contract.json')).sources.design.reference, 'design/bundle')
  assert.equal(readJson(join(out, 'design-contract.json')).source.reference, 'design/bundle')
  for (const f of ['page-map.json', 'provenance.json', 'content-contract.json', 'design-contract.json']) assert.ok(!readFileSync(join(out, f), 'utf8').includes(m.home), `${f} names the home directory`)
  // a design kept outside the repository, under home
  cpSync(join(FIXTURES, 'bundle-min'), join(m.data, 'bundle'), { recursive: true })
  const out2 = join(m.dossier, 'spec2')
  await run('node', [join(SKILL, 'scripts/ingest/from-html.mjs'), 'bundle', '--out', out2], { cwd: m.data, env: { ...process.env, HOME: m.home } })
  assert.equal(readJson(join(out2, 'provenance.json')).source.path, '~/data/site/bundle')
  assert.equal(readJson(join(out2, 'page-map.json')).source.path, '~/data/site/bundle')
})
