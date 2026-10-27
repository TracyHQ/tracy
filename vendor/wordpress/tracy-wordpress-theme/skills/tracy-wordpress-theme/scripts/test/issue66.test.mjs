// Issue #66 — the visual tools read a source with T4's selectors only: a T3 (Bootstrap 3) source's
// section headings, chrome, header triggers and page identity were invisible (JA Morgan, RUN.md S-8,
// S-25, S-26, S-28). One selector profile per framework (lib/framework-selectors.mjs), chosen from the
// inventory classification the adapter records in provenance.json and the contract carries, is read by
// layout-boxes, parity-extract/http-parity, menu-open/visual-qa, the preflight's layout probe and the
// design contract's page identity. A framework without a profile reads generic landmarks and says so.
// Fixture: scripts/test/issue66-fixture.mjs.
// Scratch goes under TRACY_TEST_SCRATCH when it is set (TMPDIR is left as it is), else the OS temp dir.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PROFILES,
  PROFILED_FRAMEWORKS,
  SELECTOR_PROFILE_VERSION,
  readProvenanceFile,
  selectorProfileFor,
  selectorProfileOfContract,
  selectorProfileOfProvenance,
  selectorsRecord
} from '../lib/framework-selectors.mjs'
import { CHROME, extractRuns } from '../lib/parity-extract.mjs'
import { MEASURE, measureInPage, measureOf } from '../visual/layout-boxes.mjs'
import { DRAWER_KEY, inPageMenuTriggers, measureMenus, pairMenus } from '../visual/menu-open.mjs'
import { RUN_LAUNCH_ARGS, diffProperty, run, settle } from '../visual/visual-qa.mjs'
import { initContract, validateContract } from '../visual/contract.mjs'
import { pageHash, TOOL_VERSION } from '../visual/page-hash.mjs'
import { DEFECTS, PROTECTED_FLAGS, controlCommand, selectorArgsOf, toolCommands } from '../visual/preflight.mjs'
import { captureDesign } from '../design-probe.mjs'
import { CellStuck, refSelector, runCell } from './issue66-morgan.mjs'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { serve as serveDir } from './issue56-fixture.mjs'
import { FOOTER_WORDS, HERO, OFFCANVAS_WORDS, SECTIONS, SIDEBAR_WORDS, TOPBAR_WORDS, brokenHeaderPage, emptyPage, provenanceOf, serve, sitePage, specFixture, t3ArticlePage, t3HomePage, t3SectionsPage } from './issue66-fixture.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS = path.join(HERE, '..')
const SCRATCH = process.env.TRACY_TEST_SCRATCH ? path.join(process.env.TRACY_TEST_SCRATCH, 'issue66-scratch') : tmpdir()
mkdirSync(SCRATCH, { recursive: true })
const ROOT = mkdtempSync(path.join(SCRATCH, 'i66-test-'))
after(() => {
  rmSync(ROOT, { recursive: true, force: true })
  try {
    if (process.env.TRACY_TEST_SCRATCH && !readdirSync(SCRATCH).length) rmSync(SCRATCH, { recursive: true })
  } catch {}
})
const scratch = (prefix) => mkdtempSync(path.join(ROOT, prefix))
const writeJson = (file, x) => writeFileSync(file, JSON.stringify(x))

let browser = null
const launch = async () => {
  if (!browser) {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  }
  return browser
}
after(async () => {
  if (browser) await browser.close()
})
/** Evaluate `fn(arg)` on `html` at `width`, after the page's own scripts ran. */
const onPage = async (html, fn, arg, { width = 1440, height = 900 } = {}) => {
  const b = await launch()
  const p = await b.newPage({ viewport: { width, height } })
  try {
    await p.setContent(html, { waitUntil: 'load' })
    return await p.evaluate(fn, arg)
  } finally {
    await p.close()
  }
}
const rendered = async (html, width = 1440) => {
  const b = await launch()
  const p = await b.newPage({ viewport: { width, height: 900 } })
  try {
    await p.setContent(html, { waitUntil: 'load' })
    return await p.content()
  } finally {
    await p.close()
  }
}

// ── the profile ────────────────────────────────────────────────────────────────────────────────────

test('issue 66: the T4 profile is the lists every tool read before — layout-boxes MEASURE, parity CHROME, the menu toggles written into the page', () => {
  assert.equal(PROFILES.T4.headings, MEASURE.headings)
  assert.equal(PROFILES.T4.chrome, MEASURE.chrome)
  assert.equal(PROFILES.T4.chrome, CHROME)
  assert.deepEqual([MEASURE.section, MEASURE.panelStop, PROFILES.T4.identity], ['section', 'section, main', 'main'])
  // the defaults written out in the page functions are the T4 profile's
  for (const r of PROFILES.T4.menu.toggles) {
    assert.ok(inPageMenuTriggers.toString().includes(`selector: '${r.selector}'`), r.selector)
    assert.ok(inPageMenuTriggers.toString().includes(`refs: ${JSON.stringify(r.refs).replaceAll('"', "'").replaceAll(',', ', ')}`), r.selector)
  }
  assert.equal(PROFILES.T4.menu.toggles.length, 2)
  assert.ok(measureInPage.toString().includes("sectionSel ??= 'section'") && measureInPage.toString().includes("panelStop ??= 'section, main'"))
  // every profile keeps the WordPress landmarks the site is drawn with
  for (const p of Object.values(PROFILES)) {
    for (const sel of ['header', 'nav', 'footer', '.tracy-header', '.wp-block-navigation']) assert.ok(p.chrome.split(', ').includes(sel), `${p.id} ${sel}`)
    assert.ok(p.headings.includes('main h1') && p.headings.includes('body h1'), p.id)
  }
  // the keys tell the profiles apart and carry the version
  const keys = Object.values(PROFILES).map((p) => p.key)
  assert.equal(new Set(keys).size, 3)
  for (const p of Object.values(PROFILES)) assert.ok(p.key.startsWith(`${p.id}/${SELECTOR_PROFILE_VERSION}/`), p.key)
  assert.deepEqual(PROFILED_FRAMEWORKS, ['T4', 'T3'])
  assert.ok(Object.isFrozen(PROFILES.T3.menu.toggles[0]))
})

