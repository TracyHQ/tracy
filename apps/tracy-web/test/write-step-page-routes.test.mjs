// Kept pages take the plan's slug at the end of the write step (ADR 0044, decision 20): the menu item that opens a page and the
// article it prints are renamed through `content.update`, a plugin from before that door is a failed line naming the release it
// needs, and a rerun gives the pages their demo addresses back first. Every site, page and row here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lookGuard } from '../src/write-step/look-guard.js'
import { addressAfter, routeLines, routeOrders, slugOf } from '../src/write-step/page-route-lines.js'
import { ALIAS_DOOR, restoreRoutes, runRouteStage } from '../src/write-step/page-route-stage.js'
import { runWriteStep } from '../src/write-step/write-step.js'
import { copy, fakeSite, frozenFiles, KIT, plan as basePlan, SITE } from './_write-step-run.mjs'

const KIT_PAGES = {
  pages: [
    { id: 'page-home', path: '/' },
    { id: 'page-lessons', path: '/lessons' },
    { id: 'page-lessons_rowing', path: '/lessons/rowing' },
    { id: 'page-lessons_climbing', path: '/lessons/climbing' },
    { id: 'page-team', path: '/team' }
  ]
}
const PLAN = {
  pages: [
    { id: 'page-home', decision: 'keep', slug: '' },
    { id: 'page-lessons', decision: 'keep', slug: 'Classes' },
    { id: 'page-lessons_rowing', decision: 'keep', slug: 'kayak-tours' },
    { id: 'page-lessons_climbing', decision: 'keep', slug: 'climbing' },
    { id: 'page-team', decision: 'drop', slug: 'people' }
  ]
}
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
  link: `index.php?option=com_content&view=article&id=${id + 100}`,
  ...extra
})
const ROWS = [
  item(101, 'home', 'home', 1, { home: 1, link: 'index.php?option=com_content&view=featured' }),
  item(10, 'lessons', 'lessons', 1, { link: 'index.php?option=com_content&view=category&id=8' }),
  item(11, 'rowing', 'lessons/rowing', 10),
  item(12, 'climbing', 'lessons/climbing', 10),
  item(13, 'team', 'team', 1)
]
const ARTICLES = [
  { kind: 'article', id: 111, alias: 'rowing', title: 'Rowing' },
  { kind: 'article', id: 112, alias: 'climbing', title: 'Climbing' }
]
const KEPT = [
  { id: 'page-home', path: '/' },
  { id: 'page-lessons', path: '/lessons' },
  { id: 'page-lessons_rowing', path: '/lessons/rowing' },
  { id: 'page-lessons_climbing', path: '/lessons/climbing' }
]

/** A site whose plugin renames a menu item through `alias` (the door of ALIAS_DOOR), or an older one. */
function routeSite({ older = null, refuse = () => null } = {}) {
  return fakeSite({
    records: [...ROWS, ...ARTICLES],
    refuseUpdate: (kind, id, fields) => {
      if (!('alias' in (fields ?? {}))) return null
      const refused = refuse(kind, id, fields)
      if (refused) return refused
      if (kind !== 'menuItem') return null
      if (older === 'ignores') return { ok: true, kind, id, created: false }
      if (older === 'refuses')
        return { ok: false, error: 'write_failed', message: 'no writable column for kind menuItem' }
      return null
    }
  })
}
/** The fake site's `content.update` stores the fields; a plugin with the door also answers the alias it holds now. */
function withAliasAnswer(site) {
  const inner = site.door.apply
  site.door.apply = async (call) => {
    const answer = await inner(call)
    if (
      call.action === 'content.update' &&
      call.params.kind === 'menuItem' &&
      answer?.ok &&
      'alias' in call.params.fields
    )
      return answer.kind ? answer : { ...answer, alias: call.params.fields.alias }
    return answer
  }
  return site
}

test('a slug is lower case ASCII joined by hyphens, and an address follows the renames above it', () => {
  assert.equal(slugOf('  Kayak Tours & More! '), 'kayak-tours-more')
  // An accented word, spelled by code point so the file stays plain ASCII.
  const accented = `Caf${String.fromCodePoint(0xe9)} Cr${String.fromCodePoint(0xe8)}me`
  assert.equal(slugOf(accented), 'cafe-creme')
  const rows = ROWS.map(({ kind: _kind, ...r }) => r)
  assert.equal(addressAfter(rows[2], rows, new Map([[10, 'classes']])), '/classes/rowing')
  assert.equal(addressAfter(rows[2], rows, new Map([[11, 'kayak-tours']])), '/lessons/kayak-tours')
})

