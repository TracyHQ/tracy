// Phase 2 source-font check: the static analyzer (T4 profile resolution, loaders, T3), the browser judgement,
// the gate and its decisions, the measurement CLI against a local page, and the quickstart-inventory wiring.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import {
  BROWSER_SCHEMA,
  DESKTOP_WIDTH,
  MOBILE_WIDTH,
  STATIC_SCHEMA,
  analyzeStatic,
  browserCoverage,
  cssFacts,
  decisionFor,
  familiesOfFontUrl,
  gateSourceFonts,
  judgeBrowser,
  phpTruthy,
  roleVerdict,
  staticFindings,
  staticFingerprint,
  usedStyles
} from '../ingest/source-font.mjs'
import { measureSource, planRoutes } from '../ingest/source-font-browser.mjs'
import { platformFonts } from '../lib/platform-fonts.mjs'
import { parseDecisions } from '../lib/parity-acceptance.mjs'
import { T4_FONTS, browserPage, item, json, measurement, memoryReader, reading, style, t4Input } from './source-font-fixtures.mjs'

const SITE_URL = 'http://source.invalid'
const SITE = 'templates/tpl/etc/site/default.json'
const THEME = 'templates/tpl/etc/theme/default.json'
const roleOf = (report, role, styleId = '10') => report.styles.find((s) => s.id === styleId).roles.find((r) => r.role === role)
const codes = (report) => staticFindings(report.styles).map((f) => f.code)

// ───────────────────────────────────────────────────────────────── T4 profiles
test('T4: empty font keys fail — body font-family-unset, naming the file and key', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: '', heading_font_family: '', megamenu_font_family: '' }), [THEME]: '{}' }))
  assert.equal(r.complete, true)
  assert.deepEqual(codes(r), ['font-family-unset'])
  const [f] = r.findings
  assert.equal(f.file, SITE)
  assert.equal(f.jsonKey, 'body_font_family')
  assert.match(f.message, /SOURCE template tpl/)
  assert.match(f.message, /browser default serif/)
  assert.equal(roleOf(r, 'heading').verdict, 'unset')
})

test('T4: no font keys at all fails the same way (missing, not empty)', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ site_logo: 'x.png', other_darkmode: true }), [THEME]: '{}' }))
  assert.deepEqual(codes(r), ['font-family-unset'])
  assert.equal(roleOf(r, 'body').declared, 'missing')
})

test('T4: missing keys fall back to the theme profile (array_merge), so the style passes', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ site_logo: 'x.png' }), [THEME]: json(T4_FONTS) }))
  assert.deepEqual(codes(r), [])
  const body = roleOf(r, 'body')
  assert.equal(body.family, 'Golos Text')
  assert.equal(body.from, 'theme')
  assert.equal(body.file, THEME)
  assert.equal(body.verdict, 'loaded')
})

test('T4: an empty string in the site profile stays empty — it does not fall back to the theme', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: '' }), [THEME]: json(T4_FONTS) }))
  assert.deepEqual(codes(r), ['font-family-unset'])
  assert.equal(roleOf(r, 'body').hidesTheme.family, 'Golos Text')
  assert.match(r.findings[0].message, /hides "Golos Text"/)
})

test('T4: local/etc replaces etc wholesale — a local file without font keys hides the typography in etc', () => {
  const files = { [SITE]: json(T4_FONTS), 'templates/tpl/local/etc/site/default.json': json({ site_name: 'x' }), [THEME]: '{}' }
  const r = analyzeStatic(t4Input(files))
  assert.deepEqual(codes(r), ['font-family-unset'])
  assert.equal(r.styles[0].profiles.site.file, 'templates/tpl/local/etc/site/default.json')
  assert.match(r.findings[0].message, /replaces templates\/tpl\/etc\/site\/default\.json wholesale/)
  assert.match(r.findings[0].message, /body_font_family="Golos Text"/)
})

test('T4: a local file that declares the fonts is the effective one', () => {
  const files = { [SITE]: json({}), 'templates/tpl/local/etc/site/default.json': json(T4_FONTS), [THEME]: '{}' }
  assert.deepEqual(codes(analyzeStatic(t4Input(files))), [])
})

test('T4: a named profile that is missing, or an empty file, falls back to the default profile', () => {
  const files = { [SITE]: json(T4_FONTS), 'templates/tpl/etc/site/home.json': '', [THEME]: '{}' }
  const r = analyzeStatic(t4Input(files, { styles: [style({ typelist: { 'typelist-site': 'home' } })] }))
  assert.equal(r.styles[0].profiles.site.resolved, 'default')
  assert.equal(r.styles[0].profiles.site.fellBack, true)
  assert.deepEqual(codes(r), [])
  const r2 = analyzeStatic(t4Input({ [SITE]: json(T4_FONTS), [THEME]: '{}' }, { styles: [style({ typelist: { 'typelist-site': 'nope' } })] }))
  assert.equal(r2.styles[0].profiles.site.resolved, 'default')
})

test('T4: a profile name that is not a plain file name is not read and the evidence is incomplete', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json(T4_FONTS), [THEME]: '{}' }, { styles: [style({ typelist: { 'typelist-site': '../../configuration' } })] }))
  assert.equal(r.complete, false)
  assert.match(r.gaps.join('\n'), /not a plain file name/)
})

test('T4: only heading/megamenu unset while the body is set is not a finding — they inherit the body font', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'Golos Text', heading_font_family: '', megamenu_font_family: '' }), [THEME]: '{}' }))
  assert.deepEqual(codes(r), [])
  assert.equal(roleOf(r, 'heading').verdict, 'inherits-body')
})

// ───────────────────────────────────────────────────────────────── loaders
test('T4: a legacy family that is not in the Google list is never loaded (Muli → Mulish)', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'Muli', heading_font_family: 'Muli' }), [THEME]: '{}' }))
  assert.deepEqual(codes(r), ['family-never-loaded', 'family-never-loaded'])
  assert.match(r.findings[0].message, /not in T4's Google font list/)
  const ok = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'Mulish' }), [THEME]: '{}' }))
  assert.deepEqual(codes(ok), [])
})

test('T4: dont_use_google_font with an active @import of the family passes; without one it fails', () => {
  const site = json({ dont_use_google_font: true, body_font_family: 'IBM Plex Sans' })
  const css = '/* fonts */\n@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&family=Jost:wght@400&display=swap");\nbody{margin:0}'
  const pass = analyzeStatic(t4Input({ [SITE]: site, [THEME]: '{}', 'templates/tpl/css/template.css': css }))
  assert.deepEqual(codes(pass), [])
  assert.equal(roleOf(pass, 'body').via.kind, 'css-import')
  const fail = analyzeStatic(t4Input({ [SITE]: site, [THEME]: '{}', 'templates/tpl/css/template.css': 'body{margin:0}' }))
  assert.deepEqual(codes(fail), ['google-font-disabled-no-loader'])
  assert.match(fail.findings[0].message, /dont_use_google_font is on/)
})

test('T4: an @import in a sheet the template does not load is not a loader', () => {
  const site = json({ dont_use_google_font: '1', body_font_family: 'IBM Plex Sans' })
  const r = analyzeStatic(t4Input({ [SITE]: site, [THEME]: '{}', 'templates/tpl/css/unused.css': '@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans");' }))
  assert.deepEqual(codes(r), ['google-font-disabled-no-loader'])
})

test('T4: dont_use_google_font "0" or "" is off (PHP truthiness)', () => {
  assert.equal(phpTruthy('0'), false)
  assert.equal(phpTruthy(''), false)
  assert.equal(phpTruthy('false'), true)
  assert.equal(phpTruthy(true), true)
  const r = analyzeStatic(t4Input({ [SITE]: json({ dont_use_google_font: '0', body_font_family: 'Golos Text' }), [THEME]: '{}' }))
  assert.equal(roleOf(r, 'body').verdict, 'loaded')
})

const CUSTOM = (url, type = 'font') => json({ name: 'font custom', fonts: { 'Acme Sans': { name: 'Acme Sans', type, url } } })
test('T4: a custom font whose files are present passes (relative url, customfonts.json)', () => {
  const files = { [SITE]: json({ body_font_family: 'Acme Sans' }), [THEME]: '{}', 'templates/tpl/etc/customfonts.json': CUSTOM('templates/tpl/fonts/acme.woff2'), 'templates/tpl/fonts/acme.woff2': { binary: true } }
  const r = analyzeStatic(t4Input(files))
  assert.deepEqual(codes(r), [])
  assert.equal(roleOf(r, 'body').via.kind, 'custom-font')
})

test('T4: a custom font url written relative to the template resolves under it', () => {
  const files = { [SITE]: json({ body_font_family: 'Acme Sans' }), [THEME]: '{}', 'templates/tpl/etc/customfonts.json': CUSTOM('fonts/acme.woff2'), 'templates/tpl/fonts/acme.woff2': { binary: true } }
  assert.deepEqual(codes(analyzeStatic(t4Input(files))), [])
})

