// Issue #54 — design rules from the CSS each framework actually compiles (T4: media/t4/css/<style
// id>.css + the template's darkmode.css; T3: css/*.css of the active theme, a live capture's compiled
// t3-assets/css read in place of the template sheets of the same name; other:
// css/*.css with the gap reported), scoped to the style assigned to each route; and an identity field
// the source declares empty recorded as an `absent-in-source` fact instead of blocking the gate.
//
// The fixtures are built from joomla-coverage (a T4 template by its etc/layout/*.json) and from small
// synthetic captures. The `issue54 real-source` tests run only when their inputs are named:
//   ISSUE54_VEGA_SOURCE=<ja-vega j6 dump>        (read-only; spec verdict recorded)
//   ISSUE54_MORGAN_ARCHIVE=<ja-morgan.zip>       (extracted safely into scratch; byte-identical after)
// Scratch goes under TRACY_TEST_SCRATCH when it is set (TMPDIR is left as it is), else the OS temp dir.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync, lstatSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import {
  COVERAGE_FILE,
  captureReader,
  resolveDesign,
  parseCss,
  parseMediaCondition,
  styleDesign,
  parseSelector,
  classAttrMay,
  specificity,
  validDesignValue,
  frameworkPalette,
  manifestSummary,
  absentIdentity,
  checkRenderRoutes,
  placedPages
} from '../ingest/from-joomla.mjs'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, 'fixtures', 'joomla-coverage')
const SCRATCH = process.env.TRACY_TEST_SCRATCH ? join(process.env.TRACY_TEST_SCRATCH, 'issue54-scratch') : tmpdir()
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const tmps = []
function tmp(prefix) {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
  try {
    if (process.env.TRACY_TEST_SCRATCH && !readdirSync(SCRATCH).length) rmSync(SCRATCH, { recursive: true })
  } catch {}
})
const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const hashTree = (root) => {
  const out = {}
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name)
      if (d.isSymbolicLink()) out[relative(root, p)] = `symlink:${readlinkSync(p)}`
      else if (d.isDirectory()) walk(p)
      else if (d.isFile()) out[relative(root, p)] = createHash('sha256').update(readFileSync(p)).digest('hex')
      else out[relative(root, p)] = 'special'
    }
  }
  walk(root)
  return out
}
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const build = (j6Dir, siteUrl) => {
  const r = buildSpecPack({ j6Dir, out: join(tmp('i54-out-'), 'spec'), pageFloor: 1, now: '2026-09-28T00:00:00.000Z', ...(siteUrl ? { siteUrl } : {}) })
  return { ...r, report: readJson(join(r.out, COVERAGE_FILE)), design: readJson(join(r.out, 'design-contract.json')), pageMap: readJson(join(r.out, 'page-map.json')) }
}
const pageOf = (pageMap, joomlaPath) => pageMap.pages.find((p) => p.source?.joomlaPath === joomlaPath)
const ruleOf = (design, id) => {
  const r = design.rules.find((x) => x.id === id)
  assert.ok(r, `design-contract has rule ${id} (has ${design.rules.map((x) => x.id).join(', ')})`)
  return r
}

// ── T4 ─────────────────────────────────────────────────────────────────────────

/**
 * joomla-coverage as a T4 build without the Tracy token sheet: css/template.css (the compiled base),
 * media/t4/css/20.css (home style) and 21.css (the style of /landing), css/darkmode.css.
 */
function t4Fixture({ style21 = true, legacyRoute = true } = {}) {
  const d = tmp('i54-t4-')
  cpSync(FIXTURE, d, { recursive: true })
  // without the route of another template's style: every page is of a style of this template
  if (!legacyRoute) writeFileSync(join(d, 'inventory.json'), readFileSync(join(d, 'inventory.json'), 'utf8').replace('"template_style_id": "23"', '"template_style_id": "0"'))
  const tpl = join(d, 'capture/templates/cov')
  rmSync(join(tpl, 'css/styles'), { recursive: true })
  write(
    join(tpl, 'css/template.css'),
    `/* compiled base */
:root { --gutter-x: 24px; }
body { font-size: 16px; line-height: 1.5; color: var(--body-text-color); background-color: var(--body-bg-color); }
h1, .h1 { font-size: var(--h1-font-size, 40px); font-weight: 600; }
.container { max-width: 1200px; padding-left: 12px; padding-right: 12px; }
@media (max-width: 575.98px) { .container { max-width: none; padding-left: 8px; padding-right: 8px; } }
.btn { --btn-radius: 4px; border-radius: var(--btn-radius); padding: 10px var(--btn-pad-x, 20px); }
@supports (display: grid) { .grid { display: grid; } }
.card { color: red; .inner { color: blue; } }
a { color: var(--color-primary); }
`
  )
  write(join(d, 'capture/media/t4/css/20.css'), `:root{--color-primary:#112233;--color-secondary:#445566;--body-bg-color:#ffffff;--body-text-color:#222222;}\n.btn.btn-primary{background-color:var(--color-primary);border-color:var(--color-primary);}\n`)
  if (style21) write(join(d, 'capture/media/t4/css/21.css'), `:root{--color-primary:#aa0000;--body-bg-color:#fafafa;--body-text-color:#333333;--h1-font-size:52px;}\n.btn{border-radius:0}\n`)
  write(join(tpl, 'css/darkmode.css'), `html[data-theme="dark"]{--dm-bg:#000000;--body-bg-color:var(--dm-bg);--body-text-color:#eeeeee;--color-primary:#66aaff;}\nhtml[data-theme="dark"] a:not(.btn){color:#99ccff}\n`)
  return d
}