test('every kept page with a plan slug has an order; the home page and a dropped page have none', () => {
  const rows = ROWS.map(({ kind: _kind, ...r }) => r)
  const orders = routeOrders({ plan: PLAN, kit: KIT_PAGES, rows, menutype: 'mainmenu' })
  assert.deepEqual(
    orders.map((o) => [o.pageId, o.itemId, o.articleId, o.alias, o.slug, o.from, o.to]),
    [
      ['page-lessons', 10, null, 'lessons', 'classes', '/lessons', '/classes'],
      ['page-lessons_rowing', 11, 111, 'rowing', 'kayak-tours', '/lessons/rowing', '/classes/kayak-tours'],
      ['page-lessons_climbing', 12, 112, 'climbing', 'climbing', '/lessons/climbing', '/classes/climbing']
    ]
  )
  assert.ok(orders.every((o) => !o.reason))
})

test('a sibling already at the slug, and a page no item opens, are orders with a reason and are never sent', () => {
  const rows = [
    ...ROWS.map(({ kind: _kind, ...r }) => r),
    { ...item(14, 'kayak-tours', 'lessons/kayak-tours', 10), kind: undefined }
  ]
  const plan = { pages: [...PLAN.pages, { id: 'page-lost', decision: 'keep', slug: 'lost' }] }
  const kit = { pages: [...KIT_PAGES.pages, { id: 'page-lost', path: '/nowhere' }] }
  const orders = routeOrders({ plan, kit, rows })
  assert.match(orders.find((o) => o.pageId === 'page-lessons_rowing').reason, /menu item 14 .* kayak-tours/)
  assert.match(
    orders.find((o) => o.pageId === 'page-lost').reason,
    /no published menu item opens page-lost at \/nowhere/
  )
})

test('the stage renames the item and its article, and the kept pages answer at their new addresses', async () => {
  const site = withAliasAnswer(routeSite())
  const out = await runRouteStage({
    door: site.door,
    siteKey: SITE,
    kit: KIT_PAGES,
    plan: PLAN,
    keptPages: KEPT,
    menutype: 'mainmenu'
  })
  assert.deepEqual(
    out.routes.map((r) => [r.pageId, r.from, r.to, r.outcome, r.article?.outcome ?? null]),
    [
      ['page-lessons', '/lessons', '/classes', 'written', null],
      ['page-lessons_rowing', '/lessons/rowing', '/classes/kayak-tours', 'written', 'written'],
      ['page-lessons_climbing', '/lessons/climbing', '/classes/climbing', 'already', 'already']
    ]
  )
  assert.deepEqual(
    out.keptPages.map((p) => p.path),
    ['/', '/classes', '/classes/kayak-tours', '/classes/climbing']
  )
  assert.deepEqual(
    site
      .updates()
      .map((c) => [c.params.kind, c.params.id, c.params.fields.alias, Boolean(c.params.apply_id)]),
    [
      ['menuItem', 10, 'classes', true],
      ['menuItem', 11, 'kayak-tours', true],
      ['article', 111, 'kayak-tours', true]
    ]
  )
  const line = (slot) => out.lines.find((l) => l.slot === slot)
  assert.deepEqual(
    [
      line('page-lessons_rowing:slug').status,
      line('page-lessons_rowing:slug').ordered,
      line('page-lessons_rowing:slug').readFrom
    ],
    [
      'written',
      'kayak-tours',
      { action: 'content.get', params: { kind: 'menuItem', id: 11 }, path: ['item', 'alias'] }
    ]
  )
  assert.equal(line('page-lessons_rowing:article-slug').readFrom.params.id, 111)
  assert.equal(line('page-lessons_climbing:slug').outcome, 'already')
})

test('a plugin that ignores the alias or refuses it is a failed line naming the release it needs, and nothing moves', async () => {
  for (const older of ['ignores', 'refuses']) {
    const site = routeSite({ older })
    const out = await runRouteStage({
      door: site.door,
      siteKey: SITE,
      kit: KIT_PAGES,
      plan: PLAN,
      keptPages: KEPT
    })
    const rowing = out.routes.find((r) => r.pageId === 'page-lessons_rowing')
    assert.equal(rowing.outcome, 'refused', older)
    assert.ok(rowing.reason.includes(ALIAS_DOOR), `${older}: ${rowing.reason}`)
    assert.equal(rowing.to, '/lessons/rowing', 'it answers at the demo address still')
    const line = out.lines.find((l) => l.slot === 'page-lessons_rowing:slug')
    assert.deepEqual([line.status, line.readFrom], ['failed', undefined])
    assert.deepEqual(
      out.keptPages.map((p) => p.path),
      KEPT.map((p) => p.path)
    )
  }
})

