/**
 * Which pages the visual check looks at, and the "before" a write is held for (`check-pages.mjs`,
 * council 20/10/2026): a turn without the Browser tab's picture has one drawn of the page its first
 * write targets, before that write, at most 5 s; a write to an element other pages show has up to two
 * of them drawn too. Every rule here without docker.
 *
 *   node --test packages/tools/tracy-site-tools/test/check-pages.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCommentTurn } from '../../../ui/tracy-chat-input/src/client/comment-turn.mjs'
import {
  EXTRA_PAGES_MAX,
  asksFirst,
  beforePage,
  createPageReads,
  createRecordPages,
  earlyPicture,
  earlyView,
  extraPages,
  holdForBefore,
  pageReadsOf,
  usageOfMenuIds,
  writeReach
} from '../src/host/check-pages.mjs'
import { checkReportOf, runVisualCheck } from '../src/host/visual-check.mjs'

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const site = (action, params) => ({ name: 'tracy_site', arguments: { action, params } })
const emdash = (tool, args) => ({ name: 'tracy_emdash', arguments: { tool, arguments: args } })

/** A turn's ask with no picture from before (no Browser tab, Voice, a comment whose picture was not ready). */
const bare = (over = {}) => ({
  turn: 3,
  text: 'Make the heading say Prices',
  comment: false,
  at: 1000,
  before: null,
  checked: false,
  ...over
})

/** A drawer that answers every page at once and records what it drew. */
function drawer({ ms = 0, fail = null } = {}) {
  const drawn = []
  return {
    drawn,
    draw: (view) =>
      new Promise((resolve) => {
        drawn.push(view.path)
        const answer = fail?.(view) ?? { ok: true, jpeg: JPEG, y: 0, loaded: true }
        if (ms === 0) resolve(answer)
        else setTimeout(() => resolve(answer), ms)
      })
  }
}

test('writeReach, WordPress: a post is its own page, a template part or menu is every page, a synced block some', () => {
  assert.deepEqual(writeReach(site('content.update', { kind: 'post', id: 12, fields: { title: 'x' } })), {
    page: '/?p=12',
    shared: null,
    sentence: ''
  })
  const part = writeReach(site('content.update', { kind: 'templatePart', key: 'header', fields: {} }))
  assert.equal(part.shared, 'site')
  assert.equal(part.page, null)
  assert.match(part.sentence, /every page/)
  const types = { 5: 'wp_navigation', 6: 'wp_block', 7: 'wp_global_styles', 8: 'page' }
  const known = { postTypeOf: (id) => types[id] ?? null }
  assert.equal(writeReach(site('content.update', { kind: 'post', id: 5, fields: {} }), known).shared, 'site')
  assert.equal(writeReach(site('content.update', { kind: 'post', id: 6, fields: {} }), known).shared, 'some')
  assert.equal(writeReach(site('content.update', { kind: 'post', id: 7, fields: {} }), known).shared, 'site')
  assert.equal(writeReach(site('content.update', { kind: 'post', id: 8, fields: {} }), known).page, '/?p=8')
  // a create names no page yet
  assert.equal(writeReach(site('content.update', { kind: 'post', id: 0, fields: {} })).page, null)
})

test('writeReach, Joomla: an article is its own page, a module the pages it is assigned to, a menu every page', () => {
  assert.equal(
    writeReach(site('content.update', { kind: 'article', id: 4, fields: {} })).page,
    '/index.php?option=com_content&view=article&id=4'
  )
  const module = writeReach(site('content.update', { kind: 'module', id: 90, fields: {} }))
  assert.equal(module.shared, 'some')
  assert.match(module.sentence, /every page it is assigned to/)
  assert.equal(writeReach(site('content.update', { kind: 'menuItem', id: 3, fields: {} })).shared, 'site')
})

