// Dropped native articles must leave category lists as well as menus. All site rows are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { dropPages } from '../src/write-step/hide-writes.js'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { fakeSite } from './_write-step-run.mjs'
import { hideKit, runHide } from './_write-step-hide.mjs'

const page = { id: 'page-demo', path: '/classes/demo', blocks: { 390: ['body-demo'], 1440: ['body-demo'] } }
const kit = {
  pages: [page],
  blocks: [{ id: 'body-demo', source: { ownerKind: 'article', owner: 'article-14' } }]
}
const fixture = (records = [], overrides = {}) =>
  fakeSite({ records: [{ kind: 'article', id: 14, state: 1 }, ...records], ...overrides })
const run = async (site, options = {}) => {
  const results = new Map()
  const wrote = await dropPages({
    door: site.door,
    siteKey: 's',
    pages: [{ page }],
    kit,
    plan: { pages: [] },
    results,
    ...options
  })
  return { wrote, line: results.get(page.id) }
}

test('the full write step revisits an old menu-only receipt and records the native article state', async () => {
  const input = hideKit()
  input.doc.blocks.push({
    id: 'body-dropped',
    slots: [],
    frames: [],
    source: { ownerKind: 'article', owner: 'article-14' }
  })
  input.doc.pages.find((p) => p.id === 'page-old').blocks[1440].push('body-dropped')
  const first = await runHide({ kit: input, site: { records: [{ kind: 'article', id: 14, state: 1 }] } })
  assert.equal(first.report.status, 'done')
  const oldLine = first.report.slots.find((s) => s.slot === 'page-old')
  assert.equal(oldLine.status, 'hidden')
  oldLine.readFrom = {
    action: 'content.get',
    params: { kind: 'menuItem', id: 120 },
    path: ['item', 'published']
  }
  const again = await runHide({
    kit: input,
    deps: { last: first.report },
    site: { records: [{ kind: 'article', id: 14, state: 1 }] }
  })
  assert.equal(again.report.status, 'done', JSON.stringify(again.report.cause))
  assert.equal(again.site.records.get('article-14').state, 0)
  assert.equal(again.report.slots.find((s) => s.slot === 'page-old').readFrom.params.kind, 'article')
})

test('a category-routed article is unpublished without a menu row and its state is read back', async () => {
  const site = fixture()
  const { wrote, line } = await run(site)
  assert.equal(wrote, true)
  assert.equal(site.records.get('article-14').state, 0)
  assert.deepEqual(line.readFrom, {
    action: 'content.get',
    params: { kind: 'article', id: 14 },
    path: ['item', 'state']
  })
  assert.equal(line.status, 'hidden')
  assert.ok(site.updates()[0].params.apply_id)
  assert.equal((await run(site)).wrote, false, 'an already unpublished article is not written again')
})

test('a dropped article with a menu item unpublishes both native records', async () => {
  const site = fixture([{ kind: 'menuItem', id: 120, path: 'classes/demo', published: 1 }])
  await run(site)
  assert.equal(site.records.get('article-14').state, 0)
  assert.equal(site.records.get('menuItem-120').published, 0)
})

test('an archived or trashed article stays in its existing state without being restored', async () => {
  for (const state of [-2, 2]) {
    const site = fixture([{ kind: 'article', id: 14, state }])
    const { line, wrote } = await run(site)
    assert.equal(wrote, false)
    assert.equal(line.ordered, String(state))
    assert.equal(site.records.get('article-14').state, state)
  }
})

test('missing and invalid native states refuse before unpublishing a menu', async () => {
  for (const state of [undefined, null, 'unknown', 9]) {
    const site = fixture([
      { kind: 'article', id: 14, state },
      { kind: 'menuItem', id: 120, path: 'classes/demo', published: 1 }
    ])
    const { line } = await run(site)
    assert.equal(line.status, 'failed')
    assert.match(line.reason, /did not return the published state/)
    assert.equal(site.updates().length, 0)
  }
})

test('main-menu handling does not remove the dropped article order', () => {
  const order = hideOrders({
    kit,
    plan: { pages: [{ id: page.id, decision: 'drop' }] },
    owners: new Map(),
    extras: { mainMenu: { hide: [{ slot: 'menuItem-120.0', item: 'menuItem-120', path: page.path }] } },
    reading: { slots: [] },
    changes: {},
    cannotHide: null
  })
  assert.equal(order.pages[0].page.id, page.id)
})

test('dropped groups and kit stock screens retain the native article owner', () => {
  const grouped = { ...page, group: 'group-demo' }
  const order = (over, plan) =>
    hideOrders({
      kit: { ...kit, pages: [grouped], ...over },
      plan,
      owners: new Map(),
      extras: {},
      reading: { slots: [] },
      changes: {},
      cannotHide: null
    })
  assert.equal(
    order({}, { pageGroups: [{ id: 'group-demo', decision: 'drop' }], pages: [] }).pages[0].page.id,
    page.id
  )
  const stock = order(
    { site: { stockScreens: [{ path: page.path, why: 'template demonstration' }] } },
    { pages: [] }
  )
  assert.equal(stock.pages[0].page.id, page.id)
})

test('a kept page sharing the exact article owner prevents either unpublish', async () => {
  const site = fixture([{ kind: 'menuItem', id: 120, path: 'classes/demo', published: 1 }])
  const kept = { ...page, id: 'page-kept', path: '/other' }
  const { line } = await run(site, {
    kit: { ...kit, pages: [page, kept] },
    plan: { pages: [{ id: kept.id, decision: 'keep' }] }
  })
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /also belongs to a kept page/)
  assert.equal(site.updates().length, 0)
})

test('multiple native owners and plugin refusals remain failures without guessed writes', async () => {
  const site = fixture()
  const ambiguous = {
    ...kit,
    blocks: [...kit.blocks, { id: 'body-other', source: { ownerKind: 'article', owner: 'article-15' } }]
  }
  const split = { ...page, blocks: { 390: ['body-demo', 'body-other'] } }
  const result = await run(site, { kit: ambiguous, pages: [{ page: split }] })
  assert.equal(result.line.status, 'failed')
  assert.equal(site.updates().length, 0)
  const refused = fixture([], { refuseUpdate: () => ({ ok: false, error: 'is_locked', message: 'locked' }) })
  const { line } = await run(refused)
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /is_locked: locked/)
})

test('the shipped Boxing kit identifies both leftover class articles without aliases', async () => {
  const boxing = JSON.parse(
    await readFile(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/template-kit.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  for (const [name, id] of [
    ['beginner-boxing', 14],
    ['advanced-boxing', 16]
  ]) {
    const dropped = boxing.pages.find((p) => p.id === `page-classes_${name}`)
    const site = fixture([{ kind: 'article', id, state: 1 }])
    const results = new Map()
    await dropPages({
      door: site.door,
      siteKey: 's',
      pages: [{ page: dropped }],
      kit: boxing,
      plan: { pages: [] },
      results
    })
    assert.equal(site.records.get(`article-${id}`).state, 0)
    assert.equal(results.get(dropped.id).status, 'hidden')
  }
})
