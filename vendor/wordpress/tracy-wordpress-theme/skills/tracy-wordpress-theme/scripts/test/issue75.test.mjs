// #75 (Nova → WP7 port): the items of the issue that live in the visual, review and contract tools.
// One test per item; the items that need a browser are in visual-fixes.integration.test.mjs.
//   S-13/S-43 redirect routes are not sample pages · S-14 = issue70.test.mjs · S-16 = issue69.test.mjs
//   S-17 default serif · S-19 unpaired synthetic page · S-37 short pages · S-44 font-CSS services
//   S-49 axis-scoped exceptions
// Reported gaps (no fixture, see the handoff): S-15, S-21, S-27, S-28; #69 `demo.disclosure` (written by
// scripts/ingest/from-joomla.mjs — for the fix/adapter branch, outside this branch's scope).
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildContract, parityFromPatterns, resolvePatternFiles, validateContract } from '../visual/contract.mjs'
import { checkManualPages, LOCK_FILE, LOCK_SCHEMA, lockDigest, lockedSource, pageList, requirementsOf, selectSample, stableJson, variedBodies, verifyRun } from '../visual/preflight.mjs'
import { accept, diffProperty, examinedTooFew, EXAMINED_FLOOR, runIntrinsic } from '../visual/visual-qa.mjs'
import { exitCodeOf, writeRun } from '../visual/report.mjs'
import { VOLATILE_STYLESHEET_HOSTS, volatileStylesheet } from '../visual/source-identity.mjs'
import { classify, INTRINSIC_WIDTHS } from '../visual/intrinsic-mobile.mjs'
import { payloadFindings } from '../quickstart/release.mjs'
import { testDir } from './lib/test-root.mjs'
// the page-hash / Fast Gate verdict / CLI-argument fixtures run with this file's check
import './visual-page-hash.test.mjs'
import './visual-fast-gate.test.mjs'

// ── S-19: a synthetic page with no source pair is reported ────────────────────────────────────────

const pageMap = {
  source: { kind: 'joomla' },
  theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } },
  pages: [
    { file: 'index.html', view: 'front-page', title: 'Home', path: '/' },
    { file: '404.html', view: '404', title: 'Not found', path: '/404', synthetic: true },
    { file: 'x.html', view: 'category', title: 'News', path: '/news', synthetic: true }
  ]
}
const reviewConfig = { containers: { none: 'fixture' }, hook: { type: 'attribute', name: 'data-theme' }, templates: { '/': 'front-page', '/404': '404', '/nope': '404' } }
const themeTemplates = new Set(Object.values(reviewConfig.templates))
const reference = { kind: 'url', pages: [{ page: 'index.html', url: 'http://gone.test/home' }] }
const build = (pairs) => buildContract({ pageMap, reference, reviewConfig, themeTemplates, specHash: 'sha256:abc', id: 'nova', pairs })

test('pattern coverage: a type with no pattern slug, or a declared field with no named block, is unresolved — never silently skipped', () => {
  const dir = testDir('issue75-pattern-coverage')
  const theme = path.join(dir, 'theme')
  mkdirSync(path.join(theme, 'patterns'), { recursive: true })
  writeFileSync(path.join(theme, 'patterns', 'acm-hero.php'), '<?php\n/**\n * Slug: tracy/section-hero\n */\n?>\n<!-- wp:heading {"metadata":{"name":"hero.heading"},"className":"h-title"} -->')
  const types = { hero: { pattern: 'tracy/section-hero', root: '.h', fields: { heading: { path: 'hero.heading' }, intro: { path: 'hero.intro' } } }, nopattern: { fields: {} } }
  const found = resolvePatternFiles(theme, { types })
  assert.deepEqual(found.missing, ['nopattern (the map declares no "pattern" slug)'])
  const unresolved = []
  const pairs = parityFromPatterns({ types }, found.files, unresolved)
  assert.deepEqual(pairs.map((p) => p.key), ['hero.heading'])
  assert.equal(unresolved.length, 2)
  assert.match(unresolved[0], /^hero\.intro /)
  assert.match(unresolved[1], /^nopattern \(no registered pattern file\)/)
  // and both reach the contract, which then refuses to validate
  const c = buildContract({ pageMap: { ...pageMap, pages: pageMap.pages.slice(0, 1) }, reference, reviewConfig, themeTemplates, specHash: 'sha256:abc', id: 'nova', patternsMap: { types }, patternFiles: found.files, unresolvedPatterns: found.missing })
  assert.equal(c.unresolvedPatterns.length, 2)
  assert.ok(validateContract(c).some((e) => /pattern coverage is incomplete: hero\.intro/.test(e)))
})