test('issue54 T4: the framework is read from the template files, each route takes the rules of its own style, dark from darkmode.css', () => {
  const r = build(t4Fixture())
  const css = r.report.inspection.css
  assert.equal(css.mode, 'framework')
  assert.equal(css.framework, 'T4')
  assert.ok(css.evidence.some((e) => e.framework === 'T4' && /etc\/layout\/[^/]+\.json$/.test(e.path)), JSON.stringify(css.evidence))
  const s20 = css.styles.find((s) => s.id === '20')
  const s21 = css.styles.find((s) => s.id === '21')
  assert.deepEqual(s20.sheets.map((x) => [x.path, x.role, x.status]), [
    ['capture/templates/cov/css/template.css', 'template', 'read'],
    ['capture/media/t4/css/20.css', 'style', 'read'],
    ['capture/templates/cov/css/darkmode.css', 'dark', 'read']
  ])
  assert.equal(s21.sheets[1].path, 'capture/media/t4/css/21.css')
  assert.deepEqual(s21.routes, ['/landing'])
  assert.ok(!s20.routes.includes('/landing'))
  // palette: the framework tokens of the home style, dark from the dark cascade
  assert.deepEqual(r.pageMap.theme.palette.light, { primary: '#112233', secondary: '#445566', body_bg: '#ffffff', text: '#222222' })
  assert.deepEqual(r.pageMap.theme.palette.dark, { primary: '#66aaff', secondary: '#445566', body_bg: '#000000', text: '#eeeeee' })
  assert.equal(r.pageMap.theme.darkDerived, false)
  // rules per style, resolved per variant (var(), fallbacks, width media)
  const body20 = ruleOf(r.design, 's20-body-colors')
  assert.equal(body20.selector, 'body')
  assert.deepEqual(body20.styles['desktop-light'], { color: '#222222', backgroundColor: '#ffffff' })
  assert.deepEqual(body20.styles['mobile-dark'], { color: '#eeeeee', backgroundColor: '#000000' })
  assert.deepEqual(ruleOf(r.design, 's21-body-colors').styles['desktop-light'], { color: '#333333', backgroundColor: '#fafafa' })
  assert.equal(ruleOf(r.design, 's20-heading-type').styles['desktop-light'].fontSize, '40px', 'the declared fallback')
  assert.equal(ruleOf(r.design, 's21-heading-type').styles['desktop-light'].fontSize, '52px', "the style's own token")
  const container = ruleOf(r.design, 's20-container')
  assert.deepEqual(container.styles['desktop-light'], { maxWidth: '1200px', paddingLeft: '12px', paddingRight: '12px' })
  assert.deepEqual(container.styles['mobile-light'], { maxWidth: 'none', paddingLeft: '8px', paddingRight: '8px' })
  assert.deepEqual(ruleOf(r.design, 's20-button').styles['desktop-light'], { borderRadius: '4px', paddingTop: '10px', paddingRight: '20px', paddingBottom: '10px', paddingLeft: '20px' })
  assert.equal(ruleOf(r.design, 's21-button').styles['desktop-light'].borderRadius, '0')
  assert.deepEqual(ruleOf(r.design, 's20-button-primary').styles['desktop-dark'], { backgroundColor: '#66aaff', borderColor: '#66aaff' })
  // style 21 declares no .btn-primary: style 20's rule does not leak into it
  assert.equal(r.design.rules.find((x) => x.id === 's21-button-primary'), undefined)
  // link colour: darkmode.css restyles a:not(.btn), which a plain link surely matches: it is the dark value
  assert.deepEqual(ruleOf(r.design, 's20-link-color').styles['desktop-light'], { color: '#112233' })
  assert.deepEqual(ruleOf(r.design, 's20-link-color').styles['mobile-dark'], { color: '#99ccff' })
  assert.ok(!s20.gaps.some((g) => g.startsWith('a color')), JSON.stringify(s20.gaps))
  // pages carry only their style's rules
  const landing = r.design.pages.find((p) => p.id === pageOf(r.pageMap, '/landing').file)
  assert.ok(landing.rules.length && landing.rules.every((id) => id.startsWith('s21-')), landing.rules.join(','))
  const home = r.design.pages.find((p) => p.id === pageOf(r.pageMap, '/').file)
  assert.ok(home.rules.length && home.rules.every((id) => id.startsWith('s20-')), home.rules.join(','))
  assert.deepEqual(home.requiredRules, ['s20-body-colors', 's20-link-color'])
  // no rule value still to compute
  for (const rule of r.design.rules) for (const v of Object.values(rule.styles)) for (const x of Object.values(v)) assert.doesNotMatch(x, /var\(|calc\(/, rule.id)
  // unsupported CSS is reported, not read; a route of another template's style is named
  assert.ok(css.unsupported.some((u) => u.path === 'capture/templates/cov/css/template.css' && /@supports block: not read/.test(u.what)))
  assert.ok(css.unsupported.some((u) => /nested rule in "\.card": not read/.test(u.what)))
  assert.ok(css.gaps.some((g) => /^\/legacy: template style #23 belongs to template "protostar"/.test(g)), JSON.stringify(css.gaps))
  assert.ok(r.report.inspection.limitations.some((l) => /design rules are read from the T4 sheets per template style/.test(l)))
  // /legacy renders through style #23 of another template: no sheet of it is read and the home
  // style's rules are not lent to it — its page carries no rule, and no token is common to every page
  const s23 = css.styles.find((s) => s.id === '23')
  assert.deepEqual([s23.routes, s23.sheets, s23.rules], [['/legacy'], [], []])
  assert.ok(s23.gaps.some((g) => /belongs to template "protostar"; no sheet of it is read and the home style's are not substituted/.test(g)), JSON.stringify(s23.gaps))
  assert.deepEqual(r.design.pages.find((p) => p.id === pageOf(r.pageMap, '/legacy').file).rules, [])
  assert.deepEqual(r.design.tokens['desktop-light'], {})
  assert.deepEqual(r.validation.problems, ['design-contract.json: Resolve pending design decisions before validation'])
  assert.match(r.report.spec.causes[0].cause, /no token resolves to one value in every style the pages use \(#20, #21, #23\) at desktop-light, desktop-dark, mobile-light, mobile-dark/)
  const prov = readJson(join(r.out, 'provenance.json'))
  assert.equal(prov.source.template.css.framework, 'T4')
  const provRules = prov.source.template.css.styles.find((s) => s.id === '21').rules
  assert.ok(provRules.length && provRules.every((x) => x.id.startsWith('s21-') && x.from.length), JSON.stringify(provRules))
  assert.deepEqual(provRules.find((x) => x.id === 's21-button').from, ['capture/media/t4/css/21.css', 'capture/templates/cov/css/template.css'])
})

test('issue54 T4: the design contract expects on every page only the tokens every style the pages use resolves alike', () => {
  const r = build(t4Fixture({ legacyRoute: false }))
  assert.equal(r.validation.ok, true, JSON.stringify(r.validation.problems))
  // style 21 sets --color-primary to #aa0000 where style 20 sets #112233: no expectation of the site in light
  assert.deepEqual(r.design.tokens['desktop-light'], { '--gutter-x': '24px' })
  // darkmode.css sets the same dark values over both styles
  assert.equal(r.design.tokens['desktop-dark']['--color-primary'], '#66aaff')
  assert.equal(r.design.tokens['desktop-dark']['--body-bg-color'], '#000000')
  assert.equal(r.design.tokens['desktop-dark']['--color-secondary'], undefined, 'style 21 does not declare it')
  const prov = readJson(join(r.out, 'provenance.json'))
  assert.ok(prov.notes.some((n) => /^design-contract\.json tokens: \d+ token\(s\) of the home style #20 are left out because the pages \(#20, #21\) do not all resolve them to one value: .*--color-primary/.test(n)), JSON.stringify(prov.notes))
})

test('issue54 T4: an assigned style sheet that is not captured is reported on the style and its routes — nothing substituted', () => {
  const r = build(t4Fixture({ style21: false }))
  const s21 = r.report.inspection.css.styles.find((s) => s.id === '21')
  assert.deepEqual([s21.sheets[1].path, s21.sheets[1].status], ['capture/media/t4/css/21.css', 'absent'])
  assert.ok(s21.gaps.some((g) => /capture\/media\/t4\/css\/21\.css, the sheet T4 compiles for style #21, is not in the capture/.test(g)))
  const item = r.report.items.find((i) => i.id === 'template-style:21')
  assert.equal(item.status, 'partial')
  assert.match(item.reason, /css: capture\/media\/t4\/css\/21\.css/)
  assert.deepEqual(item.impact.routes, ['/landing'])
  // 21.css may override any value of template.css and darkmode.css: none of the style is published —
  // not template.css's 16px body size, and not 20.css's values either
  assert.deepEqual(r.design.rules.filter((x) => x.id.startsWith('s21-')), [])
  assert.ok(s21.gaps.some((g) => /^style #21: a sheet its routes load is not read \(capture\/media\/t4\/css\/21\.css, the sheet T4 compiles for style #21, is not in the capture.*\); what it declares may override any value of the sheets read, so no design value of the style is published/.test(g)), JSON.stringify(s21.gaps))
  assert.ok(ruleOf(r.design, 's20-body-type'), 'the home style, whose sheets are all read, keeps its rules')
})

test('issue54 T4: an assigned style sheet that is empty or holds only comments is read and reported as holding no rule', () => {
  const d = t4Fixture()
  writeFileSync(join(d, 'capture/media/t4/css/21.css'), '/* compiled on save; nothing yet */\n')
  const r = build(d)
  const s21 = r.report.inspection.css.styles.find((s) => s.id === '21')
  assert.deepEqual([s21.sheets[1].status, s21.sheets[1].rules], ['read', 0])
  assert.ok(s21.gaps.some((g) => g === 'capture/media/t4/css/21.css was read but holds no style rule the adapter can place'), JSON.stringify(s21.gaps))
  assert.equal(r.report.items.find((i) => i.id === 'template-style:21').status, 'partial')
})

test('issue54 T4: unreadable sheets — a link, a pipe, an oversized file — are skipped and reported, never read as rules', () => {
  const d = t4Fixture()
  const tpl = join(d, 'capture/templates/cov')
  // media/t4 is a symbolic link; darkmode.css is a pipe; template.css is over the reader's limit
  const real = join(d, 'capture/media-real')
  cpSync(join(d, 'capture/media'), real, { recursive: true })
  rmSync(join(d, 'capture/media/t4'), { recursive: true })
  symlinkSync(join(real, 't4'), join(d, 'capture/media/t4'))
  rmSync(join(tpl, 'css/darkmode.css'))
  assert.equal(spawnSync('mkfifo', [join(tpl, 'css/darkmode.css')]).status, 0)
  writeFileSync(join(tpl, 'css/template.css'), `body{color:#010101}\n/*${'x'.repeat(1024 * 1024)}*/`)
  const r = build(d)
  const s20 = r.report.inspection.css.styles.find((s) => s.id === '20')
  const at = Object.fromEntries(s20.sheets.map((x) => [x.path, x]))
  assert.equal(at['capture/media/t4/css/20.css'].status, 'skipped')
  assert.match(at['capture/media/t4/css/20.css'].reason, /symbolic link/)
  assert.equal(at['capture/templates/cov/css/darkmode.css'].status, 'skipped')
  assert.match(at['capture/templates/cov/css/darkmode.css'].reason, /not a regular file/)
  assert.equal(at['capture/templates/cov/css/template.css'].status, 'skipped')
  assert.match(at['capture/templates/cov/css/template.css'].reason, /larger than/)
  assert.ok(s20.gaps.some((g) => /20\.css, the sheet T4 compiles for style #20, was not read \(.*symbolic link/.test(g)))
  assert.ok(s20.gaps.some((g) => /darkmode\.css was not read/.test(g)))
  assert.ok(r.report.inspection.site.skipped.some((x) => x.path === 'capture/media/t4' && /symbolic link/.test(x.reason)))
  assert.equal(r.design.rules.length, 0, 'nothing read, no rule')
  assert.equal(r.validation.ok, false)
  const pending = r.report.spec.causes.find((c) => /pending design decisions/.test(c.problem))
  assert.match(pending.cause, /no typography rule could be read from the T4 sheets \(none read\)/)
  assert.match(pending.cause, /capture\/media\/t4\/css\/20\.css was not read/)
})

test('issue54: conflicting framework markers — the template css/*.css is read and the gap is reported', () => {
  const d = t4Fixture()
  // a T3 manifest over T4 JSON layouts
  write(join(d, 'capture/templates/cov/templateDetails.xml'), '<?xml version="1.0"?>\n<extension type="template" client="site"><name>cov</name><t3><base>base-bs3</base></t3></extension>\n')
  const r = build(d)
  const css = r.report.inspection.css
  assert.equal(css.framework, 'conflict')
  assert.deepEqual([...new Set(css.evidence.map((e) => e.framework))].sort(), ['T3', 'T4'])
  const s20 = css.styles.find((s) => s.id === '20')
  assert.deepEqual(s20.sheets.map((x) => x.path), ['capture/templates/cov/css/template.css', 'capture/templates/cov/css/darkmode.css'], 'no media/t4 sheet for a framework not decided')
  assert.ok(s20.gaps.some((g) => /^framework conflict: the adapter knows no compiled-sheet location for it/.test(g)))
  assert.ok(r.report.items.find((i) => i.id === 'template-style:20').reason.includes('framework conflict'))
})

test('issue54: a template that ships the Tracy token sheet keeps it as the one design source (legacy fixtures unchanged)', () => {
  const r = build(FIXTURE)
  assert.equal(r.report.inspection.css.mode, 'legacy')
  assert.equal(r.report.inspection.css.framework, 'T4')
  assert.deepEqual(r.design.rules.map((x) => x.id), ['body-type', 'body-colors', 'band-rhythm', 'capsule-button'])
  assert.equal(r.report.inspection.site, undefined)
})

// ── T3 and other frameworks (resolver on a synthetic capture) ────────────────

function t3Capture({ manifest = '<extension type="template" client="site"><name>t3x</name><t3><base>base-bs3</base></t3></extension>', assets = false } = {}) {
  const d = tmp('i54-t3-')
  const tpl = join(d, 'capture/templates/t3x')
  write(join(tpl, 'templateDetails.xml'), `<?xml version="1.0" encoding="utf-8"?>\n${manifest}\n`)
  write(join(tpl, 'etc/layout/default.ini'), '[mainbody]\n')
  write(join(tpl, 'css/bootstrap.css'), 'body{font-family:"Base",sans-serif;font-size:14px;line-height:1.4;color:#333333;background-color:#ffffff}\n.btn{border-radius:4px;padding:6px 12px}\n.btn-primary{color:#ffffff;background-color:#337ab7;border-color:#2e6da4}\n.container{padding-left:15px;padding-right:15px}\n@media (min-width:768px){.container{width:750px}}\n')
  write(join(tpl, 'css/template.css'), 'body{font-size:16px;color:#777777}\n.btn-primary{background-color:#d93030;border-color:#d93030}\n.t3-mainbody{padding-top:40px;padding-bottom:40px}\n')
  write(join(tpl, 'css/themes/red/template.css'), 'body{font-size:16px;color:#777777}\n.btn-primary{background-color:#aa1111;border-color:#aa1111}\n.t3-mainbody{padding-top:40px;padding-bottom:40px}\n')
  // a sheet the red theme alone ships, and a page-mode sheet of the theme
  write(join(tpl, 'css/themes/red/red-extra.css'), '.container{max-width:1170px}\n')
  write(join(tpl, 'css/themes/red/offline.css'), 'body{background:#00ff00}\n')
  write(join(tpl, 'css/darkmode.css'), 'html[data-theme="dark"] body{background-color:#0f1320;color:#a7b0c2}\n')
  write(join(tpl, 'css/error.css'), 'body{background:#ff0000}\n')
  if (assets) {
    // compiled on the live site for two different pages: which route loads which is not in the capture
    write(join(d, 'capture/t3-assets/css/css-4f2a.css'), '.btn{border-radius:2px}\n.btn-primary{background-color:#222222}\n')
    write(join(d, 'capture/t3-assets/css/css-9c1e.css'), '.btn-primary{background-color:#000000;border-color:#000000}\n')
  }
  const styles = [
    { id: 9, template: 't3x', client_id: 0, home: '1', title: 'Default', params: JSON.stringify({ theme: '' }) },
    { id: 10, template: 't3x', client_id: 0, home: '0', title: 'Red', params: JSON.stringify({ theme: 'red' }) },
    { id: 11, template: 't3x', client_id: 0, home: '0', title: 'Blue', params: JSON.stringify({ theme: 'blue' }) },
    { id: 12, template: 't3x', client_id: 0, home: '0', title: 'Bad', params: JSON.stringify({ theme: '../red' }) }
  ]
  const pages = [
    { file: 'index.html', source: { menuId: 1, joomlaPath: '/' } },
    { file: 'red.html', source: { menuId: 2, joomlaPath: '/red' } },
    { file: 'blue.html', source: { menuId: 3, joomlaPath: '/blue' } },
    { file: 'bad.html', source: { menuId: 4, joomlaPath: '/bad' } }
  ]
  const menuById = new Map([
    ['1', { templateStyleId: '0' }],
    ['2', { templateStyleId: '10' }],
    ['3', { templateStyleId: '11' }],
    ['4', { templateStyleId: '12' }]
  ])
  const tplObj = { name: 't3x', dir: tpl, reader: captureReader(tpl, d), tokensFile: null, styleId: 9, theme: {} }
  return { d, tpl: tplObj, inv: { template_styles: styles }, pages, menuById }
}

test('issue54 T3: base css/*.css, the active theme replacing its own files, dark sheet, page-mode sheets left out', () => {
  const x = t3Capture()
  const design = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById })
  assert.equal(design.framework.framework, 'T3')
  assert.ok(design.framework.evidence.some((e) => /manifest declares <t3>/.test(e.detail)))
  const by = Object.fromEntries(design.styles.map((s) => [s.id, s]))
  assert.deepEqual(by['9'].sheets.map((s) => [s.path.replace('capture/templates/t3x/', ''), s.role]), [
    ['css/bootstrap.css', 'template'],
    ['css/template.css', 'template'],
    ['css/darkmode.css', 'dark']
  ])
  assert.ok(by['9'].excluded.some((e) => e.path.endsWith('css/error.css')))
  assert.deepEqual(by['10'].sheets.map((s) => s.path.replace('capture/templates/t3x/', '')), ['css/bootstrap.css', 'css/themes/red/template.css', 'css/themes/red/red-extra.css', 'css/darkmode.css'])
  // the theme-only sheet is read for its own style, and for no other
  assert.equal(by['10'].design.rules.find((r) => r.role === 'container').styles['desktop-light'].maxWidth, '1170px')
  assert.ok(by['10'].design.rules.find((r) => r.role === 'container').from.includes('capture/templates/t3x/css/themes/red/red-extra.css'))
  assert.ok(!by['9'].sheets.some((s) => s.path.includes('red-extra')))
  assert.ok(by['10'].excluded.some((e) => e.path === 'capture/templates/t3x/css/themes/red/offline.css'), JSON.stringify(by['10'].excluded))
  const rule = (s, role) => s.design.rules.find((r) => r.role === role)
  // the later sheet wins; the theme's file replaces the base one only for its own style
  assert.deepEqual(rule(by['9'], 'body-colors').styles['desktop-light'], { color: '#777777', backgroundColor: '#ffffff' })
  assert.deepEqual(rule(by['9'], 'body-colors').styles['desktop-dark'], { color: '#a7b0c2', backgroundColor: '#0f1320' })
  assert.equal(rule(by['9'], 'button-primary').styles['desktop-light'].backgroundColor, '#d93030')
  assert.equal(rule(by['10'], 'button-primary').styles['desktop-light'].backgroundColor, '#aa1111')
  assert.equal(rule(by['9'], 'button-primary').styles['desktop-light'].color, '#ffffff', 'bootstrap.css declares it; template.css does not override it')
  assert.deepEqual(rule(by['9'], 'main-body').styles['mobile-light'], { paddingTop: '40px', paddingBottom: '40px' })
  assert.equal(rule(by['9'], 'main-body').selector, '.t3-mainbody')
  // .container width is declared for desktop only: left out, and said so
  assert.deepEqual(Object.keys(rule(by['9'], 'container').styles['desktop-light']), ['paddingLeft', 'paddingRight'])
  // a theme not captured, a theme name that is not plain: base sheets, the gap named
  assert.ok(by['11'].gaps.some((g) => /theme "blue" is set, but capture\/templates\/t3x\/css\/themes\/blue\/ is not in the capture/.test(g)))
  assert.ok(by['12'].gaps.some((g) => /theme "\.\.\/red" is not a plain directory name/.test(g)))
  assert.deepEqual(by['12'].sheets.map((s) => s.path.replace('capture/templates/t3x/', '')), ['css/bootstrap.css', 'css/template.css', 'css/darkmode.css'])
  // the theme sheets those routes are served are not read: the base sheets read beside them publish nothing
  for (const id of ['11', '12']) {
    assert.deepEqual(by[id].design.rules, [], id)
    assert.ok(by[id].gaps.some((g) => g.startsWith(`style #${id}: a sheet its routes load is not read (`)), JSON.stringify(by[id].gaps))
  }
  assert.deepEqual(by['10'].routes, ['/red'])
  assert.deepEqual(by['9'].routes, ['/'])
})

test('issue54 T3: on a live capture the sheets a route is recorded as served are its rule source — the compiled 2px, not the template 4px; a route with no record publishes nothing', () => {
  const x = t3Capture({ assets: true })
  const routes = [
    { id: 1, path: '/', stylesheets: ['https://site.example/t3-assets/css/css-4f2a.css?t=1712', '/templates/t3x/css/darkmode.css'] },
    { id: 2, path: '/red' }
  ]
  const design = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById, routes, origin: 'https://site.example' })
  const by = Object.fromEntries(design.styles.map((s) => [s.id, s]))
  const rule = (s, role) => s.design.rules.find((r) => r.role === role)
  // style #9: exactly the linked sheets, in the order linked
  assert.deepEqual(by['9'].sheets.map((y) => [y.path, y.role, y.status]), [
    ['capture/t3-assets/css/css-4f2a.css', 'compiled', 'read'],
    ['capture/templates/t3x/css/darkmode.css', 'dark', 'read']
  ])
  assert.equal(rule(by['9'], 'button').styles['desktop-light'].borderRadius, '2px')
  assert.deepEqual(rule(by['9'], 'button').from, ['capture/t3-assets/css/css-4f2a.css'])
  assert.equal(rule(by['9'], 'button-primary').styles['desktop-light'].backgroundColor, '#222222')
  // nothing from a sheet the route is not served: not css-9c1e.css, not the template's bootstrap/template.css
  assert.ok(!by['9'].design.rules.some((r) => r.from.some((p) => /css-9c1e|bootstrap|template\.css/.test(p))), JSON.stringify(by['9'].design.rules))
  assert.ok(by['9'].excluded.some((e) => e.path === 'capture/t3-assets/css/css-9c1e.css' && /not linked by the style's routes \(render-routes\.json stylesheets of \/ \(index\.html\)\)/.test(e.reason)), JSON.stringify(by['9'].excluded))
  // a sheet outside the template the capture lacks may override any read sheet, wherever it is linked: nothing is published then
  const withMissing = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById, routes: [{ ...routes[0], stylesheets: ['/media/system/css/joomla-fontawesome.css', ...routes[0].stylesheets] }, routes[1]], origin: 'https://site.example' })
  const missing9 = withMissing.styles.find((s) => s.id === '9')
  assert.deepEqual(missing9.design.rules, [], JSON.stringify(missing9.design.rules))
  assert.ok(missing9.excluded.some((e) => e.path === '/media/system/css/joomla-fontawesome.css'))
  assert.ok(!by['9'].gaps.some((g) => /T3 serves compiled sheets/.test(g)), JSON.stringify(by['9'].gaps))
  // style #10: /red has no record — every sheet read and recorded, no value published, the cause named
  assert.deepEqual(by['10'].sheets.filter((y) => y.role === 'compiled').map((y) => [y.path, y.status, y.rules]), [
    ['capture/t3-assets/css/css-4f2a.css', 'read', 2],
    ['capture/t3-assets/css/css-9c1e.css', 'read', 1]
  ])
  assert.deepEqual(by['10'].design.rules, [])
  assert.ok(by['10'].gaps.some((g) => g.startsWith('style #10: T3 serves compiled sheets (capture/t3-assets/css/css-4f2a.css, capture/t3-assets/css/css-9c1e.css), and which of them') && /render-routes\.json records no stylesheets for \/red \(red\.html\)/.test(g) && /no design value of the style is published/.test(g)), JSON.stringify(by['10'].gaps))
  // no record at all: no value of any style, as before
  const none = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById })
  for (const s of none.styles.filter((y) => ['9', '10'].includes(y.id))) assert.deepEqual(s.design.rules, [], s.id)
})

test('issue54 T3: route records that differ, a linked sheet not captured, and a record with a traversal segment leave the style unplaced', () => {
  const x = t3Capture({ assets: true })
  // two pages of style #9 served different compiled sheets
  const pages = [...x.pages, { file: 'more.html', source: { menuId: 5, joomlaPath: '/more' } }]
  const menuById = new Map([...x.menuById, ['5', { templateStyleId: '9' }]])
  const run = (routes) => resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: pages, menuById, routes }).styles.find((s) => s.id === '9')
  const differ = run([
    { id: 1, path: '/', stylesheets: ['/t3-assets/css/css-4f2a.css'] },
    { id: 5, path: 'more', stylesheets: ['/t3-assets/css/css-9c1e.css'] }
  ])
  assert.deepEqual(differ.design.rules, [])
  assert.ok(differ.gaps.some((g) => /\/ \(index\.html\) and \/more \(more\.html\) are served different template or compiled sheets/.test(g)), JSON.stringify(differ.gaps))
  // the same sheets in both records: the style is placed
  const same = run([
    { id: 1, path: '/', stylesheets: ['/t3-assets/css/css-4f2a.css'] },
    { id: 5, path: '/more', stylesheets: ['/t3-assets/css/css-4f2a.css'] }
  ])
  assert.equal(same.design.rules.find((r) => r.role === 'button').styles['desktop-light'].borderRadius, '2px')
  // a module sheet the capture lacks may override the compiled one (specificity, !important), wherever it is linked: nothing is published
  const extra = run([
    { id: 1, path: '/', stylesheets: ['/t3-assets/css/css-4f2a.css'] },
    { id: 5, path: '/more', stylesheets: ['/media/mod_x/x.css', '/t3-assets/css/css-4f2a.css'] }
  ])
  assert.deepEqual(extra.design.rules, [])
  // a linked compiled sheet the capture does not hold: nothing else stands in for it
  const gone = run([
    { id: 1, path: '/', stylesheets: ['/t3-assets/css/css-4f2a.css', '/t3-assets/css/css-0000.css'] },
    { id: 5, path: '/more', stylesheets: ['/t3-assets/css/css-4f2a.css', '/t3-assets/css/css-0000.css'] }
  ])
  assert.deepEqual(gone.design.rules, [])
  assert.ok(gone.gaps.some((g) => g.startsWith('style #9: a sheet its routes load is not read (') && /capture\/t3-assets\/css\/css-0000\.css, which render-routes\.json stylesheets of .* link, is not in the capture/.test(g)), JSON.stringify(gone.gaps))
  // an encoded traversal segment is refused, never resolved
  const hostile = run([
    { id: 1, path: '/', stylesheets: ['/templates/t3x/css/a%2F..%2F..%2Fsecret.css'] },
    { id: 5, path: '/more', stylesheets: ['/t3-assets/css/css-4f2a.css'] }
  ])
  assert.deepEqual(hostile.design.rules, [])
  assert.ok(hostile.gaps.some((g) => /the stylesheets render-routes\.json records for \/ \(index\.html\) are refused: .* has the path segment/.test(g)), JSON.stringify(hostile.gaps))
  // dot segments, literal or encoded, a backslash, a tab: a URL parser would fold each into the path of
  // a captured sheet; the path is read as recorded, and refused
  for (const [href, why] of [
    ['/x/../t3-assets/css/css-4f2a.css', /has the path segment "\.\."/],
    ['/x/%2e%2e/t3-assets/css/css-4f2a.css', /has the path segment "\.\."/],
    ['/x/.%2E/t3-assets/css/css-4f2a.css', /has the path segment "\.\."/],
    ['/./t3-assets/css/css-4f2a.css', /has the path segment "\."/],
    ['https://site.example/x/../t3-assets/css/css-4f2a.css', /has the path segment "\.\."/],
    ['//site.example/x/%2E%2E/t3-assets/css/css-4f2a.css', /has the path segment "\.\."/],
    ['/x/..\\t3-assets/css/css-4f2a.css', /has a character a URL does not hold as written/],
    ['/x/.\t./t3-assets/css/css-4f2a.css', /has a character a URL does not hold as written/],
    ['/x/%zz/t3-assets/css/css-4f2a.css', /has a path that does not decode/],
    // an empty interior segment names another path than the one without it; a parser keeps it, the
    // captured file is not known to be served there
    ['/t3-assets//css/css-4f2a.css', /has an empty path segment/],
    ['https://site.example//t3-assets/css/css-4f2a.css', /has an empty path segment/],
    ['//site.example/t3-assets/css//css-4f2a.css', /has an empty path segment/]
  ]) {
    const rec = [
      { id: 1, path: '/', stylesheets: [href] },
      { id: 5, path: '/more', stylesheets: ['/t3-assets/css/css-4f2a.css'] }
    ]
    const s = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: pages, menuById, routes: rec, origin: 'https://site.example', basePath: '/' }).styles.find((y) => y.id === '9')
    assert.deepEqual(s.design.rules, [], href)
    assert.ok(s.gaps.some((g) => g.includes('the stylesheets render-routes.json records for / (index.html) are refused: ') && why.test(g)), `${href}: ${JSON.stringify(s.gaps)}`)
  }
})

test('issue54 T3: a page with no record of its sheets (a synthetic page) leaves only its own values unresolved; the recorded routes keep the compiled rules', () => {
  const x = t3Capture({ assets: true })
  const pages = [...x.pages, { file: '404.html', synthetic: true, source: {} }]
  const design = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: pages, menuById: x.menuById, routes: [{ id: 1, path: '/', stylesheets: ['/t3-assets/css/css-4f2a.css'] }] })
  const home = design.styles.find((s) => s.id === '9')
  assert.deepEqual(home.pages, ['index.html', '404.html'])
  assert.equal(home.design.rules.find((r) => r.role === 'button').styles['desktop-light'].borderRadius, '2px')
  assert.deepEqual(home.unplacedPages, ['404.html'])
  assert.deepEqual(placedPages(home), ['index.html'])
  assert.ok(home.gaps.some((g) => g.startsWith('style #9: render-routes.json records no stylesheets for 404.html') && /their design values are left unresolved/.test(g)), JSON.stringify(home.gaps))
  assert.ok(!home.gaps.some((g) => /no design value of the style is published/.test(g)), JSON.stringify(home.gaps))
})

/** joomla-coverage as a live T3 capture: template.css 4px, compiled css-4f2a.css 2px; every route records `hrefs`. */
const t3Full = (hrefs) => {
  const d = tmp('i54-t3full-')
  cpSync(FIXTURE, d, { recursive: true })
  const tpl = join(d, 'capture/templates/cov')
  rmSync(join(tpl, 'css/styles'), { recursive: true })
  rmSync(join(tpl, 'html/layouts/t4'), { recursive: true })
  for (const f of readdirSync(join(tpl, 'etc/layout'))) rmSync(join(tpl, 'etc/layout', f))
  write(join(tpl, 'etc/layout/default.ini'), '[mainbody]\n')
  write(join(tpl, 'templateDetails.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<extension type="template" client="site"><name>cov</name><version>1.0.0</version><t3><base>base-bs3</base></t3></extension>\n')
  write(join(tpl, 'css/template.css'), 'body{font-size:16px;color:#777777;background-color:#ffffff}\n.btn{border-radius:4px}\n')
  write(join(d, 'capture/t3-assets/css/css-4f2a.css'), ':root{--brand:#123456}\nbody{font-size:15px;color:#333333;background-color:#fefefe}\n.btn{border-radius:2px}\n')
  const rr = readJson(join(d, 'render-routes.json')).map((r) => ({ ...r, stylesheets: hrefs }))
  writeFileSync(join(d, 'render-routes.json'), JSON.stringify(rr))
  return d
}

test('issue54 T3: a full build of a live T3 capture — every route recorded, the synthetic pages not — publishes the compiled rules for the routes and none for the synthetic pages', () => {
  const r = build(t3Full(['/t3-assets/css/css-4f2a.css']))
  assert.equal(r.report.inspection.css.framework, 'T3')
  const page = (f) => r.design.pages.find((p) => p.id === f)
  const home = r.report.inspection.css.styles.find((s) => s.id === '20')
  assert.deepEqual(home.unresolvedPages, ['single.html', '404.html'])
  assert.ok(home.gaps.some((g) => /^style #20: render-routes\.json records no stylesheets for .*\(single\.html\), .*\(404\.html\) \(a synthetic page no route renders has none\)/.test(g)), JSON.stringify(home.gaps))
  // the recorded routes of the home style keep its compiled rules
  for (const f of ['index.html', 'about.html', 'news.html']) assert.ok(page(f).rules.includes('s20-button'), f)
  assert.equal(ruleOf(r.design, 's20-button').styles['desktop-light'].borderRadius, '2px')
  assert.deepEqual(ruleOf(r.design, 's20-body-colors').styles['desktop-light'], { color: '#333333', backgroundColor: '#fefefe' })
  // the synthetic pages take none of them
  for (const f of ['single.html', '404.html']) assert.deepEqual(page(f).rules, [], f)
  assert.ok(!r.design.rules.some((x) => Object.values(x.styles).some((v) => v.borderRadius === '4px')), JSON.stringify(r.design.rules))
  // the recorded routes resolve --brand, the synthetic pages' sheets are not known: no site-wide token expectation
  assert.equal(home.unresolvedTokens?.includes('--brand') ?? false, false)
  for (const v of Object.keys(r.design.tokens)) assert.equal(r.design.tokens[v]['--brand'], undefined, v)
  assert.ok(r.report.spec.causes.some((c) => c.cause.includes('no token resolves to one value in every style the pages use (#20, the pages of #20 whose sheets are not recorded (single.html, 404.html), #21, #23)')), JSON.stringify(r.report.spec.causes))
})

test('issue54 T3: a route record naming a compiled sheet with no t3-assets/css captured publishes no template value; a record of template sheets only is read as recorded', () => {
  const x = t3Capture()
  const run = (hrefs) => resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById, routes: [{ id: 1, path: '/', stylesheets: hrefs }] }).styles.find((s) => s.id === '9')
  const gone = run(['/templates/t3x/css/bootstrap.css', '/t3-assets/css/css-4f2a.css'])
  assert.deepEqual(gone.design.rules, [])
  assert.deepEqual(gone.sheets.map((y) => [y.path, y.status]), [
    ['capture/templates/t3x/css/bootstrap.css', 'read'],
    ['capture/t3-assets/css/css-4f2a.css', 'absent']
  ])
  assert.ok(gone.gaps.some((g) => g.startsWith('style #9: a sheet its routes load is not read (') && /capture\/t3-assets\/css\/css-4f2a\.css, which render-routes\.json stylesheets of \/ \(index\.html\) link, is not in the capture/.test(g)), JSON.stringify(gone.gaps))
  // records that cannot be placed, with no compiled sheet captured: the template sheets publish nothing either
  const hostile = run(['/templates/t3x/css/a%2F..%2Fsecret.css'])
  assert.deepEqual(hostile.design.rules, [])
  assert.ok(hostile.gaps.some((g) => g.startsWith("style #9: its routes' records of the sheets they are served cannot be placed (") && /has the path segment/.test(g)), JSON.stringify(hostile.gaps))
  // template sheets only: exactly those, in the order linked
  const own = run(['/templates/t3x/css/template.css', '/templates/t3x/css/darkmode.css'])
  assert.deepEqual(own.sheets.map((y) => y.path.replace('capture/templates/t3x/', '')), ['css/template.css', 'css/darkmode.css'])
  assert.equal(own.design.rules.find((r) => r.role === 'body-colors').styles['desktop-light'].color, '#777777')
  assert.ok(!own.design.rules.some((r) => r.role === 'button'), 'bootstrap.css is not linked: its .btn is not the route\'s')
})

test('issue54 T3: an absolute stylesheet URL stands for the captured file only on the source site origin — another host, a protocol-relative URL, an unknown origin leave the style unplaced', () => {
  const x = t3Capture({ assets: true })
  const run = (href, origin) => resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById, routes: [{ id: 1, path: '/', stylesheets: [href] }], origin }).styles.find((s) => s.id === '9')
  const radius = (s) => s.design.rules.find((r) => r.role === 'button')?.styles['desktop-light'].borderRadius
  assert.equal(radius(run('/t3-assets/css/css-4f2a.css', 'https://site.example')), '2px')
  assert.equal(radius(run('https://site.example/t3-assets/css/css-4f2a.css', 'https://site.example')), '2px')
  // a scheme-relative URL takes the source site's scheme: on its host it is the captured file
  assert.equal(radius(run('//site.example/t3-assets/css/css-4f2a.css', 'https://site.example')), '2px')
  assert.equal(radius(run('/t3-assets/css/css-4f2a.css', null)), '2px', 'a root-relative path is on the source site whatever its origin')
  for (const [href, origin] of [
    ['https://cdn.other.example/t3-assets/css/css-4f2a.css', 'https://site.example'],
    ['//cdn.other.example/t3-assets/css/css-4f2a.css', 'https://site.example'],
    ['http://site.example/t3-assets/css/css-4f2a.css', 'https://site.example'],
    ['https://site.example:8443/templates/t3x/css/template.css', 'https://site.example'],
    ['https://site.example/t3-assets/css/css-4f2a.css', null],
    ['//site.example/t3-assets/css/css-4f2a.css', null]
  ]) {
    const s = run(href, origin)
    assert.deepEqual(s.design.rules, [], href)
    assert.ok(s.gaps.some((g) => g.startsWith('style #9: a sheet its routes load is not read (') && g.includes(`${href}, which render-routes.json stylesheets of / (index.html) link, is served from`) && /the captured file of the same path is not known to be it/.test(g)), `${href}: ${JSON.stringify(s.gaps)}`)
    assert.deepEqual(s.sheets, [], `${href}: the local file of the same path is not read for it`)
  }
  // a sheet of another host outside the template and t3-assets paths is not read, as a media sheet is not
  const cdn = run('https://cdn.other.example/lib/fa.css', 'https://site.example')
  assert.ok(cdn.excluded.some((e) => e.path === '/lib/fa.css'), JSON.stringify(cdn.excluded))
})

test('issue54 T3: a URL path is a captured sheet only below the base path of the source site — a same-origin path outside it, or at another depth, leaves the style unplaced', () => {
  const x = t3Capture({ assets: true })
  const run = (href, basePath) => resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById, routes: [{ id: 1, path: '/', stylesheets: [href] }], origin: 'https://site.example', basePath }).styles.find((s) => s.id === '9')
  const radius = (s) => s.design.rules.find((r) => r.role === 'button')?.styles['desktop-light'].borderRadius
  assert.equal(radius(run('https://site.example/sub/t3-assets/css/css-4f2a.css', '/sub/')), '2px')
  assert.equal(radius(run('/sub/t3-assets/css/css-4f2a.css', '/sub/')), '2px')
  const own = run('/sub/templates/t3x/css/template.css', '/sub/')
  assert.deepEqual(own.sheets.map((y) => [y.path, y.status]), [['capture/templates/t3x/css/template.css', 'read']])
  assert.equal(own.design.rules.find((r) => r.role === 'body-colors').styles['desktop-light'].color, '#777777')
  for (const [href, basePath] of [
    ['https://site.example/other/t3-assets/css/css-4f2a.css', '/'],
    ['/other/t3-assets/css/css-4f2a.css', '/'],
    ['/t3-assets/css/css-4f2a.css', '/sub/'],
    ['https://site.example/other/t3-assets/css/css-4f2a.css', '/sub/'],
    ['/other/templates/t3x/css/template.css', '/'],
    ['/templates/t3x/css/template.css', '/sub/'],
    ['/t3-assets/css/css-4f2a.css', null]
  ]) {
    const s = run(href, basePath)
    assert.deepEqual(s.design.rules, [], `${href} on ${basePath}`)
    assert.deepEqual(s.sheets, [], `${href} on ${basePath}: the captured file of the same name is not read for it`)
    assert.ok(s.gaps.some((g) => g.startsWith('style #9: a sheet its routes load is not read (') && g.includes(`${href}, which render-routes.json stylesheets of / (index.html) link, is on the source site`) && /the captured file of the same name is not known to be it/.test(g)), `${href}: ${JSON.stringify(s.gaps)}`)
  }
  // `/sub//…` is not below `/sub/`: an empty interior segment is refused, never folded away
  for (const href of ['/sub//t3-assets/css/css-4f2a.css', 'https://site.example/sub//t3-assets/css/css-4f2a.css', '/sub/templates//t3x/css/template.css']) {
    const s = run(href, '/sub/')
    assert.deepEqual(s.design.rules, [], href)
    assert.ok(s.gaps.some((g) => g.includes('the stylesheets render-routes.json records for / (index.html) are refused: ') && g.includes('has an empty path segment')), `${href}: ${JSON.stringify(s.gaps)}`)
  }
  // a same-origin sheet outside the template and t3-assets paths is not read, as a media sheet is not
  assert.ok(run('/other/media/fa.css', '/sub/').excluded.some((e) => e.path === '/other/media/fa.css'))
  // the full build takes the base path from --site-url
  // a --site-url whose path has an empty interior segment has no known base path: nothing is placed
  for (const [siteUrl, got] of [['https://site.example/sub', '2px'], ['https://site.example/sub/', '2px'], ['https://site.example/', undefined], ['https://site.example//sub', undefined], ['https://site.example/sub//', undefined]]) {
    const r = build(t3Full(['/sub/t3-assets/css/css-4f2a.css']), siteUrl)
    assert.equal(r.design.rules.find((y) => y.id === 's20-button')?.styles['desktop-light'].borderRadius, got, siteUrl)
    assert.ok(!r.design.rules.some((y) => Object.values(y.styles).some((v) => v.borderRadius === '4px')), siteUrl)
  }
  const outside = build(t3Full(['/sub/t3-assets/css/css-4f2a.css']), 'https://site.example/').report.inspection.css.styles.find((s) => s.id === '20')
  assert.ok(outside.gaps.some((g) => g.includes('/sub/t3-assets/css/css-4f2a.css, which render-routes.json stylesheets of') && g.includes('below its base path (/)')), JSON.stringify(outside.gaps))
})

test('issue54 T3: a path-relative stylesheet URL is not resolved against a synthetic root — on a nested route it names no known file, and the style keeps no value', () => {
  const x = t3Capture({ assets: true })
  // on /blog/post this names /blog/t3-assets/css/css-4f2a.css, or what a <base> element makes of it
  const pages = [{ file: 'index.html', source: { menuId: 1, joomlaPath: '/blog/post' } }]
  for (const href of ['t3-assets/css/css-4f2a.css', '../t3-assets/css/css-4f2a.css', './templates/t3x/css/template.css']) {
    const s = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: pages, menuById: x.menuById, routes: [{ id: 1, path: '/blog/post', stylesheets: ['/t3-assets/css/css-9c1e.css', href] }], origin: 'https://site.example' }).styles.find((y) => y.id === '9')
    assert.deepEqual(s.design.rules, [], href)
    assert.ok(s.gaps.some((g) => g.startsWith('style #9: a sheet its routes load is not read (') && g.includes(`${href}, which render-routes.json stylesheets of /blog/post (index.html) link, is a path-relative URL`)), `${href}: ${JSON.stringify(s.gaps)}`)
    assert.ok(!s.sheets.some((y) => y.path === 'capture/t3-assets/css/css-4f2a.css'), `${href}: the file of the same name is not read for it`)
  }
})