test('T4: a site profile that is not valid JSON leaves the body unset and the finding says the file is invalid', () => {
  const r = analyzeStatic(t4Input({ [SITE]: '{"body_font_family": "Golos Text",', [THEME]: '{}' }))
  assert.deepEqual(codes(r), ['font-family-unset'])
  assert.match(r.findings[0].message, /is not valid JSON/)
})

test('T4: a custom font whose file is missing fails', () => {
  const files = { [SITE]: json({ body_font_family: 'Acme Sans' }), [THEME]: '{}', 'templates/tpl/etc/customfonts.json': CUSTOM('templates/tpl/fonts/acme.woff2') }
  const r = analyzeStatic(t4Input(files))
  assert.deepEqual(codes(r), ['custom-font-files-missing'])
  assert.match(r.findings[0].message, /resolves to no file in the source/)
})

test('T4: fontcustoms.json with a dev-host url maps onto the archive path; present passes, absent fails', () => {
  const url = 'http://10.0.0.63/joom//templates/tpl/fonts/acme/style.css'
  const base = { [SITE]: json({ body_font_family: 'Acme Sans' }), [THEME]: '{}', 'templates/tpl/etc/fontcustoms.json': CUSTOM(url, 'css') }
  assert.deepEqual(codes(analyzeStatic(t4Input(base))), ['custom-font-files-missing'])
  const present = {
    ...base,
    'templates/tpl/fonts/acme/style.css': '@font-face{font-family:"Acme Sans";src:url("acme.woff") format("woff")}',
    'templates/tpl/fonts/acme/acme.woff': { binary: true }
  }
  assert.deepEqual(codes(analyzeStatic(t4Input(present))), [])
  const noWoff = { ...present }
  delete noWoff['templates/tpl/fonts/acme/acme.woff']
  assert.deepEqual(codes(analyzeStatic(t4Input(noWoff))), ['custom-font-files-missing'])
})

test('T4: the Google list missing from the source leaves the evidence incomplete — never a pass', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'Golos Text' }), [THEME]: '{}' }, { google: null }))
  assert.equal(r.complete, false)
  assert.match(r.gaps.join('\n'), /Google font list/)
  assert.equal(gateSourceFonts({ staticReport: r, browser: null, requireBrowser: false, expectedSite: SITE_URL }).ok, false)
})

test('T4: a system family needs no loader', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'Georgia, serif' }), [THEME]: '{}' }, { google: null }))
  assert.equal(roleOf(r, 'body').verdict, 'system')
  assert.equal(r.complete, true)
})

// ───────────────────────────────────────────────────────────────── T3
const t3 = (files, over = {}) => ({
  templates: [{ dir: 'tpl', framework: 'T3' }],
  styles: [style()],
  menu: [item()],
  googleListText: null,
  ...over,
  reader: memoryReader(files)
})
const VARS = '@font-family-sans-serif: "PTRoot", Helvetica, Arial, sans-serif;\n@font-family-base: @font-family-sans-serif;\n@headings-font-family: @font-family-base;\n'
const FACE = '@font-face{font-family:"PTRoot";src:url("root.woff") format("woff")}'
const ASSETS = (file) => `<?xml version="1.0"?><assets><stylesheets><file>${file}</file></stylesheets></assets>`

test('T3: a family declared in LESS and loaded by etc/assets.xml with its woff present passes', () => {
  const files = {
    'templates/tpl/less/variables.less': VARS,
    'templates/tpl/etc/assets.xml': ASSETS('fonts/root/stylesheet.css'),
    'templates/tpl/fonts/root/stylesheet.css': FACE,
    'templates/tpl/fonts/root/root.woff': { binary: true }
  }
  const r = analyzeStatic(t3(files))
  assert.deepEqual(codes(r), [])
  assert.equal(roleOf(r, 'body').family, 'PTRoot')
  assert.equal(roleOf(r, 'body').via.kind, 'font-face')
})

test('T3: the woff missing, or the sheet not named by assets.xml, fails', () => {
  const sheet = { 'templates/tpl/less/variables.less': VARS, 'templates/tpl/fonts/root/stylesheet.css': FACE, 'templates/tpl/fonts/root/root.woff': { binary: true } }
  const unused = analyzeStatic(t3({ ...sheet, 'templates/tpl/etc/assets.xml': ASSETS('css/other.css') }))
  assert.deepEqual(codes(unused), ['family-never-loaded', 'family-never-loaded'])
  const files = { ...sheet, 'templates/tpl/etc/assets.xml': ASSETS('fonts/root/stylesheet.css') }
  delete files['templates/tpl/fonts/root/root.woff']
  assert.deepEqual(codes(analyzeStatic(t3(files))), ['font-files-missing', 'font-files-missing'])
})

test('T3: a Google link in assets.xml loads the family', () => {
  const files = { 'templates/tpl/less/variables.less': '@font-family-base: "Open Sans", sans-serif;', 'templates/tpl/etc/assets.xml': ASSETS('https://fonts.googleapis.com/css?family=Open+Sans:400,700') }
  assert.deepEqual(codes(analyzeStatic(t3(files))), [])
})

// ───────────────────────────────────────────────────────────────── used styles
test('only the styles pages render with are judged: default, menu-assigned, never an unused or unpublished one', () => {
  const styles = [style({ id: '10' }), style({ id: '11', home: '0' }), style({ id: '12', home: '0' })]
  const menu = [item({ id: '1', template_style_id: '11' }), item({ id: '2', template_style_id: '12', published: '0' })]
  const { used } = usedStyles(styles, menu)
  assert.deepEqual([...used.keys()].sort(), ['10', '11'])
  const broken = json({ body_font_family: '' })
  const r = analyzeStatic({
    ...t4Input({ [SITE]: json(T4_FONTS), 'templates/tpl/etc/site/bad.json': broken, [THEME]: '{}' }, { styles: [style({ id: '10' }), style({ id: '12', home: '0', typelist: { 'typelist-site': 'bad' } })], menu: [item({ template_style_id: '12', published: '0' })] })
  })
  assert.deepEqual(codes(r), [], 'a style only an unpublished item uses is not examined')
  const used12 = analyzeStatic(t4Input({ [SITE]: json(T4_FONTS), 'templates/tpl/etc/site/bad.json': broken, [THEME]: '{}' }, { styles: [style({ id: '10' }), style({ id: '12', home: '0', typelist: { 'typelist-site': 'bad' } })], menu: [item({ template_style_id: '12' })] }))
  assert.deepEqual(staticFindings(used12.styles).map((f) => f.style.id), ['12'])
})

test('unknown menu or styles are an evidence gap, not an empty pass', () => {
  const a = analyzeStatic({ ...t4Input({ [SITE]: json(T4_FONTS), [THEME]: '{}' }), menu: null })
  assert.equal(a.complete, false)
  assert.match(a.gaps.join('\n'), /menu items unknown/)
  const b = analyzeStatic({ ...t4Input({}), styles: null })
  assert.equal(b.complete, false)
})

// ───────────────────────────────────────────────────────────────── css facts
test('cssFacts reads @import, @font-face and rules without being fooled by comments or data URIs', () => {
  const f = cssFacts('/* @import url(x.css); */ @import "a.css"; @font-face{font-family:\'F\';src:url(data:font/woff;base64,AAA=) format("woff"),url(f.woff)} body,h1{font-family:"F",serif;margin:0}')
  assert.deepEqual(f.imports, ['a.css'])
  assert.equal(f.fontFaces[0].family, 'F')
  assert.equal(f.fontFaces[0].srcs.length, 2)
  assert.deepEqual(f.rules[0].selectors, ['body', 'h1'])
  assert.deepEqual(familiesOfFontUrl('https://fonts.googleapis.com/css?family=Open+Sans:400,700|Roboto'), ['Open Sans', 'Roboto'])
})

// ───────────────────────────────────────────────────────────────── browser judgement
test('browser: a good reading is no finding; coverage of a complete measurement is clean', () => {
  const m = measurement()
  assert.deepEqual(judgeBrowser(m), [])
  assert.deepEqual(browserCoverage(m), [])
})

test('browser: the default serif drawing Times is a finding even though requested and drawn agree', () => {
  assert.equal(roleVerdict(reading('"Times New Roman"', 'Times New Roman', { custom: false }))?.code, 'default-serif')
  assert.equal(roleVerdict(reading('Times', 'Liberation Serif', { custom: false }))?.code, 'default-serif')
  assert.equal(roleVerdict(reading('"Playfair Display", Georgia, serif', 'Playfair Display')), null)
})

test('browser: a requested web family drawn by a system font is a finding (Muli → Arial, both sides fell back)', () => {
  const v = roleVerdict(reading('Muli, sans-serif', 'Arial', { custom: false }))
  assert.equal(v.code, 'web-family-not-drawn')
  assert.match(v.detail, /"Muli".*Arial/)
  assert.equal(roleVerdict(reading('system-ui, sans-serif', 'DejaVu Sans', { custom: false })), null)
  assert.equal(roleVerdict(reading('Arial, sans-serif', 'Liberation Sans', { custom: false })), null)
})

