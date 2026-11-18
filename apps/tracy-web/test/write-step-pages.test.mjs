// A page the plan asks to create (TracyHQ/tracy#375): the write step makes it through the plugin door first, then points links at
// it, and a rerun does not make it twice. A fake site door answers as the plugin does; every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBackGroup } from '../src/site-check/read-back.js'
import { LINK, pagesKit, pagesPlan, pagesSite, runOn } from './_write-step-pages.mjs'
import { copy } from './_write-step-run.mjs'

const BODY = copy()
  .pages.find((p) => p.page === 'legal:privacy')
  .body.map((t) => `<p>${t}</p>`)
  .join('\n')

test('a page to create with no words in the copy is not created and said once on step 6; the rest is written', async () => {
  const site = pagesSite()
  const bare = copy()
  bare.pages = bare.pages.filter((p) => p.page !== 'legal:privacy')
  const { report } = await runOn(site, { over: { copy: bare } })
  assert.equal(report.status, 'done')
  const item = report.unaddressable.find((u) => u.slot === 'legal:privacy')
  assert.equal(item.step, 6)
  assert.match(item.reason, /holds no words/)
  assert.deepEqual(site.rows('article'), [])
  assert.ok(site.calls.some((c) => c.action === 'content.contract' && c.params.operation === 'apply'))
})

test('a page is created first, with the words of the copy, and a menu link is pointed at it', async () => {
  const site = pagesSite()
  const { report, line } = await runOn(site)
  assert.equal(report.status, 'done')
  const [category] = site.rows('category')
  const [article] = site.rows('article')
  const item = site.rows('menuItem').find((r) => r.note)
  assert.deepEqual(
    [article.title, article.introtext, article.alias, article.state, article.catid, article.note],
    ['Privacy policy', BODY, 'privacy-policy', 1, category.id, 'tracy-page:legal:privacy']
  )
  assert.deepEqual(
    [item.link, item.type, item.alias, item.note],
    [
      `index.php?option=com_content&view=article&id=${article.id}`,
      'component',
      'privacy-policy',
      'tracy-page:legal:privacy'
    ]
  )
  // Before any other write: the link stage needs its address.
  const firstWrite = site.calls.find(
    (c) => !['info', 'content.list', 'content.get'].includes(c.action) && c.params.operation !== 'inspect'
  )
  assert.equal(firstWrite.action, 'content.batch')
  assert.equal(site.records.get('menuItem-40').link, `index.php?Itemid=${item.id}`)
  assert.deepEqual([line(LINK).status, line(LINK).ordered], ['written', `index.php?Itemid=${item.id}`])
  assert.deepEqual([line('legal:privacy').status, line('legal:privacy').ordered], ['written', BODY])
  assert.equal(line('legal:privacy:heading').ordered, 'Privacy policy')
  assert.equal(line('legal:privacy:title').ordered, 'Privacy policy of Quay Fitness Studio')
  assert.equal(line('legal:privacy:title').status, 'written')
  assert.equal(line('legal:privacy:description').status, 'written')
  assert.deepEqual(report.keptPages.at(-1), { id: 'legal:privacy', path: '/privacy-policy' })
})

const writesOf = (site) =>
  site.calls.filter(
    (c) => !['info', 'content.list', 'content.get'].includes(c.action) && c.params.operation !== 'inspect'
  )
const pageWrites = (site) =>
  writesOf(site).filter(
    (c) =>
      c.action === 'content.batch' ||
      (c.action === 'content.update' && String(c.params.apply_id).startsWith('page-'))
  )
const reset = (site) => {
  site.calls.length = 0
}
const countRows = (site) => [
  site.rows('category').length,
  site.rows('article').length,
  site.rows('menuItem').length
]

test('a rerun with the last report asks the site nothing about the page, and every line stands', async () => {
  const site = pagesSite()
  const first = await runOn(site)
  const rows = countRows(site)
  reset(site)
  const again = await runOn(site, { last: first.report })
  assert.equal(again.report.status, 'done')
  assert.deepEqual(pageWrites(site), [])
  assert.deepEqual(
    site.calls.filter((c) => c.action === 'content.get' && c.params.kind === 'article'),
    []
  )
  assert.deepEqual(countRows(site), rows)
  for (const slot of [
    'legal:privacy',
    'legal:privacy:heading',
    'legal:privacy:address',
    'legal:privacy:title'
  ])
    assert.deepEqual([again.line(slot).status, again.line(slot).unchanged], ['written', true], slot)
  assert.equal(again.line(LINK).ordered, first.line(LINK).ordered)
  assert.deepEqual(again.report.keptPages.at(-1), { id: 'legal:privacy', path: '/privacy-policy' })
})

