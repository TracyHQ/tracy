/**
 * A create's receipt says what the site now HOLDS (round 7, 30/09/2026). Neutral fixtures: no page, title
 * or label of any bench site.
 *
 *   node --test packages/tools/tracy-site-tools/test/create-receipt.test.mjs
 *
 * Measured, before: seven of the eight add-a-post runs (WordPress and Joomla, four Modes) read the
 * page or the record back after the last write — 16 wasted model calls — because the receipt showed
 * `{ok, id, verified:{chars}}` or `{ok, id, created}` and nothing of status, date, category or slug.
 *
 * F2 (round 7 follow-up, 30/09/2026): the same receipt says `live` — the verdict the EmDash receipt already
 * gives (0 of 8 EmDash runs read back; 4 of 16 WordPress/Joomla runs still did) — and, when it is not, why.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCallMemory } from '../src/host/call-memory.mjs'
import { runSiteCall, WRITE_RECEIPT_NEXT } from '../src/host/site-call.mjs'
import { planCall } from '../src/host/site.mjs'
import { liveOf as liveOfAt, STORED_NEXT, STORED_VALUE_MAX, storedOf } from '../src/host/stored-echo.mjs'

/**
 * A relay that answers from a script and records every call.
 * @param {(action: string, params: Record<string, any>) => unknown} answer
 */
function relay(answer) {
  /** @type {Array<[string, Record<string, any>]>} */
  const sent = []
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    sent.push([action, structuredClone(params)])
    return answer(action, params)
  }
  return { sent, send }
}
/** @param {Record<string, any>} over */
const wordpress = (over = {}) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-w',
  label: 'wp-neutral',
  actorKey: 'ana@example.com',
  facts: { platform: 'wordpress', sealed: false },
  sleep: async () => {},
  ...over
})
/** The host clock the Joomla dates are judged against: a fixed day, so no test races the calendar. */
const NOW = Date.parse('2026-09-30T12:00:00Z')
/** An open Joomla site: `content.update` is the door for records. */
const joomla = (/** @type {Record<string, any>} */ over = {}) => ({
  memory: createCallMemory({ now: () => 1_000 }),
  sessionId: 'session-j',
  label: 'j-neutral',
  actorKey: 'ana@example.com',
  facts: { platform: 'joomla', sealed: false },
  sleep: async () => {},
  now: () => NOW,
  ...over
})
/** @param {unknown} args */
const plan = (args) => {
  const p = planCall(args)
  assert.ok(p.ok, JSON.stringify(p))
  return p
}
const actions = (/** @type {Array<[string, unknown]>} */ sent) => sent.map(([a]) => a)

const BODY = '<!-- wp:paragraph -->\n<p>The open day is on Saturday.</p>\n<!-- /wp:paragraph -->'

/** A WordPress post row, as `content.get` answers it. */
const wpRow = (/** @type {Record<string, unknown>} */ over = {}) => ({
  ID: 731,
  post_author: '0',
  post_date: '2026-09-15 00:00:00',
  post_content: BODY,
  post_title: 'Autumn open day',
  post_excerpt: 'Doors open at ten.',
  post_status: 'publish',
  post_name: 'autumn-open-day',
  post_parent: 0,
  guid: 'http://site.test/?p=731',
  post_type: 'post',
  post_category: [12],
  tags_input: [],
  ...over
})
/**
 * A WordPress site whose create answers `created:true` and whose `content.get` answers `row`.
 * @param {Record<string, unknown>} [row]
 */
const wpSite = (row = wpRow()) =>
  relay((action, params) =>
    action === 'content.get'
      ? { ok: true, kind: 'post', id: 731, key: '', item: row }
      : { ok: true, kind: 'post', id: 731, key: null, created: !params.id }
  )
const wpCreate = (/** @type {Record<string, unknown>} */ fields) =>
  plan({ action: 'content.update', params: { kind: 'post', fields } })

// ── the pure half: which columns, and what is never shown ─────────────────────────────────────────────

test('storedOf: the columns that say where a record is and whether it is live, in reading order', () => {
  assert.deepEqual(storedOf('wordpress', wpRow()), {
    post_title: 'Autumn open day',
    post_name: 'autumn-open-day',
    post_status: 'publish',
    post_date: '2026-09-15 00:00:00',
    post_type: 'post',
    post_category: [12]
  })
  assert.deepEqual(
    storedOf('joomla', {
      id: 90,
      title: 'Autumn open day',
      alias: 'autumn-open-day',
      introtext: '<p>Doors open at ten.</p>',
      state: 1,
      catid: 8,
      publish_up: '2026-09-15 09:00:00',
      publish_down: null,
      attribs: '{"a":1}',
      access: 1,
      language: 'en-GB'
    }),
    {
      title: 'Autumn open day',
      alias: 'autumn-open-day',
      state: 1,
      catid: 8,
      language: 'en-GB',
      access: 1,
      publish_up: '2026-09-15 09:00:00'
    }
  )
})

