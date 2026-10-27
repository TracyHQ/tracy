/**
 * Opt D (09/10/2026): a write's receipt says what it wrote, so the agent reads nothing back after it —
 * per CMS: a contract apply on WordPress and Joomla (`wrote`, `in`), a WordPress block write (`holds`),
 * an EmDash picture field and menu (`mediaView`, `menuSetReceipt`) — and a read made right after a clean
 * receipt carries one line saying the receipt was the check (`createAfterWrite`), never a refusal.
 *
 *   node --test packages/tools/tracy-site-tools/test/receipt-echo.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { createCallMemory } from '../src/host/call-memory.mjs'
import { EMDASH_RECEIPT_NEXT, receiptOf, shapeAnswer } from '../src/host/emdash.mjs'
import {
  afterWriteLine,
  bodyHolds,
  contractWrote,
  createAfterWrite,
  ECHO_SLOTS_MAX,
  ECHO_VALUE_MAX,
  echoValue,
  HOLDS_MAX,
  mediaView,
  menuSetReceipt
} from '../src/host/receipt-echo.mjs'
import { planCall } from '../src/host/site.mjs'
import { runSiteCall, WRITE_RECEIPT_NEXT } from '../src/host/site-call.mjs'

const HEX = '2cc4f11e402bde3214c8e2cbef5a6dbd987de273196875bde9bc6d3101daba5a'

// ── the pure pieces ──────────────────────────────────────────────────────────────────────────────

test('echoValue: words collapsed and cut, a picture by its file name, anything else as JSON', () => {
  const rows = [
    ['  Built for\n the way you work ', 'Built for the way you work'],
    [`wp-content/uploads/tracy-content/${HEX}.jpg`, `${HEX}.jpg`],
    ['images/tracy-content/hero.webp?v=2', 'hero.webp'],
    ['/_emdash/api/media/file/01M3RC.PNG', '01M3RC.PNG'],
    ['hero.png', 'hero.png'],
    ['tel:+88005506790', 'tel:+88005506790'],
    [{ href: '/contact', text: 'Talk to us' }, '{"href":"/contact","text":"Talk to us"}'],
    [null, 'null']
  ]
  for (const [value, shown] of rows) assert.equal(echoValue(value), shown, JSON.stringify(value))
  const long = echoValue('x'.repeat(500))
  assert.equal(long.length, ECHO_VALUE_MAX)
  assert.ok(long.endsWith('…'))
})

test('contractWrote: every slot with its value, the rest counted; the places named once, without the field', () => {
  const slots = [
    { key: 'module-441.8', label: '[Tracy Business] Home - Hero (en) / image' },
    { key: 'module-441.9', label: '[Tracy Business] Home - Hero (en) / image-alt' },
    { key: 'module-461.8', label: '[Tracy Business] Home - Hero (ru) / image' }
  ]
  assert.deepEqual(
    contractWrote(
      {
        'module-441.8': `images/tracy-content/${HEX}.jpg`,
        'module-441.9': 'Steel frame at dawn',
        'module-461.8': `images/tracy-content/${HEX}.jpg`
      },
      slots
    ),
    {
      wrote: {
        'module-441.8': `${HEX}.jpg`,
        'module-441.9': 'Steel frame at dawn',
        'module-461.8': `${HEX}.jpg`
      },
      in: ['[Tracy Business] Home - Hero (en)', '[Tracy Business] Home - Hero (ru)']
    }
  )
  // WordPress inspects a map of words, no labels: the slots alone.
  assert.deepEqual(contractWrote({ 'home.hero.heading': 'Hi' }, { 'home.hero.heading': 'Welcome' }), {
    wrote: { 'home.hero.heading': 'Hi' }
  })
  const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`s.${i}`, `v${i}`]))
  const out = contractWrote(many)
  assert.equal(Object.keys(out?.wrote ?? {}).length, ECHO_SLOTS_MAX + 1)
  assert.equal(out?.wrote['…'], '3 more')
  assert.equal(contractWrote({}), null)
  assert.equal(contractWrote(undefined), null)
})

test('bodyHolds: the edited blocks’ words only when the body read back holds every one of them', () => {
  const stored =
    '<!-- wp:paragraph -->\n<p>© 2026 Sweet Crumbs &amp; Co. All rights reserved.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph --><p>Open daily</p><!-- /wp:paragraph -->'
  const rows = [
    // [blocks, stored, holds]
    [
      {
        1: '<!-- wp:paragraph -->\n<p>© 2026 Sweet Crumbs &amp; Co. All rights reserved.</p>\n<!-- /wp:paragraph -->'
      },
      stored,
      '© 2026 Sweet Crumbs & Co. All rights reserved.'
    ],
    [{ footer: { find: '2025', replace: 'Open daily' } }, stored, 'Open daily'],
    [
      { 1: '<p>Open daily</p>', 2: '<p>© 2026 Sweet Crumbs &amp; Co.</p>' },
      stored,
      'Open daily · © 2026 Sweet Crumbs & Co.'
    ],
    // the site dropped or changed the words: no claim
    [{ 1: '<p>Closed on Sundays</p>' }, stored, null],
    [{ 1: '<p>Open daily</p>', 2: '<p>Closed on Sundays</p>' }, stored, null],
    // attributes only, an empty block, nothing read back: nothing to say
    [{ 1: { attrs: { align: 'wide' } } }, stored, null],
    [{ 1: '<!-- wp:spacer /-->' }, stored, null],
    [{ 1: '<p>Open daily</p>' }, null, null],
    [null, stored, null]
  ]
  for (const [blocks, body, holds] of rows)
    assert.equal(bodyHolds(blocks, body), holds, JSON.stringify(blocks))
  const words = 'w'.repeat(400)
  assert.equal(bodyHolds({ 1: `<p>${words}</p>` }, `<p>${words}</p>`)?.length, HOLDS_MAX)
})

test('mediaView: a media object as its id, file name, alt and size; anything else is not one', () => {
  const media = {
    id: '01M3RBMXND84VQJAHSK9QF3XD1',
    provider: 'local',
    filename: 'hero-kaluga-dusk.jpg',
    mimeType: 'image/jpeg',
    width: 1590,
    height: 1000,
    blurhash: 'LG85QI%Ls;WY*0t7WBR+9sRjR%ax',
    dominantColor: 'rgb(52,81,90)',
    alt: 'Industrial park at dusk',
    meta: { storageKey: '01M3RBMXNDQGK20E9ZCS3J3VPP.jpg' }
  }
  assert.deepEqual(mediaView(media), {
    id: '01M3RBMXND84VQJAHSK9QF3XD1',
    filename: 'hero-kaluga-dusk.jpg',
    alt: 'Industrial park at dusk',
    width: 1590,
    height: 1000
  })
  for (const other of [
    '01M3RB',
    { id: 'x' },
    { filename: 'a.png' },
    { id: '', provider: 'local' },
    null,
    [1]
  ])
    assert.equal(mediaView(other), null, JSON.stringify(other))
})

test('menuSetReceipt: EmDash’s count, the labels set in order when it counted exactly those, and the receipt line', () => {
  const items = ['Home', 'About', 'Services', 'Common questions'].map((label) => ({ label, type: 'custom' }))
  assert.deepEqual(menuSetReceipt({ name: 'primary', items }, { name: 'primary', itemCount: 4 }, 'N'), {
    name: 'primary',
    itemCount: 4,
    labels: ['Home', 'About', 'Services', 'Common questions'],
    next: 'N'
  })
  // A count that differs from what was sent: the labels are not claimed.
  assert.deepEqual(menuSetReceipt({ name: 'primary', items }, { name: 'primary', itemCount: 3 }, 'N'), {
    name: 'primary',
    itemCount: 3,
    next: 'N'
  })
  const twenty = Array.from({ length: 20 }, (_, i) => ({ label: `Item ${i}` }))
  const long = menuSetReceipt({ items: twenty }, { name: 'primary', itemCount: 20 }, 'N')
  assert.equal(long?.labels?.length, 12)
  assert.equal(long?.labelsLeftOut, 8)
  assert.equal(menuSetReceipt({ items }, { name: 'primary' }, 'N'), null)
})

// ── WordPress and Joomla: a contract apply's receipt ────────────────────────────────────────────────

/**
 * One contract site per CMS. WordPress (bound): inspect slots are a map of words; Joomla: a list of
 * labelled slots (the stand's inspect of 24/09).
 */
