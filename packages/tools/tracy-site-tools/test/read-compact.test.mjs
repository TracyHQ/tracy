/**
 * Site reads as the model reads them: what it acts on, and the one call to the rest (05/10/2026).
 * Neutral fixtures shaped like the relay's answers (no page, field or label of any bench site).
 *
 *   node --test packages/tools/tracy-site-tools/test/read-compact.test.mjs
 *
 * Measured on 55 flow D runs (05/10/2026): the site reads' answers were 15.6% of all prompt tokens, and the
 * agent used one row or one topic of them — a Joomla page list in three languages (23,455 characters, still
 * cut), a Joomla page read (24–28k: the same `next` on every field, a constraints object of nulls, blocks with
 * no field), a describe document (54–84% `blockKinds`), a WordPress body of 10k read whole, and a Joomla
 * `extension.list` of 49,932 characters. Each test drives the tool's own call (`runSiteCall`) and checks the
 * shape, the size, that what the agent acts on is still there, and that `full:true` is the answer as it was.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCallMemory } from '../src/host/call-memory.mjs'
import { compactDescribe } from '../src/host/describe-compact.mjs'
import { planCall } from '../src/host/site.mjs'
import { cutContentList, runSiteCall } from '../src/host/site-call.mjs'

/** @param {unknown} v */
const size = (v) => JSON.stringify(v).length
/** @param {number} n */
const hex = (n) => n.toString(16).padStart(32, '0')

/**
 * A relay that answers from a script and records every call.
 * @param {(action: string, params: Record<string, any>) => unknown} answer
 */
function relay(answer) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    return structuredClone(answer(action, params))
  }
  return { sent, send }
}

/** @param {string} platform @param {Record<string, any>} [over] */
const ctxOf = (platform, over = {}) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-r',
  label: `${platform}-neutral`,
  actorKey: 'ana@example.com',
  facts: { platform, sealed: platform === 'joomla' },
  sleep: async () => {},
  ...over
})

/** @param {Record<string, any>} ctx @param {unknown} args */
const call = async (ctx, args) => {
  const p = planCall(args)
  assert.ok(p.ok, JSON.stringify(p))
  return /** @type {any} */ (await runSiteCall({ ...ctx, plan: p }))
}

// ── the page list ────────────────────────────────────────────────────────────────────────────────

const LOCALES = ['en-GB', 'ru-RU', 'vi-VN']

/**
 * A page list shaped like the relay's walk (`apps/tracy-web/src/sites/content-pages.js`): `perLocale` pages in
 * each language, each with its translations, its menu item and the modules it shows, and `common` pages in
 * every language (`*`).
 * @param {{ perLocale?: number, common?: number, defaultLocale?: string | null, locales?: string[], only?: string }} [opts]
 */
function pageList({ perLocale = 25, common = 2, defaultLocale = null, locales = LOCALES, only } = {}) {
  /** @type {Record<string, any>[]} */
  const pages = []
  let n = 0
  for (const locale of only ? [only] : locales)
    for (let i = 0; i < perLocale; i += 1) {
      n += 1
      const prefix = locale.slice(0, 2)
      pages.push({
        id: `content_${hex(n)}`,
        type: i % 5 === 4 ? 'article' : 'page',
        title: `Page ${i} (${locale})`,
        url: `https://demo.example/${prefix}/page-${i}`,
        path: `/${prefix}/page-${i}`,
        locale,
        translationGroupId: `translation_${hex(i)}`,
        alternates: locales
          .filter((l) => l !== locale)
          .map((l, j) => ({ locale: l, id: `content_${hex(10_000 + i * 10 + j)}` })),
        status: 'published',
        native: [
          { kind: 'menuItem', id: 600 + n },
          ...Array.from({ length: 5 }, (_, m) => ({ kind: 'module', id: 4000 + n * 10 + m }))
        ]
      })
    }
  if (!only)
    for (let i = 0; i < common; i += 1)
      pages.push({
        id: `content_${hex(90_000 + i)}`,
        type: 'page',
        title: `Shared ${i}`,
        url: `https://demo.example/shared-${i}`,
        path: `/shared-${i}`,
        locale: '*',
        translationGroupId: null,
        status: 'published',
        native: [{ kind: 'menuItem', id: 9000 + i }]
      })
  return {
    schemaVersion: 'tracy-content-pages/v1',
    site: { id: 'site_1', name: null, url: 'https://demo.example', defaultLocale, locales },
    pages,
    truncated: false,
    version: `cv1.${hex(7)}`,
    later: {
      action: 'content.read',
      params: { changedSince: `cv1.${hex(7)}` },
      why: 'Later in this conversation: what changed on the site since this list (edited, new, removed pages).'
    }
  }
}