test('a plan without slugs reads nothing and writes nothing', async () => {
  const site = routeSite()
  const out = await runRouteStage({
    door: site.door,
    siteKey: SITE,
    kit: KIT_PAGES,
    plan: { pages: PLAN.pages.map((p) => ({ ...p, slug: '' })) },
    keptPages: KEPT
  })
  assert.deepEqual([out.routes, out.lines, out.keptPages, site.calls], [[], [], KEPT, []])
})

test('a rerun gives renamed pages their demo alias back, and a refusal stops it', async () => {
  const site = withAliasAnswer(routeSite())
  const routes = [
    {
      pageId: 'page-lessons',
      itemId: 10,
      slug: 'classes',
      from: '/lessons',
      to: '/classes',
      outcome: 'written'
    },
    {
      pageId: 'page-lessons_climbing',
      itemId: 12,
      slug: 'climbing',
      from: '/lessons/climbing',
      to: '/classes/climbing',
      outcome: 'already'
    },
    {
      pageId: 'page-lessons_rowing',
      itemId: 11,
      slug: 'kayak-tours',
      from: '/lessons/rowing',
      outcome: 'refused'
    }
  ]
  const done = await restoreRoutes({ door: site.door, siteKey: SITE, routes })
  assert.deepEqual(
    done.restored.map((r) => r.pageId),
    ['page-lessons']
  )
  assert.deepEqual(
    site.updates().map((c) => [c.params.id, c.params.fields.alias]),
    [[10, 'lessons']]
  )
  const stuck = routeSite({ older: 'refuses' })
  const refused = await restoreRoutes({ door: stuck.door, siteKey: SITE, routes })
  assert.equal(refused.stop.code, 'ROUTE_RESTORE_FAILED')
})

test('the look guard lets a slug through as an alias of a template row, and nothing else', async () => {
  const guard = lookGuard({ kit: {}, contentMap: null })
  const sent = []
  const door = guard.door({ apply: async (call) => (sent.push(call), { ok: true }) })
  const update = (kind, alias) =>
    door.apply({
      siteKey: SITE,
      action: 'content.update',
      params: { apply_id: 'a', kind, id: 11, fields: { alias } }
    })
  assert.equal((await update('menuItem', 'kayak-tours')).ok, true)
  assert.equal((await update('article', 'kayak-tours')).ok, true)
  assert.equal(sent.length, 2)
  // A finding does not hold the write back (ADR 0044, decision 26): it is sent and kept for the site check.
  await update('menuItem', 'Kayak <b>tours</b>')
  assert.equal(sent.length, 3)
  assert.match(JSON.stringify(guard.findings()), /alias/)
  assert.equal(guard.findings().length, 1)
})

test('the write step renames kept pages last, keeps the route table, and a rerun finds the pages again', async () => {
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', path: '/' },
    { id: 'page-about', path: '/about' }
  ]
  const plan = basePlan()
  plan.pages.find((p) => p.id === 'page-about').slug = 'coaching'
  const site = withAliasAnswer(
    fakeSite({
      records: [
        item(101, 'home', 'home', 1, { home: 1, link: 'index.php?option=com_content&view=featured' }),
        item(20, 'about', 'about', 1, { link: 'index.php?option=com_content&view=article&id=7' }),
        { kind: 'article', id: 7, alias: 'about', title: 'About' }
      ]
    })
  )
  const run = async (last = null) => {
    const frozen = frozenFiles({ plan, copy: copy() })
    try {
      return await runWriteStep({
        door: site.door,
        siteKey: SITE,
        kit,
        contentMap: null,
        files: frozen.files,
        sleep: async () => {},
        last
      })
    } finally {
      frozen.done()
    }
  }
  const report = await run()
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.deepEqual(
    report.routes.map((r) => [r.pageId, r.itemId, r.from, r.to, r.outcome, r.article.outcome]),
    [['page-about', 20, '/about', '/coaching', 'written', 'written']]
  )
  assert.deepEqual(report.keptPages, [
    { id: 'page-home', path: '/' },
    { id: 'page-about', path: '/coaching' }
  ])
  assert.equal(report.slots.find((s) => s.slot === 'page-about:slug').status, 'written')
  assert.equal(report.counts.failed, 0)
  assert.equal(typeof report.timings.routes, 'number')
  const aliases = site.updates().filter((c) => 'alias' in c.params.fields)
  assert.deepEqual(
    aliases.map((c) => [c.params.kind, c.params.fields.alias]),
    [
      ['menuItem', 'coaching'],
      ['article', 'coaching']
    ]
  )

  // The rerun: the item takes "about" back before any stage reads the menu, and "coaching" again at the end.
  const again = await run(report)
  assert.equal(again.status, 'done', JSON.stringify(again.cause))
  const later = site
    .updates()
    .filter((c) => 'alias' in c.params.fields)
    .slice(aliases.length)
  assert.deepEqual(
    later.map((c) => [c.params.kind, c.params.fields.alias]),
    [
      ['menuItem', 'about'],
      ['menuItem', 'coaching']
    ]
  )
  assert.equal(again.routes[0].to, '/coaching')
  assert.equal(again.routes[0].article.outcome, 'already')
})

