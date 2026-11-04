// A page the plan asks to create (TracyHQ/tracy#375): the write step makes it through the plugin door first, then points links at
// it, and a rerun does not make it twice. A fake site door answers as the plugin does; every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBackGroup } from '../src/site-check/read-back.js'
import { LINK, pagesPlan, pagesSite, runOn } from './_write-step-pages.mjs'
import { copy } from './_write-step-run.mjs'

const BODY =
  '<p>Your message is read by the studio team and used only to reply to you.</p>\n<p>Nobody outside the studio ever receives them.</p>'

test('the check stops before anything is written when a page to create has no words in the copy', async () => {
  const site = pagesSite()
  const bare = copy()
  bare.pages = bare.pages.filter((p) => p.page !== 'legal:privacy')
  const { report } = await runOn(site, { over: { copy: bare } })
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'PAGE_WITHOUT_COPY')
  assert.match(report.cause.reason, /legal:privacy/)
  assert.deepEqual(
    site.calls.filter((c) => c.action !== 'info' && c.params.operation !== 'inspect'),
    []
  )
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