test('issue 66: a classification picks its profile; any other, or metadata that is missing, empty or not a name, reads generic landmarks with a gap; no framework source at all keeps T4, assumed', () => {
  assert.deepEqual([selectorProfileFor('T3').profile.id, selectorProfileFor('T3').gap], ['T3', null])
  assert.deepEqual([selectorProfileFor('T4').profile.id, selectorProfileFor('T4').gap], ['T4', null])
  for (const fw of ['Helix', 'Gavick', 'other', 'conflict', 'unknown', 't3']) {
    const r = selectorProfileFor(fw, { from: 'x' })
    assert.equal(r.profile.id, 'generic', fw)
    assert.equal(r.framework, fw)
    assert.match(r.gap, new RegExp(`source framework ${fw} \\(x\\) has no selector profile .*generic landmarks`), fw)
  }
  for (const bad of [null, undefined, '', '   ', 42, {}, ['T3'], true]) {
    const r = selectorProfileFor(bad, { from: 'p' })
    assert.equal(r.profile.id, 'generic', JSON.stringify(bad))
    assert.equal(r.framework, null)
    assert.match(r.gap, /^p (names no framework|names framework .*, not a classification): generic landmarks/, JSON.stringify(bad))
  }
  const assumed = selectorProfileFor(null, { declared: false })
  assert.deepEqual([assumed.profile.id, assumed.assumed], ['T4', true])
  assert.match(assumed.gap, /not declared.*T4 selector profile is assumed/)
  assert.deepEqual(selectorsRecord(assumed), { profile: 'T4', key: PROFILES.T4.key, framework: null, from: null, assumed: true, gap: assumed.gap })
  assert.deepEqual(selectorsRecord(selectorProfileFor('T3', { from: 'f' })), { profile: 'T3', key: PROFILES.T3.key, framework: 'T3', from: 'f' })
})

test('issue 66: the framework is read from provenance.json and the visual contract only — a named file that is missing, a symlink, a directory, a FIFO, not JSON or not an object is an error', () => {
  const dir = scratch('prov-')
  assert.equal(selectorProfileOfProvenance(provenanceOf('T3')).profile.id, 'T3')
  assert.equal(selectorProfileOfProvenance(provenanceOf(undefined)).profile.id, 'generic')
  assert.match(selectorProfileOfProvenance({ source: {} }).gap, /provenance\.json source\.template\.css\.framework names no framework/)
  assert.throws(() => selectorProfileOfProvenance([]), /not a JSON object/)
  const good = path.join(dir, 'provenance.json')
  writeJson(good, provenanceOf('T3'))
  assert.equal(readProvenanceFile(good).profile.id, 'T3')
  assert.match(readProvenanceFile(good).from, /provenance\.json source\.template\.css\.framework$/)
  assert.throws(() => readProvenanceFile(path.join(dir, 'none.json')), /no such file/)
  assert.throws(() => readProvenanceFile(dir), /is not a regular file/)
  // a symlink is never followed — to a regular JSON file, to a directory, or to nothing
  for (const [name, to] of [['link.json', good], ['dirlink', dir], ['dangling.json', path.join(dir, 'gone.json')]]) {
    symlinkSync(to, path.join(dir, name))
    assert.throws(() => readProvenanceFile(path.join(dir, name)), /is a symlink; provenance is never read through one/, name)
  }
  const fifo = path.join(dir, 'fifo')
  if (spawnSync('mkfifo', [fifo]).status === 0) assert.throws(() => readProvenanceFile(fifo), /is not a regular file/, 'refused without opening it: a FIFO would block the read')
  const bad = path.join(dir, 'bad.json')
  writeFileSync(bad, '{ "source": ')
  assert.throws(() => readProvenanceFile(bad), /not readable JSON/)
  writeFileSync(bad, '[1]')
  assert.throws(() => readProvenanceFile(bad), /not a JSON object/)
  // the contract: its source.framework; a contract written before #66 keeps T4, assumed
  assert.equal(selectorProfileOfContract({ source: { framework: 'T3' } }).profile.id, 'T3')
  assert.equal(selectorProfileOfContract({ source: { framework: null } }).profile.id, 'generic')
  assert.deepEqual([selectorProfileOfContract({ source: {} }).profile.id, selectorProfileOfContract({ source: {} }).assumed], ['T4', true])
  assert.equal(selectorProfileOfContract(null).assumed, true)
})

// ── parity-extract / http-parity ────────────────────────────────────────────────────────────────────

test('issue 66: content parity drops the T3 chrome — topbar, off-canvas moved to the body, footer — and keeps sections and the sidebar; the T4 list read them as content', async () => {
  const home = await rendered(t3HomePage())
  const t3 = extractRuns(home, { chrome: PROFILES.T3.chrome })
  const t4 = extractRuns(home)
  const has = (r, words) => r.runs.some((x) => x.includes(words))
  assert.ok(has(t4, TOPBAR_WORDS) && has(t4, OFFCANVAS_WORDS), 'before: the topbar and the off-canvas panel read as content')
  assert.ok(!has(t3, TOPBAR_WORDS) && !has(t3, OFFCANVAS_WORDS) && !has(t3, FOOTER_WORDS), JSON.stringify(t3.runs))
  for (const w of [HERO, ...SECTIONS]) assert.ok(t3.runs.includes(w), w)
  const article = extractRuns(await rendered(t3ArticlePage()), { chrome: PROFILES.T3.chrome })
  assert.ok(article.runs.includes(SIDEBAR_WORDS), 'a sidebar is content (#27 item 8)')
  assert.ok(!article.runs.some((x) => x.includes(TOPBAR_WORDS)))
  // generic landmarks: header and footer only — the topbar is outside them, and that is the reported gap
  assert.ok(has(extractRuns(home, { chrome: PROFILES.generic.chrome }), TOPBAR_WORDS))
  // an empty or broken page is no runs, never an error; a chrome list that is not one is refused
  assert.deepEqual(extractRuns(emptyPage(), { chrome: PROFILES.T3.chrome }).runs, [])
  assert.deepEqual(extractRuns('', { chrome: PROFILES.T3.chrome }).runs, [])
  assert.throws(() => extractRuns(home, { chrome: '' }), /chrome must be a non-empty selector list/)
})

async function cli(script, args) {
  const child = spawn(process.execPath, [path.join(SCRIPTS, script), ...args])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  return { code, output }
}