test('writeReach, EmDash: the site entry and the menu are every page; an entry is its learned address', () => {
  assert.equal(
    writeReach(emdash('content_update', { collection: 'site', id: 'S1', data: {} })).shared,
    'site'
  )
  assert.equal(writeReach(emdash('menu_set_items', { name: 'primary', items: [] })).shared, 'site')
  const pages = createRecordPages()
  pages.learnEmdash(
    'ed1',
    { tool: 'schema_list_collections' },
    {
      ok: true,
      result: {
        items: [
          { slug: 'about', urlPattern: '/about' },
          { slug: 'posts', urlPattern: '/blog/{slug}' }
        ]
      }
    }
  )
  pages.learnEmdash(
    'ed1',
    { tool: 'content_get', arguments: { collection: 'posts', id: '01P' } },
    {
      ok: true,
      result: {
        content: [
          { type: 'text', text: JSON.stringify({ item: { id: '01P', type: 'posts', slug: 'hello' } }) }
        ]
      }
    }
  )
  const known = { emdashPageOf: (c, id) => pages.emdashPageOf('ed1', c, id) }
  assert.equal(
    writeReach(emdash('content_update', { collection: 'posts', id: '01P', data: {} }), known).page,
    '/blog/hello'
  )
  assert.equal(
    writeReach(emdash('content_update', { collection: 'about', id: '01A', data: {} }), known).page,
    '/about'
  )
  // never seen: no page named, never guessed
  assert.equal(
    writeReach(emdash('content_update', { collection: 'posts', id: '01Q', data: {} }), known).page,
    null
  )
  assert.equal(pages.emdashPageOf('ed2', 'about', '01A'), null, 'another site learned nothing')
})

test('writeReach, a look: its page; at site scope, a confirmed header element or a stylesheet, every page', () => {
  assert.deepEqual(
    writeReach(site('look.set', { path: '/pricing', scope: 'page', selector: 'h1', set: { color: 'red' } })),
    { page: '/pricing', shared: null, sentence: '' }
  )
  assert.equal(writeReach(site('look.set', { path: '/', scope: 'site', set: {} })).shared, 'site')
  assert.equal(
    writeReach(site('look.set', { path: '/', scope: 'element', confirm: true, set: {} })).shared,
    'site'
  )
  assert.equal(writeReach(site('theme.style', { style: 'x' })).shared, 'site')
  const css = { name: 'edit', arguments: { file_path: '/sites/a/.webroot/wp-content/themes/t/style.css' } }
  assert.equal(writeReach(css).shared, 'site')
  // a shell command names no page: nothing is guessed for it
  assert.deepEqual(writeReach({ name: 'bash', arguments: { command: 'wp post update 7 --post_title=X' } }), {
    page: null,
    shared: null,
    sentence: ''
  })
})

test('beforePage: a comment’s page first, then the write’s own; a shared one where the conversation read, else home', () => {
  const own = { page: '/?p=12', shared: null, sentence: '' }
  const shared = { page: null, shared: 'site', sentence: '' }
  assert.equal(beforePage(own, { comment: '/contact', lastRead: '/about' }), '/contact')
  assert.equal(beforePage(own, { comment: null, lastRead: '/about' }), '/?p=12')
  assert.equal(beforePage(shared, { comment: null, lastRead: '/about' }), '/about')
  assert.equal(beforePage(shared, { comment: null, lastRead: null }), '/')
  // 🔒 a record with no page of its own is never looked at on a page only read
  assert.equal(
    beforePage({ page: null, shared: null, sentence: '' }, { comment: null, lastRead: '/about' }),
    null
  )
})

test('extraPages: home, then the read page most different in length; nothing for an element only some pages show', () => {
  const reads = [
    { path: '/about', chars: 1200 },
    { path: '/blog/long', chars: 9000 },
    { path: '/contact', chars: 1000 },
    { path: '/look-only', chars: null }
  ]
  const site = { page: null, shared: 'site', sentence: '' }
  assert.deepEqual(extraPages(site, { main: '/about', reads }), ['/', '/blog/long'])
  assert.deepEqual(extraPages(site, { main: '/', reads }), ['/blog/long'], 'home is the page already checked')
  assert.deepEqual(extraPages(site, { main: '/about', reads: [] }), ['/'], 'never padded')
  assert.ok(extraPages(site, { main: '/x', reads }).length <= EXTRA_PAGES_MAX)
  assert.deepEqual(extraPages({ ...site, shared: 'some' }, { main: '/about', reads }), [])
  assert.deepEqual(extraPages({ ...site, shared: null }, { main: '/about', reads }), [])
})

test('pageReadsOf + createPageReads: the pages read with their length, newest first, one entry a page', () => {
  assert.deepEqual(pageReadsOf({ path: '/about' }, { ok: true, text: 'abcd' }), [
    { path: '/about', chars: 4 }
  ])
  assert.deepEqual(
    pageReadsOf(
      { paths: ['/a', '/b'] },
      {
        ok: true,
        pages: [
          { path: '/a', text: 'xy' },
          { path: '/b', ok: false }
        ]
      }
    ),
    [{ path: '/a', chars: 2 }]
  )
  assert.deepEqual(pageReadsOf({ path: '/x' }, { ok: false }), [])
  const reads = createPageReads()
  reads.note('s', [{ path: '/a', chars: 1 }])
  reads.note('s', [{ path: '/b/', chars: 2 }])
  reads.note('s', [{ path: '/a/', chars: 3 }])
  assert.deepEqual(reads.of('s'), [
    { path: '/a/', chars: 3 },
    { path: '/b/', chars: 2 }
  ])
})