test('browser: headings the size of the body text on desktop are a finding; on mobile they are not', () => {
  const m = measurement({ mutate: (pages) => pages.forEach((p) => (p.roles.h1.size = '16px')) })
  const f = judgeBrowser(m)
  assert.deepEqual([...new Set(f.map((x) => x.code))], ['heading-size-equals-body'])
  assert.ok(f.every((x) => x.width === 1440))
})

test('browser: a failed font request for a family the page asks for is a finding; an unrelated one is only recorded', () => {
  const page = browserPage({ failedRequests: [{ url: 'https://fonts.gstatic.com/s/golostext/v1/x.woff2', resourceType: 'font', status: 404 }, { url: 'https://cdn.invalid/icons.woff2', resourceType: 'font', status: 404 }] })
  const f = judgeBrowser({ pages: [page] })
  assert.equal(f.length, 1)
  assert.equal(f[0].code, 'font-request-failed')
})

test('browser coverage: home, every used style and a nested route at both widths, with a body reading, are required', () => {
  const staticReport = fake([{ id: '10', template: 'tpl' }, { id: '11', template: 'tpl' }], [{ id: '1', path: 'blog', styleId: '11' }])
  const only10 = browserCoverage(measurement({ report: staticReport }), staticReport)
  assert.ok(only10.some((p) => /style #11/.test(p)))
  assert.deepEqual(browserCoverage(measurement({ styleIds: ['10', '11'], report: staticReport, routes: { 11: '/blog' } }), staticReport), [])
  const noMobile = measurement()
  noMobile.pages = noMobile.pages.filter((p) => p.width === 1440)
  assert.ok(browserCoverage(noMobile).some((p) => /390px/.test(p)))
  const noNested = measurement()
  noNested.pages = noNested.pages.filter((p) => p.kind !== 'nested')
  assert.ok(browserCoverage(noNested).some((p) => /nested/.test(p)))
  const empty = measurement({ mutate: (pages) => (pages[0].roles.body.chars = 0) })
  assert.ok(browserCoverage(empty).some((p) => /no body text/.test(p)))
  const noFaces = measurement({ mutate: (pages) => (pages[0].faces = null) })
  assert.ok(browserCoverage(noFaces).some((p) => /document\.fonts/.test(p)))
  const undeclared = measurement({ mutate: (pages) => delete pages[0].roles.h3 })
  assert.ok(browserCoverage(undeclared).some((p) => /h3 is neither measured nor declared absent/.test(p)))
  const declared = measurement({ mutate: (pages) => { delete pages[0].roles.h3; pages[0].absent = ['h3'] } })
  assert.deepEqual(browserCoverage(declared), [])
  assert.ok(browserCoverage({ schema: 'other' }).length)
})

const fake = (usedStyles, menuRoutes) => ({ schema: STATIC_SCHEMA, usedStyles, menuRoutes })

// ───────────────────────────────────────────────────────────────── gate and decisions
const failing = () => analyzeStatic(t4Input({ [SITE]: json({ body_font_family: '' }), [THEME]: '{}' }))
const KEY = 'source-font:static:tpl:style-10:body:font-family-unset'

test('gate: an unresolved finding fails with a message that blames the SOURCE and says where the fix belongs', () => {
  const g = gateSourceFonts({ staticReport: failing(), browser: measurement({ report: failing() }) , expectedSite: SITE_URL })
  assert.equal(g.ok, false)
  assert.match(g.problems[0], /fault of the SOURCE template/)
  assert.match(g.problems[0], /fix it in the source repository before porting/)
  assert.ok(g.problems[0].includes(KEY))
  assert.ok(g.problems[0].includes(SITE) && g.problems[0].includes('body_font_family'))
})

test('gate: a clean source passes; incomplete static or browser evidence fails', () => {
  const good = analyzeStatic(t4Input({ [SITE]: json(T4_FONTS), [THEME]: '{}' }))
  assert.equal(gateSourceFonts({ staticReport: good, browser: measurement({ report: good }) , expectedSite: SITE_URL }).ok, true)
  assert.equal(gateSourceFonts({ staticReport: good, browser: null, expectedSite: SITE_URL }).ok, false)
  assert.equal(gateSourceFonts({ staticReport: null, browser: measurement({ report: null }) , expectedSite: SITE_URL }).ok, false)
  const incomplete = analyzeStatic({ ...t4Input({ [SITE]: json(T4_FONTS), [THEME]: '{}' }), menu: null })
  assert.match(gateSourceFonts({ staticReport: incomplete, browser: measurement({ report: incomplete }) , expectedSite: SITE_URL }).problems.join('\n'), /static evidence is incomplete/)
})

test('gate: findings are recomputed — a report that claims no findings cannot hide a failing style', () => {
  const r = failing()
  r.findings = []
  assert.equal(gateSourceFonts({ staticReport: r, browser: measurement({ report: r }) , expectedSite: SITE_URL }).ok, false)
})

test('gate: a decision that names the finding key lets it through and the finding stays in the result', () => {
  const text = `# Decisions\n\n- D-7 The source's default style declares no body font (${KEY}); the port keeps the template's own stack. Decided with the owner.\n`
  const g = gateSourceFonts({ staticReport: failing(), browser: measurement({ report: failing() }), expectedSite: SITE_URL, decisionsText: text })
  assert.equal(g.ok, true, g.problems.join('\n'))
  assert.equal(g.waived.length, 1)
  assert.equal(g.waived[0].decision, 'D-7')
  assert.equal(g.findings.length, 1)
})

test('gate: unrelated, open, duplicate and ambiguous decisions do not waive a finding', () => {
  const run = (text) => gateSourceFonts({ staticReport: failing(), browser: measurement({ report: failing() }), expectedSite: SITE_URL, decisionsText: text }).ok
  assert.equal(run('- D-1 Something else entirely.\n'), false, 'unrelated')
  assert.equal(run('- D-1 source-font:static:tpl:style-11:body:font-family-unset is accepted.\n'), false, 'another style')
  assert.equal(run(`- D-2 ${KEY} — status: open\n`), false, 'open')
  assert.equal(run(`- D-2 ${KEY} accepted\n- D-2 ${KEY} accepted again\n`), false, 'duplicate id')
  assert.equal(run(`- D-2 ${KEY} accepted\n- D-3 ${KEY} accepted too\n`), false, 'two decisions name it')
  assert.equal(gateSourceFonts({ staticReport: failing(), browser: measurement({ report: failing() }), expectedSite: SITE_URL, decisionsText: null }).ok, false, 'no DECISIONS.md')
  assert.equal(decisionFor(KEY, parseDecisions(`- D-2 ${KEY} accepted\n`)).decision, 'D-2')
})

test('gate: a browser finding is decided by its own key', () => {
  const good = analyzeStatic(t4Input({ [SITE]: json(T4_FONTS), [THEME]: '{}' }))
  const m = measurement({ report: good, mutate: (pages) => pages.forEach((p) => (p.roles.body = reading('Muli, sans-serif', 'Arial', { custom: false }))) })
  const g = gateSourceFonts({ staticReport: good, browser: m, expectedSite: SITE_URL })
  assert.equal(g.ok, false)
  const keys = [...new Set(g.findings.map((f) => f.key))]
  const text = keys.map((k, i) => `- D-${i + 1} ${k} accepted`).join('\n')
  assert.equal(gateSourceFonts({ staticReport: good, browser: m, decisionsText: text, expectedSite: SITE_URL }).ok, true)
})

// ───────────────────────────────────────────────────────────────── routes
test('planRoutes: home, one route per distinct used style, one nested route', () => {
  const report = {
    usedStyles: [{ id: '10', template: 't', default: true }, { id: '11', template: 't' }],
    menuRoutes: [{ path: 'a', styleId: '10' }, { path: 'blog', styleId: '11' }, { path: 'company/about', styleId: '11' }]
  }
  const plan = planRoutes(report)
  assert.deepEqual(plan.map((p) => [p.kind, p.route, p.styleId]), [['home', '/', '10'], ['style', '/blog', '11'], ['nested', '/company/about', '11']])
  const flat = planRoutes({ usedStyles: [{ id: '10', template: 't', default: true }], menuRoutes: [] })
  assert.equal(flat.at(-1).route, null, 'no nested route known: the plan says so instead of inventing one')
})

// ───────────────────────────────────────────────────────────────── the real browser, against a local page
function serve(pages) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const body = pages[req.url.split('?')[0]]
      if (body === undefined) {
        res.writeHead(404).end('no')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html' }).end(body)
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }))
  })
}
const PROSE = 'The quick brown fox jumps over the lazy dog while the visitors read the page that the source draws in some font. '.repeat(2)
const doc = (css, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><nav class="t4-megamenu"><a href="/x">Home</a><a href="/blog/post">Post</a></nav><h1>Headline</h1><h2>Sub headline</h2><h3>Third</h3><p>${PROSE}</p>${extra}</body></html>`

test('browser (real Chromium): a source that never loads its family, or names none, is judged from what drew the glyphs', { timeout: 180000 }, async () => {
  const pages = {
    '/': doc('body{font-family:"No Such Face 9000",serif;font-size:16px} h1{font-size:16px}'),
    '/blog/post': doc('body{font-size:16px} h1{font-size:30px} h2{font-size:24px} h3{font-size:20px}')
  }
  const { server, origin } = await serve(pages)
  try {
    const report = fake([{ id: '1', template: 't', default: true }], [{ id: '1', path: 'blog/post', styleId: '1' }])
    const m = await measureSource({ origin, staticReport: report })
    assert.equal(m.schema, BROWSER_SCHEMA)
    assert.deepEqual(browserCoverage(m, report), [], 'the page is read at both widths with its body, headings and navigation')
    const home = m.pages.find((p) => p.route === '/' && p.width === 1440)
    assert.match(home.roles.body.requested, /No Such Face 9000/)
    assert.ok(home.roles.body.drawn.length && home.roles.body.chars > 40)
    const codesOf = (route) => new Set(judgeBrowser(m).filter((f) => f.route === route).map((f) => f.code))
    assert.ok(codesOf('/').has('web-family-not-drawn'), [...codesOf('/')].join())
    assert.ok(codesOf('/').has('heading-size-equals-body'), 'h1 is 16px beside 16px body text on desktop')
    const nested = codesOf('/blog/post')
    assert.ok(nested.has('default-serif'), `a page that names no font draws the browser default: ${[...nested].join()}`)
    assert.ok(!nested.has('heading-size-equals-body'))
  } finally {
    server.close()
  }
})

test('browser (real Chromium): a stack that starts with a system family passes', { timeout: 180000 }, async () => {
  const { server, origin } = await serve({ '/': doc('body{font-family:Arial,Helvetica,sans-serif} h1{font-size:40px} h2{font-size:30px} h3{font-size:24px}'), '/blog/post': doc('body{font-family:Arial,sans-serif} h1{font-size:40px} h2{font-size:30px} h3{font-size:24px}') })
  try {
    const m = await measureSource({ origin, staticReport: { usedStyles: [{ id: '1', template: 't', default: true }], menuRoutes: [{ path: 'blog/post', styleId: '1' }] } })
    assert.deepEqual(judgeBrowser(m), [])
  } finally {
    server.close()
  }
})

test('platformFonts keeps its sample shape and adds every platform font of the node', async () => {
  const calls = []
  const client = {
    send: async (method, params) => {
      calls.push(method)
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } }
      if (method === 'DOM.querySelectorAll') return { nodeIds: [5] }
      if (method === 'CSS.getPlatformFontsForNode') return { fonts: [{ familyName: 'Small', glyphCount: 2, isCustomFont: false }, { familyName: 'Big', glyphCount: 9, isCustomFont: true }] }
      return {}
    },
    detach: async () => {}
  }
  const page = { context: () => ({ newCDPSession: async () => client }), evaluate: async () => 'Big, serif' }
  const out = await platformFonts(page, ['p'])
  assert.deepEqual(out, [{ selector: 'p', requested: 'Big, serif', used: 'Big', custom: true, fonts: [{ name: 'Big', custom: true, glyphs: 9 }, { name: 'Small', custom: false, glyphs: 2 }] }])
})

// ───────────────────────────────────────────────────────────────── review round: precedence, loaders, judgement, binding
test('T4: dont_use_google_font follows the same per-key profile resolution — a theme-set flag applies when the site file lacks the key; "" in the site file does not', () => {
  const css = 'body{margin:0}'
  const themeOn = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'IBM Plex Sans' }), [THEME]: json({ dont_use_google_font: true }), 'templates/tpl/css/template.css': css }))
  assert.deepEqual(codes(themeOn), ['google-font-disabled-no-loader'])
  const siteOff = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'IBM Plex Sans', dont_use_google_font: '' }), [THEME]: json({ dont_use_google_font: true }), 'templates/tpl/css/template.css': css }))
  assert.deepEqual(codes(siteOff), [])
})

test('T4: with Google off, a Google-listed family is still loaded by a valid customfonts entry', () => {
  const files = { [SITE]: json({ dont_use_google_font: true, body_font_family: 'Inter' }), [THEME]: '{}', 'templates/tpl/etc/customfonts.json': json({ fonts: { Inter: { type: 'font', url: 'fonts/inter.woff2' } } }), 'templates/tpl/fonts/inter.woff2': { binary: true } }
  assert.deepEqual(codes(analyzeStatic(t4Input(files))), [])
  delete files['templates/tpl/fonts/inter.woff2']
  assert.deepEqual(codes(analyzeStatic(t4Input(files))), ['custom-font-files-missing'])
})

test('T4: a custom-font stylesheet counts only through a @font-face of that family with a src that exists', () => {
  const entry = json({ fonts: { 'Acme Sans': { type: 'css', url: 'templates/tpl/fonts/acme.css' } } })
  const base = { [SITE]: json({ body_font_family: 'Acme Sans' }), [THEME]: '{}', 'templates/tpl/etc/customfonts.json': entry }
  const run = (css, extra = {}) => codes(analyzeStatic(t4Input({ ...base, 'templates/tpl/fonts/acme.css': css, ...extra })))
  assert.deepEqual(run('body{margin:0}'), ['custom-font-files-missing'], 'a sheet with no @font-face loads nothing')
  assert.deepEqual(run('@font-face{font-family:"Other";src:url(o.woff)}', { 'templates/tpl/fonts/o.woff': { binary: true } }), ['custom-font-files-missing'], 'another family\'s face is not this family\'s')
  assert.deepEqual(run('@font-face{font-family:"Acme Sans";src:url(a.woff)}'), ['custom-font-files-missing'], 'its src is not in the source')
  assert.deepEqual(run('@font-face{font-family:"Acme Sans";src:url(a.woff)}', { 'templates/tpl/fonts/a.woff': { binary: true } }), [])
  const absent = { ...base }
  assert.deepEqual(codes(analyzeStatic(t4Input({ ...absent, 'templates/tpl/fonts/acme.css': { error: 'too big' } }))), [], 'an unreadable sheet is a gap, not a finding')
  assert.equal(analyzeStatic(t4Input({ ...absent, 'templates/tpl/fonts/acme.css': { error: 'too big' } })).complete, false)
})

test('menu: an alias item is examined for its style but needs no browser page; headings, separators and URLs render nothing', () => {
  const styles = [style({ id: '10' }), style({ id: '11', home: '0' }), style({ id: '12', home: '0' })]
  const menu = [item({ id: '1', type: 'alias', template_style_id: '11' }), item({ id: '2', type: 'heading', template_style_id: '12' }), item({ id: '3', type: 'url', template_style_id: '12' })]
  const { used } = usedStyles(styles, menu)
  assert.deepEqual([...used.keys()].sort(), ['10', '11'])
  const r = analyzeStatic(t4Input({ [SITE]: json(T4_FONTS), [THEME]: '{}' }, { styles, menu }))
  assert.equal(r.usedStyles.find((u) => u.id === '11').aliasOnly, true)
  assert.equal(r.menuRoutes.some((m) => m.styleId === '11'), false)
  assert.deepEqual(planRoutes(r).map((p) => p.kind), ['home', 'nested'])
  assert.deepEqual(browserCoverage(measurement({ report: r }), r), [])
})

test('browser judge: an explicit generic serif drawn by the serif engine is the default serif; a different custom font drawing a requested family is a finding unless the node forced reading ties it', () => {
  assert.equal(roleVerdict(reading('serif', 'Times', { custom: false }))?.code, 'default-serif')
  assert.equal(roleVerdict(reading('sans-serif', 'Arial', { custom: false })), null)
  assert.equal(roleVerdict(reading('Jost, sans-serif', 'Playfair Display', { custom: true }))?.code, 'web-family-not-drawn')
  const aliased = { ...reading('Jost, sans-serif', 'Zeta Sans Internal', { custom: true }), forced: { family: 'Jost', name: 'Zeta Sans Internal', custom: true } }
  assert.equal(roleVerdict(aliased), null, 'the node read with the family forced drew the same face: an alias of this node\'s face')
  assert.equal(roleVerdict({ ...aliased, forced: { family: 'Jost', name: 'Times', custom: false } })?.code, 'web-family-not-drawn', 'forcing the family drew something else: it did not draw the node')
  // a minor glyph run in the requested family does not make it the font that drew the text
  const minor = { requested: 'Jost, sans-serif', drawn: [{ name: 'Arial', custom: false, glyphs: 90 }, { name: 'Jost', custom: true, glyphs: 3 }], size: '16px', chars: 120, text: 'x' }
  assert.equal(roleVerdict(minor)?.code, 'web-family-not-drawn')
})

test('decisions: a longer key that begins with a finding\'s key does not waive it; the whole key in a closed entry does', () => {
  const longer = `${KEY}-extra`
  assert.equal(decisionFor(KEY, parseDecisions(`- D-1 ${longer} accepted\n`)).decision, undefined)
  assert.equal(decisionFor(KEY, parseDecisions(`- D-1 see (${KEY}), accepted\n`)).decision, 'D-1')
  assert.equal(decisionFor(KEY, parseDecisions(`- D-1 ${KEY}:more accepted\n`)).decision, undefined)
})

test('browser evidence is bound to its source: another static report, another site, an unresolved page, or a style route that is not a menu route fails', () => {
  const report = fake([{ id: '10', template: 'tpl', default: true }, { id: '11', template: 'tpl' }], [{ id: '1', path: 'blog', styleId: '11' }])
  const ok = () => measurement({ styleIds: ['10', '11'], report, routes: { 11: '/blog' } })
  assert.deepEqual(browserCoverage(ok(), report, { expectedSite: 'http://source.invalid' }), [])
  const other = fake([{ id: '10', template: 'tpl', default: true }], [])
  assert.match(browserCoverage(ok(), other).join('\n'), /another static report/)
  const unbound = ok()
  delete unbound.static
  assert.match(browserCoverage(unbound, report).join('\n'), /another static report/)
  assert.match(browserCoverage(ok(), report, { expectedSite: 'http://127.0.0.1:8691' }).join('\n'), /pack's source is http:\/\/127\.0\.0\.1:8691/)
  const unresolved = ok()
  unresolved.unresolved = [{ kind: 'nested', why: 'no URL answered' }]
  assert.match(browserCoverage(unresolved, report).join('\n'), /required page was not measured/)
  const wrongRoute = measurement({ styleIds: ['10', '11'], report })
  assert.match(browserCoverage(wrongRoute, report).join('\n'), /\/style-11 .* is not a menu route/)
})

test('browser (real Chromium): a brand link is not the navigation — the collapsed menu is opened at 390 and its link is read', { timeout: 180000 }, async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:16px} .brand{font-family:Georgia,serif;font-size:24px}
    .menu{display:none} .menu.open{display:block} .menu a{font-family:Verdana,sans-serif}
    @media (min-width:992px){.menu{display:block}.tog{display:none}}
  </style></head><body><header><a class="brand" href="/">Brand name</a><button class="navbar-toggler tog" onclick="document.querySelector('.menu').classList.add('open')">menu</button>
  <nav class="menu t4-megamenu"><a href="/a">First entry</a><a href="/b">Second entry</a></nav></header>
  <h1>Headline</h1><h2>Sub</h2><h3>Third</h3><p>${PROSE}</p></body></html>`
  const { server, origin } = await serve({ '/': html, '/blog/post': html })
  try {
    const report = fake([{ id: '1', template: 't', default: true }], [{ id: '1', path: 'blog/post', styleId: '1' }])
    const m = await measureSource({ origin, staticReport: report })
    const narrow = m.pages.find((p) => p.route === '/' && p.width === 390)
    assert.ok(narrow.roles.nav, 'the menu was exposed and read')
    assert.match(narrow.roles.nav.requested, /Verdana/)
    assert.match(narrow.roles.nav.text, /First entry/)
  } finally {
    server.close()
  }
})

