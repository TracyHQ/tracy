/**
 * `removal-check.mjs`: a removal's receipt reads the page back and says whether its words still show
 * (ladder DL09 on dsl2jo, 14/10/2026). The DL09 call is reproduced through `runSiteCall` with fake doors:
 * the article taken off the home's featured list, and a second article of the same title showing there
 * after it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCallMemory } from '../src/host/call-memory.mjs'
import {
  HIDING_VALUES,
  pagesToRead,
  removalOf,
  removalReceipt,
  shownCount,
  wordsOf
} from '../src/host/removal-check.mjs'
import { runSiteCall, WRITE_RECEIPT_NEXT } from '../src/host/site-call.mjs'
import { planCall } from '../src/host/site.mjs'

/** The DL09 article's title, as the site stores it (an English stand-in: no Vietnamese in package code). */
const TITLE = 'Drawing with Elegance: The Art of Line Work'

// ── which calls are removals ─────────────────────────────────────────────────────────────────────

test('removalOf: a delete, or an update of an existing record that unpublishes, trashes, archives or unfeatures it', () => {
  assert.deepEqual(
    removalOf('joomla', 'content.update', { kind: 'article', id: 18, fields: { featured: 0 } }),
    {
      kind: 'article',
      id: 18
    }
  )
  for (const fields of [{ state: 0 }, { state: '-2' }, { state: 2 }, { published: 0 }, { published: -2 }])
    assert.ok(
      removalOf('joomla', 'content.update', { kind: 'module', id: '7', fields }) !== null,
      JSON.stringify(fields)
    )
  assert.deepEqual(removalOf('joomla', 'content.delete', { kind: 'menuItem', id: 12 }), {
    kind: 'menuItem',
    id: 12
  })
  for (const status of ['draft', 'pending', 'private', 'trash'])
    assert.ok(
      removalOf('wordpress', 'content.update', { kind: 'post', id: 4, fields: { post_status: status } })
    )
  assert.deepEqual(removalOf('wordpress', 'content.delete', { kind: 'post', id: 4 }), { kind: 'post', id: 4 })
  // Not removals: a words write, a publish, a feature, a create, an EmDash or unknown site, a read.
  for (const [platform, action, params] of [
    ['joomla', 'content.update', { kind: 'article', id: 18, fields: { title: 'x' } }],
    ['joomla', 'content.update', { kind: 'article', id: 18, fields: { state: 1, featured: 1 } }],
    ['joomla', 'content.update', { kind: 'article', fields: { state: 0 } }],
    ['joomla', 'content.update', { kind: 'article', id: 0, fields: { state: 0 } }],
    ['wordpress', 'content.update', { kind: 'post', id: 4, fields: { post_status: 'publish' } }],
    ['emdash', 'content.delete', { kind: 'post', id: 4 }],
    ['unknown', 'content.delete', { kind: 'post', id: 4 }],
    ['joomla', 'content.get', { kind: 'article', id: 18 }]
  ])
    assert.equal(removalOf(platform, action, params), null, JSON.stringify([platform, action, params]))
  // The meanings are the CMS's own columns, never a template's.
  assert.deepEqual(Object.keys(HIDING_VALUES).sort(), ['joomla', 'wordpress'])
})

test('wordsOf: the record’s title as a visitor reads it; nothing too short to mean anything', () => {
  assert.equal(wordsOf({ title: TITLE }), TITLE)
  assert.equal(wordsOf({ post_title: 'Seasonal &amp; Fresh <em>Bread</em>' }), 'Seasonal & Fresh Bread')
  assert.equal(wordsOf({ name: '  Contact   Ana  ' }), 'Contact Ana')
  assert.equal(wordsOf({ title: 'Go' }), null)
  assert.equal(wordsOf({ title: '' }), null)
  assert.equal(wordsOf(null), null)
})

test('pagesToRead: the newest two pages this conversation read, else the home page', () => {
  assert.deepEqual(pagesToRead(undefined), ['/'])
  assert.deepEqual(pagesToRead([]), ['/'])
  assert.deepEqual(pagesToRead(['/blog', '/', '/blog', '/about']), ['/blog', '/'])
  assert.deepEqual(pagesToRead(['//evil.example/x', 'about', 42]), ['/'])
})