test('🔒 no picture from before: the first write is held until its page is drawn, then goes; the check runs on it', async () => {
  const ask = bare()
  const d = drawer({ ms: 20 })
  const held = await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'post', id: 12, fields: {} })),
    reads: [],
    draw: d.draw
  })
  assert.deepEqual(d.drawn, ['/?p=12'])
  assert.deepEqual(held.drew, ['/?p=12'])
  assert.equal(ask.before?.view.path, '/?p=12')
  assert.deepEqual(
    { w: ask.before.view.w, h: ask.before.view.h, y: ask.before.view.y },
    { w: 1280, h: 800, y: 0 }
  )
  // the check then compares that page
  const result = await runVisualCheck({
    mode: 'on',
    ask: { ...ask, checked: true },
    turn: 3,
    events: [
      { type: 'turn/start', data: { turn: 3 } },
      {
        type: 'tool/call',
        data: {
          name: 'tracy_site',
          arguments: { action: 'content.update', params: { kind: 'post', id: 12 } }
        }
      }
    ],
    eyes: async () => ({ eyes: { provider: 'p', model: 'm' }, agentSees: false }),
    capture: async () => ({ ok: true, jpeg: JPEG, y: 0, loaded: true }),
    store: async () => ({ id: 'img' }),
    llm: llmOf('{"verdict":"shown","target":"the heading","seen":"Prices"}').runtime
  })
  assert.equal(result.status, 'judged')
  assert.equal(/** @type {any} */ (result).path, '/?p=12')
})

test('🔒 a draw that is late: the write goes when the budget is out, the late picture is never the "before"', async () => {
  const ask = bare()
  const d = drawer({ ms: 200 })
  const started = Date.now()
  const held = await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'post', id: 12, fields: {} })),
    reads: [],
    draw: d.draw,
    budgetMs: 40
  })
  assert.ok(Date.now() - started < 150, 'held no longer than the budget')
  assert.equal(held.missing, 'capture-timeout')
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(ask.before, null, 'the drawing that finished after the write is dropped')
  const result = await runVisualCheck({
    mode: 'on',
    ask: { ...ask, checked: true },
    turn: 3,
    events: [
      { type: 'turn/start', data: { turn: 3 } },
      { type: 'tool/call', data: { name: 'bash', arguments: { command: 'wp option update x' } } }
    ],
    eyes: async () => null,
    capture: async () => ({ ok: true, jpeg: JPEG, y: 0, loaded: true }),
    store: async () => ({ id: 'img' }),
    llm: llmOf('{}').runtime
  })
  assert.equal(/** @type {any} */ (result).reason, 'no-before: capture-timeout')
  assert.deepEqual(checkReportOf(/** @type {any} */ (result)), {
    visual: 'skipped',
    note: 'no-before-capture-timeout'
  })
})

// The coordinator, 20/10/2026: a write with no nameable page must not cost the check its before.
test('🔒 a write whose page cannot be named draws nothing, and leaves the chance to the next write', async () => {
  const ask = bare()
  const d = drawer()
  const first = await holdForBefore({
    ask,
    reach: writeReach({ name: 'bash', arguments: { command: 'wp post update 7' } }),
    reads: [{ path: '/about', chars: 10 }],
    draw: d.draw
  })
  assert.equal(first.missing, 'no-target')
  assert.equal(ask.hold?.main, false, 'the chance is not used')
  // a media write names no page either
  await holdForBefore({
    ask,
    reach: writeReach(site('media.upload', { file: 'a.jpg' })),
    reads: [],
    draw: d.draw
  })
  assert.deepEqual(d.drawn, [])
  await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'post', id: 12, fields: {} })),
    reads: [],
    draw: d.draw
  })
  assert.deepEqual(d.drawn, ['/?p=12'], 'the first write that names its page is drawn')
  assert.equal(ask.before?.view.path, '/?p=12')
  assert.equal(ask.missing, undefined, 'and the earlier no-target is no longer the reason')
})

