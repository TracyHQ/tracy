// The site check's `page-slug` measure (ADR 0044, decision 20): a kept page the write step renamed answers at an address that ends
// with its plan slug, the host opens it there, and the demo baseline follows it. Every site, page and row here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baselineAtRoutes, pageSlugGroup } from '../src/site-check/page-slug.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { CONTRACT } from './_write-step-run.mjs'
import { report } from './_site-check.mjs'

const ROUTES = [
  {
    pageId: 'page-lessons',
    slug: 'classes',
    itemId: 10,
    from: '/lessons',
    to: '/classes',
    outcome: 'written'
  },
  {
    pageId: 'page-lessons_rowing',
    slug: 'kayak-tours',
    itemId: 11,
    from: '/lessons/rowing',
    to: '/classes/kayak-tours',
    outcome: 'written'
  }
]
const slugLine = (pageId, slug, itemId) => ({
  slot: `${pageId}:slug`,
  key: null,
  owner: 'plan',
  part: 'page-slug',
  status: 'written',
  reason: null,
  readBack: null,
  ordered: slug,
  readFrom: { action: 'content.get', params: { kind: 'menuItem', id: itemId }, path: ['item', 'alias'] },
  outcome: 'written'
})

/** A site whose inspect lists these menu routes, and whose menu items answer `content.get` with these rows. */
function site(routes, items = {}) {
  return {
    async apply({ action, params }) {
      if (action === 'content.contract')
        return {
          ok: true,
          contract: CONTRACT,
          revision: 'rev-1',
          slots: [],
          pages: Object.entries(routes).map(([id, route]) => ({
            entity: `menuItem-${id}`,
            route,
            link: 'index.php'
          }))
        }
      if (action === 'content.get' && params.kind === 'menuItem') {
        const row = items[params.id]
        return row
          ? { ok: true, item: row }
          : { ok: false, error: 'not_found', message: `no menuItem ${params.id}` }
      }
      return { ok: false, error: 'unexpected_action' }
    }
  }
}
const ROWS = {
  10: { alias: 'classes', path: 'classes' },
  11: { alias: 'kayak-tours', path: 'classes/kayak-tours' }
}
const renamed = (over = {}) =>
  report([slugLine('page-lessons', 'classes', 10), slugLine('page-lessons_rowing', 'kayak-tours', 11)], {
    routes: ROUTES,
    keptPages: [
      { id: 'page-lessons', path: '/classes' },
      { id: 'page-lessons_rowing', path: '/classes/kayak-tours' }
    ],
    ...over
  })
const groupOf = (check) => check.groups.find((g) => g.name === 'page-slug')

test('a report with a route table runs page-slug after read-back, and pages at their slugs are green', async () => {
  const check = await runSiteCheck({
    door: site({ 10: 'classes', 11: 'classes/kayak-tours' }, ROWS),
    report: renamed()
  })
  assert.deepEqual(
    check.groups.map((g) => [g.name, g.status]),
    [
      ['look-guard-findings', 'not-applicable'],
      ['unaddressable-items', 'not-applicable'],
      ['slot-disputes', 'not-applicable'],
      ['emphasis-codes-left', 'not-applicable'],
      ['read-back', 'green'],
      ['page-slug', 'green']
    ]
  )
  assert.equal(groupOf(check).checked, 2)
})

test('a page whose menu link ends with another name blocks on step 9', async () => {
  const check = await runSiteCheck({
    // The row is what the site answers now; inspect's route is from when the contract was captured (card AE).
    door: site(
      { 10: 'classes', 11: 'classes/kayak-tours' },
      { ...ROWS, 11: { alias: 'rowing', path: 'classes/rowing' } }
    ),
    report: renamed(),
    groups: [pageSlugGroup]
  })
  const group = groupOf(check)
  assert.equal(group.status, 'red')
  assert.deepEqual(
    group.failures.map((f) => [f.slot, f.page, f.level, f.causingStep]),
    [['page-lessons_rowing:slug', '/classes/rowing', 'block', 9]]
  )
  assert.match(group.failures[0].reason, /does not end with its plan slug "kayak-tours"/)
})

test('an item inspect does not list is read on its row, and an item the site says nothing of is unmeasured', async () => {
  const read = await runSiteCheck({
    door: site({ 10: 'classes' }, ROWS),
    report: renamed(),
    groups: [pageSlugGroup]
  })
  assert.equal(groupOf(read).status, 'green')
  const silent = await runSiteCheck({
    door: site({ 10: 'classes' }, {}),
    report: renamed(),
    groups: [pageSlugGroup]
  })
  assert.equal(groupOf(silent).status, 'unmeasured')
  assert.match(groupOf(silent).reason, /page-lessons_rowing/)
  assert.equal(silent.status, 'unmeasured')
})

test('a report without a route table does not run the measure', async () => {
  const check = await runSiteCheck({ door: site({}), report: report([]) })
  assert.deepEqual(
    check.groups.map((g) => g.name),
    ['look-guard-findings', 'unaddressable-items', 'slot-disputes', 'emphasis-codes-left', 'read-back']
  )
})

test('with a host, the kept pages are opened at their new addresses, and a new address that answers 404 blocks', async () => {
  const asked = []
  const host = async (payload) => {
    asked.push(...payload.pages)
    return {
      checks: [],
      pageMeasures: [],
      visited: payload.pages.map((p) => ({ path: p, status: p === '/classes/kayak-tours' ? 404 : 200 }))
    }
  }
  const check = await runSiteCheck({
    door: site({ 10: 'classes', 11: 'classes/kayak-tours' }, ROWS),
    report: renamed(),
    host,
    groups: [pageSlugGroup]
  })
  assert.deepEqual(asked, ['/classes', '/classes/kayak-tours'])
  const group = groupOf(check)
  assert.equal(group.status, 'red')
  assert.deepEqual(
    group.failures.map((f) => [f.slot, f.measured]),
    [['page-lessons_rowing:slug', 404]]
  )
})

test('the demo baseline is moved to the addresses the pages answer at now', () => {
  const baseline = {
    texts: ['demo'],
    blocks: [{ page: '/lessons/rowing', width: 1440, selector: '.a', height: 10 }],
    textBlocks: [{ page: '/index.php/lessons/rowing', width: 390, selector: '.b', chars: 3 }],
    over: [{ page: '/', width: 1440 }],
    unread: [{ path: '/lessons', why: 'answered 500' }]
  }
  const moved = baselineAtRoutes(baseline, [...ROUTES, { from: '/x', to: '/y', outcome: 'refused' }])
  assert.deepEqual(
    [moved.blocks[0].page, moved.textBlocks[0].page, moved.over[0].page, moved.unread[0].path, moved.texts],
    ['/classes/kayak-tours', '/classes/kayak-tours', '/', '/classes', ['demo']]
  )
  assert.equal(baselineAtRoutes(baseline, []), baseline)
  assert.equal(baselineAtRoutes(null, ROUTES), null)
})