test('shownCount: the matched lines of a page read, null when the page was not read', () => {
  assert.equal(shownCount({ ok: true, matchedLines: 2 }), 2)
  assert.equal(shownCount({ ok: true, matchedLines: 0 }), 0)
  assert.equal(shownCount({ ok: false, code: 'SITE_UNREACHABLE' }), null)
  assert.equal(shownCount({ ok: true }), null)
})

// ── what the receipt says ────────────────────────────────────────────────────────────────────────

test('🔒 removalReceipt: words that still show forbid "gone", and name where and the read that finds them', () => {
  const out = /** @type {any} */ (
    removalReceipt(
      { ok: true, kind: 'article', id: 18 },
      { words: TITLE, pages: [{ path: '/', before: 1, after: 1 }] }
    )
  )
  assert.deepEqual(out.stillShows, { words: TITLE, on: [{ path: '/', places: 1, before: 1 }] })
  assert.match(out.next, /still shows on \/ \(1 of the 1 places it showed\)/)
  assert.match(out.next, /Do not tell the customer it is gone/)
  // The read that finds them: a part of a long title, cut at a word, finds it as the whole does.
  assert.ok(
    out.next.includes('page.text {path:"/", match:"Drawing with Elegance: The Art of Line"}'),
    out.next
  )
  assert.doesNotMatch(out.next, /nothing to read back/)
  assert.match(out.next, /apply\.revert \{apply_id\} undoes this change if asked\.$/)
})

test('removalReceipt: words gone from every page that showed them make a receipt that may say so', () => {
  const out = /** @type {any} */ (
    removalReceipt({ ok: true }, { words: TITLE, pages: [{ path: '/', before: 2, after: 0 }] })
  )
  assert.deepEqual(out.goneFrom, ['/'])
  // the box that held the words may be left empty: one look at the page, then the gap closed or said (DL09)
  assert.match(out.next, /page\.look \{path:"\/"\} once; close a gap it left/)
  assert.match(out.next, /^This is the receipt: ".+" no longer shows on \/ \(read again after the write\)\./)
  assert.equal(out.stillShows, undefined)
})

test('removalReceipt makes no claim it cannot back: a page that did not show them, a failed read, a refusal, a next already said', () => {
  const ok = { ok: true }
  for (const pages of [
    [{ path: '/', before: 0, after: 0 }],
    [{ path: '/', before: null, after: null }],
    [{ path: '/', before: 1, after: null }]
  ])
    assert.equal(removalReceipt(ok, { words: TITLE, pages }), ok, JSON.stringify(pages))
  const refused = { ok: false, error: 'write_failed' }
  assert.equal(
    removalReceipt(refused, { words: TITLE, pages: [{ path: '/', before: 1, after: 1 }] }),
    refused
  )
  const said = { ok: true, next: 'already said' }
  assert.equal(removalReceipt(said, { words: TITLE, pages: [{ path: '/', before: 1, after: 1 }] }), said)
})

test('a long title is quoted cut in the sentence; the structured fact names the page and the count', () => {
  const words = 'x'.repeat(200)
  const out = /** @type {any} */ (
    removalReceipt({ ok: true }, { words, pages: [{ path: '/blog', before: 3, after: 1 }] })
  )
  // Two quotes of the words at most: the title cut at 60, the match at 40.
  assert.ok(out.next.length <= 400, `${out.next.length}`)
  assert.ok(
    out.next.includes(`match:"${'x'.repeat(40)}"`),
    'a word longer than the cut is cut where it stands'
  )
  assert.equal(out.stillShows.on[0].path, '/blog')
})

// ── DL09 through the tool's own call ─────────────────────────────────────────────────────────────

/**
 * A Joomla conversation whose relay answers the article and the write, and whose page reader answers
 * `before` lines for the title before the write and `after` after it.
 * @param {{ before: number, after: number, seen?: string[], facts?: Record<string, unknown> }} o
 */
function dl09({ before, after, seen = ['/'], facts = { platform: 'joomla', sealed: true } }) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  /** @type {Array<[string, string, boolean]>} */
  const pages = []
  let written = false
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    if (action === 'content.get')
      return { ok: true, kind: 'article', id: 18, item: { id: 18, title: TITLE, featured: 1 } }
    if (action === 'content.update') {
      written = true
      return { ok: true, kind: 'article', id: 18, created: false }
    }
    return { ok: false, error: 'not scripted' }
  }
  const readPage = async (/** @type {string} */ path, /** @type {string} */ match) => {
    pages.push([path, match, written])
    return { ok: true, path, match, matchedLines: written ? after : before }
  }
  const ctx = {
    memory: createCallMemory({ now: () => 1_000 }),
    sessionId: 'session-dl09',
    label: 'dsl2jo',
    actorKey: 'ana@example.com',
    facts,
    sleep: async () => {},
    send,
    readPage,
    pagesSeen: () => seen
  }
  return { ctx, sent, pages }
}

