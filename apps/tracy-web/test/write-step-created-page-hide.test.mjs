// The write step's rule for blocks a template prints hard coded on every article page, which a page the write step creates must
// not show (ADR 0044, decision 29, fourth use; card AT). Every fixture is invented: an invented template whose article file
// prints a share bar with no setting to turn it off.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CREATED_HIDE_END,
  CREATED_HIDE_SLOT,
  CREATED_HIDE_START,
  createdHideBlockFor,
  createdHideSelectorsFor,
  createdPageHideOf
} from '../src/lib/created-page-hide.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { hideOnCreatedPages } from '../src/write-step/created-page-hide-stage.js'
import { pagesKit, pagesPlan, pagesSite, runOn } from './_write-step-pages.mjs'

const SELECTOR = '.share-row'
const WHY =
  'the invented article file prints div.share-row with three share buttons, with no setting to turn it off'
const HEAD =
  '<!-- tracy-brand-head:start -->\n<link rel="icon" href="/images/x.png">\n<!-- tracy-brand-head:end -->'
const kitOf = (createdPageHide) => ({
  site: {
    head: { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } },
    ...(createdPageHide ? { createdPageHide } : {})
  }
})

function door(content = HEAD) {
  const calls = []
  let held = content
  return {
    calls,
    held: () => held,
    apply: async ({ action, params }) => {
      calls.push({ action, params })
      if (action === 'content.get') return { ok: true, item: { id: params.id, content: held } }
      held = params.fields.content
      return { ok: true }
    }
  }
}

test('the kit field is read as plain compound selectors; a bad one is left out with its words', () => {
  const kit = kitOf([
    { selector: SELECTOR, why: WHY },
    { selector: '.a .b', why: WHY }
  ])
  const { selectors, problems } = createdPageHideOf(kit)
  assert.deepEqual(selectors, [SELECTOR])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /compound/)
})

test('each created page gets one rule per selector, scoped by the article view and the menu item that opens it', () => {
  const selectors = createdHideSelectorsFor(
    [
      { id: 'legal:privacy', itemId: 244 },
      { id: 'legal:terms', itemId: 244 },
      { id: 'legal:cookies', itemId: 301 },
      { id: 'legal:broken', itemId: null }
    ],
    [SELECTOR, '#share']
  )
  assert.deepEqual(selectors, [
    'body.com_content.view-article.item-244 .share-row',
    'body.com_content.view-article.item-244 #share',
    'body.com_content.view-article.item-301 .share-row',
    'body.com_content.view-article.item-301 #share'
  ])
})

test('the stage writes the block for the created pages only, reads it back, and a rerun sends nothing', async () => {
  const site = door()
  const kit = kitOf([{ selector: SELECTOR, why: WHY }])
  const created = [{ id: 'legal:privacy', itemId: 244 }]
  const lines = await hideOnCreatedPages({ door: site, siteKey: 's', kit, created })
  const writes = site.calls.filter((c) => c.action === 'content.update')
  assert.equal(writes.length, 1)
  const block = writes[0].params.fields.content.slice(HEAD.length + 1)
  assert.equal(
    block,
    `${CREATED_HIDE_START}<style>body.com_content.view-article.item-244 .share-row{display:none!important}</style>${CREATED_HIDE_END}`
  )
  assert.equal(block, createdHideBlockFor(createdHideSelectorsFor(created, [SELECTOR])))
  assert.deepEqual([lines[0].slot, lines[0].status, lines[0].ordered], [CREATED_HIDE_SLOT, 'written', block])
  assert.equal(lines[0].readFrom.type, 'contains')

  site.calls.length = 0
  const again = await hideOnCreatedPages({ door: site, siteKey: 's', kit, created })
  assert.equal(site.calls.filter((c) => c.action === 'content.update').length, 0)
  assert.deepEqual(again, lines)
})

test('a kit without the field is not asked about; an empty list or no created page takes an old block off, with no line', async () => {
  const none = door()
  assert.deepEqual(
    await hideOnCreatedPages({ door: none, siteKey: 's', kit: kitOf(), created: [{ id: 'x', itemId: 1 }] }),
    []
  )
  assert.equal(none.calls.length, 0)

  const old = `${HEAD}\n${createdHideBlockFor(['body.com_content.view-article.item-9 .share-row'])}`
  for (const [kit, created] of [
    [kitOf([]), [{ id: 'x', itemId: 9 }]],
    [kitOf([{ selector: SELECTOR, why: WHY }]), []]
  ]) {
    const site = door(old)
    assert.deepEqual(await hideOnCreatedPages({ door: site, siteKey: 's', kit, created }), [])
    assert.equal(site.held(), HEAD)
  }
})