const CONTRACT_SITES = {
  wordpress: {
    facts: { platform: 'wordpress', sealed: true, contractDoor: true },
    inspect: {
      ok: true,
      contract: 'shop/wp7/1.0.0',
      revision: 'rev-site-1',
      slots: { 'home.hero.img': 'wp-content/uploads/2026/09/hero.png', 'home.hero.heading': 'Welcome' }
    },
    accepted: { ok: true, written: [{ kind: 'post', id: 42, key: null }], afterRevision: 'rev-site-2' },
    changes: {
      'home.hero.img': `wp-content/uploads/tracy-content/${HEX}.jpg`,
      'home.hero.heading': 'Built for the way you work'
    },
    wrote: { 'home.hero.img': `${HEX}.jpg`, 'home.hero.heading': 'Built for the way you work' },
    in: undefined
  },
  joomla: {
    facts: { platform: 'joomla', sealed: true },
    inspect: JSON.parse(
      readFileSync(new URL('./fixtures/contract/four-entities.json', import.meta.url), 'utf8')
    ).answer,
    accepted: { ok: true, ids: [441], afterRevision: 'rev-after-apply' },
    changes: { 'module-441.8': `images/tracy-content/${HEX}.jpg`, 'module-441.1': 'Northgate Industrial' },
    wrote: { 'module-441.8': `${HEX}.jpg`, 'module-441.1': 'Northgate Industrial' },
    in: ['[Tracy Business] Home - Hero (en)']
  }
}