test('storedOf: never invents a column — one the row lacks, an empty or null one, a body, a JSON column, is left out', () => {
  assert.equal(storedOf('wordpress', { ID: 5, post_content: BODY }), null, 'no column of the list → no echo')
  assert.equal(storedOf('wordpress', null), null)
  assert.equal(storedOf('wordpress', 'x'), null)
  assert.equal(storedOf('elsewhere', { post_title: 'x' }), null, 'a shape the module does not know')
  const out = storedOf('wordpress', wpRow({ post_category: [], post_name: '  ', post_parent: 0 }))
  assert.equal(out && 'post_category' in out, false, 'an empty list says nothing')
  assert.equal(out && 'post_name' in out, false, 'a blank string says nothing')
  assert.equal(out && 'post_parent' in out, false, 'a top-level page has no parent to show')
  assert.equal(out && 'post_content' in out, false, 'the body is counted by `verified`, never repeated')
  assert.equal(storedOf('wordpress', wpRow({ post_parent: 44 }))?.post_parent, 44)
  const long = storedOf('wordpress', wpRow({ post_title: 'T'.repeat(200) }))?.post_title
  assert.equal(typeof long, 'string')
  assert.equal(/** @type {string} */ (long).length, STORED_VALUE_MAX)
  assert.ok(/** @type {string} */ (long).endsWith('…'))
  assert.equal(
    storedOf('wordpress', wpRow({ post_category: Array.from({ length: 30 }, (_, i) => i + 1) }))
      ?.post_category,
    undefined,
    'a long list is not a summary'
  )
})

test('the create receipt sentence keeps what the base one says, and adds only what stored is', () => {
  for (const must of [
    /^This is the receipt: /,
    /nothing to read back/,
    /When every change asked is made/,
    /tell the customer what changed, in plain words\./,
    /Keep the apply_id to yourself: apply\.revert with it if they ask to undo\./
  ])
    assert.match(STORED_NEXT, must)
  assert.match(STORED_NEXT, /stored is what the site holds now/)
  assert.ok(STORED_NEXT.length <= WRITE_RECEIPT_NEXT.length + 50, String(STORED_NEXT.length))
})

// ── WordPress ────────────────────────────────────────────────────────────────────────────────────────

test('🔒 WordPress: a post create shows status, date, slug, category and type as the site stored them — from the read the door already makes', async () => {
  // Before: `{ok, kind, id, key, created, verified:{chars…}, next: WRITE_RECEIPT_NEXT}` — the agent
  // could not tell whether the date and the status were honoured, and read the page back three times.
  const site = wpSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: site.send }),
      plan: wpCreate({
        post_type: 'post',
        post_title: 'Autumn open day',
        post_name: 'autumn-open-day',
        post_status: 'publish',
        post_date: '2026-09-15 00:00:00',
        post_category: [12],
        post_content: BODY
      })
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(out.created, true)
  assert.deepEqual(out.stored, {
    post_title: 'Autumn open day',
    post_name: 'autumn-open-day',
    post_status: 'publish',
    post_date: '2026-09-15 00:00:00',
    post_type: 'post',
    post_category: [12]
  })
  assert.equal(out.verified.chars_stored, BODY.length, 'the body check is unchanged')
  assert.equal(out.next, STORED_NEXT)
  assert.deepEqual(actions(site.sent), ['content.update', 'content.get'], 'no read beyond the one it made')
})

test('🔒 WordPress: what the site did with a date still to come is what the receipt shows — future, not publish', async () => {
  // WordPress keeps `publish` only for a date that has come; the write asked for `publish`.
  const site = wpSite(wpRow({ post_status: 'future', post_date: '2027-03-01 09:00:00' }))
  const out = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: site.send }),
      plan: wpCreate({
        post_title: 'Autumn open day',
        post_status: 'publish',
        post_date: '2027-03-01 09:00:00',
        post_content: BODY
      })
    })
  )
  assert.equal(out.stored.post_status, 'future')
  assert.equal(out.stored.post_date, '2027-03-01 09:00:00')
})

test('WordPress: a create that names no status shows the draft the site made of it', async () => {
  const site = wpSite(wpRow({ post_status: 'draft', post_category: [1] }))
  const out = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: site.send }),
      plan: wpCreate({ post_title: 'Autumn open day', post_content: BODY })
    })
  )
  assert.equal(out.stored.post_status, 'draft')
  assert.deepEqual(out.stored.post_category, [1])
})

test('WordPress: a create with no body is read back once too, so the receipt is the same', async () => {
  const site = wpSite(wpRow({ post_type: 'page', post_category: [] }))
  const out = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: site.send }),
      plan: wpCreate({ post_type: 'page', post_title: 'Autumn open day', post_status: 'publish' })
    })
  )
  assert.equal(out.created, true)
  assert.equal(out.stored.post_status, 'publish')
  assert.equal(out.stored.post_type, 'page')
  assert.equal('post_category' in out.stored, false)
  assert.equal(out.next, STORED_NEXT)
  assert.deepEqual(actions(site.sent), ['content.update', 'content.get'])
})