test('🔒 a page list shows the working language, one row per page, and counts the other languages', async () => {
  const relayed = pageList()
  const { sent, send } = relay(() => relayed)
  // A Joomla list names no default (`defaultLocale: null`): the language the site was measured to serve does.
  const out = await call(ctxOf('joomla', { send, siteFacts: async () => ({ siteLanguage: 'en-GB' }) }), {
    action: 'content.read',
    params: { view: 'pages' }
  })
  assert.deepEqual(sent, [['content.read', { view: 'pages' }]])
  assert.deepEqual(out.columns.slice(0, 4), ['title', 'path', 'id', 'record'])
  const ids = out.pages.map((/** @type {unknown[]} */ row) => row[2])
  const own = relayed.pages.filter((p) => p.locale === 'en-GB' || p.locale === '*')
  assert.deepEqual(
    ids,
    own.map((p) => p.id),
    'every page of the working language and of every language, in order'
  )
  // The row says what the agent acts on: the title, the path, the content id and the page's own record.
  const first = out.pages[0]
  assert.equal(first[0], own[0].title)
  assert.equal(first[1], own[0].path)
  assert.equal(first[3], `menuItem:${own[0].native[0].id}`)
  assert.deepEqual(out.otherLanguages, { 'ru-RU': 25, 'vi-VN': 25 })
  assert.equal(out.truncated, false, 'nothing of this language was cut')
  assert.deepEqual(out.next.params, { view: 'pages', locale: '<a locale of otherLanguages>' })
  assert.match(out.next.why, /50 more in 2 other languages/)
  assert.match(out.next.why, /full:true/)
  assert.equal(out.version, relayed.version, 'the version a later changedSince needs')
  assert.deepEqual(out.later, relayed.later)
  assert.ok(size(out) < 0.2 * size(relayed), `${size(out)} of ${size(relayed)} characters`)
})

test('a site that names its default is narrowed without facts; a call that names a language, or a site in one, is not', async () => {
  const wp = pageList({ defaultLocale: 'en-GB', perLocale: 6 })
  const named = await call(ctxOf('wordpress', { send: relay(() => wp).send }), {
    action: 'content.read',
    params: { view: 'pages' }
  })
  assert.equal(named.pages.length, 6 + 2)
  assert.deepEqual(named.otherLanguages, { 'ru-RU': 6, 'vi-VN': 6 })

  // `{view:"pages", locale}` is the road the list names: the relay answered that language, and it is shown whole.
  const vi = pageList({ only: 'vi-VN', perLocale: 6 })
  const one = await call(
    ctxOf('joomla', { send: relay(() => vi).send, siteFacts: async () => ({ siteLanguage: 'en-GB' }) }),
    {
      action: 'content.read',
      params: { view: 'pages', locale: 'vi-VN' }
    }
  )
  assert.equal(one.pages.length, 6)
  assert.equal(one.otherLanguages, undefined)
  assert.equal(one.pages[0][2], vi.pages[0].id)

  // No working language known: every language, as rows that say which language each is.
  const unknown = await call(ctxOf('joomla', { send: relay(() => pageList({ perLocale: 4 })).send }), {
    action: 'content.read',
    params: { view: 'pages' }
  })
  assert.equal(unknown.pages.length, 3 * 4 + 2)
  assert.ok(unknown.columns.includes('locale'))

  // A site in one language: every page is a row, and there is nothing more to point at.
  const single = pageList({ defaultLocale: 'en-US', locales: ['en-US'], perLocale: 5, common: 0 })
  const whole = await call(ctxOf('wordpress', { send: relay(() => single).send }), {
    action: 'content.read',
    params: { view: 'pages' }
  })
  assert.equal(whole.pages.length, 5)
  assert.equal(whole.next, undefined)
  assert.equal(whole.otherLanguages, undefined)
  assert.ok(!whole.columns.includes('locale'))
})