test('🔒 the 10 s budget is shared by every hold of the turn, and is the default', async () => {
  // 10 s, longer than one drawing (about 5–7 s, #1384). 9,990 ms already spent: what is left of the
  // default budget is 10 ms, whatever the drawing does
  const ask = bare({ hold: { spentMs: 9990, main: false, shared: false, pending: null } })
  const never = { draw: () => new Promise(() => {}) }
  const held = await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'post', id: 12, fields: {} })),
    reads: [],
    draw: never.draw
  })
  assert.equal(held.missing, 'capture-timeout')
  const spent = bare({ hold: { spentMs: 10_000, main: false, shared: false, pending: null } })
  const d = drawer()
  const none = await holdForBefore({
    ask: spent,
    reach: writeReach(site('content.update', { kind: 'post', id: 12, fields: {} })),
    reads: [],
    draw: d.draw
  })
  assert.deepEqual(d.drawn, [], 'nothing is drawn once the budget is gone')
  assert.equal(none.missing, 'capture-timeout')
})

// 23/10/2026: on production every writing turn from 19/10 closed `no-before` (42 of 42) — the hold had
// 5 s for a drawing of 5–7 s, and a template file or a shell write named no page at all.
test('🔒 the early picture: a write naming no page keeps it as the fallback; a later write naming its page is still drawn', async () => {
  const ask = bare()
  const d = drawer({ ms: 20 })
  const early = earlyPicture({
    view: earlyView({
      comment: null,
      open: { path: '/menu', y: 300, w: 1440, h: 900, dark: false },
      lastRead: null
    }),
    draw: d.draw,
    lastWrite: () => null,
    wroteAt: () => ask.wroteAt
  })
  const held = await holdForBefore({
    ask,
    reach: writeReach({
      name: 'edit',
      arguments: { file_path: '/site/.webroot/templates/ja_seven/index.php' }
    }),
    reads: [{ path: '/about', chars: 10 }],
    draw: d.draw,
    early
  })
  assert.deepEqual(d.drawn, ['/menu'], 'one drawing, the early one')
  assert.deepEqual(held.drew, ['/menu'])
  assert.equal(held.missing, null)
  assert.equal(ask.before, null, 'not the main before')
  assert.equal(ask.fallback?.view.path, '/menu')
  assert.deepEqual(
    { y: ask.fallback.view.y, w: ask.fallback.view.w },
    { y: 300, w: 1440 },
    "the customer's window and scroll"
  )
  assert.equal(ask.hold?.main, false, 'the chance at a main picture stays (a shell read counts as a write)')
  // the check uses the fallback when nothing better came
  const result = await runVisualCheck({
    mode: 'on',
    ask: { ...ask, checked: true },
    turn: 3,
    events: [
      { type: 'turn/start', data: { turn: 3 } },
      {
        type: 'tool/call',
        data: { name: 'edit', arguments: { file_path: '/site/.webroot/templates/ja_seven/index.php' } }
      }
    ],
    eyes: async () => ({ eyes: { provider: 'p', model: 'm' }, agentSees: false }),
    capture: async () => ({ ok: true, jpeg: JPEG, y: 0, loaded: true }),
    store: async () => ({ id: 'img' }),
    llm: llmOf('{"verdict":"shown","target":"the menu","seen":"in one row"}').runtime
  })
  assert.equal(result.status, 'judged')
  assert.equal(/** @type {any} */ (result).path, '/menu')
  // a later write that names its page is drawn on it, and that is the before
  await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'post', id: 12, fields: {} })),
    reads: [],
    draw: d.draw,
    early
  })
  assert.deepEqual(d.drawn, ['/menu', '/?p=12'])
  assert.equal(ask.before?.view.path, '/?p=12')
})

test('🔒 the early picture serves a stylesheet every page loads, and a write on its own page; never another page', async () => {
  const css = { name: 'edit', arguments: { file_path: '/site/.webroot/templates/ja_seven/css/custom.css' } }
  const a = bare()
  const d = drawer()
  await holdForBefore({
    ask: a,
    reach: writeReach(css),
    reads: [],
    draw: d.draw,
    early: earlyPicture({
      view: earlyView({ comment: null, open: null, lastRead: '/news' }),
      draw: d.draw,
      lastWrite: () => null,
      wroteAt: () => undefined
    })
  })
  assert.equal(a.before?.view.path, '/news', 'the early page, not home')
  assert.deepEqual(d.drawn.slice(0, 1), ['/news'])

  // a write that names ANOTHER page is drawn on that page
  const b = bare()
  const e = drawer()
  await holdForBefore({
    ask: b,
    reach: writeReach(site('content.update', { kind: 'post', id: 12, fields: {} })),
    reads: [],
    draw: e.draw,
    early: earlyPicture({
      view: earlyView({ comment: null, open: null, lastRead: null }),
      draw: e.draw,
      lastWrite: () => null,
      wroteAt: () => undefined
    })
  })
  assert.equal(b.before?.view.path, '/?p=12')
})