for (const [cms, s] of Object.entries(CONTRACT_SITES)) {
  /** @param {(params: Record<string, any>) => unknown} apply */
  const site = (apply) => {
    const memory = createCallMemory({ now: () => 1_000 })
    const send = async (/** @type {string} */ _action, /** @type {Record<string, any>} */ params) =>
      params.operation === 'inspect' ? s.inspect : apply(params)
    /** @param {unknown} args */
    const call = async (args) => {
      const plan = planCall(args)
      assert.ok(plan.ok, JSON.stringify(plan))
      return /** @type {any} */ (
        await runSiteCall({
          plan,
          send,
          memory,
          sessionId: `session-${cms}`,
          label: `${cms}-1`,
          actorKey: 'ana@example.com',
          facts: s.facts,
          sleep: async () => {}
        })
      )
    }
    return call
  }
  const inspect = { action: 'content.contract', params: { operation: 'inspect' } }
  const apply = {
    action: 'content.contract',
    params: { operation: 'apply', expected_revision: s.inspect.revision, changes: s.changes }
  }

  test(`${cms}: an accepted contract apply names what it wrote, and the places, in a short receipt`, async () => {
    const call = site(() => s.accepted)
    await call(inspect)
    const out = await call(apply)
    assert.equal(out.ok, true)
    assert.deepEqual(out.wrote, s.wrote)
    assert.deepEqual(out.in, s.in)
    assert.equal(out.next, WRITE_RECEIPT_NEXT)
    // Short: what was added is the slots and their values, nothing of the page.
    const added = JSON.stringify({ wrote: out.wrote, in: out.in }).length
    assert.ok(added <= 260, `${added} chars added`)
    assert.ok(!('shown' in out) && !('page' in out), 'no claim about a page')
  })

  test(`${cms}: a refused apply names nothing as written`, async () => {
    const call = site(() => ({ ok: false, error: 'contract_failed', message: 'Value too long', errors: [] }))
    await call(inspect)
    const out = await call(apply)
    assert.equal(out.ok, false)
    assert.equal(out.wrote, undefined)
  })
}

// ── WordPress: a block write's receipt ───────────────────────────────────────────────────────────

const para = (/** @type {string} */ words) => `<!-- wp:paragraph -->\n<p>${words}</p>\n<!-- /wp:paragraph -->`

/** A WordPress site holding post 81, whose writes are kept; `keep` decides what it stores of a body. */
function wordpress(keep = (/** @type {string} */ body) => body) {
  const post = {
    ID: 81,
    post_title: 'Footer',
    post_type: 'page',
    post_content: [para('Fresh bread every morning'), para('© 2025 Sweet Crumbs. All rights reserved.')].join(
      '\n\n'
    )
  }
  const send = async (/** @type {string} */ action, /** @type {Record<string, any>} */ params) => {
    if (action === 'content.get') return { ok: true, kind: 'post', id: 81, item: { ...post } }
    if (action === 'content.update') {
      if (typeof params.fields?.post_content === 'string')
        post.post_content = keep(params.fields.post_content)
      return { ok: true, kind: 'post', id: 81, created: false }
    }
    return { ok: false, error: 'bad_action' }
  }
  const memory = createCallMemory({ now: () => 1_000 })
  /** @param {unknown} args */
  const call = async (args) => {
    const plan = planCall(args)
    assert.ok(plan.ok, JSON.stringify(plan))
    return /** @type {any} */ (
      await runSiteCall({
        plan,
        send,
        memory,
        sessionId: 'session-wp',
        label: 'wp-1',
        actorKey: 'ana@example.com',
        facts: { platform: 'wordpress', sealed: false },
        sleep: async () => {}
      })
    )
  }
  return call
}