test('a rerun that lost its report finds its own rows on the site and writes nothing', async () => {
  const site = pagesSite()
  await runOn(site)
  const rows = countRows(site)
  reset(site)
  const again = await runOn(site)
  assert.deepEqual(pageWrites(site), [])
  assert.deepEqual(countRows(site), rows)
  assert.equal(again.line('legal:privacy').status, 'written')
})

test('changed words correct the rows the page already has', async () => {
  const site = pagesSite()
  const first = await runOn(site)
  const rows = countRows(site)
  const changed = copy()
  changed.pages.find((p) => p.page === 'legal:privacy').body = ['Fresh invented words & more.']
  reset(site)
  const again = await runOn(site, { over: { copy: changed }, last: first.report })
  assert.deepEqual(countRows(site), rows)
  assert.equal(site.batches().length, 0)
  const [article] = site.rows('article')
  assert.equal(article.introtext, '<p>Fresh invented words &amp; more.</p>')
  assert.deepEqual(
    pageWrites(site).map((c) => [c.params.kind, Object.keys(c.params.fields)]),
    [['article', ['introtext']]]
  )
  assert.equal(again.line('legal:privacy').unchanged, undefined)
  assert.equal(again.line('legal:privacy:heading').unchanged, true)
})

test('a run that stopped between the rows finishes the page and does not start another', async () => {
  const site = pagesSite({
    refuseBatch: (kind) =>
      kind === 'menuItem' && !site.allowMenu
        ? { ok: false, error: 'batch_failed', message: 'Another menu item has the same alias' }
        : null
  })
  const first = await runOn(site)
  assert.equal(site.rows('article').length, 1)
  assert.equal(site.rows('menuItem').filter((r) => r.note).length, 0)
  const refused = first.line('legal:privacy')
  assert.deepEqual(
    [refused.status, refused.reason],
    ['failed', 'batch_failed: Another menu item has the same alias']
  )
  assert.equal(first.line(LINK).status, 'failed')
  assert.match(first.line(LINK).reason, /same alias/)
  assert.equal(site.records.get('menuItem-40').link, 'index.php?Itemid=70')
  assert.equal(
    first.report.keptPages.some((p) => p.id === 'legal:privacy'),
    false
  )
  site.allowMenu = true
  const again = await runOn(site, { last: first.report })
  assert.deepEqual(countRows(site), [1, 1, 3])
  assert.equal(again.line('legal:privacy').status, 'written')
  assert.equal(again.line(LINK).status, 'written')
})

for (const [name, info, reason] of [
  [
    'an older plugin',
    { ok: true, info: { hide_ops: { version: 1 } } },
    /older than page creation \(info\.page_create\)/
  ],
  [
    'a plugin that will not say',
    { ok: false, error: 'nope', message: 'no answer' },
    /could not say.*nope: no answer/
  ]
])
  test(`${name} gets a named refusal: no row is made, the link stays, and the rest of the site is written`, async () => {
    const site = pagesSite({ info })
    const { report, line } = await runOn(site)
    assert.equal(report.status, 'done')
    assert.deepEqual(site.batches(), [])
    assert.deepEqual(
      [line('legal:privacy').status, line('legal:privacy:heading').status],
      ['failed', 'failed']
    )
    assert.match(line('legal:privacy').reason, reason)
    assert.match(line(LINK).reason, reason)
    assert.equal(site.records.get('menuItem-40').link, 'index.php?Itemid=70')
    assert.ok(site.applies().length > 0)
    const check = await readBackGroup.run({
      report,
      read: async (action, params) => site.door.apply({ siteKey: 's', action, params })
    })
    assert.equal(check.lines[LINK], 'failed')
    assert.equal(check.lines['legal:privacy'], 'failed')
  })

test('the item goes in the menu of the plan link and is left out of what that menu prints', async () => {
  const site = pagesSite()
  await runOn(site)
  const item = site.rows('menuItem').find((r) => r.note)
  assert.equal(item.menutype, 'useful-links')
  assert.equal(JSON.parse(item.params).menu_show, 0)
  assert.equal(JSON.parse(item.params).page_title, 'Privacy policy of Quay Fitness Studio')
})