test('issue 66: http-parity reads the profile from --provenance or --framework, records it, keys its cache by it, and refuses inputs it cannot read', async () => {
  const src = await serve('/src')
  const srv = await serve('/site')
  const dir = scratch('hp-')
  try {
    const prov = path.join(dir, 'provenance.json')
    writeJson(prov, provenanceOf('T3'))
    const provLink = path.join(dir, 'provenance-link.json')
    symlinkSync(prov, provLink)
    const base = ['--source', src.origin, '--target', srv.origin, '--routes', '/home/']
    const cache = path.join(dir, 'cache')
    const t3 = await cli('http-parity.mjs', [...base, '--provenance', prov, '--out', path.join(dir, 't3.json'), '--cache', cache, '--render', 'source'])
    const r3 = JSON.parse(readFileSync(path.join(dir, 't3.json'), 'utf8'))
    assert.deepEqual([r3.selectors.profile, r3.selectors.framework, r3.toolVersion], ['T3', 'T3', 7], t3.output)
    assert.ok(!r3.routes[0].missing.some((x) => x.includes(TOPBAR_WORDS)), JSON.stringify(r3.routes[0].missing))
    const again = await cli('http-parity.mjs', [...base, '--provenance', prov, '--out', path.join(dir, 't3b.json'), '--cache', cache, '--render', 'source'])
    assert.equal(JSON.parse(readFileSync(path.join(dir, 't3b.json'), 'utf8')).routes[0].cached, true, again.output)
    // another profile over the same pages is not the cached verdict
    const t4 = await cli('http-parity.mjs', [...base, '--framework', 'T4', '--out', path.join(dir, 't4.json'), '--cache', cache, '--render', 'source'])
    const r4 = JSON.parse(readFileSync(path.join(dir, 't4.json'), 'utf8'))
    assert.equal(r4.routes[0].cached, false, t4.output)
    assert.ok(r4.routes[0].missing.some((x) => x.includes(TOPBAR_WORDS)), 'the T4 list reads the T3 topbar as content the site misses')
    assert.equal(t4.code, 1)
    // a framework with no profile, and no framework at all, are said
    const helix = await cli('http-parity.mjs', [...base, '--framework', 'Helix', '--out', path.join(dir, 'h.json'), '--no-cache'])
    assert.match(helix.output, /selector profile generic — source framework Helix \(--framework\) has no selector profile/)
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'h.json'), 'utf8')).selectors.profile, 'generic')
    const none = await cli('http-parity.mjs', [...base, '--out', path.join(dir, 'n.json'), '--no-cache'])
    assert.match(none.output, /T4 selector profile is assumed/)
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'n.json'), 'utf8')).selectors.assumed, true)
    // inputs: exit 2 before anything is fetched
    const bad = path.join(dir, 'bad.json')
    writeFileSync(bad, 'not json')
    for (const [args, re] of [
      [['--provenance', path.join(dir, 'missing.json')], /no such file/],
      [['--provenance', dir], /is not a regular file/],
      [['--provenance', provLink], /is a symlink/],
      [['--provenance', bad], /not readable JSON/],
      [['--framework', '../T3'], /is not a framework classification/],
      [['--framework'], /--framework needs a value/],
      [['--framework', 'T3', '--provenance', prov], /name one of --framework and --provenance/]
    ]) {
      const r = await cli('http-parity.mjs', [...base, '--out', path.join(dir, 'x.json'), '--no-cache', ...args])
      assert.equal(r.code, 2, `${args.join(' ')}: ${r.output}`)
      assert.match(r.output, re)
    }
  } finally {
    await srv.close()
    await src.close()
  }
})

// ── layout-boxes ──────────────────────────────────────────────────────────────────────────────────

test('issue 66: layout-boxes reads T3 section titles, masthead, content and sidebar headings, never the topbar, off-canvas or footer; the T4 lists read almost none', async () => {
  const t3 = measureOf(PROFILES.T3)
  const home = await onPage(t3HomePage(), measureInPage, t3)
  assert.deepEqual(home.map((b) => [b.tag, b.words]), [['h1', HERO.toLowerCase()], ...SECTIONS.map((s) => ['h3', s.toLowerCase()])])
  // the section box is the T3 band, and the panel search stops at it: the grey band is the section's paint
  const grey = home[1]
  assert.equal(grey.section.paint, 'rgb(235, 235, 235)')
  assert.equal(grey.panel, null, JSON.stringify(grey.panel))
  assert.equal(grey.section.w, 1440)
  const before = await onPage(t3HomePage(), measureInPage, MEASURE)
  assert.deepEqual(before.map((b) => b.tag), ['h1'], 'the T4 lists read the hero only (S-25: 4 of 15 paired)')
  const article = await onPage(t3ArticlePage(), measureInPage, t3)
  assert.deepEqual(article.map((b) => b.words), ['about our company', 'our long history of service', 'what we value most', 'latest news'])
  assert.deepEqual((await onPage(t3ArticlePage(), measureInPage, MEASURE)).map((b) => b.words), ['our long history of service'], 'no <main>: the T4 lists read the h2 only, 1 of 4')
  assert.deepEqual(await onPage(t3SectionsPage(), measureInPage, MEASURE), [], 'section titles only: the T4 lists read nothing')
  assert.deepEqual((await onPage(t3SectionsPage(), measureInPage, t3)).map((b) => b.words), SECTIONS.map((w) => w.toLowerCase()))
  // generic landmarks: h1/h2 anywhere, h3 in main only
  assert.deepEqual((await onPage(t3ArticlePage(), measureInPage, measureOf(PROFILES.generic))).map((b) => b.words), ['our long history of service'])
  // the site under the T3 profile is read as under the T4 one: its landmarks are in every profile
  const siteT3 = await onPage(sitePage(), measureInPage, t3)
  const siteT4 = await onPage(sitePage(), measureInPage, MEASURE)
  assert.deepEqual(siteT3.map((b) => b.text), siteT4.map((b) => b.text))
  assert.deepEqual(siteT3.map((b) => b.words), [HERO, ...SECTIONS].map((w) => w.toLowerCase()))
  assert.deepEqual(await onPage(emptyPage(), measureInPage, t3), [])
})

