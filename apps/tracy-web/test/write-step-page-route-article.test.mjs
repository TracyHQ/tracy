// Card P: the route stage gives the plan's slug to a kept page that has no menu item of its own (an article under a category
// item: its address ends with the article's alias), refuses a category view by naming the missing door, and frees a slug a
// url menu item holds (its alias routes nothing) before renaming the page; a routed item holding it is never touched. Every
// site, page and row here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeOrders } from '../src/write-step/page-route-lines.js'
import { pageSlugGroup } from '../src/site-check/page-slug.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { restoreRoutes, runRouteStage } from '../src/write-step/page-route-stage.js'
import { rewriteRenamedLinks } from '../src/write-step/renamed-link-stage.js'
import { report } from './_site-check.mjs'
import { fakeSite, SITE } from './_write-step-run.mjs'

const item = (id, alias, path, parent, extra = {}) => ({
  kind: 'menuItem',
  id,
  alias,
  path,
  parent_id: parent,
  published: 1,
  language: '*',
  client_id: 0,
  menutype: 'mainmenu',
  type: 'component',
  link: `index.php?option=com_content&view=article&id=${id + 100}`,
  ...extra
})
const KIT = {
  blocks: [{ id: 'block-rowing-body', source: { owner: 'article-111', ownerKind: 'article' } }],
  pages: [
    { id: 'page-lessons', path: '/lessons' },
    { id: 'page-lessons_rowing', path: '/lessons/rowing', blocks: { main: ['block-rowing-body'] } },
    { id: 'page-lessons_indoor', path: '/lessons/indoor' },
    { id: 'page-team', path: '/team' }
  ]
}
const PLAN = {
  pages: [
    { id: 'page-lessons', decision: 'keep', slug: 'classes' },
    { id: 'page-lessons_rowing', decision: 'keep', slug: 'kayak-tours' },
    { id: 'page-lessons_indoor', decision: 'keep', slug: 'gym' },
    { id: 'page-team', decision: 'keep', slug: 'people' }
  ]
}
const KEPT = KIT.pages.map(({ id, path }) => ({ id, path }))
const RECORDS = (holder = 'url') => [
  item(10, 'lessons', 'lessons', 1, { link: 'index.php?option=com_content&view=category&id=8' }),
  item(20, 'team', 'team', 1),
  item(30, 'people', 'people', 1, {
    menutype: 'sitemap',
    ...(holder === 'url' ? { type: 'url', link: '/index.php/team' } : {})
  }),
  { kind: 'article', id: 111, alias: 'rowing', title: 'Rowing', catid: 8 }
]

/** A site whose plugin renames a menu item through `alias` and answers the alias it holds now. */
function site(holder) {
  const s = fakeSite({ records: RECORDS(holder) })
  const inner = s.door.apply
  s.door.apply = async (call) => {
    const answer = await inner(call)
    return call.action === 'content.update' &&
      call.params.kind === 'menuItem' &&
      'alias' in (call.params.fields ?? {})
      ? { ...answer, alias: call.params.fields.alias }
      : answer
  }
  return s
}
const rows = (holder) => RECORDS(holder).filter((r) => r.kind === 'menuItem')

test('a page reached through its parent item is ordered on its article; a category view is refused naming the door', () => {
  const orders = routeOrders({ plan: PLAN, kit: KIT, rows: rows('url') })
  const rowing = orders.find((o) => o.pageId === 'page-lessons_rowing')
  assert.deepEqual(
    [rowing.via, rowing.itemId, rowing.articleId, rowing.to, rowing.reason],
    ['article', null, 111, '/classes/kayak-tours', undefined]
  )
  assert.match(orders.find((o) => o.pageId === 'page-lessons_indoor').reason, /category/)
  const team = orders.find((o) => o.pageId === 'page-team')
  assert.deepEqual([team.reason, team.clear], [undefined, { itemId: 30, from: 'people', to: 'people-link' }])
  const routed = routeOrders({ plan: PLAN, kit: KIT, rows: rows('component') }).find(
    (o) => o.pageId === 'page-team'
  )
  assert.match(routed.reason, /menu item 30 under the same parent already answers at people/)
})

test('the stage renames the article, frees the slug a url item holds, and lists every page at its new address', async () => {
  const s = site('url')
  const out = await runRouteStage({ door: s.door, siteKey: SITE, kit: KIT, plan: PLAN, keptPages: KEPT })
  assert.deepEqual(
    s.updates().map((c) => [c.params.kind, c.params.id, c.params.fields.alias]),
    [
      ['menuItem', 10, 'classes'],
      ['article', 111, 'kayak-tours'],
      ['menuItem', 30, 'people-link'],
      ['menuItem', 20, 'people']
    ]
  )
  const route = (id) => out.routes.find((r) => r.pageId === id)
  assert.deepEqual(
    [route('page-lessons_rowing').outcome, route('page-lessons_rowing').to],
    ['written', '/classes/kayak-tours']
  )
  assert.deepEqual([route('page-team').outcome, route('page-team').cleared.outcome], ['written', 'written'])
  assert.equal(route('page-lessons_indoor').outcome, 'refused')
  assert.deepEqual(
    out.keptPages.map((p) => p.path),
    ['/classes', '/classes/kayak-tours', '/classes/indoor', '/people']
  )
  const line = (slot) => out.lines.find((l) => l.slot === slot)
  assert.deepEqual(line('page-lessons_rowing:slug').readFrom, {
    action: 'content.get',
    params: { kind: 'article', id: 111 },
    path: ['item', 'alias']
  })
  assert.equal(line('page-team:freed-alias').status, 'written')
  assert.equal(line('page-lessons_indoor:slug').status, 'failed')
})

test('a rerun gives a renamed article its demo alias back', async () => {
  const s = site('url')
  s.records.get('article-111').alias = 'kayak-tours'
  const done = await restoreRoutes({
    door: s.door,
    siteKey: SITE,
    routes: [
      {
        pageId: 'page-lessons_rowing',
        via: 'article',
        itemId: null,
        articleId: 111,
        slug: 'kayak-tours',
        from: '/lessons/rowing',
        to: '/classes/kayak-tours',
        outcome: 'written'
      }
    ]
  })
  assert.equal(done.stop, undefined)
  assert.deepEqual(
    s.updates().map((c) => [c.params.kind, c.params.id, c.params.fields.alias]),
    [['article', 111, 'rowing']]
  )
})

test('a link to the article page follows its new address, and page-slug reads the article alias', async () => {
  const s = site('url')
  s.records.set('menuItem-40', {
    ...item(40, 'f40', 'f40', 1, { type: 'url', link: '/index.php/lessons/rowing' })
  })
  const out = await runRouteStage({ door: s.door, siteKey: SITE, kit: KIT, plan: PLAN, keptPages: KEPT })
  await rewriteRenamedLinks({ door: s.door, siteKey: SITE, routes: out.routes })
  assert.equal(s.records.get('menuItem-40').link, '/index.php/classes/kayak-tours')
  const rowing = out.routes.find((r) => r.pageId === 'page-lessons_rowing')
  const check = await runSiteCheck({
    door: s.door,
    report: report(
      out.lines.filter((l) => l.slot === 'page-lessons_rowing:slug'),
      { routes: [rowing], keptPages: out.keptPages }
    ),
    groups: [pageSlugGroup]
  })
  const group = check.groups.find((g) => g.name === 'page-slug')
  assert.deepEqual([group.status, group.checked], ['green', 1])
})