test('issue54 T3: render-routes.json stylesheets that are not a list of URL strings are refused naming the route', () => {
  for (const bad of ['x.css', [''], [1], Array.from({ length: 1001 }, () => '/a.css')])
    assert.throws(() => checkRenderRoutes([{ id: 1, path: '/', stylesheets: bad }], 'rr.json'), /^Error: rr\.json: routes\[0\]\.stylesheets must be a list of at most 1000 stylesheet URLs/)
  checkRenderRoutes([{ id: 1, path: '/', stylesheets: ['/t3-assets/css/a.css'] }, { id: 2, path: '/b' }])
})

test('issue54 T3: a compiled sheet stands for the template sheet of its name; a compiled page-mode sheet is left out; the style stays unplaced', () => {
  const x = t3Capture()
  write(join(x.d, 'capture/t3-assets/css/template.css'), 'body{color:#555555}\n.t3-mainbody{padding-top:24px;padding-bottom:24px}\n')
  write(join(x.d, 'capture/t3-assets/css/error.css'), 'body{background:#ff0000}\n')
  const design = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById })
  const by = Object.fromEntries(design.styles.map((s) => [s.id, s]))
  assert.deepEqual(by['9'].sheets.map((y) => y.path), ['capture/templates/t3x/css/bootstrap.css', 'capture/templates/t3x/css/darkmode.css', 'capture/t3-assets/css/template.css'])
  assert.ok(by['10'].excluded.some((e) => e.path === 'capture/templates/t3x/css/themes/red/template.css' && /serves the compiled capture\/t3-assets\/css\/template\.css in its place/.test(e.reason)))
  assert.ok(by['9'].excluded.some((e) => e.path === 'capture/t3-assets/css/error.css'), 'a compiled page-mode sheet is left out')
  // the compiled template.css may be the red theme's or the default's: neither style takes a value from it
  for (const id of ['9', '10']) assert.deepEqual(by[id].design.rules, [])
  // a page-mode sheet alone compiled there leaves the template sheets the source
  rmSync(join(x.d, 'capture/t3-assets/css/template.css'))
  const home = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById }).styles.find((s) => s.id === '9')
  assert.equal(home.design.rules.find((r) => r.role === 'body-colors').styles['desktop-light'].color, '#777777')
  assert.ok(!home.gaps.some((g) => /T3 serves compiled sheets/.test(g)))
})