test('issue 66: layout-boxes CLI measures with --provenance/--framework/--contract, names the profile and its gap, and never passes a side with no heading', async () => {
  const srv = await serve()
  const dir = scratch('lb-')
  try {
    const prov = path.join(dir, 'provenance.json')
    writeJson(prov, provenanceOf('T3'))
    const provLink = path.join(dir, 'provenance-link.json')
    symlinkSync(prov, provLink)
    const base = ['--source', `${srv.origin}/src`, '--site', `${srv.origin}/site`]
    const out = path.join(dir, 'lb.json')
    const r = await cli('visual/layout-boxes.mjs', [...base, '--routes', '/home/', '--provenance', prov, '--out', out])
    assert.ok([0, 1].includes(r.code), r.output)
    const json = JSON.parse(readFileSync(out, 'utf8'))
    assert.deepEqual([json.selectors.profile, json.selectors.framework], ['T3', 'T3'])
    const [home] = json.results
    assert.deepEqual([home.headings, home.paired, home.onlySource, home.onlySite, home.unmeasured], [[3, 3], 3, [], [], undefined])
    assert.match(readFileSync(out.replace(/\.json$/, '.md'), 'utf8'), /Selector profile: \*\*T3\*\* \(source framework T3/)
    // the contract's source.framework, as preflight passes it
    const contract = path.join(dir, 'visual.contract.json')
    writeJson(contract, { source: { framework: 'T3' }, design: { theme: { attribute: 'data-theme', values: { light: null, dark: 'dark' } } } })
    const viaContract = await cli('visual/layout-boxes.mjs', [...base, '--routes', '/home/', '--contract', contract, '--out', out])
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).selectors.profile, 'T3', viaContract.output)
    // no framework: T4 assumed, said; the sections page shows no heading T4 reads — not a pass
    const legacy = await cli('visual/layout-boxes.mjs', [...base, '--routes', '/sections/', '--out', out])
    assert.equal(legacy.code, 1, legacy.output)
    const lj = JSON.parse(readFileSync(out, 'utf8'))
    assert.deepEqual([lj.selectors.profile, lj.selectors.assumed, lj.results[0].unmeasured], ['T4', true, ['source']])
    assert.match(legacy.output, /gap: the source framework was not declared/)
    assert.match(legacy.output, /the source shows no heading the T4 profile reads/)
    // a framework with no profile: generic, with the gap in the report
    await cli('visual/layout-boxes.mjs', [...base, '--routes', '/home/', '--framework', 'Helix', '--out', out])
    assert.match(JSON.parse(readFileSync(out, 'utf8')).selectors.gap, /Helix .* has no selector profile/)
    // an empty page on both sides: exit 1, both named
    const empty = await cli('visual/layout-boxes.mjs', [...base, '--routes', '/empty/', '--framework', 'T3', '--out', out])
    assert.equal(empty.code, 1, empty.output)
    assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).results[0].unmeasured, ['source', 'site'])
    // inputs it cannot read: exit 2
    const bad = path.join(dir, 'bad.json')
    writeFileSync(bad, '{')
    for (const [args, re] of [
      [['--provenance', path.join(dir, 'nope.json')], /no such file/],
      [['--provenance', dir], /not a regular file/],
      [['--provenance', provLink], /is a symlink/],
      [['--provenance', bad], /not readable JSON/],
      [['--framework', 'a b'], /is not a framework classification/],
      [['--framework'], /--framework needs a value/],
      [['--framework', 'T3', '--provenance', prov], /name one of --framework and --provenance/]
    ]) {
      const x = await cli('visual/layout-boxes.mjs', [...base, '--routes', '/home/', ...args])
      assert.equal(x.code, 2, `${args.join(' ')}: ${x.output}`)
      assert.match(x.output, re)
    }
  } finally {
    await srv.close()
  }
})

// ── menu-open ─────────────────────────────────────────────────────────────────────────────────────

const census = (html, width, toggles = PROFILES.T3.menu.toggles) => onPage(html, inPageMenuTriggers, [16, [], toggles], { width, height: width < 768 ? 844 : 900 })
const brief = (c) => c.triggers.map((t) => ({ label: t.label, how: t.how, kind: t.kind, drawer: Boolean(t.drawer), clickable: t.clickable, problem: t.problem }))

test('issue 66: the T3 header\'s triggers are found — the hover mega dropdown at 1440, Bootstrap 3\'s collapse burger and T3\'s off-canvas toggle; the T4 toggles found none of the two', async () => {
  assert.deepEqual(brief(await census(t3HomePage(), 1440)), [
    { label: '', how: 'control', kind: 'data-nav', drawer: true, clickable: true, problem: null },
    { label: 'Home', how: 'hover', kind: 'submenu', drawer: false, clickable: false, problem: null }
  ])
  assert.deepEqual(brief(await census(t3HomePage(), 390)), [
    { label: 'Toggle navigation', how: 'control', kind: 'data-target', drawer: false, clickable: true, problem: null },
    { label: '', how: 'control', kind: 'data-nav', drawer: true, clickable: true, problem: null }
  ])
  // before: the T4 profile's toggles (the defaults) see the hover submenu only
  assert.deepEqual(brief(await census(t3HomePage(), 1440, null)).map((t) => t.kind), ['submenu'])
  assert.deepEqual((await onPage(t3HomePage(), inPageMenuTriggers, 16, { width: 390, height: 844 })).triggers, [], 'S-28: no trigger at 390')
  // the body accordion is no header trigger; a toggle rule whose selector the page refuses is no rule
  const withBad = [{ selector: '[[bad', refs: ['x'], form: 'id', drawer: true }, ...PROFILES.T3.menu.toggles]
  assert.equal((await census(t3HomePage(), 390, withBad)).triggers.length, 2)
})