test('the page heading goes to the article title, the item title and page_heading; the seo title only to page_title', async () => {
  const site = pagesSite()
  await runOn(site)
  const item = site.rows('menuItem').find((r) => r.note)
  const article = site.rows('article').find((r) => r.note)
  const heading = copy().pages.find((p) => p.page === 'legal:privacy').title
  const params = JSON.parse(item.params)
  assert.deepEqual(
    [article.title, item.title, params.page_heading, params.page_title],
    [heading, heading, heading, 'Privacy policy of Quay Fitness Studio']
  )
  assert.notEqual(heading, params.page_title)
})

test('a page no menu link leads to takes the menu of the home item', async () => {
  const site = pagesSite()
  await runOn(site, { over: { plan: pagesPlan('page-about') } })
  assert.equal(site.rows('menuItem').find((r) => r.note).menutype, 'mainmenu')
})

test('any page a plan asks to create, of any kind and without a slug, is made the same way', async () => {
  const plan = pagesPlan('legal:members')
  plan.site.legalPages = [{ id: 'legal:members', kind: 'members', use: 'create', says: 'an invented rule' }]
  const words = copy()
  words.pages.find((p) => p.page === 'legal:privacy').page = 'legal:members'
  words.seo = words.seo.filter((s) => s.page !== 'legal:privacy')
  const site = pagesSite()
  const { report, line } = await runOn(site, { over: { plan, copy: words } })
  const item = site.rows('menuItem').find((r) => r.note)
  assert.deepEqual([item.alias, item.note], ['members', 'tracy-page:legal:members'])
  assert.equal(JSON.parse(item.params).page_title, undefined)
  assert.equal(line(LINK).ordered, `index.php?Itemid=${item.id}`)
  assert.deepEqual(report.keptPages.at(-1), { id: 'legal:members', path: '/members' })
})

test('two pages share one category', async () => {
  const plan = pagesPlan()
  plan.site.legalPages.push({ id: 'legal:terms', kind: 'terms', use: 'create', slug: 'terms' })
  const words = copy()
  words.pages.push({ page: 'legal:terms', title: 'Terms', body: ['Invented terms.'] })
  const site = pagesSite()
  await runOn(site, { over: { plan, copy: words } })
  assert.deepEqual(countRows(site), [1, 2, 4])
})

test('a plan that creates nothing asks the site nothing new', async () => {
  const plan = pagesPlan('page-about')
  plan.site.legalPages = [{ kind: 'privacy', use: 'page-about' }]
  const site = pagesSite()
  await runOn(site, { over: { plan } })
  assert.deepEqual(site.batches(), [])
  assert.deepEqual(countRows(site)[1], 0)
})

test('what the site holds of a page reads back as ordered', async () => {
  const site = pagesSite()
  const { report } = await runOn(site)
  const check = await readBackGroup.run({
    report,
    read: async (action, params) => site.door.apply({ siteKey: 's', action, params })
  })
  for (const slot of [
    'legal:privacy',
    'legal:privacy:heading',
    'legal:privacy:address',
    'legal:privacy:title',
    'legal:privacy:description',
    LINK
  ])
    assert.equal(check.lines[slot], 'match', slot)
})

// A template whose kept content page is an article opened under a category's menu item (TracyHQ/tracy#379).
const COURSES = {
  kind: 'menuItem',
  id: 60,
  path: 'courses',
  published: 1,
  type: 'component',
  menutype: 'mainmenu',
  link: 'index.php?option=com_content&view=category&layout=quay:course&id=9',
  // As a real row holds it: the file its articles print through is here, and the link's `layout` says nothing of it.
  params: JSON.stringify({
    layout_type: 'blog',
    article_layout: 'quay:course-page',
    show_title: '',
    menu_show: 1
  })
}
const ROWING = {
  kind: 'article',
  id: 8,
  catid: 9,
  attribs: JSON.stringify({ article_layout: '', show_title: '' })
}