test('issue54: a template with no framework marker reads css/*.css with the gap reported; a hostile manifest is refused, not parsed', () => {
  const x = t3Capture({ manifest: '<extension type="template" client="site"><name>t3x</name></extension>' })
  rmSync(join(x.tpl.dir, 'etc'), { recursive: true })
  const design = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById })
  assert.equal(design.framework.framework, 'other')
  const home = design.styles.find((s) => s.id === '9')
  assert.ok(home.gaps.some((g) => /^framework other: the adapter knows no compiled-sheet location/.test(g)))
  assert.ok(home.design.rules.some((r) => r.role === 'body-colors'))
  assert.deepEqual(manifestSummary('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><extension>&e;</extension>'), { error: 'entity declarations refused' })
  assert.match(manifestSummary('<extension><t4></extension>').error, /malformed XML/)
  assert.deepEqual(manifestSummary('<extension><t4/><config><fields addfieldpath="/plugins/system/t4/admin/fields"/></config></extension>'), { root: 'extension', children: ['config', 't4'], pluginRefs: ['t4'] })
})

// ── the CSS reader ─────────────────────────────────────────────────────────────

test('issue54 css: strings, data URLs, stray and unterminated input, imports and conditions', () => {
  const r = parseCss(`@charset "utf-8";
@import url("x.css");
a::after { content: "} ; {"; background: url(data:image/png;base64,AAA=) }
}
@media print { body { color: #000 } }
@media screen and (min-width: 48em) and (max-width: 1199.98px) { body { color: #111 } }
@media (orientation: landscape) { body { color: #222 } }
@media (min-width: 1px), print { body { color: #333 } }
@font-face { font-family: X; src: url(x.woff) }
@layer base { body { color: #444 } }
body { color: #555 !important ; ; margin }
p { color: #666`)
  assert.deepEqual(r.rules[0].decls, [
    { prop: 'content', value: '"} ; {"', important: false },
    { prop: 'background', value: 'url(data:image/png;base64,AAA=)', important: false }
  ])
  assert.deepEqual(r.rules.find((x) => x.media.length)?.media, [{ min: 768, max: 1199.98 }])
  assert.equal(r.rules.filter((x) => x.selectors[0] === 'body').length, 2, 'print skipped; unsupported conditions not read')
  assert.deepEqual(r.rules.find((x) => x.selectors[0] === 'body' && !x.media.length).decls, [{ prop: 'color', value: '#555', important: true }])
  for (const re of [/@import url\("x\.css"\): imported sheet not followed/, /stray text/, /@media \(orientation: landscape\): condition not supported/, /@media \(min-width: 1px\), print: condition not supported/, /@layer block: not read/, /unterminated/])
    assert.ok(r.unsupported.some((u) => re.test(u)), `${re} in ${JSON.stringify(r.unsupported)}`)
  // what the conditions hold may apply: kept as conditional rules, never as rules
  assert.deepEqual(r.conditional.map((x) => [x.selectors[0], x.decls[0].value, x.why]), [
    ['body', '#222', 'inside @media (orientation: landscape)'],
    ['body', '#333', 'inside @media (min-width: 1px), print'],
    ['body', '#444', 'inside @layer base'],
    ['p', '#666', 'unterminated block "p"']
  ])
  assert.deepEqual(r.opaque, ['@import url("x.css") (a sheet not followed)', 'stray text "}"'])
  assert.deepEqual(parseCss('@layer a, b;\nbody{color:#000}').opaque, [], 'a layer statement orders layers; it hides no rule')
  // a namespace changes what an unprefixed type selector matches; @property what a token inherits;
  // the sheet is unknowable, and no value of the style is published
  for (const [css, name] of [
    ['@namespace url(http://www.w3.org/2000/svg);\nbody{color:#ff0000;background-color:#ffffff}', '@namespace'],
    ['@namespace svg url(http://www.w3.org/2000/svg);\nbody{color:#ff0000;background-color:#ffffff}', '@namespace'],
    ['@property --fg { syntax: "<color>"; inherits: false; initial-value: #000000 }\n:root{--fg:#ff0000}\nbody{color:var(--fg);background-color:#ffffff}', '@property']
  ]) {
    const p = parseCss(css)
    assert.equal(p.opaque.length, 1, `${name}: ${JSON.stringify(p.opaque)}`)
    assert.ok(p.opaque[0].startsWith(name), JSON.stringify(p.opaque))
    const d = styleDesign([{ path: 'a.css', ...p }])
    assert.deepEqual(d.rules, [], name)
    assert.deepEqual(d.tokens['desktop-light'], {}, name)
    assert.ok(d.gaps.some((g) => g.startsWith('no design value of the style is published: a.css: ') && g.includes(name)), JSON.stringify(d.gaps))
  }
  // @-ms-viewport (Bootstrap 3) is applied by no current engine: passed over, the sheet read
  const vp = parseCss('@-ms-viewport { width: device-width }\n@viewport { width: 320px }\nbody{color:#ff0000}')
  assert.deepEqual([vp.opaque, vp.rules.map((x) => x.selectors[0])], [[], ['body']])
  assert.equal(parseMediaCondition('only screen and (max-width: 40rem)').max, 640)
  assert.equal(parseMediaCondition('print'), 'never')
  assert.equal(parseMediaCondition('(min-width: calc(1px + 2px))'), null)
  assert.deepEqual(parseCss('').rules, [])
})

test('issue54 css: a rule under a condition not read, nested in another, or cut off may apply — it withholds what it can win, and is never read as the value', () => {
  const design = (css) => styleDesign([{ path: 'a.css', ...parseCss(css) }])
  const rule = (d, role) => d.rules.find((r) => r.role === role)
  const base = 'body{color:#111111;background-color:#ffffff}\n.btn{border-radius:4px;padding:6px 12px}\n'
  // @supports, a media feature not read, @container, @layer: the base value is withheld, the conditional one not published
  for (const [wrap, why] of [
    ['@supports (display: grid) { body { color: #222222 } }', 'inside @supports (display: grid)'],
    ['@media (prefers-color-scheme: dark) { body { color: #222222 } }', 'inside @media (prefers-color-scheme: dark)'],
    ['@container (min-width: 1px) { body { color: #222222 } }', 'inside @container (min-width: 1px)'],
    ['@layer base { body { color: #222222 } }', 'inside @layer base']
  ]) {
    const d = design(base + wrap)
    assert.deepEqual(rule(d, 'body-colors').styles['desktop-light'], { backgroundColor: '#ffffff' }, wrap)
    assert.ok(d.gaps.some((g) => g === `body color: body (a.css, ${why}) can win over it at desktop-light, desktop-dark, mobile-light, mobile-dark; withheld there`), `${wrap}: ${JSON.stringify(d.gaps)}`)
  }
  // one that cannot win (the base value is !important) withholds nothing
  assert.deepEqual(rule(design('body{color:#111111 !important;background-color:#ffffff}\n@supports (display: grid) { body { color: #222222 } }'), 'body-colors').styles['desktop-light'], { color: '#111111', backgroundColor: '#ffffff' })
  // a layer, a scope, a starting style, an at-rule not known rank by what the adapter does not model:
  // their rules are never dismissed — not by a later !important (a layered !important one wins over
  // it), not by a more specific selector — nested in a style rule too
  for (const [css, why] of [
    ['@layer a { body { color: #ff0000 !important } }\nbody { color: #0000ff !important; background-color: #ffffff }', 'inside @layer a'],
    ['@layer a { :is(body, #x) { color: #ff0000 } }\nbody { color: #0000ff; background-color: #ffffff }', 'inside @layer a'],
    ['@scope (.page) { :scope body, body { color: #ff0000 } }\nbody { color: #0000ff !important; background-color: #ffffff }', 'inside @scope (.page)'],
    ['@starting-style { body { color: #ff0000 } }\nbody { color: #0000ff !important; background-color: #ffffff }', 'inside @starting-style'],
    ['@-x-unknown { body { color: #ff0000 } }\nbody { color: #0000ff !important; background-color: #ffffff }', 'inside @-x-unknown'],
    ['body { color: #0000ff !important; background-color: #ffffff; @layer a { color: #ff0000 !important } }', 'nested in "body"; inside @layer a']
  ]) {
    const d = design(css)
    const lit = rule(d, 'body-colors') ?? rule(d, 'body-type')
    assert.equal(lit?.styles['desktop-light'].color, undefined, css)
    assert.ok(d.gaps.some((g) => g.startsWith('body color: ') && g.includes(why) && g.includes('can win over it at desktop-light')), `${css}: ${JSON.stringify(d.gaps)}`)
  }
  // the parser marks them: a rule gated only by a condition ranks as usual, one in a layer does not
  assert.deepEqual(parseCss('@supports (display:grid){a{color:red}} @layer x{a{color:red}} @media (hover:hover){@layer y{a{color:red}}}').conditional.map((c) => Boolean(c.unranked)), [false, true, true])
  // a token a condition may set: every value reading it is withheld, its fallback does not stand in
  const tok = design(':root{--fg:#111111}\nbody{color:var(--fg, #000000);background-color:#ffffff}\n@media (prefers-color-scheme: dark) { :root { --fg: #eeeeee } }')
  assert.deepEqual(rule(tok, 'body-colors').styles['desktop-light'], { backgroundColor: '#ffffff' })
  assert.ok(tok.gaps.some((g) => g.includes(':root (a.css, inside @media (prefers-color-scheme: dark)) may set --fg')), JSON.stringify(tok.gaps))
  assert.equal(tok.tokens['desktop-light']['--fg'], undefined)
  // nested rules, composed with their parent: `&`, a descendant, a combinator, an at-rule
  for (const nested of ['.card { & .btn { border-radius: 0 } }', '.card { .btn { border-radius: 0 } }', '.card { > .btn { border-radius: 0 } }', '.btn { @media (hover: hover) { border-radius: 0 } }']) {
    const d = design(base + nested)
    assert.equal(rule(d, 'button').styles['desktop-light'].borderRadius, undefined, nested)
    assert.equal(rule(d, 'button').styles['desktop-light'].paddingTop, '6px', nested)
    assert.ok(d.gaps.some((g) => /^\.btn border-radius: .* can win over it/.test(g)), `${nested}: ${JSON.stringify(d.gaps)}`)
  }
  // an empty custom property is declared: a value reading it does not fall back
  const empty = design(base + '.btn{--r:}\n.btn{border-radius:var(--r, 9px)}')
  assert.equal(rule(empty, 'button').styles['desktop-light'].borderRadius, undefined)
  // an import not followed, stray text a browser folds into the next rule: nothing of the style is published
  for (const [css, why] of [
    [`@import url("more.css");\n${base}`, '@import url("more.css") (a sheet not followed)'],
    [`${base}}\nbody{color:#333333}`, 'stray text "}"'],
    [`${base}oops;\nbody{color:#333333}`, 'stray statement "oops"']
  ]) {
    const d = design(css)
    assert.deepEqual(d.rules, [], css)
    assert.ok(d.gaps[0].startsWith(`no design value of the style is published: a.css: ${why}`), JSON.stringify(d.gaps))
  }
})