test('the look guard lets the block hold only per-page rules on the kit selectors', async () => {
  const kit = kitOf([{ selector: SELECTOR, why: WHY }])
  const write = async (block) => {
    const site = door()
    const guard = lookGuard({ kit, contentMap: null })
    const guarded = guard.door(site)
    await guarded.apply({ siteKey: 's', action: 'content.get', params: { kind: 'module', id: 42 } })
    await guarded.apply({
      siteKey: 's',
      action: 'content.update',
      params: { kind: 'module', id: 42, fields: { content: `${HEAD}\n${block}` } }
    })
    return guard
  }
  const fine = await write(createdHideBlockFor(['body.com_content.view-article.item-244 .share-row']))
  assert.deepEqual(fine.findings(), [])
  assert.deepEqual(fine.refused(), [])
  for (const wrong of [
    createdHideBlockFor(['body.com_content.view-article.item-244 .other-row']),
    createdHideBlockFor(['body .share-row']),
    createdHideBlockFor(['.share-row']),
    `${CREATED_HIDE_START}<style>body.com_content.view-article.item-244 .share-row{color:red}</style>${CREATED_HIDE_END}`
  ]) {
    const guard = await write(wrong)
    assert.ok(
      [...guard.findings(), ...guard.refused()].some((f) => /created page/.test(JSON.stringify(f))),
      wrong
    )
  }
})

test('through the entry point: the created privacy page gets the rule at the item that opens it, with no guard finding', async () => {
  const kit = pagesKit()
  kit.doc.site = {
    ...kit.doc.site,
    head: { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } },
    createdPageHide: [{ selector: SELECTOR, why: WHY }]
  }
  const site = pagesSite()
  site.records.set('module-42', { kind: 'module', id: 42, content: HEAD })
  const { report, line } = await runOn(site, { kit, over: { plan: pagesPlan() } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const item = site.rows('menuItem').find((r) => r.note === 'tracy-page:legal:privacy')
  assert.ok(item, 'the created page has its own menu item')
  const content = site.records.get('module-42').content
  assert.ok(
    content.includes(
      `${CREATED_HIDE_START}<style>body.com_content.view-article.item-${item.id} .share-row{display:none!important}</style>${CREATED_HIDE_END}`
    ),
    content
  )
  assert.equal(line(CREATED_HIDE_SLOT).status, 'written')
  assert.deepEqual(report.guard.findings, [])
})

test('on the template route, the rule is scoped by the hidden category item the created article opens under', async () => {
  const kit = pagesKit()
  kit.doc.blocks.push({ id: 'body-rowing', source: { owner: 'article-8', ownerKind: 'article' }, slots: [] })
  kit.doc.pages = [
    ...(kit.doc.pages ?? []),
    { id: 'page-rowing', path: '/courses/rowing', blocks: { 1440: ['body-rowing'] } }
  ]
  kit.doc.site = {
    ...kit.doc.site,
    head: { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } },
    createdPageHide: [{ selector: SELECTOR, why: WHY }]
  }
  const plan = pagesPlan()
  plan.pages.push({ id: 'page-rowing', decision: 'keep', blocks: [] })
  const site = pagesSite()
  site.records.set('module-42', { kind: 'module', id: 42, content: HEAD })
  site.records.set('menuItem-60', {
    kind: 'menuItem',
    id: 60,
    path: 'courses',
    published: 1,
    type: 'component',
    menutype: 'mainmenu',
    link: 'index.php?option=com_content&view=category&layout=quay:course&id=9',
    params: JSON.stringify({ layout_type: 'blog', article_layout: 'quay:course-page', menu_show: 1 })
  })
  site.records.set('article-8', { kind: 'article', id: 8, catid: 9, attribs: '{}' })
  const { report } = await runOn(site, { kit, over: { plan } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const route = site.rows('menuItem').find((r) => r.note === 'tracy-page:route')
  assert.ok(route, 'the created page opens under the hidden route item')
  const content = site.records.get('module-42').content
  assert.ok(content.includes(`body.com_content.view-article.item-${route.id} .share-row{`), content)
  // The template's own content pages (menu item 60) keep their share bar.
  assert.ok(!content.includes('item-60'))
  assert.deepEqual(report.guard.findings, [])
})
