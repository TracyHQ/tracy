// Pages and menu items of the plan missing on the built site, and demo leftovers the plan does not have (#601).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pages } from './fixtures/built-site-check/florist.mjs'
import { kindsOf, reportOf } from './fixtures/built-site-check/report-of.mjs'

test('near miss: every plan page and main menu item is found, by address, through index.php and a trailing slash', async () => {
  const files = pages()
  delete files['demo-classes.html']
  files['index.html'] = files['index.html'].replace('<li><a href="/demo-classes">Boxing classes</a></li>', '')
  const report = await reportOf({ files })
  assert.equal(report.checks.pages.status, 'ran')
  assert.deepEqual(report.checks.pages.findings, [])
})

test('a plan page missing on the site and its menu items are reported, the other menu with its name', async () => {
  const files = pages()
  delete files['visit-us.html']
  for (const name of Object.keys(files))
    files[name] = files[name]
      .replaceAll('/index.php/visit-us', '/visit-us-old')
      .replaceAll('"/visit-us"', '"/x"')
  const report = await reportOf({ files })
  const found = report.checks.pages.findings.filter((f) => f.page === 'contact')
  assert.deepEqual(
    found.map((f) => [f.kind, f.place.menu ?? null, f.place.path]),
    [
      ['plan_page_missing', null, '/visit-us'],
      ['plan_menu_item_missing', 'main', '/visit-us'],
      ['plan_menu_item_missing', 'footermenu', '/visit-us']
    ]
  )
  assert.equal(found[0].place.pageType, 'contact')
  assert.equal(found[0].status, null, 'a folder has no such page at all')
})

test('a page answering an error status is a missing plan page with its status', async () => {
  const site = await import('../built-site-check/check-pages.mjs')
  const res = site.checkPages({
    expected: [{ page: 'home', pageType: 'home', alias: 'home', path: '/' }],
    pages: [{ path: '/', status: 500, abs: 'http://florist.test/', links: [] }],
    base: new URL('http://florist.test/')
  })
  assert.deepEqual(
    res.findings.map((f) => [f.kind, f.status ?? null]),
    [
      ['plan_page_missing', 500],
      ['plan_menu_item_missing', null]
    ]
  )
})

test('demo leftovers: a page and a menu item the plan does not have are reported apart', async () => {
  const report = await reportOf()
  assert.deepEqual(kindsOf(report, 'pages'), ['site_page_not_in_plan', 'site_menu_item_not_in_plan'])
  const item = report.checks.pages.findings[1]
  assert.deepEqual([item.page, item.place.path, item.excerpt], ['/', '/demo-classes', 'Boxing classes'])
})

test('an empty page is read, holds no links, and is not a missing page', async () => {
  const files = pages()
  files['visit-us.html'] = ''
  const report = await reportOf({ files })
  assert.ok(!report.checks.pages.findings.some((f) => f.kind === 'plan_page_missing'))
})

test('the pages check cannot run without the plan', async () => {
  const report = await reportOf({ approval: null })
  assert.equal(report.checks.pages.status, 'not_run')
  assert.match(report.checks.pages.reason, /^plan_missing/)
  assert.equal(report.counts.pages, null)
})

test('without a write result the aliases are made from the page names as the write makes them', async () => {
  const report = await reportOf({ write: null })
  assert.deepEqual(
    report.checks.pages.findings.filter((f) => f.kind.startsWith('plan_')),
    []
  )
})
