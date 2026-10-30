// Spec TracyHQ/tracy#189: a Joomla brief build moves the addresses that still carry a demo person's name once the page names
// a real person. A contact's address goes through `content.update`; a menu item's only when the site's Cowork plugin
// advertises the door (`info.menu_item_alias`), and is a note otherwise. Two made-up businesses: a veterinary clinic and a
// florist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeDemoNameAliases } from '../src/sites/brief-engines/joomla-demo-name-aliases.js'

/** A Joomla site behind the Apply door: lists rows by kind, answers `info`, records every write. */
function fakeSite({ rows, door }) {
  const writes = []
  const apply = async ({ action, params }) => {
    if (action === 'info')
      return { ok: true, info: { version: '1', ...(door ? { menu_item_alias: { version: 1 } } : {}) } }
    if (action === 'content.list')
      return { ok: true, items: (params.offset ?? 0) === 0 ? (rows[params.kind] ?? []) : [] }
    if (action === 'content.batch') {
      writes.push(...params.operations)
      return { ok: true }
    }
    if (action === 'content.update') {
      writes.push({ kind: params.kind, id: params.id, fields: params.fields })
      return { ok: true }
    }
    return { ok: false, error: 'unknown' }
  }
  return { apply, writes }
}

const vetMap = {
  entities: [
    { key: 'menuItem-70', kind: 'menuItem', sourceId: 70, identity: { path: 'about/vets/talia-brenner' } },
    { key: 'menuItem-71', kind: 'menuItem', sourceId: 71, identity: { path: 'about/vets/oskar-lindqvist' } }
  ],
  slots: [
    {
      key: 'menuItem-70.0',
      entity: 'menuItem-70',
      column: 'title',
      role: 'person.name',
      sample: 'Talia Brenner'
    },
    {
      key: 'menuItem-71.0',
      entity: 'menuItem-71',
      column: 'title',
      role: 'person.name',
      sample: 'Oskar Lindqvist'
    }
  ]
}
const vetRows = () => ({
  menuItem: [
    {
      id: 69,
      alias: 'vets',
      path: 'about/vets',
      title: 'Our vets',
      published: 1,
      parent_id: 60,
      client_id: 0
    },
    // A page kept for the clinic's own vet, still at the demo vet's address; it opens a page layout, no record.
    {
      id: 70,
      alias: 'talia-brenner',
      path: 'about/vets/talia-brenner',
      title: 'Dr Amaru Quispe',
      published: 1,
      parent_id: 69,
      link: 'index.php?option=com_content&view=featured',
      client_id: 0
    },
    // No real vet kept this one: hidden, as today.
    {
      id: 71,
      alias: 'oskar-lindqvist',
      path: 'about/vets/oskar-lindqvist',
      title: 'Oskar Lindqvist',
      published: 0,
      parent_id: 69,
      client_id: 0
    }
  ]
})

test('veterinary clinic: without the menu door the address is a note and the final check names it', async () => {
  const site = fakeSite({ rows: vetRows(), door: false })
  const notes = []
  const done = await writeDemoNameAliases({
    apply: site.apply,
    siteKey: 's',
    contentMap: vetMap,
    plan: { pages: [{ path: '/about/vets/talia-brenner', decision: 'keep' }] },
    applyId: 'names-1',
    note: (line) => notes.push(line)
  })
  assert.deepEqual(done, { written: 0, waiting: 1, left: 1 })
  assert.deepEqual(site.writes, [])
  assert.ok(notes.some((n) => /menu item 70 keeps the address "talia-brenner".*"dr-amaru-quispe"/.test(n)))
  assert.ok(notes.some((n) => /menuItem 70 is still at "talia-brenner"/.test(n)))
  assert.ok(!notes.some((n) => /\b71\b/.test(n)), 'the hidden demo page is left alone')
})

test('veterinary clinic: with the menu door the item takes the real name and the site plan follows', async () => {
  const site = fakeSite({ rows: vetRows(), door: true })
  const notes = []
  const plan = {
    pages: [
      { path: '/about/vets/talia-brenner', decision: 'keep' },
      { path: '/about/vets', decision: 'keep' }
    ]
  }
  const done = await writeDemoNameAliases({
    apply: site.apply,
    siteKey: 's',
    contentMap: vetMap,
    plan,
    applyId: 'names-2',
    note: (line) => notes.push(line)
  })
  assert.deepEqual(done, { written: 1, waiting: 0, left: 0 })
  assert.deepEqual(site.writes, [{ kind: 'menuItem', id: 70, fields: { alias: 'dr-amaru-quispe' } }])
  assert.deepEqual(
    plan.pages.map((p) => p.path),
    ['/about/vets/dr-amaru-quispe', '/about/vets']
  )
  assert.deepEqual(notes, [])
})

test('florist: a contact named after a demo person is renamed, and the menu item opening it follows', async () => {
  const contentMap = {
    entities: [
      { key: 'contact-3', kind: 'contact', sourceId: 3, identity: { alias: 'juniper-vale' } },
      { key: 'menuItem-20', kind: 'menuItem', sourceId: 20, identity: { path: 'juniper-vale' } }
    ],
    slots: [
      { key: 'contact-3.0', entity: 'contact-3', column: 'name', role: 'person.name', sample: 'Juniper Vale' }
    ]
  }
  const rows = {
    contact: [{ id: 3, alias: 'juniper-vale', name: 'Selin Arkan', published: 1, catid: 4 }],
    menuItem: [
      {
        id: 20,
        alias: 'juniper-vale',
        path: 'juniper-vale',
        title: 'Our florist',
        published: 1,
        parent_id: 1,
        link: 'index.php?option=com_contact&view=contact&id=3',
        client_id: 0
      }
    ]
  }
  // Without the menu door: the contact moves, the menu item is a note.
  const without = fakeSite({ rows: structuredClone(rows), door: false })
  const notes = []
  const first = await writeDemoNameAliases({
    apply: without.apply,
    siteKey: 's',
    contentMap,
    applyId: 'names-3',
    note: (line) => notes.push(line)
  })
  assert.deepEqual(without.writes, [{ kind: 'contact', id: 3, fields: { alias: 'selin-arkan' } }])
  assert.deepEqual(first, { written: 1, waiting: 1, left: 1 })
  assert.ok(notes.some((n) => /menu item 20 keeps the address "juniper-vale".*"selin-arkan"/.test(n)))
  // With it: both move.
  const withDoor = fakeSite({ rows: structuredClone(rows), door: true })
  const second = await writeDemoNameAliases({
    apply: withDoor.apply,
    siteKey: 's',
    contentMap,
    applyId: 'names-4',
    note: () => {}
  })
  assert.deepEqual(second, { written: 2, waiting: 0, left: 0 })
  assert.deepEqual(withDoor.writes, [
    { kind: 'contact', id: 3, fields: { alias: 'selin-arkan' } },
    { kind: 'menuItem', id: 20, fields: { alias: 'selin-arkan' } }
  ])
})
