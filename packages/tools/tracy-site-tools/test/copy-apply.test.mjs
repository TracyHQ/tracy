/**
 * A build's words put on the site page by page (`copy-apply.mjs`, plan "10/10" §7 S5): at most twenty pairs a
 * content.replace call, a pair the job refuses set aside with its reason, the shared words placed from home.
 *
 *   node --test packages/tools/tracy-site-tools/test/copy-apply.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyCopy } from '../src/host/copy-apply.mjs'

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
    notPlaced: [
      { find: 'Template words 1', code: 'NOT_EDITABLE' },
      { find: 'Template words 2', code: 'COMPONENT_BAD_RESPONSE' }
    ]
  })
  assert.deepEqual(calls.slice(-1), [[['Template words 0'], { all: 'page' }]])
  assert.equal(
    calls.some(([, options]) => options.all === true),
    false
  )
})