test('🔒 the early picture is never a "before" once the site was written under it', async () => {
  // this turn's first write went while it was drawing
  const ask = bare()
  const d = drawer({ ms: 30 })
  const early = earlyPicture({
    view: earlyView({ comment: null, open: null, lastRead: null }),
    draw: d.draw,
    lastWrite: () => null,
    wroteAt: () => ask.wroteAt
  })
  ask.wroteAt = 1
  assert.equal(await early.picture, 'written-first')
  const held = await holdForBefore({
    ask,
    reach: writeReach({ name: 'bash', arguments: { command: 'zip -r t.zip templates' } }),
    reads: [],
    draw: d.draw,
    early
  })
  assert.equal(held.missing, 'written-first')
  assert.equal(ask.before, null)
  // another conversation wrote the site after it started
  let last = null
  const late = earlyPicture({
    view: earlyView({ comment: null, open: null, lastRead: null }),
    draw: (view) => {
      last = Date.now() + 1
      return d.draw(view)
    },
    lastWrite: () => last,
    wroteAt: () => undefined
  })
  assert.equal(await late.picture, 'written-first')
  // a drawing that failed says why
  const failed = earlyPicture({
    view: earlyView({ comment: null, open: null, lastRead: null }),
    draw: async () => ({ ok: false, code: 'NO_BROWSER' }),
    lastWrite: () => null,
    wroteAt: () => undefined
  })
  assert.equal(await failed.picture, 'capture-NO_BROWSER')
})

test('the early picture not done within the budget: the write goes, the reason is capture-timeout', async () => {
  const ask = bare()
  const held = await holdForBefore({
    ask,
    reach: writeReach({ name: 'bash', arguments: { command: 'wp post update 7' } }),
    reads: [],
    draw: drawer().draw,
    early: { path: '/', picture: new Promise(() => {}) },
    budgetMs: 30
  })
  assert.equal(held.missing, 'capture-timeout')
  assert.equal(ask.before, null)
})

test('earlyView: the comment page, else the open page in its window and scroll, else the last read, else home', () => {
  const open = { path: '/about', y: 120, w: 390, h: 844, dark: true }
  assert.deepEqual(earlyView({ comment: '/news', open, lastRead: '/x' }), {
    path: '/news',
    y: 0,
    w: 390,
    h: 844,
    dark: true
  })
  assert.deepEqual(earlyView({ comment: null, open, lastRead: '/x' }), open)
  assert.deepEqual(earlyView({ comment: null, open: null, lastRead: '/x' }), {
    path: '/x',
    y: 0,
    w: 1280,
    h: 800,
    dark: false
  })
  assert.deepEqual(earlyView({ comment: null, open: null, lastRead: null }).path, '/')
})

test('checkReportOf keeps why a turn had no "before"; other reasons keep only their head', () => {
  assert.deepEqual(checkReportOf({ status: 'skipped', reason: 'no-before: capture-timeout' }), {
    visual: 'skipped',
    note: 'no-before-capture-timeout'
  })
  assert.deepEqual(checkReportOf({ status: 'skipped', reason: 'no-before: written-first' }), {
    visual: 'skipped',
    note: 'no-before-written-first'
  })
  assert.deepEqual(checkReportOf({ status: 'skipped', reason: 'no-before' }), {
    visual: 'skipped',
    note: 'no-before'
  })
  assert.deepEqual(checkReportOf({ status: 'skipped', reason: 'judge-failed: model x said y' }), {
    visual: 'skipped',
    note: 'judge-failed'
  })
})

test('writeReach, writes with no single record: a replace on its page, a sweep shared; page.create home; media none', () => {
  assert.deepEqual(writeReach(site('content.replace', { find: 'a', replace: 'b', path: '/about' })), {
    page: '/about',
    shared: null,
    sentence: ''
  })
  assert.equal(writeReach(site('content.replace', { find: 'a', replace: 'b' })).page, '/')
  assert.equal(writeReach(site('content.replace', { find: 'a', replace: 'b', all: true })).shared, 'site')
  assert.equal(
    writeReach(site('content.replace', { find: 'a', replace: 'b', where: 'footer' })).shared,
    'site'
  )
  // the agent's own dryRun of the same call found its places in the header
  const pages = createRecordPages()
  const call = { find: 'Call 0909', replace: 'Call 0808', path: '/about' }
  pages.learnSite(
    'j1',
    's1',
    { action: 'content.replace', params: { ...call, dryRun: true } },
    {
      ok: true,
      would: [{ at: 'module-90.0', where: 'header', before: 'Call 0909', after: 'Call 0808' }]
    }
  )
  const known = { replaceRegions: (p) => pages.replaceRegions('s1', p) }
  assert.equal(writeReach(site('content.replace', call), known).shared, 'site')
  assert.equal(
    writeReach(site('content.replace', { ...call, path: '/x' }), known).shared,
    null,
    'another call'
  )
  assert.deepEqual(writeReach(site('page.create', { title: 'FAQ', body: [] })), {
    page: '/',
    shared: 'site',
    sentence: 'This adds a page and a link to it in the site menu.'
  })
  for (const action of ['media.upload', 'media.draw', 'media.delete'])
    assert.deepEqual(writeReach(site(action, { file: 'a.jpg' })), { page: null, shared: null, sentence: '' })
})