test('pattern coverage: every declared type owes a measurement — none measurable, or no file handed in, is unresolved and blocks the contract', () => {
  const php = '<!-- wp:heading {"metadata":{"name":"hero.heading"},"className":"h-title"} -->'
  const one = { pageMap: { ...pageMap, pages: pageMap.pages.slice(0, 1) }, reference, reviewConfig, themeTemplates, specHash: 'sha256:abc', id: 'nova' }
  const gaps = (types, patternFiles) => {
    const c = buildContract({ ...one, patternsMap: { types }, patternFiles })
    assert.ok(validateContract(c).some((e) => /pattern coverage is incomplete/.test(e)), JSON.stringify(c.unresolvedPatterns))
    return c.unresolvedPatterns
  }
  // registered, but the map declares no field / only a level attribute: zero pairs
  assert.deepEqual(gaps({ hero: { pattern: 'tracy/section-hero', fields: {} } }, { hero: php }), ['hero (declares no measurable field)'])
  assert.deepEqual(gaps({ hero: { pattern: 'tracy/section-hero', fields: { l: { path: 'hero.level', attr: 'level' } } } }, { hero: php }), ['hero (declares no measurable field)'])
  // built directly with the type's file missing: not omitted
  assert.deepEqual(gaps({ hero: { pattern: 'tracy/section-hero', fields: { heading: { path: 'hero.heading' } } } }, {}), ['hero (no registered pattern file)'])
  // one gap per type when the resolver has already named it
  const c = buildContract({ ...one, patternsMap: { types: { hero: { pattern: 'x/y', fields: { a: { path: 'hero.a' } } } } }, patternFiles: {}, unresolvedPatterns: ['hero (x/y)'] })
  assert.deepEqual(c.unresolvedPatterns, ['hero (x/y)'])
  // the covered case stays valid of this check
  const ok = buildContract({ ...one, patternsMap: { types: { hero: { pattern: 'tracy/section-hero', root: '.h', fields: { heading: { path: 'hero.heading' } } } } }, patternFiles: { hero: php } })
  assert.equal(ok.unresolvedPatterns, undefined)
})

test('S-19: a synthetic 404 with no pair is listed as not measured, never counted as a page; a pair for it brings it in', () => {
  const c = build(null)
  assert.deepEqual(c.pages.map((p) => p.id), ['en-home'])
  assert.deepEqual(c.unpairedSynthetic.map((u) => [u.path, u.view]), [['/404', '404'], ['/news', 'category']])
  assert.match(c.unpairedSynthetic[0].reason, /no source pair — not measured/)
  assert.ok(validateContract(c).some((e) => /unpaired synthetic page \/404/.test(e)), 'an unpaired page blocks the contract')
  assert.ok(validateContract({ ...c, unpairedSynthetic: undefined, unresolvedPatterns: ['hero (tracy/section-hero)'] }).some((e) => /pattern coverage is incomplete: hero/.test(e)))
  // pairs that name the 404 (a status-404 rule) measure it; only the category stays reported
  const paired = build([{ from: '/index.php/', to: '/' }, { from: '/index.php/nope', to: '/nope', status: 404 }])
  assert.deepEqual(paired.pages.map((p) => p.id).sort(), ['en-404', 'en-home'])
  assert.deepEqual(paired.unpairedSynthetic.map((u) => u.path), ['/news'])
  // nothing synthetic left unpaired: no field at all
  const all = buildContract({ pageMap: { ...pageMap, pages: pageMap.pages.slice(0, 1) }, reference, reviewConfig, themeTemplates, specHash: 'sha256:abc', id: 'nova' })
  assert.equal('unpairedSynthetic' in all, false)
})

// ── S-13 / S-43: a route declared 3xx is a redirect, not a page to sample ─────────────────────────

