// A header may expose only its logo, while the plan and released menu identities still identify navigation.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mainMenuExport } from '../src/lib/site-copy/contract-mapping.js'
import { mainMenuOf } from '../src/lib/site-copy/main-menu.js'
import { doorCall } from '../src/write-step/settings-door.js'

function input() {
  const paths = ['/', '/about-us', '/contact-us', '/offers', '/offers/details', '/home/blue']
  return {
    kit: {
      blocks: [{ id: 'header', role: 'header', slots: [] }],
      pages: paths.map((path, i) => ({ id: `p${i}`, path }))
    },
    plan: {
      mainMenu: [{ page: 'p0' }, { page: 'p1' }, { page: 'p2' }],
      pages: [
        { page: 'p1', decision: 'keep' },
        { page: 'p2', decision: 'keep' }
      ]
    },
    contentMap: {
      entities: [
        [101, 'home'],
        [102, 'about-us'],
        [103, 'contact-us'],
        [104, 'offers'],
        [105, 'offers/details'],
        [106, 'home/blue']
      ].map(([id, path]) => ({
        key: `menuItem-${id}`,
        kind: 'menuItem',
        identity: { path, menutype: 'restaurant-navigation', client_id: '0' }
      })),
      slots: []
    }
  }
}

const hidden = (m) => m.hidden.map((x) => x.item)

test('a logo-only header derives navigation and hides unplanned pages without inventing writer slots', () => {
  const m = mainMenuOf(input())
  assert.equal(m.menutype, 'restaurant-navigation')
  assert.deepEqual(hidden(m), ['menuItem-104', 'menuItem-105', 'menuItem-106'])
  assert.deepEqual(m.slots, [])
  assert.equal(m.items.find((x) => x.item === 'menuItem-101').state, 'top')
})

test('duplicate path evidence in two menus cannot identify a main menu', () => {
  const x = input()
  x.contentMap.entities.push(
    ...x.contentMap.entities.map((e) => ({
      ...e,
      key: `${e.key}-other`,
      identity: { ...e.identity, menutype: 'other' }
    }))
  )
  const m = mainMenuOf(x)
  assert.equal(m.menutype, null)
  assert.deepEqual(hidden(m), [])
  assert.ok(m.problems.length)
})

test('other menus, unknown roots and unmapped descendants stay untouched', () => {
  const x = input()
  x.contentMap.entities.push(
    { key: 'menuItem-201', kind: 'menuItem', identity: { path: 'footer', menutype: 'footer-links' } },
    {
      key: 'menuItem-202',
      kind: 'menuItem',
      identity: { path: 'unknown', menutype: 'restaurant-navigation' }
    },
    {
      key: 'menuItem-203',
      kind: 'menuItem',
      identity: { path: 'offers/unknown', menutype: 'restaurant-navigation' }
    }
  )
  const m = mainMenuOf(x)
  assert.equal(m.menutype, 'restaurant-navigation')
  assert.deepEqual(hidden(m), ['menuItem-105', 'menuItem-106'])
  assert.equal(
    m.items.some((i) => i.item === 'menuItem-201'),
    false
  )
})

test('a kept descendant preserves its navigation ancestors even without a kept top-level label', () => {
  const x = input()
  x.plan.mainMenu.push({ page: 'p4' })
  x.plan.pages.push({ page: 'p4', decision: 'keep' })
  const m = mainMenuOf(x)
  assert.deepEqual(hidden(m), ['menuItem-106'])
  assert.equal(m.items.find((i) => i.item === 'menuItem-105').state, 'shown')
  assert.deepEqual(m.slots, [])
})

test('a duplicate path within the inferred menu refuses the fallback', () => {
  const x = input()
  x.contentMap.entities.push({
    key: 'menuItem-999',
    kind: 'menuItem',
    identity: { path: 'offers', menutype: 'restaurant-navigation' }
  })
  const m = mainMenuOf(x)
  assert.equal(m.menutype, null)
  assert.deepEqual(hidden(m), [])
})

test('runtime default Home cannot be unpublished even when planned by a stale map', async () => {
  const writes = []
  const call = doorCall(
    {
      apply: async ({ action, params }) => {
        if (action === 'content.get') return { ok: true, item: { home: 1, path: 'home' } }
        writes.push(params)
        return { ok: true }
      }
    },
    'test-site'
  )
  await assert.rejects(
    call('content.update', { kind: 'menuItem', id: 101, fields: { published: 0 } }),
    /default Home/
  )
  assert.deepEqual(writes, [])
})

test('the mapping export keeps hide authority without claiming any writer labels', () => {
  const m = mainMenuExport({ ...input(), copy: { slots: [] } })
  assert.deepEqual(
    m.hide.map((x) => x.item),
    ['menuItem-104', 'menuItem-105', 'menuItem-106']
  )
  assert.ok(m.items.every((i) => !i.writer && i.label === null))
})

test('conflicting planned menu types refuse all hides', () => {
  const x = input()
  x.contentMap.entities.find((e) => e.key === 'menuItem-103').identity.menutype = 'second-menu'
  assert.deepEqual(hidden(mainMenuOf(x)), [])
  assert.equal(mainMenuOf(x).menutype, null)
})

test('administrator menu items are excluded from the fallback tree', () => {
  const x = input()
  x.contentMap.entities.push({
    key: 'menuItem-999',
    kind: 'menuItem',
    identity: { path: 'offers', menutype: 'restaurant-navigation', client_id: '1' }
  })
  const m = mainMenuOf(x)
  assert.equal(m.menutype, 'restaurant-navigation')
  assert.equal(
    m.items.some((i) => i.item === 'menuItem-999'),
    false
  )
})

test('existing header votes take priority over plan path inference', () => {
  const x = input()
  x.kit.blocks[0].slots.push({ id: 'menuItem-201.0' })
  x.contentMap.entities.push({
    key: 'menuItem-201',
    kind: 'menuItem',
    identity: { path: 'footer', menutype: 'header-declared-menu' }
  })
  assert.equal(mainMenuOf(x).menutype, 'header-declared-menu')
})