test('WordPress: an edit is not a create — the receipt keeps its shape, and a body-less edit reads nothing', async () => {
  const site = wpSite()
  const ctx = wordpress({ send: site.send })
  ctx.memory.rememberRead('session-w', { kind: 'post', id: 731, chars: BODY.length })
  const edit = /** @type {any} */ (
    await runSiteCall({
      ...ctx,
      plan: plan({
        action: 'content.update',
        params: { kind: 'post', id: 731, fields: { post_content: BODY } }
      })
    })
  )
  assert.equal(edit.ok, true)
  assert.equal('stored' in edit, false, 'an edit does not repeat the record')
  // A whole body may have moved its blocks (01/10/2026): the receipt says so, and still that there is
  // nothing to read back, within a next's 200 characters.
  assert.match(edit.next, /^Receipt: nothing to read back\./)
  assert.match(edit.next, /content\.get \{kind:"post", id:731, outline:true\} before a write by position/)
  assert.ok(edit.next.length <= 200)
  const title = relay(() => ({ ok: true, kind: 'post', id: 731, key: null, created: false }))
  const bare = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: title.send }),
      plan: plan({ action: 'content.update', params: { kind: 'post', id: 731, fields: { post_title: 'x' } } })
    })
  )
  assert.equal('stored' in bare, false)
  assert.equal(bare.next, WRITE_RECEIPT_NEXT)
  assert.deepEqual(actions(title.sent), ['content.update'])
})

test('WordPress: a read that fails, a row with none of the columns, and the switched-off check leave the receipt as it was', async () => {
  for (const [name, answer, over] of /** @type {const} */ ([
    ['the read fails', () => ({ ok: false, error: 'read_failed' }), {}],
    ['a row of other columns', () => ({ ok: true, item: { ID: 731, post_content: BODY } }), {}],
    ['the check is off', () => ({ ok: true, item: wpRow() }), { verifyBodyWrites: false }]
  ])) {
    const site = relay((action, params) =>
      action === 'content.get'
        ? answer()
        : { ok: true, kind: 'post', id: 731, key: null, created: !params.id }
    )
    const out = /** @type {any} */ (
      await runSiteCall({
        ...wordpress({ send: site.send, facts: { platform: 'wordpress', sealed: false, ...over } }),
        plan: wpCreate({ post_title: 'Autumn open day', post_status: 'publish' })
      })
    )
    assert.equal(out.ok, true, name)
    assert.equal(out.created, true, name)
    assert.equal('stored' in out, false, name)
    if (name !== 'the check is off') assert.equal(out.next, WRITE_RECEIPT_NEXT, name)
  }
})

// ── Joomla ───────────────────────────────────────────────────────────────────────────────────────────

/** An article row, as Joomla's `content.get` answers it. */
const jRow = (/** @type {Record<string, unknown>} */ over = {}) => ({
  id: 90,
  asset_id: 501,
  title: 'Autumn open day',
  alias: 'autumn-open-day',
  introtext: '<p>Doors open at ten.</p>',
  fulltext: '<p>The open day is on Saturday.</p>',
  state: 1,
  catid: 8,
  created: '2026-09-30 08:00:00',
  publish_up: '2026-09-15 09:00:00',
  publish_down: null,
  images: '{}',
  urls: '{}',
  attribs: '{}',
  access: 1,
  language: 'en-GB',
  featured: 0,
  ...over
})
/**
 * An open Joomla site whose create answers `{ok, kind, id, created}` — all the component returns — and
 * whose `content.get` answers the row.
 * @param {Record<string, unknown> | (() => unknown)} row
 * @param {string} [kind]
 */
const jSite = (row = jRow(), kind = 'article') =>
  relay((action, params) =>
    action === 'content.get'
      ? typeof row === 'function'
        ? row()
        : { ok: true, kind, id: 90, item: row }
      : { ok: true, kind: params.kind, id: 90, created: !params.id }
  )
const jCreate = (/** @type {Record<string, unknown>} */ fields, kind = 'article') =>
  plan({ action: 'content.update', params: { kind, apply_id: 'add-open-day', fields } })

test('🔒 Joomla: an article create shows state, category, language, address and date as the site stored them', async () => {
  // Before: `{ok, kind, id, created, next}` — nothing about the record. The component answers no more,
  // so the door reads the row once, after the write.
  const site = jSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate({
        title: 'Autumn open day',
        alias: 'autumn-open-day',
        catid: 8,
        state: 1,
        language: 'en-GB',
        publish_up: '2026-09-15 09:00:00',
        introtext: '<p>Doors open at ten.</p>'
      })
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(out.created, true)
  assert.deepEqual(out.stored, {
    title: 'Autumn open day',
    alias: 'autumn-open-day',
    state: 1,
    catid: 8,
    language: 'en-GB',
    access: 1,
    publish_up: '2026-09-15 09:00:00'
  })
  assert.equal(out.next, STORED_NEXT)
  assert.deepEqual(actions(site.sent), ['content.update', 'content.get'])
  assert.deepEqual(site.sent[1][1], { kind: 'article', id: 90 })
})