/** A Joomla contract inspect: two pages, a module on all, one on the about page only, the identity block. */
const INSPECT = {
  ok: true,
  pages: [
    {
      entity: 'menuItem-599',
      route: 'home',
      link: 'index.php?option=com_content&view=featured',
      assignedModules: [
        { entity: 'module-428', assignmentMode: 'all', menuIds: [0] },
        { entity: 'module-500', assignmentMode: 'include', menuIds: [599, 600] }
      ]
    },
    {
      entity: 'menuItem-600',
      route: 'about',
      link: 'index.php?option=com_content&view=article&id=555',
      assignedModules: [
        { entity: 'module-428', assignmentMode: 'all', menuIds: [0] },
        { entity: 'module-500', assignmentMode: 'include', menuIds: [599, 600] },
        { entity: 'module-501', assignmentMode: 'include', menuIds: [600] }
      ]
    }
  ],
  slots: [
    { key: 'module-428.0', entity: 'module-428' },
    { key: 'module-501.0', entity: 'module-501' },
    { key: 'article-555.title', entity: 'article-555' },
    { key: 'module-9.0', entity: 'module-9', label: '[Tracy] Site identity / phone' }
  ]
}

test('Joomla module reach: from the contract inspect, all → every page, a list → those pages', () => {
  const pages = createRecordPages()
  pages.learnSite('j1', 's1', { action: 'content.contract', params: { operation: 'inspect' } }, INSPECT)
  assert.deepEqual(pages.moduleUsage('j1', 428), { all: true, pages: [] })
  assert.deepEqual(pages.moduleUsage('j1', 500), { all: false, pages: ['/', '/index.php?Itemid=600'] })
  assert.deepEqual(pages.moduleUsage('j1', 501), { all: false, pages: ['/index.php?Itemid=600'] })
  assert.equal(pages.moduleUsage('j1', 77), null, 'a module nothing says anything about')
  // contract apply: the slot's record, its pages
  assert.deepEqual(
    pages.contractReach('j1', { operation: 'apply', changes: { 'article-555.title': 'About us' } }),
    {
      page: '/index.php?Itemid=600',
      shared: null,
      sentence: ''
    }
  )
  assert.equal(pages.contractReach('j1', { changes: { 'module-428.0': 'x' } })?.shared, 'site')
  assert.equal(pages.contractReach('j1', { changes: { 'module-9.0': '0909' } })?.shared, 'site', 'identity')
  const two = pages.contractReach('j1', { changes: { 'module-500.0': 'x' } })
  assert.equal(two?.shared, 'some')
  assert.deepEqual(two?.usedOn, ['/', '/index.php?Itemid=600'])
  assert.equal(pages.contractReach('j1', { changes: { 'nothing.0': 'x' } }), null)
  const known = { contractReach: (p) => pages.contractReach('j1', p) }
  assert.equal(
    writeReach(site('content.contract', { operation: 'apply', changes: { 'module-501.0': 'x' } }), known)
      .page,
    '/index.php?Itemid=600'
  )
})

test('Joomla module reach: from moduleAssignment menuids — 0 or a negative is every page, ids are those pages', () => {
  const home = (id) => id === 101
  assert.deepEqual(usageOfMenuIds('[0]', home), { all: true, pages: [] })
  assert.deepEqual(usageOfMenuIds('[-104]', home), { all: true, pages: [] })
  assert.deepEqual(usageOfMenuIds('[101,104]', home), { all: false, pages: ['/', '/index.php?Itemid=104'] })
  assert.deepEqual(usageOfMenuIds('[]', home), { all: false, pages: [] })
  assert.equal(usageOfMenuIds('nope', home), null)
  const pages = createRecordPages()
  pages.learnSite(
    'j2',
    's1',
    { action: 'content.list', params: { kind: 'menuItem' } },
    {
      ok: true,
      items: [
        { id: 101, title: 'Home', home: 1 },
        { id: 104, title: 'About', home: 0 }
      ]
    }
  )
  pages.learnSite(
    'j2',
    's1',
    { action: 'content.get', params: { kind: 'moduleAssignment', id: 90 } },
    {
      ok: true,
      item: { menuids: '[101,104,105]' }
    }
  )
  assert.deepEqual(pages.moduleUsage('j2', 90), {
    all: false,
    pages: ['/', '/index.php?Itemid=104', '/index.php?Itemid=105']
  })
})