// ───────────────────────────────────────────────────────────────── round 6: content-bound evidence, node-tied judgement, main navigation only
test('browser evidence is bound to the effective font report: changing a font or a loader in the source changes what the measurement must match', () => {
  const a = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'Golos Text' }), [THEME]: '{}' }, { identity: 'x' }))
  const b = analyzeStatic(t4Input({ [SITE]: json({ body_font_family: 'Mulish' }), [THEME]: '{}' }))
  assert.notEqual(staticFingerprint(a), staticFingerprint(b))
  assert.match(browserCoverage(measurement({ report: a }), b).join('\n'), /another static report/)
  const forged = { ...b, fingerprint: staticFingerprint(a) }
  assert.match(browserCoverage(measurement({ report: a }), forged).join('\n'), /another static report/, 'the fingerprint is recomputed from the report, never read from it')
  const other = analyzeStatic({ ...t4Input({ [SITE]: json({ body_font_family: 'Golos Text' }), [THEME]: '{}' }), identity: 'another-archive' })
  assert.notEqual(staticFingerprint(a), staticFingerprint(other))
})

test('browser evidence: every page is the page its menu assignment says — route, style and the URL that answered', () => {
  const report = fake([{ id: '10', template: 'tpl', default: true }, { id: '11', template: 'tpl' }], [{ id: '1', path: 'blog', styleId: '11' }, { id: '2', path: 'a/b', styleId: '10' }])
  const good = () => measurement({ styleIds: ['10', '11'], report, routes: { 11: '/blog' }, nested: '/a/b' })
  assert.deepEqual(browserCoverage(good(), report, { expectedSite: SITE_URL }), [])
  const wrongStyle = good()
  wrongStyle.pages.filter((p) => p.route === '/blog').forEach((p) => (p.styleId = '10'))
  assert.match(browserCoverage(wrongStyle, report).join('\n'), /menu assigns style #11 to this route, the measurement says #10/)
  const wrongHome = good()
  wrongHome.pages.filter((p) => p.kind === 'home').forEach((p) => (p.styleId = '11'))
  assert.match(browserCoverage(wrongHome, report).join('\n'), /home page is route \/ drawn with a default style/)
  const wrongUrl = good()
  wrongUrl.pages.filter((p) => p.route === '/blog').forEach((p) => (p.finalUrl = 'http://source.invalid/elsewhere'))
  assert.match(browserCoverage(wrongUrl, report).join('\n'), /URL the browser ended on .* is not this route/)
  const otherHost = good()
  otherHost.pages.filter((p) => p.route === '/blog').forEach((p) => (p.finalUrl = 'http://stand.invalid/blog'))
  assert.match(browserCoverage(otherHost, report).join('\n'), /is not this route on http:\/\/source\.invalid/)
  const wrongNested = good()
  wrongNested.pages.filter((p) => p.kind === 'nested').forEach((p) => ((p.route = '/blog'), (p.url = 'http://source.invalid/blog'), (p.finalUrl = 'http://source.invalid/blog')))
  assert.match(browserCoverage(wrongNested, report).join('\n'), /is not a nested route/)
})

test('gate: a pack that records no source URL cannot bind its measurement and fails', () => {
  const good = analyzeStatic(t4Input({ [SITE]: json(T4_FONTS), [THEME]: '{}' }))
  const g = gateSourceFonts({ staticReport: good, browser: measurement({ report: good }) })
  assert.equal(g.ok, false)
  assert.match(g.problems.join('\n'), /records no source URL/)
})

test('browser (real Chromium): only the main navigation is the nav sample — a visible footer menu never stands in for the collapsed one; a brand link neither', { timeout: 180000 }, async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:16px} .brand{font-family:Georgia,serif}
    footer a{font-family:"Courier New",monospace} .menu{display:none} .menu.open{display:block} .menu a{font-family:Verdana,sans-serif}
    @media (min-width:992px){.menu{display:block}.tog{display:none}}
  </style></head><body><header><a class="brand" href="/">Brand</a><button class="navbar-toggler tog" onclick="document.querySelector('.menu').classList.add('open')">menu</button>
  <nav class="menu t4-megamenu"><a href="/a">First entry</a></nav></header>
  <h1>Headline</h1><h2>Sub</h2><h3>Third</h3><p>${PROSE}</p>
  <footer><nav><a href="/f">Footer entry</a></nav></footer></body></html>`
  const { server, origin } = await serve({ '/': html, '/blog/post': html })
  try {
    const report = fake([{ id: '1', template: 't', default: true }], [{ id: '1', path: 'blog/post', styleId: '1' }])
    const m = await measureSource({ origin, staticReport: report })
    const narrow = m.pages.find((p) => p.route === '/' && p.width === 390)
    assert.match(narrow.roles.nav.requested, /Verdana/, 'the main menu was opened and read, not the footer')
    assert.match(narrow.roles.nav.text, /First entry/)
    const noMenu = await serve({ '/': html.replace(/<nav class="menu t4-megamenu">.*?<\/nav>/s, ''), '/blog/post': html.replace(/<nav class="menu t4-megamenu">.*?<\/nav>/s, '') })
    try {
      const m2 = await measureSource({ origin: noMenu.origin, staticReport: report })
      const p = m2.pages.find((x) => x.route === '/' && x.width === 390)
      assert.equal(p.roles.nav, undefined, 'no main menu: nav is absent, the footer menu is not borrowed')
      assert.ok(p.absent.includes('nav'))
    } finally {
      noMenu.server.close()
    }
  } finally {
    server.close()
  }
})

test('browser (real Chromium): the forced-family reading ties an internal font name to the requested family on that node', { timeout: 180000 }, async () => {
  const { server, origin } = await serve({ '/': doc('body{font-family:"No Such Face 9000",serif;font-size:16px}'), '/blog/post': doc('body{font-size:16px}') })
  try {
    const report = fake([{ id: '1', template: 't', default: true }], [{ id: '1', path: 'blog/post', styleId: '1' }])
    const m = await measureSource({ origin, staticReport: report })
    const body = m.pages.find((p) => p.route === '/' && p.width === 1440).roles.body
    assert.equal(body.forced.family, 'No Such Face 9000')
    assert.equal(body.forced.custom, false, 'an unloaded family forced onto the node draws a system font, so it is no alias')
    assert.equal(roleVerdict(body)?.code, 'web-family-not-drawn')
  } finally {
    server.close()
  }
})

// ───────────────────────────────────────────────────────────────── round 7: inputs, T3 menu, active sheets, extra pages, dump measurement
test('static report: the font files the verdicts rest on are digested — a changed sheet or a removed font file changes the fingerprint', () => {
  const css = (family, src) => `@font-face{font-family:"${family}";src:url("${src}")}`
  const files = (extra) => ({ [SITE]: json({ ...T4_FONTS, body_font_family: 'Local Face', dont_use_google_font: '1' }), [THEME]: '{}', 'templates/tpl/css/template.css': css('Local Face', '../fonts/a.woff'), 'templates/tpl/fonts/a.woff': { binary: true }, ...extra })
  const a = analyzeStatic(t4Input(files()))
  assert.equal(roleOf(a, 'body').verdict, 'loaded')
  assert.match(a.inputs.sha256, /^[0-9a-f]{64}$/)
  const sameAgain = analyzeStatic(t4Input(files()))
  assert.equal(staticFingerprint(a), staticFingerprint(sameAgain))
  const edited = analyzeStatic(t4Input(files({ 'templates/tpl/css/template.css': `${css('Local Face', '../fonts/a.woff')} /* edited */ @font-face{font-family:"Other";src:url("../fonts/a.woff")}` })))
  assert.equal(roleOf(edited, 'body').verdict, 'loaded', 'the verdicts are the same')
  assert.notEqual(staticFingerprint(a), staticFingerprint(edited), 'a measurement of the old sheet no longer matches')
  const f2 = files()
  delete f2['templates/tpl/fonts/a.woff']
  assert.notEqual(staticFingerprint(a), staticFingerprint(analyzeStatic(t4Input(f2))))
  const m = measurement({ report: a })
  assert.match(browserCoverage(m, edited).join('\n'), /another static report/)
})

test('T4: an active sheet whose text is not available is an evidence gap, never a missing loader', () => {
  const r = analyzeStatic(t4Input({ [SITE]: json({ ...T4_FONTS, body_font_family: 'Local Face', dont_use_google_font: '1' }), [THEME]: '{}', 'templates/tpl/local/css/template.css': { error: 'larger than 2097152 bytes' } }))
  assert.equal(r.complete, false)
  assert.equal(roleOf(r, 'body').verdict, 'unverified')
  assert.deepEqual(codes(r), [], 'no finding is claimed on a sheet nobody read')
  assert.match(r.gaps.join('\n'), /templates\/tpl\/local\/css\/template\.css is an active style sheet and is not readable/)
})

const T3_ASSETS = ASSETS('css/template.css')
test('T3: the main menu is a role of its own — declared and unloaded is a finding, undeclared inherits the body', () => {
  const base = { 'templates/tpl/less/variables.less': '@font-family-base: Arial, sans-serif;', 'templates/tpl/etc/assets.xml': T3_ASSETS }
  const inherits = analyzeStatic(t3({ ...base, 'templates/tpl/css/template.css': 'body{margin:0}' }))
  assert.equal(roleOf(inherits, 'megamenu').verdict, 'inherits-body')
  assert.deepEqual(codes(inherits), [])
  const bad = analyzeStatic(t3({ ...base, 'templates/tpl/css/template.css': '.t3-megamenu a{font-family:"Lost Face",sans-serif}' }))
  const menu = roleOf(bad, 'megamenu')
  assert.equal(menu.family, 'Lost Face')
  assert.equal(menu.verdict, 'not-loaded')
  assert.deepEqual(codes(bad), ['family-never-loaded'])
  assert.equal(bad.findings[0].role, 'megamenu')
  const ok = analyzeStatic(t3({ ...base, 'templates/tpl/css/template.css': '.t3-mainnav a{font-family:Verdana}' }))
  assert.equal(roleOf(ok, 'megamenu').verdict, 'system')
})

test('T3: only sheets etc/assets.xml activates are loaders; without assets.xml the loaders are not known', () => {
  const sheet = { 'templates/tpl/less/variables.less': VARS, 'templates/tpl/css/loose.css': FACE, 'templates/tpl/css/root.woff': { binary: true } }
  const loose = analyzeStatic(t3({ ...sheet, 'templates/tpl/etc/assets.xml': ASSETS('css/template.css'), 'templates/tpl/css/template.css': 'body{margin:0}' }))
  assert.deepEqual(codes(loose), ['family-never-loaded', 'family-never-loaded'], 'a file sitting in css/ loads nothing')
  const none = analyzeStatic(t3(sheet))
  assert.equal(none.complete, false)
  assert.match(none.gaps.join('\n'), /etc\/assets\.xml is not in the source/)
  const imported = analyzeStatic(t3({ ...sheet, 'templates/tpl/etc/assets.xml': ASSETS('css/template.css'), 'templates/tpl/css/template.css': '@import "loose.css";' }))
  assert.deepEqual(codes(imported), [], 'an active sheet reaches what it imports')
})

test('browser evidence: an extra page claims no style unless its menu item gives it; a redirect to another page is refused', () => {
  const report = fake([{ id: '10', template: 'tpl', default: true }, { id: '11', template: 'tpl' }], [{ id: '1', path: 'blog', styleId: '11' }, { id: '2', path: 'a/b', styleId: '10' }, ])
  const m = measurement({ styleIds: ['10', '11'], report, routes: { 11: '/blog' }, nested: '/a/b' })
  const extra = (route, styleId) => [DESKTOP_WIDTH, MOBILE_WIDTH].map((width) => browserPage({ route, kind: 'extra', styleId, width }))
  const withExtra = (pages) => ({ ...m, pages: [...m.pages, ...pages] })
  assert.deepEqual(browserCoverage(withExtra(extra('/article-1', null)), report), [], 'an article page claims nothing')
  assert.match(browserCoverage(withExtra(extra('/article-1', '11')), report).join('\n'), /not a menu route of this source but claims style #11/)
  assert.match(browserCoverage(withExtra(extra('/blog', '10')), report).join('\n'), /menu assigns style #11 to this route/)
  assert.deepEqual(browserCoverage(withExtra(extra('/blog', '11')), report), [])
  // an extra page cannot stand in for a style's own page
  const lone = fake([{ id: '10', template: 'tpl', default: true }, { id: '11', template: 'tpl' }], [{ id: '1', path: 'blog', styleId: '11' }, { id: '2', path: 'a/b', styleId: '10' }])
  const missingStyle = measurement({ styleIds: ['10'], report: lone, nested: '/a/b' })
  assert.match(browserCoverage({ ...missingStyle, pages: [...missingStyle.pages, ...extra('/article-1', '11')] }, lone).join('\n'), /style #11 .* has no measured page|claims style #11/)
  const moved = withExtra([])
  moved.pages.filter((p) => p.route === '/blog').forEach((p) => (p.finalUrl = 'http://source.invalid/login'))
  assert.match(browserCoverage(moved, report).join('\n'), /URL the browser ended on \(http:\/\/source\.invalid\/login\)/)
  const unrecorded = withExtra([])
  delete unrecorded.pages[0].finalUrl
  assert.match(browserCoverage(unrecorded, report).join('\n'), /none recorded/)
  assert.equal(planRoutes(report, { extra: ['/blog', '/article-1'] }).filter((p) => p.kind === 'extra').map((p) => p.styleId).join(), '11,')
})

test('planRoutes: only the framework main menus are the nav sample — a utility menu inside the header is not one (real Chromium)', { timeout: 180000 }, async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:16px} .util a{font-family:"Courier New",monospace} .t4-megamenu{display:none} .t4-megamenu.open{display:block} .t4-megamenu a{font-family:Verdana,sans-serif}
    @media (min-width:992px){.t4-megamenu{display:block}.tog{display:none}}
  </style></head><body><header><nav class="util"><a href="/login">Sign in</a></nav><button class="navbar-toggler tog" onclick="document.querySelector('.t4-megamenu').classList.add('open')">menu</button>
  <nav><div class="t4-megamenu"><a href="/a">Main entry</a></div></nav></header>
  <h1>Headline</h1><h2>Sub</h2><h3>Third</h3><p>${PROSE}</p></body></html>`
  const { server, origin } = await serve({ '/': html, '/blog/post': html })
  try {
    const report = fake([{ id: '1', template: 't', default: true }], [{ id: '1', path: 'blog/post', styleId: '1' }])
    const m = await measureSource({ origin, staticReport: report })
    for (const width of [1440, 390]) {
      const p = m.pages.find((x) => x.route === '/' && x.width === width)
      assert.match(p.roles.nav.text, /Main entry/, `${width}px reads the main menu, not the utility one`)
      assert.match(p.roles.nav.requested, /Verdana/)
    }
  } finally {
    server.close()
  }
})