/** The DL09 write, word for word but the title. */
const DL09_CALL = {
  action: 'content.update',
  params: { kind: 'article', id: 18, fields: { featured: 0 }, apply_id: 'unfeature-drawing-with-elegance' }
}

/** @param {Record<string, any>} ctx @param {any} args */
async function call(ctx, args) {
  const plan = planCall(args)
  assert.ok(plan.ok, JSON.stringify(plan))
  return /** @type {any} */ (await runSiteCall({ ...ctx, plan }))
}

test('🔒 DL09: the article taken off the home list while its title still shows there — the receipt says so, never "nothing to read back"', async () => {
  const { ctx, sent, pages } = dl09({ before: 1, after: 1 })
  const out = await call(ctx, DL09_CALL)
  assert.equal(out.ok, true)
  assert.deepEqual(out.stillShows, { words: TITLE, on: [{ path: '/', places: 1, before: 1 }] })
  assert.match(out.next, /Do not tell the customer it is gone/)
  assert.notEqual(out.next, WRITE_RECEIPT_NEXT)
  // The title is read once before the write; the page before the write and again after it.
  assert.deepEqual(
    sent.map(([action]) => action),
    ['content.get', 'content.update']
  )
  assert.deepEqual(sent[0][1], { kind: 'article', id: 18 })
  assert.deepEqual(pages, [
    ['/', TITLE, false],
    ['/', TITLE, true]
  ])
})

test('DL09 when the title left the page: the receipt says it is gone from it', async () => {
  const { ctx } = dl09({ before: 1, after: 0 })
  const out = await call(ctx, DL09_CALL)
  assert.deepEqual(out.goneFrom, ['/'])
  assert.match(out.next, /no longer shows on \//)
})

test('the pages read are the conversation’s own, newest first, two at most', async () => {
  const { ctx, pages } = dl09({ before: 1, after: 0, seen: ['/blog', '/', '/about'] })
  await call(ctx, DL09_CALL)
  assert.deepEqual(
    pages.map(([path, , after]) => [path, after]),
    [
      ['/blog', false],
      ['/', false],
      ['/blog', true],
      ['/', true]
    ]
  )
})

test('no page is read for a write that removes nothing, nor for a job that asked for no read-back', async () => {
  const words = dl09({ before: 1, after: 1 })
  const out = await call(words.ctx, {
    action: 'content.update',
    params: { kind: 'article', id: 18, fields: { title: 'New title' }, apply_id: 'retitle' }
  })
  assert.equal(out.next, WRITE_RECEIPT_NEXT)
  assert.equal(words.pages.length, 0)
  assert.equal(words.sent.filter(([a]) => a === 'content.get').length, 0)

  const quiet = dl09({
    before: 1,
    after: 1,
    facts: { platform: 'joomla', sealed: true, verifyBodyWrites: false }
  })
  const out2 = await call(quiet.ctx, DL09_CALL)
  assert.equal(out2.next, WRITE_RECEIPT_NEXT)
  assert.equal(quiet.pages.length, 0)
})

test('a page that did not show the title before is no claim: the receipt is the plain one', async () => {
  const { ctx, pages } = dl09({ before: 0, after: 0 })
  const out = await call(ctx, DL09_CALL)
  assert.equal(out.next, WRITE_RECEIPT_NEXT)
  assert.equal(out.stillShows, undefined)
  // Read once before; nothing to compare after.
  assert.equal(pages.length, 1)
})

test('the read the still-shows receipt asks for is not told "the receipt was the check"', async () => {
  const { createAfterWrite } = await import('../src/host/receipt-echo.mjs')
  const { ctx } = dl09({ before: 1, after: 1 })
  const out = await call(ctx, DL09_CALL)
  const after = createAfterWrite()
  after.see('session-dl09', 1, { tool: 'tracy_site', action: 'content.update', write: true }, out)
  const read = after.see(
    'session-dl09',
    1,
    { tool: 'tracy_site', action: 'page.text', write: false },
    { ok: true, matchedLines: 1 }
  )
  assert.equal(/** @type {any} */ (read).afterWrite, undefined)
})
