import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { withBrowser } from '../lib/browser.mjs'
import { analyzeDomSourceFonts } from '../ingest/dom-source-font.mjs'
import { BROWSER_SCHEMA, DOM_STATIC_SCHEMA, gateSourceFonts } from '../ingest/source-font.mjs'
import { measureDomPage, openCollapsedMenu } from '../ingest/source-font-browser.mjs'

test('DOM static evidence records declared families, @font-face sources, loader links, and missing sheets', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dom-fonts-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'css'))
  writeFileSync(join(root, 'index.html'), '<link rel="stylesheet" href="css/site.css"><link rel="stylesheet" href="missing.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Inter:wght@400">')
  writeFileSync(join(root, 'css/site.css'), 'body{font-family:Inter, sans-serif}h1,h2{font-family:Display, serif}nav a{font-family:Inter} @font-face{font-family:Display;src:url(../display.woff2) format("woff2")}')
  const report = await analyzeDomSourceFonts({ pages: [{ file: 'index.html', route: '/' }], root })
  assert.equal(report.schema, DOM_STATIC_SCHEMA)
  assert.equal(report.complete, false)
  assert.match(report.gaps.join('\n'), /missing\.css: stylesheet is missing or unreadable/)
  assert.ok(report.roles.body.some((r) => r.family.includes('Inter')))
  assert.ok(report.roles.h1.some((r) => r.family.includes('Display')))
  assert.ok(report.fontFaces.some((r) => r.family === 'Display' && r.src.includes('../display.woff2')))
  assert.ok(report.loaders.some((r) => r.families.includes('Inter')))
})

test('DOM static analysis resolves relative, remote, and inline @imports through captured URL mappings', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dom-imports-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'css'))
  writeFileSync(join(root, 'index.html'), '<base href="https://source.invalid/css/"><link rel="stylesheet" href="https://source.invalid/css/main.css"><style>@import url("inline.css");</style>')
  writeFileSync(join(root, 'css/main.css'), '@import "imported.css";body{font-family:Inter}')
  writeFileSync(join(root, 'css/imported.css'), 'h1{font-family:Display}')
  writeFileSync(join(root, 'css/inline.css'), 'h2{font-family:Inline}')
  const report = await analyzeDomSourceFonts({
    root, pages: [{ file: 'index.html', route: '/', baseUrl: 'https://source.invalid/' }],
    stylesheetMap: { urls: {
      'https://source.invalid/css/main.css': 'css/main.css',
      'https://source.invalid/css/imported.css': 'css/imported.css',
      'https://source.invalid/css/inline.css': 'css/inline.css'
    }, finalUrls: { 'https://source.invalid/css/main.css': 'https://source.invalid/css/main.css' } }
  })
  assert.ok(report.sheets.includes('css/main.css'))
  assert.ok(report.sheets.includes('css/imported.css'))
  assert.ok(report.sheets.includes('css/inline.css'))
  assert.ok(report.roles.h1.some((r) => r.family.includes('Display')))
  assert.ok(report.roles.h2.some((r) => r.family.includes('Inline')))
  const missing = await analyzeDomSourceFonts({
    root, pages: [{ file: 'index.html', route: '/', baseUrl: 'https://source.invalid/' }],
    stylesheetMap: { urls: { 'https://source.invalid/css/main.css': 'css/main.css' } }
  })
  assert.match(missing.gaps.join('\n'), /https:\/\/source\.invalid\/css\/imported\.css/)
  assert.match(missing.gaps.join('\n'), /https:\/\/source\.invalid\/css\/inline\.css/)
})