test('Joomla: a create that left the article unpublished says so — the receipt is the site’s state, not the request’s', async () => {
  const site = jSite(jRow({ state: 0 }))
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate({ title: 'Autumn open day', catid: 8, introtext: '<p>x</p>' })
    })
  )
  assert.equal(out.stored.state, 0)
})

test('Joomla: a tree kind shows its own address (path), parent and status; any kind shows what its row has', async () => {
  const category = jSite(
    {
      id: 90,
      title: 'Events',
      alias: 'events',
      path: 'news/events',
      parent_id: 4,
      published: 1,
      language: 'en-GB',
      access: 1,
      params: '{}'
    },
    'category'
  )
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: category.send }),
      plan: jCreate({ title: 'Events', parent_id: 4 }, 'category')
    })
  )
  assert.deepEqual(out.stored, {
    title: 'Events',
    alias: 'events',
    path: 'news/events',
    published: 1,
    parent_id: 4,
    language: 'en-GB',
    access: 1
  })
  assert.deepEqual(category.sent[1], ['content.get', { kind: 'category', id: 90 }])
})

test('Joomla: an edit reads nothing and keeps its receipt; so does a create whose read fails or shows none of the columns', async () => {
  const edit = jSite()
  const edited = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: edit.send }),
      plan: plan({
        action: 'content.update',
        params: { kind: 'article', id: 90, apply_id: 'x', fields: { title: 'New title' } }
      })
    })
  )
  assert.equal(edited.created, false)
  assert.equal('stored' in edited, false)
  assert.equal(edited.next, WRITE_RECEIPT_NEXT)
  assert.deepEqual(actions(edit.sent), ['content.update'])
  for (const [name, row] of /** @type {const} */ ([
    ['the read fails', () => ({ ok: false, code: 'NOT_FOUND' })],
    ['a row of other columns', () => ({ ok: true, item: { id: 90, introtext: '<p>x</p>' } })]
  ])) {
    const site = jSite(row)
    const out = /** @type {any} */ (
      await runSiteCall({
        ...joomla({ send: site.send }),
        plan: jCreate({ title: 'Autumn open day', catid: 8 })
      })
    )
    assert.equal(out.ok, true, name)
    assert.equal(out.created, true, name)
    assert.equal('stored' in out, false, name)
    assert.equal(out.next, WRITE_RECEIPT_NEXT, name)
  }
  const off = jSite()
  const quiet = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: off.send, facts: { platform: 'joomla', sealed: false, verifyBodyWrites: false } }),
      plan: jCreate({ title: 'Autumn open day', catid: 8 })
    })
  )
  assert.equal('stored' in quiet, false, 'the switch that turns the in-tool check off turns this read off')
  assert.deepEqual(actions(off.sent), ['content.update'])
})

// ── F2: the receipt says `live`, and why when it is not ──────────────────────────────────────────────

/**
 * @param {unknown} shape @param {unknown} item @param {number} [at]
 * @param {string} [kind] - the Joomla kind of the row; an article unless a test says otherwise.
 */
const liveOf = (shape, item, at = NOW, kind = 'article') => liveOfAt(shape, item, at, kind)

test('liveOf (WordPress): live only when the status is publish; the site’s own word says why not', () => {
  assert.deepEqual(liveOf('wordpress', wpRow()), { live: true })
  assert.deepEqual(liveOf('wordpress', wpRow({ post_status: 'future', post_date: '2027-03-01 09:00:00' })), {
    live: false,
    why: 'scheduled for 2027-03-01 09:00:00'
  })
  for (const status of ['draft', 'pending', 'private', 'trash'])
    assert.deepEqual(liveOf('wordpress', wpRow({ post_status: status })), { live: false, why: status })
  // A scheduled post whose date the row does not carry is still scheduled, not live.
  assert.deepEqual(liveOf('wordpress', { post_type: 'post', post_status: 'future' }), {
    live: false,
    why: 'scheduled'
  })
})

test('liveOf: a row that holds no status says nothing — never a guess', () => {
  for (const [name, shape, item] of /** @type {const} */ ([
    ['WordPress, no post_status', 'wordpress', { post_title: 'Autumn open day' }],
    ['WordPress, a blank status', 'wordpress', { post_status: '  ' }],
    ['WordPress, not a text', 'wordpress', { post_status: 1 }],
    ['Joomla, neither state nor published', 'joomla', { title: 'Autumn open day', alias: 'autumn-open-day' }],
    ['Joomla, a state that is not a number', 'joomla', { state: 'on' }],
    ['a row that is not a row', 'joomla', null],
    ['a shape the module does not know', 'elsewhere', { post_status: 'publish', state: 1 }]
  ]))
    assert.equal(liveOf(shape, item), null, name)
})