test('issue 66: a toggle that names no single panel, a missing panel, two owners, an open panel, a hidden toggle and a link that leaves are never guessed into a trigger', async () => {
  const c = await census(brokenHeaderPage(), 1440)
  const by = Object.fromEntries(c.triggers.map((t) => [t.label, t]))
  assert.match(by['Duplicate target'].problem, /data-target "\.dup" names 2 elements; which one it opens cannot be told/)
  assert.match(by['Absent target'].problem, /data-target "\.nothing-here" names no element in the page/)
  assert.match(by['Complex target'].problem, /data-target "div > \.x" names no panel by id or single class/)
  assert.match(by['Missing panel'].problem, /data-nav names #nowhere, which is not in the page/)
  // 🔒 one reference, one panel: never the first id listed, never the first element carrying an id
  assert.match(by['Two controls'].problem, /aria-controls names 2 panels \(pa pb\); which one it opens cannot be told/)
  assert.match(by['Duplicate id'].problem, /data-target names #twin, which 2 elements carry; which one it opens cannot be told/)
  assert.match(by['Duplicate aria id'].problem, /aria-controls names #twin, which 2 elements carry/)
  assert.match(by['Conflicting refs'].problem, /aria-controls names #pc and its data-nav another element; which one it opens cannot be told/)
  assert.equal(by['Agreeing refs'].problem, null, 'aria-controls and data-nav naming the same panel are one reference')
  assert.equal(by['Agreeing refs'].kind, 'aria-controls')
  assert.match(by['First owner'].problem, /2 controls in the header open the same panel #shared/)
  assert.equal(by['Second owner'], undefined)
  assert.match(by['Leaves the page'].problem, /href "\/elsewhere\/" names no panel/)
  assert.equal(by['Leaves the page'].clickable, false, 'a link that leaves the page is never clicked')
  assert.equal(by['Hidden toggle'], undefined)
  assert.equal(by['Already open'], undefined)
  assert.equal(c.openAtRest, 1)
  assert.ok(!c.triggers.some((t) => /adviser/.test(t.label)), 'the body accordion is not a header trigger')
  // every one of them is named not measured when paired, never matched
  const guessed = { ...c, triggers: c.triggers.filter((t) => t.label !== 'Agreeing refs') }
  assert.ok(guessed.triggers.every((t) => t.problem))
  const p = pairMenus(guessed, guessed)
  assert.deepEqual(p.matched, [])
  assert.equal(p.notMeasured.length, 2 * guessed.triggers.length)
})

test('issue 66: measureMenus opens the T3 triggers for real on the source — the off-canvas and the collapse by a click, the mega dropdown by hover — and pairs them with the site\'s', async () => {
  const srv = await serve()
  const b = await launch()
  const out = scratch('menus-')
  try {
    const common = { browser: b, pageId: 'home', out, settle, props: ['font-size', 'color'], diffProperty, url: `${srv.origin}/site/home/`, sourceUrl: `${srv.origin}/src/home/` }
    const at = (width) => ({ ...common, variantId: String(width), siteOpts: { viewport: { width, height: width < 768 ? 844 : 900 } }, sourceOpts: { viewport: { width, height: width < 768 ? 844 : 900 } } })
    const mobile = await measureMenus({ ...at(390), profile: PROFILES.T3 })
    assert.equal(mobile.record.profile, 'T3')
    assert.deepEqual(mobile.record.source.kinds, ['data-target', 'data-nav'])
    assert.deepEqual(mobile.record.menus.map((m) => [m.key, m.by, m.source.opened, m.source.via, m.site.opened]).sort(), [[DRAWER_KEY, 'structure', true, 'click', true, ], ['toggle navigation', 'words', true, 'click', true]].sort(), JSON.stringify(mobile.record.menus).slice(0, 800))
    assert.deepEqual(mobile.findings.filter((f) => f.kind === 'menu-open-unmatched' || f.kind === 'menu-open-not-measured'), [])
    const desktop = await measureMenus({ ...at(1440), profile: PROFILES.T3 })
    const home = desktop.record.menus.find((m) => m.key === 'home')
    assert.deepEqual([home.by, home.source.opened, home.source.via, home.site.via], ['words', true, 'hover', 'hover'])
    assert.ok(desktop.record.menus.some((m) => m.key === DRAWER_KEY && m.source.via === 'click'))
    // before: the T4 toggles leave the source with no trigger at 390, and both site triggers unmatched
    const before = await measureMenus(at(390))
    assert.equal(before.record.source.triggers, 0)
    assert.equal(before.findings.filter((f) => f.kind === 'menu-open-unmatched').length, 2)
    // a page that owes 404 may show no header
    const owed = await measureMenus({ ...at(1440), profile: PROFILES.T3, url: `${srv.origin}/site/gone/`, sourceUrl: `${srv.origin}/src/gone/`, status: { site: 404, source: 404 } })
    assert.deepEqual([owed.record.measured, owed.findings], [true, []])
    // a page that answers 200 with no header the declared profile reads is not measured — either side,
    // any declared profile (T3, T4, the generic landmarks); never a clean axis of zero triggers
    const headerless = [
      ['source', PROFILES.T3, { sourceUrl: `${srv.origin}/src/divheader/` }],
      ['source', PROFILES.T3, { sourceUrl: `${srv.origin}/src/empty/` }],
      ['source', PROFILES.generic, { sourceUrl: `${srv.origin}/src/empty/` }],
      ['source', PROFILES.T4, { sourceUrl: `${srv.origin}/src/divheader/` }],
      ['site', PROFILES.T3, { url: `${srv.origin}/site/empty/` }],
      ['site', PROFILES.generic, { url: `${srv.origin}/site/empty/` }],
      ['site', PROFILES.generic, { url: `${srv.origin}/site/empty/`, status: { site: 200, source: 200 } }]
    ]
    for (const [side, profile, o] of headerless) {
      const r = await measureMenus({ ...at(1440), profile, ...o })
      const nm = r.findings.filter((f) => f.kind === 'menu-open-not-measured')
      assert.equal(r.record.measured, false, `${side} ${profile.id} ${JSON.stringify(o)}`)
      assert.equal(r.record.menus.length, 0)
      assert.deepEqual(nm.map((f) => f.side), [side])
      assert.match(nm[0].reason, new RegExp(`answered 200 but shows no header the ${profile.id} selector profile reads`))
      assert.match(r.record.reason, /no header/)
    }
    // the same empty page owing 404 under the generic profile is a page without menus
    const owedGeneric = await measureMenus({ ...at(1440), profile: PROFILES.generic, url: `${srv.origin}/site/gone/`, sourceUrl: `${srv.origin}/src/gone/`, status: { site: 404, source: 404 } })
    assert.deepEqual([owedGeneric.record.measured, owedGeneric.findings], [true, []])
    // with no framework declared (no profile: T4 assumed, a run gap of its own) a headerless page
    // keeps reading as a page without menus, as before #66
    const legacy = await measureMenus({ ...at(1440), url: `${srv.origin}/site/empty/`, sourceUrl: `${srv.origin}/src/empty/` })
    assert.deepEqual([legacy.record.measured, legacy.findings], [true, []])
    const assumedT4 = await measureMenus({ ...at(1440), profile: PROFILES.T4, assumed: true, url: `${srv.origin}/site/empty/`, sourceUrl: `${srv.origin}/src/empty/` })
    assert.deepEqual([assumedT4.record.measured, assumedT4.findings], [true, []])
  } finally {
    await srv.close()
  }
})

// ── page identity ─────────────────────────────────────────────────────────────────────────────────

const identityCount = (html, identity) =>
  onPage(html, captureDesign, { contractId: 'i66', contractHash: 'x', page: 'p', variant: 'v', identity, theme: { selector: 'html', attribute: 'data-theme', darkValue: 'dark', lightValue: 'light' }, tokens: [], rules: [], coverage: [] }).then((o) => o.identityMatches)

test('issue 66: the T3 page identity matches a section-only home and an article; `main` matches neither (S-8: 0 of 22)', async () => {
  assert.equal(await identityCount(t3HomePage(), 'main'), 0)
  assert.equal(await identityCount(t3ArticlePage(), 'main'), 0)
  assert.ok((await identityCount(t3HomePage(), PROFILES.T3.identity)) >= 2)
  assert.equal(await identityCount(t3ArticlePage(), PROFILES.T3.identity), 2, 'the masthead and the main body')
  assert.equal(await identityCount(emptyPage(), PROFILES.T3.identity), 0, 'an empty page has no identity: the design audit fails it')
  assert.equal(await identityCount(sitePage(), PROFILES.generic.identity), 1)
})

const COVERAGE = path.join(HERE, 'fixtures', 'joomla-coverage')
const write = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
}
/** joomla-coverage (T4 by its etc/layout JSON) turned into T3 (a `<t3>` manifest, an INI layout), or into a template with no framework marker. */
const recast = (kind) => {
  const d = scratch(`jc-${kind}-`)
  cpSync(COVERAGE, d, { recursive: true })
  if (kind === 'T4') return d
  const tpl = path.join(d, 'capture/templates/cov')
  rmSync(path.join(tpl, 'css/styles'), { recursive: true })
  rmSync(path.join(tpl, 'html/layouts/t4'), { recursive: true })
  for (const f of readdirSync(path.join(tpl, 'etc/layout'))) rmSync(path.join(tpl, 'etc/layout', f))
  if (kind === 'T3') write(path.join(tpl, 'etc/layout/default.ini'), '[mainbody]\n')
  write(path.join(tpl, 'templateDetails.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<extension type="template" client="site"><name>cov</name><version>1.0.0</version>${kind === 'T3' ? '<t3><base>base-bs3</base></t3>' : ''}</extension>\n`)
  write(path.join(tpl, 'css/template.css'), 'body{font-size:16px;color:#333333;background-color:#ffffff}\n.btn{border-radius:4px}\n')
  return d
}
const buildPack = (j6Dir) => {
  const r = buildSpecPack({ j6Dir, out: path.join(scratch('jc-out-'), 'spec'), pageFloor: 1, now: '2026-09-29T00:00:00.000Z' })
  const read = (f) => JSON.parse(readFileSync(path.join(r.out, f), 'utf8'))
  return { design: read('design-contract.json'), prov: read('provenance.json') }
}

test('issue 66: the Joomla adapter writes each page\'s identity from the template\'s framework profile — T4 `main` as before, T3 its regions, a template with no framework the generic landmarks with a note', () => {
  const t4 = buildPack(recast('T4'))
  assert.equal(t4.prov.source.template.css.framework, 'T4')
  assert.ok(t4.design.pages.length > 0 && t4.design.pages.every((p) => p.identity === 'main'))
  assert.ok(!t4.prov.notes.some((n) => n.startsWith('design-contract.json page identity')))
  const t3 = buildPack(recast('T3'))
  assert.equal(t3.prov.source.template.css.framework, 'T3')
  assert.ok(t3.design.pages.every((p) => p.identity === PROFILES.T3.identity), JSON.stringify(t3.design.pages.map((p) => p.identity)))
  const other = buildPack(recast('other'))
  assert.equal(other.prov.source.template.css.framework, 'other')
  assert.ok(other.design.pages.every((p) => p.identity === PROFILES.generic.identity))
  assert.ok(other.prov.notes.some((n) => /^design-contract\.json page identity: source framework other .* has no selector profile/.test(n)), JSON.stringify(other.prov.notes))
})

// ── contract → visual-qa → page hash, and the preflight ─────────────────────────────────────────────

test('issue 66: contract init carries the spec-pack\'s framework into source.framework; visual-qa opens the T3 triggers through it and records the profile; the page hash moves with the profile', async () => {
  const fx = specFixture(ROOT, 'T3')
  const contract = await initContract({ specDir: fx.spec, configFile: fx.config, builtTheme: fx.theme, id: 'i66' })
  assert.equal(contract.source.framework, 'T3')
  assert.deepEqual(validateContract(contract, { specDir: fx.spec }), [])
  const file = path.join(fx.dir, 'visual.contract.json')
  writeJson(file, contract)
  const srv = await serveDir(fx.site)
  try {
    const out = path.join(fx.dir, 'out')
    const report = await run({ contract: file, site: srv.origin, out, spec: fx.spec, sourceSite: null, concurrency: 1, stage: 'light-responsive', allStages: true })
    assert.deepEqual([report.selectors.profile, report.selectors.framework], ['T3', 'T3'])
    const axis = report.pages[0].axes.find((a) => a.variant === '390-light')
    assert.equal(axis.menus.profile, 'T3')
    assert.deepEqual(axis.menus.source.kinds, ['data-target', 'data-nav'], JSON.stringify(axis.menus).slice(0, 600))
    assert.ok(axis.menus.menus.length === 2 && axis.menus.menus.every((m) => m.source.opened), JSON.stringify(axis.menus.menus).slice(0, 800))
    assert.match(readFileSync(path.join(out, 'VISUAL.md'), 'utf8'), /Selector profile: \*\*T3\*\* \(source framework T3\)/)
  } finally {
    await srv.close()
  }
  // the page hash: another framework, or none recorded, is another hash on the same pages
  const page = contract.pages[0]
  const h = (source) => pageHash({ contract: { ...contract, source }, page, targetHtml: 'x' }).hash
  const hashes = [h({ ...contract.source }), h({ ...contract.source, framework: 'T4' }), h({ ...contract.source, framework: 'Helix' })]
  assert.equal(new Set(hashes).size, 3)
  assert.equal(h({ ...contract.source, framework: 'Helix' }), h({ ...contract.source, framework: null }), 'two frameworks with no profile read the same lists')
  assert.notEqual(TOOL_VERSION, 'visual-qa/10', 'evidence that never saw a T3 trigger is measured again')
  // a spec-pack with no framework, or none at all: generic, reported by the run; a framework that is not a name is refused
  const none = specFixture(ROOT, undefined)
  const c2 = await initContract({ specDir: none.spec, configFile: none.config, builtTheme: none.theme, id: 'i66' })
  assert.equal(c2.source.framework, null)
  assert.match(selectorProfileOfContract(c2).gap, /names no framework/)
  const bare = specFixture(ROOT, null)
  assert.equal((await initContract({ specDir: bare.spec, configFile: bare.config, builtTheme: bare.theme, id: 'i66' })).source.framework, null)
  assert.match(validateContract({ ...contract, source: { ...contract.source, framework: 3 } }).join('\n'), /source\.framework 3 is not a framework classification/)
  writeFileSync(path.join(none.spec, 'provenance.json'), '{')
  await assert.rejects(() => initContract({ specDir: none.spec, configFile: none.config, builtTheme: none.theme, id: 'i66' }), /provenance\.json: not readable JSON/)
  // a spec-pack whose provenance.json is a symlink — to a T3 provenance, or to nothing — is refused, never read through or taken for absent
  const t3prov = path.join(none.dir, 'elsewhere-provenance.json')
  writeJson(t3prov, provenanceOf('T3'))
  for (const to of [t3prov, path.join(path.dirname(t3prov), 'gone.json')]) {
    rmSync(path.join(none.spec, 'provenance.json'), { force: true })
    symlinkSync(to, path.join(none.spec, 'provenance.json'))
    await assert.rejects(() => initContract({ specDir: none.spec, configFile: none.config, builtTheme: none.theme, id: 'i66' }), /provenance\.json is a symlink/, to)
  }
})

test('issue 66: the preflight hands layout-boxes and http-parity the contract\'s framework, protects those flags, and its layout probe and injected defect read the same profile', async () => {
  assert.deepEqual(selectorArgsOf({ source: { framework: 'T3' } }), ['--framework', 'T3'])
  assert.deepEqual(selectorArgsOf({ source: { framework: null } }), ['--framework', 'unknown'])
  assert.deepEqual(selectorArgsOf({ source: {} }), [])
  assert.deepEqual(selectorArgsOf(null), [])
  const common = { sample: [{ path: '/', role: 'content' }], samplePageMap: 's.json', routePageMaps: ['r0.json'], site: 'http://site', source: 'http://src', out: '/o', tools: ['layout-boxes', 'http-parity'], selectorArgs: ['--framework', 'T3'] }
  const cmds = toolCommands(common)
  for (const tool of ['layout-boxes', 'http-parity']) {
    const argv = cmds[tool][0].argv
    assert.deepEqual(argv.slice(argv.indexOf('--framework'), argv.indexOf('--framework') + 2), ['--framework', 'T3'], tool)
    assert.ok(PROTECTED_FLAGS[tool].includes('--framework') && PROTECTED_FLAGS[tool].includes('--provenance'), tool)
  }
  // the source control has no --contract (its hooks are the site's): the framework reaches it by the flag
  const ctl = controlCommand({ side: 'source', route: '/', routePageMap: 'r0.json', site: 'http://site', source: 'http://src', out: '/o', contract: 'c.json', selectorArgs: ['--framework', 'T3'] })
  assert.ok(!ctl.argv.includes('--contract') && ctl.argv.includes('--framework'))
  // the injected layout defect finds a T3 section title only through the T3 lists
  const words = SECTIONS[0].toLowerCase()
  const srv = await serve()
  const inject = async (measure) => {
    const b = await launch()
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
    try {
      await p.addInitScript(DEFECTS.layout(words, measure))
      await p.goto(`${srv.origin}/src/home/`, { waitUntil: 'load' })
      return await p.evaluate(() => document.querySelectorAll('[data-preflight-defect="layout"]').length)
    } finally {
      await p.close()
    }
  }
  try {
    assert.equal(await inject(measureOf(PROFILES.T3)), 1)
    assert.equal(await inject(MEASURE), 0)
  } finally {
    await srv.close()
  }
})

// ── the Morgan census helper: its inputs ───────────────────────────────────────────────────────────

test('issue 66: the Morgan census refuses missing or invalid arguments, an unreadable provenance and an output it cannot write safely, before measuring', async () => {
  const dir = scratch('census-')
  const prov = path.join(dir, 'provenance.json')
  writeJson(prov, provenanceOf('T3'))
  const provLink = path.join(dir, 'provenance-link.json')
  symlinkSync(prov, provLink)
  const ok = ['--source', 'http://127.0.0.1:9', '--site', 'http://127.0.0.1:9', '--provenance', prov, '--routes', '/', '--widths', '1440', '--timeout-ms', '20000']
  const linkTarget = path.join(dir, 'elsewhere.json')
  const link = path.join(dir, 'link.json')
  symlinkSync(linkTarget, link)
  const fifo = path.join(dir, 'fifo.json')
  const hasFifo = spawnSync('mkfifo', [fifo]).status === 0
  const cases = [
    [[], /--source needs a value|usage/],
    [ok.filter((x, i) => i > 1), /--source/],
    [[...ok.slice(0, 2), '--site', 'not a url', ...ok.slice(4), '--out', path.join(dir, 'a.json')], /--site .* is not an http\(s\) origin/],
    [[...ok.slice(0, 6), '--routes', 'home', ...ok.slice(8), '--out', path.join(dir, 'a.json')], /route "home" does not start with \//],
    [[...ok.slice(0, 8), '--widths', '1440,abc', ...ok.slice(10), '--out', path.join(dir, 'a.json')], /--widths/],
    [[...ok.slice(0, 10), '--timeout-ms', '0', '--out', path.join(dir, 'a.json')], /--timeout-ms/],
    [[...ok.slice(0, 5), path.join(dir, 'nope.json'), ...ok.slice(6), '--out', path.join(dir, 'a.json')], /no such file/],
    [[...ok.slice(0, 5), provLink, ...ok.slice(6), '--out', path.join(dir, 'a.json')], /--provenance .* is a symlink/],
    [[...ok, '--out', dir], /--out .* exists and is not a regular file/],
    [[...ok, '--out', link], /--out .* is a symlink/],
    ...(hasFifo ? [[[...ok, '--out', fifo], /--out .* exists and is not a regular file/]] : []),
    [[...ok, '--out', path.join(dir, 'missing-dir', 'x.json')], /--out .*: its directory does not exist/]
  ]
  for (const [args, re] of cases) {
    const r = await cli('test/issue66-morgan.mjs', args)
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.output}`)
    assert.match(r.output, re, args.join(' '))
  }
  assert.equal(existsSync(linkTarget), false, 'nothing written through the link')
  // a stand that does not answer: exit 1 naming the side and the route; the report says it failed
  const down = await cli('test/issue66-morgan.mjs', [...ok, '--out', path.join(dir, 'down.json')])
  assert.equal(down.code, 1, down.output)
  assert.match(down.output, /source \/ at 1440: did not load/)
  const report = JSON.parse(readFileSync(path.join(dir, 'down.json'), 'utf8'))
  assert.equal(report.ok, false)
  assert.deepEqual(report.problems.map((p) => p.split(':')[0]), ['source / at 1440', 'site / at 1440'])
})

test('issue 66: the Morgan census measures the fixture stands with the production functions and reports the counts it recovered', async () => {
  const srv = await serve()
  const dir = scratch('census-ok-')
  try {
    const prov = path.join(dir, 'provenance.json')
    writeJson(prov, provenanceOf('T3'))
    const out = path.join(dir, 'census.json')
    const r = await cli('test/issue66-morgan.mjs', ['--source', `${srv.origin}/src`, '--site', `${srv.origin}/site`, '--provenance', prov, '--routes', '/home/', '--widths', '1440,390', '--timeout-ms', '120000', '--out', out])
    assert.equal(r.code, 0, r.output)
    const c = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(c.selectors.profile, 'T3')
    const at = (w) => c.routes.find((x) => x.route === '/home/' && x.width === w)
    assert.deepEqual([at(1440).source.headings, at(1440).legacy.source.headings], [3, 1])
    assert.deepEqual(at(390).source.triggers.kinds, ['data-target', 'data-nav'])
    assert.equal(at(390).legacy.source.triggers.count, 0)
    assert.ok(at(390).source.identity > 0 && at(390).legacy.source.identity === 0)
    assert.ok(at(1440).source.chrome.profile > at(1440).source.chrome.legacy)
    assert.equal(at(390).menus.source.opened, 2)
    assert.equal(c.ok, true)
    // JA Morgan's burger has no words: named by its panel reference, it is opened too — 2 of 2
    const iconOut = path.join(dir, 'icon.json')
    const icon = await cli('test/issue66-morgan.mjs', ['--source', `${srv.origin}/src`, '--site', `${srv.origin}/site`, '--provenance', prov, '--routes', '/icon/', '--widths', '390', '--timeout-ms', '120000', '--out', iconOut])
    assert.equal(icon.code, 0, icon.output)
    const ic = JSON.parse(readFileSync(iconOut, 'utf8')).routes[0]
    assert.deepEqual(ic.source.triggers.labels, ['', ''])
    assert.deepEqual(ic.source.triggers.namedBy, ['[data-target=".t3-navbar-collapse"]'])
    assert.deepEqual([ic.menus.source.triggers, ic.menus.source.opened, ic.menus.source.notOpened], [2, 2, 0])
    assert.match(icon.output, /opened 2\/2/)
    // a trigger found and not opened is a problem, never a clean cell
    const brokenOut = path.join(dir, 'broken.json')
    const broken = await cli('test/issue66-morgan.mjs', ['--source', `${srv.origin}/src`, '--site', `${srv.origin}/site`, '--provenance', prov, '--routes', '/broken/', '--widths', '1440', '--timeout-ms', '120000', '--out', brokenOut])
    assert.equal(broken.code, 1, broken.output)
    const bp = JSON.parse(readFileSync(brokenOut, 'utf8')).problems
    assert.ok(bp.some((p) => /^source \/broken\/ at 1440: trigger not opened — Duplicate target: its data-target "\.dup" names 2 elements/.test(p)), bp.join('\n'))
    // a 200 page with no header the census reads is a problem on each side, never a cell without menus
    const emptyOut = path.join(dir, 'empty.json')
    const empty = await cli('test/issue66-morgan.mjs', ['--source', `${srv.origin}/src`, '--site', `${srv.origin}/site`, '--provenance', prov, '--routes', '/empty/', '--widths', '1440', '--timeout-ms', '120000', '--out', emptyOut])
    assert.equal(empty.code, 1, empty.output)
    const ep = JSON.parse(readFileSync(emptyOut, 'utf8')).problems
    for (const side of ['source', 'site']) assert.ok(ep.includes(`${side} /empty/ at 1440: no header the menu census reads`), ep.join('\n'))
  } finally {
    await srv.close()
  }
})

test('issue 66: a census side past its bound is cancelled and awaited before the next starts — a delayed capture never writes after it; one that will not stop ends the run', async () => {
  const dir = scratch('cell-')
  const shot = path.join(dir, 'late.png')
  let settled = false
  let closed = 0
  const slow = runCell(async (signal, track) => {
    track({ close: async () => (closed += 1) })
    try {
      await new Promise((resolve) => setTimeout(resolve, 600))
      // a capture that would have written after its cell moved on
      if (!signal.aborted) writeFileSync(shot, 'late')
    } finally {
      settled = true
    }
  }, 100, 'source / at 390')
  await assert.rejects(slow, /source \/ at 390 ran past 100 ms/)
  assert.equal(settled, true, 'the timed-out work settled before the timeout was thrown')
  assert.equal(closed, 1, 'its page was closed')
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(existsSync(shot), false)
  // a work that ignores the cancel: the run cannot go on beside it
  await assert.rejects(runCell(() => new Promise((resolve) => setTimeout(resolve, 800)), 50, 'site / at 1440', { graceMs: 100 }), CellStuck)
  // in time: its result
  assert.equal(await runCell(async () => 7, 1000, 'x'), 7)
  // the selector a wordless trigger is named by: its reference attribute, quoted; nothing else
  assert.equal(refSelector('data-target', '.t3-navbar-collapse'), '[data-target=".t3-navbar-collapse"]')
  assert.equal(refSelector('data-nav', 'a"b'), '[data-nav="a\\"b"]')
  for (const [k, v] of [['submenu', 'x'], ['aria', 'x'], ['data-target', ''], ['data-target', null], ['on click', 'x']]) assert.equal(refSelector(k, v), null, `${k} ${v}`)
})