test('🔒 a module write: its assignment asked within the budget; home and one other assigned page drawn', async () => {
  const ask = bare()
  const d = drawer()
  const asked = []
  await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'module', id: 90, fields: {}, confirm: true })),
    reads: [],
    draw: d.draw,
    usage: async (reach) => {
      asked.push(reach.module)
      return { all: false, pages: ['/index.php?Itemid=104', '/', '/index.php?Itemid=105'] }
    }
  })
  assert.deepEqual(asked, [90])
  assert.deepEqual(d.drawn, ['/', '/index.php?Itemid=104'], 'home first (listed), then another assigned page')
  // assigned to every page: home and the most different page read
  const ask2 = bare()
  const d2 = drawer()
  await holdForBefore({
    ask: ask2,
    reach: writeReach(site('content.update', { kind: 'module', id: 91, fields: {}, confirm: true })),
    reads: [
      { path: '/about', chars: 100 },
      { path: '/blog', chars: 9000 }
    ],
    draw: d2.draw,
    usage: async () => ({ all: true, pages: [] })
  })
  assert.deepEqual(d2.drawn, ['/about', '/', '/blog'])
  // nobody says where it is (the read failed, or never came within the budget): only the main page
  const ask3 = bare()
  const d3 = drawer()
  await holdForBefore({
    ask: ask3,
    reach: writeReach(site('content.update', { kind: 'module', id: 92, fields: {}, confirm: true })),
    reads: [],
    draw: d3.draw,
    budgetMs: 40,
    usage: () => new Promise(() => {})
  })
  assert.deepEqual(d3.drawn, [], 'the usage read took the whole budget: nothing drawn, the write goes')
})

test('🔒 asksFirst: a call the door refuses CONFIRM_FIRST is not held; the same call after the yes is', () => {
  for (const call of [
    site('content.delete', { kind: 'post', id: 12 }),
    site('content.update', { kind: 'post', id: 12, fields: { post_status: 'draft' } }),
    site('content.update', { kind: 'templatePart', key: 'header', fields: {} }),
    site('content.update', { kind: 'module', id: 90, fields: {} }),
    site('look.set', { path: '/', scope: 'site', set: {} }),
    site('theme.style', { style: 'x' }),
    site('content.replace', { find: '$10', replace: '$12' }),
    emdash('content_update', { collection: 'site', id: 'S1', data: {} }),
    emdash('content_delete', { collection: 'posts', id: '01P' })
  ])
    assert.equal(asksFirst(call), true, JSON.stringify(call.arguments))
  for (const call of [
    site('content.update', { kind: 'templatePart', key: 'header', fields: {}, confirm: true }),
    site('content.update', { kind: 'post', id: 12, fields: { post_title: 'x' } }),
    site('look.set', { path: '/', scope: 'page', set: {} }),
    site('content.replace', { find: 'a', replace: 'b' }),
    emdash('content_update', { collection: 'site', id: 'S1', data: {}, confirm: true }),
    { name: 'bash', arguments: { command: 'wp post list' } }
  ])
    assert.equal(asksFirst(call), false, JSON.stringify(call.arguments))
  // a synced pattern the conversation read is shared too
  assert.equal(
    asksFirst(site('content.update', { kind: 'post', id: 6, fields: {} }), { postTypeOf: () => 'wp_block' }),
    true
  )
})

test('🔒 a shared write draws home and one other page before it, inside the same budget; once per turn', async () => {
  const ask = bare()
  const d = drawer()
  const reads = [
    { path: '/about', chars: 800 },
    { path: '/services', chars: 7000 },
    { path: '/team', chars: 900 }
  ]
  const reach = writeReach(site('content.update', { kind: 'templatePart', key: 'header', fields: {} }))
  const held = await holdForBefore({ ask, reach, reads, draw: d.draw })
  assert.deepEqual(d.drawn, ['/about', '/', '/services'], 'main page (last read), home, the most different')
  assert.deepEqual(held.drew, ['/about', '/', '/services'])
  assert.equal(ask.before?.view.path, '/about')
  assert.deepEqual(
    ask.extras?.map((e) => e.view.path),
    ['/', '/services']
  )
  assert.match(ask.agreed?.[0] ?? '', /every page/)
  // a second shared write, and any write after it, draws nothing more
  await holdForBefore({ ask, reach, reads, draw: d.draw })
  await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'post', id: 3, fields: {} })),
    reads,
    draw: d.draw
  })
  assert.equal(d.drawn.length, 3)
})