test('liveOf (Joomla): state 1 inside its dates is live; outside them, the date says why', () => {
  assert.deepEqual(liveOf('joomla', jRow()), { live: true })
  // No dates at all, and the zero dates older Joomla rows carry, are no limit.
  assert.deepEqual(liveOf('joomla', jRow({ publish_up: null, publish_down: null })), { live: true })
  assert.deepEqual(
    liveOf('joomla', jRow({ publish_up: '0000-00-00 00:00:00', publish_down: '0000-00-00 00:00:00' })),
    { live: true }
  )
  assert.deepEqual(liveOf('joomla', jRow({ publish_up: '2027-03-01 09:00:00' })), {
    live: false,
    why: 'scheduled for 2027-03-01 09:00:00'
  })
  assert.deepEqual(liveOf('joomla', jRow({ publish_down: '2026-09-29 23:59:59' })), {
    live: false,
    why: 'ended 2026-09-29 23:59:59'
  })
  // Inside a window that has opened and not closed.
  assert.deepEqual(
    liveOf('joomla', jRow({ publish_up: '2026-09-01 00:00:00', publish_down: '2026-10-31 00:00:00' })),
    {
      live: true
    }
  )
})

test('liveOf (Joomla): the edges are live — not after now, not before now — and the clock is the one it is given', () => {
  assert.deepEqual(liveOf('joomla', jRow({ publish_up: '2026-09-30 12:00:00' })), { live: true })
  assert.deepEqual(liveOf('joomla', jRow({ publish_down: '2026-09-30 12:00:00' })), { live: true })
  assert.equal(/** @type {any} */ (liveOf('joomla', jRow({ publish_up: '2026-09-30 12:00:01' }))).live, false)
  assert.equal(
    /** @type {any} */ (liveOf('joomla', jRow({ publish_down: '2026-09-30 11:59:59' }))).live,
    false
  )
  // The same row, an hour earlier: not yet.
  assert.equal(
    /** @type {any} */ (
      liveOf('joomla', jRow({ publish_up: '2026-09-15 09:00:00' }), Date.parse('2026-09-15T08:59:59Z'))
    ).live,
    false
  )
  // A date-only value and an ISO one are read as UTC too.
  assert.equal(/** @type {any} */ (liveOf('joomla', jRow({ publish_up: '2026-10-01' }))).live, false)
  assert.equal(/** @type {any} */ (liveOf('joomla', jRow({ publish_up: '2026-09-30T11:00:00' }))).live, true)
})

test('liveOf (Joomla): a state that is not 1 is not live; the tree kinds keep their status in `published`', () => {
  for (const [state, why] of /** @type {const} */ ([
    [0, 'unpublished'],
    [2, 'archived'],
    [-2, 'trashed']
  ])) {
    assert.deepEqual(liveOf('joomla', jRow({ state })), { live: false, why }, String(state))
    assert.deepEqual(
      liveOf('joomla', { title: 'Events', published: state }, NOW, 'category'),
      { live: false, why },
      `published ${state}`
    )
  }
  assert.deepEqual(liveOf('joomla', { title: 'Events', published: 1 }, NOW, 'category'), { live: true })
  // The database may hand a number over as text.
  assert.deepEqual(liveOf('joomla', jRow({ state: '1' })), { live: true })
  assert.deepEqual(liveOf('joomla', jRow({ state: '0' })), { live: false, why: 'unpublished' })
  // A date that is there and cannot be read is no proof of anything: no verdict, not a guess.
  assert.equal(liveOf('joomla', jRow({ publish_up: 'next spring' })), null)
  assert.equal(liveOf('joomla', jRow({ publish_down: 'someday' })), null)
})

test('🔒 WordPress: the create receipt says live:true for a published post — beside stored, next unchanged, no read added', async () => {
  const site = wpSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: site.send }),
      plan: wpCreate({ post_title: 'Autumn open day', post_status: 'publish', post_content: BODY })
    })
  )
  assert.equal(out.live, true)
  assert.equal('why' in out, false, 'nothing to explain when it is live')
  assert.equal(out.stored.post_status, 'publish', 'stored stays the site’s columns, one to one')
  assert.equal('live' in out.stored, false)
  assert.equal(out.next, STORED_NEXT)
  assert.deepEqual(actions(site.sent), ['content.update', 'content.get'])
})

test('🔒 WordPress: a date still to come is live:false, scheduled for that date — a draft is live:false, draft', async () => {
  const future = wpSite(wpRow({ post_status: 'future', post_date: '2027-03-01 09:00:00' }))
  const scheduled = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: future.send }),
      plan: wpCreate({
        post_title: 'Autumn open day',
        post_status: 'publish',
        post_date: '2027-03-01 09:00:00',
        post_content: BODY
      })
    })
  )
  assert.equal(scheduled.live, false)
  assert.equal(scheduled.why, 'scheduled for 2027-03-01 09:00:00')
  const draft = wpSite(wpRow({ post_status: 'draft' }))
  const made = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: draft.send }),
      plan: wpCreate({ post_title: 'Autumn open day', post_content: BODY })
    })
  )
  assert.equal(made.live, false)
  assert.equal(made.why, 'draft')
  assert.equal(made.next, STORED_NEXT)
})