test('DOM source font gate rejects absent report and browser evidence, allows a cited waiver, and passes clean evidence', () => {
  const page = (route, width) => ({ route, file: `${route === '/' ? 'home' : 'page'}.html`, width, htmlSha256: `hash-${route}`, referenceUrl: `https://source.invalid/${route === '/' ? 'home' : 'page'}.html` })
  const staticReport = { schema: DOM_STATIC_SCHEMA, complete: true, gaps: [], fingerprint: 'dom-fingerprint', pages: [page('/', 1440), page('/', 390)], roles: {}, fontFaces: [], loaders: [], sheets: [], fonts: [] }
  const role = (requested, drawn, size = '16px') => ({ requested, drawn: [{ name: drawn, glyphs: 20, custom: false }], size, chars: 50, text: 'source text' })
  const browser = (body = role('Arial, sans-serif', 'Arial')) => ({
    schema: BROWSER_SCHEMA, site: 'https://source.invalid', static: { fingerprint: staticReport.fingerprint }, widths: [1440, 390], unresolved: [],
    pages: staticReport.pages.map(({ route, file, width, htmlSha256, referenceUrl }) => ({ route, file, width, htmlSha256, url: referenceUrl, finalUrl: referenceUrl, status: 200, roles: { body, h1: role('Arial', 'Arial', '30px'), h2: role('Arial', 'Arial', '28px'), h3: role('Arial', 'Arial', '24px'), nav: role('Arial', 'Arial', '14px') }, absent: [], faces: [], failedRequests: [] }))
  })
  assert.ok(gateSourceFonts({ staticReport: null, browser: null, expectedSite: 'https://source.invalid' }).problems.length)
  const noBrowser = gateSourceFonts({ staticReport, browser: null, expectedSite: 'https://source.invalid' })
  assert.ok(noBrowser.problems.some((p) => /DOM browser evidence is missing/.test(p)))
  const finding = gateSourceFonts({ staticReport, browser: browser(role('serif', 'Times New Roman')), expectedSite: 'https://source.invalid' })
  assert.equal(finding.ok, false)
  const keys = finding.findings.map((f) => f.key)
  const waived = gateSourceFonts({ staticReport, browser: browser(role('serif', 'Times New Roman')), expectedSite: 'https://source.invalid', decisionsText: `- D-1 ${keys.join(' and ')} accepted by the owner.` })
  assert.equal(waived.ok, true, waived.problems.join('\n'))
  assert.equal(waived.waived.length, 2)
  assert.equal(gateSourceFonts({ staticReport, browser: browser(), expectedSite: 'https://source.invalid' }).ok, true)
  const foreign = browser()
  foreign.pages[0].url = 'https://foreign.invalid/home.html'
  foreign.pages[0].finalUrl = foreign.pages[0].url
  assert.ok(gateSourceFonts({ staticReport, browser: foreign, expectedSite: 'https://source.invalid' }).problems.some((p) => /not the bound reference page/.test(p)))
  const stale = browser()
  stale.pages[0].htmlSha256 = 'stale-html'
  assert.ok(gateSourceFonts({ staticReport, browser: stale, expectedSite: 'https://source.invalid' }).problems.some((p) => /HTML digest/.test(p)))
  const missing = browser()
  missing.pages.pop()
  assert.ok(gateSourceFonts({ staticReport, browser: missing, expectedSite: 'https://source.invalid' }).problems.some((p) => /required reference page/.test(p)))
})

test('DOM render probe opens a collapsed mobile menu through the shared source-font menu interaction', async () => {
  await withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
    await page.setContent('<header><button aria-expanded="false" onclick="document.body.dataset.clicked=\'search\'">Search</button><button class="navbar-toggler" aria-controls="main-nav" aria-expanded="false" onclick="document.querySelector(\'nav\').style.display=\'block\';document.body.dataset.clicked=\'menu\'">Menu</button><nav id="main-nav" style="display:none"><a href="/about">About</a></nav></header><main><h1>Title</h1><p>Source paragraph text.</p></main>')
    const measured = await measureDomPage(page, { file: 'index.html', route: '/', url: 'http://127.0.0.1/index.html', width: 390 })
    assert.ok(measured.roles.nav, 'the revealed navigation link is measured')
    assert.equal(await page.locator('body').getAttribute('data-clicked'), 'menu', 'the menu toggle wins over an earlier Search button')
    await page.close()
  })
})

test('Joomla mobile probe retains its original toggle selectors and clicks the menu after Search', async () => {
  await withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
    await page.setContent('<header><button aria-expanded="false" onclick="document.body.dataset.clicked=\'search\'">Search</button><button class="navbar-toggler" aria-controls="menu" aria-expanded="false" onclick="document.querySelector(\'nav\').style.display=\'block\';document.body.dataset.clicked=\'menu\'">Menu</button><nav id="menu" class="t3-megamenu" style="display:none"><a href="/about">About</a></nav></header><main><p>Body copy long enough to be a source text sample for typography measurement.</p></main>')
    const marks = await openCollapsedMenu(page, 390, { _navPresent: true })
    assert.ok(marks.nav, 'the Joomla navigation is revealed')
    assert.equal(await page.locator('body').getAttribute('data-clicked'), 'menu')
    await page.close()
  })
})
