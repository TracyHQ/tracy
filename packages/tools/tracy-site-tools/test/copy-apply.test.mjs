/**
 * A build's words put on the site page by page (`copy-apply.mjs`, plan "10/10" §7 S5): at most twenty pairs a
 * content.replace call, a pair the job refuses set aside with its reason, the shared words placed from home.
 *
 *   node --test packages/tools/tracy-site-tools/test/copy-apply.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CUT_NEXT, LIST_MAX, UNKNOWN_NEXT, applyCopy } from '../src/host/copy-apply.mjs'

const pair = (i) => ({ find: `Template words ${i}`, replace: `Business words ${i}` })

test('pairs go twenty a call; a refused pair is set aside by its index and the rest sent again', async () => {
  const calls = []
  const replace = async (path, changes) => {
    calls.push([path, changes.length])
    const bad = changes.findIndex((c) => c.find === 'Template words 3')
    return bad >= 0 ? { ok: false, code: 'NOT_FOUND', change: bad } : { ok: true }
  }
  const read = async () => ({
    ok: true,
    pages: [
      {
        path: '/',
        changes: Array.from({ length: 25 }, (_, i) => pair(i)),
        issues: [{ find: 'Meet the team', why: 'no team in the research' }]
      },
      { path: '*shared*', changes: [pair(100)], issues: [] }
    ]
  })
  const out = await applyCopy({ read, replace })
  assert.deepEqual(calls, [
    ['/', 20],
    ['/', 19],
    ['/', 5],
    ['/', 1]
  ])
  assert.deepEqual(out.pages[0], {
    page: '/',
    placed: 24,
    notPlaced: [{ find: 'Template words 3', code: 'NOT_FOUND' }],
    issues: [{ find: 'Meet the team', why: 'no team in the research' }]
  })
  assert.deepEqual(out.pages[1], { page: 'shared (header and footer)', placed: 1 })
  assert.match(out.next, /notPlaced and issues/)
})

test('a refusal naming no pair tries each alone; nothing to apply says so', async () => {
  const replace = async (_path, changes) =>
    changes.length > 1 || changes[0].find === 'Template words 1'
      ? { ok: false, code: 'SITE_BUSY' }
      : { ok: true }
  const out = await applyCopy({
    read: async () => ({ ok: true, pages: [{ path: '/a/', changes: [pair(0), pair(1), pair(2)] }] }),
    replace
  })
  assert.deepEqual(out.pages[0], {
    page: '/a/',
    placed: 2,
    notPlaced: [{ find: 'Template words 1', code: 'SITE_BUSY' }]
  })
  assert.equal(
    (await applyCopy({ read: async () => ({ ok: true, pages: [] }), replace })).code,
    'COPY_NOTHING_TO_APPLY'
  )
  assert.deepEqual(
    await applyCopy({ read: async () => ({ ok: false, code: 'AGENT_DEMO_COPY_NOT_WRITTEN' }), replace }),
    {
      ok: false,
      code: 'AGENT_DEMO_COPY_NOT_WRITTEN'
    }
  )
})

// Local round 35 (26/10/2026): an EmDash home showed four service names in its cards and its footer; each was refused
// AMBIGUOUS and stayed. The tasks read each words once, so every place showing them takes the same new words.
test('words shown in more than one place go again alone with all:"page", and with the count when it asks', async () => {
  const calls = []
  const replace = async (_path, changes, options = {}) => {
    calls.push([changes.map((c) => c.find), options])
    const at = changes.findIndex((c) => c.find === 'Template words 1' || c.find === 'Template words 2')
    if (!options.all && at !== -1) return { ok: false, code: 'AMBIGUOUS', change: at }
    if (changes[0].find === 'Template words 2' && options.expect === undefined)
      return { ok: false, code: 'VALUE_NOT_ALLOWED', rule: 'confirm-count', count: 7 }
    return { ok: true }
  }
  const out = await applyCopy({
    read: async () => ({ ok: true, pages: [{ path: '/', changes: [pair(0), pair(1), pair(2), pair(3)] }] }),
    replace
  })
  assert.deepEqual(out.pages[0], { page: '/', placed: 4 })
  assert.deepEqual(calls.slice(-3), [
    [['Template words 1'], { all: 'page' }],
    [['Template words 2'], { all: 'page' }],
    [['Template words 2'], { all: 'page', expect: 7 }]
  ])
})

// Local round 36 (26/10/2026): the theme-printed road's AMBIGUOUS names no pair, and a post title on a WordPress list
// page answers NOT_EDITABLE until it is written where it is stored.
test('an unnamed AMBIGUOUS stays page-scoped; NOT_EDITABLE never widens a copy write', async () => {
  const calls = []
  const replace = async (_path, changes, options = {}) => {
    calls.push([changes.map((c) => c.find), options])
    if (changes.length > 1) return { ok: false, code: 'AMBIGUOUS' }
    const [one] = changes
    if (one.find === 'Template words 0')
      return options.all === 'page' ? { ok: true } : { ok: false, code: 'AMBIGUOUS' }
    if (one.find === 'Template words 1')
      return options.all === true ? { ok: true } : { ok: false, code: 'NOT_EDITABLE' }
    if (one.find === 'Template words 2') return { ok: false, code: 'COMPONENT_BAD_RESPONSE' }
    return { ok: true }
  }
  const out = await applyCopy({
    read: async () => ({
      ok: true,
      pages: [{ path: '/blog/', changes: [pair(0), pair(1), pair(2), pair(3)] }]
    }),
    replace
  })
  assert.deepEqual(out.pages[0], {
    page: '/blog/',
    placed: 2,
    notPlaced: [{ find: 'Template words 1', code: 'NOT_EDITABLE' }],
    // A bad response proves nothing about the write: it may be on the site, so it is no pair to write again.
    unknown: [{ find: 'Template words 2', code: 'COMPONENT_BAD_RESPONSE' }]
  })
  assert.deepEqual(calls.slice(-1), [[['Template words 0'], { all: 'page' }]])
  assert.equal(
    calls.some(([, options]) => options.all === true),
    false
  )
})

// 28/10/2026: a call whose receipt was lost may have written every pair; sent again, a pair whose new words
// hold its old ones ("Menu item" → "Menu item for customer") would be written twice, and the answer told the agent to
// write every pair it listed.
test('a call whose outcome is unknown is never sent again nor listed to write: read the page first', async () => {
  for (const lost of [
    { ok: false, code: 'OUTCOME_UNKNOWN' },
    { ok: false, code: 'COWORK_WEB_UNREACHABLE' }
  ]) {
    const page = { text: 'Menu item · Price' }
    const sent = []
    const out = await applyCopy({
      read: async () => ({
        ok: true,
        pages: [
          {
            path: '/a/',
            changes: [
              { find: 'Menu item', replace: 'Menu item for customer' },
              { find: 'Price', replace: 'Cost' }
            ]
          },
          { path: '/b/', changes: [pair(0)] }
        ]
      }),
      // The write on /a/ lands; only its answer is lost. /b/ is refused before any write.
      replace: async (path, changes) => {
        sent.push([path, changes.length])
        if (path === '/b/') return { ok: false, code: 'NOT_EDITABLE' }
        for (const c of changes) page.text = page.text.replace(c.find, c.replace)
        return lost
      }
    })
    assert.deepEqual(
      sent,
      [
        ['/a/', 2],
        ['/b/', 1]
      ],
      lost.code
    )
    assert.equal(page.text, 'Menu item for customer · Cost')
    assert.deepEqual(out.pages[0], {
      page: '/a/',
      placed: 0,
      unknown: [
        { find: 'Menu item', code: lost.code },
        { find: 'Price', code: lost.code }
      ]
    })
    // Only a pair proven unwritten is one to write; the unknown ones are read first.
    assert.deepEqual(out.pages[1].notPlaced, [{ find: 'Template words 0', code: 'NOT_EDITABLE' }])
    assert.match(out.next, /Write only what is listed under notPlaced/)
    assert.ok(out.next.endsWith(UNKNOWN_NEXT), out.next)
    assert.match(UNKNOWN_NEXT, /page\.text/)
  }
  // Nothing proven unwritten left: the answer does not say every page's words are on the site.
  const only = await applyCopy({
    read: async () => ({ ok: true, pages: [{ path: '/a/', changes: [pair(0), pair(1)] }] }),
    replace: async () => ({ ok: false, code: 'OUTCOME_UNKNOWN' })
  })
  assert.equal(only.next, `Every other page’s words are on the site. ${UNKNOWN_NEXT}`)
})

// 28/10/2026: 40 pairs of unknown outcome listed 30, and `next` said every other page's words were on the site.
test("a list cut for the answer's size counts what it left out, and next claims nothing about it", async () => {
  const pairs = Array.from({ length: 40 }, (_, i) => pair(i))
  const lost = await applyCopy({
    read: async () => ({ ok: true, pages: [{ path: '/a/', changes: pairs }] }),
    replace: async () => ({ ok: false, code: 'OUTCOME_UNKNOWN' })
  })
  assert.equal(lost.pages[0].unknown.length, LIST_MAX)
  assert.deepEqual(lost.pages[0].notListed, { unknown: 40 - LIST_MAX })
  assert.equal(lost.pages[0].unknown.length + lost.pages[0].notListed.unknown, 40)
  assert.doesNotMatch(lost.next, /on the site\./)
  assert.equal(lost.next, `${UNKNOWN_NEXT} ${CUT_NEXT}`)
  // The same for pairs proven unwritten: the 10 not listed are not "everything else is on the site".
  const refused = await applyCopy({
    read: async () => ({
      ok: true,
      pages: [
        { path: '/a/', changes: pairs },
        { path: '/b/', changes: [pair(0)] }
      ]
    }),
    replace: async (path, changes) =>
      path === '/b/'
        ? { ok: true }
        : { ok: false, code: 'NOT_EDITABLE', ...(changes.length > 1 ? { change: 0 } : {}) }
  })
  assert.equal(refused.pages[0].notPlaced.length, LIST_MAX)
  assert.deepEqual(refused.pages[0].notListed, { notPlaced: 40 - LIST_MAX })
  assert.equal(refused.pages[1].notListed, undefined)
  assert.doesNotMatch(refused.next, /everything else is on the site/)
  assert.ok(refused.next.endsWith(CUT_NEXT), refused.next)
  // Nothing cut: the answer says what it always said.
  const whole = await applyCopy({
    read: async () => ({ ok: true, pages: [{ path: '/a/', changes: pairs.slice(0, 3) }] }),
    replace: async () => ({ ok: true })
  })
  assert.equal(whole.pages[0].notListed, undefined)
  assert.equal(whole.next, 'Every page’s words are on the site; go on with the pictures and the checks.')
})