test('issue54 css: custom property names keep their case and are compared with escapes decoded; an invalid var() name leaves the value unresolved', () => {
  const design = (css) => styleDesign([{ path: 'a.css', ...parseCss(css) }])
  const colors = (css) => design(css).rules.find((r) => r.role === 'body-colors')?.styles['desktop-light']
  // --Brand is not --brand: the browser takes the fallback, and so does the resolver
  assert.deepEqual(colors(':root{--Brand:#ff0000} body{color:var(--brand,#0000ff);background-color:#ffffff}'), { color: '#0000ff', backgroundColor: '#ffffff' })
  assert.deepEqual(colors(':root{--Brand:#ff0000} body{color:var(--Brand,#0000ff);background-color:#ffffff}'), { color: '#ff0000', backgroundColor: '#ffffff' })
  const t = design(':root{--Brand:#ff0000;--brand:#00ff00}').tokens['desktop-light']
  assert.deepEqual([t['--Brand'], t['--brand']], ['#ff0000', '#00ff00'])
  // an escape names the same property as the character it stands for, in a declaration and in var()
  assert.deepEqual(colors(':root{--\\62rand:#ff0000} body{color:var(--brand,#0000ff);background-color:#ffffff}'), { color: '#ff0000', backgroundColor: '#ffffff' })
  assert.deepEqual(colors(':root{--brand:#ff0000} body{color:var(--\\62 rand,#0000ff);background-color:#ffffff}'), { color: '#ff0000', backgroundColor: '#ffffff' })
  assert.deepEqual(colors(':root{--brånd:#ff0000} body{color:var(--brånd,#0000ff);background-color:#ffffff}'), { color: '#ff0000', backgroundColor: '#ffffff' })
  // a standard property name is not case-sensitive
  assert.deepEqual(colors('body{COLOR:#123456;Background-Color:#ffffff}'), { color: '#123456', backgroundColor: '#ffffff' })
  // a first argument that is not one custom property name: unresolved, its fallback does not stand in
  for (const bad of ['var(brand,#0000ff)', 'var(--a b,#0000ff)', 'var(,#0000ff)']) assert.deepEqual(colors(`body{color:${bad};background-color:#ffffff}`), { backgroundColor: '#ffffff' }, bad)
})

test('issue54 css: the cascade resolves only what it can — cycles, missing tokens, computed values and shorthands stay gaps', () => {
  const sheet = (text, path = 'a.css') => ({ path, ...parseCss(text) })
  const d = styleDesign([
    sheet(`:root{--a:var(--b);--b:var(--a);--pair:1px 2px;--c:calc(1px + 2px);--ok:#123456}
body{color:var(--a);background-color:var(--ok);font-size:var(--c);line-height:var(--missing)}
.container{padding:var(--pair)}
.btn{background:#fff url(x.png);border-radius:3px !important}
.btn{border-radius:9px}
.btn-primary{background:#00ff00}
html[data-theme="dark"] .btn-primary{background:#003300}
h1{font:bold 2em serif;font-weight:700}`)
  ])
  const rule = (role) => d.rules.find((r) => r.role === role)
  assert.deepEqual(rule('body-colors').styles['desktop-light'], { backgroundColor: '#123456' }, 'the cyclic colour is left out')
  assert.equal(rule('body-type'), undefined, 'a calc() size and an undeclared token resolve to nothing')
  assert.equal(rule('container'), undefined, 'a token holding two values is not one padding side')
  assert.deepEqual(rule('button').styles['desktop-light'], { borderRadius: '3px' }, '!important wins over the later declaration')
  assert.deepEqual(rule('button-primary').styles['desktop-light'], { backgroundColor: '#00ff00' })
  assert.deepEqual(rule('button-primary').styles['desktop-dark'], { backgroundColor: '#003300' }, 'the dark hook is more specific')
  assert.deepEqual(rule('heading-type').styles['desktop-light'], { fontWeight: '700' }, 'the font shorthand leaves size and line-height unresolved')
  assert.ok(d.unresolvedTokens.includes('--a') && d.unresolvedTokens.includes('--c'))
  assert.ok(d.gaps.some((g) => /^body-type \(typography\): no body declaration resolves/.test(g)))
})

test('issue54 css: a block the sheet never closes is withheld with its properties, never read as a rule; a declaration without a value is reported', () => {
  const open = parseCss('body{color:#123456')
  assert.deepEqual(open.rules, [])
  assert.deepEqual(open.withheld, [{ selectors: ['body'], props: ['color'], why: 'unterminated block "body"' }])
  assert.ok(open.unsupported.includes('unterminated block "body": its declarations are withheld'), JSON.stringify(open.unsupported))
  // an unclosed @media withholds every rule inside it, closed or not
  const media = parseCss('a{color:#000000}\n@media (min-width: 768px) { body{color:#111111;background-color:#ffffff} .btn{border-radius:2px')
  assert.deepEqual(media.rules.map((r) => r.selectors[0]), ['a'])
  assert.deepEqual(media.withheld.map((w) => [w.selectors[0], w.props]), [['body', ['color', 'background-color']], ['.btn', ['border-radius']]])
  assert.ok(media.withheld.every((w) => /^unterminated block "@media \(min-width: 768px\)"$/.test(w.why)))
  const bad = parseCss('body{color;background-color:#ffffff;font-size:}')
  assert.deepEqual(bad.rules[0].decls, [{ prop: 'background-color', value: '#ffffff', important: false }])
  assert.equal(bad.unsupported.filter((u) => /^declaration "(color|font-size:)" in "body": no property or value; not read$/.test(u)).length, 2, JSON.stringify(bad.unsupported))
  // a style whose sheet is cut off reports the withheld selector and property among its gaps
  const x = t3Capture()
  writeFileSync(join(x.tpl.dir, 'css/template.css'), `${readFileSync(join(x.tpl.dir, 'css/template.css'), 'utf8')}.btn{border-radius:9px`)
  const home = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById }).styles.find((s) => s.id === '9')
  assert.ok(home.gaps.includes('capture/templates/t3x/css/template.css: .btn border-radius withheld (unterminated block ".btn")'), JSON.stringify(home.gaps))
  // a browser closes the block at the end of the sheet and applies it: neither 9px nor bootstrap.css's 4px is published
  assert.equal(home.design.rules.find((r) => r.role === 'button').styles['desktop-light'].borderRadius, undefined, 'the cut-off value is not read, and it may win')
  assert.ok(home.design.gaps.some((g) => g.startsWith('.btn border-radius: .btn (capture/templates/t3x/css/template.css, unterminated block ".btn") can win over it')), JSON.stringify(home.design.gaps))
})

test('issue54 css: specificity ranks :root over a later html, the dark hook over the bare selector, :where() as nothing', () => {
  assert.deepEqual(specificity(':root'), [0, 1, 0])
  assert.deepEqual(specificity('html'), [0, 0, 1])
  assert.deepEqual(specificity('html[data-theme="dark"] a:not(.btn)'), [0, 2, 2])
  assert.deepEqual(specificity(':where(.x) a::before'), [0, 0, 2])
  assert.deepEqual(specificity('#id .a:is(.b, #c) > li:hover'), [2, 2, 1])
  const d = styleDesign([
    { path: 'a.css', ...parseCss(':root{--fg:#111111;--bg:#ffffff}\nbody{color:var(--fg);background-color:var(--bg)}') },
    { path: 'b.css', ...parseCss('html{--fg:#999999;--bg:#000000}') }
  ])
  assert.deepEqual(d.rules.find((r) => r.role === 'body-colors').styles['desktop-light'], { color: '#111111', backgroundColor: '#ffffff' }, 'a later html token does not override :root')
  assert.equal(d.tokens['desktop-light']['--fg'], '#111111')
})

test('issue54 css: a token another rule can set on html — a class or attribute of html, :has(), *, a conditional rule — is not published as the root value', () => {
  for (const rival of ['html.itemid-7{--brand:#222222}', 'html[lang="en"]{--brand:#222222}', ':root:has(.x){--brand:#222222}', '*{--brand:#222222 !important}', 'html:not(.y){--brand:#222222}', ':is(html, .x){--brand:#222222}']) {
    const d = styleDesign([{ path: 'a.css', ...parseCss(`:root{--brand:#111111;--bg:#ffffff}\n${rival}\nbody{color:var(--brand);background-color:var(--bg)}`) }])
    for (const v of ['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark']) {
      assert.equal(d.tokens[v]['--brand'], undefined, `${rival} at ${v}`)
      assert.equal(d.tokens[v]['--bg'], '#ffffff', `${rival} at ${v}: a token it does not set stays`)
    }
    assert.ok(d.unresolvedTokens.includes('--brand'), rival)
    assert.ok(!d.rules.some((r) => r.role === 'body-colors' && r.styles['desktop-light'].color), `${rival}: the body colour reading it is withheld`)
  }
  // a rule that cannot match html, one that loses to :root (a later `*`), and the dark hook, which is
  // the dark variant's own declaration, leave it
  const d = styleDesign([{ path: 'a.css', ...parseCss(':root{--brand:#111111}\nbody{--other:#333333}\n.card{--brand:#222222}\n*{--brand:#444444}\nhtml[data-theme="dark"]{--brand:#eeeeee}') }])
  assert.equal(d.tokens['desktop-light']['--brand'], '#111111')
  assert.equal(d.tokens['desktop-dark']['--brand'], '#eeeeee')
  // a conditional rule on html / :root: as before, unresolved where it may win
  const c = styleDesign([{ path: 'a.css', ...parseCss(':root{--brand:#111111}\n@supports (display:grid){html.x{--brand:#222222}}') }])
  assert.equal(c.tokens['desktop-light']['--brand'], undefined)
})

test('issue54 css: a property declared but not resolved is a gap even when the role resolves another; a rule that can win over the role selector withholds its property', () => {
  const d = styleDesign([{ path: 'a.css', ...parseCss('body{color:var(--nope);background-color:#ffffff;font:16px/1.5 serif;font-weight:400}') }])
  assert.deepEqual(d.rules.find((r) => r.role === 'body-colors').styles['desktop-light'], { backgroundColor: '#ffffff' })
  assert.ok(d.gaps.includes('body color: declared at desktop-light, desktop-dark, mobile-light, mobile-dark but no value resolves there (a token not declared, a cycle, a value still to compute or a shorthand not split); left out'), JSON.stringify(d.gaps))
  for (const p of ['font-family', 'font-size', 'line-height']) assert.ok(d.gaps.some((g) => g.startsWith(`body ${p}: declared at `)), `${p} in ${JSON.stringify(d.gaps)}`)
  const c = styleDesign([
    {
      path: 'c.css',
      ...parseCss(`body{color:#111111;background-color:#ffffff}
body.page-dark{color:#eeeeee}
a{color:#0000ff}
.footer a{color:#ff0000}
a:hover,a:focus{color:#000000}
a::after{color:#00ff00}
a.btn{color:#ffffff}
a:not([href]):not([class]){color:inherit}
body.contentpane{color:#000000}
html[data-theme="dark"] body.offline{background-color:#000000}
.offline .btn{border-radius:1px}
.btn{border-radius:4px;padding:10px}
html body .btn:not(.btn-link){border-radius:0}
.btn-primary{color:#ffffff;background-color:#123456;border-color:#123456}
.btn-primary:hover{background-color:#000000}`)
    }
  ])
  const rule = (role) => c.rules.find((r) => r.role === role)
  // body is on every page once; which page carries .page-dark is not in the sheets
  assert.deepEqual(rule('body-colors').styles['desktop-light'], { backgroundColor: '#ffffff' })
  assert.ok(c.gaps.includes('body color: body.page-dark (c.css) can win over it at desktop-light, desktop-dark, mobile-light, mobile-dark; withheld there'), JSON.stringify(c.gaps))
  // body classes only a page-mode template sets (component.php, offline.php) style no route
  assert.ok(!c.gaps.some((g) => /contentpane|body\.offline/.test(g)), JSON.stringify(c.gaps))
  // a state, a pseudo-element, a class of links or an anchor without href does not land on a plain
  // link; a link in a context can (where a link sits is not in the sheets), so the colour is withheld
  assert.equal(rule('link-color'), undefined)
  assert.ok(c.gaps.includes('a color: .footer a (c.css) can win over it at desktop-light, desktop-dark, mobile-light, mobile-dark; withheld there'), JSON.stringify(c.gaps))
  assert.ok(!c.gaps.some((g) => /^a color: (a:hover|a:focus|a::after|a\.btn|a:not\(\[href\]\))/.test(g)), JSON.stringify(c.gaps))
  // a selector in a context is never read as the role's own, even one every .btn meets (html body):
  // it can win, so the property is withheld
  assert.equal(rule('button').styles['desktop-light'].borderRadius, undefined)
  assert.equal(rule('button').styles['desktop-light'].paddingTop, '10px')
  assert.ok(c.gaps.includes('.btn border-radius: html body .btn:not(.btn-link) (c.css) can win over it at desktop-light, desktop-dark, mobile-light, mobile-dark; withheld there'), JSON.stringify(c.gaps))
  // a .btn-primary that is a link in .footer takes .footer a's colour: withheld; a.btn needs a class it lacks
  assert.deepEqual(rule('button-primary').styles['desktop-light'], { backgroundColor: '#123456', borderColor: '#123456' })
  assert.ok(c.gaps.includes('.btn-primary color: .footer a (c.css) can win over it at desktop-light, desktop-dark, mobile-light, mobile-dark; withheld there'), JSON.stringify(c.gaps))
})