test('🔒 a page list still over the budget says how many more and the road to one page', async () => {
  const big = pageList({ defaultLocale: 'en-GB', perLocale: 400 })
  const out = await call(ctxOf('wordpress', { send: relay(() => big).send }), {
    action: 'content.read',
    params: { view: 'pages' }
  })
  assert.ok(size(out) <= 24_500, `${size(out)}`)
  assert.equal(out.truncated, true)
  assert.equal(out.truncatedCount, 402 - out.pages.length)
  assert.match(out.next.why, new RegExp(`${out.truncatedCount} more pages not shown`))
  assert.match(out.next.why, /url/)
})

test('🔒 full:true is the page list as it was — never relayed, every language and field', async () => {
  const relayed = pageList({ perLocale: 4 })
  const { sent, send } = relay(() => relayed)
  const out = await call(ctxOf('joomla', { send, siteFacts: async () => ({ siteLanguage: 'en-GB' }) }), {
    action: 'content.read',
    params: { view: 'pages', full: true }
  })
  assert.deepEqual(sent, [['content.read', { view: 'pages' }]], 'full is Tracy’s, never the relay’s')
  assert.deepEqual(out.pages, relayed.pages)
  assert.equal(out.columns, undefined)
  // over the budget, full:true is today's cut list
  const big = pageList({ perLocale: 40 })
  const cut = await call(ctxOf('joomla', { send: relay(() => big).send }), {
    action: 'content.read',
    params: { view: 'pages', full: true }
  })
  const { next: _n, ...today } = /** @type {any} */ (cutContentList(structuredClone(big), { view: 'pages' }))
  const { next: _m, ...got } = cut
  assert.deepEqual(got, today)
})

// ── the describe document ────────────────────────────────────────────────────────────────────────

function describeDoc() {
  const field = (/** @type {number} */ k, /** @type {number} */ i) => ({
    key: `kind_${k}.field_${i}`,
    type: 'text',
    writable: true,
    constraints: { maxCharacters: 40 + i }
  })
  return {
    schemaVersion: 'tracy-content-describe/v1',
    view: 'authenticated',
    site: { id: 's1', name: 'Demo', url: 'https://demo.example', defaultLocale: 'en-GB', locales: ['en-GB'] },
    types: [
      {
        type: 'page',
        count: 7,
        next: { tool: 'tracy_site', action: 'content.read', params: { type: 'page' } }
      }
    ],
    blockKinds: Array.from({ length: 4 }, (_, k) => ({
      kind: `kind_${k}`,
      fields: Array.from({ length: 40 }, (_, i) => field(k, i))
    })),
    guidance: 'Read via types[].next.',
    where: {
      quickstart: 'demo@1.0.0',
      topics: {
        seo: [
          {
            what: 'A page title.',
            where: { kind: 'post', field: 'post_title' },
            door: { tool: 'tracy_site', call: { action: 'content.update', params: { kind: 'post' } } }
          }
        ]
      }
    }
  }
}