test('WordPress: a create with no body says live too (the door’s own read), and an edit, a failed read and a row with no status say nothing', async () => {
  const page = wpSite(wpRow({ post_type: 'page', post_category: [] }))
  const bare = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: page.send }),
      plan: wpCreate({ post_type: 'page', post_title: 'Autumn open day', post_status: 'publish' })
    })
  )
  assert.equal(bare.live, true)
  // An edit is not echoed, and so has no verdict.
  const edit = wpSite()
  const ctx = wordpress({ send: edit.send })
  ctx.memory.rememberRead('session-w', { kind: 'post', id: 731, chars: BODY.length })
  const edited = /** @type {any} */ (
    await runSiteCall({
      ...ctx,
      plan: plan({
        action: 'content.update',
        params: { kind: 'post', id: 731, fields: { post_content: BODY } }
      })
    })
  )
  assert.equal(edited.ok, true)
  assert.equal('live' in edited, false)
  assert.equal('why' in edited, false)
  // A row that answers columns but no status: stored is there, `live` is not.
  const noStatus = wpSite(wpRow({ post_status: undefined }))
  const silent = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: noStatus.send }),
      plan: wpCreate({ post_title: 'Autumn open day', post_content: BODY })
    })
  )
  assert.equal(silent.stored.post_title, 'Autumn open day')
  assert.equal('post_status' in silent.stored, false)
  assert.equal('live' in silent, false)
  assert.equal('why' in silent, false)
  // A read that fails leaves the receipt as it was: no stored, no live.
  const failing = relay((action, params) =>
    action === 'content.get'
      ? { ok: false }
      : { ok: true, kind: 'post', id: 731, key: null, created: !params.id }
  )
  const plain = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: failing.send }),
      plan: wpCreate({ post_title: 'Autumn open day', post_status: 'publish' })
    })
  )
  assert.equal('stored' in plain, false)
  assert.equal('live' in plain, false)
})

test('🔒 Joomla: an article create is live when state is 1 and its dates are open — judged by the host clock', async () => {
  const site = jSite()
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate({ title: 'Autumn open day', catid: 8, state: 1, publish_up: '2026-09-15 09:00:00' })
    })
  )
  assert.equal(out.live, true)
  assert.equal('why' in out, false)
  assert.equal(out.stored.publish_up, '2026-09-15 09:00:00')
  assert.equal(out.next, STORED_NEXT)
  assert.deepEqual(actions(site.sent), ['content.update', 'content.get'])
})

test('🔒 Joomla: a publish_up still to come, an end date gone, and state 0 are each live:false with their reason', async () => {
  for (const [row, why] of /** @type {const} */ ([
    [{ publish_up: '2027-03-01 09:00:00' }, 'scheduled for 2027-03-01 09:00:00'],
    [{ publish_down: '2026-09-29 23:59:59' }, 'ended 2026-09-29 23:59:59'],
    [{ state: 0 }, 'unpublished']
  ])) {
    const site = jSite(jRow(row))
    const out = /** @type {any} */ (
      await runSiteCall({
        ...joomla({ send: site.send }),
        plan: jCreate({ title: 'Autumn open day', catid: 8, state: 1 })
      })
    )
    assert.equal(out.live, false, why)
    assert.equal(out.why, why)
    assert.equal(out.next, STORED_NEXT, 'the sentence is the one it always was')
  }
})

test('Joomla: the clock is the host’s — the same row is live one day and scheduled the day before', async () => {
  const row = jRow({ publish_up: '2026-10-05 09:00:00' })
  const on = jSite(row)
  const later = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: on.send, now: () => Date.parse('2026-10-05T09:00:00Z') }),
      plan: jCreate({ title: 'Autumn open day', catid: 8, state: 1 })
    })
  )
  assert.equal(later.live, true)
  const before = jSite(row)
  const earlier = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: before.send, now: () => Date.parse('2026-10-04T09:00:00Z') }),
      plan: jCreate({ title: 'Autumn open day', catid: 8, state: 1 })
    })
  )
  assert.equal(earlier.live, false)
  assert.equal(earlier.why, 'scheduled for 2026-10-05 09:00:00')
})

test('Joomla: a tree kind says live from `published`; an edit, and a row with no status, say nothing', async () => {
  const category = jSite(
    { id: 90, title: 'Events', alias: 'events', path: 'news/events', published: 1, access: 1 },
    'category'
  )
  const made = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: category.send }),
      plan: jCreate({ title: 'Events', parent_id: 4 }, 'category')
    })
  )
  assert.equal(made.live, true)
  const edit = jSite()
  const edited = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: edit.send }),
      plan: plan({
        action: 'content.update',
        params: { kind: 'article', id: 90, apply_id: 'x', fields: { title: 'New title' } }
      })
    })
  )
  assert.equal(edited.created, false)
  assert.equal('live' in edited, false)
  const noStatus = jSite({ id: 90, title: 'Autumn open day', alias: 'autumn-open-day', access: 1 })
  const silent = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: noStatus.send }),
      plan: jCreate({ title: 'Autumn open day', catid: 8 })
    })
  )
  assert.equal(silent.stored.alias, 'autumn-open-day')
  assert.equal('live' in silent, false)
  assert.equal('why' in silent, false)
  const off = jSite()
  const quiet = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: off.send, facts: { platform: 'joomla', sealed: false, verifyBodyWrites: false } }),
      plan: jCreate({ title: 'Autumn open day', catid: 8 })
    })
  )
  assert.equal('live' in quiet, false, 'the switch that turns the in-tool check off turns this read off')
})