const routes = { pages: [{ path: '/', view: 'front-page' }, { path: '/about/', view: 'page' }, { path: '/user-profile', view: 'page', status: 303 }, { path: '/account', view: 'account', status: 303 }, { path: '/missing/', view: '404', synthetic: true }] }

test('S-43: a declared 303 is never sampled, is named in the inventory, and a layout only it stands for is uncovered', () => {
  const { sample, coverage } = selectSample(routes)
  assert.deepEqual(sample.map((s) => s.path).sort(), ['/', '/about/', '/missing/'].sort())
  assert.ok(sample.every((s) => s.role !== 'redirect'))
  const byId = Object.fromEntries(coverage.capabilities.map((c) => [c.id, c]))
  assert.equal(byId['redirect:/user-profile'].state, 'not-applicable')
  assert.match(byId['redirect:/user-profile'].reason, /declared 303: a redirect is the route's answer/)
  assert.equal(byId['redirect:/account'].state, 'not-applicable')
  assert.equal(byId['layout:account'], undefined, 'no page of the view can be read: it is not a requirement a sample could cover')
  assert.equal(byId['layout:page'].state, 'covered')
  assert.notEqual(byId['layout:page'].page, '/user-profile')
  // the same list with the redirect as the only page of a contract layout: uncovered, named
  const contract = { pages: [{ id: 'en-home', pagemapPath: '/', path: '/', layout: 'front-page' }, { id: 'en-acc', pagemapPath: '/account', path: '/account', layout: 'account' }], layouts: [{ id: 'front-page', pages: ['en-home'], representative: 'en-home' }, { id: 'account', pages: ['en-acc'], representative: 'en-acc' }], design: { containers: { none: 'x' } } }
  const withContract = selectSample(routes, { contract })
  const acc = withContract.coverage.capabilities.find((c) => c.id === 'layout:account')
  assert.equal(acc.state, 'uncovered')
  assert.match(acc.reason, /no page of the page-map can show it/)
  // a 4xx/5xx is still the error page, a plain 200 still content
  assert.equal(selectSample({ pages: [{ path: '/', view: 'front-page' }, { path: '/gone', status: 410 }] }).sample.find((s) => s.path === '/gone').role, 'error')
  const only = () => requirementsOf({ list: pageList({ pages: [{ path: '/x', status: 302 }] }) })
  assert.doesNotThrow(only)
  assert.throws(() => selectSample({ pages: [{ path: '/x', status: 302 }] }), /no page that answers 200/)
})

test('S-43: --pages refuses a declared redirect and still needs a content page', () => {
  const list = pageList(routes)
  assert.throws(() => checkManualPages(list, ['/', '/user-profile']), /--pages \/user-profile: declared 303/)
  assert.throws(() => checkManualPages(list, ['/missing/']), /no content page/)
  assert.deepEqual(checkManualPages(list, ['/about/', '/missing/']).map((e) => e.path), ['/about/', '/missing/'])
})

// ── S-17: the default serif, before and after a full-page capture ─────────────────────────────────

test('S-17: `Times` and `"Times New Roman"` are one default face; a named different family is still a finding', () => {
  assert.equal(diffProperty('font-family', 'Times', '"Times New Roman"'), null)
  assert.equal(diffProperty('font-family', '"Times New Roman"', 'Times'), null)
  assert.equal(diffProperty('font-family', 'Times', 'Times'), null)
  assert.deepEqual(diffProperty('font-family', 'Times', 'Georgia, serif'), { property: 'font-family', expected: 'Times', observed: 'Georgia, serif' })
  assert.notEqual(diffProperty('font-family', '"Times New Roman"', 'Arial'), null)
  assert.notEqual(diffProperty('font-family', 'Inter', '"Times New Roman"'), null)
})

// ── S-37: a short page that rendered fully ────────────────────────────────────────────────────────

test('S-37: too few is relative to the source census; without a source reading the floor holds', () => {
  assert.equal(EXAMINED_FLOOR, 20)
  // the contact page: 11 elements examined, the source has 14 content elements → fine
  assert.equal(examinedTooFew(11, 14), false)
  assert.equal(examinedTooFew(7, 14), false, 'half of 14')
  assert.equal(examinedTooFew(6, 14), true, 'below half of the source: rendered too little')
  assert.equal(examinedTooFew(11, 300), true, 'a long source page is not matched by 11 elements')
  assert.equal(examinedTooFew(19, 300), true)
  assert.equal(examinedTooFew(20, 300), true, 'the floor of 20 is no escape when the source census is large')
  assert.equal(examinedTooFew(150, 300), false)
  // no source reading: the absolute floor as before
  assert.equal(examinedTooFew(11), true)
  assert.equal(examinedTooFew(11, null), true, 'an unread source uses the absolute floor')
  assert.equal(examinedTooFew(11, 0), false, 'a read source with an empty census has a source floor of zero')
  assert.equal(examinedTooFew(0, 14), true, 'nothing examined is always too few')
})

// ── S-49: an exception scoped to one axis ────────────────────────────────────────────────────────

test('S-49: an axis-scoped exception matches that axis only; an unscoped one matches every axis; no axis given behaves as before', () => {
  const finding = { kind: 'menu-open-parity', element: 'nav › picture', deltas: [{ property: 'color', expected: 'a', observed: 'b' }] }
  const page = { id: 'en-home' }
  const scoped = { design: { exceptions: [{ kind: 'menu-open-parity', match: '"axis":"mobile-dark".*picture', reason: 'drawer colour', decision: 'DECISIONS.md D-1' }] } }
  assert.ok(accept(scoped, finding, page, 'mobile-dark'))
  assert.equal(accept(scoped, finding, page, 'mobile-light'), null)
  assert.equal(accept(scoped, finding, page, 'desktop-dark'), null)
  assert.equal(accept(scoped, finding, page), null, 'without an axis the axis-scoped exception does not match')
  const unscoped = { design: { exceptions: [{ kind: 'menu-open-parity', match: 'picture', reason: 'r', decision: 'D' }] } }
  for (const axis of ['mobile-dark', 'mobile-light', null]) assert.ok(accept(unscoped, finding, page, axis))
  // page and axis together
  const both = { design: { exceptions: [{ kind: 'menu-open-parity', match: '"page":"en-home","axis":"mobile-dark"', reason: 'r', decision: 'D' }] } }
  assert.ok(accept(both, finding, page, 'mobile-dark'))
  assert.equal(accept(both, finding, { id: 'en-about' }, 'mobile-dark'), null)
  // a finding that carries its own axis is not overridden by the argument
  assert.ok(accept({ design: { exceptions: [{ kind: 'k', match: '"axis":"x"', reason: 'r', decision: 'D' }] } }, { kind: 'k', axis: 'x' }, page, 'y'))
  // no decision, no exception; an unmeasured kind is never accepted
  assert.equal(accept({ design: { exceptions: [{ kind: 'menu-open-parity', match: '.', reason: 'r' }] } }, finding, page, 'mobile-dark'), null)
  assert.equal(accept({ design: { exceptions: [{ kind: 'menu-open-not-measured', match: '.', reason: 'r', decision: 'D' }] } }, { kind: 'menu-open-not-measured' }, page, 'mobile-dark'), null)
})

test('S-49 at release: an accepted entry is cited under the axis it was accepted on, not under every axis', () => {
  const finding = { kind: 'menu-open-parity', element: 'nav › picture', deltas: [] }
  const contract = { design: { exceptions: [{ kind: 'menu-open-parity', match: '"axis":"mobile-dark".*picture', reason: 'drawer colour', decision: 'DECISIONS.md D-1' }] } }
  const entry = { ...finding, exception: { reason: 'drawer colour', decision: 'DECISIONS.md D-1' } }
  const report = (variant) => ({ pages: [{ id: 'en-home', axes: [{ variant, findings: [], accepted: [entry] }] }] })
  assert.deepEqual(payloadFindings(report('mobile-dark'), contract).uncited, [])
  assert.equal(payloadFindings(report('mobile-light'), contract).uncited.length, 1, 'the same entry on another axis is not accepted')
})

// ── S-44: the CSS of a font service ──────────────────────────────────────────────────────────────

const G = 'https://fonts.googleapis.com/css2?family=Golos+Text'
test('S-44: font-CSS services are recorded and not compared; any other stylesheet still is; the file list is exact', () => {
  assert.deepEqual([...VOLATILE_STYLESHEET_HOSTS], ['fonts.googleapis.com', 'fonts.googleapis.cn', 'fonts.bunny.net', 'use.typekit.net'])
  assert.equal(volatileStylesheet(G), true)
  assert.equal(volatileStylesheet('https://fonts.gstatic.com/s/golos.woff2'), false, 'the font FILE stays sealed and compared')
  assert.equal(volatileStylesheet('https://evil.fonts.googleapis.com.example/x.css'), false)
  assert.equal(volatileStylesheet('https://cdn.example/site.css'), false)
  assert.equal(volatileStylesheet('not a url'), false)
  const entry = (side, type, url, sha256s, statuses = [200]) => ({ side, type, url, sha256s, statuses })
  assert.deepEqual(variedBodies([entry('source', 'stylesheet', G, ['sha256:a', 'sha256:b'])]), [], 'Google CSS varies per load')
  assert.match(variedBodies([entry('source', 'stylesheet', 'https://cdn.example/site.css', ['sha256:a', 'sha256:b'])]).join(), /2 different bodies/)
  assert.match(variedBodies([entry('source', 'font', 'https://fonts.gstatic.com/a.woff2', ['sha256:a', 'sha256:b'])]).join(), /different bodies/)
  assert.match(variedBodies([entry('source', 'stylesheet', G, ['sha256:a'], [200, 500])]).join(), /answered 200 and 500/, 'a status change is still a change')
  // identities decide over raw digests when both are there
  assert.deepEqual(variedBodies([{ ...entry('source', 'document', 'http://s/', ['sha256:a', 'sha256:b']), identities: [{ policy: 'joomla-csrf-v1', sha256: 'sha256:x' }] }]), [])
})

test('S-44: verify skips the recorded font-CSS and still compares the first-party stylesheet', () => {
  const dir = testDir('issue75-fonts')
  const out = path.join(dir, 'run')
  mkdirSync(out)
  const doc = { url: 'http://s/', sha256s: ['sha256:d'], statuses: [200] }
  const css = { url: 'http://s/site.css', sha256s: ['sha256:c'], statuses: [200] }
  const lock = { schema: LOCK_SCHEMA, complete: true, epoch: { fingerprint: 'fp', sequence: 1 }, artifacts: {}, unresolved: [], source: { documents: [doc], stylesheets: [css, { url: G, sha256s: ['sha256:g'], statuses: [200] }] }, fonts: { files: [{ side: 'source', url: 'http://f/golos.woff2', sha256s: ['sha256:f'], statuses: [200], bytes: 9 }, { side: 'site', url: 'http://t/x.woff2', sha256s: ['sha256:x'], bytes: 9 }] } }
  lock.digest = lockDigest(lock)
  writeFileSync(path.join(out, LOCK_FILE), stableJson(lock))
  assert.deepEqual(lockedSource(lock).map((r) => r.url), ['http://s/', 'http://s/site.css'])
  const now = { 'http://s/': { sha256: 'sha256:d', status: 200 }, 'http://s/site.css': { sha256: 'sha256:c', status: 200 }, 'http://f/golos.woff2': { sha256: 'sha256:f', status: 200 } }
  const src = (n) => verifyRun(out, { fingerprint: 'fp', sourceNow: n }).reasons.filter((r) => r.startsWith('source '))
  assert.deepEqual(src(now), [], 'Google CSS not read again: not a reason')
  assert.match(src({ ...now, 'http://s/site.css': { sha256: 'sha256:other', status: 200 } }).join(), /site\.css: serves other bytes/)
  assert.match(src({ ...now, [G]: { sha256: 'sha256:other', status: 200 } }).join(), /^$/, 'a changed Google CSS is not compared')
  assert.match(src({ ...now, 'http://f/golos.woff2': { sha256: 'sha256:other', status: 200 } }).join(), /font http:\/\/f\/golos\.woff2: serves other bytes/, 'the font file that replaces the CSS is compared')
  assert.match(src({ ...now, 'http://f/golos.woff2': { sha256: 'sha256:f', status: 404 } }).join(), /font http:\/\/f\/golos\.woff2: answers 404 now, the lock recorded 200/, 'same bytes, other status: a reason')
  const { 'http://f/golos.woff2': _gone, ...noFont } = now
  assert.match(src(noFont).join(), /golos\.woff2: not read again/, 'a font file not read again is a reason, never a pass')
})

// ── #65: classing of intrinsic mobile defects ────────────────────────────────────────────────────

test('#65 classify: shared defect, site-only defect, worse-than-source, and a defect the port fixed', () => {
  assert.deepEqual(INTRINSIC_WIDTHS, [320, 360, 375, 390, 414])
  const wrap = (lines) => ({ kind: 'control-wrap', label: 'Contact Us', selector: 'a.cta', lines })
  assert.equal(classify([wrap(2)], [wrap(2)])[0].class, 'shared-source-defect')
  assert.equal(classify([wrap(4)], [wrap(2)])[0].class, 'site-only', '2 lines on the source, 4 on the site (JA Vega, 320)')
  assert.equal(classify([wrap(2)], [])[0].class, 'site-only')
  assert.equal(classify([], [wrap(2)])[0].class, 'source-fixed')
  assert.equal(classify([{ kind: 'page-overflow', label: '', over: 40 }], [{ kind: 'page-overflow', label: '', over: 10 }])[0].class, 'site-only')
})

test('#65 in the run: a site-only defect, an unreadable route or a failed probe blocks and is written down; a shared defect and a probe not asked for do not', async () => {
  const base = { status: 'run', file: 'intrinsic.json', widths: [320], routes: 1, measured: 1, siteOnly: 0, shared: 0, sourceFixed: 0, errors: 0 }
  const go = (intrinsic) => {
    const out = testDir('issue65-run')
    const report = writeRun({ out, site: 'http://x', contractFile: 'c.json', identity: { capturedAt: '2026-09-30T00:00:00.000Z' }, stageReports: [], pages: [], stageOf: () => 'light-desktop', method: 'test', intrinsic })
    return { report, machine: JSON.parse(readFileSync(path.join(out, 'notes', 'machine.json'), 'utf8')), md: readFileSync(path.join(out, 'VISUAL.md'), 'utf8') }
  }
  const bad = go({ ...base, siteOnly: 1, rows: [{ kind: 'control-wrap', class: 'site-only', route: '/about/', width: 320, label: 'Contact Us', selector: 'a.cta', lines: 4, source: { lines: 2 } }], errorRows: [] })
  assert.equal(bad.report.summary.findings, 0, 'no parity finding: the run would have exited 0 before')
  assert.equal(bad.report.summary.intrinsic.blocking, 1)
  assert.equal(exitCodeOf(bad.report.summary), 1)
  assert.ok(!('rows' in bad.report.intrinsic), 'visual.json keeps the counts; rows are in intrinsic.json and the machine notes')
  assert.ok(bad.machine.some((m) => m.lens === 'machine:intrinsic-control-wrap' && m.page === '/about/' && m.axis === '320px'), JSON.stringify(bad.machine))
  assert.match(bad.md, /Intrinsic mobile probe.*site-only 1.*blocks the run/)
  const unread = go({ ...base, errors: 1, rows: [], errorRows: [{ route: '/about/', width: 320, error: 'timeout' }] })
  assert.equal(exitCodeOf(unread.report.summary), 1)
  assert.ok(unread.machine.some((m) => m.lens === 'machine:intrinsic-probe' && /timeout/.test(m.what)))
  const failed = go({ status: 'failed', reason: 'the probe failed: boom' })
  assert.equal(exitCodeOf(failed.report.summary), 1)
  assert.ok(failed.machine.some((m) => m.lens === 'machine:intrinsic-probe'))
  // a probe that did not run (no page-map) is a missing required probe: it blocks the run and is written down
  const notRun = go({ status: 'not-run', reason: 'needs --spec (its page-map.json)' })
  assert.equal(exitCodeOf(notRun.report.summary), 1)
  assert.ok(notRun.machine.some((m) => m.lens === 'machine:intrinsic-probe' && /not-run/.test(m.what)))
  for (const ok of [{ ...base, shared: 3, rows: [], errorRows: [] }, null]) assert.equal(exitCodeOf(go(ok).report.summary), 0, JSON.stringify(ok))
  // the runner: no spec or source is not-run; a page-map it cannot read is `failed`, never a clean run
  assert.equal((await runIntrinsic({ site: 'http://x', out: testDir('i65') })).status, 'not-run')
  assert.equal((await runIntrinsic({ site: 'http://x', sourceSite: 'http://y', spec: testDir('i65-spec'), out: testDir('i65') })).status, 'failed')
})
