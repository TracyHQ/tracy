// The Diner failure shape with invented identities: a contact body is unchanged while its menu alias differs from the kit.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rowsOpening, writePageMeta } from '../src/write-step/page-meta-write.js'
import { closeForms } from '../src/write-step/form-close.js'
import { linkTarget } from '../src/write-step/link-targets.js'
import { routeOrders } from '../src/write-step/page-route-lines.js'
import { restoreRoutes, runRouteStage } from '../src/write-step/page-route-stage.js'

function fixture() {
  const page = {
    id: 'page-contact-us',
    path: '/contact-us',
    blocks: { 1440: ['body-contact'], 390: ['body-contact'] }
  }
  const kit = {
    pages: [page],
    blocks: [
      {
        id: 'body-contact',
        source: {
          ref: 'main-body',
          entity: 'contact-3',
          owner: 'contact-3',
          ownerKind: 'contact page',
          contains: [],
          pages: 1
        }
      }
    ]
  }
  const row = {
    id: 17,
    path: 'contact',
    alias: 'contact',
    parent_id: 1,
    published: 1,
    client_id: 0,
    menutype: 'mainmenu',
    home: 0,
    type: 'component',
    link: 'index.php?option=com_contact&view=contact&id=3',
    params: '{"menu_text":1,"show_email_form":""}'
  }
  const plan = {
    pages: [{ id: page.id, decision: 'keep', slug: 'contact-us', blocks: [] }],
    site: { forms: [{ block: 'body-contact', decision: 'hide', why: 'no message destination' }] }
  }
  return { page, kit, row, plan }
}

test('one exact contact owner unifies form, metadata, link and slug writes despite live alias drift', async () => {
  const { page, kit, row, plan } = fixture()
  const original = JSON.stringify({ kit, plan })
  assert.deepEqual(rowsOpening(page, [row]), [], 'legacy path-only lookup cannot infer a contact owner')
  assert.deepEqual(rowsOpening(page, [row], null, kit), [row])
  const calls = []
  const call = async (action, params) => {
    calls.push({ action, params })
    if (action === 'content.list')
      return { ok: true, items: params.offset === 0 ? [structuredClone(row)] : [] }
    if (action === 'content.get') return { ok: true, item: structuredClone(row) }
    if (action === 'content.update') {
      Object.assign(row, params.fields)
      if (params.fields.alias) row.path = params.fields.alias
      return { ok: true, alias: row.alias, item: structuredClone(row) }
    }
    return { ok: false, error: 'unexpected_action' }
  }
  const door = { apply: ({ action, params }) => call(action, params) }
  const forms = await closeForms({ door, siteKey: 'fictional.test', plan, kit })
  assert.equal(forms[0].status, 'hidden')
  assert.equal(JSON.parse(row.params).show_email_form, '0')
  const results = new Map()
  await writePageMeta({
    call,
    kit,
    pageMeta: { [page.id]: { title: 'Contact the cafe', description: 'Call the cafe.' } },
    hide: [],
    results
  })
  assert.equal(results.get(`${page.id}:title`).status, 'written')
  assert.equal(JSON.parse(row.params).page_title, 'Contact the cafe')
  assert.equal(JSON.parse(row.params).menu_text, 1)
  const target = linkTarget(page.id, { kit, plan, facts: new Map(), rows: [row], articles: new Map() })
  assert.equal(target.url, 'index.php?Itemid=17')
  assert.deepEqual(
    routeOrders({ plan, kit, rows: [row] }).map((r) => [r.itemId, r.from]),
    [[17, '/contact']]
  )
  const routed = await runRouteStage({
    door,
    siteKey: 'fictional.test',
    kit,
    plan,
    keptPages: [{ id: page.id, path: page.path }]
  })
  assert.equal(routed.routes[0].outcome, 'written')
  assert.equal(routed.routes[0].from, '/contact')
  assert.deepEqual(routed.keptPages, [{ id: page.id, path: '/contact-us' }])
  assert.equal(row.alias, 'contact-us')
  const restored = await restoreRoutes({ door, siteKey: 'fictional.test', routes: routed.routes })
  assert.equal(restored.stop, undefined)
  assert.equal(restored.restored.length, 1)
  assert.equal(row.alias, 'contact', 'rerun restoration uses the real original alias')
  assert.ok(calls.filter((c) => c.action === 'content.update').every((c) => c.params.id === 17))
  assert.equal(JSON.stringify({ kit, plan }), original)
})

test('an exact published kit path retains precedence over contact-owner fallback', () => {
  const { page, kit, row } = fixture()
  const exact = {
    ...row,
    id: 18,
    path: 'contact-us',
    alias: 'contact-us',
    link: 'index.php?option=com_content&view=article&id=4'
  }
  assert.deepEqual(rowsOpening(page, [row, exact], 'mainmenu', kit), [exact])
})

test('contact fallback refuses ambiguity, unrelated owners, other components and unsafe menu rows', () => {
  for (const scenario of [
    'duplicate',
    'two-bodies',
    'wrong-id',
    'wrong-component',
    'wrong-view',
    'admin',
    'unpublished',
    'external',
    'url-item',
    'alias-item',
    'duplicate-query',
    'conflicting-owner',
    'invalid-menu-id',
    'unknown-body'
  ]) {
    const { page, kit, row } = fixture()
    const rows = [row]
    if (scenario === 'duplicate') rows.push({ ...row, id: 18, path: 'other-contact' })
    if (scenario === 'two-bodies') {
      kit.blocks.push({ id: 'body-other', source: { entity: 'contact-4' } })
      page.blocks[1440].push('body-other')
    }
    if (scenario === 'wrong-id') row.link = row.link.replace('id=3', 'id=4')
    if (scenario === 'wrong-component') row.link = row.link.replace('com_contact', 'com_content')
    if (scenario === 'wrong-view') row.link = row.link.replace('view=contact', 'view=category')
    if (scenario === 'admin') row.client_id = 1
    if (scenario === 'unpublished') row.published = 0
    if (scenario === 'external') row.link = `https://external.invalid/${row.link}`
    if (scenario === 'url-item') row.type = 'url'
    if (scenario === 'alias-item') row.type = 'alias'
    if (scenario === 'duplicate-query') row.link += '&id=4'
    if (scenario === 'conflicting-owner') kit.blocks[0].source.owner = 'contact-4'
    if (scenario === 'invalid-menu-id') row.id = 'not-an-id'
    if (scenario === 'unknown-body') kit.blocks[0].source.entity = 'module-3'
    assert.deepEqual(rowsOpening(page, rows, 'mainmenu', kit), [], scenario)
  }
})