// ── F2 review: a verdict only where the row can decide it ────────────────────────────────────────────
// `live` means a visitor can open the record now. A row's own status decides that only for a record with an
// address of its own. A Joomla module is shown where a menu assignment puts it (kind `moduleAssignment`, a
// write no create makes), so a fresh one is shown NOWHERE while its row says `published: 1`; a menu item, a
// banner, a field, a redirect and a language are no page. Saying `live:true` for them is worse than saying
// nothing (a receipt is read as fact, and the next sentence tells the agent there is nothing to check).

test('liveOf (Joomla): only a kind with an address of its own gets a verdict; every other kind — and a caller that names none — gets none', () => {
  for (const kind of ['article', 'category', 'tag', 'contact', 'newsfeed'])
    assert.deepEqual(liveOf('joomla', jRow(), NOW, kind), { live: true }, kind)
  for (const kind of [
    'module',
    'menuItem',
    'menutype',
    'banner',
    'bannerClient',
    'field',
    'redirect',
    'language',
    'moduleAssignment',
    'templateStyle',
    ''
  ]) {
    assert.equal(liveOf('joomla', jRow(), NOW, kind), null, `${kind || '(no kind)'}, published`)
    assert.equal(liveOf('joomla', jRow({ state: 0 }), NOW, kind), null, `${kind || '(no kind)'}, unpublished`)
    assert.equal(liveOf('joomla', { title: 'Events', published: 1 }, NOW, kind), null, `${kind} by published`)
  }
  // The kind is asked for: leaving it out is no licence to guess.
  assert.equal(liveOfAt('joomla', jRow(), NOW), null)
})

test('liveOf (Joomla): a row on an access level other than Public is never called live — the number does not say who may open it', () => {
  assert.deepEqual(liveOf('joomla', jRow({ access: 1 })), { live: true })
  assert.deepEqual(liveOf('joomla', jRow({ access: '1' })), { live: true })
  // Registered, Special, Guest, Super Users, a level a site made up, and what is not a level at all.
  for (const access of [2, 3, 5, 6, 9, 0, '2', 'registered', null])
    assert.equal(liveOf('joomla', jRow({ access }), NOW, 'article'), null, String(access))
  assert.equal(liveOf('joomla', { title: 'Events', published: 1, access: 2 }, NOW, 'category'), null)
  // A row with no access column says nothing about it: the verdict stands.
  const { access: _access, ...noAccess } = jRow()
  assert.deepEqual(liveOf('joomla', noAccess), { live: true })
  // What is closed stays closed whatever the level: unpublished, not yet, and over are true for any reader.
  assert.deepEqual(liveOf('joomla', jRow({ access: 2, state: 0 })), { live: false, why: 'unpublished' })
  assert.deepEqual(liveOf('joomla', jRow({ access: 2, publish_up: '2027-03-01 09:00:00' })), {
    live: false,
    why: 'scheduled for 2027-03-01 09:00:00'
  })
  assert.deepEqual(liveOf('joomla', jRow({ access: 2, publish_down: '2026-09-29 23:59:59' })), {
    live: false,
    why: 'ended 2026-09-29 23:59:59'
  })
})

test('liveOf (WordPress): only a post or a page is opened by its address — a menu, a template, a form or a plugin’s type says nothing', () => {
  for (const post_type of ['post', 'page']) {
    assert.deepEqual(liveOf('wordpress', wpRow({ post_type })), { live: true }, post_type)
    assert.deepEqual(
      liveOf('wordpress', wpRow({ post_type, post_status: 'draft' })),
      { live: false, why: 'draft' },
      `${post_type}, draft`
    )
  }
  for (const post_type of [
    'wp_navigation',
    'wp_block',
    'nav_menu_item',
    'wp_template',
    'wp_template_part',
    'wp_global_styles',
    'wpcf7_contact_form',
    'attachment',
    'product',
    '  ',
    undefined
  ]) {
    assert.equal(liveOf('wordpress', wpRow({ post_type })), null, `${String(post_type)}, publish`)
    assert.equal(liveOf('wordpress', wpRow({ post_type, post_status: 'draft' })), null, `${post_type}, draft`)
  }
})

test('liveOf (WordPress): a post behind a password is never called live; a blank password is no password', () => {
  assert.equal(liveOf('wordpress', wpRow({ post_password: 'open-sesame' })), null)
  assert.deepEqual(liveOf('wordpress', wpRow({ post_password: '' })), { live: true })
  // Not published is still not published, password or not.
  assert.deepEqual(liveOf('wordpress', wpRow({ post_password: 'open-sesame', post_status: 'draft' })), {
    live: false,
    why: 'draft'
  })
})