/** Which file Joomla's article view prints an article through: the article's, else its active menu item's, else the component's. */
const printedThrough = (article, item, component = '_:default') => {
  const own = (json, name) => JSON.parse(json ?? '{}')[name]
  return own(article.attribs, 'article_layout') || own(item.params, 'article_layout') || component
}
function routedKit({ recorded = false, legal = null } = {}) {
  const kit = pagesKit()
  // The article file the kit names for a created legal page (card AN), when the test gives one.
  if (legal) kit.doc.site = { ...kit.doc.site, createdPageLayouts: { legal: { articleLayout: legal } } }
  kit.doc.blocks.push({ id: 'body-rowing', source: { owner: 'article-8', ownerKind: 'article' }, slots: [] })
  kit.doc.pages = [
    ...(kit.doc.pages ?? []),
    { id: 'page-rowing', path: '/courses/rowing', blocks: { 1440: ['body-rowing'] } }
  ]
  if (recorded)
    kit.doc.site = {
      ...kit.doc.site,
      contentPages: [
        { route: 'other', layout: 'other', pages: [] },
        {
          menuItem: 'menuItem-60',
          route: 'courses',
          layout: 'quay:recorded',
          pages: ['page-rowing'],
          articles: ['article-8']
        }
      ]
    }
  return kit
}
function routedPlan() {
  const p = pagesPlan()
  p.pages.push({ id: 'page-rowing', decision: 'keep', blocks: [] })
  return p
}
const routedRun = (site, options = {}) =>
  runOn(site, { kit: routedKit(options), over: { plan: routedPlan() }, last: options.last ?? null })
const routedSite = () => {
  const site = pagesSite()
  site.records.set('menuItem-60', { ...COURSES })
  site.records.set('article-8', { ...ROWING })
  return site
}

test('a created page takes the route of the template content pages: its article under a hidden item with the same layout', async () => {
  const site = routedSite()
  const { report, line } = await routedRun(site)
  assert.equal(report.status, 'done')
  const [category] = site.rows('category')
  const article = createdArticleOf(site)
  const item = site.rows('menuItem').find((r) => r.note === 'tracy-page:route')
  assert.equal(item.link, `index.php?option=com_content&view=category&layout=quay:course&id=${category.id}`)
  assert.equal(JSON.parse(item.params).menu_show, 0)
  assert.equal(article.catid, category.id)
  assert.equal(JSON.parse(article.attribs).article_page_title, 'Privacy policy of Quay Fitness Studio')
  // No item of its own: under one, the template prints its default article.
  assert.equal(site.rows('menuItem').filter((r) => r.note === 'tracy-page:legal:privacy').length, 0)
  const address = `index.php?option=com_content&view=article&id=${article.id}&catid=${category.id}&Itemid=${item.id}`
  assert.deepEqual([line(LINK).status, line(LINK).ordered], ['written', address])
  assert.equal(line('legal:privacy:route').ordered, item.link)
  assert.deepEqual(report.keptPages.at(-1), { id: 'legal:privacy', path: '/site-pages/privacy-policy' })
  // Every line of the report is what the site holds: title and description on the article, the route on its item.
  const check = await readBackGroup.run({
    report,
    read: async (action, params) => site.door.apply({ siteKey: 's', action, params })
  })
  for (const slot of [
    LINK,
    'legal:privacy',
    'legal:privacy:heading',
    'legal:privacy:address',
    'legal:privacy:title',
    'legal:privacy:description',
    'legal:privacy:route'
  ])
    assert.equal(check.lines[slot], 'match', slot)
})

const routeItemOf = (site) => site.rows('menuItem').find((r) => r.note === 'tracy-page:route')
const createdArticleOf = (site) => site.rows('article').find((r) => r.note === 'tracy-page:legal:privacy')

// Card AN: a created page is a legal page, so it never prints through the content pages' file (a class page's prints booking bars).
test('a created legal page does not print through the file the template content pages print through', async () => {
  const site = routedSite()
  await routedRun(site)
  assert.equal(printedThrough(ROWING, COURSES), 'quay:course-page')
  assert.equal(printedThrough(createdArticleOf(site), routeItemOf(site)), '_:default')
})

test("when the template's articles name the file themselves, a created legal page still prints the plain default", async () => {
  const site = routedSite()
  const rowing = { ...ROWING, attribs: JSON.stringify({ article_layout: 'quay:rowing-page' }) }
  site.records.set('article-8', rowing)
  await routedRun(site)
  assert.equal(printedThrough(rowing, COURSES), 'quay:rowing-page')
  assert.equal(printedThrough(createdArticleOf(site), routeItemOf(site)), '_:default')
})