test('issue54 css: which rules land on the element a role reads — :is() branches, :link, structural and universal selectors, contexts', () => {
  const at = 'desktop-light, desktop-dark, mobile-light, mobile-dark'
  const d = (css) => styleDesign([{ path: 's.css', ...parseCss(css) }])
  const rule = (x, role) => x.rules.find((r) => r.role === role)
  // a selector naming body in an :is() branch can win on it; one losing on specificity cannot
  let x = d('body{color:#111111;background-color:#ffffff}\n:is(body,#app){color:#eeeeee}\n:where(body){background-color:#000000}')
  assert.deepEqual(rule(x, 'body-colors').styles['desktop-light'], { backgroundColor: '#ffffff' })
  assert.ok(x.gaps.includes(`body color: :is(body,#app) (s.css) can win over it at ${at}; withheld there`), JSON.stringify(x.gaps))
  // body: a context html cannot be (three ancestors, a div) does not land on it; a class-only rule
  // is a component's; html body and .page body (html's class) can win on it
  x = d('body{color:#111111;background-color:#ffffff}\n.table > :not(caption) > * > *{color:#ff0000}\ndiv body{color:#00ff00}\ndiv > body{color:#00ff00}\nbody + body{color:#00ff00}\n.page body{background-color:#0000ff}\n.x{color:#123123}')
  assert.deepEqual(rule(x, 'body-colors').styles['desktop-light'], { color: '#111111' })
  assert.ok(x.gaps.includes(`body background-color: .page body (s.css) can win over it at ${at}; withheld there`), JSON.stringify(x.gaps))
  // body's parent is html, its previous sibling head: each combinator is read as written
  for (const sel of ['html body', 'html > body', 'head + body', 'head ~ body', ':root > body']) {
    x = d(`body{color:#111111;background-color:#ffffff}\n${sel}{color:#222222}`)
    assert.ok(x.gaps.includes(`body color: ${sel} (s.css) can win over it at ${at}; withheld there`), `${sel}: ${JSON.stringify(x.gaps)}`)
  }
  // links: :link and a structural pseudo-class match a link at rest; * !important wins over everything
  for (const [css, by] of [
    ['a:link{color:#ff0000}', 'a:link'],
    ['a:first-child{color:#ff0000}', 'a:first-child'],
    ['*{color:#ff0000 !important}', '*'],
    [':is(a, .nav-link){color:#ff0000}', ':is(a, .nav-link)'],
    ['* > a{color:#ff0000}', '* > a']
  ]) {
    x = d(`a{color:#0000ff}\n${css}`)
    assert.equal(rule(x, 'link-color'), undefined, css)
    assert.ok(x.gaps.includes(`a color: ${by} (s.css) can win over it at ${at}; withheld there`), `${css}: ${JSON.stringify(x.gaps)}`)
  }
  // not landing on a plain link: a class it lacks, an :is() of classes, a state, a class in any context
  x = d('a{color:#0000ff}\n:is(.nav-link, .x){color:#ff0000}\na:focus-visible{color:#ff0000}\nnav a.active{color:#ff0000}')
  assert.deepEqual(rule(x, 'link-color').styles['desktop-light'], { color: '#0000ff' })
  // a link in a region can be the one read: where a link sits is not in the sheets
  for (const by of ['.footer a', 'nav a', 'li > a', 'section ~ a']) {
    x = d(`a{color:#0000ff}\n${by}{color:#ff0000}`)
    assert.ok(x.gaps.includes(`a color: ${by} (s.css) can win over it at ${at}; withheld there`), `${by}: ${JSON.stringify(x.gaps)}`)
  }
  // a:not(.btn) under the dark hook surely matches a plain link: it is the link colour in dark
  x = d('a{color:#0000ff}\nhtml[data-theme="dark"] a:not(.btn){color:#99ccff}')
  assert.deepEqual(rule(x, 'link-color').styles['desktop-dark'], { color: '#99ccff' })
  assert.deepEqual(rule(x, 'link-color').styles['desktop-light'], { color: '#0000ff' })
})

test('issue54 css: combinators, attribute operators and selectors outside the grammar — a rule that can match is a rival, never read as the role', () => {
  const at = 'desktop-light, desktop-dark, mobile-light, mobile-dark'
  const d = (css) => styleDesign([{ path: 's.css', ...parseCss(css) }])
  const rule = (x, role) => x.rules.find((r) => r.role === role)
  const withheld = (x, sel, prop, by, where = at) => assert.ok(x.gaps.includes(`${sel} ${prop}: ${by} (s.css) can win over it at ${where}; withheld there`), `${by}: ${JSON.stringify(x.gaps)}`)
  // a child or sibling combinator is kept: body > .btn matches a .btn that is a child of body, not every .btn
  for (const by of ['body > .btn', 'html body > .btn', 'div > .btn', '* + .btn', 'div ~ .btn', 'body .btn', ':not(nav) > .btn']) {
    const x = d(`.btn{border-radius:4px;padding:10px}\n${by}{border-radius:0}`)
    assert.equal(rule(x, 'button').styles['desktop-light'].borderRadius, undefined, by)
    assert.equal(rule(x, 'button').styles['desktop-light'].paddingTop, '10px', by)
    withheld(x, '.btn', 'border-radius', by)
  }
  // under the dark hook, the same: withheld in dark only
  let x = d('.btn{border-radius:4px}\nhtml[data-theme="dark"] body > .btn{border-radius:0}')
  withheld(x, '.btn', 'border-radius', 'html[data-theme="dark"] body > .btn', 'desktop-dark, mobile-dark')
  // where a plain element sits is not in the sheets: an ancestor or sibling of any type, carrying
  // anything (a class, a list item, a section, html's class), is a rival
  for (const by of ['.card > .btn', '.navbar .btn', 'li ~ .btn', 'h6 .btn', 'section .btn', '.table > :not(caption) > * > *', '.dark .x .btn', 'html.js .btn']) {
    x = d(`.btn{border-radius:4px;padding:10px}\n${by}{border-radius:0}`)
    assert.equal(rule(x, 'button').styles['desktop-light'].borderRadius, undefined, by)
    assert.equal(rule(x, 'button').styles['desktop-light'].paddingTop, '10px', by)
    withheld(x, '.btn', 'border-radius', by)
  }
  // a nested element is never a child of html; the element read is at rest: its own hover, press or focus is not read
  x = d('.btn{border-radius:4px}\n:root > .btn{border-radius:0}\nhead + .btn{border-radius:0}\n.btn:hover{border-radius:0}\n.btn:focus-visible{border-radius:0}\n:is(.btn:active, .x){border-radius:0}\n.btn::after{border-radius:0}')
  assert.equal(rule(x, 'button').styles['desktop-light'].borderRadius, '4px', JSON.stringify(x.gaps))
  // rest holds for the element read only: an ancestor or a sibling may be hovered, pressed or focused
  for (const by of ['.dropdown:hover .btn', '.nav:focus-within > .btn', 'li:hover + .btn', ':is(.menu:active) ~ .btn', 'body:hover .btn']) {
    x = d(`.btn{border-radius:4px;padding:10px}\n${by}{border-radius:0 !important}`)
    assert.equal(rule(x, 'button').styles['desktop-light'].borderRadius, undefined, by)
    assert.equal(rule(x, 'button').styles['desktop-light'].paddingTop, '10px', by)
    withheld(x, '.btn', 'border-radius', by)
  }
  // a state an element can be in at rest (disabled, checked, visited, a target…) may hold on the element read
  for (const [sel, prop, by] of [
    ['.btn', 'border-radius', '.btn:disabled'],
    ['.btn', 'border-radius', '.btn:checked'],
    ['.btn', 'border-radius', ':is(.btn:target, .x)'],
    ['.btn', 'border-radius', '.btn:not(:hover)'],
    ['a', 'color', 'a:visited'],
    ['a', 'color', 'a:target']
  ]) {
    const css = prop === 'color' ? `a{color:#0000ff}\n${by}{color:#ff0000}` : `.btn{border-radius:4px}\n${by}{border-radius:0}`
    x = d(css)
    withheld(x, sel, prop, by)
  }
  // a token an element above sets while hovered or focused reaches the element read
  x = d('.btn{border-radius:var(--r,4px);padding:10px}\n.dropdown:hover{--r:0}')
  assert.equal(rule(x, 'button').styles['desktop-light'].borderRadius, undefined, JSON.stringify(x.gaps))
  assert.ok(x.gaps.some((g) => g.startsWith('.btn border-radius:') && g.includes('.dropdown:hover')), JSON.stringify(x.gaps))
  x = d('body{color:#111111;background-color:#ffffff}\nhtml[data-theme="dark"] body{color:#eeeeee;background-color:#000000}\nhtml[data-theme="dark"] .teams-item-inner *{color:#123456}')
  assert.deepEqual(rule(x, 'body-colors').styles['desktop-dark'], { color: '#eeeeee', backgroundColor: '#000000' }, JSON.stringify(x.gaps))
  // an attribute the link always has, with any operator, can match it; one it does not carry cannot
  for (const by of ['a[href^="https"]', 'a[href$=".pdf"]', 'a[href*="example" i]', '[href]', 'a:not([href="#"])']) {
    x = d(`a{color:#0000ff}\n${by}{color:#ff0000}`)
    assert.equal(rule(x, 'link-color'), undefined, by)
    withheld(x, 'a', 'color', by)
  }
  // any other attribute is unknown, so it may be there with any value; a link always has an href
  for (const by of ['a[target]', 'a[data-x^="y"]', '[rel~="nofollow"]']) {
    x = d(`a{color:#0000ff}\n${by}{color:#ff0000}`)
    withheld(x, 'a', 'color', by)
  }
  x = d('a{color:#0000ff}\na:not([href]){color:#ff0000}\na[class]{color:#ff0000}\na[id="x"]{color:#ff0000}')
  assert.deepEqual(rule(x, 'link-color').styles['desktop-light'], { color: '#0000ff' }, JSON.stringify(x.gaps))
  // a class role can be any element: a .btn that is a link has an href (the selector engine on a probe page says so)
  x = d('.btn{border-radius:4px}\na.btn[href]{border-radius:0}\n[class~="btn"]{border-radius:1px !important}')
  withheld(x, '.btn', 'border-radius', '[class~="btn"]')
  x = d('.btn{border-radius:4px}\na.btn[href]{border-radius:0}')
  withheld(x, '.btn', 'border-radius', 'a.btn[href]')
  // a plain element's class attribute is its own classes: compared, not guessed
  x = d('.btn.btn-primary{border-color:#123456}\n[class*="border-"]{border-color:#000000 !important}\n[class^="btn"]{color:#ffffff}\n.btn-primary{color:#fff}')
  assert.equal(rule(x, 'button-primary').styles['desktop-light'].borderColor, '#123456', JSON.stringify(x.gaps))
  // in any order: class="btn-primary btn" meets [class^="btn-primary "], class="btn btn-primary" [class^="btn "]
  for (const by of ['[class^="btn "]', '[class^="btn-primary "]', '[class$=" btn"]', '[class*="primary btn"]', '[class="btn-primary btn"]', '[class|="btn"]']) {
    x = d(`.btn.btn-primary{border-color:#123456}\n${by}{border-color:#000000 !important}`)
    withheld(x, '.btn.btn-primary', 'border-color', by)
  }
  // the i flag, on an unquoted value too: [class=BTN i] is [class="BTN" i], which a lone .btn meets
  assert.deepEqual(parseCss('[class=BTN i]{border-radius:0}').rules[0].selectors, ['[class="BTN" i]'])
  assert.deepEqual(parseCss("[ class = 'BTN' s ]{border-radius:0}").rules[0].selectors, ['[class="BTN" s]'])
  x = d('.btn{border-radius:4px}\n[class=BTN i]{border-radius:0 !important}')
  assert.equal(rule(x, 'button'), undefined)
  withheld(x, '.btn', 'border-radius', '[class="BTN" i]')
  x = d('.btn{border-radius:4px}\n[class=BTN]{border-radius:0 !important}\n[class="btn x"]{border-radius:0 !important}')
  assert.equal(rule(x, 'button').styles['desktop-light'].borderRadius, '4px', JSON.stringify(x.gaps))
  // a class role's element is of a type the sheets do not say: a rule on any type can match it
  // (button:not(.x), input.btn, a form field or a void element all outrank .btn)
  for (const by of ['button:not(.x)', 'input.btn', 'input[type="submit"]', 'hr']) {
    x = d(`.btn{border-radius:4px}\n${by}{border-radius:0 !important}`)
    withheld(x, '.btn', 'border-radius', by)
  }
  x = d('.btn-primary{color:#ffffff;background-color:#123456;border-color:#123456}\nhtml[data-theme="dark"] input:not([type="submit"]){background-color:#000000 !important}\nbody{color:#000000 !important}')
  // withheld in dark, so not resolved at every variant: left out in light too; body's !important is not the button's
  for (const v of ['desktop-light', 'desktop-dark']) assert.deepEqual(rule(x, 'button-primary').styles[v], { color: '#ffffff', borderColor: '#123456' }, JSON.stringify(x.gaps))
  withheld(x, '.btn-primary', 'background-color', 'html[data-theme="dark"] input:not([type="submit"])', 'desktop-dark, mobile-dark')
  assert.ok(x.gaps.includes('.btn-primary background-color: resolved at desktop-light, mobile-light only; left out'), JSON.stringify(x.gaps))
  // the main body (held once): its ancestors may carry anything when the selector names it, not through a generic subject
  x = d('.t4-main-body{padding-top:40px;padding-bottom:40px}\n.table-sm > :not(caption) > * > *{padding-top:4px}\n.t4-wrapper .t4-main-body{padding-bottom:0}\na{padding-top:1px !important}')
  assert.deepEqual(rule(x, 'main-body').styles['desktop-light'], { paddingTop: '40px' }, JSON.stringify(x.gaps))
  withheld(x, '.t4-main-body', 'padding-bottom', '.t4-wrapper .t4-main-body')
  // a selector outside the grammar (a namespace, an escape, nesting) can match anything
  for (const by of ['*|a', '\\61 ', 'a\\:x', '& a']) {
    x = d(`a{color:#0000ff}\n${by}{color:#ff0000 !important}`)
    assert.equal(rule(x, 'link-color'), undefined, by)
  }
  assert.equal(parseSelector('*|a'), null)
  assert.equal(parseSelector('a\\:x'), null)
  assert.equal(parseSelector('a > > b'), null)
  assert.deepEqual(parseSelector('body > .btn').combinators, ['>'])
  // only the exact form a:not(<class or id>) is read with the role; a :not() with a context is a rival
  x = d('a{color:#0000ff}\na:not(.btn){color:#00ff00}')
  assert.deepEqual(rule(x, 'link-color').styles['desktop-light'], { color: '#00ff00' })
  x = d('a{color:#0000ff}\na:not(.nav .x){color:#00ff00}')
  withheld(x, 'a', 'color', 'a:not(.nav .x)')
})

test('issue54 css: a class attribute is every list of the element\'s own classes — any order, repetition and spacing', () => {
  const own = ['btn', 'btn-primary']
  const may = (op, v, ci = false) => classAttrMay(op, v, own, ci)
  for (const v of ['btn btn-primary', 'btn-primary btn', ' btn\tbtn-primary btn ']) assert.equal(may('=', v), true, v)
  for (const v of ['btn', 'btn btn-primary x', '', ' ']) assert.equal(may('=', v), false, v)
  assert.equal(may('=', 'BTN Btn-Primary', true), true)
  assert.equal(may('~=', 'btn-primary'), true)
  assert.equal(may('~=', 'btn btn-primary'), false)
  for (const v of ['btn', 'btn-p', 'btn-primary ', 'btn ', ' ', 'btn btn-primary btn', 'btn-primary btn-pr']) assert.equal(may('^=', v), true, `^= ${v}`)
  for (const v of ['x', 'btn-x', 'btn x', '']) assert.equal(may('^=', v), false, `^= ${v}`)
  for (const v of ['primary', ' btn', 'mary btn', 'n btn-primary']) assert.equal(may('$=', v), true, `$= ${v}`)
  for (const v of ['btn-', 'x btn', 'n btn-x']) assert.equal(may('$=', v), false, `$= ${v}`)
  for (const v of ['tn-pri', 'n btn-p', 'primary btn', ' ']) assert.equal(may('*=', v), true, `*= ${v}`)
  for (const v of ['btnx', 'n x b', 'primary x']) assert.equal(may('*=', v), false, `*= ${v}`)
  assert.equal(may('|=', 'btn'), true)
  assert.equal(may('|=', 'x'), false)
  assert.equal(classAttrMay('^=', 'btn', [], false), false)
})