test('🔒 Joomla: a module create carries `stored` and no verdict — nothing shows it until a page assignment does', async () => {
  const row = {
    id: 90,
    title: 'Opening hours',
    position: 'sidebar-right',
    published: 1,
    language: '*',
    access: 1
  }
  const site = jSite(row, 'module')
  const out = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: site.send }),
      plan: jCreate(
        {
          title: 'Opening hours',
          module: 'mod_custom',
          position: 'sidebar-right',
          published: 1,
          content: '<p>Open on weekdays.</p>'
        },
        'module'
      )
    })
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(out.created, true)
  assert.deepEqual(out.stored, {
    title: 'Opening hours',
    published: 1,
    position: 'sidebar-right',
    language: '*',
    access: 1
  })
  assert.equal('live' in out, false, 'a module row that says published is not a module that shows')
  assert.equal('why' in out, false)
  assert.equal(out.next, STORED_NEXT)
  assert.deepEqual(actions(site.sent), ['content.update', 'content.get'])
  // Unpublished: the same silence — `stored.published` already says so.
  const off = jSite({ ...row, published: 0 }, 'module')
  const quiet = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: off.send }),
      plan: jCreate({ title: 'Opening hours', module: 'mod_custom', position: 'sidebar-right' }, 'module')
    })
  )
  assert.equal(quiet.stored.published, 0)
  assert.equal('live' in quiet, false)
  assert.equal('why' in quiet, false)
})

test('Joomla: a menu item, a redirect that carries the component’s own warning, a banner and a field create say no verdict either', async () => {
  const cases = /** @type {const} */ ([
    [
      'menuItem',
      { title: 'Events', menutype: 'mainmenu', published: 1 },
      { menutype: 'mainmenu', published: 1 }
    ],
    ['redirect', { old_url: '/old-page', new_url: '/new-page', published: 1 }, { published: 1 }],
    ['banner', { name: 'Spring offer', catid: 3, state: 1 }, { state: 1 }],
    ['field', { title: 'Allergens', type: 'text', context: 'com_content.article', state: 1 }, { state: 1 }]
  ])
  for (const [kind, fields, columns] of cases) {
    const site = relay((action, params) =>
      action === 'content.get'
        ? { ok: true, kind, id: 90, item: { id: 90, title: 'Events', language: '*', access: 1, ...columns } }
        : {
            ok: true,
            kind: params.kind,
            id: 90,
            created: true,
            // The component's own answer for a redirect while its plugin is off: it does nothing yet.
            ...(kind === 'redirect'
              ? {
                  warnings: [
                    { code: 'REDIRECT_PLUGIN_DISABLED', severity: 'warning', message: 'it does nothing yet' }
                  ]
                }
              : {})
          }
    )
    const out = /** @type {any} */ (
      await runSiteCall({ ...joomla({ send: site.send }), plan: jCreate(fields, kind) })
    )
    assert.equal(out.ok, true, kind)
    assert.ok(out.stored, `${kind}: the columns are still shown`)
    assert.equal('live' in out, false, kind)
    assert.equal('why' in out, false, kind)
    if (kind === 'redirect')
      assert.equal(out.warnings[0].code, 'REDIRECT_PLUGIN_DISABLED', 'the warning stays')
  }
})

test('Joomla: an article on a level other than Public shows its level in `stored` and no verdict; Public still says live', async () => {
  for (const access of [2, 3]) {
    const site = jSite(jRow({ access }))
    const out = /** @type {any} */ (
      await runSiteCall({
        ...joomla({ send: site.send }),
        plan: jCreate({ title: 'Autumn open day', catid: 8, state: 1, access })
      })
    )
    assert.equal(out.stored.access, access)
    assert.equal('live' in out, false, `access ${access}`)
    assert.equal('why' in out, false, `access ${access}`)
    assert.equal(out.next, STORED_NEXT)
  }
  const open = /** @type {any} */ (
    await runSiteCall({
      ...joomla({ send: jSite(jRow({ access: 1 })).send }),
      plan: jCreate({ title: 'Autumn open day', catid: 8, state: 1 })
    })
  )
  assert.equal(open.live, true)
})

test('WordPress: a menu created as a post says stored and no verdict; a page still says live', async () => {
  const menu = wpSite(wpRow({ post_type: 'wp_navigation', post_category: [], post_content: '' }))
  const made = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: menu.send }),
      plan: wpCreate({ post_type: 'wp_navigation', post_title: 'Main menu', post_status: 'publish' })
    })
  )
  assert.equal(made.ok, true)
  assert.equal(made.stored.post_type, 'wp_navigation')
  assert.equal('live' in made, false)
  assert.equal('why' in made, false)
  const page = wpSite(wpRow({ post_type: 'page', post_category: [] }))
  const shown = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: page.send }),
      plan: wpCreate({ post_type: 'page', post_title: 'Autumn open day', post_status: 'publish' })
    })
  )
  assert.equal(shown.live, true)
  // A password on the post: stored, no verdict.
  const locked = wpSite(wpRow({ post_password: 'open-sesame' }))
  const behind = /** @type {any} */ (
    await runSiteCall({
      ...wordpress({ send: locked.send }),
      plan: wpCreate({ post_title: 'Autumn open day', post_status: 'publish', post_content: BODY })
    })
  )
  assert.equal(behind.stored.post_title, 'Autumn open day')
  assert.equal('live' in behind, false)
})