test('route lines say what each write did', () => {
  const lines = routeLines([
    {
      pageId: 'p',
      slug: 's',
      itemId: 3,
      outcome: 'refused',
      reason: 'no',
      article: { id: 4, outcome: 'written' }
    }
  ])
  assert.deepEqual(
    lines.map((l) => [l.slot, l.part, l.owner, l.status, l.outcome, Boolean(l.readFrom)]),
    [
      ['p:slug', 'page-slug', 'plan', 'failed', 'refused', false],
      ['p:article-slug', 'article-slug', 'plan', 'written', 'written', true]
    ]
  )
})

// Card AL follow-up, 2026-11-06: a rerun with the same files stopped "Content changed; inspect again" with nothing written. The
// rerun gives renamed pages their demo alias back after its inspect, and a rename moves the revision the contract call must name,
// as the plugin's menu rows do; the call went with the revision read before. Invented site, pages and words.
test('a rerun with the same files after renamed pages is done, writes nothing new, and fails nothing', async () => {
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', path: '/' },
    { id: 'page-about', path: '/about' }
  ]
  const plan = basePlan()
  plan.pages.find((p) => p.id === 'page-about').slug = 'coaching'
  const site = withAliasAnswer(
    fakeSite({
      records: [
        item(101, 'home', 'home', 1, { home: 1, link: 'index.php?option=com_content&view=featured' }),
        item(20, 'about', 'about', 1, { link: 'index.php?option=com_content&view=article&id=7' }),
        { kind: 'article', id: 7, alias: 'about', title: 'About' }
      ],
      // A slot the plugin refuses on both runs, so the rerun still makes its contract call (as 96 refusals did on the bench).
      refuse: { 'module-2.1': { code: 'SLOT_TOO_LONG', message: 'too long for this slot' } }
    })
  )
  // As the plugin: a renamed menu item moves the revision, and the contract call names the revision it read.
  const inner = site.door.apply
  site.door.apply = async (call) => {
    if (
      call.action === 'content.contract' &&
      call.params.operation === 'apply' &&
      call.params.expected_revision !== site.revision.now
    )
      return { ok: false, error: 'contract_failed', message: 'Content changed; inspect again' }
    const answer = await inner(call)
    if (call.action === 'content.update' && call.params.kind === 'menuItem' && answer?.ok)
      site.revision.now = `${site.revision.now}+menu`
    return answer
  }
  const run = async (last = null) => {
    const frozen = frozenFiles({ plan, copy: copy() })
    try {
      return await runWriteStep({
        door: site.door,
        siteKey: SITE,
        kit,
        contentMap: null,
        files: frozen.files,
        sleep: async () => {},
        last
      })
    } finally {
      frozen.done()
    }
  }
  const first = await run()
  assert.equal(first.status, 'done', JSON.stringify(first.cause))
  assert.ok(first.counts.failed >= 1, 'the refused slot is a failed line')
  const again = await run(first)
  assert.equal(again.status, 'done', JSON.stringify(again.cause))
  assert.equal(again.counts.failed, first.counts.failed)
  assert.equal(again.counts.refused, first.counts.refused)
  assert.equal(again.slots.find((s) => s.slot === 'page-about:slug').status, 'written')
  assert.equal(again.routes[0].to, '/coaching')
})
