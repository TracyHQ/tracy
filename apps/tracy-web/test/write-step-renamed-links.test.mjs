// Card AD: once the route stage moved an address (`/lessons` to `/classes`), a link written as a string to the old
// address follows it (a url menu item, an anchor in a slot's words), and what cannot follow is a refused line. Every site, page, row and host here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addressMoves, addressNow, movedLink, movedLinksIn } from '../src/lib/renamed-addresses.js'
import { followRenamedLinks, rewriteRenamedLinks } from '../src/write-step/renamed-link-stage.js'
import { fakeSite, SITE } from './_write-step-run.mjs'

const ROUTES = [
  {
    pageId: 'page-lessons',
    itemId: 10,
    slug: 'classes',
    from: '/lessons',
    to: '/classes',
    outcome: 'written'
  },
  { pageId: 'page-team', itemId: 13, slug: 'people', from: '/team', to: '/team', outcome: 'refused' }
]
const MOVES = addressMoves(ROUTES)

const row = (id, alias, path, parent, extra = {}) => ({
  kind: 'menuItem',
  id,
  alias,
  path,
  parent_id: parent,
  published: 1,
  language: '*',
  client_id: 0,
  menutype: 'mainmenu',
  type: 'component',
  link: `index.php?option=com_content&view=article&id=${id + 100}`,
  ...extra
})
const footer = (id, link) => row(id, `f${id}`, `f${id}`, 1, { menutype: 'footer-links', type: 'url', link })

test('an old address in any of its forms is called by its new one; anything else is left alone', () => {
  assert.deepEqual(MOVES, [{ from: '/lessons', to: '/classes' }])
  assert.equal(addressNow('/index.php/lessons/rowing/', MOVES), '/classes/rowing')
  assert.equal(addressNow('/lessons-old', MOVES), null)
  const now = (href, site) => movedLink(href, MOVES, site)?.href ?? null
  assert.equal(now('/index.php/lessons/rowing'), '/index.php/classes/rowing')
  assert.equal(now('index.php/lessons'), 'index.php/classes')
  assert.equal(now('/lessons/rowing/?day=2#top'), '/classes/rowing/?day=2#top')
  assert.equal(
    now('https://quay.example/index.php/lessons/rowing', { hosts: ['quay.example'] }),
    'https://quay.example/index.php/classes/rowing'
  )
  assert.equal(now('https://elsewhere.example/lessons', { hosts: ['quay.example'] }), null)
  assert.match(movedLink('https://quay.example/lessons', MOVES).refused, /names the host quay\.example/)
  for (const untouched of [
    'images/lessons/a.jpg',
    '/images/lessons/a.jpg',
    'lessons/rowing',
    'index.php?Itemid=10',
    '#lessons'
  ])
    assert.equal(movedLink(untouched, MOVES), null, untouched)
  const words = movedLinksIn(
    '((p))Book ((a href="/index.php/lessons/rowing"))rowing((/a)) or <a href=\'/team\'>us</a>((/p))',
    MOVES
  )
  assert.equal(
    words.text,
    '((p))Book ((a href="/index.php/classes/rowing"))rowing((/a)) or <a href=\'/team\'>us</a>((/p))'
  )
  assert.equal(words.moved.length, 1)
})

/** A site with a url footer menu and a contract whose slots hold links; `writeSlots` stands in for the contract door. */
function linkSite({ refuseLink = false, slots = [] } = {}) {
  const site = fakeSite({
    records: [
      row(10, 'classes', 'classes', 1, { link: 'index.php?option=com_content&view=category&id=8' }),
      row(11, 'rowing', 'classes/rowing', 10),
      footer(41, '/index.php/lessons/rowing'),
      footer(42, '/lessons'),
      footer(43, 'https://quay.example/lessons/climbing'),
      footer(44, 'https://maps.example/somewhere')
    ],
    slots,
    refuseUpdate: (kind, _id, fields) =>
      refuseLink && kind === 'menuItem' && 'link' in fields
        ? { ok: false, error: 'write_failed', message: 'the column link is not writable here' }
        : null
  })
  const sent = []
  const writeSlots = async ({ reading, changes, evidence }) => {
    sent.push({ revision: reading.revision, changes, evidence })
    return { written: Object.keys(changes).filter((k) => !k.endsWith('.9')), refused: new Map() }
  }
  return { site, sent, writeSlots }
}