test('a non-shared write draws no other page; a tab picture already there draws nothing at all', async () => {
  const ask = bare()
  const d = drawer()
  await holdForBefore({
    ask,
    reach: writeReach(site('look.set', { path: '/pricing', scope: 'page', set: {} })),
    reads: [{ path: '/about', chars: 100 }],
    draw: d.draw
  })
  assert.deepEqual(d.drawn, ['/pricing'])
  assert.equal(ask.extras, undefined)

  const tab = bare({
    before: {
      view: { path: '/pricing', y: 0, w: 1000, h: 700, dark: false },
      jpeg: JPEG,
      y: 0,
      loaded: true,
      takenAt: 1
    }
  })
  const d2 = drawer()
  await holdForBefore({
    ask: tab,
    reach: writeReach(site('look.set', { path: '/pricing', scope: 'page', set: {} })),
    reads: [],
    draw: d2.draw
  })
  assert.deepEqual(d2.drawn, [])
})

test('a shared write with the tab’s picture draws only the other pages, in the tab’s window', async () => {
  const ask = bare({
    before: {
      view: { path: '/about', y: 300, w: 1000, h: 700, dark: true },
      jpeg: JPEG,
      y: 300,
      loaded: true,
      takenAt: 1
    }
  })
  const d = drawer()
  await holdForBefore({
    ask,
    reach: writeReach(emdash('content_update', { collection: 'site', id: 'S1', data: {} })),
    reads: [],
    window: { w: 1000, h: 700, dark: true },
    draw: d.draw
  })
  assert.deepEqual(d.drawn, ['/'])
  assert.deepEqual(ask.extras?.[0].view, { path: '/', y: 0, w: 1000, h: 700, dark: true })
  assert.equal(ask.before.view.path, '/about', 'the tab picture stays the main one')
})

test('a comment turn is drawn on the page the comment was pinned on', async () => {
  const text = buildCommentTurn({
    text: 'Bigger',
    element: { url: 'https://s.test/contact', selector: 'h1', label: 'heading', text: 'Hi', marks: [] },
    locate: null
  })
  const ask = bare({ comment: true, text })
  const d = drawer()
  await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'post', id: 12, fields: {} })),
    reads: [],
    draw: d.draw
  })
  assert.deepEqual(d.drawn, ['/contact'])
})

test('two writes sent at once wait for the same drawing: one picture, both go', async () => {
  const ask = bare()
  const d = drawer({ ms: 20 })
  const reach = writeReach(site('content.update', { kind: 'post', id: 12, fields: {} }))
  await Promise.all([
    holdForBefore({ ask, reach, reads: [], draw: d.draw }),
    holdForBefore({ ask, reach, reads: [], draw: d.draw })
  ])
  assert.deepEqual(d.drawn, ['/?p=12'])
})

test('🔒 a page that would not draw lets the write go and says why; a failed other page is only left out', async () => {
  const ask = bare()
  const failMain = drawer({ fail: () => ({ ok: false, code: 'NO_BROWSER' }) })
  const held = await holdForBefore({
    ask,
    reach: writeReach(site('content.update', { kind: 'templatePart', key: 'footer', fields: {} })),
    reads: [],
    draw: failMain.draw
  })
  assert.equal(held.missing, 'capture-NO_BROWSER')
  assert.deepEqual(failMain.drawn, ['/'], 'no other page drawn without a main one')

  const ask2 = bare()
  const failHome = drawer({ fail: (view) => (view.path === '/' ? { ok: false, code: 'LOOK_FAILED' } : null) })
  await holdForBefore({
    ask: ask2,
    reach: writeReach(site('content.update', { kind: 'templatePart', key: 'footer', fields: {} })),
    reads: [
      { path: '/about', chars: 100 },
      { path: '/blog', chars: 5000 }
    ],
    draw: failHome.draw
  })
  assert.equal(ask2.before?.view.path, '/about')
  assert.deepEqual(
    ask2.extras?.map((e) => e.view.path),
    ['/blog']
  )
})

/** A model runtime whose one answer is `answer`. */
function llmOf(answer) {
  const asked = []
  return {
    asked,
    runtime: {
      resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
      listModels: async () => [],
      stream: (options) => {
        asked.push(options)
        return (async function* () {
          yield { type: 'text-delta', text: answer }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })()
      }
    }
  }
}