test('issue54 css: a token the value reads is withheld when another rule can set it on the element or hand it down', () => {
  const at = 'desktop-light, desktop-dark, mobile-light, mobile-dark'
  const d = (css) => styleDesign([{ path: 's.css', ...parseCss(css) }])
  const rule = (x, role) => x.rules.find((r) => r.role === role)
  // a button inherits --fg from body: the fallback is not what it renders
  let x = d('body{--fg:#111111}\n.btn-primary{color:var(--fg,#abcdef);background-color:#123456;border-color:#123456}')
  assert.deepEqual(rule(x, 'button-primary').styles['desktop-light'], { backgroundColor: '#123456', borderColor: '#123456' })
  assert.ok(x.gaps.includes(`.btn-primary color: its value reads a token another rule decides (body (s.css) can hand --fg down to it) at ${at}; withheld there`), JSON.stringify(x.gaps))
  // the element's own token is read, whatever an ancestor declares
  x = d('body{--p:5px}\n.btn{--p:12px;padding:var(--p);border-radius:var(--r)}\n:root{--r:3px}')
  assert.deepEqual(rule(x, 'button').styles['desktop-light'], { borderRadius: '3px', paddingTop: '12px', paddingRight: '12px', paddingBottom: '12px', paddingLeft: '12px' })
  // a root token is read by body unless a rule on html other than :root / html can set it
  x = d(':root{--bg:#ffffff;--fg:#111111}\nbody{background-color:var(--bg);color:var(--fg)}\nhtml.itemid-7{--fg:#222222}\n.section{--bg:#000000}')
  assert.deepEqual(rule(x, 'body-colors').styles['desktop-light'], { backgroundColor: '#ffffff' })
  assert.ok(x.gaps.includes(`body color: its value reads a token another rule decides (html.itemid-7 (s.css) can hand --fg down to it) at ${at}; withheld there`), JSON.stringify(x.gaps))
  // a rival on the element itself that sets the token
  x = d('body{--fg:#111111;color:var(--fg);background-color:#ffffff}\nbody.home{--fg:#333333}')
  assert.ok(x.gaps.includes(`body color: its value reads a token another rule decides (body.home (s.css) can set --fg on it) at ${at}; withheld there`), JSON.stringify(x.gaps))
  // only in dark: the light value stands, the property is left out as resolved at light only
  x = d('.btn-primary{color:var(--c,#ffffff);background-color:#123456}\nhtml[data-theme="dark"] .card{--c:#000000}')
  assert.ok(x.gaps.includes('.btn-primary color: its value reads a token another rule decides (html[data-theme="dark"] .card (s.css) can hand --c down to it) at desktop-dark, mobile-dark; withheld there'), JSON.stringify(x.gaps))
})

test('issue54 css: a value outside the property grammar is left out and named — no invented colour, length or family', () => {
  const at = 'desktop-light, desktop-dark, mobile-light, mobile-dark'
  const x = styleDesign([
    {
      path: 's.css',
      ...parseCss(`body{color:not-a-color;background:white;font-family:12px;font-size:big;line-height:1.5;font-weight:heavy}
a{color:currentColor}
h1{font-size:2.5rem;font-weight:700;line-height:x}
.btn{border-radius:4px 2px;padding:-3px 10px;font-weight:600}
.btn-primary{color:#fff;background-color:#12345;border-color:#000 #111}`)
    }
  ])
  const rule = (role) => x.rules.find((r) => r.role === role)
  assert.deepEqual(rule('body-colors').styles['desktop-light'], { backgroundColor: 'white' })
  assert.deepEqual(rule('body-type').styles['desktop-light'], { lineHeight: '1.5' })
  assert.deepEqual(rule('heading-type').styles['desktop-light'], { fontSize: '2.5rem', fontWeight: '700' })
  assert.deepEqual(rule('button').styles['desktop-light'], { fontWeight: '600', paddingRight: '10px', paddingLeft: '10px' })
  assert.deepEqual(rule('button-primary').styles['desktop-light'], { color: '#fff' })
  assert.equal(rule('link-color'), undefined)
  for (const [sel, prop, value, form] of [
    ['body', 'color', 'not-a-color', 'one colour, not currentcolor'],
    ['body', 'font-family', '12px', 'a comma list of quoted names or identifiers'],
    ['body', 'font-size', 'big', 'a length, a percentage or a size keyword'],
    ['body', 'font-weight', 'heavy', 'normal, bold, bolder, lighter or 1–1000'],
    ['a', 'color', 'currentColor', 'one colour, not currentcolor'],
    ['h1', 'line-height', 'x', 'normal, a number, a length or a percentage'],
    ['.btn', 'border-radius', '4px 2px', 'one non-negative length or percentage'],
    ['.btn', 'padding-top', '-3px', 'one non-negative length or percentage'],
    ['.btn-primary', 'background-color', '#12345', 'one colour, not currentcolor'],
    ['.btn-primary', 'border-color', '#000 #111', 'one colour, not currentcolor']
  ])
    assert.ok(x.gaps.includes(`${sel} ${prop}: ${JSON.stringify(value)} at ${at} is not a ${prop} value the design contract reads (its grammar: ${form}); left out`), `${sel} ${prop} in ${JSON.stringify(x.gaps)}`)
  for (const [p, v, ok] of [
    ['color', 'rebeccapurple', true],
    ['color', 'rgb(1 2 3 / 50%)', true],
    ['color', 'inherit', false],
    ['font-family', '"PT Root UI", Helvetica Neue, sans-serif', true],
    ['font-family', 'Arial, inherit', false],
    ['max-width', 'none', true],
    ['max-width', 'foo', false],
    ['font-weight', '1001', false],
    ['padding-left', '0', true],
    ['border-radius', '50%', true]
  ])
    assert.equal(validDesignValue(p, v), ok, `${p}: ${v}`)
  // a palette token that is not one colour is not taken; the template setting stands in
  const pal = frameworkPalette(
    { homeId: '1', framework: { framework: 'T4' }, styles: [{ id: '1', design: { rules: [], tokens: { 'desktop-light': { '--color-primary': 'not-a-color', '--color-secondary': '#222222' }, 'desktop-dark': {} } } }] },
    { theme: { color_primary: '#123456', color_secondary: 'nope' } }
  )
  assert.deepEqual([pal.light.primary, pal.light.secondary], ['#123456', '#222222'])
})