test('a url menu item and a link in a slot that name a moved address are written to the new one and read back', async () => {
  const slots = [
    {
      key: 'module-6.2',
      entity: 'module-6',
      current: '((p))See ((a href="/index.php/lessons/rowing"))rowing((/a))((/p))'
    },
    { key: 'module-6.3', entity: 'module-6', type: 'url', current: '/lessons' },
    { key: 'module-6.4', entity: 'module-6', current: 'images/lessons/boat.jpg' },
    { key: 'module-6.5', entity: 'module-6', current: '((p))Nothing to move((/p))' }
  ]
  const { site, sent, writeSlots } = linkSite({ slots })
  const out = await rewriteRenamedLinks({ door: site.door, siteKey: SITE, routes: ROUTES, writeSlots })
  assert.deepEqual(
    site.updates().map((c) => [c.params.id, c.params.fields.link, Boolean(c.params.apply_id)]),
    [
      [41, '/index.php/classes/rowing', true],
      [42, '/classes', true]
    ]
  )
  assert.deepEqual(
    sent.map((s) => s.changes),
    [
      {
        'module-6.2': '((p))See ((a href="/index.php/classes/rowing"))rowing((/a))((/p))',
        'module-6.3': '/classes'
      }
    ]
  )
  assert.ok(sent[0].evidence['module-6.2'].includes('/lessons'))
  const line = (slot) => out.lines.find((l) => l.slot === slot)
  assert.deepEqual(
    [line('menuItem-41:link').status, line('menuItem-41:link').ordered, line('menuItem-41:link').readFrom],
    [
      'written',
      '/index.php/classes/rowing',
      { action: 'content.get', params: { kind: 'menuItem', id: 41 }, path: ['item', 'link'] }
    ]
  )
  assert.deepEqual(
    [line('module-6.2:renamed-link').status, line('module-6.2:renamed-link').key],
    ['written', 'module-6.2']
  )
  // A full address on a host the step was not told is this site's is never guessed at: it is a refused line.
  assert.equal(line('menuItem-43:link').status, 'refused')
  assert.match(line('menuItem-43:link').reason, /quay\.example/)
  assert.equal(line('menuItem-44:link'), undefined)
  assert.equal(line('module-6.4:renamed-link'), undefined)
})

test('a link the plugin refuses, or that the contract door does not take, is a failed line in its words', async () => {
  const slots = [{ key: 'module-6.9', entity: 'module-6', current: '((a href="/lessons"))Lessons((/a))' }]
  const { site, writeSlots } = linkSite({ refuseLink: true, slots })
  const out = await rewriteRenamedLinks({
    door: site.door,
    siteKey: SITE,
    routes: ROUTES,
    writeSlots,
    hosts: ['quay.example']
  })
  const line = (slot) => out.lines.find((l) => l.slot === slot)
  for (const id of [41, 42, 43]) {
    assert.equal(line(`menuItem-${id}:link`).status, 'failed', String(id))
    assert.match(line(`menuItem-${id}:link`).reason, /not writable/)
  }
  assert.equal(line('module-6.9:renamed-link').status, 'failed')
  const without = await rewriteRenamedLinks({ door: site.door, siteKey: SITE, routes: ROUTES })
  assert.match(without.lines.find((l) => l.slot === 'module-6.9:renamed-link').reason, /no contract door/)
})

test('no moved address reads nothing and writes nothing', async () => {
  const { site } = linkSite()
  const out = await rewriteRenamedLinks({ door: site.door, siteKey: SITE, routes: [ROUTES[1]] })
  assert.deepEqual([out.lines, site.calls], [[], []])
})

test('the lines that ordered a rewritten value say what the site holds now', () => {
  const rewrites = [
    { kind: 'menuItem', id: 41, status: 'written', value: '/classes/rowing' },
    { kind: 'slot', key: 'module-6.2', status: 'written', whole: false }
  ]
  const lines = followRenamedLinks(
    [
      {
        slot: 'plan-link',
        part: 'link',
        status: 'written',
        ordered: '/lessons/rowing',
        readFrom: { action: 'content.get', params: { kind: 'menuItem', id: 41 }, path: ['item', 'link'] }
      },
      { slot: 'block-6.2', key: 'module-6.2', status: 'written', ordered: '((a href="/lessons"))x((/a))' },
      { slot: 'block-6.5', key: 'module-6.5', status: 'written', ordered: '((a href="/lessons"))x((/a))' }
    ],
    { rewrites, moves: MOVES }
  )
  assert.deepEqual(
    lines.map((l) => l.ordered),
    ['/classes/rowing', '((a href="/classes"))x((/a))', '((a href="/lessons"))x((/a))']
  )
})

test('the write step rewrites a footer link to a renamed page after the rename, and the report says so', async () => {
  const { runWriteStep } = await import('../src/write-step/write-step.js')
  const { copy, frozenFiles, KIT, plan: basePlan } = await import('./_write-step-run.mjs')
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', path: '/' },
    { id: 'page-about', path: '/about' }
  ]
  const plan = basePlan()
  plan.pages.find((p) => p.id === 'page-about').slug = 'coaching'
  const site = fakeSite({
    records: [
      row(101, 'home', 'home', 1, { home: 1, link: 'index.php?option=com_content&view=featured' }),
      row(20, 'about', 'about', 1, { link: 'index.php?option=com_content&view=article&id=7' }),
      footer(50, '/index.php/about'),
      { kind: 'article', id: 7, alias: 'about', title: 'About' }
    ]
  })
  const inner = site.door.apply
  site.door.apply = async (call) => {
    const answer = await inner(call)
    return call.action === 'content.update' && 'alias' in (call.params.fields ?? {})
      ? { ...answer, alias: call.params.fields.alias }
      : answer
  }
  const frozen = frozenFiles({ plan, copy: copy() })
  let report
  try {
    report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit,
      contentMap: null,
      files: frozen.files,
      sleep: async () => {}
    })
  } finally {
    frozen.done()
  }
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(site.records.get('menuItem-50').link, '/index.php/coaching')
  const line = report.slots.find((s) => s.slot === 'menuItem-50:link')
  assert.deepEqual(
    [line.status, line.ordered, line.evidence.from, line.evidence.to],
    ['written', '/index.php/coaching', '/about', '/coaching']
  )
  assert.equal(report.counts.failed, 0)
})