test('wordpress: a block write says the words the body read back now holds', async () => {
  const call = wordpress()
  const read = await call({ action: 'content.get', params: { kind: 'post', id: 81, outline: true } })
  const out = await call({
    action: 'content.update',
    params: {
      kind: 'post',
      id: 81,
      rev: read.rev,
      blocks: { 1: para('© 2026 Sweet Crumbs. All rights reserved.') }
    }
  })
  assert.equal(out.ok, true)
  assert.equal(out.holds, '© 2026 Sweet Crumbs. All rights reserved.')
  assert.equal(typeof out.verified, 'object')
})

test('wordpress: words the site did not keep are never shown as held', async () => {
  // The site stores the block without the new year (a filter, another writer): the read finds no "2026".
  const call = wordpress((body) => body.replace('2026', '2025'))
  const read = await call({ action: 'content.get', params: { kind: 'post', id: 81, outline: true } })
  const out = await call({
    action: 'content.update',
    params: {
      kind: 'post',
      id: 81,
      rev: read.rev,
      blocks: { 1: para('© 2026 Sweet Crumbs. All rights reserved.') }
    }
  })
  assert.equal(out.ok, true)
  assert.equal(out.holds, undefined)
})

// ── EmDash: a picture field, a menu ─────────────────────────────────────────────────────────────────

const pic = (/** @type {string} */ id, /** @type {string} */ filename, /** @type {string} */ alt) => ({
  id,
  provider: 'local',
  filename,
  mimeType: 'image/jpeg',
  width: 1600,
  height: 1000,
  blurhash: 'LKPQHX-px]%g_Nt7kCR*D*ofR*Rj',
  dominantColor: 'rgb(212,215,216)',
  alt,
  meta: { storageKey: `${id}.jpg`, variants: { thumb: `${id}-thumb.jpg`, wide: `${id}-wide.jpg` } }
})

test('emdash: a picture field’s receipt shows the picture before and after by file name and alt, shorter', () => {
  const was = pic('01OLD', 'hero-ru.png', 'Drop a site photo here')
  const now = pic('01NEW', 'hero-kaluga-dusk.jpg', 'Industrial park at dusk')
  const item = (/** @type {unknown} */ hero) => ({
    id: 'E1',
    slug: 'home',
    locale: 'en',
    status: 'published',
    liveRevisionId: 'L2',
    draftRevisionId: null,
    data: { hero_image: hero }
  })
  const out = receiptOf({
    tool: 'content_update',
    args: { collection: 'home', id: 'E1', data: { hero_image: '01NEW' } },
    answer: { item: item(now), _rev: 'r2' },
    before: { ...item(was), liveRevisionId: 'L1' }
  })
  assert.deepEqual(out.changed, {
    hero_image: {
      before: {
        id: '01OLD',
        filename: 'hero-ru.png',
        alt: 'Drop a site photo here',
        width: 1600,
        height: 1000
      },
      after: {
        id: '01NEW',
        filename: 'hero-kaluga-dusk.jpg',
        alt: 'Industrial park at dusk',
        width: 1600,
        height: 1000
      }
    }
  })
  // The undo stays EmDash's exact restore of the revision visitors saw.
  assert.match(String(out.undo), /^revision_restore \{revisionId:"L1"\}/)
  assert.equal(out.next, EMDASH_RECEIPT_NEXT)
  // Before opt D the same receipt carried 300 chars of each object's JSON; now each side is under 130.
  assert.ok(JSON.stringify(out.changed).length < 300, String(JSON.stringify(out.changed).length))
})