test('issue54 T3: a refused theme sheet or theme directory is never replaced by the base sheet; the style and its routes carry the gap', () => {
  // `prep` changes the fixture; `locked` is a directory it closed (chmod 000), opened again after the read
  const refusedRed = (prep, locked = null, assets = false) => {
    const x = t3Capture({ assets })
    prep(x)
    try {
      const design = resolveDesign({ j6Dir: x.d, tpl: x.tpl, inv: x.inv, pageMapPages: x.pages, menuById: x.menuById })
      return Object.fromEntries(design.styles.map((s) => [s.id, s]))
    } finally {
      if (locked) chmodSync(locked(x), 0o755)
    }
  }
  const rel = (s) => s.sheets.map((y) => [y.path.replace('capture/templates/t3x/', ''), y.status])
  // the theme's template.css is a link: skipped, and the base template.css is not read in its place
  let by = refusedRed((x) => {
    rmSync(join(x.tpl.dir, 'css/themes/red/template.css'))
    symlinkSync('../../template.css', join(x.tpl.dir, 'css/themes/red/template.css'))
  })
  assert.deepEqual(rel(by['10']), [
    ['css/bootstrap.css', 'read'],
    ['css/themes/red/template.css', 'skipped'],
    ['css/themes/red/red-extra.css', 'read'],
    ['css/darkmode.css', 'read']
  ])
  assert.ok(by['10'].gaps.includes('capture/templates/t3x/css/themes/red/template.css was not read (symbolic link; not followed)'), JSON.stringify(by['10'].gaps))
  // the theme sheet not read may override any value of bootstrap.css and the others: none is published
  assert.deepEqual(by['10'].design.rules, [], 'neither the base template.css nor bootstrap.css stands for the theme sheet')
  assert.ok(by['10'].gaps.some((g) => g.startsWith('style #10: a sheet its routes load is not read (capture/templates/t3x/css/themes/red/template.css was not read (symbolic link; not followed))')), JSON.stringify(by['10'].gaps))
  assert.deepEqual(by['10'].routes, ['/red'])
  assert.equal(by['9'].design.rules.find((r) => r.role === 'button-primary').styles['desktop-light'].backgroundColor, '#d93030', 'the other style reads the base sheet as before')
  // the theme directory is a link, or cannot be listed: which sheets it replaces (and any it alone
  // ships) is unknown — no template sheet is read for the style, and the gap says so
  for (const [how, prep, reason, locked] of [
    [
      'link',
      (x) => {
        cpSync(join(x.tpl.dir, 'css/themes/red'), join(x.d, 'red-copy'), { recursive: true })
        rmSync(join(x.tpl.dir, 'css/themes/red'), { recursive: true })
        symlinkSync(join(x.d, 'red-copy'), join(x.tpl.dir, 'css/themes/red'))
      },
      /symbolic link; not followed/
    ],
    ['unlistable', (x) => chmodSync(join(x.tpl.dir, 'css/themes/red'), 0), /could not be (listed|opened) \(EACCES\)/, (x) => join(x.tpl.dir, 'css/themes/red')]
  ]) {
    by = refusedRed(prep, locked)
    const s = by['10']
    assert.ok(s.gaps.some((g) => /^style #10: theme "red" is set, but capture\/templates\/t3x\/css\/themes\/red\/ was not listed \(/.test(g) && reason.test(g) && /no template sheet is read/.test(g)), `${how}: ${JSON.stringify(s.gaps)}`)
    assert.ok(s.sheets.every((y) => y.status === 'skipped' && /whether the theme replaces this sheet is unknown/.test(y.reason)), `${how}: ${JSON.stringify(s.sheets)}`)
    assert.ok(!s.sheets.some((y) => y.path.includes('red-extra')))
    assert.equal(s.design.rules.find((r) => r.role === 'button-primary'), undefined, `${how}: nothing substituted for the theme`)
    assert.deepEqual(s.routes, ['/red'])
    assert.ok(by['9'].sheets.some((y) => y.path === 'capture/templates/t3x/css/template.css' && y.status === 'read'))
  }
  // the compiled t3-assets/css directory or the base css/ cannot be listed: named, not taken for absent
  // — and no value of the style is published from the template sheets that are read beside them
  by = refusedRed((x) => chmodSync(join(x.d, 'capture/t3-assets/css'), 0), (x) => join(x.d, 'capture/t3-assets/css'), true)
  assert.ok(by['9'].gaps.some((g) => /^style #9: capture\/t3-assets\/css\/ was not listed \(.*EACCES.*\): the sheets T3 compiled there are not read$/.test(g)), JSON.stringify(by['9'].gaps))
  assert.ok(by['9'].sheets.some((y) => y.path === 'capture/templates/t3x/css/template.css' && y.status === 'read'))
  assert.deepEqual(by['9'].design.rules, [])
  by = refusedRed((x) => chmodSync(join(x.tpl.dir, 'css'), 0), (x) => join(x.tpl.dir, 'css'))
  assert.ok(by['9'].gaps.some((g) => /^style #9: capture\/templates\/t3x\/css\/ was not listed \(.*EACCES.*\): the template's own sheets are not read$/.test(g)), JSON.stringify(by['9'].gaps))
  assert.deepEqual(by['9'].design.rules, [])
})

// ── identity ───────────────────────────────────────────────────────────────────

test('issue54 identity: only a field the source declares empty is absent; a field not read or not declared is not', () => {
  const tpl = (site, siteFile = 'capture/templates/x/etc/site/default.json', siteConfig = { config: null, from: null }) => ({ site, siteFile, siteConfig })
  assert.deepEqual(absentIdentity(tpl({ site_name: 'X', site_slogan: '' })), { name: null, tagline: 'capture/templates/x/etc/site/default.json declares site_slogan ""' })
  assert.equal(absentIdentity(tpl({ site_slogan: '   ' })).tagline !== null, true)
  assert.equal(absentIdentity(tpl({})).tagline, null, 'not declared')
  assert.equal(absentIdentity(tpl({ site_slogan: null })).tagline, null, 'null is not a declared empty string')
  assert.equal(absentIdentity(tpl({ site_slogan: 0 })).tagline, null)
  assert.equal(absentIdentity(tpl({ site_slogan: '' }, null)).tagline, null, 'no settings file read: no evidence')
  assert.equal(absentIdentity(tpl({ site_name: '' })).name, null, 'configuration.php not dumped: the name is not proven absent')
  assert.match(absentIdentity(tpl({ site_name: '' }, undefined, { config: { sitename: '' }, from: '/d/site-config.json' })).name, /site_name "" and site-config\.json declares sitename ""/)
})

test('issue54 identity: a build whose source declares an empty name and tagline validates with both as absent-in-source facts', () => {
  const d = tmp('i54-id-')
  cpSync(FIXTURE, d, { recursive: true })
  const siteFile = join(d, 'capture/templates/cov/etc/site/default.json')
  writeFileSync(siteFile, JSON.stringify({ ...readJson(siteFile), site_name: '', site_slogan: '' }))
  writeFileSync(join(d, 'site-config.json'), JSON.stringify({ sitename: '' }))
  const r = build(d)
  assert.equal(r.validation.ok, true, JSON.stringify(r.validation.problems))
  const c = readJson(join(r.out, 'content-contract.json'))
  assert.deepEqual(c.facts['site.name'], { value: '', status: 'absent-in-source', source: 'joomla-identity' })
  assert.deepEqual(c.facts['site.tagline'], { value: '', status: 'absent-in-source', source: 'joomla-identity' })
  assert.match(c.sources['joomla-identity'].note, /site_name "" and site-config\.json declares sitename ""/)
  assert.notEqual(c.facts['demo.disclosure'].status, 'absent-in-source')
  // a malformed settings file is an error, never an absence
  writeFileSync(siteFile, '{"site_slogan": ')
  assert.throws(() => build(d), /etc\/site\/default\.json/)
})

test('issue54 identity: a name or tagline that is not a string is malformed — no verified text, no absence, the gate names it', () => {
  for (const [slogan, shown] of [[0, '0'], [['Tagline'], '["Tagline"]'], [{ text: 'x' }, '{"text":"x"}'], [false, 'false']]) {
    const d = tmp('i54-idtype-')
    cpSync(FIXTURE, d, { recursive: true })
    const siteFile = join(d, 'capture/templates/cov/etc/site/default.json')
    writeFileSync(siteFile, JSON.stringify({ ...readJson(siteFile), site_name: 42, site_slogan: slogan }))
    writeFileSync(join(d, 'site-config.json'), JSON.stringify({ sitename: 'Cov Site' }))
    const r = build(d)
    const c = readJson(join(r.out, 'content-contract.json'))
    assert.equal(c.facts['site.tagline'], undefined, `site_slogan ${shown}: no fact`)
    assert.deepEqual(c.facts['site.name'], { value: 'Cov Site', status: 'verified', source: 'joomla' }, 'the name falls back to configuration.php')
    assert.equal(readJson(join(r.out, 'content.json')).site.tagline, null)
    assert.deepEqual(r.validation.problems, ['content-contract.json: identity.summary must reference a fact'])
    const cause = r.report.spec.causes.find((x) => /identity\.summary/.test(x.problem)).cause
    assert.ok(cause.includes(`declares site_slogan ${shown}, not a string (malformed; not read)`), cause)
    assert.ok(r.notes.some((n) => /etc\/site\/default\.json declares site_name 42, not a string; not read$/.test(n)), JSON.stringify(r.notes.filter((n) => n.startsWith('identity'))))
  }
})

// ── archives: extracted safely, or refused before anything is written ────────

const EXTRACT = String.raw`
import json, os, stat, sys, zipfile
archive, dest, prefixes, limits = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), json.loads(sys.argv[4])
def refuse(msg):
    print(json.dumps({"refused": msg})); sys.exit(3)
try:
    z = zipfile.ZipFile(archive)
except (zipfile.BadZipFile, OSError) as e:
    refuse("not a readable zip archive (%s)" % e)
chosen, seen, total = [], set(), 0
for i in z.infolist():
    n = i.filename
    if n.startswith("/") or "\\" in n or ":" in n or any(p in ("..", "") for p in n.rstrip("/").split("/")):
        refuse("member %r: not a plain relative path" % n)
    if stat.S_ISLNK(i.external_attr >> 16):
        refuse("member %r: a symbolic link" % n)
    if not any(n.startswith(p) for p in prefixes):
        continue
    key = n.rstrip("/").lower()
    if key in seen:
        refuse("member %r: a second entry for the same destination" % n)
    seen.add(key)
    total += i.file_size
    if len(chosen) >= limits["members"] or total > limits["bytes"] or (i.compress_size and i.file_size > limits["ratio"] * max(i.compress_size, 1024)):
        refuse("member %r: over the extraction limits %r" % (n, limits))
    chosen.append(i)
if not chosen:
    refuse("no member under %r" % prefixes)
root = os.path.realpath(dest)
for i in chosen:
    out = os.path.realpath(os.path.join(root, i.filename))
    if not out.startswith(root + os.sep):
        refuse("member %r: outside the destination" % i.filename)
for i in chosen:
    out = os.path.join(root, i.filename)
    if i.is_dir():
        os.makedirs(out, exist_ok=True); continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with z.open(i) as src, open(out, "xb") as dst:
        left = i.file_size
        while True:
            b = src.read(1 << 20)
            if not b: break
            left -= len(b)
            if left < 0: refuse("member %r: expands past its declared size" % i.filename)
            dst.write(b)
print(json.dumps({"extracted": len(chosen), "bytes": total}))
`
const LIMITS = { members: 20000, bytes: 200 * 1024 * 1024, ratio: 200 }
/** Extract the members under `prefixes` of a zip into `dest`: every member is checked before anything is written. */
function extractSafely(archive, dest, prefixes, limits = LIMITS) {
  mkdirSync(dest, { recursive: true })
  const r = spawnSync('python3', ['-c', EXTRACT, archive, dest, JSON.stringify(prefixes), JSON.stringify(limits)], { encoding: 'utf8', timeout: 240_000, maxBuffer: 1 << 20 })
  if (r.error) throw new Error(`extraction of ${archive} did not run: ${r.error.message}`)
  const last = (r.stdout.trim().split('\n').at(-1) || '{}').trim()
  let out
  try {
    out = JSON.parse(last)
  } catch {
    throw new Error(`extraction of ${archive} failed (exit ${r.status}): ${r.stderr.slice(0, 400)}`)
  }
  if (out.refused) throw new Error(`extraction of ${archive} refused: ${out.refused}`)
  if (r.status !== 0) throw new Error(`extraction of ${archive} failed (exit ${r.status}): ${r.stderr.slice(0, 400)}`)
  return out
}
/** A zip written by Python from `[name, text | { link }]` entries. */
function makeZip(file, entries) {
  const script = String.raw`
import json, sys, zipfile, stat
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for name, body in json.loads(sys.argv[2]):
        if isinstance(body, dict):
            i = zipfile.ZipInfo(name); i.external_attr = (stat.S_IFLNK | 0o777) << 16
            z.writestr(i, body["link"])
        else:
            z.writestr(zipfile.ZipInfo(name), body)
`
  const r = spawnSync('python3', ['-c', script, file, JSON.stringify(entries)], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}

test('issue54 archive extraction: traversal, absolute and link members, duplicates, expansion and corruption are refused before any write', () => {
  const root = tmp('i54-zip-')
  const ok = join(root, 'ok.zip')
  makeZip(ok, [['templates/t/css/a.css', 'a{}'], ['images/x.txt', 'not extracted']])
  const dest = join(root, 'ok')
  assert.deepEqual(extractSafely(ok, dest, ['templates/t/']), { extracted: 1, bytes: 3 })
  assert.equal(readFileSync(join(dest, 'templates/t/css/a.css'), 'utf8'), 'a{}')
  assert.ok(!existsSync(join(dest, 'images')))
  for (const [label, entries, re, limits] of [
    ['traversal', [['templates/t/../../evil.css', 'x']], /not a plain relative path/],
    ['absolute', [['/templates/t/a.css', 'x']], /not a plain relative path/],
    ['link', [['templates/t/css/link.css', { link: '/etc/passwd' }]], /a symbolic link/],
    ['duplicate', [['templates/t/A.css', 'x'], ['templates/t/a.css', 'y']], /second entry for the same destination/],
    ['expansion', [['templates/t/big.css', 'x'.repeat(300000)]], /over the extraction limits/, { members: 10, bytes: 1000, ratio: 200 }]
  ]) {
    const z = join(root, `${label}.zip`)
    makeZip(z, entries)
    const out = join(root, label)
    assert.throws(() => extractSafely(z, out, ['templates/t/'], limits ?? LIMITS), re, label)
    assert.deepEqual(readdirSync(out), [], `${label}: nothing written`)
  }
  const corrupt = join(root, 'corrupt.zip')
  writeFileSync(corrupt, 'PK\u0003\u0004 not a zip')
  assert.throws(() => extractSafely(corrupt, join(root, 'corrupt'), ['templates/t/']), /not a readable zip archive/)
})

// ── real sources (read-only) ──────────────────────────────────────────────────

const VEGA = process.env.ISSUE54_VEGA_SOURCE
const MORGAN = process.env.ISSUE54_MORGAN_ARCHIVE
const RECORD = process.env.TRACY_TEST_SCRATCH || null
const record = (name, data) => {
  if (!RECORD) return
  mkdirSync(RECORD, { recursive: true })
  writeFileSync(join(RECORD, name), JSON.stringify(data, null, 2) + '\n')
}

test('issue54 real-source: JA Vega (T4) is read without change; the spec verdict and every remaining cause are recorded', { skip: VEGA ? false : 'ISSUE54_VEGA_SOURCE not set' }, () => {
  assert.ok(existsSync(join(VEGA, 'inventory.json')), `${VEGA}: no inventory.json — the named source is not a dump`)
  const before = hashTree(VEGA)
  const r = build(VEGA)
  assert.deepEqual(hashTree(VEGA), before, 'the source is not modified')
  const css = r.report.inspection.css
  const verdict = {
    source: VEGA,
    specValid: r.report.spec.valid,
    problems: r.report.spec.causes.map((c) => ({ problem: c.problem, cause: c.cause })),
    framework: css.framework,
    styles: css.styles.map((s) => ({ id: s.id, routes: s.routes.length, sheets: s.sheets.map((x) => `${x.path} ${x.status}`), rules: s.rules.map((x) => `${x.id} ${x.selector}`), gaps: s.gaps })),
    identity: Object.fromEntries(['site.name', 'site.tagline'].map((k) => [k, readJson(join(r.out, 'content-contract.json')).facts[k] ?? null])),
    palette: r.pageMap.theme.palette
  }
  record('issue54-vega-verdict.json', verdict)
  // the verdict in the test output itself: spec.valid and every remaining problem with its cause
  console.log(`issue54 vega verdict: specValid=${verdict.specValid}; problems=${verdict.problems.length}${verdict.problems.map((p) => `\n  - ${p.problem} ← ${p.cause}`).join('')}`)
  console.log(`issue54 vega styles: ${verdict.styles.map((s) => `#${s.id} (${s.routes} routes): ${s.rules.length} rules, ${s.gaps.length} gaps`).join('; ')}`)
  console.log(`issue54 vega palette: ${JSON.stringify(verdict.palette)}`)
  assert.equal(css.framework, 'T4')
  assert.ok(css.evidence.length > 0)
  // every problem left names its cause; the empty tagline and the css/styles assumption are no longer among them
  for (const p of verdict.problems) assert.ok(p.cause, `${p.problem}: cause traced`)
  assert.ok(!verdict.problems.some((p) => /identity\.summary/.test(p.problem)), JSON.stringify(verdict.problems))
  assert.ok(!verdict.problems.some((p) => /css\/styles\/default\.css is not in the template capture, and the adapter reads the design tokens from no other file/.test(p.cause ?? '')))
  assert.deepEqual(verdict.identity['site.tagline'], { value: '', status: 'absent-in-source', source: 'joomla-identity' })
  // the rules come from the style sheets T4 compiled: media/t4/css/<id>.css for each route's style
  for (const id of ['12', '13', '14']) {
    const s = css.styles.find((x) => x.id === id)
    assert.ok(s, `style #${id}`)
    assert.ok(s.sheets.some((x) => x.path === `capture/media/t4/css/${id}.css` && x.status === 'read'))
    assert.ok(s.rules.some((x) => x.selector === 'body'))
  }
  const s15 = css.styles.find((x) => x.id === '15')
  if (s15) assert.ok(s15.sheets.some((x) => x.path === 'capture/media/t4/css/15.css' && x.status !== 'read') ? s15.gaps.some((g) => /15\.css, the sheet T4 compiles for style #15/.test(g)) : true)
  assert.ok(verdict.palette.dark, 'darkmode.css gives the dark palette')
  assert.equal(verdict.specValid, verdict.problems.length === 0)
})

test('issue54 real-source: JA Morgan (T3) archive — extracted safely into scratch, byte-identical after, T3 rules read from the extracted sheets', { skip: MORGAN ? false : 'ISSUE54_MORGAN_ARCHIVE not set' }, () => {
  assert.ok(existsSync(MORGAN) && lstatSync(MORGAN).isFile(), `${MORGAN}: not a file`)
  const before = sha256(MORGAN)
  const d = tmp('i54-morgan-')
  const x = extractSafely(MORGAN, join(d, 'x'), ['templates/ja_morgan/', 'installation/sql/mysql/custom.sql'])
  assert.equal(sha256(MORGAN), before, 'the archive is not modified')
  assert.ok(x.extracted > 100)
  // the capture layout the adapter reads: capture/templates/<tpl>
  mkdirSync(join(d, 'capture/templates'), { recursive: true })
  cpSync(join(d, 'x/templates/ja_morgan'), join(d, 'capture/templates/ja_morgan'), { recursive: true })
  // the styles and their themes, as the install SQL declares them
  const sql = readFileSync(join(d, 'x/installation/sql/mysql/custom.sql'), 'utf8')
  const styleRow = (id) => {
    const m = sql.match(new RegExp(`\\((${id}),'ja_morgan',0,'([01])','([^']*)','(\\{.*?\\})',\\d+,`))
    assert.ok(m, `template style #${id} of ja_morgan in custom.sql`)
    return { id: Number(m[1]), template: 'ja_morgan', client_id: 0, home: m[2], title: m[3], params: m[4].replace(/\\(["\\/])/g, '$1') }
  }
  const styles = [styleRow(9), styleRow(10)]
  assert.equal(JSON.parse(styles[0].params).theme, '')
  assert.equal(JSON.parse(styles[1].params).theme, 'style-2')
  const tplDir = join(d, 'capture/templates/ja_morgan')
  const tpl = { name: 'ja_morgan', dir: tplDir, reader: captureReader(tplDir, d), tokensFile: null, styleId: 9, theme: {} }
  const pages = [
    { file: 'index.html', source: { menuId: 1, joomlaPath: '/' } },
    { file: 'home-2.html', source: { menuId: 2, joomlaPath: '/home-2' } }
  ]
  const menuById = new Map([
    ['1', { templateStyleId: '9' }],
    ['2', { templateStyleId: '10' }]
  ])
  const design = resolveDesign({ j6Dir: d, tpl, inv: { template_styles: styles }, pageMapPages: pages, menuById })
  const by = Object.fromEntries(design.styles.map((s) => [s.id, s]))
  const rule = (s, role) => s.design.rules.find((r) => r.role === role)
  record('issue54-morgan.json', {
    archive: MORGAN,
    sha256: before,
    extracted: x,
    framework: design.framework,
    styles: design.styles.map((s) => ({ id: s.id, theme: s.params.theme, sheets: s.sheets.map((y) => `${y.path} ${y.role} ${y.status} ${y.rules ?? ''}`), rules: s.design.rules.map((y) => ({ role: y.role, selector: y.selector, desktopLight: y.styles['desktop-light'], desktopDark: y.styles['desktop-dark'] })), gaps: s.gaps })),
    unsupported: design.unsupported.length
  })
  console.log(`issue54 morgan: archive sha256 ${before} unchanged; framework ${design.framework.framework}; ${design.styles.map((s) => `#${s.id} theme "${s.params.theme}": ${s.design.rules.map((r) => `${r.role} ${r.selector}`).join(', ')}`).join('; ')}`)
  assert.equal(design.framework.framework, 'T3')
  assert.ok(design.framework.evidence.some((e) => /manifest declares <t3>/.test(e.detail)))
  assert.ok(design.framework.evidence.some((e) => /INI layout under etc\/layout/.test(e.detail)))
  assert.ok(by['9'].sheets.some((s) => s.path.endsWith('ja_morgan/css/template.css') && s.status === 'read' && s.rules > 100))
  assert.ok(by['10'].sheets.some((s) => s.path.endsWith('ja_morgan/css/themes/style-2/template.css') && s.role === 'theme'))
  assert.ok(!by['9'].sheets.some((s) => /t3-assets/.test(s.path)), 'no t3-assets in the archive')
  // selectors and declarations the extracted sheets hold (bootstrap.css, template.css, darkmode.css)
  assert.deepEqual(rule(by['9'], 'body-colors').styles['desktop-light'], { color: '#777777', backgroundColor: '#ffffff' })
  assert.deepEqual(rule(by['9'], 'body-colors').styles['desktop-dark'], { color: '#a7b0c2', backgroundColor: '#0f1320' })
  assert.equal(rule(by['9'], 'body-type').styles['desktop-light'].fontSize, '16px')
  // where a .btn or a .container sits is not in the sheets: rules of other contexts can win on them, so
  // their values are withheld, each naming a rule of the sheet the style reads (the theme's for style-2)
  for (const [s, sheet] of [
    [by['9'], 'capture/templates/ja_morgan/css/template.css'],
    [by['10'], 'capture/templates/ja_morgan/css/themes/style-2/template.css']
  ]) {
    assert.deepEqual(s.design.rules.map((r) => r.role).sort(), ['body-colors', 'body-type'], s.id)
    for (const role of ['button (component)', 'container (layout)']) assert.ok(s.gaps.some((g) => g.startsWith(`${role}: no `)), `${s.id} ${role}`)
    assert.ok(s.gaps.some((g) => g.startsWith('.btn border-radius: ') && g.includes(`(${sheet})`)), `${s.id}: ${sheet}`)
  }
})