test('🔒 the describe document leaves blockKinds out unless asked, and keeps where whole', async () => {
  const relayed = describeDoc()
  const { sent, send } = relay(() => relayed)
  const out = await call(ctxOf('wordpress', { send }), { action: 'content.read', params: { describe: true } })
  assert.deepEqual(sent, [['content.read', { describe: true }]])
  assert.equal(out.blockKinds, undefined)
  assert.match(out.blockKindsOmitted, /^4 block kinds/)
  assert.match(out.blockKindsOmitted, /blockKinds:true/)
  assert.deepEqual(out.where, relayed.where, 'the roads the agent acts on stay whole')
  assert.deepEqual(out.types, relayed.types)
  assert.equal(out.next.params.type, 'page', 'its next is still built')
  assert.ok(size(out) < 0.25 * size(relayed), `${size(out)} of ${size(relayed)}`)

  const asked = relay(() => relayed)
  const withKinds = await call(ctxOf('wordpress', { send: asked.send }), {
    action: 'content.read',
    params: { describe: true, blockKinds: true }
  })
  assert.deepEqual(
    asked.sent,
    [['content.read', { describe: true }]],
    'blockKinds is Tracy’s, never the relay’s'
  )
  assert.deepEqual(withKinds.blockKinds, compactDescribe(relayed).blockKinds)
})

test('🔒 full:true is the describe document as it was', async () => {
  const relayed = describeDoc()
  const { sent, send } = relay(() => relayed)
  const out = await call(ctxOf('wordpress', { send }), {
    action: 'content.read',
    params: { describe: true, full: true }
  })
  assert.deepEqual(sent, [['content.read', { describe: true }]])
  const { next: _next, ...rest } = out
  assert.deepEqual(rest, compactDescribe(relayed))
})

// ── one content ──────────────────────────────────────────────────────────────────────────────────

/** A field as the relay's Joomla projection answers it: a slot with its per-field next and constraints. */
const slotField = (/** @type {string} */ slotKey, /** @type {number} */ max) => ({
  key: slotKey,
  type: 'text',
  value: `Words of ${slotKey}`,
  slotKey,
  semanticKey: 'title',
  writable: true,
  constraints: { maxCharacters: max, requiresEvidence: false, emptyAllowed: null },
  next: { tool: 'tracy_site', action: 'content.contract', operation: 'apply', changes: { [slotKey]: null } }
})

/**
 * One page read shaped like the relay's Joomla answer: `withFields` module blocks of four slots each, and
 * `chrome` blocks that hold no field (shared modules: topbar, menus, footer).
 * @param {{ withFields?: number, chrome?: number, bodyHtml?: string | null }} [opts]
 */
function pageRead({ withFields = 6, chrome = 16, bodyHtml = null } = {}) {
  const blocks = []
  for (let b = 0; b < chrome; b += 1)
    blocks.push({
      id: `occurrence_${hex(b)}`,
      key: `module-${400 + b}`,
      role: `Chrome part ${b}`,
      position: blocks.length,
      sharedContentId: `content_${hex(5_000 + b)}`,
      visibility: 'unknown',
      fields: [],
      items: [],
      writable: null
    })
  for (let b = 0; b < withFields; b += 1)
    blocks.push({
      id: `occurrence_${hex(100 + b)}`,
      key: `module-${800 + b}`,
      role: `Section ${b}`,
      position: blocks.length,
      sharedContentId: null,
      visibility: 'unknown',
      fields: Array.from({ length: 4 }, (_, i) => slotField(`module-${800 + b}.${i}`, 40 + i)),
      items: [],
      writable: true
    })
  return {
    schemaVersion: 'tracy-content/v1',
    view: 'authenticated',
    site: { id: 's1', name: null, url: 'https://demo.example', defaultLocale: null, locales: ['en-GB'] },
    snapshot: { revision: hex(3), readAt: '2026-10-05T00:00:00Z' },
    pagination: { limit: 1, nextCursor: null, total: 1, budget: 65_536 },
    protocol: { selected: 'tracy-content/v1', cowork: { kind: 'joomla', capability: 'v1' } },
    contents: [
      {
        id: `content_${hex(1)}`,
        type: 'page',
        title: 'Contact',
        revision: hex(9),
        bodyHtml,
        fields: [],
        blocks,
        native: [{ kind: 'menuItem', id: 604 }],
        writable: true
      }
    ],
    version: `cv1.${hex(4)}`
  }
}

