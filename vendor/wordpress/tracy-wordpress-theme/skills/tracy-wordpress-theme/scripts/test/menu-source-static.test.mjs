// A source page that cannot open its menus (a Joomla error page that ships no script) is a measured fact of the
// source, not `menu-open-not-measured` — as long as another page of the contract opens the same menu on the source.
// Everything else stays a finding: a site that does not open, a static source nobody else covers, a doubt that
// was not confirmed. Fixture: scripts/test/issue50-fixture.mjs (`noScript`, `inertScript`, `second`).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RUN_LAUNCH_ARGS, diffProperty, run, settle, settleStaticSource } from '../visual/visual-qa.mjs'
import { measureMenus } from '../visual/menu-open.mjs'
import { INDEX, VISUAL, problems, readEvidence } from '../visual/evidence.mjs'
import { fixture, serve, sitePage, sourcePage } from './issue50-fixture.mjs'
import { pathToFileURL } from 'node:url'

const ROOT = mkdtempSync(path.join(tmpdir(), 'mss-test-'))
after(() => rmSync(ROOT, { recursive: true, force: true }))

const runOn = async (fx, origin, extra = {}) => {
  const out = path.join(fx.root, `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const report = await run({ contract: fx.contractFile, site: origin, out, spec: fx.spec, sourceSite: null, concurrency: 1, stage: 'light-desktop', ...extra })
  return { report, out }
}
const withSite = async (fx, fn) => {
  const srv = await serve(fx.site)
  try {
    return await fn(srv.origin)
  } finally {
    await srv.close()
  }
}
const pageOf = (report, id) => report.pages.find((p) => p.id === id)
const axisOf = (report, id) => pageOf(report, id).axes.find((a) => a.variant === '1440-light')
const menuFindings = (axis) => axis.findings.filter((f) => f.kind.startsWith('menu-open-'))

test('a none reference captures target menus and records only the comparison as not-applicable', async () => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const fx = fixture()
  const srv = await serve(fx.site)
  try {
    const r = await measureMenus({
      browser, url: `${srv.origin}/about/`, sourceUrl: null,
      siteOpts: { viewport: { width: 1440, height: 900 } }, sourceOpts: null,
      pageId: 'brief', variantId: '1440-light', out: fx.root, settle, props: ['font-size'], diffProperty,
      targetOnly: true, status: { site: 200 }
    })
    assert.equal(r.record.targetOnly, true)
    assert.equal(r.record.comparison.status, 'not-applicable')
    assert.equal(r.record.source, null)
    assert.ok(r.record.menus.length > 0)
    assert.ok(r.record.menus.every((m) => m.site.screenshot && !m.source))
    assert.deepEqual(r.findings, [])
  } finally {
    await srv.close()
    await browser.close()
  }
})

test('target-only menu capture still reports failed and clipped target panels', async () => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const capture = async (options, pageId, expectedStatus = 200) => {
    const fx = fixture(options)
    const srv = await serve(fx.site)
    try {
      return await measureMenus({
        browser, url: `${srv.origin}/about/`, sourceUrl: null,
        siteOpts: { viewport: { width: 1440, height: 900 } }, sourceOpts: null,
        pageId, variantId: '1440-light', out: fx.root, settle, props: ['font-size'], diffProperty,
        targetOnly: true, status: { site: expectedStatus }
      })
    } finally { await srv.close() }
  }
  try {
    const failed = await capture({ noScript: true }, 'brief-failed')
    assert.ok(failed.findings.some((f) => f.kind === 'menu-open-not-measured' && f.side === 'site'), JSON.stringify(failed.findings))
    assert.equal(failed.record.targetOnly, true)
    assert.deepEqual(failed.record.comparison, { check: 'menu-comparison', status: 'not-applicable', reason: 'reference.kind=none' })
    const clipped = await capture({ tall: true }, 'brief-clipped')
    assert.ok(clipped.findings.some((f) => f.kind === 'menu-open-not-measured' && /past the viewport/.test(f.reason)), JSON.stringify(clipped.findings))
    const loadFailed = await capture({}, 'brief-load-failed', 201)
    assert.ok(loadFailed.findings.some((f) => f.kind === 'menu-open-not-measured' && f.side === 'site'))
    assert.equal(loadFailed.record.measured, false)
    assert.equal(loadFailed.record.targetOnly, true)
    assert.deepEqual(loadFailed.record.comparison, { check: 'menu-comparison', status: 'not-applicable', reason: 'reference.kind=none' })
    assert.equal(typeof loadFailed.record.reason, 'string')
    assert.equal(typeof loadFailed.record.reason, 'string')
  } finally { await browser.close() }
})

test('a static source page beside an interactive page: no finding, the fact recorded with its coverage, the site opened', async () => {
  const fx = fixture({}, { noScript: true }, { second: true, secondSource: {} })
  const { report, out } = await withSite(fx, (origin) => runOn(fx, origin))
  const about = axisOf(report, 'en-about')
  const team = axisOf(report, 'en-team')
  assert.deepEqual(about.findings, [], JSON.stringify(about.findings).slice(0, 500))
  assert.deepEqual(team.findings, [])
  assert.equal(report.summary.stages['light-desktop'], 'pass')
  // the evidence: script count, the toggle tried, what happened, and which page opens it on the source
  assert.deepEqual(about.menus.sourceStatic, [{ key: 'search', trigger: 'Search', scripts: 0, toggle: 'button (aria-controls)', outcome: { hover: 'no-effect', click: 'no-effect' }, covered: { page: 'en-team', variant: '1440-light' } }])
  assert.equal(team.menus.sourceStatic, undefined)
  // the page's CSS menus (hover) open on a page without script; only the click-only one is static
  const rows = Object.fromEntries(about.menus.menus.map((m) => [m.trigger, m]))
  assert.equal(rows['Our Services'].source.opened, true)
  assert.equal(rows.Search.source.static, true)
  assert.equal(rows.Search.source.opened, false)
  // the SITE side of the page is still captured open
  assert.equal(rows.Search.site.opened, true)
  assert.ok(existsSync(path.join(out, rows.Search.site.screenshot)))
  // a static fact is neither a finding nor a capture on both sides
  assert.equal(report.summary.menus.sourceStatic, 1)
  assert.equal(report.summary.menus.notMeasured, 0)
  assert.equal(report.summary.menus.captured, 2 + 3)
  const index = readEvidence(path.join(out, 'index.json'), INDEX)
  assert.equal(index.menuMissing.length, 0, 'a static source is a fact, not a picture that could not be written')
  assert.ok(index.menuShots.some((s) => s.page === 'en-about' && s.side === 'site' && s.trigger === 'Search'))
  assert.ok(!index.menuShots.some((s) => s.page === 'en-about' && s.side === 'source' && s.trigger === 'Search'))
  assert.deepEqual(problems(JSON.parse(JSON.stringify(report)), VISUAL, 'visual.json'), [])
  assert.deepEqual(readEvidence(path.join(out, 'visual.json'), VISUAL).pages.length, 2)
})

test('a static source page with no other page that opens the menu on the source is a finding, and the stage fails', async () => {
  // alone
  const alone = fixture({}, { noScript: true })
  const one = await withSite(alone, (origin) => runOn(alone, origin))
  const a = axisOf(one.report, 'en-about')
  assert.deepEqual(menuFindings(a).map((f) => [f.kind, f.trigger, f.side]), [['menu-open-not-measured', 'Search', 'source']])
  assert.match(menuFindings(a)[0].reason, /cannot open this menu \(0 script\(s\); button \(aria-controls\): hover no-effect, click no-effect\).*no other page of this run opened it/)
  assert.equal(a.menus.sourceStatic[0].covered, null)
  assert.equal(one.report.summary.stages['light-desktop'], 'fail')
  assert.equal(one.report.summary.menus.notMeasured, 1)
  // beside a page that is static too
  const both = fixture({}, { noScript: true }, { second: true })
  const two = await withSite(both, (origin) => runOn(both, origin))
  assert.deepEqual([axisOf(two.report, 'en-about'), axisOf(two.report, 'en-team')].map((x) => menuFindings(x).length), [1, 1])
  // the interactive page was not part of the run (--pages): nothing covers the fact
  const partial = fixture({}, { noScript: true }, { second: true, secondSource: {} })
  const only = await withSite(partial, (origin) => runOn(partial, origin, { pages: 'en-about' }))
  assert.deepEqual(menuFindings(axisOf(only.report, 'en-about')).map((f) => f.kind), ['menu-open-not-measured'])
  assert.equal(only.report.summary.stages['light-desktop'], 'fail')
})

test('a site that does not open stays a finding even when its source is static and another source page opens', async () => {
  const fx = fixture({ noScript: true }, { noScript: true }, { second: true, secondSource: {} })
  const { report } = await withSite(fx, (origin) => runOn(fx, origin))
  const about = axisOf(report, 'en-about')
  assert.deepEqual(menuFindings(about).map((f) => [f.kind, f.trigger, f.side]), [['menu-open-not-measured', 'Search', 'site']])
  assert.match(menuFindings(about)[0].reason, /did not show/)
  // the static fact is still recorded, and covered: the source side is not what fails
  assert.equal(about.menus.sourceStatic[0].covered.page, 'en-team')
  assert.equal(report.summary.stages['light-desktop'], 'fail')
})

test('a source page that runs a script and still does not react is confirmed by a repeat before it is a fact', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const fx = fixture({}, { inertScript: true })
  const srv = await serve(fx.site)
  try {
    const sourceFile = path.join(ROOT, 'inert.html')
    writeFileSync(sourceFile, sourcePage({ inertScript: true }))
    const common = { browser: b, url: `${srv.origin}/about/`, siteOpts: { viewport: { width: 1440, height: 900 } }, sourceOpts: { viewport: { width: 1440, height: 900 } }, pageId: 'p', variantId: 'v', out: fx.root, settle, props: ['font-size'], diffProperty }
    const r = await measureMenus({ ...common, sourceUrl: pathToFileURL(sourceFile).href })
    assert.equal(r.record.sourceStatic.length, 1)
    assert.equal(r.record.sourceStatic[0].scripts, 1)
    assert.equal(r.record.sourceStatic[0].key, 'search')
    assert.deepEqual(r.findings.filter((f) => f.kind === 'menu-open-not-measured'), [])
    // a source that does not load is no static page: it is a measurement that failed
    const gone = await measureMenus({ ...common, sourceUrl: `${srv.origin}/gone/` })
    assert.equal(gone.record.sourceStatic, undefined)
    assert.deepEqual(gone.findings.map((f) => [f.kind, f.side]), [['menu-open-not-measured', 'source']])
    // a source whose trigger cannot be reached by the pointer is not nonresponsive either
    const hidden = path.join(ROOT, 'hidden.html')
    writeFileSync(hidden, sourcePage({ noScript: true }).replace('</body>', '<div style="position:fixed;inset:0;z-index:99"></div></body>'))
    const blocked = await measureMenus({ ...common, sourceUrl: pathToFileURL(hidden).href })
    assert.equal(blocked.record.sourceStatic, undefined, JSON.stringify(blocked.record.sourceStatic))
    assert.ok(blocked.findings.some((f) => f.kind === 'menu-open-not-measured' && f.side === 'source'))
  } finally {
    await srv.close()
    await b.close()
  }
})

test('settleStaticSource: only another page, the same variant, a source that opened, counts; a stale or lost axis does not', () => {
  const fact = () => ({ key: 'search', trigger: 'Search', scripts: 0, toggle: 'button (aria-controls)', outcome: { hover: 'no-effect', click: 'no-effect' }, covered: null })
  const opened = (key = 'search') => ({ key, source: { opened: true, screenshot: 's.png' }, site: { opened: true, screenshot: 't.png' } })
  const axis = (variant, menus) => ({ variant, findings: [], menus })
  const stat = (variant = 'v1') => axis(variant, { measured: true, menus: [{ key: 'search', source: { opened: false, static: true } }], sourceStatic: [fact()] })
  const settle = (list) => {
    settleStaticSource(list)
    return list.map((x) => x.axis.findings.length)
  }
  const A = { id: 'a' }
  const B = { id: 'b' }
  assert.deepEqual(settle([{ page: A, axis: stat() }, { page: B, axis: axis('v1', { measured: true, menus: [opened()] }) }]), [0, 0])
  assert.deepEqual(settle([{ page: A, axis: stat() }, { page: B, axis: axis('v2', { measured: true, menus: [opened()] }) }]), [1, 0], 'another variant')
  assert.deepEqual(settle([{ page: A, axis: stat() }, { page: B, axis: axis('v1', { measured: true, menus: [opened('services')] }) }]), [1, 0], 'another menu')
  assert.deepEqual(settle([{ page: A, axis: stat() }, { page: B, axis: axis('v1', { measured: false, reason: 'x' }) }]), [1, 0], 'not measured')
  assert.deepEqual(settle([{ page: A, axis: stat() }, { page: B, axis: { variant: 'v1', findings: [{ kind: 'axis-error' }] } }]), [1, 1], 'a lost axis')
  assert.deepEqual(settle([{ page: A, axis: stat() }, { page: B, axis: stat() }]), [1, 1], 'static there too')
  assert.deepEqual(settle([{ page: A, axis: stat() }, { page: A, axis: axis('v1', { measured: true, menus: [opened()] }) }]), [1, 0], 'the same page')
  assert.deepEqual(settle([{ page: A, axis: stat() }, { page: B, axis: axis('v1', { measured: true, menus: [{ key: 'search', source: { opened: true, screenshot: null } }] }) }]), [1, 0], 'no picture')
  // idempotent, and re-decided: a reused axis that was covered is a finding when its covering page is gone
  const x = stat()
  settle([{ page: A, axis: x }, { page: B, axis: axis('v1', { measured: true, menus: [opened()] }) }])
  assert.equal(x.menus.sourceStatic[0].covered.page, 'b')
  assert.deepEqual(settle([{ page: A, axis: x }]), [1])
  assert.equal(x.menus.sourceStatic[0].covered, null)
  assert.deepEqual(settle([{ page: A, axis: x }]), [1], 'not doubled')
  // order of the list does not matter
  assert.deepEqual(settle([{ page: B, axis: axis('v1', { measured: true, menus: [opened()] }) }, { page: A, axis: stat() }]), [0, 0])
})
