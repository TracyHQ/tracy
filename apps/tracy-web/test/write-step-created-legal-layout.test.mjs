// Card AN: a created legal page prints through the article layout the kit names for legal pages, or the template's plain default
// when it names none; never through the file of the template's content pages, whose own action bars a legal page must not
// print. Every business, row and layout here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBackGroup } from '../src/site-check/read-back.js'
import { pagesKit, pagesPlan, pagesSite, runOn } from './_write-step-pages.mjs'

// The template's content pages: articles under a category item whose file prints a booking bar.
const COURSES = {
  kind: 'menuItem',
  id: 60,
  path: 'courses',
  published: 1,
  type: 'component',
  menutype: 'mainmenu',
  link: 'index.php?option=com_content&view=category&layout=quay:course&id=9',
  params: JSON.stringify({ layout_type: 'blog', article_layout: 'quay:course-page', menu_show: 1 })
}
const ROWING = { kind: 'article', id: 8, catid: 9, attribs: JSON.stringify({ article_layout: '' }) }

function kit(legal) {
  const k = pagesKit()
  k.doc.blocks.push({ id: 'body-rowing', source: { owner: 'article-8', ownerKind: 'article' }, slots: [] })
  k.doc.pages = [
    ...(k.doc.pages ?? []),
    { id: 'page-rowing', path: '/courses/rowing', blocks: { 1440: ['body-rowing'] } }
  ]
  if (legal !== undefined)
    k.doc.site = {
      ...k.doc.site,
      createdPageLayouts: { legal: { articleLayout: legal, why: 'the plain article file' } }
    }
  return k
}
function plan() {
  const p = pagesPlan()
  p.pages.push({ id: 'page-rowing', decision: 'keep', blocks: [] })
  return p
}
function site() {
  const s = pagesSite()
  s.records.set('menuItem-60', { ...COURSES })
  s.records.set('article-8', { ...ROWING })
  return s
}
const routeItemOf = (s) => s.rows('menuItem').find((r) => r.note === 'tracy-page:route')
const layoutOf = (s) => JSON.parse(routeItemOf(s).params).article_layout

test('a created legal page prints through the layout the kit names for legal pages', async () => {
  const s = site()
  const { report, line } = await runOn(s, { kit: kit('quay:plain'), over: { plan: plan() } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(layoutOf(s), 'quay:plain')
  assert.equal(line('legal:privacy:layout').ordered, 'quay:plain')
  assert.deepEqual(report.guard.findings, [])
})

test('with no layout named for legal pages, it prints through the plain default, never the content pages file', async () => {
  const s = site()
  const { report, line } = await runOn(s, { kit: kit(), over: { plan: plan() } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(layoutOf(s), undefined)
  assert.equal(line('legal:privacy:layout'), undefined)
  assert.equal(line('legal:privacy:route').articleLayout, null)
})

test('a route an earlier run gave the content pages file takes it off on the rerun, in one write', async () => {
  const s = site()
  const first = await runOn(s, { kit: kit(), over: { plan: plan() } })
  const item = routeItemOf(s)
  s.records.set(`menuItem-${item.id}`, {
    ...item,
    params: JSON.stringify({ ...JSON.parse(item.params), article_layout: 'quay:course-page' })
  })
  const older = structuredClone(first.report)
  for (const l of older.slots) if (l.slot === 'legal:privacy:route') l.articleLayout = 'quay:course-page'
  s.calls.length = 0
  const again = await runOn(s, { kit: kit(), over: { plan: plan() }, last: older })
  assert.equal(again.report.status, 'done', JSON.stringify(again.report.cause))
  assert.equal(layoutOf(s), undefined)
  assert.deepEqual(again.report.guard.findings, [])
})

for (const routed of [false, true]) {
  test(`a ${routed ? 'category-routed' : 'direct'} legal page prints its body once and upgrades an older receipt`, async () => {
    const s = routed ? site() : pagesSite()
    const options = routed ? { kit: kit(), over: { plan: plan() } } : {}
    const first = await runOn(s, options)
    const article = s.rows('article').find((row) => row.note === 'tracy-page:legal:privacy')
    assert.equal(JSON.parse(article.attribs).show_intro, '0')
    const check = async (report) =>
      readBackGroup.run({ report, read: (action, params) => s.door.apply({ siteKey: 's', action, params }) })
    assert.equal((await check(first.report)).lines['legal:privacy:intro'], 'match')
    const attrs = JSON.parse(article.attribs)
    delete attrs.show_intro
    s.records.set(`article-${article.id}`, {
      ...article,
      attribs: JSON.stringify({ ...attrs, custom: 'kept' })
    })
    const older = structuredClone(first.report)
    older.slots = older.slots.filter((line) => line.slot !== 'legal:privacy:intro')
    s.calls.length = 0
    const again = await runOn(s, { ...options, last: older })
    const updated = JSON.parse(s.records.get(`article-${article.id}`).attribs)
    assert.equal(updated.show_intro, '0')
    assert.equal(updated.custom, 'kept')
    assert.equal((await check(again.report)).lines['legal:privacy:intro'], 'match')
    assert.equal(s.batches().length, 0, 'existing native rows are reused')
    assert.deepEqual(again.report.guard.findings, [])
  })
}