/** Every field record of a content: its own and its blocks'. @param {any} content */
const fieldsOf = (content) => [
  ...(content.fields ?? []),
  ...(content.blocks ?? []).flatMap((/** @type {any} */ b) => b.fields ?? [])
]

test('🔒 a page read states the shared next once, keeps only the limits that bind, and leaves out the blocks with no field', async () => {
  const relayed = pageRead()
  const { send } = relay(() => relayed)
  const out = await call(ctxOf('joomla', { send }), {
    action: 'content.read',
    params: { id: relayed.contents[0].id }
  })
  const [content] = out.contents
  const before = fieldsOf(relayed.contents[0])
  const after = fieldsOf(content)
  // every slot is still there, with its value and its limit
  assert.deepEqual(
    after.map((/** @type {any} */ f) => [f.slotKey, f.value, f.constraints]),
    before.map((f) => [f.slotKey, f.value, { maxCharacters: f.constraints.maxCharacters }])
  )
  // the next is stated once, and each field's own is it with that field's slotKey
  assert.ok(after.every((/** @type {any} */ f) => f.next === undefined))
  const { why, ...template } = out.fieldNext
  assert.match(why, /slotKey/)
  for (const f of before)
    assert.deepEqual(
      JSON.parse(JSON.stringify(template).replaceAll('<slotKey>', f.slotKey)),
      f.next,
      `${f.slotKey}: the template gives its next back`
    )
  // the blocks with no field are gone, the others keep their place
  assert.equal(content.blocks.length, 6)
  assert.deepEqual(
    content.blocks.map((/** @type {any} */ b) => b.position),
    relayed.contents[0].blocks.filter((b) => b.fields.length > 0).map((b) => b.position)
  )
  assert.match(out.omitted, /16 blocks holding no field/)
  assert.match(out.omitted, /\{type:"shared"\}/, 'the road to the words of the blocks left out')
  assert.match(out.omitted, /full:true/)
  assert.equal(content.revision, relayed.contents[0].revision, 'the revision an apply is based on')
  assert.ok(size(out) < 0.55 * size(relayed), `${size(out)} of ${size(relayed)}`)
})

test('a field whose next is not the shared one keeps its own, and a limit that binds stays', async () => {
  const relayed = pageRead({ chrome: 0, withFields: 2 })
  const odd = relayed.contents[0].blocks[1].fields[2]
  odd.next = { tool: 'tracy_emdash', call: { tool: 'content_update', arguments: { id: 'x' } } }
  odd.constraints = { maxCharacters: 90, requiresEvidence: true, emptyAllowed: false }
  const out = await call(ctxOf('joomla', { send: relay(() => relayed).send }), {
    action: 'content.read',
    params: { id: relayed.contents[0].id }
  })
  const kept = out.contents[0].blocks[1].fields[2]
  assert.deepEqual(kept.next, odd.next)
  assert.deepEqual(kept.constraints, { maxCharacters: 90, requiresEvidence: true, emptyAllowed: false })
})

test('🔒 a body over 4,000 characters is shown as its headings; a shorter one, and a projection, as they came', async () => {
  const section = (/** @type {number} */ i) =>
    `<h2 class="x">Part <em>${i}</em></h2><p>${'w'.repeat(900)}</p>`
  const long = Array.from({ length: 6 }, (_, i) => section(i)).join('')
  const relayed = pageRead({ chrome: 0, withFields: 1, bodyHtml: `<h1>Contact</h1>${long}` })
  relayed.contents[0].native = [{ kind: 'post', id: 39 }]
  const out = await call(ctxOf('wordpress', { send: relay(() => relayed).send }), {
    action: 'content.read',
    params: { id: relayed.contents[0].id }
  })
  const [content] = out.contents
  assert.equal(content.bodyHtml, undefined)
  assert.equal(content.bodyOutline.chars, relayed.contents[0].bodyHtml.length)
  assert.deepEqual(content.bodyOutline.headings.slice(0, 3), ['h1 Contact', 'h2 Part 0', 'h2 Part 1'])
  assert.match(out.omitted, /bodyHtml over 4,000 characters/)
  assert.match(
    out.omitted,
    /content\.get \{kind:"post", id:39, outline:true\}/,
    'a post’s body by its blocks'
  )

  const short = pageRead({ chrome: 0, withFields: 1, bodyHtml: '<h1>Short</h1><p>words</p>' })
  const kept = await call(ctxOf('wordpress', { send: relay(() => short).send }), {
    action: 'content.read',
    params: { id: short.contents[0].id }
  })
  assert.equal(kept.contents[0].bodyHtml, short.contents[0].bodyHtml)

  const projected = pageRead({ withFields: 1, bodyHtml: long })
  const asked = await call(ctxOf('wordpress', { send: relay(() => projected).send }), {
    action: 'content.read',
    params: { id: projected.contents[0].id, fields: 'title,bodyHtml' }
  })
  assert.equal(asked.contents[0].bodyHtml, long, 'the model named the keys it wanted')
})