test('source-font-browser.mjs --dump measures against the dump\'s own static report: from-joomla and the pack gate accept its artifact (real Chromium)', { timeout: 240000 }, async () => {
  const { spawn, spawnSync } = await import('node:child_process')
  // the stand runs in this process: the CLI must be spawned without blocking the event loop
  const run = (args) => new Promise((resolve) => { const c = spawn(process.execPath, args, { encoding: 'utf8' }); let stdout = ''; let stderr = ''; c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d)); c.on('close', (status) => resolve({ status, stdout, stderr })) })
  const { mkdtempSync, readFileSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const { sourceFontsOfDump } = await import('../ingest/from-joomla.mjs')
  const { buildPack } = await import('./source-font-fixtures.mjs')
  const here = dirname(fileURLToPath(import.meta.url))
  const dump = join(here, 'fixtures', 'joomla-min')
  const report = sourceFontsOfDump(dump)
  const page = doc('body{font-family:"SF Pro Text",sans-serif;font-size:16px} h1{font-size:40px} h2{font-size:30px} h3{font-size:24px}')
  const pages = { '/': page }
  for (const r of report.menuRoutes) pages[`/${r.path}`] = page
  const { server, origin } = await serve(pages)
  const dir = mkdtempSync(join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'sf-dump-'))
  try {
    const out = join(dir, 'm.json')
    const cli = join(here, '..', 'ingest', 'source-font-browser.mjs')
    const both = spawnSync(process.execPath, [cli, '--site', origin, '--static', 'x.json', '--dump', dump, '--out', out], { encoding: 'utf8' })
    assert.equal(both.status, 2, 'exactly one of --static and --dump')
    const r = await run([cli, '--site', origin, '--dump', dump, '--out', out])
    assert.match(r.stdout, /measured \d+ page reading/, r.stdout + r.stderr)
    assert.ok(!/INCOMPLETE/.test(r.stdout), r.stdout)
    const m = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(m.static.fingerprint, staticFingerprint(report))
    assert.ok(m.pages.every((p) => p.finalUrl && p.finalUrl.startsWith(origin)))
    const built = buildPack({ j6Dir: dump, out: join(dir, 'pack'), pageFloor: 4, siteUrl: origin, sourceFontsBrowser: m })
    const bound = built.validation.problems.filter((x) => /incomplete|fingerprint|another static|does not measure/.test(x))
    assert.deepEqual(bound, [], 'the measurement binds to the pack and covers it; only the page\'s own findings may remain')
    writeFileSync(join(dir, 'ok'), '')
  } finally {
    server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// ───────────────────────────────────────────────────────────────── round 8: effective T3 declarations, font bytes, exact routes
test('T3: the effective declaration is judged — an unloaded LESS base overridden by an active rule is no finding, an unrelated nav rule is no menu font', () => {
  const lessBase = { 'templates/tpl/less/variables.less': '@font-family-base: "Lost Face", sans-serif;\n@headings-font-family: "Lost Head", serif;', 'templates/tpl/etc/assets.xml': ASSETS('css/template.css') }
  const overridden = analyzeStatic(t3({ ...lessBase, 'templates/tpl/css/template.css': 'body{font-family:Arial,sans-serif} h1,h2,h3{font-family:Georgia,serif}' }))
  assert.deepEqual(codes(overridden), [], 'the LESS variables are not what the page draws with')
  assert.equal(roleOf(overridden, 'body').family, 'Arial')
  assert.equal(roleOf(overridden, 'heading').family, 'Georgia')
  // the same declarations in the other order: the later rule wins, and an unloaded winner is the finding
  const lost = analyzeStatic(t3({ ...lessBase, 'templates/tpl/css/template.css': 'body{font-family:Arial} body{font-family:"Late Face"}' }))
  assert.equal(roleOf(lost, 'body').family, 'Late Face')
  assert.deepEqual(codes(lost).sort(), ['family-never-loaded', 'family-never-loaded'])
  // an imported sheet comes before the importing one, so the importing sheet's rule is the later
  const imported = analyzeStatic(t3({ ...lessBase, 'templates/tpl/css/template.css': '@import "base.css"; body{font-family:Arial}', 'templates/tpl/css/base.css': 'body{font-family:"Late Face"}' }))
  assert.equal(roleOf(imported, 'body').family, 'Arial')
  // a bare .nav / .navbar-nav is any navigation block of the page, not the main menu
  const unrelated = analyzeStatic(t3({ 'templates/tpl/less/variables.less': '@font-family-base: Arial;', 'templates/tpl/etc/assets.xml': ASSETS('css/template.css'), 'templates/tpl/css/template.css': '.footer .nav a, .nav a, .navbar-nav > li > a{font-family:"Footer Face"}' }))
  assert.equal(roleOf(unrelated, 'megamenu').verdict, 'inherits-body')
  assert.deepEqual(codes(unrelated), [])
})

test('static report: a font file is bound by its bytes — the same name with other bytes is another source', () => {
  const css = '@font-face{font-family:"Local Face";src:url("../fonts/a.woff")}'
  const files = (bytes) => ({ [SITE]: json({ ...T4_FONTS, body_font_family: 'Local Face', dont_use_google_font: '1' }), [THEME]: '{}', 'templates/tpl/css/template.css': css, 'templates/tpl/fonts/a.woff': { binary: true, bytes } })
  const a = analyzeStatic(t4Input(files('one')))
  const b = analyzeStatic(t4Input(files('two')))
  assert.equal(roleOf(a, 'body').verdict, 'loaded')
  assert.equal(roleOf(b, 'body').verdict, 'loaded', 'same verdicts')
  assert.notEqual(staticFingerprint(a), staticFingerprint(b))
  assert.match(browserCoverage(measurement({ report: a }), b).join('\n'), /another static report/)
  assert.equal(staticFingerprint(a), staticFingerprint(analyzeStatic(t4Input(files('one')))))
  // a reader that offers a digest but cannot give one for a font is a gap, not a pass
  const input = t4Input(files('one'))
  input.reader.digest = () => ({ error: 'too large' })
  const blind = analyzeStatic(input)
  assert.equal(blind.complete, false)
  assert.match(blind.gaps.join('\n'), /could not be digested/)
})

test('browser evidence: the final URL must be exactly the route — /login is not the home page, /other/blog is not /blog', () => {
  const report = fake([{ id: '10', template: 'tpl', default: true }, { id: '11', template: 'tpl' }], [{ id: '1', path: 'blog', styleId: '11' }, { id: '2', path: 'a/b', styleId: '10' }])
  const base = () => measurement({ styleIds: ['10', '11'], report, routes: { 11: '/blog' }, nested: '/a/b' })
  const at = (m, route, url) => (m.pages.filter((p) => p.route === route).forEach((p) => (p.finalUrl = url)), m)
  assert.deepEqual(browserCoverage(base(), report, { expectedSite: SITE_URL }), [])
  assert.match(browserCoverage(at(base(), '/', 'http://source.invalid/login'), report).join('\n'), /not this route/)
  assert.match(browserCoverage(at(base(), '/blog', 'http://source.invalid/other/blog'), report).join('\n'), /not this route/)
  assert.match(browserCoverage(at(base(), '/blog', 'http://source.invalid/blog/extra'), report).join('\n'), /not this route/)
  assert.deepEqual(browserCoverage(at(base(), '/blog', 'http://source.invalid/index.php/blog/'), report), [])
  assert.deepEqual(browserCoverage(at(base(), '/', 'http://source.invalid/index.php'), report), [])
  assert.deepEqual(browserCoverage(at(base(), '/', 'http://source.invalid/'), report), [])
})

test('browser (real Chromium): a late script redirect never passes — recorded as the page it ended on, or as a reading that was interrupted', { timeout: 180000 }, async () => {
  const late = doc('body{font-family:Arial;font-size:16px}', '<script>setTimeout(function(){location.replace("/login")},150)</script>')
  const { server, origin } = await serve({ '/': late, '/login': doc('body{font-family:Arial}'), '/blog/post': doc('body{font-family:Arial;font-size:16px}') })
  try {
    const report = fake([{ id: '1', template: 't', default: true }], [{ id: '1', path: 'blog/post', styleId: '1' }])
    const m = await measureSource({ origin, staticReport: report })
    const home = m.pages.find((p) => p.route === '/' && p.width === 1440)
    // whether the redirect lands before, during or after the reading depends on the machine; every case is refused
    assert.match(home.finalUrl, /\/login$/)
    assert.ok(browserCoverage(m, report, { expectedSite: origin }).length > 0)
  } finally {
    server.close()
  }
})

// ───────────────────────────────────────────────────────────────── round 9: the cascade, and the whole URL
test('browser evidence: a redirect to the same path with another query is another page', () => {
  const report = fake([{ id: '10', template: 'tpl', default: true }, { id: '11', template: 'tpl' }], [{ id: '1', path: 'blog', styleId: '11' }, { id: '2', path: 'a/b', styleId: '10' }])
  const base = () => measurement({ styleIds: ['10', '11'], report, routes: { 11: '/blog' }, nested: '/a/b' })
  const to = (m, route, url) => (m.pages.filter((p) => p.route === route).forEach((p) => (p.finalUrl = url)), m)
  assert.match(browserCoverage(to(base(), '/', 'http://source.invalid/?option=com_users&view=login'), report).join('\n'), /not this route/)
  assert.match(browserCoverage(to(base(), '/blog', 'http://source.invalid/blog?tmpl=component'), report).join('\n'), /not this route/)
  // a menu route carries no query: not as the page asked for, not as the page it ended on
  const m = base()
  m.pages.filter((p) => p.route === '/blog').forEach((p) => ((p.url = 'http://source.invalid/blog?lang=en'), (p.finalUrl = 'http://source.invalid/blog?lang=en')))
  assert.match(browserCoverage(m, report).join('\n'), /not this route/)
  const loginBoth = base()
  loginBoth.pages.filter((p) => p.route === '/').forEach((p) => ((p.url = 'http://source.invalid/?option=com_users&view=login'), (p.finalUrl = 'http://source.invalid/?option=com_users&view=login')))
  assert.match(browserCoverage(loginBoth, report).join('\n'), /not this route/, 'a redirect taken while the route was resolved binds nothing')
  assert.deepEqual(browserCoverage(to(base(), '/blog', 'http://source.invalid/blog#top'), report), [], 'a fragment is not a page')
})

const t3css = (css, extra = {}) => t3({ 'templates/tpl/less/variables.less': '@font-family-base: Arial, sans-serif;', 'templates/tpl/etc/assets.xml': ASSETS('css/template.css'), 'templates/tpl/css/template.css': css, ...extra })

test('T3 cascade: specificity, !important, order — the winner is judged, the loser is not', () => {
  const link = analyzeStatic(t3css('.t3-mainnav a{font-family:Arial} #t3-mainnav a{font-family:"Lost Face"}'))
  assert.equal(roleOf(link, 'megamenu').family, 'Lost Face', 'the more specific link rule wins')
  assert.deepEqual(codes(link), ['family-never-loaded'])
  const order = analyzeStatic(t3css('#t3-mainnav a{font-family:"Lost Face"} .t3-mainnav a{font-family:Arial}'))
  assert.equal(roleOf(order, 'megamenu').family, 'Lost Face', 'specificity beats a later, weaker rule')
  const important = analyzeStatic(t3css('body{font-family:"Lost Face" !important} html body{font-family:Arial}'))
  assert.equal(roleOf(important, 'body').family, 'Lost Face')
  assert.deepEqual(codes(important), ['family-never-loaded'])
  const later = analyzeStatic(t3css('body{font-family:"Lost Face"} body{font-family:Arial}'))
  assert.equal(roleOf(later, 'body').family, 'Arial')
  assert.deepEqual(codes(later), [])
  // a rule on the link beats a rule on the container the link inherits from, whatever their specificity
  const inherit = analyzeStatic(t3css('#t3-mainnav .t3-megamenu.big{font-family:"Lost Face"} .t3-megamenu a{font-family:Arial}'))
  assert.equal(roleOf(inherit, 'megamenu').family, 'Arial')
  assert.deepEqual(codes(inherit), [])
  const container = analyzeStatic(t3css('.t3-megamenu{font-family:"Lost Face"}'))
  assert.equal(roleOf(container, 'megamenu').family, 'Lost Face', 'with no rule on the link itself the container font is what the link draws')
  // LESS nesting composes the selector
  const nested = analyzeStatic(t3css('.t3-mainnav { a { font-family: "Lost Face"; } }'))
  assert.equal(roleOf(nested, 'megamenu').family, 'Lost Face')
  // a bare p rule is the paragraph's own; the body rule is inherited
  const para = analyzeStatic(t3css('body{font-family:Arial} p{font-family:"Lost Face"}'))
  assert.equal(roleOf(para, 'body').family, 'Lost Face')
})

test('T3 cascade: what a static reading cannot decide is ambiguous — incomplete evidence, never a finding or a pass', () => {
  // a media condition: the rule applies at some widths
  const media = analyzeStatic(t3css('body{font-family:Arial} @media (min-width:768px){ body{font-family:"Lost Face"} }'))
  assert.equal(roleOf(media, 'body').family, 'Arial')
  assert.deepEqual(codes(media), [])
  assert.equal(media.complete, false)
  assert.match(media.gaps.join('\n'), /\(@media \(min-width:768px\)\) sets "Lost Face"/)
  assert.equal(roleOf(media, 'body').ambiguous[0].family, 'Lost Face')
  // the same conditional rule with a loaded family is fine
  const loaded = analyzeStatic(t3css('body{font-family:Arial} @media (min-width:768px){ body{font-family:"Open Sans"} }', { 'templates/tpl/etc/assets.xml': ASSETS('https://fonts.googleapis.com/css?family=Open+Sans') }))
  assert.equal(loaded.complete, true, loaded.gaps.join())
  // a bare navigation selector may be any nav block of the page
  const bare = analyzeStatic(t3css('.navbar-nav a{font-family:"Lost Face"}'))
  assert.equal(roleOf(bare, 'megamenu').verdict, 'inherits-body')
  assert.deepEqual(codes(bare), [])
  assert.equal(bare.complete, false)
  assert.match(bare.gaps.join('\n'), /megamenu: .*`\.navbar-nav a` sets "Lost Face"/)
  // an ancestor-conditioned heading rule
  const scoped = analyzeStatic(t3css('h1{font-family:Arial} .sidebar h1{font-family:"Lost Face"}'))
  assert.equal(roleOf(scoped, 'heading').family, 'Arial')
  assert.deepEqual(codes(scoped), [])
  assert.equal(scoped.complete, false)
  // a state of the menu link is not the resting font
  const hover = analyzeStatic(t3css('.t3-mainnav a:hover{font-family:"Lost Face"}'))
  assert.equal(hover.complete, false)
  assert.deepEqual(codes(hover), [])
})

test('measureSource: a route that redirects while it is resolved is unresolved — the redirect target is not the page (real Chromium)', { timeout: 180000 }, async () => {
  const page = doc('body{font-family:Arial;font-size:16px}')
  const server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    if (u.pathname === '/' && !u.search) return res.writeHead(302, { location: '/?option=com_users&view=login' }).end()
    res.writeHead(200, { 'content-type': 'text/html' }).end(page)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    const report = fake([{ id: '1', template: 't', default: true }], [{ id: '1', path: 'blog/post', styleId: '1' }])
    const m = await measureSource({ origin, staticReport: report })
    assert.ok(m.unresolved.some((u) => u.kind === 'home' && /redirects/.test(u.why)), JSON.stringify(m.unresolved))
    assert.ok(!m.pages.some((p) => p.kind === 'home'))
    assert.match(browserCoverage(m, report, { expectedSite: origin }).join('\n'), /required page was not measured: home/)
  } finally {
    server.close()
  }
})

