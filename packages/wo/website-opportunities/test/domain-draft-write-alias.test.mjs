// The alias of every record the draft write creates (ticket #597, fault of the real run on plugin 0.24.85): an alias
// with an accent or a letter of another script was folded by Joomla (unicode slugs off), read back as other words, and
// the write stopped (`read_back_mismatch`). The write sends the alias Joomla keeps as it is: ASCII, lower case,
// hyphens, transliterated, a fallback from the record's key for a name with no Latin letter, unique among the site's
// aliases (the blank site's system pages menu of the kit's `dataFixes` included). Real JA Boxing kit, invented names.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-alias.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aliasesOf, aliasFold, reservedAliasesOf } from '../domain/draft-write-alias.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { checkWriteOrder } from '../domain/write-order-check.mjs'
import { memoryDoors } from '../domain/write-order-memory-doors.mjs'
import { storedFields } from '../domain/write-order-memory-rules.mjs'
import { boxingKit, boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
// language-allow: invented names in the scripts a customer may type, the input of the alias fold under test
const NAMES = {
  croatian: ['Đurđica Łąka Ružica', 'durdica-laka-ruzica'],
  german: ['Blumenstraße Größe', 'blumenstrasse-grosse'],
  french: ['Fleurs d’été à Noël', 'fleurs-d-ete-a-noel'],
  danish: ['Blomster på Ærø', 'blomster-pa-aero'],
  greek: ['Λουλούδια', ''],
  cyrillic: ['Цветы', ''],
  cjk: ['花店', ''],
  mixed: ['Κήπος Flora 24', 'flora-24']
}

test('a name folds to ASCII lower case words joined by one hyphen; a name with no Latin letter folds to nothing', () => {
  for (const [script, [name, alias]] of Object.entries(NAMES)) assert.equal(aliasFold(name), alias, script)
})

test('every folded alias is one Joomla stores as it is sent (the memory site folds as Joomla does)', () => {
  for (const [script, [name]] of Object.entries(NAMES)) {
    const alias = aliasFold(name)
    if (alias) assert.equal(storedFields({ alias }).alias, alias, script)
  }
  // The fault itself: an alias that keeps its letters is stored as other words.
  assert.notEqual(storedFields({ alias: 'ružica-đ' }).alias, 'ružica-đ')
})

test('aliases are unique per kind, skip the aliases the blank site holds, and fall back to the key', () => {
  const reserved = reservedAliasesOf(boxingKit().mapping)
  for (const alias of ['search', 'login', 'password-reset', 'username-reminder', 'component', 'media'])
    assert.ok(reserved.get('menuItem').has(alias), alias)
  const records = [
    { key: 'menuItem:mainmenu:find', recordKind: 'menuItem', title: 'Search' },
    { key: 'menuItem:mainmenu:enter', recordKind: 'menuItem', title: 'Login' },
    { key: 'menuItem:mainmenu:shop', recordKind: 'menuItem', title: 'Λουλούδια' },
    { key: 'article:service-roses', recordKind: 'article', title: 'Search' },
    { key: 'article:service-tulips', recordKind: 'article', title: '花店' },
    { key: 'article:service-lilies', recordKind: 'article', title: 'Search' }
  ]
  const notes = aliasesOf(records, reserved)
  assert.deepEqual(
    records.map((r) => r.alias),
    ['search-2', 'login-2', 'shop', 'search', 'service-tulips', 'search-2']
  )
  assert.deepEqual(notes, [
    { code: 'alias_reserved', record: 'menuItem:mainmenu:find' },
    { code: 'alias_reserved', record: 'menuItem:mainmenu:enter' },
    { code: 'alias_from_key', record: 'menuItem:mainmenu:shop' },
    { code: 'alias_from_key', record: 'article:service-tulips' }
  ])
})

/** The plan of the florist with its pages renamed. */
function planWithNames(names) {
  const order = structuredClone(site.order)
  for (const [id, name] of Object.entries(names)) {
    const page = order.pages.find((p) => p.id === id)
    page.name = name
    if (page.menu) page.menu.label = name
  }
  assert.deepEqual(checkWriteOrder(order), [])
  return writePlanOf(order, site.aiq, { stored: site.stored })
}
const aliasOf = (plan, key) => plan.ops.find((op) => op.key === key)?.fields.alias

test('the plan sends every created record an ASCII alias, whatever script its name is in', () => {
  const plan = planWithNames({ classes: NAMES.croatian[0], plans: NAMES.greek[0], contact: 'Search' })
  assert.equal(aliasOf(plan, 'menuItem:mainmenu:classes'), 'durdica-laka-ruzica')
  assert.equal(aliasOf(plan, 'category:class'), 'durdica-laka-ruzica')
  // The page's own key, made unique beside the footer menu's own `plans` item (one parent, the menu root).
  assert.match(aliasOf(plan, 'menuItem:mainmenu:plans'), /^plans(-\d)?$/)
  assert.equal(aliasOf(plan, 'menuItem:mainmenu:contact'), 'search-2')
  for (const op of plan.ops.filter((o) => o.fields?.alias))
    assert.match(op.fields.alias, /^[a-z0-9]+(-[a-z0-9]+)*$/, op.key)
  assert.ok(
    plan.unproven.some((u) => u.code === 'alias_reserved' && u.record === 'menuItem:mainmenu:contact')
  )
})

test('nothing assumes a menu item id: the memory site gives other ids than the real one, and the plan names none', async () => {
  const plan = planWithNames({})
  const memory = memoryDoors({ lock: site.kit.lock, contentMap: site.kit.blankContract })
  const { id } = await memory.doors.update({
    applyId: 'a1',
    kind: 'menuItem',
    id: 0,
    fields: { title: 'Hoa', alias: 'hoa', link: 'index.php?Itemid=' }
  })
  assert.notEqual(id, 247)
  // Menu items are named by reference (`page:<id>`), never by a site id: the blank site's own start from 243.
  const text = JSON.stringify(plan.ops)
  assert.equal(/Itemid=\d|"parent_id":\s*\d/.test(text), false)
  for (const op of plan.ops.filter((o) => o.menuids))
    for (const m of op.menuids) assert.ok(m === 0 || m.ref, op.key)
})