test('🔒 full:true is the page read as it was', async () => {
  const relayed = pageRead()
  const { sent, send } = relay(() => relayed)
  const out = await call(ctxOf('joomla', { send }), {
    action: 'content.read',
    params: { id: relayed.contents[0].id, full: true }
  })
  assert.deepEqual(
    sent.map(([, p]) => p.full),
    [undefined],
    'never relayed'
  )
  assert.deepEqual(out.contents, relayed.contents)
  assert.equal(out.fieldNext, undefined)
})

// ── a WordPress body read ────────────────────────────────────────────────────────────────────────

const para = (/** @type {string} */ words) => `<!-- wp:paragraph -->\n<p>${words}</p>\n<!-- /wp:paragraph -->`
const BODY = [
  para(`Hero ${'a'.repeat(2_000)}`),
  para(`Services ${'b'.repeat(2_000)}`),
  para(`Contact ${'c'.repeat(2_000)}`)
].join('\n\n')

function onePost(body = BODY) {
  return relay((action) =>
    action === 'content.get'
      ? { ok: true, kind: 'post', id: 42, item: { ID: 42, post_title: 'Home', post_content: body } }
      : { ok: false, code: 'bad_params' }
  )
}

test('🔒 a WordPress body over 4,000 characters is read as its outline, and full:true reads it whole', async () => {
  assert.ok(BODY.length > 4_000 && BODY.length < 16_000)
  const site = onePost()
  const out = await call(ctxOf('wordpress', { send: site.send }), {
    action: 'content.get',
    params: { kind: 'post', id: 42 }
  })
  assert.equal(out.item.post_content, undefined)
  assert.equal(out.item.post_content_chars, BODY.length)
  assert.deepEqual(
    out.outline.map((/** @type {any} */ r) => r.i),
    [0, 1, 2]
  )
  assert.match(out.next, /block:<i>/)

  const whole = onePost()
  const full = await call(ctxOf('wordpress', { send: whole.send }), {
    action: 'content.get',
    params: { kind: 'post', id: 42, full: true }
  })
  assert.equal(full.item.post_content, BODY)
  assert.deepEqual(whole.sent, [['content.get', { kind: 'post', id: 42 }]], 'full is never relayed')
})

// ── a list the component answers whole ───────────────────────────────────────────────────────────

/** A Joomla extension list: `n` extensions of four types, each language pack listed once per client. */
function extensionList(n = 240) {
  const types = ['plugin', 'component', 'module', 'language']
  /** @type {Record<string, any>[]} */
  const extensions = []
  for (let i = 0; i < n; i += 1) {
    const type = types[i % 4]
    const row = {
      name: `${type === 'component' ? 'com' : type.slice(0, 3)}_item${i}`,
      type,
      element: `item${i}`,
      folder: type === 'plugin' ? 'system' : '',
      package_id: 0,
      version: '1.0',
      enabled: true
    }
    extensions.push(row)
    if (type === 'language') extensions.push({ ...row }, { ...row })
  }
  return { ok: true, extensions }
}