test('T3 cascade: a menu selector with a class the menu does not structurally have is not certain; a conditional rule above a certain one makes the lower verdict undecidable', () => {
  // `.special` names a link the menu may not have: the working `.t3-mainnav a` rule stays the certain one, the other is ambiguous
  const special = analyzeStatic(t3css('.t3-mainnav a{font-family:Arial} .t3-mainnav a.special{font-family:"Lost Face"}'))
  assert.equal(roleOf(special, 'megamenu').family, 'Arial')
  assert.deepEqual(codes(special), [])
  assert.equal(special.complete, false)
  assert.match(special.gaps.join('\n'), /a\.special` sets "Lost Face"/)
  // a class the menu may not carry — however structural it looks — keeps the rule ambiguous: no definitive finding
  for (const sel of ['.t3-mainnav .nav > li.level99 > a', '.t3-mainnav .menu a', '.t3-mainnav .nav a', '.t3-megamenu .mega a', '.t3-mainnav #x a', '.t3-mainnav a[href]', '.t3-mainnav section a', '.t3-mainnav ul li a', '.t3-mainnav > a']) {
    const r = analyzeStatic(t3css(`.t3-mainnav a{font-family:Arial} ${sel}{font-family:"Lost Face"}`))
    assert.equal(roleOf(r, 'megamenu').family, 'Arial', sel)
    assert.deepEqual(codes(r), [], sel)
    assert.equal(r.complete, false, sel)
    assert.match(r.gaps.join('\n'), /sets "Lost Face"/, sel)
  }
  // the exact supported form — the container and its links as plain descendants — is certain
  const exact = analyzeStatic(t3css('.t3-mainnav a{font-family:Arial} #t3-mainnav a{font-family:"Lost Face"}'))
  assert.equal(roleOf(exact, 'megamenu').family, 'Lost Face')
  assert.deepEqual(codes(exact), ['family-never-loaded'])
  // the certain winner is unloaded, but a conditional rule above it may replace it: no definitive finding
  const over = analyzeStatic(t3css('body{font-family:"Lost Face"} @media (min-width:768px){ body{font-family:Arial} }'))
  assert.equal(roleOf(over, 'body').verdict, 'unverified')
  assert.deepEqual(codes(over), [])
  assert.equal(over.complete, false)
  assert.match(roleOf(over, 'body').note, /outranks it and may reach the body text/)
  // with nothing above it the same unloaded family is a finding
  assert.deepEqual(codes(analyzeStatic(t3css('body{font-family:"Lost Face"}'))), ['family-never-loaded'])
})