test('a route an earlier run made with no file gets the kit legal file in one write, keeps its settings, and a rerun then writes nothing', async () => {
  const site = routedSite()
  const first = await routedRun(site, { legal: 'quay:plain' })
  const item = routeItemOf(site)
  // What a run before this fix left: the item as it made it, and a report whose route line does not say the file.
  const { article_layout: _gone, ...before } = JSON.parse(item.params)
  site.records.set(`menuItem-${item.id}`, { ...item, params: JSON.stringify({ ...before, kept: 'yes' }) })
  const older = structuredClone(first.report)
  older.slots = older.slots.filter((l) => l.slot !== 'legal:privacy:layout')
  for (const l of older.slots) if (l.slot === 'legal:privacy:route') delete l.articleLayout
  reset(site)
  const moved = await routedRun(site, { last: older, legal: 'quay:plain' })
  assert.equal(moved.report.status, 'done')
  const writes = pageWrites(site)
  assert.deepEqual(
    writes.map((c) => [c.action, c.params.kind, c.params.id]),
    [['content.update', 'menuItem', item.id]]
  )
  const params = JSON.parse(writes[0].params.fields.params)
  assert.deepEqual([params.article_layout, params.kept, params.menu_show], ['quay:plain', 'yes', 0])
  assert.equal(moved.line('legal:privacy:layout').ordered, 'quay:plain')
  reset(site)
  const again = await routedRun(site, { last: moved.report, legal: 'quay:plain' })
  assert.deepEqual(pageWrites(site), [])
  assert.deepEqual(
    site.calls.filter((c) => c.action === 'content.get'),
    []
  )
  assert.equal(again.line('legal:privacy:layout').unchanged, true)
  assert.equal(again.line('legal:privacy:route').articleLayout, 'quay:plain')
  reset(site)
  await routedRun(site, { legal: 'quay:plain' })
  assert.deepEqual(pageWrites(site), [])
})

test('a template whose content pages name no file sets none, and its report still holds on a rerun', async () => {
  const site = routedSite()
  site.records.set('menuItem-60', {
    ...COURSES,
    params: JSON.stringify({ article_layout: '', menu_show: 1 })
  })
  const first = await routedRun(site)
  assert.equal(JSON.parse(routeItemOf(site).params).article_layout, undefined)
  assert.equal(first.line('legal:privacy:layout'), undefined)
  assert.equal(first.line('legal:privacy:route').articleLayout, null)
  reset(site)
  await routedRun(site, { last: first.report })
  assert.deepEqual(pageWrites(site), [])
  assert.deepEqual(
    site.calls.filter((c) => c.action === 'content.get'),
    []
  )
})

test('what the kit records of the template content pages is what a created page follows', async () => {
  const site = routedSite()
  await routedRun(site, { recorded: true })
  const item = site.rows('menuItem').find((r) => r.note === 'tracy-page:route')
  assert.match(item.link, /layout=quay:recorded&/)
})

test('a routed page makes no write on a rerun, with its report and without one', async () => {
  const site = routedSite()
  const first = await routedRun(site)
  const rows = countRows(site)
  reset(site)
  const again = await routedRun(site, { last: first.report })
  assert.deepEqual(pageWrites(site), [])
  assert.deepEqual(countRows(site), rows)
  assert.deepEqual(
    [again.line('legal:privacy:route').status, again.line('legal:privacy:route').unchanged],
    ['written', true]
  )
  assert.equal(again.line(LINK).ordered, first.line(LINK).ordered)
  assert.equal(again.report.keptPages.at(-1).path, '/site-pages/privacy-policy')
  reset(site)
  await routedRun(site)
  assert.deepEqual(pageWrites(site), [])
  assert.deepEqual(countRows(site), rows)
})

test('a page an earlier run gave its own item moves onto the route, and the old item stops printing it', async () => {
  const site = routedSite()
  site.records.delete('menuItem-60')
  const before = await runOn(site, { kit: pagesKit() })
  const own = site.rows('menuItem').find((r) => r.note === 'tracy-page:legal:privacy')
  assert.equal(before.report.keptPages.at(-1).path, '/privacy-policy')
  site.records.set('menuItem-60', { ...COURSES })
  reset(site)
  const after = await routedRun(site, { last: before.report })
  assert.equal(after.report.status, 'done')
  assert.equal(Number(site.records.get(`menuItem-${own.id}`).published), 0)
  assert.equal(after.report.keptPages.at(-1).path, '/site-pages/privacy-policy')
  assert.equal(site.rows('article').filter((r) => r.note).length, 1)
  reset(site)
  await routedRun(site, { last: after.report })
  assert.deepEqual(pageWrites(site), [])
})

test('a template whose content pages have no category route keeps the item of its own', async () => {
  const site = pagesSite()
  const { report } = await runOn(site, { kit: routedKit(), over: { plan: routedPlan() } })
  assert.equal(report.keptPages.at(-1).path, '/privacy-policy')
  assert.equal(site.rows('menuItem').filter((r) => r.note === 'tracy-page:route').length, 0)
})