test('🔒 extension.list shows 20 rows without duplicates, with the counts and the roads to the rest', async () => {
  const relayed = extensionList()
  const { sent, send } = relay(() => relayed)
  const out = await call(ctxOf('joomla', { send }), { action: 'extension.list', params: {} })
  assert.deepEqual(sent, [['extension.list', {}]])
  assert.equal(out.extensions.length, 20)
  assert.equal(out.total, 240, 'duplicates counted once')
  assert.deepEqual(out.byType, { plugin: 60, component: 60, module: 60, language: 60 })
  assert.match(out.next, /offset:20/)
  assert.match(out.next, /search:/)
  assert.ok(size(out) < 0.1 * size(relayed), `${size(out)} of ${size(relayed)}`)
})

test('🔒 extension.list reads search, type, offset and limit itself, and never relays them', async () => {
  const relayed = extensionList()
  const { sent, send } = relay(() => relayed)
  const found = await call(ctxOf('joomla', { send }), {
    action: 'extension.list',
    params: { search: 'COM_ITEM1' }
  })
  assert.deepEqual(sent, [['extension.list', {}]])
  assert.ok(found.extensions.length > 0)
  assert.ok(found.extensions.every((/** @type {any} */ e) => /com_item1/.test(e.name)))
  assert.equal(found.extensions.length, Math.min(20, found.total))
  assert.ok(found.total < 240, 'the search narrowed the list')

  const page = await call(ctxOf('joomla', { send }), {
    action: 'extension.list',
    params: { type: 'plugin', offset: 20, limit: 5 }
  })
  assert.deepEqual(
    page.extensions.map((/** @type {any} */ e) => e.element),
    ['item80', 'item84', 'item88', 'item92', 'item96']
  )
  assert.equal(page.total, 60)

  const none = await call(ctxOf('joomla', { send }), {
    action: 'extension.list',
    params: { search: 'nothing-like-it' }
  })
  assert.deepEqual(none.extensions, [])
  assert.match(none.next, /No row matches/)
})

test('🔒 full:true is the whole extension list; a short plugin list is shown as it came', async () => {
  const relayed = extensionList()
  const out = await call(ctxOf('joomla', { send: relay(() => relayed).send }), {
    action: 'extension.list',
    params: { full: true }
  })
  assert.deepEqual(out.extensions, relayed.extensions)

  const plugins = {
    ok: true,
    plugins: [
      { file: 'a/a.php', name: 'A', version: '1', active: true },
      { file: 'b/b.php', name: 'B', version: '2', active: false }
    ]
  }
  const short = await call(ctxOf('wordpress', { send: relay(() => plugins).send }), {
    action: 'plugin.list',
    params: {}
  })
  assert.deepEqual(short.plugins, plugins.plugins)
  assert.equal(short.total, undefined)
})

// Review, 20/10/2026: the role pins judge a block edit against the body read — which must be the WHOLE body,
// heard before W2 cuts the answer to an outline (`onRead`), or no edit on a real-sized page was ever checked.
test('onRead hears a WordPress read whole, before the outline the model is shown; a listener that throws changes nothing', async () => {
  const site = onePost()
  /** @type {Array<[Record<string, unknown>, any]>} */
  const heard = []
  const out = await call(
    ctxOf('wordpress', {
      send: site.send,
      onRead: (/** @type {Record<string, unknown>} */ params, /** @type {any} */ answer) =>
        heard.push([params, answer])
    }),
    { action: 'content.get', params: { kind: 'post', id: 42 } }
  )
  assert.equal(out.item.post_content, undefined, 'the model still sees the outline')
  assert.equal(heard.length, 1)
  assert.equal(heard[0][1].item.post_content, BODY, 'the listener heard the whole body')
  const again = await call(
    ctxOf('wordpress', {
      send: onePost().send,
      onRead: () => {
        throw new Error('boom')
      }
    }),
    { action: 'content.get', params: { kind: 'post', id: 42 } }
  )
  assert.equal(again.ok, true)
})