// 🔒 The receipt shows a picture as `mediaView`'s subset; the undo never writes that subset back. With a
// live revision a changed picture restores it; without one the undo by value takes the whole picture
// from `undoData`. An unchanged picture beside a short change forces nothing. Before the fix an undo by
// value wrote the subset (a picture without provider, mimeType or meta), and an unchanged picture
// turned every undo into a restore.
const RESTORE = /^revision_restore \{revisionId:"L1"\}/
const BY_VALUE = /^content_update with the same collection and id, data = each field's before/
const PICTURE_UNDOS = [
  {
    name: 'a changed picture, with a live revision: restore it',
    was: { hero_image: pic('01OLD', 'old.png', 'Old') },
    now: { hero_image: pic('01NEW', 'new.jpg', 'New') },
    live: 'L1',
    undo: RESTORE,
    undoData: undefined
  },
  {
    name: 'a changed picture, no live revision: by value, with the whole old picture',
    was: { hero_image: pic('01OLD', 'old.png', 'Old') },
    now: { hero_image: pic('01NEW', 'new.jpg', 'New') },
    live: null,
    undo: BY_VALUE,
    undoData: { hero_image: pic('01OLD', 'old.png', 'Old') }
  },
  {
    name: 'a picture removed, no live revision: by value, with the whole old picture',
    was: { hero_image: pic('01OLD', 'old.png', 'Old') },
    now: { hero_image: null },
    live: null,
    undo: BY_VALUE,
    undoData: { hero_image: pic('01OLD', 'old.png', 'Old') }
  },
  {
    name: 'a picture added where there was none: by value, the before is null',
    was: { hero_image: null },
    now: { hero_image: pic('01NEW', 'new.jpg', 'New') },
    live: 'L1',
    undo: BY_VALUE,
    undoData: undefined
  },
  {
    name: 'an unchanged picture beside a short change: by value, no restore forced',
    was: { hero_image: pic('01SAME', 'same.jpg', 'Same'), title: 'Old title' },
    now: { hero_image: pic('01SAME', 'same.jpg', 'Same'), title: 'New title' },
    live: 'L1',
    undo: BY_VALUE,
    undoData: undefined
  }
]
for (const row of PICTURE_UNDOS)
  test(`emdash picture undo: ${row.name}`, () => {
    const item = (/** @type {Record<string, unknown>} */ data, /** @type {string | null} */ live) => ({
      id: 'E1',
      slug: 'home',
      locale: 'en',
      status: 'published',
      liveRevisionId: live,
      draftRevisionId: null,
      data
    })
    const out = receiptOf({
      tool: 'content_update',
      args: {
        collection: 'home',
        id: 'E1',
        data: Object.fromEntries(Object.keys(row.now).map((k) => [k, 'x']))
      },
      answer: { item: item(row.now, 'L2'), _rev: 'r2' },
      before: item(row.was, row.live)
    })
    assert.match(String(out.undo), row.undo)
    assert.deepEqual(out.undoData, row.undoData)
    if (out.undoData !== undefined)
      assert.match(String(out.undo), /undoData's whole value for a picture field/)
    // What a person reads stays the short view either way.
    const shown = /** @type {any} */ (out.changed).hero_image
    for (const side of [shown.before, shown.after, shown.unchanged])
      if (side !== null && side !== undefined) assert.equal(side.blurhash, undefined)
  })

test('emdash: menu_set_items answers as a receipt, with the labels set', () => {
  const args = { name: 'primary', locale: 'en', items: [{ label: 'Home' }, { label: 'FAQ' }] }
  assert.deepEqual(shapeAnswer({ tool: 'menu_set_items', args, data: { name: 'primary', itemCount: 2 } }), {
    name: 'primary',
    itemCount: 2,
    labels: ['Home', 'FAQ'],
    next: EMDASH_RECEIPT_NEXT
  })
  // Any other shape is shown as EmDash sent it.
  assert.deepEqual(shapeAnswer({ tool: 'menu_set_items', args, data: { surprise: 1 } }), { surprise: 1 })
})

// ── a read right after a receipt ───────────────────────────────────────────────────────────────

/** @param {string} action @param {Record<string, unknown>} [extra] */
const site = (action, extra = {}) => ({ tool: 'tracy_site', action, write: false, ...extra })
const W = (/** @type {string} */ action) => ({ tool: 'tracy_site', action, write: true })
const RECEIPT = { ok: true, next: WRITE_RECEIPT_NEXT }
const READ = { ok: true, text: 'page words' }

test('afterWrite: which read right after which receipt carries the line — one table for the three CMS', () => {
  /** @type {Array<[string, Array<[any, unknown, number?]>, boolean]>} */
  const rows = [
    [
      'contract apply, then page.look',
      [
        [W('content.contract'), RECEIPT],
        [site('page.look'), READ]
      ],
      true
    ],
    [
      'content.update, then page.text',
      [
        [W('content.update'), RECEIPT],
        [site('page.text'), READ]
      ],
      true
    ],
    [
      'content.update, then content.get',
      [
        [W('content.update'), RECEIPT],
        [site('content.get'), READ]
      ],
      true
    ],
    [
      'apply, then inspect',
      [
        [W('content.contract'), RECEIPT],
        [site('content.contract', { operation: 'inspect' }), READ]
      ],
      true
    ],
    [
      'emdash content_update, then content_get',
      [
        [
          { tool: 'tracy_emdash', action: 'content_update', write: true },
          { ok: true, result: { live: true, next: 'x' } }
        ],
        [{ tool: 'tracy_emdash', action: 'content_get', write: false }, READ]
      ],
      true
    ],
    // the head is the exception the rules name
    [
      'update, then page.text head',
      [
        [W('content.update'), RECEIPT],
        [site('page.text', { head: true }), READ]
      ],
      false
    ],
    // class (a): the write's own answer asked for a read, or warned, or was not checked
    [
      'receipt asking for a read',
      [
        [
          W('content.update'),
          { ok: true, next: 'content.get {kind:"post", id:68, outline:true} before a write by position.' }
        ],
        [site('content.get'), READ]
      ],
      false
    ],
    [
      'receipt with warnings',
      [
        [W('content.contract'), { ok: true, warnings: [{ code: 'LENGTH_RATIO' }] }],
        [site('page.look'), READ]
      ],
      false
    ],
    [
      'unchecked write',
      [
        [W('content.update'), { ok: true, verified: false }],
        [site('page.text'), READ]
      ],
      false
    ],
    [
      'replace not shown yet',
      [
        [W('content.replace'), { ok: true, verified: 'not shown yet on /' }],
        [site('page.text'), READ]
      ],
      false
    ],
    [
      'emdash mixed draft',
      [
        [
          { tool: 'tracy_emdash', action: 'content_update', write: true },
          { ok: true, result: { mixed: { draftFields: ['a'] } } }
        ],
        [{ tool: 'tracy_emdash', action: 'content_get', write: false }, READ]
      ],
      false
    ],
    // a refused write is no receipt
    [
      'refused write',
      [
        [W('content.update'), { ok: false, code: 'BODY_SHRINK' }],
        [site('page.text'), READ]
      ],
      false
    ],
    // not right after: another call came between, or a new turn began
    [
      'a call between',
      [
        [W('content.update'), RECEIPT],
        [site('content.list'), READ],
        [site('page.text'), READ]
      ],
      false
    ],
    [
      'next turn',
      [
        [W('content.update'), RECEIPT, 1],
        [site('page.text'), READ, 2]
      ],
      false
    ],
    // not a read of the site
    [
      'then another write',
      [
        [W('content.update'), RECEIPT],
        [W('content.update'), RECEIPT]
      ],
      false
    ]
  ]
  for (const [label, calls, carries] of rows) {
    const aw = createAfterWrite()
    let out
    for (const [call, answer, turn] of calls) out = aw.see('s1', turn ?? 1, call, answer)
    assert.equal(
      /** @type {any} */ (out)?.afterWrite !== undefined,
      carries,
      `${label}: ${JSON.stringify(out)}`
    )
  }
})

test('afterWrite: one line, once per receipt, never a refusal; other conversations are their own', () => {
  const aw = createAfterWrite()
  aw.see('s1', 1, W('content.contract'), RECEIPT)
  aw.see('s2', 1, W('content.update'), RECEIPT)
  const first = /** @type {any} */ (aw.see('s1', 1, site('page.look'), READ))
  assert.equal(first.afterWrite, afterWriteLine('content.contract'))
  assert.equal(first.text, 'page words', 'the read answers as before')
  assert.equal(first.ok, true)
  assert.ok(first.afterWrite.length <= 200)
  assert.doesNotMatch(first.afterWrite, /\n/)
  assert.equal(/** @type {any} */ (aw.see('s1', 1, site('page.look'), READ)).afterWrite, undefined, 'once')
  assert.equal(
    /** @type {any} */ (aw.see('s2', 1, site('page.text'), READ)).afterWrite,
    afterWriteLine('content.update')
  )
  aw.see('s3', 1, W('content.update'), RECEIPT)
  aw.forget('s3')
  assert.equal(/** @type {any} */ (aw.see('s3', 1, site('page.text'), READ)).afterWrite, undefined)
  // No conversation, nothing remembered.
  assert.deepEqual(aw.see(null, 1, W('content.update'), RECEIPT), RECEIPT)
})
